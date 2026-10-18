// Roadster 88 life SDF modeller: bone-bound signed distance primitives (round cones, ellipsoids, rounded boxes) with smooth blending and carving, a surface-nets mesher with Newton projection, gradient normals, baked cavity occlusion, material regions and bone-graph-limited skin weights. Pure JS, used by the offline baker.

const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

function rotMat(yaw = 0, pitch = 0, roll = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp], Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  const mul = (A, B) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return o; };
  return mul(mul(Ry, Rx), Rz);
}

function sdRoundCone(px, py, pz, P) {
  const bax = P.bx - P.ax, bay = P.by - P.ay, baz = P.bz - P.az;
  const pax = px - P.ax, pay = py - P.ay, paz = pz - P.az;
  const l2 = P.l2, rr = P.ra - P.rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - P.rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - P.ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - P.ra;
}

function sdEllipsoid(px, py, pz, P) {
  let x = px - P.cx, y = py - P.cy, z = pz - P.cz;
  if (P.R) { const R = P.R; const lx = R[0] * x + R[3] * y + R[6] * z, ly = R[1] * x + R[4] * y + R[7] * z, lz = R[2] * x + R[5] * y + R[8] * z; x = lx; y = ly; z = lz; }
  const k0 = Math.hypot(x / P.rx, y / P.ry, z / P.rz), k1 = Math.hypot(x / (P.rx * P.rx), y / (P.ry * P.ry), z / (P.rz * P.rz));
  return k1 < 1e-9 ? -Math.min(P.rx, P.ry, P.rz) : k0 * (k0 - 1) / k1;
}

function sdBox(px, py, pz, P) {
  let x = px - P.cx, y = py - P.cy, z = pz - P.cz;
  if (P.R) { const R = P.R; const lx = R[0] * x + R[3] * y + R[6] * z, ly = R[1] * x + R[4] * y + R[7] * z, lz = R[2] * x + R[5] * y + R[8] * z; x = lx; y = ly; z = lz; }
  const qx = Math.abs(x) - P.hx + P.r, qy = Math.abs(y) - P.hy + P.r, qz = Math.abs(z) - P.hz + P.r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - P.r;
}

function sdCylinder(px, py, pz, P) {
  let x = px - P.cx, y = py - P.cy, z = pz - P.cz;
  if (P.R) { const R = P.R; const lx = R[0] * x + R[3] * y + R[6] * z, ly = R[1] * x + R[4] * y + R[7] * z, lz = R[2] * x + R[5] * y + R[8] * z; x = lx; y = ly; z = lz; }
  const dx = Math.hypot(x, z) - P.rad + P.r, dy = Math.abs(y) - P.hh + P.r;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - P.r;
}

export class Model {
  constructor(name, opts = {}) {
    this.name = name; this.bones = []; this.prims = []; this.regions = ['base']; this.boneIndex = new Map();
    this.k = opts.k === undefined ? 0.06 : opts.k;
    this.noise = null;
  }

  bone(name, parent, joint) {
    const p = parent === null || parent === undefined ? -1 : (typeof parent === 'string' ? this.boneIndex.get(parent) : parent);
    if (p === undefined) throw new Error(`unknown parent ${parent} for ${name}`);
    const i = this.bones.length;
    this.bones.push({ name, parent: p, joint: joint.slice() });
    this.boneIndex.set(name, i);
    return i;
  }

  b(name) { const i = this.boneIndex.get(name); if (i === undefined) throw new Error(`unknown bone ${name}`); return i; }
  j(name) { return this.bones[this.b(name)].joint; }
  region(name) { let i = this.regions.indexOf(name); if (i < 0) { i = this.regions.length; this.regions.push(name); } return i; }

  add(P, o) {
    P.k = o.k === undefined ? this.k : o.k;
    P.op = o.sub ? 'sub' : o.inter ? 'inter' : 'add';
    P.bone = this.b(o.bone);
    P.bone2 = o.bone2 ? this.b(o.bone2) : -1;
    P.region = this.region(o.region || 'base');
    P.weight = o.weight === undefined ? 1 : o.weight;
    P.prio = o.prio || 0;
    P.size = P.t === 0 ? Math.min(P.ra, P.rb) : P.t === 1 ? Math.min(P.rx, P.ry, P.rz) : P.t === 2 ? Math.min(P.hx, P.hy, P.hz) : P.t === 3 ? Math.min(P.rad, P.hh) : 0.05;
    P.bias = P.prio * Math.min(0.02, Math.max(0.002, P.size * 0.35));
    P.paint = o.paint !== false;
    P.skin = o.skin !== false;
    this.prims.push(P);
    return this;
  }

