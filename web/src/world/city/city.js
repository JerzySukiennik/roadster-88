// Roadster 88 Gzowo City runtime: builds the plan for the current style (setCity), the merged building masses per 1 km tile (tall and small split for distance LOD), the street ground per tile, near-detail chunks streamed around the camera, the structures and props, streams static colliders (building tiers, sidewalk pads, decks) around every local car, answers surface, deck and tunnel queries, drives the traffic signals and exports the city roads for traffic.
import * as THREE from 'three/webgpu';
import { buildSkeleton, planSteps, chunkOf, CHUNK, CH_N, CH_O, signalState, centroid, ccw, inPoly } from './plan.js';
import { BGeo, detailBuilding } from './geom.js';
import { annotate, tileSink, buildMass, buildGround, shadowHeights, envArrays, mergeOut, pointAt } from './tiles.js';
import { cityUniforms, facadeMaterial, streetMaterial } from './materials.js';
import { GROUP, groups } from '../../sim/car.js';

const DETAIL_R = { low: 200, medium: 300, high: 380, ultra: 520 };
export const SMALL_R = { low: 1300, medium: 1800, high: 2300, ultra: 3200 };
const COL_R = 520;
const RAST = { x0: -6800, z0: 3200, x1: 4600, z1: 7800, cell: 4 };
const nextFrame = () => new Promise((r) => { if (typeof requestAnimationFrame === 'undefined' || (typeof document !== 'undefined' && document.hidden)) setTimeout(r, 0); else requestAnimationFrame(() => setTimeout(r, 0)); });

function geoFrom(o, kind) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(o.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(o.normal, 3));
  if (kind === 'b') {
    g.setAttribute('uv', new THREE.BufferAttribute(o.uv, 2));
    g.setAttribute('fa', new THREE.BufferAttribute(o.fa, 4, true));
    g.setAttribute('fb', new THREE.BufferAttribute(o.fb, 4, true));
    g.setAttribute('fc', new THREE.BufferAttribute(o.fc, 4, true));
  } else {
    g.setAttribute('rq', new THREE.BufferAttribute(o.rq, 4));
    g.setAttribute('rk', new THREE.BufferAttribute(o.rk, 4, true));
  }
  g.setIndex(new THREE.BufferAttribute(o.count > 65535 ? o.index : Uint16Array.from(o.index), 1));
  const B = o.box;
  g.boundingBox = new THREE.Box3(new THREE.Vector3(B[0], B[1], B[2]), new THREE.Vector3(B[3], B[4], B[5]));
  g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
  return g;
}

function rectInfo(fp) {
  if (fp.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const a = fp[i], b = fp[(i + 1) % 4], c = fp[(i + 2) % 4];
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
    if (l1 < 0.5 || l2 < 0.5 || Math.abs((e1[0] * e2[0] + e1[1] * e2[1]) / (l1 * l2)) > 0.02) return null;
  }
  const e = [fp[1][0] - fp[0][0], fp[1][1] - fp[0][1]], f = [fp[3][0] - fp[0][0], fp[3][1] - fp[0][1]];
  const [cx, cz] = centroid(fp);
  return { cx, cz, hx: Math.hypot(...e) / 2, hz: Math.hypot(...f) / 2, yaw: Math.atan2(-e[1], e[0]) };
}

export class City {
  constructor(game, valley) {
    this.g = game; this.V = valley;
    this.root = new THREE.Group(); this.root.name = 'City';
    game.gfx.scene.add(this.root);
    this.U = cityUniforms();
    this.preset = game.gfx.presetName || 'high';
    this.U.smallR.value = SMALL_R[this.preset] || 2300;
    this.tiles = new Map(); this.details = new Map(); this.colChunks = new Map();
    this.signals = [];
    this.style = null; this.plan = null;
    this.frame = 0;
    this.tm = { detail: 0, col: 0, nd: 0, nc: 0 };
    this.dbg = new Set(((typeof location !== 'undefined' && new URLSearchParams(location.search).get('citydbg')) || '').split(',').filter(Boolean));
  }

  async init() {
    const t0 = performance.now();
    const H = (x, z) => this.V.heightAt(x, z);
    this.skel = buildSkeleton(H);
    this.signals = this.skel.signals;
    this.noise = this.V.view.noise;
    this.initShadows();
    this.facade = facadeMaterial(this.U, this.noise, { quality: this.preset === 'low' ? 'low' : 'high' });
    this.street = streetMaterial(this.U, this.noise);
    this.buildRaster();
    this.deckIndex();
    this.initWorkers();
    this.initMs = performance.now() - t0;
    try { const S = await import('./structures.js'); this.structMod = S; } catch (e) { console.warn('city structures failed to load', e); }
    try { const P = await import('./props.js'); this.propMod = P; this.props = new P.Props(this); } catch (e) { console.warn('city props failed to load', e); }
  }

