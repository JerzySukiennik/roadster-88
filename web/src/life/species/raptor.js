// Roadster 88 Dakotaraptor (large Hell Creek dromaeosaur): feathered SDF anatomy (long low skull, S-neck with ruff, winged forearms, stiff fan tail, raised sickle claws), rig and fast theropod clips (idle, walk, sprint, call, pounce, lie, get up).
import { Model } from '../sdf.js';
import { X, SIDES, tube, chain } from '../anatomy.js';
import { theropodClips, smooth } from '../gaits.js';

export const id = 'raptor';
export const tail = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5'];
export const meta = { mass: 300, length: 5.4, height: 1.9, hip: 1.3, speeds: { walk: 2.0, run: 15 }, lods: [{ tris: 7000 }, { tris: 1800 }, { tris: 420 }], cell: 0.016, ao: [0.015, 0.04, 0.1, 0.22], look: { neck1: 0.3, neck2: 0.6, head: 1, jaw: 1 }, pivot: [0, 1.45, 1.05], blend: 0.025 };

export function build() {
  const M = new Model('raptor', { k: 0.05 });
  M.bone('pelvis', null, [0, 1.35, 0]);
  M.bone('spine', 'pelvis', [0, 1.42, 0.42]);
  M.bone('chest', 'spine', [0, 1.38, 0.82]);
  M.bone('neck1', 'chest', [0, 1.45, 1.05]);
  M.bone('neck2', 'neck1', [0, 1.66, 1.28]);
  M.bone('head', 'neck2', [0, 1.8, 1.42]);
  M.bone('jaw', 'head', [0, 1.73, 1.52]);
  chain(M, tail, 'pelvis', [[0, 1.4, -0.35], [0, 1.42, -1.0], [0, 1.42, -1.65], [0, 1.4, -2.3], [0, 1.38, -2.9]]);
  for (const [s, L] of SIDES) {
    M.bone('thigh' + L, 'pelvis', X(s, [0.17, 1.3, 0.05]));
    M.bone('shin' + L, 'thigh' + L, X(s, [0.2, 0.86, 0.26]));
    M.bone('meta' + L, 'shin' + L, X(s, [0.2, 0.38, -0.06]));
    M.bone('toe' + L, 'meta' + L, X(s, [0.19, 0.09, 0.08]));
    M.bone('arm' + L, 'chest', X(s, [0.15, 1.22, 0.9]));
    M.bone('fore' + L, 'arm' + L, X(s, [0.24, 1.0, 0.74]));
    M.bone('hand' + L, 'fore' + L, X(s, [0.27, 1.07, 0.47]));
  }
  const F = { region: 'feather' };
  M.ell([0, 1.3, 0.36], [0.27, 0.34, 0.68], { bone: 'spine', ...F, k: 0.08 });
  M.ell([0, 1.27, 0.76], [0.24, 0.32, 0.32], { bone: 'chest', ...F, k: 0.08 });
  M.ell([0, 1.38, -0.12], [0.24, 0.29, 0.42], { bone: 'pelvis', ...F, k: 0.08 });
  M.ell([0, 1.52, 0.2], [0.14, 0.12, 0.55], { bone: 'spine', ...F, k: 0.12 });
  tube(M, ['neck1', 'neck2', 'head'], [[0, 1.4, 0.95], [0, 1.6, 1.22], [0, 1.76, 1.4]], [0.15, 0.11, 0.09], { k: 0.06 });
  M.ell([0, 1.52, 1.12], [0.16, 0.2, 0.17], { bone: 'neck1', ...F, k: 0.07 });
  tube(M, tail, [[0, 1.4, -0.3], [0, 1.42, -1.0], [0, 1.42, -1.65], [0, 1.4, -2.3], [0, 1.38, -2.9], [0, 1.36, -3.55]], [0.2, 0.14, 0.1, 0.07, 0.05, 0.03], { k: 0.05 });
  for (let i = 0; i < 4; i++) {
    const z = -1.2 - i * 0.6, w = 0.12 + i * 0.07;
    M.ell([0, 1.4 - i * 0.01, z], [w, 0.035, 0.42], { bone: tail[Math.min(4, i + 1)], ...F, k: 0.06 });
  }
  M.ell([0, 1.82, 1.58], [0.095, 0.105, 0.22], { bone: 'head', rot: [0, 0.12, 0], k: 0.04 });
  M.cone([0, 1.8, 1.7], [0, 1.73, 1.96], 0.075, 0.04, { bone: 'head', k: 0.04 });
  M.ell([0, 1.71, 1.72], [0.065, 0.045, 0.2], { bone: 'jaw', rot: [0, 0.1, 0], k: 0.03 });
  M.box([0, 1.745, 1.8], [0.12, 0.007, 0.18], { bone: 'head', rot: [0, 0.18, 0], sub: true, k: 0.008, region: 'mouth' });
  M.ell([0, 1.9, 1.5], [0.07, 0.05, 0.14], { bone: 'head', ...F, k: 0.05 });
  for (const [s, L] of SIDES) {
    M.ell(X(s, [0.075, 1.86, 1.62]), [0.022, 0.024, 0.026], { bone: 'head', k: 0.006, region: 'eye', prio: 3 });
    M.ell(X(s, [0.07, 1.89, 1.6]), [0.04, 0.02, 0.05], { bone: 'head', k: 0.02 });
    for (let i = 0; i < 6; i++) { const z = 1.72 + i * 0.04; M.cone(X(s, [0.05 - i * 0.003, 1.752, z]), X(s, [0.048 - i * 0.003, 1.735, z + 0.006]), 0.006, 0.002, { bone: 'head', k: 0.002, region: 'tooth', prio: 2 }); }
    M.ell(X(s, [0.2, 1.12, 0.12]), [0.13, 0.27, 0.19], { bone: 'thigh' + L, rot: [0, -0.4, 0], ...F, k: 0.06 });
    M.cone(X(s, [0.17, 1.28, 0.05]), X(s, [0.2, 0.86, 0.26]), 0.12, 0.08, { bone: 'thigh' + L, ...F, k: 0.05 });
    M.cone(X(s, [0.2, 0.86, 0.26]), X(s, [0.2, 0.38, -0.06]), 0.075, 0.04, { bone: 'shin' + L, k: 0.03 });
    M.ell(X(s, [0.2, 0.75, 0.2]), [0.07, 0.15, 0.08], { bone: 'shin' + L, rot: [0, 0.6, 0], ...F, k: 0.04 });
    M.cone(X(s, [0.2, 0.38, -0.06]), X(s, [0.19, 0.09, 0.08]), 0.04, 0.034, { bone: 'meta' + L, k: 0.02 });
    for (const [dx, dz] of [[-0.035, 0.24], [0.03, 0.22]]) {
      const tip = X(s, [0.19 + dx, 0.03, 0.08 + dz]);
      M.cone(X(s, [0.19 + dx * 0.4, 0.07, 0.1]), tip, 0.028, 0.018, { bone: 'toe' + L, k: 0.012 });
      M.cone(tip, X(s, [0.19 + dx, 0.008, 0.14 + dz]), 0.017, 0.004, { bone: 'toe' + L, k: 0.004, region: 'claw', prio: 2 });
    }
    M.cone(X(s, [0.16, 0.09, 0.1]), X(s, [0.15, 0.17, 0.2]), 0.026, 0.02, { bone: 'toe' + L, k: 0.01 });
    M.cone(X(s, [0.15, 0.17, 0.2]), X(s, [0.15, 0.1, 0.3]), 0.02, 0.004, { bone: 'toe' + L, k: 0.004, region: 'claw', prio: 2 });
    M.cone(X(s, [0.15, 1.22, 0.9]), X(s, [0.24, 1.0, 0.74]), 0.06, 0.045, { bone: 'arm' + L, ...F, k: 0.03 });
    M.cone(X(s, [0.24, 1.0, 0.74]), X(s, [0.27, 1.07, 0.47]), 0.042, 0.032, { bone: 'fore' + L, ...F, k: 0.03 });
    M.cone(X(s, [0.27, 1.07, 0.47]), X(s, [0.28, 1.02, 0.25]), 0.028, 0.016, { bone: 'hand' + L, k: 0.02 });
    M.cone(X(s, [0.28, 1.02, 0.25]), X(s, [0.28, 0.98, 0.2]), 0.015, 0.004, { bone: 'hand' + L, k: 0.004, region: 'claw', prio: 2 });
    M.ell(X(s, [0.27, 0.93, 0.62]), [0.02, 0.13, 0.17], { bone: 'fore' + L, rot: [0, 0.35, 0], ...F, k: 0.03 });
    M.ell(X(s, [0.29, 0.98, 0.36]), [0.018, 0.12, 0.2], { bone: 'hand' + L, rot: [0, 0.2, 0], ...F, k: 0.03 });
  }
  return M;
}

