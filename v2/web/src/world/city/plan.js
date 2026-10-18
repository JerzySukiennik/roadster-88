// Roadster 88 city planner: turns the city skeleton into the full deterministic plan (roads with lanes, signals and ground segments, intersections, blocks and sidewalks, lots, buildings with tiers, facades and roofs for every style, park, plazas, waterfronts, elevated ring, ramps, bridges, tunnel, garages, stadium, port, airport, gas stations, ramps and jumps, props). Pure JS, shared by the main thread, workers and Node tools.
import { AVE_X, MAIN_AVE, STREET_Z, STREET_N, W, BROADWAY, PARK, HEIGHTS, ISLAND, BOROUGH, PORT, AIRPORT, RING, BRIDGES, TUNNEL, PONDS, PARK_DRIVE, boroughToWorld, worldToBorough, broadwayX } from './layout.js';

export const CHUNK = 256, CH_N = 64, CH_O = -8192;
export const chunkOf = (x, z) => (Math.max(0, Math.min(CH_N - 1, Math.floor((z - CH_O) / CHUNK))) * CH_N) + Math.max(0, Math.min(CH_N - 1, Math.floor((x - CH_O) / CHUNK)));
export const STYLES = ['none', 'frontier', 'early', 'mid', 'modern', 'future', 'ruins', 'scifi'];
export const FACADE = { brick: 0, stone: 1, deco: 2, modernist: 3, concrete: 4, glass: 5, postmodern: 6, wood: 7, metal: 8, future: 9, scifi: 10, residential: 11 };

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function polyArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return a / 2; }
export function centroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
export function inPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; }
  return c;
}
export function ccw(p) { return polyArea(p) < 0 ? p.slice().reverse() : p; }

export function clipPoly(poly, nx, nz, d) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = a[0] * nx + a[1] * nz - d, db = b[0] * nx + b[1] * nz - d;
    if (da <= 0) out.push(a);
    if ((da < 0) !== (db < 0) && da !== db) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

export function clipConvex(poly, clip) {
  let p = poly;
  const c = ccw(clip);
  for (let i = 0; i < c.length && p.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
    const nx = -ez / l, nz = ex / l;
    p = clipPoly(p, nx, nz, a[0] * nx + a[1] * nz);
  }
  return p;
}

export function insetPoly(poly, d) {
  const p = ccw(poly), n = p.length, lines = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
    const dd = typeof d === 'function' ? d(i, a, b) : d;
    const nx = ez / l, nz = -ex / l;
    lines.push({ px: a[0] + nx * dd, pz: a[1] + nz * dd, dx: ex / l, dz: ez / l });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const L0 = lines[(i - 1 + n) % n], L1 = lines[i];
    const den = L0.dx * L1.dz - L0.dz * L1.dx;
    if (Math.abs(den) < 1e-6) { out.push([L1.px, L1.pz]); continue; }
    const t = ((L1.px - L0.px) * L1.dz - (L1.pz - L0.pz) * L1.dx) / den;
    out.push([L0.px + L0.dx * t, L0.pz + L0.dz * t]);
  }
  return out;
}

function splitPoly(poly, ax, az, nx, nz) {
  const d = ax * nx + az * nz;
  return [clipPoly(poly, nx, nz, d), clipPoly(poly, -nx, -nz, -d)];
}

function aveWidth(x) { return x === MAIN_AVE ? W.main : W.ave; }
function aveWalk(x) { return x === MAIN_AVE ? W.walkMain : W.walkAve; }
function streetWidth(k) { return k % 6 === 0 ? 20 : W.street; }
function inPark(x, z) { return x > PARK.x0 - 1 && x < PARK.x1 + 1 && z > PARK.z0 - 1 && z < PARK.z1 + 1; }
function inBluff(x, z) { return x > HEIGHTS.x1 - 30 && z > HEIGHTS.z0 && z < HEIGHTS.z1; }

const BW = (() => { const { a, b } = BROADWAY, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return { ax: a[0], az: a[1], dx: dx / l, dz: dz / l, nx: dz / l, nz: -dx / l, len: l, half: W.broadway / 2, walk: 5 }; })();

function sampleLine(x0, z0, x1, z1, step = 8) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / step)), out = [];
  for (let i = 0; i <= n; i++) out.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
  return out;
}

function arcLen(pts) { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return s; }

function roundedRect(x0, z0, x1, z1, r, step = 8) {
  const pts = [], arc = (cx, cz, a0) => { const n = Math.max(4, Math.round((Math.PI / 2) * r / step)); for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI / 2) * i / n; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } };
  const lineTo = (x, z) => { const p = pts[pts.length - 1]; const L = Math.hypot(x - p[0], z - p[1]), n = Math.max(1, Math.round(L / step)); for (let i = 1; i < n; i++) pts.push([p[0] + (x - p[0]) * i / n, p[1] + (z - p[1]) * i / n]); };
  arc(x1 - r, z0 + r, -Math.PI / 2); lineTo(x1, z1 - r); arc(x1 - r, z1 - r, 0); lineTo(x0 + r, z1); arc(x0 + r, z1 - r, Math.PI / 2); lineTo(x0, z0 + r); arc(x0 + r, z0 + r, Math.PI); lineTo(x1 - r, z0);
  return pts;
}

export function signalState(sig, axis, t) {
  const c = sig.cycle, ph = (((t + sig.offset) % c) + c) % c, g = sig.green;
  const A = ph < g ? 'green' : ph < g + 3.5 ? 'yellow' : 'red';
  const ph2 = (ph - g - 5.5 + c) % c, g2 = c - g - 11;
  const B = ph2 < g2 ? 'green' : ph2 < g2 + 3.5 ? 'yellow' : 'red';
  return axis === 0 ? A : B;
}

