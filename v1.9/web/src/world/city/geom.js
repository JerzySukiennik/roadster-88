// Roadster 88 city geometry: pure builders that turn the city plan into packed vertex arrays (no three.js), for building masses with tiers and crowns, near-detail kits (parapets, cornices, storefronts, awnings, fire escapes, mullions, roof clutter, water towers, helipads), street ground (roads with lane coordinates, intersections, sidewalks with curbs, plazas, parks, waterfronts, yards, runway) and generic boxes, prisms and decks for structures. Shared by the main thread and workers.
import { FACADE, rng, polyArea, centroid, ccw, insetPoly } from './plan.js';

export const KIND = { wall: 0, roof: 1, trim: 2, metal: 3, panel: 4, storefront: 5, sign: 6, concrete: 7, wood: 8, darkroof: 9, crownlit: 10, helipad: 11, glassbox: 12, awning: 13, rail: 14, rubble: 15, lamp: 16, container: 17 };
export const GK = { asphalt: 0, avenue: 1, street: 2, boulevard: 3, broadway: 4, main: 5, box: 6, walk: 7, curb: 8, plaza: 9, lawn: 10, esplanade: 11, yard: 12, runway: 13, taxiway: 14, apron: 15, dirt: 16, deck: 17, path: 18, bike: 19 };

class F32 { constructor(n = 4096) { this.a = new Float32Array(n); this.n = 0; } push(...v) { if (this.n + v.length > this.a.length) { const b = new Float32Array(Math.max(this.a.length * 2, this.n + v.length)); b.set(this.a); this.a = b; } for (const x of v) this.a[this.n++] = x; } out() { return this.a.slice(0, this.n); } }
class U8 { constructor(n = 4096) { this.a = new Uint8Array(n); this.n = 0; } push(a, b, c, d) { if (this.n + 4 > this.a.length) { const x = new Uint8Array(this.a.length * 2); x.set(this.a); this.a = x; } this.a[this.n++] = a; this.a[this.n++] = b; this.a[this.n++] = c; this.a[this.n++] = d; } out() { return this.a.slice(0, this.n); } }
class I32 { constructor(n = 4096) { this.a = new Uint32Array(n); this.n = 0; } push(...v) { if (this.n + v.length > this.a.length) { const b = new Uint32Array(Math.max(this.a.length * 2, this.n + v.length)); b.set(this.a); this.a = b; } for (const x of v) this.a[this.n++] = x; } out() { return this.a.slice(0, this.n); } }

const c8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