export function clips(rig) {
  return theropodClips(rig, {
    tail, toeEnd: (s) => [0.19 * s, 0.02, 0.32], arm: [0, 0, 0], breath: 0.008, crouch: 0.02, lieDrop: 1.0, roarJaw: 0.55, roarDur: 1.4, biteDur: 0.8, getupDur: 1.0,
    walk: { frames: 32, dur: 0.75, stride: 0.95, duty: 0.6, lift: 0.14, metaPlant: 0.12, metaPush: 0.5, metaSwing: 0.9, toePush: 0.4, toeCurl: 0.5 },
    walkBody: { bob: 0.025, sink: 0.02, pitch: 0.02, pitchBob: 0.01, roll: 0.02, yaw: 0.03, tail: 0.04, tailUp: 0.01, neck: 0.02, neckBob: 0.04, jaw: 0, arm: 0.02 },
    run: { frames: 24, dur: 0.42, stride: 2.4, duty: 0.34, lift: 0.36, metaPlant: 0.2, metaPush: 0.75, metaSwing: 1.25, toePush: 0.7, toeCurl: 0.8, liftSkew: 0.75 },
    runBody: { bob: 0.06, sink: 0.12, pitch: 0.12, pitchBob: 0.03, roll: 0.015, yaw: 0.01, tail: 0.02, tailUp: 0.03, neck: 0.18, neckBob: 0.05, jaw: 0.05, arm: 0.05, head: -0.1 },
    extra: (h) => [{ name: 'pounce', frames: 28, loop: false, dur: 0.9, speed: 0, pose(t, P) {
      h.idlePose(P, t, 0);
      const crouch = smooth(t / 0.35) * (1 - smooth((t - 0.35) / 0.1)), leap = smooth((t - 0.35) / 0.2) * (1 - smooth((t - 0.75) / 0.25));
      P.root[1] += -0.25 * crouch + 0.55 * leap; P.root[2] += 0.9 * leap;
      P.rx[rig.i('pelvis')] += 0.2 * crouch - 0.15 * leap;
      for (const L of ['L', 'R']) { P.rx[rig.i('arm' + L)] += -0.9 * leap; P.rz[rig.i('arm' + L)] += (L === 'L' ? -0.6 : 0.6) * leap; P.rx[rig.i('thigh' + L)] += -0.9 * leap; P.rx[rig.i('shin' + L)] += 0.6 * leap; P.rx[rig.i('meta' + L)] += -0.6 * leap; P.rx[rig.i('toe' + L)] += -0.5 * leap; }
      P.rx[rig.i('jaw')] += 0.5 * leap;
    } }],
  });
}
