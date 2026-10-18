// Roadster 88 life vehicles: procedural SDF traffic for each era (a 1910s Model T style tourer, a 1930s sedan and a stake-bed truck, 1950s tail fins, a long 1970s sedan, a rounded 1990s sedan, 2026 sedan, hatchback, SUV, pickup and semi truck; 2080 autonomous pod and EV; far-future hover car; 1885 farm wagon and stagecoach; quadcopter drone) with wheels, rotors and suspension as bones and a rolling or spinning clip. Paint colour comes per instance.
import { Model } from '../sdf.js';

const K = 0.03;

function wheels(M, axles, r, w, o = {}) {
  const names = [];
  axles.forEach((z, i) => {
    for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
      const n = 'wheel' + i + L, x = s * o.track;
      M.bone(n, 'body', [x, r, z]);
      names.push(n);
      if (o.spokes) {
        M.cyl([x, r, z], r, 0.04, { bone: n, rot: [0, 0, Math.PI / 2], round: 0.015, k: 0.005, region: 'rim' });
        M.cyl([x, r, z], r * 0.82, 0.05, { bone: n, rot: [0, 0, Math.PI / 2], sub: true, k: 0.004, region: 'rim' });
        M.cyl([x, r, z], 0.07, 0.07, { bone: n, rot: [0, 0, Math.PI / 2], round: 0.02, k: 0.01, region: 'rim' });
        for (let k = 0; k < o.spokes; k++) { const a = (k / o.spokes) * Math.PI * 2; M.box([x, r + Math.sin(a) * r * 0.45, z + Math.cos(a) * r * 0.45], [0.018, 0.016, r * 0.45], { bone: n, rot: [0, -a, 0], k: 0.006, region: 'rim' }); }
      } else {
        M.cyl([x, r, z], r, w, { bone: n, rot: [0, 0, Math.PI / 2], round: r * 0.28, k: 0.01, region: 'tire' });
        M.cyl([x + s * (w - 0.01), r, z], r * 0.6, 0.02, { bone: n, rot: [0, 0, Math.PI / 2], round: 0.01, k: 0.008, region: 'rim', prio: 2 });
        M.cyl([x + s * w, r, z], r * 0.18, 0.02, { bone: n, rot: [0, 0, Math.PI / 2], k: 0.01, region: 'trim', prio: 3 });
      }
    }
  });
  return names;
}

function lights(M, z, y, x, w, h, region) {
  for (const s of [1, -1]) M.box([s * x, y, z], [w, h, 0.03], { bone: 'body', round: Math.min(w, h) * 0.8, k: 0.012, region, prio: 3 });
}

function pl(G, p, q, up) {
  const dy = q[1] - p[1], dz = q[2] - p[2];
  const n = dz * up > 0 ? [0, dz, -dy] : [0, -dz, dy];
  if (n[1] < 0) { n[1] = -n[1]; n[2] = -n[2]; }
  G.plane(p, n, { bone: 'body' });
}

