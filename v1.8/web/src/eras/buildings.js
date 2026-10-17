// Roadster 88 era buildings: procedural builders for every era structure (frontier false fronts, hotel, bank, church, livery, cabins, depot, water tower, windmill, 4-4-0 locomotive and cars, ranch houses, gas station, strip mall, street furniture, power lines, billboards, near-future mid-rises, EV hub, maglev, wind turbines, ruins, far-future spires, arches and pads, basalt columns). Local frame: front at z = 0 facing +z, depth toward -z, ground at y = 0.
import { Vector3 as V } from 'three/webgpu';
import { C } from './lib.js';

const W = (pat, wear = 0.3, bare = 0) => [pat, wear, bare, 0];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

export function win(k, x, y, w, h, o = {}) {
  const z = o.z || 0, ft = o.frameTint || C.white, fr = o.frame || 'wood', t = o.t || 0.09;
  k.box('glass', x, y, z + 0.015, w, h, 0.03, { tint: o.glass || [0.025, 0.03, 0.035], aux: [o.cool || 0, o.lit === undefined ? 0.5 : o.lit, o.seed || 0, o.broken || 0], skip: ['nz'] });
  const fa = fr === 'wood' ? W(2, 0.2) : [0, 0.4, 0.6, 0];
  k.box(fr, x, y - t, z + 0.04, w + t * 2.4, t, 0.1, { tint: ft, aux: fa });
  k.box(fr, x, y + h, z + 0.04, w + t * 2, t, 0.08, { tint: ft, aux: fa });
  k.box(fr, x - w / 2 - t / 2, y, z + 0.04, t, h, 0.08, { tint: ft, aux: fa });
  k.box(fr, x + w / 2 + t / 2, y, z + 0.04, t, h, 0.08, { tint: ft, aux: fa });
  if (o.mullion) { k.box(fr, x, y, z + 0.045, 0.05, h, 0.05, { tint: ft, aux: fa }); k.box(fr, x, y + h * 0.55, z + 0.045, w, 0.05, 0.05, { tint: ft, aux: fa }); }
}

export function door(k, x, w = 1.05, h = 2.3, o = {}) {
  const z = o.z || 0;
  k.box('wood', x, 0, z + 0.03, w, h, 0.06, { tint: o.tint || C.darkwood, aux: W(1, 0.3) });
  if (o.glass) k.box('glass', x, h * 0.45, z + 0.065, w * 0.7, h * 0.42, 0.01, { tint: [0.03, 0.03, 0.035], aux: [0, 0.6, 3, 0] });
  k.box('wood', x, h, z + 0.06, w + 0.2, 0.1, 0.1, { tint: o.trim || C.white, aux: W(2, 0.2) });
}

function porch(k, w, h, o = {}) {
  const depth = o.depth || 3, wear = o.wear || 0.4;
  k.box('wood', 0, -0.05, depth / 2, w + 0.3, 0.38, depth, { tint: C.bare, aux: W(2, wear, 1), bottom: false });
  const n = Math.max(2, Math.round(w / 3.2));
  for (let i = 0; i <= n; i++) { const x = -w / 2 + (i / n) * w; k.box('wood', x, 0.33, depth - 0.15, 0.16, h - 0.33, 0.16, { tint: o.post || C.bare, aux: W(2, wear, o.post ? 0 : 1) }); }
  k.obox('roof', 0, h + 0.15, depth / 2 - 0.05, w + 0.4, 0.07, depth + 0.4, 0.13, 0, 0, { tint: o.roof || C.tin, aux: [0, wear, 0, 0], bottom: true });
  if (o.rail) for (let i = 0; i < n; i++) { const x0 = -w / 2 + (i / n) * w, x1 = -w / 2 + ((i + 1) / n) * w; k.box('wood', (x0 + x1) / 2, 0.9, depth - 0.15, x1 - x0, 0.07, 0.06, { tint: C.bare, aux: W(2, wear, 1) }); }
  k.collider(0, 0.12, depth / 2, w / 2 + 0.15, 0.2, depth / 2, 0, 'deck');
}

export function falseFront(k, o) {
  const w = o.w, d = o.d || 16, st = o.stories || 1, h = st === 2 ? 7.2 : 4.4, ff = o.ff || (st === 2 ? 1.6 : 2.4);
  const col = o.color || C.bare, trim = o.trim || C.white, pat = o.pat || 0, wear = o.wear === undefined ? 0.35 : o.wear, bare = o.bare ? 1 : 0;
  k.box('masonry', 0, -0.7, -d / 2, w + 0.1, 0.75, d + 0.1, { tint: C.stone, aux: [1, 0, 0, 0] });
  k.box('wood', 0, 0, -d / 2 - 0.1, w, h, d - 0.2, { tint: col, aux: W(pat, wear, bare) });
  k.gable('roof', 0, h, -d / 2 - 0.1, w, d - 0.2, w * 0.3, { tint: o.roofTint || C.tin, aux: [o.roofPat || 0, wear, 0, 0], overhang: 0.25, overhangD: 0.15, gableMat: 'wood', gable: { tint: col, aux: W(pat, wear, bare) } });
  k.box('wood', 0, 0, 0.0, w + 0.24, h + ff, 0.22, { tint: col, aux: W(pat, wear, bare) });
  k.box('wood', 0, h + ff, 0.12, w + 0.7, 0.28, 0.48, { tint: trim, aux: W(2, wear) });
  k.box('wood', 0, h + ff - 0.42, 0.09, w + 0.44, 0.14, 0.32, { tint: trim, aux: W(2, wear) });
  for (const s of [-1, 1]) k.box('wood', s * (w / 2 + 0.05), 0, 0.12, 0.2, h + ff, 0.3, { tint: trim, aux: W(2, wear) });
  if (o.sign) k.sign(o.sign, 0, h + ff * 0.42 + (st === 2 ? 0.25 : 0.1), 0.12, Math.min(w * 0.84, 11), Math.min(w * 0.84, 11) / 8, 0, o.glow || 0);
  const dx = o.doorX === undefined ? 0 : o.doorX;
  door(k, dx, 1.1, 2.4, { z: 0.11, tint: o.doorTint || shade(col, 0.6), trim, glass: true });
  const ww = Math.min(1.7, (w - 2.4) / 2 - 0.5);
  if (ww > 0.6) for (const s of [-1, 1]) win(k, dx + s * (0.55 + 0.45 + ww / 2), 0.75, ww, 1.9, { z: 0.11, frameTint: trim, mullion: true, lit: o.lit, seed: o.seed });
  if (st === 2) { const n = Math.max(2, Math.floor(w / 3)); for (let i = 0; i < n; i++) win(k, -w / 2 + (i + 0.5) * w / n, 4.2, 1.0, 1.7, { z: 0.11, frameTint: trim, lit: o.lit, seed: (o.seed || 0) + 1 }); }
  for (const s of [-1, 1]) for (let j = 0; j < 2; j++) { k.push(s * (w / 2), 0, -d * (0.3 + j * 0.35), s * Math.PI / 2); win(k, 0, 1.0, 0.9, 1.4, { frameTint: trim, lit: o.lit, seed: (o.seed || 0) + 2 + j }); k.pop(); }
  if (o.porch !== false) porch(k, w, st === 2 ? 3.3 : 3.2, { wear, roof: o.roofTint, rail: o.rail });
  k.collider(0, (h + ff) / 2, -d / 2, w / 2 + 0.1, (h + ff) / 2, d / 2);
  return { cls: 'wood', breakV: o.breakV || 17, foot: [w / 2 + 0.3, d / 2 + 2, -d / 2 + 1.5], h: h + ff };
}

