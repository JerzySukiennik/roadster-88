// Roadster 88 Earth data: loads the bundled 1 arc-minute elevation and water tiles, assembles a patch grid around a landing point (elevation, local relief, water level and water cover, vegetation and ice), and evaluates the patch height function (bicubic real elevation plus slope- and relief-scaled procedural detail) exactly like the GPU terrain does. Pure module, also usable in workers.
export const EARTH_R = 6371000, M_PER_DEG = EARTH_R * Math.PI / 180, RES = 60;
export const LAT_MAX = 84;
const LAND = -32768;

let indexP = null, base = '';
const tiles = new Map();

export function setBase(url) { base = url.endsWith('/') ? url : url + '/'; }

export function loadIndex() {
  if (!indexP) indexP = fetch(base + 'index.json').then((r) => r.json());
  return indexP;
}

async function inflate(buf) {
  const ds = new DecompressionStream('deflate');
  const out = await new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(out);
}

export function loadTile(la, lo) {
  const key = `${la}_${lo}`;
  if (tiles.has(key)) return tiles.get(key);
  const p = (async () => {
    const buf = await fetch(base + `e_${key}.bin`).then((r) => { if (!r.ok) throw new Error('tile ' + key + ' ' + r.status); return r.arrayBuffer(); });
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x45383852) throw new Error('bad tile ' + key);
    const n = dv.getUint16(6, true), len = dv.getUint32(12, true);
    const b = await inflate(new Uint8Array(buf, 16, len));
    const nn = n * n, E = new Int16Array(nn), W = new Int16Array(nn);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const o = i * n + j, z = b[o] | (b[nn + o] << 8), r = (z >>> 1) ^ -(z & 1);
      const p = i === 0 ? (j === 0 ? 0 : E[o - 1]) : j === 0 ? E[o - n] : E[o - 1] + E[o - n] - E[o - n - 1];
      E[o] = p + r;
    }
    for (let o = 0; o < nn; o++) {
      const z = (b[2 * nn + o] | (b[3 * nn + o] << 8) | (b[4 * nn + o] << 16) | (b[5 * nn + o] << 24)) >>> 0, r = (z >>> 1) ^ -(z & 1);
      const j = o % n, p = j === 0 ? (o === 0 ? 0 : W[o - n]) : W[o - 1];
      W[o] = p + r;
    }
    return { key, la, lo, n, E, W };
  })();
  tiles.set(key, p);
  p.catch(() => tiles.delete(key));
  return p;
}

let biomeP = null;
export function loadBiome() {
  if (!biomeP) biomeP = (async () => {
    try {
      const blob = await fetch(base + 'biome_1k.png').then((r) => r.blob());
      const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height, d: g.getImageData(0, 0, bmp.width, bmp.height).data };
    } catch (e) { return null; }
  })();
  return biomeP;
}

export async function biomeAt(lat, lon) {
  const B = await loadBiome(); if (!B) return null;
  let veg = 0, arid = 0, ice = 0, n = 0;
  const cx = (lon + 180) / 360 * B.w, cy = (90 - lat) / 180 * B.h;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = ((Math.floor(cx) + dx) % B.w + B.w) % B.w, y = Math.max(0, Math.min(B.h - 1, Math.floor(cy) + dy)), o = (y * B.w + x) * 4, k = (dx === 0 && dy === 0 ? 4 : 1) * (B.d[o + 3] / 255 + 0.001);
    veg += B.d[o] / 255 * k; arid += B.d[o + 1] / 255 * k; ice += B.d[o + 2] / 255 * k; n += k;
  }
  return { veg: veg / n, arid: arid / n, ice: ice / n };
}

const tileOf = (v, size) => Math.floor(v / size) * size;

