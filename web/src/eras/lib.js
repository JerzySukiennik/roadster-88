// Roadster 88 era library: deterministic random helpers, the procedural TSL materials for era structures (wood, masonry, plaster, roofing, metal, glass with night windows, lights, sci-fi ceramic, rubble) with shared weathering, and the Kit that merges primitives into one geometry per material with per-building vertex ranges.
import * as THREE from 'three/webgpu';
import { uniform, attribute, uv, vec3, vec2, float, floor, fract, step, smoothstep, mix, max, min, abs, sin, hash, positionWorld, normalWorld, mx_noise_float, mx_fractal_noise_float, bumpMap, fwidth, clamp, pow } from 'three/tsl';

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const hash2i = (x, z, k = 0) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(k | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function inPoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; }
  return c;
}

export function distToPolyline(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) best = d;
  }
  return best;
}

export const C = {
  white: [0.78, 0.76, 0.71], cream: [0.72, 0.64, 0.5], red: [0.36, 0.08, 0.05], barn: [0.33, 0.07, 0.04], ochre: [0.55, 0.38, 0.16], green: [0.12, 0.2, 0.13], blue: [0.16, 0.24, 0.32], grey: [0.36, 0.36, 0.35],
  bare: [0.34, 0.28, 0.21], darkwood: [0.16, 0.11, 0.07], brick: [0.36, 0.13, 0.08], stone: [0.42, 0.39, 0.34], adobe: [0.56, 0.42, 0.3],
  stucco: [0.72, 0.66, 0.56], stucco2: [0.64, 0.56, 0.44], concrete: [0.46, 0.45, 0.43], composite: [0.82, 0.83, 0.82], tin: [0.5, 0.5, 0.5], rust: [0.3, 0.12, 0.05], tile: [0.48, 0.17, 0.08], shingle: [0.2, 0.17, 0.14], asphaltRoof: [0.12, 0.12, 0.12],
  steel: [0.42, 0.43, 0.45], black: [0.03, 0.03, 0.03], yellow: [0.7, 0.5, 0.05],
};

function weathered(L, col, rough, opts = {}) {
  const p = positionWorld;
  const n1 = mx_noise_float(p.mul(0.31)).mul(0.5).add(0.5);
  const n2 = mx_noise_float(p.mul(1.9)).mul(0.5).add(0.5);
  const up = smoothstep(0.25, 0.85, normalWorld.y);
  const streak = mx_noise_float(vec3(p.x.mul(3.7), p.y.mul(0.18), p.z.mul(3.7))).mul(0.5).add(0.5);
  const grime = L.U.grime.mul(smoothstep(0.5, 0.95, streak)).mul(0.22);
  const mossM = L.U.moss.mul(smoothstep(0.5, 0.75, n1.mul(0.6).add(up.mul(0.45)).add(n2.mul(0.25)))).mul(opts.moss === false ? 0 : 1);
  const moss = mix(vec3(0.05, 0.08, 0.025), vec3(0.11, 0.13, 0.05), n2);
  let c = col.mul(float(1).sub(grime));
  c = mix(c, moss, mossM);
  const dust = L.U.dust.mul(up.mul(0.6).add(0.15)).mul(n1.mul(0.5).add(0.5));
  c = mix(c, vec3(0.42, 0.34, 0.23), dust.mul(0.5));
  const snowM = L.U.snow.mul(smoothstep(0.5, 0.8, normalWorld.y.add(n2.sub(0.5).mul(0.25))));
  const wetK = L.U.wet.mul(float(1).sub(snowM));
  c = mix(c.mul(float(1).sub(wetK.mul(0.3))), vec3(0.86, 0.88, 0.92), snowM);
  const r = mix(clamp(rough.add(mossM.mul(0.3)).add(grime.mul(0.2)).sub(wetK.mul(0.45)), 0.04, 1), float(0.55), snowM);
  return { c, r };
}

const H = (x) => hash(float(x).add(524288.0));

function fadeHF(coord, scale) { return float(1).sub(smoothstep(0.15, 0.5, fwidth(coord).mul(scale))); }

export class Library {
  constructor(sys) {
    this.sys = sys;
    this.U = { night: uniform(0), moss: uniform(0), grime: uniform(0), dust: uniform(0), rust: uniform(0), lights: uniform(1), lit: uniform(0.55), wet: uniform(0), snow: uniform(0) };
    this.mats = {};
    this.build();
  }

