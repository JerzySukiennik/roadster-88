// Roadster 88 city prop geometry: procedural street-furniture and tree models (lamps, signals, hydrants, bins, boxes, benches, shelters, meters, signs, bollards, barriers, cones, barrels, fences, pumps, railings, rocks, street, park and far trees) and the packer that bakes placed props into flat vertex arrays. Pure JS for the main thread and workers.
import { rng } from './plan.js';

export class Kit {
  constructor() { this.p = []; this.n = []; this.c = []; this.e = []; this.l = []; this.i = []; }
  box(cx, cy, cz, w, h, d, col, emit = 0, lamp = 0, rot = 0) {
    const o = this.p.length / 3, hw = w / 2, hh = h / 2, hd = d / 2, cs = Math.cos(rot), sn = Math.sin(rot);
    const F = [[[1, 0, 0], [[hw, -hh, -hd], [hw, -hh, hd], [hw, hh, hd], [hw, hh, -hd]]], [[-1, 0, 0], [[-hw, -hh, hd], [-hw, -hh, -hd], [-hw, hh, -hd], [-hw, hh, hd]]], [[0, 1, 0], [[-hw, hh, -hd], [hw, hh, -hd], [hw, hh, hd], [-hw, hh, hd]]], [[0, -1, 0], [[-hw, -hh, hd], [hw, -hh, hd], [hw, -hh, -hd], [-hw, -hh, -hd]]], [[0, 0, 1], [[hw, -hh, hd], [-hw, -hh, hd], [-hw, hh, hd], [hw, hh, hd]]], [[0, 0, -1], [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd]]]];
    let k = 0;
    for (const [nrm, vs] of F) {
      for (const [x, y, z] of vs) { this.p.push(cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs); this.n.push(nrm[0] * cs + nrm[2] * sn, nrm[1], -nrm[0] * sn + nrm[2] * cs); this.c.push(...col); this.e.push(emit); this.l.push(lamp); }
      const b = o + k * 4; this.i.push(b, b + 2, b + 1, b, b + 3, b + 2); k++;
    }
  }
  cyl(cx, cy, cz, r, h, col, n = 8, emit = 0, lamp = 0, r1 = r) {
    const o = this.p.length / 3;
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); this.p.push(cx + c * r, cy, cz + s * r, cx + c * r1, cy + h, cz + s * r1); this.n.push(c, 0, s, c, 0, s); this.c.push(...col, ...col); this.e.push(emit, emit); this.l.push(lamp, lamp); }
    for (let i = 0; i < n; i++) { const a = o + i * 2; this.i.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const t = this.p.length / 3; this.p.push(cx, cy + h, cz); this.n.push(0, 1, 0); this.c.push(...col); this.e.push(emit); this.l.push(lamp);
    for (let i = 0; i < n; i++) this.i.push(t, o + i * 2 + 3, o + i * 2 + 1);
  }
}

const GREY = [0.28, 0.29, 0.3], DGREY = [0.1, 0.1, 0.11], BLUE = [0.05, 0.12, 0.35], ORANGE = [0.85, 0.32, 0.04], WHITE = [0.85, 0.85, 0.85], WOOD = [0.35, 0.22, 0.12], CONC = [0.6, 0.59, 0.56], BARK = [0.18, 0.13, 0.09], LEAF = [0.11, 0.18, 0.055];

export function blob(K, cx, cy, cz, r, col, flat = 0.82) {
  const o = K.p.length / 3, t = (1 + Math.sqrt(5)) / 2;
  const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (const v of V) { const l = Math.hypot(...v); const n = v.map((q) => q / l); const sq = 0.82 + 0.3 * Math.abs(Math.sin(v[0] * 3.1 + v[2] * 1.7 + cx)); K.p.push(cx + n[0] * r * sq, cy + n[1] * r * flat * sq, cz + n[2] * r * sq); K.n.push(...n); const k = 0.75 + 0.45 * (n[1] * 0.5 + 0.5); K.c.push(col[0] * k, col[1] * k, col[2] * k); K.e.push(0); K.l.push(-1); }
  for (const f of F) K.i.push(o + f[0], o + f[2], o + f[1]);
}

