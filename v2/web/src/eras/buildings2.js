// Roadster 88 era buildings, second set: native tule huts, granaries, sweat lodges, drying racks and tule canoes; the Spanish mission church with its bell wall, convento arcade, adobe walls, houses and corrals; Gold Rush tents and sluices; brick commercial blocks, a picture house, oil derricks, early filling stations and bungalows; mid-century diners, motels with neon, a drive-in screen, big-box stores and cell towers; sky-city towers; glowing far-future crystals and ice-buried spires. Same local frame as buildings.js: front at z = 0 facing +z, depth toward -z, ground at y = 0.
import { C } from './lib.js';
import { win, door } from './buildings.js';

const W = (pat, wear = 0.3, bare = 0) => [pat, wear, bare, 0];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const STRAW = [0.44, 0.36, 0.2], ADOBE = [0.62, 0.52, 0.4], WASH = [0.8, 0.76, 0.68], TILE = [0.5, 0.2, 0.09], CANVAS = [0.74, 0.7, 0.58];

function dome(k, mat, r, h, rings, tint, aux, o = {}) {
  let y = 0;
  for (let i = 0; i < rings; i++) {
    const a0 = (i / rings) * Math.PI / 2, a1 = ((i + 1) / rings) * Math.PI / 2;
    const r0 = r * Math.cos(a0), r1 = r * Math.cos(a1), y1 = h * Math.sin(a1);
    k.cyl(mat, 0, y, o.z || 0, Math.max(0.02, r1), r0, y1 - y, o.seg || 14, { tint, aux, cap: i === rings - 1 });
    y = y1;
  }
}

export function tuleHut(k, o) {
  const r = o.r || 2.4, h = o.h || 2.6, R = o.rng || Math.random, t = shade(STRAW, 0.8 + R() * 0.3);
  dome(k, 'roof', r, h, 7, t, [1, 0.6, 0, 0], { z: -r, seg: 22 });
  const ribs = 14;
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    for (let j = 0; j < 3; j++) {
      const p0 = (j / 3) * Math.PI / 2, p1 = ((j + 1) / 3) * Math.PI / 2, pm = (p0 + p1) / 2, rr = r * Math.cos(pm) + 0.04, yy = h * Math.sin(pm);
      k.obox('roof', Math.cos(a) * rr, yy, -r + Math.sin(a) * rr, 0.16, (Math.PI / 2 / 3) * Math.hypot(r, h) * 0.66, 0.05, 0, -a + Math.PI / 2, 0, { tint: shade(t, 0.78), aux: [1, 0.6, 0, 0], rx: 0 });
    }
  }
  k.box('wood', 0, 0, -0.12, 0.9, 1.15, 0.5, { tint: [0.03, 0.025, 0.02], aux: W(2, 0.2, 1) });
  k.obox('roof', 0, 1.2, 0.12, 1.2, 0.1, 0.5, 0.3, 0, 0, { tint: shade(t, 0.9), aux: [1, 0.6, 0, 0], bottom: true });
  k.collider(0, h / 2, -r, r * 0.75, h / 2, r * 0.75);
  return { cls: 'wood', breakV: 7, foot: [r + 0.3, r + 0.3, -r], h, small: true };
}

export function granary(k, o) {
  const r = o.r || 0.9, legs = 1.1, h = 1.5;
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.6; k.cyl('wood', Math.cos(a) * r * 0.6, 0, Math.sin(a) * r * 0.6, 0.06, 0.07, legs + 0.3, 6, { tint: [0.28, 0.22, 0.15], aux: W(2, 0.5, 1) }); }
  k.cyl('roof', 0, legs, 0, r, r * 0.75, h, 12, { tint: shade(STRAW, 0.9), aux: [1, 0.5, 0, 0], cap: false });
  k.cyl('roof', 0, legs + h, 0, 0.05, r * 1.1, 0.7, 12, { tint: shade(STRAW, 1.05), aux: [1, 0.6, 0, 0] });
  k.collider(0, (legs + h) / 2, 0, r, (legs + h) / 2, r, 0, 'pole');
  return { cls: 'wood', breakV: 5, foot: [r + 0.2, r + 0.2, 0], h: legs + h + 0.7, small: true };
}

export function sweatLodge(k, o) {
  const r = o.r || 4.2, h = 1.9;
  dome(k, 'masonry', r, h, 4, [0.36, 0.28, 0.19], [2, 0, 0, 0], { z: -r, seg: 18 });
  k.box('wood', 0, 0, -0.4, 1.1, 1.0, 1.0, { tint: [0.02, 0.02, 0.015], aux: W(2, 0.2, 1) });
  k.obox('wood', 0, 1.05, 0.05, 1.5, 0.12, 0.12, 0, 0, 0, { tint: [0.3, 0.24, 0.16], aux: W(2, 0.5, 1) });
  k.collider(0, h / 2, -r, r * 0.8, h / 2, r * 0.8);
  return { cls: 'stucco', breakV: 14, foot: [r + 0.4, r + 0.4, -r], h };
}

export function dryingRack(k, o) {
  const w = o.w || 3.2, h = 1.8;
  for (const s of [-1, 1]) k.obox('wood', s * w / 2, h / 2, 0, 0.07, h + 0.2, 0.07, 0, 0, s * 0.08, { tint: [0.3, 0.24, 0.16], aux: W(2, 0.5, 1) });
  k.obox('wood', 0, h, 0, w + 0.3, 0.06, 0.06, 0, 0, 0, { tint: [0.3, 0.24, 0.16], aux: W(2, 0.5, 1) });
  for (let i = 0; i < 6; i++) k.box('roof', -w / 2 + 0.35 + i * (w - 0.7) / 5, h - 0.75, 0, 0.22, 0.7, 0.04, { tint: i % 2 ? [0.42, 0.36, 0.24] : [0.5, 0.4, 0.3], aux: [3, 0.4, 0, 0], bottom: true });
  return { cls: 'wood', breakV: 4, foot: [w / 2 + 0.2, 0.4, 0], h, small: true };
}