export function hotel(k, o) {
  const w = o.w, d = o.d || 18, h = 7.4, col = o.color || C.white, trim = o.trim || C.green, wear = o.wear === undefined ? 0.3 : o.wear;
  k.box('masonry', 0, -0.7, -d / 2, w + 0.1, 0.75, d + 0.1, { tint: C.stone, aux: [1, 0, 0, 0] });
  k.box('wood', 0, 0, -d / 2, w, h, d, { tint: col, aux: W(0, wear) });
  k.hip('roof', 0, h, -d / 2, w, d, 2.2, { tint: o.roofTint || C.shingle, aux: [1, wear, 0, 0], overhang: 0.4 });
  k.box('wood', 0, h - 0.05, 0.02, w + 0.4, 0.3, 0.3, { tint: trim, aux: W(2, wear) });
  if (o.sign) k.sign(o.sign, 0, h + 0.75, 0.1, Math.min(w * 0.7, 10), Math.min(w * 0.7, 10) / 8, 0, o.glow || 0);
  k.box('wood', 0, h, 0.0, Math.min(w * 0.74, 10.4), 1.5, 0.12, { tint: trim, aux: W(2, wear) });
  door(k, 0, 1.6, 2.6, { z: 0, tint: shade(trim, 0.7), trim: C.white, glass: true });
  const n = Math.max(3, Math.floor(w / 2.6));
  for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * w / n; if (Math.abs(x) > 1.4) win(k, x, 0.8, 1.2, 1.9, { frameTint: trim, mullion: true, lit: o.lit, seed: (o.seed || 0) + i }); win(k, x, 4.3, 1.0, 1.8, { frameTint: trim, lit: o.lit, seed: (o.seed || 0) + 10 + i }); }
  for (const s of [-1, 1]) for (let j = 0; j < 3; j++) { k.push(s * (w / 2), 0, -d * (0.2 + j * 0.3), s * Math.PI / 2); win(k, 0, 0.9, 1.0, 1.7, { frameTint: trim, lit: o.lit, seed: 30 + j }); win(k, 0, 4.4, 1.0, 1.7, { frameTint: trim, lit: o.lit, seed: 40 + j }); k.pop(); }
  const dep = 3.2;
  k.box('wood', 0, -0.05, dep / 2, w + 0.3, 0.38, dep, { tint: C.bare, aux: W(2, wear, 1) });
  k.box('wood', 0, 3.3, dep / 2, w + 0.3, 0.2, dep, { tint: C.bare, aux: W(2, wear, 1), bottom: true });
  const m = Math.max(3, Math.round(w / 3));
  for (let i = 0; i <= m; i++) { const x = -w / 2 + (i / m) * w; k.box('wood', x, 0.33, dep - 0.15, 0.17, 6.3, 0.17, { tint: trim, aux: W(2, wear) }); }
  for (let i = 0; i < m; i++) { const x0 = -w / 2 + (i / m) * w, x1 = -w / 2 + ((i + 1) / m) * w; k.box('wood', (x0 + x1) / 2, 4.35, dep - 0.15, x1 - x0, 0.08, 0.07, { tint: C.white, aux: W(2, wear) }); for (let b = 1; b < 6; b++) k.box('wood', x0 + (x1 - x0) * b / 6, 3.5, dep - 0.15, 0.04, 0.85, 0.04, { tint: C.white, aux: W(2, wear) }); }
  k.obox('roof', 0, 6.75, dep / 2 - 0.05, w + 0.4, 0.07, dep + 0.4, 0.14, 0, 0, { tint: o.roofTint || C.tin, aux: [0, wear, 0, 0], bottom: true });
  k.collider(0, 0.12, dep / 2, w / 2 + 0.15, 0.2, dep / 2, 0, 'deck');
  k.collider(0, h / 2, -d / 2, w / 2, h / 2, d / 2);
  return { cls: 'wood', breakV: o.breakV || 20, foot: [w / 2 + 0.4, d / 2 + 2, -d / 2 + 1.6], h: h + 2 };
}

export function bank(k, o) {
  const w = o.w, d = o.d || 15, h = 6.2, col = o.color || C.brick;
  k.box('masonry', 0, -0.6, -d / 2, w + 0.3, 0.7, d + 0.3, { tint: C.stone, aux: [1, 0, 0, 0] });
  k.box('masonry', 0, 0, -d / 2, w, h, d, { tint: col, aux: [0, 0, 0, 0] });
  k.box('roof', 0, h, -d / 2, w + 0.1, 0.15, d + 0.1, { tint: C.asphaltRoof, aux: [3, 0.4, 0, 0] });
  k.box('masonry', 0, h, 0.0, w + 0.5, 0.9, 0.5, { tint: shade(col, 1.15), aux: [1, 0, 0, 0] });
  k.box('masonry', 0, h + 0.85, 0.05, w + 0.7, 0.25, 0.6, { tint: C.stone, aux: [1, 0, 0, 0] });
  for (const s of [-1, 1]) k.box('masonry', s * (w / 2 - 0.25), 0, 0.12, 0.6, h, 0.3, { tint: C.stone, aux: [1, 0, 0, 0] });
  if (o.sign) k.sign(o.sign, 0, h + 0.4, 0.27, Math.min(w * 0.7, 8), Math.min(w * 0.7, 8) / 8, 0, o.glow || 0);
  door(k, 0, 1.6, 2.8, { z: 0.02, tint: C.darkwood, trim: C.stone, glass: true });
  k.box('masonry', 0, 0, 0.6, 3.2, 0.25, 1.2, { tint: C.stone, aux: [1, 0, 0, 0] });
  for (const s of [-1, 1]) win(k, s * (w / 4 + 0.6), 1.0, 1.4, 2.6, { frame: 'wood', frameTint: C.darkwood, mullion: true, lit: o.lit, seed: o.seed });
  for (const s of [-1, 1]) { k.push(s * (w / 2), 0, -d * 0.5, s * Math.PI / 2); win(k, -2.5, 1.2, 1.2, 2.2, { frameTint: C.darkwood, lit: o.lit }); win(k, 2.5, 1.2, 1.2, 2.2, { frameTint: C.darkwood, lit: o.lit }); k.pop(); }
  k.box('wood', 0, -0.05, 1.5, w + 0.3, 0.38, 3, { tint: C.bare, aux: W(2, 0.4, 1) });
  k.collider(0, h / 2, -d / 2, w / 2 + 0.2, h / 2 + 0.5, d / 2);
  return { cls: 'brick', breakV: o.breakV || 32, foot: [w / 2 + 0.4, d / 2 + 2, -d / 2 + 1.5], h: h + 1.2 };
}