function car(M, o) {
  M.bone('body', null, [0, 0, 0]);
  const L = o.len / 2, W = o.wid / 2, belt = o.belt, roof = o.roof, sill = o.sill;
  const gw = W * 0.9, tumble = o.tumble === undefined ? 0.32 : o.tumble, rw = gw - tumble * (roof - belt);
  M.group((G) => {
    G.box([0, (sill + belt) / 2 + 0.02, 0], [W, (belt - sill) / 2 + 0.02, L], { bone: 'body', round: o.round || 0.13 });
    pl(G, [0, belt + 0.02, o.wsBase], [0, Math.min(o.hoodY, belt - 0.03), L], 1);
    pl(G, [0, belt + 0.02, o.rwBase], [0, Math.min(o.deckY, belt - 0.03), -L], -1);
    G.plane([0, sill + 0.28, L], [0, -0.9, 0.9 * (0.28 / 0.3)], { bone: 'body' });
    G.plane([0, sill + 0.3, -L], [0, -0.9, -0.75], { bone: 'body' });
    for (const s of [1, -1]) { G.plane([s * W, 0, L - (o.noseTaper || 0.55)], [s * 1, 0, 1.6], { bone: 'body' }); G.plane([s * W, 0, -L + 0.45], [s * 1, 0, -1.8], { bone: 'body' }); }
    if (o.bed) G.box([0, belt + 0.25, o.bed[0]], [W - 0.08, 0.5, o.bed[1]], { bone: 'body', sub: true });
  }, { bone: 'body', region: 'paint', k: 0.02, gk: 0.05 });
  M.group((G) => {
    G.box([0, (belt + roof) / 2, (o.wsBase + o.rwBase) / 2], [gw, (roof - belt) / 2 + 0.03, (o.wsBase - o.rwBase) / 2 + 0.02], { bone: 'body', round: 0.05 });
    pl(G, [0, belt, o.wsBase], [0, roof, o.wsTop], 1);
    pl(G, [0, belt, o.rwBase], [0, roof, o.rwTop], -1);
    for (const s of [1, -1]) G.plane([s * gw, belt, 0], [s * 1, tumble, 0], { bone: 'body' });
  }, { bone: 'body', region: 'glass', k: 0.035, gk: 0.03 });
  const zr = (o.wsTop + o.rwTop) / 2, lr = (o.wsTop - o.rwTop) / 2;
  M.box([0, roof - 0.015, zr], [rw - 0.03, 0.035, lr - 0.06], { bone: 'body', round: 0.03, k: 0.03, region: 'paint', prio: 1 });
  for (const s of [1, -1]) {
    M.cone([s * (gw - 0.02), belt + 0.02, o.wsBase + 0.02], [s * (rw - 0.02), roof - 0.02, o.wsTop], 0.05, 0.04, { bone: 'body', k: 0.02, region: 'paint', prio: 2 });
    M.cone([s * (gw - 0.02), belt + 0.02, o.rwBase - 0.02], [s * (rw - 0.02), roof - 0.02, o.rwTop], o.cpillar || 0.07, 0.045, { bone: 'body', k: 0.02, region: 'paint', prio: 2 });
    const bz = o.bpillar === undefined ? zr + lr * 0.05 : o.bpillar;
    M.cone([s * (gw - 0.01), belt + 0.02, bz], [s * (rw - 0.01), roof - 0.02, bz], 0.045, 0.04, { bone: 'body', k: 0.015, region: 'paint', prio: 2 });
    M.box([s * (gw + 0.09), belt + 0.08, o.wsBase - 0.08], [0.08, 0.05, 0.1], { bone: 'body', round: 0.035, k: 0.01, region: 'paint' });
  }
  for (const z of o.axles) for (const s of [1, -1]) M.cyl([s * W, o.wr, z], o.wr + 0.065, W * 0.32, { bone: 'body', rot: [0, 0, Math.PI / 2], sub: true, k: 0.025, region: 'trim' });
  M.box([0, sill + 0.13, L - 0.05], [W * 0.96, 0.11, 0.08], { bone: 'body', round: 0.05, k: 0.02, region: 'trim', prio: 1 });
  M.box([0, sill + 0.13, -L + 0.05], [W * 0.96, 0.11, 0.08], { bone: 'body', round: 0.05, k: 0.02, region: 'trim', prio: 1 });
  M.box([0, (o.hoodY + sill) / 2 + 0.02, L - 0.01], [W * 0.42, 0.07, 0.03], { bone: 'body', round: 0.03, k: 0.01, region: 'trim', prio: 2 });
  lights(M, L - 0.06, o.hoodY - 0.08, W * 0.7, W * 0.22, 0.045, 'lens');
  lights(M, -L + 0.04, o.deckY - 0.1, W * 0.74, W * 0.2, 0.05, 'glow');
  if (o.rails) for (const s of [1, -1]) M.box([s * (rw - 0.12), roof + 0.04, zr], [0.025, 0.025, lr * 0.9], { bone: 'body', round: 0.02, k: 0.01, region: 'trim' });
  wheels(M, o.axles, o.wr, o.ww, { track: W - o.ww * 0.75 });
}

const ROLL = (r) => (rig) => {
  const ws = rig.bones.filter((b) => b.name.startsWith('wheel')).map((b) => rig.i(b.name));
  return [{ name: 'roll', frames: 16, loop: true, dur: 1, speed: Math.PI * 2 * r, pose(t, P) { for (const i of ws) P.rx[i] = t * Math.PI * 2; } }, { name: 'idle', frames: 2, loop: true, dur: 1, speed: 0, pose() {} }];
};

