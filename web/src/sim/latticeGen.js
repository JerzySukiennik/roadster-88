// Roadster 88 placeholder damage lattice: fills the car volume with about 200 nodes (crumple zones, stiff cabin, heavy battery floor, wheel hubs) and beams in the shared lattice.json format until the real lattice ships. Pure JS.

const lerp = (a, b, t) => a + (b - a) * t;
function pw(pts) {
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const t = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); return lerp(pts[i - 1][1], pts[i][1], t); }
    return pts[pts.length - 1][1];
  };
}

export function generateLattice(tu) {
  const c = tu.car, W = tu.wheels, T = tu.thrusters;
  const B = c.collider_box, zN = B.center[2] + B.size[2] / 2 + 0.03, zT = B.center[2] - B.size[2] / 2 - 0.03;
  const ax = c.wheelbase / 2;
  const top = pw([[zT, 0.74], [zT + 0.3, 0.86], [-1.62, 0.92], [-1.3, 0.98], [-0.7, c.height - 0.02], [-0.3, c.height], [0.2, 1.0], [0.6, 0.86], [0.8, 0.82], [ax, 0.79], [zN - 0.3, 0.62], [zN, 0.42]]);
  const half = pw([[zT, 0.8], [zT + 0.25, 0.92], [-ax, 0.99], [0, 0.93], [ax, 0.97], [zN - 0.3, 0.86], [zN, 0.6]]);
  const nodes = [], beams = [];
  const nz = 16;
  for (let iz = 0; iz < nz; iz++) {
    const z = lerp(zT + 0.06, zN - 0.06, iz / (nz - 1));
    const h = half(z) - 0.05, t = top(z) - 0.05;
    const ys = [0.2, 0.47, 0.74, 1.0].filter((y) => y < t);
    if (ys.length < 2) ys.push(Math.min(t, 0.47));
    for (const y of ys) {
      const narrow = y > 0.9 ? 0.72 : 1;
      for (const fx of [-1, -0.5, 0, 0.5, 1]) {
        const x = fx * h * narrow;
        nodes.push({ p: [x, y, z] });
      }
    }
  }
  const wheelPos = [['Wheel_FL', c.track_front / 2, W.radius_front, ax], ['Wheel_FR', -c.track_front / 2, W.radius_front, ax], ['Wheel_RL', c.track_rear / 2, W.radius_rear, -ax], ['Wheel_RR', -c.track_rear / 2, W.radius_rear, -ax]];
  const wheels = {};
  for (const [name, x, r, z] of wheelPos) {
    const ids = [];
    for (const [dy, dz] of [[0, 0.17], [0, -0.17], [0.15, 0], [-0.12, 0]]) { ids.push(nodes.length); nodes.push({ p: [x * 0.92, r + dy, z + dz], wheel: name }); }
    wheels[name] = ids;
  }
  const cabinZ = (z) => z > -1.55 && z < 0.9;
  nodes.forEach((nd, i) => {
    nd.id = i;
    const [, y, z] = nd.p;
    if (nd.wheel) nd.zone = 'wheel';
    else if (z > ax - 0.2) nd.zone = 'front';
    else if (z < -ax - 0.15) nd.zone = 'rear';
    else if (y > 0.95) nd.zone = 'roof';
    else if (y < 0.3 && cabinZ(z)) nd.zone = 'floor';
    else nd.zone = 'cabin';
  });
  const wgt = (nd) => (nd.zone === 'floor' ? 3.2 : nd.zone === 'wheel' ? 1.6 : nd.zone === 'roof' ? 0.6 : 1);
  const tw = nodes.reduce((s, nd) => s + wgt(nd), 0);
  for (const nd of nodes) nd.m = Math.round(c.mass * wgt(nd) / tw * 1000) / 1000;
  const cls = { crumple: { k: 2.4e6, d: 900, yield: 0.015, break: 0.22 }, cabin: { k: 6e6, d: 1400, yield: 0.04, break: 0.5 }, floor: { k: 9e6, d: 1600, yield: 0.05, break: 0.55 }, roof: { k: 2.6e6, d: 800, yield: 0.03, break: 0.36 }, wheel: { k: 4.5e6, d: 1200, yield: 0.03, break: 0.22 } };
  const rank = { crumple: 0, roof: 1, wheel: 2, cabin: 3, floor: 4 };
  const clsOf = (z) => (z === 'front' || z === 'rear' ? 'crumple' : z);
  const d2 = (a, b) => (a.p[0] - b.p[0]) ** 2 + (a.p[1] - b.p[1]) ** 2 + (a.p[2] - b.p[2]) ** 2;
  const body = nodes.filter((n) => !n.wheel);
  for (let i = 0; i < body.length; i++) for (let j = i + 1; j < body.length; j++) {
    const a = body[i], b = body[j], d = Math.sqrt(d2(a, b));
    if (d > 0.62 || d < 0.05) continue;
    const ca = clsOf(a.zone), cb = clsOf(b.zone);
    const k = rank[ca] <= rank[cb] ? ca : cb;
    beams.push({ a: a.id, b: b.id, ...cls[k], class: k });
  }
  for (const name in wheels) {
    const ids = wheels[name];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) beams.push({ a: ids[i], b: ids[j], ...cls.wheel, k: 9e6, class: 'wheel' });
    for (const id of ids) {
      const nd = nodes[id];
      const near = body.map((b) => [b, d2(b, nd)]).sort((p, q) => p[1] - q[1]).slice(0, 4);
      for (const [b] of near) beams.push({ a: id, b: b.id, ...cls.wheel, class: 'wheel' });
    }
  }
  const sel = (fn) => nodes.filter((n) => !n.wheel && fn(n.p)).map((n) => n.id);
  const nearest = (p, k = 1) => body.map((b) => [b.id, d2(b, { p })]).sort((a, b) => a[1] - b[1]).slice(0, k).map((x) => x[0]);
  const parts = [
    { name: 'Bumper_F', nodes: sel(([x, y, z]) => z > zN - 0.42 && y < 0.62), break_impulse: 9000 },
    { name: 'Bumper_R', nodes: sel(([x, y, z]) => z < zT + 0.42 && y < 0.62), break_impulse: 9000 },
    { name: 'Hood', nodes: sel(([x, y, z]) => z > 0.8 && z < zN - 0.36 && y > 0.55 && Math.abs(x) < 0.6), break_impulse: 16000 },
    { name: 'Flap_F', nodes: nearest([0, 0.27, zN], 2), break_impulse: 3500 },
    { name: 'Door_L', nodes: sel(([x, y, z]) => x > 0.55 && z > -0.72 && z < 0.64 && y > 0.3 && y < 0.9), break_impulse: 26000 },
    { name: 'Door_R', nodes: sel(([x, y, z]) => x < -0.55 && z > -0.72 && z < 0.64 && y > 0.3 && y < 0.9), break_impulse: 26000 },
    { name: 'Mirror_L', nodes: nearest([0.9, 0.86, 0.52], 1), break_impulse: 1800 },
    { name: 'Mirror_R', nodes: nearest([-0.9, 0.86, 0.52], 1), break_impulse: 1800 },
    { name: 'Roof_Targa', nodes: sel(([x, y, z]) => y > 0.95 && z > -0.8 && z < -0.1), break_impulse: 14000 },
    { name: 'Wing', nodes: nearest([0, 0.9, zT + 0.3], 3), break_impulse: 7000 },
  ];
  const nozzles = {};
  const rn = ['Nozzle_RL1', 'Nozzle_RL2', 'Nozzle_RR2', 'Nozzle_RR1'];
  T.rear.positions.forEach((p, i) => { nozzles[rn[i]] = nearest(p, 2); });
  ['Nozzle_FL', 'Nozzle_FR'].forEach((nm, i) => { nozzles[nm] = nearest(T.front.positions[i], 2); });
  if (T.side) ['Nozzle_SL1', 'Nozzle_SL2', 'Nozzle_SR1', 'Nozzle_SR2'].forEach((nm, i) => { nozzles[nm] = nearest(T.side.positions[i], 2); });
  return { version: 1, generated: 'web placeholder', nodes: nodes.map((n) => ({ id: n.id, p: n.p.map((v) => Math.round(v * 1000) / 1000), m: n.m, zone: n.zone })), beams, parts, wheels, nozzles };
}