  heightAt(x, z) { return this.V.heightAt(x, z); }

  initWorkers() {
    this.dw = []; this.dToken = 0;
    try {
      for (let i = 0; i < 2; i++) {
        const w = new Worker(new URL('./detailWorker.js', import.meta.url), { type: 'module' });
        w.busy = 0;
        w.onmessage = (e) => { w.busy = Math.max(0, w.busy - 1); this.onDetail(e.data); };
        w.postMessage({ raster: { ...this.raster, a: this.raster.a.slice() } });
        this.dw.push(w);
      }
    } catch (e) { this.dw = []; }
    this.cw = null; this.cwJobs = new Map(); this.cwId = 0;
    if (this.dbg.has('nocw')) return;
    try {
      const w = this.cw = new Worker(new URL('./cityWorker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => { const j = this.cwJobs.get(e.data.id); if (j) { this.cwJobs.delete(e.data.id); j(e.data); } };
      w.onerror = (e) => { console.warn('city worker failed', e.message || e); this.cw = null; for (const j of this.cwJobs.values()) j(null); this.cwJobs.clear(); };
      this.sendRows();
    } catch (e) { this.cw = null; }
  }

  sendRows() {
    if (!this.cw) return;
    const O = this.V.O, i0 = Math.max(0, Math.floor((3000 - O.ORIGIN) / O.CELL));
    const rows = O.H.slice(i0 * O.N);
    this.cw.postMessage({ rows, i0, N: O.N, CELL: O.CELL, ORIGIN: O.ORIGIN }, [rows.buffer]);
  }

  workerBuild(o) {
    return new Promise((res) => {
      if (!this.cw) { res(null); return; }
      const id = ++this.cwId, S = this.sh;
      this.cwJobs.set(id, res);
      this.cw.postMessage({ id, build: { ...o, shadow: S ? { cell: S.cell, nx: S.nx, nz: S.nz, x0: S.x0, z0: S.z0 } : null } });
    });
  }

  initShadows() {
    const R = RAST, cell = this.preset === 'low' ? 8 : 4, nx = Math.round((R.x1 - R.x0) / cell), nz = Math.round((R.z1 - R.z0) / cell);
    this.sh = { cell, nx, nz, x0: R.x0, z0: R.z0, dir: null, busy: false, f32: null };
    const tex = new THREE.DataTexture(new Uint16Array(nx * nz).fill(0x7bff), nx, nz, THREE.RedFormat, THREE.HalfFloatType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    this.U.shadowTex = tex;
    this.U.shadowBox.value.set(R.x0 - cell / 2, R.z0 - cell / 2, R.x0 - cell / 2 + nx * cell, R.z0 - cell / 2 + nz * cell);
    try { this.shW = new Worker(new URL('./shadowWorker.js', import.meta.url), { type: 'module' }); } catch (e) { this.shW = null; }
    if (this.shW) this.shW.onmessage = (e) => { const d = e.data; tex.image.data.set(d.half); tex.needsUpdate = true; this.sh.f32 = d.f32; this.sh.busy = false; this.U.shadowOn.value = 1; };
  }

  shadowHeights(plan) {
    const S = this.sh, O = this.V.O, NN = O.N, step = S.cell / O.CELL, i0 = Math.round((S.z0 - O.ORIGIN) / O.CELL), j0 = Math.round((S.x0 - O.ORIGIN) / O.CELL);
    return shadowHeights(plan, S, (i, j) => O.H[(i0 + i * step) * NN + j0 + j * step]);
  }

  bakeShadows(force, heights) {
    if (!this.shW || !this.plan) return;
    const S = this.sh, L = this.g.sky && (this.g.sky.lightDir || this.g.sky.sunDir);
    if (force) { const B = heights || this.shadowHeights(this.plan); this.shW.postMessage({ heights: B, nx: S.nx, nz: S.nz, cell: S.cell }, [B.buffer]); S.dir = null; S.busy = false; }
    if (!L) return;
    if (S.busy) return;
    if (S.dir && S.dir[0] * L.x + S.dir[1] * L.y + S.dir[2] * L.z > 0.99998) return;
    S.dir = [L.x, L.y, L.z]; S.busy = true;
    this.shW.postMessage({ sun: S.dir, id: 1, cpu: true });
  }

  shadowAt(x, z, y) {
    const S = this.sh; if (!S || !S.f32) return 1;
    const j = Math.round((x - S.x0) / S.cell), i = Math.round((z - S.z0) / S.cell);
    if (i < 0 || j < 0 || i >= S.nz || j >= S.nx) return 1;
    const h = S.f32[i * S.nx + j];
    return Math.max(0, Math.min(1, (y - h + 1.5) / 3));
  }

  setCity(opts = {}) {
    const style = opts.style || 'modern', density = opts.density === undefined ? 1 : opts.density, height = opts.height || 460;
    const key = `${style}|${density.toFixed(2)}|${Math.round(height)}`;
    if (this.job && this.job.key === key) return this.job.promise;
    if (key === this.key) { this.job = null; return Promise.resolve(false); }
    const job = { key, o: { key, style, density, height, year: opts.year || null }, fast: !this.plan || !!opts.now };
    this.job = job;
    job.promise = this.runJob(job).catch((e) => { console.error('city build failed', e); return false; }).finally(() => { if (this.job === job) this.job = null; });
    return job.promise;
  }

  async runJob(job) {
    const t0 = performance.now(), T = {}, o = job.o;
    const mark = (k) => { T[k] = Math.round(performance.now() - t0); };
    const live = () => this.job === job;
    const budget = job.fast ? 60 : 6;
    let slice = performance.now(), frames = 0, step = 'start';
    const tl = this.tl = [];
    const pause = async (next) => {
      const dt = performance.now() - slice;
      if (dt < budget) { step = next || step; return live(); }
      if (dt > 20) tl.push([step, Math.round(slice - t0), Math.round(dt)]);
      T.slice = Math.max(T.slice || 0, Math.round(dt));
      step = next || step;
      await nextFrame(); frames++;
      slice = performance.now();
      return live();
    };
    if (!job.fast) { await nextFrame(); if (!live()) return false; slice = performance.now(); }
    if (this.rowsDirty) { this.rowsDirty = false; this.sendRows(); }
    const wp = this.workerBuild(o);
    const H = (x, z) => this.V.heightAt(x, z);
    const it = planSteps({ heightAt: H, skeleton: this.skel, style: o.style, density: o.density, height: o.height, year: o.year });
    let r = it.next();
    while (!r.done) { if (!(await pause('plan'))) return false; r = it.next(); }
    const plan = r.value;
    if (!(await pause('annotate'))) return false;
    const sig = annotate(plan);
    plan.roadSet = new Set(plan.roads);
    mark('plan');
    const byChunk = new Map(), byD = new Map();
    if (!(await pause('index'))) return false;
    for (const b of plan.buildings) {
      if (!byChunk.has(b.chunk)) byChunk.set(b.chunk, []); byChunk.get(b.chunk).push(b);
      const d = this.propMod ? this.propMod.dchunkOf(b.cx, b.cz) : 0; if (!byD.has(d)) byD.set(d, []); byD.get(d).push(b);
    }
    const pst = this.props && !this.dbg.has('noprops') ? this.props.newState(plan) : null;
    if (!(await pause('props'))) return false;
    if (pst) for (const _ of this.props.prepareSteps(pst)) if (!(await pause('props'))) return false;
    mark('props');
    const ss = tileSink();
    let structures = null;
    const drop = () => { if (structures) structures.dispose(); return false; };
    if (this.structMod && plan.style !== 'none' && !this.dbg.has('nostruct')) {
      structures = new this.structMod.Structures(this, plan, ss.at);
      let si = 0;
      if (!(await pause('struct0'))) return drop();
      for (const _ of structures.steps()) if (!(await pause('struct' + ++si))) return drop();
    }
    mark('struct');
    if (!(await pause('wait'))) return drop();
    let res = await wp;
    if (!live()) return drop();
    slice = performance.now();
    mark('worker');
    if (res && res.sig !== sig) { console.warn('city worker plan differs', res.sig, sig); res = null; }
    if (!res) {
      const sink = tileSink();
      buildMass(plan, sink); buildGround(plan, this.skel, H, sink);
      res = { tiles: [...sink.per].map(([k, t]) => ({ k, mass: t.mass.nv ? t.mass.out() : null, ground: t.ground.nv ? t.ground.out() : null })), shadow: null };
      T.local = 1;
    } else T.w = res.ms;
    const tiles = new Map(res.tiles.map((t) => [t.k, t]));
    for (const [k, t] of ss.per) {
      const x = tiles.get(k) || { k, mass: null, ground: null };
      x.mass = mergeOut(x.mass, t.mass.nv ? t.mass.out() : null); x.ground = mergeOut(x.ground, t.ground.nv ? t.ground.out() : null);
      tiles.set(k, x);
      if (!(await pause('merge' + k))) return drop();
    }
    mark('merge');
    if (!(await pause('env'))) return drop();
    const env = this.envProxyFrom(res.env || envArrays(plan));
    if (!(await pause('swap'))) { if (env) env.geometry.dispose(); return drop(); }
    mark('env');
    const ts = performance.now();
    this.clear();
    this.key = job.key; this.style = plan.style; this.plan = plan; this.byChunk = byChunk; this.byD = byD;
    this.applyStyleUniforms(plan.style);
    if (this.props) this.props.adopt(pst || this.props.newState(null));
    for (const [k, t] of tiles) {
      const meshes = [];
      for (const [name, out, kind] of [['mass', t.mass, 'b'], ['ground', t.ground, 'g']]) {
        if (!out || !out.count) continue;
        const mesh = new THREE.Mesh(geoFrom(out, kind), kind === 'b' ? this.facade : this.street);
        mesh.matrixAutoUpdate = false; mesh.castShadow = kind === 'b'; mesh.receiveShadow = true; mesh.name = `city_${name}_${k}`;
        mesh.userData.k = name;
        if ((this.dbg.has('noground') && name === 'ground') || (this.dbg.has('nobuild') && name !== 'ground')) mesh.visible = false;
        this.root.add(mesh); meshes.push(mesh);
      }
      const ground = meshes.find((m) => m.userData.k === 'ground');
      this.tiles.set(k, { meshes, ground, box: ground ? ground.geometry.boundingBox : null });
    }
    this.structures = structures;
    if (structures) structures.activate();
    if (env) { this.envProxy = env; if (this.g.sky && this.g.sky.addEnvProxy) this.g.sky.addEnvProxy(env); }
    if (this.V.setTunnel) this.V.setTunnel(!!(structures && structures.tunnelSpec));
    this.bakeShadows(true, res.shadow || null);
    if (pst) this.requestFar(pst.items.filter((x) => x.far));
    this.colReset = true;
    if (this.V.refreshRoads) this.V.refreshRoads();
    T.swap = Math.round(performance.now() - ts);
    mark('done');
    T.frames = frames;
    this.tset = T;
    this.buildMs = performance.now() - t0;
    return true;
  }

  requestFar(list) {
    if (!list.length || !this.props) return;
    if (!this.dw.length) { const m = this.props.bakeFarTrees(list); if (m) { m.frustumCulled = false; this.farTrees = m; } return; }
    const w = this.dw[0]; w.busy++;
    w.postMessage({ far: this.props.farItems(list), token: this.dToken });
  }

  applyStyleUniforms(style) {
    const U = this.U;
    U.decay.value = style === 'ruins' ? 1 : 0;
    U.lights.value = style === 'ruins' || style === 'none' ? 0 : 1;
    U.dirtRoads.value = style === 'frontier' ? 1 : 0;
    U.scifi.value = style === 'scifi' ? 1 : 0;
    U.grime.value = style === 'future' || style === 'scifi' ? 0.08 : style === 'early' ? 0.5 : 0.35;
    U.litBoost.value = style === 'future' || style === 'scifi' ? 1.2 : style === 'early' ? 0.7 : 1;
  }

  setPalette(p) {
    const g = p && p.layers && p.layers.grass;
    if (g && g.color) { const c = g.color; this.U.lawn.value.setRGB(c[0] * 0.5 + 0.05, c[1] * 0.5 + 0.09, c[2] * 0.4 + 0.02); this.U.lawn2.value.copy(this.U.lawn.value).multiplyScalar(1.3); }
    this.U.wet.value = (p && p.wet) || 0;
  }

  clear() {
    const safe = (f) => { try { f(); } catch (e) { console.warn('city clear', e); } };
    for (const t of this.tiles.values()) for (const m of t.meshes) safe(() => { this.root.remove(m); if (m.geometry) m.geometry.dispose(); });
    this.tiles.clear();
    safe(() => { if (this.farTrees) { if (this.farTrees.parent) this.farTrees.parent.remove(this.farTrees); if (this.farTrees.geometry) this.farTrees.geometry.dispose(); } });
    this.farTrees = null;
    for (const d of this.details.values()) safe(() => this.dropDetail(d));
    this.details.clear();
    this.dToken++;
    this.dq = [];
    for (const k of [...this.colChunks.keys()]) safe(() => this.dropCol(k));
    this.colChunks.clear();
    safe(() => { if (this.structures) this.structures.dispose(); });
    this.structures = null;
    safe(() => { if (this.envProxy) { if (this.envProxy.parent) this.envProxy.parent.remove(this.envProxy); if (this.envProxy.geometry) this.envProxy.geometry.dispose(); } });
    this.envProxy = null;
  }

  pointAt(r, s) { return pointAt(r, s); }

  envProxyFrom(A) {
    if (!A) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(A.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(A.normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(A.color, 3));
    g.computeBoundingSphere();
    this.envMat = this.envMat || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
    return new THREE.Mesh(g, this.envMat);
  }

  dropDetail(d) {
    for (const m of [d.mesh, d.props]) if (m) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); if (m.userData.leaves) m.userData.leaves.geometry.dispose(); }
    d.mesh = null; d.props = null;
  }

  facingStreet(x, z) { return this.rasterAt(x, z) === 1; }

  requestDetail(dk) {
    const w = this.dw.reduce((a, b) => (b.busy < a.busy ? b : a), this.dw[0]);
    if (!w || w.busy >= 2) return false;
    w.busy++;
    const buildings = this.byD.get(dk) || [];
    const items = this.props && !this.dbg.has('noprops') ? this.props.chunkItems(dk) : [];
    this.details.set(dk, { pending: true, used: this.frame, t0: performance.now() });
    w.postMessage({ dk, token: this.dToken, buildings, items });
    return true;
  }

  onDetail(r) {
    if (r.token !== this.dToken) return;
    (this.dq || (this.dq = [])).push(r);
  }

  drainDetails() {
    const q = this.dq; if (!q || !q.length) return;
    const t0 = performance.now();
    while (q.length && performance.now() - t0 < 3) { const r = q.shift(); if (r.token === this.dToken) this.applyDetail(r); }
  }

  applyDetail(r) {
    if (r.far) { if (this.farTrees) return; const m = this.props && this.props.farFromBaked(r); if (m) this.farTrees = m; return; }
    const d = this.details.get(r.dk);
    if (!d || !d.pending) return;
    const t0 = performance.now();
    d.pending = false;
    if (r.facade) { const mesh = new THREE.Mesh(geoFrom(r.facade, 'b'), this.facade); mesh.matrixAutoUpdate = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `city_detail_${r.dk}`; this.root.add(mesh); d.mesh = mesh; }
    if (r.props && this.props) d.props = this.props.meshFromBaked(r.dk, r);
    const vis = this.frame - d.used < 3;
    if (d.mesh) d.mesh.visible = vis; if (d.props) d.props.visible = vis;
    this.tm.detail = Math.max(this.tm.detail * 0.98, performance.now() - t0); this.tm.nd++;
    this.tm.lat = performance.now() - d.t0;
  }

  buildDetail(dk) {
    const list = this.byD.get(dk) || [];
    const out = { mesh: null, props: null };
    if (list.length) {
      const G = new BGeo();
      const facing = (x, z) => { const r = this.rasterAt(x, z); return r === 1 || r === 2; };
      for (const b of list) detailBuilding(G, b, { facing });
      if (G.nv) {
        const mesh = new THREE.Mesh(geoFrom(G.out(), 'b'), this.facade);
        mesh.matrixAutoUpdate = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `city_detail_${dk}`;
        this.root.add(mesh); out.mesh = mesh;
      }
    }
    return out;
  }

  buildRaster() {
    const R = RAST, nx = Math.ceil((R.x1 - R.x0) / R.cell), nz = Math.ceil((R.z1 - R.z0) / R.cell);
    const A = new Uint8Array(nx * nz);
    this.raster = { ...R, nx, nz, a: A };
    const fillPoly = (poly, v, over = false) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const i0 = Math.max(0, Math.floor((z0 - R.z0) / R.cell)), i1 = Math.min(nz - 1, Math.ceil((z1 - R.z0) / R.cell));
      const j0 = Math.max(0, Math.floor((x0 - R.x0) / R.cell)), j1 = Math.min(nx - 1, Math.ceil((x1 - R.x0) / R.cell));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const o = i * nx + j; if (!over && A[o]) continue; if (inPoly(R.x0 + (j + 0.5) * R.cell, R.z0 + (i + 0.5) * R.cell, poly)) A[o] = v; }
    };
    for (const r of this.skel.roads) {
      if (r.elevated || r.tunnel) continue;
      const hw = r.width / 2 + 0.5;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx2 = dz / l * hw, nz2 = -dx / l * hw;
        fillPoly([[a[0] - nx2, a[1] - nz2], [b[0] - nx2, b[1] - nz2], [b[0] + nx2, b[1] + nz2], [a[0] + nx2, a[1] + nz2]], 1, true);
      }
    }
    for (const n of this.skel.nodes) if (n.box) { const [x0, z0, x1, z1] = n.box; fillPoly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 1, true); }
    for (const b of this.skel.blocks) fillPoly(b.poly, b.kind === 'stadium' ? 2 : 2);
    for (const w of this.skel.waterfront) fillPoly(w.poly, 2);
    for (const p of this.skel.parks) fillPoly(p.poly, 3);
  }

  rasterAt(x, z) {
    const R = this.raster; if (!R) return 0;
    const j = Math.floor((x - R.x0) / R.cell), i = Math.floor((z - R.z0) / R.cell);
    if (i < 0 || j < 0 || i >= R.nz || j >= R.nx) return 0;
    return R.a[i * R.nx + j];
  }

  deckIndex() {
    const idx = new Map(), C = 32;
    this.deckRoads = this.skel.roads.filter((r) => r.elevated || r.tunnel);
    for (const r of this.deckRoads) for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1], pad = r.width / 2 + 4;
      for (let x = Math.floor((Math.min(a[0], b[0]) - pad) / C); x <= Math.floor((Math.max(a[0], b[0]) + pad) / C); x++) for (let z = Math.floor((Math.min(a[1], b[1]) - pad) / C); z <= Math.floor((Math.max(a[1], b[1]) + pad) / C); z++) {
        const k = x * 100003 + z; if (!idx.has(k)) idx.set(k, []); idx.get(k).push([r, i]);
      }
    }
    this.decks = { idx, C };
  }

  decksAt(x, z, out = []) {
    out.length = 0;
    const D = this.decks; if (!D) return out;
    const list = D.idx.get(Math.floor(x / D.C) * 100003 + Math.floor(z / D.C));
    if (!list) return out;
    for (const [r, i] of list) {
      if (this.plan && this.plan.roadSet && !this.plan.roadSet.has(r)) continue;
      const a = r.pts[i], b = r.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
      const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      if (d > r.width / 2 + 0.5) continue;
      out.push({ r, y: r.points[i][1] + (r.points[i + 1][1] - r.points[i][1]) * t, tunnel: !!r.tunnel });
    }
    return out;
  }

  deckAt(x, z, y = null) {
    const L = this.decksAt(x, z, this._dl || (this._dl = []));
    if (!L.length) return null;
    let best = null, bd = Infinity;
    for (const d of L) { const dd = y === null || y < -1e8 ? -d.y : Math.abs(d.y - y); if (dd < bd) { bd = dd; best = d.y; } }
    return best;
  }

  inTunnel(x, z, y) {
    const L = this.decksAt(x, z, this._tl || (this._tl = []));
    for (const d of L) if (d.tunnel && y > d.y - 2 && y < d.y + 9) return true;
    return false;
  }

  surfaceAt(x, z, y) {
    if (this.style === 'none' || !this.plan) return null;
    const dk = this.decksAt(x, z, this._sl || (this._sl = []));
    for (const d of dk) if (y === undefined || y === null || Math.abs(y - d.y) < 3.5) return 'asphalt';
    const r = this.rasterAt(x, z);
    if (r === 1 || r === 2) return this.style === 'frontier' ? 'dirt' : 'asphalt';
    if (r === 3) return 'grass';
    return null;
  }

  signalState(id, axis) {
    const s = this.signals[id]; if (!s) return 'green';
    return signalState(s, axis, Date.now() / 1000);
  }

  roadsOut() {
    if (!this.plan) return [];
    return this.plan.roads.map((r) => ({ id: r.id, name: r.name, kind: r.kind, type: r.type, cat: r.cat, width: r.width, closed: !!r.closed, city: true, district: r.district, elevated: !!r.elevated, tunnel: !!r.tunnel, surface: this.style === 'frontier' ? 'dirt' : 'asphalt', pts: r.pts, points: r.points, signals: r.signals || [] }));
  }

  suspend(on) {
    this.suspended = !!on;
    this.root.visible = !on;
    if (this.envProxy) this.envProxy.visible = !on;
    if (on) { for (const k of [...this.colChunks.keys()]) this.dropCol(k); if (this.props) for (const k of [...this.props.bodies.keys()]) this.props.dropBody(k); }
    else this.colReset = true;
  }

  markTerrain() {
    this.rowsDirty = true;
    const k = (this.job && this.job.key) || this.key; this.key = null; this.job = null;
    return k;
  }

  terrainChanged() {
    const k = this.markTerrain();
    const [style, density, height] = k ? k.split('|') : ['modern', '1', '460'];
    return this.setCity({ style, density: +density, height: +height });
  }

  ensure(x, z) { this.loadColAround(x, z, 140, 99); }

  colAnchors() {
    const g = this.g, out = this._ca || (this._ca = []);
    out.length = 0;
    if (g.cars) for (const c of g.cars) { const p = c.sim.pos; out.push(p.x, p.z); }
    if (g.walker && g.walker.active && g.walker.pos) out.push(g.walker.pos.x, g.walker.pos.z);
    return out;
  }

  loadColAround(x, z, r, budget) {
    const c0x = Math.floor((x - r - CH_O) / CHUNK), c1x = Math.floor((x + r - CH_O) / CHUNK), c0z = Math.floor((z - r - CH_O) / CHUNK), c1z = Math.floor((z + r - CH_O) / CHUNK);
    const want = [];
    for (let cz = Math.max(0, c0z); cz <= Math.min(CH_N - 1, c1z); cz++) for (let cx = Math.max(0, c0x); cx <= Math.min(CH_N - 1, c1x); cx++) {
      const k = cz * CH_N + cx; if (this.colChunks.has(k)) continue;
      const mx = CH_O + (cx + 0.5) * CHUNK, mz = CH_O + (cz + 0.5) * CHUNK;
      want.push([k, Math.hypot(mx - x, mz - z)]);
    }
    want.sort((a, b) => a[1] - b[1]);
    let n = 0;
    for (const [k] of want) { if (n++ >= budget) break; this.makeCol(k); }
    return want;
  }

  makeCol(k) {
    const t0 = performance.now();
    const R = this.g.R, phys = this.g.phys, cols = [];
    const add = (d, ud) => { cols.push(phys.addStatic(d.setFriction(0.8).setRestitution(0.05).setCollisionGroups(groups(GROUP.STATIC, 0xffff)), ud)); };
    for (const b of this.byChunk ? this.byChunk.get(k) || [] : []) {
      const tiers = b.tiers || [{ fp: b.fp, y0: b.y0, y1: b.top }];
      for (const t of tiers) {
        const ri = rectInfo(t.fp), hy = (t.y1 - t.y0) / 2;
        if (hy < 0.2) continue;
        let d;
        if (ri) { const s = Math.sin(ri.yaw / 2), c = Math.cos(ri.yaw / 2); d = R.ColliderDesc.cuboid(ri.hx, hy, ri.hz).setTranslation(ri.cx, t.y0 + hy, ri.cz).setRotation({ x: 0, y: s, z: 0, w: c }); }
        else { const pts = []; for (const [x, z] of t.fp) pts.push(x, t.y0, z, x, t.y1, z); d = R.ColliderDesc.convexHull(new Float32Array(pts)); }
        if (d) add(d, { kind: 'box', tag: 'building', mat: 'concrete' });
      }
    }
    if (this.style !== 'none' && this.plan) {
      const pads = this.padsFor(k);
      if (pads) add(R.ColliderDesc.trimesh(pads.v, pads.i, R.TriMeshFlags.FIX_INTERNAL_EDGES), { kind: 'box', tag: 'curb', mat: 'concrete' });
      if (this.structures) for (const d of this.structures.collidersFor(k)) add(d.desc, d.ud);
    }
    this.colChunks.set(k, cols);
    const dt2 = performance.now() - t0; this.tm.col = Math.max(this.tm.col * 0.98, dt2); this.tm.nc++;
  }

  padsFor(k) {
    const H = (x, z) => this.V.heightAt(x, z), V = [], I = [];
    const cx0 = CH_O + (k % CH_N) * CHUNK, cz0 = CH_O + Math.floor(k / CH_N) * CHUNK;
    for (const blk of this.skel.blocks) {
      if (blk.kind !== 'lots' && blk.kind !== 'plaza') continue;
      if (chunkOf(blk.cx, blk.cz) !== k) continue;
      if (this.style === 'frontier' && (blk.district !== 'island' || blk.cz < 6880)) continue;
      const P = ccw(blk.poly), n = P.length, inner = [];
      for (let i = 0; i < n; i++) {
        const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
        const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
        const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2];
        const m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(...m) || 1, sc = 0.35 / Math.max(0.3, (m[0] * n1[0] + m[1] * n1[1]) / ml);
        inner.push([b[0] + m[0] / ml * sc, b[1] + m[1] / ml * sc]);
      }
      const base = V.length / 3;
      for (let i = 0; i < n; i++) { const [x, z] = P[i]; V.push(x, H(x, z) - 0.05, z); }
      for (let i = 0; i < n; i++) { const [x, z] = inner[i]; V.push(x, H(x, z) + 0.16, z); }
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; I.push(base + i, base + j, base + n + i, base + j, base + n + j, base + n + i); }
      for (let i = 1; i < n - 1; i++) I.push(base + n, base + n + i, base + n + i + 1);
    }
    if (!I.length) return null;
    void cx0; void cz0;
    return { v: new Float32Array(V), i: new Uint32Array(I) };
  }

  dropCol(k) {
    const cols = this.colChunks.get(k); if (!cols) return;
    const phys = this.g.phys;
    for (const c of cols) { phys.world.removeCollider(c, false); const i = phys.statics.indexOf(c); if (i >= 0) phys.statics.splice(i, 1); }
    this.colChunks.delete(k);
  }

  streamCols() {
    const A = this.colAnchors();
    if (this.colReset) { this.colReset = false; for (let a = 0; a < A.length; a += 2) this.loadColAround(A[a], A[a + 1], 180, 999); return; }
    let budget = 3;
    for (let a = 0; a < A.length && budget > 0; a += 2) { const w = this.loadColAround(A[a], A[a + 1], COL_R, budget); budget -= Math.min(budget, w.length); }
    if (this.frame % 40 === 0) for (const k of [...this.colChunks.keys()]) {
      const mx = CH_O + (k % CH_N + 0.5) * CHUNK, mz = CH_O + (Math.floor(k / CH_N) + 0.5) * CHUNK;
      let near = false;
      for (let a = 0; a < A.length; a += 2) if (Math.hypot(mx - A[a], mz - A[a + 1]) < COL_R + 500) { near = true; break; }
      if (!near) this.dropCol(k);
    }
  }

  preStep(dt, cars) { if (this.structures) this.structures.preStep(dt, cars); if (this.props) this.props.preStep(dt, cars); }

  update(dt, cam) {
    this.frame++;
    const sky = this.g.sky;
    this.U.night.value = THREE.MathUtils.smoothstep(sky.state.night, 0.02, 0.5);
    this.U.fill.value = 0.11 * THREE.MathUtils.smoothstep(sky.state.el || 0, -0.05, 0.25) * (sky.era && sky.era.ambient ? Math.min(1.6, sky.era.ambient) : 1);
    this.U.time.value += dt;
    if (sky.lightDir) this.U.lightDir.value.copy(sky.lightDir);
    if (this.frame % 20 === 0) this.bakeShadows(false);
    const w = this.g.weather; if (w) this.U.wet.value = Math.max(this.V.palette && this.V.palette.wet || 0, w.wet || 0);
    if (!this.plan) return;
    const cp = cam.position;
    this.U.camPos.value.copy(cp);
    for (const t of this.tiles.values()) if (t.ground && t.box) t.ground.visible = t.box.distanceToPoint(cp) < 3600;
    this.drainDetails();
    const dR = DETAIL_R[this.preset] || 520, DC = this.propMod ? this.propMod.DCH : 512, DN = this.propMod ? this.propMod.DCN : 32;
    let built = 0;
    const want = [];
    const c0x = Math.floor((cp.x - dR + 8192) / DC), c1x = Math.floor((cp.x + dR + 8192) / DC), c0z = Math.floor((cp.z - dR + 8192) / DC), c1z = Math.floor((cp.z + dR + 8192) / DC);
    for (let cz = Math.max(0, c0z); cz <= Math.min(DN - 1, c1z); cz++) for (let cx = Math.max(0, c0x); cx <= Math.min(DN - 1, c1x); cx++) {
      const k = cz * DN + cx, x0 = -8192 + cx * DC, z0 = -8192 + cz * DC;
      const dx = Math.max(x0 - cp.x, 0, cp.x - x0 - DC), dz = Math.max(z0 - cp.z, 0, cp.z - z0 - DC), d = Math.hypot(dx, dz, Math.max(0, cp.y - 120));
      if (d > dR) continue;
      want.push([k, d]);
    }
    want.sort((a, b) => a[1] - b[1]);
    const seen = new Set();
    for (const [k] of want) {
      seen.add(k);
      let d = this.details.get(k);
      if (!d) { if (this.dw.length) { if (built < 1 && this.requestDetail(k)) built++; d = this.details.get(k); } else if (built < 1) { d = this.buildDetail(k); this.details.set(k, d); built++; } }
      if (d) { d.used = this.frame; if (d.mesh) d.mesh.visible = !this.hideDetail; if (d.props) d.props.visible = !this.hideDetail; }
    }
    for (const [k, d] of this.details) {
      if (seen.has(k)) continue;
      if (d.mesh) d.mesh.visible = false; if (d.props) d.props.visible = false;
      if (this.frame - d.used > 300 && !d.pending) { this.dropDetail(d); this.details.delete(k); }
    }
    this.streamCols();
    if (this.structures) this.structures.update(dt, cam);
    if (this.props) this.props.update(dt, cam);
  }

  debug() {
    let tris = 0, meshes = 0;
    this.root.traverse((o) => { if (o.isMesh && o.visible) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.count || 1); } });
    return { tset: this.tset, tm: `det ${this.tm.detail.toFixed(1)}ms/${this.tm.nd} lat ${Math.round(this.tm.lat || 0)} col ${this.tm.col.toFixed(1)}ms/${this.tm.nc}`, style: this.style, buildings: this.plan ? this.plan.buildings.length : 0, tiles: this.tiles.size, details: this.details.size, cols: this.colChunks.size, meshes, tris: Math.round(tris), buildMs: Math.round(this.buildMs || 0), initMs: Math.round(this.initMs || 0) };
  }
}
