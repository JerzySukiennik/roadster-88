// Roadster 88 Stegosaurus stenops: SDF anatomy (high-arched back over long hind legs, short forelimbs, small low head with a beak, two alternating rows of tall diamond plates along the back, four tail spikes), rig and quadruped clips (idle, graze, alert, walk, trot, charge, lie, get up).
import { Model } from '../sdf.js';
import { X, SIDES, tube, limb, chain } from '../anatomy.js';
import { quadClips } from '../gaits.js';

export const id = 'stegosaurus';
export const tail = ['tail1', 'tail2', 'tail3', 'tail4'];
export const meta = { mass: 5000, length: 8.5, height: 4.0, hip: 2.4, speeds: { walk: 1.2, run: 5.5 }, lods: [{ tris: 8000 }, { tris: 2200 }, { tris: 560 }], cell: 0.028, ao: [0.03, 0.09, 0.22, 0.5], look: { neck: 0.4, head: 1, jaw: 1 }, pivot: [0, 1.3, 3.0] };

export function build() {
  const M = new Model('stegosaurus', { k: 0.1 });
  M.bone('pelvis', null, [0, 2.4, -0.6]);
  M.bone('spine', 'pelvis', [0, 2.3, 0.6]);
  M.bone('chest', 'spine', [0, 1.75, 1.7]);
  M.bone('neck', 'chest', [0, 1.35, 2.5]);
  M.bone('head', 'neck', [0, 1.05, 3.2]);
  M.bone('jaw', 'head', [0, 0.9, 3.45]);
  chain(M, tail, 'pelvis', [[0, 2.3, -1.6], [0, 2.0, -2.7], [0, 1.65, -3.7], [0, 1.35, -4.6]]);
  for (const [s, L] of SIDES) {
    limb(M, s, L, 'pelvis', ['thigh', 'shin', 'meta', 'htoe'], [[0.55, 2.25, -0.6], [0.6, 1.25, -0.3], [0.58, 0.5, -0.6], [0.58, 0.14, -0.48]], [0.32, 0.22, 0.14, 0.12], { k: 0.07, end: [0.58, 0.06, -0.2], endR: 0.1, muscles: [{ c: [0.58, 1.85, -0.55], r: [0.36, 0.62, 0.5], k: 0.14 }] });
    for (const dx of [-0.08, 0, 0.08]) M.ell(X(s, [0.58 + dx, 0.05, -0.14]), [0.05, 0.04, 0.06], { bone: 'htoe' + L, k: 0.02, region: 'hoof', prio: 2 });
    limb(M, s, L, 'chest', ['arm', 'fore', 'hand', 'ftoe'], [[0.5, 1.45, 1.8], [0.62, 0.95, 1.65], [0.6, 0.38, 1.75], [0.6, 0.12, 1.8]], [0.2, 0.14, 0.1, 0.09], { k: 0.06, end: [0.6, 0.05, 1.95], endR: 0.08, muscles: [{ c: [0.58, 1.25, 1.75], r: [0.22, 0.32, 0.26], k: 0.1 }] });
  }
  M.ell([0, 1.85, 0.3], [0.85, 0.95, 1.75], { bone: 'spine', k: 0.18 });
  M.ell([0, 2.05, -0.65], [0.72, 0.8, 0.95], { bone: 'pelvis', k: 0.16 });
  M.ell([0, 1.5, 1.5], [0.62, 0.72, 0.8], { bone: 'chest', k: 0.15 });
  tube(M, ['neck', 'head'], [[0, 1.45, 2.2], [0, 1.1, 3.05]], [0.38, 0.22], { k: 0.1 });
  M.ell([0, 1.05, 3.25], [0.17, 0.17, 0.32], { bone: 'head', k: 0.06 });
  M.cone([0, 1.0, 3.4], [0, 0.88, 3.65], 0.12, 0.05, { bone: 'head', k: 0.04, region: 'horn' });
  tube(M, tail, [[0, 2.2, -1.5], [0, 2.0, -2.7], [0, 1.65, -3.7], [0, 1.35, -4.6], [0, 1.2, -5.3]], [0.5, 0.36, 0.24, 0.14, 0.06], { k: 0.07 });
  const plates = [[2.0, 1.6, 0.45], [1.35, 2.45, 0.7], [0.6, 2.95, 0.85], [-0.2, 3.1, 0.95], [-0.95, 3.0, 0.9], [-1.65, 2.75, 0.75], [-2.35, 2.4, 0.6], [-3.0, 2.0, 0.45], [-3.6, 1.7, 0.32]];
  plates.forEach(([z, y, h], i) => {
    const s = i % 2 ? 1 : -1, bone = z > 1.0 ? 'chest' : z > -0.3 ? 'spine' : z > -1.5 ? 'pelvis' : z > -2.6 ? 'tail1' : 'tail2';
    M.box([0.09 * s, y + h * 0.35, z], [0.035, h * 0.55, h * 0.5], { bone, rot: [0.78, 0, 0.12 * s], round: 0.03, k: 0.03, region: 'frill', prio: 1 });
  });
  for (const s of [1, -1]) for (const [z, a] of [[-4.75, 0.5], [-5.15, 0.75]]) M.cone([0.08 * s, 1.35, z], [0.62 * s, 1.75, z - 0.35 * a], 0.06, 0.012, { bone: 'tail4', k: 0.02, region: 'horn', prio: 1 });
  for (const s of [1, -1]) M.ell([0.14 * s, 1.15, 3.28], [0.025, 0.025, 0.025], { bone: 'head', k: 0.005, region: 'eye', prio: 3 });
  return M;
}

