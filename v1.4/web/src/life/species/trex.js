// Roadster 88 Tyrannosaurus rex: hand-built SDF anatomy (deep skull with teeth, heavy thighs, three-toed digitigrade feet, tiny arms, long counterweight tail), rig and procedural clips (idle, walk, run, roar, bite, lie, get up).
import { Model } from '../sdf.js';
import { theropodClips } from '../gaits.js';

export const id = 'trex';
export const meta = { mass: 7800, length: 12, height: 4.4, hip: 3.3, speeds: { walk: 2.5, run: 9.5 }, lods: [{ tris: 9000 }, { tris: 2400 }, { tris: 600 }], cell: 0.035, ao: [0.04, 0.12, 0.3, 0.7], look: { neck1: 0.25, neck2: 0.55, head: 1, jaw: 1 }, pivot: [0, 3.55, 2.5] };
export const tail = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5'];

const X = (s, p) => [p[0] * s, p[1], p[2]];

export function build() {
  const M = new Model('trex', { k: 0.12 });
  M.bone('pelvis', null, [0, 3.45, 0]);
  M.bone('spine', 'pelvis', [0, 3.55, 0.9]);
  M.bone('chest', 'spine', [0, 3.5, 1.9]);
  M.bone('neck1', 'chest', [0, 3.55, 2.55]);
  M.bone('neck2', 'neck1', [0, 3.85, 3.12]);
  M.bone('head', 'neck2', [0, 4.02, 3.55]);
  M.bone('jaw', 'head', [0, 3.86, 3.72]);
  M.bone('tail1', 'pelvis', [0, 3.5, -0.9]);
  M.bone('tail2', 'tail1', [0, 3.42, -2.1]);
  M.bone('tail3', 'tail2', [0, 3.3, -3.3]);
  M.bone('tail4', 'tail3', [0, 3.15, -4.5]);
  M.bone('tail5', 'tail4', [0, 3.0, -5.6]);
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    M.bone('thigh' + L, 'pelvis', X(s, [0.56, 3.3, 0.1]));
    M.bone('shin' + L, 'thigh' + L, X(s, [0.62, 2.05, 0.55]));
    M.bone('meta' + L, 'shin' + L, X(s, [0.62, 0.86, -0.2]));
    M.bone('toe' + L, 'meta' + L, X(s, [0.6, 0.15, 0.2]));
    M.bone('arm' + L, 'chest', X(s, [0.4, 2.95, 2.05]));
    M.bone('fore' + L, 'arm' + L, X(s, [0.46, 2.62, 2.28]));
    M.bone('hand' + L, 'fore' + L, X(s, [0.47, 2.47, 2.58]));
  }

  M.ell([0, 3.44, -0.25], [0.64, 0.78, 1.15], { bone: 'pelvis' });
  M.ell([0, 3.14, 0.95], [0.72, 0.9, 1.6], { bone: 'spine', rot: [0, -0.06, 0] });
  M.ell([0, 3.2, 1.92], [0.64, 0.86, 0.86], { bone: 'chest' });
  M.ell([0, 3.78, 0.55], [0.42, 0.36, 1.7], { bone: 'spine', k: 0.25 });
  M.ell([0, 2.6, 1.5], [0.46, 0.3, 0.78], { bone: 'chest', k: 0.35 });
  M.cone([0, 3.35, 2.15], [0, 3.72, 2.85], 0.66, 0.52, { bone: 'chest', bone2: 'neck1', k: 0.2 });
  M.cone([0, 3.72, 2.85], [0, 3.95, 3.35], 0.5, 0.44, { bone: 'neck1', bone2: 'neck2', k: 0.15 });
  M.ell([0, 3.82, 3.05], [0.4, 0.5, 0.42], { bone: 'neck2', k: 0.15 });

  M.box([0, 4.1, 3.92], [0.34, 0.33, 0.4], { bone: 'head', round: 0.2, rot: [0, 0.12, 0], k: 0.12 });
  M.ell([0, 3.93, 3.82], [0.43, 0.34, 0.42], { bone: 'head', k: 0.12 });
  M.ell([0, 4.0, 4.42], [0.26, 0.28, 0.62], { bone: 'head', k: 0.1 });
  M.ell([0, 3.97, 4.86], [0.18, 0.21, 0.2], { bone: 'head', k: 0.08 });
  M.cone([0, 4.26, 3.9], [0, 4.08, 4.86], 0.15, 0.09, { bone: 'head', k: 0.1 });
  for (const s of [1, -1]) {
    M.ell(X(s, [0.2, 3.98, 4.45]), [0.13, 0.15, 0.5], { bone: 'head', k: 0.1 });
    M.ell(X(s, [0.27, 4.33, 3.98]), [0.12, 0.07, 0.15], { bone: 'head', k: 0.06 });
    M.ell(X(s, [0.22, 4.38, 3.72]), [0.1, 0.08, 0.12], { bone: 'head', k: 0.08 });
  }
  M.ell([0, 3.73, 4.2], [0.31, 0.17, 0.72], { bone: 'jaw', k: 0.08 });
  M.cone([0, 3.7, 3.85], [0, 3.77, 4.92], 0.27, 0.13, { bone: 'jaw', k: 0.08 });
  M.ell([0, 3.78, 3.78], [0.36, 0.24, 0.3], { bone: 'jaw', k: 0.1 });
  M.box([0, 3.875, 4.52], [0.6, 0.022, 0.52], { bone: 'head', sub: true, k: 0.02, region: 'mouth', rot: [0, 0.07, 0] });
  for (const s of [1, -1]) {
    for (let i = 0; i < 9; i++) {
      const z = 3.98 + i * 0.105, w = 0.27 - i * 0.012, y = 3.9 - i * 0.008, l = 0.07 - Math.abs(i - 3) * 0.004;
      M.cone(X(s, [w, y + 0.02, z]), X(s, [w - 0.01, y - l, z + 0.01]), 0.022, 0.006, { bone: 'head', k: 0.005, region: 'tooth', prio: 2 });
    }
    for (let i = 0; i < 8; i++) {
      const z = 4.05 + i * 0.1, w = 0.235 - i * 0.012, y = 3.86 + i * 0.01;
      M.cone(X(s, [w, y - 0.02, z]), X(s, [w - 0.005, y + 0.045, z + 0.01]), 0.018, 0.005, { bone: 'jaw', k: 0.005, region: 'tooth', prio: 2 });
    }
    M.ell(X(s, [0.305, 4.22, 3.99]), [0.05, 0.055, 0.065], { bone: 'head', k: 0.012, region: 'eye', prio: 3 });
    M.ell(X(s, [0.1, 4.04, 4.96]), [0.035, 0.03, 0.05], { bone: 'head', sub: true, k: 0.02 });
  }

  M.cone([0, 3.52, -0.6], [0, 3.46, -1.7], 0.7, 0.56, { bone: 'tail1', bone2: 'tail2', k: 0.2 });
  M.ell([0, 3.38, -1.3], [0.5, 0.7, 0.95], { bone: 'tail1', k: 0.2 });
  M.cone([0, 3.46, -1.7], [0, 3.3, -3.3], 0.56, 0.37, { bone: 'tail2', bone2: 'tail3', k: 0.12 });
  M.cone([0, 3.3, -3.3], [0, 3.15, -4.5], 0.37, 0.24, { bone: 'tail3', bone2: 'tail4', k: 0.1 });
  M.cone([0, 3.15, -4.5], [0, 3.0, -5.6], 0.24, 0.13, { bone: 'tail4', bone2: 'tail5', k: 0.08 });
  M.cone([0, 3.0, -5.6], [0, 2.86, -6.75], 0.13, 0.035, { bone: 'tail5', k: 0.06 });

  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    M.ell(X(s, [0.6, 2.82, 0.18]), [0.44, 0.92, 0.66], { bone: 'thigh' + L, rot: [0, -0.33, 0], k: 0.16 });
    M.cone(X(s, [0.56, 3.25, 0.1]), X(s, [0.62, 2.05, 0.55]), 0.42, 0.3, { bone: 'thigh' + L, k: 0.12 });
    M.cone(X(s, [0.62, 2.05, 0.55]), X(s, [0.62, 0.86, -0.2]), 0.29, 0.13, { bone: 'shin' + L, k: 0.08 });
    M.ell(X(s, [0.62, 1.78, 0.44]), [0.27, 0.5, 0.3], { bone: 'shin' + L, rot: [0, 0.55, 0], k: 0.1 });
    M.cone(X(s, [0.62, 0.86, -0.2]), X(s, [0.6, 0.15, 0.2]), 0.14, 0.11, { bone: 'meta' + L, k: 0.05 });
    M.ell(X(s, [0.6, 0.11, 0.24]), [0.2, 0.1, 0.2], { bone: 'toe' + L, k: 0.06 });
    for (const [dx, dz, ln] of [[-0.13, 0.55, 0.92], [0, 0.75, 1.0], [0.13, 0.5, 0.88]]) {
      const tip = X(s, [0.6 + dx * 1.6, 0.06, 0.2 + dz]);
      M.cone(X(s, [0.6 + dx * 0.4, 0.12, 0.22]), tip, 0.085, 0.055, { bone: 'toe' + L, k: 0.04 });
      M.cone(tip, X(s, [0.6 + dx * 1.8, 0.02, 0.2 + dz + 0.17]), 0.05, 0.012, { bone: 'toe' + L, k: 0.012, region: 'claw', prio: 2 });
      void ln;
    }
    M.cone(X(s, [0.4, 2.95, 2.05]), X(s, [0.46, 2.62, 2.28]), 0.13, 0.095, { bone: 'arm' + L, k: 0.06 });
    M.cone(X(s, [0.46, 2.62, 2.28]), X(s, [0.47, 2.47, 2.58]), 0.09, 0.07, { bone: 'fore' + L, k: 0.05 });
    for (const dx of [-0.03, 0.03]) {
      const tip = X(s, [0.47 + dx, 2.38, 2.8]);
      M.cone(X(s, [0.47, 2.47, 2.6]), tip, 0.04, 0.025, { bone: 'hand' + L, k: 0.02 });
      M.cone(tip, X(s, [0.47 + dx, 2.3, 2.88]), 0.022, 0.006, { bone: 'hand' + L, k: 0.006, region: 'claw', prio: 2 });
    }
  }
  return M;
}