export function canoe(k, o) {
  const L = o.l || 5, t = shade(STRAW, 0.95);
  k.obox('roof', 0, 0.22, 0, 0.75, 0.32, L * 0.62, 0, 0, 0, { tint: t, aux: [1, 0.5, 0, 0], bottom: true });
  for (const s of [-1, 1]) k.obox('roof', 0, 0.3, s * L * 0.38, 0.55, 0.26, L * 0.22, s * 0.25, 0, 0, { tint: shade(t, 0.9), aux: [1, 0.5, 0, 0], bottom: true });
  k.box('wood', 0, 0.3, 0, 0.5, 0.12, L * 0.5, { tint: [0.06, 0.05, 0.04], aux: W(2, 0.2, 1) });
  return { cls: 'wood', breakV: 3, foot: [0.5, L / 2, 0], h: 0.5, small: true };
}

export function firePit(k) {
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; k.box('rubble', Math.cos(a) * 0.75, -0.05, Math.sin(a) * 0.75, 0.32, 0.26, 0.28, { tint: [0.32, 0.3, 0.27], aux: [0, 0, 0, 0] }); }
  k.box('light', 0, 0.02, 0, 0.7, 0.05, 0.7, { tint: [1, 0.35, 0.08], aux: [0.6, 2.4, 0, 0] });
  return { cls: 'wood', breakV: 99, foot: [1, 1, 0], h: 0.3, small: true };
}

export function missionChurch(k, o) {
  const L = o.l || 34, w = 10.5, h = 9, wear = o.wear || 0.15, wash = o.color || WASH;
  k.box('masonry', 0, -0.6, -L / 2, w + 0.4, 0.65, L + 0.4, { tint: C.stone, aux: [1, 0, 0, 0] });
  k.box('masonry', 0, 0, -L / 2, w, h, L, { tint: wash, aux: [2, 0, 0, 0] });
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) k.box('masonry', s * (w / 2 + 0.55), 0, -3 - i * (L - 6) / 5, 1.1, h * 0.75, 1.6, { tint: shade(wash, 0.95), aux: [2, 0, 0, 0] });
  k.gable('roof', 0, h, -L / 2, w, L, 3.2, { tint: TILE, aux: [2, wear, 0, 0], overhang: 0.55, overhangD: 0.2 });
  const fw = w + 3.4, fh = h + 5.5;
  k.box('masonry', 0, 0, 0.3, fw, h + 1.2, 0.9, { tint: wash, aux: [2, 0, 0, 0] });
  k.box('masonry', -fw / 2 + 2.6, h + 1.2, 0.3, 5.2, fh - h - 1.2, 0.9, { tint: wash, aux: [2, 0, 0, 0] });
  for (let i = 0; i < 3; i++) {
    const x = -fw / 2 + 0.9 + i * 1.7, y0 = h + 2.2 + (i === 1 ? 2.2 : 0);
    k.box('masonry', x, y0, 0.78, 1.1, 1.6, 0.06, { tint: [0.05, 0.045, 0.04], aux: [2, 0, 0, 0] });
    k.cyl('metal', x, y0 + 0.35, 0.3, 0.12, 0.38, 0.75, 10, { tint: [0.42, 0.3, 0.12], aux: [0, 0.35, 0.85, 0.35] });
  }
  k.box('wood', -fw / 2 + 2.6, fh, 0.3, 0.16, 1.6, 0.16, { tint: [0.25, 0.18, 0.12], aux: W(2, 0.4, 1) });
  k.box('wood', -fw / 2 + 2.6, fh + 0.95, 0.3, 0.9, 0.16, 0.16, { tint: [0.25, 0.18, 0.12], aux: W(2, 0.4, 1) });
  k.box('masonry', 1.6, h + 1.2, 0.3, fw - 5.2 - 0.2, 1.3, 0.9, { tint: wash, aux: [2, 0, 0, 0] });
  door(k, 0.6, 2.2, 3.4, { z: 0.76, tint: [0.25, 0.15, 0.08], trim: [0.55, 0.45, 0.32] });
  k.box('masonry', 0.6, 3.4, 0.8, 3.0, 0.5, 0.15, { tint: [0.55, 0.45, 0.32], aux: [1, 0, 0, 0] });
  win(k, 0.6, 5.6, 1.2, 1.2, { z: 0.76, frameTint: [0.45, 0.32, 0.2], lit: 0.4, seed: 3 });
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { k.push(s * w / 2, 0, -5 - i * 7, s * Math.PI / 2); win(k, 0, 4.2, 0.9, 1.8, { frameTint: [0.45, 0.32, 0.2], lit: 0.35, seed: 10 + i }); k.pop(); }
  k.collider(0, h / 2, -L / 2, w / 2 + 0.8, h / 2, L / 2);
  k.collider(0, fh / 2, 0.3, fw / 2, fh / 2, 0.5);
  return { cls: 'stucco', breakV: 34, foot: [fw / 2 + 0.5, L / 2 + 1, -L / 2 + 0.5], h: fh + 2 };
}

export function arcade(k, o) {
  const L = o.l || 40, d = 8, h = 4.6, wash = o.color || WASH, wear = o.wear || 0.2, ruin = o.ruin;
  k.box('masonry', 0, -0.5, -d / 2, L + 0.2, 0.55, d + 0.2, { tint: C.stone, aux: [1, 0, 0, 0] });
  k.box('masonry', 0, 0, -d / 2, L, h, d, { tint: wash, aux: [2, 0, 0, 0] });
  if (!ruin) k.obox('roof', 0, h + 0.75, -d / 2 + 0.6, L + 0.6, 0.12, d + 4.6, 0.2, 0, 0, { tint: TILE, aux: [2, wear, 0, 0], bottom: true });
  const n = Math.round(L / 3.2);
  for (let i = 0; i <= n; i++) { const x = -L / 2 + (i / n) * L; k.box('masonry', x, 0, 2.6, 0.75, h * 0.72, 0.75, { tint: wash, aux: [2, 0, 0, 0] }); }
  k.box('masonry', 0, h * 0.72, 2.6, L + 0.75, h * 0.28, 0.8, { tint: wash, aux: [2, 0, 0, 0] });
  for (let i = 0; i < n; i++) { const x = -L / 2 + ((i + 0.5) / n) * L; for (const s of [-1, 1]) k.box('masonry', x + s * (L / n / 2 - 0.55), h * 0.6, 2.6, 0.5, h * 0.14, 0.78, { tint: wash, aux: [2, 0, 0, 0] }); if (i % 2 === 0) door(k, x, 1.0, 2.2, { z: 0.02, tint: [0.28, 0.17, 0.09], trim: [0.5, 0.4, 0.3] }); else win(k, x, 1.0, 0.8, 1.0, { z: 0.02, frameTint: [0.45, 0.32, 0.2], lit: 0.3, seed: i }); }
  k.collider(0, h / 2, -d / 2, L / 2, h / 2, d / 2);
  for (let i = 0; i <= n; i += 2) k.collider(-L / 2 + (i / n) * L, h * 0.36, 2.6, 0.4, h * 0.36, 0.4, 0, 'pole');
  return { cls: 'stucco', breakV: 30, foot: [L / 2 + 0.5, d / 2 + 2.5, -d / 2 + 2], h: h + 1 };
}

