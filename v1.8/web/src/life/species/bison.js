// Roadster 88 bison (Ice Age Bison antiquus and the herds of a rewilded valley): the longhorn rig with a massive shoulder hump, a low heavy head with short curved horns, a shaggy beard, cape and mane, and a short tufted tail; clips (idle, graze, alert, walk, trot, stampede, lie, get up). Coat colours come per instance.
import { Model } from '../sdf.js';
import { X, SIDES, tube, limb, chain } from '../anatomy.js';
import { quadClips, wave } from '../gaits.js';

export const id = 'bison';
export const tail = ['tail1', 'tail2', 'tail3'];
export const meta = { mass: 800, length: 2.9, height: 1.9, hip: 1.35, speeds: { walk: 1.2, trot: 3.5, run: 9 }, lods: [{ tris: 6000 }, { tris: 1600 }, { tris: 400 }], cell: 0.012, ao: [0.012, 0.035, 0.08, 0.18], look: { neck: 0.5, head: 1, jaw: 1 }, pivot: [0, 1.25, 0.8], blend: 0.02 };

export function build() {
  const M = new Model('bison', { k: 0.05 });
  M.bone('pelvis', null, [0, 1.38, -0.6]);
  M.bone('spine', 'pelvis', [0, 1.36, 0.1]);
  M.bone('chest', 'spine', [0, 1.3, 0.6]);
  M.bone('neck', 'chest', [0, 1.25, 0.85]);
  M.bone('head', 'neck', [0, 1.28, 1.12]);
  M.bone('jaw', 'head', [0, 1.1, 1.25]);
  chain(M, tail, 'pelvis', [[0, 1.38, -1.02], [0, 1.0, -1.08], [0, 0.65, -1.1]]);
  for (const [s, L] of SIDES) {
    limb(M, s, L, 'pelvis', ['thigh', 'shin', 'meta', 'htoe'], [[0.21, 1.25, -0.6], [0.24, 0.85, -0.42], [0.21, 0.5, -0.68], [0.21, 0.15, -0.63]], [0.14, 0.085, 0.05, 0.045], { k: 0.04, end: [0.21, 0.04, -0.52], endR: 0.05, muscles: [{ c: [0.22, 1.05, -0.55], r: [0.12, 0.25, 0.2], rot: [0, -0.3, 0], k: 0.07 }] });
    for (const dx of [-0.025, 0.025]) M.ell(X(s, [0.21 + dx, 0.04, -0.52]), [0.024, 0.04, 0.055], { bone: 'htoe' + L, k: 0.01, region: 'hoof', prio: 2 });
    limb(M, s, L, 'chest', ['arm', 'fore', 'hand', 'ftoe'], [[0.2, 1.08, 0.62], [0.21, 0.82, 0.48], [0.2, 0.42, 0.52], [0.2, 0.15, 0.54]], [0.12, 0.075, 0.05, 0.045], { k: 0.04, end: [0.2, 0.04, 0.65], endR: 0.05, muscles: [{ c: [0.2, 1.0, 0.58], r: [0.11, 0.2, 0.15], k: 0.07 }] });
    for (const dx of [-0.025, 0.025]) M.ell(X(s, [0.2 + dx, 0.04, 0.65]), [0.024, 0.04, 0.055], { bone: 'ftoe' + L, k: 0.01, region: 'hoof', prio: 2 });
  }
  M.ell([0, 1.12, 0.0], [0.34, 0.38, 0.78], { bone: 'spine', k: 0.08 });
  M.ell([0, 1.2, -0.6], [0.3, 0.3, 0.38], { bone: 'pelvis', k: 0.08 });
  for (const s of [1, -1]) M.ell([0.2 * s, 1.36, -0.66], [0.08, 0.07, 0.1], { bone: 'pelvis', k: 0.08 });
  M.ell([0, 1.12, 0.6], [0.28, 0.36, 0.3], { bone: 'chest', k: 0.08 });
  M.ell([0, 1.55, 0.45], [0.3, 0.4, 0.5], { bone: 'chest', k: 0.12, region: 'mane' });
  M.ell([0, 1.18, 0.75], [0.36, 0.42, 0.34], { bone: 'chest', k: 0.1, region: 'mane' });
  M.ell([0, 1.3, 1.1], [0.2, 0.22, 0.22], { bone: 'head', k: 0.06, region: 'mane' });
  M.ell([0, 0.86, 1.3], [0.07, 0.14, 0.07], { bone: 'jaw', k: 0.04, region: 'mane' });
  M.ell([0, 0.95, 0.85], [0.12, 0.26, 0.14], { bone: 'neck', k: 0.1 });
  tube(M, ['neck', 'head'], [[0, 1.2, 0.68], [0, 1.27, 1.08]], [0.22, 0.15], { k: 0.07, flat: [0.75, 1.25] });
  M.ell([0, 1.2, 1.25], [0.12, 0.14, 0.17], { bone: 'head', rot: [0, 0.6, 0], k: 0.05 });
  M.cone([0, 1.15, 1.3], [0, 0.92, 1.42], 0.12, 0.1, { bone: 'head', k: 0.05 });
  M.ell([0, 0.96, 1.49], [0.085, 0.07, 0.07], { bone: 'head', k: 0.04, region: 'nose' });
  M.ell([0, 1.0, 1.32], [0.06, 0.04, 0.14], { bone: 'jaw', rot: [0, 0.8, 0], k: 0.03 });
  M.ell([0, 1.33, 1.17], [0.13, 0.05, 0.06], { bone: 'head', k: 0.03 });
  for (const [s, L] of SIDES) {
    void L;
    M.cone(X(s, [0.12, 1.3, 1.15]), X(s, [0.26, 1.36, 1.12]), 0.045, 0.035, { bone: 'head', k: 0.02, region: 'horn', prio: 1 });
    M.cone(X(s, [0.26, 1.36, 1.12]), X(s, [0.27, 1.5, 1.2]), 0.035, 0.008, { bone: 'head', k: 0.015, region: 'horn', prio: 1 });
    M.ell(X(s, [0.16, 1.24, 1.12]), [0.07, 0.025, 0.04], { bone: 'head', rot: [0, 0, -0.4 * s], k: 0.02 });
    M.ell(X(s, [0.1, 1.24, 1.22]), [0.018, 0.02, 0.02], { bone: 'head', k: 0.005, region: 'eye', prio: 3 });
    M.ell(X(s, [0.035, 0.97, 1.55]), [0.015, 0.02, 0.015], { bone: 'head', sub: true, k: 0.01 });
  }
  tube(M, tail, [[0, 1.4, -0.98], [0, 1.0, -1.1], [0, 0.65, -1.12]], [0.035, 0.025, 0.02], { k: 0.03 });
  M.ell([0, 0.52, -1.12], [0.04, 0.12, 0.04], { bone: 'tail3', k: 0.03, region: 'mane' });
  return M;
}