  setEra(eraId) {
    const W = { hadean: [0, 0, 0, 0, 0], dino: [0, 0, 0, 0, 0], 1885: [0, 0.25, 0.35, 0.15, 0.5], 2026: [0, 0.2, 0.05, 0.1, 0.6], 2080: [0, 0.08, 0.02, 0.0, 0.7], ruins: [0.85, 0.75, 0, 0.9, 0.0], scifi: [0, 0, 0, 0, 0.8] }[eraId] || [0, 0, 0, 0, 0.5];
    this.U.moss.value = W[0]; this.U.grime.value = W[1]; this.U.dust.value = W[2]; this.U.rust.value = W[3]; this.U.lit.value = W[4];
    this.U.lights.value = eraId === 'ruins' ? 0 : 1;
  }

  update(dt, sky) {
    this.U.night.value = THREE.MathUtils.smoothstep(sky.state.night, 0.02, 0.5);
  }

  build() {
    const L = this, U = this.U;
    const T = attribute('tint', 'vec3'), A = attribute('aux', 'vec4'), UV = uv();
    const std = (o = {}) => new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0, ...o });

    {
      const m = std();
      const pat = A.x, wear = A.y;
      const isV = step(0.5, pat).mul(step(pat, 1.5)), isD = step(1.5, pat);
      const vb = UV.y.div(0.19), row = floor(vb), fv = fract(vb);
      const ub = UV.x.div(mix(float(0.3), float(0.16), isD)), coln = floor(ub), fu = fract(ub);
      const lap = smoothstep(0.0, 0.14, fv).mul(0.3).add(0.7);
      const bat = smoothstep(0.0, 0.07, fu).mul(smoothstep(0.0, 0.07, float(1).sub(fu))).mul(0.3).add(0.7);
      const id = mix(row, coln, max(isV, isD));
      const hv = H(id.add(T.x.mul(97.0)).add(T.z.mul(31.0)));
      const gr = mx_noise_float(vec3(mix(UV.x.mul(0.5), UV.x.mul(16.0), max(isV, isD)), mix(UV.y.mul(16.0), UV.y.mul(0.5), max(isV, isD)), hv.mul(10.0)));
      const k = fadeHF(UV.y, 6.0);
      const shade = mix(float(0.86), mix(lap, bat, max(isV, isD)), k);
      const peel = smoothstep(0.62, 0.68, mx_noise_float(positionWorld.mul(4.3)).mul(0.5).add(0.5).mul(mx_noise_float(positionWorld.mul(0.6)).mul(0.25).add(0.85)).add(wear.mul(0.35)).sub(0.2));
      const bare = vec3(0.3, 0.25, 0.19).mul(float(0.8).add(hv.mul(0.35))).mul(float(1).add(gr.mul(0.18)));
      const paint = T.mul(float(0.92).add(hv.mul(0.12))).mul(float(1).add(gr.mul(0.04)));
      const col = mix(paint, bare, max(peel, step(0.95, A.z))).mul(shade);
      const w = weathered(L, col, float(0.82).add(gr.mul(0.06)));
      m.colorNode = w.c; m.roughnessNode = w.r;
      m.normalNode = bumpMap(mix(fv, fu, max(isV, isD)).mul(k).mul(0.6).add(gr.mul(0.08)));
      this.mats.wood = m;
    }
    {
      const m = std();
      const pat = A.x;
      const isStone = step(0.5, pat).mul(step(pat, 1.5)), isAdobe = step(1.5, pat).mul(step(pat, 2.5)), isBlock = step(2.5, pat);
      const bh = mix(mix(float(0.077), float(0.32), isStone), float(0.2), isBlock), bw = mix(mix(float(0.22), float(0.55), isStone), float(0.4), isBlock);
      const by = UV.y.div(bh), r = floor(by), fy = fract(by);
      const bx = UV.x.div(bw).add(r.mod(2).mul(0.5)), c = floor(bx), fx = fract(bx);
      const mw = mix(float(0.09), float(0.05), isStone);
      const brick = smoothstep(0.0, mw, fy).mul(smoothstep(0.0, mw, float(1).sub(fy))).mul(smoothstep(0.0, mw.mul(0.4), fx)).mul(smoothstep(0.0, mw.mul(0.4), float(1).sub(fx)));
      const k = fadeHF(UV.y, 3.0).mul(float(1).sub(isAdobe));
      const hv = H(r.mul(17.0).add(c));
      const n = mx_noise_float(positionWorld.mul(3.0));
      const unit = T.mul(float(0.78).add(hv.mul(0.42))).mul(float(1).add(n.mul(0.08)));
      const mortar = vec3(0.5, 0.48, 0.44);
      let col = mix(mix(T.mul(0.92), mortar, 0.15), mix(mortar, unit, brick), k);
      col = mix(col, T.mul(float(0.9).add(mx_noise_float(positionWorld.mul(0.7)).mul(0.12))), isAdobe);
      const w = weathered(L, col, float(0.9));
      m.colorNode = w.c; m.roughnessNode = w.r;
      m.normalNode = bumpMap(brick.mul(k).mul(0.5).add(n.mul(0.05)).add(isAdobe.mul(mx_noise_float(positionWorld.mul(5.0)).mul(0.1))));
      this.mats.masonry = m;
    }
    {
      const m = std();
      const pat = A.x;
      const isCon = step(0.5, pat).mul(step(pat, 1.5)), isComp = step(1.5, pat).mul(step(pat, 2.5)), isRib = step(2.5, pat);
      const n = mx_noise_float(positionWorld.mul(2.3)), n2 = mx_fractal_noise_float(positionWorld.mul(0.5), 3, 2.0, 0.5);
      const pw = mix(float(2.4), float(3.0), isComp), ph = mix(float(1.2), float(1.5), isComp);
      const fx = fract(UV.x.div(pw)), fy = fract(UV.y.div(ph));
      const seam = float(1).sub(smoothstep(0.0, 0.012, min(min(fx, float(1).sub(fx)), min(fy, float(1).sub(fy))).mul(pw))).mul(max(isCon, isComp));
      const rib = smoothstep(0.35, 0.5, abs(fract(UV.x.div(0.3)).sub(0.5))).mul(isRib);
      let col = T.mul(float(1).add(n.mul(0.04)).add(n2.mul(mix(float(0.05), float(0.12), isCon))));
      col = col.mul(float(1).sub(seam.mul(0.45))).mul(float(1).sub(rib.mul(0.15)));
      const rough = mix(mix(float(0.88), float(0.9), isCon), float(0.32), isComp).sub(rib.mul(0.2));
      const w = weathered(L, col, rough);
      m.colorNode = w.c; m.roughnessNode = w.r; m.metalnessNode = isRib.mul(0.4);
      m.normalNode = bumpMap(n.mul(0.04).add(seam.mul(-0.4)).add(rib.mul(0.3)));
      this.mats.plaster = m;
    }
    {
      const m = std({ side: THREE.DoubleSide });
      const pat = A.x, wear = A.y;
      const isSh = step(0.5, pat).mul(step(pat, 1.5)), isTile = step(1.5, pat).mul(step(pat, 2.5)), isFlat = step(2.5, pat).mul(step(pat, 3.5)), isSeam = step(3.5, pat);
      const isCor = float(1).sub(max(max(isSh, isTile), max(isFlat, isSeam)));
      const cor = sin(UV.x.mul(Math.PI * 2 / 0.076)).mul(0.5).add(0.5);
      const shr = UV.y.div(0.22), sr = floor(shr), sfy = fract(shr);
      const shc = floor(UV.x.div(0.3).add(sr.mod(2).mul(0.5)));
      const sh = smoothstep(0.0, 0.18, sfy);
      const tr = UV.y.div(0.33), tfy = fract(tr);
      const tile = sin(UV.x.mul(Math.PI * 2 / 0.25)).mul(0.5).add(0.5).mul(0.6).add(smoothstep(0.0, 0.2, tfy).mul(0.4));
      const seamL = smoothstep(0.46, 0.5, abs(fract(UV.x.div(0.5)).sub(0.5)));
      const hv = H(sr.mul(13.0).add(shc));
      const n = mx_noise_float(positionWorld.mul(1.7)).mul(0.5).add(0.5);
      const k = fadeHF(UV.x, 8.0);
      const rn = mx_noise_float(positionWorld.mul(3.1)).mul(0.5).add(0.5).mul(0.6).add(n.mul(0.4));
      const rustM = smoothstep(0.62, 0.8, rn.add(wear.mul(0.25)).add(L.U.rust.mul(0.3))).mul(max(isCor, isSeam)).mul(0.85);
      let col = T.mul(mix(float(1), float(0.82).add(hv.mul(0.3)), max(isSh, isTile)));
      col = col.mul(mix(float(0.92), mix(mix(cor.mul(0.25).add(0.75), sh.mul(0.45).add(0.55), isSh), tile.mul(0.4).add(0.6), isTile), k));
      col = mix(col, vec3(0.26, 0.1, 0.04).mul(n.mul(0.5).add(0.6)), rustM);
      col = col.mul(float(1).sub(seamL.mul(isSeam).mul(0.3)));
      const rough = mix(float(0.58).add(rustM.mul(0.35)), float(0.85), max(isSh, max(isTile, isFlat)));
      const w = weathered(L, col, rough);
      m.colorNode = w.c; m.roughnessNode = w.r;
      m.metalnessNode = max(isCor, isSeam).mul(float(0.5).sub(rustM.mul(0.45)));
      m.normalNode = bumpMap(mix(mix(mix(cor.mul(0.5), sh.mul(0.8), isSh), tile.mul(0.8), isTile), seamL.mul(0.4), isSeam).mul(k).add(n.mul(0.05)));
      this.mats.roof = m;
    }
    {
      const m = std();
      const n = mx_noise_float(positionWorld.mul(2.2)).mul(0.5).add(0.5);
      const rn = mx_noise_float(positionWorld.mul(5.5)).mul(0.5).add(0.5).mul(0.55).add(n.mul(0.45));
      const rustM = smoothstep(0.55, 0.85, rn.add(A.w.mul(0.5)).add(L.U.rust.mul(0.25)).sub(0.25)).mul(step(0.01, A.w.add(L.U.rust)));
      const col = mix(T, vec3(0.28, 0.11, 0.04).mul(n.add(0.5)), rustM);
      const w = weathered(L, col, A.y.add(rustM.mul(0.4)), { moss: false });
      m.colorNode = w.c; m.roughnessNode = w.r; m.metalnessNode = A.z.mul(float(1).sub(rustM.mul(0.8)));
      m.normalNode = bumpMap(rustM.mul(mx_noise_float(positionWorld.mul(9.0))).mul(0.15));
      this.mats.metal = m;
    }
    {
      const m = std({ roughness: 0.05 });
      const cell = floor(positionWorld.div(vec3(2.6, 3.0, 2.6)));
      const h = H(cell.x.mul(7.0).add(cell.y.mul(131.0)).add(cell.z.mul(17.0)).add(A.z.mul(3.0)));
      const lit = step(float(1).sub(U.lit.mul(A.y)), h).mul(U.lights);
      const warm = mix(vec3(1.0, 0.62, 0.3), vec3(0.75, 0.85, 1.0), step(0.7, H(h.mul(91.0))).mul(A.x));
      const n = mx_noise_float(positionWorld.mul(0.8)).mul(0.5).add(0.5);
      const broken = step(0.5, A.w);
      m.colorNode = mix(T, vec3(0.02, 0.018, 0.016), broken);
      m.roughnessNode = mix(float(0.04).add(n.mul(0.06)), float(0.9), broken);
      m.metalnessNode = float(0.0);
      m.emissiveNode = warm.mul(lit).mul(U.night).mul(float(0.55).add(n.mul(0.5))).mul(float(1).sub(broken));
      this.mats.glass = m;
    }
    {
      const m = std({ roughness: 0.5 });
      m.colorNode = T.mul(0.25);
      m.emissiveNode = T.mul(A.x.add(U.night.mul(A.y))).mul(U.lights.mul(0.85).add(0.15).mul(A.z.mul(0).add(1)));
      this.mats.light = m;
    }
    {
      const m = std({ roughness: 0.3 });
      const p = positionWorld;
      const n = mx_noise_float(p.mul(0.9)).mul(0.5).add(0.5);
      const sp = max(A.x, float(0.5));
      const fy = fract(UV.y.div(sp)), fx = fract(UV.x.div(sp.mul(4.0)));
      const line = float(1).sub(smoothstep(0.0, 0.035, abs(fy.sub(0.5)).mul(-2).add(1))).mul(step(0.5, A.y));
      const seam = float(1).sub(smoothstep(0.0, 0.01, min(fx, float(1).sub(fx))));
      const flow = smoothstep(0.4, 1.0, sin(UV.x.mul(0.05).sub(p.y.mul(0.02)).add(n.mul(2.0)).add(H(floor(UV.y.div(sp))).mul(6.28)).mul(1.0)).mul(0.5).add(0.5));
      m.colorNode = T.mul(float(0.95).add(n.mul(0.08))).mul(float(1).sub(seam.mul(0.25)));
      m.roughnessNode = float(0.22).add(n.mul(0.1));
      m.metalnessNode = A.z;
      m.emissiveNode = vec3(0.45, 0.8, 1.0).mul(line.mul(float(0.6).add(U.night.mul(3.0))).mul(flow.mul(0.6).add(0.4))).mul(A.w.add(1.0));
      this.mats.scifi = m;
    }
    {
      const m = std({ roughness: 0.95 });
      const n = mx_noise_float(positionWorld.mul(1.4)).mul(0.5).add(0.5), n2 = mx_noise_float(positionWorld.mul(6.0));
      const w = weathered(L, T.mul(float(0.75).add(n.mul(0.4))).mul(float(1).add(n2.mul(0.1))), float(0.95));
      m.colorNode = w.c; m.roughnessNode = w.r;
      m.normalNode = bumpMap(n.mul(0.3).add(n2.mul(0.1)));
      this.mats.rubble = m;
    }
    for (const k in this.mats) this.mats[k].name = 'era_' + k;
  }
}

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();

