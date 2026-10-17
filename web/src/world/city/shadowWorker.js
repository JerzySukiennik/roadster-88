// Roadster 88 city shadow worker: bakes the shadow-height map of the city (for every ground cell, the height below which a point is in the shadow of buildings or terrain toward the sun) with one sweep from the sun side, and returns it as half floats for the city materials.
let B = null, nx = 0, nz = 0, cell = 4;

function half(v) {
  const f = new Float32Array(1), i = new Int32Array(f.buffer);
  f[0] = v; const x = i[0];
  let bits = (x >> 16) & 0x8000, m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) { bits |= 0x7c00; bits |= ((e === 255) ? 0 : 1) && (x & 0x007fffff); return bits; }
  if (e < 113) { m |= 0x0800; bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1); return bits; }
  bits |= ((e - 112) << 10) | (m >> 1); bits += m & 1;
  return bits;
}

function bake(L) {
  const hl = Math.hypot(L[0], L[2]);
  const out = new Float32Array(nx * nz).fill(-1000);
  if (L[1] <= 0.02 || hl < 1e-4) return out.fill(1e4);
  const dx = L[0] / hl, dz = L[2] / hl, tanEl = L[1] / hl;
  const ax = Math.abs(dx) >= Math.abs(dz);
  const k = 1 / Math.max(Math.abs(dx), Math.abs(dz));
  const sx = dx * k, sz = dz * k, drop = k * cell * tanEl;
  const xs = sx > 0 ? -1 : 1, zs = sz > 0 ? -1 : 1;
  const x0 = xs > 0 ? 0 : nx - 1, z0 = zs > 0 ? 0 : nz - 1;
  const at = (A, x, z) => {
    if (x < 0 || z < 0 || x > nx - 1 || z > nz - 1) return -1000;
    const j = Math.min(nx - 2, Math.floor(x)), i = Math.min(nz - 2, Math.floor(z)), u = x - j, v = z - i, o = i * nx + j;
    return (A[o] * (1 - u) + A[o + 1] * u) * (1 - v) + (A[o + nx] * (1 - u) + A[o + nx + 1] * u) * v;
  };
  for (let a = 0; a < nz; a++) {
    const i = z0 + a * zs;
    for (let b = 0; b < nx; b++) {
      const j = x0 + b * xs, qx = j + sx, qz = i + sz;
      const hq = Math.max(at(B, qx, qz), at(out, qx, qz));
      out[i * nx + j] = hq - drop;
    }
  }
  void ax;
  return out;
}

self.onmessage = (e) => {
  const d = e.data;
  if (d.heights) { B = d.heights; nx = d.nx; nz = d.nz; cell = d.cell; }
  if (d.sun && B) {
    const f = bake(d.sun), h = new Uint16Array(f.length);
    for (let i = 0; i < f.length; i++) h[i] = half(Math.max(-500, Math.min(60000, f[i])));
    self.postMessage({ id: d.id, half: h, f32: d.cpu ? f : null }, d.cpu ? [h.buffer, f.buffer] : [h.buffer]);
  }
};
