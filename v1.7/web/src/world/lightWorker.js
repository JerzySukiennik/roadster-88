// Roadster 88 terrain light worker: bakes horizon ambient occlusion and soft terrain sun shadows from the 4 m height grid off the main thread.
let H = null, N = 0, cell = 4;

function sample(x, z) {
  if (x < 0) x = 0; else if (x > N - 1.001) x = N - 1.001;
  if (z < 0) z = 0; else if (z > N - 1.001) z = N - 1.001;
  const j = x | 0, i = z | 0, u = x - j, v = z - i, o = i * N + j;
  return (H[o] * (1 - u) + H[o + 1] * u) * (1 - v) + (H[o + N] * (1 - u) + H[o + N + 1] * u) * v;
}

function bakeAO() {
  const out = new Uint8Array(N * N);
  const dirs = [];
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; dirs.push([Math.cos(a), Math.sin(a)]); }
  const steps = [6, 12, 20, 32, 48, 72, 104, 150, 220, 320];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const h0 = H[i * N + j] + 0.6;
    let occ = 0;
    for (const [dx, dz] of dirs) {
      let best = 0;
      for (const d of steps) { const s = (sample(j + dx * d / cell, i + dz * d / cell) - h0) / d; if (s > best) best = s; }
      occ += best / Math.sqrt(1 + best * best);
    }
    const ao = 1 - occ / 8;
    out[i * N + j] = Math.max(0, Math.min(255, Math.round(ao * ao * 255)));
  }
  return out;
}

function bakeSun(dir) {
  const out = new Uint8Array(N * N);
  const hl = Math.hypot(dir[0], dir[2]);
  if (dir[1] <= 0.01 || hl < 1e-4) { out.fill(dir[1] > 0.01 ? 255 : 0); return out; }
  const dx = dir[0] / hl, dz = dir[2] / hl, tanEl = dir[1] / hl;
  const steps = [5, 10, 17, 26, 38, 55, 78, 110, 155, 215, 300, 420, 590, 820, 1150, 1600];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const h0 = H[i * N + j] + 0.8;
    let vis = 1;
    for (const d of steps) {
      const th = sample(j + dx * d / cell, i + dz * d / cell), ray = h0 + d * tanEl;
      const v = 1 - (th - ray) / (2 + d * 0.035);
      if (v < vis) { vis = v; if (vis <= 0) { vis = 0; break; } }
    }
    out[i * N + j] = Math.round(Math.max(0, Math.min(1, vis)) * 255);
  }
  return out;
}

self.onmessage = (e) => {
  const d = e.data;
  if (d.heights) { H = d.heights; N = d.n; cell = d.cell; const ao = bakeAO(); self.postMessage({ type: 'ao', id: d.id, ao }, [ao.buffer]); }
  if (d.sun && H) { const sun = bakeSun(d.sun); self.postMessage({ type: 'sun', id: d.id, sun, dir: d.sun }, [sun.buffer]); }
};