export function buildSkeleton(heightAt) {
  const S = { roads: [], nodes: [], blocks: [], reserved: [], structures: [], waterfront: [], plazas: [], parks: [], signals: [] };
  const H = (x, z) => heightAt(x, z);
  const roadPoints = (pts) => pts.map(([x, z]) => [x, H(x, z), z]);
  const addRoad = (r) => { r.city = true; r.kind = r.kind || 'road'; r.points = r.points || roadPoints(r.pts); r.s = arcLen(r.pts); r.len = r.s[r.s.length - 1]; r.signals = r.signals || []; r.segs = r.segs || [[0, r.len]]; S.roads.push(r); return r; };
  const nodeAt = new Map();
  const addNode = (x, z, signal) => { const key = `${Math.round(x)}:${Math.round(z)}`; let n = nodeAt.get(key); if (!n) { n = { id: S.nodes.length, x, z, y: H(x, z), box: null, signal: null }; S.nodes.push(n); nodeAt.set(key, n); } if (signal && !n.signal) { const sig = { id: S.signals.length, node: n.id, x, z, cycle: 64, green: 30, offset: ((z - 3480) / 13.4 + (x + 2460) / 40) % 64 }; S.signals.push(sig); n.signal = sig; } return n; };

  const bridges = BRIDGES.map((B) => {
    const dir = Math.sign(B.x1 - B.x0), grade = 0.055;
    const g0 = H(B.x0 - dir * 20, B.z), g1 = H(B.x1 + dir * 20, B.z);
    let gx0 = B.x0 - dir * Math.max(30, (B.deck - g0) / grade + 20), gx1 = B.x1 + dir * Math.max(30, (B.deck - g1) / grade + 20);
    if (B.kind === 'suspension_great') gx0 = AVE_X[AVE_X.length - 2] + W.ave / 2 + 2;
    return { B, dir, grade, gx0, gx1 };
  });
  const streetCuts = new Map();
  const cut = (z, a, b) => { const k = Math.round(z); if (!streetCuts.has(k)) streetCuts.set(k, []); streetCuts.get(k).push([Math.min(a, b), Math.max(a, b)]); };
  for (const br of bridges) if (br.B.kind !== 'suspension_great') cut(br.B.z, br.gx0, ISLAND.x0);
  cut(TUNNEL.z, AVE_X[AVE_X.length - 2] + 1, AVE_X[AVE_X.length - 1] - 1);

  const zMin = STREET_Z[0], zMax = STREET_Z[STREET_N - 1];
  const xs = AVE_X.slice().sort((a, b) => a - b);
  for (const x of AVE_X) {
    const w = aveWidth(x), gaps = [];
    if (x > PARK.x0 && x < PARK.x1) gaps.push([PARK.z0, PARK.z1]);
    if (x === 400) gaps.push([HEIGHTS.z0 - 30, HEIGHTS.z1 + 30]);
    const z0 = x === MAIN_AVE ? 3420 : zMin, z1 = zMax;
    const spans = [];
    let cur = z0;
    for (const [g0, g1] of gaps.sort((a, b) => a[0] - b[0])) { const e0 = STREET_Z.filter((z) => z <= g0).pop(), e1 = STREET_Z.find((z) => z >= g1); if (e0 > cur) spans.push([cur, e0]); cur = e1; }
    if (cur < z1) spans.push([cur, z1]);
    spans.forEach(([a, b], si) => {
      const ai = AVE_X.indexOf(x);
      const r = addRoad({ id: `ave_${ai}_${si}`, name: x === MAIN_AVE ? 'Gzowo Avenue' : `${ai + 1}${['st', 'nd', 'rd'][ai] || 'th'} Avenue`, type: 'street', cat: x === MAIN_AVE ? 'main' : 'avenue', width: w, walk: aveWalk(x), axis: 0, district: 'island', pts: sampleLine(x, a, x, b) });
      r.segs = []; let prev = a;
      for (let k = 0; k < STREET_N; k++) {
        const z = STREET_Z[k]; if (z < a - 1 || z > b + 1) continue;
        const sw = streetWidth(k);
        const n = addNode(x, z, true);
        n.box = [x - w / 2, z - sw / 2, x + w / 2, z + sw / 2];
        r.signals.push({ s: z - a, id: n.signal.id, axis: 0, half: sw / 2 });
        if (z - sw / 2 > prev) r.segs.push([prev - a, z - sw / 2 - a]);
        prev = z + sw / 2;
      }
      if (b > prev) r.segs.push([prev - a, b - a]);
    });
  }
  for (let k = 0; k < STREET_N; k++) {
    const z = STREET_Z[k], sw = streetWidth(k);
    const parkCut = z > PARK.z0 && z < PARK.z1 && !PARK.transverse.includes(z);
    let spans = [[xs[0], xs[xs.length - 1]]];
    if (parkCut) spans = [[xs[0], PARK.x0 - W.ave / 2], [PARK.x1 + W.ave / 2, xs[xs.length - 1]]];
    if (z > HEIGHTS.z0 - 30 && z < HEIGHTS.z1 + 30) spans = spans.map(([a, b]) => [a, b === 400 ? HEIGHTS.x1 : b]);
    for (const [c0, c1] of streetCuts.get(Math.round(z)) || []) {
      const out = [];
      for (const [a, b] of spans) { if (c1 <= a || c0 >= b) { out.push([a, b]); continue; } if (c0 > a) out.push([a, c0]); if (c1 < b) out.push([c1, b]); }
      spans = out;
    }
    spans.forEach(([a, b], si) => {
      if (b - a < 20) return;
      const r = addRoad({ id: `st_${k}_${si}`, name: `${k + 1}${k === 0 ? 'st' : k === 1 ? 'nd' : k === 2 ? 'rd' : 'th'} Street`, type: 'street', cat: sw > 15 ? 'boulevard' : 'street', width: sw, walk: W.walkStreet, axis: 1, district: 'island', pts: sampleLine(a, z, b, z) });
      r.segs = []; let prev = a;
      for (const x of xs) {
        if (x < a - 1 || x > b + 1) continue;
        const w = aveWidth(x), n = nodeAt.get(`${Math.round(x)}:${Math.round(z)}`);
        if (n && n.signal) r.signals.push({ s: x - a, id: n.signal.id, axis: 1, half: w / 2 });
        if (x - w / 2 > prev) r.segs.push([prev - a, x - w / 2 - a]);
        prev = Math.max(prev, x + w / 2);
      }
      if (b > prev + 1) r.segs.push([prev - a, b - a]);
    });
  }
  {
    const pts = sampleLine(BROADWAY.a[0], BROADWAY.a[1], BROADWAY.b[0], BROADWAY.b[1]);
    const r = addRoad({ id: 'broadway', name: 'Broadway', type: 'street', cat: 'broadway', width: W.broadway, walk: BW.walk, axis: 2, district: 'island', pts });
    const cuts = [];
    for (const x of AVE_X) { const t = (x - BW.ax) / BW.dx; if (t > 0 && t < BW.len) { const half = (aveWidth(x) / 2) / Math.abs(BW.dx) + BW.half * Math.abs(BW.dz / BW.dx); cuts.push([t - half, t + half]); const n = addNode(x, BW.az + BW.dz * t, false); n.broadway = true; } }
    for (let k = 0; k < STREET_N; k++) { const z = STREET_Z[k], t = (z - BW.az) / BW.dz; if (t > 0 && t < BW.len) { const half = (streetWidth(k) / 2) / Math.abs(BW.dz) + BW.half * Math.abs(BW.dx / BW.dz); cuts.push([t - half, t + half]); } }
    cuts.sort((a, b) => a[0] - b[0]);
    r.segs = []; let prev = 0;
    for (const [c0, c1] of cuts) { if (c0 > prev) r.segs.push([prev, c0]); prev = Math.max(prev, c1); }
    if (prev < r.len) r.segs.push([prev, r.len]);
  }
  S.island = { x0: xs[0], x1: xs[xs.length - 1], z0: zMin, z1: zMax };

  for (let i = 0; i < xs.length - 1; i++) {
    for (let k = 0; k < STREET_N - 1; k++) {
      const xa = xs[i] + aveWidth(xs[i]) / 2, xb = xs[i + 1] - aveWidth(xs[i + 1]) / 2, za = STREET_Z[k] + streetWidth(k) / 2, zb = STREET_Z[k + 1] - streetWidth(k + 1) / 2;
      const cx = (xa + xb) / 2, cz = (za + zb) / 2;
      if (inPark(cx, cz)) continue;
      let pieces = [[[xa, za], [xb, za], [xb, zb], [xa, zb]]];
      const corridor = BW.half + BW.walk;
      const dc = (cx - BW.ax) * BW.nx + (cz - BW.az) * BW.nz;
      const tb = (cx - BW.ax) * BW.dx + (cz - BW.az) * BW.dz;
      if (Math.abs(dc) < 160 && tb > -100 && tb < BW.len + 100) {
        const out = [];
        for (const p of pieces) {
          const A = clipPoly(p, BW.nx, BW.nz, BW.ax * BW.nx + BW.az * BW.nz - corridor);
          const B = clipPoly(p, -BW.nx, -BW.nz, -(BW.ax * BW.nx + BW.az * BW.nz) - corridor);
          for (const q of [A, B]) if (q.length >= 3 && Math.abs(polyArea(q)) > 40) out.push(q);
        }
        pieces = out;
      }
      for (const p of pieces) {
        const area = Math.abs(polyArea(p));
        const [px, pz] = centroid(p);
        const kind = area < 900 && pieces.length > 1 ? 'plaza' : 'lots';
        S.blocks.push({ id: `b${i}_${k}_${S.blocks.length}`, district: 'island', poly: ccw(p), kind, walk: [W.walkStreet, W.walkAve], ai: i, k, rect: pieces.length === 1 && p.length === 4, cx: px, cz: pz, ground: H(px, pz) });
      }
    }
  }
  S.parks.push({ id: 'central', poly: [[PARK.x0, PARK.z0], [PARK.x1, PARK.z0], [PARK.x1, PARK.z1], [PARK.x0, PARK.z1]], kind: 'central' });
  {
    const D = PARK_DRIVE, pts = [];
    for (let i = 0; i <= 160; i++) { const a = (i / 160) * Math.PI * 2; pts.push([D.x + Math.cos(a) * D.rx * (1 + 0.04 * Math.sin(a * 3)), D.z + Math.sin(a) * D.rz]); }
    pts.pop();
    addRoad({ id: 'park_drive', name: 'Park Drive', type: 'street', cat: 'park', width: D.width, walk: 0, district: 'island', closed: true, pts });
    const R = rng(4711), paths = [];
    const edge = () => { const t = R(), side = Math.floor(R() * 4); return side === 0 ? [lerp(PARK.x0, PARK.x1, t), PARK.z0 + 2] : side === 1 ? [lerp(PARK.x0, PARK.x1, t), PARK.z1 - 2] : side === 2 ? [PARK.x0 + 2, lerp(PARK.z0, PARK.z1, t)] : [PARK.x1 - 2, lerp(PARK.z0, PARK.z1, t)]; };
    for (let k = 0; k < 14; k++) {
      const a = edge(), b = edge(), ctrl = [a];
      for (let q = 1; q < 4; q++) { const t = q / 4; let x = lerp(a[0], b[0], t) + (R() - 0.5) * 160, z = lerp(a[1], b[1], t) + (R() - 0.5) * 160; for (const P of PONDS) { const e = Math.hypot((x - P.x) / P.rx, (z - P.z) / P.rz); if (e < 1.25) { x = P.x + (x - P.x) * 1.3 / e; z = P.z + (z - P.z) * 1.3 / e; } } ctrl.push([Math.max(PARK.x1 + 3, Math.min(PARK.x0 - 3, x)) === x ? x : Math.min(Math.max(x, Math.min(PARK.x0, PARK.x1) + 3), Math.max(PARK.x0, PARK.x1) - 3), Math.min(Math.max(z, PARK.z0 + 3), PARK.z1 - 3)]); }
      ctrl.push(b);
      const pp = []; for (let i = 0; i < ctrl.length - 1; i++) for (let t = 0; t < 1; t += 0.05) { const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)], t2 = t * t, t3 = t2 * t; pp.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3))); }
      pp.push(b);
      paths.push(pp);
    }
    S.parkPaths = paths;
  }
  const xw = xs[xs.length - 1] + W.ave / 2, xe = xs[0] - W.ave / 2;
  S.waterfront.push({ id: 'wf_west', poly: ccw([[xw, ISLAND.z0], [ISLAND.x1, ISLAND.z0], [ISLAND.x1, ISLAND.z1], [xw, ISLAND.z1]]) });
  S.waterfront.push({ id: 'wf_east', poly: ccw([[ISLAND.x0, ISLAND.z0], [xe, ISLAND.z0], [xe, ISLAND.z1], [ISLAND.x0, ISLAND.z1]]) });
  S.waterfront.push({ id: 'wf_north', poly: ccw([[xe, zMax + streetWidth(STREET_N - 1) / 2], [xw, zMax + streetWidth(STREET_N - 1) / 2], [xw, ISLAND.z1], [xe, ISLAND.z1]]) });
  S.waterfront.push({ id: 'wf_south', poly: ccw([[xe, ISLAND.z0], [xw, ISLAND.z0], [xw, zMin - streetWidth(0) / 2], [xe, zMin - streetWidth(0) / 2]]) });

  const ring = roundedRect(RING.east, RING.south, RING.west, RING.north, RING.r);
  const ringR = addRoad({ id: 'ring', name: '88 Ring', kind: 'highway', type: 'elevated', cat: 'ring', width: RING.width, walk: 0, elevated: true, closed: true, district: 'island', pts: ring });
  {
    const n = ring.length, gy = ring.map(([x, z]) => H(x, z)), y = new Float64Array(n);
    for (let i = 0; i < n; i++) { let m = -1e9; for (let o = -30; o <= 30; o++) m = Math.max(m, gy[(i + o + n) % n]); y[i] = m + RING.deck; }
    for (let pass = 0; pass < 6; pass++) { const t = Float64Array.from(y); for (let i = 0; i < n; i++) { let s = 0; for (let o = -12; o <= 12; o++) s += t[(i + o + n) % n]; y[i] = Math.max(gy[i] + RING.deck - 0.5, s / 25); } }
    ringR.points = ring.map(([x, z], i) => [x, y[i], z]);
  }
  S.structures.push({ type: 'viaduct', id: 'ring', road: 'ring', width: RING.width, closed: true, barrier: 1.1, pillar: 38 });
  const ringY = (x, z) => { let best = 0, bd = 1e18; for (const p of ringR.points) { const d = (p[0] - x) ** 2 + (p[2] - z) ** 2; if (d < bd) { bd = d; best = p[1]; } } return best; };
  const inner = (side) => (side === 'east' ? RING.east + RING.width / 2 - 5 : side === 'west' ? RING.west - RING.width / 2 + 5 : RING.north - RING.width / 2 + 5);
  const ramps = [
    { id: 'ramp_sw', arc: { cx: -600, cz: 3180, r: 290, a0: Math.PI, a1: Math.PI / 2 } },
    { id: 'ramp_se', arc: { cx: -1200, cz: 3180, r: 290, a0: 0, a1: Math.PI / 2 } },
    { id: 'ramp_e1', along: 'east', z0: 4560, dir: 1 }, { id: 'ramp_e2', along: 'east', z0: 6600, dir: -1 },
    { id: 'ramp_w1', along: 'west', z0: 5600, dir: 1 }, { id: 'ramp_w2', along: 'west', z0: 7120, dir: -1 },
    { id: 'ramp_n1', along: 'north', x0: -1560, dir: 1 },
  ];
  for (const rp of ramps) {
    const pts = [];
    if (rp.arc) {
      const A = rp.arc, n = 60;
      for (let i = 0; i <= n; i++) { const a = A.a0 + (A.a1 - A.a0) * i / n; pts.push([A.cx + Math.cos(a) * A.r, A.cz + Math.sin(a) * A.r]); }
      const e = pts[pts.length - 1]; for (let i = 1; i <= 12; i++) pts.push([e[0] + (A.a0 === 0 ? -1 : 1) * i * 8, RING.south + (RING.width / 2 - 5)]);
    } else if (rp.along === 'east' || rp.along === 'west') {
      const xr = inner(rp.along), xg = rp.along === 'east' ? xs[0] - W.ave / 2 - 3 : xs[xs.length - 1] + W.ave / 2 + 3;
      for (let i = 0; i <= 50; i++) { const t = i / 50, e = smooth(0.55, 1, t); pts.push([lerp(xg, xr, e), rp.z0 + rp.dir * t * 360]); }
    } else {
      const zr = inner('north'), zg = zMax + streetWidth(STREET_N - 1) / 2 + 3;
      for (let i = 0; i <= 50; i++) { const t = i / 50, e = smooth(0.55, 1, t); pts.push([rp.x0 + rp.dir * t * 360, lerp(zg, zr, e)]); }
    }
    const r = addRoad({ id: rp.id, name: 'Ring ramp', type: 'ramp', cat: 'ramp', width: 10, walk: 0, elevated: true, district: 'island', pts });
    const last = pts[pts.length - 1], yTop = ringY(last[0], last[1]);
    r.points = pts.map(([x, z], i) => { const t = i / (pts.length - 1), g = H(x, z); return [x, Math.max(g + 0.02, lerp(g + 0.02, yTop, smooth(0.05, 0.8, t))), z]; });
    S.structures.push({ type: 'viaduct', id: rp.id, road: rp.id, width: 10, barrier: 1.0, pillar: 30, ramp: true });
  }

  for (const br of bridges) {
    const { B, dir, grade, gx0, gx1 } = br, z = B.z, deck = B.deck;
    const pts = sampleLine(gx0, z, gx1, z, 8);
    const r = addRoad({ id: B.id, name: B.name, kind: 'road', type: 'bridge', cat: 'bridge', width: B.width, walk: 3, elevated: true, district: 'island', pts, bridge: B.kind });
    const yAt = (x) => {
      const u = (x - B.x0) * dir, L = (B.x1 - B.x0) * dir;
      if (u >= 0 && u <= L) return deck + (B.kind.startsWith('suspension') ? 2.5 * Math.sin(Math.PI * u / L) : 0);
      if (u < 0) return Math.max(H(x, z) + 0.02, deck + u * grade);
      return Math.max(H(x, z) + 0.02, deck - (u - L) * grade);
    };
    const yy = pts.map(([x]) => yAt(x));
    for (let pass = 0; pass < 3; pass++) for (let i = 1; i < yy.length - 1; i++) yy[i] = Math.max(H(pts[i][0], z) + 0.02, (yy[i - 1] + yy[i] * 2 + yy[i + 1]) / 4);
    r.points = pts.map(([x, zz], i) => [x, yy[i], zz]);
    S.structures.push({ type: 'bridge', id: B.id, road: B.id, spec: B });
    S.reserved.push({ poly: ccw([[Math.min(gx0, gx1), z - B.width / 2 - 8], [Math.max(gx0, gx1), z - B.width / 2 - 8], [Math.max(gx0, gx1), z + B.width / 2 + 8], [Math.min(gx0, gx1), z + B.width / 2 + 8]]), kind: 'bridge' });
  }
  {
    const T = TUNNEL, pts = sampleLine(T.x0, T.z, T.x1, T.z, 8);
    const r = addRoad({ id: T.id, name: T.name, kind: 'road', type: 'tunnel', cat: 'tunnel', width: T.width, walk: 0, tunnel: true, district: 'island', pts });
    const g0 = H(T.x0, T.z), g1 = H(T.x1, T.z);
    r.points = pts.map(([x, z]) => { const y = Math.max(T.floor, g0 - (x - T.x0) * T.grade, g1 - (T.x1 - x) * T.grade); return [x, y, z]; });
    S.structures.push({ type: 'tunnel', id: T.id, road: T.id, spec: T });
    S.reserved.push({ poly: ccw([[T.x0 - 10, T.z - 16], [T.portal0 + 10, T.z - 16], [T.portal0 + 10, T.z + 16], [T.x0 - 10, T.z + 16]]), kind: 'trench' });
    S.reserved.push({ poly: ccw([[T.portal1 - 10, T.z - 16], [T.x1 + 10, T.z - 16], [T.x1 + 10, T.z + 16], [T.portal1 - 10, T.z + 16]]), kind: 'trench' });
  }
  for (const r of S.roads) if (r.elevated && r.type !== 'bridge') { const half = r.width / 2 + 3; for (let i = 0; i < r.pts.length - 1; i += 2) { const a = r.pts[i], b = r.pts[Math.min(r.pts.length - 1, i + 2)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = dz / l * half, nz = -dx / l * half; S.reserved.push({ poly: ccw([[a[0] - nx, a[1] - nz], [b[0] - nx, b[1] - nz], [b[0] + nx, b[1] + nz], [a[0] + nx, a[1] + nz]]), kind: 'elevated' }); } }

  boroughSkeleton(S, addRoad, addNode, H);
  portSkeleton(S, addRoad, addNode, H);
  airportSkeleton(S, addRoad, H);
  specials(S, addRoad, H);
  for (const r of S.roads) r.chunk = chunkOf(r.pts[0][0], r.pts[0][1]);
  return S;
}

