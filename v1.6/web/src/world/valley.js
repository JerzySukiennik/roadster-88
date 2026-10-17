// Roadster 88 valley: builds the invented Californian valley (terrain grid in workers, Rapier heightfield tiles, LOD renderer, baked terrain light) and exposes the map API used by the game and the era system: heights, normals, surfaces, regions, roads, spawn, safe spawn, era terrain (fluids, bumps), palette and the Map app image.
import { buildDesign } from './design.js';
import { TerrainData, generateRows, N, TN, TCELL, ORIGIN, EXTENT } from './terrain.js';
import { TerrainView, DEFAULT_PALETTE } from './terrainView.js';
import { GROUP, groups } from '../sim/car.js';

const TILE = 512, TILES = (N - 1) / TILE;
const LOD = { low: 0.55, medium: 0.8, high: 1, ultra: 1.35 };
const NATURAL = new Set(['hadean', 'dino']);
const LOOP_ERAS = new Set(['2026', '2080', 'ruins', 'scifi']);
const KIND = { highway: 'highway', loop: 'road', link: 'road', street: 'street', track: 'dirt', rail: 'rail' };

export const ERA_FLUIDS = {
  hadean: [{ kind: 'lava', region: 'lake', level: -4.5 }],
  dino: [{ kind: 'water', region: 'lake', level: -2.6 }],
  1885: [{ kind: 'water', region: 'lake', level: -4.6 }],
  2026: [],
  2080: [],
  ruins: [{ kind: 'water', region: 'lake', level: -5.6 }],
  scifi: [{ kind: 'water', region: 'lake', level: -3.2 }],
};

