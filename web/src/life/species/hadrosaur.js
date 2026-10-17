// Roadster 88 Edmontosaurus (duck-billed hadrosaur): SDF anatomy (long deep tail, strong hind legs, slender hooved forelimbs, long flat skull with a broad keratin bill), rig and clips (idle, graze, alert, four-legged walk, two-legged run, lie, get up).
import { Model } from '../sdf.js';
import { X, SIDES, tube, limb, chain } from '../anatomy.js';
import { quadClips, bipedLegs, bipedSetup, chainWave, wave, TAU } from '../gaits.js';

export const id = 'hadrosaur';
export const tail = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5'];
export const meta = { mass: 4000, length: 11.5, height: 3.6, hip: 2.8, speeds: { walk: 1.6, run: 9 }, lods: [{ tris: 7500 }, { tris: 2000 }, { tris: 500 }], cell: 0.03, ao: [0.03, 0.09, 0.22, 0.5], look: { neck1: 0.3, neck2: 0.6, head: 1, jaw: 1 }, pivot: [0, 2.45, 2.4] };

export function build() {
  const M = new Model('hadrosaur', { k: 0.1 });
  M.bone('pelvis', null, [0, 2.9, -0.6]);
  M.bone('spine', 'pelvis', [0, 2.85, 0.6]);
  M.bone('chest', 'spine', [0, 2.5, 1.7]);
  M.bone('neck1', 'chest', [0, 2.4, 2.4]);
  M.bone('neck2', 'neck1', [0, 2.65, 3.1]);
  M.bone('head', 'neck2', [0, 2.9, 3.55]);
  M.bone('jaw', 'head', [0, 2.72, 3.82]);
  chain(M, tail, 'pelvis', [[0, 2.85, -1.7], [0, 2.7, -3.0], [0, 2.45, -4.3], [0, 2.15, -5.5], [0, 1.85, -6.6]]);
  for (const [s, L] of SIDES) {
    limb(M, s, L, 'pelvis', ['thigh', 'shin', 'meta', 'htoe'], [[0.5, 2.75, -0.55], [0.56, 1.65, -0.15], [0.56, 0.62, -0.55], [0.55, 0.13, -0.32]], [0.36, 0.24, 0.14, 0.12], { k: 0.07, end: [0.55, 0.05, 0.12], endR: 0.07, muscles: [{ c: [0.58, 2.25, -0.38], r: [0.38, 0.75, 0.55], rot: [0, -0.3, 0], k: 0.15 }, { c: [0.57, 1.4, -0.22], r: [0.2, 0.42, 0.24], bone: 1, rot: [0, 0.35, 0], k: 0.08 }] });
    for (const dx of [-0.11, 0, 0.11]) { M.cone(X(s, [0.55 + dx * 0.4, 0.1, -0.28]), X(s, [0.55 + dx * 1.3, 0.04, 0.05]), 0.07, 0.05, { bone: 'htoe' + L, k: 0.03 }); M.ell(X(s, [0.55 + dx * 1.35, 0.04, 0.1]), [0.05, 0.035, 0.06], { bone: 'htoe' + L, k: 0.015, region: 'hoof', prio: 2 }); }
    limb(M, s, L, 'chest', ['arm', 'fore', 'hand', 'ftoe'], [[0.45, 2.15, 1.85], [0.52, 1.4, 1.6], [0.5, 0.55, 1.78], [0.5, 0.12, 1.85]], [0.17, 0.11, 0.07, 0.06], { k: 0.05, end: [0.5, 0.04, 2.0], endR: 0.05, muscles: [{ c: [0.52, 1.85, 1.75], r: [0.2, 0.36, 0.24], k: 0.08 }] });
    M.ell(X(s, [0.5, 0.05, 1.95]), [0.07, 0.05, 0.08], { bone: 'ftoe' + L, k: 0.02, region: 'hoof', prio: 2 });
  }
  M.ell([0, 2.45, 0.35], [0.78, 0.88, 1.75], { bone: 'spine', k: 0.16 });
  M.ell([0, 2.75, -0.7], [0.62, 0.72, 1.0], { bone: 'pelvis', k: 0.16 });
  M.ell([0, 3.18, -0.25], [0.32, 0.3, 1.5], { bone: 'spine', k: 0.3 });
  M.ell([0, 2.25, 1.65], [0.6, 0.66, 0.65], { bone: 'chest', k: 0.14 });
  tube(M, ['neck1', 'neck2', 'head'], [[0, 2.3, 2.1], [0, 2.62, 3.05], [0, 2.86, 3.5]], [0.46, 0.3, 0.24], { k: 0.14, flat: [0.8, 1.15] });
  tube(M, tail, [[0, 2.85, -1.3], [0, 2.7, -3.0], [0, 2.45, -4.3], [0, 2.15, -5.5], [0, 1.85, -6.6], [0, 1.55, -7.7]], [0.56, 0.42, 0.3, 0.2, 0.12, 0.04], { k: 0.1, flat: [0.62, 1.4] });
  M.ell([0, 2.95, 3.92], [0.21, 0.26, 0.5], { bone: 'head', rot: [0, 0.38, 0], k: 0.08 });
  M.ell([0, 2.72, 4.35], [0.17, 0.17, 0.36], { bone: 'head', rot: [0, 0.48, 0], k: 0.08 });
  M.ell([0, 2.56, 4.62], [0.21, 0.1, 0.22], { bone: 'head', rot: [0, 0.4, 0], k: 0.06, region: 'beak', prio: 1 });
  M.ell([0, 2.62, 4.2], [0.16, 0.1, 0.5], { bone: 'jaw', rot: [0, 0.42, 0], k: 0.06 });
  M.ell([0, 2.46, 4.52], [0.18, 0.07, 0.17], { bone: 'jaw', rot: [0, 0.4, 0], k: 0.05, region: 'beak', prio: 1 });
  M.box([0, 2.6, 4.32], [0.3, 0.012, 0.45], { bone: 'head', rot: [0, 0.44, 0], sub: true, k: 0.015, region: 'mouth' });
  for (const [s] of SIDES) {
    M.ell(X(s, [0.17, 3.04, 3.85]), [0.032, 0.035, 0.04], { bone: 'head', k: 0.008, region: 'eye', prio: 3 });
    M.ell(X(s, [0.1, 2.75, 4.45]), [0.04, 0.03, 0.1], { bone: 'head', sub: true, k: 0.02 });
  }
  return M;
}

