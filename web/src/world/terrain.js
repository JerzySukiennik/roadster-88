// Roadster 88 terrain data: deterministic height grids with the Rapier triangulation (the 2 m valley grid and, through the same class, the 4 m mega grid), surface and road masks at twice the cell, canyon, wash, town and road stamping with cut and fill, era toggles between natural and built ground, seams between grids and normals. Pure JS for the main thread, workers and Node.
import { makeSimplex, fbm, ridged, clamp, lerp, smooth, smoothMax, smoothMin } from './noise.js';
import { SPACING } from './design.js';

export const N = 2049, CELL = 2, ORIGIN = -2048, EXTENT = 4096;
export const TN = 1025, TCELL = 4;
export const INNER = { N, CELL, ORIGIN, EXTENT, TN, TCELL };

const nA = makeSimplex(88), nB = makeSimplex(1885), nC = makeSimplex(2026), nD = makeSimplex(2080), nE = makeSimplex(12000);

export function sampleBase(x, z, D, m) {
  let h = 3 + 6.5 * fbm(nA, x / 950, z / 950, 3) + 0.0026 * z;
  const ax = Math.abs(x) / 2048, az = Math.abs(z) / 2048;
  const q = Math.pow(ax ** 5 + az ** 5, 0.2);
  let M = 0;
  if (q > 0.62) {
    const hr = 320 + 85 * nB(x / 1700, z / 1700) + 70 * clamp(x / 2048, 0, 1) - 40 * clamp(-x / 2048, 0, 1);
    M = hr * Math.pow(smooth(0.64, 0.95, q), 1.45) + hr * 1.25 * Math.pow(smooth(1.02, 3.2, q), 0.9);
  }
  if (x > 1050) {
    const mm = smooth(1110, 1520, x) * (1 - smooth(980, 1440, Math.abs(z)));
    if (mm > 0) M = smoothMax(M, mm * (305 + 55 * nC(x / 800, z / 800)), 50);
  }
  let mask = clamp(M / 140, 0, 1);
  if (mask > 0.001) {
    const r = ridged(nD, x / 720, z / 720, 5);
    const near = 190 * clamp(M / 300, 0.25, 1.3);
    if (q > 1.02) {
      const rb = ridged(nE, x / 1500, z / 1500, 4);
      M += lerp((r - 0.42) * mask * near, (rb - 0.4) * (130 + Math.min(240, M * 0.2)) + (r - 0.42) * 90, smooth(1.02, 1.4, q));
    } else M += (r - 0.42) * mask * near;
  }
  h += M;
  const px = Math.abs(x - D.passX);
  if (az > 0.5 && px < 900) {
    const pz = Math.abs(z);
    const floor = 6 + 40 * smooth(1250, 2048, pz) + 120 * smooth(2100, 4200, pz);
    const lim = floor + 3 + Math.max(0, px - 42) * 0.95 + 0.0009 * Math.max(0, px - 42) ** 2;
    const k = smooth(1050, 1350, pz) * (1 - smooth(3600, 5800, pz));
    h = lerp(h, smoothMin(h, lim, 12), k);
  }
  const L = D.lake;
  const dx = x - L.x, dz = z - L.z, c = Math.cos(L.rot), s = Math.sin(L.rot);
  const u = (dx * c + dz * s) / L.rx, v = (-dx * s + dz * c) / L.rz;
  const e = Math.sqrt(u * u + v * v);
  let playa = 0;
  if (e < 1.5) {
    const fl = L.floor + 0.12 * nA(x / 70, z / 70);
    const k = smooth(0.8, 1.42, e);
    h = lerp(fl, h, k) + 0.5 * Math.exp(-((e - 0.93) ** 2) / 0.0006) - 0.35 * Math.exp(-((e - 1.08) ** 2) / 0.0008);
    playa = 1 - smooth(0.86, 0.97, e);
  }
  const md = D.mesa, mdx = x - md.x, mdz = z - md.z, mr = Math.hypot(mdx, mdz);
  if (mr < md.r + 260) {
    const ang = Math.atan2(mdz, mdx), ca = Math.cos(ang), sa = Math.sin(ang);
    const rr = mr / (1 + 0.075 * nB(ca * 2.1 + 5, sa * 2.1 + 5) + 0.035 * nC(ca * 6 + 1, sa * 6 + 1));
    const top = md.top + 1.6 * (1 - Math.min(1, (rr / md.r) ** 2)) + 0.5 * nE(x / 40, z / 40);
    let mh;
    if (rr < md.r) mh = top;
    else if (rr < md.r + 26) mh = top - 44 * Math.pow((rr - md.r) / 26, 0.75) + 3 * nD(x / 9, z / 9);
    else mh = (top - 44) * Math.pow(1 - smooth(0, 1, (rr - md.r - 26) / 200), 1.7) + 2;
    if (mh > h) h = mh;
    if (D.lip) {
      const lx = x - D.lip.x, lz = z - (D.lip.z - D.lip.r);
      if (lz > 0 && lz < D.lip.r + 6 && Math.abs(lx) < 30 && rr < md.r + 2) h += D.lip.h * Math.pow(Math.min(1, lz / D.lip.r), 2) * (1 - smooth(10, 26, Math.abs(lx)));
    }
  }
  const rp = D.ramp;
  if (x > rp.x0 - 40 && x < rp.x1 + 60 && Math.abs(z - rp.z) < 120) {
    const t = (x - rp.x0) / (rp.x1 - rp.x0);
    if (t > -0.05 && t < 1.1) {
      const w = lerp(rp.w0, rp.w1, clamp(t, 0, 1)) / 2;
      const rh = md.top - (md.top - 2) * clamp(t, 0, 1) + 0.4 * nE(x / 25, z / 25);
      const side = Math.max(0, Math.abs(z - rp.z) - w);
      const rv = rh - side * 1.05 - (t > 1 ? (t - 1) * 900 : 0);
      if (rv > h) h = rv;
    }
  }
  for (const k of D.kickers) {
    const ku = x - k.x, kz = Math.abs(z - k.z);
    const up = k.h * 3.6, dn = k.h * 2.1, wd = 20 + k.h * 1.2;
    if (ku < -up || ku > dn || kz > wd + 8) continue;
    const p = ku < 0 ? Math.pow(1 + ku / up, 1.7) : Math.pow(1 - ku / dn, 2) * (1 + 0.6 * ku / dn);
    h += k.h * p * (1 - smooth(wd - 10, wd + 8, kz));
  }
  let sand = 0;
  const du = D.dunes;
  if (x > du.x0 && x < du.x1 && z > du.z0 && z < du.z1) {
    const dm = smooth(du.x0, du.x0 + du.edge, x) * (1 - smooth(du.x1 - du.edge, du.x1, x)) * smooth(du.z0, du.z0 + du.edge, z) * (1 - smooth(du.z1 - du.edge, du.z1, z));
    if (dm > 0) {
      const warp = 46 * nB(x / 380, z / 380) + 22 * nC(x / 140, z / 140);
      const uu = (x + warp) / du.wave, t = uu - Math.floor(uu);
      const p = t < 0.74 ? Math.pow(t / 0.74, 1.35) : Math.pow(1 - (t - 0.74) / 0.26, 1.7);
      const amp = 8 + 7 * (0.5 + 0.5 * nA(x / 520 + 3, z / 520 - 2));
      h += dm * (2.5 + amp * p * (0.62 + 0.38 * nD(z / 260, x / 700)));
      sand = smooth(0.08, 0.5, dm);
    }
  }
  const flat = 1 - Math.max(playa, sand);
  h += (0.85 * nC(x / 70, z / 70) + 0.22 * nD(x / 17, z / 17)) * flat * (1 - mask * 0.5);
  if (m) { m.sand = sand; m.playa = playa; m.rock = mask; m.q = q; }
  return h;
}

