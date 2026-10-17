// Roadster 88 mule deer: SDF anatomy (slender barrel, long thin legs with small cloven hooves, long neck, big ears, dark-tipped tail), rig and clips (idle, graze, alert, walk, trot, bound, lie, get up).
import { Model } from '../sdf.js';
import { X, SIDES, tube, limb, chain } from '../anatomy.js';
import { quadClips, wave } from '../gaits.js';

export const id = 'deer';
export const tail = ['tail1', 'tail2'];
export const meta = { mass: 70, length: 1.6, height: 1.6, hip: 1.0, speeds: { walk: 1.2, trot: 3.5, run: 13 }, lods: [{ tris: 5000 }, { tris: 1300 }, { tris: 330 }], cell: 0.008, ao: [0.008, 0.024, 0.06, 0.13], look: { neck1: 0.3, neck2: 0.6, head: 1, earL: 1, earR: 1 }, pivot: [0, 1.0, 0.45], blend: 0.015 };

export function build() {
  const M = new Model('deer', { k: 0.035 });
  M.bone('pelvis', null, [0, 0.98, -0.4]);
  M.bone('spine', 'pelvis', [0, 0.97, 0.05]);
  M.bone('chest', 'spine', [0, 0.95, 0.38]);
  M.bone('neck1', 'chest', [0, 1.0, 0.5]);
  M.bone('neck2', 'neck1', [0, 1.18, 0.7]);
  M.bone('head', 'neck2', [0, 1.34, 0.84]);
  M.bone('jaw', 'head', [0, 1.27, 0.93]);
  for (const [s, L] of SIDES) M.bone('ear' + L, 'head', X(s, [0.06, 1.41, 0.84]));
  chain(M, tail, 'pelvis', [[0, 1.0, -0.68], [0, 0.92, -0.76]]);
  for (const [s, L] of SIDES) {
    limb(M, s, L, 'pelvis', ['thigh', 'shin', 'meta', 'htoe'], [[0.12, 0.92, -0.4], [0.13, 0.62, -0.25], [0.12, 0.38, -0.5], [0.12, 0.1, -0.46]], [0.085, 0.05, 0.025, 0.022], { k: 0.025, end: [0.12, 0.03, -0.4], endR: 0.024, muscles: [{ c: [0.13, 0.8, -0.38], r: [0.075, 0.17, 0.13], rot: [0, -0.3, 0], k: 0.05 }] });
    M.ell(X(s, [0.12, 0.03, -0.39]), [0.022, 0.03, 0.04], { bone: 'htoe' + L, k: 0.008, region: 'hoof', prio: 2 });
    limb(M, s, L, 'chest', ['arm', 'fore', 'hand', 'ftoe'], [[0.11, 0.82, 0.38], [0.12, 0.62, 0.28], [0.11, 0.3, 0.32], [0.11, 0.1, 0.33]], [0.07, 0.04, 0.024, 0.022], { k: 0.025, end: [0.11, 0.03, 0.4], endR: 0.024, muscles: [{ c: [0.12, 0.74, 0.34], r: [0.06, 0.13, 0.1], k: 0.04 }] });
    M.ell(X(s, [0.11, 0.03, 0.41]), [0.022, 0.03, 0.04], { bone: 'ftoe' + L, k: 0.008, region: 'hoof', prio: 2 });
  }
  M.ell([0, 0.86, 0.0], [0.18, 0.22, 0.48], { bone: 'spine', k: 0.05 });
  M.ell([0, 0.9, -0.4], [0.17, 0.18, 0.24], { bone: 'pelvis', k: 0.05 });
  M.ell([0, 0.86, 0.38], [0.16, 0.22, 0.2], { bone: 'chest', k: 0.05 });
  tube(M, ['neck1', 'neck2', 'head'], [[0, 0.93, 0.42], [0, 1.18, 0.7], [0, 1.33, 0.84]], [0.14, 0.09, 0.065], { k: 0.045, flat: [0.72, 1.3] });
  M.ell([0, 1.350, 0.900], [0.055, 0.065, 0.08], { bone: 'head', k: 0.03 });
  M.cone([0, 1.330, 0.930], [0, 1.220, 1.100], 0.05, 0.03, { bone: 'head', k: 0.025 });
  M.ell([0, 1.220, 1.110], [0.026, 0.024, 0.022], { bone: 'head', k: 0.01, region: 'nose', prio: 1 });
  M.ell([0, 1.230, 1.000], [0.025, 0.018, 0.08], { bone: 'jaw', rot: [0, 0.7, 0], k: 0.015 });
  for (const [s, L] of SIDES) {
    M.ell(X(s, [0.12, 1.450, 0.810]), [0.07, 0.035, 0.012], { bone: 'ear' + L, rot: [0, 0, -0.5 * s], k: 0.012 });
    M.ell(X(s, [0.05, 1.370, 0.940]), [0.013, 0.014, 0.015], { bone: 'head', k: 0.004, region: 'eye', prio: 3 });
  }
  M.ell([0, 0.95, -0.7], [0.04, 0.08, 0.03], { bone: 'tail2', k: 0.02, region: 'mane' });
  M.ell([0, 0.9, -0.62], [0.12, 0.14, 0.06], { bone: 'pelvis', k: 0.05, region: 'nose' });
  return M;
}