export function clips(rig) {
  return quadClips(rig, {
    root: 'pelvis', spine: ['spine', 'chest'], neck: ['neck'], head: 'head', jaw: 'jaw', tail,
    hind: ['thigh', 'shin', 'meta', 'htoe'], hindEnd: (s) => [0.21 * s, 0.04, -0.52],
    front: ['arm', 'fore', 'hand', 'ftoe'], frontEnd: (s) => [0.2 * s, 0.04, 0.65],
    walk: { type: 'walk', frames: 40, stride: 0.7, duty: 0.68, dur: 0.85, liftF: 0.1, liftH: 0.09, plant: 0.1, push: 0.4, fold: 0.9, toeCurl: 0.8, body: { bob: 0.012, roll: 0.02, yaw: 0.015, nod: 0.05, nodPh: 0.1, tail: 0.06, tailUp: 0.01 } },
    trot: { type: 'trot', frames: 28, stride: 1.2, duty: 0.45, dur: 0.72, liftF: 0.16, liftH: 0.14, plant: 0.15, push: 0.55, fold: 1.3, toeCurl: 1.1, body: { bob: 0.035, sink: 0.02, nod: 0.03, tail: 0.05, tailUp: 0.04 } },
    gallop: { type: 'gallop', frames: 24, stride: 1.8, duty: 0.34, dur: 0.5, liftF: 0.24, liftH: 0.2, plant: 0.2, push: 0.7, fold: 1.6, toeCurl: 1.3, body: { bob: 0.04, sink: 0.05, rock: 0.07, rockPh: 0.15, flex: 0.03, nod: 0.08, nodPh: 0.25, neck: 0.15, head: 0.05, tail: 0.04, tailUp: 0.15 } },
    graze: { neck: 0.95, head: 0.45, drop: 0.02, pitch: 0.03 },
    alertNeck: 0.25, alertHead: 0.1, idleTail: 0.16,
    lieDrop: 0.6,
    lie(P, rig) { P.root[1] -= 0.6; for (const L of ['L', 'R']) { P.rx[rig.i('thigh' + L)] = -1.2; P.rx[rig.i('shin' + L)] = 2.3; P.rx[rig.i('meta' + L)] = -1.6; P.rx[rig.i('arm' + L)] = -0.6; P.rx[rig.i('fore' + L)] = 2.0; P.rx[rig.i('hand' + L)] = -2.3; } P.rx[rig.i('neck')] += 0.15; void wave; },
  });
}