export function farHeight(x, z, D) { return sampleBase(x, z, D, null); }

export function generateRows(D, iz0, iz1) {
  const rows = iz1 - iz0;
  const H = new Float32Array(rows * N);
  const t0 = iz0 + (iz0 & 1), cnt = Math.max(0, Math.ceil((iz1 - t0) / 2));
  const S = new Uint8Array(cnt * TN * 4);
  const m = { sand: 0, playa: 0, rock: 0 };
  for (let iz = iz0; iz < iz1; iz++) {
    const z = ORIGIN + iz * CELL, even = (iz & 1) === 0, row = (iz - iz0) * N, srow = ((iz - t0) >> 1) * TN * 4;
    for (let ix = 0; ix < N; ix++) {
      const x = ORIGIN + ix * CELL;
      H[row + ix] = sampleBase(x, z, D, even && (ix & 1) === 0 ? m : null);
      if (even && (ix & 1) === 0) { const o = srow + (ix >> 1) * 4; S[o] = Math.round(m.sand * 255); S[o + 1] = Math.round(m.playa * 255); S[o + 2] = Math.round(m.rock * 255); S[o + 3] = 0; }
    }
  }
  return { iz0, iz1, H, S, t0 };
}

export class TerrainData {
  constructor(D, spec = INNER) {
    this.D = D; this.spec = spec;
    this.N = spec.N; this.CELL = spec.CELL; this.ORIGIN = spec.ORIGIN; this.EXTENT = spec.EXTENT; this.TN = spec.TN; this.TCELL = spec.TCELL;
    const N = this.N, TN = this.TN;
    this.H = new Float32Array(N * N);
    this.S = new Uint8Array(TN * TN * 4);
    this.R = new Uint8Array(TN * TN * 4);
    this.NRM = new Uint8Array(TN * TN * 2);
    this.outside = null;
    this.bumps = null; this.bumpKey = '[]';
    this.natural = false;
    this.version = 0;
  }