export async function sampleGlobal(lat, lon) {
  const idx = await loadIndex(), T = idx.tile, n = idx.n;
  lat = Math.max(-89.99, Math.min(89.99, lat)); lon = ((lon + 180) % 360 + 360) % 360 - 180;
  const t = await loadTile(tileOf(lat, T), tileOf(lon, T));
  const i = Math.min(n - 1, Math.floor((lat - t.la) * RES)), j = Math.min(n - 1, Math.floor((lon - t.lo) * RES));
  return { e: t.E[i * n + j], w: t.W[i * n + j] === LAND ? null : t.W[i * n + j] };
}

export async function nearestLandLL(lat, lon, maxKm = 900) {
  const idx = await loadIndex(), T = idx.tile, n = idx.n;
  const cell = async (gi, gj) => {
    gi = Math.max(0, Math.min(180 * RES - 1, gi)); gj = ((gj % (360 * RES)) + 360 * RES) % (360 * RES);
    const la = Math.min(90 - T, Math.floor((gi / RES - 90) / T) * T), lo = Math.floor((gj / RES - 180) / T) * T;
    const t = await loadTile(la, lo), o = (gi - (la + 90) * RES) * n + (gj - (lo + 180) * RES);
    return t.W[o] === LAND && t.E[o] > 0;
  };
  const gi0 = Math.floor((lat + 90) * RES), gj0 = Math.floor((lon + 180) * RES);
  if (await cell(gi0, gj0)) return { lat, lon, km: 0 };
  const cosl = Math.max(0.1, Math.cos(lat * Math.PI / 180));
  for (let r = 1; r * 1.853 < maxKm; r++) {
    let best = null;
    const rj = Math.ceil(r / cosl);
    for (let k = -rj; k <= rj; k++) for (const di of [-r, r]) if (await cell(gi0 + di, gj0 + k)) { const d = Math.hypot(di, k * cosl); if (!best || d < best[2]) best = [gi0 + di, gj0 + k, d]; }
    for (let k = -r + 1; k <= r - 1; k++) for (const dj of [-rj, rj]) if (await cell(gi0 + k, gj0 + dj)) { const d = Math.hypot(k, dj * cosl); if (!best || d < best[2]) best = [gi0 + k, gj0 + dj, d]; }
    if (best) return { lat: (best[0] + 0.5) / RES - 90, lon: (((best[1] + 0.5) / RES) % 360 + 360) % 360 - 180, km: Math.round(best[2] * 1.853) };
  }
  return null;
}

export function lattice(seed = 1, size = 256) {
  const g = new Float32Array(size * size);
  let s = seed >>> 0;
  for (let i = 0; i < g.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; g[i] = (s >>> 8) / 16777216; }
  return g;
}

export const LAT = lattice(20261017);

export const OCT = [
  { l: 920, a: 0.5, rot: 0.3, ox: 13.1, oz: 71.7, ridge: true },
  { l: 430, a: 0.26, rot: 1.9, ox: 41.3, oz: 5.9, ridge: true },
  { l: 205, a: 0.13, rot: 4.1, ox: 97.7, oz: 33.3, ridge: true },
  { l: 96, a: 0.065, rot: 2.6, ox: 19.9, oz: 151.1, ridge: false },
  { l: 44, a: 0.75, rot: 5.3, ox: 177.3, oz: 88.8, ridge: false, small: true },
  { l: 19, a: 0.38, rot: 0.9, ox: 63.6, oz: 201.4, ridge: false, small: true },
  { l: 8.5, a: 0.17, rot: 3.7, ox: 131.2, oz: 17.6, ridge: false, small: true },
];
for (const o of OCT) { o.c = Math.cos(o.rot) / o.l; o.s = Math.sin(o.rot) / o.l; }

function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const i0 = xi & 255, j0 = zi & 255, i1 = (i0 + 1) & 255, j1 = (j0 + 1) & 255;
  const a = LAT[j0 * 256 + i0], b = LAT[j0 * 256 + i1], c = LAT[j1 * 256 + i0], d = LAT[j1 * 256 + i1];
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));