export function adobeWall(k, o) {
  const L = o.l || 20, h = o.h || 2.4, wash = o.color || ADOBE;
  k.box('masonry', 0, 0, 0, L, h, 0.7, { tint: wash, aux: [2, 0, 0, 0] });
  k.box('roof', 0, h, 0, L + 0.2, 0.18, 0.9, { tint: TILE, aux: [2, 0.3, 0, 0], bottom: true });
  k.collider(0, h / 2, 0, L / 2, h / 2, 0.35);
  return { cls: 'stucco', breakV: 22, foot: [L / 2, 0.6, 0], h };
}

export function adobeHouse(k, o) {
  const w = o.w || 9, d = o.d || 6, h = 3.1, wash = o.color || ADOBE, flat = o.flat;
  k.box('masonry', 0, -0.4, -d / 2, w + 0.2, 0.45, d + 0.2, { tint: C.stone, aux: [1, 0, 0, 0] });
  k.box('masonry', 0, 0, -d / 2, w, h, d, { tint: wash, aux: [2, 0, 0, 0] });
  if (flat) { k.box('masonry', 0, h, -d / 2, w + 0.1, 0.45, d + 0.1, { tint: shade(wash, 0.95), aux: [2, 0, 0, 0] }); for (let i = 0; i < Math.floor(w / 1.2); i++) k.cyl('wood', -w / 2 + 0.6 + i * 1.2, h - 0.3, 0.25, 0.1, 0.1, 0.5, 6, { tint: [0.3, 0.22, 0.14], aux: W(2, 0.5, 1), rx: Math.PI / 2 }); }
  else k.gable('roof', 0, h, -d / 2, w, d, 1.3, { tint: TILE, aux: [2, 0.3, 0, 0], overhang: 0.5, overhangD: 0.3 });
  door(k, -w * 0.2, 1.0, 2.1, { tint: [0.28, 0.17, 0.09], trim: shade(wash, 0.8) });
  win(k, w * 0.22, 1.0, 0.8, 0.9, { frameTint: [0.35, 0.25, 0.15], lit: o.lit === undefined ? 0.35 : o.lit, seed: o.seed });
  k.collider(0, h / 2, -d / 2, w / 2, h / 2, d / 2);
  return { cls: 'stucco', breakV: 20, foot: [w / 2 + 0.4, d / 2 + 0.4, -d / 2], h: h + 1.3 };
}

export function corral(k, o) {
  const w = o.w || 16, d = o.d || 12, n = Math.round((w + d) / 2.6);
  const side = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), m = Math.max(1, Math.round(L / 2.8)), yaw = Math.atan2(x1 - x0, z1 - z0); for (let i = 0; i <= m; i++) { const t = i / m; k.box('wood', x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.14, 1.5, 0.14, { tint: [0.3, 0.24, 0.16], aux: W(2, 0.5, 1) }); } for (const y of [0.6, 1.25]) k.obox('wood', (x0 + x1) / 2, y, (z0 + z1) / 2, 0.08, 0.1, L, 0, yaw, 0, { tint: [0.34, 0.27, 0.18], aux: W(2, 0.5, 1) }); k.collider((x0 + x1) / 2, 0.75, (z0 + z1) / 2, 0.1, 0.75, L / 2, yaw, 'fence'); };
  side(-w / 2, 0, w / 2, 0); side(w / 2, 0, w / 2, -d); side(w / 2, -d, -w / 2, -d); side(-w / 2, -d, -w / 2, -d * 0.4);
  void n;
  return { cls: 'wood', breakV: 6, foot: [w / 2 + 0.5, d / 2 + 0.5, -d / 2], h: 1.5, small: true };
}

export function tent(k, o) {
  const w = o.w || 3.4, d = o.d || 4.2, h = o.h || 2.3, t = o.tint || shade(CANVAS, 0.85 + (o.seed || 0) % 3 * 0.07);
  const slope = Math.atan2(h, w / 2), len = Math.hypot(w / 2, h);
  for (const s of [-1, 1]) k.obox('plaster', s * w / 4, h / 2, -d / 2, len, 0.04, d, 0, 0, -s * slope, { tint: t, aux: [0, 0, 0, 0], bottom: true });
  k.box('wood', 0, 0, -d / 2, 0.08, h, 0.08, { tint: [0.3, 0.24, 0.16], aux: W(2, 0.5, 1) });
  k.box('wood', 0, 0, 0.02, 0.08, h, 0.08, { tint: [0.3, 0.24, 0.16], aux: W(2, 0.5, 1) });
  k.box('wood', 0, 0, -d + 0.04, 0.08, h, 0.08, { tint: [0.3, 0.24, 0.16], aux: W(2, 0.5, 1) });
  k.box('plaster', 0, 0, -d + 0.03, w * 0.95, h * 0.55, 0.03, { tint: shade(t, 0.9), aux: [0, 0, 0, 0] });
  k.collider(0, h / 2, -d / 2, w / 2, h / 2, d / 2);
  return { cls: 'wood', breakV: 4, foot: [w / 2 + 0.3, d / 2 + 0.3, -d / 2], h, small: true };
}

