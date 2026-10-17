// Roadster 88 era flora: a procedurally painted leaf atlas (oak, conifer, fan palm, fern, cycad, grasses, reeds, sage, broadleaf, eucalyptus, twigs, wildflowers, lycopsid leaves, ginkgo fans, citrus, wheat, moss and far-future fronds, tree impostors with alpha-preserving mips), the shared foliage and rock materials, and the species geometry builders from Devonian prototaxites, Carboniferous lepidodendrons and calamites to orange groves and far-future umbrella trees (near cards and far impostors).
import * as THREE from 'three/webgpu';
import { texture, attribute, uv, vec2, vec3, float, floor, uniform, mix, step, smoothstep, mx_noise_float, positionLocal, positionWorld, normalViewGeometry, time, sin, hash, instanceIndex, bumpMap, max } from 'three/tsl';
import { rng } from './lib.js';

export const CELL = { oak: 0, conifer: 1, palm: 2, fern: 3, cycad: 4, grass: 5, dry: 6, reed: 7, impOak: 8, impConifer: 9, impPalm: 10, shrub: 11, bigleaf: 12, eucalypt: 13, twig: 14, impFern: 15, flower: 16, lepido: 17, ginkgo: 18, alien: 19, moss: 20, orange: 21, wheat: 22 };
const S = 512, G = 5;

function hsl(h, s, l, a = 1) { return `hsla(${h},${s}%,${l}%,${a})`; }