function sliceRoad(r, inside) {
  const n = r.pts.length, out = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const inn = i < n && inside(r.pts[i][0], r.pts[i][1]);
    if (i < n && !inn && start < 0) start = i;
    if ((i === n || inn) && start >= 0) { if (i - start >= 2) out.push([start, i - 1]); start = -1; }
  }
  if (out.length === 1 && out[0][0] === 0 && out[0][1] === n - 1) return [r];
  return out.map(([a, b], k) => {
    const s0 = r.s[a], s1 = r.s[b];
    return { ...r, id: `${r.id}_${k}`, pts: r.pts.slice(a, b + 1), points: r.points.slice(a, b + 1), s: r.s.slice(a, b + 1).map((v) => v - s0), len: s1 - s0, segs: r.segs.map(([p, q]) => [Math.max(p, s0) - s0, Math.min(q, s1) - s0]).filter(([p, q]) => q - p > 1), signals: r.signals.filter((g) => g.s >= s0 && g.s <= s1).map((g) => ({ ...g, s: g.s - s0 })) };
  });
}

function blockAt(S, x, z) { let best = null, bd = Infinity; for (const b of S.blocks) { if (b.kind !== 'lots') continue; if (inPoly(x, z, b.poly)) return b; const d = Math.hypot(b.cx - x, b.cz - z); if (d < bd) { bd = d; best = b; } } return best; }

