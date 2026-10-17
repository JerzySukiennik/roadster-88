// Roadster 88 era scatter: per-period flora and rock plans (floraplans.js) placed deterministically over the valley (or, on the real Earth, wild plans by climate streamed over the landing patch) and, streamed tile by tile around the camera, over the whole mega map outside it (keeping off water, roads and the city) in natural clumps and clearings, every instance with its own variant, age, scale, lean and hue, streamed around the camera as near cards (one instanced mesh per variant) and far impostors (one atlas, flipped and tinted per instance), trunk and rock colliders around the car, and breakable trees that fall as rigid bodies and stay felled in the causality world state.
import * as THREE from 'three/webgpu';
import { FloraLib, SPECIES, rockGeometry, farGeometry } from './flora.js';
import { Land, F } from './land.js';
import { rng, hash2i, hashStr, inPoly } from './lib.js';
import { plansFor, planKey, smooth, wildPlansFor } from './floraplans.js';
import { periodInfo } from './periods.js';
import { GROUP, groups } from '../sim/car.js';

function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2i(xi, zi, s), b = hash2i(xi + 1, zi, s), c = hash2i(xi, zi + 1, s), d = hash2i(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm2 = (x, z, s) => vnoise(x, z, s) * 0.6 + vnoise(x * 2.1, z * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, z * 4.3, s + 13) * 0.1;

const STYLE = { oak: [0.06, 1, 1], cottonwood: [0.04, 0.8, 1], magnolia: [0.05, 0.8, 1], conifer: [0.04, 0.6, 1], palm: [0.1, 0.5, 0], eucalyptus: [0.07, 0.6, 1], cycad: [0.05, 0.7, 1], treefern: [0.08, 0.7, 1], deadTree: [0.15, 0.3, 0], cactus: [0.06, 0.6, 0], shrub: [0.03, 0.8, 0], sage: [0.03, 0.8, 0], oleander: [0.03, 0.7, 0], fern: [0.08, 0.6, 0], grass: [0.08, 0.6, 0], dryGrass: [0.08, 0.6, 0], reed: [0.08, 0.5, 0], horsetail: [0.08, 0.5, 0], lepido: [0.05, 0.7, 1], calamites: [0.07, 0.6, 1], ginkgo: [0.05, 0.8, 1], orange: [0.02, 0.5, 0], prototax: [0.05, 0.6, 1], archaeop: [0.05, 0.6, 1], alienTree: [0.1, 0.8, 1], flowers: [0.08, 0.6, 0], moss: [0.04, 0.5, 0], wheat: [0.05, 0.3, 0], tundra: [0.08, 0.5, 0], alienFern: [0.08, 0.6, 0] };
const GROUND = new Set(['grass', 'dryGrass', 'fern', 'horsetail', 'reed', 'flowers', 'moss', 'wheat', 'tundra', 'alienFern']);

const ROCK = { rock: { h: 1, r: 1, trunk: 0, rock: true }, boulder: { h: 3, r: 1, trunk: 0, rock: true }, stromatolite: { h: 1, r: 1.2, trunk: 0, rock: true } };
const TALL_TILE = 128, GROUND_TILE = 32, INNER = 2048, EARTH_H = 29952, BLOCKED_SURF = new Set(['water', 'asphalt', 'concrete', 'sidewalk', 'deck', 'pavement', 'rail', 'steel', 'tunnel']);

export class Scatter {
  constructor(sys) {
    this.sys = sys;
    this.flora = new FloraLib();
    this.group = new THREE.Group(); this.group.name = 'EraFlora';
    sys.root.add(this.group);
    this.meshes = new Map();
    this.pools = [];
    this.planted = new Map();
    this.genCache = new Map();
    this.colliders = new Map();
    this.falling = [];
    this.statics = [];
    this.removed = new Set();
    this.lastCam = new THREE.Vector3(1e9, 0, 0); this.lastFwd = new THREE.Vector3();
    this.lastFarCam = new THREE.Vector3(1e9, 0, 0); this.lastFarFwd = new THREE.Vector3();
    this.lastCar = new THREE.Vector3(1e9, 0, 0);
    this.frustum = new THREE.Frustum(); this.projCam = new THREE.PerspectiveCamera();
    this.dirty = true;
    this.counts = {};
    const B = sys.valley.bounds, half = B ? Math.max(INNER, Math.min(8192, Math.max(-B.x0, B.x1, -B.z0, B.z1))) : INNER;
    const H = typeof location !== 'undefined' && /[?&]noouter\b/.test(location.search) ? INNER : half;
    this.LO = -H; this.HI = H; this.valleyH = H; this.earth = null; this.queue = []; this.queued = new Set(); this.warmQ = []; this.warmDraw = null;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._box = new THREE.Box3();
  }

  setEarth(info) {
    this.earth = info || null;
    const H = this.earth ? EARTH_H : this.valleyH;
    this.LO = -H; this.HI = H;
    this.queue.length = 0; this.queued.clear();
  }

  undrawn(M) { return [...M.near.slice(0, this.earth ? 2 : M.near.length), M.far].filter((im) => im && !im.userData.drawn); }

  prewarm(list) {
    for (const sp of list) { if (!SPECIES[sp] && !ROCK[sp]) continue; if (this.undrawn(this.meshFor(sp)).length && !this.warmQ.includes(sp)) this.warmQ.push(sp); }
  }

  warmNext() {
    const g = this.sys.game, W = this.warmDraw;
    if (W) { for (const im of W.ims) { im.userData.drawn = true; im.count = 0; im.visible = false; } this.warmDraw = null; this.dirty = true; this.warmed = (this.warmed || 0) + 1; return; }
    if (!g.started) return;
    while (this.warmQ.length) {
      const M = this.meshFor(this.warmQ.shift());
      const ims = this.undrawn(M).filter((im) => im.count === 0);
      if (!ims.length) continue;
      const c = g.gfx.camera, d = (this._w || (this._w = new THREE.Vector3())).set(0, 0, -1).applyQuaternion(c.quaternion), x = c.position.x + d.x * 4, y = c.position.y + d.y * 4, z = c.position.z + d.z * 4;
      for (const im of ims) { im.instanceMatrix.array.set([0.001, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, 0.001, 0, x, y, z, 1]); im.count = 1; im.visible = true; im.instanceMatrix.clearUpdateRanges(); im.instanceMatrix.needsUpdate = true; }
      this.warmDraw = { M, ims };
      return;
    }
  }

  blockedAt(x, z) { return !this.earth && this.land.blocked(x, z); }

  get land() { if (!this._land) this._land = new Land(this.sys.valley, this.sys.roadList); return this._land; }

  plant(eraId, list) { this.planted.set(eraId, list); }

  meshFor(sp, planted = false) {
    const mk = planted ? sp + ':planted' : sp;
    let M = this.meshes.get(mk);
    if (M) return M;
    const def = SPECIES[sp] || ROCK[sp];
    const lib = this.flora;
    const ground = GROUND.has(sp);
    let nearGs, farG, mat, farMat;
    if (ROCK[sp]) { nearGs = [rockGeometry(2, hashStr(sp))]; farG = rockGeometry(1, hashStr(sp) + 1); mat = farMat = lib.rock; }
    else { const V = def.V || 1; nearGs = Array.from({ length: V }, (_, v) => def.near(rng(hashStr(sp) + v * 7919), v, V)); farG = farGeometry(sp); mat = lib.mat; farMat = lib.farMat; }
    M = { def, sp, nearGs, near: nearGs.map((g) => this.mkInst(g, mat, 1024, !ground && sp !== 'rock', sp)), far: farG ? this.mkInst(farG, farMat, 1024, false, sp) : null, rock: !!ROCK[sp] };
    this.meshes.set(mk, M);
    return M;
  }

  mkInst(base, mat, cap, shadow, sp) {
    const g = base.clone();
    g.setAttribute('ivar', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    const im = new THREE.InstancedMesh(g, mat, cap);
    im.count = 0; im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = true;
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    im.userData.k = 'flora_' + sp; im.userData.base = base; im.visible = false;
    this.group.add(im);
    return im;
  }

  grow(M, need, idx) {
    const old = idx === undefined ? M.far : M.near[idx], cap = Math.max(1024, 1 << Math.ceil(Math.log2(need * 1.25)));
    const im = this.mkInst(old.userData.base, old.material, cap, old.castShadow, M.sp);
    im.visible = old.visible;
    this.group.remove(old); old.geometry.dispose(); old.dispose();
    if (idx === undefined) M.far = im; else M.near[idx] = im;
    return im;
  }

  setVisible(M, on) { for (const im of M.near) { im.visible = on; if (!on) im.count = 0; } if (M.far) { M.far.visible = on; if (!on) M.far.count = 0; } }

  traits(sp, rv, ra, rt, rh, rb, rf) {
    const def = SPECIES[sp], st = STYLE[sp] || [0, 0, 0], V = (def && def.V) || 1;
    let k = 1;
    if (st[2]) { if (ra < 0.13) k = 0.4 + (ra / 0.13) * 0.25; else if (ra > 0.972) k = 1.4 + ((ra - 0.972) / 0.028) * 0.45; }
    const v = V > 1 ? (sp === 'deadTree' || !st[2] ? Math.floor(rv * V) % V : rv < 0.12 ? V - 1 : Math.floor(((rv - 0.12) / 0.88) * (V - 1))) : 0;
    return { v, k, tilt: (rt - 0.5) * 2 * st[0], h: (rh - 0.5) * 2 * st[1], b: (rb - 0.5) * 0.28, bw: (rf - 0.5) * 0.5, f: (rf * 7.31) % 1 < 0.5 ? 1 : 0 };
  }

  sample(x, z, ctx) {
    const V = this.sys.valley;
    if (this.earth) {
      const h = V.heightAt(x, z), n = V.normalAt(x, z, this._v), E = V.earth;
      let wet = 1, depth = -99, shore = 99, surf;
      if (E && E.waterAt) {
        const w = E.waterAt(x, z), on = w.cover >= 0.02 && w.level > -9000;
        if (on && h < w.level) { depth = w.level - h; wet = 0; surf = 'water'; }
        else { if (on) shore = Math.max(0, h - w.level) * 4; surf = V.surfaceAt ? V.surfaceAt(x, z) : 'grass'; }
      } else {
        const fl = V.fluidAt ? V.fluidAt(x, z) : null;
        if (fl) { depth = fl.level - h; wet = 0; surf = 'water'; } else { if (h < 12) shore = Math.max(0, h) * 4; surf = V.surfaceAt ? V.surfaceAt(x, z) : 'grass'; }
      }
      if (surf === 'water') wet = 0;
      const slope = 1 - n.y;
      return { x, z, h: h - this.earth.ref, ha: h, surf, slope, flag: slope > 0.35 ? F.MASSIF : 0, road: 0, blocked: false, n1: fbm2(x / 420, z / 420, 11), n2: fbm2(x / 70, z / 70, 23), wet, depth, shore };
    }
    const L = this.land;
    const h = V.heightAt(x, z);
    const n = V.normalAt(x, z, this._v);
    const flag = L.flag(x, z);
    let wet = 1, depth = -99, shore = 99;
    for (const f of ctx.fluids) {
      if (!f.near) continue;
      if (!(flag & F.LAKE) && !inPoly(f.near, x, z)) continue;
      const d = f.level - h;
      if (d > depth) depth = d;
      if (d > -0.15) wet = 0;
      else shore = Math.min(shore, -d * 4);
    }
    const P = ctx.period || (ctx.period = periodInfo(ctx.eraId)), natural = P.natural;
    if ((Math.abs(x) > INNER || Math.abs(z) > INNER) && V.surfaceAt && BLOCKED_SURF.has(V.surfaceAt(x, z))) wet = 0;
    return { x, z, h, slope: 1 - n.y, flag: natural ? flag & ~F.TOWN : flag, road: natural ? 0 : L.roadNear(x, z, P.loop), blocked: L.blocked(x, z), n1: fbm2(x / 420, z / 420, 11), n2: fbm2(x / 70, z / 70, 23), wet, depth, shore };
  }

  genTile(plan, tx, tz, size, ctx) {
    const cl = plan.clump;
    const area = (size * size) / 10000, expected = plan.density * area * (plan.ground ? this.sys.detail : 1) * (cl ? cl.boost : 1);
    const ph = hashStr(plan.seed);
    const R = rng(Math.floor(hash2i(tx, tz, ph) * 4294967296));
    const n = Math.floor(expected) + (R() < expected % 1 ? 1 : 0);
    const out = [];
    const x0 = this.LO + tx * size, z0 = this.LO + tz * size;
    const rockish = !!ROCK[plan.sp];
    for (let k = 0; k < n; k++) {
      const x = x0 + R() * size, z = z0 + R() * size, acc = R(), rot = R() * Math.PI * 2, sr = R(), c0 = R(), c1 = R(), sq = R();
      const rv = R(), ra = R(), rt = R(), rh = R(), rb = R(), rf = R();
      const key = `${plan.seed}:${tx}:${tz}:${k}`;
      const g = this.sample(x, z, ctx);
      let w = plan.w(g);
      if (cl && w > 0) w *= cl.base + (1 - cl.base) * smooth(cl.lo, cl.hi, fbm2(x / cl.s, z / cl.s, 37 + (ph % 997)));
      if (acc >= w) continue;
      const T = this.traits(plan.sp, rv, ra, rt, rh, rb, rf);
      const s = (plan.scale[0] + (plan.scale[1] - plan.scale[0]) * sr) * T.k;
      const sink = rockish ? s * 0.35 : 0.05 + Math.abs(T.tilt) * 2;
      out.push({ x, y: (g.ha === undefined ? g.h : g.ha) - sink, z, rot, s, sy: rockish ? s * (0.6 + sq * 0.6) * (plan.squash || 1) : s * (0.88 + sq * 0.24), key, c: rockish ? [0.86 + c0 * 0.22, 0.88 + c1 * 0.18, 0.84 + (c0 + c1) * 0.1] : [0.95 + c0 * 0.1, 0.95 + c1 * 0.1, 0.95 + (c0 + c1) * 0.05], sp: plan.sp, v: T.v, tilt: rockish ? 0 : T.tilt, h: T.h, b: T.b, bw: T.bw, f: T.f });
    }
    return out;
  }

  enter(eraId, year) {
    this.clearPhysics();
    this.queue.length = 0; this.queued.clear();
    this.eraId = eraId; this.year = year;
    const ctx = this.sys.eraContext(eraId);
    this.ctx = ctx;
    for (const f of ctx.fluids) if (!f.near && f.poly) { let cx = 0, cz = 0; for (const [x, z] of f.poly) { cx += x; cz += z; } cx /= f.poly.length; cz /= f.poly.length; f.near = f.poly.map(([x, z]) => [cx + (x - cx) * 1.35, cz + (z - cz) * 1.35]); }
    this.flora.setEra(periodInfo(eraId));
    for (const [, M] of this.meshes) this.setVisible(M, false);
    this.removed = new Set();
    for (const c of this.sys.worldState.keysChangedIn(eraId)) if (c.state !== 'intact') this.removed.add(c.key);
    const t0 = performance.now();
    this.pools = []; this.counts = {};
    const E = this.earth, plans = E ? wildPlansFor(eraId, year, E.climate, periodInfo(eraId).age, E.cell) : plansFor(eraId, year);
    const live = this.sys.game.started;
    for (const plan of plans) {
      const M = this.meshFor(plan.sp);
      this.setVisible(M, true);
      const lazy = !plan.far;
      const pool = { plan, M, tall: !lazy, lazy, tsize: plan.ground ? GROUND_TILE : 64, tiles: new Map(), near: plan.near * Math.sqrt(this.sys.detail) * (E ? 0.85 : 1), far: Math.min(E ? 1400 : 1e9, (plan.far || 0) * Math.min(1, 0.6 + 0.4 * this.sys.detail)) };
      if (!lazy && !E) {
        const ck = eraId + ':' + planKey(plan);
        let tiles = this.genCache.get(ck);
        if (!tiles) {
          tiles = new Map();
          const T = TALL_TILE, nT = (this.HI - this.LO) / T, sub = 2, i0 = Math.floor((-INNER - this.LO) / T), i1 = Math.ceil((INNER - this.LO) / T);
          for (let tz = i0; tz < i1; tz++) for (let tx = i0; tx < i1; tx++) {
            const list = [];
            for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) list.push(...this.genTile(plan, tx * sub + a, tz * sub + b, T / sub, ctx));
            if (list.length) tiles.set(tz * nT + tx, this.tileOf(list, tx, tz, T));
          }
          this.genCache.set(ck, tiles);
        }
        pool.tiles = tiles;
      }
      if (live && this.undrawn(M).length) { pool.hold = true; this.setVisible(M, false); }
      this.pools.push(pool);
    }
    for (const p of E ? [] : this.planted.get(eraId) || []) {
      if (this.removed.has(p.key)) continue;
      let pool = this.pools.find((q) => q.plan.sp === p.sp && q.planted);
      if (!pool) { const M = this.meshFor(p.sp, true); this.setVisible(M, true); const def = M.def; pool = { plan: { sp: p.sp, seed: 'planted' }, M, tall: true, planted: true, tiles: new Map(), near: (def.h > 6 ? 190 : 230) * Math.sqrt(this.sys.detail), far: def.h > 6 ? 2000 : 0 }; this.pools.push(pool); }
      const nT = (this.HI - this.LO) / TALL_TILE, tx = Math.floor((p.x - this.LO) / TALL_TILE), tz = Math.floor((p.z - this.LO) / TALL_TILE), k = tz * nT + tx;
      let t = pool.tiles.get(k); if (!t) { t = this.tileOf([], tx, tz, TALL_TILE); pool.tiles.set(k, t); }
      const hv = hashStr(p.key), fr = (n) => ((hv >>> n) % 997) / 997;
      const T = this.traits(p.sp, fr(0), 0.5, fr(3), fr(7), fr(11), fr(17));
      t.list.push({ c: [1, 1, 1], sy: p.s, rot: 0, v: T.v, tilt: T.tilt, h: T.h, b: T.b, bw: T.bw, f: T.f, ...p }); t.y0 = Math.min(t.y0, p.y); t.y1 = Math.max(t.y1, p.y + 30);
    }
    this.genMs = performance.now() - t0;
    this.restoreFelled(eraId);
    this.dirty = true; this.lastCar.set(1e9, 0, 0);
  }

  tileOf(list, tx, tz, T) {
    let y0 = Infinity, y1 = -Infinity; for (const i of list) { y0 = Math.min(y0, i.y); y1 = Math.max(y1, i.y + 30); }
    return { list, x: this.LO + (tx + 0.5) * T, z: this.LO + (tz + 0.5) * T, half: T / 2, y0: isFinite(y0) ? y0 : 0, y1: isFinite(y1) ? y1 : 30 };
  }

  leave() { this.clearPhysics(); }

  clearPhysics() {
    const w = this.sys.game.phys.world;
    for (const [, c] of this.colliders) w.removeCollider(c, false);
    this.colliders.clear();
    for (const f of this.falling) { if (f.body) w.removeRigidBody(f.body); this.drop(f.mesh); }
    this.falling = [];
    for (const m of this.statics) this.drop(m);
    this.statics = [];
  }

  drop(m) { this.group.remove(m); m.geometry.dispose(); }

  felledMesh(sp, it) {
    const MG = this.meshFor(sp).nearGs, g = MG[(it.v || 0) % MG.length].clone(), n = g.attributes.position.count, a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { a[i * 4] = it.v || 0; a[i * 4 + 1] = it.h || 0; a[i * 4 + 2] = it.b || 0; a[i * 4 + 3] = it.bw || 0; }
    g.setAttribute('ivar', new THREE.BufferAttribute(a, 4));
    const m = new THREE.Mesh(g, this.flora.mat);
    m.castShadow = true; m.receiveShadow = true; m.userData.k = 'felled';
    return m;
  }

  writeInst(im, i, it, k, tint, cell) {
    const a = im.instanceMatrix.array, o = i * 16, ct = Math.cos(it.rot), st = Math.sin(it.rot), tl = it.tilt || 0, cp = Math.cos(tl), sp = Math.sin(tl), sx = it.s * k, sy = it.sy * k;
    a[o] = ct * sx; a[o + 1] = 0; a[o + 2] = -st * sx; a[o + 3] = 0;
    a[o + 4] = st * sp * sy; a[o + 5] = cp * sy; a[o + 6] = ct * sp * sy; a[o + 7] = 0;
    a[o + 8] = st * cp * sx; a[o + 9] = -sp * sx; a[o + 10] = ct * cp * sx; a[o + 11] = 0;
    a[o + 12] = it.x; a[o + 13] = it.y; a[o + 14] = it.z; a[o + 15] = 1;
    const ca = im.instanceColor.array, oc = i * 3;
    if (tint) { ca[oc] = it.c[0] * tint[0]; ca[oc + 1] = it.c[1] * tint[1]; ca[oc + 2] = it.c[2] * tint[2]; } else { ca[oc] = it.c[0]; ca[oc + 1] = it.c[1]; ca[oc + 2] = it.c[2]; }
    const iv = im.geometry.attributes.ivar.array, oi = i * 4;
    iv[oi] = cell === undefined ? it.v || 0 : cell; iv[oi + 1] = it.h || 0; iv[oi + 2] = it.b || 0; iv[oi + 3] = cell === undefined ? it.bw || 0 : it.f || 0;
  }

  rebuild(cam, doNear = true, doFar = true) {
    const g = this.sys.game, camera = g.gfx.camera;
    const pc = this.projCam;
    pc.fov = Math.min(150, camera.fov + (doFar ? 55 : 40)); pc.aspect = camera.aspect; pc.near = 0.5; pc.far = 6000; pc.updateProjectionMatrix();
    pc.position.copy(camera.position); pc.quaternion.copy(camera.quaternion); pc.updateMatrixWorld(true);
    this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(pc.projectionMatrix, pc.matrixWorldInverse));
    const cx = cam.x, cz = cam.z, removed = this.removed, land = this.land;
    const counts = this.counts || {};
    for (const pool of this.pools) {
      const M = pool.M;
      if (pool.hold) continue;
      const hasFar = !!M.far && doFar;
      let nn = 0, nf = 0;
      const nearR = pool.near, farR = M.far ? Math.max(pool.far, nearR) : nearR, nearR2 = nearR * nearR, farR2 = farR * farR, farIn = Math.max(0, nearR - 32), farIn2 = farIn * farIn;
      const reach = hasFar ? farR : nearR;
      const Vn = this.oneVariant ? 1 : this.earth ? Math.min(2, M.near.length) : M.near.length, nbs = this._nbs || (this._nbs = []), fb = this._fb || (this._fb = []);
      for (let v = 0; v < Vn; v++) (nbs[v] || (nbs[v] = [])).length = 0;
      fb.length = 0;
      const visitTile = (t) => {
        const dx = t.x - cx, dz = t.z - cz, d = Math.hypot(dx, dz);
        if (d - t.half * 1.42 > reach) return;
        if (d > t.half * 1.5 + 40) { this._box.min.set(t.x - t.half, t.y0 - 5, t.z - t.half); this._box.max.set(t.x + t.half, t.y1 + 5, t.z + t.half); if (!this.frustum.intersectsBox(this._box)) return; }
        for (const it of t.list) {
          if (removed.has(it.key) || (!pool.planted && this.blockedAt(it.x, it.z))) continue;
          const ex = it.x - cx, ez = it.z - cz, d2 = ex * ex + ez * ez;
          if (doNear && d2 < nearR2) nbs[Vn > 1 ? (it.v || 0) % Vn : 0].push(it, pool.tall ? 1 : 1 - smooth(nearR2 * 0.55, nearR2, d2));
          if (hasFar && d2 >= farIn2 && d2 < farR2) fb.push(it);
        }
      };
      if (pool.tall) { for (const [, t] of pool.tiles) visitTile(t); if (!pool.planted && this.HI > INNER && doFar) this.queueOuter(pool, cx, cz, Math.min(reach, 1900)); }
      else if (doNear) {
        const T = pool.tsize, r = Math.ceil(nearR / T) + 1, tcx = Math.floor((cx - this.LO) / T), tcz = Math.floor((cz - this.LO) / T);
        for (let tz = tcz - r; tz <= tcz + r; tz++) for (let tx = tcx - r; tx <= tcx + r; tx++) {
          if (tx < 0 || tz < 0 || tx >= (this.HI - this.LO) / T || tz >= (this.HI - this.LO) / T) continue;
          const key = tz * 4096 + tx;
          let t = pool.tiles.get(key);
          if (!t) { t = this.tileOf(this.genTile(pool.plan, tx, tz, T, this.ctx), tx, tz, T); pool.tiles.set(key, t); }
          visitTile(t);
        }
        if (pool.tiles.size > 3000) { let n = 0; for (const [k, t] of pool.tiles) { if (Math.hypot(t.x - cx, t.z - cz) > nearR * 2) { pool.tiles.delete(k); if (++n > 800) break; } } }
      }
      const tint = pool.plan.tint || (this.tints && this.tints[pool.plan.sp]);
      if (doNear) {
        for (let v = 0; v < M.near.length; v++) {
          const b = nbs[v], n = v < Vn ? b.length / 2 : 0;
          let im = M.near[v]; if (n > im.instanceMatrix.count) im = this.grow(M, n, v);
          for (let i = 0; i < n; i++) this.writeInst(im, i, b[i * 2], b[i * 2 + 1], tint);
          this.flush(im, n); nn += n;
        }
      }
      if (hasFar) {
        nf = fb.length;
        let im = M.far; if (nf > im.instanceMatrix.count) im = this.grow(M, nf);
        const rockF = M.rock;
        for (let i = 0; i < nf; i++) { const it = fb[i]; this.writeInst(im, i, it, 1, tint, rockF ? 0 : this.flora.impCell(pool.plan.sp, it.v || 0)); }
        this.flush(im, nf);
      }
      counts[pool.plan.sp] = (doNear ? nn : M.near.reduce((a, im) => a + im.count, 0)) + (hasFar ? nf : (M.far ? M.far.count : 0));
    }
    this.counts = counts;
  }

  queueOuter(pool, cx, cz, reach) {
    const T = TALL_TILE, nT = (this.HI - this.LO) / T, r = Math.ceil(reach / T), tcx = Math.floor((cx - this.LO) / T), tcz = Math.floor((cz - this.LO) / T);
    for (let tz = tcz - r; tz <= tcz + r; tz++) for (let tx = tcx - r; tx <= tcx + r; tx++) {
      if (tx < 0 || tz < 0 || tx >= nT || tz >= nT) continue;
      const k = tz * nT + tx;
      if (pool.tiles.has(k)) continue;
      const x = this.LO + (tx + 0.5) * T, z = this.LO + (tz + 0.5) * T;
      if (!this.earth && Math.abs(x) < INNER && Math.abs(z) < INNER) continue;
      if (Math.hypot(x - cx, z - cz) > reach + T) continue;
      const qk = pool.plan.seed + pool.plan.sp + k;
      if (this.queued.has(qk)) continue;
      this.queued.add(qk); this.queue.push({ pool, tx, tz, k, qk, d: Math.hypot(x - cx, z - cz) });
    }
    if (this.queue.length > 1) this.queue.sort((a, b) => a.d - b.d);
  }

  drainOuter(budgetMs) {
    if (!this.queue.length) return;
    const t0 = performance.now(), T = TALL_TILE;
    let n = 0;
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const q = this.queue.shift();
      this.queued.delete(q.qk);
      if (!this.pools.includes(q.pool) || q.pool.tiles.has(q.k)) continue;
      const list = [];
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) list.push(...this.genTile(q.pool.plan, q.tx * 2 + a, q.tz * 2 + b, T / 2, this.ctx));
      q.pool.tiles.set(q.k, this.tileOf(list, q.tx, q.tz, T));
      n++;
    }
    if (n) this.outerDirty = (this.outerDirty || 0) + n;
    if (this.outerDirty > (this.earth ? 60 : 24) || (!this.queue.length && this.outerDirty)) { this.outerDirty = 0; this.dirty = true; }
    for (const pool of this.pools) {
      if (!pool.tall || pool.planted || pool.tiles.size < (this.earth ? 1500 : 6000)) continue;
      const cam = this.lastFarCam;
      for (const [k, t] of pool.tiles) if ((this.earth || Math.abs(t.x) > INNER || Math.abs(t.z) > INNER) && Math.hypot(t.x - cam.x, t.z - cam.z) > 3200) pool.tiles.delete(k);
    }
  }

  flush(im, n) {
    if (this.warmDraw && this.warmDraw.ims.includes(im) && n === 0) return;
    im.count = n; im.visible = n > 0;
    if (n > 0) im.userData.drawn = true;
    if (!n) return;
    for (const [a, w] of [[im.instanceMatrix, 16], [im.instanceColor, 3], [im.geometry.attributes.ivar, 4]]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * w); a.needsUpdate = true; }
  }

  updateColliders(car) {
    const R = this.sys.game.R, w = this.sys.game.phys.world;
    const want = new Map();
    const rad = 70, rad2 = rad * rad;
    for (const pool of this.pools) {
      const def = pool.M.def;
      if (!def.trunk && !def.rock) continue;
      for (const [, t] of pool.tiles) {
        if (Math.abs(t.x - car.x) > rad + t.half || Math.abs(t.z - car.z) > rad + t.half) continue;
        for (const it of t.list) { if (this.removed.has(it.key) || (!pool.planted && this.blockedAt(it.x, it.z))) continue; const dx = it.x - car.x, dz = it.z - car.z; if (dx * dx + dz * dz < rad2 && (!def.rock || it.s > 0.55)) want.set(it.key, { it, def, sp: pool.plan.sp }); }
      }
    }
    for (const [k, c] of this.colliders) if (!want.has(k)) { w.removeCollider(c, false); this.colliders.delete(k); }
    for (const [k, o] of want) {
      if (this.colliders.has(k)) continue;
      const { it, def } = o;
      let d;
      if (def.rock) { const r = it.s * (it.sp === 'boulder' ? 0.95 : 0.85); d = R.ColliderDesc.ball(r).setTranslation(it.x, it.y + it.sy * 0.45, it.z); }
      else { const hh = Math.min(4, def.h * 0.35) * it.sy, r = def.trunk * it.s; d = R.ColliderDesc.cylinder(hh, r).setTranslation(it.x, it.y + hh, it.z); }
      d.setFriction(0.8).setCollisionGroups(groups(GROUP.STATIC, 0xffff));
      const c = w.createCollider(d);
      c.userData = { kind: def.rock ? 'rock' : 'tree', tag: def.rock ? 'rock' : 'pole', r: def.trunk * it.s, key: k };
      o.c = c; c.era = o;
      this.colliders.set(k, c);
    }
  }

  checkBreaks(dt) {
    const g = this.sys.game, car = g.car;
    if (!car || !car.view.root.visible) return;
    const s = car.sim, v = s.vel, sp = Math.hypot(v.x, v.z);
    if (sp < 7) return;
    const T = Math.max(0.05, dt * 2.5);
    for (const [k, c] of this.colliders) {
      const o = c.era; if (!o || o.def.rock) continue;
      const it = o.it, dx = it.x - s.pos.x, dz = it.z - s.pos.z;
      if (dx * dx + dz * dz > 900) continue;
      const along = (dx * v.x + dz * v.z) / sp;
      if (along < -1 || along > sp * T + 3) continue;
      const lat = Math.abs(dx * v.z - dz * v.x) / sp;
      if (lat > o.def.trunk * it.s + 1.15) continue;
      if (Math.abs(s.pos.y - it.y) > o.def.h * it.sy * 0.6) continue;
      if (sp < o.def.breakV * Math.sqrt(it.s)) continue;
      this.fell(k, o, v);
    }
  }

  fell(k, o, v) {
    const g = this.sys.game, R = g.R, w = g.phys.world, it = o.it;
    w.removeCollider(this.colliders.get(k), false); this.colliders.delete(k);
    this.removed.add(k); this.dirty = true;
    this.sys.worldState.record(k, this.eraId, 'felled', { sp: o.sp, v: it.v || 0, h: it.h || 0, b: it.b || 0, bw: it.bw || 0, s: it.s, sy: it.sy, x: it.x, z: it.z });
    if (g.fx && g.fx.dustBurst) g.fx.dustBurst(new THREE.Vector3(it.x, it.y + 0.5, it.z), 14, 1.6);
    if (g.audio) g.audio.play('impact_heavy', { pos: { x: it.x, y: it.y + 1, z: it.z }, gain: 0.8 });
    if (this.falling.length >= 8) this.freeze(this.falling.shift());
    const hh = Math.min(4, o.def.h * 0.35) * it.sy, r = o.def.trunk * it.s;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
    const body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(it.x, it.y, it.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.4).setAngularDamping(0.6));
    const mass = o.def.mass * it.s * it.s * it.sy;
    w.createCollider(R.ColliderDesc.cylinder(hh, r).setTranslation(0, hh, 0).setMass(mass * 0.6).setFriction(0.9).setCollisionGroups(groups(GROUP.DEBRIS, GROUP.STATIC | GROUP.CAR | GROUP.DEBRIS)), body);
    w.createCollider(R.ColliderDesc.ball(Math.max(1, o.def.r * 0.55 * it.s)).setTranslation(0, o.def.h * 0.62 * it.sy, 0).setMass(mass * 0.4).setFriction(0.9).setCollisionGroups(groups(GROUP.DEBRIS, GROUP.STATIC | GROUP.DEBRIS)), body);
    const sp = Math.hypot(v.x, v.z) || 1, ax = v.z / sp, az = -v.x / sp;
    const spin = Math.min(2.2, sp / (o.def.h * it.sy) * 1.4);
    body.setAngvel({ x: ax * spin, y: 0, z: az * spin }, true);
    body.setLinvel({ x: v.x * 0.15, y: 0.5, z: v.z * 0.15 }, true);
    const mesh = this.felledMesh(o.sp, it);
    mesh.scale.set(it.s, it.sy, it.s);
    this.group.add(mesh);
    this.falling.push({ key: k, body, mesh, t: 0, it, sp: o.sp });
  }

  freeze(f) {
    const w = this.sys.game.phys.world;
    if (f.body) {
      const t = f.body.translation(), r = f.body.rotation();
      const c = this.sys.worldState.effective(f.key, this.eraId);
      if (c) c.data.final = [t.x, t.y, t.z, r.x, r.y, r.z, r.w];
      w.removeRigidBody(f.body); f.body = null;
    }
    this.statics.push(f.mesh);
    if (this.statics.length > 24) this.drop(this.statics.shift());
  }

  restoreFelled(eraId) {
    const pre = this.earth ? this.earth.cell + ':' : null;
    for (const c of this.sys.worldState.keysChangedIn(eraId)) {
      if (c.state !== 'felled' || c.eraId !== eraId || !c.data.final || !c.data.sp) continue;
      if (pre ? !c.key.startsWith(pre) : c.key[0] === 'E') continue;
      const m = this.felledMesh(c.data.sp, c.data);
      const f = c.data.final; m.position.set(f[0], f[1], f[2]); m.quaternion.set(f[3], f[4], f[5], f[6]); m.scale.set(c.data.s || 1, c.data.sy || 1, c.data.s || 1);
      this.group.add(m); this.statics.push(m);
    }
  }

  update(dt, cam) {
    if (!this.eraId) return;
    const g = this.sys.game;
    const held = this.warmDraw ? null : this.pools.find((p) => p.hold);
    if (held) { for (const q of this.pools) if (q.M === held.M) q.hold = false; this.dirty = true; }
    const fwd = this._v.set(0, 0, -1).applyQuaternion(g.gfx.camera.quaternion);
    const moved = cam.distanceTo(this.lastCam), turned = fwd.angleTo(this.lastFwd);
    const sp = g.car ? g.car.sim.speed : 0;
    const movedFar = cam.distanceTo(this.lastFarCam), turnedFar = fwd.angleTo(this.lastFarFwd);
    const doFar = this.dirty || movedFar > 30 || turnedFar > 0.3;
    if (doFar || moved > Math.max(6, sp * 0.12) || turned > 0.09) {
      this.dirty = false; this.lastCam.copy(cam); this.lastFwd.copy(fwd);
      if (doFar) { this.lastFarCam.copy(cam); this.lastFarFwd.copy(fwd); }
      const t0 = performance.now(); this.rebuild(cam, true, doFar); this.rebuildMs = performance.now() - t0;
    }
    this.drainOuter(g.started ? 1.5 : 50);
    if (!held) this.warmNext();
    if (g.car) {
      const p = g.car.sim.pos;
      if (Math.hypot(p.x - this.lastCar.x, p.z - this.lastCar.z) > 10) { this.lastCar.set(p.x, p.y, p.z); this.updateColliders(p); }
      this.checkBreaks(dt);
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      const t = f.body.translation(), r = f.body.rotation();
      f.mesh.position.set(t.x, t.y, t.z); f.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if ((f.t > 4 && f.body.isSleeping()) || f.t > 20) { this.freeze(f); this.falling.splice(i, 1); }
    }
  }

  overlaps(x, y, z, r) {
    for (const [, c] of this.colliders) { const o = c.era; if (!o) continue; const it = o.it; if (Math.hypot(it.x - x, it.z - z) < r + (o.def.trunk || it.s) * it.s && y < it.y + o.def.h * it.sy) return true; }
    return false;
  }

  debug() { return { pools: this.pools.length, genMs: +(this.genMs || 0).toFixed(1), rebuildMs: +(this.rebuildMs || 0).toFixed(2), colliders: this.colliders.size, counts: this.counts, falling: this.falling.length }; }
}