function paintAtlas() {
  const cv = document.createElement('canvas'); cv.width = cv.height = S * G;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const R = rng(1885);
  const r = (a, b) => a + R() * (b - a);
  const cell = (k, fn) => { ctx.save(); ctx.translate((k % G) * S, Math.floor(k / G) * S); ctx.beginPath(); ctx.rect(0, 0, S, S); ctx.clip(); fn(); ctx.restore(); };
  const leaf = (x, y, ang, len, wid, col, rib) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.45, -wid, len, 0); ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
    ctx.fillStyle = col; ctx.fill();
    if (rib) { ctx.strokeStyle = rib; ctx.lineWidth = Math.max(0.6, wid * 0.12); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.85, 0); ctx.stroke(); }
    ctx.restore();
  };
  const twig = (x0, y0, x1, y1, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + r(-15, 15), (y0 + y1) / 2 + r(-15, 15), x1, y1); ctx.stroke(); };
  const cluster = (cx, cy, rad, n, h0, s0, l0, len, wid, opts = {}) => {
    for (let k = 0; k < 7; k++) { const a = r(0, Math.PI * 2), d = r(0.3, 0.9) * rad; twig(cx, cy + rad * 0.3, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r(2, 4), 'rgba(60,45,30,1)'); }
    for (let i = 0; i < n; i++) {
      const a = r(0, Math.PI * 2), d = Math.sqrt(R()) * rad;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * (opts.flat || 1);
      const shade = (y - (cy - rad)) / (2 * rad);
      const l = l0 + r(-7, 9) - shade * (opts.shade === undefined ? 12 : opts.shade);
      leaf(x, y, a + r(-0.9, 0.9) + (opts.droop ? Math.PI / 2 * opts.droop : 0), len * r(0.75, 1.25), wid * r(0.8, 1.2), hsl(h0 + r(-8, 8), s0 + r(-8, 8), l), hsl(h0, s0, l - 8));
    }
  };
  const blades = (n, h0, s0, l0, hmin, hmax, wmax, spread, opts = {}) => {
    for (let i = 0; i < n; i++) {
      const x0 = S / 2 + r(-S * 0.08, S * 0.08), y0 = S;
      const hgt = S * r(hmin, hmax), lean = r(-spread, spread) * S;
      const x1 = x0 + lean, y1 = y0 - hgt, w = r(wmax * 0.5, wmax);
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, hsl(h0, s0, l0 - 10)); g.addColorStop(1, hsl(h0 + (opts.tipH || 6), s0 - 6, l0 + (opts.tipL || 14)));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x0 - w, y0); ctx.quadraticCurveTo(x0 + lean * 0.35, y0 - hgt * 0.6, x1, y1); ctx.quadraticCurveTo(x0 + lean * 0.35 + w * 0.6, y0 - hgt * 0.6, x0 + w, y0); ctx.fill();
      if (opts.seeds && R() < opts.seeds) { for (let k = 0; k < 7; k++) { const t = k / 7; leaf(x1 - lean * 0.05 * t, y1 + hgt * 0.12 * t, -Math.PI / 2 + r(-0.6, 0.6), 10, 3, hsl(40, 45, r(55, 68))); } }
    }
  };
  const frond = (x0, y0, x1, y1, bend, pinna, pw, h0, s0, l0, opts = {}) => {
    const N = opts.n || 34;
    const P = (t) => { const x = x0 + (x1 - x0) * t + bend * Math.sin(Math.PI * t), y = y0 + (y1 - y0) * t; return [x, y]; };
    ctx.strokeStyle = hsl(h0 - 10, s0 - 20, l0 - 18); ctx.lineWidth = opts.rachis || 4; ctx.beginPath();
    for (let i = 0; i <= 20; i++) { const [x, y] = P(i / 20); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
    for (let i = 1; i < N; i++) {
      const t = i / N, [x, y] = P(t), [xa, ya] = P(Math.min(1, t + 0.01));
      const dir = Math.atan2(ya - y, xa - x);
      const L = pinna * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (opts.taper ? 1 - t * 0.5 : 1);
      for (const s of [-1, 1]) {
        const a = dir + s * (opts.angle || 1.15);
        if (opts.sub) { for (let k = 1; k < 7; k++) { const q = k / 7; leaf(x + Math.cos(a) * L * q, y + Math.sin(a) * L * q, a + s * 0.9, pw * 2.2 * (1 - q * 0.5), pw * 0.7, hsl(h0 + r(-5, 5), s0, l0 + r(-6, 6) - q * 4)); } }
        else leaf(x, y, a, L, pw, hsl(h0 + r(-6, 6), s0 + r(-5, 5), l0 + r(-7, 7)), hsl(h0, s0, l0 - 10));
      }
    }
  };

  cell(CELL.oak, () => { cluster(S / 2, S * 0.48, S * 0.42, 520, 78, 34, 27, 26, 9, {}); });
  cell(CELL.conifer, () => {
    twig(S * 0.04, S / 2, S * 0.96, S / 2 + r(-10, 10), 6, 'rgba(70,52,38,1)');
    for (let i = 0; i < 26; i++) { const x = S * (0.08 + 0.85 * i / 26), y = S / 2; const L = S * 0.2 * Math.sin(Math.PI * (0.15 + 0.85 * i / 26)); for (const s of [-1, 1]) { twig(x, y, x + L * 0.5, y + s * L, 2.5, 'rgba(60,45,32,1)'); for (let k = 0; k < 12; k++) { const q = k / 12, px = x + L * 0.5 * q, py = y + s * L * q; for (const t of [-1, 1]) leaf(px, py, Math.atan2(s * L, L * 0.5) + t * 1.0, r(14, 22), 2.2, hsl(r(150, 165), r(25, 35), r(16, 26))); } } }
  });
  cell(CELL.palm, () => {
    ctx.strokeStyle = 'rgba(95,90,60,1)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(S / 2, S); ctx.lineTo(S / 2, S * 0.5); ctx.stroke();
    const cx = S / 2, cy = S * 0.5;
    for (let i = 0; i < 46; i++) {
      const a = -Math.PI / 2 + (i / 45 - 0.5) * Math.PI * 1.25, L = S * r(0.36, 0.46);
      const tipDrop = Math.abs(Math.sin(a + Math.PI / 2)) * 40;
      ctx.fillStyle = hsl(r(85, 100), r(18, 28), r(30, 40));
      ctx.beginPath(); ctx.moveTo(cx, cy);
      const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L + tipDrop;
      const pa = a + Math.PI / 2, w = r(5, 8);
      ctx.lineTo(cx + Math.cos(a) * L * 0.7 + Math.cos(pa) * w, cy + Math.sin(a) * L * 0.7 + Math.sin(pa) * w);
      ctx.lineTo(ex, ey); ctx.lineTo(cx + Math.cos(a) * L * 0.7 - Math.cos(pa) * w, cy + Math.sin(a) * L * 0.7 - Math.sin(pa) * w); ctx.fill();
      if (R() < 0.35) { ctx.strokeStyle = hsl(40, 30, 55, 0.8); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + r(-6, 6), ey + r(8, 22)); ctx.stroke(); }
    }
  });
  cell(CELL.fern, () => { frond(S / 2, S, S / 2 + r(-20, 20), S * 0.02, 30, S * 0.24, 7, 95, 55, 30, { sub: true, n: 26, rachis: 3 }); });
  cell(CELL.cycad, () => { frond(S / 2, S, S / 2, S * 0.02, 12, S * 0.3, 4.5, 110, 45, 22, { n: 44, angle: 0.75, rachis: 5, taper: true }); });
  cell(CELL.grass, () => { blades(90, 88, 42, 30, 0.45, 0.95, 5, 0.32, { tipL: 18 }); });
  cell(CELL.dry, () => { blades(70, 40, 30, 46, 0.35, 0.9, 2.6, 0.34, { seeds: 0.3, tipL: 10, tipH: 4 }); });
  cell(CELL.reed, () => {
    for (let i = 0; i < 26; i++) { const x = S / 2 + r(-S * 0.3, S * 0.3), h = S * r(0.55, 0.98); ctx.strokeStyle = hsl(r(70, 95), 35, r(30, 42)); ctx.lineWidth = r(3, 6); ctx.beginPath(); ctx.moveTo(x, S); ctx.quadraticCurveTo(x + r(-12, 12), S - h * 0.5, x + r(-20, 20), S - h); ctx.stroke(); if (R() < 0.4) { ctx.fillStyle = hsl(25, 45, 22); ctx.beginPath(); ctx.ellipse(x + r(-10, 10), S - h * 0.85, 7, 30, 0, 0, Math.PI * 2); ctx.fill(); } }
    blades(40, 80, 35, 34, 0.4, 0.8, 4, 0.35);
  });
  cell(CELL.shrub, () => { for (let k = 0; k < 9; k++) twig(S / 2, S, S / 2 + r(-S * 0.35, S * 0.35), S * r(0.35, 0.7), r(3, 6), 'rgba(80,70,55,1)'); cluster(S / 2, S * 0.5, S * 0.42, 900, 95, 14, 42, 14, 4.5, { flat: 0.85, shade: 16 }); });
  cell(CELL.bigleaf, () => { cluster(S / 2, S * 0.5, S * 0.4, 110, 105, 40, 24, 72, 24, { shade: 8 }); });
  cell(CELL.eucalypt, () => { for (let k = 0; k < 6; k++) twig(S / 2 + r(-60, 60), S * 0.1, S / 2 + r(-200, 200), S * r(0.5, 0.9), 3, 'rgba(110,90,75,1)'); for (let i = 0; i < 260; i++) { const x = S / 2 + r(-0.42, 0.42) * S, y = S * r(0.1, 0.85); leaf(x, y, Math.PI / 2 + r(-0.6, 0.6), r(40, 70), r(5, 8), hsl(r(110, 140), r(14, 24), r(32, 44))); } });
  cell(CELL.twig, () => {
    const branch = (x, y, a, len, w, d) => { const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len; twig(x, y, x1, y1, w, hsl(30, 12, r(22, 32))); if (d > 0) for (let k = 0; k < 3; k++) branch(x1, y1, a + r(-0.7, 0.7), len * r(0.55, 0.75), w * 0.65, d - 1); };
    branch(S / 2, S, -Math.PI / 2, S * 0.3, 9, 5);
  });
  cell(CELL.flower, () => {
    blades(70, 92, 40, 30, 0.25, 0.7, 3.2, 0.3, { tipL: 12 });
    const cols = [[52, 88, 56], [48, 92, 60], [28, 92, 52], [270, 42, 52], [0, 0, 88], [52, 88, 56]];
    for (let i = 0; i < 90; i++) { const c = cols[Math.floor(R() * cols.length)], x = S / 2 + r(-0.42, 0.42) * S, y = S * r(0.32, 0.78); for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; leaf(x, y, a, r(7, 11), r(4, 6), hsl(c[0] + r(-4, 4), c[1], c[2] + r(-6, 6))); } ctx.fillStyle = hsl(40, 70, 30); ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); }
  });
  cell(CELL.lepido, () => {
    for (let i = 0; i < 70; i++) { const x0 = S / 2 + r(-8, 8), a = -Math.PI / 2 + r(-0.55, 0.55), L = S * r(0.55, 0.98), x1 = x0 + Math.cos(a) * L, y1 = S + Math.sin(a) * L; ctx.strokeStyle = hsl(r(95, 115), r(30, 42), r(20, 32)); ctx.lineWidth = r(2.5, 4.5); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, S); ctx.quadraticCurveTo((x0 + x1) / 2 + r(-20, 20), (S + y1) / 2, x1, y1); ctx.stroke(); }
  });
  cell(CELL.ginkgo, () => {
    for (let k = 0; k < 8; k++) twig(S / 2, S * 0.95, S / 2 + r(-S * 0.38, S * 0.38), S * r(0.15, 0.6), r(3, 5), 'rgba(80,64,48,1)');
    for (let i = 0; i < 170; i++) { const x = S / 2 + r(-0.42, 0.42) * S, y = S * r(0.08, 0.82), a = r(0, Math.PI * 2), w = r(16, 26); ctx.fillStyle = hsl(r(68, 84), r(40, 55), r(30, 44) - (y / S) * 10); ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, w, a - 0.75, a + 0.75); ctx.closePath(); ctx.fill(); }
  });
  cell(CELL.alien, () => {
    for (let f = 0; f < 3; f++) frond(S / 2 + r(-40, 40), S, S / 2 + r(-120, 120), S * r(0.02, 0.2), r(-40, 40), S * 0.2, 6, r(268, 300), 55, 34, { n: 26, rachis: 4 });
    for (let i = 0; i < 70; i++) { ctx.fillStyle = hsl(r(170, 190), 80, r(55, 70)); ctx.beginPath(); ctx.arc(S / 2 + r(-0.4, 0.4) * S, S * r(0.05, 0.8), r(2, 5), 0, Math.PI * 2); ctx.fill(); }
  });
  cell(CELL.moss, () => {
    for (let i = 0; i < 1400; i++) { const x = S / 2 + r(-0.47, 0.47) * S, y = S - Math.pow(R(), 1.8) * S * 0.42 - 4; leaf(x, y, r(0, 6.28), r(5, 10), r(3, 5), hsl(r(82, 105), r(40, 58), r(18, 32) + (S - y) / S * 6)); }
  });
  cell(CELL.orange, () => {
    cluster(S / 2, S * 0.5, S * 0.42, 560, 108, 42, 21, 30, 11, { shade: 10 });
    for (let i = 0; i < 34; i++) { const a = r(0, Math.PI * 2), d = Math.sqrt(R()) * S * 0.36, x = S / 2 + Math.cos(a) * d, y = S * 0.5 + Math.sin(a) * d; ctx.fillStyle = hsl(r(26, 34), 95, r(46, 56)); ctx.beginPath(); ctx.arc(x, y, r(7, 10), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,240,200,0.5)'; ctx.beginPath(); ctx.arc(x - 2.5, y - 2.5, 2.4, 0, Math.PI * 2); ctx.fill(); }
  });
  cell(CELL.wheat, () => { blades(80, 44, 52, 52, 0.55, 0.95, 2.2, 0.12, { seeds: 0.95, tipL: 8, tipH: 2 }); });
  const impTree = (k, trunkH, canopy, opts) => {
    cell(k, () => {
      const cx = S / 2;
      ctx.fillStyle = opts.bark || 'rgba(60,48,36,1)';
      ctx.beginPath(); ctx.moveTo(cx - S * opts.trunkW, S); ctx.lineTo(cx - S * opts.trunkW * 0.5, S * (1 - trunkH)); ctx.lineTo(cx + S * opts.trunkW * 0.5, S * (1 - trunkH)); ctx.lineTo(cx + S * opts.trunkW, S); ctx.fill();
      canopy(cx);
    });
  };
  impTree(CELL.impOak, 0.42, (cx) => {
    for (let k = 0; k < 5; k++) twig(cx, S * 0.62, cx + r(-S * 0.38, S * 0.38), S * r(0.25, 0.45), r(6, 10), 'rgba(55,44,33,1)');
    for (let i = 0; i < 42; i++) { const a = r(0, Math.PI * 2), d = Math.sqrt(R()); const x = cx + Math.cos(a) * d * S * 0.43, y = S * 0.36 + Math.sin(a) * d * S * 0.27; const sh = (y - S * 0.1) / (S * 0.55); cluster(x, y, S * r(0.06, 0.11), 70, 78, 32, 30 - sh * 14 + r(-3, 3), 9, 3.5, { shade: 6 }); }
  }, { trunkW: 0.035 });
  impTree(CELL.impConifer, 0.95, (cx) => {
    for (let i = 0; i < 22; i++) { const t = i / 22, y = S * (0.95 - t * 0.92), w = S * 0.42 * (1 - t) ** 0.9 + 6; for (let k = 0; k < 2 + Math.floor((1 - t) * 6); k++) { const x = cx + r(-w, w); cluster(x, y, S * 0.05 + w * 0.12, 50, 155, 26, 22 - t * 2 + r(-3, 3), 9, 2.2, { flat: 0.5, shade: 8 }); } }
  }, { trunkW: 0.02 });
  impTree(CELL.impPalm, 0.82, (cx) => {
    const cy = S * 0.16;
    ctx.fillStyle = 'rgba(120,95,60,1)'; ctx.beginPath(); ctx.ellipse(cx, cy + S * 0.12, S * 0.07, S * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 26; i++) { const a = -Math.PI / 2 + (i / 25 - 0.5) * Math.PI * 1.9, L = S * r(0.2, 0.3); ctx.strokeStyle = hsl(r(85, 100), 24, r(28, 38)); ctx.lineWidth = r(4, 7); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + Math.cos(a) * L * 0.6, cy + Math.sin(a) * L * 0.6 - 10, cx + Math.cos(a) * L, cy + Math.sin(a) * L + Math.abs(Math.cos(a)) * 30); ctx.stroke(); }
  }, { trunkW: 0.025, bark: 'rgba(110,98,80,1)' });
  impTree(CELL.impFern, 0.6, (cx) => {
    const cy = S * 0.4;
    for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + (i / 11 - 0.5) * Math.PI * 1.7; frond(cx, cy, cx + Math.cos(a) * S * 0.42, cy + Math.sin(a) * S * 0.3 + S * 0.12, -20, S * 0.06, 3, 100, 45, 28, { n: 16 }); }
  }, { trunkW: 0.025, bark: 'rgba(55,40,28,1)' });

  return mipTexture(cv);
}

