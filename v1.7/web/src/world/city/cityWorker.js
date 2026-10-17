// Roadster 88 city worker: keeps a copy of the mega terrain rows under the city, rebuilds the skeleton once, then for every setCity builds the style plan, the merged building masses and street ground per 2 km tile and the building shadow-height grid off the main thread.
import { buildSkeleton, buildPlan } from './plan.js';
import { annotate, tileSink, buildMass, buildGround, shadowHeights, envArrays } from './tiles.js';

let T = null, skel = null;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function heightAt(x, z) {
  const { N, CELL, ORIGIN, H, i0, rows } = T;
  const fx = (x - ORIGIN) / CELL, fz = (z - ORIGIN) / CELL;
  let j = Math.floor(fx), i = Math.floor(fz);
  if (j < 0) j = 0; else if (j > N - 2) j = N - 2;
  if (i < 0) i = 0; else if (i > N - 2) i = N - 2;
  const u = clamp(fx - j, 0, 1), v = clamp(fz - i, 0, 1);
  let r = i - i0; if (r < 0) r = 0; else if (r > rows - 2) r = rows - 2;
  const o = r * N + j;
  const h00 = H[o], h01 = H[o + 1], h10 = H[o + N], h11 = H[o + N + 1];
  return u + v < 1 ? h00 + (h01 - h00) * u + (h10 - h00) * v : h11 + (h10 - h11) * (1 - u) + (h01 - h11) * (1 - v);
}

function bufs(o, tr) { for (const k of Object.keys(o)) if (o[k] && o[k].buffer instanceof ArrayBuffer) tr.push(o[k].buffer); }

self.onmessage = (e) => {
  const d = e.data;
  if (d.rows) {
    T = { N: d.N, CELL: d.CELL, ORIGIN: d.ORIGIN, H: d.rows, i0: d.i0, rows: d.rows.length / d.N };
    if (!skel) skel = buildSkeleton(heightAt);
    return;
  }
  if (!d.build || !T) return;
  const t0 = performance.now(), o = d.build;
  const plan = buildPlan({ heightAt, skeleton: skel, style: o.style, density: o.density, height: o.height, year: o.year });
  const sig = annotate(plan);
  const tPlan = performance.now() - t0;
  const sink = tileSink();
  buildMass(plan, sink);
  const tMass = performance.now() - t0 - tPlan;
  buildGround(plan, skel, heightAt, sink);
  const tGround = performance.now() - t0 - tPlan - tMass;
  const tiles = [], tr = [];
  for (const [k, t] of sink.per) {
    const mass = t.mass.nv ? t.mass.out() : null, ground = t.ground.nv ? t.ground.out() : null;
    if (mass) bufs(mass, tr); if (ground) bufs(ground, tr);
    tiles.push({ k, mass, ground });
  }
  let shadow = null;
  if (o.shadow) {
    const S = o.shadow, step = S.cell / T.CELL, ib = Math.round((S.z0 - T.ORIGIN) / T.CELL) - T.i0, jb = Math.round((S.x0 - T.ORIGIN) / T.CELL);
    shadow = shadowHeights(plan, S, (i, j) => T.H[(ib + i * step) * T.N + jb + j * step]);
    tr.push(shadow.buffer);
  }
  const env = envArrays(plan);
  if (env) tr.push(env.position.buffer, env.normal.buffer, env.color.buffer);
  self.postMessage({ id: d.id, key: o.key, sig, tiles, shadow, env, ms: { plan: Math.round(tPlan), mass: Math.round(tMass), ground: Math.round(tGround), all: Math.round(performance.now() - t0) } }, tr);
};