  addRows(r) {
    this.H.set(r.H, r.iz0 * this.N);
    if (r.S.length) this.S.set(r.S, (r.t0 >> 1) * this.TN * 4);
  }

  finish() {
    const N = this.N;
    this.touched = new Uint8Array(N * N);
    this.delta = { idx: [], nat: [] };
    this.locked = new Uint8Array(N * N);
    this.build();
    this.touched = null; this.locked = null;
    this.seam();
    this.computeNormals(0, 0, this.TN - 1, this.TN - 1);
  }

  build() {
    const D = this.D;
    this.carve(D.canyon, (e) => (e < 46 ? 3.3 * e : e < 74 ? 151.8 + 0.35 * (e - 46) : 161.6 + 2.4 * (e - 74)), 260, 1.0, 9, 4, true);
    this.carve(D.wash, (e) => Math.min(1.5 * e, 3.2 + 0.08 * e), 24, 0.25, 0, 0, false);
    this.recordStart();
    const byId = Object.fromEntries(D.roads.map((r) => [r.id, r]));
    this.stampRoad(byId.highway);
    this.townPad(D.town);
    this.stampRoad(byId.loop);
    for (const r of D.roads) if (r.kind === 'link' || r.kind === 'street') this.stampRoad(r);
    this.stampRoad(byId.rail);
    for (const r of D.roads) if (r.kind === 'track') this.stampRoad(r);
    for (const r of D.roads) if (r.kind === 'connector') this.stampRoad(r);
    this.recordEnd();
  }

  seam() {
    if (!this.seamEdges) return;
    const N = this.N, H = this.H;
    for (const e of this.seamEdges) {
      for (let k = 1; k < N - 1; k += 2) {
        const o = e === 'z0' ? k : e === 'z1' ? (N - 1) * N + k : e === 'x0' ? k * N : k * N + N - 1;
        const st = e === 'z0' || e === 'z1' ? 1 : N;
        H[o] = (H[o - st] + H[o + st]) / 2;
      }
    }
  }

