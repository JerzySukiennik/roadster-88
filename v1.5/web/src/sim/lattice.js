// Roadster 88 damage lattice: XPBD node-beam soft body in the car frame with plastic set and breaking, moving obstacle pushers for impacts, cabin-anchored rigid-mode removal, sleep/wake, and per-wheel/part/nozzle damage readouts. Pure JS.

export class Lattice {
  constructor(data, tuning) {
    this.tu = tuning;
    const N = data.nodes.length;
    this.n = N;
    this.rest = new Float64Array(N * 3); this.x = new Float64Array(N * 3); this.prev = new Float64Array(N * 3); this.v = new Float64Array(N * 3);
    this.w = new Float64Array(N); this.zone = [];
    this.idIndex = new Map();
    data.nodes.forEach((nd, i) => {
      this.idIndex.set(nd.id, i);
      for (let k = 0; k < 3; k++) { this.rest[i * 3 + k] = nd.p[k]; this.x[i * 3 + k] = nd.p[k]; }
      this.w[i] = 1 / Math.max(0.1, nd.m);
      this.zone.push(nd.zone || 'cabin');
    });
    const B = data.beams.length;
    this.bA = new Int32Array(B); this.bB = new Int32Array(B); this.L0 = new Float64Array(B); this.Lorig = new Float64Array(B);
    this.alpha = new Float64Array(B); this.yieldS = new Float64Array(B); this.breakS = new Float64Array(B); this.alive = new Uint8Array(B); this.cls = [];
    data.beams.forEach((b, j) => {
      const a = this.idIndex.get(b.a), c = this.idIndex.get(b.b);
      this.bA[j] = a; this.bB[j] = c;
      const L = Math.hypot(this.rest[a * 3] - this.rest[c * 3], this.rest[a * 3 + 1] - this.rest[c * 3 + 1], this.rest[a * 3 + 2] - this.rest[c * 3 + 2]);
      this.L0[j] = L; this.Lorig[j] = L; this.alpha[j] = 1 / b.k; this.yieldS[j] = b.yield; this.breakS[j] = b.break; this.alive[j] = 1; this.cls.push(b.class || 'body');
    });
    const toIdx = (ids) => ids.map((id) => this.idIndex.get(id)).filter((i) => i !== undefined);
    this.parts = (data.parts || []).map((p) => ({ name: p.name, nodes: toIdx(p.nodes), breakImpulse: p.break_impulse, detached: false }));
    this.wheels = {}; for (const k in data.wheels || {}) this.wheels[k] = toIdx(data.wheels[k]);
    this.nozzles = {}; for (const k in data.nozzles || {}) this.nozzles[k] = toIdx(data.nozzles[k]);
    this.anchor = [];
    for (let i = 0; i < N; i++) if (this.zone[i] === 'cabin' || this.zone[i] === 'floor') this.anchor.push(i);
    if (this.anchor.length < 4) for (let i = 0; i < N; i++) this.anchor.push(i);
    this.anchorRestC = this.centroid(this.rest, this.anchor);
    this.pushers = [];
    this.awake = 0; this.dirty = false; this.version = 0;
    this.events = [];
    this.brokenCount = 0;
  }

  centroid(arr, idx) {
    let x = 0, y = 0, z = 0, m = 0;
    for (const i of idx) { const wm = 1 / this.w[i]; x += arr[i * 3] * wm; y += arr[i * 3 + 1] * wm; z += arr[i * 3 + 2] * wm; m += wm; }
    return [x / m, y / m, z / m];
  }

  zoneNear(p, r = 0.7) {
    const counts = {};
    for (let i = 0; i < this.n; i++) {
      const d = Math.hypot(this.x[i * 3] - p[0], this.x[i * 3 + 1] - p[1], this.x[i * 3 + 2] - p[2]);
      if (d < r) counts[this.zone[i]] = (counts[this.zone[i]] || 0) + 1;
    }
    let best = 'cabin', bc = 0;
    for (const k in counts) if (counts[k] > bc) { bc = counts[k]; best = k; }
    return best;
  }

  crushDepth(energy, zone, normal) {
    const C = this.tu.damage.crush;
    let soft, softLen, hard;
    if (zone === 'front' || zone === 'rear') { soft = C.crumple_force; softLen = C.crumple_length; hard = C.cabin_force; }
    else if (zone === 'floor' || normal[1] < -0.7) { soft = C.floor_force; softLen = C.floor_length; hard = C.cabin_force * 2; }
    else if (zone === 'roof' || normal[1] > 0.7) { soft = C.roof_force; softLen = C.roof_length; hard = C.cabin_force * 0.8; }
    else { soft = C.side_force; softLen = C.side_length; hard = C.cabin_force; }
    const e1 = soft * softLen;
    const d = energy <= e1 ? energy / soft : softLen + (energy - e1) / hard;
    return Math.min(C.max_depth, d);
  }