export function bigTent(k, o) {
  const w = o.w || 9, d = o.d || 14, wall = 2.2, h = 2.4;
  k.box('wood', 0, 0, -d / 2, w, wall, d, { tint: [0.4, 0.32, 0.22], aux: W(1, 0.5, 1) });
  k.push(0, 0, -d / 2, Math.PI / 2); k.gable('plaster', 0, wall, 0, d, w, h, { tint: shade(CANVAS, 0.95), aux: [0, 0, 0, 0], overhang: 0.3, overhangD: 0.2, gableMat: 'plaster', gable: { tint: shade(CANVAS, 0.9), aux: [0, 0, 0, 0] } }); k.pop();
  k.box('wood', 0, wall + h - 0.1, 0.05, Math.min(w * 0.8, 6.5), 1.1, 0.12, { tint: [0.35, 0.27, 0.18], aux: W(2, 0.5, 1) });
  if (o.sign) k.sign(o.sign, 0, wall + h + 0.45, 0.13, Math.min(w * 0.75, 6.2), Math.min(w * 0.75, 6.2) / 8, 0, 0.2);
  door(k, 0, 1.4, 2.1, { tint: [0.2, 0.14, 0.09], trim: [0.4, 0.32, 0.22] });
  k.collider(0, wall / 2 + 0.6, -d / 2, w / 2, wall / 2 + 0.6, d / 2);
  return { cls: 'wood', breakV: 11, foot: [w / 2 + 0.4, d / 2 + 0.4, -d / 2], h: wall + h + 1 };
}

export function sluice(k, o) {
  const L = o.l || 14;
  k.obox('wood', 0, 0.75, 0, 0.9, 0.06, L, 0.05, 0, 0, { tint: [0.36, 0.28, 0.18], aux: W(1, 0.6, 1), bottom: true });
  for (const s of [-1, 1]) k.obox('wood', s * 0.45, 0.95, 0, 0.06, 0.4, L, 0.05, 0, 0, { tint: [0.34, 0.26, 0.17], aux: W(1, 0.6, 1) });
  for (let i = 0; i <= Math.round(L / 2.5); i++) { const z = -L / 2 + i * 2.5; for (const s of [-1, 1]) k.box('wood', s * 0.5, 0, z, 0.1, 0.8 - z * 0.025, 0.1, { tint: [0.3, 0.24, 0.16], aux: W(2, 0.5, 1) }); }
  k.collider(0, 0.6, 0, 0.5, 0.6, L / 2, 0, 'fence');
  return { cls: 'wood', breakV: 6, foot: [0.8, L / 2, 0], h: 1.2, small: true };
}

export function brickBlock(k, o) {
  const w = o.w, d = o.d || 16, fl = o.floors || 2, fh = 3.9, H = fl * fh + 0.9, col = o.color || C.brick, trim = o.trim || [0.62, 0.56, 0.46];
  k.box('masonry', 0, -0.6, -d / 2, w + 0.1, 0.65, d + 0.1, { tint: C.stone, aux: [1, 0, 0, 0] });
  k.box('masonry', 0, 0, -d / 2, w, H, d, { tint: col, aux: [o.pat || 0, 0, 0, 0] });
  k.box('roof', 0, H - 0.05, -d / 2, w - 0.2, 0.1, d - 0.2, { tint: C.asphaltRoof, aux: [3, 0.4, 0, 0] });
  k.box('masonry', 0, H, 0.05, w + 0.3, 0.55, 0.55, { tint: trim, aux: [1, 0, 0, 0] });
  k.box('masonry', 0, fh, 0.08, w + 0.15, 0.3, 0.35, { tint: trim, aux: [1, 0, 0, 0] });
  for (const s of [-1, 1]) k.box('masonry', s * (w / 2 - 0.25), 0, 0.12, 0.5, H, 0.25, { tint: shade(col, 0.9), aux: [o.pat || 0, 0, 0, 0] });
  const n = Math.max(2, Math.floor(w / 3.2));
  for (let f = 1; f < fl; f++) for (let i = 0; i < n; i++) win(k, -w / 2 + (i + 0.5) * w / n, f * fh + 0.85, 1.15, 2.0, { z: 0.02, frameTint: trim, mullion: true, lit: o.lit, seed: (o.seed || 0) + f * 10 + i });
  const sw = (w - 3) / 2;
  for (const s of [-1, 1]) win(k, s * (sw / 2 + 0.95), 0.6, sw - 0.5, 2.5, { z: 0.02, frame: 'metal', frameTint: [0.18, 0.16, 0.14], mullion: true, lit: 0.8, seed: o.seed });
  door(k, 0, 1.4, 2.6, { z: 0.02, tint: o.doorTint || [0.18, 0.12, 0.08], trim, glass: true });
  if (o.awning !== false) k.obox('plaster', 0, 2.68, 0.95, w - 0.6, 0.05, 1.9, 0.38, 0, 0, { tint: o.awningTint || [0.45, 0.1, 0.08], aux: [0, 0, 0, 0], bottom: true });
  if (o.sign) k.sign(o.sign, 0, fh - 0.55, 0.28, Math.min(w * 0.8, 10), Math.min(w * 0.8, 10) / 8, 0, o.glow || 0.4);
  k.collider(0, H / 2, -d / 2, w / 2, H / 2, d / 2);
  return { cls: 'brick', breakV: o.breakV || 30, foot: [w / 2 + 0.3, d / 2 + 2, -d / 2 + 1.2], h: H + 0.6 };
}

export function theatre(k, o) {
  const info = brickBlock(k, { ...o, floors: 2, awning: false, sign: null, color: o.color || [0.56, 0.36, 0.22] });
  const w = o.w, mz = 1.6, mh = 1.4, my = 3.3;
  k.box('metal', 0, my, mz, Math.min(w - 1, 10), mh, 3.0, { tint: [0.2, 0.18, 0.16], aux: [0, 0.4, 0.5, 0], bottom: true });
  for (const s of [-1, 1]) k.box('light', 0, my + 0.15 + (s > 0 ? mh - 0.3 : 0), mz + 1.51, Math.min(w - 1, 10) - 0.2, 0.08, 0.02, { tint: [1, 0.85, 0.5], aux: [0.6, 3.5, 0, 0] });
  if (o.sign) k.sign(o.sign, 0, my + mh / 2, mz + 1.52, Math.min(w - 1.6, 9), Math.min(w - 1.6, 9) / 8, 0, 1.6);
  k.box('metal', w / 2 - 1.4, 5.2, 0.55, 0.4, 5.4, 1.4, { tint: [0.15, 0.13, 0.12], aux: [0, 0.4, 0.5, 0] });
  for (let i = 0; i < 7; i++) k.box('light', w / 2 - 1.4, 5.5 + i * 0.72, 1.27, 0.3, 0.46, 0.02, { tint: [1, 0.55, 0.2], aux: [0.5, 3, 0, 0] });
  return info;
}

