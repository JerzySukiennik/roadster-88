// Roadster 88 Columbian mammoth (also scaled into Miocene gomphotheres and the de-extinct herds of the next ice age): SDF anatomy (high domed skull, sloping back with a shoulder hump, pillar legs on round pads, long trunk, great curved tusks, small ears, shaggy hair skirt), rig and quadruped clips (idle, graze, alert, walk, trot, charge, lie, get up).
import { Model } from '../sdf.js';
import { X, SIDES, tube, limb, chain } from '../anatomy.js';
import { quadClips } from '../gaits.js';

export const id = 'mammoth';
export const tail = ['tail1', 'tail2', 'tail3'];
export const trunk = ['trunk1', 'trunk2', 'trunk3', 'trunk4'];
export const meta = { mass: 8000, length: 5.6, height: 3.7, hip: 2.6, speeds: { walk: 1.3, trot: 3.2, run: 6.5 }, lods: [{ tris: 8000 }, { tris: 2200 }, { tris: 560 }], cell: 0.03, ao: [0.03, 0.09, 0.22, 0.5], look: { neck: 0.4, head: 1, jaw: 1 }, pivot: [0, 3.0, 2.0] };

export function build() {
  const M = new Model('mammoth', { k: 0.12 });
  M.bone('pelvis', null, [0, 2.5, -1.2]);
  M.bone('spine', 'pelvis', [0, 2.8, 0.0]);
  M.bone('chest', 'spine', [0, 2.95, 1.0]);
  M.bone('neck', 'chest', [0, 3.0, 1.5]);
  M.bone('head', 'neck', [0, 3.25, 1.95]);
  M.bone('jaw', 'head', [0, 2.55, 2.2]);
  chain(M, trunk, 'head', [[0, 2.6, 2.55], [0, 1.95, 2.78], [0, 1.25, 2.84], [0, 0.65, 2.78]]);
  chain(M, tail, 'pelvis', [[0, 2.5, -1.95], [0, 2.05, -2.08], [0, 1.65, -2.1]]);
  for (const [s, L] of SIDES) {
    limb(M, s, L, 'pelvis', ['thigh', 'shin', 'meta', 'htoe'], [[0.55, 2.4, -1.2], [0.6, 1.4, -1.08], [0.6, 0.55, -1.15], [0.6, 0.16, -1.1]], [0.44, 0.33, 0.29, 0.28], { k: 0.08, end: [0.6, 0.05, -1.02], endR: 0.29, muscles: [{ c: [0.6, 2.0, -1.15], r: [0.42, 0.7, 0.55], k: 0.16 }] });
    limb(M, s, L, 'chest', ['arm', 'fore', 'hand', 'ftoe'], [[0.62, 2.55, 1.12], [0.64, 1.55, 1.04], [0.64, 0.6, 1.1], [0.64, 0.16, 1.12]], [0.45, 0.34, 0.31, 0.3], { k: 0.08, end: [0.64, 0.05, 1.2], endR: 0.31, muscles: [{ c: [0.64, 2.2, 1.1], r: [0.44, 0.65, 0.5], k: 0.16 }] });
    for (const dz of [0.08, 0.16]) M.ell(X(s, [0.62, 0.06, 1.12 + dz]), [0.08, 0.05, 0.07], { bone: 'ftoe' + L, k: 0.03, region: 'hoof', prio: 2 });
  }
  M.ell([0, 2.4, -0.05], [1.05, 1.0, 1.75], { bone: 'spine', k: 0.2 });
  M.ell([0, 2.25, -1.15], [0.9, 0.85, 0.85], { bone: 'pelvis', k: 0.2 });
  M.ell([0, 2.55, 1.0], [0.95, 1.05, 0.9], { bone: 'chest', k: 0.2 });
  M.ell([0, 3.2, 0.7], [0.62, 0.45, 0.85], { bone: 'chest', k: 0.25 });
  M.ell([0, 1.85, 0.05], [1.1, 0.5, 1.75], { bone: 'spine', k: 0.14, region: 'mane' });
  M.ell([0, 2.0, 1.05], [0.98, 0.55, 0.85], { bone: 'chest', k: 0.14, region: 'mane' });
  tube(M, ['neck', 'head'], [[0, 2.9, 1.4], [0, 3.05, 1.85]], [0.7, 0.6], { k: 0.15 });
  M.ell([0, 3.35, 2.0], [0.55, 0.62, 0.6], { bone: 'head', k: 0.14 });
  M.cone([0, 3.0, 2.3], [0, 2.55, 2.55], 0.42, 0.3, { bone: 'head', k: 0.12 });
  M.ell([0, 2.35, 2.25], [0.22, 0.14, 0.22], { bone: 'jaw', k: 0.06 });
  tube(M, trunk, [[0, 2.65, 2.55], [0, 1.95, 2.8], [0, 1.25, 2.86], [0, 0.6, 2.78], [0, 0.35, 2.9]], [0.3, 0.22, 0.16, 0.12, 0.09], { k: 0.06 });
  for (const [s, L] of SIDES) {
    void L;
    M.cone(X(s, [0.24, 2.62, 2.42]), X(s, [0.42, 1.95, 2.95]), 0.13, 0.115, { bone: 'head', k: 0.04, region: 'horn', prio: 1 });
    M.cone(X(s, [0.42, 1.95, 2.95]), X(s, [0.62, 1.72, 3.65]), 0.115, 0.09, { bone: 'head', k: 0.03, region: 'horn', prio: 1 });
    M.cone(X(s, [0.62, 1.72, 3.65]), X(s, [0.5, 2.05, 4.2]), 0.09, 0.05, { bone: 'head', k: 0.03, region: 'horn', prio: 1 });
    M.cone(X(s, [0.5, 2.05, 4.2]), X(s, [0.22, 2.45, 4.35]), 0.05, 0.015, { bone: 'head', k: 0.02, region: 'horn', prio: 1 });
    M.ell(X(s, [0.5, 3.15, 1.88]), [0.08, 0.3, 0.24], { bone: 'head', k: 0.06, region: 'mane' });
    M.ell(X(s, [0.4, 2.95, 2.38]), [0.04, 0.04, 0.04], { bone: 'head', k: 0.01, region: 'eye', prio: 3 });
  }
  tube(M, tail, [[0, 2.55, -1.92], [0, 2.05, -2.1], [0, 1.65, -2.12]], [0.09, 0.06, 0.04], { k: 0.04 });
  M.ell([0, 1.5, -2.12], [0.08, 0.2, 0.08], { bone: 'tail3', k: 0.04, region: 'mane' });
  return M;
}

