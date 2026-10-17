// Roadster 88 generic bird (crow-sized; scaled and tinted per instance into ravens, hawks, vultures, gulls and Cretaceous toothed birds): SDF anatomy with feathered wings and fan tail, rig and clips (flap, glide, perch, peck, hop, take-off).
import { Model } from '../sdf.js';
import { X, SIDES } from '../anatomy.js';
import { wave, smooth } from '../gaits.js';

export const id = 'bird';
export const meta = { mass: 0.6, length: 0.48, height: 0.3, span: 0.95, flyer: true, speeds: { fly: 12 }, lods: [{ tris: 1600 }, { tris: 420 }, { tris: 120 }], cell: 0.0045, ao: [0.004, 0.012, 0.03, 0.06], look: { neck: 0.5, head: 1 }, pivot: [0, 0.03, 0.08], blend: 0.008 };

export function build() {
  const M = new Model('bird', { k: 0.012 });
  M.bone('body', null, [0, 0, 0]);
  M.bone('neck', 'body', [0, 0.03, 0.08]);
  M.bone('head', 'neck', [0, 0.06, 0.14]);
  M.bone('tail', 'body', [0, 0.0, -0.1]);
  for (const [s, L] of SIDES) {
    M.bone('hum' + L, 'body', X(s, [0.04, 0.025, 0.04]));
    M.bone('fore' + L, 'hum' + L, X(s, [0.13, 0.03, 0.03]));
    M.bone('hand' + L, 'fore' + L, X(s, [0.27, 0.03, 0.02]));
    M.bone('leg' + L, 'body', X(s, [0.025, -0.03, -0.01]));
  }
  M.ell([0, 0, 0], [0.055, 0.05, 0.11], { bone: 'body', region: 'feather' });
  M.ell([0, 0.035, 0.1], [0.032, 0.034, 0.04], { bone: 'neck', region: 'feather' });
  M.ell([0, 0.065, 0.15], [0.028, 0.03, 0.035], { bone: 'head', region: 'feather' });
  M.cone([0, 0.06, 0.175], [0, 0.048, 0.23], 0.012, 0.002, { bone: 'head', k: 0.004, region: 'beak', prio: 1 });
  M.ell([0, -0.002, -0.17], [0.05, 0.007, 0.08], { bone: 'tail', region: 'feather', k: 0.012 });
  for (const [s, L] of SIDES) {
    M.ell(X(s, [0.019, 0.072, 0.162]), [0.006, 0.006, 0.006], { bone: 'head', k: 0.002, region: 'eye', prio: 3 });
    M.ell(X(s, [0.085, 0.028, 0.0]), [0.05, 0.006, 0.065], { bone: 'hum' + L, region: 'feather', k: 0.012 });
    M.ell(X(s, [0.2, 0.03, -0.01]), [0.075, 0.005, 0.06], { bone: 'fore' + L, region: 'feather', k: 0.01 });
    M.ell(X(s, [0.36, 0.028, -0.03]), [0.11, 0.004, 0.05], { bone: 'hand' + L, rot: [s * 0.15, 0, 0], region: 'feather', k: 0.01 });
    M.cone(X(s, [0.025, -0.03, -0.01]), X(s, [0.025, -0.07, 0.0]), 0.006, 0.004, { bone: 'leg' + L, k: 0.003, region: 'claw' });
  }
  return M;
}

export function clips(rig) {
  const I = (n) => rig.i(n);
  const wing = (P, L, s, a, fold, sweep) => {
    P.rz[I('hum' + L)] += s * a; P.rz[I('fore' + L)] += s * a * 0.3; P.rz[I('hand' + L)] += s * a * 0.25;
    P.ry[I('hum' + L)] += s * (sweep - 0.9 * fold); P.ry[I('fore' + L)] += -s * 2.4 * fold; P.ry[I('hand' + L)] += s * 2.6 * fold;
    P.rz[I('hum' + L)] += -s * 0.35 * fold;
  };
  const legsUp = (P) => { for (const L of ['L', 'R']) P.rx[I('leg' + L)] += 1.2; };
  return [
    { name: 'flap', frames: 16, loop: true, dur: 0.24, speed: 12, pose(t, P) { const w = Math.sin(Math.PI * 2 * t); for (const [s, L] of SIDES) wing(P, L, s, 0.75 * w + 0.1, 0.25 * Math.max(0, Math.sin(Math.PI * 2 * (t - 0.15))), 0.1 * w); P.root[1] -= 0.01 * w; legsUp(P); } },
    { name: 'glide', frames: 16, loop: true, dur: 2, speed: 12, pose(t, P) { for (const [s, L] of SIDES) wing(P, L, s, 0.08 + 0.03 * wave(t, 0), 0, 0); P.rx[I('tail')] += 0.05 * wave(t, 0.2); legsUp(P); } },
    { name: 'perch', frames: 32, loop: true, dur: 3, speed: 0, pose(t, P) { for (const [s, L] of SIDES) wing(P, L, s, 0, 1, 0); P.root[1] += 0.07; P.rx[I('body')] += -0.25; P.rx[I('tail')] += 0.3; P.ry[I('head')] += 0.5 * Math.sign(wave(t, 0)) * smooth(Math.abs(wave(t, 0)) * 3); P.rx[I('neck')] += 0.15; P.rx[I('head')] += 0.1; } },
    { name: 'peck', frames: 24, loop: true, dur: 1.2, speed: 0, pose(t, P) { for (const [s, L] of SIDES) wing(P, L, s, 0, 1, 0); P.root[1] += 0.07; P.rx[I('body')] += 0.1 + 0.35 * Math.max(0, Math.sin(Math.PI * 4 * t)); P.rx[I('neck')] += 0.4 * Math.max(0, Math.sin(Math.PI * 4 * t)); P.rx[I('tail')] += -0.2; } },
    { name: 'takeoff', frames: 16, loop: false, dur: 0.5, speed: 3, pose(t, P) { const k = smooth(t * 2); const w = Math.sin(Math.PI * 2 * t * 2); for (const [s, L] of SIDES) wing(P, L, s, (0.8 * w + 0.1) * k, 1 - k, 0.1 * w); P.root[1] += 0.07 * (1 - k); P.rx[I('body')] += -0.4 * (1 - t); } },
  ];
}