function cornerSite(blk, x, z, w, d, inset = 0) {
  const p = blk.poly, n = p.length;
  let ci = 0, cd = Infinity;
  p.forEach((q, i) => { const dd = Math.hypot(q[0] - x, q[1] - z); if (dd < cd) { cd = dd; ci = i; } });
  const c = p[ci], a = p[(ci + 1) % n], b = p[(ci - 1 + n) % n];
  const ua = [a[0] - c[0], a[1] - c[1]], ub = [b[0] - c[0], b[1] - c[1]], la = Math.hypot(...ua), lb = Math.hypot(...ub);
  ua[0] /= la; ua[1] /= la; ub[0] /= lb; ub[1] /= lb;
  const W1 = Math.min(w, la - 2 * inset), D1 = Math.min(d, lb - 2 * inset);
  const o = [c[0] + (ua[0] + ub[0]) * inset, c[1] + (ua[1] + ub[1]) * inset];
  const fp = [o, [o[0] + ua[0] * W1, o[1] + ua[1] * W1], [o[0] + ua[0] * W1 + ub[0] * D1, o[1] + ua[1] * W1 + ub[1] * D1], [o[0] + ub[0] * D1, o[1] + ub[1] * D1]];
  return { fp: ccw(fp), yaw: Math.atan2(ua[0], ua[1]), ua, ub, w: W1, d: D1, corner: c };
}

function boroughSkeleton(S, addRoad, addNode, H) {
  const B = BOROUGH, land = B.land;
  const lp = land.map(([x, z]) => worldToBorough(x, z));
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const [u, v] of lp) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const us = [], vs = [];
  for (let u = Math.floor(u0 / B.ave) * B.ave; u <= u1; u += B.ave) us.push(u);
  for (let v = Math.floor(v0 / B.street) * B.street; v <= v1; v += B.street) vs.push(v);
  const aw = 20, sw = 13;
  const clipLine = (a, b) => {
    let t0 = 0, t1 = 1;
    const c = land;
    for (let i = 0; i < c.length; i++) {
      const p = c[i], q = c[(i + 1) % c.length], ex = q[0] - p[0], ez = q[1] - p[1], nx = -ez, nz = ex;
      const da = (a[0] - p[0]) * nx + (a[1] - p[1]) * nz, db = (b[0] - p[0]) * nx + (b[1] - p[1]) * nz;
      const sgn = polyArea(c) > 0 ? 1 : -1;
      const fa = da * sgn, fb = db * sgn;
      if (fa > 0 && fb > 0) return null;
      if (fa > 0 || fb > 0) { const t = fa / (fa - fb); if (fa > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); }
    }
    return t1 - t0 > 0.02 ? [t0, t1] : null;
  };
  const st = S.stadium || { x: -4400, z: 4500, rx: 150, rz: 115, yaw: 0.2 };
  const inStadium = (x, z) => { const [u, v] = [x - st.x, z - st.z], c = Math.cos(st.yaw), s = Math.sin(st.yaw), a = u * c + v * s, b = -u * s + v * c; return (a / (st.rx + 40)) ** 2 + (b / (st.rz + 40)) ** 2 < 1; };
  const bridgeLand = BRIDGES.filter((b) => b.x1 < -2900).map((b) => ({ z: b.z, x0: b.x1, x1: b.x1 - (b.deck - 5) / 0.055 - 30 }));
  const inBridge = (x, z) => bridgeLand.some((b) => Math.abs(z - b.z) < 22 && x < b.x0 + 5 && x > b.x1);
  const mk = (id, name, a, b, w, axis, cat) => {
    const r = clipLine(a, b); if (!r) return [];
    const [t0, t1] = r, A = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], Bp = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
    const road = { id, name, type: 'street', cat, width: w, walk: 4, axis, district: 'borough', pts: sampleLine(A[0], A[1], Bp[0], Bp[1]), city: true, kind: 'road' };
    road.points = road.pts.map(([x, z]) => [x, H(x, z), z]); road.s = arcLen(road.pts); road.len = road.s[road.s.length - 1]; road.signals = []; road.segs = [[0, road.len]];
    return sliceRoad(road, (x, z) => inStadium(x, z) || inBridge(x, z));
  };
  const roads = [];
  us.forEach((u, i) => { for (const r of mk(`bave_${i}`, `Borough Avenue ${i + 1}`, boroughToWorld(u, v0 - 50), boroughToWorld(u, v1 + 50), aw, 0, 'avenue')) roads.push(r); });
  vs.forEach((v, i) => { for (const r of mk(`bst_${i}`, `${i + 1} Borough Street`, boroughToWorld(u0 - 50, v), boroughToWorld(u1 + 50, v), sw, 1, 'street')) roads.push(r); });
  for (const r of roads) {
    const cuts = [];
    for (const o of roads) {
      if (o.axis === r.axis) continue;
      const a = r.pts[0], b = r.pts[r.pts.length - 1], c = o.pts[0], d = o.pts[o.pts.length - 1];
      const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]); if (Math.abs(den) < 1e-6) continue;
      const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den, s = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
      if (t < -0.001 || t > 1.001 || s < -0.001 || s > 1.001) continue;
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, sAt = t * r.len;
      const sig = Math.round(worldToBorough(x, z)[1] / B.street) % 2 === 0;
      const n = addNode(x, z, sig);
      if (n.signal) r.signals.push({ s: sAt, id: n.signal.id, axis: r.axis, half: o.width / 2 });
      cuts.push([sAt - o.width / 2, sAt + o.width / 2]);
    }
    cuts.sort((p, q) => p[0] - q[0]);
    r.segs = []; let prev = 0;
    for (const [c0, c1] of cuts) { if (c0 > prev) r.segs.push([prev, c0]); prev = Math.max(prev, c1); }
    if (prev < r.len) r.segs.push([prev, r.len]);
    S.roads.push(r);
  }
  for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) {
    const ua = us[i] + aw / 2, ub = us[i + 1] - aw / 2, va = vs[j] + sw / 2, vb = vs[j + 1] - sw / 2;
    const poly = [[ua, va], [ub, va], [ub, vb], [ua, vb]].map(([u, v]) => boroughToWorld(u, v));
    const cl = clipConvex(poly, land);
    if (cl.length < 3) continue;
    const area = Math.abs(polyArea(cl));
    if (area < 600) continue;
    const [cx, cz] = centroid(cl);
    const stad = inStadium(cx, cz);
    S.blocks.push({ id: `bb${i}_${j}`, district: 'borough', poly: ccw(cl), kind: stad ? 'stadium' : 'lots', walk: [4, 4], rect: area > 0.97 * (ub - ua) * (vb - va), local: { ua, ub, va, vb }, cx, cz, ground: H(cx, cz) });
  }
  for (const b of bridgeLand) S.reserved.push({ poly: ccw([[b.x1, b.z - 22], [b.x0 + 5, b.z - 22], [b.x0 + 5, b.z + 22], [b.x1, b.z + 22]]), kind: 'bridge' });
}

function portSkeleton(S, addRoad, addNode, H) {
  const X = PORT.road;
  const r1 = addRoad({ id: 'port_main', name: 'Port Road', type: 'street', cat: 'avenue', width: 18, walk: 3, district: 'port', pts: sampleLine(X, 5990, X, 7560) });
  const r2 = addRoad({ id: 'port_cross', name: 'Terminal Road', type: 'street', cat: 'avenue', width: 18, walk: 3, district: 'port', pts: sampleLine(TUNNEL.x1, TUNNEL.z, 4200, TUNNEL.z) });
  const r3 = addRoad({ id: 'port_back', name: 'Quay Road', type: 'street', cat: 'street', width: 14, walk: 2, district: 'port', pts: sampleLine(X, 7000, 4200, 7000) });
  const n1 = addNode(X, TUNNEL.z, true), n2 = addNode(X, 7000, true);
  r1.signals.push({ s: TUNNEL.z - 5990, id: n1.signal.id, axis: 0, half: 9 }, { s: 7000 - 5990, id: n2.signal.id, axis: 0, half: 7 });
  r2.signals.push({ s: X - TUNNEL.x1, id: n1.signal.id, axis: 1, half: 9 });
  r3.signals.push({ s: 0, id: n2.signal.id, axis: 1, half: 9 });
  r1.segs = [[0, TUNNEL.z - 9 - 5990], [TUNNEL.z + 9 - 5990, 7000 - 7 - 5990], [7000 + 7 - 5990, r1.len]];
  r2.segs = [[0, X - 9 - TUNNEL.x1], [X + 9 - TUNNEL.x1, r2.len]];
  r3.segs = [[9, r3.len]];
  S.blocks.push({ id: 'port_yard', district: 'port', poly: ccw([[X + 12, 7010], [4200, 7010], [4200, 7600], [X + 12, 7600]]), kind: 'container', cx: 3050, cz: 7300 });
  S.blocks.push({ id: 'port_ware', district: 'port', poly: ccw([[X + 12, 6372], [4200, 6372], [4200, 6990], [X + 12, 6990]]), kind: 'warehouse', cx: 3050, cz: 6680 });
  S.blocks.push({ id: 'port_tanks', district: 'port', poly: ccw([[X + 12, 5995], [3400, 5995], [3400, 6348], [X + 12, 6348]]), kind: 'tanks', cx: 2650, cz: 6170 });
  S.blocks.push({ id: 'port_quay', district: 'port', poly: ccw([[1450, 6000], [X - 12, 6000], [X - 12, 7600], [1450, 7600]]), kind: 'quay', cx: 1670, cz: 6800 });
  S.structures.push({ type: 'cranes', id: 'port_cranes', quay: { x0: X + 80, x1: 4150, z: 7596 }, quay2: { x: 1500, z0: 6480, z1: 7520 }, n: 10 });
  S.structures.push({ type: 'ship', id: 'ship1', x: 2900, z: 7660, yaw: Math.PI / 2, len: 250 });
  S.structures.push({ type: 'ship', id: 'ship2', x: 1440, z: 6980, yaw: 0, len: 200 });
}

