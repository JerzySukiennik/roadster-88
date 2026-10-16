// Roadster 88 test plate layout: pure data and procedural geometry (straight, ramps, ravines, crash zone, stunt course, towers, props) shared by the physics world and the renderer.

const PLATE = { x0: -720, x1: 720, z0: -1160, z1: 1160 };

function strip(rows, cols, fn) {
  const positions = [], indices = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) { const p = fn(i / rows, j / cols); positions.push(p[0], p[1], p[2]); }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  return { positions, indices };
}

function merge(...parts) {
  const positions = [], indices = [];
  for (const p of parts) { const o = positions.length / 3; positions.push(...p.positions); for (const i of p.indices) indices.push(i + o); }
  return { positions, indices };
}

function flip(m) { const idx = m.indices.slice(); for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } return { positions: m.positions, indices: idx }; }

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function loopMesh(x0, z0, R, width, shift) {
  const rows = 160, cols = 6, k = 0.35;
  const at = (u, v, off) => {
    const th = u * Math.PI * 2;
    const cx = x0 + shift * smooth(0.1, 0.9, u) + (v - 0.5) * width;
    return [cx, R - (R + off) * Math.cos(th) + 0.02, z0 + (R + off) * Math.sin(th)];
  };
  return { surface: flip(strip(rows, cols, (u, v) => at(u, v, 0))), shell: strip(rows, cols, (u, v) => at(u, v, k)) };
}

export function halfpipeMesh(xc, z0, len, flat, R, extra) {
  const n = 18, section = [[-flat / 2 - R, R + extra]];
  for (let i = 0; i <= n; i++) { const a = (1 - i / n) * Math.PI / 2; section.push([-flat / 2 - Math.sin(a) * R, R - Math.cos(a) * R]); }
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 2; section.push([flat / 2 + Math.sin(a) * R, R - Math.cos(a) * R]); }
  section.push([flat / 2 + R, R + extra]);
  const cols = section.length - 1;
  const surf = strip(40, cols, (u, v) => { const s = section[Math.round(v * cols)]; return [xc + s[0], s[1] + 0.015, z0 + u * len]; });
  return { surface: flip(surf), section };
}

export function bankedTurnMesh(cx, cz, radius, width, bankDeg, from, to, transition) {
  const rows = 120, cols = 4;
  const bank = bankDeg * Math.PI / 180;
  const pos = (u, v) => {
    const a = from + (to - from) * u;
    const t = Math.min(smooth(0, transition, u), smooth(1, 1 - transition, u));
    const rIn = radius - width / 2, r = rIn + v * width * Math.cos(bank * t);
    const y = v * width * Math.sin(bank * t);
    return [cx + Math.cos(a) * r, y + 0.02, cz + Math.sin(a) * r];
  };
  const surf = strip(rows, cols, pos);
  const wall = strip(rows, 1, (u, v) => { const p = pos(u, 1); return [p[0], v === 0 ? p[1] : -0.05, p[2]]; });
  return { surface: surf, wall: flip(wall), sample: pos };
}

