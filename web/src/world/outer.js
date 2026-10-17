// Roadster 88 mega grid: the 4 m height grid of the 16 x 16 km map around the valley (rows generated in workers from the mega design), river channels with city quays, outer roads stamped with cut and fill, the copy of the valley grid inside, the seam to it, water and the far terrain beyond the border. Pure JS for the main thread, workers and Node.
import { TerrainData } from './terrain.js';
import { MEGA, megaBase, newWorld, cityWeight, INNER_HALF, shoreZ } from './mega.js';
import { clamp, smooth, makeSimplex } from './noise.js';
import { PONDS, cityGround } from './city/layout.js';

const nW = makeSimplex(4471);

export function generateOuterRows(D, iz0, iz1, spec = MEGA) {
  const { N, CELL, ORIGIN, TN } = spec;
  const rows = iz1 - iz0;
  const H = new Float32Array(rows * N);
  const t0 = iz0 + (iz0 & 1), cnt = Math.max(0, Math.ceil((iz1 - t0) / 2));
  const S = new Uint8Array(cnt * TN * 4);
  const m = { sand: 0, playa: 0, rock: 0 };
  const inner = INNER_HALF - 2 * CELL;
  for (let iz = iz0; iz < iz1; iz++) {
    const z = ORIGIN + iz * CELL, even = (iz & 1) === 0, row = (iz - iz0) * N, srow = ((iz - t0) >> 1) * TN * 4;
    const zin = Math.abs(z) < inner;
    for (let ix = 0; ix < N; ix++) {
      const x = ORIGIN + ix * CELL;
      if (zin && Math.abs(x) < inner) continue;
      const mm = even && (ix & 1) === 0 ? m : null;
      H[row + ix] = megaBase(x, z, D, mm);
      if (mm) { const o = srow + (ix >> 1) * 4; S[o] = Math.round(m.sand * 255); S[o + 1] = Math.round(m.playa * 255); S[o + 2] = Math.round(m.rock * 255); S[o + 3] = z > shoreZ(x) + 14 ? 255 : 0; }
    }
  }
  return { iz0, iz1, H, S, t0 };
}

export function farMegaHeight(x, z) {
  const h = newWorld(x, z, null);
  const e = Math.max(Math.abs(x), z < 0 ? -z : 0) - MEGA.HALF;
  if (z > 7600 && Math.abs(x) < 9000) return Math.min(h, -8);
  return e > 0 ? h + Math.min(900, e * 0.12) : h;
}

export class OuterData extends TerrainData {
  constructor(D, M, inner, spec = MEGA) {
    super(D, spec);
    this.M = M; this.inner = inner;
    this.outside = farMegaHeight;
  }

