// Roadster 88 canid (coyote by default, scaled and tinted per instance into wolves and dogs): SDF anatomy (lean deep chest, tucked belly, long muzzle, tall ears, digitigrade paws, bushy tail), rig and clips (idle, sniff, alert, walk, trot, lope, howl, lie, get up).
import { Model } from '../sdf.js';
import { X, SIDES, tube, limb, chain } from '../anatomy.js';
import { quadClips, smooth, wave } from '../gaits.js';

export const id = 'canid';
export const tail = ['tail1', 'tail2', 'tail3'];
export const meta = { mass: 14, length: 1.2, height: 0.9, hip: 0.58, speeds: { walk: 1.3, trot: 3.2, run: 12 }, lods: [{ tris: 4500 }, { tris: 1200 }, { tris: 300 }], cell: 0.0055, ao: [0.006, 0.016, 0.04, 0.09], look: { neck: 0.4, head: 1, jaw: 1, earL: 1, earR: 1 }, pivot: [0, 0.62, 0.36], blend: 0.012 };

export function build() {
  const M = new Model('canid', { k: 0.025 });
  M.bone('pelvis', null, [0, 0.58, -0.32]);
  M.bone('spine', 'pelvis', [0, 0.6, 0.0]);
  M.bone('chest', 'spine', [0, 0.58, 0.28]);
  M.bone('neck', 'chest', [0, 0.64, 0.4]);
  M.bone('head', 'neck', [0, 0.77, 0.52]);
  M.bone('jaw', 'head', [0, 0.72, 0.6]);
  for (const [s, L] of SIDES) M.bone('ear' + L, 'head', X(s, [0.045, 0.84, 0.53]));
  chain(M, tail, 'pelvis', [[0, 0.6, -0.48], [0, 0.5, -0.72], [0, 0.38, -0.92]]);
  for (const [s, L] of SIDES) {
    limb(M, s, L, 'pelvis', ['thigh', 'shin', 'meta', 'htoe'], [[0.075, 0.55, -0.33], [0.085, 0.38, -0.22], [0.08, 0.19, -0.38], [0.08, 0.04, -0.33]], [0.055, 0.035, 0.018, 0.017], { k: 0.02, end: [0.08, 0.018, -0.26], endR: 0.022, muscles: [{ c: [0.085, 0.47, -0.3], r: [0.045, 0.1, 0.075], rot: [0, -0.3, 0], k: 0.03 }] });
    limb(M, s, L, 'chest', ['arm', 'fore', 'hand', 'ftoe'], [[0.075, 0.5, 0.3], [0.08, 0.34, 0.22], [0.075, 0.1, 0.26], [0.075, 0.04, 0.28]], [0.045, 0.028, 0.018, 0.017], { k: 0.02, end: [0.075, 0.018, 0.34], endR: 0.022, muscles: [{ c: [0.08, 0.44, 0.27], r: [0.04, 0.08, 0.06], k: 0.03 }] });
    for (const [b, c] of [['htoe', [0.08, 0.02, -0.27]], ['ftoe', [0.075, 0.02, 0.33]]]) M.ell(X(s, c), [0.024, 0.02, 0.035], { bone: b + L, k: 0.012 });
  }
  M.ell([0, 0.55, 0.05], [0.1, 0.13, 0.3], { bone: 'spine', k: 0.04 });
  M.ell([0, 0.52, 0.27], [0.11, 0.16, 0.14], { bone: 'chest', k: 0.04 });
  M.ell([0, 0.57, -0.3], [0.09, 0.1, 0.13], { bone: 'pelvis', k: 0.04 });
  M.ell([0, 0.62, 0.12], [0.07, 0.06, 0.28], { bone: 'spine', k: 0.05, region: 'mane' });
  tube(M, ['neck', 'head'], [[0, 0.58, 0.34], [0, 0.75, 0.5]], [0.085, 0.065], { k: 0.04, flat: [0.85, 1.15] });
  M.ell([0, 0.66, 0.42], [0.08, 0.1, 0.08], { bone: 'neck', k: 0.04, region: 'mane' });
  M.ell([0, 0.78, 0.56], [0.06, 0.06, 0.07], { bone: 'head', k: 0.03 });
  M.cone([0, 0.76, 0.6], [0, 0.72, 0.73], 0.042, 0.022, { bone: 'head', k: 0.02 });
  M.ell([0, 0.725, 0.735], [0.014, 0.012, 0.012], { bone: 'head', k: 0.006, region: 'nose', prio: 2 });
  M.ell([0, 0.7, 0.66], [0.026, 0.015, 0.07], { bone: 'jaw', k: 0.012 });
  M.box([0, 0.712, 0.68], [0.032, 0.003, 0.05], { bone: 'head', sub: true, k: 0.004, region: 'mouth' });
  for (const [s, L] of SIDES) {
    M.cone(X(s, [0.04, 0.82, 0.53]), X(s, [0.05, 0.9, 0.52]), 0.022, 0.004, { bone: 'ear' + L, k: 0.008 });
    M.ell(X(s, [0.033, 0.795, 0.6]), [0.009, 0.009, 0.01], { bone: 'head', k: 0.003, region: 'eye', prio: 3 });
  }
  tube(M, tail, [[0, 0.6, -0.44], [0, 0.5, -0.72], [0, 0.38, -0.92], [0, 0.28, -1.05]], [0.035, 0.05, 0.05, 0.02], { k: 0.025, region: 'mane' });
  return M;
}

