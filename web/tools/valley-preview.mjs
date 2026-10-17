// Roadster 88 valley preview: generates the valley terrain in Node, prints timings and height stats, and writes a shaded relief map with masks and roads to Niepotrzebne/shots-map/.
// usage: node web/tools/valley-preview.mjs [--size=1024] [--out=file.png] [--natural]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildDesign } from '../src/world/design.js';
import { TerrainData, generateRows, N, TN, ORIGIN, EXTENT } from '../src/world/terrain.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const size = Number(opt('size', 1024));
const out = opt('out', path.resolve(here, '../../Niepotrzebne/shots-map/valley_relief.png'));

const t0 = performance.now();
const D = buildDesign();
const t1 = performance.now();
const T = new TerrainData(D);
for (let iz = 0; iz < N; iz += 128) T.addRows(generateRows(D, iz, Math.min(N, iz + 128)));
const t2 = performance.now();
T.finish();
const t3 = performance.now();
if (args.includes('--natural')) T.setNatural(true);
console.log(`design ${(t1 - t0).toFixed(0)} ms, base ${(t2 - t1).toFixed(0)} ms, finish ${(t3 - t2).toFixed(0)} ms, deltas ${T.deltaIdx.length}`);
let mn = 1e9, mx = -1e9;
for (const v of T.H) { if (v < mn) mn = v; if (v > mx) mx = v; }
console.log(`height min ${mn.toFixed(1)} max ${mx.toFixed(1)}`);
for (const r of D.roads) console.log(`road ${r.id} len ${r.len.toFixed(0)} elev ${Math.min(...r.elev).toFixed(1)}..${Math.max(...r.elev).toFixed(1)} maxGrade ${(Math.max(...r.elev.slice(1).map((v, i) => Math.abs(v - r.elev[i]))) / 4 * 100).toFixed(1)}%`);
const sp = D.spawn; console.log('spawn h', T.heightAt(sp.x, sp.z).toFixed(2));

const img = Buffer.alloc(size * size * 3);
const sun = [-0.55, 0.65, 0.52]; const sl = Math.hypot(...sun); sun.forEach((v, i) => (sun[i] = v / sl));
for (let py = 0; py < size; py++) {
  for (let px = 0; px < size; px++) {
    const x = ORIGIN + EXTENT * (1 - (px + 0.5) / size), z = ORIGIN + EXTENT * (1 - (py + 0.5) / size);
    const h = T.heightAt(x, z), n = T.normalAt(x, z);
    const sh = Math.max(0, n.x * sun[0] + n.y * sun[1] + n.z * sun[2]);
    const sand = T.tex(T.S, x, z, 0), playa = T.tex(T.S, x, z, 1), rock = T.tex(T.S, x, z, 2), wash = T.tex(T.S, x, z, 3);
    const rmain = T.tex(T.R, x, z, 0), rloop = T.tex(T.R, x, z, 1), rtrack = T.tex(T.R, x, z, 2), town = T.tex(T.R, x, z, 3);
    let c = [0.62, 0.54, 0.4];
    const t = Math.min(1, Math.max(0, h / 420));
    c = c.map((v, i) => v * (1 - t) + [0.55, 0.5, 0.48][i] * t);
    const mix = (col, k) => { k = Math.min(1, Math.max(0, k)); c = c.map((v, i) => v * (1 - k) + col[i] * k); };
    mix([0.5, 0.47, 0.44], rock * 0.5 + (1 - n.y) * 2.2);
    mix([0.86, 0.76, 0.56], sand > 0.5 ? 1 : sand * 1.2);
    mix([0.85, 0.83, 0.78], playa);
    mix([0.74, 0.66, 0.5], wash > 0.5 ? 0.9 : 0);
    mix([0.75, 0.6, 0.6], town > 0.5 ? 0.6 : 0);
    mix([0.5, 0.42, 0.32], rtrack > 0.5 ? 1 : 0);
    mix([0.16, 0.16, 0.17], Math.max(rmain, rloop) > 0.5 ? 1 : 0);
    const shade = 0.35 + 0.85 * sh;
    const o = (py * size + px) * 3;
    for (let i = 0; i < 3; i++) img[o + i] = Math.max(0, Math.min(255, Math.round(Math.pow(c[i] * shade, 1 / 1.25) * 255)));
    if (Math.abs(((h % 25) + 25) % 25) < 0.6 && n.y > 0.5) for (let i = 0; i < 3; i++) img[o + i] = img[o + i] * 0.85;
  }
}
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc(size * (size * 3 + 1));
for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; img.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out, 'TN', TN);
