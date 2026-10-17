// Roadster 88 city detail worker: builds the near-detail kit of the buildings (parapets, cornices, storefronts, fire escapes, mullions, roof clutter, water towers, helipads) and bakes the street furniture and trees of one 512 m chunk off the main thread.
import { BGeo, detailBuilding } from './geom.js';
import { PGeo, model } from './propgeo.js';

let R = null;
const kits = new Map();
const kit = (t, v) => { const k = t + ':' + v; if (!kits.has(k)) kits.set(k, model(t, v)); return kits.get(k); };
const rasterAt = (x, z) => {
  if (!R) return 0;
  const j = Math.floor((x - R.x0) / R.cell), i = Math.floor((z - R.z0) / R.cell);
  return i < 0 || j < 0 || i >= R.nz || j >= R.nx ? 0 : R.a[i * R.nx + j];
};

self.onmessage = (e) => {
  const d = e.data;
  if (d.raster) { R = d.raster; return; }
  if (d.far) {
    const G = new PGeo(), k = kit('ftree', 0);
    for (const it of d.far) G.add(k, it.x, it.y, it.z, it.yaw, it.s, null);
    const out = { far: true, token: d.token, props: G.nv ? G.out() : null }, tr = [];
    if (out.props) for (const key of ['position', 'normal', 'color', 'emit', 'lamp', 'sig', 'index']) tr.push(out.props[key].buffer);
    self.postMessage(out, tr);
    return;
  }
  const out = { dk: d.dk, token: d.token, facade: null, props: null, leaves: null, ranges: [] }, tr = [];
  if (d.buildings && d.buildings.length) {
    const G = new BGeo(), facing = (x, z) => { const r = rasterAt(x, z); return r === 1 || r === 2; };
    for (const b of d.buildings) detailBuilding(G, b, { facing });
    if (G.nv) { out.facade = G.out(); tr.push(out.facade.position.buffer, out.facade.normal.buffer, out.facade.uv.buffer, out.facade.fa.buffer, out.facade.fb.buffer, out.facade.fc.buffer, out.facade.index.buffer); }
  }
  if (d.items && d.items.length) {
    const P = new PGeo(), L = new PGeo();
    for (const it of d.items) {
      const tree = it.type === 'tree' || it.type === 'ptree';
      const r = P.add(kit(it.type, it.v), it.x, it.y, it.z, it.yaw, it.s, it.sig, tree ? L : null);
      out.ranges.push(r.length > 2 ? [it.id, r[0], r[1], r[2], r[3]] : [it.id, r[0], r[1], -1, -1]);
    }
    if (P.nv) { out.props = P.out(); for (const k of ['position', 'normal', 'color', 'emit', 'lamp', 'sig', 'index']) tr.push(out.props[k].buffer); }
    if (L.nv) { out.leaves = L.out(); for (const k of ['position', 'normal', 'color', 'emit', 'lamp', 'sig', 'index']) tr.push(out.leaves[k].buffer); }
  }
  self.postMessage(out, tr);
};