export class Patch {
  constructor(lat0, lon0, opts = {}) {
    this.lat0 = Math.max(-LAT_MAX, Math.min(LAT_MAX, lat0)); this.lon0 = lon0;
    this.radius = opts.radius || 64000;
    this.yOff = opts.yOff || 0;
    this.kz = RES / M_PER_DEG;
    this.kx = RES / (M_PER_DEG * Math.cos(this.lat0 * Math.PI / 180));
  }

  async load() {
    const idx = await loadIndex(), T = idx.tile, n = idx.n;
    this.E0 = idx.valley.E0;
    const dLat = this.radius / M_PER_DEG, dLon = this.radius / (M_PER_DEG * Math.cos(this.lat0 * Math.PI / 180));
    const gi0 = Math.floor((this.lat0 - dLat + 90) * RES - 0.5) - 3, gi1 = Math.ceil((this.lat0 + dLat + 90) * RES - 0.5) + 3;
    const gj0 = Math.floor((this.lon0 - dLon + 180) * RES - 0.5) - 3, gj1 = Math.ceil((this.lon0 + dLon + 180) * RES - 0.5) + 3;
    const nx = gj1 - gj0 + 1, nz = gi1 - gi0 + 1;
    this.nx = nx; this.nz = nz; this.gi0 = gi0; this.gj0 = gj0;
    const need = new Map();
    const cellTile = (gi, gj) => {
      const la = Math.max(-90, Math.min(90 - T, Math.floor((Math.max(0, Math.min(180 * RES - 1, gi)) / RES - 90) / T) * T));
      const jj = ((gj % (360 * RES)) + 360 * RES) % (360 * RES), lo = Math.floor((jj / RES - 180) / T) * T;
      return [la, lo];
    };
    for (let gi = gi0; gi <= gi1; gi += 60) for (let gj = gj0; gj <= gj1; gj += 60) { const [la, lo] = cellTile(gi, gj); need.set(`${la}_${lo}`, [la, lo]); }
    for (const gi of [gi0, gi1]) for (const gj of [gj0, gj1]) { const [la, lo] = cellTile(gi, gj); need.set(`${la}_${lo}`, [la, lo]); }
    const got = new Map();
    const bio = biomeAt(this.lat0, this.lon0);
    await Promise.all([...need.values()].map(async ([la, lo]) => { got.set(`${la}_${lo}`, await loadTile(la, lo)); }));
    this.biome = await bio;
    const E = new Float32Array(nx * nz), Wl = new Float32Array(nx * nz), Wf = new Float32Array(nx * nz);
    for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
      const gi = Math.max(0, Math.min(180 * RES - 1, gi0 + i)), gj = (((gj0 + j) % (360 * RES)) + 360 * RES) % (360 * RES);
      const [la, lo] = cellTile(gi, gj), t = got.get(`${la}_${lo}`);
      const ti = Math.min(n - 1, gi - (la + 90) * RES), tj = Math.min(n - 1, gj - (lo + 180) * RES), o = ti * n + tj, w = t.W[o];
      E[i * nx + j] = t.E[o] - this.yOff; Wl[i * nx + j] = w === LAND ? NaN : w - this.yOff; Wf[i * nx + j] = w === LAND ? 0 : 1;
    }
    for (let pass = 0; pass < 6; pass++) {
      const src = Wl.slice();
      for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
        const o = i * nx + j; if (!Number.isNaN(src[o])) continue;
        let s = 0, c = 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nz || jj >= nx) continue; const v = src[ii * nx + jj]; if (!Number.isNaN(v)) { s += v; c++; } }
        if (c) Wl[o] = s / c;
      }
    }
    for (let o = 0; o < Wl.length; o++) if (Number.isNaN(Wl[o])) Wl[o] = E[o] - 80;
    const Rg = new Float32Array(nx * nz);
    for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
      let mn = Infinity, mx = -Infinity;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const ii = Math.max(0, Math.min(nz - 1, i + di)), jj = Math.max(0, Math.min(nx - 1, j + dj)); const v = E[ii * nx + jj]; if (v < mn) mn = v; if (v > mx) mx = v; }
      Rg[i * nx + j] = mx - mn;
    }
    this.E = E; this.Wl = Wl; this.Wf = Wf; this.Rg = Rg;
    this.ci = (this.lat0 + 90) * RES - 0.5 - gi0;
    this.cj = (this.lon0 + 180) * RES - 0.5 - gj0;
    this.grid = new Float32Array(nx * nz * 4);
    for (let o = 0; o < nx * nz; o++) { this.grid[o * 4] = E[o]; this.grid[o * 4 + 1] = Rg[o]; this.grid[o * 4 + 2] = Wl[o]; this.grid[o * 4 + 3] = Wf[o]; }
    return this;
  }

  gridAt(x, z) { return [this.cj - x * this.kx, this.ci + z * this.kz]; }

  latLon(x, z) { return [this.lat0 + z / M_PER_DEG, this.lon0 - x / (M_PER_DEG * Math.cos(this.lat0 * Math.PI / 180))]; }

  local(lat, lon) { let d = lon - this.lon0; d = ((d + 540) % 360) - 180; return [-d * M_PER_DEG * Math.cos(this.lat0 * Math.PI / 180), (lat - this.lat0) * M_PER_DEG]; }

  cell(x, z) {
    const nx = this.nx, nz = this.nz;
    const gx = Math.max(1, Math.min(nx - 2.001, this.cj - x * this.kx)), gz = Math.max(1, Math.min(nz - 2.001, this.ci + z * this.kz));
    const j = Math.floor(gx), i = Math.floor(gz);
    return { o: i * nx + j, fx: gx - j, fz: gz - i };
  }

  bil(A, c) {
    const o = c.o, nx = this.nx, fx = c.fx, fz = c.fz;
    return (A[o] * (1 - fx) + A[o + 1] * fx) * (1 - fz) + (A[o + nx] * (1 - fx) + A[o + nx + 1] * fx) * fz;
  }

  bicubic(c) {
    const nx = this.nx, E = this.E, fx = c.fx;
    const row = (o) => cr(E[o - 1], E[o], E[o + 1], E[o + 2], fx);
    return cr(row(c.o - nx), row(c.o), row(c.o + nx), row(c.o + 2 * nx), c.fz);
  }

  base(x, z) { return this.bicubic(this.cell(x, z)); }

  waterAt(x, z) { const c = this.cell(x, z); return { level: this.bil(this.Wl, c), cover: this.bil(this.Wf, c) }; }

  reliefAt(x, z) { return this.bil(this.Rg, this.cell(x, z)); }

  f(x, z) {
    const c = this.cell(x, z);
    const b = this.bicubic(c), r = this.bil(this.Rg, c), wl = this.bil(this.Wl, c), wf = this.bil(this.Wf, c);
    const above = Math.abs(b - wl), sh = wf > 0.001 || above < 30 ? 0.2 + 0.8 * Math.min(1, Math.max(0, (above - 0.5) / 25)) : 1;
    const big = Math.min(220, Math.max(1.5, r * 0.32)) * sh, small = (0.5 + Math.min(4, r * 0.01)) * sh, ridge = Math.min(1, Math.max(0, (r - 80) / 320));
    let d = 0;
    for (const o of OCT) {
      const n = vnoise(x * o.c - z * o.s + o.ox, x * o.s + z * o.c + o.oz);
      const v = o.ridge ? (n - 0.5) * 2 * (1 - ridge) + ((1 - Math.abs(2 * n - 1)) - 0.5) * 2 * ridge : (n - 0.5) * 2;
      d += v * o.a * (o.small ? small : big);
    }
    return b + d;
  }
}
