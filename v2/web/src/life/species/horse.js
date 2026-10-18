// Roadster 88 horse: SDF anatomy (deep barrel, sloped croup, arched neck with mane, long head with flared nostrils, fine cannons, fetlocks and hooves, hair tail), rig and clips (idle, graze, alert, walk, trot, gallop, rear, lie, get up). Coat colour and white socks come per instance.
import { Model } from '../sdf.js';
import { X, SIDES, tube, limb, chain } from '../anatomy.js';
import { quadClips, smooth, wave } from '../gaits.js';

export const id = 'horse';
export const tail = ['tail1', 'tail2', 'tail3'];
export const meta = { mass: 520, length: 2.5, height: 2.3, hip: 1.45, speeds: { walk: 1.6, trot: 4.2, run: 13 }, lods: [{ tris: 6500 }, { tris: 1700 }, { tris: 420 }], cell: 0.012, ao: [0.012, 0.035, 0.08, 0.18], look: { neck1: 0.25, neck2: 0.55, head: 1, jaw: 1, earL: 1, earR: 1 }, pivot: [0, 1.45, 0.75], blend: 0.02 };

export function build() {
  const M = new Model('horse', { k: 0.05 });
  M.bone('pelvis', null, [0, 1.45, -0.55]);
  M.bone('spine', 'pelvis', [0, 1.42, 0.1]);
  M.bone('chest', 'spine', [0, 1.38, 0.55]);
  M.bone('neck1', 'chest', [0, 1.45, 0.75]);
  M.bone('neck2', 'neck1', [0, 1.75, 1.0]);
  M.bone('head', 'neck2', [0, 2.02, 1.18]);
  M.bone('jaw', 'head', [0, 1.86, 1.3]);
  for (const [s, L] of SIDES) M.bone('ear' + L, 'head', X(s, [0.06, 2.1, 1.18]));
  chain(M, tail, 'pelvis', [[0, 1.42, -0.98], [0, 1.18, -1.1], [0, 0.88, -1.16]]);
  for (const [s, L] of SIDES) {
    limb(M, s, L, 'pelvis', ['thigh', 'shin', 'meta', 'htoe'], [[0.2, 1.3, -0.55], [0.22, 0.95, -0.33], [0.2, 0.55, -0.66], [0.2, 0.18, -0.6]], [0.13, 0.085, 0.048, 0.042], { k: 0.04, end: [0.2, 0.05, -0.5], endR: 0.05, regions: [null, null, null, null], muscles: [{ c: [0.21, 1.12, -0.5], r: [0.11, 0.26, 0.2], rot: [0, -0.3, 0], k: 0.07 }, { c: [0.21, 0.8, -0.44], r: [0.07, 0.17, 0.09], bone: 1, rot: [0, 0.5, 0], k: 0.04 }] });
    M.ell(X(s, [0.2, 0.2, -0.6]), [0.05, 0.055, 0.055], { bone: 'meta' + L, k: 0.03 });
    M.cyl(X(s, [0.2, 0.045, -0.5]), 0.055, 0.045, { bone: 'htoe' + L, rot: [0, -0.25, 0], round: 0.012, k: 0.02, region: 'hoof', prio: 2 });
    limb(M, s, L, 'chest', ['arm', 'fore', 'hand', 'ftoe'], [[0.19, 1.2, 0.6], [0.2, 0.93, 0.44], [0.19, 0.5, 0.49], [0.19, 0.18, 0.51]], [0.11, 0.07, 0.046, 0.042], { k: 0.04, end: [0.19, 0.05, 0.62], endR: 0.05, muscles: [{ c: [0.19, 1.1, 0.55], r: [0.1, 0.2, 0.15], k: 0.07 }, { c: [0.2, 0.75, 0.47], r: [0.07, 0.16, 0.08], bone: 1, k: 0.04 }] });
    M.ell(X(s, [0.19, 0.2, 0.51]), [0.05, 0.055, 0.055], { bone: 'hand' + L, k: 0.03 });
    M.cyl(X(s, [0.19, 0.045, 0.61]), 0.055, 0.045, { bone: 'ftoe' + L, rot: [0, -0.25, 0], round: 0.012, k: 0.02, region: 'hoof', prio: 2 });
  }
  M.ell([0, 1.24, 0.0], [0.3, 0.34, 0.74], { bone: 'spine', k: 0.08 });
  M.ell([0, 1.3, -0.55], [0.28, 0.31, 0.4], { bone: 'pelvis', k: 0.08 });
  M.ell([0, 1.46, -0.52], [0.21, 0.12, 0.34], { bone: 'pelvis', k: 0.1 });
  M.ell([0, 1.22, 0.55], [0.25, 0.34, 0.3], { bone: 'chest', k: 0.08 });
  M.ell([0, 1.49, 0.42], [0.1, 0.11, 0.25], { bone: 'chest', k: 0.1 });
  M.ell([0, 1.06, 0.22], [0.24, 0.2, 0.42], { bone: 'spine', k: 0.12 });
  tube(M, ['neck1', 'neck2', 'head'], [[0, 1.28, 0.58], [0, 1.7, 0.98], [0, 1.97, 1.17]], [0.27, 0.19, 0.125], { k: 0.08, flat: [0.58, 1.5] });
  M.ell([0, 1.42, 0.78], [0.13, 0.24, 0.22], { bone: 'neck1', rot: [0, -0.7, 0], k: 0.08 });
  M.ell([0, 1.86, 0.95], [0.035, 0.1, 0.36], { bone: 'neck2', bone2: null, rot: [0, -0.85, 0], k: 0.05, region: 'mane' });
  M.ell([0, 1.62, 0.78], [0.04, 0.09, 0.22], { bone: 'neck1', rot: [0, -0.85, 0], k: 0.05, region: 'mane' });
  M.cone([0, 2.0, 1.24], [0, 1.62, 1.56], 0.11, 0.078, { bone: 'head', k: 0.05 });
  M.ell([0, 1.87, 1.28], [0.095, 0.14, 0.15], { bone: 'head', rot: [0, 0.5, 0], k: 0.05 });
  M.ell([0, 1.59, 1.58], [0.075, 0.085, 0.09], { bone: 'head', k: 0.04 });
  M.ell([0, 2.02, 1.3], [0.075, 0.05, 0.12], { bone: 'head', rot: [0, 0.6, 0], k: 0.05 });
  M.ell([0, 1.73, 1.38], [0.055, 0.04, 0.17], { bone: 'jaw', rot: [0, 0.9, 0], k: 0.03 });
  M.box([0, 1.565, 1.6], [0.08, 0.006, 0.05], { bone: 'head', rot: [0, 0.5, 0], sub: true, k: 0.006, region: 'mouth' });
  M.ell([0, 2.08, 1.16], [0.025, 0.07, 0.07], { bone: 'head', k: 0.04, region: 'mane' });
  for (const [s, L] of SIDES) {
    M.cone(X(s, [0.06, 2.08, 1.18]), X(s, [0.08, 2.23, 1.16]), 0.03, 0.008, { bone: 'ear' + L, k: 0.015 });
    M.ell(X(s, [0.085, 1.98, 1.31]), [0.018, 0.02, 0.022], { bone: 'head', k: 0.005, region: 'eye', prio: 3 });
    M.ell(X(s, [0.035, 1.6, 1.62]), [0.016, 0.022, 0.016], { bone: 'head', sub: true, k: 0.01 });
  }
  tube(M, tail, [[0, 1.44, -0.94], [0, 1.18, -1.12], [0, 0.88, -1.18], [0, 0.55, -1.2]], [0.05, 0.08, 0.1, 0.07], { k: 0.04, region: 'mane' });
  return M;
}

