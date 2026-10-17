// Roadster 88 Quetzalcoatlus (giant azhdarchid pterosaur): SDF anatomy in flight pose (small furred body, stiff neck, huge beaked head with crest, membrane wings on the long wing finger, trailing legs), rig and flight clips (flap, glide, bank, dive).
import { Model } from '../sdf.js';
import { X, SIDES } from '../anatomy.js';
import { wave, smooth } from '../gaits.js';

export const id = 'quetzal';
export const meta = { mass: 230, length: 5.5, height: 1, span: 10, flyer: true, speeds: { fly: 16 }, lods: [{ tris: 5000 }, { tris: 1400 }, { tris: 360 }], cell: 0.022, ao: [0.02, 0.06, 0.14, 0.3], look: { neck1: 0.3, neck2: 0.6, head: 1 }, pivot: [0, 0.1, 0.45], blend: 0.04 };

export function build() {
  const M = new Model('quetzal', { k: 0.05 });
  M.bone('body', null, [0, 0, 0]);
  M.bone('neck1', 'body', [0, 0.08, 0.45]);
  M.bone('neck2', 'neck1', [0, 0.16, 1.55]);
  M.bone('head', 'neck2', [0, 0.22, 2.55]);
  for (const [s, L] of SIDES) {
    M.bone('hum' + L, 'body', X(s, [0.22, 0.06, 0.25]));
    M.bone('fore' + L, 'hum' + L, X(s, [0.95, 0.1, 0.28]));
    M.bone('mc' + L, 'fore' + L, X(s, [2.15, 0.12, 0.18]));
    M.bone('fing' + L, 'mc' + L, X(s, [2.7, 0.12, 0.24]));
    M.bone('thigh' + L, 'body', X(s, [0.12, -0.05, -0.35]));
    M.bone('shin' + L, 'thigh' + L, X(s, [0.15, -0.1, -0.95]));
    M.bone('foot' + L, 'shin' + L, X(s, [0.15, -0.12, -1.55]));
  }
  M.ell([0, 0.02, -0.05], [0.24, 0.24, 0.55], { bone: 'body', k: 0.08, region: 'mane' });
  M.cone([0, 0.06, 0.35], [0, 0.16, 1.55], 0.12, 0.08, { bone: 'neck1', bone2: 'neck2', k: 0.06 });
  M.cone([0, 0.16, 1.55], [0, 0.22, 2.55], 0.08, 0.075, { bone: 'neck2', bone2: 'head', k: 0.05 });
  M.ell([0, 0.27, 2.75], [0.11, 0.17, 0.32], { bone: 'head', k: 0.05 });
  M.cone([0, 0.26, 2.85], [0, 0.02, 4.85], 0.12, 0.012, { bone: 'head', k: 0.04, region: 'beak', prio: 1 });
  M.cone([0, 0.2, 2.9], [0, -0.04, 4.6], 0.09, 0.01, { bone: 'head', k: 0.04, region: 'beak', prio: 1 });
  M.ell([0, 0.48, 2.7], [0.03, 0.2, 0.35], { bone: 'head', rot: [0, -0.4, 0], k: 0.04, region: 'frill' });
  for (const [s, L] of SIDES) {
    M.ell(X(s, [0.09, 0.32, 2.72]), [0.025, 0.028, 0.03], { bone: 'head', k: 0.005, region: 'eye', prio: 3 });
    M.cone(X(s, [0.22, 0.06, 0.25]), X(s, [0.95, 0.1, 0.28]), 0.08, 0.06, { bone: 'hum' + L, k: 0.04 });
    M.cone(X(s, [0.95, 0.1, 0.28]), X(s, [2.15, 0.12, 0.18]), 0.05, 0.04, { bone: 'fore' + L, k: 0.03 });
    M.cone(X(s, [2.15, 0.12, 0.18]), X(s, [2.7, 0.12, 0.24]), 0.04, 0.035, { bone: 'mc' + L, k: 0.03 });
    M.cone(X(s, [2.7, 0.12, 0.24]), X(s, [5.0, 0.05, -0.3]), 0.035, 0.01, { bone: 'fing' + L, k: 0.03 });
    for (const [c, r, b, rot] of [[[0.6, 0.05, -0.2], [0.42, 0.018, 0.55], 'hum', 0.05], [[1.55, 0.08, -0.22], [0.62, 0.018, 0.5], 'fore', 0], [[2.45, 0.09, -0.15], [0.32, 0.016, 0.42], 'mc', 0], [[3.5, 0.07, -0.25], [1.05, 0.015, 0.38], 'fing', 0.12], [[4.5, 0.05, -0.33], [0.5, 0.012, 0.16], 'fing', 0.2]]) M.ell(X(s, c), r, { bone: b + L, rot: [s * rot, 0, 0], k: 0.05, region: 'frill' });
    M.cone(X(s, [0.12, -0.05, -0.35]), X(s, [0.15, -0.1, -0.95]), 0.06, 0.04, { bone: 'thigh' + L, k: 0.03 });
    M.cone(X(s, [0.15, -0.1, -0.95]), X(s, [0.15, -0.12, -1.55]), 0.04, 0.03, { bone: 'shin' + L, k: 0.02 });
    M.cone(X(s, [0.15, -0.12, -1.55]), X(s, [0.15, -0.12, -1.8]), 0.03, 0.015, { bone: 'foot' + L, k: 0.02, region: 'claw' });
    M.cone(X(s, [0.95, 0.12, 0.3]), X(s, [1.0, 0.1, 0.55]), 0.025, 0.006, { bone: 'fore' + L, k: 0.01, region: 'claw', prio: 2 });
  }
  return M;
}

export function clips(rig) {
  const I = (n) => rig.i(n);
  const wing = (P, L, s, a, sweep, fold) => {
    P.rz[I('hum' + L)] += s * a; P.rz[I('fore' + L)] += s * a * 0.25; P.rz[I('fing' + L)] += s * a * 0.3;
    P.ry[I('hum' + L)] += s * sweep; P.ry[I('fore' + L)] += -s * fold; P.ry[I('fing' + L)] += s * fold * 0.6;
  };
  const legs = (P) => { for (const L of ['L', 'R']) { P.rx[I('thigh' + L)] += 0.1; P.rx[I('shin' + L)] += -0.05; } };
  return [
    { name: 'flap', frames: 32, loop: true, dur: 1.4, speed: 16, pose(t, P) {
      const w = Math.sin(Math.PI * 2 * t), w2 = Math.sin(Math.PI * 2 * (t - 0.12));
      for (const [s, L] of SIDES) { wing(P, L, s, 0.55 * w + 0.08, 0.1 * w2, 0.08 * Math.max(0, -w2)); }
      P.root[1] += -0.12 * w; P.rx[I('neck1')] += 0.03 * w2; P.rx[I('head')] += -0.03 * w2; legs(P);
    } },
    { name: 'glide', frames: 32, loop: true, dur: 4, speed: 16, pose(t, P) {
      for (const [s, L] of SIDES) wing(P, L, s, 0.06 + 0.03 * wave(t, 0), 0.03 * wave(t, 0.3), 0);
      P.ry[I('neck1')] += 0.12 * wave(t, 0.1); P.ry[I('head')] += 0.15 * wave(t, 0.2); legs(P);
    } },
    { name: 'dive', frames: 16, loop: true, dur: 1, speed: 24, pose(t, P) {
      for (const [s, L] of SIDES) wing(P, L, s, 0.15, 0.55, 0.5);
      P.rx[I('neck1')] += 0.1; legs(P); void smooth;
    } },
  ];
}