  cone(a, b, ra, rb, o) {
    const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2;
    const P = { t: 0, ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], ra, rb, l2: Math.max(l2, 1e-8) };
    const pad = Math.max(ra, rb) + 0.02;
    P.box = [Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.min(a[2], b[2]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad, Math.max(a[2], b[2]) + pad];
    return this.add(P, o);
  }

  ell(c, r, o = {}) {
    const P = { t: 1, cx: c[0], cy: c[1], cz: c[2], rx: r[0], ry: r[1], rz: r[2], R: o.rot ? rotMat(...o.rot) : null };
    const m = Math.max(r[0], r[1], r[2]) + 0.02;
    P.box = [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m];
    return this.add(P, o);
  }

  box(c, h, o = {}) {
    const P = { t: 2, cx: c[0], cy: c[1], cz: c[2], hx: h[0], hy: h[1], hz: h[2], r: o.round || 0, R: o.rot ? rotMat(...o.rot) : null };
    const m = Math.hypot(h[0], h[1], h[2]) + 0.02;
    P.box = [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m];
    return this.add(P, o);
  }

  cyl(c, rad, hh, o = {}) {
    const P = { t: 3, cx: c[0], cy: c[1], cz: c[2], rad, hh, r: o.round || 0, R: o.rot ? rotMat(...o.rot) : null };
    const m = Math.hypot(rad, hh) + 0.02;
    P.box = [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m];
    return this.add(P, o);
  }

  plane(c, n, o = {}) {
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    const P = { t: 5, cx: c[0], cy: c[1], cz: c[2], nx: n[0] / l, ny: n[1] / l, nz: n[2] / l, box: [-1e9, -1e9, -1e9, 1e9, 1e9, 1e9] };
    return this.add(P, { inter: true, ...o });
  }

  group(fn, o = {}) {
    const G = new Model(this.name + '_g', { k: o.gk === undefined ? this.k : o.gk });
    G.bones = this.bones; G.boneIndex = this.boneIndex; G.regions = this.regions;
    fn(G);
    const b = G.bounds(0.02);
    const P = { t: 4, g: G, box: b };
    return this.add(P, o);
  }

  primDist(P, x, y, z) {
    if (P.t === 0) return sdRoundCone(x, y, z, P);
    if (P.t === 1) return sdEllipsoid(x, y, z, P);
    if (P.t === 2) return sdBox(x, y, z, P);
    if (P.t === 3) return sdCylinder(x, y, z, P);
    if (P.t === 4) return P.g.dist(x, y, z);
    return (x - P.cx) * P.nx + (y - P.cy) * P.ny + (z - P.cz) * P.nz;
  }

  boxDist(P, x, y, z) {
    const b = P.box;
    const dx = Math.max(b[0] - x, 0, x - b[3]), dy = Math.max(b[1] - y, 0, y - b[4]), dz = Math.max(b[2] - z, 0, z - b[5]);
    return Math.hypot(dx, dy, dz);
  }

  dist(x, y, z) {
    let d = 1e9;
    for (const P of this.prims) {
      if (P.op === 'add') {
        if (this.boxDist(P, x, y, z) > d + P.k) continue;
        d = smin(d, this.primDist(P, x, y, z), P.k);
      } else if (P.op === 'sub') {
        if (this.boxDist(P, x, y, z) > P.k + 0.01) continue;
        d = smax(d, -this.primDist(P, x, y, z), P.k);
      } else d = smax(d, this.primDist(P, x, y, z), P.k);
    }
    if (this.noise) d += this.noise(x, y, z);
    return d;
  }