function mipTexture(cv) {
  const levels = [cv];
  let prev = cv, size = cv.width, boost = 1.0;
  while (size > 8) {
    size >>= 1; boost = Math.min(2.2, boost * 1.22);
    const c2 = document.createElement('canvas'); c2.width = c2.height = size;
    const g2 = c2.getContext('2d', { willReadFrequently: true });
    g2.drawImage(prev, 0, 0, size, size);
    const id = g2.getImageData(0, 0, size, size), d = id.data;
    for (let i = 3; i < d.length; i += 4) d[i] = Math.min(255, d[i] * boost);
    g2.putImageData(id, 0, 0);
    levels.push(c2); prev = c2;
  }
  const t = new THREE.CanvasTexture(cv);
  t.mipmaps = levels; t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export const IMP_N = 8;
const IMP_SPECS = { oak: ['round', 6], cottonwood: ['round', 4], magnolia: ['round', 4], conifer: ['cone', 6], palm: ['palm', 5], eucalyptus: ['euc', 4], treefern: ['tfern', 4], deadTree: ['dead', 4], lepido: ['lepido', 4], calamites: ['calam', 3], ginkgo: ['round', 3], orange: ['round', 3], prototax: ['pillar', 2], archaeop: ['cone', 4], alienTree: ['alien', 4] };
const CONE_HUE = { conifer: [148, 162], archaeop: [96, 112] };
const ROUND = { ginkgo: { w: [0.55, 0.75], h: [0.6, 0.78], t: [0.25, 0.34], hue: [70, 84], sat: 44, lit: 36 }, orange: { w: [0.9, 1.0], h: [0.6, 0.72], t: [0.18, 0.24], hue: [104, 112], sat: 42, lit: 20 }, oak: { w: [0.78, 1.0], h: [0.5, 0.68], t: [0.3, 0.42], hue: [72, 86], sat: 30, lit: 27 }, cottonwood: { w: [0.62, 0.85], h: [0.6, 0.8], t: [0.28, 0.36], hue: [82, 96], sat: 38, lit: 31 }, magnolia: { w: [0.66, 0.9], h: [0.6, 0.75], t: [0.22, 0.3], hue: [100, 112], sat: 34, lit: 23 } };

function paintImpostors() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S * IMP_N;
  const g = cv.getContext('2d');
  const map = {};
  let cell = 0;
  for (const [sp, [shape, n]] of Object.entries(IMP_SPECS)) {
    map[sp] = { base: cell, n };
    for (let v = 0; v < n; v++, cell++) {
      const R = rng(hashSeed(sp) + v * 7919), r = (a, b) => a + R() * (b - a), old = v === n - 1;
      g.save(); g.translate((cell % IMP_N) * S, Math.floor(cell / IMP_N) * S); g.beginPath(); g.rect(0, 0, S, S); g.clip();
      const leaf = (x, y, a, len, wid, col) => { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.restore(); };
      const stroke = (pts, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
      const blob = (cx, cy, rad, n2, hue, sat, lit, shade) => { for (let i = 0; i < n2; i++) { const a = r(0, 6.28), d = Math.sqrt(R()) * rad, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; const sh = ((y - cy) / rad) * 0.5 + ((x - cx) / rad) * 0.2; leaf(x, y, r(0, 3.14), r(2.4, 4.2), r(1.4, 2.6), `hsl(${hue + r(-6, 6)},${sat + r(-6, 6)}%,${lit + r(-4, 5) - sh * shade}%)`); } };
      if (shape === 'round') {
        const P = ROUND[sp], cw = r(...P.w) * S * 0.5, ch = r(...P.h) * S, th = r(...P.t) * S, lean = r(-0.08, 0.08) * S, hue = r(...P.hue);
        const bx = S / 2, top = S - th;
        stroke([[bx, S], [bx + lean * 0.5, S - th * 0.6], [bx + lean, top]], S * 0.035, 'rgb(58,46,34)');
        for (let k = 0; k < 4; k++) stroke([[bx + lean, top], [bx + lean + r(-cw, cw) * 0.8, top - r(0.15, 0.5) * ch]], S * 0.016, 'rgb(55,44,33)');
        const cy = top - ch * 0.42, cn = old ? 9 : 16 + Math.floor(R() * 10);
        for (let k = 0; k < cn; k++) { const a = r(0, 6.28), d = Math.sqrt(R()); const x = bx + lean + Math.cos(a) * d * cw * 0.85, y = cy + Math.sin(a) * d * ch * 0.42; blob(x, y, S * r(0.05, 0.1), 70, hue, P.sat, P.lit - 8, 6); blob(x, y - 3, S * r(0.04, 0.08), 50, hue, P.sat, P.lit, 12); }
      } else if (shape === 'cone') {
        const bw = r(0.3, 0.46) * S, start = r(0.04, 0.28) * S, H = S * 0.97, top = old ? S * r(0.3, 0.45) : S * 0.02, lean = r(-0.05, 0.05) * S, hue = r(...(CONE_HUE[sp] || CONE_HUE.conifer));
        stroke([[S / 2, S], [S / 2 + lean, top]], S * 0.022, 'rgb(62,46,34)');
        const tiers = 10 + Math.floor(R() * 6);
        for (let i = 0; i < tiers; i++) { const t = i / tiers, y = S - start - t * (H - start); if (y < top) break; if (old && R() < 0.3) continue; const w = bw * Math.pow(1 - t, 0.9) + 4, x = S / 2 + lean * (1 - y / S); for (let k = 0; k < 3; k++) blob(x + r(-w, w) * 0.7, y + r(-4, 4), S * 0.03 + w * 0.22, 40, hue, 26, 20 + r(-2, 3), 8); }
      } else if (shape === 'palm') {
        const lean = r(-0.12, 0.2) * S, bend = r(-0.05, 0.05) * S, top = S * r(0.08, 0.2), tx = S / 2 + lean;
        stroke([[S / 2, S], [S / 2 + lean * 0.3 + bend, S * 0.6], [tx, top + S * 0.08]], S * 0.022, 'rgb(112,100,82)');
        g.fillStyle = 'rgb(120,94,58)'; g.beginPath(); g.ellipse(tx, top + S * (0.08 + (old ? 0.08 : 0.04)), S * 0.045, S * (old ? 0.12 : 0.07), 0, 0, Math.PI * 2); g.fill();
        const fr = old ? 14 : 22 + Math.floor(R() * 8);
        for (let i = 0; i < fr; i++) { const a = -Math.PI / 2 + (i / (fr - 1) - 0.5) * Math.PI * 1.9, L = S * r(0.16, 0.26); const dry = old && R() < 0.4; stroke([[tx, top], [tx + Math.cos(a) * L * 0.6, top + Math.sin(a) * L * 0.6 - 4], [tx + Math.cos(a) * L, top + Math.sin(a) * L + Math.abs(Math.cos(a)) * S * 0.08]], r(3, 6), dry ? 'hsl(38,40%,45%)' : `hsl(${r(85, 100)},24%,${r(28, 38)}%)`); }
      } else if (shape === 'euc') {
        const lean = r(-0.06, 0.06) * S, top = S * 0.05;
        stroke([[S / 2, S], [S / 2 + lean * 0.5, S * 0.5], [S / 2 + lean, top + S * 0.1]], S * 0.022, 'rgb(170,160,140)');
        const k = 3 + Math.floor(R() * 3);
        for (let j = 0; j < k; j++) { if (old && R() < 0.4) continue; const y = S * r(0.06, 0.5), x = S / 2 + lean * (1 - y / S) + r(-0.25, 0.25) * S; stroke([[S / 2 + lean * (1 - y / S), y + S * 0.1], [x, y]], 3, 'rgb(160,150,130)'); blob(x, y, S * r(0.08, 0.13), 120, r(115, 140), 18, 36, 10); }
      } else if (shape === 'tfern') {
        const top = S * r(0.25, 0.55), lean = r(-0.1, 0.1) * S, tx = S / 2 + lean;
        stroke([[S / 2, S], [tx, top]], S * 0.03, 'rgb(55,40,28)');
        const fr = 9 + Math.floor(R() * 6);
        for (let i = 0; i < fr; i++) { const a = -Math.PI / 2 + (i / (fr - 1) - 0.5) * Math.PI * 1.7, L = S * r(0.3, 0.44); const ex = tx + Math.cos(a) * L, ey = top + Math.sin(a) * L * 0.6 + S * 0.15; stroke([[tx, top], [tx + Math.cos(a) * L * 0.5, top + Math.sin(a) * L * 0.4 - 10], [ex, ey]], 2, 'rgb(60,80,30)'); for (let q = 1; q < 10; q++) { const t = q / 10; leaf(tx + (ex - tx) * t, top + (ey - top) * t - Math.sin(t * Math.PI) * 10, a + Math.PI / 2, 9 * (1 - t * 0.5), 2.4, `hsl(${r(95, 110)},45%,${r(24, 32)}%)`); leaf(tx + (ex - tx) * t, top + (ey - top) * t - Math.sin(t * Math.PI) * 10, a - Math.PI / 2, 9 * (1 - t * 0.5), 2.4, `hsl(${r(95, 110)},45%,${r(24, 32)}%)`); } }
      } else if (shape === 'lepido') {
        const lean = r(-0.06, 0.06) * S, top = S * r(0.18, 0.3), tx = S / 2 + lean;
        stroke([[S / 2, S], [S / 2 + lean * 0.5, S * 0.6], [tx, top]], S * 0.04, 'rgb(62,66,48)');
        const br = (x, y, a, len, w, d) => { const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len; stroke([[x, y], [x1, y1]], w, 'rgb(60,64,46)'); if (d > 0) { br(x1, y1, a - r(0.3, 0.6), len * 0.75, w * 0.7, d - 1); br(x1, y1, a + r(0.3, 0.6), len * 0.75, w * 0.7, d - 1); } else blob(x1, y1, S * r(0.04, 0.06), 60, r(98, 112), 34, 24, 6); };
        br(tx, top, -Math.PI / 2, S * 0.06, S * 0.025, old ? 1 : 2);
      } else if (shape === 'calam') {
        const H = S * r(0.85, 0.97), lean = r(-0.05, 0.05) * S;
        stroke([[S / 2, S], [S / 2 + lean, S - H]], S * 0.022, 'rgb(76,82,56)');
        for (let y = S - H * 0.3; y > S - H; y -= S * 0.045) { const t = (S - y) / H, x = S / 2 + lean * t, L = S * (0.16 - t * 0.09); for (const sd of [-1, 1]) stroke([[x, y], [x + sd * L * 0.6, y - L * 0.25], [x + sd * L, y - L * 0.6]], 2.4, `hsl(${r(96, 112)},34%,${r(22, 30)}%)`); }
      } else if (shape === 'pillar') {
        const w = S * r(0.07, 0.1), top = S * r(0.05, 0.25);
        g.fillStyle = 'rgb(128,118,100)'; g.beginPath(); g.moveTo(S / 2 - w * 1.1, S); g.lineTo(S / 2 - w, top + w); g.quadraticCurveTo(S / 2, top - w * 0.4, S / 2 + w, top + w); g.lineTo(S / 2 + w * 1.1, S); g.fill();
        g.fillStyle = 'rgba(70,62,50,0.35)'; g.fillRect(S / 2 + w * 0.3, top + w, w * 0.7, S - top);
      } else if (shape === 'alien') {
        const lean = r(-0.1, 0.1) * S, tx = S / 2 + lean, top = S * r(0.12, 0.3);
        stroke([[S / 2, S], [S / 2 + lean * 0.4, S * 0.6], [tx, top]], S * 0.025, 'rgb(96,84,120)');
        for (let k = 0; k < 1 + (v % 3); k++) { const y = top + k * S * 0.12, w = S * (0.22 + k * 0.08); for (let q = 0; q < 26; q++) leaf(tx + r(-w, w), y + r(-S * 0.03, S * 0.03), r(-0.4, 0.4), r(9, 16), r(4, 7), `hsl(${r(270, 300)},${r(45, 60)}%,${r(28, 40)}%)`); for (let q = 0; q < 8; q++) leaf(tx + r(-w, w), y + r(-S * 0.02, S * 0.02), 0, 3, 3, `hsl(180,85%,${r(60, 72)}%)`); }
      } else if (shape === 'dead') {
        const br = (x, y, a, len, w, d) => { const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len; stroke([[x, y], [x1, y1]], w, `hsl(30,10%,${r(24, 34)}%)`); if (d > 0) for (let k = 0; k < 2 + Math.floor(R() * 2); k++) br(x1, y1, a + r(-0.8, 0.8), len * r(0.5, 0.75), w * 0.65, d - 1); };
        if (v % 2 === 1) stroke([[S / 2, S], [S / 2 + r(-10, 10), S * 0.45]], S * 0.05, 'hsl(30,10%,30%)');
        else br(S / 2, S, -Math.PI / 2 + r(-0.1, 0.1), S * 0.32, S * 0.045, 5);
      }
      g.restore();
    }
  }
  return { tex: mipTexture(cv), map };
}

const hashSeed = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };


