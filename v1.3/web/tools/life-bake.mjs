// Roadster 88 life baker: builds every species SDF model from web/src/life/species, meshes it with surface nets, simplifies each LOD with meshoptimizer, computes skin weights, cavity occlusion and regions on the kept vertices and writes assets/life/<id>.bin plus assets/life/index.json.
// usage: node web/tools/life-bake.mjs [id,id...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MeshoptSimplifier } from 'meshoptimizer';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.join(root, 'assets/life');
const specDir = path.join(root, 'web/src/life/species');
fs.mkdirSync(outDir, { recursive: true });
const want = (process.argv.slice(2).find((a) => !a.startsWith('--')) || '').split(',').filter(Boolean);
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;

function compact(idx, n) {
  const map = new Int32Array(n).fill(-1); let k = 0;
  const out = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) { const v = idx[i]; if (map[v] < 0) map[v] = k++; out[i] = map[v]; }
  return { idx: out, map, count: k };
}

function lodOf(M, raw, target, cell, opt) {
  const n = raw.pos.length / 3;
  let idx = raw.idx;
  if (target && idx.length / 3 > target) {
    const nor = M.normals(raw.pos, cell);
    const at = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) { at[v * 4] = nor[v * 3]; at[v * 4 + 1] = nor[v * 3 + 1]; at[v * 4 + 2] = nor[v * 3 + 2]; at[v * 4 + 3] = M.regionAt(raw.pos[v * 3], raw.pos[v * 3 + 1], raw.pos[v * 3 + 2]); }
    const far = opt.lod >= 2;
    const [res] = MeshoptSimplifier.simplifyWithAttributes(idx, raw.pos, 3, at, 4, far ? [0.15, 0.15, 0.15, (opt.regionWeight || 2.5) * 0.12] : [0.35, 0.35, 0.35, opt.regionWeight || 2.5], null, target * 3, far ? 0.6 : 0.2, []);
    idx = res;
  }
  const c = compact(idx, n);
  const pos = new Float32Array(c.count * 3);
  for (let v = 0; v < n; v++) { const m = c.map[v]; if (m >= 0) { pos[m * 3] = raw.pos[v * 3]; pos[m * 3 + 1] = raw.pos[v * 3 + 1]; pos[m * 3 + 2] = raw.pos[v * 3 + 2]; } }
  return M.attrs(pos, c.idx, cell, opt);
}

const align = (b) => (4 - (b % 4)) % 4;

function writeBin(file, header, lods) {
  const parts = [];
  for (const L of lods) {
    const n = L.verts;
    const nor8 = new Int8Array(n * 4);
    for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) nor8[v * 4 + c] = Math.round(Math.max(-1, Math.min(1, L.nor[v * 3 + c])) * 127);
    const idx = n > 65535 ? new Uint32Array(L.idx) : new Uint16Array(L.idx);
    parts.push(new Uint8Array(L.pos.buffer, L.pos.byteOffset, L.pos.byteLength), new Uint8Array(nor8.buffer), L.skinI, L.skinW, L.aux, new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength));
  }
  const hj = Buffer.from(JSON.stringify(header), 'utf8');
  let size = 12 + hj.length + align(12 + hj.length);
  for (const p of parts) size += p.byteLength + align(p.byteLength);
  const buf = Buffer.alloc(size);
  buf.write('R88L', 0, 'ascii'); buf.writeUInt32LE(1, 4); buf.writeUInt32LE(hj.length, 8);
  hj.copy(buf, 12);
  let o = 12 + hj.length + align(12 + hj.length);
  for (const p of parts) { Buffer.from(p.buffer, p.byteOffset, p.byteLength).copy(buf, o); o += p.byteLength + align(p.byteLength); }
  fs.writeFileSync(file, buf);
  return size;
}

const files = fs.readdirSync(specDir).filter((f) => f.endsWith('.js'));
const indexFile = path.join(outDir, 'index.json');
const done = {};
for (const f of files) {
  const mod = await import(pathToFileURL(path.join(specDir, f)).href);
  const list = mod.variants ? mod.variants : [mod];
  for (const S of list) {
    if (!S.build || (want.length && !want.includes(S.id))) continue;
    const t0 = performance.now();
    const M = S.build();
    const cell = S.meta.cell || 0.04;
    const raw = M.mesh(cell);
    const t1 = performance.now();
    const opt = { ao: S.meta.ao, look: S.meta.look, blend: S.meta.blend, hops: S.meta.hops, regionWeight: S.meta.regionWeight };
    const lods = S.meta.lods.map((L, li) => lodOf(M, raw, L.tris, cell, { ...opt, lod: li }));
    const t2 = performance.now();
    const bounds = M.bounds(0);
    const header = { id: S.id, version: 1, bones: M.bones, regions: M.regions, bounds, lods: lods.map((L) => ({ verts: L.verts, tris: L.tris, idx32: L.verts > 65535 })) };
    const size = writeBin(path.join(outDir, S.id + '.bin'), header, lods);
    done[S.id] = { file: S.id + '.bin', bytes: size, lods: header.lods.map((l) => l.tris), module: f };
    console.log(`${S.id}: raw ${raw.idx.length / 3} tris in ${(t1 - t0).toFixed(0)} ms, lods ${lods.map((l) => `${l.tris}t/${l.verts}v`).join(' ')} in ${(t2 - t1).toFixed(0)} ms, ${(size / 1024).toFixed(0)} KB`);
  }
}
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {};
fs.writeFileSync(indexFile, JSON.stringify(Object.assign(index, done), null, 1));