export function church(k, o) {
  const w = 9, d = 18, h = 5.6, col = o.color || C.white, wear = o.wear === undefined ? 0.25 : o.wear;
  k.box('masonry', 0, -0.7, -d / 2, w + 0.2, 0.75, d + 0.2, { tint: C.stone, aux: [1, 0, 0, 0] });
  k.box('wood', 0, 0, -d / 2, w, h, d, { tint: col, aux: W(0, wear) });
  k.gable('roof', 0, h, -d / 2, w, d, 4.2, { tint: C.shingle, aux: [1, wear, 0, 0], overhang: 0.4, overhangD: 0.3, gableMat: 'wood', gable: { tint: col, aux: W(0, wear) } });
  const tw = 3.0;
  k.box('wood', 0, 0, -tw / 2 + 0.4, tw, h + 4.6, tw, { tint: col, aux: W(0, wear) });
  k.box('wood', 0, h + 4.6, -tw / 2 + 0.4, tw + 0.3, 0.25, tw + 0.3, { tint: C.white, aux: W(2, wear) });
  for (const s of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { k.push(0, 0, -tw / 2 + 0.4, s); k.box('glass', 0, h + 2.4, tw / 2 + 0.01, 0.9, 1.6, 0.02, { tint: [0.02, 0.02, 0.02], aux: [0, 0, 0, 1] }); k.pop(); }
  k.pyramid('roof', 0, h + 4.85, -tw / 2 + 0.4, tw + 0.2, tw + 0.2, 6.5, { tint: C.shingle, aux: [1, wear, 0, 0] });
  k.cyl('metal', 0, h + 11.3, -tw / 2 + 0.4, 0.04, 0.04, 1.4, 6, { tint: C.black, aux: [0, 0.4, 0.8, 0] });
  k.box('metal', 0, h + 12.2, -tw / 2 + 0.4, 0.7, 0.06, 0.06, { tint: C.black, aux: [0, 0.4, 0.8, 0] });
  door(k, 0, 1.6, 2.7, { z: 0.01, tint: shade(C.barn, 0.8), trim: C.white });
  win(k, 0, 3.6, 0.8, 1.2, { z: 0.01, frameTint: C.white, lit: 0.2 });
  for (const s of [-1, 1]) for (let j = 0; j < 4; j++) { k.push(s * (w / 2), 0, -4 - j * 3.6, s * Math.PI / 2); win(k, 0, 1.2, 0.95, 2.6, { frameTint: C.white, lit: 0.3, mullion: true }); k.pop(); }
  k.box('wood', 0, -0.05, 1.0, 3.4, 0.45, 2.0, { tint: C.bare, aux: W(2, wear, 1) });
  k.collider(0, h / 2, -d / 2, w / 2, h / 2 + 1, d / 2);
  k.collider(0, (h + 4.6) / 2, -tw / 2 + 0.4, tw / 2, (h + 4.6) / 2, tw / 2);
  return { cls: 'wood', breakV: 22, foot: [w / 2 + 1, d / 2 + 1.5, -d / 2 + 1], h: h + 12 };
}

export function barn(k, o) {
  const w = o.w || 14, d = o.d || 20, h = 4.2, col = o.color || C.barn, wear = o.wear === undefined ? 0.45 : o.wear;
  k.box('wood', 0, 0, -d / 2, w, h, d, { tint: col, aux: W(1, wear) });
  const k1 = w * 0.32, h1 = 2.4, h2 = 1.6;
  for (const s of [-1, 1]) {
    k.obox('roof', s * (w / 2 - k1 / 2 + 0.15), h + h1 / 2, -d / 2, Math.hypot(k1, h1) + 0.3, 0.1, d + 0.5, 0, 0, -s * Math.atan2(h1, k1) + s * 0, { tint: o.roofTint || C.tin, aux: [0, wear, 0, 0], bottom: true });
    const inner = w / 2 - k1;
    k.obox('roof', s * inner / 2, h + h1 + h2 / 2, -d / 2, Math.hypot(inner, h2) + 0.1, 0.1, d + 0.5, 0, 0, -s * Math.atan2(h2, inner), { tint: o.roofTint || C.tin, aux: [0, wear, 0, 0], bottom: true });
  }
  const P = [[-w / 2, h], [-w / 2 + k1, h + h1], [0, h + h1 + h2], [w / 2 - k1, h + h1], [w / 2, h]];
  for (const z of [0, -d]) {
    k.push(0, 0, z, z === 0 ? 0 : Math.PI);
    for (let i = 0; i < 4; i++) k.face('wood', [new V(0, h, 0.0), new V(P[i][0], P[i][1], 0.0), new V(P[i + 1][0], P[i + 1][1], 0.0)].reverse(), new V(0, 0, 1), new V(1, 0, 0), new V(0, 1, 0), { tint: col, aux: W(1, wear) });
    k.pop();
  }
  k.box('wood', 0, 0, 0.06, 4.2, 3.6, 0.1, { tint: shade(col, 0.75), aux: W(1, wear) });
  for (const s of [-1, 1]) k.obox('wood', 0, 1.8, 0.13, 0.15, 5.0, 0.06, 0, 0, s * 0.85, { tint: C.white, aux: W(2, wear) });
  k.box('wood', 0, 4.6, 0.05, 1.6, 1.4, 0.1, { tint: shade(col, 0.7), aux: W(1, wear) });
  if (o.sign) k.sign(o.sign, 0, 6.6, 0.1, 5, 0.62, 0, 0);
  k.collider(0, (h + h1 + h2) / 2, -d / 2, w / 2, (h + h1 + h2) / 2, d / 2);
  return { cls: 'wood', breakV: 16, foot: [w / 2 + 0.5, d / 2 + 0.5, -d / 2], h: h + h1 + h2 };
}

export function cabin(k, o) {
  const w = o.w || 7, d = o.d || 6, h = 2.9, col = o.color || C.bare, wear = o.wear === undefined ? 0.45 : o.wear;
  k.box('masonry', 0, -0.5, -d / 2, w + 0.1, 0.55, d + 0.1, { tint: C.stone, aux: [1, 0, 0, 0] });
  k.box('wood', 0, 0, -d / 2, w, h, d, { tint: col, aux: W(o.pat || 0, wear, o.bare ? 1 : 0) });
  k.push(0, 0, -d / 2, Math.PI / 2); k.gable('roof', 0, h, 0, d, w, 1.9, { tint: o.roofTint || C.shingle, aux: [1, wear, 0, 0], overhang: 0.45, overhangD: 0.35, gableMat: 'wood', gable: { tint: col, aux: W(o.pat || 0, wear, o.bare ? 1 : 0) } }); k.pop();
  k.box('masonry', w / 2 - 0.9, 0, -d * 0.7, 0.9, h + 2.4, 0.9, { tint: C.stone, aux: [1, 0, 0, 0] });
  door(k, -0.8, 0.95, 2.1, { tint: shade(col, 0.6), trim: o.trim || C.white });
  win(k, 1.6, 0.9, 1.0, 1.2, { frameTint: o.trim || C.white, mullion: true, lit: o.lit, seed: o.seed });
  for (const s of [-1, 1]) { k.push(s * w / 2, 0, -d / 2, s * Math.PI / 2); win(k, 0, 0.9, 0.9, 1.1, { frameTint: o.trim || C.white, lit: o.lit, seed: (o.seed || 0) + 3 }); k.pop(); }
  if (o.porch) { k.box('wood', 0, -0.05, 1.1, w, 0.32, 2.2, { tint: C.bare, aux: W(2, wear, 1) }); for (const s of [-1, 1]) k.box('wood', s * (w / 2 - 0.2), 0.27, 2.0, 0.13, 2.2, 0.13, { tint: C.bare, aux: W(2, wear, 1) }); k.obox('roof', 0, 2.55, 1.0, w + 0.3, 0.06, 2.4, 0.18, 0, 0, { tint: o.roofTint || C.shingle, aux: [1, wear, 0, 0], bottom: true }); }
  k.collider(0, h / 2 + 0.5, -d / 2, w / 2, h / 2 + 0.5, d / 2);
  return { cls: 'wood', breakV: 13, foot: [w / 2 + 0.5, d / 2 + (o.porch ? 2.3 : 0.5), -d / 2 + (o.porch ? 1.1 : 0)], h: h + 2.4 };
}

export function depot(k, o) {
  const L = o.l || 22, d = 7.5, h = 4.4, col = o.color || [0.62, 0.45, 0.18], trim = o.trim || [0.25, 0.15, 0.08], wear = o.wear === undefined ? 0.3 : o.wear;
  k.box('masonry', 0, -0.6, -d / 2, L + 0.1, 0.65, d + 0.1, { tint: C.stone, aux: [1, 0, 0, 0] });
  k.box('wood', 0, 0, -d / 2, L, h, d, { tint: col, aux: W(1, wear) });
  k.box('wood', 0, 0, -d / 2, L + 0.05, 1.1, d + 0.05, { tint: trim, aux: W(0, wear) });
  k.push(0, 0, -d / 2, Math.PI / 2); k.gable('roof', 0, h, 0, d, L, 2.6, { tint: o.roofTint || C.shingle, aux: [1, wear, 0, 0], overhang: 2.6, overhangD: 0.8, gableMat: 'wood', gable: { tint: col, aux: W(1, wear) } }); k.pop();
  for (const z of [0.3, -d - 0.3]) for (let i = 0; i < 7; i++) { const x = -L / 2 + 1 + i * (L - 2) / 6; k.obox('wood', x, h - 0.6, z + (z > 0 ? 0.9 : -0.9), 0.14, 1.8, 0.14, z > 0 ? -0.8 : 0.8, 0, 0, { tint: trim, aux: W(2, wear) }); }
  for (let i = 0; i < 4; i++) win(k, -L / 2 + 2.5 + i * 3.2, 1.2, 1.1, 1.9, { frameTint: trim, mullion: true, lit: o.lit, seed: i });
  door(k, 5.2, 1.2, 2.5, { tint: trim, trim, glass: true });
  k.box('wood', 8.3, 0, 0.05, 2.8, 3.0, 0.08, { tint: shade(col, 0.8), aux: W(1, wear) });
  k.box('wood', -3, 0, 0.15, 3.0, 2.9, 1.2, { tint: col, aux: W(1, wear) });
  win(k, -3, 1.2, 2.2, 1.5, { z: 0.75, frameTint: trim, lit: o.lit });
  for (const s of [-1, 1]) if (o.sign) k.sign(o.sign, s * (L / 2 + 0.05), h + 1.1, -d / 2, 4.2, 0.52, s * Math.PI / 2, o.glow || 0);
  const pw = o.platform || 4.2, pl = L + 18;
  k.box('wood', 0, -0.1, pw / 2, pl, 0.95, pw, { tint: C.bare, aux: W(2, 0.5, 1) });
  k.collider(0, h / 2, -d / 2, L / 2, h / 2 + 1, d / 2);
  k.collider(0, 0.38, pw / 2, pl / 2, 0.42, pw / 2, 0, 'deck');
  return { cls: 'wood', breakV: 19, foot: [pl / 2, d / 2 + pw / 2 + 0.5, (pw - d) / 2], h: h + 2.8 };
}

export function waterTower(k, o) {
  const r = 3.3, legH = 8.5, th = 4.6, wear = o.wear === undefined ? 0.35 : o.wear;
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [2.2, 2.2], [-2.2, 2.2]]) { k.obox('wood', x * 0.94, legH / 2, z * 0.94, 0.32, legH, 0.32, -z * 0.012, 0, x * 0.012, { tint: C.darkwood, aux: W(2, wear, 1) }); }
  for (const y of [2.8, 5.8]) { for (const s of [-1, 1]) { k.box('wood', 0, y, s * 2.1, 4.4, 0.18, 0.12, { tint: C.darkwood, aux: W(2, wear, 1) }); k.box('wood', s * 2.1, y, 0, 0.12, 0.18, 4.4, { tint: C.darkwood, aux: W(2, wear, 1) }); } }
  for (const s of [-1, 1]) { k.obox('wood', 0, legH * 0.5, s * 2.15, 0.1, 6.2, 0.08, 0, 0, s * 0.7, { tint: C.darkwood, aux: W(2, wear, 1) }); k.obox('wood', s * 2.15, legH * 0.5, 0, 0.08, 6.2, 0.1, s * 0.7, 0, 0, { tint: C.darkwood, aux: W(2, wear, 1) }); }
  k.box('wood', 0, legH, 0, 5.4, 0.3, 5.4, { tint: C.darkwood, aux: W(2, wear, 1), bottom: true });
  k.cyl('wood', 0, legH + 0.3, 0, r, r, th, 18, { tint: o.color || [0.38, 0.27, 0.17], aux: W(1, wear, o.bare === false ? 0 : 1), cap: false });
  for (const y of [0.6, 1.8, 3.0, 4.1]) k.cyl('metal', 0, legH + 0.3 + y, 0, r + 0.03, r + 0.03, 0.08, 18, { tint: C.black, aux: [0, 0.6, 0.6, 0.5], cap: false });
  k.cyl('roof', 0, legH + 0.3 + th, 0, 0.15, r + 0.3, 1.8, 18, { tint: C.shingle, aux: [1, wear, 0, 0] });
  k.obox('metal', r + 0.9, legH - 0.2, 0, 2.4, 0.35, 0.35, 0, 0, -0.5, { tint: C.black, aux: [0, 0.5, 0.6, 0.6] });
  if (o.sign) k.sign(o.sign, 0, legH + 2.6, r + 0.06, 3.8, 0.47, 0, 0);
  k.collider(0, legH / 2, 0, 2.5, legH / 2, 2.5);
  k.collider(0, legH + 2.5, 0, r, 2.4, r);
  return { cls: 'wood', breakV: 15, foot: [3.6, 3.6, 0], h: legH + th + 2 };
}