export class FloraLib {
  constructor() {
    this.atlas = paintAtlas();
    const I = paintImpostors(); this.impAtlas = I.tex; this.impMap = I.map;
    this.U = { leaf: uniform(new THREE.Color(1, 1, 1)), bark: uniform(new THREE.Color(1, 1, 1)), wind: uniform(1), moss: uniform(0), lava: uniform(0), rockTint: uniform(new THREE.Color(1, 1, 1)), wet: uniform(0), snow: uniform(0) };
    this.mat = this.vegMaterial();
    this.farMat = this.farMaterial();
    this.rock = this.rockMaterial();
    this.geos = new Map();
  }

  vegMaterial() {
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.42, roughness: 0.8, metalness: 0 });
    const V = attribute('vt', 'vec4'), kind = V.w;
    const isLeaf = step(0.5, kind), isImp = step(1.5, kind);
    const tex = texture(this.atlas, uv());
    const bu = uv();
    const bn = mx_noise_float(vec3(bu.x.mul(9.0), bu.y.mul(0.9), 0.5)).mul(0.5).add(0.5);
    const bf = mx_noise_float(vec3(bu.x.mul(30.0), bu.y.mul(3.0), 2.5));
    const bark = V.xyz.mul(this.U.bark).mul(bn.mul(0.45).add(0.65)).mul(bf.mul(0.12).add(1));
    const I = attribute('ivar', 'vec4');
    const hueT = vec3(1, 1, 1).add(vec3(0.13, 0.02, -0.2).mul(I.y));
    const bark0 = bark.mul(I.w.add(1));
    const leaf = tex.rgb.mul(V.xyz).mul(this.U.leaf).mul(hueT).mul(I.z.mul(0.8).add(1));
    const snowM = this.U.snow.mul(smoothstep(0.35, 0.85, attribute('normal', 'vec3').y)).mul(0.85);
    m.colorNode = mix(mix(bark0, leaf, isLeaf).mul(float(1).sub(this.U.wet.mul(0.18))), vec3(0.85, 0.87, 0.9), snowM);
    m.opacityNode = mix(float(1), tex.a, isLeaf);
    m.roughnessNode = mix(float(0.92), float(0.9), isLeaf).sub(this.U.wet.mul(0.3));
    const ph = hash(instanceIndex).mul(6.28);
    const h = max(attribute('position', 'vec3').y, 0).mul(0.06);
    const sw = sin(time.mul(1.3).add(ph)).mul(0.5).add(sin(time.mul(2.7).add(ph.mul(1.7))).mul(0.25)).mul(this.U.wind).mul(h).mul(mix(float(0.25), float(1), isLeaf)).mul(float(1).sub(isImp.mul(0.7)));
    m.positionNode = positionLocal.add(vec3(sw.mul(0.35), 0, sw.mul(0.2)));
    m.normalNode = normalViewGeometry;
    m.name = 'era_veg';
    return m;
  }

  farMaterial() {
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.42, roughness: 0.85, metalness: 0 });
    const I = attribute('ivar', 'vec4'), u0 = uv();
    const fu = mix(u0.x, float(1).sub(u0.x), step(0.5, I.w));
    const cell = floor(I.x.add(0.5)), col = cell.sub(floor(cell.div(IMP_N)).mul(IMP_N)), row = floor(cell.div(IMP_N));
    const auv = vec2(col.add(fu).div(IMP_N), float(1).sub(row.add(1).sub(u0.y).div(IMP_N)));
    const tex = texture(this.impAtlas, auv);
    const hueT = vec3(1, 1, 1).add(vec3(0.13, 0.02, -0.2).mul(I.y));
    const snowM = this.U.snow.mul(smoothstep(0.55, 1.0, u0.y)).mul(0.6);
    m.colorNode = mix(tex.rgb.mul(this.U.leaf).mul(hueT).mul(I.z.mul(0.8).add(1)).mul(float(1).sub(this.U.wet.mul(0.18))), vec3(0.85, 0.87, 0.9), snowM);
    m.opacityNode = tex.a;
    m.normalNode = normalViewGeometry;
    m.name = 'era_vegfar';
    return m;
  }

  impCell(sp, v) { const e = this.impMap[sp]; return e ? e.base + (v % e.n) : 0; }

  rockMaterial() {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
    const p = positionWorld;
    const n = mx_noise_float(p.mul(0.8)).mul(0.5).add(0.5), n2 = mx_noise_float(p.mul(4.5)), n3 = mx_noise_float(p.mul(0.15)).mul(0.5).add(0.5);
    const up = smoothstep(0.35, 0.9, attribute('normal', 'vec3').y);
    const base = vec3(this.U.rockTint).mul(n.mul(0.28).add(0.6)).mul(n2.mul(0.1).add(1)).mul(n3.mul(0.3).add(0.85));
    const moss = mix(vec3(0.05, 0.08, 0.025), vec3(0.1, 0.12, 0.04), n);
    const mossM = this.U.moss.mul(smoothstep(0.45, 0.7, up.mul(0.7).add(n.mul(0.5))));
    const snowR = this.U.snow.mul(smoothstep(0.3, 0.75, up.add(n.sub(0.5).mul(0.3))));
    m.colorNode = mix(mix(base, moss, mossM).mul(float(1).sub(this.U.wet.mul(0.3))), vec3(0.86, 0.88, 0.92), snowR);
    m.roughnessNode = mix(float(0.86).add(n2.mul(0.06)).add(mossM.mul(0.08)).sub(this.U.wet.mul(0.4)), float(0.55), snowR);
    const crack = float(1).sub(smoothstep(0.0, 0.08, mx_noise_float(p.mul(1.3)).abs())).mul(float(1).sub(up));
    m.emissiveNode = vec3(1.0, 0.28, 0.03).mul(crack.mul(this.U.lava).mul(n.add(0.3)));
    m.normalNode = bumpMap(n.mul(0.5).add(n2.mul(0.25)));
    m.name = 'era_rock';
    return m;
  }

  setEra(period) {
    const P = period.floraLib || {};
    if (P.leaf) this.U.leaf.value.setRGB(...P.leaf);
    if (P.bark) this.U.bark.value.setRGB(...P.bark);
    if (P.rock) this.U.rockTint.value.setRGB(...P.rock);
    this.U.moss.value = P.moss || 0; this.U.lava.value = P.lava || 0; this.U.wind.value = P.wind || 0.8;
  }

  geo(key, build) { let g = this.geos.get(key); if (!g) { g = build(); this.geos.set(key, g); } return g; }
}