  build() {
    const M = this.M;
    for (const R of M.rivers) this.carveRiver(R.pts);
    for (const P of PONDS) this.carvePond(P);
    this.recordStart();
    const innerRoads = Object.fromEntries(this.D.roads.map((r) => [r.id, r]));
    for (const r of M.roads) {
      if (r.joinStart && innerRoads[r.joinStart]) {
        const ir = innerRoads[r.joinStart], [x, z] = r.pts[0];
        let best = 0, bd = Infinity;
        ir.pts.forEach((p, k) => { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; best = k; } });
        r.pinStart = ir.elev[best];
      }
      this.stampRoad(r);
    }
    this.recordEnd();
  }

  carveRiver(path) {
    const { N, CELL, ORIGIN, TN } = this;
    const H = this.H, S = this.S;
    const n = path.length;
    for (let k = 0; k < n - 1; k++) {
      const a = path[k], b = path[k + 1];
      const hw = Math.max(a[2], b[2]), R = hw + 160;
      const x0 = Math.min(a[0], b[0]) - R, x1 = Math.max(a[0], b[0]) + R, z0 = Math.min(a[1], b[1]) - R, z1 = Math.max(a[1], b[1]) + R;
      const sx = b[0] - a[0], sz = b[1] - a[1], L2 = sx * sx + sz * sz || 1;
      const j0 = Math.max(0, Math.floor((x0 - ORIGIN) / CELL)), j1 = Math.min(N - 1, Math.ceil((x1 - ORIGIN) / CELL));
      const i0 = Math.max(0, Math.floor((z0 - ORIGIN) / CELL)), i1 = Math.min(N - 1, Math.ceil((z1 - ORIGIN) / CELL));
      for (let i = i0; i <= i1; i++) {
        const z = ORIGIN + i * CELL;
        for (let j = j0; j <= j1; j++) {
          const x = ORIGIN + j * CELL;
          let t = ((x - a[0]) * sx + (z - a[1]) * sz) / L2;
          if ((t < 0 && k > 0) || (t > 1 && k < n - 2)) continue;
          t = clamp(t, 0, 1);
          const d = Math.hypot(x - a[0] - sx * t, z - a[1] - sz * t);
          const w = a[2] + (b[2] - a[2]) * t, dp = a[3] + (b[3] - a[3]) * t;
          if (d > w + 160) continue;
          const city = cityWeight(x, z);
          const jag = city > 0.5 ? 0 : 6 * nW(x / 70, z / 70);
          const e = d - w + jag;
          const edge = -dp * 0.42;
          let target;
          if (e <= 0) target = -dp * (1 - 0.58 * Math.pow(Math.min(1, d / w), 2.2)) + 0.4 * nW(x / 40, z / 40);
          else {
            const steep = city > 0.5 ? 2.6 : 0.16 + 0.5 * smooth(0, 1, dp / 16);
            target = edge + steep * e + (city > 0.5 ? 0 : 0.002 * e * e);
          }
          const o = i * N + j;
          if (target < H[o]) H[o] = target;
          if (!(i & 1) && !(j & 1)) {
            const so = ((i >> 1) * TN + (j >> 1)) * 4;
            const v = Math.round(clamp(0.5 + (w + 3 - d) / 16, 0, 1) * 255);
            if (v > S[so + 3]) S[so + 3] = v;
            if (city < 0.5 && e > -6 && e < 18) S[so] = Math.max(S[so], Math.round(clamp(1 - Math.abs(e - 4) / 14, 0, 0.8) * 255));
          }
        }
      }
    }
  }

  carvePond(P) {
    const { N, CELL, ORIGIN, TN } = this, H = this.H, g = cityGround(P.x, P.z);
    P.level = g - 1.1;
    const j0 = Math.max(0, Math.floor((P.x - P.rx * 1.4 - ORIGIN) / CELL)), j1 = Math.min(N - 1, Math.ceil((P.x + P.rx * 1.4 - ORIGIN) / CELL));
    const i0 = Math.max(0, Math.floor((P.z - P.rz * 1.4 - ORIGIN) / CELL)), i1 = Math.min(N - 1, Math.ceil((P.z + P.rz * 1.4 - ORIGIN) / CELL));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x = ORIGIN + j * CELL, z = ORIGIN + i * CELL, e = Math.hypot((x - P.x) / P.rx, (z - P.z) / P.rz);
      if (e > 1.35) continue;
      const t = e < 1 ? g - 1.6 - P.depth * (1 - e * e) : g - 1.6 * (1 - smooth(1, 1.35, e));
      const o = i * N + j; if (t < H[o]) H[o] = t;
    }
  }

  fillInner(T) {
    const { N, CELL, ORIGIN } = this, H = this.H, f = CELL / T.CELL;
    const j0 = Math.round((T.ORIGIN - ORIGIN) / CELL), n = (T.N - 1) / f + 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) H[(j0 + i) * N + j0 + j] = T.H[i * f * T.N + j * f];
    const TN = this.TN, S = this.S, t0 = j0 >> 1, tn = (n - 1) / 2 + 1, tf = (T.TN - 1) / (tn - 1);
    for (let i = 0; i < tn; i++) for (let j = 0; j < tn; j++) {
      const so = ((t0 + i) * TN + t0 + j) * 4, si = (i * tf * T.TN + j * tf) * 4;
      for (let c = 0; c < 4; c++) S[so + c] = T.S[si + c];
    }
    const R = this.R;
    for (let i = 0; i < tn; i++) for (let j = 0; j < tn; j++) {
      const so = ((t0 + i) * TN + t0 + j) * 4, si = (i * tf * T.TN + j * tf) * 4;
      for (let c = 0; c < 4; c++) R[so + c] = T.R[si + c];
    }
    this.innerBox = [j0, j0, j0 + n - 1, j0 + n - 1];
  }

  innerHeights(T) {
    const { N, CELL, ORIGIN } = this, H = this.H, f = CELL / T.CELL;
    const j0 = Math.round((T.ORIGIN - ORIGIN) / CELL), n = (T.N - 1) / f + 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) H[(j0 + i) * N + j0 + j] = T.H[i * f * T.N + j * f];
  }

  waterAt(x, z) {
    if (z < 2300) return false;
    return this.heightAt(x, z) < -0.25;
  }
}

export function seamSync(outer, inner) {
  outer.innerHeights(inner);
}