export function clips(rig) {
  return quadClips(rig, {
    root: 'pelvis', spine: ['spine', 'chest'], neck: ['neck'], head: 'head', jaw: 'jaw', tail,
    hind: ['thigh', 'shin', 'meta', 'htoe'], hindEnd: (s) => [0.6 * s, 0.05, -1.02],
    front: ['arm', 'fore', 'hand', 'ftoe'], frontEnd: (s) => [0.64 * s, 0.05, 1.2],
    walk: { type: 'walk', stride: 1.7, duty: 0.7, dur: 1.7, liftF: 0.22, liftH: 0.22, plant: 0.1, push: 0.3, fold: 0.55, toeCurl: 0.2, body: { bob: 0.04, sink: 0.02, roll: 0.035, yaw: 0.02, nod: 0.04, nodPh: 0.2, tail: 0.08, tailUp: 0.02 } },
    run: { type: 'trot', frames: 28, stride: 2.8, duty: 0.46, dur: 0.86, liftF: 0.36, liftH: 0.36, plant: 0.15, push: 0.5, fold: 1.0, toeCurl: 0.4, body: { bob: 0.08, sink: 0.08, pitch: 0.04, roll: 0.025, nod: 0.06, neck: 0.1, head: 0.08, tail: 0.05, tailUp: 0.08 } },
    gallop: { type: 'trot', frames: 24, stride: 3.2, duty: 0.4, dur: 0.72, liftF: 0.42, liftH: 0.4, plant: 0.2, push: 0.6, fold: 1.2, toeCurl: 0.5, body: { bob: 0.1, sink: 0.1, pitch: 0.06, roll: 0.02, nod: 0.08, neck: 0.15, head: 0.1, tail: 0.04, tailUp: 0.15 } },
    graze: { neck: 0.25, head: 0.25, drop: 0.04, pitch: 0.03 },
    alertNeck: 0.2, alertHead: 0.15, idleTail: 0.08,
    lieDrop: 1.4,
    extra(P, rig, t) { trunk.forEach((n, i) => { P.rx[rig.i(n)] += 0.08 * Math.sin(t * Math.PI * 2 + i * 0.6); P.ry[rig.i(n)] += 0.06 * Math.sin(t * Math.PI * 2 * 0.5 + i); }); },
    lie(P, rig) { P.root[1] -= 1.4; for (const L of ['L', 'R']) { P.rx[rig.i('thigh' + L)] = -1.3; P.rx[rig.i('shin' + L)] = 2.2; P.rx[rig.i('meta' + L)] = -1.6; P.rx[rig.i('arm' + L)] = -0.9; P.rx[rig.i('fore' + L)] = 1.9; P.rx[rig.i('hand' + L)] = -0.9; } P.rx[rig.i('neck')] += 0.2; },
  });
}