const cellUV = (c, u, v) => [((c % G) + u) / G, 1 - (Math.floor(c / G) + 1 - v) / G];

class VegBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.vt = []; this.idx = []; this.n = 0; }
  vert(p, n, u, v, t) { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v); this.vt.push(t[0], t[1], t[2], t[3]); return this.n++; }
  card(c, center, right, up, w, h, tint, normFn, kind = 1, anchorBottom = false) {
    const corners = anchorBottom ? [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]] : [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const ids = corners.map(([a, b], k) => {
      const p = center.clone().addScaledVector(right, a * w).addScaledVector(up, b * h);
      const [uu, vv] = cellUV(c, a + 0.5, anchorBottom ? b : b + 0.5);
      return this.vert(p, normFn(p), uu, vv, [tint[0], tint[1], tint[2], kind]);
    });
    this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }
  tube(points, radii, seg, tint, uScale = 1) {
    const rings = [];
    let vAcc = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[Math.min(points.length - 1, i + 1)], o = points[Math.max(0, i - 1)];
      const dir = q.clone().sub(o).normalize();
      const a = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const s = new THREE.Vector3().crossVectors(dir, a).normalize(), t = new THREE.Vector3().crossVectors(dir, s).normalize();
      if (i) vAcc += p.distanceTo(points[i - 1]);
      const ring = [];
      for (let k = 0; k <= seg; k++) {
        const ang = (k / seg) * Math.PI * 2, n = s.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t, Math.sin(ang));
        ring.push(this.vert(p.clone().addScaledVector(n, radii[i]), n, (k / seg) * uScale, vAcc * 0.5, [tint[0], tint[1], tint[2], 0]));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < seg; k++) { const a = rings[i][k], b = rings[i][k + 1], c = rings[i + 1][k], d = rings[i + 1][k + 1]; this.idx.push(a, c, b, b, c, d); }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('vt', new THREE.Float32BufferAttribute(this.vt, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const sphereN = (c, upBias = 0.35) => (p) => p.clone().sub(c).normalize().add(V3(0, upBias, 0)).normalize();

function canopyCards(B, R, cell, center, rx, ry, rz, n, size, tint, upBias = 0.35) {
  const nf = sphereN(center, upBias);
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    const d = V3(Math.cos(a) * rr, u, Math.sin(a) * rr);
    const k = 0.55 + 0.45 * Math.cbrt(R());
    const p = center.clone().add(V3(d.x * rx * k, d.y * ry * k, d.z * rz * k));
    const right = V3(R() - 0.5, (R() - 0.5) * 0.5, R() - 0.5).normalize();
    const up = d.clone().cross(right).normalize();
    const s = size * (0.75 + R() * 0.5);
    B.card(cell, p, right, up.lengthSq() > 0.01 ? up : V3(0, 1, 0), s, s, tint, nf);
  }
}

function crossQuads(B, w, h, n = 3) {
  const c = V3(0, h * 0.55, 0), nf = sphereN(c, 0.4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI, r = V3(Math.cos(a), 0, Math.sin(a));
    const P = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]].map(([x, y]) => V3(0, 0, 0).addScaledVector(r, x * w).add(V3(0, y * h, 0)));
    const ids = P.map((p, k) => B.vert(p, nf(p), [0, 1, 1, 0][k], [0, 0, 1, 1][k], [1, 1, 1, 2]));
    B.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }
}

function crossImpostor(B, cell, w, h, tint, n = 3, y0 = 0) {
  const c = V3(0, y0 + h / 2, 0);
  const nf = sphereN(c, 0.4);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI; B.card(cell, V3(0, y0, 0), V3(Math.cos(a), 0, Math.sin(a)), V3(0, 1, 0), w, h, tint, nf, 2, true); }
}

function broadleaf(R, v, V, o) {
  const B = new VegBuilder(), old = v === V - 1;
  const lean = (R() - 0.5) * 0.5, lean2 = (R() - 0.5) * 0.5;
  const th = o.trunk * (0.75 + R() * 0.5), tr = o.tr * (0.85 + R() * 0.3) * (old ? 1.2 : 1);
  const top = V3(lean, th, lean2);
  B.tube([V3(0, -0.4, 0), V3(lean * 0.3, th * 0.45, lean2 * 0.3), top], [tr, tr * 0.85, tr * 0.72], 8, o.bark, 3);
  const limbs = o.limbs[0] + Math.floor(R() * (o.limbs[1] - o.limbs[0] + 1));
  const W = o.cw * (0.8 + R() * 0.4), H = o.ch * (0.8 + R() * 0.45);
  const clumps = 2 + Math.floor(R() * 3), centers = [];
  for (let k = 0; k < limbs; k++) {
    const a = (k / limbs) * Math.PI * 2 + R() * 0.9, l = W * (0.45 + R() * 0.45), up = o.rise * (0.6 + R() * 0.8);
    const mid = top.clone().add(V3(Math.cos(a) * l * 0.45, up * 0.55, Math.sin(a) * l * 0.45)), end = top.clone().add(V3(Math.cos(a) * l, up, Math.sin(a) * l));
    B.tube([top.clone(), mid, end], [tr * 0.55, tr * 0.36, tr * 0.12], 6, o.bark, 2);
    if (k < clumps) centers.push(end.clone().add(V3(0, H * 0.25, 0)));
  }
  const total = Math.round(o.cards * (0.8 + R() * 0.45) * (old ? 0.5 : 1));
  const deadLimb = old ? Math.floor(R() * centers.length) : -1;
  const main = top.clone().add(V3(0, o.rise * 0.8 + H * 0.35, 0));
  canopyCards(B, R, o.cell, main, W * 0.7, H * 0.65, W * 0.7, Math.round(total * 0.45), o.card, o.tint);
  centers.forEach((c, k) => { if (k !== deadLimb) canopyCards(B, R, o.cell, c, W * (0.32 + R() * 0.2), H * (0.35 + R() * 0.2), W * (0.32 + R() * 0.2), Math.round(total * 0.55 / centers.length), o.card * (0.8 + R() * 0.4), o.tint); });
  if (old) { const a = R() * 6.28; B.tube([top.clone(), top.clone().add(V3(Math.cos(a) * 2.5, 1.2, Math.sin(a) * 2.5)), top.clone().add(V3(Math.cos(a) * 3.8, 0.6, Math.sin(a) * 3.8))], [tr * 0.4, tr * 0.25, tr * 0.08], 5, [o.bark[0] * 1.3, o.bark[1] * 1.3, o.bark[2] * 1.3], 2); }
  return B.build();
}