const V = {
  car_sedan: { m: { mass: 1500, length: 4.8, width: 1.85, height: 1.45, wheel: 0.33 }, b(M) { car(M, { len: 4.8, wid: 1.84, sill: 0.22, belt: 0.86, roof: 1.44, hoodY: 0.74, deckY: 0.84, wsBase: 0.95, wsTop: 0.05, rwTop: -0.85, rwBase: -1.55, axles: [1.42, -1.42], wr: 0.33, ww: 0.11 }); } },
  car_hatch: { m: { mass: 1250, length: 4.1, width: 1.78, height: 1.5, wheel: 0.31 }, b(M) { car(M, { len: 4.1, wid: 1.76, sill: 0.22, belt: 0.9, roof: 1.48, hoodY: 0.74, deckY: 0.84, wsBase: 0.85, wsTop: 0.0, rwTop: -1.4, rwBase: -1.95, axles: [1.28, -1.25], wr: 0.31, ww: 0.1, cpillar: 0.1 }); } },
  car_suv: { m: { mass: 2200, length: 4.9, width: 1.95, height: 1.8, wheel: 0.38 }, b(M) { car(M, { len: 4.9, wid: 1.94, sill: 0.36, belt: 1.08, roof: 1.78, hoodY: 0.98, deckY: 1.06, wsBase: 1.05, wsTop: 0.35, rwTop: -2.2, rwBase: -2.38, axles: [1.5, -1.45], wr: 0.38, ww: 0.13, round: 0.1, rails: true, tumble: 0.18, cpillar: 0.12, noseTaper: 0.4 }); } },
  car_pickup: { m: { mass: 2400, length: 5.6, width: 2.0, height: 1.9, wheel: 0.4 }, b(M) { car(M, { len: 5.6, wid: 2.0, sill: 0.42, belt: 1.12, roof: 1.86, hoodY: 1.04, deckY: 1.12, wsBase: 1.4, wsTop: 0.75, rwTop: -0.2, rwBase: -0.25, axles: [1.85, -1.75], wr: 0.4, ww: 0.14, round: 0.08, tumble: 0.15, bed: [-1.55, 1.15], noseTaper: 0.35 }); } },
  truck_semi: { m: { mass: 15000, length: 16.5, width: 2.5, height: 4.0, wheel: 0.52 }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.box([0, 1.85, 6.3], [1.22, 1.15, 1.25], { bone: 'body', round: 0.2, k: 0.05, region: 'paint' });
    M.box([0, 1.25, 7.85], [1.18, 0.55, 0.55], { bone: 'body', round: 0.15, k: 0.08, region: 'paint' });
    M.box([0, 2.45, 7.42], [1.1, 0.42, 0.06], { bone: 'body', round: 0.04, k: 0.02, region: 'glass', prio: 2 });
    M.box([0, 3.15, 6.0], [1.15, 0.2, 1.0], { bone: 'body', round: 0.15, k: 0.1, region: 'paint' });
    M.box([0, 0.75, 1.0], [0.55, 0.12, 7.0], { bone: 'body', round: 0.04, k: 0.02, region: 'trim' });
    M.box([0, 2.45, -1.6], [1.27, 1.45, 6.2], { bone: 'body', round: 0.05, k: 0.02, region: 'white' });
    lights(M, 8.38, 1.2, 0.95, 0.15, 0.06, 'lens');
    lights(M, -7.82, 1.1, 1.1, 0.08, 0.06, 'glow');
    wheels(M, [6.8, 3.6, 2.4, -5.0, -6.2], 0.52, 0.15, { track: 1.0 });
  } },
  car_t: { m: { mass: 550, length: 3.4, width: 1.68, height: 2.05, wheel: 0.38 }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.box([0, 0.62, -0.2], [0.62, 0.2, 1.35], { bone: 'body', round: 0.04, k: 0.02, region: 'paint' });
    M.box([0, 0.95, 0.95], [0.38, 0.2, 0.42], { bone: 'body', round: 0.05, k: 0.02, region: 'paint' });
    M.box([0, 0.95, 1.4], [0.36, 0.26, 0.05], { bone: 'body', round: 0.03, k: 0.01, region: 'brass' });
    M.box([0, 1.0, -0.55], [0.64, 0.25, 0.75], { bone: 'body', round: 0.05, k: 0.02, region: 'paint' });
    M.box([0, 1.3, 0.48], [0.6, 0.3, 0.02], { bone: 'body', round: 0.01, k: 0.005, region: 'glass', prio: 2 });
    M.box([0, 1.98, -0.45], [0.7, 0.04, 1.0], { bone: 'body', round: 0.03, k: 0.01, region: 'canvas' });
    for (const [x, z] of [[0.62, 0.48], [-0.62, 0.48], [0.62, -1.38], [-0.62, -1.38]]) M.cyl([x, 1.6, z], 0.025, 0.38, { bone: 'body', k: 0.005, region: 'trim' });
    for (const z of [1.05, -1.1]) for (const s of [1, -1]) M.ell([s * 0.72, 0.82, z], [0.2, 0.08, 0.48], { bone: 'body', k: 0.02, region: 'paint' });
    for (const s of [1, -1]) M.box([s * 0.74, 0.5, 0], [0.14, 0.025, 0.7], { bone: 'body', k: 0.01, region: 'trim' });
    for (const s of [1, -1]) M.ell([s * 0.3, 1.0, 1.42], [0.09, 0.09, 0.06], { bone: 'body', k: 0.01, region: 'lens', prio: 3 });
    M.box([0, 0.7, -1.58], [0.4, 0.05, 0.03], { bone: 'body', k: 0.005, region: 'glow', prio: 3 });
    wheels(M, [1.05, -1.1], 0.38, 0.05, { track: 0.74, spokes: 12 });
  } },
  car_30s: { m: { mass: 1300, length: 4.6, width: 1.82, height: 1.75, wheel: 0.36 }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.box([0, 0.72, 1.1], [0.42, 0.28, 1.05], { bone: 'body', round: 0.14, k: 0.03, region: 'paint' });
    M.box([0, 0.75, 2.12], [0.38, 0.3, 0.05], { bone: 'body', round: 0.08, k: 0.02, region: 'rim', prio: 1 });
    M.box([0, 1.08, -0.65], [0.72, 0.62, 1.15], { bone: 'body', round: 0.22, k: 0.04, region: 'paint' });
    M.box([0, 1.33, -0.62], [0.735, 0.22, 0.95], { bone: 'body', round: 0.08, k: 0.01, region: 'glass', prio: 2 });
    M.ell([0, 0.8, -1.75], [0.62, 0.42, 0.45], { bone: 'body', k: 0.04, region: 'paint' });
    for (const z of [1.45, -1.45]) for (const s of [1, -1]) M.ell([s * 0.72, 0.62, z], [0.22, 0.26, 0.62], { bone: 'body', k: 0.06, region: 'paint' });
    for (const s of [1, -1]) M.box([s * 0.84, 0.36, 0], [0.12, 0.025, 0.9], { bone: 'body', k: 0.02, region: 'trim' });
    for (const s of [1, -1]) M.ell([s * 0.55, 0.92, 2.0], [0.12, 0.12, 0.1], { bone: 'body', k: 0.02, region: 'lens', prio: 3 });
    M.box([0, 0.38, 2.2], [0.8, 0.05, 0.05], { bone: 'body', round: 0.03, k: 0.01, region: 'rim', prio: 1 });
    M.box([0, 0.38, -2.2], [0.8, 0.05, 0.05], { bone: 'body', round: 0.03, k: 0.01, region: 'rim', prio: 1 });
    for (const s of [1, -1]) M.ell([s * 0.6, 0.85, -2.15], [0.06, 0.06, 0.04], { bone: 'body', k: 0.01, region: 'glow', prio: 3 });
    wheels(M, [1.45, -1.45], 0.36, 0.1, { track: 0.74 });
  } },
  truck_old: { m: { mass: 1800, length: 5.0, width: 1.9, height: 2.05, wheel: 0.4 }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.box([0, 0.85, 1.55], [0.42, 0.3, 0.75], { bone: 'body', round: 0.1, k: 0.03, region: 'paint' });
    M.box([0, 0.9, 2.3], [0.4, 0.32, 0.05], { bone: 'body', round: 0.05, k: 0.01, region: 'rim', prio: 1 });
    M.box([0, 1.25, 0.35], [0.75, 0.68, 0.5], { bone: 'body', round: 0.12, k: 0.03, region: 'paint' });
    M.box([0, 1.5, 0.35], [0.76, 0.2, 0.42], { bone: 'body', round: 0.06, k: 0.01, region: 'glass', prio: 2 });
    M.box([0, 0.88, -1.45], [0.9, 0.06, 1.3], { bone: 'body', k: 0.01, region: 'wood' });
    for (const s of [1, -1]) M.box([s * 0.88, 1.2, -1.45], [0.03, 0.3, 1.28], { bone: 'body', k: 0.01, region: 'wood' });
    M.box([0, 1.2, -2.73], [0.9, 0.3, 0.03], { bone: 'body', k: 0.01, region: 'wood' });
    for (const z of [1.55, -1.6]) for (const s of [1, -1]) M.ell([s * 0.75, 0.68, z], [0.24, 0.28, 0.6], { bone: 'body', k: 0.06, region: 'paint' });
    for (const s of [1, -1]) M.ell([s * 0.55, 1.02, 2.25], [0.11, 0.11, 0.08], { bone: 'body', k: 0.02, region: 'lens', prio: 3 });
    M.box([0, 0.75, -2.75], [0.5, 0.04, 0.03], { bone: 'body', k: 0.005, region: 'glow', prio: 3 });
    wheels(M, [1.55, -1.6], 0.4, 0.11, { track: 0.78 });
  } },
  car_50s: { m: { mass: 1700, length: 5.4, width: 2.0, height: 1.45, wheel: 0.36 }, b(M) {
    car(M, { len: 5.4, wid: 2.0, sill: 0.24, belt: 0.84, roof: 1.42, hoodY: 0.8, deckY: 0.86, wsBase: 0.75, wsTop: 0.05, rwTop: -1.0, rwBase: -1.6, axles: [1.6, -1.55], wr: 0.36, ww: 0.12, round: 0.1, tumble: 0.22 });
    for (const s of [1, -1]) { M.box([s * 0.86, 1.0, -2.25], [0.05, 0.22, 0.45], { bone: 'body', round: 0.04, k: 0.03, region: 'paint' }); M.box([s * 0.86, 1.05, -2.68], [0.06, 0.06, 0.04], { bone: 'body', round: 0.03, k: 0.01, region: 'glow', prio: 3 }); }
    M.box([0, 0.42, 2.72], [1.0, 0.09, 0.07], { bone: 'body', round: 0.05, k: 0.01, region: 'rim', prio: 2 });
    M.box([0, 0.42, -2.72], [1.0, 0.09, 0.07], { bone: 'body', round: 0.05, k: 0.01, region: 'rim', prio: 2 });
    for (const s of [1, -1]) M.box([s * 1.0, 0.65, 0], [0.012, 0.03, 2.3], { bone: 'body', round: 0.01, k: 0.005, region: 'rim', prio: 2 });
  } },
  car_70s: { m: { mass: 1900, length: 5.6, width: 2.0, height: 1.38, wheel: 0.36 }, b(M) {
    car(M, { len: 5.6, wid: 2.0, sill: 0.24, belt: 0.82, roof: 1.36, hoodY: 0.8, deckY: 0.84, wsBase: 0.5, wsTop: -0.25, rwTop: -1.2, rwBase: -1.75, axles: [1.65, -1.6], wr: 0.36, ww: 0.13, round: 0.05, tumble: 0.16, cpillar: 0.14, noseTaper: 0.3 });
    M.box([0, 1.36, -0.72], [0.86, 0.03, 0.5], { bone: 'body', round: 0.03, k: 0.01, region: 'trim', prio: 2 });
    M.box([0, 0.42, 2.82], [1.0, 0.1, 0.06], { bone: 'body', round: 0.04, k: 0.01, region: 'rim', prio: 2 });
    M.box([0, 0.42, -2.82], [1.0, 0.1, 0.06], { bone: 'body', round: 0.04, k: 0.01, region: 'rim', prio: 2 });
  } },
  car_90s: { m: { mass: 1400, length: 4.6, width: 1.76, height: 1.4, wheel: 0.32 }, b(M) {
    car(M, { len: 4.6, wid: 1.76, sill: 0.22, belt: 0.84, roof: 1.38, hoodY: 0.7, deckY: 0.82, wsBase: 0.85, wsTop: -0.05, rwTop: -0.95, rwBase: -1.55, axles: [1.35, -1.35], wr: 0.32, ww: 0.1, round: 0.2, tumble: 0.38, noseTaper: 0.7 });
  } },
  pod: { m: { mass: 900, length: 3.0, width: 1.6, height: 1.65, wheel: 0.3 }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.ell([0, 0.9, 0], [0.8, 0.72, 1.5], { bone: 'body', k: K, region: 'paint' });
    M.box([0, 0.35, 0], [0.82, 0.12, 1.45], { bone: 'body', sub: true, k: 0.08, region: 'paint' });
    M.ell([0, 1.12, 0.15], [0.76, 0.5, 1.2], { bone: 'body', k: 0.02, region: 'glass', prio: 1 });
    M.box([0, 0.95, 1.46], [0.55, 0.035, 0.03], { bone: 'body', round: 0.03, k: 0.01, region: 'lens', prio: 3 });
    M.box([0, 0.95, -1.46], [0.6, 0.035, 0.03], { bone: 'body', round: 0.03, k: 0.01, region: 'glow', prio: 3 });
    wheels(M, [0.95, -0.95], 0.3, 0.09, { track: 0.72 });
  } },
  ev2080: { m: { mass: 1700, length: 4.9, width: 1.95, height: 1.35, wheel: 0.36 }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.ell([0, 0.72, 0.1], [0.97, 0.48, 2.45], { bone: 'body', k: K, region: 'paint' });
    M.box([0, 0.2, 0], [1.0, 0.16, 2.5], { bone: 'body', sub: true, k: 0.06, region: 'paint' });
    M.ell([0, 1.0, -0.35], [0.82, 0.36, 1.55], { bone: 'body', k: 0.1, region: 'glass' });
    M.box([0, 0.78, 2.45], [0.8, 0.025, 0.03], { bone: 'body', round: 0.02, k: 0.01, region: 'lens', prio: 3 });
    M.box([0, 0.86, -2.3], [0.9, 0.03, 0.04], { bone: 'body', round: 0.02, k: 0.01, region: 'glow', prio: 3 });
    for (const z of [1.5, -1.45]) for (const s of [1, -1]) M.cyl([s * 0.98, 0.36, z], 0.42, 0.2, { bone: 'body', rot: [0, 0, Math.PI / 2], sub: true, k: 0.02, region: 'trim' });
    wheels(M, [1.5, -1.45], 0.36, 0.12, { track: 0.86 });
  } },
  hover: { m: { mass: 1400, length: 5.0, width: 2.2, height: 1.2, flyer: true }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.ell([0, 0, 0], [1.05, 0.38, 2.5], { bone: 'body', k: K, region: 'paint' });
    M.ell([0, 0.32, -0.2], [0.75, 0.32, 1.3], { bone: 'body', k: 0.08, region: 'glass' });
    for (const s of [1, -1]) { M.box([s * 1.05, -0.05, -0.8], [0.25, 0.08, 1.1], { bone: 'body', round: 0.06, k: 0.06, region: 'paint' }); M.ell([s * 0.75, -0.3, 1.2], [0.28, 0.06, 0.35], { bone: 'body', k: 0.02, region: 'glow', prio: 2 }); M.ell([s * 0.75, -0.3, -1.5], [0.28, 0.06, 0.35], { bone: 'body', k: 0.02, region: 'glow', prio: 2 }); }
    M.box([0, 0.02, 2.48], [0.7, 0.025, 0.03], { bone: 'body', round: 0.02, k: 0.01, region: 'lens', prio: 3 });
  } },
  wagon: { m: { mass: 700, length: 3.6, width: 1.6, height: 2.6, wheel: 0.6 }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.ell([0, 1.35, -0.25], [0.78, 0.95, 1.35], { bone: 'body', k: 0.02, region: 'canvas' });
    M.ell([0, 1.35, -0.25], [0.74, 0.91, 1.6], { bone: 'body', sub: true, k: 0.01, region: 'canvas' });
    M.box([0, 0.6, -0.25], [1.0, 0.62, 1.7], { bone: 'body', sub: true, k: 0.01, region: 'canvas' });
    M.box([0, 0.95, -0.2], [0.68, 0.3, 1.5], { bone: 'body', round: 0.02, k: 0.01, region: 'wood' });
    M.box([0, 1.12, -0.2], [0.62, 0.2, 1.44], { bone: 'body', sub: true, k: 0.005, region: 'wood' });
    M.box([0, 0.72, 0.2], [0.05, 0.05, 2.2], { bone: 'body', k: 0.01, region: 'wood' });
    M.box([0, 1.3, 1.45], [0.6, 0.04, 0.2], { bone: 'body', k: 0.01, region: 'wood' });
    wheels(M, [0.75, -1.15], 0.55, 0.05, { track: 0.78, spokes: 12 });
  } },
  coach: { m: { mass: 1100, length: 4.0, width: 1.9, height: 2.7, wheel: 0.7 }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.box([0, 1.6, -0.2], [0.75, 0.75, 1.25], { bone: 'body', round: 0.25, k: 0.02, region: 'paint' });
    for (const s of [1, -1]) M.box([s * 0.76, 1.85, -0.2], [0.02, 0.28, 0.4], { bone: 'body', round: 0.05, k: 0.005, region: 'glass', prio: 2 });
    M.box([0, 2.4, -0.2], [0.68, 0.05, 1.1], { bone: 'body', round: 0.02, k: 0.01, region: 'wood' });
    M.box([0, 1.25, 1.35], [0.62, 0.05, 0.3], { bone: 'body', k: 0.01, region: 'wood' });
    M.box([0, 0.85, 0.2], [0.06, 0.06, 2.0], { bone: 'body', k: 0.01, region: 'wood' });
    wheels(M, [0.9, -1.3], 0.7, 0.05, { track: 0.85, spokes: 14 });
  } },
  loco: { m: { mass: 60000, length: 15.6, width: 3.0, height: 4.6, wheel: 0.85 }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.box([0, 1.25, -1.2], [0.95, 0.12, 6.6], { bone: 'body', round: 0.03, k: 0.01, region: 'metal' });
    M.cyl([0, 2.25, 1.85], 0.78, 2.75, { bone: 'body', rot: [0, Math.PI / 2, 0], round: 0.05, k: 0.03, region: 'metal' });
    M.cyl([0, 2.25, 5.0], 0.84, 0.42, { bone: 'body', rot: [0, Math.PI / 2, 0], round: 0.06, k: 0.02, region: 'metal' });
    M.cone([0, 2.9, 4.95], [0, 3.55, 4.95], 0.2, 0.28, { bone: 'body', k: 0.04, region: 'metal' });
    M.ell([0, 3.95, 4.95], [0.52, 0.42, 0.52], { bone: 'body', k: 0.08, region: 'metal' });
    M.cyl([0, 4.35, 4.95], 0.38, 0.06, { bone: 'body', k: 0.02, region: 'metal' });
    M.ell([0, 3.05, 2.6], [0.36, 0.42, 0.36], { bone: 'body', k: 0.12, region: 'brass' });
    M.ell([0, 3.0, 1.0], [0.3, 0.36, 0.3], { bone: 'body', k: 0.1, region: 'brass' });
    M.box([0, 3.35, 5.35], [0.32, 0.3, 0.32], { bone: 'body', round: 0.06, k: 0.02, region: 'metal' });
    M.box([0, 3.35, 5.68], [0.22, 0.18, 0.02], { bone: 'body', round: 0.05, k: 0.01, region: 'lens', prio: 3 });
    M.box([0, 2.55, -2.05], [1.35, 1.2, 1.15], { bone: 'body', round: 0.05, k: 0.02, region: 'paint' });
    M.box([0, 2.85, -2.05], [1.4, 0.4, 0.8], { bone: 'body', sub: true, k: 0.01, region: 'glass' });
    M.box([0, 3.82, -2.05], [1.55, 0.08, 1.45], { bone: 'body', round: 0.04, k: 0.02, region: 'metal' });
    for (const s of [1, -1]) M.cyl([s * 1.0, 1.05, 4.1], 0.3, 0.55, { bone: 'body', rot: [0, Math.PI / 2, 0], round: 0.04, k: 0.02, region: 'metal' });
    M.box([0, 0.55, 5.95], [0.85, 0.45, 0.55], { bone: 'body', rot: [0, -0.7, 0], round: 0.03, k: 0.02, region: 'red' });
    M.box([0, 1.4, -6.1], [1.3, 1.05, 2.6], { bone: 'body', round: 0.05, k: 0.02, region: 'paint' });
    M.ell([0, 2.45, -5.6], [1.0, 0.45, 1.6], { bone: 'body', k: 0.04, region: 'coal' });
    M.box([0, 0.7, -6.1], [1.0, 0.18, 2.4], { bone: 'body', k: 0.02, region: 'metal' });
    wheels(M, [1.95, 0.25], 0.85, 0.06, { track: 0.78, spokes: 14 });
    wheels(M, [4.85, 3.85, -4.6, -5.6, -7.0, -8.0], 0.44, 0.05, { track: 0.78, spokes: 8 });
  } },
  railcar_pass: { m: { mass: 25000, length: 11.4, width: 3.0, height: 4.2, wheel: 0.44 }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.box([0, 2.35, 0], [1.4, 1.2, 5.0], { bone: 'body', round: 0.04, k: 0.02, region: 'paint' });
    M.box([0, 3.62, 0], [1.5, 0.1, 5.5], { bone: 'body', round: 0.05, k: 0.03, region: 'metal' });
    M.box([0, 3.85, 0], [0.8, 0.22, 4.8], { bone: 'body', round: 0.05, k: 0.03, region: 'metal' });
    for (let i = 0; i < 8; i++) for (const s of [1, -1]) M.box([s * 1.41, 2.65, -4.0 + i * 1.14], [0.03, 0.38, 0.32], { bone: 'body', round: 0.04, k: 0.005, region: 'glass', prio: 2 });
    M.box([0, 1.1, 0], [1.3, 0.12, 5.6], { bone: 'body', k: 0.02, region: 'metal' });
    for (const z of [5.35, -5.35]) M.box([0, 1.25, z], [1.2, 0.04, 0.4], { bone: 'body', k: 0.01, region: 'metal' });
    wheels(M, [4.3, 3.4, -3.4, -4.3], 0.44, 0.05, { track: 0.78, spokes: 8 });
  } },
  railcar_box: { m: { mass: 20000, length: 11.4, width: 3.0, height: 4.1, wheel: 0.44 }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.box([0, 2.45, 0], [1.4, 1.35, 5.4], { bone: 'body', round: 0.03, k: 0.02, region: 'paint' });
    M.box([0, 3.85, 0], [1.48, 0.07, 5.5], { bone: 'body', round: 0.04, k: 0.02, region: 'metal' });
    for (const s of [1, -1]) M.box([s * 1.42, 2.4, 0], [0.04, 1.05, 0.9], { bone: 'body', round: 0.01, k: 0.005, region: 'wood' });
    M.box([0, 1.0, 0], [1.3, 0.12, 5.6], { bone: 'body', k: 0.02, region: 'metal' });
    wheels(M, [4.3, 3.4, -3.4, -4.3], 0.44, 0.05, { track: 0.78, spokes: 8 });
  } },
  drone: { m: { mass: 6, length: 0.9, width: 0.9, height: 0.25, flyer: true }, b(M) {
    M.bone('body', null, [0, 0, 0]);
    M.box([0, 0, 0], [0.13, 0.05, 0.18], { bone: 'body', round: 0.04, k: 0.01, region: 'paint' });
    M.ell([0, -0.06, 0.08], [0.04, 0.04, 0.04], { bone: 'body', k: 0.01, region: 'lens', prio: 2 });
    for (const [i, x, z] of [[0, 0.32, 0.32], [1, -0.32, 0.32], [2, 0.32, -0.32], [3, -0.32, -0.32]]) {
      M.cone([0, 0, 0], [x, 0.02, z], 0.025, 0.02, { bone: 'body', k: 0.01, region: 'trim' });
      M.cyl([x, 0.03, z], 0.03, 0.03, { bone: 'body', k: 0.01, region: 'trim' });
      M.bone('rot' + i, 'body', [x, 0.07, z]);
      M.box([x, 0.07, z], [0.17, 0.004, 0.022], { bone: 'rot' + i, round: 0.004, k: 0.003, region: 'trim' });
      M.ell([x, -0.02, z], [0.012, 0.012, 0.012], { bone: 'body', k: 0.004, region: 'glow', prio: 3 });
    }
  } },
};

export const variants = Object.entries(V).map(([id, d]) => ({
  id,
  meta: { ...d.m, speeds: {}, vehicle: true, lods: id === 'drone' ? [{ tris: 900 }, { tris: 260 }, { tris: 80 }] : [{ tris: 3200 }, { tris: 900 }, { tris: 240 }], cell: id === 'drone' ? 0.006 : d.m.length > 9 ? 0.034 : 0.018, ao: id === 'drone' ? [0.005, 0.015, 0.03, 0.06] : [0.02, 0.06, 0.15, 0.35], look: {}, pivot: [0, 0, 0], blend: 0.01, hops: 0, regionWeight: 6 },
  build() { const M = new Model(id, { k: K }); d.b(M); return M; },
  clips: id === 'drone' ? (rig) => [{ name: 'roll', frames: 8, loop: true, dur: 0.1, speed: 0, pose(t, P) { for (let i = 0; i < 4; i++) P.ry[rig.i('rot' + i)] = (i % 2 ? 1 : -1) * t * Math.PI * 2; } }, { name: 'idle', frames: 2, loop: true, dur: 1, speed: 0, pose() {} }] : ROLL(d.m.wheel || 0.35),
}));

export function variant(id) { return variants.find((v) => v.id === id); }
