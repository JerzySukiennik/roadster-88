// Roadster 88 Triceratops horridus: SDF anatomy (barrel body, columnar hind legs, semi-sprawled forelimbs, deep skull with beak, brow and nose horns, upswept frill with epoccipital bumps), rig and quadruped clips (idle, graze, alert, walk, trot, charge, lie, get up).
import { Model } from '../sdf.js';
import { X, SIDES, tube, limb, chain } from '../anatomy.js';
import { quadClips } from '../gaits.js';
import { rotMat } from '../sdf.js';

export const id = 'triceratops';
export const meta = { mass: 7000, length: 8.6, height: 3.0, hip: 2.0, speeds: { walk: 1.4, run: 7.5 }, lods: [{ tris: 8000 }, { tris: 2200 }, { tris: 560 }], cell: 0.03, ao: [0.03, 0.09, 0.22, 0.5], look: { neck: 0.4, head: 1, jaw: 1 }, pivot: [0, 1.75, 2.1] };
export const tail = ['tail1', 'tail2', 'tail3', 'tail4'];

export function build() {
  const M = new Model('triceratops', { k: 0.1 });
  M.bone('pelvis', null, [0, 2.05, -0.7]);
  M.bone('spine', 'pelvis', [0, 2.1, 0.3]);
  M.bone('chest', 'spine', [0, 1.95, 1.3]);
  M.bone('neck', 'chest', [0, 1.75, 2.1]);
  M.bone('head', 'neck', [0, 1.75, 2.5]);
  M.bone('jaw', 'head', [0, 1.42, 2.95]);
  chain(M, tail, 'pelvis', [[0, 1.95, -1.7], [0, 1.75, -2.7], [0, 1.5, -3.6], [0, 1.25, -4.4]]);
  for (const [s, L] of SIDES) {
    limb(M, s, L, 'pelvis', ['thigh', 'shin', 'meta', 'htoe'], [[0.5, 1.9, -0.7], [0.58, 1.1, -0.42], [0.6, 0.48, -0.66], [0.6, 0.14, -0.5]], [0.34, 0.24, 0.15, 0.13], { k: 0.07, end: [0.6, 0.07, -0.2], endR: 0.1, muscles: [{ c: [0.6, 1.5, -0.62], r: [0.4, 0.66, 0.56], rot: [0, -0.25, 0], k: 0.14 }, { c: [0.6, 0.95, -0.45], r: [0.22, 0.38, 0.24], bone: 1, rot: [0, 0.3, 0], k: 0.08 }] });
    M.ell(X(s, [0.6, 0.08, -0.34]), [0.21, 0.09, 0.24], { bone: 'htoe' + L, k: 0.06 });
    for (const dx of [-0.12, 0, 0.12]) M.ell(X(s, [0.6 + dx, 0.06, -0.14]), [0.06, 0.05, 0.07], { bone: 'htoe' + L, k: 0.02, region: 'hoof', prio: 2 });
    limb(M, s, L, 'chest', ['arm', 'fore', 'hand', 'ftoe'], [[0.55, 1.45, 1.45], [0.72, 0.95, 1.2], [0.68, 0.32, 1.42], [0.66, 0.11, 1.5]], [0.26, 0.17, 0.13, 0.12], { k: 0.06, end: [0.66, 0.06, 1.72], endR: 0.09, muscles: [{ c: [0.66, 1.25, 1.36], r: [0.3, 0.42, 0.34], k: 0.12 }, { c: [0.72, 0.72, 1.3], r: [0.18, 0.32, 0.2], bone: 1, k: 0.07 }] });
    M.ell(X(s, [0.66, 0.07, 1.58]), [0.17, 0.08, 0.19], { bone: 'ftoe' + L, k: 0.05 });
    for (const dx of [-0.1, 0, 0.1]) M.ell(X(s, [0.66 + dx, 0.06, 1.74]), [0.05, 0.045, 0.06], { bone: 'ftoe' + L, k: 0.02, region: 'hoof', prio: 2 });
  }
  M.ell([0, 1.62, 0.2], [1.0, 0.95, 1.95], { bone: 'spine', k: 0.16 });
  M.ell([0, 1.86, -0.78], [0.78, 0.72, 0.95], { bone: 'pelvis', k: 0.16 });
  M.ell([0, 2.22, -0.25], [0.5, 0.36, 1.35], { bone: 'spine', k: 0.3 });
  M.ell([0, 1.55, 1.35], [0.86, 0.82, 0.78], { bone: 'chest', k: 0.16 });
  M.ell([0, 1.64, 2.05], [0.6, 0.6, 0.55], { bone: 'neck', k: 0.16 });
  tube(M, tail, [[0, 1.98, -1.3], [0, 1.75, -2.7], [0, 1.5, -3.6], [0, 1.25, -4.4], [0, 1.02, -5.15]], [0.58, 0.42, 0.3, 0.18, 0.05], { k: 0.1 });

  M.ell([0, 1.7, 2.92], [0.47, 0.5, 0.66], { bone: 'head', rot: [0, 0.28, 0], k: 0.1 });
  M.ell([0, 1.5, 3.58], [0.25, 0.37, 0.46], { bone: 'head', rot: [0, 0.48, 0], k: 0.1 });
  M.cone([0, 1.62, 3.3], [0, 1.37, 3.92], 0.33, 0.15, { bone: 'head', k: 0.08 });
  M.cone([0, 1.38, 3.86], [0, 1.15, 4.13], 0.14, 0.03, { bone: 'head', k: 0.05, region: 'beak', prio: 1 });
  M.ell([0, 1.26, 3.36], [0.3, 0.17, 0.6], { bone: 'jaw', rot: [0, 0.3, 0], k: 0.08 });
  M.cone([0, 1.16, 3.78], [0, 1.08, 4.0], 0.1, 0.03, { bone: 'jaw', k: 0.05, region: 'beak', prio: 1 });
  M.box([0, 1.31, 3.55], [0.42, 0.018, 0.5], { bone: 'head', rot: [0, 0.38, 0], sub: true, k: 0.02, region: 'mouth' });
  const fc = [0, 2.42, 2.1], fr = rotMat(0, -0.95, 0);
  M.ell(fc, [1.0, 0.86, 0.085], { bone: 'head', rot: [0, -0.95, 0], k: 0.16, region: 'frill' });
  M.ell([0, 2.05, 2.5], [0.55, 0.42, 0.22], { bone: 'head', rot: [0, -0.95, 0], k: 0.18 });
  for (let i = 0; i <= 16; i++) {
    const a = -0.15 + (i / 16) * (Math.PI + 0.3);
    const lx = Math.cos(a) * 0.98, ly = Math.sin(a) * 0.84;
    const p = [fc[0] + fr[0] * lx + fr[1] * ly, fc[1] + fr[3] * lx + fr[4] * ly, fc[2] + fr[6] * lx + fr[7] * ly];
    M.ell(p, [0.075, 0.075, 0.05], { bone: 'head', k: 0.04, region: 'frill' });
  }
  for (const [s, L] of SIDES) {
    void L;
    M.cone(X(s, [0.23, 1.98, 3.1]), X(s, [0.31, 2.35, 3.56]), 0.12, 0.07, { bone: 'head', k: 0.06, region: 'horn', prio: 1 });
    M.cone(X(s, [0.31, 2.35, 3.56]), X(s, [0.33, 2.47, 4.02]), 0.07, 0.018, { bone: 'head', k: 0.03, region: 'horn', prio: 1 });
    M.cone(X(s, [0.42, 1.45, 3.02]), X(s, [0.6, 1.3, 2.98]), 0.08, 0.02, { bone: 'head', k: 0.04, region: 'horn', prio: 1 });
    M.ell(X(s, [0.33, 1.88, 3.24]), [0.042, 0.045, 0.05], { bone: 'head', k: 0.01, region: 'eye', prio: 3 });
    M.ell(X(s, [0.3, 1.95, 3.2]), [0.1, 0.06, 0.12], { bone: 'head', k: 0.05 });
    M.ell(X(s, [0.1, 1.5, 3.95]), [0.03, 0.04, 0.05], { bone: 'head', sub: true, k: 0.02 });
  }
  M.cone([0, 1.72, 3.74], [0, 1.98, 3.93], 0.085, 0.02, { bone: 'head', k: 0.04, region: 'horn', prio: 1 });
  return M;
}

