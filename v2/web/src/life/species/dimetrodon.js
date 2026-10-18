// Roadster 88 Dimetrodon: SDF anatomy (low sprawling body, big deep skull with uneven teeth, tall sail of fanned spines webbed with skin, long tapering tail, splayed limbs with clawed feet), rig and quadruped clips (idle, bask, alert, walk, trot, rush, lie, get up).
import { Model } from '../sdf.js';
import { X, SIDES, tube, limb, chain } from '../anatomy.js';
import { quadClips } from '../gaits.js';

export const id = 'dimetrodon';
export const tail = ['tail1', 'tail2', 'tail3', 'tail4'];
export const meta = { mass: 250, length: 3.4, height: 1.7, hip: 0.55, speeds: { walk: 0.9, run: 4.5 }, lods: [{ tris: 6000 }, { tris: 1600 }, { tris: 400 }], cell: 0.012, ao: [0.012, 0.035, 0.08, 0.18], look: { neck: 0.5, head: 1, jaw: 1 }, pivot: [0, 0.55, 0.9] };

export function build() {
  const M = new Model('dimetrodon', { k: 0.05 });
  M.bone('pelvis', null, [0, 0.58, -0.45]);
  M.bone('spine', 'pelvis', [0, 0.62, 0.1]);
  M.bone('chest', 'spine', [0, 0.6, 0.55]);
  M.bone('neck', 'chest', [0, 0.6, 0.85]);
  M.bone('head', 'neck', [0, 0.62, 1.05]);
  M.bone('jaw', 'head', [0, 0.5, 1.2]);
  chain(M, tail, 'pelvis', [[0, 0.55, -0.85], [0, 0.45, -1.3], [0, 0.32, -1.75], [0, 0.2, -2.15]]);
  for (const [s, L] of SIDES) {
    limb(M, s, L, 'pelvis', ['thigh', 'shin', 'meta', 'htoe'], [[0.2, 0.52, -0.45], [0.42, 0.42, -0.4], [0.44, 0.15, -0.38], [0.46, 0.05, -0.3]], [0.09, 0.07, 0.05, 0.04], { k: 0.03, end: [0.48, 0.03, -0.18], endR: 0.03, muscles: [{ c: [0.28, 0.5, -0.45], r: [0.12, 0.08, 0.12], k: 0.05 }] });
    limb(M, s, L, 'chest', ['arm', 'fore', 'hand', 'ftoe'], [[0.2, 0.52, 0.58], [0.4, 0.42, 0.6], [0.42, 0.15, 0.62], [0.44, 0.05, 0.7]], [0.08, 0.065, 0.05, 0.04], { k: 0.03, end: [0.46, 0.03, 0.82], endR: 0.03, muscles: [{ c: [0.27, 0.5, 0.6], r: [0.11, 0.08, 0.11], k: 0.05 }] });
    for (const dx of [-0.04, 0, 0.04]) M.cone(X(s, [0.48 + dx, 0.03, -0.18]), X(s, [0.5 + dx * 1.4, 0.02, -0.08]), 0.012, 0.004, { bone: 'htoe' + L, k: 0.004, region: 'claw', prio: 2 });
    for (const dx of [-0.04, 0, 0.04]) M.cone(X(s, [0.46 + dx, 0.03, 0.82]), X(s, [0.48 + dx * 1.4, 0.02, 0.92]), 0.012, 0.004, { bone: 'ftoe' + L, k: 0.004, region: 'claw', prio: 2 });
  }
  M.ell([0, 0.55, 0.05], [0.26, 0.2, 0.7], { bone: 'spine', k: 0.07 });
  M.ell([0, 0.55, -0.5], [0.22, 0.18, 0.36], { bone: 'pelvis', k: 0.06 });
  M.ell([0, 0.55, 0.6], [0.24, 0.2, 0.32], { bone: 'chest', k: 0.06 });
  tube(M, ['neck', 'head'], [[0, 0.58, 0.82], [0, 0.6, 1.02]], [0.15, 0.13], { k: 0.05 });
  M.ell([0, 0.64, 1.15], [0.11, 0.15, 0.28], { bone: 'head', k: 0.04 });
  M.ell([0, 0.5, 1.22], [0.09, 0.05, 0.22], { bone: 'jaw', k: 0.03 });
  for (const s of [1, -1]) { M.ell([0.075 * s, 0.7, 1.08], [0.02, 0.02, 0.02], { bone: 'head', k: 0.004, region: 'eye', prio: 3 }); for (let i = 0; i < 5; i++) M.cone([0.075 * s, 0.56, 1.18 + i * 0.05], [0.075 * s, 0.5, 1.18 + i * 0.05], 0.01, 0.003, { bone: 'head', k: 0.003, region: 'claw', prio: 2 }); }
  tube(M, tail, [[0, 0.56, -0.8], [0, 0.46, -1.3], [0, 0.33, -1.75], [0, 0.2, -2.15], [0, 0.1, -2.5]], [0.16, 0.11, 0.07, 0.04, 0.015], { k: 0.04 });
  const spines = 11;
  for (let i = 0; i < spines; i++) {
    const t = i / (spines - 1), z = 0.75 - t * 1.25, h = 0.95 * Math.sin(Math.PI * (0.12 + 0.88 * t)) + 0.15, bone = z > 0.35 ? 'chest' : z > -0.2 ? 'spine' : 'pelvis';
    M.cone([0, 0.7, z], [0, 0.7 + h, z - 0.1], 0.02, 0.008, { bone, k: 0.01, region: 'horn', prio: 1 });
  }
  M.group((G) => { G.box([0, 1.15, 0.12], [0.012, 0.5, 0.68], { bone: 'spine' }); G.plane([0, 0.72, 0], [0, -1, 0], { bone: 'spine' }); G.ell([0, 0.72, 0.12], [0.1, 0.98, 0.68], { bone: 'spine', inter: true }); }, { bone: 'spine', region: 'frill', k: 0.02, gk: 0.03 });
  return M;
}