  bounds(pad = 0.12) {
    const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const P of this.prims) { if (P.op !== 'add') continue; for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], P.box[i]); b[i + 3] = Math.max(b[i + 3], P.box[i + 3]); } }
    for (let i = 0; i < 3; i++) { b[i] -= pad; b[i + 3] += pad; }
    return b;
  }

  boneHops() {
    const n = this.bones.length, D = Array.from({ length: n }, () => new Array(n).fill(99));
    for (let i = 0; i < n; i++) { D[i][i] = 0; const p = this.bones[i].parent; if (p >= 0) { D[i][p] = 1; D[p][i] = 1; } }
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (D[i][k] + D[k][j] < D[i][j]) D[i][j] = D[i][k] + D[k][j];
    return D;
  }

  mesh(cell, opts = {}) {
    const B = this.bounds(cell * 2 + 0.05);
    const nx = Math.ceil((B[3] - B[0]) / cell) + 1, ny = Math.ceil((B[4] - B[1]) / cell) + 1, nz = Math.ceil((B[5] - B[2]) / cell) + 1;
    const F = new Float32Array(nx * ny * nz);
    const id = (i, j, k) => (k * ny + j) * nx + i;
    const S = 4, cx = Math.ceil((nx - 1) / S) + 1, cy = Math.ceil((ny - 1) / S) + 1, cz = Math.ceil((nz - 1) / S) + 1;
    const C = new Float32Array(cx * cy * cz), cs = cell * S;
    for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) C[(k * cy + j) * cx + i] = this.dist(B[0] + i * cs, B[1] + j * cs, B[2] + k * cs);
    const band = cs * 1.8;
    for (let k = 0; k < nz; k++) {
      const fk = k / S, k0 = Math.min(cz - 2, Math.floor(fk)), tk = fk - k0;
      for (let j = 0; j < ny; j++) {
        const fj = j / S, j0 = Math.min(cy - 2, Math.floor(fj)), tj = fj - j0;
        for (let i = 0; i < nx; i++) {
          const fi = i / S, i0 = Math.min(cx - 2, Math.floor(fi)), ti = fi - i0;
          const c = (a, b, d) => C[((k0 + d) * cy + j0 + b) * cx + i0 + a];
          const v = ((c(0, 0, 0) * (1 - ti) + c(1, 0, 0) * ti) * (1 - tj) + (c(0, 1, 0) * (1 - ti) + c(1, 1, 0) * ti) * tj) * (1 - tk) + ((c(0, 0, 1) * (1 - ti) + c(1, 0, 1) * ti) * (1 - tj) + (c(0, 1, 1) * (1 - ti) + c(1, 1, 1) * ti) * tj) * tk;
          F[id(i, j, k)] = Math.abs(v) > band ? v : this.dist(B[0] + i * cell, B[1] + j * cell, B[2] + k * cell);
        }
      }
    }
    const cellId = new Int32Array((nx - 1) * (ny - 1) * nz).fill(-1);
    const cid = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
    const pos = [];
    const E = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let sx = 0, sy = 0, sz = 0, c = 0;
      for (const e of E) {
        const a = F[id(i + e[0], j + e[1], k + e[2])], b = F[id(i + e[3], j + e[4], k + e[5])];
        if ((a < 0) === (b < 0)) continue;
        const t = a / (a - b);
        sx += e[0] + (e[3] - e[0]) * t; sy += e[1] + (e[4] - e[1]) * t; sz += e[2] + (e[5] - e[2]) * t; c++;
      }
      if (!c) continue;
      cellId[cid(i, j, k)] = pos.length / 3;
      pos.push(B[0] + (i + sx / c) * cell, B[1] + (j + sy / c) * cell, B[2] + (k + sz / c) * cell);
    }
    const idx = [];
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      const P = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
      const pa = P(a), pc = P(c), pb = P(b), pd = P(d);
      const d1 = (pa[0] - pc[0]) ** 2 + (pa[1] - pc[1]) ** 2 + (pa[2] - pc[2]) ** 2, d2 = (pb[0] - pd[0]) ** 2 + (pb[1] - pd[1]) ** 2 + (pb[2] - pd[2]) ** 2;
      const t = d1 < d2 ? [a, b, c, a, c, d] : [a, b, d, b, c, d];
      if (flip) for (let q = 0; q < 6; q += 3) { const s = t[q + 1]; t[q + 1] = t[q + 2]; t[q + 2] = s; }
      idx.push(...t);
    };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = F[id(i, j, k)] < 0, b = F[id(i + 1, j, k)] < 0; if (a === b) continue;
      quad(cellId[cid(i, j - 1, k - 1)], cellId[cid(i, j, k - 1)], cellId[cid(i, j, k)], cellId[cid(i, j - 1, k)], b);
    }
    for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const a = F[id(i, j, k)] < 0, b = F[id(i, j + 1, k)] < 0; if (a === b) continue;
      quad(cellId[cid(i - 1, j, k - 1)], cellId[cid(i - 1, j, k)], cellId[cid(i, j, k)], cellId[cid(i, j, k - 1)], b);
    }
    for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const a = F[id(i, j, k)] < 0, b = F[id(i, j, k + 1)] < 0; if (a === b) continue;
      quad(cellId[cid(i - 1, j - 1, k)], cellId[cid(i, j - 1, k)], cellId[cid(i, j, k)], cellId[cid(i - 1, j, k)], b);
    }
    this.project(pos, cell);
    return { pos: new Float32Array(pos), idx: new Uint32Array(idx), cell };
  }

  grad(x, y, z, e) {
    const gx = this.dist(x + e, y, z) - this.dist(x - e, y, z), gy = this.dist(x, y + e, z) - this.dist(x, y - e, z), gz = this.dist(x, y, z + e) - this.dist(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  }

  project(pos, cell) {
    const n = pos.length / 3, e = cell * 0.25;
    for (let v = 0; v < n; v++) {
      let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      for (let it = 0; it < 2; it++) { const d = this.dist(x, y, z); const g = this.grad(x, y, z, e); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; }
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    }
  }

  normals(pos, cell) {
    const n = pos.length / 3, nor = new Float32Array(n * 3), e = cell * 0.25;
    for (let v = 0; v < n; v++) { const g = this.grad(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], e); nor[v * 3] = g[0]; nor[v * 3 + 1] = g[1]; nor[v * 3 + 2] = g[2]; }
    return nor;
  }

  regionAt(x, y, z) {
    let best = 0, bd = 1e9;
    for (const P of this.prims) {
      if (!P.paint) continue;
      let d = this.primDist(P, x, y, z);
      if (P.op !== 'add') d = Math.abs(d);
      d -= P.bias;
      if (d < bd) { bd = d; best = P.region; }
    }
    return best;
  }

  attrs(pos, idx, cell, opts = {}) {
    const n = pos.length / 3;
    const nor = this.normals(pos, cell);
    const hops = this.boneHops();
    const skinI = new Uint8Array(n * 4), skinW = new Uint8Array(n * 4), aux = new Uint8Array(n * 4);
    const aoSteps = opts.ao || [0.02, 0.06, 0.14, 0.3];
    const weights = new Float32Array(this.bones.length);
    const ds = new Float32Array(this.prims.length);
    const look = opts.look || {};
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      let best = -1, bd = 1e9;
      this.prims.forEach((P, i) => {
        if (P.op !== 'add') { ds[i] = 1e9; return; }
        const d = this.primDist(P, x, y, z); ds[i] = d;
        if (P.skin && d - P.bias * 0.5 < bd) { bd = d - P.bias * 0.5; best = i; }
      });
      weights.fill(0);
      const root = this.prims[best].bone;
      const sig = Math.max(0.015, opts.blend || 0.05);
      this.prims.forEach((P, i) => {
        if (P.op !== 'add' || !P.skin) return;
        if (hops[root][P.bone] > (opts.hops === undefined ? 2 : opts.hops)) return;
        const d = ds[i] - ds[best];
        const w = Math.exp(-Math.max(0, d) / (sig * Math.max(0.6, P.k / 0.06))) * P.weight;
        if (w < 0.02) return;
        if (P.t === 0 && P.bone2 >= 0) {
          const ax = P.bx - P.ax, ay = P.by - P.ay, az = P.bz - P.az;
          let t = ((x - P.ax) * ax + (y - P.ay) * ay + (z - P.az) * az) / P.l2;
          t = Math.max(0, Math.min(1, t)); t = t * t * (3 - 2 * t);
          weights[P.bone] += w * (1 - t); weights[P.bone2] += w * t;
        } else weights[P.bone] += w;
      });
      const order = Array.from(weights.keys()).filter((i) => weights[i] > 0).sort((a, b) => weights[b] - weights[a]).slice(0, 4);
      let sum = 0; for (const i of order) sum += weights[i];
      let acc = 0, lw = 0;
      const iw = order.map((bi) => Math.floor(weights[bi] / sum * 255));
      for (const w of iw) acc += w;
      iw[0] += 255 - acc;
      order.forEach((bi, q) => { skinI[v * 4 + q] = bi; skinW[v * 4 + q] = iw[q]; lw += (look[this.bones[bi].name] || 0) * weights[bi] / sum; });
      const nx = nor[v * 3], ny = nor[v * 3 + 1], nz = nor[v * 3 + 2];
      let occ = 0, wsum = 0;
      for (const h of aoSteps) { const d = this.dist(x + nx * h, y + ny * h, z + nz * h); occ += Math.max(0, (h - d) / h) / h; wsum += 1 / h; }
      const ao = Math.max(0, Math.min(1, 1 - (occ / wsum) * 1.6));
      aux[v * 4] = this.regionAt(x, y, z);
      aux[v * 4 + 1] = Math.round(ao * 255);
      aux[v * 4 + 2] = Math.round(Math.max(0, Math.min(1, this.curv(x, y, z, nx, ny, nz, opts.curvCell || cell))) * 255);
      aux[v * 4 + 3] = Math.round(Math.max(0, Math.min(1, lw)) * 255);
    }
    return { pos, nor, idx, skinI, skinW, aux, verts: n, tris: idx.length / 3 };
  }

  curv(x, y, z, nx, ny, nz, cell) {
    const h = cell * 1.5, d0 = this.dist(x, y, z);
    const lap = (this.dist(x + h, y, z) + this.dist(x - h, y, z) + this.dist(x, y + h, z) + this.dist(x, y - h, z) + this.dist(x, y, z + h) + this.dist(x, y, z - h) - 6 * d0) / (h * h);
    return 0.5 + 0.5 * Math.max(-1, Math.min(1, lap * cell * 1.5));
  }
}

export { smin, smax, rotMat };
