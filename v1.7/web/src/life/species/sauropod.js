// Roadster 88 Alamosaurus (titanosaur sauropod): SDF anatomy (huge barrel body, columnar legs with pads, long raised neck with a small head, whip tail, back osteoderms), rig and slow quadruped clips (idle, browse, drink, walk, amble, rear, lie, get up).
import { Model } from '../sdf.js';
import { X, SIDES, tube, limb, chain } from '../anatomy.js';
import { quadClips, smooth, wave } from '../gaits.js';

export const id = 'sauropod';
export const neck = ['neck1', 'neck2', 'neck3', 'neck4', 'neck5'];
export const tail = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'];
export const meta = { mass: 32000, length: 25, height: 11, hip: 4.6, speeds: { walk: 1.7, run: 4.6 }, lods: [{ tris: 9000 }, { tris: 2400 }, { tris: 700 }], cell: 0.07, ao: [0.08, 0.25, 0.6, 1.4], look: { neck2: 0.1, neck3: 0.25, neck4: 0.5, neck5: 0.8, head: 1, jaw: 1 }, pivot: [0, 5.2, 3.6], blend: 0.12 };

export function build() {
  const M = new Model('sauropod', { k: 0.3 });
  M.bone('pelvis', null, [0, 5.0, -1.6]);
  M.bone('spine', 'pelvis', [0, 5.35, 0.4]);
  M.bone('chest', 'spine', [0, 5.1, 2.3]);
  chain(M, neck, 'chest', [[0, 5.15, 3.6], [0, 5.95, 5.3], [0, 6.8, 6.85], [0, 7.6, 8.3], [0, 8.3, 9.6]]);
  M.bone('head', 'neck5', [0, 8.85, 10.55]);
  M.bone('jaw', 'head', [0, 8.7, 10.76]);
  chain(M, tail, 'pelvis', [[0, 5.0, -3.3], [0, 4.6, -5.6], [0, 4.0, -7.9], [0, 3.3, -10.0], [0, 2.6, -12.0], [0, 2.0, -13.8]]);
  for (const [s, L] of SIDES) {
    limb(M, s, L, 'pelvis', ['thigh', 'shin', 'meta', 'htoe'], [[1.0, 4.6, -1.6], [1.05, 2.55, -1.3], [1.05, 0.78, -1.55], [1.05, 0.32, -1.42]], [0.62, 0.44, 0.33, 0.31], { k: 0.12, end: [1.05, 0.1, -0.98], endR: 0.2, muscles: [{ c: [1.05, 3.75, -1.45], r: [0.62, 1.15, 0.85], rot: [0, -0.1, 0], k: 0.25 }, { c: [1.05, 2.0, -1.36], r: [0.42, 0.75, 0.48], bone: 1, k: 0.15 }] });
    M.ell(X(s, [1.05, 0.22, -1.25]), [0.44, 0.22, 0.5], { bone: 'htoe' + L, k: 0.12 });
    for (const dx of [-0.2, 0, 0.18]) M.cone(X(s, [1.05 + dx, 0.16, -0.95]), X(s, [1.05 + dx * 1.2, 0.05, -0.72]), 0.07, 0.015, { bone: 'htoe' + L, k: 0.03, region: 'claw', prio: 2 });
    limb(M, s, L, 'chest', ['arm', 'fore', 'hand', 'ftoe'], [[1.0, 4.4, 2.6], [1.05, 2.65, 2.35], [1.05, 0.98, 2.5], [1.05, 0.32, 2.55]], [0.52, 0.38, 0.31, 0.3], { k: 0.12, end: [1.05, 0.08, 2.7], endR: 0.28, muscles: [{ c: [1.05, 3.6, 2.45], r: [0.52, 0.95, 0.6], k: 0.22 }, { c: [1.05, 1.95, 2.42], r: [0.36, 0.62, 0.4], bone: 1, k: 0.12 }] });
    M.ell(X(s, [1.05, 0.2, 2.58]), [0.38, 0.21, 0.38], { bone: 'ftoe' + L, k: 0.1 });
    M.cone(X(s, [0.82, 0.3, 2.7]), X(s, [0.78, 0.25, 2.95]), 0.07, 0.02, { bone: 'ftoe' + L, k: 0.03, region: 'claw', prio: 2 });
  }
  M.ell([0, 4.35, 0.4], [1.72, 1.75, 3.4], { bone: 'spine', k: 0.4 });
  M.ell([0, 4.72, -1.8], [1.42, 1.38, 1.9], { bone: 'pelvis', k: 0.4 });
  M.ell([0, 4.55, 2.45], [1.48, 1.6, 1.6], { bone: 'chest', k: 0.4 });
  M.ell([0, 5.6, 0.1], [0.85, 0.6, 3.0], { bone: 'spine', k: 0.7 });
  tube(M, neck.concat(['head']), [[0, 5.0, 3.0], [0, 5.95, 5.3], [0, 6.8, 6.85], [0, 7.6, 8.3], [0, 8.3, 9.6], [0, 8.8, 10.5]], [1.2, 0.8, 0.6, 0.47, 0.37, 0.3], { k: 0.25, flat: [0.82, 1.18] });
  tube(M, tail, [[0, 4.95, -2.6], [0, 4.6, -5.6], [0, 4.0, -7.9], [0, 3.3, -10.0], [0, 2.6, -12.0], [0, 2.0, -13.8], [0, 1.5, -15.6]], [1.15, 0.84, 0.6, 0.41, 0.26, 0.15, 0.04], { k: 0.22, flat: [0.82, 1.15] });
  M.ell([0, 8.92, 10.88], [0.28, 0.32, 0.5], { bone: 'head', rot: [0, 0.5, 0], k: 0.14 });
  M.ell([0, 8.68, 11.29], [0.22, 0.2, 0.34], { bone: 'head', rot: [0, 0.62, 0], k: 0.12 });
  M.ell([0, 9.15, 10.78], [0.16, 0.12, 0.2], { bone: 'head', k: 0.12 });
  M.ell([0, 8.58, 11.05], [0.2, 0.11, 0.4], { bone: 'jaw', rot: [0, 0.55, 0], k: 0.1 });
  M.box([0, 8.62, 11.18], [0.3, 0.015, 0.32], { bone: 'head', rot: [0, 0.55, 0], sub: true, k: 0.02, region: 'mouth' });
  for (const [s] of SIDES) {
    M.ell(X(s, [0.235, 9.02, 10.88]), [0.04, 0.045, 0.05], { bone: 'head', k: 0.012, region: 'eye', prio: 3 });
    M.ell(X(s, [0.07, 9.22, 10.83]), [0.035, 0.03, 0.05], { bone: 'head', sub: true, k: 0.02 });
  }
  for (let i = 0; i < 9; i++) {
    const z = -2.6 + i * 0.75, y = 5.8 + Math.sin((i / 8) * Math.PI) * 0.35;
    for (const sx of [-0.45, 0.45]) M.ell([sx + (i % 2 ? 0.08 : -0.08), y - 0.12, z], [0.17, 0.09, 0.2], { bone: i < 3 ? 'pelvis' : 'spine', k: 0.08 });
  }
  return M;
}