export function windmill(k, o) {
  const h = 10;
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.obox('metal', x * 0.6, h / 2, z * 0.6, 0.09, h + 0.2, 0.09, -z * 0.09, 0, x * 0.09, { tint: C.steel, aux: [0, 0.6, 0.7, 0.6] });
  for (const y of [2, 4.5, 7]) { const s = 1.25 - y * 0.08; k.box('metal', 0, y, s, s * 2, 0.06, 0.06, { tint: C.steel, aux: [0, 0.6, 0.7, 0.6] }); k.box('metal', 0, y, -s, s * 2, 0.06, 0.06, { tint: C.steel, aux: [0, 0.6, 0.7, 0.6] }); k.box('metal', s, y, 0, 0.06, 0.06, s * 2, { tint: C.steel, aux: [0, 0.6, 0.7, 0.6] }); k.box('metal', -s, y, 0, 0.06, 0.06, s * 2, { tint: C.steel, aux: [0, 0.6, 0.7, 0.6] }); }
  k.box('metal', 0, h, 0, 0.4, 0.4, 1.2, { tint: C.steel, aux: [0, 0.5, 0.7, 0.5] });
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; k.obox('metal', Math.cos(a) * 1.1, h + 0.2 + Math.sin(a) * 1.1, 0.75, 0.32, 1.7, 0.02, 0, 0.35, -a + Math.PI / 2, { tint: [0.55, 0.55, 0.53], aux: [0, 0.6, 0.6, 0.7] }); }
  k.box('metal', 0, h + 0.1, -1.6, 0.04, 1.2, 1.6, { tint: [0.6, 0.6, 0.58], aux: [0, 0.6, 0.6, 0.6] });
  k.collider(0, h / 2, 0, 0.8, h / 2, 0.8, 0, 'pole');
  return { cls: 'steel', breakV: 12, foot: [1.4, 1.4, 0], h: h + 2 };
}

function wheel(k, x, y, z, r, o) { k.cyl('metal', x + (x > 0 ? 0.06 : 0.06), y, z, r, r, 0.12, 14, { ...o, rz: Math.PI / 2 }); }

export function locomotive(k, o) {
  const blk = { tint: [0.035, 0.035, 0.04], aux: [0, 0.45, 0.7, o.rust || 0] }, red = { tint: [0.4, 0.06, 0.04], aux: W(0, 0.2) }, brass = { tint: [0.6, 0.45, 0.16], aux: [0, 0.3, 1, 0] };
  const g = 1.435 / 2;
  k.box('metal', 0, 0.85, -1, 1.8, 0.35, 11.5, blk);
  k.cyl('metal', 0, 2.25, -1.8, 0.82, 0.82, 6.6, 18, { ...blk, rx: Math.PI / 2 });
  k.cyl('metal', 0, 2.25, 4.8, 0.86, 0.86, 0.4, 18, { ...blk, rx: Math.PI / 2 });
  k.cyl('metal', 0, 3.0, 4.1, 0.38, 0.32, 1.1, 12, blk);
  k.cyl('metal', 0, 4.1, 4.1, 0.75, 0.38, 0.9, 12, blk);
  k.cyl('metal', 0, 3.0, 2.0, 0.42, 0.42, 0.7, 12, brass);
  k.cyl('metal', 0, 3.0, 0.2, 0.38, 0.38, 0.55, 12, brass);
  k.box('metal', 0, 3.2, 5.2, 0.6, 0.55, 0.6, blk);
  k.box('light', 0, 3.35, 5.52, 0.36, 0.3, 0.02, { tint: [1, 0.85, 0.55], aux: [0, o.lamp || 0, 0, 0] });
  k.box('wood', 0, 1.0, -3.6, 2.7, 2.9, 2.6, red);
  k.box('roof', 0, 3.9, -3.6, 3.1, 0.12, 3.0, { tint: C.black, aux: [3, 0.3, 0, 0] });
  for (const s of [-1, 1]) { k.push(s * 1.36, 0, -3.6, s * Math.PI / 2); win(k, 0, 2.1, 1.1, 0.9, { frameTint: [0.3, 0.05, 0.03], lit: 0.3 }); k.pop(); }
  for (const [z, r] of [[-1.2, 0.88], [0.9, 0.88]]) for (const s of [-1, 1]) { wheel(k, s * (g + 0.06), r, z, r, brass); }
  for (const z of [3.2, 4.3]) for (const s of [-1, 1]) wheel(k, s * (g + 0.06), 0.45, z, 0.45, blk);
  for (const s of [-1, 1]) k.box('metal', s * (g + 0.2), 0.8, -0.15, 0.06, 0.12, 2.2, { tint: [0.5, 0.5, 0.52], aux: [0, 0.3, 1, 0] });
  k.obox('metal', 0, 0.55, 5.9, 1.9, 0.9, 1.2, 0.6, 0, 0, { tint: [0.4, 0.06, 0.04], aux: [0, 0.5, 0.4, o.rust || 0] });
  for (const s of [-1, 1]) k.cyl('metal', s * 0.9, 1.35, 4.4, 0.32, 0.32, 1.2, 10, { ...blk, rx: Math.PI / 2 });
  k.box('metal', 0, 0.85, -8.6, 2.4, 0.3, 5.6, blk);
  k.box('wood', 0, 1.15, -8.6, 2.6, 1.9, 5.4, red);
  k.box('roof', 0, 3.0, -7.2, 2.2, 0.5, 2.4, { tint: [0.06, 0.05, 0.05], aux: [3, 0.6, 0, 0] });
  for (const z of [-7.0, -7.8, -9.4, -10.2]) for (const s of [-1, 1]) wheel(k, s * (g + 0.06), 0.45, z, 0.45, blk);
  if (o.sign) k.sign(o.sign, 1.33, 2.0, -8.6, 3.6, 0.45, Math.PI / 2, 0);
  k.collider(0, 2.0, 0.5, 1.4, 2.0, 5.8);
  k.collider(0, 1.6, -8.6, 1.35, 1.6, 2.8);
  return { cls: 'steel', breakV: 999, foot: [1.6, 11.5, -2.5], h: 5 };
}

export function railcar(k, o) {
  const L = o.l || 11, red = { tint: o.color || [0.38, 0.12, 0.07], aux: W(1, o.wear || 0.4) }, blk = { tint: [0.04, 0.04, 0.045], aux: [0, 0.5, 0.7, o.rust || 0.2] };
  k.box('metal', 0, 0.85, 0, 2.5, 0.3, L, blk);
  if (o.passenger) {
    k.box('wood', 0, 1.15, 0, 2.8, 2.7, L - 0.6, { tint: o.color || [0.2, 0.25, 0.18], aux: W(0, o.wear || 0.3) });
    k.box('roof', 0, 3.85, 0, 2.9, 0.35, L, { tint: C.black, aux: [3, 0.4, 0, 0] });
    for (const s of [-1, 1]) { k.push(s * 1.4, 0, 0, s * Math.PI / 2); for (let i = 0; i < 7; i++) win(k, -L / 2 + 1.4 + i * (L - 2.8) / 6, 2.1, 0.7, 0.9, { frameTint: [0.5, 0.4, 0.2], lit: 0.5 }); k.pop(); }
  } else {
    k.box('wood', 0, 1.15, 0, 2.8, 2.9, L, red);
    k.box('roof', 0, 4.05, 0, 3.0, 0.12, L + 0.1, { tint: shade(red.tint, 0.8), aux: [0, 0.5, 0, 0] });
    for (const s of [-1, 1]) k.box('wood', s * 1.42, 1.3, 0, 0.05, 2.3, 2.0, { tint: shade(red.tint, 0.8), aux: W(1, 0.5) });
  }
  for (const z of [-L / 2 + 1.2, -L / 2 + 2.2, L / 2 - 2.2, L / 2 - 1.2]) for (const s of [-1, 1]) wheel(k, s * 0.78, 0.45, z, 0.45, blk);
  k.collider(0, 2.2, 0, 1.45, 2.2, L / 2);
  return { cls: 'steel', breakV: 999, foot: [1.6, L / 2, 0], h: 4.2 };
}

