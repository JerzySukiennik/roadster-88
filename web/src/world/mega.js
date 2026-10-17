// Roadster 88 mega map design: the 16 x 16 km world around the original valley (rim band, the coastal plain with Gzowo City, two rivers and the bay to the north, the borough, port and airport, the Palisades, the western range, the eastern hills, the southern desert with Gzowo Flats and the border mountains), the outer roads and the map-wide regions. Pure data and height functions shared by workers, the main thread and Node tools.
import { makeSimplex, fbm, ridged, clamp, lerp, smooth } from './noise.js';
import { sampleBase } from './terrain.js';
import { catmull, road, resample, SPACING } from './design.js';
import { RIVERS, ISLAND, BOROUGH, PORT, AIRPORT, HEIGHTS, cityGround, boroughPoly, islandPoly, rect, PARK } from './city/layout.js';

export const MEGA = { N: 4097, CELL: 4, ORIGIN: -8192, EXTENT: 16384, TN: 2049, TCELL: 8, HALF: 8192, LIMIT: 8000 };
export const INNER_HALF = 2048;

const nA = makeSimplex(4401), nB = makeSimplex(4402), nC = makeSimplex(4403), nD = makeSimplex(4404), nE = makeSimplex(4405), nF = makeSimplex(4406), nG = makeSimplex(4407);

const SHORE = [[-8400, 7900], [-8000, 7800], [-4250, 7790], [-3300, 7750], [-2990, 7700], [-2625, 7610], [580, 7610], [1440, 7660], [4300, 7660], [5200, 7820], [8400, 7960]];

export function shoreZ(x) {
  let i = 0;
  while (i < SHORE.length - 2 && x > SHORE[i + 1][0]) i++;
  const [x0, z0] = SHORE[i], [x1, z1] = SHORE[i + 1];
  const t = clamp((x - x0) / (x1 - x0), 0, 1);
  const wild = x < -8000 || x > 4300 ? 1 : 0;
  return z0 + (z1 - z0) * t + wild * 40 * nG(x / 600, 3.1);
}

export const FLATS = { x: -250, z: -5500, rx: 1900, rz: 1250, rot: 0.15, floor: 58 };

export function inPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; }
  return c;
}

export function polyDist(x, z, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return inPoly(x, z, poly) ? -best : best;
}

const LAND = { island: islandPoly(), borough: boroughPoly(), port: rect(PORT.x0, PORT.z0, PORT.x1, PORT.z1), airport: rect(AIRPORT.x0, AIRPORT.z0, AIRPORT.x1, AIRPORT.z1) };
export const DISTRICTS = LAND;

export function cityWeight(x, z) {
  if (z < 3000 || z > 7900) return 0;
  let d = Infinity;
  for (const k in LAND) d = Math.min(d, polyDist(x, z, LAND[k]));
  return 1 - smooth(0, 260, d);
}