export function clips(rig) {
  return quadClips(rig, {
    root: 'pelvis', spine: ['spine', 'chest'], neck, neckW: [0.12, 0.18, 0.22, 0.24, 0.24], head: 'head', jaw: 'jaw', tail,
    hind: ['thigh', 'shin', 'meta', 'htoe'], hindEnd: (s) => [1.05 * s, 0.1, -0.98],
    front: ['arm', 'fore', 'hand', 'ftoe'], frontEnd: (s) => [1.05 * s, 0.08, 2.7], frontBend: -1,
    walk: { type: 'walk', frames: 48, stride: 2.8, duty: 0.72, dur: 2.4, liftF: 0.3, liftH: 0.32, plant: 0.06, push: 0.25, fold: 0.45, toeCurl: 0.2, body: { bob: 0.06, sink: 0.03, roll: 0.03, yaw: 0.015, nod: 0.03, nodPh: 0.2, tail: 0.05, tailUp: 0.015 } },
    run: { type: 'amble', frames: 36, stride: 4.0, duty: 0.56, dur: 1.45, liftF: 0.5, liftH: 0.5, plant: 0.1, push: 0.4, fold: 0.7, toeCurl: 0.3, body: { bob: 0.12, sink: 0.1, roll: 0.035, yaw: 0.02, nod: 0.05, neck: 0.1, tail: 0.06, tailUp: 0.03 } },
    graze: { neck: 1.15, head: 0.35, drop: 0.08, pitch: 0.05 },
    alertNeck: 0.12, alertHead: 0.08, idleTail: 0.04, idleDur: 8, breath: 0.025,
    lieDrop: 2.6,
    lie(P, rig) { P.root[1] -= 2.6; for (const L of ['L', 'R']) { P.rx[rig.i('thigh' + L)] = -1.2; P.rx[rig.i('shin' + L)] = 2.1; P.rx[rig.i('meta' + L)] = -1.5; P.rx[rig.i('arm' + L)] = -0.9; P.rx[rig.i('fore' + L)] = 1.8; P.rx[rig.i('hand' + L)] = -0.9; } neck.forEach((n, i) => { P.rx[rig.i(n)] += 0.12 - i * 0.02; }); tail.forEach((n) => { P.rx[rig.i(n)] += 0.05; P.ry[rig.i(n)] += 0.1; }); },
    clips(L0, h) {
      return [{ name: 'browse', frames: 48, loop: true, dur: 7, speed: 0, pose(t, P) {
        h.base(P); P.root[1] += 0.02 * wave(t, 0, 2);
        neck.forEach((n, i) => { P.rx[rig.i(n)] += -0.08 - 0.04 * i + 0.03 * wave(t, 0.1 * i); P.ry[rig.i(n)] += 0.09 * wave(t, 0.05 * i); });
        h.add(P, 'rx', 'head', 0.25 + 0.1 * wave(t, 0, 3)); h.add(P, 'rx', 'jaw', 0.05 + 0.06 * Math.abs(wave(t, 0, 8)));
        h.tailWag(P, t, 0.04, 0.01); h.standLegs(P, L0);
      } }, { name: 'rear', frames: 48, loop: false, dur: 3.2, speed: 0, pose(t, P) {
        const k = Math.sin(Math.PI * smooth(t));
        h.base(P);
        h.add(P, 'rx', 'pelvis', -0.38 * k); P.root[1] += 0.4 * k; P.root[2] -= 0.6 * k;
        neck.forEach((n) => { P.rx[rig.i(n)] += 0.04 * k; });
        h.add(P, 'rx', 'jaw', 0.35 * k);
        tail.forEach((n, i) => { P.rx[rig.i(n)] += 0.06 * k * (1 + i * 0.3); });
        for (const l of L0) { const hip = rig.joint(l.names[0]); if (l.front) { P.rx[rig.i(l.names[0])] += -0.5 * k; P.rx[rig.i(l.names[1])] += 0.9 * k; } else rig.leg(P, l.names, [hip[0], l.y0, l.z0 + 0.2 * k], { bend: l.bend, foot: l.metaRest - 0.2 * k, toeAngle: l.toeRest, toeEnd: l.toeEnd }); }
      } }];
    },
  });
}