function conifer(R, v, V, o = {}) {
  const B = new VegBuilder(), old = v === V - 1, bark = o.bark || [0.24, 0.17, 0.12];
  const H = (o.h || 18) + R() * 10, lean = (R() - 0.5) * 0.6, start = 2.5 + R() * 5, rad0 = 4 + R() * 2.2, droop = 0.15 + R() * 0.3;
  const topH = old ? H * (0.62 + R() * 0.15) : H;
  B.tube([V3(0, -0.5, 0), V3(lean * 0.4, topH * 0.45, 0), V3(lean, topH, lean * 0.3)], [0.5, 0.35, old ? 0.18 : 0.06], 8, bark, 3);
  const tiers = 9 + Math.floor(R() * 6);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, y = start + t * (H - start - 1.5);
    if (y > topH) break;
    if (old && R() < 0.3) continue;
    const rad = rad0 * Math.pow(1 - t, 0.85 + R() * 0.2) * (0.85 + R() * 0.3) + 0.5;
    const n = 4 + Math.floor((1 - t) * 4 + R() * 2), a0 = R() * 6.28;
    const cx = lean * (y / H), cz = lean * 0.3 * (y / H);
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + (R() - 0.5) * 0.5;
      const dir = V3(Math.cos(a), -droop, Math.sin(a)).normalize(), side = V3(-Math.sin(a), 0, Math.cos(a));
      const tilt = 0.4 + R() * 0.8;
      B.card(o.cell === undefined ? CELL.conifer : o.cell, V3(cx, y, cz).addScaledVector(dir, rad / 2), dir, side.clone().multiplyScalar(Math.cos(tilt)).add(V3(0, Math.sin(tilt), 0)).normalize(), rad * (1 + R() * 0.3), rad * (0.7 + R() * 0.25), [0.9 + R() * 0.2, 0.95 + R() * 0.1, 0.9 + R() * 0.2], sphereN(V3(cx, y + 2, cz), 0.5));
    }
  }
  return B.build();
}

function palm(R, v, V) {
  const B = new VegBuilder(), old = v === V - 1, bark = [0.42, 0.38, 0.31];
  const H = 12 + R() * 10, lean = (R() - 0.3) * 1.6, bend = (R() - 0.5) * 0.8;
  const pts = [V3(0, -0.4, 0), V3(lean * 0.25, H * 0.35, bend * 0.3), V3(lean * 0.7, H * 0.7, bend * 0.8), V3(lean, H, bend)];
  B.tube(pts, [0.44, 0.36, 0.33, 0.32], 8, bark, 3);
  const skirt = 1 + R() * (old ? 5 : 3);
  B.tube([V3(lean, H - skirt, bend), V3(lean, H - skirt * 0.5, bend), V3(lean, H, bend)], [0.6, 0.95 + R() * 0.2, 0.9], 8, [0.36, 0.28, 0.18], 4);
  const top = V3(lean, H + 0.2, bend), n = old ? 10 + Math.floor(R() * 5) : 16 + Math.floor(R() * 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.4, el = (old ? -0.8 : -0.55) + R() * (old ? 0.9 : 1.25);
    const dir = V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), side = V3(-Math.sin(a), 0, Math.cos(a));
    const dry = el < -0.4 || (old && R() < 0.4);
    B.card(CELL.palm, top, side, dir, 2.6 + R() * 0.8, 3.0 + R() * 0.8, dry ? [1.25, 0.95, 0.55] : [0.9 + R() * 0.2, 1, 0.9 + R() * 0.15], sphereN(top.clone().sub(V3(0, 0.6, 0)), 0.3), 1, true);
  }
  return B.build();
}

function eucalyptus(R, v, V) {
  const B = new VegBuilder(), old = v === V - 1, bark = [0.62, 0.58, 0.5];
  const H = 18 + R() * 9, lx = (R() - 0.5) * 1.4, lz = (R() - 0.5) * 1.4;
  B.tube([V3(0, -0.4, 0), V3(lx * 0.3, H * 0.35, lz * 0.2), V3(lx * 0.6, H * 0.7, lz * 0.7), V3(lx, H, lz)], [0.5, 0.38, 0.25, 0.1], 8, bark, 2);
  const k = 3 + Math.floor(R() * 3);
  for (let j = 0; j < k; j++) {
    if (old && R() < 0.4) continue;
    const a = R() * 6.28, y = H * (0.55 + 0.4 * (j / k)) + R() * 2, r = 1.5 + R() * 2.5;
    const base = V3(lx * (y / H), y - 2.5, lz * (y / H)), c = base.clone().add(V3(Math.cos(a) * r, 2.5, Math.sin(a) * r));
    B.tube([base, c], [0.18, 0.08], 5, bark, 1);
    canopyCards(B, R, CELL.eucalypt, c.clone().add(V3(0, 1.5, 0)), 2.6 + R() * 1.2, 2.2 + R() * 1.2, 2.6 + R() * 1.2, 10 + Math.floor(R() * 8), 3.2 + R(), [0.9 + R() * 0.2, 1, 0.9 + R() * 0.2], 0.2);
  }
  return B.build();
}

function deadTree(R, v, V) {
  const B = new VegBuilder(), bark = [0.3 + R() * 0.06, 0.28, 0.25];
  const broken = v % 2 === 1, H = (broken ? 5 + R() * 3 : 9 + R() * 4), lean = (R() - 0.5) * 1.4;
  B.tube([V3(0, -0.4, 0), V3(lean * 0.3, H * 0.4, 0), V3(lean * 0.7, H * 0.75, lean * 0.2), V3(lean, H, lean * 0.3)], [0.45, 0.36, broken ? 0.3 : 0.18, broken ? 0.28 : 0.05], 7, bark, 2);
  const n = broken ? 2 : 3 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, y = H * (0.45 + R() * 0.5), l = 2 + R() * 3, base = V3(lean * y / H, y, lean * 0.3 * y / H);
    const end = base.clone().add(V3(Math.cos(a) * l, l * (0.4 + R() * 0.6), Math.sin(a) * l));
    B.tube([base, end], [0.16, 0.04], 5, bark, 1);
    B.card(CELL.twig, end.clone().add(V3(0, -1.5, 0)), V3(-Math.sin(a), 0, Math.cos(a)), V3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize(), 3 + R() * 2, 3.5 + R() * 2, [1, 1, 1], sphereN(base, 0.3), 1, true);
  }
  return B.build();
}

function tuft(B, R, c, len, n, tint = [1, 1, 1]) {
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, el = -0.25 + R() * 1.5;
    const dir = V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), side = V3(-Math.sin(a), 0, Math.cos(a));
    B.card(CELL.lepido, c, side, dir, len * 0.55 * (0.8 + R() * 0.4), len * (0.8 + R() * 0.4), [tint[0] * (0.9 + R() * 0.2), tint[1], tint[2] * (0.9 + R() * 0.2)], sphereN(c.clone().sub(V3(0, 0.3, 0)), 0.4), 1, true);
  }
}

function lepido(R, v, V) {
  const B = new VegBuilder(), young = v === 0, old = v === V - 1, bark = [0.26, 0.28, 0.2];
  const H = young ? 8 + R() * 5 : 22 + R() * 12, lean = (R() - 0.5) * 0.8;
  const top = V3(lean, H, lean * 0.4);
  B.tube([V3(0, -0.6, 0), V3(0, 0.6, 0), V3(lean * 0.4, H * 0.5, lean * 0.15), top], young ? [0.5, 0.36, 0.28, 0.2] : [1.0, 0.72, 0.56, 0.38], 10, bark, 7);
  if (young) { tuft(B, R, top, 2.4, 26); B.tube([V3(lean * 0.6, H * 0.6, 0), V3(lean * 0.8, H * 0.8, 0.1), top.clone()], [0.3, 0.26, 0.2], 6, [0.3, 0.36, 0.22], 2); return B.build(); }
  const fork = (p, dir, len, r, d) => {
    const end = p.clone().addScaledVector(dir, len);
    B.tube([p.clone(), p.clone().addScaledVector(dir, len * 0.5), end], [r, r * 0.86, r * 0.72], 6, bark, 2);
    if (d === 0) { tuft(B, R, end, 1.7 + R() * 0.7, 11); return; }
    const a = R() * 6.28, side = V3(Math.cos(a), 0, Math.sin(a)).sub(dir.clone().multiplyScalar(Math.cos(a) * dir.x + Math.sin(a) * dir.z)).normalize();
    for (const sd of [-1, 1]) fork(end, dir.clone().multiplyScalar(0.78).addScaledVector(side, sd * 0.62).normalize(), len * 0.74, r * 0.7, d - 1);
  };
  fork(top, V3(0, 1, 0), 2.6 + R(), 0.4, old ? 2 : 3);
  return B.build();
}