export function derrick(k, o) {
  const h = o.h || 24, b = 3.4, t = 0.5, tint = [0.32, 0.25, 0.17], aux = W(2, 0.6, 1);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lean = Math.atan2(b - t, h); k.obox('wood', sx * (b + t) / 2, h / 2, sz * (b + t) / 2, 0.22, h, 0.22, sz * lean, 0, -sx * lean, { tint, aux }); }
  for (let i = 1; i < 7; i++) { const y = (i / 7) * h, hw = b + (t - b) * (i / 7); for (const [rx, rz, ry] of [[0, hw, 0], [0, -hw, 0], [hw, 0, Math.PI / 2], [-hw, 0, Math.PI / 2]]) k.obox('wood', rx, y, rz, hw * 2, 0.14, 0.14, 0, ry, 0, { tint, aux }); }
  k.box('wood', 0, h, 0, 1.6, 0.6, 1.6, { tint, aux });
  k.box('wood', 0, 0, 0, b * 2.4, 0.4, b * 2.4, { tint: [0.28, 0.22, 0.15], aux: W(2, 0.6, 1) });
  k.collider(0, h / 2, 0, b * 0.8, h / 2, b * 0.8, 0, 'pole');
  return { cls: 'wood', breakV: 18, foot: [b + 0.6, b + 0.6, 0], h: h + 1 };
}

export function oldStation(k, o) {
  const w = 8, d = 6, h = 3.6, col = o.color || [0.86, 0.84, 0.78], acc = o.accent || [0.15, 0.32, 0.18];
  k.box('plaster', 0, -0.3, -d / 2, w + 0.2, 0.35, d + 0.2, { tint: C.concrete, aux: [1, 0, 0, 0] });
  k.box('plaster', 0, 0, -d / 2, w, h, d, { tint: col, aux: [0, 0, 0, 0] });
  k.hip('roof', 0, h, -d / 2, w, d, 1.5, { tint: TILE, aux: [2, 0.3, 0, 0], overhang: 0.6 });
  k.box('plaster', 0, h - 0.05, 2.6, 5.5, 0.35, 5, { tint: acc, aux: [0, 0, 0, 0], bottom: true });
  for (const x of [-2.4, 2.4]) k.box('plaster', x, 0, 4.8, 0.35, h, 0.35, { tint: col, aux: [0, 0, 0, 0] });
  for (const x of [-1.2, 1.2]) { k.cyl('metal', x, 0, 3.4, 0.22, 0.28, 2.3, 10, { tint: o.pump || [0.75, 0.12, 0.08], aux: [0, 0.35, 0.3, 0] }); k.cyl('glass', x, 2.3, 3.4, 0.2, 0.2, 0.5, 10, { tint: [0.7, 0.68, 0.6], aux: [0, 1, 0, 0] }); }
  door(k, 1.8, 1.1, 2.3, { tint: acc, trim: C.white, glass: true });
  win(k, -1.6, 0.9, 2.2, 1.6, { frameTint: acc, mullion: true, lit: 0.8, seed: o.seed });
  if (o.sign) k.sign(o.sign, 0, h + 0.15, 5.11, 5, 0.62, 0, 0.6);
  k.collider(0, h / 2, -d / 2, w / 2, h / 2, d / 2);
  for (const x of [-1.2, 1.2]) k.collider(x, 1.3, 3.4, 0.3, 1.3, 0.3, 0, 'pump');
  for (const x of [-2.4, 2.4]) k.collider(x, h / 2, 4.8, 0.2, h / 2, 0.2, 0, 'pole');
  return { cls: 'stucco', breakV: 22, foot: [w / 2 + 0.6, d / 2 + 3.5, 0.5], h: h + 1.6 };
}

export function bungalow(k, o) {
  const w = o.w || 10, d = o.d || 9, h = 3.0, col = o.color || [0.62, 0.55, 0.42], trim = o.trim || C.white;
  k.box('masonry', 0, -0.5, -d / 2, w + 0.1, 0.55, d + 0.1, { tint: C.stone, aux: [1, 0, 0, 0] });
  k.box('wood', 0, 0, -d / 2, w, h, d, { tint: col, aux: W(0, 0.15) });
  k.gable('roof', 0, h, -d / 2, w, d, 2.2, { tint: o.roofTint || [0.25, 0.2, 0.16], aux: [1, 0.2, 0, 0], overhang: 0.8, overhangD: 0.6, gableMat: 'wood', gable: { tint: col, aux: W(0, 0.15) } });
  k.box('wood', 0, -0.05, 1.3, w * 0.7, 0.4, 2.6, { tint: shade(col, 0.85), aux: W(2, 0.2) });
  for (const s of [-1, 1]) k.box('masonry', s * w * 0.32, 0.35, 2.4, 0.5, 2.3, 0.5, { tint: C.stone, aux: [1, 0, 0, 0] });
  k.obox('roof', 0, 2.8, 1.25, w * 0.75, 0.08, 2.9, 0.22, 0, 0, { tint: o.roofTint || [0.25, 0.2, 0.16], aux: [1, 0.2, 0, 0], bottom: true });
  door(k, 0, 1.0, 2.2, { tint: [0.28, 0.17, 0.09], trim, glass: true });
  for (const s of [-1, 1]) win(k, s * w * 0.26, 0.9, 1.5, 1.4, { frameTint: trim, mullion: true, lit: o.lit, seed: o.seed });
  k.collider(0, h / 2 + 0.5, -d / 2, w / 2, h / 2 + 0.5, d / 2);
  return { cls: 'wood', breakV: 15, foot: [w / 2 + 0.8, d / 2 + 2.8, -d / 2 + 1.3], h: h + 2.2 };
}

