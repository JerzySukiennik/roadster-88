// Roadster 88 control allocator: turns a wanted body force and torque into per-nozzle thrust vectors (gimbal sector + magnitude limits) by warm-started accelerated projected gradient, then into angle and valve commands.
import { V3, clamp } from './math.js';

const ROWS = 6;

export class Allocator {
  constructor(thrusters) {
    this.th = thrusters;
    this.n = thrusters.all.length;
    this.x = new Float64Array(this.n * 3);
    this.y = new Float64Array(this.n * 3);
    this.xPrev = new Float64Array(this.n * 3);
    this.g = new Float64Array(this.n * 3);
    this.A = new Float64Array(ROWS * this.n * 3);
    this.w = new Float64Array(ROWS);
    this.res = new Float64Array(ROWS);
    this.rowW = new Float64Array([1, 3, 1, 10, 5, 10]);
    this.rowS = new Float64Array([1, 1, 1, 1 / 2.0, 1 / 2.0, 1 / 0.35]);
    this.limits = [];
    this.iters = 40;
    this.reg = 2e-3;
    this.achieved = new Float64Array(ROWS);
    this._r = new V3();
  }

  build(com, deploy) {
    const n = this.n, A = this.A;
    A.fill(0);
    this.limits.length = 0;
    for (let i = 0; i < n; i++) {
      const nz = this.th.all[i];
      const r = this._r.subVectors(nz.pos, com);
      const c = i * 3;
      const set = (row, col, v) => { A[row * n * 3 + c + col] = v; };
      set(0, 0, 1); set(1, 1, 1); set(2, 2, 1);
      set(3, 1, -r.z); set(3, 2, r.y);
      set(4, 0, r.z); set(4, 2, -r.x);
      set(5, 0, -r.y); set(5, 1, r.x);
      this.limits.push({ T: nz.available(deploy) * nz.groundGain, front: nz.front, pmin: nz.pitchMin + nz.misPitch, pmax: nz.pitchMax + nz.misPitch, smax: Math.tan(nz.sideMax) });
    }
  }

  project(i, x) {
    const L = this.limits[i], c = i * 3;
    if (L.T <= 0) { x[c] = 0; x[c + 1] = 0; x[c + 2] = 0; return; }
    let fx = x[c], fy = x[c + 1], fz = L.front ? -x[c + 2] : x[c + 2];
    const th = Math.atan2(fy, fz);
    if (th < L.pmin || th > L.pmax) {
      const b0y = Math.sin(L.pmin), b0z = Math.cos(L.pmin), b1y = Math.sin(L.pmax), b1z = Math.cos(L.pmax);
      const t0 = Math.max(0, fy * b0y + fz * b0z), t1 = Math.max(0, fy * b1y + fz * b1z);
      const d0 = (fy - t0 * b0y) ** 2 + (fz - t0 * b0z) ** 2, d1 = (fy - t1 * b1y) ** 2 + (fz - t1 * b1z) ** 2;
      if (d0 <= d1) { fy = t0 * b0y; fz = t0 * b0z; } else { fy = t1 * b1y; fz = t1 * b1z; }
    }
    const m = Math.hypot(fy, fz);
    const lim = L.smax * m;
    fx = clamp(fx, -lim, lim);
    const mag = Math.hypot(fx, fy, fz);
    if (mag > L.T) { const s = L.T / mag; fx *= s; fy *= s; fz *= s; }
    x[c] = fx; x[c + 1] = fy; x[c + 2] = L.front ? -fz : fz;
  }

  objectiveGrad(x, g) {
    const n3 = this.n * 3, A = this.A, res = this.res;
    for (let k = 0; k < ROWS; k++) {
      let s = 0; const o = k * n3;
      for (let j = 0; j < n3; j++) s += A[o + j] * x[j];
      res[k] = (s - this.w[k]) * this.rowS[k] * this.rowS[k] * this.rowW[k];
    }
    for (let j = 0; j < n3; j++) {
      let s = 0;
      for (let k = 0; k < ROWS; k++) s += A[k * n3 + j] * res[k];
      const T = this.limits[(j / 3) | 0].T || 1;
      g[j] = s + this.reg * x[j] * (20000 * 20000) / (T * T + 1);
    }
  }

  lipschitz() {
    const n3 = this.n * 3, v = new Float64Array(n3).fill(1), t = new Float64Array(n3);
    let lam = 1;
    for (let it = 0; it < 12; it++) {
      const save = this.w.slice(); this.w.fill(0);
      this.objectiveGrad(v, t);
      this.w.set(save);
      let nrm = 0; for (let j = 0; j < n3; j++) nrm += t[j] * t[j]; nrm = Math.sqrt(nrm) || 1;
      lam = nrm / (Math.hypot(...v) || 1);
      for (let j = 0; j < n3; j++) v[j] = t[j] / nrm;
    }
    return lam * 1.05;
  }

  solve(wForce, wTorque, com, deploy) {
    this.build(com, deploy);
    this.w[0] = wForce.x; this.w[1] = wForce.y; this.w[2] = wForce.z;
    this.w[3] = wTorque.x; this.w[4] = wTorque.y; this.w[5] = wTorque.z;
    const n3 = this.n * 3, x = this.x, y = this.y, xp = this.xPrev, g = this.g;
    for (let i = 0; i < this.n; i++) this.project(i, x);
    const eta = 1 / this.lipschitz();
    y.set(x); xp.set(x);
    for (let k = 1; k <= this.iters; k++) {
      this.objectiveGrad(y, g);
      for (let j = 0; j < n3; j++) x[j] = y[j] - eta * g[j];
      for (let i = 0; i < this.n; i++) this.project(i, x);
      const beta = (k - 1) / (k + 2);
      for (let j = 0; j < n3; j++) { y[j] = x[j] + beta * (x[j] - xp[j]); xp[j] = x[j]; }
    }
    for (let k = 0; k < ROWS; k++) { let s = 0; for (let j = 0; j < n3; j++) s += this.A[k * n3 + j] * x[j]; this.achieved[k] = s; }
    this.apply();
  }

  apply() {
    const x = this.x;
    for (let i = 0; i < this.n; i++) {
      const nz = this.th.all[i], L = this.limits[i], c = i * 3;
      const fx = x[c], fy = x[c + 1], fz = nz.front ? -x[c + 2] : x[c + 2];
      const mag = Math.hypot(fx, fy, fz);
      if (L.T <= 0 || mag < L.T * 0.004) { nz.cmdValve = 0; continue; }
      const m = Math.hypot(fy, fz);
      nz.cmdPitch = Math.atan2(fy, fz);
      nz.cmdSide = Math.atan2(fx, m);
      nz.cmdValve = clamp(mag / L.T, 0, 1);
    }
  }

  clear() { this.x.fill(0); for (const nz of this.th.all) nz.cmdValve = 0; }
}