export class BGeo {
  constructor() { this.p = new F32(); this.n = new F32(); this.uv = new F32(); this.fa = new U8(); this.fb = new U8(); this.fc = new U8(); this.ix = new I32(); this.nv = 0; this.box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; }
  setB(b, kind) {
    const P = b.P, col = P.color;
    this.A = [FACADE[P.style] ?? 4, Math.min(255, Math.round(P.floorH * 32)), Math.min(255, Math.round(P.bayW * 32)), kind];
    this.B = [c8(col[0]), c8(col[1]), c8(col[2]), (b.seed & 127) | (b.small ? 128 : 0)];
    this.C = [c8(P.winW), c8(P.winH), Math.min(255, Math.round(P.ground * 16)), c8(P.lit)];
    this.ground = b.ground; this.decay = b.ruined ? 1 : 0;
  }
  kind(k, color) { this.A = [this.A[0], this.A[1], this.A[2], k]; if (color) this.B = [c8(color[0]), c8(color[1]), c8(color[2]), this.B[3]]; }
  v(x, y, z, nx, ny, nz, u, w) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, w);
    this.fa.push(...this.A); this.fb.push(...this.B); this.fc.push(...this.C);
    const B = this.box; if (x < B[0]) B[0] = x; if (y < B[1]) B[1] = y; if (z < B[2]) B[2] = z; if (x > B[3]) B[3] = x; if (y > B[4]) B[4] = y; if (z > B[5]) B[5] = z;
    return this.nv++;
  }
  tri(a, b, c) { this.ix.push(a, b, c); }
  quad(a, b, c, d) { this.ix.push(a, b, c, a, c, d); }
  wall(ax, az, bx, bz, y0, y1, u0, vBase) {
    const ex = bx - ax, ez = bz - az, l = Math.hypot(ex, ez) || 1, nx = -ez / l, nz = ex / l;
    const a = this.v(ax, y0, az, nx, 0, nz, u0, y0 - vBase), b = this.v(bx, y0, bz, nx, 0, nz, u0 + l, y0 - vBase), c = this.v(bx, y1, bz, nx, 0, nz, u0 + l, y1 - vBase), d = this.v(ax, y1, az, nx, 0, nz, u0, y1 - vBase);
    this.quad(a, b, c, d);
    return l;
  }
  prism(fp, y0, y1, vBase, roof = true, bottom = false, u0 = 0) {
    let u = u0;
    for (let i = 0; i < fp.length; i++) { const a = fp[i], b = fp[(i + 1) % fp.length]; u += this.wall(a[0], a[1], b[0], b[1], y0, y1, u, vBase); }
    if (roof) this.cap(fp, y1, 1);
    if (bottom) this.cap(fp, y0, -1);
  }
  cap(fp, y, dir) {
    const o = this.nv;
    for (const [x, z] of fp) this.v(x, y, z, 0, dir, 0, x, z);
    for (let i = 1; i < fp.length - 1; i++) { if (dir > 0) this.tri(o, o + i, o + i + 1); else this.tri(o, o + i + 1, o + i); }
  }
  disc(cx, cz, y, r, n = 20) {
    const o = this.nv;
    this.v(cx, y, cz, 0, 1, 0, 0, 0);
    for (let i = 0; i < n; i++) { const a = -(i / n) * Math.PI * 2; this.v(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, 1, 0, Math.cos(a) * r, Math.sin(a) * r); }
    for (let i = 0; i < n; i++) this.tri(o, o + 1 + i, o + 1 + (i + 1) % n);
  }
  boxAt(cx, cz, y0, w, d, h, yaw = 0, vBase = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw), hw = w / 2, hd = d / 2;
    const pt = (u, v) => [cx + u * c + v * s, cz - u * s + v * c];
    const fp = ccw([pt(-hw, -hd), pt(hw, -hd), pt(hw, hd), pt(-hw, hd)]);
    this.prism(fp, y0, y0 + h, vBase);
  }
  cyl(cx, cz, y0, r, h, n = 8, top = true, r1 = r) {
    const fp0 = [], fp1 = [];
    for (let i = 0; i < n; i++) { const a = -(i / n) * Math.PI * 2; fp0.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); fp1.push([cx + Math.cos(a) * r1, cz + Math.sin(a) * r1]); }
    const P0 = ccw(fp0), P1 = ccw(fp1);
    let u = 0;
    for (let i = 0; i < n; i++) {
      const a = P0[i], b = P0[(i + 1) % n], a1 = P1[i], b1 = P1[(i + 1) % n];
      const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1, nx = -ez / l, nz = ex / l, ny = (r - r1) / Math.max(0.01, h);
      const nl = Math.hypot(nx, ny, nz);
      const A = this.v(a[0], y0, a[1], nx / nl, ny / nl, nz / nl, u, y0 - this.ground), B = this.v(b[0], y0, b[1], nx / nl, ny / nl, nz / nl, u + l, y0 - this.ground), C = this.v(b1[0], y0 + h, b1[1], nx / nl, ny / nl, nz / nl, u + l, y0 + h - this.ground), D = this.v(a1[0], y0 + h, a1[1], nx / nl, ny / nl, nz / nl, u, y0 + h - this.ground);
      this.quad(A, B, C, D); u += l;
    }
    if (top && r1 > 0.01) this.cap(P1, y0 + h, 1);
  }
  pyramid(fp, y0, h) {
    const [cx, cz] = centroid(fp), top = [cx, y0 + h, cz];
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i], b = fp[(i + 1) % fp.length];
      const e1 = [b[0] - a[0], 0, b[1] - a[1]], e2 = [top[0] - a[0], h, top[2] - a[1]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const A = this.v(a[0], y0, a[1], nx, ny, nz, 0, y0 - this.ground), B = this.v(b[0], y0, b[1], nx, ny, nz, Math.hypot(e1[0], e1[2]), y0 - this.ground), C = this.v(top[0], top[1], top[2], nx, ny, nz, Math.hypot(e1[0], e1[2]) / 2, top[1] - this.ground);
      this.tri(A, B, C);
    }
  }
  gable(fp, y0, h) {
    if (fp.length !== 4) { this.pyramid(fp, y0, h); return; }
    const L = (i) => Math.hypot(fp[(i + 1) % 4][0] - fp[i][0], fp[(i + 1) % 4][1] - fp[i][1]);
    const k = L(0) >= L(1) ? 0 : 1;
    const a = fp[k], b = fp[(k + 1) % 4], c = fp[(k + 2) % 4], d = fp[(k + 3) % 4];
    const m1 = [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2], m2 = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
    const yt = y0 + h;
    const face = (p, q, r, s) => {
      const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [s[0] - p[0], s[1] - p[1], s[2] - p[2]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const A = this.v(...p, nx, ny, nz, p[0], p[2]), B = this.v(...q, nx, ny, nz, q[0], q[2]), C = this.v(...r, nx, ny, nz, r[0], r[2]), D = this.v(...s, nx, ny, nz, s[0], s[2]);
      this.quad(A, B, C, D);
    };
    face([a[0], y0, a[1]], [b[0], y0, b[1]], [m2[0], yt, m2[1]], [m1[0], yt, m1[1]]);
    face([c[0], y0, c[1]], [d[0], y0, d[1]], [m1[0], yt, m1[1]], [m2[0], yt, m2[1]]);
    for (const [p, q, m] of [[d, a, m1], [b, c, m2]]) {
      const ex = q[0] - p[0], ez = q[1] - p[1], l = Math.hypot(ex, ez) || 1, nx = -ez / l, nz = ex / l;
      const A = this.v(p[0], y0, p[1], nx, 0, nz, 0, y0 - this.ground), B = this.v(q[0], y0, q[1], nx, 0, nz, l, y0 - this.ground), C = this.v(m[0], yt, m[1], nx, 0, nz, l / 2, yt - this.ground);
      this.tri(A, B, C);
    }
  }
  out() { return { position: this.p.out(), normal: this.n.out(), uv: this.uv.out(), fa: this.fa.out(), fb: this.fb.out(), fc: this.fc.out(), index: this.ix.out(), box: this.box.slice(), count: this.nv }; }
}