function airportSkeleton(S, addRoad, H) {
  const A = AIRPORT, rw = A.runway;
  const r = addRoad({ id: 'runway', name: 'Runway 09/27', type: 'runway', cat: 'runway', width: rw.w, walk: 0, district: 'airport', pts: sampleLine(rw.x0, rw.z, rw.x1, rw.z, 16) });
  r.segs = [[0, r.len]];
  const t = addRoad({ id: 'taxiway', name: 'Taxiway A', type: 'taxiway', cat: 'taxiway', width: A.taxi.w, walk: 0, district: 'airport', pts: sampleLine(rw.x0 + 150, A.taxi.z, rw.x1 - 150, A.taxi.z, 16) });
  t.segs = [[0, t.len]];
  for (const x of [rw.x0 + 150, -6600, -5900, -5200, rw.x1 - 150]) { const c = addRoad({ id: `taxi_${x}`, name: 'Taxiway link', type: 'taxiway', cat: 'taxiway', width: 24, walk: 0, district: 'airport', pts: sampleLine(x, A.taxi.z + 12, x, rw.z - rw.w / 2, 8) }); c.segs = [[0, c.len]]; }
  for (const x of [-6600, -5900, -5200]) { const c = addRoad({ id: `apron_${x}`, name: 'Apron link', type: 'taxiway', cat: 'taxiway', width: 24, walk: 0, district: 'airport', pts: sampleLine(x, A.apron.z1, x, A.taxi.z - 12, 8) }); c.segs = [[0, c.len]]; }
  const ac = addRoad({ id: 'airport_road', name: 'Airport Road', type: 'street', cat: 'avenue', width: 18, walk: 3, district: 'airport', pts: sampleLine(-3600, 6420, -6900, 6420) });
  ac.segs = [[0, ac.len]];
  S.blocks.push({ id: 'apron', district: 'airport', poly: ccw([[A.apron.x0, A.apron.z0], [A.apron.x1, A.apron.z0], [A.apron.x1, A.apron.z1], [A.apron.x0, A.apron.z1]]), kind: 'apron', cx: (A.apron.x0 + A.apron.x1) / 2, cz: (A.apron.z0 + A.apron.z1) / 2 });
  S.structures.push({ type: 'airport', id: 'airport', spec: A });
}

function specials(S, addRoad, H) {
  const site = (id, x, z, w, d, extra = {}) => { const blk = blockAt(S, x, z); if (!blk) return null; const c = cornerSite(blk, x, z, w, d, 0.5); S.reserved.push({ poly: c.fp, kind: id }); return { id, block: blk.id, ...c, x: centroid(c.fp)[0], z: centroid(c.fp)[1], ...extra }; };
  S.gas = [[-2330, 3740], [270, 6000], [-1550, 4120], [-3700, 4300], [-5600, 5600], [-4100, 3800], [-6000, 6000]].map(([x, z], i) => site(`gas_${i}`, x, z, 42, 32)).filter(Boolean);
  S.gas.push({ id: 'gas_hw', fp: ccw([[-880, 3150], [-835, 3150], [-835, 3195], [-880, 3195]]), x: -857, z: 3172, yaw: 0, ua: [0, 1], ub: [1, 0], w: 45, d: 45 });
  S.reserved.push({ poly: S.gas[S.gas.length - 1].fp, kind: 'gas' });
  S.garages = [[-510, 6600, 'Midtown Garage', 7], [-1810, 7200, 'Downtown Garage', 9], [-2070, 4040, 'Uptown Garage', 5], [-5000, 5200, 'Borough Garage', 6]].map(([x, z, name, levels], i) => site(`garage_${i}`, x, z, 72, 50, { name, levels })).filter(Boolean);
  S.stadium = { id: 'stadium', x: -4400, z: 4500, rx: 150, rz: 115, yaw: 0.2, h: 42, name: 'Borough Stadium' };
  S.jumps = [
    { id: 'jump_lot1', x: -1550, z: 3840, yaw: 0, w: 10, l: 18, h: 3.2 },
    { id: 'jump_lot2', x: -250, z: 7160, yaw: Math.PI / 2, w: 12, l: 22, h: 4.2 },
    { id: 'jump_pier', x: 470, z: 6000, yaw: -Math.PI / 2, w: 10, l: 20, h: 3.6 },
    { id: 'jump_borough', x: -5200, z: 4100, yaw: 0.2, w: 12, l: 24, h: 5 },
    { id: 'jump_port', x: 3300, z: 6680, yaw: 0, w: 14, l: 28, h: 6 },
    { id: 'jump_air', x: -7600, z: 6900, yaw: Math.PI / 2, w: 16, l: 30, h: 7 },
  ];
  for (const j of S.jumps) S.reserved.push({ poly: ccw([[j.x - 25, j.z - 25], [j.x + 25, j.z - 25], [j.x + 25, j.z + 25], [j.x - 25, j.z + 25]]), kind: 'jump' });
}

const ZONES = [
  { id: 'downtown', test: (x, z) => z > 6900, base: [28, 70], tower: 0.42, towerH: [90, 1.0], styles: ['glass', 'glass', 'postmodern', 'deco', 'modernist', 'stone'] },
  { id: 'flatiron', test: (x, z) => z > 6720 && z <= 6900, base: [22, 50], tower: 0.12, towerH: [70, 0.45], styles: ['stone', 'stone', 'brick', 'deco', 'modernist'] },
  { id: 'midtown', test: (x, z) => z > 5960 && z <= 6720, base: [30, 80], tower: 0.5, towerH: [110, 0.95], styles: ['glass', 'modernist', 'deco', 'stone', 'postmodern', 'glass'] },
  { id: 'parkrow', test: (x, z) => z > 4200 && z <= 6120 && (Math.abs(x - (PARK.x0 - W.ave / 2)) < 140 || Math.abs(x - (PARK.x1 + W.ave / 2)) < 140), base: [30, 60], tower: 0.22, towerH: [100, 0.6], styles: ['stone', 'stone', 'deco', 'residential', 'concrete'] },
  { id: 'heights', test: (x, z) => x > HEIGHTS.x0 && z > HEIGHTS.z0 && z < HEIGHTS.z1, base: [16, 34], tower: 0.06, towerH: [55, 0.25], styles: ['stone', 'brick', 'brick', 'residential'] },
  { id: 'eastside', test: (x, z) => x < -1940 && z > 4200 && z <= 5960, base: [20, 50], tower: 0.2, towerH: [70, 0.5], styles: ['concrete', 'brick', 'residential', 'stone', 'glass'] },
  { id: 'westside', test: (x, z) => x > -1160 && z > 4200 && z <= 5960, base: [20, 45], tower: 0.16, towerH: [70, 0.45], styles: ['stone', 'brick', 'residential', 'concrete'] },
  { id: 'uptown', test: (x, z) => z <= 4200, base: [14, 26], tower: 0.05, towerH: [50, 0.2], styles: ['brick', 'brick', 'brick', 'stone', 'concrete'] },
];
const BZONES = [
  { id: 'bdown', test: (x, z) => x > -4000 && z > 5300, base: [16, 42], tower: 0.14, towerH: [70, 0.45], styles: ['brick', 'glass', 'concrete', 'stone', 'residential'] },
  { id: 'bmid', test: (x, z) => x > -5200, base: [10, 20], tower: 0.03, towerH: [40, 0.18], styles: ['brick', 'brick', 'stone', 'brick', 'residential'] },
  { id: 'bout', test: () => true, base: [8, 14], tower: 0.015, towerH: [30, 0.12], styles: ['brick', 'brick', 'residential', 'wood'] },
];

const LANDMARKS = [
  { id: 'gzowo_center', name: 'One Gzowo Center', x: -510, z: 7280, w: 64, kind: 'supertall_glass', hk: 1.0 },
  { id: 'empire', name: 'Empire Tower', x: -770, z: 6480, w: 66, kind: 'deco_empire', hk: 0.82 },
  { id: 'chrysler', name: 'Crown Building', x: -1290, z: 6640, w: 48, kind: 'deco_crown', hk: 0.66 },
  { id: 'needle1', name: 'Park Needle', x: -1030, z: 6080, w: 32, kind: 'pencil', hk: 0.94 },
  { id: 'needle2', name: 'Central Tower', x: -1550, z: 6080, w: 40, kind: 'pencil', hk: 0.9 },
  { id: 'twin1', name: 'River Twins North', x: -2330, z: 7280, w: 52, kind: 'glass_box', hk: 0.72 },
  { id: 'twin2', name: 'River Twins South', x: -2330, z: 7200, w: 52, kind: 'glass_box', hk: 0.72 },
  { id: 'citicorp', name: 'Slant Tower', x: -1030, z: 6320, w: 46, kind: 'slant', hk: 0.6 },
];

export function zoneOf(district, x, z) {
  const list = district === 'borough' ? BZONES : ZONES;
  for (const Z of list) if (Z.test(x, z)) return Z;
  return list[list.length - 1];
}

const STYLE_SET = {
  frontier: { allow: ['wood'], maxH: 14, region: (x, z, d) => d === 'island' && z > 6950, density: 0.6 },
  early: { allow: ['brick', 'stone', 'deco', 'wood'], swap: { glass: 'deco', modernist: 'stone', concrete: 'brick', postmodern: 'stone', residential: 'brick' }, maxH: 320 },
  mid: { allow: ['brick', 'stone', 'deco', 'modernist', 'concrete', 'postmodern', 'residential'], swap: { glass: 'modernist' }, maxH: 450 },
  modern: { allow: null, maxH: 560 },
  future: { allow: null, swap: { brick: 'residential', stone: 'future', deco: 'future', modernist: 'glass', concrete: 'future', postmodern: 'glass', wood: 'residential' }, maxH: 1200 },
  ruins: { allow: null, maxH: 560 },
  scifi: { allow: ['scifi', 'future'], swap: { brick: 'scifi', stone: 'scifi', deco: 'scifi', modernist: 'future', concrete: 'scifi', glass: 'future', postmodern: 'scifi', residential: 'scifi', wood: 'scifi' }, maxH: 2000 },
};