export function model(type, variant = 0) {
  const K = new Kit();
  switch (type) {
    case 'lamp': K.cyl(0, 0, 0, 0.14, 8.6, GREY, 6, 0, 0, 0.09); K.box(0, 8.55, -1.1, 0.12, 0.12, 2.3, GREY); K.box(0, 8.42, -2.2, 0.38, 0.16, 0.7, DGREY); K.box(0, 8.33, -2.2, 0.3, 0.03, 0.6, [1, 0.85, 0.6], 1); K.cyl(0, 0, 0, 0.22, 0.6, GREY, 6); break;
    case 'signal': {
      K.cyl(0, 0, 0, 0.18, 6.8, DGREY, 6); K.box(0, 6.6, -3.2, 0.16, 0.16, 6.4, DGREY);
      for (const z of [-5.8, -3.0]) { K.box(0, 5.9, z, 0.36, 1.05, 0.3, [0.12, 0.12, 0.06]); K.box(0, 6.22, z + 0.16, 0.22, 0.22, 0.04, [0.7, 0.05, 0.02], 0, 1); K.box(0, 5.9, z + 0.16, 0.22, 0.22, 0.04, [0.7, 0.45, 0.02], 0, 2); K.box(0, 5.58, z + 0.16, 0.22, 0.22, 0.04, [0.05, 0.6, 0.3], 0, 3); }
      K.box(0.2, 3.2, 0, 0.36, 1.05, 0.3, [0.12, 0.12, 0.06], 0, 0, Math.PI / 2); K.box(0.36, 3.52, 0, 0.04, 0.22, 0.22, [0.7, 0.05, 0.02], 0, 4); K.box(0.36, 3.2, 0, 0.04, 0.22, 0.22, [0.7, 0.45, 0.02], 0, 5); K.box(0.36, 2.88, 0, 0.04, 0.22, 0.22, [0.05, 0.6, 0.3], 0, 6);
      K.box(0, 7.1, -1.2, 0.05, 0.28, 1.5, [0.05, 0.35, 0.15]); K.box(0, 7.4, 0, 1.5, 0.28, 0.05, [0.05, 0.35, 0.15]);
      break;
    }
    case 'hydrant': K.cyl(0, 0, 0, 0.17, 0.62, [0.75, 0.62, 0.1], 8); K.cyl(0, 0.62, 0, 0.19, 0.1, [0.75, 0.62, 0.1], 8); K.cyl(0, 0.72, 0, 0.12, 0.14, [0.75, 0.62, 0.1], 8, 0, 0, 0.04); K.box(0, 0.42, 0, 0.5, 0.12, 0.12, [0.7, 0.58, 0.1]); break;
    case 'trash': K.cyl(0, 0, 0, 0.3, 0.95, [0.12, 0.2, 0.12], 8); K.cyl(0, 0.92, 0, 0.32, 0.06, DGREY, 8); break;
    case 'mailbox': K.box(0, 0.25, 0, 0.45, 0.5, 0.45, BLUE); K.box(0, 0.83, 0, 0.5, 0.66, 0.48, BLUE); break;
    case 'news': K.box(0, 0.55, 0, 0.5, 1.1, 0.45, [0.75, 0.15, 0.1]); K.box(0, 0.8, 0.23, 0.38, 0.3, 0.02, [0.6, 0.7, 0.75]); break;
    case 'bench': K.box(0, 0.45, 0, 1.9, 0.06, 0.45, WOOD); K.box(0, 0.75, -0.24, 1.9, 0.4, 0.05, WOOD); K.box(-0.85, 0.22, 0, 0.06, 0.45, 0.5, DGREY); K.box(0.85, 0.22, 0, 0.06, 0.45, 0.5, DGREY); break;
    case 'shelter': K.box(0, 2.55, 0, 5.2, 0.1, 1.6, DGREY); K.box(0, 1.3, -0.75, 5.2, 2.3, 0.04, [0.45, 0.55, 0.6]); K.box(-2.55, 1.3, 0, 0.05, 2.3, 1.5, [0.45, 0.55, 0.6]); K.box(2.55, 1.3, 0, 0.05, 2.3, 1.5, [0.5, 0.6, 0.65], 0.6); for (const x of [-2.5, 2.5]) K.box(x, 1.3, -0.75, 0.08, 2.6, 0.08, GREY); break;
    case 'meter': K.cyl(0, 0, 0, 0.05, 1.15, GREY, 5); K.box(0, 1.25, 0, 0.2, 0.32, 0.16, DGREY); break;
    case 'sign': K.cyl(0, 0, 0, 0.04, 2.9, GREY, 5); { const o = K.p.length / 3; for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; K.p.push(Math.cos(a) * 0.33, 2.55 + Math.sin(a) * 0.33, 0.05); K.n.push(0, 0, 1); K.c.push(0.7, 0.05, 0.04); K.e.push(0); K.l.push(0); } for (let i = 1; i < 7; i++) K.i.push(o, o + i, o + i + 1); } break;
    case 'bollard': K.cyl(0, 0, 0, 0.12, 0.95, DGREY, 6); K.cyl(0, 0.95, 0, 0.12, 0.08, [0.6, 0.6, 0.55], 6, 0.4); break;
    case 'jersey': K.box(0, 0.2, 0, 3, 0.4, 0.6, CONC); K.box(0, 0.6, 0, 3, 0.45, 0.24, CONC); break;
    case 'barrier': K.box(0, 0.5, 0, 1.8, 1.0, 0.45, ORANGE); K.box(0, 0.75, 0, 1.82, 0.12, 0.47, WHITE); break;
    case 'cone': K.cyl(0, 0, 0, 0.2, 0.72, ORANGE, 8, 0, 0, 0.03); K.box(0, 0.02, 0, 0.42, 0.04, 0.42, DGREY); break;
    case 'barrel': K.cyl(0, 0, 0, 0.3, 0.92, ORANGE, 10); K.cyl(0, 0.3, 0, 0.305, 0.12, WHITE, 10); K.cyl(0, 0.62, 0, 0.305, 0.12, WHITE, 10); break;
    case 'fence': K.box(0, 1.0, 0, 3, 1.95, 0.02, [0.42, 0.44, 0.45]); K.box(-1.5, 1.0, 0, 0.06, 2.0, 0.06, GREY); K.box(1.5, 1.0, 0, 0.06, 2.0, 0.06, GREY); K.box(0, 0.08, 0, 0.6, 0.16, 0.6, CONC); break;
    case 'pump': K.box(0, 0.12, 0, 1.6, 0.24, 1.0, CONC); K.box(0, 0.95, 0, 0.9, 1.5, 0.6, [0.88, 0.88, 0.88]); K.box(0, 1.55, 0.31, 0.6, 0.3, 0.02, [0.2, 0.6, 0.9], 0.8); K.box(0.46, 1.0, 0, 0.04, 0.6, 0.2, DGREY); break;
    case 'rail': K.box(0, 1.05, 0, 3.2, 0.08, 0.08, [0.1, 0.12, 0.1]); K.box(0, 0.6, 0, 3.2, 0.04, 0.04, [0.1, 0.12, 0.1]); for (const x of [-1.55, 0, 1.55]) K.box(x, 0.55, 0, 0.07, 1.1, 0.07, [0.1, 0.12, 0.1]); break;
    case 'rock': { const R = rng(900 + variant); for (let i = 0; i < 3; i++) { const o = K.p.length / 3; blob(K, (R() - 0.5) * 2, 0.3 + R() * 0.4, (R() - 0.5) * 2, 1.2 + R() * 0.8, [0.2, 0.2, 0.21], 0.55); for (let v = o; v < K.p.length / 3; v++) K.l[v] = 0; } break; }
    case 'hitch': K.box(0, 0.9, 0, 2.4, 0.12, 0.12, WOOD); K.box(-1.1, 0.45, 0, 0.14, 0.9, 0.14, WOOD); K.box(1.1, 0.45, 0, 0.14, 0.9, 0.14, WOOD); break;
    case 'tree': case 'ptree': case 'ftree': {
      const big = type !== 'tree', far = type === 'ftree', R = rng((big ? 77 : 33) + variant * 101);
      if (far) { K.cyl(0, 0, 0, 0.3, 4.5, BARK, 3, 0, 0, 0.2); blob(K, 0, 7, 0, 4.6, LEAF, 0.85); break; }
      K.cyl(0, 0, 0, big ? 0.3 : 0.2, big ? 5 : 3.6, BARK, 6, 0, 0, big ? 0.18 : 0.12);
      const n = big ? 7 : 5, cr = big ? 4.6 : 2.8, cy = big ? 7.2 : 5;
      const tint = [LEAF[0] * (0.8 + R() * 0.5), LEAF[1] * (0.85 + R() * 0.35), LEAF[2] * (0.8 + R() * 0.4)];
      for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, rr = cr * (0.3 + R() * 0.55), h = cy + (R() - 0.3) * cr * 0.9; blob(K, Math.cos(a) * rr, h, Math.sin(a) * rr, cr * (0.5 + R() * 0.35), [tint[0] * (0.85 + R() * 0.3), tint[1] * (0.85 + R() * 0.3), tint[2]]); }
      blob(K, 0, cy + cr * 0.35, 0, cr * 0.8, tint);
      break;
    }
    default: K.box(0, 0.5, 0, 1, 1, 1, GREY);
  }
  return K;
}