const DARK = [0.08, 0.08, 0.085], METAL = [0.32, 0.33, 0.34], CONC = [0.5, 0.49, 0.47], ROOFC = [0.2, 0.2, 0.2], WOOD = [0.3, 0.2, 0.12], GLASSC = [0.07, 0.1, 0.12], STEELBLUE = [0.38, 0.44, 0.48];

export function massBuilding(G, b) {
  G.setB(b, KIND.wall);
  const tiers = b.tiers || [{ fp: b.fp, y0: b.y0, y1: b.top }];
  const g = b.ground;
  if (b.taper && b.style === 'scifi') {
    const n = 6, f0 = b.fp;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, s0 = 1 - (1 - b.taper) * t0, s1 = 1 - (1 - b.taper) * t1;
      const [cx, cz] = centroid(f0), sc = (s) => f0.map(([x, z]) => [cx + (x - cx) * s, cz + (z - cz) * s]);
      const y0 = b.y0 + (b.top - b.y0) * t0, y1 = b.y0 + (b.top - b.y0) * t1;
      ringWall(G, sc(s0), sc(s1), y0, y1, g);
      if (i === n - 1) { G.kind(KIND.crownlit); G.pyramid(sc(s1), y1, b.crown || 60); }
    }
    return;
  }
  for (const t of tiers) { G.kind(KIND.wall); G.prism(t.fp, t.y0, t.y1, g, false); G.kind(KIND.roof, b.roof === 'slant' ? [0.6, 0.6, 0.6] : ROOFC); G.cap(t.fp, t.y1, 1); }
  const top = tiers[tiers.length - 1], tf = top.fp, ty = top.y1;
  const [cx, cz] = centroid(tf), area = Math.abs(polyArea(tf)), R = rng(b.seed);
  if ((b.roof === 'flat' || b.roof === 'clutter' || b.roof === 'antenna' || b.roof === 'helipad') && b.top - g > 55 && area > 300) {
    const ph = insetPoly(tf, Math.max(2.5, Math.sqrt(area) * 0.16));
    const phh = 5 + R() * 6;
    if (Math.abs(polyArea(ph)) > 60 && b.roof !== 'helipad') { G.kind(KIND.trim); G.prism(ph, ty, ty + phh, g, false); G.kind(KIND.roof, ROOFC); G.cap(ph, ty + phh, 1); }
  }
  switch (b.roof) {
    case 'gable': G.kind(KIND.darkroof, [0.22, 0.17, 0.14]); G.gable(tf, ty, Math.min(5, Math.sqrt(area) * 0.35)); break;
    case 'falsefront': { G.kind(KIND.wall); const e = tf[0], f = tf[1]; G.wall(e[0], e[1], f[0], f[1], ty, ty + 2.4, 0, g); G.kind(KIND.darkroof, [0.25, 0.2, 0.15]); G.gable(tf, ty, 1.4); break; }
    case 'spire': { G.kind(b.style === 'deco' ? KIND.crownlit : KIND.metal, STEELBLUE); const h = b.crown || Math.max(20, (b.top - g) * 0.15); const ins = insetPoly(tf, Math.sqrt(area) * 0.18); G.pyramid(ins.length >= 3 ? ins : tf, ty, h * 0.3); G.cyl(cx, cz, ty + h * 0.25, 1.2, h * 0.75, 6, true, 0.15); break; }
    case 'mast': { G.kind(KIND.crownlit); let f = tf, y = ty; for (let i = 0; i < 3; i++) { f = insetPoly(f, Math.sqrt(Math.abs(polyArea(f))) * 0.12); G.prism(f, y, y + 7, g); y += 7; } G.kind(KIND.metal, METAL); G.cyl(cx, cz, y, 3.5, (b.crown || 60) * 0.35, 8, true, 2.2); G.cyl(cx, cz, y + (b.crown || 60) * 0.35, 1.3, (b.crown || 60) * 0.65, 6, true, 0.2); break; }
    case 'crown': { G.kind(KIND.crownlit, [0.75, 0.77, 0.8]); let f = tf, y = ty; const h = b.crown || 50; for (let i = 0; i < 5; i++) { const nf = insetPoly(f, Math.sqrt(Math.abs(polyArea(f))) * 0.09); G.pyramid(f, y, h * 0.12); G.prism(nf, y, y + h * 0.1, g); f = nf; y += h * 0.1; } G.kind(KIND.metal, [0.8, 0.82, 0.85]); G.cyl(cx, cz, y, 1.6, h * 0.5, 6, true, 0.1); break; }
    case 'antenna': { G.kind(KIND.metal, METAL); G.boxAt(cx, cz, ty, 6, 6, 4, 0, g); G.cyl(cx, cz, ty + 4, 0.8, Math.min(70, (b.top - g) * 0.18), 4, true, 0.15); break; }
    case 'slant': { G.kind(KIND.roof, [0.6, 0.6, 0.62]); if (tf.length === 4) { const d = Math.sqrt(area) * 0.9; G.gable([tf[0], tf[1], tf[2], tf[3]], ty, d * 0.45); } break; }
    case 'dome': { G.kind(KIND.crownlit, [0.9, 0.92, 0.95]); const r = Math.sqrt(area / Math.PI); for (let i = 0; i < 4; i++) { const a0 = (i / 4) * Math.PI / 2, a1 = ((i + 1) / 4) * Math.PI / 2; G.cyl(cx, cz, ty + Math.sin(a0) * r * 0.6, Math.cos(a0) * r, (Math.sin(a1) - Math.sin(a0)) * r * 0.6, 12, i === 3, Math.cos(a1) * r + 0.01); } break; }
    case 'cab': { G.kind(KIND.glassbox, GLASSC); G.cyl(cx, cz, ty, 9, 6, 8, false, 10); G.kind(KIND.metal, METAL); G.cyl(cx, cz, ty + 6, 10, 1.2, 8, true, 6); G.cyl(cx, cz, ty + 7.2, 0.4, 12, 4, true, 0.1); break; }
    case 'rubble': { G.kind(KIND.rubble, [0.4, 0.38, 0.35]); for (let i = 0; i < 6; i++) G.boxAt(cx + (R() - 0.5) * Math.sqrt(area) * 0.7, cz + (R() - 0.5) * Math.sqrt(area) * 0.7, ty - 1, 3 + R() * 6, 3 + R() * 6, 1 + R() * 3, R() * 3, g); break; }
    case 'broken': { G.kind(KIND.wall); for (let i = 0; i < tf.length; i++) { const a = tf[i], bb = tf[(i + 1) % tf.length], segs = 3 + Math.floor(R() * 3); for (let s = 0; s < segs; s++) { if (R() < 0.45) continue; const t0 = s / segs, t1 = (s + 1) / segs, hh = 1 + R() * 9; G.wall(a[0] + (bb[0] - a[0]) * t0, a[1] + (bb[1] - a[1]) * t0, a[0] + (bb[0] - a[0]) * t1, a[1] + (bb[1] - a[1]) * t1, ty, ty + hh, 0, g); } } break; }
    default: break;
  }
}

