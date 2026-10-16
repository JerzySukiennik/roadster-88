// Roadster 88 sim math: tiny allocation-free vector and quaternion helpers with no three.js or DOM dependency.

export class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  addVectors(a, b) { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v) { const x = this.y * v.z - this.z * v.y, y = this.z * v.x - this.x * v.z, z = this.x * v.y - this.y * v.x; this.x = x; this.y = y; this.z = z; return this; }
  crossVectors(a, b) { const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x; this.x = x; this.y = y; this.z = z; return this; }
  len() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  lenSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = this.len(); if (l > 1e-12) { this.x /= l; this.y /= l; this.z /= l; } return this; }
  dist(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  applyQuat(q) {
    const x = this.x, y = this.y, z = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    this.x = x + qw * tx + qy * tz - qz * ty;
    this.y = y + qw * ty + qz * tx - qx * tz;
    this.z = z + qw * tz + qx * ty - qy * tx;
    return this;
  }
  applyQuatInv(q) {
    const x = this.x, y = this.y, z = this.z, qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    this.x = x + qw * tx + qy * tz - qz * ty;
    this.y = y + qw * ty + qz * tx - qx * tz;
    this.z = z + qw * tz + qx * ty - qy * tx;
    return this;
  }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  toArray() { return [this.x, this.y, this.z]; }
  fromArray(a, o = 0) { this.x = a[o]; this.y = a[o + 1]; this.z = a[o + 2]; return this; }
}

export class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Quat(this.x, this.y, this.z, this.w); }
  identity() { return this.set(0, 0, 0, 1); }
  setAxisAngle(ax, ay, az, a) { const s = Math.sin(a / 2); return this.set(ax * s, ay * s, az * s, Math.cos(a / 2)); }
  multiply(b) { return this.multiplyQuats(this, b); }
  premultiply(a) { return this.multiplyQuats(a, this); }
  multiplyQuats(a, b) {
    const ax = a.x, ay = a.y, az = a.z, aw = a.w, bx = b.x, by = b.y, bz = b.z, bw = b.w;
    this.x = ax * bw + aw * bx + ay * bz - az * by;
    this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }
  conjugate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z, this.w) || 1; this.x /= l; this.y /= l; this.z /= l; this.w /= l; return this; }
  setFromYaw(yaw) { return this.setAxisAngle(0, 1, 0, yaw); }
  setFromEulerYXZ(pitch, yaw, roll) {
    const c1 = Math.cos(pitch / 2), c2 = Math.cos(yaw / 2), c3 = Math.cos(roll / 2), s1 = Math.sin(pitch / 2), s2 = Math.sin(yaw / 2), s3 = Math.sin(roll / 2);
    this.x = s1 * c2 * c3 + c1 * s2 * s3; this.y = c1 * s2 * c3 - s1 * c2 * s3; this.z = c1 * c2 * s3 - s1 * s2 * c3; this.w = c1 * c2 * c3 + s1 * s2 * s3;
    return this;
  }
  setFromUnitVectors(a, b) {
    let r = a.dot(b) + 1;
    if (r < 1e-8) { r = 0; if (Math.abs(a.x) > Math.abs(a.z)) this.set(-a.y, a.x, 0, r); else this.set(0, -a.z, a.y, r); }
    else this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x, r);
    return this.normalize();
  }
  slerp(qb, t) {
    if (t === 0) return this; if (t === 1) return this.copy(qb);
    const x = this.x, y = this.y, z = this.z, w = this.w;
    let cos = w * qb.w + x * qb.x + y * qb.y + z * qb.z, bx = qb.x, by = qb.y, bz = qb.z, bw = qb.w;
    if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    if (cos > 0.9995) { this.set(x + (bx - x) * t, y + (by - y) * t, z + (bz - z) * t, w + (bw - w) * t); return this.normalize(); }
    const th = Math.acos(cos), s = Math.sin(th), a = Math.sin((1 - t) * th) / s, b = Math.sin(t * th) / s;
    return this.set(x * a + bx * b, y * a + by * b, z * a + bz * b, w * a + bw * b);
  }
  toAxisAngleVec(out) {
    let q = this; let w = q.w, sgn = 1; if (w < 0) { w = -w; sgn = -1; }
    const s = Math.sqrt(Math.max(0, 1 - w * w));
    const ang = 2 * Math.atan2(s, w);
    if (s < 1e-9) return out.set(q.x * 2 * sgn, q.y * 2 * sgn, q.z * 2 * sgn);
    const k = ang / s * sgn; return out.set(q.x * k, q.y * k, q.z * k);
  }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const moveTowards = (cur, target, maxDelta) => (Math.abs(target - cur) <= maxDelta ? target : cur + Math.sign(target - cur) * maxDelta);
export const DEG = Math.PI / 180;
export const MPH = 0.44704;

export function yawOf(q) {
  const fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  return Math.atan2(fx, fz);
}

export function solveLinear(A, b, n) {
  const M = A.slice(), x = b.slice();
  for (let c = 0; c < n; c++) {
    let piv = c, best = Math.abs(M[c * n + c]);
    for (let r = c + 1; r < n; r++) { const v = Math.abs(M[r * n + c]); if (v > best) { best = v; piv = r; } }
    if (best < 1e-14) continue;
    if (piv !== c) { for (let k = 0; k < n; k++) { const t = M[c * n + k]; M[c * n + k] = M[piv * n + k]; M[piv * n + k] = t; } const t = x[c]; x[c] = x[piv]; x[piv] = t; }
    const d = M[c * n + c];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r * n + c] / d; if (f === 0) continue;
      for (let k = c; k < n; k++) M[r * n + k] -= f * M[c * n + k];
      x[r] -= f * x[c];
    }
  }
  for (let c = 0; c < n; c++) { const d = M[c * n + c]; x[c] = Math.abs(d) < 1e-14 ? 0 : x[c] / d; }
  return x;
}
