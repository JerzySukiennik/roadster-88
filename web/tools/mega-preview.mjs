// Roadster 88 mega map preview: builds the valley and the mega grid in Node, prints timings and stats, and writes a shaded relief map of the whole 16 km world with water, roads, districts and the city plan to Niepotrzebne/shots-city/.
// usage: node web/tools/mega-preview.mjs [--cell=8] [--size=2048] [--out=file.png] [--x0= --z0= --x1= --z1=] [--plan] [--natural]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildDesign } from '../src/world/design.js';
import { buildTerrainSync } from '../src/world/terrain.js';
import { buildMega, MEGA } from '../src/world/mega.js';
import { OuterData, generateOuterRows } from '../src/world/outer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const cell = Number(opt('cell', 8)), size = Number(opt('size', 2048));
const out = opt('out', path.resolve(here, '../../Niepotrzebne/shots-city/mega_relief.png'));
const spec = cell === 4 ? MEGA : { ...MEGA, CELL: cell, N: MEGA.EXTENT / cell + 1, TN: MEGA.EXTENT / cell / 2 + 1, TCELL: cell * 2 };

const t0 = performance.now();
const D = buildDesign();
const T = buildTerrainSync(D);
const t1 = performance.now();
const M = buildMega(D);
const O = new OuterData(D, M, T, spec);
for (let iz = 0; iz < spec.N; iz += 128) O.addRows(generateOuterRows(D, iz, Math.min(spec.N, iz + 128), spec));
const t2 = performance.now();
O.fillInner(T);
O.finish();
O.innerHeights(T);
const t3 = performance.now();
if (args.includes('--natural')) O.setNatural(true);
console.log(`inner ${(t1 - t0).toFixed(0)} ms, outer rows ${(t2 - t1).toFixed(0)} ms, outer finish ${(t3 - t2).toFixed(0)} ms, N ${spec.N}`);
let mn = 1e9, mx = -1e9;
for (const v of O.H) { if (v < mn) mn = v; if (v > mx) mx = v; }
console.log(`height min ${mn.toFixed(1)} max ${mx.toFixed(1)}`);
for (const r of M.roads) console.log(`road ${r.id} len ${r.len.toFixed(0)} elev ${Math.min(...r.elev).toFixed(1)}..${Math.max(...r.elev).toFixed(1)} start ${r.elev[0].toFixed(2)}`);
const heightAt = (x, z) => (Math.abs(x) <= 2048 && Math.abs(z) <= 2048 ? T.heightAt(x, z) : O.heightAt(x, z));
for (const [x, z] of [[-900, 2040], [-900, 2060], [-900, 3000], [-900, 3400], [-900, -2060], [-1000, 5000], [1000, 5000], [-2800, 5000], [-6000, 7000], [2900, 6800], [-250, -5500]]) console.log(`h(${x},${z}) = ${heightAt(x, z).toFixed(2)}`);

let plan = null;
if (args.includes('--plan')) { const mod = await import('../src/world/city/plan.js'); const tp = performance.now(); plan = mod.buildPlan({ heightAt, style: opt('style', 'modern'), density: 1, height: Number(opt('height', 460)) }); console.log(`plan ${(performance.now() - tp).toFixed(0)} ms, buildings ${plan.buildings.length}, blocks ${plan.blocks.length}, roads ${plan.roads.length}`); }