  hAt(x, z) {
    const N = this.N, CELL = this.CELL, ORIGIN = this.ORIGIN;
    const fx = (x - ORIGIN) / CELL, fz = (z - ORIGIN) / CELL;
    let j = Math.floor(fx), i = Math.floor(fz);
    if (j < 0) j = 0; else if (j > N - 2) j = N - 2;
    if (i < 0) i = 0; else if (i > N - 2) i = N - 2;
    const u = clamp(fx - j, 0, 1), v = clamp(fz - i, 0, 1), H = this.H, o = i * N + j;
    const h00 = H[o], h01 = H[o + 1], h10 = H[o + N], h11 = H[o + N + 1];
    return u + v < 1 ? h00 + (h01 - h00) * u + (h10 - h00) * v : h11 + (h10 - h11) * (1 - u) + (h01 - h11) * (1 - v);
  }

  heightAt(x, z) {
    const O = this.ORIGIN;
    if (x < O || z < O || x > -O || z > -O) return this.outside ? this.outside(x, z) : farHeight(x, z, this.D);
    return this.hAt(x, z);
  }

  normalAt(x, z, out) {
    const e = 2;
    const nx = this.heightAt(x - e, z) - this.heightAt(x + e, z), nz = this.heightAt(x, z - e) - this.heightAt(x, z + e), ny = 2 * e;
    const l = Math.hypot(nx, ny, nz);
    out = out || { x: 0, y: 1, z: 0 };
    out.x = nx / l; out.y = ny / l; out.z = nz / l;
    return out;
  }

  tex(arr, x, z, ch, stride = 4) {
    const TN = this.TN, TCELL = this.TCELL, ORIGIN = this.ORIGIN;
    const fx = clamp((x - ORIGIN) / TCELL, 0, TN - 1.001), fz = clamp((z - ORIGIN) / TCELL, 0, TN - 1.001);
    const j = Math.floor(fx), i = Math.floor(fz), u = fx - j, v = fz - i, o = (i * TN + j) * stride + ch, r = TN * stride;
    return ((arr[o] * (1 - u) + arr[o + stride] * u) * (1 - v) + (arr[o + r] * (1 - u) + arr[o + r + stride] * u) * v) / 255;
  }

  touch(k) {
    if (this.recording && !this.touched[k]) { this.touched[k] = 1; this.delta.idx.push(k); this.delta.nat.push(this.H[k]); }
  }

  recordStart() { this.recording = true; }
  recordEnd() {
    this.recording = false;
    const d = this.delta, n = d.idx.length;
    this.deltaIdx = Int32Array.from(d.idx); this.deltaNat = Float32Array.from(d.nat); this.deltaBuilt = new Float32Array(n);
    for (let i = 0; i < n; i++) this.deltaBuilt[i] = this.H[this.deltaIdx[i]];
    this.delta = null;
    this.deltaBox = [0, 0, this.N - 1, this.N - 1];
  }

  setEra(natural, bumps) {
    const key = JSON.stringify(bumps || []);
    if (natural === this.natural && key === this.bumpKey) return false;
    const H = this.H;
    if (this.bumps) { const b = this.bumps; for (let i = 0; i < b.idx.length; i++) H[b.idx[i]] -= b.dh[i]; this.bumps = null; }
    if (natural !== this.natural) {
      this.natural = natural;
      const src = natural ? this.deltaNat : this.deltaBuilt, idx = this.deltaIdx;
      for (let i = 0; i < idx.length; i++) H[idx[i]] = src[i];
    }
    this.bumpKey = key;
    if (bumps && bumps.length) this.bumps = this.stampBumps(bumps);
    this.seam();
    if (this.afterEra) this.afterEra();
    this.computeNormals(0, 0, this.TN - 1, this.TN - 1);
    this.version++;
    return true;
  }

  setNatural(on) { return this.setEra(on, JSON.parse(this.bumpKey)); }

