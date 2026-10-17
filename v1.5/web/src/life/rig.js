// Roadster 88 life rig: skeleton forward kinematics on unrotated rest frames, sagittal-plane leg IK (two bones plus a set foot angle), gait foot paths and clip baking into skinning-matrix rows for the instanced vertex-animation texture. Pure JS.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const pitchOf = (y, z) => Math.atan2(-z, -y);

export class Rig {
  constructor(bones) {
    this.bones = bones; this.n = bones.length;
    this.index = new Map(bones.map((b, i) => [b.name, i]));
    this.W = new Float64Array(this.n * 12);
  }

  i(name) { const i = this.index.get(name); if (i === undefined) throw new Error('rig bone ' + name); return i; }
  has(name) { return this.index.has(name); }
  joint(name) { return this.bones[this.i(name)].joint; }

  pose() { return { rx: new Float64Array(this.n), ry: new Float64Array(this.n), rz: new Float64Array(this.n), root: [0, 0, 0], set: this }; }

  fk(P) {
    const W = this.W;
    for (let b = 0; b < this.n; b++) {
      const bone = this.bones[b], p = bone.parent;
      const cy = Math.cos(P.ry[b]), sy = Math.sin(P.ry[b]), cx = Math.cos(P.rx[b]), sx = Math.sin(P.rx[b]), cz = Math.cos(P.rz[b]), sz = Math.sin(P.rz[b]);
      const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
      const r10 = cx * sz, r11 = cx * cz, r12 = -sx;
      const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
      const o = b * 12;
      if (p < 0) {
        W[o] = r00; W[o + 1] = r01; W[o + 2] = r02; W[o + 3] = bone.joint[0] + P.root[0];
        W[o + 4] = r10; W[o + 5] = r11; W[o + 6] = r12; W[o + 7] = bone.joint[1] + P.root[1];
        W[o + 8] = r20; W[o + 9] = r21; W[o + 10] = r22; W[o + 11] = bone.joint[2] + P.root[2];
      } else {
        const q = p * 12, pj = this.bones[p].joint;
        const tx = bone.joint[0] - pj[0], ty = bone.joint[1] - pj[1], tz = bone.joint[2] - pj[2];
        const a00 = W[q], a01 = W[q + 1], a02 = W[q + 2], a10 = W[q + 4], a11 = W[q + 5], a12 = W[q + 6], a20 = W[q + 8], a21 = W[q + 9], a22 = W[q + 10];
        W[o] = a00 * r00 + a01 * r10 + a02 * r20; W[o + 1] = a00 * r01 + a01 * r11 + a02 * r21; W[o + 2] = a00 * r02 + a01 * r12 + a02 * r22;
        W[o + 4] = a10 * r00 + a11 * r10 + a12 * r20; W[o + 5] = a10 * r01 + a11 * r11 + a12 * r21; W[o + 6] = a10 * r02 + a11 * r12 + a12 * r22;
        W[o + 8] = a20 * r00 + a21 * r10 + a22 * r20; W[o + 9] = a20 * r01 + a21 * r11 + a22 * r21; W[o + 10] = a20 * r02 + a21 * r12 + a22 * r22;
        W[o + 3] = W[q + 3] + a00 * tx + a01 * ty + a02 * tz;
        W[o + 7] = W[q + 7] + a10 * tx + a11 * ty + a12 * tz;
        W[o + 11] = W[q + 11] + a20 * tx + a21 * ty + a22 * tz;
      }
    }
    return W;
  }

  worldOf(name, P) { this.fk(P); const o = this.i(name) * 12, W = this.W; return [W[o + 3], W[o + 7], W[o + 11]]; }

  skin(P, out, off) {
    const W = this.fk(P);
    for (let b = 0; b < this.n; b++) {
      const o = b * 12, j = this.bones[b].joint, d = off + b * 12;
      for (let r = 0; r < 3; r++) {
        const m0 = W[o + r * 4], m1 = W[o + r * 4 + 1], m2 = W[o + r * 4 + 2];
        out[d + r * 4] = m0; out[d + r * 4 + 1] = m1; out[d + r * 4 + 2] = m2;
        out[d + r * 4 + 3] = W[o + r * 4 + 3] - (m0 * j[0] + m1 * j[1] + m2 * j[2]);
      }
    }
  }

