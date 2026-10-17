// Roadster 88 city tiles: pure builders shared by the city worker and the main thread fallback, for per-building flags, merged building masses and street ground per 2 km tile, the building shadow-height grid and concatenation of packed geometry.
import { polyArea, centroid, inPoly } from './plan.js';
import { BGeo, GGeo, GK, massBuilding, roadStrip, flatPoly, curb } from './geom.js';

export const TILE = 2048, TN = 8, TO = -8192;
export const GKIND = { avenue: GK.avenue, main: GK.main, street: GK.street, boulevard: GK.boulevard, broadway: GK.broadway, runway: GK.runway, taxiway: GK.taxiway };
export const tileOf = (x, z) => Math.max(0, Math.min(TN - 1, Math.floor((z - TO) / TILE))) * TN + Math.max(0, Math.min(TN - 1, Math.floor((x - TO) / TILE)));

export function annotate(plan) {
  let sum = 0;
  for (const b of plan.buildings) {
    b.area = Math.abs(polyArea(b.fp));
    b.tall = b.top - b.ground > 45 || !!b.landmark;
    b.small = !b.tall && b.top - b.ground < 30;
    sum = (sum + Math.round(b.top * 10) * 31 + Math.round(b.cx) * 7 + Math.round(b.cz) * 3) % 1000000007;
  }
  return `${plan.buildings.length}:${sum}`;
}

export function pointAt(r, s) {
  const S = r.s; let i = 0; while (i < S.length - 2 && S[i + 1] < s) i++;
  const t = Math.max(0, Math.min(1, (s - S[i]) / Math.max(1e-6, S[i + 1] - S[i]))), a = r.pts[i], b = r.pts[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function tileSink() {
  const per = new Map();
  const tile = (k) => { if (!per.has(k)) per.set(k, { mass: new BGeo(), ground: new GGeo() }); return per.get(k); };
  return { per, tile, at: (x, z) => tile(tileOf(x, z)) };
}

export function buildMass(P, sink) {
  for (const b of P.buildings) massBuilding(sink.at(b.cx, b.cz).mass, b);
}

export function buildGround(P, skel, H, sink) {
  if (P.style === 'none') return;
  const tile = (x, z) => sink.at(x, z);
  for (const r of P.roads) {
    if (r.elevated || r.tunnel) continue;
    const kind = r.cat === 'park' ? GK.street : GKIND[r.cat] ?? GK.street;
    for (const [s0, s1] of r.segs) {
      if (s1 - s0 < 0.5) continue;
      for (let a = s0; a < s1 - 0.01; a += 400) { const b = Math.min(s1, a + 400), m = pointAt(r, (a + b) / 2); roadStrip(tile(m[0], m[1]).ground, r, a, b, H, kind, r.cat === 'park' ? 0.1 : 0.03, null, [Math.min(255, Math.round(r.width / 2 * 4)), 0, (Math.round(a * 7.31 + r.pts[0][0] * 0.37 + r.pts[0][1] * 0.11) & 255)], r.cat === 'park' ? 8 : 0); }
    }
  }
  for (const n of skel.nodes) {
    if (!n.box || (P.style === 'frontier' && n.z < 6880)) continue;
    const [x0, z0, x1, z1] = n.box;
    flatPoly(tile(n.x, n.z).ground, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], H, 0.03, GK.box, 60);
  }
  for (const blk of skel.blocks) {
    if (blk.kind === 'stadium') continue;
    if (P.style === 'frontier' && (blk.district !== 'island' || blk.cz < 6880)) continue;
    const G = tile(blk.cx, blk.cz).ground;
    const k = blk.kind === 'plaza' ? GK.plaza : blk.kind === 'container' || blk.kind === 'warehouse' || blk.kind === 'tanks' || blk.kind === 'quay' ? GK.yard : blk.kind === 'apron' ? GK.apron : GK.walk;
    const lift = k === GK.walk || k === GK.plaza ? 0.16 : 0.04;
    flatPoly(G, blk.poly, H, lift, P.style === 'frontier' && k === GK.walk ? GK.dirt : k, 48);
    if (lift > 0.1) curb(G, blk.poly, H, lift, GK.curb);
  }
  for (const st of P.sites || []) flatPoly(tile(st.cx, st.cz).ground, st.fp, H, 0.19, GK.dirt, 30);
  if (P.style === 'frontier') return;
  for (const w of skel.waterfront) flatPoly(tile(...centroid(w.poly)).ground, w.poly, H, 0.05, GK.esplanade, 60);
  for (const p of skel.parks) flatPoly(tile(...centroid(p.poly)).ground, p.poly, H, 0.06, GK.lawn, 8);
  for (const pp of skel.parkPaths || []) { const r = { pts: pp, width: 3.6, s: [0] }; for (let i = 1; i < pp.length; i++) r.s.push(r.s[i - 1] + Math.hypot(pp[i][0] - pp[i - 1][0], pp[i][1] - pp[i - 1][1])); r.len = r.s[r.s.length - 1]; roadStrip(tile(...pp[0]).ground, r, 0, r.len, H, GK.path, 0.09, null, [7, 0, 0], 6); }
}

function rectAligned(fp) {
  if (fp.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = fp[i], b = fp[(i + 1) % 4];
    if (Math.abs(a[0] - b[0]) > 0.01 && Math.abs(a[1] - b[1]) > 0.01) return false;
  }
  return true;
}

export function shadowHeights(plan, S, baseAt) {
  const B = new Float32Array(S.nx * S.nz);
  for (let i = 0; i < S.nz; i++) for (let j = 0; j < S.nx; j++) B[i * S.nx + j] = baseAt(i, j);
  for (const b of plan.buildings) {
    for (const t of b.tiers || [{ fp: b.fp, y1: b.top }]) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of t.fp) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const ja = Math.max(0, Math.ceil((x0 - S.x0) / S.cell)), jb = Math.min(S.nx - 1, Math.floor((x1 - S.x0) / S.cell)), ia = Math.max(0, Math.ceil((z0 - S.z0) / S.cell)), ib = Math.min(S.nz - 1, Math.floor((z1 - S.z0) / S.cell));
      const rect = rectAligned(t.fp);
      for (let i = ia; i <= ib; i++) for (let j = ja; j <= jb; j++) { if (!rect && !inPoly(S.x0 + j * S.cell, S.z0 + i * S.cell, t.fp)) continue; const o = i * S.nx + j; if (t.y1 > B[o]) B[o] = t.y1; }
    }
  }
  return B;
}