export function ranch(k, o) {
  const w = o.w || 15, d = o.d || 10, h = 3.0, col = o.color || C.stucco;
  k.box('plaster', 0, -0.4, -d / 2, w, 0.45, d, { tint: C.concrete, aux: [1, 0, 0, 0] });
  k.box('plaster', 0, 0, -d / 2, w, h, d, { tint: col, aux: [0, 0, 0, 0] });
  k.hip('roof', 0, h, -d / 2, w, d, 2.0, { tint: o.roofTint || C.tile, aux: [o.roofPat === undefined ? 2 : o.roofPat, 0.2, 0, 0], overhang: 0.7 });
  const gw = 5.2;
  k.box('metal', w / 2 - gw / 2 - 0.6, 0, 0.03, gw, 2.3, 0.06, { tint: [0.82, 0.8, 0.76], aux: [0, 0.5, 0.2, 0] });
  for (let i = 1; i < 4; i++) k.box('metal', w / 2 - gw / 2 - 0.6, i * 0.58, 0.07, gw, 0.03, 0.02, { tint: [0.6, 0.6, 0.58], aux: [0, 0.5, 0.2, 0] });
  door(k, -1.0, 1.0, 2.2, { tint: o.door || [0.2, 0.14, 0.1], trim: C.white });
  win(k, -3.8, 0.9, 2.2, 1.3, { frame: 'metal', frameTint: [0.9, 0.9, 0.88], mullion: true, lit: o.lit, seed: o.seed });
  win(k, -6.0, 1.0, 1.0, 1.1, { frame: 'metal', frameTint: [0.9, 0.9, 0.88], lit: o.lit, seed: (o.seed || 0) + 1 });
  for (const s of [-1, 1]) { k.push(s * w / 2, 0, -d / 2, s * Math.PI / 2); win(k, -1.5, 1.0, 1.4, 1.2, { frame: 'metal', frameTint: [0.9, 0.9, 0.88], lit: o.lit, seed: (o.seed || 0) + 2 }); win(k, 2.2, 1.0, 1.2, 1.2, { frame: 'metal', frameTint: [0.9, 0.9, 0.88], lit: o.lit, seed: (o.seed || 0) + 5 }); k.pop(); }
  k.push(0, 0, -d, Math.PI); for (let i = 0; i < 3; i++) win(k, -4 + i * 4, 1.0, 1.6, 1.2, { frame: 'metal', frameTint: [0.9, 0.9, 0.88], lit: o.lit, seed: (o.seed || 0) + 7 + i }); k.pop();
  k.box('plaster', w / 2 - gw / 2 - 0.6, -0.35, 4.5, gw + 0.4, 0.4, 9, { tint: [0.5, 0.49, 0.46], aux: [1, 0, 0, 0] });
  k.collider(0, h / 2 + 0.5, -d / 2, w / 2, h / 2 + 0.5, d / 2);
  return { cls: 'stucco', breakV: 26, foot: [w / 2 + 0.8, d / 2 + 0.8, -d / 2], h: h + 2 };
}

export function gasStation(k, o) {
  const cw = 18, cd = 11, ch = 5.2, red = o.accent || [0.62, 0.06, 0.04];
  for (const [x, z] of [[-6, -3.5], [6, -3.5], [-6, 3.5], [6, 3.5]]) k.cyl('plaster', x, 0, z + 9, 0.32, 0.32, ch, 10, { tint: [0.85, 0.85, 0.83], aux: [2, 0, 0, 0] });
  k.box('plaster', 0, ch, 9, cw, 0.9, cd, { tint: [0.9, 0.9, 0.89], aux: [2, 0, 0, 0], bottom: true, ny: { tint: [0.75, 0.75, 0.74] } });
  k.box('plaster', 0, ch + 0.25, 9, cw + 0.1, 0.4, cd + 0.1, { tint: red, aux: [2, 0, 0, 0], skip: ['py', 'ny'] });
  for (const x of [-5, 0, 5]) for (const z of [-2.2, 2.2]) k.box('light', x, ch - 0.06, 9 + z, 1.6, 0.05, 0.5, { tint: [1, 0.97, 0.9], aux: [0.6, 3, 0, 0] });
  for (const x of [-4.5, 4.5]) { k.box('plaster', x, 0, 9, 1.4, 0.25, 7.5, { tint: [0.6, 0.6, 0.58], aux: [1, 0, 0, 0] }); for (const z of [-2, 2]) { k.box('metal', x, 0.25, 9 + z, 0.8, 1.7, 0.5, { tint: [0.92, 0.92, 0.9], aux: [0, 0.35, 0.2, 0] }); k.box('light', x, 1.3, 9 + z + 0.26, 0.4, 0.25, 0.01, { tint: [0.4, 0.8, 1.0], aux: [0.4, 1, 0, 0] }); } }
  k.sign(o.sign1 || o.sign, 0, ch + 0.45, 9 + cd / 2 + 0.06, 6, 0.75, 0, 1.2);
  const sw = 14, sd = 9, sh = 4.2;
  k.box('plaster', 0, 0, -sd / 2 - 2, sw, sh, sd, { tint: [0.84, 0.82, 0.78], aux: [0, 0, 0, 0] });
  k.box('plaster', 0, sh, -sd / 2 - 2, sw + 0.4, 0.8, sd + 0.4, { tint: red, aux: [2, 0, 0, 0] });
  for (let i = 0; i < 4; i++) win(k, -5.2 + i * 2.6, 0.3, 2.3, 2.6, { z: -2, frame: 'metal', frameTint: [0.3, 0.3, 0.32], lit: 0.95, cool: 1, seed: i });
  if (o.sign2) k.sign(o.sign2, 0, sh + 0.4, -1.55, 5.2, 0.65, 0, 1.2);
  k.cyl('metal', 9.5, 0, 14, 0.25, 0.25, 9, 8, { tint: [0.7, 0.7, 0.72], aux: [0, 0.4, 0.8, 0] });
  k.box('plaster', 9.5, 7.5, 14, 3.4, 3.2, 0.5, { tint: [0.95, 0.95, 0.94], aux: [2, 0, 0, 0] });
  k.sign(o.sign1 || o.sign, 9.5, 8.6, 14.27, 3.2, 0.4, 0, 1.2);
  k.box('light', 9.5, 7.8, 14.27, 2.8, 1.1, 0.02, { tint: [1, 0.55, 0.15], aux: [0.8, 2.5, 0, 0] });
  k.collider(0, sh / 2, -sd / 2 - 2, sw / 2, sh / 2 + 0.4, sd / 2);
  for (const x of [-4.5, 4.5]) k.collider(x, 0.9, 9, 0.7, 0.9, 3.75, 0, 'pump');
  for (const [x, z] of [[-6, -3.5], [6, -3.5], [-6, 3.5], [6, 3.5]]) k.collider(x, ch / 2, z + 9, 0.32, ch / 2, 0.32, 0, 'pole');
  k.collider(0, ch + 0.45, 9, cw / 2, 0.45, cd / 2, 0, 'canopy');
  return { cls: 'stucco', breakV: 30, foot: [cw / 2 + 1, 13, 1.5], h: ch + 2 };
}

export function stripMall(k, o) {
  const w = o.w || 42, d = 15, h = 5.0, col = o.color || [0.78, 0.72, 0.62];
  k.box('plaster', 0, 0, -d / 2, w, h, d, { tint: col, aux: [0, 0, 0, 0] });
  k.box('plaster', 0, h, 0.6, w + 0.6, 1.1, 1.4, { tint: shade(col, 0.92), aux: [0, 0, 0, 0] });
  k.box('roof', 0, h, -d / 2, w, 0.12, d, { tint: [0.5, 0.5, 0.48], aux: [3, 0.2, 0, 0] });
  const signs = o.signs || ['DINER', 'HARDWARE', 'CAFE'];
  const n = signs.length;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * w / n;
    win(k, x, 0.25, w / n - 2.8, 2.9, { frame: 'metal', frameTint: [0.25, 0.25, 0.27], lit: 0.95, cool: 1, seed: i + 7, mullion: true });
    k.sign(signs[i], x, h + 0.55, 1.32, Math.min(w / n - 1.5, 7), Math.min(w / n - 1.5, 7) / 8, 0, 1.2);
  }
  k.box('plaster', 0, -0.3, 3, w + 2, 0.4, 6, { tint: [0.55, 0.54, 0.51], aux: [1, 0, 0, 0] });
  k.collider(0, h / 2, -d / 2, w / 2, h / 2 + 0.5, d / 2);
  return { cls: 'stucco', breakV: 30, foot: [w / 2 + 1, d / 2 + 3, -d / 2 + 2.5], h: h + 1.2 };
}

export function streetLight(k, o = {}) {
  const h = o.h || 8.5, arm = o.arm || 2.4, mod = o.style === 'future';
  if (mod) {
    k.cyl('metal', 0, 0, 0, 0.09, 0.14, h, 8, { tint: [0.85, 0.86, 0.87], aux: [0, 0.3, 0.5, 0] });
    k.obox('metal', 0, h - 0.1, arm / 2, 0.14, 0.08, arm, 0, 0, 0, { tint: [0.85, 0.86, 0.87], aux: [0, 0.3, 0.5, 0] });
    k.box('light', 0, h - 0.18, arm - 0.2, 0.08, 0.04, 1.4, { tint: [0.85, 0.95, 1.0], aux: [0.1, 4, 0, 0] });
  } else {
    k.cyl('metal', 0, 0, 0, 0.1, 0.16, h, 8, { tint: o.tint || [0.4, 0.41, 0.42], aux: [0, 0.45, 0.8, o.rust || 0.1] });
    k.obox('metal', 0, h - 0.1, arm / 2, 0.12, 0.12, arm, -0.08, 0, 0, { tint: o.tint || [0.4, 0.41, 0.42], aux: [0, 0.45, 0.8, o.rust || 0.1] });
    k.box('metal', 0, h - 0.35, arm - 0.1, 0.36, 0.18, 0.7, { tint: [0.3, 0.3, 0.31], aux: [0, 0.4, 0.6, 0] });
    k.box('light', 0, h - 0.37, arm - 0.1, 0.3, 0.02, 0.6, { tint: [1.0, 0.78, 0.5], aux: [0, o.dark ? 0 : 5, 0, 0] });
  }
  k.collider(0, h / 2, 0, 0.16, h / 2, 0.16, 0, 'pole');
  return { cls: 'pole', breakV: 9, foot: [0.4, 0.4, 0], h };
}