export function newWorld(x, z, m) {
  let h = 4.2 + 1.7 * nA(x / 2100, z / 2100) + 0.55 * nB(x / 520, z / 520);
  let sand = 0, playa = 0, rock = 0;
  const cw = cityWeight(x, z);
  if (cw > 0) h = lerp(h, cityGround(x, z) + 0.9 * nB(x / 260, z / 260), cw);
  const sk = smooth(-2450, -3600, z);
  if (sk > 0) {
    let d = 66 + 24 * fbm(nC, x / 2600, z / 2600, 3) + 5 * nD(x / 640, z / 640);
    const bt = ridged(nE, x / 1500 + 7, z / 1500 - 3, 2);
    const butte = smooth(0.66, 0.72, bt) * (38 + 30 * nF(x / 900, z / 900));
    d += Math.round(butte / 6) * 6 * 0.15 + butte * 0.85;
    const F = FLATS, dx = x - F.x, dz = z - F.z, c = Math.cos(F.rot), s = Math.sin(F.rot);
    const e = Math.hypot((dx * c + dz * s) / F.rx, (-dx * s + dz * c) / F.rz);
    if (e < 1.6) { const k = smooth(0.85, 1.55, e); d = lerp(F.floor + 0.06 * nA(x / 90, z / 90), d, k); playa = 1 - smooth(0.88, 1.0, e); }
    h = lerp(h, d, sk);
    sand = sk * smooth(0.2, 0.7, nG(x / 900, z / 900) * 0.5 + 0.5) * (1 - playa) * 0.7;
  }
  const ek = smooth(-2250, -3300, x) * smooth(3500, 2600, z) * (1 - sk * 0.7);
  if (ek > 0) {
    const hills = 55 + 190 * Math.pow(ridged(nD, x / 1700, z / 1700, 4), 1.4) + 14 * nE(x / 280, z / 280);
    h = lerp(h, Math.max(h, hills), ek);
  }
  const wk = smooth(1900, 3300, x) * smooth(5500, 4300, z) * (1 - sk * 0.5);
  if (wk > 0) {
    const mtn = 260 + 820 * Math.pow(ridged(nF, x / 2600, z / 2600, 5), 1.3) + 40 * nG(x / 500, z / 500);
    h = lerp(h, Math.max(h, mtn), wk);
  }
  const nk = smooth(4300, 5500, x) * smooth(4600, 5600, z) * smooth(8150, 7500, z);
  if (nk > 0) {
    const bl = 70 + 230 * Math.pow(ridged(nE, x / 1300 - 4, z / 1300 + 9, 4), 1.2);
    h = lerp(h, Math.max(h, bl), nk);
  }
  const mk = smooth(-6300, -6900, x) * smooth(4700, 5200, z) * smooth(6450, 6250, z);
  if (mk > 0) {
    const ch = Math.abs(nG(x / 420, z / 420)) + 0.35 * Math.abs(nF(x / 130, z / 130));
    h = lerp(h, lerp(-1.2, 1.1, smooth(0.08, 0.2, ch)), mk);
    sand = Math.max(sand, mk * 0.3 * (1 - smooth(0.05, 0.2, ch)));
  }
  const pk = smooth(1450, 1570, x) * smooth(5980, 5760, z) * smooth(3120, 3380, z);
  if (pk > 0) {
    const pal = 41 + 2.5 * nB(x / 300, z / 300) + 60 * smooth(2100, 3000, x);
    h = Math.max(h, lerp(h, pal, pk));
    rock = Math.max(rock, (smooth(1440, 1500, x) - smooth(1560, 1620, x)) * pk);
  }
  const ed = Math.max(smooth(-6900, -8100, x) * smooth(5900, 4900, z), smooth(6600, 8000, x) * smooth(7300, 6200, z), smooth(-6800, -8100, z));
  if (ed > 0) {
    const mtn = 380 + 700 * Math.pow(ridged(nC, x / 2200 + 11, z / 2200 - 5, 5), 1.25);
    h = lerp(h, Math.max(h, mtn), ed);
  }
  const sz = shoreZ(x);
  if (z > sz - 220) {
    const t = z - sz;
    const city = x > -8000 && x < 4300;
    const coast = city ? (t < -4 ? h : t < 2 ? lerp(h, -5.5, smooth(-4, 2, t)) : -5.5 - Math.min(13, t * 0.035)) : (t < -160 ? h : Math.min(h, lerp(h, -2 - Math.min(16, Math.max(0, t) * 0.03), smooth(-160, 40, t))));
    if (!city && t > -160 && t < 60) sand = Math.max(sand, 1 - smooth(20, 60, Math.abs(t + 50)));
    h = coast;
  }
  rock = Math.max(rock, smooth(170, 480, h) * (1 - sk * 0.6));
  if (m) { m.sand = sand; m.playa = playa; m.rock = rock; }
  return h;
}

function passCarve(x, z, h) {
  const dx = Math.abs(x - D_PASS_X);
  if (dx > 1400) return h;
  const az = Math.abs(z);
  if (az < INNER_HALF || az > 4200) return h;
  const north = z > 0;
  const k = smooth(INNER_HALF, INNER_HALF + 380, az) * (north ? 1 - smooth(3300, 3700, az) : 1 - smooth(3200, 3900, az));
  if (k <= 0) return h;
  const t = smooth(INNER_HALF, north ? 3350 : 3300, az);
  const floor = north ? lerp(44, 6, t) : lerp(47, 68, t);
  const wall = floor + 2 + Math.max(0, dx - 160) * 0.42 + Math.max(0, dx - 420) * 0.4 + 6 * nB(x / 140, z / 140);
  return lerp(h, Math.min(h, wall), k);
}