export function clips(rig) {
  return theropodClips(rig, {
    tail, toeEnd: (s) => [0.6 * s, 0.05, 0.95], arm: [0.25, -0.5, -0.3], breath: 0.018, crouch: 0.04, lieDrop: 2.35, roarJaw: 0.75,
    walk: { frames: 40, dur: 1.55, stride: 2.4, duty: 0.62, lift: 0.42, metaPlant: 0.15, metaPush: 0.55, metaSwing: 0.85, toePush: 0.5, toeCurl: 0.55 },
    walkBody: { bob: 0.06, sink: 0.05, pitch: 0.02, pitchBob: 0.01, roll: 0.035, yaw: 0.03, tail: 0.07, tailUp: 0.02, neck: 0.02, neckBob: 0.025, jaw: 0.02, arm: 0.05 },
    run: { frames: 32, dur: 0.92, stride: 3.6, duty: 0.4, lift: 0.75, metaPlant: 0.2, metaPush: 0.7, metaSwing: 1.15, toePush: 0.7, toeCurl: 0.75, liftSkew: 0.8 },
    runBody: { bob: 0.16, sink: 0.22, pitch: 0.08, pitchBob: 0.025, roll: 0.025, yaw: 0.02, tail: 0.05, tailUp: 0.04, neck: 0.1, neckBob: 0.04, jaw: 0.08, arm: 0.12 },
  });
}