export function powerPole(k, o = {}) {
  const h = o.h || 11;
  k.cyl('wood', 0, 0, 0, 0.13, 0.17, h, 8, { tint: [0.22, 0.17, 0.12], aux: W(1, 0.4, 1) });
  k.box('wood', 0, h - 0.8, 0, 2.6, 0.14, 0.12, { tint: [0.22, 0.17, 0.12], aux: W(2, 0.4, 1) });
  for (const x of [-1.15, 0, 1.15]) k.cyl('metal', x, h - 0.73 + (x === 0 ? 0.6 : 0), 0, 0.05, 0.07, 0.22, 6, { tint: [0.35, 0.5, 0.45], aux: [0, 0.2, 0.0, 0] });
  if (o.transformer) k.cyl('metal', 0.32, h - 3, 0, 0.3, 0.3, 1.0, 10, { tint: [0.5, 0.52, 0.5], aux: [0, 0.4, 0.7, 0] });
  k.collider(0, h / 2, 0, 0.18, h / 2, 0.18, 0, 'pole');
  return { cls: 'pole', breakV: 11, foot: [0.4, 0.4, 0], h };
}

export function telegraphPole(k, o = {}) {
  const h = 7.5;
  k.cyl('wood', 0, 0, 0, 0.11, 0.14, h, 7, { tint: [0.26, 0.2, 0.14], aux: W(1, 0.5, 1) });
  k.box('wood', 0, h - 0.5, 0, 1.6, 0.1, 0.1, { tint: [0.26, 0.2, 0.14], aux: W(2, 0.5, 1) });
  for (const x of [-0.65, -0.25, 0.25, 0.65]) k.cyl('glass', x, h - 0.45, 0, 0.04, 0.05, 0.14, 6, { tint: [0.12, 0.3, 0.25], aux: [0, 0, 0, 0] });
  k.collider(0, h / 2, 0, 0.15, h / 2, 0.15, 0, 'pole');
  return { cls: 'pole', breakV: 9, foot: [0.3, 0.3, 0], h };
}

export function wires(k, A, B, hA, hB, offsets, sag, mat = 'metal', r = 0.025) {
  const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
  const seg = 6;
  for (const off of offsets) {
    let px = A[0] + nx * off, pz = A[1] + nz * off, py = hA;
    for (let i = 1; i <= seg; i++) {
      const t = i / seg, x = A[0] + dx * t + nx * off, z = A[1] + dz * t + nz * off, y = hA + (hB - hA) * t - sag * 4 * t * (1 - t);
      const mx = (px + x) / 2, my = (py + y) / 2, mz = (pz + z) / 2, l = Math.hypot(x - px, y - py, z - pz);
      k.obox(mat, mx, my, mz, r, r, l, -Math.asin((y - py) / l), Math.atan2(x - px, z - pz), 0, { tint: [0.05, 0.05, 0.05], aux: [0, 0.6, 0.5, 0] });
      px = x; py = y; pz = z;
    }
  }
}

export function billboard(k, o) {
  const w = o.w || 12, h = o.h || 3.2, y0 = o.y || 6;
  for (const s of [-1, 1]) k.cyl('metal', s * w * 0.3, 0, -0.3, 0.2, 0.25, y0 + h, 8, { tint: [0.45, 0.46, 0.47], aux: [0, 0.5, 0.8, o.rust || 0.2] });
  k.box('metal', 0, y0 - 0.2, -0.15, w + 0.3, h + 0.4, 0.25, { tint: [0.3, 0.3, 0.31], aux: [0, 0.6, 0.6, o.rust || 0.2] });
  k.sign(o.sign, 0, y0 + h / 2, 0.0, w, h, 0, o.glow === undefined ? 0.5 : o.glow);
  k.box('metal', 0, y0 - 0.6, 0.6, w, 0.08, 1.0, { tint: [0.3, 0.3, 0.31], aux: [0, 0.6, 0.6, 0.3] });
  for (const s of [-1, 1]) k.collider(s * w * 0.3, (y0 + h) / 2, -0.3, 0.25, (y0 + h) / 2, 0.25, 0, 'pole');
  return { cls: 'steel', breakV: 14, foot: [w / 2, 1, 0], h: y0 + h };
}

export function hwSign(k, o) {
  const w = o.w || 7, h = 2.0, y0 = 3.2;
  for (const s of [-1, 1]) k.cyl('metal', s * w * 0.35, 0, -0.1, 0.1, 0.1, y0 + h, 8, { tint: [0.5, 0.51, 0.52], aux: [0, 0.4, 0.9, 0] });
  k.box('metal', 0, y0, -0.06, w + 0.1, h + 0.1, 0.06, { tint: [0.4, 0.41, 0.42], aux: [0, 0.4, 0.9, 0] });
  k.sign(o.sign, 0, y0 + h / 2, 0.0, w, h, 0, 0.15);
  for (const s of [-1, 1]) k.collider(s * w * 0.35, (y0 + h) / 2, -0.1, 0.12, (y0 + h) / 2, 0.12, 0, 'pole');
  return { cls: 'pole', breakV: 10, foot: [w / 2, 0.5, 0], h: y0 + h };
}

export function midrise(k, o) {
  const w = o.w, d = o.d, fl = o.floors || 4, fh = 3.6, H = fl * fh + 1.2;
  const white = [0.86, 0.87, 0.86], wood = [0.42, 0.28, 0.17];
  k.box('plaster', 0, -0.4, -d / 2, w + 0.6, 0.45, d + 0.6, { tint: [0.6, 0.6, 0.58], aux: [1, 0, 0, 0] });
  k.box('glass', 0, 0, -d / 2, w - 0.4, fh * 1.4, d - 0.4, { tint: [0.05, 0.06, 0.07], aux: [1, 0.9, o.seed || 0, o.broken || 0], bottom: false });
  for (let f = 1; f < fl; f++) {
    const y = fh * 0.4 + f * fh;
    k.box('plaster', 0, y - 0.45, -d / 2, w, 0.45, d, { tint: white, aux: [2, 0, 0, 0], bottom: true });
    k.box('glass', 0, y, -d / 2, w - 0.6, fh - 0.45, d - 0.6, { tint: [0.04, 0.05, 0.06], aux: [1, 0.75, (o.seed || 0) + f, o.broken || 0], skip: ['py', 'ny'] });
    if (o.fins !== false) for (let i = 0; i <= Math.floor(w / 2.4); i++) k.box('wood', -w / 2 + 0.2 + i * (w - 0.4) / Math.floor(w / 2.4), y, 0.02, 0.18, fh - 0.45, 0.5, { tint: wood, aux: W(1, 0.1, 1) });
  }
  k.box('plaster', 0, fl * fh + fh * 0.4 - 0.45, -d / 2, w + 0.8, 0.6, d + 0.8, { tint: white, aux: [2, 0, 0, 0], bottom: true });
  k.box('plaster', 0, fl * fh + fh * 0.4 + 0.15, -d / 2, w - 1, 0.35, d - 1, { tint: [0.12, 0.2, 0.08], aux: [0, 0, 0, 0] });
  if (o.solar !== false) for (let i = 0; i < 3; i++) k.obox('metal', -w / 4 + i * w / 4, fl * fh + fh * 0.4 + 1.0, -d / 2, w / 4 - 0.8, 0.06, d * 0.6, 0.3, 0, 0, { tint: [0.03, 0.04, 0.08], aux: [0, 0.15, 0.7, 0] });
  if (o.sign) k.sign(o.sign, 0, fh * 1.25, 0.32, Math.min(w * 0.6, 9), Math.min(w * 0.6, 9) / 8, 0, 1.5);
  k.box('plaster', 0, fh * 1.4 - 0.4, 0.9, w + 1, 0.3, 2.2, { tint: white, aux: [2, 0, 0, 0], bottom: true });
  k.collider(0, H / 2, -d / 2, w / 2, H / 2, d / 2);
  return { cls: 'concrete', breakV: 55, foot: [w / 2 + 1, d / 2 + 1.5, -d / 2], h: H };
}

export function evHub(k, o) {
  const w = 30, d = 14, h = 4.8;
  for (let i = 0; i < 4; i++) for (const z of [-4, 4]) k.cyl('metal', -w / 2 + 3 + i * (w - 6) / 3, 0, 7 + z, 0.18, 0.22, h, 8, { tint: [0.86, 0.87, 0.88], aux: [0, 0.3, 0.5, 0] });
  k.obox('metal', 0, h + 0.3, 7, w, 0.25, d, 0.08, 0, 0, { tint: [0.03, 0.04, 0.08], aux: [0, 0.12, 0.8, 0], bottom: true, ny: { tint: [0.85, 0.86, 0.87] } });
  for (let i = 0; i < 8; i++) { const x = -w / 2 + 2 + i * (w - 4) / 7; k.box('plaster', x, 0, 1.0, 0.5, 1.6, 0.4, { tint: [0.9, 0.91, 0.92], aux: [2, 0, 0, 0] }); k.box('light', x, 1.2, 1.21, 0.3, 0.3, 0.01, { tint: [0.4, 1.0, 0.6], aux: [0.8, 2.5, 0, 0] }); }
  k.box('light', 0, h + 0.1, 7, w - 1, 0.02, 0.15, { tint: [0.9, 0.95, 1.0], aux: [0.2, 3, 0, 0] });
  if (o.sign) k.sign(o.sign, 0, h + 0.85, 7 + d / 2, 6, 0.75, 0, 2);
  for (let i = 0; i < 4; i++) for (const z of [-4, 4]) k.collider(-w / 2 + 3 + i * (w - 6) / 3, h / 2, 7 + z, 0.22, h / 2, 0.22, 0, 'pole');
  k.collider(0, h + 0.3, 7, w / 2, 0.2, d / 2, 0, 'canopy');
  return { cls: 'steel', breakV: 40, foot: [w / 2 + 1, d / 2 + 1, 7], h: h + 1 };
}

