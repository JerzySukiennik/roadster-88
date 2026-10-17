// Roadster 88 valley design: the hand-placed layout of the invented Californian valley (roads, canyon, wash, mesa, lake, dunes, jump hills, town, passes) and the named regions. Pure data and path sampling, shared by the generator, the renderer and the Map app.

export const SIZE = 4000;
export const HALF = 2048;
export const SPACING = 4;

const D2R = Math.PI / 180;

function turtle(x, z, headingDeg) {
  const pts = [];
  let h = headingDeg * D2R;
  const push = () => pts.push([x, z]);
  push();
  return {
    line(len) { const n = Math.max(1, Math.round(len / SPACING)); const st = len / n; for (let i = 0; i < n; i++) { x += Math.sin(h) * st; z += Math.cos(h) * st; push(); } return this; },
    spiral(len, k0, k1) {
      const n = Math.max(2, Math.round(len / SPACING)), st = len / n;
      for (let i = 0; i < n; i++) { const k = k0 + (k1 - k0) * (i + 0.5) / n; h += k * st / 2; x += Math.sin(h) * st; z += Math.cos(h) * st; h += k * st / 2; push(); }
      return this;
    },
    curve(r, deg, len) { const s = Math.sign(deg), sp = len / (2 * r), a = Math.abs(deg) * D2R - 2 * sp; return this.spiral(len, 0, s / r).arc(r, s * a / D2R).spiral(len, s / r, 0); },
    arc(r, deg) {
      const a = deg * D2R, len = Math.abs(a) * r, n = Math.max(2, Math.round(len / SPACING)), da = a / n, s = Math.sign(a);
      const cx = x + Math.cos(h) * r * s, cz = z - Math.sin(h) * r * s;
      for (let i = 0; i < n; i++) { h += da; x = cx - Math.cos(h) * r * s; z = cz + Math.sin(h) * r * s; push(); }
      return this;
    },
    pts,
  };
}

function catmull(ctrl, closed, extra = []) {
  const P = ctrl, n = P.length, out = [];
  const get = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(2, Math.round(len / 2));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const row = [];
      for (let c = 0; c < p1.length; c++) {
        if (c < 2 || !extra.includes(c)) row.push(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
        else row.push(p1[c] + (p2[c] - p1[c]) * (t2 * (3 - 2 * t)));
      }
      out.push(row);
    }
  }
  if (!closed) out.push(P[n - 1].slice());
  return resample(out, closed);
}