export function clips(rig) {
  return quadClips(rig, {
    root: 'pelvis', spine: ['spine', 'chest'], neck: ['neck'], head: 'head', jaw: 'jaw', tail,
    hind: ['thigh', 'shin', 'meta', 'htoe'], hindEnd: (s) => [0.48 * s, 0.03, -0.18],
    front: ['arm', 'fore', 'hand', 'ftoe'], frontEnd: (s) => [0.46 * s, 0.03, 0.82],
    walk: { type: 'walk', stride: 0.55, duty: 0.7, dur: 0.9, liftF: 0.07, liftH: 0.07, plant: 0.08, push: 0.3, fold: 0.6, toeCurl: 0.3, body: { bob: 0.008, roll: 0.03, yaw: 0.08, nod: 0.02, tail: 0.2, tailUp: 0.01, flex: 0.04 } },
    run: { type: 'trot', frames: 24, stride: 0.9, duty: 0.48, dur: 0.45, liftF: 0.1, liftH: 0.1, plant: 0.1, push: 0.4, fold: 0.9, toeCurl: 0.5, body: { bob: 0.015, roll: 0.03, yaw: 0.12, tail: 0.25, tailUp: 0.02, flex: 0.06 } },
    gallop: { type: 'trot', frames: 20, stride: 1.1, duty: 0.44, dur: 0.38, liftF: 0.12, liftH: 0.12, plant: 0.12, push: 0.45, fold: 1.0, toeCurl: 0.55, body: { bob: 0.02, roll: 0.03, yaw: 0.14, tail: 0.3, tailUp: 0.02, flex: 0.08 } },
    graze: { neck: 0.15, head: 0.15, drop: 0.01, pitch: 0.02 },
    alertNeck: 0.2, alertHead: 0.12, idleTail: 0.12,
    lieDrop: 0.42,
    lie(P, rig) { P.root[1] -= 0.42; for (const L of ['L', 'R']) { P.rz[rig.i('thigh' + L)] = (L === 'L' ? 1 : -1) * 0.6; P.rz[rig.i('arm' + L)] = (L === 'L' ? 1 : -1) * 0.6; } },
  });
}
