// Roadster 88 era land raster: a 4 m grid over the valley with region flags (town, lake, wash, canyon, mesa, dunes, keep-clear jump areas, mountains), road proximity and a per-era block layer that structures paint so flora stays out of buildings.
export const F = { TOWN: 1, LAKE: 2, WASH: 4, CANYON: 8, MESA: 16, DUNES: 32, KEEP: 64, MASSIF: 128 };
const ORIGIN = -2048, CELL = 4, N = 1024;

const REGION_FLAGS = { town: F.TOWN, lake: F.LAKE, wash: F.WASH, canyon: F.CANYON, mesa: F.MESA, dunes: F.DUNES, mesa_ramp: F.KEEP, jumps: F.KEEP, rollers: F.KEEP, massif: F.MASSIF };

export class Land {
  constructor(valley, roads) {
    this.flags = new Uint8Array(N * N);
    this.road = new Uint8Array(N * N);
    this.loop = new Uint8Array(N * N);
    this.block = new Uint8Array(N * N);
    this.N = N; this.CELL = CELL; this.ORIGIN = ORIGIN;
    for (const r of valley.regions || []) {
      const f = REGION_FLAGS[r.id] || REGION_FLAGS[r.kind];
      if (f && r.poly && !r.ring) this.fillPoly(this.flags, r.poly, f);
    }
    for (const rd of roads || []) if (rd.kind !== 'rail') this.stampLine(rd.pts, (rd.width || 10) / 2, rd.closed, rd.kind === 'road' || rd.type === 'loop' ? this.loop : this.road);
  }

  idx(x, z) { const j = Math.floor((x - ORIGIN) / CELL), i = Math.floor((z - ORIGIN) / CELL); return i < 0 || j < 0 || i >= N || j >= N ? -1 : i * N + j; }
  flag(x, z) { const k = this.idx(x, z); return k < 0 ? F.MASSIF : this.flags[k]; }
  roadNear(x, z, loop = true) { const k = this.idx(x, z); return k < 0 ? 0 : Math.max(this.road[k], loop ? this.loop[k] : 0) / 255; }
  blocked(x, z) { const k = this.idx(x, z); return k >= 0 && this.block[k] > 0; }

  fillPoly(arr, poly, bit) {
    let z0 = Infinity, z1 = -Infinity;
    for (const p of poly) { z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    const i0 = Math.max(0, Math.floor((z0 - ORIGIN) / CELL)), i1 = Math.min(N - 1, Math.ceil((z1 - ORIGIN) / CELL));
    const xs = [];
    for (let i = i0; i <= i1; i++) {
      const z = ORIGIN + (i + 0.5) * CELL;
      xs.length = 0;
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const [xa, za] = poly[a], [xb, zb] = poly[b];
        if ((za > z) !== (zb > z)) xs.push(xa + ((z - za) / (zb - za)) * (xb - xa));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const j0 = Math.max(0, Math.ceil((xs[k] - ORIGIN) / CELL - 0.5)), j1 = Math.min(N - 1, Math.floor((xs[k + 1] - ORIGIN) / CELL - 0.5));
        for (let j = j0; j <= j1; j++) arr[i * N + j] |= bit;
      }
    }
  }

  stampLine(pts, half, closed, arr = this.road) {
    const reach = half + 8;
    const n = pts.length;
    for (let k = 0; k < n; k += 1) {
      const [x, z] = pts[k];
      const cj = (x - ORIGIN) / CELL, ci = (z - ORIGIN) / CELL, r = reach / CELL + 1;
      for (let i = Math.max(0, Math.floor(ci - r)); i <= Math.min(N - 1, Math.ceil(ci + r)); i++) for (let j = Math.max(0, Math.floor(cj - r)); j <= Math.min(N - 1, Math.ceil(cj + r)); j++) {
        const d = Math.hypot(ORIGIN + (j + 0.5) * CELL - x, ORIGIN + (i + 0.5) * CELL - z);
        const v = d < half ? 255 : d < reach ? Math.round(255 * (1 - (d - half) / (reach - half)) * 0.8) : 0;
        if (v > arr[i * N + j]) arr[i * N + j] = v;
      }
    }
  }

  clearBlock() { this.block.fill(0); }

  blockRect(cx, cz, hx, hz, ry, margin = 2) {
    const c = Math.cos(ry), s = Math.sin(ry), ex = hx + margin, ez = hz + margin;
    const R = Math.hypot(ex, ez);
    const j0 = Math.max(0, Math.floor((cx - R - ORIGIN) / CELL)), j1 = Math.min(N - 1, Math.ceil((cx + R - ORIGIN) / CELL));
    const i0 = Math.max(0, Math.floor((cz - R - ORIGIN) / CELL)), i1 = Math.min(N - 1, Math.ceil((cz + R - ORIGIN) / CELL));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const dx = ORIGIN + (j + 0.5) * CELL - cx, dz = ORIGIN + (i + 0.5) * CELL - cz;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= ex && Math.abs(lz) <= ez) this.block[i * N + j] = 1;
    }
  }

  blockLine(pts, half) {
    for (const [x, z] of pts) {
      const cj = (x - ORIGIN) / CELL, ci = (z - ORIGIN) / CELL, r = half / CELL + 1;
      for (let i = Math.max(0, Math.floor(ci - r)); i <= Math.min(N - 1, Math.ceil(ci + r)); i++) for (let j = Math.max(0, Math.floor(cj - r)); j <= Math.min(N - 1, Math.ceil(cj + r)); j++) {
        if (Math.hypot(ORIGIN + (j + 0.5) * CELL - x, ORIGIN + (i + 0.5) * CELL - z) <= half) this.block[i * N + j] = 1;
      }
    }
  }
}