function calamites(R, v, V) {
  const B = new VegBuilder(), bark = [0.32, 0.35, 0.24], H = 7 + R() * 8 + v, lean = (R() - 0.5) * 0.6;
  const segs = Math.max(6, Math.round(H / 0.9)), pts = [], radii = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs; pts.push(V3(lean * t * t, -0.4 + t * (H + 0.4), 0)); radii.push(Math.max(0.05, 0.34 - t * 0.26) * (i % 2 ? 0.94 : 1.04)); }
  B.tube(pts, radii, 8, bark, 4);
  for (let i = Math.floor(segs * 0.3); i <= segs; i++) {
    const t = i / segs, c = V3(lean * t * t, -0.4 + t * (H + 0.4), 0), L = (1 - t * 0.6) * (1.5 + R() * 0.8), n = 7 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) { const a = (k / n) * 6.28 + R() * 0.4, dir = V3(Math.cos(a), 0.35 + R() * 0.3, Math.sin(a)).normalize(), side = V3(-Math.sin(a), 0, Math.cos(a)); B.card(CELL.lepido, c, side, dir, 0.5, L, [0.85, 1, 0.8], sphereN(c, 0.3), 1, true); }
  }
  return B.build();
}

function prototax(R) {
  const B = new VegBuilder(), H = 5 + R() * 4, r0 = 0.45 + R() * 0.4, lean = (R() - 0.5) * 0.4;
  B.tube([V3(0, -0.5, 0), V3(lean * 0.3, H * 0.4, 0), V3(lean * 0.7, H * 0.85, 0), V3(lean, H, 0), V3(lean, H + r0 * 0.6, 0)], [r0 * 1.1, r0, r0 * 0.95, r0 * 0.8, 0.05], 10, [0.55, 0.5, 0.42], 3);
  return B.build();
}

function alienTree(R, v) {
  const B = new VegBuilder(), bark = [0.42, 0.38, 0.5], H = 9 + R() * 9, lean = (R() - 0.5) * 1.2, top = V3(lean, H, lean * 0.5);
  B.tube([V3(0, -0.4, 0), V3(lean * 0.2, H * 0.4, 0), V3(lean * 0.8, H * 0.85, lean * 0.3), top], [0.42, 0.3, 0.24, 0.18], 8, bark, 3);
  const tiers = 1 + (v % 3);
  for (let t = 0; t < tiers; t++) {
    const y = H - t * 2.4, rad = 3 + t * 1.4 + R() * 1.5, c = V3(lean * (y / H), y, lean * 0.5 * (y / H)), n = 14 + t * 6;
    for (let k = 0; k < n; k++) { const a = (k / n) * 6.28 + R() * 0.3, dir = V3(Math.cos(a), -0.08 - R() * 0.12, Math.sin(a)).normalize(), side = V3(-Math.sin(a), 0, Math.cos(a)); B.card(CELL.alien, c, side, dir, rad * 0.55, rad, [0.9 + R() * 0.2, 1, 0.9 + R() * 0.2], sphereN(c.clone().sub(V3(0, 1, 0)), 0.5), 1, true); }
  }
  return B.build();
}

function crownFronds(B, R, cell, top, n, len, wid, elev, tint, below = 0.6) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (R() - 0.5) * 0.5, el = elev[0] + R() * (elev[1] - elev[0]);
    const dir = V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)), side = V3(-Math.sin(a), 0, Math.cos(a));
    B.card(cell, top, side, dir, wid * (0.85 + R() * 0.3), len * (0.8 + R() * 0.4), [tint[0] * (0.9 + R() * 0.2), tint[1], tint[2] * (0.9 + R() * 0.2)], sphereN(top.clone().sub(V3(0, below, 0)), 0.3), 1, true);
  }
}

function cactus(R, v) {
  const B = new VegBuilder(), g = [0.2 + R() * 0.06, 0.3 + R() * 0.06, 0.16 + R() * 0.04];
  if (v === 0) {
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) { const h = 0.5 + R() * 0.7, r = 0.25 + R() * 0.15, ox = k ? (R() - 0.5) * 1.2 : 0, oz = k ? (R() - 0.5) * 1.2 : 0; B.tube([V3(ox, -0.2, oz), V3(ox, h * 0.3, oz), V3(ox, h * 0.75, oz), V3(ox, h, oz), V3(ox, h + 0.04, oz)], [r * 0.9, r * 1.12, r, r * 0.7, 0.02], 12, g, 5); }
  } else if (v === 1) {
    const H = 1.1 + R() * 0.8, lean = (R() - 0.5) * 0.3;
    B.tube([V3(0, -0.2, 0), V3(lean * 0.5, H * 0.5, 0), V3(lean, H, 0)], [0.11, 0.1, 0.08], 6, g, 3);
    const n = 3 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) { const y = H * (0.35 + R() * 0.6), a = R() * 6.28, l = 0.35 + R() * 0.5, b = V3(lean * y / H, y, 0), m = b.clone().add(V3(Math.cos(a) * l * 0.6, l * 0.3, Math.sin(a) * l * 0.6)), e = m.clone().add(V3(Math.cos(a) * l * 0.3, l * 0.6, Math.sin(a) * l * 0.3)); B.tube([b, m, e], [0.08, 0.07, 0.05], 5, [g[0] * 1.3, g[1] * 1.15, g[2] * 1.1], 2); }
  } else if (v === 2) {
    const pad = (c, a, tl, r) => { const d = V3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.05); const up = V3(-Math.sin(a) * Math.sin(tl), Math.cos(tl), Math.cos(a) * Math.sin(tl)); B.tube([c.clone().sub(d), c.clone(), c.clone().add(d)], [0.02, r, 0.02], 10, g, 2); return c.clone().addScaledVector(up, r * 1.7); };
    const grow = (c, a, r, d) => { const top = pad(c, a, (R() - 0.5) * 0.9, r); if (d > 0) for (let k = 0; k < 1 + Math.floor(R() * 2); k++) grow(top.clone().add(V3((R() - 0.5) * r, -r * 0.3, (R() - 0.5) * r)), a + (R() - 0.5) * 1.6, r * (0.8 + R() * 0.15), d - 1); };
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) grow(V3((R() - 0.5) * 1.4, 0.25, (R() - 0.5) * 1.4), R() * 6.28, 0.3 + R() * 0.1, 2 + Math.floor(R() * 2));
  } else {
    const bark = [0.32, 0.27, 0.2], H = 1.6 + R() * 1.4, lean = (R() - 0.5) * 0.5, top = V3(lean, H, 0);
    B.tube([V3(0, -0.3, 0), V3(lean * 0.5, H * 0.5, 0), top], [0.24, 0.19, 0.15], 8, bark, 3);
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) { const a = R() * 6.28, l = 0.7 + R() * 0.9, e = top.clone().add(V3(Math.cos(a) * l, 0.5 + R() * 0.8, Math.sin(a) * l)); B.tube([top.clone(), top.clone().add(V3(Math.cos(a) * l * 0.6, 0.15, Math.sin(a) * l * 0.6)), e], [0.13, 0.11, 0.09], 6, bark, 2); crownFronds(B, R, CELL.cycad, e, 14 + Math.floor(R() * 6), 0.75, 0.32, [-0.2, 1.4], [0.85, 1, 0.8], 0.25); }
    if (n === 1) crownFronds(B, R, CELL.cycad, top, 14, 0.75, 0.32, [-0.2, 1.4], [0.85, 1, 0.8], 0.25);
  }
  return B.build();
}

function bush(R, v, V, o) {
  const B = new VegBuilder(), n = 1 + Math.floor(R() * 3);
  for (let k = 0; k < n; k++) {
    const s = o.size * (0.6 + R() * 0.6), c = V3((R() - 0.5) * o.size * 1.2, s * o.hk, (R() - 0.5) * o.size * 1.2);
    canopyCards(B, R, o.cell, c, s * 1.1, s * 0.75, s * 1.1, Math.round(o.cards * (0.6 + R() * 0.6) / Math.sqrt(n)), o.card * (0.8 + R() * 0.4), [o.tint[0] * (0.9 + R() * 0.2), o.tint[1] * (0.95 + R() * 0.1), o.tint[2] * (0.9 + R() * 0.2)], 0.6);
  }
  return B.build();
}

