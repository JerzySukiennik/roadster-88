// Roadster 88 people: hand-scripted procedural humans (SDF anatomy for two builds, faces, hands, hair) dressed per period (native Californians in tule and deerskin, a mission padre and a vaquero, a Gold Rush miner, 1885 frontier, 1900s suits and Gibson hats, 1920s fedoras and cloches, 1950s jeans and poodle skirts, 1970s bell-bottoms, 1990s caps and denim, 2026 casual, 2080 tech wear, far-future suits), one shared rig and clips (idle, talk, walk, run, flee, dodge, fall, lie, get up, wave, point, cheer, cower, sit). No scans, no downloaded models, nobody's real likeness.
import { Model } from '../sdf.js';
import { X, SIDES } from '../anatomy.js';
import { TAU, clamp, lerp, smooth, wave, aim, foot } from '../gaits.js';

const BASE = { mass: 75, length: 0.5, height: 1.76, hip: 0.95, speeds: { walk: 1.35, run: 4.2, flee: 6.2 }, lods: [{ tris: 5200 }, { tris: 1300 }, { tris: 320 }], cell: 0.0062, ao: [0.006, 0.016, 0.04, 0.08], look: { neck: 0.35, head: 1 }, pivot: [0, 1.5, 0], blend: 0.012, hops: 1, regionWeight: 4 };

function skeleton(M, f) {
  const w = f ? 0.92 : 1;
  M.bone('hips', null, [0, 0.96, 0]);
  M.bone('spine', 'hips', [0, 1.1, 0.0]);
  M.bone('chest', 'spine', [0, 1.3, 0.0]);
  M.bone('neck', 'chest', [0, 1.49, 0.0]);
  M.bone('head', 'neck', [0, 1.59, 0.015]);
  for (const [s, L] of SIDES) {
    M.bone('arm' + L, 'chest', X(s, [0.18 * w, 1.425, -0.01]));
    M.bone('fore' + L, 'arm' + L, X(s, [0.27 * w, 1.165, -0.03]));
    M.bone('hand' + L, 'fore' + L, X(s, [0.33 * w, 0.93, 0.0]));
    M.bone('thigh' + L, 'hips', X(s, [0.092, 0.92, 0]));
    M.bone('shin' + L, 'thigh' + L, X(s, [0.1, 0.5, 0.012]));
    M.bone('foot' + L, 'shin' + L, X(s, [0.1, 0.085, -0.02]));
    M.bone('toe' + L, 'foot' + L, X(s, [0.1, 0.028, 0.125]));
  }
}

function body(M, f, R) {
  const w = f ? 0.92 : 1, r = (k) => R[k] || 'skin';
  M.ell([0, 0.97, -0.005], [0.165 * (f ? 1.07 : 1), 0.12, 0.11], { bone: 'hips', region: r('hips'), k: 0.04 });
  M.ell([0, 1.11, 0.008], [0.145 * (f ? 0.9 : 1), 0.13, 0.095], { bone: 'spine', region: r('torso'), k: 0.05 });
  M.ell([0, 1.3, 0.0], [0.165 * w, 0.165, 0.105], { bone: 'chest', region: r('torso'), k: 0.05 });
  if (f) for (const s of [1, -1]) M.ell([0.055 * s, 1.29, 0.06], [0.055, 0.05, 0.05], { bone: 'chest', region: r('torso'), k: 0.03 });
  else M.ell([0, 1.33, 0.04], [0.15, 0.08, 0.07], { bone: 'chest', region: r('torso'), k: 0.04 });
  M.ell([0, 1.42, -0.015], [0.15 * w, 0.055, 0.075], { bone: 'chest', region: r('torso'), k: 0.04 });
  M.ell([0, 1.45, -0.03], [0.1 * w, 0.045, 0.05], { bone: 'chest', region: r('torso'), k: 0.05 });
  M.ell([0, 0.93, -0.075], [0.13 * (f ? 1.08 : 1), 0.09, 0.07], { bone: 'hips', region: r('hips'), k: 0.04 });
  M.ell([0, 1.21, -0.07], [0.12 * w, 0.12, 0.05], { bone: 'spine', region: r('torso'), k: 0.05 });
  M.cone([0, 1.46, -0.005], [0, 1.585, 0.01], 0.054 * w, 0.048 * w, { bone: 'neck', bone2: 'head', region: r('neck'), k: 0.03 });
  M.ell([0, 1.665, 0.012], [0.077 * w, 0.1, 0.097], { bone: 'head', region: 'skin', k: 0.02 });
  M.ell([0, 1.598, 0.048], [0.062 * w, 0.048, 0.06], { bone: 'head', region: 'skin', k: 0.025 });
  M.ell([0, 1.575, 0.075], [0.03, 0.022, 0.03], { bone: 'head', region: 'skin', k: 0.02 });
  M.cone([0, 1.648, 0.094], [0, 1.618, 0.118], 0.014, 0.012, { bone: 'head', region: 'skin', k: 0.012 });
  M.ell([0, 1.692, 0.088], [0.055, 0.016, 0.022], { bone: 'head', region: 'brow', k: 0.015 });
  M.ell([0, 1.598, 0.098], [0.022, 0.006, 0.01], { bone: 'head', region: 'lip', k: 0.006, prio: 1 });
  for (const s of [1, -1]) {
    M.ell([0.032 * s, 1.664, 0.086], [0.016, 0.01, 0.012], { bone: 'head', sub: true, k: 0.008 });
    M.ell([0.032 * s, 1.664, 0.081], [0.012, 0.0095, 0.01], { bone: 'head', region: 'sclera', k: 0.002, prio: 2 });
    M.ell([0.032 * s, 1.664, 0.0905], [0.0055, 0.0055, 0.003], { bone: 'head', region: 'eye', k: 0.001, prio: 3 });
    M.ell([0.078 * w * s, 1.655, 0.0], [0.012, 0.03, 0.02], { bone: 'head', region: 'skin', k: 0.01 });
  }
  for (const [s, L] of SIDES) {
    const sh = X(s, [0.18 * w, 1.425, -0.01]), el = X(s, [0.27 * w, 1.165, -0.03]), wr = X(s, [0.33 * w, 0.93, 0.0]);
    M.ell(X(s, [0.155 * w, 1.42, -0.01]), [0.06, 0.055, 0.058], { bone: 'arm' + L, region: r('shoulder'), k: 0.03 });
    M.cone(sh, el, 0.046 * w, 0.037 * w, { bone: 'arm' + L, region: r('upper'), k: 0.02 });
    M.ell(X(s, [0.23 * w, 1.3, -0.01]), [0.035, 0.07, 0.04], { bone: 'arm' + L, rot: [0, 0, s * 0.35], region: r('upper'), k: 0.02 });
    M.cone(el, wr, 0.036 * w, 0.025 * w, { bone: 'fore' + L, region: r('fore'), k: 0.018 });
    M.ell(X(s, [0.295 * w, 1.08, -0.02]), [0.03, 0.06, 0.032], { bone: 'fore' + L, rot: [0, 0, s * 0.25], region: r('fore'), k: 0.015 });
    M.ell(X(s, [0.345 * w, 0.865, 0.012]), [0.017, 0.05, 0.036], { bone: 'hand' + L, rot: [0, 0, s * 0.2], region: 'skin', k: 0.012 });
    M.cone(X(s, [0.34 * w, 0.9, 0.035]), X(s, [0.335 * w, 0.86, 0.06]), 0.011, 0.008, { bone: 'hand' + L, region: 'skin', k: 0.008 });
    M.cone(X(s, [0.36 * w, 0.83, 0.01]), X(s, [0.37 * w, 0.785, 0.015]), 0.014, 0.01, { bone: 'hand' + L, region: 'skin', k: 0.01 });
    const hp = X(s, [0.092, 0.92, 0]), kn = X(s, [0.1, 0.5, 0.012]), an = X(s, [0.1, 0.085, -0.02]);
    M.cone(hp, kn, 0.082 * (f ? 1.04 : 1), 0.052, { bone: 'thigh' + L, region: r('thigh'), k: 0.03 });
    M.ell(X(s, [0.098, 0.74, 0.02]), [0.065, 0.16, 0.065], { bone: 'thigh' + L, region: r('thigh'), k: 0.03 });
    M.cone(kn, an, 0.05, 0.033, { bone: 'shin' + L, region: r('shin'), k: 0.02 });
    M.ell(X(s, [0.1, 0.36, -0.018]), [0.045, 0.1, 0.045], { bone: 'shin' + L, region: r('shin'), k: 0.02 });
    M.ell(X(s, [0.1, 0.055, 0.04]), [0.042, 0.04, 0.11], { bone: 'foot' + L, region: r('foot'), k: 0.02 });
    M.ell(X(s, [0.1, 0.035, 0.15]), [0.042, 0.03, 0.06], { bone: 'toe' + L, region: r('foot'), k: 0.02 });
  }
}