export function resample(pts, closed) {
  const L = [0];
  const m = pts.length;
  const segN = closed ? m : m - 1;
  for (let i = 0; i < segN; i++) { const a = pts[i], b = pts[(i + 1) % m]; L.push(L[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = L[L.length - 1];
  const n = Math.max(2, Math.round(total / SPACING));
  const out = [];
  let j = 0;
  const cnt = closed ? n : n + 1;
  for (let k = 0; k < cnt; k++) {
    const s = (k / n) * total;
    while (j < segN - 1 && L[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % m], t = (s - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
    const row = [];
    for (let c = 0; c < a.length; c++) row.push(a[c] + (b[c] - a[c]) * t);
    out.push(row);
  }
  return out;
}

function tangents(pts, closed) {
  const n = pts.length, tx = new Float64Array(n), tz = new Float64Array(n), kap = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)], b = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l; tz[i] = dz / l;
  }
  for (let i = 0; i < n; i++) {
    const a = closed ? (i - 1 + n) % n : Math.max(0, i - 1), b = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    const ha = Math.atan2(tx[a], tz[a]), hb = Math.atan2(tx[b], tz[b]);
    let d = hb - ha; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const ds = SPACING * (closed ? 2 : b - a);
    kap[i] = ds ? d / ds : 0;
  }
  return { tx, tz, kap };
}

function road(id, opt) {
  const r = { id, closed: false, shoulder: 1.5, sigma: 40, maxGrade: 0.08, bankMax: 0, bankK: 0, cutK: 0.9, fillK: 0.7, infl: 40, crests: [], markings: [], mask: 'main', surface: 'asphalt', ...opt };
  const t = tangents(r.pts, r.closed);
  r.tx = t.tx; r.tz = t.tz; r.kap = t.kap;
  r.len = r.closed ? r.pts.length * SPACING : (r.pts.length - 1) * SPACING;
  return r;
}

export function buildDesign() {
  const D = { roads: [], regions: [] };

  const hw = turtle(-900, -2120, 0).line(4240).pts;
  D.roads.push(road('highway', {
    name: 'Highway 88', kind: 'highway', pts: hw, width: 26, shoulder: 2, sigma: 140, maxGrade: 0.045, mask: 'main', infl: 70, cutK: 1.1, fillK: 0.75,
    markings: [{ off: -1.0, w: 0.15, c: 'y' }, { off: 1.0, w: 0.15, c: 'y' }, { off: -4.7, w: 0.15, c: 'w', dash: [3, 9] }, { off: 4.7, w: 0.15, c: 'w', dash: [3, 9] }, { off: -8.6, w: 0.2, c: 'w' }, { off: 8.6, w: 0.2, c: 'w' }],
  }));

  const lp = turtle(-850, -820, 0).line(1500).curve(500, 90, 200).line(184.12).curve(600, 90, 200).line(1400.51).curve(500, 90, 200).line(283.6).curve(500, 90, 200).pts;
  const err = lp[lp.length - 1];
  lp.pop();
  lp.forEach((p, i) => { p[0] -= (err[0] + 850) * i / lp.length; p[1] -= (err[1] + 820) * i / lp.length; });
  D.roads.push(road('loop', {
    name: 'Valley Loop', kind: 'loop', pts: lp, closed: true, width: 18, shoulder: 2, sigma: 90, maxGrade: 0.06, bankMax: 20 * D2R, bankK: 20 * D2R * 500, mask: 'loop', infl: 60,
    crests: [{ x: 640, z: 520, len: 120, h: 2.5 }, { x: 640, z: -90, len: 140, h: 4.2 }, { x: 640, z: -430, len: 170, h: 6.5 }],
    markings: [{ off: 0, w: 0.15, c: 'y', dash: [4, 8] }, { off: -7.6, w: 0.2, c: 'w' }, { off: 7.6, w: 0.2, c: 'w' }],
  }));
  for (const [id, pts] of [['link_south', [[-900, -660], [-896, -580], [-880, -500], [-861, -420], [-851, -350], [-850, -300]]], ['link_north', [[-850, 300], [-851, 350], [-861, 420], [-880, 500], [-896, 580], [-900, 660]]]]) {
    D.roads.push(road(id, { name: 'Loop link', kind: 'link', pts: catmull(pts, false), width: 11, shoulder: 1, sigma: 18, maxGrade: 0.06, mask: 'loop', infl: 24, markings: [] }));
  }

  const streets = [];
  for (const z of [-380, -200, -20]) streets.push({ id: `street_ew${z}`, pts: turtle(-913, z, -90).line(560).pts, width: z === -200 ? 18 : 13 });
  for (const x of [-1060, -1180, -1300, -1420]) streets.push({ id: `street_ns${x}`, pts: turtle(x, -392, 0).line(384).pts, width: 13 });
  for (const s of streets) D.roads.push(road(s.id, { name: 'Town street', kind: 'street', pts: s.pts, width: s.width, shoulder: 1, sigma: 12, maxGrade: 0.05, mask: 'main', infl: 14, markings: s.width > 15 ? [{ off: 0, w: 0.15, c: 'y' }] : [] }));

  D.roads.push(road('rail', { name: 'Rail grade', kind: 'rail', pts: turtle(-948, -2120, 0).line(4240).pts, width: 7, shoulder: 1.5, sigma: 220, maxGrade: 0.02, mask: 'none', surface: 'gravel', infl: 30 }));

  const mesaRoad = catmull([[-913, -150], [-760, -120], [-560, -60], [-330, 30], [-90, 150], [130, 290], [330, 470], [455, 600], [470, 650], [400, 652], [200, 651], [0, 650], [-120, 650], [-210, 640]], false);
  D.roads.push(road('mesa_road', { name: 'Mesa Road', kind: 'track', pts: mesaRoad, width: 9, shoulder: 0.5, sigma: 10, maxGrade: 0.3, mask: 'track', surface: 'dirt', infl: 12, cutK: 1.2, fillK: 1.0 }));
  const canyonTrail = catmull([[640, 360], [780, 372], [900, 380], [1010, 388], [1120, 396]], false);
  D.roads.push(road('canyon_trail', { name: 'Canyon Trail', kind: 'track', pts: canyonTrail, width: 8, shoulder: 0.5, sigma: 10, maxGrade: 0.3, mask: 'track', surface: 'dirt', infl: 10, cutK: 1.2, fillK: 1.0 }));

  D.canyon = catmull([
    [960, 386, 8, 76], [1150, 395, 12, 60], [1300, 440, 18, 48], [1440, 500, 24, 34], [1580, 470, 30, 54], [1690, 330, 36, 72], [1735, 150, 40, 86],
    [1680, -30, 38, 52], [1585, -175, 34, 30], [1600, -330, 30, 46], [1520, -490, 24, 60], [1380, -610, 18, 50], [1220, -690, 12, 62], [1040, -770, 7, 84],
  ], false, [2, 3]);
  D.wash = catmull([
    [1000, 386, 6.2, 34], [880, 330, 5.0, 34], [760, 250, 3.6, 38], [640, 190, 2.4, 40], [520, 150, 1.2, 36], [420, 80, 0.1, 34], [330, 0, -1.1, 40], [250, -100, -3.0, 44], [180, -200, -5.0, 52], [110, -290, -7.4, 64],
  ], false, [2, 3]);

  D.lake = { x: -150, z: -620, rx: 560, rz: 500, rot: 0.2, floor: -9 };
  D.mesa = { x: -250, z: 650, r: 195, top: 80 };
  D.ramp = { x0: -60, x1: 450, z: 650, w0: 36, w1: 46 };
  D.lip = { x: -250, z: 838, r: 40, h: 3.2 };
  D.kickers = [[-620, 230, 3], [-440, 230, 5], [-240, 230, 7.5], [-20, 230, 10], [200, 230, 14]].map(([x, z, h]) => ({ x, z, h }));
  D.dunes = { x0: 700, x1: 1520, z0: -1780, z1: -790, edge: 170, wave: 96 };
  D.town = { x0: -1490, x1: -930, z0: -420, z1: 20 };
  D.passX = -900;

  const ellipse = (cx, cz, rx, rz, rot, n = 48) => { const p = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, z = Math.sin(a) * rz; p.push([cx + x * Math.cos(rot) - z * Math.sin(rot), cz + x * Math.sin(rot) + z * Math.cos(rot)]); } return p; };
  const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const corridor = (pts, half, step = 6) => { const L = [], R = []; for (let i = 0; i < pts.length; i += step) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, h = typeof half === 'function' ? half(pts[i]) : half; L.push([pts[i][0] - dz / l * h, pts[i][1] + dx / l * h]); R.push([pts[i][0] + dz / l * h, pts[i][1] - dx / l * h]); } return L.concat(R.reverse()); };
  const reg = (id, name, kind, poly, extra = {}) => { let cx = 0, cz = 0; for (const p of poly) { cx += p[0]; cz += p[1]; } D.regions.push({ id, name, kind, poly, center: [cx / poly.length, cz / poly.length], ...extra }); };
  reg('valley', 'Valley floor', 'area', rect(-1450, -1450, 1150, 1450));
  reg('town', 'Gzowo Springs', 'town', rect(D.town.x0, D.town.z0, D.town.x1, D.town.z1), { streets: streets.map((s) => s.id) });
  reg('lake', 'Dry Lake', 'lake', ellipse(D.lake.x, D.lake.z, D.lake.rx * 1.0, D.lake.rz * 1.0, D.lake.rot, 64), { floor: D.lake.floor, rim: -6.4, full: -2.5 });
  reg('lakebed', 'Lakebed', 'lakebed', ellipse(D.lake.x, D.lake.z, D.lake.rx * 0.85, D.lake.rz * 0.85, D.lake.rot), { floor: D.lake.floor });
  reg('mesa', 'The Mesa', 'mesa', ellipse(D.mesa.x, D.mesa.z, D.mesa.r, D.mesa.r, 0, 32), { top: D.mesa.top });
  reg('mesa_ramp', 'Mesa Ramp', 'ramp', rect(D.ramp.x0, D.ramp.z - 22, D.ramp.x1, D.ramp.z + 22));
  reg('jumps', 'Jump Hills', 'jumps', rect(-700, 180, 300, 280));
  reg('canyon', 'Thunder Canyon', 'canyon', corridor(D.canyon, (p) => p[3] * 0.5 + 40, 4));
  reg('wash', 'Dry Wash', 'wash', corridor(D.wash, (p) => p[3] * 0.5 + 4, 4));
  reg('dunes', 'Sand Dunes', 'dunes', rect(D.dunes.x0, D.dunes.z0, D.dunes.x1, D.dunes.z1));
  reg('massif', 'Thunder Range', 'mountain', rect(1180, -1050, 2048, 1050));
  reg('highway', 'Highway 88', 'corridor', rect(-920, -2048, -880, 2048));
  reg('north_pass', 'North Pass', 'pass', rect(-1000, 1500, -800, 2048));
  reg('south_pass', 'South Pass', 'pass', rect(-1000, -2048, -800, -1500));
  reg('rollers', 'The Rollers', 'jumps', rect(620, -560, 660, 640));
  reg('rail', 'Rail grade', 'rail', rect(-955, -1900, -941, 1900));
  reg('ridge_east', 'East ridge', 'ridge', rect(-1990, -1300, -1820, 1300));
  reg('ridge_north', 'North ridge', 'ridge', rect(-700, 1820, 900, 1990));
  reg('ridge_south', 'South ridge', 'ridge', rect(-700, -1990, 600, -1820));
  reg('loop_infield', 'Loop infield', 'area', rect(-860, -1360, 580, 1360));

  D.spawn = { x: -903.5, z: -330, yaw: 0 };
  D.landmarks = [
    { id: 'town', label: 'Gzowo Springs', x: -1210, z: -200 },
    { id: 'lake', label: 'Dry Lake', x: -150, z: -620 },
    { id: 'mesa', label: 'The Mesa', x: -250, z: 650 },
    { id: 'canyon', label: 'Thunder Canyon', x: 1560, z: 160 },
    { id: 'dunes', label: 'Dunes', x: 1100, z: -1250 },
    { id: 'jumps', label: 'Jump Hills', x: -200, z: 250 },
    { id: 'rollers', label: 'Rollers', x: 690, z: -90 },
  ];
  return D;
}
