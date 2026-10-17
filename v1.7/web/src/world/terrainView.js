// Roadster 88 terrain renderer: quadtree chunked LOD terrain over any height grid (the 2 m valley and the 4 m mega grid around it, which skips the valley square) with vertex geomorphing and skirts, a layered TSL terrain material driven by the era palette (floor, grass, rock, high ground, wash and lakebed, roads, tracks, snow, wetness, glowing cracks) with baked AO and terrain sun shadows, cut-outs for tunnel trenches, the far mountain ring, road markings and the low-detail reflection proxy.
import * as THREE from 'three/webgpu';
import { Fn, uniform, texture, vec2, vec3, vec4, float, positionLocal, positionWorld, positionView, attribute, smoothstep, mix, max, sqrt, fract, sin, abs, fwidth, dFdx, dFdy, transformNormalToView, faceDirection, length, normalize, clamp, vertexColor, uniformArray, Loop, int, If, Discard } from 'three/tsl';

const C = 64;

export const DEFAULT_PALETTE = {
  layers: {
    floor: { color: [0.3, 0.225, 0.145], color2: [0.22, 0.165, 0.105], rough: 0.93 },
    grass: { color: [0.25, 0.21, 0.11], color2: [0.16, 0.15, 0.075], rough: 0.95, amount: 0.45 },
    rock: { color: [0.2, 0.155, 0.12], color2: [0.12, 0.095, 0.08], rough: 0.86 },
    high: { color: [0.15, 0.13, 0.085], color2: [0.1, 0.09, 0.06], rough: 0.92 },
    wash: { color: [0.6, 0.5, 0.36], color2: [0.48, 0.4, 0.29], rough: 0.95 },
    road: { color: [0.075, 0.075, 0.08], rough: 0.8, amount: 1, lines: 1 },
  },
  wet: 0,
  emissive: { color: [1, 0.3, 0.05], amount: 0, cracks: 1 },
  snow: { color: [0.85, 0.87, 0.92], line: 950, amount: 0.8 },
};

function setCol(u, v, scale = 1) {
  if (!v) return;
  if (typeof v === 'string') u.value.setStyle(v); else u.value.setRGB(v[0], v[1], v[2]);
  if (scale !== 1) u.value.multiplyScalar(scale);
}

function noiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const lattice = (seed, p) => { const g = new Float32Array(p * p); let s = seed; for (let i = 0; i < g.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; g[i] = s / 4294967296; } return g; };
  const val = (g, p, x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi; const a = g[(yi % p) * p + (xi % p)], b = g[(yi % p) * p + ((xi + 1) % p)], c = g[((yi + 1) % p) * p + (xi % p)], d = g[((yi + 1) % p) * p + ((xi + 1) % p)]; const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; };
  const chans = [[11, [8, 16, 32, 64]], [29, [6, 12, 24, 48]], [47, [10, 20, 40]], [83, [4, 8, 16]]];
  for (let c = 0; c < 4; c++) {
    const [seed, periods] = chans[c];
    const grids = periods.map((p, i) => lattice(seed + i * 101, p));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let s = 0, n = 0, a = 1;
      periods.forEach((p, i) => { s += a * val(grids[i], p, x * p / size, y * p / size); n += a; a *= 0.55; });
      const v = Math.min(1, Math.max(0, (s / n - 0.5) * 1.9 + 0.5));
      data[(y * size + x) * 4 + c] = Math.round(v * 255);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

function dataTex(arr, n, format, mips) {
  const t = new THREE.DataTexture(arr, n, n, format, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.generateMipmaps = !!mips;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

export class TerrainView {
  constructor(gfx, T, sky, opts = {}) {
    this.gfx = gfx; this.T = T; this.D = T.D;
    this.C = opts.chunk || C;
    this.N = T.N; this.CELL = T.CELL; this.ORIGIN = T.ORIGIN; this.EXTENT = T.EXTENT; this.TN = T.TN; this.TCELL = T.TCELL;
    this.LEVELS = Math.round(Math.log2(T.EXTENT / (this.C * T.CELL))) + 1; this.ROOT = this.LEVELS - 1;
    this.exclude = opts.exclude || null; this.rangeBase = opts.rangeBase || 200; this.roads = opts.roads || this.D.roads;
    this.lightF = opts.lightF || 2; this.lightN = (T.N - 1) / this.lightF + 1; this.lightCell = T.CELL * this.lightF;
    this.root = new THREE.Group(); this.root.name = opts.name || 'Valley';
    gfx.scene.add(this.root);
    this.uCam = uniform(new THREE.Vector3());
    this.camPos = new THREE.Vector3();
    this.haze = sky && sky.u && sky.u.haze ? sky.u.haze : uniform(new THREE.Color(0.7, 0.78, 0.88));
    this.lodScale = opts.lodScale || 1;
    this.setRanges();
    this.index = this.buildIndex();
    this.cache = new Map();
    this.queue = new Map();
    this.drawn = new Set();
    this.frustum = new THREE.Frustum(); this.projScreen = new THREE.Matrix4();
    this.stats = { chunks: 0, tris: 0, built: 0 };
    this.buildMinMax();
    this.nrmTex = dataTex(T.NRM, this.TN, THREE.RGFormat, true);
    this.surfTex = dataTex(T.S, this.TN, THREE.RGBAFormat, true);
    this.roadTex = dataTex(T.R, this.TN, THREE.RGBAFormat, false);
    this.light = new Uint8Array(this.lightN * this.lightN * 2).fill(255);
    this.lightTex = dataTex(this.light, this.lightN, THREE.RGFormat, true);
    this.noise = opts.noise || noiseTexture();
    this.U = opts.U || this.makeUniforms();
    this.cuts = opts.cuts || null; this.waterCut = !!opts.waterCut;
    this.quality = opts.quality || 'high';
    this.mat = this.makeMaterial(this.quality);
    this.farMat = this.makeFarMaterial();
    this.farRing = opts.farRing !== false;
    if (this.farRing) this.buildFarRing(opts.farOut || 6200);
    this.markings = this.buildMarkings();
    if (opts.proxy !== false) { this.proxy = this.buildProxy(); sky.addEnvProxy(this.proxy); }
    const ROOT = this.ROOT;
    for (let L = ROOT; L >= Math.max(0, ROOT - 2); L--) { const n = 1 << (ROOT - L); for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) if (!this.excluded(L, x, z)) this.get(L, x, z, true); }
    this.roadMode = { loop: 1, track: 1 };
    this.setPalette(DEFAULT_PALETTE);
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.mats = this.mats || { [this.quality]: this.mat };
    this.quality = q;
    this.mat = this.mats[q] || (this.mats[q] = this.makeMaterial(q));
    for (const e of this.cache.values()) e.mesh.material = this.mat;
  }

  setRanges() { this.R = []; for (let L = 0; L < this.LEVELS; L++) this.R.push(this.rangeBase * this.lodScale * (1 << L)); }

  overlap(L, cx, cz) {
    const E = this.exclude; if (!E) return 0;
    const size = (this.C * this.CELL) << L, x0 = this.ORIGIN + cx * size, z0 = this.ORIGIN + cz * size, x1 = x0 + size, z1 = z0 + size;
    if (x1 <= E[0] || x0 >= E[2] || z1 <= E[1] || z0 >= E[3]) return 0;
    return x0 >= E[0] && x1 <= E[2] && z0 >= E[1] && z1 <= E[3] ? 2 : 1;
  }

  excluded(L, cx, cz) { return this.overlap(L, cx, cz) === 2; }
  setLodScale(s) { if (s === this.lodScale) return; this.lodScale = s; this.setRanges(); this.invalidate(); }

  buildIndex() {
    const idx = [], V = this.C + 1;
    for (let i = 0; i < this.C; i++) for (let j = 0; j < this.C; j++) { const a = i * V + j, b = a + 1, c = a + V, d = c + 1; idx.push(a, c, b, b, c, d); }
    const base = V * V;
    const edges = [(k) => k, (k) => this.C * V + k, (k) => k * V, (k) => k * V + this.C];
    edges.forEach((f, e) => {
      for (let k = 0; k < this.C; k++) { const a = f(k), b = f(k + 1), sa = base + e * V + k, sb = sa + 1; idx.push(a, sa, b, b, sa, sb, a, b, sa, b, sb, sa); }
    });
    this.vertCount = base + 4 * V;
    return new THREE.BufferAttribute(new Uint16Array(idx), 1);
  }

  buildMinMax() {
    const H = this.T.H, ROOT = this.ROOT, N = this.N, n0 = 1 << ROOT;
    this.mm = [];
    const a0 = new Float32Array(n0 * n0 * 2);
    for (let cz = 0; cz < n0; cz++) for (let cx = 0; cx < n0; cx++) {
      let mn = 1e9, mx = -1e9;
      for (let i = cz * this.C; i <= cz * this.C + this.C; i++) for (let j = cx * this.C; j <= cx * this.C + this.C; j++) { const v = H[i * N + j]; if (v < mn) mn = v; if (v > mx) mx = v; }
      a0[(cz * n0 + cx) * 2] = mn; a0[(cz * n0 + cx) * 2 + 1] = mx;
    }
    this.mm[0] = a0;
    for (let L = 1; L < this.LEVELS; L++) {
      const n = 1 << (ROOT - L), prev = this.mm[L - 1], pn = n * 2, a = new Float32Array(n * n * 2);
      for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) {
        let mn = 1e9, mx = -1e9;
        for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) { const o = ((cz * 2 + dz) * pn + cx * 2 + dx) * 2; mn = Math.min(mn, prev[o]); mx = Math.max(mx, prev[o + 1]); }
        a[(cz * n + cx) * 2] = mn; a[(cz * n + cx) * 2 + 1] = mx;
      }
      this.mm[L] = a;
    }
  }

  box(L, cx, cz, out) {
    const size = (this.C * this.CELL) << L, n = 1 << (this.ROOT - L), o = (cz * n + cx) * 2, O = this.ORIGIN;
    out.min.set(O + cx * size, this.mm[L][o] - 6 - size / 64, O + cz * size);
    out.max.set(O + (cx + 1) * size, this.mm[L][o + 1] + 1, O + (cz + 1) * size);
    return out;
  }

  buildChunk(L, cx, cz) {
    const H = this.T.H, N = this.N, CELL = this.CELL, ORIGIN = this.ORIGIN, ROOT = this.ROOT, V = this.C + 1, g = 1 << L, size = (this.C * CELL) << L, step = size / this.C;
    const i0 = cz * this.C * g, j0 = cx * this.C * g;
    const pos = new Float32Array(this.vertCount * 3), mo = new Float32Array(this.vertCount * 3);
    const r1 = this.R[L] * 0.97, r0 = this.R[L] * 0.68;
    const hAt = (i, j) => H[(i0 + i * g) * N + j0 + j * g];
    const skirt = 4 + step * 0.6;
    for (let i = 0; i <= this.C; i++) {
      for (let j = 0; j <= this.C; j++) {
        const h = hAt(i, j);
        let hc = h;
        if (L < ROOT) {
          const oi = i & 1, oj = j & 1;
          if (oi && oj) hc = (hAt(i - 1, j + 1) + hAt(i + 1, j - 1)) / 2;
          else if (oj) hc = (hAt(i, j - 1) + hAt(i, j + 1)) / 2;
          else if (oi) hc = (hAt(i - 1, j) + hAt(i + 1, j)) / 2;
        }
        const v = i * V + j;
        pos[v * 3] = ORIGIN + (j0 + j * g) * CELL; pos[v * 3 + 1] = h; pos[v * 3 + 2] = ORIGIN + (i0 + i * g) * CELL;
        mo[v * 3] = hc - h; mo[v * 3 + 1] = r0; mo[v * 3 + 2] = r1;
      }
    }
    const base = V * V;
    const edges = [(k) => k, (k) => this.C * V + k, (k) => k * V, (k) => k * V + this.C];
    edges.forEach((f, e) => {
      for (let k = 0; k <= this.C; k++) {
        const s = f(k), d = base + e * V + k;
        pos[d * 3] = pos[s * 3]; pos[d * 3 + 1] = pos[s * 3 + 1] - skirt; pos[d * 3 + 2] = pos[s * 3 + 2];
        mo[d * 3] = mo[s * 3]; mo[d * 3 + 1] = r0; mo[d * 3 + 2] = r1;
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('morph', new THREE.BufferAttribute(mo, 3));
    geo.setIndex(this.index);
    const b = this.box(L, cx, cz, new THREE.Box3());
    b.min.y -= skirt;
    geo.boundingBox = b; geo.boundingSphere = b.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.matrixAutoUpdate = false; mesh.receiveShadow = true; mesh.castShadow = L <= 1; mesh.visible = false;
    mesh.userData.k = 'terrain'; mesh.userData.L = L;
    this.root.add(mesh);
    this.stats.built++;
    return mesh;
  }

  key(L, cx, cz) { return (L << 20) | (cz << 10) | cx; }

  get(L, cx, cz, build) {
    const k = this.key(L, cx, cz);
    let e = this.cache.get(k);
    if (!e && build) { e = { mesh: this.buildChunk(L, cx, cz), used: 0, L }; this.cache.set(k, e); }
    return e;
  }

  invalidate() {
    for (const [k, e] of this.cache) {
      this.root.remove(e.mesh); e.mesh.geometry.dispose();
      if (e.L >= this.ROOT - 2) e.mesh = this.buildChunk(e.L, k & 1023, (k >> 10) & 1023); else this.cache.delete(k);
    }
    this.drawn.clear(); this.queue.clear(); this.urgent = true;
  }

  refresh() {
    this.buildMinMax();
    this.nrmTex.needsUpdate = true; this.surfTex.needsUpdate = true; this.roadTex.needsUpdate = true;
    this.invalidate();
    this.rebuildMarkings();
    this.refreshFar();
    if (this.proxyMesh) this.colorProxy();
  }

  setLight(ao, sun) {
    const L = this.light, nn = this.lightN * this.lightN;
    if (ao) for (let i = 0; i < nn; i++) L[i * 2] = ao[i];
    if (sun) for (let i = 0; i < nn; i++) L[i * 2 + 1] = sun[i];
    this.lightTex.needsUpdate = true;
  }

  update(camera) {
    const cam = this.camPos.copy(camera.position);
    this.uCam.value.copy(cam);
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen, camera.coordinateSystem);
    this.frame = (this.frame || 0) + 1;
    this._b = this._b || new THREE.Box3();
    let list = [];
    const t0 = performance.now();
    for (let pass = 0; pass < (this.urgent ? 8 : 1); pass++) {
      list = []; this.queue.clear();
      this.collect(this.ROOT, 0, 0, list);
      if (!this.queue.size) break;
      const want = [...this.queue.values()].sort((a, b) => a.d - b.d);
      for (let i = 0; i < want.length; i++) {
        if (!this.urgent && (i >= 6 || performance.now() - t0 > 3)) break;
        this.get(want[i].L, want[i].cx, want[i].cz, true);
      }
    }
    if (this.urgent) { this.urgent = false; list = []; this.queue.clear(); this.collect(this.ROOT, 0, 0, list); }
    const now = new Set();
    for (const e of list) { now.add(e); e.used = this.frame; e.mesh.visible = true; }
    for (const e of this.drawn) if (!now.has(e)) e.mesh.visible = false;
    this.drawn = now;
    this.stats.chunks = list.length; this.stats.tris = list.length * this.C * this.C * 2;
    if (this.cache.size > 260) {
      const old = [...this.cache.entries()].filter(([, e]) => e.L < this.ROOT - 2 && e.used < this.frame - 120).sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < old.length && this.cache.size > 200; i++) { const [k, e] = old[i]; this.root.remove(e.mesh); e.mesh.geometry.dispose(); this.cache.delete(k); }
    }
    this.queue.clear();
  }

  collect(L, cx, cz, out) {
    const ov = this.overlap(L, cx, cz);
    if (ov === 2) return;
    const b = this.box(L, cx, cz, this._b);
    const d = b.distanceToPoint(this.camPos);
    if (d > 160 && !this.frustum.intersectsBox(b)) return;
    const node = ov ? null : this.get(L, cx, cz, false);
    if (L > 0 && (d < this.R[L - 1] || ov)) {
      let ready = true;
      const kids = [];
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
        const kx = cx * 2 + dx, kz = cz * 2 + dz;
        const kb = this.box(L - 1, kx, kz, this._kb || (this._kb = new THREE.Box3()));
        const kd = kb.distanceToPoint(this.camPos);
        if (this.overlap(L - 1, kx, kz) === 2) continue;
        if (kd > 160 && !this.frustum.intersectsBox(kb)) continue;
        kids.push([kx, kz]);
        if (this.overlap(L - 1, kx, kz) === 1) continue;
        if (!this.cache.has(this.key(L - 1, kx, kz))) { ready = false; this.queue.set(this.key(L - 1, kx, kz), { L: L - 1, cx: kx, cz: kz, d: kd }); }
      }
      if (ready || !node) { for (const [kx, kz] of kids) if (this.cache.has(this.key(L - 1, kx, kz))) this.collect(L - 1, kx, kz, out); return; }
    }
    if (node) out.push(node);
  }

  makeUniforms() {
    const U = {};
    for (const L of ['ground', 'grass', 'rock', 'high', 'sand', 'lakebed', 'road']) U[L] = { c1: uniform(new THREE.Color()), c2: uniform(new THREE.Color()), rough: uniform(0.9) };
    U.track = uniform(new THREE.Color()); U.snow = uniform(new THREE.Color());
    U.snowLine = uniform(950); U.snowAmount = uniform(0); U.grassAmount = uniform(0.5); U.wet = uniform(0);
    U.emColor = uniform(new THREE.Color(1, 0.3, 0.05)); U.emAmount = uniform(0); U.emCracks = uniform(1);
    U.rMain = uniform(1); U.rLoop = uniform(1); U.rTrack = uniform(1); U.rTown = uniform(1);
    return U;
  }

  setRoadMode(m) { this.roadMode = { ...this.roadMode, ...m }; if (this.palette) this.setPalette(this.palette); }

  setPalette(p) {
    const D = DEFAULT_PALETTE, Ly = (p && p.layers) || {};
    const lay = (k) => ({ ...D.layers[k], ...(Ly[k] || {}) });
    const floor = lay('floor'), grass = lay('grass'), rock = lay('rock'), high = lay('high'), wash = lay('wash'), road = lay('road');
    const U = this.U;
    const put = (u, l, k2 = 1) => { setCol(u.c1, l.color); setCol(u.c2, l.color2 || l.color, l.color2 ? 1 : k2); if (l.rough !== undefined) u.rough.value = l.rough; };
    put(U.ground, floor); put(U.grass, grass); put(U.rock, rock); put(U.high, high); put(U.sand, wash); put(U.road, road, 1.3);
    setCol(U.lakebed.c1, wash.color, 1.12); setCol(U.lakebed.c2, wash.color2 || wash.color, 1.05); U.lakebed.rough.value = Math.max(0.6, (wash.rough || 0.9) - 0.04);
    U.track.value.copy(U.ground.c1.value).multiplyScalar(0.72).lerp(U.sand.c1.value, 0.18);
    U.grassAmount.value = grass.amount !== undefined ? grass.amount : 0.45;
    U.wet.value = (p && p.wet) || 0;
    const em = { ...D.emissive, ...((p && p.emissive) || {}) };
    setCol(U.emColor, em.color); U.emAmount.value = em.amount || 0; U.emCracks.value = em.cracks === undefined ? 1 : em.cracks;
    const sn = { ...D.snow, ...((p && p.snow) || {}) };
    setCol(U.snow, sn.color); U.snowLine.value = sn.line; U.snowAmount.value = sn.amount;
    const amt = road.amount === undefined ? 1 : road.amount, vis = Math.min(1, amt * 2);
    U.rMain.value = vis; U.rTown.value = vis * 0.85; U.rLoop.value = vis * this.roadMode.loop; U.rTrack.value = (amt > 0 ? 1 : 0) * this.roadMode.track;
    this.roadAmount = amt;
    if (this.markings) this.markings.visible = (road.lines === undefined ? amt > 0.85 : road.lines > 0.5) && amt > 0.5;
    this.palette = p;
    if (this.proxy) this.colorProxy();
  }

  makeMaterial(q) {
    const hq = q !== 'low';
    const U = this.U, m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    m.name = 'Terrain';
    const mo = attribute('morph', 'vec3');
    const k = smoothstep(mo.y, mo.z, length(positionLocal.sub(this.uCam)));
    m.positionNode = positionLocal.add(vec3(0, mo.x.mul(k), 0));
    const wxz = positionWorld.xz, wy = positionWorld.y;
    const tuv = wxz.sub(this.ORIGIN).div(this.TCELL).add(0.5).div(this.TN), luv = wxz.sub(this.ORIGIN).div(this.lightCell).add(0.5).div(this.lightN);
    const nt = texture(this.nrmTex, tuv), lt = texture(this.lightTex, luv);
    const nx = nt.r.mul(2).sub(1), nz = nt.g.mul(2).sub(1);
    const ny = sqrt(max(float(0.0004), float(1).sub(nx.mul(nx)).sub(nz.mul(nz))));
    const sf = texture(this.surfTex, tuv), rd = texture(this.roadTex, tuv);
    const nBig = texture(this.noise, wxz.div(330)), nMid = texture(this.noise, wxz.div(47)), nSm = texture(this.noise, wxz.div(6.3)), nFine = hq ? texture(this.noise, wxz.div(0.83)) : nSm;
    const slope = float(1).sub(ny);
    const edge = (v) => { const w = max(fwidth(v), 0.006); return smoothstep(float(0.5).sub(w), float(0.5).add(w), v); };
    const rockW = max(smoothstep(0.3, 0.44, slope.add(nMid.r.sub(0.5).mul(0.18))), sf.b.mul(smoothstep(0.05, 0.2, slope.add(nMid.g.sub(0.5).mul(0.22)))).mul(smoothstep(0.35, 0.6, sf.b.add(nBig.r.sub(0.5).mul(0.4))))).toVar();
    const sandW = smoothstep(0.25, 0.7, sf.r.add(nSm.b.sub(0.5).mul(0.25))).toVar();
    const washW = edge(sf.a.add(nSm.g.sub(0.5).mul(0.06))).toVar();
    const lakeW = smoothstep(0.25, 0.75, sf.g.add(nMid.b.sub(0.5).mul(0.3))).toVar();
    const flat = float(1).sub(smoothstep(0.1, 0.26, slope));
    const highW = smoothstep(70, 210, wy.add(nBig.r.sub(0.5).mul(90))).mul(float(1).sub(rockW.mul(0.7))).toVar();
    const grassW = smoothstep(0.55, 0.75, nMid.a.mul(0.55).add(nBig.g.mul(0.45)).add(U.grassAmount.sub(0.5).mul(0.7))).mul(flat).mul(float(1).sub(sandW)).mul(float(1).sub(lakeW)).toVar();
    const roadW = max(edge(rd.r).mul(U.rMain), edge(rd.g).mul(U.rLoop)).toVar();
    const townW = edge(rd.a).mul(U.rTown).mul(float(1).sub(roadW)).toVar();
    const trackW = edge(rd.b.add(nSm.r.sub(0.5).mul(0.035))).mul(U.rTrack).mul(float(1).sub(roadW)).toVar();
    const lay = (L, t) => mix(U[L].c1, U[L].c2, t);
    const groundC = lay('ground', nBig.g.mul(0.55).add(nMid.r.mul(0.45))).mul(nSm.g.mul(0.26).add(0.87));
    const grassC = lay('grass', nMid.b).mul(nFine.r.mul(0.35).add(0.8));
    const strata = fract(wy.mul(0.085).add(nBig.b.mul(2.5)).add(nMid.a.mul(0.6)));
    const band = smoothstep(0.35, 0.5, strata).mul(float(1).sub(smoothstep(0.8, 0.95, strata))).toVar();
    const side = abs(nx).div(abs(nx).add(abs(nz)).add(1e-4));
    const wallK = smoothstep(0.35, 0.6, slope);
    const vSm = hq ? mix(texture(this.noise, vec2(positionWorld.x, wy).div(6.3)), texture(this.noise, vec2(positionWorld.z, wy).div(6.3)), side) : texture(this.noise, vec2(positionWorld.x.add(positionWorld.z), wy).div(6.3));
    const vMid = hq ? mix(texture(this.noise, vec2(positionWorld.x, wy).div(31)), texture(this.noise, vec2(positionWorld.z, wy).div(31)), side) : nMid;
    const rSm = mix(nSm, vSm, wallK).toVar(), rMid = mix(nMid, vMid, wallK).toVar();
    const rockC = lay('rock', band.mul(0.45).add(rSm.a.mul(0.35)).add(rMid.g.mul(0.2))).mul(rSm.r.mul(0.32).add(0.8)).mul(rMid.b.mul(0.25).add(0.86));
    const highC = lay('high', nMid.g.mul(0.6).add(nSm.b.mul(0.4))).mul(nFine.g.mul(0.2).add(0.9));
    const sandC = lay('sand', nMid.g.mul(0.7).add(nSm.r.mul(0.3)));
    const washC = mix(sandC, groundC, 0.45).mul(nSm.b.mul(0.2).add(0.86));
    const crack = float(1).sub(smoothstep(0.0, 0.035, abs(nSm.b.sub(0.5)))).mul(0.6).toVar();
    const lakeC = lay('lakebed', nBig.a.mul(0.6).add(nMid.g.mul(0.4))).mul(float(1).sub(crack.mul(0.35)));
    const roadC = lay('road', nSm.b.mul(0.6).add(nBig.r.mul(0.4))).mul(nFine.g.mul(0.22).add(0.89));
    const trackC = U.track.mul(nSm.r.mul(0.25).add(0.86));
    const townC = mix(trackC, roadC, 0.35).mul(nMid.r.mul(0.15).add(0.92));
    const snowW = smoothstep(U.snowLine, U.snowLine.add(90), wy.add(nMid.r.mul(120))).mul(float(1).sub(smoothstep(0.45, 0.7, slope))).mul(U.snowAmount).toVar();
    let col = groundC;
    col = mix(col, grassC, grassW);
    col = mix(col, highC, highW);
    col = mix(col, sandC, sandW);
    col = mix(col, washC, washW.mul(float(1).sub(sandW)));
    col = mix(col, lakeC, lakeW);
    col = mix(col, rockC, rockW.mul(float(1).sub(lakeW)));
    col = mix(col, trackC, trackW);
    col = mix(col, townC, townW);
    col = mix(col, roadC, roadW);
    col = mix(col, U.snow, snowW);
    const wetK = U.wet.mul(float(1).sub(rockW.mul(0.6))).toVar();
    m.colorNode = col.mul(float(1).sub(wetK.mul(0.38)));
    let rough = U.ground.rough;
    rough = mix(rough, U.grass.rough, grassW); rough = mix(rough, U.high.rough, highW); rough = mix(rough, U.sand.rough, sandW); rough = mix(rough, U.lakebed.rough, lakeW);
    rough = mix(rough, U.rock.rough, rockW); rough = mix(rough, U.road.rough, max(roadW, townW.mul(0.5))); rough = mix(rough, float(0.6), snowW);
    m.roughnessNode = clamp(rough.sub(wetK.mul(0.45)).add(nFine.b.sub(0.5).mul(0.06)), 0.05, 1);
    const aaLine = (n, w) => { const fw = fwidth(n).max(1e-4); return float(1).sub(smoothstep(0.0, fw.add(w), abs(n.sub(0.5)))).mul(float(w).div(fw.add(w))); };
    const lines = max(aaLine(nMid.b, 0.03), aaLine(nSm.b, 0.022).mul(0.6));
    const low = float(1).sub(smoothstep(6, 46, wy)).max(lakeW).max(washW.mul(0.8)).mul(float(1).sub(roadW));
    m.emissiveNode = U.emColor.mul(U.emAmount).mul(low).mul(mix(float(1), lines, U.emCracks)).mul(nBig.g.mul(0.9).add(0.5)).mul(float(1).sub(snowW));
    const ripple = sin(wxz.x.mul(1.9).add(wxz.y.mul(0.7)).add(nMid.r.mul(9))).mul(0.5).add(0.5);
    let hb = nSm.r.mul(0.5).add(nFine.g.mul(0.5));
    hb = mix(hb, nFine.b.mul(0.8), grassW);
    hb = mix(hb, ripple.mul(0.36).add(nFine.r.mul(0.12)), sandW);
    hb = mix(hb, crack.mul(-0.4).add(nFine.a.mul(0.1)), lakeW);
    hb = mix(hb, rSm.a.mul(1.1).add(rMid.r.mul(0.7)).add(band.mul(0.8)), rockW);
    hb = mix(hb, nFine.g.mul(0.04), max(roadW, trackW.mul(0.6)));
    hb = mix(hb, float(0), snowW.mul(0.8));
    const hbv = hb.toVar();
    const Nv = transformNormalToView(vec3(nx, ny, nz)).toVar();
    const pv = positionView;
    m.normalNode = !hq ? Nv : Fn(() => {
      const dh = vec2(dFdx(hbv), dFdy(hbv)).mul(0.055);
      const sx = normalize(dFdx(pv)), sy = normalize(dFdy(pv));
      const r1 = sy.cross(Nv), r2 = Nv.cross(sx);
      const det = sx.dot(r1).mul(faceDirection);
      const grad = det.sign().mul(dh.x.mul(r1).add(dh.y.mul(r2)));
      return det.abs().mul(Nv).sub(grad).normalize();
    })();
    m.aoNode = lt.r.mul(0.6).add(0.4);
    const sunVis = lt.g;
    m.receivedShadowNode = Fn(([s]) => s.mul(sunVis));
    const waterKeep = this.waterCut ? sf.a.lessThan(0.92).or(wy.lessThan(-0.4)) : null;
    if (this.cuts && this.cuts.count) {
      const cuts = this.cuts;
      m.maskNode = Fn(() => {
        const keep = float(1).toVar();
        Loop({ start: int(0), end: int(cuts.count), type: 'int', condition: '<' }, ({ i }) => {
          const a = cuts.a.element(i), b = cuts.b.element(i);
          const d = wxz.sub(a.xy), u = d.dot(a.zw), v = d.dot(vec2(a.w.negate(), a.z));
          const inside = u.greaterThan(0).and(u.lessThan(b.x)).and(v.abs().lessThan(b.y)).and(wy.lessThan(b.z));
          keep.assign(mix(keep, float(0), inside.select(float(1), float(0))));
        });
        return waterKeep ? keep.greaterThan(0.5).and(waterKeep) : keep.greaterThan(0.5);
      })();
    } else if (waterKeep) m.maskNode = waterKeep;
    return m;
  }

  makeFarMaterial() {
    const U = this.U, m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    m.name = 'TerrainFar';
    const wp = positionWorld;
    const n1 = texture(this.noise, wp.xz.div(900)), n2 = texture(this.noise, wp.xz.div(140));
    const ny = attribute('normal', 'vec3').y;
    const slope = float(1).sub(ny);
    const rockW = smoothstep(0.1, 0.32, slope.add(n2.r.sub(0.5).mul(0.3)));
    const strata = fract(wp.y.mul(0.03).add(n1.b.mul(2)));
    const ground = mix(U.ground.c1, U.ground.c2, n1.g).mul(n2.g.mul(0.2).add(0.9));
    const high = mix(U.high.c1, U.high.c2, n2.b);
    const rock = mix(U.rock.c1, U.rock.c2, smoothstep(0.3, 0.7, strata).mul(0.5).add(n2.a.mul(0.5)));
    let col = mix(ground, high, smoothstep(80, 260, wp.y.add(n1.r.sub(0.5).mul(160))));
    col = mix(col, rock, rockW);
    const snowW = smoothstep(U.snowLine, U.snowLine.add(160), wp.y.add(n2.r.mul(200))).mul(float(1).sub(smoothstep(0.55, 0.8, slope))).mul(U.snowAmount);
    const air = float(1).sub(length(wp.sub(this.uCam)).div(-5200).exp()).mul(0.55);
    m.colorNode = mix(col, U.snow, snowW).mul(float(1).sub(air));
    m.emissiveNode = U.emColor.mul(U.emAmount).mul(0.05).mul(float(1).sub(smoothstep(20, 120, wp.y))).add(vec3(this.haze).mul(air));
    return m;
  }

  buildFarRing(rOut = 6200) {
    const T = this.T, half = -this.ORIGIN, M = 512, K = 48, rimStart = half + (rOut - half) * 0.3;
    const pts = [];
    for (let s = 0; s < M; s++) {
      const u = (s / M) * 4, side = Math.floor(u), f = u - side, e = -half + f * 2 * half;
      pts.push(side === 0 ? [e, -half] : side === 1 ? [half, e] : side === 2 ? [-e, half] : [-half, -e]);
    }
    const pos = [], idx = [];
    for (let s = 0; s < M; s++) {
      const [x0, z0] = pts[s], a = Math.atan2(z0, x0), l0 = Math.hypot(x0, z0);
      for (let k = 0; k <= K; k++) {
        const t = Math.pow(k / K, 1.7), r = l0 + (rOut - l0) * t;
        const x = k === 0 ? x0 : Math.cos(a) * r, z = k === 0 ? z0 : Math.sin(a) * r;
        const rim = 180 * Math.pow(Math.max(0, (r - rimStart) / (rOut - rimStart)), 1.5);
        pos.push(x, k === 0 ? T.hAt(x, z) : T.heightAt(x, z) + rim, z);
      }
    }
    const R = K + 1;
    for (let s = 0; s < M; s++) { const s1 = (s + 1) % M; for (let k = 0; k < K; k++) { const a = s * R + k, b = s1 * R + k, c = a + 1, d = b + 1; idx.push(a, c, b, b, c, d); } }
    const skirtBase = pos.length / 3;
    for (let s = 0; s < M; s++) pos.push(pos[s * R * 3], pos[s * R * 3 + 1] - 40, pos[s * R * 3 + 2]);
    for (let s = 0; s < M; s++) { const s1 = (s + 1) % M, a = s * R, b = s1 * R, sa = skirtBase + s, sb = skirtBase + s1; idx.push(a, b, sa, b, sb, sa, a, sa, b, b, sa, sb); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.farMat);
    mesh.matrixAutoUpdate = false; mesh.receiveShadow = false; mesh.castShadow = false; mesh.userData.k = 'farRing'; mesh.frustumCulled = false;
    this.root.add(mesh);
    this.far = mesh; this.farGeo = g; this.farR = R; this.farM = M;
  }

  buildMarkings() {
    const T = this.T, pos = [], col = [], idx = [];
    const Y = [0.95, 0.66, 0.1], W = [0.9, 0.9, 0.88];
    const skip = (r, x) => r.kind === 'street' && x > -916;
    const lim = -this.ORIGIN - 2, E = this.exclude;
    for (const r of this.roads) {
      if (!r.markings.length) continue;
      const n = r.pts.length, segN = r.closed ? n : n - 1, total = segN * 4;
      for (const mk of r.markings) {
        const dash = mk.dash, c = mk.c === 'y' ? Y : W;
        let prev = null;
        for (let s = 0; s <= total; s += 2) {
          const f = s / 4, k = Math.min(segN - 1, Math.floor(f)), t = f - k, k1 = (k + 1) % n;
          const a = r.pts[k], b = r.pts[k1];
          const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
          const tx = r.tx[k] + (r.tx[k1] - r.tx[k]) * t, tz = r.tz[k] + (r.tz[k1] - r.tz[k]) * t, tl = Math.hypot(tx, tz) || 1;
          const nx = tz / tl, nz = -tx / tl;
          const px = x + nx * mk.off, pz = z + nz * mk.off;
          const on = (!dash || (s % (dash[0] + dash[1])) < dash[0]) && !skip(r, px) && Math.abs(px) < lim && Math.abs(pz) < lim && !(E && px > E[0] && px < E[2] && pz > E[1] && pz < E[3]);
          if (!on) { prev = null; continue; }
          const hw = mk.w / 2, v = pos.length / 3;
          for (const sgn of [-1, 1]) { const qx = px + nx * hw * sgn, qz = pz + nz * hw * sgn; pos.push(qx, T.hAt(qx, qz) + 0.03, qz); col.push(...c); }
          if (prev !== null) idx.push(prev, v, prev + 1, v, v + 1, prev + 1);
          prev = v;
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    m.name = 'RoadMarkings';
    m.colorNode = vertexColor().mul(texture(this.noise, positionWorld.xz.div(3.1)).g.mul(0.2).add(0.85));
    m.maskNode = length(positionWorld.sub(this.uCam)).lessThan(360);
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.userData.k = 'markings';
    this.root.add(mesh);
    return mesh;
  }

  rebuildMarkings() {
    const vis = this.markings.visible;
    this.root.remove(this.markings); this.markings.geometry.dispose();
    this.markings = this.buildMarkings(); this.markings.visible = vis && !this.T.natural;
  }

  buildProxy() {
    const T = this.T, n = 96, step = this.EXTENT / n, pos = [], idx = [];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { const x = this.ORIGIN + j * step, z = this.ORIGIN + i * step; pos.push(x, T.hAt(x, z), z); }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    g.setIndex(idx); g.computeVertexNormals();
    const grp = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.proxyMesh = new THREE.Mesh(g, m);
    grp.add(this.proxyMesh);
    if (this.farGeo) {
      const fg = this.farGeo.clone();
      fg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(fg.attributes.position.count * 3), 3));
      this.proxyFar = new THREE.Mesh(fg, m);
      grp.add(this.proxyFar);
    }
    return grp;
  }

  colorProxy() {
    const T = this.T, U = this.U;
    const c1 = U.ground.c1.value, rock = U.rock.c1.value, sand = U.sand.c1.value, lake = U.lakebed.c1.value, road = U.road.c1.value, snow = U.snow.value, high = U.high.c1.value;
    const sl = U.snowLine.value, sa = U.snowAmount.value, rm = U.rMain.value;
    const paint = (geo, masks) => {
      const p = geo.attributes.position, nrm = geo.attributes.normal, c = geo.attributes.color, tmp = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = nrm.getY(i);
        tmp.copy(c1);
        tmp.lerp(high, Math.min(1, Math.max(0, (y - 70) / 140)));
        if (masks && Math.abs(x) < -this.ORIGIN - 2 && Math.abs(z) < -this.ORIGIN - 2) {
          tmp.lerp(sand, T.tex(T.S, x, z, 0)); tmp.lerp(lake, T.tex(T.S, x, z, 1));
          if (!T.natural && Math.max(T.tex(T.R, x, z, 0), T.tex(T.R, x, z, 1)) > 0.5) tmp.lerp(road, 0.6 * rm);
        }
        tmp.lerp(rock, Math.min(1, Math.max(0, (1 - ny - 0.15) * 3)));
        if (y > sl) tmp.lerp(snow, Math.min(1, (y - sl) / 150) * sa);
        c.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }
      c.needsUpdate = true;
    };
    paint(this.proxyMesh.geometry, true);
    if (this.proxyFar) paint(this.proxyFar.geometry, false);
  }

  refreshFar() {
    if (this.farGeo) {
      const T = this.T, p = this.farGeo.attributes.position, R = this.farR, M = this.farM;
      for (let s = 0; s < M; s++) { const i = s * R; p.setY(i, T.hAt(p.getX(i), p.getZ(i))); }
      p.needsUpdate = true;
    }
    if (!this.proxyMesh) return;
    const T = this.T, g = this.proxyMesh.geometry.attributes.position;
    for (let i = 0; i < g.count; i++) g.setY(i, T.hAt(g.getX(i), g.getZ(i)));
    g.needsUpdate = true;
  }
}