const OUTFITS = {
  m1885(M) {
    body(M, false, { hips: 'pants', torso: 'shirt', neck: 'skin', shoulder: 'shirt', upper: 'shirt', fore: 'shirt', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    M.ell([0, 1.2, 0.0], [0.175, 0.24, 0.115], { bone: 'chest', region: 'vest', k: 0.02 });
    M.cyl([0, 0.99, 0], 0.168, 0.025, { bone: 'hips', region: 'belt', k: 0.01, prio: 1 });
    for (const [s, L] of SIDES) M.cone(X(s, [0.1, 0.38, -0.01]), X(s, [0.1, 0.06, 0.0]), 0.06, 0.05, { bone: 'shin' + L, region: 'shoes', k: 0.02 });
    M.cyl([0, 1.745, 0.005], 0.19, 0.006, { bone: 'head', region: 'hat', round: 0.005, k: 0.012 });
    M.ell([0, 1.785, 0.005], [0.09, 0.065, 0.105], { bone: 'head', region: 'hat', k: 0.02 });
    M.ell([0, 1.69, -0.02], [0.082, 0.07, 0.095], { bone: 'head', region: 'hair', k: 0.02 });
    M.ell([0, 1.585, 0.06], [0.06, 0.04, 0.05], { bone: 'head', region: 'hair', k: 0.015 });
  },
  f1885(M) {
    body(M, true, { hips: 'dress', torso: 'dress', neck: 'dress', shoulder: 'dress', upper: 'dress', fore: 'dress', thigh: 'dress', shin: 'skin', foot: 'shoes' });
    M.cone([0, 1.04, 0], [0, 0.07, 0.0], 0.15, 0.37, { bone: 'hips', region: 'dress', k: 0.06 });
    M.cyl([0, 1.04, 0], 0.15, 0.018, { bone: 'hips', region: 'belt', k: 0.01, prio: 1 });
    M.ell([0, 1.7, -0.025], [0.085, 0.08, 0.1], { bone: 'head', region: 'hair', k: 0.02 });
    M.ell([0, 1.69, -0.11], [0.05, 0.045, 0.045], { bone: 'head', region: 'hair', k: 0.02 });
    M.ell([0, 1.73, 0.0], [0.11, 0.06, 0.12], { bone: 'head', region: 'hat', k: 0.02 });
    M.cyl([0, 1.705, 0.02], 0.15, 0.005, { bone: 'head', region: 'hat', round: 0.004, k: 0.01 });
  },
  m2026(M) {
    body(M, false, { hips: 'pants', torso: 'shirt', neck: 'skin', shoulder: 'shirt', upper: 'shirt', fore: 'skin', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    M.ell([0, 1.15, 0.0], [0.168, 0.06, 0.112], { bone: 'spine', region: 'shirt', k: 0.02 });
    for (const [s, L] of SIDES) { M.cone(X(s, [0.2, 1.4, -0.01]), X(s, [0.245, 1.27, -0.02]), 0.054, 0.05, { bone: 'arm' + L, region: 'shirt', k: 0.015 }); M.ell(X(s, [0.1, 0.06, 0.06]), [0.05, 0.05, 0.14], { bone: 'foot' + L, region: 'shoes', k: 0.02 }); M.ell(X(s, [0.1, 0.012, 0.06]), [0.052, 0.012, 0.14], { bone: 'foot' + L, region: 'sole', k: 0.01, prio: 1 }); }
    M.ell([0, 1.705, -0.01], [0.083, 0.065, 0.098], { bone: 'head', region: 'hair', k: 0.015 });
  },
  f2026(M) {
    body(M, true, { hips: 'pants', torso: 'shirt', neck: 'skin', shoulder: 'shirt', upper: 'skin', fore: 'skin', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    for (const [s, L] of SIDES) { M.ell(X(s, [0.1, 0.06, 0.05]), [0.045, 0.045, 0.12], { bone: 'foot' + L, region: 'shoes', k: 0.02 }); M.ell(X(s, [0.1, 0.012, 0.05]), [0.047, 0.012, 0.12], { bone: 'foot' + L, region: 'sole', k: 0.01, prio: 1 }); }
    M.ell([0, 1.69, -0.025], [0.086, 0.09, 0.1], { bone: 'head', region: 'hair', k: 0.02 });
    M.cone([0, 1.66, -0.09], [0, 1.4, -0.11], 0.05, 0.03, { bone: 'head', region: 'hair', k: 0.02 });
  },
  m2080(M) {
    body(M, false, { hips: 'pants', torso: 'shirt', neck: 'shirt', shoulder: 'shirt', upper: 'shirt', fore: 'shirt', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    M.ell([0, 1.33, 0.0], [0.178, 0.19, 0.118], { bone: 'chest', region: 'shirt', k: 0.02 });
    M.ell([0, 1.45, -0.03], [0.09, 0.06, 0.08], { bone: 'neck', region: 'vest', k: 0.02 });
    for (const [s, L] of SIDES) { M.ell(X(s, [0.1, 0.06, 0.06]), [0.05, 0.05, 0.14], { bone: 'foot' + L, region: 'shoes', k: 0.02 }); M.ell(X(s, [0.1, 0.012, 0.06]), [0.052, 0.012, 0.14], { bone: 'foot' + L, region: 'glow', k: 0.01, prio: 1 }); }
    M.box([0, 1.668, 0.085], [0.075, 0.016, 0.02], { bone: 'head', region: 'lens', round: 0.012, k: 0.01, prio: 2 });
    M.ell([0, 1.71, -0.015], [0.082, 0.06, 0.096], { bone: 'head', region: 'hair', k: 0.015 });
  },
  f2080(M) {
    body(M, true, { hips: 'pants', torso: 'shirt', neck: 'skin', shoulder: 'shirt', upper: 'shirt', fore: 'shirt', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    M.ell([0, 1.28, 0.0], [0.165, 0.2, 0.112], { bone: 'chest', region: 'shirt', k: 0.02 });
    M.cyl([0, 1.08, 0], 0.15, 0.012, { bone: 'spine', region: 'glow', k: 0.008, prio: 1 });
    for (const [s, L] of SIDES) { M.ell(X(s, [0.1, 0.06, 0.05]), [0.045, 0.045, 0.12], { bone: 'foot' + L, region: 'shoes', k: 0.02 }); }
    M.ell([0, 1.7, -0.02], [0.084, 0.075, 0.095], { bone: 'head', region: 'hair', k: 0.015 });
  },
  mnative(M) {
    body(M, false, { hips: 'dress', torso: 'skin', neck: 'skin', shoulder: 'skin', upper: 'skin', fore: 'skin', thigh: 'skin', shin: 'skin', foot: 'skin' });
    M.cone([0, 1.0, 0], [0, 0.66, 0.0], 0.18, 0.24, { bone: 'hips', region: 'dress', k: 0.04 });
    M.cyl([0, 1.0, 0], 0.172, 0.02, { bone: 'hips', region: 'belt', k: 0.01, prio: 1 });
    M.ell([0, 1.69, -0.03], [0.084, 0.085, 0.1], { bone: 'head', region: 'hair', k: 0.02 });
    M.cone([0, 1.66, -0.08], [0, 1.3, -0.12], 0.07, 0.05, { bone: 'head', region: 'hair', k: 0.03 });
    M.cyl([0, 1.735, -0.01], 0.088, 0.012, { bone: 'head', region: 'hat', k: 0.008, prio: 1 });
  },
  fnative(M) {
    body(M, true, { hips: 'dress', torso: 'vest', neck: 'skin', shoulder: 'vest', upper: 'skin', fore: 'skin', thigh: 'dress', shin: 'skin', foot: 'skin' });
    M.cone([0, 1.04, 0], [0, 0.42, 0.0], 0.15, 0.3, { bone: 'hips', region: 'dress', k: 0.05 });
    M.ell([0, 1.36, -0.01], [0.21, 0.09, 0.14], { bone: 'chest', region: 'vest', k: 0.03 });
    M.ell([0, 1.7, -0.025], [0.086, 0.088, 0.1], { bone: 'head', region: 'hair', k: 0.02 });
    M.cone([0, 1.66, -0.09], [0, 1.25, -0.12], 0.07, 0.06, { bone: 'head', region: 'hair', k: 0.03 });
    M.ell([0, 1.745, -0.005], [0.095, 0.055, 0.105], { bone: 'head', region: 'hat', k: 0.015 });
  },
  mpadre(M) {
    body(M, false, { hips: 'dress', torso: 'dress', neck: 'skin', shoulder: 'dress', upper: 'dress', fore: 'dress', thigh: 'dress', shin: 'dress', foot: 'shoes' });
    M.cone([0, 1.1, 0], [0, 0.06, 0.0], 0.18, 0.33, { bone: 'hips', region: 'dress', k: 0.06 });
    for (const [s, L] of SIDES) M.cone(X(s, [0.27, 1.17, -0.03]), X(s, [0.34, 0.9, 0.02]), 0.06, 0.085, { bone: 'fore' + L, region: 'dress', k: 0.02 });
    M.ell([0, 1.5, -0.1], [0.12, 0.13, 0.08], { bone: 'chest', region: 'dress', k: 0.03 });
    M.cyl([0, 1.02, 0], 0.17, 0.012, { bone: 'hips', region: 'belt', k: 0.01, prio: 1 });
    M.ell([0, 1.68, -0.035], [0.08, 0.055, 0.09], { bone: 'head', region: 'hair', k: 0.015 });
  },
  mvaquero(M) {
    body(M, false, { hips: 'pants', torso: 'shirt', neck: 'skin', shoulder: 'vest', upper: 'vest', fore: 'shirt', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    M.ell([0, 1.3, 0.0], [0.178, 0.17, 0.118], { bone: 'chest', region: 'vest', k: 0.02 });
    M.cyl([0, 1.0, 0], 0.17, 0.035, { bone: 'hips', region: 'belt', k: 0.01, prio: 1 });
    for (const [s, L] of SIDES) M.cone(X(s, [0.1, 0.4, -0.01]), X(s, [0.1, 0.06, 0.0]), 0.062, 0.052, { bone: 'shin' + L, region: 'shoes', k: 0.02 });
    M.cyl([0, 1.75, 0.005], 0.29, 0.007, { bone: 'head', region: 'hat', round: 0.006, k: 0.014 });
    M.cone([0, 1.75, 0.005], [0, 1.88, 0.005], 0.1, 0.06, { bone: 'head', region: 'hat', k: 0.02 });
    M.ell([0, 1.69, -0.02], [0.082, 0.07, 0.095], { bone: 'head', region: 'hair', k: 0.02 });
    M.ell([0, 1.6, 0.075], [0.045, 0.012, 0.02], { bone: 'head', region: 'hair', k: 0.008, prio: 1 });
  },
  mminer(M) {
    body(M, false, { hips: 'pants', torso: 'shirt', neck: 'skin', shoulder: 'shirt', upper: 'shirt', fore: 'shirt', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    for (const s of [1, -1]) M.box([0.075 * s, 1.22, 0.1], [0.012, 0.22, 0.01], { bone: 'chest', region: 'belt', k: 0.006, prio: 1 });
    M.cyl([0, 0.99, 0], 0.168, 0.025, { bone: 'hips', region: 'belt', k: 0.01, prio: 1 });
    for (const [s, L] of SIDES) M.cone(X(s, [0.1, 0.36, -0.01]), X(s, [0.1, 0.06, 0.0]), 0.064, 0.054, { bone: 'shin' + L, region: 'shoes', k: 0.02 });
    M.cyl([0, 1.74, 0.005], 0.17, 0.008, { bone: 'head', region: 'hat', round: 0.008, k: 0.02 });
    M.ell([0, 1.775, 0.0], [0.095, 0.055, 0.1], { bone: 'head', region: 'hat', k: 0.03 });
    M.ell([0, 1.69, -0.02], [0.082, 0.07, 0.095], { bone: 'head', region: 'hair', k: 0.02 });
    M.ell([0, 1.575, 0.065], [0.065, 0.05, 0.055], { bone: 'head', region: 'hair', k: 0.02 });
  },
  m1900(M) {
    body(M, false, { hips: 'pants', torso: 'vest', neck: 'shirt', shoulder: 'vest', upper: 'vest', fore: 'vest', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    M.ell([0, 1.2, 0.0], [0.176, 0.27, 0.118], { bone: 'chest', region: 'vest', k: 0.02 });
    M.cone([0, 1.04, -0.02], [0, 0.82, -0.04], 0.17, 0.19, { bone: 'hips', region: 'vest', k: 0.03 });
    M.box([0, 1.4, 0.1], [0.025, 0.07, 0.01], { bone: 'chest', region: 'shirt', k: 0.008, prio: 1 });
    M.cyl([0, 1.745, 0.005], 0.13, 0.006, { bone: 'head', region: 'hat', round: 0.005, k: 0.012 });
    M.ell([0, 1.79, 0.005], [0.085, 0.06, 0.098], { bone: 'head', region: 'hat', k: 0.015 });
    M.ell([0, 1.69, -0.02], [0.082, 0.07, 0.095], { bone: 'head', region: 'hair', k: 0.02 });
    M.ell([0, 1.605, 0.085], [0.04, 0.012, 0.02], { bone: 'head', region: 'hair', k: 0.008, prio: 1 });
  },
  f1900(M) {
    body(M, true, { hips: 'dress', torso: 'shirt', neck: 'shirt', shoulder: 'shirt', upper: 'shirt', fore: 'shirt', thigh: 'dress', shin: 'skin', foot: 'shoes' });
    M.cone([0, 1.04, 0], [0, 0.06, 0.0], 0.14, 0.34, { bone: 'hips', region: 'dress', k: 0.06 });
    for (const [s, L] of SIDES) M.ell(X(s, [0.19, 1.38, -0.01]), [0.075, 0.08, 0.075], { bone: 'arm' + L, region: 'shirt', k: 0.02 });
    M.ell([0, 1.73, -0.035], [0.095, 0.075, 0.11], { bone: 'head', region: 'hair', k: 0.02 });
    M.cyl([0, 1.765, 0.0], 0.2, 0.008, { bone: 'head', region: 'hat', round: 0.006, k: 0.012 });
    M.ell([0, 1.8, -0.01], [0.1, 0.05, 0.11], { bone: 'head', region: 'hat', k: 0.02 });
  },
  m1920(M) {
    body(M, false, { hips: 'pants', torso: 'vest', neck: 'shirt', shoulder: 'vest', upper: 'vest', fore: 'vest', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    M.ell([0, 1.22, 0.0], [0.18, 0.25, 0.12], { bone: 'chest', region: 'vest', k: 0.02 });
    M.box([0, 1.3, 0.11], [0.018, 0.12, 0.008], { bone: 'chest', region: 'belt', k: 0.006, prio: 1 });
    M.cyl([0, 1.745, 0.005], 0.165, 0.006, { bone: 'head', region: 'hat', round: 0.005, k: 0.012 });
    M.ell([0, 1.795, 0.005], [0.088, 0.065, 0.1], { bone: 'head', region: 'hat', k: 0.02 });
    M.box([0, 1.84, 0.005], [0.02, 0.015, 0.07], { bone: 'head', sub: true, k: 0.02 });
    M.ell([0, 1.69, -0.02], [0.082, 0.065, 0.095], { bone: 'head', region: 'hair', k: 0.015 });
  },
  f1920(M) {
    body(M, true, { hips: 'dress', torso: 'dress', neck: 'skin', shoulder: 'dress', upper: 'skin', fore: 'skin', thigh: 'dress', shin: 'skin', foot: 'shoes' });
    M.cone([0, 1.12, 0], [0, 0.5, 0.0], 0.16, 0.22, { bone: 'hips', region: 'dress', k: 0.04 });
    M.ell([0, 1.69, -0.01], [0.09, 0.075, 0.103], { bone: 'head', region: 'hair', k: 0.015 });
    M.ell([0, 1.73, -0.005], [0.096, 0.07, 0.108], { bone: 'head', region: 'hat', k: 0.015 });
    M.cyl([0, 1.69, 0.01], 0.115, 0.008, { bone: 'head', region: 'hat', round: 0.006, k: 0.01 });
  },
  m1950(M) {
    body(M, false, { hips: 'pants', torso: 'shirt', neck: 'skin', shoulder: 'shirt', upper: 'shirt', fore: 'skin', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    for (const [s, L] of SIDES) { M.cone(X(s, [0.2, 1.4, -0.01]), X(s, [0.24, 1.29, -0.02]), 0.055, 0.05, { bone: 'arm' + L, region: 'shirt', k: 0.015 }); M.ell(X(s, [0.1, 0.06, 0.06]), [0.05, 0.05, 0.14], { bone: 'foot' + L, region: 'shoes', k: 0.02 }); M.ell(X(s, [0.1, 0.012, 0.06]), [0.052, 0.012, 0.14], { bone: 'foot' + L, region: 'sole', k: 0.01, prio: 1 }); }
    M.cyl([0, 0.99, 0], 0.168, 0.02, { bone: 'hips', region: 'belt', k: 0.01, prio: 1 });
    M.ell([0, 1.71, 0.0], [0.083, 0.07, 0.1], { bone: 'head', region: 'hair', k: 0.015 });
    M.ell([0, 1.76, 0.06], [0.06, 0.035, 0.05], { bone: 'head', region: 'hair', k: 0.02 });
  },
  f1950(M) {
    body(M, true, { hips: 'dress', torso: 'shirt', neck: 'skin', shoulder: 'shirt', upper: 'skin', fore: 'skin', thigh: 'dress', shin: 'skin', foot: 'shoes' });
    M.cone([0, 1.05, 0], [0, 0.5, 0.0], 0.14, 0.36, { bone: 'hips', region: 'dress', k: 0.05 });
    M.cyl([0, 1.05, 0], 0.15, 0.02, { bone: 'hips', region: 'belt', k: 0.01, prio: 1 });
    M.ell([0, 1.7, -0.025], [0.085, 0.08, 0.1], { bone: 'head', region: 'hair', k: 0.02 });
    M.cone([0, 1.72, -0.1], [0, 1.45, -0.15], 0.04, 0.025, { bone: 'head', region: 'hair', k: 0.02 });
    M.ell([0, 1.72, -0.085], [0.025, 0.02, 0.02], { bone: 'head', region: 'hat', k: 0.006, prio: 1 });
  },
  m1970(M) {
    body(M, false, { hips: 'pants', torso: 'shirt', neck: 'skin', shoulder: 'shirt', upper: 'shirt', fore: 'shirt', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    for (const [s, L] of SIDES) M.cone(X(s, [0.1, 0.42, 0.0]), X(s, [0.1, 0.03, 0.02]), 0.052, 0.09, { bone: 'shin' + L, region: 'pants', k: 0.02 });
    M.cyl([0, 0.99, 0], 0.168, 0.025, { bone: 'hips', region: 'belt', k: 0.01, prio: 1 });
    M.ell([0, 1.69, -0.03], [0.095, 0.095, 0.11], { bone: 'head', region: 'hair', k: 0.02 });
    M.ell([0, 1.55, -0.07], [0.1, 0.09, 0.07], { bone: 'head', region: 'hair', k: 0.03 });
    M.ell([0, 1.58, 0.07], [0.05, 0.03, 0.04], { bone: 'head', region: 'hair', k: 0.015 });
  },
  f1970(M) {
    body(M, true, { hips: 'pants', torso: 'shirt', neck: 'skin', shoulder: 'shirt', upper: 'shirt', fore: 'shirt', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    for (const [s, L] of SIDES) M.cone(X(s, [0.1, 0.42, 0.0]), X(s, [0.1, 0.03, 0.02]), 0.048, 0.085, { bone: 'shin' + L, region: 'pants', k: 0.02 });
    M.ell([0, 1.69, -0.03], [0.092, 0.095, 0.105], { bone: 'head', region: 'hair', k: 0.02 });
    M.cone([0, 1.64, -0.07], [0, 1.28, -0.1], 0.1, 0.08, { bone: 'head', region: 'hair', k: 0.03 });
    M.cyl([0, 1.72, 0.0], 0.095, 0.01, { bone: 'head', region: 'hat', k: 0.006, prio: 1 });
  },
  m1990(M) {
    body(M, false, { hips: 'pants', torso: 'shirt', neck: 'skin', shoulder: 'shirt', upper: 'shirt', fore: 'skin', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    M.ell([0, 1.2, 0.0], [0.19, 0.24, 0.125], { bone: 'chest', region: 'shirt', k: 0.02 });
    for (const [s, L] of SIDES) { M.cone(X(s, [0.1, 0.92, 0.0]), X(s, [0.1, 0.06, 0.02]), 0.09, 0.075, { bone: 'thigh' + L, bone2: 'shin' + L, region: 'pants', k: 0.03 }); M.ell(X(s, [0.1, 0.07, 0.06]), [0.058, 0.06, 0.15], { bone: 'foot' + L, region: 'shoes', k: 0.02 }); M.ell(X(s, [0.1, 0.014, 0.06]), [0.06, 0.014, 0.15], { bone: 'foot' + L, region: 'sole', k: 0.01, prio: 1 }); }
    M.ell([0, 1.735, 0.0], [0.09, 0.05, 0.1], { bone: 'head', region: 'hat', k: 0.015 });
    M.box([0, 1.725, 0.12], [0.07, 0.008, 0.06], { bone: 'head', region: 'hat', round: 0.006, k: 0.01 });
    M.ell([0, 1.69, -0.03], [0.082, 0.06, 0.09], { bone: 'head', region: 'hair', k: 0.015 });
  },
  f1990(M) {
    body(M, true, { hips: 'pants', torso: 'shirt', neck: 'skin', shoulder: 'vest', upper: 'vest', fore: 'vest', thigh: 'pants', shin: 'pants', foot: 'shoes' });
    M.ell([0, 1.28, 0.0], [0.17, 0.21, 0.115], { bone: 'chest', region: 'vest', k: 0.02 });
    for (const [s, L] of SIDES) { M.ell(X(s, [0.1, 0.06, 0.05]), [0.048, 0.05, 0.13], { bone: 'foot' + L, region: 'shoes', k: 0.02 }); M.ell(X(s, [0.1, 0.012, 0.05]), [0.05, 0.012, 0.13], { bone: 'foot' + L, region: 'sole', k: 0.01, prio: 1 }); }
    M.ell([0, 1.7, -0.02], [0.092, 0.095, 0.108], { bone: 'head', region: 'hair', k: 0.02 });
    M.cone([0, 1.7, -0.1], [0, 1.4, -0.12], 0.06, 0.04, { bone: 'head', region: 'hair', k: 0.02 });
    M.ell([0, 1.72, -0.1], [0.04, 0.03, 0.03], { bone: 'head', region: 'hat', k: 0.008, prio: 1 });
  },
  scifi(M) {
    body(M, false, { hips: 'shirt', torso: 'shirt', neck: 'shirt', shoulder: 'vest', upper: 'shirt', fore: 'shirt', thigh: 'shirt', shin: 'shirt', foot: 'shoes' });
    for (const [s, L] of SIDES) { M.ell(X(s, [0.16, 1.43, -0.01]), [0.075, 0.06, 0.07], { bone: 'arm' + L, region: 'vest', k: 0.02 }); M.cyl(X(s, [0.33, 0.95, 0.0]), 0.034, 0.012, { bone: 'fore' + L, region: 'glow', k: 0.006, prio: 1 }); }
    M.ell([0, 1.47, -0.02], [0.08, 0.05, 0.08], { bone: 'neck', region: 'vest', k: 0.02 });
    M.cyl([0, 1.12, 0], 0.15, 0.006, { bone: 'spine', region: 'glow', k: 0.006, prio: 1 });
    M.ell([0, 1.705, -0.012], [0.079, 0.06, 0.094], { bone: 'head', region: 'hair', k: 0.012 });
  },
};

export const variants = Object.keys(OUTFITS).map((v) => ({
  id: 'human_' + v,
  meta: { ...BASE, height: v.startsWith('f') ? 1.66 : 1.78 },
  build() { const M = new Model('human_' + v, { k: 0.02 }); skeleton(M, v.startsWith('f')); OUTFITS[v](M); return M; },
  clips: (rig) => clips(rig, v.startsWith('f'), v),
}));

export function variant(v) { return variants.find((x) => x.id === 'human_' + v || x.id === v); }

export function clips(rig, fem, outfit) {
  const I = (n) => rig.i(n);
  const legsOf = ['L', 'R'].map((L, i) => {
    const an = rig.joint('foot' + L), hp = rig.joint('thigh' + L);
    return { L, off: i * 0.5, an, hp };
  });
  const skirt = ['f1885', 'f1900', 'mpadre'].includes(outfit);
  const armRest = (P, k = 1) => { for (const [s, L] of SIDES) { P.rz[I('arm' + L)] += -s * 0.22 * k; P.rx[I('fore' + L)] += -0.18 * k; } };
  const legIK = (P, Lg, y, z, footPitch, x = 0) => { rig.leg(P, ['thigh' + Lg.L, 'shin' + Lg.L, 'foot' + Lg.L], [Lg.an[0] + x, y, z]); aim(rig, P, 'foot' + Lg.L, footPitch); };
  const standLegs = (P, spread = 0) => { for (const Lg of legsOf) legIK(P, Lg, Lg.an[1], Lg.an[2], 0, Lg.an[0] > 0 ? spread : -spread); };
  const gait = (o) => (t, P) => {
    P.root[1] += o.bob * Math.cos(TAU * (2 * t - 0.05)) - o.sink;
    P.root[2] += o.lean * 0.3;
    P.rz[I('hips')] += o.roll * wave(t, 0.25);
    P.ry[I('hips')] += o.yaw * wave(t, 0.5);
    P.ry[I('chest')] += -o.yaw * 1.6 * wave(t, 0.5);
    P.rx[I('spine')] += o.lean; P.rx[I('chest')] += o.lean * 0.5;
    P.rx[I('neck')] += -o.lean * 0.8; P.rx[I('head')] += -o.lean * 0.4 + o.nod * wave(t, 0.1, 2);
    for (const [s, L] of SIDES) {
      const ph = L === 'L' ? 0 : 0.5;
      P.rx[I('arm' + L)] += o.arm * Math.cos(TAU * (t + ph)) + o.armBias;
      P.rz[I('arm' + L)] += -s * (o.armIn === undefined ? 0.2 : o.armIn);
      P.rx[I('fore' + L)] += -o.elbow - o.elbowSwing * (0.5 + 0.5 * Math.cos(TAU * (t + ph + 0.5)));
      if (o.flail) { P.rz[I('arm' + L)] += -s * o.flail * (0.6 + 0.4 * wave(t, ph, 2)); P.rx[I('arm' + L)] += -o.flail * 0.8; }
    }
    for (const Lg of legsOf) {
      const f = foot(t, Lg.off, o.duty, o.stride, o.lift, Lg.an[2]);
      let y = Lg.an[1] + f.y, fp;
      if (f.stance) { fp = f.s < 0.15 ? lerp(-0.3, 0, f.s / 0.15) : f.s > 0.6 ? lerp(0, o.push, smooth((f.s - 0.6) / 0.4)) : 0; y += f.s > 0.6 ? o.heel * smooth((f.s - 0.6) / 0.4) : 0; }
      else fp = f.s < 0.4 ? lerp(o.push, o.swingToe, smooth(f.s / 0.4)) : lerp(o.swingToe, -0.3, smooth((f.s - 0.4) / 0.6));
      legIK(P, Lg, y, f.z, fp);
    }
  };
  const loop = (name, frames, dur, stride, duty, o) => ({ name, frames, loop: true, dur, speed: stride / (duty * dur), stride, pose: gait({ ...o, stride, duty }) });
  const W = skirt ? 0.7 : 1;
  const idleBase = (P, t, k = 1) => {
    P.root[1] += 0.004 * wave(t, 0, 3) - 0.005;
    P.rz[I('hips')] += 0.025 * wave(t, 0) * k; P.root[0] += 0.015 * wave(t, 0) * k;
    P.rx[I('chest')] += 0.012 * wave(t, 0.2, 3);
    P.ry[I('neck')] += 0.2 * wave(t, 0.1) * k; P.ry[I('head')] += 0.25 * wave(t, 0.15) * k; P.rx[I('head')] += 0.04 * wave(t, 0.3, 2) * k;
    armRest(P);
    standLegs(P, 0.02);
  };
  const list = [
    { name: 'idle', frames: 48, loop: true, dur: 7, speed: 0, pose(t, P) { idleBase(P, t); } },
    { name: 'talk', frames: 48, loop: true, dur: 4, speed: 0, pose(t, P) { idleBase(P, t, 0.4); P.rx[I('armR')] += -0.35 - 0.2 * Math.max(0, wave(t, 0, 2)); P.rx[I('foreR')] += -0.9 + 0.3 * wave(t, 0.2, 3); P.ry[I('foreR')] += 0.3 * wave(t, 0.1, 2); P.rx[I('head')] += 0.05 * wave(t, 0, 4); P.ry[I('neck')] += 0.15 * wave(t, 0.4); } },
    loop('walk', 36, 1.08, 0.9 * W, 0.62, { bob: 0.022, sink: 0.012, roll: 0.05, yaw: 0.07, lean: 0.03, nod: 0.015, arm: 0.32 * (fem ? 0.8 : 1), armBias: 0.02, elbow: 0.2, elbowSwing: 0.18, lift: 0.07, push: 0.55, heel: 0.05, swingToe: 0.6 }),
    loop('run', 24, 0.7, 1.15 * W, 0.38, { bob: 0.05, sink: 0.07, roll: 0.03, yaw: 0.1, lean: 0.14, nod: 0.02, arm: 0.6, armBias: -0.05, elbow: 1.3, elbowSwing: 0.3, lift: 0.22, push: 0.9, heel: 0.12, swingToe: 1.2 }),
    loop('flee', 22, 0.62, 1.4 * W, 0.34, { bob: 0.06, sink: 0.09, roll: 0.03, yaw: 0.12, lean: 0.2, nod: 0.03, arm: 0.7, armBias: -0.25, elbow: 1.1, elbowSwing: 0.4, lift: 0.26, push: 1.0, heel: 0.14, swingToe: 1.4, flail: 0.45, armIn: 0.1 }),
    { name: 'dodge', frames: 32, loop: false, dur: 0.85, speed: 0, pose(t, P) {
      const k = smooth(t / 0.45), land = smooth((t - 0.45) / 0.5);
      P.root[1] += 0.2 * Math.sin(Math.PI * Math.min(1, t / 0.55)) - 0.62 * land;
      P.rz[I('hips')] += 0.9 * k + 0.4 * land;
      P.rx[I('spine')] += 0.25 * k;
      for (const [s, L] of SIDES) { P.rz[I('arm' + L)] += 1.2 * k * (s > 0 ? 1.2 : 0.6); P.rx[I('arm' + L)] += -0.8 * k; P.rx[I('fore' + L)] += -0.6; P.rx[I('thigh' + L)] += -0.6 * k; P.rx[I('shin' + L)] += 0.9 * k; }
    } },
    { name: 'fall', frames: 32, loop: false, dur: 1.0, speed: 0, pose(t, P) {
      const k = smooth(t);
      for (const [s, L] of SIDES) { P.rz[I('arm' + L)] += -s * (1.4 + 0.5 * Math.sin(t * 18 + s)) * (1 - 0.6 * k); P.rx[I('arm' + L)] += -1.2 + 0.8 * Math.sin(t * 13 + s); P.rx[I('fore' + L)] += -0.8; P.rx[I('thigh' + L)] += -0.9 * Math.sin(t * 10 + s) * (1 - k) - 0.4; P.rx[I('shin' + L)] += 0.9; P.rz[I('thigh' + L)] += s * 0.25; }
      P.rx[I('neck')] += 0.4 * (1 - k) - 0.3; P.rx[I('spine')] += -0.2;
    } },
    { name: 'lie', frames: 32, loop: true, dur: 4, speed: 0, pose(t, P) {
      P.rx[I('hips')] += -1.5; P.root[1] += -0.84; P.root[2] += -0.05;
      for (const [s, L] of SIDES) { P.rz[I('arm' + L)] += -s * 0.6; P.rx[I('arm' + L)] += -0.2; P.rx[I('fore' + L)] += -0.4; P.rx[I('thigh' + L)] += -0.15; P.rx[I('shin' + L)] += 0.3; P.rz[I('thigh' + L)] += s * 0.08; P.rx[I('foot' + L)] += 0.8; }
      P.rx[I('neck')] += 0.25 + 0.06 * wave(t, 0); P.ry[I('head')] += 0.3 * wave(t, 0.2);
    } },
    { name: 'getup', frames: 40, loop: false, dur: 1.9, speed: 0, pose(t, P) {
      const a = smooth(t / 0.45), b = smooth((t - 0.35) / 0.65);
      P.rx[I('hips')] += -1.5 * (1 - a) + 0.4 * a * (1 - b);
      P.root[1] += -0.84 * (1 - a) - 0.42 * a * (1 - b); P.root[2] += -0.05 * (1 - a);
      P.rx[I('spine')] += 0.55 * a * (1 - b); P.rx[I('chest')] += 0.25 * a * (1 - b);
      for (const [s, L] of SIDES) { P.rz[I('arm' + L)] += -s * 0.3; P.rx[I('arm' + L)] += -0.5 * a * (1 - b); P.rx[I('fore' + L)] += -0.5; }
      if (t > 0.3) { const k = smooth((t - 0.3) / 0.7); for (const Lg of legsOf) legIK(P, Lg, Lg.an[1], Lg.an[2] + 0.12 * (1 - k), 0); }
      else for (const L of ['L', 'R']) { P.rx[I('thigh' + L)] += -1.4 * smooth(t / 0.3); P.rx[I('shin' + L)] += 2.0 * smooth(t / 0.3); }
    } },
    { name: 'wave', frames: 36, loop: true, dur: 1.4, speed: 0, pose(t, P) { idleBase(P, t, 0.3); P.rx[I('armR')] += -0.3; P.rz[I('armR')] += 2.3; P.rz[I('foreR')] += 0.3 + 0.45 * Math.sin(TAU * t * 2); P.rx[I('foreR')] += -0.3; } },
    { name: 'point', frames: 32, loop: true, dur: 2.5, speed: 0, pose(t, P) { idleBase(P, t, 0.2); P.rx[I('armR')] += -1.45; P.rz[I('armR')] += 0.2; P.rx[I('foreR')] += 0.15; P.rx[I('head')] += -0.05; P.rx[I('armL')] += -0.2; P.rx[I('foreL')] += -0.8; void clamp; } },
    { name: 'cheer', frames: 32, loop: true, dur: 0.9, speed: 0, pose(t, P) { idleBase(P, t, 0.1); P.root[1] += 0.05 * Math.max(0, wave(t, 0)); for (const [s, L] of SIDES) { P.rz[I('arm' + L)] += -s * 2.6; P.rx[I('fore' + L)] += -0.4 - 0.4 * Math.max(0, wave(t, s > 0 ? 0 : 0.5)); } } },
    { name: 'cower', frames: 32, loop: true, dur: 1.2, speed: 0, pose(t, P) {
      P.root[1] += -0.35 + 0.01 * wave(t, 0, 4);
      P.rx[I('spine')] += 0.5; P.rx[I('chest')] += 0.3; P.rx[I('neck')] += 0.4;
      for (const [s, L] of SIDES) { P.rx[I('arm' + L)] += -2.4; P.rz[I('arm' + L)] += -s * 0.5; P.rx[I('fore' + L)] += -1.9; }
      for (const Lg of legsOf) legIK(P, Lg, Lg.an[1], Lg.an[2] + 0.1, 0.1);
    } },
    { name: 'sit', frames: 2, loop: true, dur: 1, speed: 0, pose(t, P) { P.root[1] += -0.45; for (const [s, L] of SIDES) { P.rx[I('thigh' + L)] += -1.5; P.rx[I('shin' + L)] += 1.45; P.rx[I('arm' + L)] += -0.5; P.rx[I('fore' + L)] += -0.9; P.rz[I('arm' + L)] += -s * 0.15; } P.rx[I('spine')] += 0.05; } },
    { name: 'ride', frames: 24, loop: true, dur: 0.6, speed: 0, pose(t, P) { P.root[1] += -0.42 + 0.03 * wave(t, 0, 1); for (const [s, L] of SIDES) { P.rz[I('thigh' + L)] += s * 0.55; P.rx[I('thigh' + L)] += -0.9; P.rx[I('shin' + L)] += 1.25; P.rx[I('arm' + L)] += -0.6; P.rx[I('fore' + L)] += -1.0; P.rz[I('arm' + L)] += -s * 0.2; } P.rx[I('spine')] += 0.08 + 0.03 * wave(t, 0.2, 1); } },
  ];
  return list;
}

export const id = 'human_m2026';
export const meta = BASE;
export function build() { return variants[2].build(); }