export function ruinShell(k, o) {
  const w = o.w, d = o.d, H = o.h || 8, R = o.rng, mat = o.mat || 'plaster', tint = o.tint || [0.45, 0.44, 0.41], pat = o.pat === undefined ? 1 : o.pat;
  const wall = (len, rot, cx, cz) => {
    k.push(cx, 0, cz, rot);
    const n = Math.max(2, Math.round(len / 2.2));
    for (let i = 0; i < n; i++) {
      const x0 = -len / 2 + (i / n) * len, x1 = -len / 2 + ((i + 1) / n) * len;
      const hh = H * (0.25 + 0.75 * Math.pow(R(), 0.6)) * (R() < 0.15 ? 0.15 : 1);
      k.box(mat, (x0 + x1) / 2, 0, 0, x1 - x0, hh, 0.35, { tint, aux: [pat, 0, 0, 0] });
      if (hh > 3 && R() < 0.5) k.box('glass', (x0 + x1) / 2, Math.min(hh - 1.6, 1.2 + R() * 2), 0.18, (x1 - x0) * 0.5, 1.2, 0.02, { tint: [0.01, 0.01, 0.01], aux: [0, 0, 0, 1] });
    }
    k.pop();
  };
  wall(w, 0, 0, 0); wall(w, Math.PI, 0, -d); wall(d, Math.PI / 2, w / 2, -d / 2); wall(d, -Math.PI / 2, -w / 2, -d / 2);
  for (let i = 0; i < (o.slabs || 2); i++) { const y = 3.4 + i * 3.4; if (y > H - 1) break; k.obox(mat, (R() - 0.5) * w * 0.3, y * (0.4 + R() * 0.5), -d / 2 + (R() - 0.5) * d * 0.3, w * (0.4 + R() * 0.4), 0.3, d * (0.4 + R() * 0.4), (R() - 0.5) * 0.7, R() * 0.4, (R() - 0.5) * 0.7, { tint, aux: [pat, 0, 0, 0], bottom: true }); }
  for (let i = 0; i < 9; i++) { const s = 0.6 + R() * 2.2; k.obox('rubble', (R() - 0.5) * (w + 4), s * 0.25, -d / 2 + (R() - 0.5) * (d + 4), s * 1.4, s * 0.6, s, R() * 0.5, R() * 3, R() * 0.5, { tint: shade(tint, 0.9), aux: [0, 0, 0, 0] }); }
  k.collider(0, H * 0.3, 0, w / 2, H * 0.3, 0.2); k.collider(0, H * 0.3, -d, w / 2, H * 0.3, 0.2);
  k.collider(w / 2, H * 0.3, -d / 2, 0.2, H * 0.3, d / 2); k.collider(-w / 2, H * 0.3, -d / 2, 0.2, H * 0.3, d / 2);
  return { cls: 'concrete', breakV: 34, foot: [w / 2 + 2, d / 2 + 2, -d / 2], h: H };
}

export function rubblePile(k, o) {
  const R = o.rng, w = o.w || 8, d = o.d || 8, tint = o.tint || [0.4, 0.38, 0.35], n = o.n || 14;
  if ((o.mat || 'wood') === 'wood') {
    for (let i = 0; i < 2; i++) k.obox('wood', (R() - 0.5) * w * 0.5, 0.35 + i * 0.25, -d * 0.2 + (R() - 0.5) * d * 0.4, w * (0.5 + R() * 0.3), 0.12, 2.5 + R() * 2, 0.15 + R() * 0.35, R() * 0.6 - 0.3, (R() - 0.5) * 0.5, { tint: shade(tint, 0.85 + R() * 0.2), aux: W(1, 0.6, 1), bottom: true });
    for (let i = 0; i < n * 2; i++) { const L = 1.5 + R() * 3; k.obox('wood', (R() - 0.5) * w, 0.08 + R() * 0.5, (R() - 0.5) * d, 0.22, 0.05, L, (R() - 0.5) * 0.5, R() * 3.14, (R() - 0.5) * 0.4, { tint: shade(tint, 0.7 + R() * 0.4), aux: W(2, 0.7, 1), bottom: true }); }
    for (let i = 0; i < 3; i++) k.obox('roof', (R() - 0.5) * w * 0.7, 0.3 + R() * 0.4, (R() - 0.5) * d * 0.7, 2 + R() * 2, 0.04, 1.5 + R() * 2, (R() - 0.5) * 0.6, R() * 3, (R() - 0.5) * 0.6, { tint: C.tin, aux: [0, 0.7, 0, 0], bottom: true });
  } else {
    for (let i = 0; i < n; i++) { const s = 0.4 + R() * (o.big || 1.2); k.obox(o.mat || 'rubble', (R() - 0.5) * w, s * 0.2, (R() - 0.5) * d, s * (1 + R()), s * 0.5, s * (0.6 + R() * 0.6), R() * 0.6, R() * 3, R() * 0.6, { tint: shade(tint, 0.8 + R() * 0.3), aux: o.aux || [0, 0, 0, 0] }); }
  }
  return { cls: 'none', breakV: 999, foot: [w / 2, d / 2, 0], h: 1 };
}

export function foundation(k, o) {
  const w = o.w, d = o.d;
  for (const [x, z, sx, sz] of [[0, 0, w, 0.5], [0, -d, w, 0.5], [w / 2, -d / 2, 0.5, d], [-w / 2, -d / 2, 0.5, d]]) k.box('masonry', x, -0.3, z, sx, 0.62, sz, { tint: C.stone, aux: [1, 0, 0, 0] });
  if (o.plaque) { k.box('masonry', 0, 0, 1.0, 0.7, 1.0, 0.5, { tint: [0.5, 0.48, 0.45], aux: [1, 0, 0, 0] }); k.box('metal', 0, 0.7, 1.27, 0.5, 0.35, 0.02, { tint: [0.45, 0.32, 0.12], aux: [0, 0.3, 1, 0.3] }); }
  return { cls: 'none', breakV: 999, foot: [w / 2, d / 2, -d / 2], h: 1 };
}

export function spire(k, o) {
  const h = o.h || 120, r = o.r || 9, seg = 12;
  k.cyl('scifi', 0, -1, 0, r * 2.2, r * 2.6, 1.5, 24, { tint: [0.86, 0.88, 0.9], aux: [0.6, 1, 0.1, 0] });
  const n = 6;
  for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; k.cyl('scifi', 0, h * t0, 0, r * (1 - t1 * 0.72), r * (1 - t0 * 0.72), h / n + 0.05, seg, { tint: [0.9, 0.91, 0.93], aux: [3.6, 1, 0.15, i === n - 1 ? 2 : 0], cap: i === n - 1 }); }
  for (const y of o.rings || [0.35, 0.62, 0.85]) { const rr = r * (1 - y * 0.72) + 4 + (o.ringPad || 0); k.cyl('scifi', 0, h * y, 0, rr, rr, 1.2, 32, { tint: [0.88, 0.9, 0.92], aux: [0.6, 1, 0.3, 1], cap: true }); k.cyl('light', 0, h * y - 0.15, 0, rr + 0.05, rr + 0.05, 0.12, 32, { tint: [0.5, 0.85, 1.0], aux: [1.5, 3, 0, 0], cap: false }); }
  k.cyl('light', 0, h, 0, 0.3, 0.3, 6, 8, { tint: [0.6, 0.85, 1.0], aux: [4, 6, 0, 0] });
  k.collider(0, h / 2, 0, r * 0.75, h / 2, r * 0.75);
  return { cls: 'scifi', breakV: 999, foot: [r * 2.6, r * 2.6, 0], h };
}

export function arch(k, o) {
  const R = o.r || 62, t = o.t || 5, dep = o.d || 7, n = 26;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI, am = (a0 + a1) / 2;
    const x = Math.cos(am) * R, y = Math.sin(am) * R, len = 2 * R * Math.sin((a1 - a0) / 2) + 0.2;
    k.obox('scifi', x, y, 0, len, t, dep, 0, 0, am + Math.PI / 2, { tint: [0.9, 0.91, 0.93], aux: [1.2, 1, 0.2, 0], bottom: true });
    k.obox('light', x * (1 - t / 2 / R) * 0.995, y * (1 - t / 2 / R) * 0.995, 0, len, 0.1, dep * 0.3, 0, 0, am + Math.PI / 2, { tint: [0.6, 0.85, 1.0], aux: [2, 4, 0, 0], bottom: true });
    if (i % 2 === 0) k.collider(x, y, 0, len + 0.3, t / 2, dep / 2, 0, 'arch', am + Math.PI / 2);
  }
  return { cls: 'scifi', breakV: 999, foot: [R + 3, dep / 2 + 2, 0], h: R };
}