export function buildLayout() {
  const L = { plate: PLATE, ravines: [], statics: [], props: [], zones: [], markers: [], gates: [], spawn: { pos: [0, 0.05, -985], yaw: 0 } };
  const box = (pos, half, opt = {}) => L.statics.push({ kind: 'box', pos, half, rotY: opt.rotY || 0, mat: opt.mat || 'concrete', tag: opt.tag || '' });
  const cyl = (pos, r, h, opt = {}) => L.statics.push({ kind: 'cyl', pos, r, h, mat: opt.mat || 'concrete', tag: opt.tag || '' });
  const hull = (points, opt = {}) => L.statics.push({ kind: 'hull', points, mat: opt.mat || 'concrete', tag: opt.tag || '' });
  const mesh = (m, opt = {}) => L.statics.push({ kind: 'mesh', positions: m.positions, indices: m.indices, mat: opt.mat || 'concrete', tag: opt.tag || '', collide: opt.collide !== false });

  L.zones.push({ rect: [-14, -1080, 14, 1080], color: [0.56, 0.57, 0.6], a: 0.55, name: 'straight' });
  L.zones.push({ rect: [40, -900, 250, -40], color: [0.92, 0.66, 0.2], a: 0.16, name: 'jumps' });
  L.zones.push({ rect: [40, 120, 270, 720], color: [0.25, 0.48, 0.92], a: 0.14, name: 'crash' });
  L.zones.push({ rect: [-330, -940, -40, 40], color: [0.2, 0.75, 0.62], a: 0.14, name: 'stunt' });
  L.zones.push({ rect: [300, -880, 420, -300], color: [0.6, 0.45, 0.9], a: 0.15, name: 'towers' });
  L.zones.push({ rect: [-40, -1060, 40, -930], color: [0.95, 0.95, 0.95], a: 0.1, name: 'hub' });

  for (let i = 0; i <= 20; i++) L.markers.push({ text: String(i * 100), pos: [-9.5, -1000 + i * 100], rotY: 0, size: 3.2 });
  for (let i = 0; i <= 5; i++) L.gates.push({ z: -1000 + i * 400, width: 32, label: `${i * 400} m` });
  L.markers.push({ text: 'J', pos: [55, -920], size: 8 }, { text: 'C', pos: [55, 100], size: 8 }, { text: 'S', pos: [-55, -960], size: 8 }, { text: 'T', pos: [300, -900], size: 8 });

  const ramp = (x, z, h, deg, w, tag) => {
    const len = h / Math.tan(deg * Math.PI / 180);
    hull([[-w / 2 + x, 0, z], [w / 2 + x, 0, z], [-w / 2 + x, 0, z + len], [w / 2 + x, 0, z + len], [-w / 2 + x, h, z + len], [w / 2 + x, h, z + len]], { mat: 'ramp', tag });
    L.markers.push({ text: `${h} m`, pos: [x, z - 4], size: 2.2 });
    return z + len;
  };
  ramp(75, -820, 1, 12, 8, 'ramp1');
  ramp(105, -820, 2, 15, 8, 'ramp2');
  ramp(140, -820, 4, 18, 9, 'ramp4');
  ramp(185, -830, 8, 21, 10, 'ramp8');

  const ravine = (x0, x1, z0, z1, depth, rampH) => {
    L.ravines.push({ rect: [x0, z0, x1, z1], depth });
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
    box([cx, -depth - 0.5, cz], [hx, 0.5, hz], { mat: 'ravine' });
    box([x0 - 0.5, -depth / 2, cz], [0.5, depth / 2, hz], { mat: 'ravine' });
    box([x1 + 0.5, -depth / 2, cz], [0.5, depth / 2, hz], { mat: 'ravine' });
    box([cx, -depth / 2, z0 - 0.5], [hx + 1, depth / 2, 0.5], { mat: 'ravine' });
    box([cx, -depth / 2, z1 + 0.5], [hx + 1, depth / 2, 0.5], { mat: 'ravine' });
    if (rampH) {
      const deg = 13, len = rampH / Math.tan(deg * Math.PI / 180);
      for (const lx of [cx - 25, cx + 25]) hull([[lx - 6, 0, z0 - 3 - len], [lx + 6, 0, z0 - 3 - len], [lx - 6, 0, z0 - 3], [lx + 6, 0, z0 - 3], [lx - 6, rampH, z0 - 3], [lx + 6, rampH, z0 - 3]], { mat: 'ramp' });
    }
    L.markers.push({ text: `${Math.round(z1 - z0)} m`, pos: [cx, z0 - 1.5], size: 3 });
  };
  ravine(60, 200, -420, -390, 10, 1.5);
  ravine(60, 200, -200, -125, 14, 3);

  box([100, 1.5, 300], [30, 1.5, 0.5], { mat: 'wall', tag: 'wall' });
  box([200, 2.0, 560], [14, 2.0, 0.6], { mat: 'wall', tag: 'wall', rotY: Math.PI / 4 });
  box([100, 2.0, 640], [2, 2, 2], { mat: 'concrete', tag: 'block' });
  for (let i = 0; i < 6; i++) box([140 + (i % 3) * 6.2, 1.295 + Math.floor(i / 3) * 2.59, 330], [3.03, 1.295, 1.22], { mat: i % 2 ? 'container_b' : 'container_a', tag: 'container' });
  for (let i = 0; i < 3; i++) box([215, 1.295, 320 + i * 2.6], [1.22, 1.295, 3.03], { mat: 'container_a', tag: 'container' });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) cyl([75 + c * 12, 3, 420 + r * 14 + (c % 2) * 5], 0.6, 6, { mat: 'concrete', tag: 'pillar' });
  for (let i = 0; i < 8; i++) cyl([160 + i * 9, 3.5, 455], 0.12, 7, { mat: 'pole', tag: 'pole' });
  box([60, 0.45, 210], [0.3, 0.45, 40], { mat: 'barrier', tag: 'barrier' });

  for (let i = 0; i < 21; i++) L.props.push({ type: 'cone', pos: [-60 + (i % 2 ? 1.6 : -1.6), 0, -900 + i * 15] });
  const loop = loopMesh(-120, -360, 11, 7, 9);
  mesh(loop.surface, { mat: 'loop', tag: 'loop' });
  mesh(loop.shell, { mat: 'loop_shell', collide: false });
  const hp = halfpipeMesh(-170, -170, 110, 10, 7, 1.5);
  mesh(hp.surface, { mat: 'halfpipe', tag: 'halfpipe' });
  for (const s of [-1, 1]) box([-170 + s * (5 + 7 + 0.6), 4.25, -115], [0.6, 4.25, 55], { mat: 'concrete' });
  const t1 = bankedTurnMesh(-260, 380, 55, 15, 32, -Math.PI * 0.05, Math.PI * 1.05, 0.15);
  const t2 = bankedTurnMesh(-260, 160, 55, 15, 32, Math.PI * 0.95, Math.PI * 2.05, 0.15);
  mesh(t1.surface, { mat: 'bank', tag: 'bank' }); mesh(t1.wall, { mat: 'concrete', collide: false });
  mesh(t2.surface, { mat: 'bank', tag: 'bank' }); mesh(t2.wall, { mat: 'concrete', collide: false });
  L.zones.push({ rect: [-325, 160, -195, 380], color: [0.2, 0.75, 0.62], a: 0.12, name: 'oval' });
  L.markers.push({ text: 'LOOP', pos: [-120, -392], size: 3 }, { text: 'PIPE', pos: [-170, -180], size: 3 }, { text: 'OVAL', pos: [-260, 268], size: 5 });

  const tower = (x, z, h, top) => {
    const leg = 0.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl([x + sx * (top / 2 - 1.5), h / 2, z + sz * (top / 2 - 1.5)], h > 40 ? 1.1 : leg, h, { mat: 'tower', tag: 'tower' });
    if (h > 40) box([x, h / 2, z], [2.5, h / 2, 2.5], { mat: 'tower', tag: 'tower' });
    box([x, h + 0.3, z], [top / 2, 0.3, top / 2], { mat: 'pad', tag: 'pad' });
    for (let i = 0; i < 3; i++) L.props.push({ type: 'barrel', pos: [x + 4 + i * 1.1, h + 0.6, z + 5] });
    for (let i = 0; i < 4; i++) L.props.push({ type: 'cone', pos: [x - top / 2 + 1.5 + i * 1.2, h + 0.6, z - top / 2 + 1.2] });
    L.markers.push({ text: `${h} m`, pos: [x, z - top / 2 - 6], size: 4 });
  };
  tower(340, -830, 10, 18);
  tower(340, -720, 25, 18);
  tower(340, -590, 50, 20);
  tower(365, -420, 100, 28);

  const cluster = (x, z, n, type, spacing = 1.3) => { for (let i = 0; i < n; i++) L.props.push({ type, pos: [x + (i % 4) * spacing, 0, z + Math.floor(i / 4) * spacing], rotY: (i * 1.7) % 6.28 }); };
  cluster(22, -975, 8, 'cone', 1.6);
  cluster(-26, -960, 6, 'barrel', 1.3);
  cluster(22, -940, 6, 'pallet', 1.8);
  cluster(320, -860, 12, 'barrel', 1.2);
  cluster(300, -760, 8, 'pallet', 1.7);
  cluster(80, 250, 12, 'barrel', 1.25);
  cluster(150, 380, 16, 'cone', 1.4);
  cluster(-30, -400, 10, 'cone', 2.2);
  for (let i = 0; i < 12; i++) L.props.push({ type: 'cone', pos: [13.5, 0, -900 + i * 160] }, { type: 'cone', pos: [-13.5, 0, -900 + i * 160] });
  return L;
}

export function groundRects(L) {
  let rects = [[L.plate.x0, L.plate.z0, L.plate.x1, L.plate.z1]];
  for (const rv of L.ravines) {
    const [hx0, hz0, hx1, hz1] = rv.rect, next = [];
    for (const r of rects) {
      const [x0, z0, x1, z1] = r;
      if (hx1 <= x0 || hx0 >= x1 || hz1 <= z0 || hz0 >= z1) { next.push(r); continue; }
      if (z0 < hz0) next.push([x0, z0, x1, hz0]);
      if (z1 > hz1) next.push([x0, hz1, x1, z1]);
      const mz0 = Math.max(z0, hz0), mz1 = Math.min(z1, hz1);
      if (x0 < hx0) next.push([x0, mz0, hx0, mz1]);
      if (x1 > hx1) next.push([hx1, mz0, x1, mz1]);
    }
    rects = next;
  }
  return rects;
}