function ringWall(G, f0, f1, y0, y1, g) {
  const P0 = ccw(f0), P1 = ccw(f1), n = P0.length;
  let u = 0;
  for (let i = 0; i < n; i++) {
    const a = P0[i], b = P0[(i + 1) % n], a1 = P1[i], b1 = P1[(i + 1) % n];
    const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
    const dr = Math.hypot(a[0] - a1[0], a[1] - a1[1]), ny = dr / Math.max(0.01, y1 - y0), nl = Math.hypot(1, ny);
    const nx = -ez / l / nl, nz = ex / l / nl, nny = ny / nl;
    const A = G.v(a[0], y0, a[1], nx, nny, nz, u, y0 - g), B = G.v(b[0], y0, b[1], nx, nny, nz, u + l, y0 - g), C = G.v(b1[0], y1, b1[1], nx, nny, nz, u + l, y1 - g), D = G.v(a1[0], y1, a1[1], nx, nny, nz, u, y1 - g);
    G.quad(A, B, C, D); u += l;
  }
}

export function detailBuilding(G, b, opts = {}) {
  G.setB(b, KIND.trim);
  const tiers = b.tiers || [{ fp: b.fp, y0: b.y0, y1: b.top }];
  const g = b.ground, R = rng(b.seed ^ 0x9e3779b9);
  const P = b.P, st = P.style;
  const top = tiers[tiers.length - 1], tf = top.fp, ty = top.y1;
  const [cx, cz] = centroid(tf), area = Math.abs(polyArea(tf)), size = Math.sqrt(area);
  const isOld = st === 'brick' || st === 'stone' || st === 'deco' || st === 'wood';
  for (const t of tiers) {
    const inner = insetPoly(t.fp, 0.35);
    if (b.roof !== 'gable' && b.roof !== 'falsefront' && b.roof !== 'broken' && b.roof !== 'rubble' && b.roof !== 'dome') { G.kind(KIND.trim); G.prism(inner, t.y1, t.y1 + (isOld ? 1.1 : 1.3), g, true); }
    if (isOld && t.y1 - g > 8) {
      const out = insetPoly(t.fp, -0.45);
      G.kind(KIND.trim); G.prism(out, t.y1 - 1.1, t.y1 - 0.35, g, true, true);
      if (st !== 'wood' && t === tiers[0] && t.y1 - g > 16) { const o2 = insetPoly(t.fp, -0.25); G.prism(o2, g + P.ground - 0.5, g + P.ground, g, true, true); }
    }
  }
  if (opts.street !== false && b.lot !== 'tower' && b.style !== 'metal' && b.style !== 'scifi') {
    const fp = b.fp;
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i], c = fp[(i + 1) % fp.length], ex = c[0] - a[0], ez = c[1] - a[1], l = Math.hypot(ex, ez);
      if (l < 6) continue;
      const nx = -ez / l, nz = ex / l, mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if (opts.facing && !opts.facing(mx + nx * 6, mz + nz * 6)) continue;
      const yaw = Math.atan2(ex, ez);
      if (R() < 0.5 && st !== 'glass') { G.kind(KIND.awning, [[0.12, 0.18, 0.12], [0.35, 0.06, 0.05], [0.05, 0.08, 0.2], [0.1, 0.1, 0.1], [0.45, 0.3, 0.05]][Math.floor(R() * 5)]); const w = Math.min(l - 2, 4 + R() * 8), off = (R() - 0.5) * (l - w - 1); G.boxAt(mx + nx * 0.8 + ex / l * off, mz + nz * 0.8 + ez / l * off, g + P.ground - 1.1, w, 1.6, 0.35, -yaw + Math.PI / 2, g); }
      if (R() < 0.55) { G.kind(KIND.sign, [R(), R(), R()]); const w = Math.min(l * 0.6, 3 + R() * 6); G.boxAt(mx + nx * 0.18, mz + nz * 0.18, g + P.ground - 0.95, w, 0.25, 0.7, -yaw + Math.PI / 2, g); }
      if (st === 'brick' && tiers[0].y1 - g < 40 && R() < 0.55 && l > 7) {
        G.kind(KIND.rail, [0.08, 0.08, 0.08]);
        const fw = Math.min(l * 0.55, 5.5), off = (R() - 0.5) * (l - fw - 1), px = mx + ex / l * off, pz = mz + ez / l * off;
        for (let y = g + P.ground + P.floorH - 0.2; y < tiers[0].y1 - 2; y += P.floorH) { G.boxAt(px + nx * 0.62, pz + nz * 0.62, y, fw, 1.2, 0.08, -yaw + Math.PI / 2, g); G.boxAt(px + nx * 1.2, pz + nz * 1.2, y + 0.08, fw, 0.05, 0.95, -yaw + Math.PI / 2, g); }
      }
    }
  }
  if ((st === 'glass' || st === 'future') && ty - g > 40) {
    G.kind(KIND.metal, st === 'future' ? [0.75, 0.77, 0.78] : [0.16, 0.17, 0.18]);
    for (const t of tiers) {
      const fp = t.fp;
      for (let i = 0; i < fp.length; i++) {
        const a = fp[i], c = fp[(i + 1) % fp.length], ex = c[0] - a[0], ez = c[1] - a[1], l = Math.hypot(ex, ez), nx = -ez / l, nz = ex / l;
        const bay = P.bayW * (st === 'future' ? 2 : 2), n = Math.floor(l / bay);
        for (let k = 1; k < n; k++) { const px = a[0] + ex / l * k * bay + nx * 0.12, pz = a[1] + ez / l * k * bay + nz * 0.12; G.boxAt(px, pz, t.y0 + 1, 0.16, 0.3, t.y1 - t.y0 - 1, Math.atan2(ex, ez), g); }
      }
    }
  }
  const spots = [];
  const spot = (w, d) => { for (let k = 0; k < 8; k++) { const px = cx + (R() - 0.5) * size * 0.6, pz = cz + (R() - 0.5) * size * 0.6; if (spots.every(([x, z, r]) => Math.hypot(x - px, z - pz) > r + Math.max(w, d) / 2 + 0.5)) { spots.push([px, pz, Math.max(w, d) / 2]); return [px, pz]; } } return null; };
  if (b.roof === 'water') {
    const s = spot(5, 5);
    if (s) {
      const [px, pz] = s, r = 2.2 + R() * 1.2, h = 4 + R() * 2;
      G.kind(KIND.metal, [0.15, 0.15, 0.15]);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) G.boxAt(px + dx * r * 0.62, pz + dz * r * 0.62, ty, 0.25, 0.25, 3.2, 0, g);
      G.boxAt(px, pz, ty + 3, r * 1.9, r * 1.9, 0.25, 0, g);
      G.kind(KIND.wood, [0.32 + R() * 0.1, 0.22, 0.14]); G.cyl(px, pz, ty + 3.25, r, h, 10, false);
      G.kind(KIND.darkroof, [0.12, 0.11, 0.1]); G.cyl(px, pz, ty + 3.25 + h, r * 1.05, r * 0.7, 10, true, 0.12);
    }
  }
  if (b.roof === 'helipad' && area > 500) {
    G.kind(KIND.metal, [0.3, 0.3, 0.32]);
    const s = Math.min(22, size * 0.75);
    G.cyl(cx, cz, ty + 1.3, s / 2, 0.5, 16, false);
    G.kind(KIND.helipad, [0.3, 0.3, 0.32]); G.disc(cx, cz, ty + 1.8, s / 2, 20);
    b.pad = [cx, ty + 1.8, cz, s / 2];
  }
  if (b.roof === 'clutter' || b.roof === 'water' || b.roof === 'flat' || b.roof === 'antenna') {
    const n = b.roof === 'flat' ? 1 : Math.min(7, 2 + Math.floor(area / 250));
    for (let i = 0; i < n; i++) {
      const w = 1.5 + R() * 3, d = 1.2 + R() * 2.5, h = 1 + R() * 1.8, s = spot(w, d);
      if (!s) continue;
      G.kind(KIND.metal, R() < 0.5 ? [0.45, 0.46, 0.47] : [0.25, 0.26, 0.27]); G.boxAt(s[0], s[1], ty, w, d, h, R() * 0.2, g);
    }
    if (area > 300 && R() < 0.8) { const s = spot(4, 4); if (s) { G.kind(KIND.wall); G.boxAt(s[0], s[1], ty, 3.5, 4, 3, 0, g); } }
  }
}