export function envArrays(plan) {
  let n = 0;
  for (const b of plan.buildings) if (b.tall) n += b.fp.length * 6;
  if (!n) return null;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), color = new Float32Array(n * 3);
  let o = 0;
  for (const b of plan.buildings) {
    if (!b.tall) continue;
    const fp = b.fp, y0 = b.ground, y1 = b.top;
    const c = b.style === 'glass' ? [0.12, 0.16, 0.2] : b.P.color.map((v) => v * 0.8);
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i], d = fp[(i + 1) % fp.length], dx = d[0] - a[0], dz = d[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      const v = [a[0], y0, a[1], d[0], y0, d[1], d[0], y1, d[1], a[0], y0, a[1], d[0], y1, d[1], a[0], y1, a[1]];
      for (let k = 0; k < 6; k++) { position[o] = v[k * 3]; position[o + 1] = v[k * 3 + 1]; position[o + 2] = v[k * 3 + 2]; normal[o] = nx; normal[o + 1] = 0; normal[o + 2] = nz; color[o] = c[0]; color[o + 1] = c[1]; color[o + 2] = c[2]; o += 3; }
    }
  }
  return { position, normal, color };
}

export function mergeOut(a, b) {
  if (!a || !a.count) return b && b.count ? b : a;
  if (!b || !b.count) return a;
  const o = { count: a.count + b.count, box: [Math.min(a.box[0], b.box[0]), Math.min(a.box[1], b.box[1]), Math.min(a.box[2], b.box[2]), Math.max(a.box[3], b.box[3]), Math.max(a.box[4], b.box[4]), Math.max(a.box[5], b.box[5])] };
  for (const k of Object.keys(a)) {
    if (k === 'count' || k === 'box') continue;
    const x = a[k], y = b[k];
    if (k === 'index') { const ix = new Uint32Array(x.length + y.length); ix.set(x); for (let i = 0; i < y.length; i++) ix[x.length + i] = y[i] + a.count; o.index = ix; continue; }
    const c = new x.constructor(x.length + y.length); c.set(x); c.set(y, x.length); o[k] = c;
  }
  return o;
}