export function diner(k, o) {
  const w = o.w || 16, d = 9, h = 3.6, col = o.color || [0.86, 0.86, 0.84], acc = o.accent || [0.7, 0.12, 0.1];
  k.box('plaster', 0, -0.3, -d / 2, w + 2, 0.35, d + 3, { tint: C.concrete, aux: [1, 0, 0, 0] });
  k.box('plaster', 0, 0, -d / 2, w, 1.0, d, { tint: acc, aux: [2, 0, 0, 0] });
  k.box('glass', 0, 1.0, -d / 2, w - 0.2, h - 1.0, d - 0.2, { tint: [0.04, 0.05, 0.06], aux: [0, 0.95, o.seed || 0, 0], bottom: false });
  k.obox('plaster', 0, h + 0.45, -d / 2 + 0.5, w + 3.2, 0.3, d + 3.4, -0.16, 0, 0, { tint: col, aux: [2, 0, 0, 0], bottom: true });
  k.box('light', 0, h + 0.1, 1.4, w + 2.6, 0.12, 0.08, { tint: [1, 0.3, 0.5], aux: [0.6, 3.5, 0, 0] });
  k.cyl('metal', w / 2 + 2.5, 0, 2, 0.22, 0.25, 9, 8, { tint: [0.75, 0.76, 0.78], aux: [0, 0.3, 0.8, 0] });
  k.obox('plaster', w / 2 + 2.5, 8.6, 2, 0.5, 2.6, 4.2, 0.3, Math.PI / 2, 0, { tint: acc, aux: [2, 0, 0, 0], bottom: true });
  if (o.sign) { k.sign(o.sign, w / 2 + 2.78, 8.6, 2, 3.8, 0.55, Math.PI / 2, 2.2); k.sign(o.sign, 0, h + 1.05, 1.95, 5.5, 0.7, 0, 2.0); }
  k.box('light', w / 2 + 2.5, 7.1, 2, 0.6, 0.1, 4.6, { tint: [0.3, 0.9, 1], aux: [0.5, 3.5, 0, 0] });
  k.collider(0, h / 2, -d / 2, w / 2, h / 2, d / 2);
  k.collider(w / 2 + 2.5, 4.5, 2, 0.25, 4.5, 0.25, 0, 'pole');
  return { cls: 'stucco', breakV: 24, foot: [w / 2 + 3, d / 2 + 2, -d / 2 + 1.5], h: h + 1 };
}

export function motel(k, o) {
  const n = o.rooms || 10, rw = 4.2, d = 8, h = 3.0, w = n * rw, col = o.color || [0.88, 0.82, 0.66], acc = o.accent || [0.2, 0.42, 0.45];
  k.box('plaster', 0, -0.3, -d / 2, w + 1, 0.35, d + 4, { tint: C.concrete, aux: [1, 0, 0, 0] });
  k.box('plaster', 0, 0, -d / 2, w, h, d, { tint: col, aux: [0, 0, 0, 0] });
  k.obox('roof', 0, h + 0.15, -d / 2 + 0.9, w + 0.8, 0.15, d + 2.4, 0.06, 0, 0, { tint: [0.45, 0.43, 0.4], aux: [3, 0.3, 0, 0], bottom: true });
  for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * rw; door(k, x - 0.9, 0.95, 2.1, { tint: acc, trim: C.white }); win(k, x + 0.8, 1.0, 1.4, 1.1, { frame: 'metal', frameTint: [0.85, 0.85, 0.8], lit: 0.7, seed: (o.seed || 0) + i }); k.box('plaster', x + rw / 2, 0, 1.0, 0.25, h, 0.25, { tint: col, aux: [0, 0, 0, 0] }); }
  const sx = -w / 2 - 3;
  k.cyl('metal', sx, 0, 3, 0.25, 0.28, 10, 8, { tint: [0.7, 0.71, 0.72], aux: [0, 0.3, 0.8, 0.2] });
  k.obox('metal', sx, 9.3, 3, 0.4, 2.4, 5.2, 0, Math.PI / 2, 0, { tint: [0.12, 0.25, 0.3], aux: [0, 0.4, 0.4, 0.1] });
  if (o.sign) for (const s of [-1, 1]) k.sign(o.sign, sx, 9.5, 3 + s * 0.22, 4.6, 0.62, s > 0 ? 0 : Math.PI, 2.6);
  if (o.sign2) k.sign(o.sign2, sx, 7.7, 3.22, 3.4, 0.45, 0, 2.6);
  k.box('light', sx, 8.0, 3, 0.1, 3.0, 5.4, { tint: [1, 0.4, 0.3], aux: [0.4, 3, 0, 0] });
  k.collider(0, h / 2, -d / 2, w / 2, h / 2, d / 2);
  k.collider(sx, 5, 3, 0.28, 5, 0.28, 0, 'pole');
  return { cls: 'stucco', breakV: 24, foot: [w / 2 + 4, d / 2 + 3, -d / 2 + 2], h: h + 1 };
}

export function driveIn(k, o) {
  const w = 30, h = 14, y0 = 3;
  for (const s of [-1, 1]) for (const z of [-1.6, 0]) k.box('wood', s * (w / 2 - 1), 0, -2 + z, 0.4, y0 + h + 0.5, 0.4, { tint: [0.4, 0.38, 0.35], aux: W(2, 0.5, 1) });
  for (let i = 0; i < 5; i++) k.obox('wood', 0, 2 + i * 3.5, -2.8, w - 1.5, 0.25, 0.25, 0, 0, 0, { tint: [0.4, 0.38, 0.35], aux: W(2, 0.5, 1) });
  k.box('plaster', 0, y0, -2, w, h, 0.3, { tint: [0.9, 0.9, 0.88], aux: [0, 0, 0, 0] });
  k.box('light', 0, y0 + 0.5, -1.82, w - 1.5, h - 1.0, 0.02, { tint: [0.65, 0.68, 0.75], aux: [0.0, o.show ? 1.6 : 0, 0, 0] });
  for (let r = 1; r <= 5; r++) for (let i = -6; i <= 6; i++) { const x = i * 3.6, z = r * 9 + Math.abs(i) * 0.4; k.box('metal', x, 0, z, 0.1, 1.2, 0.1, { tint: [0.35, 0.35, 0.36], aux: [0, 0.4, 0.7, 0.4] }); k.box('metal', x, 1.2, z, 0.3, 0.25, 0.2, { tint: [0.6, 0.6, 0.6], aux: [0, 0.4, 0.7, 0.3] }); }
  k.box('plaster', 0, 0, 52, 8, 3.2, 5, { tint: [0.82, 0.8, 0.74], aux: [0, 0, 0, 0] });
  k.box('light', 0, 2.0, 49.48, 1.0, 0.5, 0.02, { tint: [1, 1, 0.9], aux: [0.3, 3, 0, 0] });
  if (o.sign) k.sign(o.sign, 0, y0 + h + 1.4, -1.8, 10, 1.25, 0, 2.2);
  k.collider(0, (y0 + h) / 2, -2, w / 2, (y0 + h) / 2, 0.5);
  k.collider(0, 1.6, 52, 4, 1.6, 2.5);
  return { cls: 'wood', breakV: 22, foot: [w / 2 + 1, 30, 24], h: y0 + h + 2 };
}