export class PGeo {
  constructor() { this.p = []; this.n = []; this.c = []; this.e = []; this.l = []; this.s = []; this.i = []; this.nv = 0; }
  add(K, x, y, z, yaw, sc, sig, leaves = null) {
    if (leaves) {
      const sub = (pred) => { const k = new Kit(), map = new Map(); for (let t = 0; t < K.i.length; t += 3) { const a = K.i[t], b = K.i[t + 1], c = K.i[t + 2]; if (!pred(K.l[a])) continue; for (const v of [a, b, c]) if (!map.has(v)) { map.set(v, k.p.length / 3); k.p.push(K.p[v * 3], K.p[v * 3 + 1], K.p[v * 3 + 2]); k.n.push(K.n[v * 3], K.n[v * 3 + 1], K.n[v * 3 + 2]); k.c.push(K.c[v * 3], K.c[v * 3 + 1], K.c[v * 3 + 2]); k.e.push(K.e[v]); k.l.push(K.l[v]); } k.i.push(map.get(a), map.get(b), map.get(c)); } return k; };
      K._trunk = K._trunk || sub((l) => l > -0.5); K._leaf = K._leaf || sub((l) => l < -0.5);
      const r = leaves.add(K._leaf, x, y, z, yaw, sc, null);
      const r2 = this.add(K._trunk, x, y, z, yaw, sc, sig);
      return [r2[0], r2[1], r[0], r[1]];
    }
    const cs = Math.cos(yaw), sn = Math.sin(yaw), o = this.nv, nv = K.p.length / 3;
    for (let v = 0; v < nv; v++) {
      const px = K.p[v * 3] * sc, py = K.p[v * 3 + 1] * sc, pz = K.p[v * 3 + 2] * sc, nx = K.n[v * 3], ny = K.n[v * 3 + 1], nz = K.n[v * 3 + 2];
      this.p.push(x + px * cs + pz * sn, y + py, z - px * sn + pz * cs); this.n.push(nx * cs + nz * sn, ny, -nx * sn + nz * cs);
      this.c.push(K.c[v * 3], K.c[v * 3 + 1], K.c[v * 3 + 2]); this.e.push(K.e[v]); this.l.push(K.l[v]);
      if (sig) this.s.push(sig[0], sig[1], sig[2], sig[3]); else this.s.push(0, 0, 64, 30);
    }
    for (const q of K.i) this.i.push(q + o);
    this.nv += nv;
    return [o, this.nv];
  }
  out() {
    return { position: Float32Array.from(this.p), normal: Float32Array.from(this.n), color: Float32Array.from(this.c), emit: Float32Array.from(this.e), lamp: Float32Array.from(this.l), sig: Float32Array.from(this.s), index: this.nv > 65535 ? Uint32Array.from(this.i) : Uint16Array.from(this.i), count: this.nv };
  }
}