export class Kit {
  constructor() {
    this.buckets = new Map();
    this.M = new THREE.Matrix4(); this.R = new THREE.Matrix3();
    this.L = new THREE.Matrix4(); this.LR = new THREE.Matrix3();
    this.ranges = new Map();
    this.cur = null;
    this.colliders = [];
  }

  at(x, y, z, ry = 0) { this.M.makeRotationY(ry).setPosition(x, y, z); this.R.setFromMatrix4(this.M); this.ry = ry; this.ox = x; this.oy = y; this.oz = z; return this; }

  push(x, y, z, ry = 0) {
    (this.stack || (this.stack = [])).push([this.M.clone(), this.ry || 0]);
    this.M.multiply(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
    this.R.setFromMatrix4(this.M); this.ry = (this.ry || 0) + ry;
    return this;
  }

  pop() { const [M, ry] = this.stack.pop(); this.M.copy(M); this.R.setFromMatrix4(M); this.ry = ry; return this; }

  hip(mat, cx, cy, cz, w, d, h, o = {}) {
    const ov = o.overhang === undefined ? 0.5 : o.overhang;
    const W = w / 2 + ov, D = d / 2 + ov, drop = ov * h / Math.min(w / 2, d / 2);
    const y0 = cy - drop, y1 = cy + h;
    const r = Math.max(0, W - D);
    const a = [cx - W, y0, cz - D], b = [cx + W, y0, cz - D], c = [cx + W, y0, cz + D], dd = [cx - W, y0, cz + D];
    const ra = W >= D ? [cx - r, y1, cz] : [cx, y1, cz - (D - W)], rb = W >= D ? [cx + r, y1, cz] : [cx, y1, cz + (D - W)];
    const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
    const tri = (p, q, s) => { const n = new THREE.Vector3().subVectors(V(q), V(p)).cross(new THREE.Vector3().subVectors(V(s), V(p))).normalize(); const u = new THREE.Vector3().subVectors(V(q), V(p)).normalize(); this.face(mat, [V(p), V(q), V(s)], n, u, n.clone().cross(u), o); };
    const quad = (p, q, s, t) => { const n = new THREE.Vector3().subVectors(V(q), V(p)).cross(new THREE.Vector3().subVectors(V(t), V(p))).normalize(); const u = new THREE.Vector3().subVectors(V(q), V(p)).normalize(); this.face(mat, [V(p), V(q), V(s), V(t)], n, u, n.clone().cross(u), o); };
    if (W >= D) { quad(dd, c, rb, ra); quad(b, a, ra, rb); tri(a, dd, ra); tri(c, b, rb); }
    else { quad(a, dd, rb, ra); quad(c, b, ra, rb); tri(b, a, ra); tri(dd, c, rb); }
    return this;
  }

  pyramid(mat, cx, cy, cz, w, d, h, o = {}) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const t = V(cx, cy + h, cz), p = [V(cx - w / 2, cy, cz - d / 2), V(cx + w / 2, cy, cz - d / 2), V(cx + w / 2, cy, cz + d / 2), V(cx - w / 2, cy, cz + d / 2)];
    for (let i = 0; i < 4; i++) { const a = p[(i + 1) % 4], b = p[i]; const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(t, a)).normalize(); const u = new THREE.Vector3().subVectors(b, a).normalize(); this.face(mat, [a, b, t], n, u, n.clone().cross(u), o); }
    return this;
  }

  bucket(mat) {
    let b = this.buckets.get(mat);
    if (!b) { b = { pos: [], nor: [], uv: [], tint: [], aux: [], idx: [], n: 0 }; this.buckets.set(mat, b); }
    return b;
  }

  begin(id) { this.cur = { id, start: new Map() }; for (const [k, b] of this.buckets) this.cur.start.set(k, b.n); return this; }

  end() {
    if (!this.cur) return;
    const r = new Map();
    for (const [k, b] of this.buckets) { const s = this.cur.start.get(k) || 0; if (b.n > s) r.set(k, [s, b.n]); }
    this.ranges.set(this.cur.id, r);
    this.cur = null;
  }

  collider(cx, cy, cz, hx, hy, hz, ry = 0, tag = 'building', rz = 0) {
    _v.set(cx, cy, cz).applyMatrix4(this.M);
    this.colliders.push({ id: this.cur ? this.cur.id : null, x: _v.x, y: _v.y, z: _v.z, hx, hy, hz, ry: (this.ry || 0) + ry, rz, tag });
    return this;
  }

  face(mat, P, n, uAxis, vAxis, o) {
    const b = this.bucket(mat);
    const t = o.tint || [0.5, 0.5, 0.5], a = o.aux || [0, 0, 0, 0];
    const base = b.n;
    _n.copy(n).applyMatrix3(this.R).normalize();
    _u.copy(uAxis).applyMatrix3(this.R).normalize();
    _w.copy(vAxis).applyMatrix3(this.R).normalize();
    const vertical = Math.abs(_n.y) < 0.2;
    for (const p of P) {
      _v.copy(p).applyMatrix4(this.M);
      b.pos.push(_v.x, _v.y, _v.z); b.nor.push(_n.x, _n.y, _n.z);
      if (vertical && Math.abs(_w.y) > 0.98) b.uv.push(_v.x * _u.x + _v.z * _u.z, _v.y);
      else if (Math.abs(_n.y) > 0.98) b.uv.push(_v.x, _v.z);
      else b.uv.push(_v.dot(_u), _v.dot(_w));
      b.tint.push(t[0], t[1], t[2]); b.aux.push(a[0], a[1], a[2], a[3]);
    }
    if (P.length === 4) b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else b.idx.push(base, base + 1, base + 2);
    b.n += P.length;
  }

  quadUV(mat, P, n, uvs, o = {}) {
    const b = this.bucket(mat);
    const t = o.tint || [1, 1, 1], a = o.aux || [0, 0, 0, 0];
    const base = b.n;
    _n.copy(n).applyMatrix3(this.R).normalize();
    P.forEach((p, k) => { _v.copy(p).applyMatrix4(this.M); b.pos.push(_v.x, _v.y, _v.z); b.nor.push(_n.x, _n.y, _n.z); b.uv.push(uvs[k][0], uvs[k][1]); b.tint.push(t[0], t[1], t[2]); b.aux.push(a[0], a[1], a[2], a[3]); });
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    b.n += 4;
    return this;
  }

  sign(rect, cx, cy, cz, w, h, ry = 0, glow = 0) {
    const c = Math.cos(ry), s = Math.sin(ry), hw = w / 2;
    const P = [new THREE.Vector3(cx - c * hw, cy - h / 2, cz + s * hw), new THREE.Vector3(cx + c * hw, cy - h / 2, cz - s * hw), new THREE.Vector3(cx + c * hw, cy + h / 2, cz - s * hw), new THREE.Vector3(cx - c * hw, cy + h / 2, cz + s * hw)];
    const [u0, v0, u1, v1] = rect;
    return this.quadUV('sign', P, new THREE.Vector3(s, 0, c), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], { aux: [glow, 0, 0, 0] });
  }

  obox(mat, cx, cy, cz, sx, sy, sz, rx = 0, ry = 0, rz = 0, o = {}) {
    this.L.makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')).setPosition(cx, cy, cz);
    this.LR.setFromMatrix4(this.L);
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const corner = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(this.L);
    const dir = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix3(this.LR);
    const F = [
      [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0], [0, 0, -1], [0, 1, 0], 'px'],
      [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0], [0, 0, 1], [0, 1, 0], 'nx'],
      [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz], [0, 1, 0], [1, 0, 0], [0, 0, -1], 'py'],
      [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [0, -1, 0], [1, 0, 0], [0, 0, 1], 'ny'],
      [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1], [1, 0, 0], [0, 1, 0], 'pz'],
      [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1], [-1, 0, 0], [0, 1, 0], 'nz'],
    ];
    for (const f of F) {
      if (o.skip && o.skip.includes(f[7])) continue;
      if (!o.bottom && f[7] === 'ny') continue;
      const mo = o[f[7]] ? { ...o, ...o[f[7]] } : o;
      this.face(mo.mat || mat, [corner(...f[0]), corner(...f[1]), corner(...f[2]), corner(...f[3])], dir(...f[4]), dir(...f[5]), dir(...f[6]), mo);
    }
    return this;
  }

  box(mat, cx, cy, cz, sx, sy, sz, o = {}) { return this.obox(mat, cx, cy + sy / 2, cz, sx, sy, sz, o.rx || 0, o.ry || 0, o.rz || 0, o); }

  cyl(mat, x, y, z, r0, r1, h, seg = 8, o = {}) {
    const P = (i, yy, r) => { const a = (i / seg) * Math.PI * 2; return new THREE.Vector3(x + Math.cos(a) * r, yy, z + Math.sin(a) * r); };
    const rot = o.rx || o.rz ? new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)) : null;
    const piv = new THREE.Vector3(x, y, z);
    const tf = (v) => (rot ? v.sub(piv).applyMatrix4(rot).add(piv) : v);
    const tn = (v) => (rot ? v.applyMatrix4(rot) : v);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      const n = tn(new THREE.Vector3(Math.cos(am), (r1 - r0) / h, Math.sin(am)).normalize());
      const quad = [tf(P(i, y, r1)), tf(P(i + 1, y, r1)), tf(P(i + 1, y + h, r0)), tf(P(i, y + h, r0))];
      const u = tn(new THREE.Vector3(-Math.sin(am), 0, Math.cos(am)));
      const v = tn(new THREE.Vector3(0, 1, 0));
      this.face(mat, quad.reverse(), n, u.negate(), v, o);
    }
    if (o.cap !== false && r0 > 0) for (let i = 0; i < seg; i++) this.face(mat, [tf(new THREE.Vector3(x, y + h, z)), tf(P(i + 1, y + h, r0)), tf(P(i, y + h, r0))], tn(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), o);
    return this;
  }

  gable(mat, cx, cy, cz, w, d, h, o = {}) {
    const ov = o.overhang === undefined ? 0.35 : o.overhang, th = o.thick || 0.12;
    const slope = Math.atan2(h, w / 2), run = w / 2 + ov, drop = ov * Math.tan(slope);
    const len = Math.hypot(run, h + drop);
    const dd = d + (o.overhangD === undefined ? ov * 2 : o.overhangD * 2);
    for (const s of [-1, 1]) {
      const mx = cx + s * run / 2, my = cy + (h - drop) / 2 + th / 2 / Math.cos(slope);
      this.obox(mat, mx, my, cz, len, th, dd, 0, 0, -s * slope, { ...o, bottom: true });
    }
    if (o.gableMat) {
      for (const sz of [-1, 1]) {
        const z = cz + sz * d / 2;
        const a = new THREE.Vector3(cx - w / 2, cy, z), b = new THREE.Vector3(cx + w / 2, cy, z), c = new THREE.Vector3(cx, cy + h, z);
        this.face(o.gableMat, sz > 0 ? [a, b, c] : [b, a, c], new THREE.Vector3(0, 0, sz), new THREE.Vector3(sz, 0, 0), new THREE.Vector3(0, 1, 0), o.gable || o);
      }
    }
    return this;
  }

  build() {
    const out = new Map();
    for (const [mat, b] of this.buckets) {
      if (!b.n) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.nor), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b.uv), 2));
      g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(b.tint), 3));
      g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(b.aux), 4));
      g.setIndex(b.n > 65000 ? new THREE.BufferAttribute(new Uint32Array(b.idx), 1) : new THREE.BufferAttribute(new Uint16Array(b.idx), 1));
      g.computeBoundingSphere();
      out.set(mat, g);
    }
    return out;
  }
}