const bx0 = Number(opt('x0', -8192)), bz0 = Number(opt('z0', -8192)), bx1 = Number(opt('x1', 8192)), bz1 = Number(opt('z1', 8192));
const ext = Math.max(bx1 - bx0, bz1 - bz0);
const img = Buffer.alloc(size * size * 3);
const sun = [-0.55, 0.65, 0.52]; const sl = Math.hypot(...sun); sun.forEach((v, i) => (sun[i] = v / sl));
const e = ext / size;
for (let py = 0; py < size; py++) {
  for (let px = 0; px < size; px++) {
    const x = bx1 - (px + 0.5) * e, z = bz1 - (py + 0.5) * e;
    const h = heightAt(x, z);
    const nx = heightAt(x - e, z) - heightAt(x + e, z), nz = heightAt(x, z - e) - heightAt(x, z + e), ny = 2 * e, nl = Math.hypot(nx, ny, nz);
    const sh = Math.max(0, (nx * sun[0] + ny * sun[1] + nz * sun[2]) / nl);
    const inner = Math.abs(x) <= 2048 && Math.abs(z) <= 2048, G = inner ? T : O;
    const sand = G.tex(G.S, x, z, 0), playa = G.tex(G.S, x, z, 1), rock = G.tex(G.S, x, z, 2);
    const rmain = G.tex(G.R, x, z, 0), rloop = G.tex(G.R, x, z, 1), rtrack = G.tex(G.R, x, z, 2), town = G.tex(G.R, x, z, 3);
    let c = [0.62, 0.54, 0.4];
    const t = Math.min(1, Math.max(0, h / 700));
    c = c.map((v, i) => v * (1 - t) + [0.55, 0.52, 0.5][i] * t);
    const mix = (col, k) => { k = Math.min(1, Math.max(0, k)); c = c.map((v, i) => v * (1 - k) + col[i] * k); };
    mix([0.5, 0.47, 0.44], rock * 0.5 + (ny / nl < 0.75 ? 0.6 : 0));
    mix([0.86, 0.76, 0.56], sand > 0.5 ? 1 : sand * 1.2);
    mix([0.85, 0.83, 0.78], playa);
    mix([0.75, 0.6, 0.6], town > 0.5 ? 0.6 : 0);
    mix([0.5, 0.42, 0.32], rtrack > 0.5 ? 1 : 0);
    mix([0.16, 0.16, 0.17], Math.max(rmain, rloop) > 0.5 ? 1 : 0);
    if (h > 900) mix([0.92, 0.93, 0.95], (h - 900) / 200);
    let shade = 0.35 + 0.85 * sh;
    if (h < 0 && z > 2300) { const dpt = Math.min(1, -h / 16); c = [0.12 - dpt * 0.06, 0.25 - dpt * 0.1, 0.33 - dpt * 0.08]; shade = 1; }
    const o = (py * size + px) * 3;
    for (let i = 0; i < 3; i++) img[o + i] = Math.max(0, Math.min(255, Math.round(Math.pow(c[i] * shade, 1 / 1.25) * 255)));
    if (Math.abs(((h % 50) + 50) % 50) < e * 0.15 && h > 0) for (let i = 0; i < 3; i++) img[o + i] = img[o + i] * 0.85;
  }
}
const toPx = (x, z) => [(bx1 - x) / e, (bz1 - z) / e];
const plot = (x, z, col, r = 0) => { const [a, b] = toPx(x, z); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const px = Math.round(a + dx), py = Math.round(b + dy); if (px < 0 || py < 0 || px >= size || py >= size) continue; const o = (py * size + px) * 3; img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; } };
const seg = (a, b, col, r = 0) => { const [ax, ay] = toPx(a[0], a[1]), [bx, by] = toPx(b[0], b[1]); const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay))); for (let k = 0; k <= n; k++) plot(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, col, r); };
if (plan) {
  for (const b of plan.buildings) {
    const v = Math.min(1, b.h / 300), col = [Math.round(200 + 55 * v), Math.round(200 - 120 * v), Math.round(190 - 150 * v)];
    const fp = b.fp; for (let i = 0; i < fp.length; i++) seg(fp[i], fp[(i + 1) % fp.length], col, 0);
    if (b.h > 120) { const cx = fp.reduce((s, p) => s + p[0], 0) / fp.length, cz = fp.reduce((s, p) => s + p[1], 0) / fp.length; plot(cx, cz, col, 1); }
  }
  for (const r of plan.roads) for (let i = 0; i < r.pts.length - 1; i++) seg(r.pts[i], r.pts[i + 1], r.elevated ? [255, 210, 60] : r.kind === 'bridge' ? [255, 120, 60] : r.tunnel ? [120, 255, 160] : [235, 235, 240], 0);
}
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc(size * (size * 3 + 1));
for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; img.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out);