export function clips(rig) {
  return quadClips(rig, {
    root: 'pelvis', spine: ['spine', 'chest'], neck: ['neck'], head: 'head', jaw: 'jaw', tail,
    hind: ['thigh', 'shin', 'meta', 'htoe'], hindEnd: (s) => [0.58 * s, 0.06, -0.2],
    front: ['arm', 'fore', 'hand', 'ftoe'], frontEnd: (s) => [0.6 * s, 0.05, 1.95],
    walk: { type: 'walk', stride: 1.4, duty: 0.68, dur: 1.5, liftF: 0.16, liftH: 0.2, plant: 0.1, push: 0.35, fold: 0.6, toeCurl: 0.3, body: { bob: 0.03, sink: 0.02, roll: 0.03, yaw: 0.02, nod: 0.03, nodPh: 0.2, tail: 0.1, tailUp: 0.02 } },
    run: { type: 'trot', frames: 28, stride: 2.2, duty: 0.44, dur: 0.85, liftF: 0.3, liftH: 0.34, plant: 0.15, push: 0.55, fold: 1.0, toeCurl: 0.5, body: { bob: 0.06, sink: 0.06, pitch: 0.04, roll: 0.02, nod: 0.04, neck: 0.08, head: 0.05, tail: 0.08, tailUp: 0.04 } },
    gallop: { type: 'trot', frames: 24, stride: 2.6, duty: 0.4, dur: 0.75, liftF: 0.36, liftH: 0.38, plant: 0.2, push: 0.6, fold: 1.1, toeCurl: 0.55, body: { bob: 0.08, sink: 0.08, pitch: 0.05, roll: 0.02, nod: 0.05, neck: 0.1, head: 0.08, tail: 0.12, tailUp: 0.05 } },
    graze: { neck: 0.35, head: 0.25, drop: 0.03, pitch: 0.03 },
    alertNeck: 0.15, alertHead: 0.1, idleTail: 0.1,
    lieDrop: 1.1,
    lie(P, rig) { P.root[1] -= 1.1; for (const L of ['L', 'R']) { P.rx[rig.i('thigh' + L)] = -1.3; P.rx[rig.i('shin' + L)] = 2.2; P.rx[rig.i('meta' + L)] = -1.6; P.rx[rig.i('arm' + L)] = -0.9; P.rx[rig.i('fore' + L)] = 1.9; P.rx[rig.i('hand' + L)] = -0.9; } },
  });
}