export function clips(rig) {
  return quadClips(rig, {
    root: 'pelvis', spine: ['spine', 'chest'], neck: ['neck'], head: 'head', jaw: 'jaw', tail,
    hind: ['thigh', 'shin', 'meta', 'htoe'], hindEnd: (s) => [0.08 * s, 0.018, -0.26],
    front: ['arm', 'fore', 'hand', 'ftoe'], frontEnd: (s) => [0.075 * s, 0.018, 0.34],
    walk: { type: 'walk', frames: 32, stride: 0.42, duty: 0.62, dur: 0.52, liftF: 0.05, liftH: 0.05, plant: 0.1, push: 0.4, fold: 0.9, toeCurl: 0.6, body: { bob: 0.006, roll: 0.01, nod: 0.03, tail: 0.06, tailUp: 0.01 } },
    trot: { type: 'trot', frames: 24, stride: 0.7, duty: 0.44, dur: 0.38, liftF: 0.07, liftH: 0.07, plant: 0.15, push: 0.6, fold: 1.3, toeCurl: 0.9, body: { bob: 0.012, sink: 0.01, nod: 0.02, neck: 0.1, tail: 0.04, tailUp: 0.03 } },
    gallop: { type: 'bound', frames: 20, stride: 1.25, duty: 0.3, dur: 0.33, liftF: 0.1, liftH: 0.1, plant: 0.2, push: 0.75, fold: 1.6, toeCurl: 1.2, body: { bob: 0.02, sink: 0.03, rock: 0.08, rockPh: 0.15, flex: 0.12, flexPh: 0.1, nod: 0.05, neck: 0.25, head: -0.1, tail: 0.02, tailUp: 0.1 } },
    graze: { neck: 0.85, head: 0.45, drop: 0.02, pitch: 0.05 },
    alertNeck: 0.25, alertHead: 0.1, idleTail: 0.08,
    lieDrop: 0.36,
    lie(P, rig) { P.root[1] -= 0.36; for (const L of ['L', 'R']) { P.rx[rig.i('thigh' + L)] = -1.3; P.rx[rig.i('shin' + L)] = 2.3; P.rx[rig.i('meta' + L)] = -1.5; P.rx[rig.i('arm' + L)] = -1.5; P.rx[rig.i('fore' + L)] = 0.2; P.rx[rig.i('hand' + L)] = 1.2; } P.rx[rig.i('neck')] += 0.4; P.rx[rig.i('head')] += -0.2; },
    extra(P, rig, t, name) { const e = name === 'gallop' ? 0.6 : name === 'alert' ? -0.15 : 0.1 * wave(t, 0.3, 2); P.rx[rig.i('earL')] += e; P.rx[rig.i('earR')] += e; },
    clips(L0, h) {
      return [{ name: 'howl', frames: 40, loop: false, dur: 3.0, speed: 0, pose(t, P) {
        const k = smooth(t / 0.2) * (1 - smooth((t - 0.85) / 0.15));
        h.base(P); h.add(P, 'rx', 'neck', -0.9 * k); h.add(P, 'rx', 'head', -0.5 * k); h.add(P, 'rx', 'jaw', 0.35 * k * (0.8 + 0.2 * Math.sin(t * 25)));
        h.add(P, 'rx', 'pelvis', -0.05 * k); h.add(P, 'rx', 'earL', 0.3 * k); h.add(P, 'rx', 'earR', 0.3 * k); h.standLegs(P, L0);
      } }];
    },
  });
}