export function bigBox(k, o) {
  const w = o.w || 70, d = 50, h = 9, col = o.color || [0.78, 0.76, 0.7], acc = o.accent || [0.1, 0.3, 0.6];
  k.box('plaster', 0, 0, -d / 2, w, h, d, { tint: col, aux: [3, 0, 0, 0] });
  k.box('plaster', 0, 0, 0.3, 18, h + 2.5, 1.6, { tint: acc, aux: [2, 0, 0, 0] });
  k.box('roof', 0, h, -d / 2, w, 0.15, d, { tint: [0.6, 0.6, 0.58], aux: [3, 0.2, 0, 0] });
  win(k, 0, 0.1, 9, 3.2, { z: 1.1, frame: 'metal', frameTint: [0.3, 0.3, 0.32], lit: 0.95, cool: 1, seed: 4, mullion: true });
  if (o.sign) k.sign(o.sign, 0, h + 0.9, 1.12, 14, 1.75, 0, 1.6);
  k.box('plaster', 0, -0.3, 30, w + 20, 0.35, 56, { tint: [0.16, 0.16, 0.17], aux: [1, 0, 0, 0] });
  for (let i = -6; i <= 6; i++) for (let r = 0; r < 4; r++) k.box('plaster', i * 5.5, 0.06, 12 + r * 12, 0.12, 0.02, 5, { tint: [0.85, 0.85, 0.8], aux: [0, 0, 0, 0] });
  k.collider(0, h / 2, -d / 2, w / 2, h / 2, d / 2);
  return { cls: 'concrete', breakV: 60, foot: [w / 2 + 2, d / 2 + 2, -d / 2], h: h + 3 };
}

export function cellTower(k, o) {
  const h = o.h || 34;
  k.cyl('metal', 0, 0, 0, 0.45, 0.85, h, 10, { tint: [0.62, 0.63, 0.64], aux: [0, 0.4, 0.8, 0.1] });
  for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2, y = h - 1.2 - t * 3.2; k.obox('metal', Math.cos(a) * 1.2, y, Math.sin(a) * 1.2, 0.35, 2.2, 0.18, 0, -a, 0, { tint: [0.85, 0.85, 0.83], aux: [0, 0.5, 0.2, 0] }); }
  k.cyl('metal', 0, h - 4, 0, 1.3, 1.3, 0.12, 12, { tint: [0.55, 0.56, 0.57], aux: [0, 0.4, 0.8, 0] });
  k.box('light', 0, h + 0.1, 0, 0.18, 0.18, 0.18, { tint: [1, 0.08, 0.04], aux: [0.6, 4, 0, 0] });
  k.box('plaster', 2.5, 0, 2.5, 2.4, 2.4, 3, { tint: [0.7, 0.7, 0.68], aux: [1, 0, 0, 0] });
  k.collider(0, h / 2, 0, 0.8, h / 2, 0.8, 0, 'pole');
  return { cls: 'steel', breakV: 26, foot: [1.5, 1.5, 0], h };
}