export function clips(rig) {
  const bip = [bipedSetup(rig, 0, ['thighL', 'shinL', 'metaL', 'htoeL'], [0.55, 0.05, 0.12]), bipedSetup(rig, 0.5, ['thighR', 'shinR', 'metaR', 'htoeR'], [-0.55, 0.05, 0.12])];
  const run = { frames: 28, dur: 0.72, stride: 2.4, duty: 0.38, lift: 0.5, metaPlant: 0.2, metaPush: 0.7, metaSwing: 1.1, toePush: 0.6, toeCurl: 0.6, liftSkew: 0.8 };
  return quadClips(rig, {
    root: 'pelvis', spine: ['spine', 'chest'], neck: ['neck1', 'neck2'], head: 'head', jaw: 'jaw', tail,
    hind: ['thigh', 'shin', 'meta', 'htoe'], hindEnd: (s) => [0.55 * s, 0.05, 0.12],
    front: ['arm', 'fore', 'hand', 'ftoe'], frontEnd: (s) => [0.5 * s, 0.04, 2.0],
    walk: { type: 'walk', stride: 1.6, duty: 0.66, dur: 1.5, liftF: 0.15, liftH: 0.25, plant: 0.1, push: 0.4, fold: 0.7, toeCurl: 0.3, body: { bob: 0.04, sink: 0.02, roll: 0.03, yaw: 0.02, nod: 0.03, nodPh: 0.2, tail: 0.06, tailUp: 0.02 } },
    graze: { neck: 0.65, head: 0.4, drop: 0.08, pitch: 0.08 },
    alertNeck: 0.3, alertHead: 0.15, idleTail: 0.05,
    lieDrop: 1.85,
    lie(P, rig) { P.root[1] -= 1.85; for (const L of ['L', 'R']) { P.rx[rig.i('thigh' + L)] = -1.2; P.rx[rig.i('shin' + L)] = 2.1; P.rx[rig.i('meta' + L)] = -1.5; P.rx[rig.i('arm' + L)] = -0.8; P.rx[rig.i('fore' + L)] = 1.7; } P.rx[rig.i('neck1')] += 0.3; tail.forEach((n, i) => { P.rx[rig.i(n)] += 0.04 + i * 0.02; }); },
    clips(L0, h) {
      return [{ name: 'run', frames: run.frames, loop: true, dur: run.dur, speed: run.stride / (run.duty * run.dur), stride: run.stride, pose(t, P) {
        P.root[1] += 0.1 * Math.cos(TAU * (2 * t - 0.3)) - 0.12;
        h.add(P, 'rx', 'pelvis', -0.12 + 0.02 * wave(t, 0.1, 2));
        h.add(P, 'rx', 'chest', 0.06); h.add(P, 'rx', 'neck1', 0.12 + 0.04 * wave(t, 0.35, 2)); h.add(P, 'rx', 'head', 0.06);
        chainWave(P, rig, tail, 'ry', 0.04, t, 0.09, 1, 0.25); chainWave(P, rig, tail, 'rx', 0.03, t, 0.12, 2, 0.1);
        tail.forEach((n) => { P.rx[rig.i(n)] += 0.03; });
        for (const L of ['L', 'R']) { h.add(P, 'rx', 'arm' + L, -0.5); h.add(P, 'rx', 'fore' + L, 0.9); h.add(P, 'rx', 'hand' + L, -0.4); }
        bipedLegs(rig, P, t, run, bip);
      } }];
    },
  });
}