const PALETTE = {
  brick: [[0.36, 0.14, 0.09], [0.42, 0.2, 0.13], [0.3, 0.12, 0.08], [0.46, 0.3, 0.22], [0.5, 0.36, 0.26], [0.26, 0.1, 0.07], [0.55, 0.45, 0.36]],
  stone: [[0.5, 0.46, 0.39], [0.56, 0.52, 0.45], [0.44, 0.41, 0.37], [0.53, 0.47, 0.37], [0.4, 0.38, 0.35], [0.58, 0.56, 0.52], [0.36, 0.3, 0.26]],
  deco: [[0.54, 0.5, 0.44], [0.47, 0.44, 0.4], [0.38, 0.35, 0.32], [0.58, 0.56, 0.52], [0.42, 0.33, 0.27]],
  modernist: [[0.55, 0.57, 0.6], [0.3, 0.32, 0.35], [0.7, 0.7, 0.68], [0.18, 0.19, 0.2]],
  concrete: [[0.48, 0.47, 0.44], [0.42, 0.41, 0.39], [0.54, 0.52, 0.49], [0.36, 0.35, 0.33]],
  glass: [[0.05, 0.08, 0.1], [0.06, 0.09, 0.08], [0.09, 0.1, 0.12], [0.04, 0.05, 0.07], [0.1, 0.12, 0.13]],
  postmodern: [[0.5, 0.36, 0.3], [0.62, 0.55, 0.5], [0.35, 0.33, 0.33], [0.6, 0.48, 0.38]],
  wood: [[0.42, 0.32, 0.22], [0.55, 0.48, 0.38], [0.3, 0.22, 0.15], [0.6, 0.6, 0.55]],
  metal: [[0.5, 0.52, 0.54], [0.38, 0.42, 0.44], [0.6, 0.3, 0.2], [0.25, 0.38, 0.5]],
  future: [[0.82, 0.84, 0.85], [0.7, 0.74, 0.76], [0.9, 0.9, 0.88], [0.3, 0.36, 0.38]],
  scifi: [[0.92, 0.93, 0.94], [0.85, 0.87, 0.9], [0.95, 0.94, 0.92]],
  residential: [[0.6, 0.58, 0.54], [0.42, 0.42, 0.42], [0.52, 0.42, 0.35], [0.66, 0.64, 0.6], [0.45, 0.32, 0.26]],
};

function facadeParams(style, R, h) {
  const pick = (a) => a[Math.floor(R() * a.length)];
  const c = pick(PALETTE[style] || PALETTE.concrete).map((v) => v * (0.9 + R() * 0.2));
  const P = { style, color: c, floorH: 3.2, bayW: 3.0, winW: 0.5, winH: 0.55, ground: 4.6, lit: 0.35 + R() * 0.3, glass: R() };
  switch (style) {
    case 'brick': P.floorH = 3.1 + R() * 0.4; P.bayW = 2.4 + R() * 1.4; P.winW = 0.42 + R() * 0.16; P.winH = 0.52 + R() * 0.12; P.ground = 4.0; break;
    case 'stone': P.floorH = 3.4 + R() * 0.4; P.bayW = 2.6 + R() * 1.2; P.winW = 0.4 + R() * 0.15; P.winH = 0.5 + R() * 0.12; P.ground = 5.2; break;
    case 'deco': P.floorH = 3.6; P.bayW = 1.8 + R() * 0.8; P.winW = 0.5; P.winH = 0.62; P.ground = 6; break;
    case 'modernist': P.floorH = 3.7; P.bayW = 1.5 + R() * 0.6; P.winW = 0.86; P.winH = 0.7; P.ground = 6; break;
    case 'concrete': P.floorH = 3.0; P.bayW = 3 + R() * 2; P.winW = 0.62 + R() * 0.25; P.winH = 0.45 + R() * 0.1; P.ground = 4.5; break;
    case 'glass': P.floorH = 3.9 + R() * 0.4; P.bayW = 1.5 + R() * 0.5; P.winW = 0.94; P.winH = 0.84; P.ground = 7; break;
    case 'postmodern': P.floorH = 3.8; P.bayW = 2.2 + R(); P.winW = 0.55; P.winH = 0.6; P.ground = 7; break;
    case 'wood': P.floorH = 3.2; P.bayW = 2.6; P.winW = 0.36; P.winH = 0.5; P.ground = 3.4; break;
    case 'future': P.floorH = 4.2; P.bayW = 2.2; P.winW = 0.9; P.winH = 0.8; P.ground = 8; break;
    case 'scifi': P.floorH = 5; P.bayW = 4; P.winW = 0.2; P.winH = 0.12; P.ground = 10; break;
    case 'residential': P.floorH = 3.0; P.bayW = 3.4 + R(); P.winW = 0.58; P.winH = 0.56; P.ground = 4.5; break;
    case 'metal': P.floorH = 4; P.bayW = 6; P.winW = 0.1; P.winH = 0.1; P.ground = 5; break;
  }
  return P;
}

function makeBuilding(list, ctx, fp, h, style, R, extra = {}) {
  const { heightAt, styleKey, maxH, setStyle } = ctx;
  if (fp.length < 3) return null;
  let s = setStyle(style);
  h = Math.min(h, maxH);
  if (h < 4) return null;
  let y0 = Infinity, y1 = -Infinity;
  for (const [x, z] of fp) { const g = heightAt(x, z); y0 = Math.min(y0, g); y1 = Math.max(y1, g); }
  const base = y0 - 0.6;
  const P = facadeParams(s, R, h);
  const [cx, cz] = centroid(fp);
  const b = { id: list.length, fp: ccw(fp), y0: base, ground: y1, h: h + (y1 - y0), top: y1 + h, style: s, P, roof: 'flat', seed: Math.floor(R() * 1e6), chunk: chunkOf(cx, cz), cx, cz, tiers: null, ...extra };
  const area = Math.abs(polyArea(fp));
  if (h > 100 && (s === 'glass' || s === 'future' || s === 'postmodern') && fp.length === 4 && R() < 0.35) {
    const c = Math.min(8, Math.sqrt(area) * 0.15), out = [];
    for (let i = 0; i < 4; i++) { const a = b.fp[(i + 3) % 4], p = b.fp[i], q = b.fp[(i + 1) % 4], la = Math.hypot(a[0] - p[0], a[1] - p[1]), lq = Math.hypot(q[0] - p[0], q[1] - p[1]); out.push([p[0] + (a[0] - p[0]) * c / la, p[1] + (a[1] - p[1]) * c / la], [p[0] + (q[0] - p[0]) * c / lq, p[1] + (q[1] - p[1]) * c / lq]); }
    b.fp = ccw(out);
  }
  if (h > 70 && !extra.noTiers) {
    const tiers = [];
    const deco = s === 'deco' || s === 'stone' || s === 'postmodern';
    const nT = deco ? 2 + Math.floor(R() * 3) : s === 'glass' || s === 'future' ? (R() < 0.45 ? 1 : 0) : R() < 0.5 ? 1 : 0;
    let cur = b.fp, yb = base, budget = b.top;
    const podium = deco ? lerp(0.25, 0.45, R()) : lerp(0.12, 0.3, R());
    let yy = y1 + h * podium;
    for (let t = 0; t < nT; t++) {
      tiers.push({ fp: cur, y0: yb, y1: yy });
      const next = insetPoly(cur, deco ? 2.5 + R() * 4 : 3 + R() * 5);
      if (Math.abs(polyArea(next)) < Math.max(140, area * 0.15)) break;
      cur = next; yb = yy; yy = yy + (budget - yy) * lerp(0.35, 0.65, R());
    }
    tiers.push({ fp: cur, y0: yb, y1: budget });
    b.tiers = tiers;
  }
  const r = R();
  if (s === 'brick' && h < 70 && r < 0.5) b.roof = 'water';
  else if ((s === 'glass' || s === 'future' || s === 'postmodern') && h > 120 && r < 0.3 && area > 600) b.roof = 'helipad';
  else if (s === 'deco' && h > 100) b.roof = r < 0.5 ? 'crown' : 'spire';
  else if (h > 160 && r < 0.4) b.roof = 'antenna';
  else if (s === 'wood') b.roof = r < 0.5 ? 'gable' : 'falsefront';
  else if (s === 'scifi') b.roof = 'dome';
  else b.roof = r < 0.6 ? 'clutter' : 'flat';
  list.push(b);
  return b;
}