  stampBumps(list) {
    const N = this.N, CELL = this.CELL, ORIGIN = this.ORIGIN;
    const H = this.H, idx = [], dh = [];
    for (const b of list) {
      const r = b.r, h = b.h;
      const j0 = Math.max(0, Math.floor((b.x - r - ORIGIN) / CELL)), j1 = Math.min(N - 1, Math.ceil((b.x + r - ORIGIN) / CELL));
      const i0 = Math.max(0, Math.floor((b.z - r - ORIGIN) / CELL)), i1 = Math.min(N - 1, Math.ceil((b.z + r - ORIGIN) / CELL));
      for (let i = i0; i <= i1; i++) {
        const z = ORIGIN + i * CELL;
        for (let j = j0; j <= j1; j++) {
          const x = ORIGIN + j * CELL;
          const t = Math.hypot(x - b.x, z - b.z) / r;
          if (t >= 1) continue;
          let v = h * Math.pow(1 - t, 1.5) * (1 + 0.12 * nB(x / 38, z / 38));
          if (b.crater) v -= h * 0.42 * Math.pow(Math.max(0, 1 - t / 0.22), 2);
          const o = i * N + j;
          idx.push(o); dh.push(v); H[o] += v;
        }
      }
    }
    return { idx: Int32Array.from(idx), dh: Float32Array.from(dh) };
  }

