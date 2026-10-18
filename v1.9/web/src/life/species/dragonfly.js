// Roadster 88 Meganeura, the Carboniferous griffinfly with a 70 cm wingspan: SDF anatomy (long segmented abdomen, thorax, big compound eyes, two pairs of long veined wings), rig and flyer clips (fast flicker flap, glide, hover and perch on a stem).
import { Model } from '../sdf.js';
import { X, SIDES } from '../anatomy.js';
import { wave } from '../gaits.js';

export const id = 'dragonfly';
export const meta = { mass: 0.2, length: 0.5, height: 0.12, span: 0.7, flyer: true, speeds: { fly: 9 }, lods: [{ tris: 1400 }, { tris: 380 }, { tris: 110 }], cell: 0.0035, ao: [0.003, 0.01, 0.025, 0.05], look: { head: 1 }, pivot: [0, 0, 0.08], blend: 0.006 };

export function build() {
  const M = new Model('dragonfly', { k: 0.006 });
  M.bone('body', null, [0, 0, 0]);
  M.bone('head', 'body', [0, 0.005, 0.07]);
  M.bone('tail', 'body', [0, 0, -0.06]);
  for (const [s, L] of SIDES) { M.bone('fw' + L, 'body', X(s, [0.015, 0.02, 0.03])); M.bone('hw' + L, 'body', X(s, [0.015, 0.02, -0.005])); }
  M.ell([0, 0, 0.015], [0.024, 0.024, 0.05], { bone: 'body', region: 'feather' });
  M.ell([0, 0.004, 0.082], [0.03, 0.022, 0.022], { bone: 'head', region: 'feather' });
  for (const [s] of SIDES) M.ell(X(s, [0.018, 0.01, 0.09]), [0.017, 0.017, 0.017], { bone: 'head', region: 'eye', prio: 2, k: 0.003 });
  M.cone([0, 0, -0.03], [0, -0.005, -0.33], 0.013, 0.007, { bone: 'tail', region: 'feather', k: 0.004 });
  for (let i = 0; i < 8; i++) M.cyl([0, -0.002 - i * 0.0006, -0.06 - i * 0.034], 0.0135 - i * 0.0007, 0.003, { bone: 'tail', rot: [Math.PI / 2, 0, 0], region: 'claw', prio: 1, k: 0.002 });
  for (const [s, L] of SIDES) {
    M.ell(X(s, [0.19, 0.022, 0.035]), [0.17, 0.0025, 0.026], { bone: 'fw' + L, rot: [0, -s * 0.08, 0], region: 'frill', k: 0.003 });
    M.ell(X(s, [0.18, 0.02, -0.01]), [0.165, 0.0025, 0.03], { bone: 'hw' + L, rot: [0, s * 0.06, 0], region: 'frill', k: 0.003 });
  }
  return M;
}

export function clips(rig) {
  const I = (n) => rig.i(n);
  const wings = (P, a, b) => { for (const [s, L] of SIDES) { P.rz[I('fw' + L)] += s * a; P.rz[I('hw' + L)] += s * b; } };
  return [
    { name: 'flap', frames: 8, loop: true, dur: 0.06, speed: 9, pose(t, P) { const w = Math.sin(Math.PI * 2 * t); wings(P, 0.7 * w, 0.7 * Math.sin(Math.PI * 2 * (t + 0.3))); P.rx[I('tail')] += 0.04; } },
    { name: 'glide', frames: 12, loop: true, dur: 1, speed: 9, pose(t, P) { wings(P, 0.05 * wave(t, 0), 0.05 * wave(t, 0.3)); P.rx[I('tail')] += 0.03 * wave(t, 0.1); } },
    { name: 'perch', frames: 12, loop: true, dur: 2, speed: 0, pose(t, P) { wings(P, -0.15, -0.15); P.rx[I('tail')] += 0.05 * wave(t, 0); } },
    { name: 'peck', frames: 12, loop: true, dur: 2, speed: 0, pose(t, P) { wings(P, -0.15 + 0.1 * wave(t, 0, 3), -0.15); } },
    { name: 'takeoff', frames: 8, loop: false, dur: 0.25, speed: 3, pose(t, P) { const w = Math.sin(Math.PI * 4 * t); wings(P, 0.7 * w, 0.7 * w); } },
  ];
}