export function tower(k, o) {
  const GL = [[0.1, 0.16, 0.22], [0.14, 0.2, 0.2], [0.18, 0.15, 0.12], [0.1, 0.12, 0.18]], w = o.w || 24, d = o.d || 24, H = o.h || 120, fh = 4, tint = o.glass || GL[(o.seed || 0) % 4], frame = o.frame || [0.86, 0.88, 0.9];
  const tiers = H > 90 ? 3 : 2;
  let y = 0, cw = w, cd = d;
  for (let t = 0; t < tiers; t++) {
    const th = t === tiers - 1 ? H - y : H * (t === 0 ? 0.5 : 0.3);
    k.box('glass', 0, y, -d / 2, cw, th, cd, { tint, aux: [1, 0.8, (o.seed || 0) + t, o.broken || 0], bottom: false });
    for (let f = 1; f < Math.floor(th / fh); f += 2) k.box('plaster', 0, y + f * fh, -d / 2, cw + 0.15, 0.25, cd + 0.15, { tint: frame, aux: [2, 0, 0, 0], skip: ['py', 'ny'] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('plaster', sx * cw / 2, y, -d / 2 + sz * cd / 2, 0.6, th, 0.6, { tint: frame, aux: [2, 0, 0, 0] });
    y += th; cw *= 0.78; cd *= 0.78;
    k.box('plaster', 0, y - 0.4, -d / 2, cw / 0.78 + 0.5, 0.8, cd / 0.78 + 0.5, { tint: frame, aux: [2, 0, 0, 0], bottom: true });
  }
  k.box('light', 0, H + 0.4, -d / 2, cw * 0.7, 0.2, cd * 0.7, { tint: o.crown || [0.6, 0.85, 1], aux: [0.6, 3, 0, 0] });
  k.cyl('metal', 0, H + 0.4, -d / 2, 0.25, 0.4, H * 0.12, 8, { tint: [0.8, 0.8, 0.82], aux: [0, 0.3, 0.8, 0] });
  if (o.sign) k.sign(o.sign, 0, 5.2, 0.35, Math.min(w * 0.6, 12), Math.min(w * 0.6, 12) / 8, 0, 1.8);
  k.box('plaster', 0, 0, 2.5, w * 0.7, 0.25, 5, { tint: [0.6, 0.62, 0.64], aux: [1, 0, 0, 0] });
  k.collider(0, H / 2, -d / 2, w / 2, H / 2, d / 2);
  return { cls: 'concrete', breakV: 999, foot: [w / 2 + 1, d / 2 + 3, -d / 2 + 1], h: H };
}

export function crystals(k, o) {
  const R = o.rng || Math.random, n = o.n || 7, h0 = o.h || 14;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = i === 0 ? 0 : 2 + R() * (o.r || 7), h = h0 * (i === 0 ? 1 : 0.35 + R() * 0.6), r = 0.6 + R() * 1.2 + (i === 0 ? 1 : 0);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, tx = (R() - 0.5) * 0.5, tz = (R() - 0.5) * 0.5;
    k.cyl('glass', x, -0.5, z, r * 0.15, r, h, 6, { tint: [0.1, 0.35, 0.42], aux: [1, 0, 0, 0], rx: tx, rz: tz });
    k.cyl('light', x, -0.3, z, r * 0.05, r * 0.35, h * 0.92, 6, { tint: [0.35, 0.9, 1.0], aux: [0.35 + R() * 0.3, 2.2, 0, 0], rx: tx, rz: tz });
    if (i < 3) k.collider(x, h / 2, z, r, h / 2, r, 0, 'pole');
  }
  return { cls: 'steel', breakV: 999, foot: [o.r || 7, o.r || 7, 0], h: h0 };
}

export function iceSpire(k, o) {
  const h = o.h || 30, r = o.r || 8;
  k.cyl('scifi', 0, -2, 0, r * 0.35, r, h, 18, { tint: [0.82, 0.86, 0.92], aux: [3.6, 0, 0.1, 0] });
  k.cyl('scifi', 0, h - 2, 0, r * 0.2, r * 0.35, h * 0.3, 18, { tint: [0.75, 0.8, 0.88], aux: [3.6, 0, 0.1, 0] });
  k.cyl('rubble', 0, -1, 0, r * 1.1, r * 1.9, 3.2, 16, { tint: [0.75, 0.8, 0.86], aux: [0, 0, 0, 0] });
  k.collider(0, h / 2, 0, r * 0.7, h / 2, r * 0.7, 0, 'pole');
  return { cls: 'concrete', breakV: 999, foot: [r * 1.9, r * 1.9, 0], h: h * 1.3 };
}

export function vents(k, o) {
  const R = o.rng || Math.random, n = o.n || 5;
  for (let i = 0; i < n; i++) { const a = R() * 6.28, d = R() * 6, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.8 + R() * 2.6, r = 0.6 + R() * 0.8; k.cyl('rubble', x, -0.4, z, r * 0.45, r, h, 9, { tint: [0.34, 0.27, 0.2], aux: [0, 0, 0, 0], cap: false }); k.box('light', x, h - 0.35, z, r * 0.6, 0.05, r * 0.6, { tint: [1, 0.4, 0.1], aux: [0.8, 1.6, 0, 0] }); }
  return { cls: 'concrete', breakV: 999, foot: [7, 7, 0], h: 3 };
}

export function smallLamp(k, o = {}) {
  const h = o.h || 3.8, gas = o.style === 'gas';
  k.cyl('metal', 0, 0, 0, 0.07, 0.12, h, 8, { tint: [0.12, 0.13, 0.12], aux: [0, 0.4, 0.7, 0.3] });
  k.cyl('metal', 0, 0, 0, 0.18, 0.2, 0.5, 8, { tint: [0.12, 0.13, 0.12], aux: [0, 0.4, 0.7, 0.3] });
  if (gas) { k.cyl('glass', 0, h, 0, 0.22, 0.14, 0.55, 6, { tint: [0.6, 0.55, 0.4], aux: [0, 1, 0, 0] }); k.cyl('metal', 0, h + 0.55, 0, 0.02, 0.28, 0.2, 6, { tint: [0.12, 0.13, 0.12], aux: [0, 0.4, 0.7, 0.3] }); k.box('light', 0, h + 0.15, 0, 0.16, 0.3, 0.16, { tint: [1, 0.72, 0.38], aux: [0, 3.2, 0, 0] }); }
  else { for (const s of [-1, 1]) { k.obox('metal', s * 0.45, h - 0.15, 0, 0.9, 0.06, 0.06, 0, 0, 0, { tint: [0.12, 0.13, 0.12], aux: [0, 0.4, 0.7, 0.3] }); k.cyl('glass', s * 0.85, h - 0.65, 0, 0.18, 0.18, 0.42, 10, { tint: [0.75, 0.72, 0.65], aux: [0, 1, 0, 0] }); k.box('light', s * 0.85, h - 0.55, 0, 0.2, 0.2, 0.2, { tint: [1, 0.85, 0.6], aux: [0, 3.6, 0, 0] }); } }
  k.collider(0, h / 2, 0, 0.14, h / 2, 0.14, 0, 'pole');
  return { cls: 'pole', breakV: 8, foot: [0.4, 0.4, 0], h: h + 0.6 };
}

export function cobraLight(k, o = {}) {
  const h = o.h || 9.5, arm = 3.0;
  k.cyl('metal', 0, 0, 0, 0.1, 0.18, h, 8, { tint: [0.6, 0.61, 0.62], aux: [0, 0.35, 0.85, o.rust || 0.05] });
  k.obox('metal', 0, h + 0.25, arm / 2, 0.1, 0.1, arm, -0.18, 0, 0, { tint: [0.6, 0.61, 0.62], aux: [0, 0.35, 0.85, 0.05] });
  k.obox('metal', 0, h + 0.45, arm, 0.5, 0.22, 1.0, -0.08, 0, 0, { tint: [0.55, 0.56, 0.57], aux: [0, 0.35, 0.85, 0] });
  k.box('light', 0, h + 0.33, arm, 0.4, 0.03, 0.8, { tint: o.sodium ? [1.0, 0.62, 0.25] : [0.95, 0.95, 1.0], aux: [0, 5, 0, 0] });
  k.collider(0, h / 2, 0, 0.18, h / 2, 0.18, 0, 'pole');
  return { cls: 'pole', breakV: 10, foot: [0.4, 0.4, 0], h: h + 0.6 };
}