export function clips(rig) {
  return quadClips(rig, {
    root: 'pelvis', spine: ['spine', 'chest'], neck: ['neck1', 'neck2'], head: 'head', jaw: 'jaw', tail,
    hind: ['thigh', 'shin', 'meta', 'htoe'], hindEnd: (s) => [0.12 * s, 0.03, -0.4],
    front: ['arm', 'fore', 'hand', 'ftoe'], frontEnd: (s) => [0.11 * s, 0.03, 0.4],
    walk: { type: 'walk', frames: 32, stride: 0.6, duty: 0.64, dur: 0.75, liftF: 0.09, liftH: 0.08, plant: 0.1, push: 0.4, fold: 1.0, toeCurl: 0.8, body: { bob: 0.008, roll: 0.01, nod: 0.04, tail: 0.04 } },
    trot: { type: 'trot', frames: 24, stride: 1.0, duty: 0.44, dur: 0.6, liftF: 0.14, liftH: 0.12, plant: 0.15, push: 0.6, fold: 1.4, toeCurl: 1.1, body: { bob: 0.025, sink: 0.01, nod: 0.02, tail: 0.04, tailUp: 0.05 } },
    gallop: { type: 'bound', frames: 24, stride: 2.0, duty: 0.3, dur: 0.5, liftF: 0.3, liftH: 0.3, plant: 0.2, push: 0.8, fold: 1.9, toeCurl: 1.5, body: { bob: 0.08, sink: 0.02, rock: 0.12, rockPh: 0.15, flex: 0.06, flexPh: 0.1, nod: 0.08, neck: 0.05, tail: 0.02, tailUp: 0.25 } },
    graze: { neck: 1.1, head: 0.35, drop: 0.02, pitch: 0.04 },
    alertNeck: 0.3, alertHead: 0.15, idleTail: 0.06,
    lieDrop: 0.55,
    lie(P, rig) { P.root[1] -= 0.55; for (const L of ['L', 'R']) { P.rx[rig.i('thigh' + L)] = -1.2; P.rx[rig.i('shin' + L)] = 2.3; P.rx[rig.i('meta' + L)] = -1.6; P.rx[rig.i('arm' + L)] = -0.6; P.rx[rig.i('fore' + L)] = 2.0; P.rx[rig.i('hand' + L)] = -2.3; } P.rx[rig.i('neck1')] += 0.1; },
    extra(P, rig, t, name) { const e = name === 'alert' ? -0.35 : 0.12 * wave(t, 0.3, 2); P.rz[rig.i('earL')] += e; P.rz[rig.i('earR')] -= e; },
  });
}