export function clips(rig) {
  return quadClips(rig, {
    root: 'pelvis', spine: ['spine', 'chest'], neck: ['neck'], head: 'head', jaw: 'jaw', tail,
    hind: ['thigh', 'shin', 'meta', 'htoe'], hindEnd: (s) => [0.6 * s, 0.07, -0.2],
    front: ['arm', 'fore', 'hand', 'ftoe'], frontEnd: (s) => [0.66 * s, 0.06, 1.72],
    walk: { type: 'walk', stride: 1.5, duty: 0.68, dur: 1.6, liftF: 0.2, liftH: 0.22, plant: 0.1, push: 0.35, fold: 0.6, toeCurl: 0.3, body: { bob: 0.035, sink: 0.02, roll: 0.03, yaw: 0.02, nod: 0.03, nodPh: 0.2, tail: 0.06, tailUp: 0.02 } },
    run: { type: 'trot', frames: 28, stride: 2.6, duty: 0.42, dur: 0.78, liftF: 0.38, liftH: 0.4, plant: 0.15, push: 0.6, fold: 1.1, toeCurl: 0.5, body: { bob: 0.07, sink: 0.08, pitch: 0.05, roll: 0.02, nod: 0.05, neck: 0.12, head: 0.08, tail: 0.04, tailUp: 0.05 } },
    graze: { neck: 0.38, head: 0.3, drop: 0.06, pitch: 0.04 },
    alertNeck: 0.25, alertHead: 0.1, idleTail: 0.05,
    lieDrop: 1.15,
    lie(P, rig) { P.root[1] -= 1.15; for (const L of ['L', 'R']) { P.rx[rig.i('thigh' + L)] = -1.3; P.rx[rig.i('shin' + L)] = 2.2; P.rx[rig.i('meta' + L)] = -1.6; P.rx[rig.i('arm' + L)] = -0.9; P.rx[rig.i('fore' + L)] = 1.9; P.rx[rig.i('hand' + L)] = -0.9; } P.rx[rig.i('neck')] += 0.25; P.rx[rig.i('head')] += 0.1; tail.forEach((n, i) => { P.rx[rig.i(n)] += 0.05 + i * 0.03; }); },
    gallop: { type: 'gallop', frames: 28, stride: 3.0, duty: 0.36, dur: 0.66, liftF: 0.45, liftH: 0.42, plant: 0.2, push: 0.7, fold: 1.3, toeCurl: 0.6, body: { bob: 0.1, sink: 0.12, pitch: 0.09, rock: 0.06, rockPh: 0.1, flex: 0.03, neck: 0.3, head: 0.22, tail: 0.03, tailUp: 0.06 } },
  });
}