  impact(o) {
    const zone = this.zoneNear(o.p, 0.9);
    const depth = this.crushDepth(o.energy, zone, o.n);
    if (depth < 0.004) return 0;
    const jitter = [];
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i * 3] - o.p[0], dy = this.x[i * 3 + 1] - o.p[1], dz = this.x[i * 3 + 2] - o.p[2];
      const d = Math.hypot(dx, dy, dz);
      if (d < Math.max(0.6, depth * 1.6)) jitter.push(i);
    }
    const kick = Math.min(1.2, depth) * 0.18;
    for (const i of jitter) for (let k = 0; k < 3; k++) this.v[i * 3 + k] += (Math.random() - 0.5) * kick;
    this.pushers.push({ p: o.p.slice(), n: o.n.slice(), depth, d: 0, speed: Math.max(o.speed, 5), cyl: o.cylRadius || 0, axis: o.axis ? o.axis.slice() : [0, 1, 0], foot: o.footprint || 50, age: 0 });
    this.awake = this.tu.damage.active_window_s;
    this.dirty = true;
    return depth;
  }

  applyPushers(h) {
    for (const P of this.pushers) {
      P.d = Math.min(P.depth, P.d + P.speed * h);
      const n = P.n;
      for (let i = 0; i < this.n; i++) {
        const j = i * 3;
        const rx = this.x[j] - P.p[0], ry = this.x[j + 1] - P.p[1], rz = this.x[j + 2] - P.p[2];
        if (P.cyl > 0) {
          const ax = P.axis, off = P.cyl - P.d;
          const qx = this.x[j] - (P.p[0] + n[0] * off), qy = this.x[j + 1] - (P.p[1] + n[1] * off), qz = this.x[j + 2] - (P.p[2] + n[2] * off);
          const qa = qx * ax[0] + qy * ax[1] + qz * ax[2];
          const px = qx - ax[0] * qa, py = qy - ax[1] * qa, pz = qz - ax[2] * qa;
          const r = Math.hypot(px, py, pz);
          if (r < P.cyl && r > 1e-6) { const s = P.cyl / r - 1; this.x[j] += px * s; this.x[j + 1] += py * s; this.x[j + 2] += pz * s; }
          continue;
        }
        const s = rx * n[0] + ry * n[1] + rz * n[2];
        if (s > -P.d) {
          const lx = rx - n[0] * s, ly = ry - n[1] * s, lz = rz - n[2] * s;
          const lat = Math.hypot(lx, ly, lz);
          if (lat > P.foot) continue;
          const k = s + P.d;
          this.x[j] -= n[0] * k; this.x[j + 1] -= n[1] * k; this.x[j + 2] -= n[2] * k;
        }
      }
    }
  }

  substep(h) {
    const N = this.n, x = this.x, p = this.prev, v = this.v, w = this.w;
    for (let i = 0; i < N * 3; i++) { p[i] = x[i]; x[i] += v[i] * h; }
    const B = this.bA.length;
    const h2 = h * h;
    for (let j = 0; j < B; j++) {
      if (!this.alive[j]) continue;
      const a = this.bA[j] * 3, b = this.bB[j] * 3;
      const dx = x[a] - x[b], dy = x[a + 1] - x[b + 1], dz = x[a + 2] - x[b + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-4) continue;
      const C = L - this.L0[j];
      const wa = w[this.bA[j]], wb = w[this.bB[j]];
      const at = this.alpha[j] / h2;
      let lam = -C / (wa + wb + at);
      const lim = 0.03 / Math.max(wa, wb);
      if (lam > lim) lam = lim; else if (lam < -lim) lam = -lim;
      const gx = dx / L * lam, gy = dy / L * lam, gz = dz / L * lam;
      x[a] += gx * wa; x[a + 1] += gy * wa; x[a + 2] += gz * wa;
      x[b] -= gx * wb; x[b + 1] -= gy * wb; x[b + 2] -= gz * wb;
    }
    this.applyPushers(h);
    const damp = Math.exp(-6 * h), maxD = this.tu.damage.crush.max_depth + 0.4, r = this.rest;
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      const ox = x[j] - r[j], oy = x[j + 1] - r[j + 1], oz = x[j + 2] - r[j + 2], od = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (od > maxD) { const k = maxD / od; x[j] = r[j] + ox * k; x[j + 1] = r[j + 1] + oy * k; x[j + 2] = r[j + 2] + oz * k; }
      for (let k = 0; k < 3; k++) { let vv = (x[j + k] - p[j + k]) / h * damp; if (vv > 25) vv = 25; else if (vv < -25) vv = -25; v[j + k] = vv; }
    }
    for (let j = 0; j < B; j++) {
      if (!this.alive[j]) continue;
      const a = this.bA[j] * 3, b = this.bB[j] * 3;
      const L = Math.hypot(x[a] - x[b], x[a + 1] - x[b + 1], x[a + 2] - x[b + 2]);
      const Lo = this.Lorig[j];
      const strain = (L - this.L0[j]) / Lo;
      if (Math.abs(strain) > this.yieldS[j]) this.L0[j] += (L - this.L0[j]) - Math.sign(strain) * this.yieldS[j] * Lo;
      if (Math.abs(L - Lo) / Lo > this.breakS[j]) { this.alive[j] = 0; this.brokenCount++; this.events.push({ type: 'beam', j }); }
    }
  }

  removeRigidMode() {
    const A = this.anchor, x = this.x, r = this.rest;
    const c = this.centroid(x, A), c0 = this.anchorRestC;
    const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const i of A) {
      const m = 1 / this.w[i];
      const px = x[i * 3] - c[0], py = x[i * 3 + 1] - c[1], pz = x[i * 3 + 2] - c[2];
      const qx = r[i * 3] - c0[0], qy = r[i * 3 + 1] - c0[1], qz = r[i * 3 + 2] - c0[2];
      M[0] += m * px * qx; M[1] += m * px * qy; M[2] += m * px * qz;
      M[3] += m * py * qx; M[4] += m * py * qy; M[5] += m * py * qz;
      M[6] += m * pz * qx; M[7] += m * pz * qy; M[8] += m * pz * qz;
    }
    let dev = 0;
    for (const i of A) { const dx = x[i * 3] - c[0] - (r[i * 3] - c0[0]), dy = x[i * 3 + 1] - c[1] - (r[i * 3 + 1] - c0[1]), dz = x[i * 3 + 2] - c[2] - (r[i * 3 + 2] - c0[2]); dev += dx * dx + dy * dy + dz * dz; }
    const rigidOk = Math.sqrt(dev / A.length) < 0.35;
    let q = [0, 0, 0, 1];
    for (let it = 0; it < (rigidOk ? 12 : 0); it++) {
      const R = quatMat(q);
      const c0x = [R[0], R[1], R[2]], c1x = [R[3], R[4], R[5]], c2x = [R[6], R[7], R[8]];
      const a0 = [M[0], M[3], M[6]], a1 = [M[1], M[4], M[7]], a2 = [M[2], M[5], M[8]];
      const om = add3(add3(cross(c0x, a0), cross(c1x, a1)), cross(c2x, a2));
      const den = Math.abs(dot(c0x, a0) + dot(c1x, a1) + dot(c2x, a2)) + 1e-9;
      const ox = om[0] / den, oy = om[1] / den, oz = om[2] / den;
      const wl = Math.hypot(ox, oy, oz);
      if (wl < 1e-9) break;
      const s = Math.sin(wl / 2) / wl;
      q = qmul([ox * s, oy * s, oz * s, Math.cos(wl / 2)], q);
      const l = Math.hypot(...q); q = q.map((v) => v / l);
    }
    const R = quatMat(q);
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      const px = x[j] - c[0], py = x[j + 1] - c[1], pz = x[j + 2] - c[2];
      x[j] = R[0] * px + R[1] * py + R[2] * pz + c0[0];
      x[j + 1] = R[3] * px + R[4] * py + R[5] * pz + c0[1];
      x[j + 2] = R[6] * px + R[7] * py + R[8] * pz + c0[2];
      const vx = this.v[j], vy = this.v[j + 1], vz = this.v[j + 2];
      this.v[j] = R[0] * vx + R[1] * vy + R[2] * vz; this.v[j + 1] = R[3] * vx + R[4] * vy + R[5] * vz; this.v[j + 2] = R[6] * vx + R[7] * vy + R[8] * vz;
    }
    let mx = 0, my = 0, mz = 0, mm = 0;
    for (let i = 0; i < this.n; i++) { const m = 1 / this.w[i]; mx += this.v[i * 3] * m; my += this.v[i * 3 + 1] * m; mz += this.v[i * 3 + 2] * m; mm += m; }
    mx /= mm; my /= mm; mz /= mm;
    for (let i = 0; i < this.n; i++) { this.v[i * 3] -= mx; this.v[i * 3 + 1] -= my; this.v[i * 3 + 2] -= mz; }
  }

  step(dt) {
    if (this.awake <= 0) return false;
    const S = this.tu.damage.lattice_substeps, h = dt / S;
    for (let s = 0; s < S; s++) this.substep(h);
    this.removeRigidMode();
    for (const P of this.pushers) P.age += dt;
    this.pushers = this.pushers.filter((P) => P.d < P.depth - 1e-4 || P.age < 0.05);
    this.awake -= dt;
    this.version++;
    if (this.awake <= 0) { this.v.fill(0); this.pushers.length = 0; this.events.push({ type: 'sleep' }); }
    return true;
  }

  disp(i, out) { out[0] = this.x[i * 3] - this.rest[i * 3]; out[1] = this.x[i * 3 + 1] - this.rest[i * 3 + 1]; out[2] = this.x[i * 3 + 2] - this.rest[i * 3 + 2]; return out; }

  setDisplacementInto(arr, stride = 4) {
    for (let i = 0; i < this.n; i++) { arr[i * stride] = this.x[i * 3] - this.rest[i * 3]; arr[i * stride + 1] = this.x[i * 3 + 1] - this.rest[i * 3 + 1]; arr[i * stride + 2] = this.x[i * 3 + 2] - this.rest[i * 3 + 2]; }
  }

  groupDamage(idx) {
    if (!idx || idx.length === 0) return { hub: [0, 0, 0], toe: 0, camber: 0, mag: 0 };
    const c = this.centroid(this.x, idx), c0 = this.centroid(this.rest, idx);
    const hub = [c[0] - c0[0], c[1] - c0[1], c[2] - c0[2]];
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    let toe = 0, camber = 0, nt = 0, nc = 0, mag = 0;
    for (const i of idx) {
      const rx = this.rest[i * 3] - c0[0], ry = this.rest[i * 3 + 1] - c0[1], rz = this.rest[i * 3 + 2] - c0[2];
      const xx = this.x[i * 3] - c[0], xy = this.x[i * 3 + 1] - c[1], xz = this.x[i * 3 + 2] - c[2];
      if (Math.abs(rz) > 0.05) { toe += wrap(Math.atan2(xx, xz) - Math.atan2(rx, rz)); nt++; }
      if (Math.abs(ry) > 0.05) { camber += wrap(Math.atan2(xx, xy) - Math.atan2(rx, ry)); nc++; }
      mag = Math.max(mag, Math.hypot(this.x[i * 3] - this.rest[i * 3], this.x[i * 3 + 1] - this.rest[i * 3 + 1], this.x[i * 3 + 2] - this.rest[i * 3 + 2]));
    }
    return { hub, toe: nt ? toe / nt : 0, camber: nc ? camber / nc : 0, mag };
  }

  attachmentBroken(idx) {
    const set = new Set(idx);
    let total = 0, broken = 0;
    for (let j = 0; j < this.bA.length; j++) {
      const ia = set.has(this.bA[j]), ib = set.has(this.bB[j]);
      if (ia !== ib) { total++; if (!this.alive[j]) broken++; }
    }
    return total ? broken / total : 0;
  }

  extents() {
    const r = { front: 0, rear: 0, left: 0, right: 0, roof: 0 };
    let zr = -1e9, zc = -1e9, zr2 = 1e9, zc2 = 1e9, xl = -1e9, xl2 = -1e9, xr = 1e9, xr2 = 1e9, yt = -1e9, yt2 = -1e9;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      zr = Math.max(zr, this.rest[j + 2]); zc = Math.max(zc, this.x[j + 2]);
      zr2 = Math.min(zr2, this.rest[j + 2]); zc2 = Math.min(zc2, this.x[j + 2]);
      xl = Math.max(xl, this.rest[j]); xl2 = Math.max(xl2, this.x[j]);
      xr = Math.min(xr, this.rest[j]); xr2 = Math.min(xr2, this.x[j]);
      yt = Math.max(yt, this.rest[j + 1]); yt2 = Math.max(yt2, this.x[j + 1]);
    }
    r.front = Math.max(0, zr - zc); r.rear = Math.max(0, zc2 - zr2); r.left = Math.max(0, xl - xl2); r.right = Math.max(0, xr2 - xr); r.roof = Math.max(0, yt - yt2);
    return r;
  }

  drain() { const e = this.events; this.events = []; return e; }
}

function quatMat(q) {
  const [x, y, z, w] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