export class GGeo {
  constructor() { this.p = new F32(); this.n = new F32(); this.q = new F32(); this.k = new U8(); this.ix = new I32(); this.nv = 0; this.box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; }
  v(x, y, z, nx, ny, nz, q0, q1, q2, q3, kind, a = 0, b = 0, c = 0) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.q.push(q0, q1, q2, q3); this.k.push(kind, a, b, c);
    const B = this.box; if (x < B[0]) B[0] = x; if (y < B[1]) B[1] = y; if (z < B[2]) B[2] = z; if (x > B[3]) B[3] = x; if (y > B[4]) B[4] = y; if (z > B[5]) B[5] = z;
    return this.nv++;
  }
  tri(a, b, c) { this.ix.push(a, b, c); }
  out() { return { position: this.p.out(), normal: this.n.out(), rq: this.q.out(), rk: this.k.out(), index: this.ix.out(), box: this.box.slice(), count: this.nv }; }
}

export function roadStrip(G, r, s0, s1, H, kind, lift = 0.03, yOf = null, flags = [0, 0, 0], step = 0) {
  const pts = r.pts, S = r.s, w = r.width / 2;
  const at = (s) => {
    let i = 0; while (i < S.length - 2 && S[i + 1] < s) i++;
    const t = Math.max(0, Math.min(1, (s - S[i]) / Math.max(1e-6, S[i + 1] - S[i])));
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const y = yOf ? (r.points[i][1] + (r.points[i + 1][1] - r.points[i][1]) * t) : null;
    return { x: a[0] + dx * t, z: a[1] + dz * t, tx: dx / l, tz: dz / l, y };
  };
  const n = Math.max(1, Math.ceil((s1 - s0) / (step || (yOf ? 8 : 20))));
  let prev = null;
  const across = r.width > 40 ? 4 : 2;
  for (let k = 0; k <= n; k++) {
    const s = s0 + (s1 - s0) * k / n, p = at(s), nx = p.tz, nz = -p.tx;
    const row = [];
    for (let j = 0; j <= across; j++) {
      const u = -w + 2 * w * j / across, x = p.x + nx * u, z = p.z + nz * u;
      const y = (p.y !== null ? p.y : H(x, z)) + lift;
      row.push(G.v(x, y, z, 0, 1, 0, u, s, s0, s1, kind, flags[0], flags[1], flags[2]));
    }
    if (prev) for (let j = 0; j < across; j++) { const a = prev[j], b = prev[j + 1], c = row[j], d = row[j + 1]; G.tri(a, c, b); G.tri(b, c, d); }
    prev = row;
  }
}