export function floatPad(k, o) {
  const r = o.r || 16, y = o.y || 30;
  k.cyl('scifi', 0, y - 1.2, 0, r, r * 0.92, 1.2, 28, { tint: [0.88, 0.9, 0.92], aux: [0.6, 1, 0.2, 0] });
  k.cyl('scifi', 0, y - 4, 0, r * 0.25, r * 0.85, 2.8, 20, { tint: [0.82, 0.84, 0.86], aux: [0.8, 1, 0.3, 0], cap: false });
  k.cyl('light', 0, y - 4.1, 0, r * 0.22, r * 0.22, 0.1, 20, { tint: [0.6, 0.85, 1.0], aux: [3, 5, 0, 0] });
  k.cyl('light', 0, y + 0.01, 0, r * 0.75, r * 0.75, 0.02, 32, { tint: [0.6, 0.85, 1.0], aux: [0.5, 2, 0, 0], cap: false });
  k.collider(0, y - 0.6, 0, r * 0.68, 0.6, r * 0.68, 0, 'deck');
  k.collider(0, y - 0.6, 0, r * 0.68, 0.6, r * 0.68, Math.PI / 4, 'deck');
  return { cls: 'scifi', breakV: 999, foot: [r, r, 0], h: y };
}

export function basaltColumns(k, o) {
  const R = o.rng, n = o.n || 22, base = o.h || 8;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * (o.r || 9);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, r = 0.7 + R() * 0.55, h = base * (0.3 + R() * 0.9) * (1 - d / ((o.r || 9) * 1.6));
    k.cyl('rubble', x, -1, z, r, r, h + 1, 6, { tint: [0.06, 0.055, 0.052], aux: [0, 0, 0, 0] });
  }
  k.collider(0, base * 0.35, 0, (o.r || 9) * 0.7, base * 0.35, (o.r || 9) * 0.7);
  return { cls: 'none', breakV: 999, foot: [(o.r || 9) + 1, (o.r || 9) + 1, 0], h: base };
}

export function turbineTower(k, o) {
  const h = o.h || 82;
  k.cyl('plaster', 0, -1, 0, 1.6, 2.4, h + 1, 16, { tint: [0.9, 0.91, 0.9], aux: [2, 0, 0, 0] });
  k.box('plaster', 0, h, -1.5, 3.2, 3.2, 9, { tint: [0.92, 0.93, 0.92], aux: [2, 0, 0, 0] });
  k.collider(0, h / 2, 0, 2.2, h / 2, 2.2);
  return { cls: 'concrete', breakV: 999, foot: [4, 4, 0], h };
}

export function prop(k, o) {
  const R = o.rng, wood = (t = C.bare) => ({ tint: t, aux: W(2, 0.5, 1) });
  const kind = o.kind;
  if (kind === 'hitch') {
    for (const x of [-1.3, 1.3]) k.box('wood', x, 0, 0, 0.13, 1.1, 0.13, wood(C.darkwood));
    k.box('wood', 0, 1.0, 0, 2.9, 0.1, 0.1, wood(C.darkwood));
    k.collider(0, 0.55, 0, 1.45, 0.55, 0.1, 0, 'prop');
    return { cls: 'wood', breakV: 5, small: true, foot: [1.5, 0.3, 0], h: 1.1 };
  }
  if (kind === 'trough') {
    k.box('wood', 0, 0, 0, 2.2, 0.6, 0.65, wood(shade(C.bare, 0.8)));
    k.box('metal', 0, 0.5, 0, 2.0, 0.02, 0.5, { tint: [0.02, 0.03, 0.03], aux: [0, 0.04, 0, 0] });
    k.collider(0, 0.3, 0, 1.1, 0.3, 0.33, 0, 'prop');
    return { cls: 'wood', breakV: 7, small: true, foot: [1.2, 0.4, 0], h: 0.6 };
  }
  if (kind === 'barrels') {
    const n = 2 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.66 + (R() - 0.5) * 0.1, z = (R() - 0.5) * 0.3; k.cyl('wood', x, 0, z, 0.27, 0.3, 0.9, 10, { tint: shade(C.bare, 0.85 + R() * 0.3), aux: W(1, 0.5, 1) }); for (const y of [0.15, 0.72]) k.cyl('metal', x, y, z, 0.305, 0.305, 0.05, 10, { tint: C.black, aux: [0, 0.6, 0.6, 0.4], cap: false }); }
    k.collider(0, 0.45, 0, n * 0.33, 0.45, 0.32, 0, 'prop');
    return { cls: 'wood', breakV: 5, small: true, foot: [n * 0.35, 0.4, 0], h: 0.9 };
  }
  if (kind === 'crates') {
    const n = 2 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) { const s = 0.7 + R() * 0.3, x = (i % 2) * 0.95 - 0.45, y = i >= 2 ? 0.85 : 0, z = (R() - 0.5) * 0.2; k.box('wood', x, y, z, s, s, s, { tint: shade([0.5, 0.4, 0.27], 0.8 + R() * 0.3), aux: W(1, 0.4, 1), ry: R() * 0.3 }); }
    k.collider(0, 0.6, 0, 1.0, 0.6, 0.5, 0, 'prop');
    return { cls: 'wood', breakV: 5, small: true, foot: [1.1, 0.6, 0], h: 1.6 };
  }
  if (kind === 'hay') {
    for (let i = 0; i < 5; i++) k.box('rubble', (i % 3) * 1.05 - 1.05, i >= 3 ? 0.5 : 0, (i >= 3 ? 0.1 : 0) + (R() - 0.5) * 0.1, 1.0, 0.48, 0.5, { tint: [0.62, 0.5, 0.26], aux: [0, 0, 0, 0], ry: (R() - 0.5) * 0.2 });
    k.collider(0, 0.48, 0, 1.6, 0.48, 0.3, 0, 'prop');
    return { cls: 'wood', breakV: 5, small: true, foot: [1.7, 0.4, 0], h: 1 };
  }
  if (kind === 'wagon') {
    const dk = shade(C.bare, 0.75);
    k.box('wood', 0, 0.75, 0, 1.25, 0.12, 3.3, wood(dk));
    for (const s of [-1, 1]) k.box('wood', s * 0.6, 0.87, 0, 0.06, 0.45, 3.3, wood(dk));
    for (const z of [-1.62, 1.62]) k.box('wood', 0, 0.87, z, 1.25, 0.45, 0.06, wood(dk));
    if (o.cover) for (let i = 0; i < 4; i++) { const z = -1.2 + i * 0.8; k.obox('wood', 0, 1.9, z, 1.5, 0.05, 0.85, 0, 0, 0, { tint: [0.82, 0.78, 0.68], aux: W(2, 0.2, 0) }); for (const s of [-1, 1]) k.obox('wood', s * 0.7, 1.5, z, 0.05, 0.8, 0.85, 0, 0, s * 0.35, { tint: [0.82, 0.78, 0.68], aux: W(2, 0.2, 0) }); }
    for (const [z, r] of [[1.15, 0.45], [-1.15, 0.62]]) for (const s of [-1, 1]) { k.cyl('wood', s * 0.72, r, z, r, r, 0.08, 14, { tint: C.darkwood, aux: W(2, 0.5, 1), rz: Math.PI / 2 }); k.cyl('metal', s * 0.78, r, z, r + 0.02, r + 0.02, 0.06, 14, { tint: C.black, aux: [0, 0.6, 0.6, 0.5], rz: Math.PI / 2, cap: false }); }
    k.obox('wood', 0, 0.55, 2.6, 0.08, 0.08, 2.2, -0.18, 0, 0, wood(dk));
    k.collider(0, 0.95, 0, 0.75, 0.55, 1.7, 0, 'prop');
    return { cls: 'wood', breakV: 8, small: true, foot: [0.9, 2.8, 0.6], h: 2 };
  }
  if (kind === 'bench') {
    for (const x of [-0.8, 0.8]) k.box('metal', x, 0, 0, 0.06, 0.45, 0.5, { tint: [0.08, 0.1, 0.09], aux: [0, 0.5, 0.7, 0.1] });
    for (let i = 0; i < 3; i++) k.box('wood', 0, 0.45, -0.18 + i * 0.16, 1.8, 0.04, 0.12, { tint: [0.4, 0.28, 0.17], aux: W(2, 0.2, 1) });
    for (let i = 0; i < 2; i++) k.obox('wood', 0, 0.65 + i * 0.14, -0.27, 1.8, 0.12, 0.04, -0.2, 0, 0, { tint: [0.4, 0.28, 0.17], aux: W(2, 0.2, 1) });
    k.collider(0, 0.4, 0, 0.95, 0.4, 0.3, 0, 'prop');
    return { cls: 'wood', breakV: 6, small: true, foot: [1, 0.4, 0], h: 0.9 };
  }
  if (kind === 'bin') {
    k.cyl('metal', 0, 0, 0, 0.3, 0.27, 0.95, 10, { tint: o.tint || [0.08, 0.16, 0.1], aux: [0, 0.5, 0.6, 0.15] });
    k.collider(0, 0.48, 0, 0.3, 0.48, 0.3, 0, 'prop');
    return { cls: 'steel', breakV: 5, small: true, foot: [0.4, 0.4, 0], h: 1 };
  }
  if (kind === 'planter') {
    k.box('plaster', 0, 0, 0, 1.4, 0.6, 1.4, { tint: [0.6, 0.59, 0.56], aux: [1, 0, 0, 0] });
    k.box('rubble', 0, 0.58, 0, 1.25, 0.04, 1.25, { tint: [0.12, 0.09, 0.06], aux: [0, 0, 0, 0] });
    k.collider(0, 0.3, 0, 0.7, 0.3, 0.7, 0, 'prop');
    return { cls: 'concrete', breakV: 14, small: true, foot: [0.8, 0.8, 0], h: 0.6 };
  }
  return { cls: 'none', breakV: 999, foot: [0.5, 0.5, 0], h: 1 };
}
