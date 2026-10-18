// Roadster 88 life anatomy helpers: mirrored bone chains along polylines, tapered tubes bound to consecutive bones, limbs with muscle bellies, tails, necks and digits for the SDF species builders.

export const X = (s, p) => [p[0] * s, p[1], p[2]];
export const SIDES = [[1, 'L'], [-1, 'R']];
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function chain(M, names, parent, pts) {
  names.forEach((n, i) => M.bone(n, i === 0 ? parent : names[i - 1], pts[i]));
}

export function tube(M, names, pts, radii, o = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    const b = names[Math.min(i, names.length - 1)], b2 = i + 1 < names.length ? names[i + 1] : null;
    M.cone(pts[i], pts[i + 1], radii[i], radii[i + 1], { bone: b, bone2: o.rigid ? null : b2, k: o.k === undefined ? 0.08 : o.k, region: o.region });
    if (o.flat) {
      const c = lerp3(pts[i], pts[i + 1], 0.5), r = (radii[i] + radii[i + 1]) / 2, l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
      const pitch = Math.atan2(-(pts[i + 1][1] - pts[i][1]), pts[i + 1][2] - pts[i][2]);
      M.ell(c, [r * o.flat[0], r * o.flat[1], l * 0.62], { bone: b, rot: [0, pitch, 0], k: o.k === undefined ? 0.08 : o.k, region: o.region });
    }
  }
}

export function limb(M, side, L, parent, names, joints, radii, o = {}) {
  const N = names.map((n) => n + L);
  const J = joints.map((j) => X(side, j));
  chain(M, N, parent, J);
  for (let i = 0; i < J.length - 1; i++) M.cone(J[i], J[i + 1], radii[i], radii[i + 1], { bone: N[i], k: o.k === undefined ? 0.05 : o.k, region: o.regions && o.regions[i] });
  if (o.end) M.cone(J[J.length - 1], X(side, o.end), radii[J.length - 1], o.endR === undefined ? radii[J.length - 1] * 0.8 : o.endR, { bone: N[N.length - 1], k: o.k === undefined ? 0.05 : o.k, region: o.endRegion });
  if (o.muscles) for (const m of o.muscles) M.ell(X(side, m.c), m.r, { bone: N[m.bone || 0], rot: m.rot, k: m.k || 0.1, region: m.region });
  return { N, J };
}

export function digits(M, side, bone, base, tips, r0, r1, o = {}) {
  for (const t of tips) {
    const tip = X(side, t);
    M.cone(X(side, base), tip, r0, r1, { bone, k: o.k || 0.03 });
    if (o.claw) M.cone(tip, X(side, [t[0] + (o.claw[0] || 0), t[1] + o.claw[1], t[2] + o.claw[2]]), r1 * 0.9, 0.006, { bone, k: 0.006, region: o.clawRegion || 'claw', prio: 2 });
  }
}