export function clips(rig) {
  return quadClips(rig, {
    root: 'pelvis', spine: ['spine', 'chest'], neck: ['neck1', 'neck2'], neckW: [0.45, 0.55], head: 'head', jaw: 'jaw', tail,
    hind: ['thigh', 'shin', 'meta', 'htoe'], hindEnd: (s) => [0.2 * s, 0.05, -0.5],
    front: ['arm', 'fore', 'hand', 'ftoe'], frontEnd: (s) => [0.19 * s, 0.05, 0.62],
    walk: { type: 'walk', frames: 40, stride: 0.85, duty: 0.66, dur: 0.82, liftF: 0.12, liftH: 0.1, plant: 0.12, push: 0.45, fold: 1.0, toeCurl: 0.9, body: { bob: 0.012, roll: 0.012, yaw: 0.01, nod: 0.06, nodPh: 0.1, tail: 0.05, tailUp: 0.01 } },
    trot: { type: 'trot', frames: 28, stride: 1.4, duty: 0.44, dur: 0.72, liftF: 0.2, liftH: 0.16, plant: 0.15, push: 0.6, fold: 1.5, toeCurl: 1.3, body: { bob: 0.04, sink: 0.02, roll: 0.008, nod: 0.02, neck: -0.05, tail: 0.04, tailUp: 0.04 } },
    gallop: { type: 'gallop', frames: 24, stride: 2.2, duty: 0.32, dur: 0.48, liftF: 0.3, liftH: 0.24, plant: 0.25, push: 0.75, fold: 1.9, toeCurl: 1.5, body: { bob: 0.05, sink: 0.06, pitch: 0.02, rock: 0.07, rockPh: 0.15, flex: 0.04, flexPh: 0.1, nod: 0.12, nodPh: 0.25, neck: 0.12, head: -0.1, tail: 0.03, tailUp: 0.12 } },
    graze: { neck: 1.15, head: 0.3, drop: 0.02, pitch: 0.02 },
    alertNeck: 0.35, alertHead: 0.2, idleTail: 0.12,
    lieDrop: 0.72,
    lie(P, rig) { P.root[1] -= 0.72; for (const L of ['L', 'R']) { P.rx[rig.i('thigh' + L)] = -1.2; P.rx[rig.i('shin' + L)] = 2.3; P.rx[rig.i('meta' + L)] = -1.6; P.rx[rig.i('arm' + L)] = -0.6; P.rx[rig.i('fore' + L)] = 2.0; P.rx[rig.i('hand' + L)] = -2.3; } P.rx[rig.i('neck1')] += 0.2; },
    extra(P, rig, t, name) { const e = name === 'gallop' || name === 'trot' ? -0.5 : name === 'alert' ? -0.3 : 0.15 * wave(t, 0.3, 2); P.rx[rig.i('earL')] += e; P.rx[rig.i('earR')] += e; },
    clips(L0, h) {
      return [{ name: 'rear', frames: 40, loop: false, dur: 2.0, speed: 0, pose(t, P) {
        const k = Math.sin(Math.PI * smooth(t));
        h.base(P);
        h.add(P, 'rx', 'pelvis', -0.95 * k); P.root[1] += 0.05 * k; P.root[2] -= 0.35 * k;
        h.add(P, 'rx', 'neck1', 0.35 * k); h.add(P, 'rx', 'head', 0.2 * k); h.add(P, 'rx', 'jaw', 0.25 * k);
        for (const l of L0) {
          const hip = rig.joint(l.names[0]);
          if (l.front) { P.rx[rig.i(l.names[0])] += -0.3 * k; P.rx[rig.i(l.names[1])] += 1.5 * k * (1 + 0.2 * Math.sin(t * 30)); P.rx[rig.i(l.names[2])] += -2.0 * k; }
          else rig.leg(P, l.names, [hip[0], l.y0, l.z0 + 0.25 * k], { bend: l.bend, foot: l.metaRest - 0.6 * k, toeAngle: l.toeRest, toeEnd: l.toeEnd });
        }
        h.tailWag(P, t, 0.1, 0.1);
      } }];
    },
  });
}