  lowRes(f = 2) {
    const N = this.N, n = (N - 1) / f + 1, out = new Float32Array(n * n), H = this.H;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i * n + j] = H[i * f * N + j * f];
    return out;
  }

  carve(path, wall, reach, floorCurve, jag, jag2, canyon) {
    const N = this.N, CELL = this.CELL, ORIGIN = this.ORIGIN, TN = this.TN;
    const H = this.H, S = this.S;
    const n = path.length;
    for (let k = 0; k < n - 1; k++) {
      const a = path[k], b = path[k + 1];
      const hw = Math.max(a[3], b[3]) / 2, R = hw + reach + jag;
      const x0 = Math.min(a[0], b[0]) - R, x1 = Math.max(a[0], b[0]) + R, z0 = Math.min(a[1], b[1]) - R, z1 = Math.max(a[1], b[1]) + R;
      const sx = b[0] - a[0], sz = b[1] - a[1], L2 = sx * sx + sz * sz || 1;
      const j0 = Math.max(0, Math.floor((x0 - ORIGIN) / CELL)), j1 = Math.min(N - 1, Math.ceil((x1 - ORIGIN) / CELL));
      const i0 = Math.max(0, Math.floor((z0 - ORIGIN) / CELL)), i1 = Math.min(N - 1, Math.ceil((z1 - ORIGIN) / CELL));
      for (let i = i0; i <= i1; i++) {
        const z = ORIGIN + i * CELL;
        for (let j = j0; j <= j1; j++) {
          const x = ORIGIN + j * CELL;
          let t = ((x - a[0]) * sx + (z - a[1]) * sz) / L2;
          if (t < -0.1 || t > 1.1) { if (k > 0 && t < 0) continue; if (k < n - 2 && t > 1) continue; }
          t = clamp(t, 0, 1);
          const px = a[0] + sx * t, pz = a[1] + sz * t, d = Math.hypot(x - px, z - pz);
          if (d > R) continue;
          const fl = lerp(a[2], b[2], t), w = lerp(a[3], b[3], t) / 2;
          const jj = jag ? jag * nB(x / 46, z / 46) + jag2 * nC(x / 13, z / 13) : 0;
          const ee = d - w + jj;
          const target = ee <= 0 ? fl + floorCurve * (d / w) ** 2 + (canyon ? 0.35 * nE(x / 30, z / 30) : 0) : fl + floorCurve + wall(ee);
          const o = i * N + j;
          if (target < H[o]) H[o] = target;
          if (!(i & 1) && !(j & 1)) {
            const so = ((i >> 1) * TN + (j >> 1)) * 4;
            const v = Math.round(clamp(0.5 + (w + (canyon ? 2 : 1) - d) / 16, 0, 1) * 255);
            if (v > S[so + 3]) S[so + 3] = v;
            if (!canyon && ee < 0) S[so] = Math.max(S[so], Math.round(clamp(-ee / 6, 0, 0.75) * 255));
          }
        }
      }
    }
  }

  townPad(T) {
    const N = this.N, CELL = this.CELL, ORIGIN = this.ORIGIN, TN = this.TN;
    const H = this.H, R = this.R;
    let sum = 0, cnt = 0;
    for (let z = T.z0; z <= T.z1; z += 20) for (let x = T.x0; x <= T.x1; x += 20) { sum += this.hAt(x, z); cnt++; }
    const avg = sum / cnt;
    const gx = (this.hAt(T.x0, (T.z0 + T.z1) / 2) - this.hAt(T.x1, (T.z0 + T.z1) / 2)) / (T.x0 - T.x1) * 0.35;
    const gz = (this.hAt((T.x0 + T.x1) / 2, T.z0) - this.hAt((T.x0 + T.x1) / 2, T.z1)) / (T.z0 - T.z1) * 0.35;
    const cx = (T.x0 + T.x1) / 2, cz = (T.z0 + T.z1) / 2, soft = 60;
    this.townH = { avg, gx, gz, cx, cz };
    const j0 = Math.max(0, Math.floor((T.x0 - soft - ORIGIN) / CELL)), j1 = Math.min(N - 1, Math.ceil((T.x1 + soft - ORIGIN) / CELL));
    const i0 = Math.max(0, Math.floor((T.z0 - soft - ORIGIN) / CELL)), i1 = Math.min(N - 1, Math.ceil((T.z1 + soft - ORIGIN) / CELL));
    for (let i = i0; i <= i1; i++) {
      const z = ORIGIN + i * CELL;
      for (let j = j0; j <= j1; j++) {
        const x = ORIGIN + j * CELL;
        const ex = Math.max(T.x0 - x, x - T.x1, 0), ez = Math.max(T.z0 - z, z - T.z1, 0), e = Math.hypot(ex, ez);
        if (e > soft) continue;
        const k = 1 - smooth(0, soft, e), o = i * N + j;
        if (this.locked[o]) continue;
        const target = avg + gx * (x - cx) + gz * (z - cz) + 0.08 * nD(x / 20, z / 20);
        this.touch(o);
        H[o] = lerp(H[o], target, k);
        if (!(i & 1) && !(j & 1)) {
          const ro = ((i >> 1) * TN + (j >> 1)) * 4 + 3;
          const din = Math.min(x - T.x0, T.x1 - x, z - T.z0, T.z1 - z);
          const v = Math.round(clamp(0.5 + (e > 0 ? -e : din) / 16, 0, 1) * 255);
          if (v > R[ro]) R[ro] = v;
        }
      }
    }
  }

  profile(r) {
    const N = this.N, CELL = this.CELL, ORIGIN = this.ORIGIN;
    const n = r.pts.length, e = new Float64Array(n), pin = new Uint8Array(n), flatPin = new Uint8Array(n);
    const hw = r.width / 2, fw = hw + r.shoulder + 1;
    const lockedAt = (x, z) => { const ci = Math.round((z - ORIGIN) / CELL), cj = Math.round((x - ORIGIN) / CELL); return ci >= 0 && cj >= 0 && ci < N && cj < N && this.locked[ci * N + cj]; };
    for (let k = 0; k < n; k++) {
      const [x, z] = r.pts[k], nx = r.tz[k], nz = -r.tx[k];
      for (let o = -fw; o <= fw; o += fw / 3) if (lockedAt(x + nx * o, z + nz * o)) { flatPin[k] = 1; break; }
      if (lockedAt(x, z)) { e[k] = this.hAt(x, z); pin[k] = 1; continue; }
      e[k] = (this.hAt(x, z) * 2 + this.hAt(x + nx * hw * 0.7, z + nz * hw * 0.7) + this.hAt(x - nx * hw * 0.7, z - nz * hw * 0.7)) / 4;
    }
    if (r.pinStart !== undefined) { e[0] = r.pinStart; pin[0] = 1; for (let k = 1; k < Math.min(n, 6); k++) { e[k] = r.pinStart; pin[k] = 1; } }
    if (r.pinEnd !== undefined) { for (let k = Math.max(0, n - 6); k < n; k++) { e[k] = r.pinEnd; pin[k] = 1; } }
    const pinned = Float64Array.from(e);
    const rad = Math.max(1, Math.round(r.sigma / SPACING * 0.9));
    const tmp = new Float64Array(n);
    for (let pass = 0; pass < 4; pass++) {
      for (let k = 0; k < n; k++) {
        let s = 0, c = 0;
        for (let o = -rad; o <= rad; o++) {
          let q = k + o;
          if (r.closed) q = (q + n) % n; else if (q < 0 || q >= n) continue;
          s += e[q]; c++;
        }
        tmp[k] = s / c;
      }
      for (let k = 0; k < n; k++) e[k] = pin[k] ? pinned[k] : tmp[k];
    }
    const g = r.maxGrade * SPACING;
    for (let it = 0; it < 3; it++) {
      for (let k = 1; k < n; k++) if (!pin[k]) e[k] = clamp(e[k], e[k - 1] - g, e[k - 1] + g);
      for (let k = n - 2; k >= 0; k--) if (!pin[k]) e[k] = clamp(e[k], e[k + 1] - g, e[k + 1] + g);
    }
    for (const c of r.crests) {
      let best = 0, bd = 1e18;
      for (let k = 0; k < n; k++) { const d = (r.pts[k][0] - c.x) ** 2 + (r.pts[k][1] - c.z) ** 2; if (d < bd) { bd = d; best = k; } }
      const half = Math.round(c.len / 2 / SPACING);
      for (let o = -half; o <= half; o++) { let q = best + o; if (r.closed) q = (q + n) % n; else if (q < 0 || q >= n) continue; e[q] += c.h * 0.5 * (1 + Math.cos(Math.PI * o / half)); }
    }
    const bank = new Float64Array(n);
    if (r.bankMax > 0) {
      for (let k = 0; k < n; k++) bank[k] = clamp(r.kap[k] * r.bankK, -r.bankMax, r.bankMax);
      const br = Math.round(45 / SPACING);
      for (let pass = 0; pass < 3; pass++) {
        for (let k = 0; k < n; k++) { let s = 0, c = 0; for (let o = -br; o <= br; o++) { let q = k + o; if (r.closed) q = (q + n) % n; else if (q < 0 || q >= n) continue; s += bank[q]; c++; } tmp[k] = s / c; }
        for (let k = 0; k < n; k++) bank[k] = flatPin[k] ? 0 : tmp[k];
      }
    }
    r.elev = Float32Array.from(e);
    r.bank = Float32Array.from(bank);
  }

  stampRoad(r) {
    const N = this.N, CELL = this.CELL, ORIGIN = this.ORIGIN, TN = this.TN;
    this.profile(r);
    const H = this.H, Rm = this.R, L = this.locked;
    const ch = r.mask === 'main' ? 0 : r.mask === 'loop' ? 1 : r.mask === 'track' ? 2 : -1;
    const hw = r.width / 2, flat = hw + r.shoulder, reach = flat + r.infl;
    const n = r.pts.length, segN = r.closed ? n : n - 1;
    const newLock = [];
    for (let k = 0; k < segN; k++) {
      const k1 = (k + 1) % n, a = r.pts[k], b = r.pts[k1];
      const x0 = Math.min(a[0], b[0]) - reach, x1 = Math.max(a[0], b[0]) + reach, z0 = Math.min(a[1], b[1]) - reach, z1 = Math.max(a[1], b[1]) + reach;
      const sx = b[0] - a[0], sz = b[1] - a[1], L2 = sx * sx + sz * sz || 1;
      const ea = r.elev[k], eb = r.elev[k1], ba = Math.tan(r.bank[k]), bb = Math.tan(r.bank[k1]);
      const tx = (r.tx[k] + r.tx[k1]) / 2, tz = (r.tz[k] + r.tz[k1]) / 2;
      const j0 = Math.max(0, Math.floor((x0 - ORIGIN) / CELL)), j1 = Math.min(N - 1, Math.ceil((x1 - ORIGIN) / CELL));
      const i0 = Math.max(0, Math.floor((z0 - ORIGIN) / CELL)), i1 = Math.min(N - 1, Math.ceil((z1 - ORIGIN) / CELL));
      const first = !r.closed && k === 0, last = !r.closed && k === segN - 1;
      for (let i = i0; i <= i1; i++) {
        const z = ORIGIN + i * CELL;
        for (let j = j0; j <= j1; j++) {
          const x = ORIGIN + j * CELL;
          const t = ((x - a[0]) * sx + (z - a[1]) * sz) / L2;
          if ((t < -0.08 && !first) || (t > 1.08 && !last)) continue;
          if (t < -0.08 - reach / SPACING || t > 1.08 + reach / SPACING) continue;
          const tc = clamp(t, 0, 1);
          const dx = x - (a[0] + sx * tc), dz = z - (a[1] + sz * tc);
          const lat = dx * tz - dz * tx;
          const along = Math.abs(dx * tx + dz * tz);
          const d = Math.hypot(lat, (t < 0 || t > 1) ? along : 0);
          if (d > reach) continue;
          const rh = lerp(ea, eb, tc) - lerp(ba, bb, tc) * clamp(lat, -flat, flat);
          const o = i * N + j;
          const eo = d - flat;
          if (eo <= 0) {
            if (!L[o]) { this.touch(o); H[o] = rh; newLock.push(o); }
          } else if (!L[o]) {
            const v = clamp(H[o], rh - r.fillK * eo, rh + r.cutK * eo);
            if (v !== H[o]) { this.touch(o); H[o] = v; }
          }
          if (ch >= 0 && !(i & 1) && !(j & 1)) {
            const ro = ((i >> 1) * TN + (j >> 1)) * 4 + ch;
            const v = Math.round(clamp(0.5 + (hw - d) / 16, 0, 1) * 255);
            if (v > Rm[ro]) Rm[ro] = v;
          }
        }
      }
    }
    for (const o of newLock) L[o] = 1;
  }

  computeNormals(ti0, tj0, ti1, tj1) {
    const N = this.N, CELL = this.CELL, TN = this.TN;
    const H = this.H, out = this.NRM;
    for (let ti = ti0; ti <= ti1; ti++) {
      const i = ti * 2, im = Math.max(0, i - 1), ip = Math.min(N - 1, i + 1);
      for (let tj = tj0; tj <= tj1; tj++) {
        const j = tj * 2, jm = Math.max(0, j - 1), jp = Math.min(N - 1, j + 1);
        const nx = (H[i * N + jm] - H[i * N + jp]) / ((jp - jm) * CELL), nz = (H[im * N + j] - H[ip * N + j]) / ((ip - im) * CELL);
        const l = Math.hypot(nx, 1, nz), o = (ti * TN + tj) * 2;
        out[o] = Math.round((nx / l * 0.5 + 0.5) * 255); out[o + 1] = Math.round((nz / l * 0.5 + 0.5) * 255);
      }
    }
  }
}

export function buildTerrainSync(D) {
  const T = new TerrainData(D);
  const step = 128;
  for (let iz = 0; iz < N; iz += step) T.addRows(generateRows(D, iz, Math.min(N, iz + step)));
  T.finish();
  return T;
}