  leg(P, names, target, o = {}) {
    const [ua, la, fa, ta] = names.map((n) => (n ? this.i(n) : -1));
    const par = this.bones[ua].parent;
    for (const b of [ua, la, fa, ta]) if (b >= 0) P.rx[b] = 0;
    const W = this.fk(P), q = par * 12;
    const pj = this.bones[par].joint, uj = this.bones[ua].joint, lj = this.bones[la].joint;
    const ej = fa >= 0 ? this.bones[fa].joint : o.end;
    const dx = target[0] - W[q + 3], dy = target[1] - W[q + 7], dz = target[2] - W[q + 11];
    const ly = W[q + 1] * dx + W[q + 5] * dy + W[q + 9] * dz - (uj[1] - pj[1]);
    const lz = W[q + 2] * dx + W[q + 6] * dy + W[q + 10] * dz - (uj[2] - pj[2]);
    const parPitch = Math.atan2(W[q + 9], W[q + 5]);
    const u1y = lj[1] - uj[1], u1z = lj[2] - uj[2], u2y = ej[1] - lj[1], u2z = ej[2] - lj[2];
    const l1 = Math.hypot(u1y, u1z), l2 = Math.hypot(u2y, u2z);
    let ty = ly, tz = lz;
    if (fa >= 0 && o.foot !== undefined) {
      const fj = ej, nj = ta >= 0 ? this.bones[ta].joint : o.toe;
      const l3 = Math.hypot(nj[1] - fj[1], nj[2] - fj[2]);
      const phi3 = o.foot - parPitch;
      ty -= -Math.cos(phi3) * l3; tz -= -Math.sin(phi3) * l3;
    }
    const D = clamp(Math.hypot(ty, tz), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995);
    const phT = pitchOf(ty, tz);
    const al = Math.acos(clamp((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), -1, 1));
    const ph1 = phT - (o.bend || 1) * al;
    const ky = -Math.cos(ph1) * l1, kz = -Math.sin(ph1) * l1;
    const ph2 = pitchOf(ty - ky, tz - kz);
    const r1 = pitchOf(u1y, u1z), r2 = pitchOf(u2y, u2z);
    P.rx[ua] = ph1 - r1;
    P.rx[la] = ph2 - r2 - P.rx[ua];
    if (fa >= 0 && o.foot !== undefined) {
      const nj = ta >= 0 ? this.bones[ta].joint : o.toe;
      const r3 = pitchOf(nj[1] - ej[1], nj[2] - ej[2]);
      P.rx[fa] = (o.foot - parPitch) - r3 - P.rx[ua] - P.rx[la];
      if (ta >= 0 && o.toeAngle !== undefined) {
        const tj = this.bones[ta].joint, xj = o.toeEnd || [tj[0], tj[1], tj[2] + 0.1];
        const r4 = pitchOf(xj[1] - tj[1], xj[2] - tj[2]);
        P.rx[ta] = (o.toeAngle - parPitch) - r4 - P.rx[ua] - P.rx[la] - P.rx[fa];
      }
    }
  }
}

export function aim(rig, P, name, worldPitch) {
  const b = rig.i(name), p = rig.bones[b].parent;
  P.rx[b] = 0;
  const W = rig.fk(P), q = p * 12;
  P.rx[b] = worldPitch - Math.atan2(W[q + 9], W[q + 5]);
}

export function foot(t, off, duty, stride, lift, z0 = 0, o = {}) {
  let u = ((t + off) % 1 + 1) % 1;
  if (u < duty) {
    const s = u / duty;
    return { y: 0, z: z0 + stride * (0.5 - s), stance: true, s, lift: 0 };
  }
  const s = (u - duty) / (1 - duty);
  const e = smooth(s);
  const h = Math.sin(Math.PI * Math.pow(s, o.liftSkew || 1));
  return { y: lift * h, z: z0 + stride * (e - 0.5), stance: false, s, lift: h };
}

export const wave = (t, off = 0, k = 1) => Math.sin(TAU * (t * k + off));

export function bakeClips(rig, clips) {
  const rows = clips.reduce((a, c) => a + c.frames + 1, 0);
  const width = rig.n * 3;
  const data = new Float32Array(width * rows * 4);
  const meta = {};
  let row = 0;
  const P = rig.pose();
  for (const c of clips) {
    meta[c.name] = { row, frames: c.frames, loop: !!c.loop, dur: c.dur, speed: c.speed || 0, stride: c.stride || 0 };
    for (let f = 0; f <= c.frames; f++) {
      const t = c.loop ? (f % c.frames) / c.frames : Math.min(1, f / c.frames);
      P.rx.fill(0); P.ry.fill(0); P.rz.fill(0); P.root[0] = P.root[1] = P.root[2] = 0;
      c.pose(t, P, rig);
      rig.skin(P, data, (row + f) * width * 4);
    }
    row += c.frames + 1;
  }
  return { data, width, height: rows, clips: meta };
}