function rectLots(block, local, R, zone, opts) {
  const { ua, ub, va, vb } = local;
  const walkL = opts.walkLong, walkS = opts.walkShort;
  const u0 = ua + walkS, u1 = ub - walkS, v0 = va + walkL, v1 = vb - walkL;
  const lots = [], L = u1 - u0, D = v1 - v0;
  if (L < 8 || D < 8) return lots;
  const end = Math.min(L / 2, opts.end || (18 + R() * 16));
  const towerP = zone.tower;
  const push = (a, b, c, d, tag) => lots.push({ u0: a, u1: b, v0: c, v1: d, tag });
  if (R() < towerP && L > 60) {
    const tw = Math.min(L, 40 + R() * 50), tu = u0 + R() * (L - tw);
    push(tu, tu + tw, v0, v1, 'tower');
    const rest = (a, b) => { let u = a; while (b - u > 7) { const w = Math.min(b - u, 8 + R() * 16); const half = R() < 0.7; if (half && D > 30) { push(u, u + w, v0, v0 + D / 2 - 1, 'row'); push(u, u + w, v0 + D / 2 + 1, v1, 'row'); } else push(u, u + w, v0, v1, 'row'); u += w; } };
    rest(u0, tu); rest(tu + tw, u1);
    return lots;
  }
  push(u0, u0 + end, v0, v1, 'corner');
  push(u1 - end, u1, v0, v1, 'corner');
  let u = u0 + end;
  const rowW = opts.rowW || [7.6, 15];
  while (u1 - end - u > 6) {
    const w = Math.min(u1 - end - u, rowW[0] + R() * (rowW[1] - rowW[0]));
    if (D > 34) { const gap = 1 + R() * 4; push(u, u + w, v0, v0 + D / 2 - gap, 'row'); push(u, u + w, v0 + D / 2 + gap, v1, 'row'); }
    else push(u, u + w, v0, v1, 'row');
    u += w;
  }
  return lots;
}

function bspLots(poly, R, target) {
  const out = [];
  const rec = (p, depth) => {
    const area = Math.abs(polyArea(p));
    if (area < target * (0.7 + R() * 0.8) || depth > 9) { out.push(p); return; }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const alongX = x1 - x0 > z1 - z0, t = 0.35 + R() * 0.3;
    const [A, B] = alongX ? splitPoly(p, x0 + (x1 - x0) * t, 0, 1, 0) : splitPoly(p, 0, z0 + (z1 - z0) * t, 0, 1);
    for (const q of [A, B]) if (q.length >= 3 && Math.abs(polyArea(q)) > 30) rec(q, depth + 1);
  };
  rec(poly, 0);
  return out;
}

export function buildPlan(opts) {
  const it = planSteps(opts);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

export function* planSteps(opts) {
  const { heightAt } = opts;
  const style = STYLES.includes(opts.style) ? opts.style : 'modern';
  const S = opts.skeleton || buildSkeleton(heightAt);
  const density = clamp(opts.density === undefined ? 1 : opts.density, 0, 1);
  const tallest = opts.height || 460;
  const set = STYLE_SET[style] || STYLE_SET.modern;
  const maxH = Math.min(set.maxH, tallest);
  const hk = tallest / 460;
  const plan = { style, density, height: tallest, year: opts.year || null, skeleton: S, roads: S.roads, buildings: [], blocks: S.blocks, landmarks: [], lots: 0, props: [], trees: [], structures: S.structures, sites: [] };
  if (style === 'none') { plan.roads = []; return plan; }
  const setStyle = (s) => { if (set.swap && set.swap[s]) s = set.swap[s]; if (set.allow && !set.allow.includes(s)) s = set.allow[0]; return s; };
  const ctx = { heightAt, styleKey: style, maxH, setStyle };
  const grid = new Map(), GC = 128;
  for (const r of S.reserved) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of r.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    r.box = [x0, z0, x1, z1];
    for (let i = Math.floor(x0 / GC); i <= Math.floor(x1 / GC); i++) for (let j = Math.floor(z0 / GC); j <= Math.floor(z1 / GC); j++) { const k = i * 100000 + j; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(r); }
  }
  const blocked = (fp) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of fp) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const seen = new Set();
    for (let i = Math.floor(x0 / GC); i <= Math.floor(x1 / GC); i++) for (let j = Math.floor(z0 / GC); j <= Math.floor(z1 / GC); j++) {
      for (const r of grid.get(i * 100000 + j) || []) {
        if (seen.has(r)) continue; seen.add(r);
        const b = r.box; if (b[0] > x1 || b[2] < x0 || b[1] > z1 || b[3] < z0) continue;
        const p = r.poly; const [cx, cz] = centroid(fp);
        if (inPoly(cx, cz, p)) return true;
        for (const q of fp) if (inPoly(q[0], q[1], p)) return true;
        for (const q of p) if (inPoly(q[0], q[1], fp)) return true;
      }
    }
    return false;
  };
  for (const L of LANDMARKS) {
    if (style === 'frontier' || style === 'scifi') break;
    if (style === 'early' && (L.kind === 'supertall_glass' || L.kind === 'pencil' || L.kind === 'glass_box' || L.kind === 'slant')) continue;
    if (style === 'mid' && (L.kind === 'pencil')) continue;
    plan.landmarks.push(L);
  }
  const lmBlock = (blk) => plan.landmarks.find((L) => L.w && Math.abs(blk.cx - L.x) < 60 && Math.abs(blk.cz - L.z) < 30);
  let nb = 0;
  for (const blk of S.blocks) {
    if (++nb % 24 === 0) yield nb / S.blocks.length;
    const R = rng(hashStr(blk.id + style));
    if (set.region && !set.region(blk.cx, blk.cz, blk.district)) continue;
    if (blk.kind === 'plaza' || blk.kind === 'bluff') continue;
    if (blk.district === 'port' || blk.district === 'airport') continue;
    const zone = zoneOf(blk.district, blk.cx, blk.cz);
    const zdens = set.density ? set.density : 1;
    const lm = blk.district === 'island' ? lmBlock(blk) : null;
    let lots;
    if (blk.district === 'island' && blk.rect) {
      const [p0, , p2] = blk.poly.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of blk.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const walkS = Math.max(aveWalk(AVE_X.find((a) => Math.abs(a - (x0 - W.ave / 2)) < 20) ?? 0), W.walkAve);
      lots = rectLots(blk, { ua: x0, ub: x1, va: z0, vb: z1 }, R, lm ? { tower: 0 } : zone, { walkLong: W.walkStreet, walkShort: walkS, rowW: zone.id === 'uptown' || zone.id === 'heights' ? [7, 13] : [8, 18] }).map((l) => ({ fp: [[l.u0, l.v0], [l.u1, l.v0], [l.u1, l.v1], [l.u0, l.v1]], tag: l.tag }));
      if (lm) {
        const lx0 = lm.x - lm.w / 2, lx1 = lm.x + lm.w / 2;
        lots = lots.filter((l) => { const [cx] = centroid(l.fp); return cx < lx0 - 6 || cx > lx1 + 6; });
        lots.push({ fp: [[lx0, z0 + W.walkStreet], [lx1, z0 + W.walkStreet], [lx1, z1 - W.walkStreet], [lx0, z1 - W.walkStreet]], tag: 'landmark', lm });
      }
    } else if (blk.district === 'borough' && blk.rect && blk.local) {
      const { ua, ub, va, vb } = blk.local;
      lots = rectLots(blk, { ua, ub, va, vb }, R, zone, { walkLong: 4, walkShort: 4, rowW: [6.5, 11], end: 12 + R() * 8 }).map((l) => ({ fp: [[l.u0, l.v0], [l.u1, l.v0], [l.u1, l.v1], [l.u0, l.v1]].map(([u, v]) => boroughToWorld(u, v)), tag: l.tag }));
    } else {
      const inner = insetPoly(blk.poly, blk.district === 'island' ? 5 : 4);
      if (Math.abs(polyArea(inner)) < 60) continue;
      const area = Math.abs(polyArea(inner));
      lots = area < 1800 ? [{ fp: inner, tag: 'wedge' }] : bspLots(inner, R, zone.id === 'uptown' || blk.district === 'borough' ? 500 : 1100).map((p) => ({ fp: p, tag: 'bsp' }));
    }
    for (const lot of lots) {
      plan.lots++;
      if (lot.tag !== 'landmark' && R() > density * zdens + 0.02) continue;
      if (blocked(lot.fp)) continue;
      const [cx, cz] = centroid(lot.fp);
      if (lot.tag === 'landmark') { landmarkBuilding(plan.buildings, ctx, lot.fp, lot.lm, hk, style, R); continue; }
      if (blk.district === 'island' && (lot.tag === 'corner' || lot.tag === 'tower') && style !== 'frontier' && style !== 'scifi' && R() < 0.022 && Math.abs(polyArea(lot.fp)) > 900) { plan.sites.push(constructionSite(lot.fp, R, heightAt)); continue; }
      let h;
      const tall = lot.tag === 'tower' || (lot.tag === 'corner' && R() < zone.tower * 0.8);
      if (tall) h = lerp(zone.towerH[0], Math.max(zone.towerH[0] * 1.05, tallest * zone.towerH[1]), Math.pow(R(), 1.6));
      else h = lerp(zone.base[0], zone.base[1], Math.pow(R(), 1.3));
      if (lot.tag === 'wedge') h = Math.max(h, 30);
      if (style === 'early') h *= 0.85;
      if (style === 'frontier') h = 5 + R() * 8;
      if (style === 'scifi' && h < 70 && R() < 0.9) continue;
      if (style === 'future' && h < 25 && R() < 0.35) continue;
      const sty = zone.styles[Math.floor(R() * zone.styles.length)];
      const st = tall && (sty === 'brick') ? 'stone' : sty;
      const fp = lot.tag === 'row' && R() < 0.3 ? insetPoly(lot.fp, (i) => (i % 2 ? 0 : 0.6)) : lot.fp;
      const b = makeBuilding(plan.buildings, ctx, fp, h, st, R, { lot: lot.tag, block: blk.id });
      if (b && style === 'ruins') ruin(b, R);
    }
  }
  yield 1;
  if (style !== 'frontier' && style !== 'scifi') portBuildings(plan, ctx, style);
  yield 1;
  if (style === 'scifi') scifiMegas(plan, ctx, tallest);
  if (style === 'ruins') for (const b of plan.buildings) if (!b.ruined) ruin(b, rng(b.seed));
  yield 1;
  plan.gas = style === 'frontier' || style === 'none' ? [] : S.gas;
  plan.garages = ['modern', 'mid', 'future', 'ruins'].includes(style) ? S.garages : [];
  plan.stadium = ['modern', 'mid', 'future', 'ruins', 'early'].includes(style) ? S.stadium : null;
  plan.jumps = S.jumps.concat(plan.sites.filter((x) => x.jump).map((x) => x.jump));
  if (style === 'future' || style === 'scifi') {
    for (const b of plan.buildings) if (b.top - b.ground > 60 && b.roof !== 'spire' && b.roof !== 'dome' && rng(b.seed)() < 0.45) b.roof = 'helipad';
    yield 1;
    plan.skybridges = skyBridges(plan.buildings, style);
    yield 1;
  } else plan.skybridges = [];
  plan.helipads = plan.buildings.filter((b) => b.roof === 'helipad').map((b) => ({ x: b.cx, z: b.cz, y: b.top, b: b.id }));
  if (style === 'frontier') plan.roads = S.roads.filter((r) => r.district === 'island' && !r.elevated && !r.tunnel && (Math.max(r.pts[0][1], r.pts[r.pts.length - 1][1]) > 6900 && Math.min(r.pts[0][1], r.pts[r.pts.length - 1][1]) > 6800 || r.cat === 'main'));
  else if (style === 'early') plan.roads = S.roads.filter((r) => r.id !== 'ring' && !r.id.startsWith('ramp_') && r.id !== 'runway' && !r.id.startsWith('taxi'));
  else plan.roads = S.roads;
  plan.structures = S.structures.filter((st) => {
    if (style === 'frontier') return false;
    if (style === 'early') return st.type === 'bridge' && st.id !== 'gzowo_bridge' ? true : st.type === 'cranes' || st.type === 'ship';
    if (style === 'scifi') return st.type === 'bridge' || st.type === 'viaduct' || st.type === 'tunnel';
    return true;
  });
  return plan;
}