export const SPECIES = {
  oak: { V: 6, near: (R, v, V) => broadleaf(R, v, V, { bark: [0.2, 0.16, 0.12], trunk: 3.1, tr: 0.5, limbs: [3, 6], cw: 7.2, ch: 3.8, rise: 2.6, cards: 72, card: 3.4, cell: CELL.oak, tint: [1, 1, 1] }), imp: [15.5, 12.5], h: 12, r: 7.5, trunk: 0.5, mass: 2600, breakV: 26 },
  cottonwood: { V: 4, near: (R, v, V) => broadleaf(R, v, V, { bark: [0.3, 0.27, 0.22], trunk: 5.5, tr: 0.45, limbs: [3, 5], cw: 5, ch: 5.5, rise: 4.5, cards: 62, card: 3.2, cell: CELL.bigleaf, tint: [0.8, 1.0, 0.75] }), imp: [12, 17], h: 17, r: 6, trunk: 0.45, mass: 2200, breakV: 24 },
  magnolia: { V: 4, near: (R, v, V) => broadleaf(R, v, V, { bark: [0.24, 0.22, 0.2], trunk: 3.2, tr: 0.33, limbs: [2, 4], cw: 4, ch: 4.2, rise: 1.8, cards: 56, card: 2.8, cell: CELL.bigleaf, tint: [0.9, 1.0, 0.85] }), imp: [9, 11.5], h: 11, r: 4.5, trunk: 0.35, mass: 900, breakV: 18 },
  conifer: { V: 5, near: (R, v, V) => conifer(R, v, V), imp: [11, 25], h: 25, r: 5.5, trunk: 0.45, mass: 3000, breakV: 28 },
  palm: { V: 5, near: (R, v, V) => palm(R, v, V), imp: [6.5, 19], h: 19, r: 3.5, trunk: 0.38, mass: 1400, breakV: 22 },
  eucalyptus: { V: 4, near: (R, v, V) => eucalyptus(R, v, V), imp: [10, 24], h: 24, r: 5, trunk: 0.45, mass: 2200, breakV: 25 },
  cycad: { V: 4, near: (R, v, V) => { const B = new VegBuilder(), stems = v === V - 1 ? 2 + Math.floor(R() * 2) : 1; for (let s = 0; s < stems; s++) { const H = 0.6 + R() * 1.8, ox = stems > 1 ? (R() - 0.5) * 1.6 : 0, oz = stems > 1 ? (R() - 0.5) * 1.6 : 0; B.tube([V3(ox, -0.3, oz), V3(ox, H * 0.5, oz), V3(ox + (R() - 0.5) * 0.3, H, oz)], [0.42, 0.38, 0.3], 8, [0.28, 0.22, 0.14], 4); crownFronds(B, R, CELL.cycad, V3(ox, H, oz), 11 + Math.floor(R() * 8), 2.4, 1.0, [0.3, 0.95], [1, 1, 1], 0.8); } return B.build(); }, h: 4, r: 2, trunk: 0.4, mass: 300, breakV: 14 },
  treefern: { V: 4, near: (R, v, V) => { const B = new VegBuilder(), H = 3 + R() * 4, lx = (R() - 0.5) * 0.8; B.tube([V3(0, -0.3, 0), V3(lx * 0.4, H * 0.5, 0), V3(lx, H, 0.1)], [0.26, 0.22, 0.2], 7, [0.18, 0.13, 0.09], 3); crownFronds(B, R, CELL.fern, V3(lx, H, 0.1), 9 + Math.floor(R() * 7), 3.4, 1.4, [0.05, 0.75], [0.95, 1, 0.9], 1); return B.build(); }, imp: [7, 7], h: 7, r: 3.2, trunk: 0.25, mass: 250, breakV: 12 },
  deadTree: { V: 4, near: (R, v, V) => deadTree(R, v, V), imp: [8, 11], h: 11, r: 3, trunk: 0.35, mass: 600, breakV: 12 },
  lepido: { V: 5, near: (R, v, V) => lepido(R, v, V), imp: [9, 30], h: 30, r: 4, trunk: 0.6, mass: 2500, breakV: 26 },
  calamites: { V: 4, near: (R, v, V) => calamites(R, v, V), imp: [5, 14], h: 14, r: 2.5, trunk: 0.3, mass: 500, breakV: 14 },
  ginkgo: { V: 4, near: (R, v, V) => broadleaf(R, v, V, { bark: [0.26, 0.22, 0.18], trunk: 4.5, tr: 0.42, limbs: [3, 5], cw: 4.6, ch: 5.2, rise: 3.2, cards: 58, card: 2.6, cell: CELL.ginkgo, tint: [1, 1, 1] }), imp: [11, 16], h: 16, r: 5, trunk: 0.42, mass: 1600, breakV: 22 },
  orange: { V: 3, near: (R, v, V) => broadleaf(R, v, V, { bark: [0.24, 0.2, 0.15], trunk: 1.1, tr: 0.13, limbs: [3, 4], cw: 2.2, ch: 2.0, rise: 0.7, cards: 44, card: 1.3, cell: CELL.orange, tint: [1, 1, 1] }), imp: [5, 4.5], h: 4.5, r: 2.4, trunk: 0.15, mass: 200, breakV: 9 },
  prototax: { V: 3, near: (R) => prototax(R), imp: [2.5, 8], h: 8, r: 0.9, trunk: 0.7, mass: 3000, breakV: 30 },
  archaeop: { V: 4, near: (R, v, V) => conifer(R, v, V, { cell: CELL.fern, h: 12, bark: [0.22, 0.2, 0.15] }), imp: [10, 22], h: 22, r: 5, trunk: 0.42, mass: 2200, breakV: 25 },
  alienTree: { V: 4, near: (R, v) => alienTree(R, v), imp: [14, 18], h: 18, r: 7, trunk: 0.4, mass: 1500, breakV: 20 },
  flowers: { V: 1, near: () => { const B = new VegBuilder(); crossImpostor(B, CELL.flower, 1.0, 0.7, [1, 1, 1], 3); return B.build(); }, h: 0.7, r: 0.5 },
  moss: { V: 1, near: () => { const B = new VegBuilder(); crossImpostor(B, CELL.moss, 1.1, 0.42, [1, 1, 1], 3); return B.build(); }, h: 0.4, r: 0.55 },
  wheat: { V: 1, near: () => { const B = new VegBuilder(); crossImpostor(B, CELL.wheat, 0.9, 1.05, [1, 1, 1], 3); return B.build(); }, h: 1.05, r: 0.45 },
  tundra: { V: 1, near: () => { const B = new VegBuilder(); crossImpostor(B, CELL.dry, 0.9, 0.45, [0.85, 0.9, 0.82], 3); return B.build(); }, h: 0.45, r: 0.45 },
  alienFern: { V: 3, near: (R) => { const B = new VegBuilder(); crownFronds(B, R, CELL.alien, V3(0, 0, 0), 7 + Math.floor(R() * 5), 1.9, 0.9, [0.4, 1.1], [1, 1, 1], 0.4); return B.build(); }, h: 1.8, r: 1.2 },
  cactus: { V: 4, near: (R, v) => cactus(R, v), h: 2.5, r: 1, trunk: 0.2, mass: 120, breakV: 5 },
  shrub: { V: 4, near: (R, v, V) => bush(R, v, V, { size: 1.2, hk: 0.65, cards: 14, card: 1.5, cell: CELL.shrub, tint: [1, 1, 1] }), h: 1.6, r: 1.3 },
  sage: { V: 4, near: (R, v, V) => bush(R, v, V, { size: 0.8, hk: 0.55, cards: 10, card: 1.0, cell: CELL.shrub, tint: [0.85, 0.92, 0.9] }), h: 1, r: 0.9 },
  oleander: { V: 3, near: (R, v, V) => bush(R, v, V, { size: 1.5, hk: 0.85, cards: 22, card: 1.5, cell: CELL.bigleaf, tint: [0.75, 0.95, 0.75] }), h: 2.6, r: 1.6 },
  fern: { V: 3, near: (R) => { const B = new VegBuilder(); crownFronds(B, R, CELL.fern, V3(0, 0, 0), 6 + Math.floor(R() * 5), 1.5, 0.7, [0.5, 1.0], [1, 1, 1], 0.4); return B.build(); }, h: 1.2, r: 1 },
  horsetail: { V: 1, near: () => { const B = new VegBuilder(); crossImpostor(B, CELL.reed, 1.6, 1.8, [0.8, 1.05, 0.75], 3); return B.build(); }, h: 1.8, r: 0.8 },
  reed: { V: 1, near: () => { const B = new VegBuilder(); crossImpostor(B, CELL.reed, 2.2, 2.4, [1, 1, 1], 3); return B.build(); }, h: 2.4, r: 1 },
  grass: { V: 1, near: () => { const B = new VegBuilder(); crossImpostor(B, CELL.grass, 1.0, 0.75, [1, 1, 1], 3); return B.build(); }, h: 0.8, r: 0.5 },
  dryGrass: { V: 1, near: () => { const B = new VegBuilder(); crossImpostor(B, CELL.dry, 1.1, 0.8, [1, 1, 1], 3); return B.build(); }, h: 0.8, r: 0.5 },
};

export function farGeometry(sp) {
  const def = SPECIES[sp];
  if (!def || !def.imp) return null;
  const B = new VegBuilder();
  crossQuads(B, def.imp[0], def.imp[1], sp === 'palm' || sp === 'treefern' || sp === 'deadTree' || sp === 'prototax' || sp === 'calamites' ? 2 : 3);
  return B.build();
}

export function rockGeometry(detail, seed) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const R = rng(seed);
  const p = g.attributes.position;
  const bumps = Array.from({ length: 6 }, () => [V3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), R() * 0.35]);
  for (let i = 0; i < p.count; i++) {
    const v = V3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    let k = 1; for (const [d, a] of bumps) k += Math.max(0, v.dot(d)) ** 3 * a;
    k -= Math.max(0, v.dot(bumps[0][0].clone().negate())) ** 4 * 0.3;
    p.setXYZ(i, v.x * k * 1.15, v.y * k * 0.72, v.z * k);
  }
  g.computeVertexNormals();
  const flat = g.toNonIndexed(); flat.computeVertexNormals();
  return detail > 1 ? g : flat;
}