export function flatPoly(G, poly, H, lift, kind, cell = 12, q = null) {
  const P = ccw(poly);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell)), nz = Math.max(1, Math.ceil((z1 - z0) / cell));
  const clipRect = (a0, b0, a1, b1) => { let p = P; const half = [[1, 0, a1], [-1, 0, -a0], [0, 1, b1], [0, -1, -b0]]; for (const [hx, hz, d] of half) { const out = []; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], da = a[0] * hx + a[1] * hz - d, db = b[0] * hx + b[1] * hz - d; if (da <= 0) out.push(a); if ((da < 0) !== (db < 0) && da !== db) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } } p = out; if (p.length < 3) return null; } return p; };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const piece = clipRect(x0 + i * (x1 - x0) / nx, z0 + j * (z1 - z0) / nz, x0 + (i + 1) * (x1 - x0) / nx, z0 + (j + 1) * (z1 - z0) / nz);
    if (!piece) continue;
    const o = G.nv;
    for (const [x, z] of piece) G.v(x, H(x, z) + lift, z, 0, 1, 0, x, z, q ? q[0] : 0, q ? q[1] : 0, kind);
    for (let k = 1; k < piece.length - 1; k++) G.tri(o, o + k, o + k + 1);
  }
}

export function curb(G, poly, H, lift, kind, skip) {
  const P = ccw(poly), n = P.length;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez);
    if (l < 0.5 || (skip && skip(a, b))) continue;
    const nx = -ez / l, nz = ex / l, m = Math.max(1, Math.ceil(l / 24));
    let prev = null;
    for (let k = 0; k <= m; k++) {
      const x = a[0] + ex * k / m, z = a[1] + ez * k / m, g = H(x, z);
      const r0 = G.v(x, g + 0.025, z, nx, 0, nz, k / m * l, 0, 0, 0, kind), r1 = G.v(x, g + lift, z, nx, 0, nz, k / m * l, lift, 0, 0, kind);
      if (prev) { G.tri(prev[0], r0, prev[1]); G.tri(prev[1], r0, r1); }
      prev = [r0, r1];
    }
  }
}