function skyBridges(list, style) {
  const tall = list.filter((b) => b.top - b.ground > 90 && !b.ruined), out = [];
  const used = new Set();
  for (const a of tall) {
    if (used.has(a.id)) continue;
    let best = null, bd = Infinity;
    for (const b of tall) {
      if (b === a || used.has(b.id)) continue;
      const d = Math.hypot(a.cx - b.cx, a.cz - b.cz);
      if (d < 50 || d > 150 || d > bd) continue;
      const dx = Math.abs(a.cx - b.cx), dz = Math.abs(a.cz - b.cz);
      if (Math.min(dx, dz) > 12) continue;
      best = b; bd = d;
    }
    if (!best) continue;
    const y = Math.min(a.top, best.top) * 0.55 + Math.max(a.ground, best.ground) * 0.45;
    used.add(a.id); used.add(best.id);
    out.push({ a: a.id, b: best.id, x0: a.cx, z0: a.cz, x1: best.cx, z1: best.cz, y, w: style === 'scifi' ? 10 : 7 });
  }
  return out;
}

function constructionSite(fp, R, heightAt) {
  const P = ccw(fp), [cx, cz] = centroid(P), site = { fp: P, fence: [], stuff: [], cx, cz };
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), yaw = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2;
    for (let s = 1.5; s < L - 1.5; s += 3) { if (L > 12 && Math.abs(s - L / 2) < 4) continue; site.fence.push([a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L, yaw]); }
  }
  for (let k = 0; k < 10; k++) site.stuff.push([cx + (R() - 0.5) * 20, cz + (R() - 0.5) * 20, ['cone', 'barrel', 'jersey', 'barrier'][Math.floor(R() * 4)]]);
  const e = [P[1][0] - P[0][0], P[1][1] - P[0][1]], L = Math.hypot(...e);
  if (R() < 0.75) site.jump = { id: `site_${Math.round(cx)}_${Math.round(cz)}`, x: cx, z: cz, yaw: Math.atan2(e[0], e[1]), w: 9, l: Math.min(22, L * 0.6), h: 2.5 + R() * 3, dirt: true };
  return site;
}

function landmarkBuilding(list, ctx, fp, L, hk, style, R) {
  const H = 460 * hk * L.hk;
  const [cx, cz] = centroid(fp);
  const k = L.kind;
  const mk = (f, h, s, extra) => makeBuilding(list, ctx, f, h, s, R, { landmark: L.id, name: L.name, noTiers: true, ...extra });
  const g = Math.min(...fp.map(([x, z]) => ctx.heightAt(x, z)));
  if (k === 'supertall_glass') {
    const b = mk(fp, H * 0.86, 'glass', { roof: 'spire' });
    if (!b) return;
    const s1 = insetPoly(fp, 6), s2 = insetPoly(fp, 13);
    b.tiers = [{ fp: b.fp, y0: b.y0, y1: g + H * 0.2 }, { fp: ccw(s1), y0: g + H * 0.2, y1: g + H * 0.62 }, { fp: ccw(s2), y0: g + H * 0.62, y1: g + H * 0.86 }];
    b.top = g + H * 0.86; b.roof = 'spire'; b.crown = H * 0.14;
  } else if (k === 'deco_empire') {
    const b = mk(fp, H * 0.86, 'deco');
    if (!b) return;
    const t = [[0, 0.06, 0], [0.06, 0.6, 6], [0.6, 0.75, 13], [0.75, 0.83, 19], [0.83, 0.86, 23]];
    b.tiers = t.map(([a, c, ins]) => ({ fp: ins ? ccw(insetPoly(fp, ins)) : b.fp, y0: a === 0 ? b.y0 : g + H * a, y1: g + H * c }));
    b.top = g + H * 0.86; b.roof = 'mast'; b.crown = H * 0.14;
  } else if (k === 'deco_crown') {
    const b = mk(fp, H * 0.8, 'deco');
    if (!b) return;
    b.tiers = [[0, 0.3, 0], [0.3, 0.62, 4], [0.62, 0.8, 9]].map(([a, c, ins]) => ({ fp: ins ? ccw(insetPoly(fp, ins)) : b.fp, y0: a === 0 ? b.y0 : g + H * a, y1: g + H * c }));
    b.top = g + H * 0.8; b.roof = 'crown'; b.crown = H * 0.2;
  } else if (k === 'pencil') {
    const b = mk(fp, H, 'glass');
    if (b) { b.roof = 'flat'; b.tiers = [{ fp: b.fp, y0: b.y0, y1: g + 30 }, { fp: ccw(insetPoly(fp, 1.5)), y0: g + 30, y1: g + H }]; }
  } else if (k === 'glass_box') {
    const b = mk(fp, H, style === 'mid' ? 'modernist' : 'glass');
    if (b) b.roof = 'antenna';
  } else if (k === 'slant') {
    const b = mk(fp, H, 'modernist');
    if (b) b.roof = 'slant';
  }
}

function ruin(b, R) {
  b.ruined = true;
  const r = R();
  if (r < 0.12) { b.collapsed = true; b.h = Math.min(b.h, 4 + R() * 6); b.top = b.y0 + b.h; b.tiers = null; b.roof = 'rubble'; return; }
  if (b.h > 30) {
    const cut = lerp(0.45, 0.95, R());
    const top = b.y0 + (b.top - b.y0) * cut;
    if (b.tiers) { b.tiers = b.tiers.filter((t) => t.y0 < top); b.tiers[b.tiers.length - 1].y1 = top; }
    b.top = top; b.h = top - b.y0; b.roof = 'broken';
  }
}

function portBuildings(plan, ctx, style) {
  const R = rng(hashStr('port' + style));
  for (let i = 0; i < 9; i++) {
    const x0 = 1760 + i * 270, z0 = 6420 + (i % 2) * 290;
    const fp = [[x0, z0], [x0 + 220, z0], [x0 + 220, z0 + 220], [x0, z0 + 220]];
    makeBuilding(plan.buildings, ctx, fp, 14 + R() * 8, 'metal', R, { noTiers: true, district: 'port', roof: 'flat' });
  }
  for (let i = 0; i < 4; i++) {
    const x0 = -6600 + i * 520, z0 = 6470;
    if (i === 1 || i === 2) continue;
    makeBuilding(plan.buildings, ctx, [[x0, z0 - 110], [x0 + 300, z0 - 110], [x0 + 300, z0 - 20], [x0, z0 - 20]], 18 + R() * 6, 'metal', R, { noTiers: true, district: 'airport' });
  }
  makeBuilding(plan.buildings, ctx, [[-6100, 6500], [-5300, 6500], [-5300, 6560], [-6100, 6560]], 24, style === 'early' ? 'stone' : 'glass', R, { noTiers: true, district: 'airport', name: 'Terminal', landmark: 'terminal' });
  makeBuilding(plan.buildings, ctx, [[-5715, 6620], [-5685, 6620], [-5685, 6650], [-5715, 6650]], 62, 'concrete', R, { noTiers: true, district: 'airport', name: 'Control Tower', landmark: 'tower', roof: 'cab' });
}

function scifiMegas(plan, ctx, tallest) {
  const R = rng(hashStr('scifi-megas'));
  const spots = [[-640, 7200], [-1550, 6500], [-200, 5700], [-2200, 6900], [-900, 4800], [-4600, 5200], [2900, 6800], [-1900, 3900]];
  for (const [x, z] of spots) {
    const r = 60 + R() * 70, n = 12, fp = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; fp.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    const b = makeBuilding(plan.buildings, ctx, fp, tallest * (0.45 + R() * 0.55), 'scifi', R, { noTiers: true, mega: true });
    if (b) { b.roof = 'spire'; b.crown = 80 + R() * 160; b.taper = 0.35 + R() * 0.3; }
  }
}