async function generate(D, progress) {
  const T = new TerrainData(D);
  const bands = [];
  for (let iz = 0; iz < N; iz += 128) bands.push([iz, Math.min(N, iz + 128)]);
  const nw = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  let workers = [];
  try { for (let i = 0; i < nw; i++) workers.push(new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' })); } catch (e) { workers = []; }
  if (workers.length) {
    try {
      await new Promise((resolve, reject) => {
        let next = 0, done = 0;
        const feed = (w) => { if (next < bands.length) { const [iz0, iz1] = bands[next]; w.postMessage({ id: next++, iz0, iz1 }); } };
        for (const w of workers) {
          w.onmessage = (e) => { T.addRows(e.data); done++; if (progress) progress(done / bands.length); if (done === bands.length) resolve(); else feed(w); };
          w.onerror = (e) => reject(e);
          feed(w);
        }
        setTimeout(() => reject(new Error('terrain workers timed out')), 60000);
      });
    } catch (e) {
      console.warn('terrain workers failed, generating on the main thread', e);
      for (const [iz0, iz1] of bands) T.addRows(generateRows(D, iz0, iz1));
    }
    for (const w of workers) w.terminate();
  } else for (const [iz0, iz1] of bands) T.addRows(generateRows(D, iz0, iz1));
  T.finish();
  return T;
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export class Valley {
  constructor(game, D, T) {
    this.g = game; this.D = D; this.T = T;
    this.size = 4000; this.extent = EXTENT; this.origin = ORIGIN;
    this.regions = D.regions;
    this.roads = D.roads.map((r) => ({ id: r.id, name: r.name, kind: KIND[r.kind] || r.kind, type: r.kind, width: r.width, closed: r.closed, surface: r.surface, pts: r.pts.map((p) => [p[0], p[1]]), points: r.pts.map((p, k) => [p[0], r.elev[k], p[1]]) }));
    this.landmarks = D.landmarks;
    const sp = D.spawn;
    this.spawn = { pos: [sp.x, T.heightAt(sp.x, sp.z) + 0.05, sp.z], yaw: sp.yaw };
    this.era = '2026';
    this.fluids = []; this.liquids = this.fluids;
    this.tiles = [];
    this.buildColliders();
    this.view = new TerrainView(game.gfx, T, game.sky, { lodScale: LOD[game.gfx.presetName] || 1, quality: game.gfx.presetName === 'low' ? 'low' : 'high' });
    this.view.urgent = true;
    const prevPreset = game.gfx.onPreset;
    game.gfx.onPreset = (P) => { if (prevPreset) prevPreset(P); this.view.setLodScale(LOD[game.gfx.presetName] || 1); this.view.setQuality(game.gfx.presetName === 'low' ? 'low' : 'high'); };
    this.palette = DEFAULT_PALETTE;
    this.mapDirty = true;
    this._n = { x: 0, y: 1, z: 0 };
    this.initLight();
    this.setEraTerrain('2026');
  }

  buildColliders() {
    const R = this.g.R, phys = this.g.phys, H = this.T.H;
    for (const c of this.tiles) { phys.world.removeCollider(c, false); const i = phys.statics.indexOf(c); if (i >= 0) phys.statics.splice(i, 1); }
    this.tiles = [];
    const n = TILE, w = n * 2;
    for (let tz = 0; tz < TILES; tz++) for (let tx = 0; tx < TILES; tx++) {
      const hts = new Float32Array((n + 1) * (n + 1));
      for (let j = 0; j <= n; j++) { const col = j * (n + 1), gj = tx * n + j; for (let i = 0; i <= n; i++) hts[col + i] = H[(tz * n + i) * N + gj]; }
      const d = R.ColliderDesc.heightfield(n, n, hts, { x: w, y: 1, z: w }, R.HeightFieldFlags.FIX_INTERNAL_EDGES)
        .setTranslation(ORIGIN + tx * w + w / 2, 0, ORIGIN + tz * w + w / 2).setFriction(0.85).setRestitution(0.05).setCollisionGroups(groups(GROUP.STATIC, 0xffff));
      this.tiles.push(phys.addStatic(d, { kind: 'ground', tag: 'terrain' }));
    }
  }

  initLight() {
    this.lightId = 0; this.sunBusy = false; this.sunDir = null;
    try { this.lw = new Worker(new URL('./lightWorker.js', import.meta.url), { type: 'module' }); } catch (e) { this.lw = null; return; }
    this.lw.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'ao') this.view.setLight(d.ao, null);
      if (d.type === 'sun') { this.view.setLight(null, d.sun); this.sunBusy = false; }
    };
    this.lw.onerror = (e) => { console.warn('light worker failed', e.message); this.lw = null; };
    this.sendHeights();
  }

  sendHeights() {
    if (!this.lw) return;
    const h = this.T.lowRes();
    this.lw.postMessage({ heights: h, n: TN, cell: TCELL, id: ++this.lightId }, [h.buffer]);
    this.sunDir = null;
  }

  relight() {
    const L = this.g.sky && (this.g.sky.lightDir || this.g.sky.sunDir);
    if (!L || !this.lw || this.sunBusy) return;
    if (this.sunDir && this.sunDir[0] * L.x + this.sunDir[1] * L.y + this.sunDir[2] * L.z > 0.99999) return;
    this.sunBusy = true; this.sunDir = [L.x, L.y, L.z];
    this.lw.postMessage({ sun: this.sunDir });
  }

  heightAt(x, z) { return this.T.heightAt(x, z); }
  normalAt(x, z, out) { return this.T.normalAt(x, z, out); }

  fluidAt(x, z) {
    for (const l of this.fluids) {
      if (l.poly && !pointInPoly(x, z, l.poly)) continue;
      if (this.T.heightAt(x, z) < l.level) return l;
    }
    return null;
  }

  liquidAt(x, z) { return this.fluidAt(x, z); }

  sunAt(x, z) { return this.T.tex(this.view.light, x, z, 1, 2); }

  surfaceAt(x, z) {
    const T = this.T;
    if (Math.abs(x) > 2046 || Math.abs(z) > 2046) return 'rock';
    const liq = this.fluidAt(x, z);
    if (liq) return liq.kind;
    const V = this.view.U;
    if (!T.natural) {
      const main = T.tex(T.R, x, z, 0) * V.rMain.value, loop = T.tex(T.R, x, z, 1) * V.rLoop.value, town = T.tex(T.R, x, z, 3) * V.rTown.value, track = T.tex(T.R, x, z, 2) * V.rTrack.value;
      const paved = this.view.roadAmount > 0.7;
      if (Math.max(main, loop) > 0.5) return paved ? 'asphalt' : 'dirt';
      if (track > 0.5) return 'dirt';
      if (town > 0.5) return paved ? 'asphalt' : 'dirt';
    }
    const n = this.normalAt(x, z, this._n);
    if (n.y < 0.72 || (T.tex(T.S, x, z, 2) > 0.5 && n.y < 0.9)) return 'rock';
    if (T.tex(T.S, x, z, 0) > 0.5 || T.tex(T.S, x, z, 3) > 0.5) return 'sand';
    if (T.tex(T.S, x, z, 1) > 0.5) return 'dirt';
    return V.grassAmount.value > 0.62 ? 'grass' : 'dirt';
  }

  region(id) { return this.regions.find((r) => r.id === id) || null; }

  regionAt(x, z) {
    for (const r of this.regions) if (r.kind !== 'area' && pointInPoly(x, z, r.poly)) return r;
    return null;
  }

  safeSpawnAt(x, z, y = -1e9, opts = {}) {
    const R = this.g.R, world = this.g.phys.world;
    const half = opts.half || { x: 1.05, y: 0.62, z: 2.25 };
    const shape = new R.Cuboid(half.x, half.y, half.z);
    const rot = opts.rot || { x: 0, y: 0, z: 0, w: 1 };
    const notTerrain = (c) => !(c.userData && c.userData.tag === 'terrain');
    const blocked = (px, py, pz) => !!world.intersectionWithShape({ x: px, y: py + half.y + 0.05, z: pz }, rot, shape, undefined, groups(GROUP.CAR, GROUP.STATIC), undefined, opts.body, notTerrain);
    const ground = (px, pz) => {
      let h = -1e9;
      for (const [dx, dz] of [[0, 0], [half.x, half.z], [-half.x, half.z], [half.x, -half.z], [-half.x, -half.z]]) h = Math.max(h, this.T.heightAt(px + dx, pz + dz));
      const l = this.fluidAt(px, pz);
      if (l && l.kind === 'lava') h = Math.max(h, l.level + 0.5);
      return h + 0.12;
    };
    const tryAt = (px, pz) => {
      let py = Math.max(y, ground(px, pz));
      for (let k = 0; k < 12; k++) { if (!blocked(px, py, pz)) return [px, py, pz]; py += 2.5; }
      return null;
    };
    const lim = (v) => Math.max(-1990, Math.min(1990, v));
    let r = tryAt(lim(x), lim(z));
    for (let ring = 1; !r && ring < 12; ring++) for (let a = 0; a < 8 && !r; a++) { const ang = (a / 8) * Math.PI * 2; r = tryAt(lim(x + Math.cos(ang) * ring * 6), lim(z + Math.sin(ang) * ring * 6)); }
    return r || [lim(x), ground(lim(x), lim(z)) + 30, lim(z)];
  }

  setEraTerrain(eraId, d) {
    const natural = NATURAL.has(eraId);
    this.era = eraId;
    this.setFluids(d && d.fluids ? d.fluids : ERA_FLUIDS[eraId] || []);
    this.view.setRoadMode({ loop: LOOP_ERAS.has(eraId) ? 1 : 0, track: natural ? 0 : 1 });
    const t0 = performance.now();
    const changed = this.T.setEra(natural, (d && d.bumps) || []);
    if (changed) {
      this.buildColliders();
      this.view.refresh();
      this.sendHeights();
    }
    this.eraMs = performance.now() - t0;
    this.mapDirty = true;
    return changed;
  }

  setFluids(list) {
    this.fluids.length = 0;
    for (const f of list) {
      const reg = f.poly ? null : this.region(f.region || f.id || 'lake');
      this.fluids.push({ kind: f.kind, region: f.region || f.id || 'lake', level: f.level, poly: f.poly || (reg && reg.poly) || null });
    }
    this.mapDirty = true;
  }

  setLiquids(list) { this.setFluids(list); }

  setPalette(p) {
    this.palette = p || DEFAULT_PALETTE;
    this.view.setPalette(this.palette);
    this.mapDirty = true;
  }

  preStep(dt, cars) {
    const lim = 1940, hard = 2030;
    for (const c of cars) {
      const s = c.sim; if (!s.enabled) continue;
      const b = s.body, p = b.translation();
      const push = (v, lv) => { const over = Math.abs(v) - lim; if (over <= 0) return 0; const out = Math.sign(v); return -out * (over * 2.2 + Math.max(0, lv * out) * 1.6) * s.mass; };
      const lv = b.linvel(), fx = push(p.x, lv.x), fz = push(p.z, lv.z);
      if (fx || fz) b.applyImpulse({ x: fx * dt, y: 0, z: fz * dt }, true);
      if (Math.abs(p.x) > hard || Math.abs(p.z) > hard || p.y < this.T.heightAt(p.x, p.z) - 4) {
        const q = this.safeSpawnAt(Math.max(-1900, Math.min(1900, p.x)), Math.max(-1900, Math.min(1900, p.z)), -1e9, { body: b });
        b.setTranslation({ x: q[0], y: q[1] + 0.3, z: q[2] }, true);
        const v = b.linvel(); b.setLinvel({ x: v.x * 0.2, y: Math.max(0, v.y), z: v.z * 0.2 }, true);
      }
    }
  }

  update(dt, camPos, camera) {
    const cam = camera || this.g.gfx.camera;
    cam.updateMatrixWorld();
    this.view.update(cam);
    this.relight();
  }

  mapImage() {
    if (!this.mapDirty && this.mapCanvas) return this.mapCanvas;
    const S = 720, c = this.mapCanvas || document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S), T = this.T;
    const sun = [0.45, 0.72, 0.52], sl = Math.hypot(...sun);
    const n = { x: 0, y: 1, z: 0 };
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const x = ORIGIN + EXTENT * (1 - (px + 0.5) / S), z = ORIGIN + EXTENT * (1 - (py + 0.5) / S);
      const h = T.heightAt(x, z); T.normalAt(x, z, n);
      const sh = Math.max(0, (n.x * sun[0] + n.y * sun[1] + n.z * sun[2]) / sl);
      const v = 0.085 + 0.09 * Math.min(1, Math.max(0, h / 450)) + 0.13 * sh * sh;
      let r = v, gg = v * 1.01, b = v * 1.07;
      const sand = T.tex(T.S, x, z, 0), playa = T.tex(T.S, x, z, 1);
      r += sand * 0.045 + playa * 0.06; gg += sand * 0.035 + playa * 0.06; b += playa * 0.06;
      const liq = this.fluidAt(x, z);
      if (liq) { if (liq.kind === 'lava') { r = 0.6; gg = 0.17; b = 0.04; } else { r = 0.1; gg = 0.21; b = 0.33; } }
      const o = (py * S + px) * 4;
      img.data[o] = Math.min(255, r * 255); img.data[o + 1] = Math.min(255, gg * 255); img.data[o + 2] = Math.min(255, b * 255); img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const toPx = (x, z) => [(1 - (x - ORIGIN) / EXTENT) * S, (1 - (z - ORIGIN) / EXTENT) * S];
    if (!T.natural) {
      const U = this.view.U;
      for (const r of this.D.roads) {
        const vis = r.kind === 'loop' || r.kind === 'link' ? U.rLoop.value : r.kind === 'track' ? U.rTrack.value : r.kind === 'rail' ? 0 : U.rMain.value;
        if (vis < 0.3) continue;
        g.beginPath();
        r.pts.forEach((p, i) => { const [a, b] = toPx(p[0], p[1]); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
        if (r.closed) g.closePath();
        g.lineWidth = r.kind === 'highway' ? 3.4 : r.kind === 'loop' ? 2.6 : r.kind === 'track' ? 1.4 : 1.7;
        g.strokeStyle = r.kind === 'track' ? 'rgba(242,243,245,0.34)' : r.kind === 'loop' ? 'rgba(242,243,245,0.6)' : 'rgba(242,243,245,0.8)';
        g.setLineDash(r.kind === 'track' ? [4, 4] : []);
        g.stroke();
      }
      g.setLineDash([]);
    }
    g.font = '500 15px "SF Pro Display", -apple-system, "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const l of this.D.landmarks) { const [a, b] = toPx(l.x, l.z); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText(l.label, a + 1, b + 1); g.fillStyle = 'rgba(242,243,245,0.66)'; g.fillText(l.label, a, b); }
    this.mapCanvas = c; this.mapDirty = false;
    return c;
  }
}

export async function createValley(game, progress) {
  const D = buildDesign();
  const T = await generate(D, progress);
  return new Valley(game, D, T);
}