const D_PASS_X = -900;

export function megaBase(x, z, D, m) {
  const dv = Math.hypot(Math.max(0, Math.abs(x) - INNER_HALF), Math.max(0, Math.abs(z) - INNER_HALF));
  const w = smooth(120, 1300, dv);
  const nw = newWorld(x, z, m);
  if (w >= 1) return passCarve(x, z, nw);
  const mm = m ? { sand: 0, playa: 0, rock: 0 } : null;
  const hv = sampleBase(x, z, D, mm);
  if (m) { m.sand = lerp(mm.sand, m.sand, w); m.playa = lerp(mm.playa, m.playa, w); m.rock = lerp(mm.rock, m.rock, w); }
  return passCarve(x, z, lerp(hv, nw, w));
}

function riverPath(R) { return catmull(R.ctrl, false, [2, 3]); }

export function buildMega(D) {
  const M = { roads: [], regions: [], landmarks: [], rivers: [] };
  for (const k of ['west', 'east']) { const R = RIVERS[k]; M.rivers.push({ id: R.id, name: R.name, pts: riverPath(R) }); }
  const hw = D.roads.find((r) => r.id === 'highway');
  const hwMark = hw.markings;
  const line = (x0, z0, x1, z1) => resample([[x0, z0], [x1, z1]], false);
  M.roads.push(road('hw_north', { name: 'Highway 88', kind: 'highway', pts: line(-900, 2040, -900, 3420), width: 26, shoulder: 2, sigma: 140, maxGrade: 0.045, mask: 'main', infl: 70, cutK: 1.1, fillK: 0.75, markings: hwMark, joinStart: 'highway' }));
  M.roads.push(road('hw_south', { name: 'Highway 88', kind: 'highway', pts: line(-900, -2040, -900, -7950), width: 26, shoulder: 2, sigma: 160, maxGrade: 0.045, mask: 'main', infl: 70, cutK: 1.1, fillK: 0.75, markings: hwMark, joinStart: 'highway' }));
  const flatsLoop = catmull([[-900, -3600], [-1500, -3900], [-2300, -4700], [-2500, -5600], [-2100, -6600], [-1100, -7100], [400, -7000], [1600, -6400], [1900, -5400], [1500, -4400], [500, -3900], [-400, -3650]], true);
  M.roads.push(road('flats_loop', { name: 'Flats Loop', kind: 'loop', pts: flatsLoop, closed: true, width: 16, shoulder: 2, sigma: 110, maxGrade: 0.05, mask: 'main', infl: 50, markings: [{ off: 0, w: 0.15, c: 'y', dash: [4, 8] }, { off: -6.8, w: 0.2, c: 'w' }, { off: 6.8, w: 0.2, c: 'w' }] }));
  const east = catmull([[-2400, -200], [-2900, -150], [-3350, 60], [-3700, 500], [-3800, 1100], [-4100, 1650], [-4500, 2150], [-4650, 2750], [-4500, 3300], [-4300, 3560]], false);
  M.roads.push(road('east_road', { name: 'Canyon Road', kind: 'road', pts: east, width: 12, shoulder: 1.2, sigma: 40, maxGrade: 0.08, mask: 'main', infl: 30, cutK: 1.2, fillK: 0.9, markings: [{ off: 0, w: 0.15, c: 'y' }, { off: -5.4, w: 0.15, c: 'w' }, { off: 5.4, w: 0.15, c: 'w' }] }));
  const pal = catmull([[1440, 4700], [1700, 4700], [1950, 4860], [2050, 5200], [2020, 5550], [1940, 5800], [1900, 5990]], false);
  M.roads.push(road('palisades', { name: 'Palisades Road', kind: 'road', pts: pal, width: 14, shoulder: 1.5, sigma: 40, maxGrade: 0.075, mask: 'main', infl: 30, markings: [{ off: 0, w: 0.15, c: 'y' }, { off: -6.2, w: 0.15, c: 'w' }, { off: 6.2, w: 0.15, c: 'w' }] }));
  const reg = (id, name, kind, poly, extra = {}) => { let cx = 0, cz = 0; for (const p of poly) { cx += p[0]; cz += p[1]; } M.regions.push({ id, name, kind, poly, center: [cx / poly.length, cz / poly.length], ...extra }); };
  reg('city', 'Gzowo City', 'city', islandPoly(), { district: 'island' });
  reg('borough', 'East Borough', 'city', boroughPoly(), { district: 'borough' });
  reg('port', 'West Port', 'harbour', LAND.port, { district: 'port' });
  reg('harbour', 'Harbour', 'harbour', rect(PORT.x0 - 60, PORT.z1 - 400, PORT.x1, PORT.z1 + 200));
  reg('airport', 'Gzowo Airport', 'airport', LAND.airport, { district: 'airport' });
  reg('park', 'Central Park', 'park', rect(PARK.x0, PARK.z0, PARK.x1, PARK.z1));
  reg('heights', 'The Heights', 'hill', rect(HEIGHTS.x0, HEIGHTS.z0, HEIGHTS.x1, HEIGHTS.z1));
  for (const R of M.rivers) { const half = (p) => p[2] + 6; const L = [], Rr = []; for (let i = 0; i < R.pts.length; i += 8) { const a = R.pts[Math.max(0, i - 1)], b = R.pts[Math.min(R.pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; L.push([R.pts[i][0] - dz / l * half(R.pts[i]), R.pts[i][1] + dx / l * half(R.pts[i])]); Rr.push([R.pts[i][0] + dz / l * half(R.pts[i]), R.pts[i][1] - dx / l * half(R.pts[i])]); } reg(R.id, R.name, 'river', L.concat(Rr.reverse()), { river: true }); }
  reg('bay', 'The Bay', 'sea', [[-8192, 7700], [8192, 7700], [8192, 8192], [-8192, 8192]], { sea: true, level: 0 });
  reg('palisades', 'The Palisades', 'cliff', rect(1450, 3300, 2600, 5800));
  reg('west_range', 'Western Range', 'mountain', rect(2600, -2600, 8192, 4300));
  reg('east_hills', 'Eastern Hills', 'hills', rect(-6900, -2500, -2300, 3000));
  reg('desert', 'High Desert', 'desert', rect(-6800, -7000, 6600, -2600));
  reg('flats', 'Gzowo Flats', 'lakebed', (() => { const p = [], F = FLATS; for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, x = Math.cos(a) * F.rx * 0.88, z = Math.sin(a) * F.rz * 0.88; p.push([F.x + x * Math.cos(F.rot) - z * Math.sin(F.rot), F.z + x * Math.sin(F.rot) + z * Math.cos(F.rot)]); } return p; })(), { floor: FLATS.floor });
  M.landmarks = [
    { id: 'city', label: 'Gzowo City', x: -1000, z: 6400 },
    { id: 'park', label: 'Central Park', x: -1550, z: 5160 },
    { id: 'borough', label: 'East Borough', x: -4700, z: 4900 },
    { id: 'airport', label: 'Airport', x: -6100, z: 7100 },
    { id: 'port', label: 'West Port', x: 2900, z: 6800 },
    { id: 'heights', label: 'The Heights', x: -100, z: 4700 },
    { id: 'palisades', label: 'Palisades', x: 2000, z: 4300 },
    { id: 'flats', label: 'Gzowo Flats', x: FLATS.x, z: FLATS.z },
    { id: 'desert', label: 'High Desert', x: -3500, z: -4600 },
    { id: 'west_range', label: 'Western Range', x: 4600, z: 1200 },
    { id: 'east_hills', label: 'Eastern Hills', x: -4600, z: 600 },
    { id: 'bay', label: 'The Bay', x: -800, z: 7950 },
  ];
  return M;
}
