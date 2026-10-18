// Roadster 88 valley: builds the 16 x 16 km mega map (the original 2 m valley grid in the middle and the 4 m mega grid around it, both generated in workers), Rapier heightfield tiles (fixed for the valley, streamed around cars for the rest), the LOD terrain renderers, baked terrain light, open water and Gzowo City, and exposes the map API used by the game and the era system: heights, normals, surfaces, regions, roads, bounds, spawn, safe spawn, era terrain (fluids, bumps, natural ground), palette, city style and the Map app image.
import { buildDesign } from './design.js';
import { TerrainData, generateRows, N, TN, TCELL, ORIGIN, EXTENT } from './terrain.js';
import { TerrainView, DEFAULT_PALETTE } from './terrainView.js';
import { buildMega, MEGA, INNER_HALF } from './mega.js';
import { OuterData } from './outer.js';
import { Water } from './water.js';
import { GROUP, groups } from '../sim/car.js';
import * as THREE from 'three/webgpu';
import { uniformArray } from 'three/tsl';
import { TUNNEL, PONDS } from './city/layout.js';
import { EarthWorld, haversine, EARTH_HALF, earthOrigin } from './earth/earth.js';
import { nearestLandLL } from './earth/data.js';

export const VALLEY_LL = { lat: 35.1, lon: -117.9 };

const TILE = 512, TILES = (N - 1) / TILE;
const OT = 128, OTN = (MEGA.N - 1) / OT, OTW = OT * MEGA.CELL;
const LOD = { low: 0.55, medium: 0.8, high: 1, ultra: 1.35 };
const NATURAL = new Set(['hadean', 'dino', 'archean', 'protero', 'snowball', 'cambrian', 'devonian', 'carbon', 'permian', 'triassic', 'jurassic', 'paleo', 'miocene', 'iceage', 'native', 'glacial', 'distant', 'pangaea', 'dying']);
const NO_LOOP = new Set(['1849', '1885', '1900', '1920', '1940', 'mission']);
const KIND = { highway: 'highway', loop: 'road', link: 'road', street: 'street', track: 'dirt', rail: 'rail' };
const CITY_DEFAULT = { 1849: ['frontier', 0.15, 10], 1885: ['frontier', 0.3, 14], 1900: ['early', 0.5, 120], 1920: ['early', 0.75, 260], 1940: ['early', 0.85, 320], 1950: ['mid', 0.85, 330], 1970: ['mid', 0.9, 420], 1990: ['mid', 0.95, 440], 2000: ['modern', 0.97, 440], 2026: ['modern', 1, 460], 2050: ['future', 1, 620], 2080: ['future', 1, 820], 2150: ['future', 1, 1000], 2300: ['scifi', 0.8, 1200], ruins: ['ruins', 0.85, 380], 3000: ['ruins', 0.55, 260], scifi: ['scifi', 0.7, 1400] };

export const ERA_FLUIDS = {
  hadean: [{ kind: 'lava', region: 'lake', level: -4.5 }],
  dino: [{ kind: 'water', region: 'lake', level: -2.6 }],
  1885: [{ kind: 'water', region: 'lake', level: -4.6 }],
  2026: [],
  2080: [],
  ruins: [{ kind: 'water', region: 'lake', level: -5.6 }],
  scifi: [{ kind: 'water', region: 'lake', level: -3.2 }],
};

function pool(url, bands, onRows, progress, fallback) {
  const nw = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  let workers = [];
  try { for (let i = 0; i < nw; i++) workers.push(new Worker(url, { type: 'module' })); } catch (e) { workers = []; }
  if (!workers.length) { for (const [iz0, iz1] of bands) onRows(fallback(iz0, iz1)); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    let next = 0, done = 0;
    const feed = (w) => { if (next < bands.length) { const [iz0, iz1] = bands[next]; w.postMessage({ id: next++, iz0, iz1 }); } };
    for (const w of workers) {
      w.onmessage = (e) => { onRows(e.data); done++; if (progress) progress(done / bands.length); if (done === bands.length) { for (const x of workers) x.terminate(); resolve(); } else feed(w); };
      w.onerror = (e) => { for (const x of workers) x.terminate(); reject(e); };
      feed(w);
    }
    setTimeout(() => reject(new Error('terrain workers timed out')), 90000);
  }).catch((e) => { console.warn('terrain workers failed, generating on the main thread', e); for (const [iz0, iz1] of bands) onRows(fallback(iz0, iz1)); });
}

async function generate(D, progress) {
  const T = new TerrainData(D);
  const bands = [];
  for (let iz = 0; iz < N; iz += 128) bands.push([iz, Math.min(N, iz + 128)]);
  await pool(new URL('./terrainWorker.js', import.meta.url), bands, (r) => T.addRows(r), progress, (a, b) => generateRows(D, a, b));
  T.seamEdges = ['z0', 'z1', 'x0', 'x1'];
  T.finish();
  return T;
}

async function generateOuter(D, M, T, progress) {
  const O = new OuterData(D, M, T);
  const bands = [];
  for (let iz = 0; iz < MEGA.N; iz += 128) bands.push([iz, Math.min(MEGA.N, iz + 128)]);
  const { generateOuterRows } = await import('./outer.js');
  await pool(new URL('./outerWorker.js', import.meta.url), bands, (r) => O.addRows(r), progress, (a, b) => generateOuterRows(D, a, b));
  O.fillInner(T);
  O.finish();
  O.innerHeights(T);
  O.afterEra = () => O.innerHeights(T);
  return O;
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const roadOut = (r) => ({ id: r.id, name: r.name, kind: KIND[r.kind] || r.kind, type: r.kind, width: r.width, closed: r.closed, surface: r.surface, pts: r.pts.map((p) => [p[0], p[1]]), points: r.pts.map((p, k) => [p[0], r.elev[k], p[1]]) });

export class Valley {
  constructor(game, D, T, M, O) {
    this.g = game; this.D = D; this.T = T; this.M = M; this.O = O;
    this.size = MEGA.EXTENT; this.extent = MEGA.EXTENT; this.origin = MEGA.ORIGIN;
    this.bounds = { x0: -MEGA.HALF, z0: -MEGA.HALF, x1: MEGA.HALF, z1: MEGA.HALF };
    this.limit = MEGA.LIMIT;
    this.sizeLabel = '16 × 16 km';
    this.inner = { x0: -INNER_HALF, z0: -INNER_HALF, x1: INNER_HALF, z1: INNER_HALF };
    T.outside = (x, z) => O.heightAt(x, z);
    this.regions = D.regions.concat(M.regions);
    this.baseRoads = D.roads.map(roadOut).concat(M.roads.map(roadOut));
    this.roads = this.baseRoads.slice();
    this.landmarks = D.landmarks.concat(M.landmarks);
    const sp = D.spawn;
    this.spawn = { pos: [sp.x, T.heightAt(sp.x, sp.z) + 0.05, sp.z], yaw: sp.yaw };
    this.era = '2026';
    this.fluids = []; this.liquids = this.fluids;
    this.tiles = []; this.otiles = new Map(); this.tileQueue = [];
    this.buildColliders();
    const P = game.gfx.presetName;
    this.view = new TerrainView(game.gfx, T, game.sky, { lodScale: LOD[P] || 1, quality: P === 'low' ? 'low' : 'high', farRing: false, proxy: false, name: 'Valley', chunk: 128 });
    this.view.urgent = true;
    this.oview = new TerrainView(game.gfx, O, game.sky, { lodScale: LOD[P] || 1, quality: P === 'low' ? 'low' : 'high', U: this.view.U, noise: this.view.noise, exclude: [this.inner.x0, this.inner.z0, this.inner.x1, this.inner.z1], rangeBase: 280, chunk: 128, lightF: 4, farOut: 17000, roads: M.roads, name: 'Mega', waterCut: true, cuts: this.makeCuts() });
    this.oview.urgent = true;
    this.views = [this.view, this.oview];
    const prevPreset = game.gfx.onPreset;
    game.gfx.onPreset = (Pr) => { if (prevPreset) prevPreset(Pr); for (const v of this.views) { v.setLodScale(LOD[game.gfx.presetName] || 1); v.setQuality(game.gfx.presetName === 'low' ? 'low' : 'high'); } };
    this.water = new Water(game.gfx, O, this.view.noise);
    this.ponds = PONDS.filter((p) => p.level !== undefined);
    this.water.setPonds(this.ponds);
    this.palette = DEFAULT_PALETTE;
    this.mapDirty = true;
    this._n = { x: 0, y: 1, z: 0 };
    this.initLight();
    this.city = null; this.cityOpts = null; this.cityExplicit = false;
    this.setEraTerrain('2026');
    this.farShim(game);
    this.location = { lat: VALLEY_LL.lat, lon: VALLEY_LL.lon, mode: 'valley', tileKey: 'valley' };
    this.inEarth = false; this.earth = null; this.listeners = [];
    this.valleyState = { bounds: this.bounds, sizeLabel: this.sizeLabel, extent: this.extent, origin: this.origin, spawn: this.spawn, regions: this.regions.slice(), landmarks: this.landmarks.slice(), limit: this.limit };
  }

  onLocation(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }

  async initEarth() {
    if (this.earth || new URLSearchParams(location.search).has('noearth')) return;
    try {
      const E = new EarthWorld(this.g, this, this.view.U, this.view.noise);
      E.palSnow = (this.palette && this.palette.snow) || null;
      const P = await E.load(VALLEY_LL.lat, VALLEY_LL.lon, { valleyFrame: true });
      this.earth = E;
      this.E0 = P.E0;
      const O = this.O, NN = O.N, edge = new Float32Array(NN * 4);
      for (let k = 0; k < NN; k++) { edge[k] = O.H[k * NN]; edge[NN + k] = O.H[k * NN + NN - 1]; edge[2 * NN + k] = O.H[k]; edge[3 * NN + k] = O.H[(NN - 1) * NN + k]; }
      E.terrain.setEdge(edge, NN);
      this.backdropPatch = P;
      await E.terrain.precompile(this.g.gfx.renderer, this.g.gfx.camera, this.g.gfx.scene, [E.water.root]);
      if (!this.inEarth) {
        E.setPatch(P, 'backdrop'); E.show(true); if (this.oview.far) this.oview.far.visible = false;
        E.water.root.visible = true;
        for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(() => r()));
        if (!this.inEarth) E.water.root.visible = false;
      }
    } catch (e) { console.warn('earth backdrop failed', e); }
  }

  async setLocation(lat, lon, opts = {}) {
    const d = haversine(lat, lon, VALLEY_LL.lat, VALLEY_LL.lon);
    if (d < (opts.valleyRadius || 9000)) { this.leaveEarth(); return { mode: 'valley', lat: VALLEY_LL.lat, lon: VALLEY_LL.lon, spawn: this.spawn }; }
    if (!this.earth) await this.initEarth();
    if (!this.earth) throw new Error('earth data unavailable');
    const t0 = performance.now(), o = earthOrigin(lat, lon);
    const E = this.earth, same = this.inEarth && E.P && E.P.lat0 === o.lat && E.P.lon0 === o.lon;
    const P = same ? E.P : await E.load(o.lat, o.lon, { yOff: 0 });
    const tLoad = performance.now() - t0;
    this.enterEarth(P, lat, lon);
    const tEnter = performance.now() - t0 - tLoad;
    return { mode: 'earth', lat, lon, origin: this.location.origin, spawn: this.spawn, climate: this.earth.climate, ms: { load: Math.round(tLoad), enter: Math.round(tEnter) } };
  }

  enterEarth(P, lat, lon) {
    const E = this.earth, wasEarth = this.inEarth;
    if (!wasEarth) {
      for (const v of this.views) { v.root.visible = false; if (v.proxy) v.proxy.visible = false; }
      this.water.root.visible = false;
      for (const c of this.tiles) { this.g.phys.world.removeCollider(c, false); const i = this.g.phys.statics.indexOf(c); if (i >= 0) this.g.phys.statics.splice(i, 1); }
      this.tiles = [];
      for (const k of [...this.otiles.keys()]) this.dropTile(k);
      if (this.lid) { this.g.phys.world.removeCollider(this.lid, false); const i = this.g.phys.statics.indexOf(this.lid); if (i >= 0) this.g.phys.statics.splice(i, 1); this.lid = null; this.tunnelOn = null; }
      if (this.city) this.city.suspend(true);
    }
    this.inEarth = true;
    if (E.P !== P || E.mode !== 'earth') E.setPatch(P, 'earth');
    E.show(true);
    const [lx, lz] = P.local(lat, lon);
    E.setClimateAt(lat, lon, lx, lz);
    const land = E.nearestLand(lx, lz) || [lx, lz];
    if (this.g.space && this.g.space.active) E.dropAll(); else E.ensureGround(land[0], land[1], 160);
    const H = EARTH_HALF;
    this.bounds = { x0: -H, z0: -H, x1: H, z1: H }; this.limit = H - 1500;
    this.extent = 2 * H; this.origin = -H; this.sizeLabel = `${Math.round(2 * H / 1000)} × ${Math.round(2 * H / 1000)} km`;
    this.regions.length = 0; for (const r of E.regions()) this.regions.push(r);
    this.roads.length = 0; this.landmarks.length = 0; this.signals = [];
    const y = E.heightAt(land[0], land[1]);
    const dx = land[0] - lx, dz = land[1] - lz;
    this.spawn = { pos: [land[0], y + 0.05, land[1]], yaw: Math.hypot(dx, dz) > 30 ? Math.atan2(dx, dz) : 0 };
    this.location = { lat, lon, mode: 'earth', origin: { lat: P.lat0, lon: P.lon0 }, tileKey: `${Math.floor(lat / 10) * 10}_${Math.floor(lon / 10) * 10}`, climate: E.climate };
    this.mapDirty = true;
    for (const f of this.listeners) { try { f(this.location); } catch (e) { console.warn(e); } }
  }

  leaveEarth() {
    if (!this.inEarth) return;
    this.inEarth = false;
    const E = this.earth, S = this.valleyState;
    E.dropAll();
    E.water.root.visible = false;
    if (this.backdropPatch) { E.setPatch(this.backdropPatch, 'backdrop'); E.show(true); } else E.show(false);
    for (const v of this.views) { v.root.visible = true; if (v.proxy) v.proxy.visible = true; }
    this.water.root.visible = true;
    this.buildColliders();
    const tun = this.tunnelOn; this.tunnelOn = null; if (tun !== null && tun !== undefined) this.setTunnel(tun); else this.reloadTiles();
    if (this.city) this.city.suspend(false);
    this.bounds = S.bounds; this.limit = S.limit; this.extent = S.extent; this.origin = S.origin; this.sizeLabel = S.sizeLabel; this.spawn = S.spawn;
    this.regions.length = 0; for (const r of S.regions) this.regions.push(r);
    this.landmarks.length = 0; for (const l of S.landmarks) this.landmarks.push(l);
    this.refreshRoads();
    this.location = { lat: VALLEY_LL.lat, lon: VALLEY_LL.lon, mode: 'valley', tileKey: 'valley' };
    this.mapDirty = true;
    for (const f of this.listeners) { try { f(this.location); } catch (e) { console.warn(e); } }
  }

  async prefetchLocation(lat, lon) {
    if (haversine(lat, lon, VALLEY_LL.lat, VALLEY_LL.lon) < 9000) return true;
    if (!this.earth) await this.initEarth();
    if (!this.earth) return false;
    const o = earthOrigin(lat, lon);
    await this.earth.prefetch(o.lat, o.lon);
    return true;
  }

  async nearestLand(lat, lon, maxKm = 900) {
    if (!this.earth) await this.initEarth();
    return nearestLandLL(lat, lon, maxKm);
  }

  makeCuts() {
    const T = TUNNEL, h = T.width / 2 + 1.5;
    const list = [{ x0: T.x0 + 1, x1: T.portal0, z: T.z, half: h }, { x0: T.portal1, x1: T.x1 - 1, z: T.z, half: h }];
    const a = list.map((c) => new THREE.Vector4(c.x0, c.z, 1, 0)), b = list.map((c) => new THREE.Vector4(c.x1 - c.x0, c.half, -1000, 0));
    this.cutsB = b;
    return { count: list.length, a: uniformArray(a, 'vec4'), b: this.cutsU = uniformArray(b, 'vec4') };
  }

  setTunnel(on) {
    on = !!on;
    if (on === this.tunnelOn) return;
    this.tunnelOn = on;
    for (const v of this.cutsB) v.z = on ? 1000 : -1000;
    if (this.cutsU) this.cutsU.needsUpdate = true;
    const O = this.O, T = TUNNEL, NN = O.N, half = T.width / 2;
    if (on) {
      this.holes = new Uint8Array(NN * NN);
      const i0 = Math.floor((T.z - half - 4 - O.ORIGIN) / O.CELL), i1 = Math.ceil((T.z + half + 4 - O.ORIGIN) / O.CELL);
      const j0 = Math.floor((T.x0 - 2 - O.ORIGIN) / O.CELL), j1 = Math.ceil((T.x1 + 2 - O.ORIGIN) / O.CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.holes[i * NN + j] = 1;
      const V = [], I = [], vid = new Map();
      const vert = (i, j) => { const k = i * NN + j; let v = vid.get(k); if (v === undefined) { v = V.length / 3; V.push(O.ORIGIN + j * O.CELL, O.H[k], O.ORIGIN + i * O.CELL); vid.set(k, v); } return v; };
      for (let i = i0 - 1; i <= i1; i++) for (let j = j0 - 1; j <= j1; j++) {
        const x = O.ORIGIN + (j + 0.5) * O.CELL, z = O.ORIGIN + (i + 0.5) * O.CELL;
        if (Math.abs(z - T.z) < half + 1.2 && ((x > T.x0 + 2 && x < T.portal0) || (x > T.portal1 && x < T.x1 - 2))) continue;
        const a = vert(i, j), b = vert(i, j + 1), c = vert(i + 1, j), d = vert(i + 1, j + 1);
        I.push(a, c, b, b, c, d);
      }
      const R = this.g.R;
      this.lid = this.g.phys.addStatic(R.ColliderDesc.trimesh(new Float32Array(V), new Uint32Array(I), R.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(0.85).setCollisionGroups(groups(GROUP.STATIC, 0xffff)), { kind: 'ground', tag: 'terrain' });
    } else {
      this.holes = null;
      if (this.lid) { this.g.phys.world.removeCollider(this.lid, false); const i = this.g.phys.statics.indexOf(this.lid); if (i >= 0) this.g.phys.statics.splice(i, 1); this.lid = null; }
    }
    this.reloadTiles();
  }

  farShim(game) {
    const cam = game.gfx.camera, far = 26000;
    if (cam.far < far) { cam.far = far; cam.updateProjectionMatrix(); if (game.gfx.u && game.gfx.u.far) game.gfx.u.far.value = far; }
    const sky = game.sky;
    this.skyMeshes = sky ? [sky.sky].filter(Boolean) : [];
    for (const m of this.skyMeshes) { m.renderOrder = -10; }
    if (sky && sky.captureEnv && !sky.captureEnv.shim) {
      const cap = sky.captureEnv.bind(sky);
      sky.captureEnv = (a) => { if (sky.fogSky) sky.fogSky.position.set(a.x, 0, a.z); if (sky.envSky) sky.envSky.position.set(a.x, 0, a.z); return cap(a); };
      sky.captureEnv.shim = true;
    }
  }

  async attachCity() {
    try {
      const { City } = await import('./city/city.js');
      this.city = new City(this.g, this);
      await this.city.init();
      const st = this.cityOpts || this.defaultCity(this.era);
      await this.city.setCity(st);
      this.refreshRoads();
    } catch (e) { console.error('city failed', e); this.city = null; }
  }

  refreshRoads() {
    const cr = this.city ? this.city.roadsOut() : [];
    this.roads.length = 0;
    for (const r of this.baseRoads) this.roads.push(r);
    for (const r of cr) this.roads.push(r);
    this.signals = this.city ? this.city.signals : [];
    this.mapDirty = true;
  }

  defaultCity(eraId) {
    const d = CITY_DEFAULT[eraId];
    if (!d) return { style: 'none', density: 0, height: 0 };
    return { style: d[0], density: d[1], height: d[2] };
  }

  setCity(opts = {}) {
    this.cityExplicit = true;
    this.cityOpts = { ...opts };
    if (!this.city || this.inEarth) return Promise.resolve(false);
    return this.city.setCity(this.cityOpts).then((r) => { this.refreshRoads(); return r; });
  }

  signalState(id, axis) { return this.city ? this.city.signalState(id, axis) : 'green'; }

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
    for (const k of [...this.otiles.keys()]) this.dropTile(k);
  }

  innerTile(tx, tz) { const x0 = MEGA.ORIGIN + tx * OTW, z0 = MEGA.ORIGIN + tz * OTW; return x0 >= this.inner.x0 && x0 + OTW <= this.inner.x1 && z0 >= this.inner.z0 && z0 + OTW <= this.inner.z1; }

  makeTile(tx, tz) {
    const R = this.g.R, phys = this.g.phys, O = this.O, H = O.H, NN = O.N, n = OT, w = OTW;
    const hts = new Float32Array((n + 1) * (n + 1));
    const hole = this.holes ? this.holes : null;
    for (let j = 0; j <= n; j++) { const col = j * (n + 1), gj = tx * n + j; for (let i = 0; i <= n; i++) { const o = (tz * n + i) * NN + gj; hts[col + i] = hole && hole[o] ? -120 : H[o]; } }
    const d = R.ColliderDesc.heightfield(n, n, hts, { x: w, y: 1, z: w }, R.HeightFieldFlags.FIX_INTERNAL_EDGES)
      .setTranslation(MEGA.ORIGIN + tx * w + w / 2, 0, MEGA.ORIGIN + tz * w + w / 2).setFriction(0.85).setRestitution(0.05).setCollisionGroups(groups(GROUP.STATIC, 0xffff));
    return phys.addStatic(d, { kind: 'ground', tag: 'terrain' });
  }

  dropTile(k) {
    const c = this.otiles.get(k); if (!c) return;
    const phys = this.g.phys; phys.world.removeCollider(c, false);
    const i = phys.statics.indexOf(c); if (i >= 0) phys.statics.splice(i, 1);
    this.otiles.delete(k);
  }

  anchors() {
    const g = this.g, out = this._anc || (this._anc = []);
    out.length = 0;
    if (g.cars) for (const c of g.cars) { const p = c.sim.pos; out.push(p.x, p.z); }
    if (g.walker && g.walker.active && g.walker.pos) out.push(g.walker.pos.x, g.walker.pos.z);
    return out;
  }

  streamTiles(force) {
    if (this.inEarth) return;
    const A = this.anchors(), need = new Map(), r = force ? 1100 : 1000, keep = 1700;
    for (let a = 0; a < A.length; a += 2) {
      const x = A[a], z = A[a + 1];
      const tx0 = Math.max(0, Math.floor((x - r - MEGA.ORIGIN) / OTW)), tx1 = Math.min(OTN - 1, Math.floor((x + r - MEGA.ORIGIN) / OTW));
      const tz0 = Math.max(0, Math.floor((z - r - MEGA.ORIGIN) / OTW)), tz1 = Math.min(OTN - 1, Math.floor((z + r - MEGA.ORIGIN) / OTW));
      for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
        if (this.innerTile(tx, tz)) continue;
        const cx = MEGA.ORIGIN + (tx + 0.5) * OTW, cz = MEGA.ORIGIN + (tz + 0.5) * OTW, d = Math.hypot(cx - x, cz - z);
        const k = tz * OTN + tx; if (!need.has(k) || need.get(k) > d) need.set(k, d);
      }
    }
    const missing = [...need.entries()].filter(([k]) => !this.otiles.has(k)).sort((a, b) => a[1] - b[1]);
    const budget = force ? 999 : 2;
    for (let i = 0; i < missing.length && i < budget; i++) { const k = missing[i][0]; this.otiles.set(k, this.makeTile(k % OTN, Math.floor(k / OTN))); }
    if ((this.frame = (this.frame || 0) + 1) % 30 === 0) {
      for (const k of [...this.otiles.keys()]) {
        if (need.has(k)) continue;
        const tx = k % OTN, tz = Math.floor(k / OTN), cx = MEGA.ORIGIN + (tx + 0.5) * OTW, cz = MEGA.ORIGIN + (tz + 0.5) * OTW;
        let far = true;
        for (let a = 0; a < A.length; a += 2) if (Math.hypot(cx - A[a], cz - A[a + 1]) < keep) { far = false; break; }
        if (far) this.dropTile(k);
      }
    }
  }

  reloadTiles() { for (const k of [...this.otiles.keys()]) this.dropTile(k); this.streamTiles(true); }

  ensureGround(x, z) {
    if (this.inEarth) { this.earth.ensureGround(x, z); return; }
    if (Math.abs(x) <= INNER_HALF && Math.abs(z) <= INNER_HALF) return;
    const tx = Math.floor((x - MEGA.ORIGIN) / OTW), tz = Math.floor((z - MEGA.ORIGIN) / OTW);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const a = tx + dx, b = tz + dz; if (a < 0 || b < 0 || a >= OTN || b >= OTN || this.innerTile(a, b)) continue;
      const k = b * OTN + a; if (!this.otiles.has(k)) this.otiles.set(k, this.makeTile(a, b));
    }
    if (this.city) this.city.ensure(x, z);
  }

  initLight() {
    this.lights = [];
    for (const [v, T, f] of [[this.view, this.T, 2], [this.oview, this.O, 4]]) {
      const L = { v, T, f, busy: false, dir: null, w: null };
      try { L.w = new Worker(new URL('./lightWorker.js', import.meta.url), { type: 'module' }); } catch (e) { L.w = null; }
      if (L.w) {
        L.w.onmessage = (e) => { const d = e.data; if (d.type === 'ao') v.setLight(d.ao, null); if (d.type === 'sun') { v.setLight(null, d.sun); L.busy = false; } };
        L.w.onerror = (e) => { console.warn('light worker failed', e.message); L.w = null; };
      }
      this.lights.push(L);
    }
    this.sendHeights();
  }

  sendHeights() {
    for (const L of this.lights) {
      if (!L.w) continue;
      const h = L.T.lowRes(L.f), n = (L.T.N - 1) / L.f + 1;
      L.w.postMessage({ heights: h, n, cell: L.T.CELL * L.f, id: 1 }, [h.buffer]);
      L.dir = null;
    }
  }

  relight() {
    const Ld = this.g.sky && (this.g.sky.lightDir || this.g.sky.sunDir);
    if (!Ld) return;
    for (const L of this.lights) {
      if (!L.w || L.busy) continue;
      if (L.dir && L.dir[0] * Ld.x + L.dir[1] * Ld.y + L.dir[2] * Ld.z > 0.99999) continue;
      L.busy = true; L.dir = [Ld.x, Ld.y, Ld.z];
      L.w.postMessage({ sun: L.dir });
    }
  }

  isInner(x, z) { return x >= -INNER_HALF && x <= INNER_HALF && z >= -INNER_HALF && z <= INNER_HALF; }

  heightAt(x, z) { if (this.inEarth) return this.earth.heightAt(x, z); return this.isInner(x, z) ? this.T.hAt(x, z) : this.O.heightAt(x, z); }

  normalAt(x, z, out) {
    if (this.inEarth) return this.earth.normalAt(x, z, out);
    const e = this.isInner(x, z) ? 2 : 4;
    const nx = this.heightAt(x - e, z) - this.heightAt(x + e, z), nz = this.heightAt(x, z - e) - this.heightAt(x, z + e), ny = 2 * e;
    const l = Math.hypot(nx, ny, nz);
    out = out || { x: 0, y: 1, z: 0 };
    out.x = nx / l; out.y = ny / l; out.z = nz / l;
    return out;
  }

  fluidAt(x, z) {
    if (this.inEarth) return this.earth.fluidAt(x, z);
    for (const l of this.fluids) {
      if (l.poly && !pointInPoly(x, z, l.poly)) continue;
      if (this.heightAt(x, z) < l.level) return l;
    }
    return null;
  }

  liquidAt(x, z) { return this.fluidAt(x, z); }

  waterSurface(x, z, y) {
    const l = this.fluidAt(x, z);
    if (l) return l;
    if (this.inEarth || (y !== undefined && this.inTunnel(x, z, y))) return null;
    for (const P of this.ponds) if (Math.hypot((x - P.x) / P.rx, (z - P.z) / P.rz) < 1.05 && this.O.hAt(x, z) < P.level) return P.surface || (P.surface = { id: P.id, kind: 'water', level: P.level });
    if (!this.isInner(x, z) && this.O.waterAt(x, z)) return this._sea || (this._sea = { id: 'sea', kind: 'water', level: 0 });
    return null;
  }

  sunAt(x, z, y) {
    if (this.inEarth) return 1;
    const t = this.terrainSun(x, z);
    return this.city && y !== undefined ? Math.min(t, this.city.shadowAt(x, z, y)) : t;
  }

  terrainSun(x, z) { const inner = this.isInner(x, z), G = inner ? this.T : this.O, v = inner ? this.view : this.oview; const f = v.lightF; const fx = Math.max(0, Math.min(v.lightN - 1.001, (x - G.ORIGIN) / v.lightCell)), fz = Math.max(0, Math.min(v.lightN - 1.001, (z - G.ORIGIN) / v.lightCell)); const j = Math.floor(fx), i = Math.floor(fz); return v.light[(i * v.lightN + j) * 2 + 1] / 255 * (f ? 1 : 1); }

  surfaceAt(x, z, y) {
    if (this.inEarth) return this.earth.surfaceAt(x, z);
    if (Math.abs(x) > MEGA.HALF - 2 || Math.abs(z) > MEGA.HALF - 2) return 'rock';
    const liq = this.fluidAt(x, z);
    if (liq) return liq.kind;
    if (this.city) { const s = this.city.surfaceAt(x, z, y); if (s) return s; }
    const inner = this.isInner(x, z), T = inner ? this.T : this.O;
    if (!inner && this.O.waterAt(x, z)) return 'water';
    for (const P of this.ponds) if (Math.hypot((x - P.x) / P.rx, (z - P.z) / P.rz) < 1.05 && this.O.hAt(x, z) < P.level) return 'water';
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

  inTunnel(x, z, y) { return this.city && !this.inEarth ? this.city.inTunnel(x, z, y) : false; }

  safeSpawnAt(x, z, y = -1e9, opts = {}) {
    const R = this.g.R, world = this.g.phys.world;
    const half = opts.half || { x: 1.05, y: 0.62, z: 2.25 };
    const shape = new R.Cuboid(half.x, half.y, half.z);
    const rot = opts.rot || { x: 0, y: 0, z: 0, w: 1 };
    const notTerrain = (c) => !(c.userData && c.userData.tag === 'terrain');
    const blocked = (px, py, pz) => !!world.intersectionWithShape({ x: px, y: py + half.y + 0.05, z: pz }, rot, shape, undefined, groups(GROUP.CAR, GROUP.STATIC), undefined, opts.body, notTerrain);
    const ground = (px, pz) => {
      let h = -1e9;
      for (const [dx, dz] of [[0, 0], [half.x, half.z], [-half.x, half.z], [half.x, -half.z], [-half.x, -half.z]]) h = Math.max(h, this.heightAt(px + dx, pz + dz));
      const l = this.fluidAt(px, pz);
      if (l && l.kind === 'lava') h = Math.max(h, l.level + 0.5);
      if (this.city && !this.inEarth) { const d = this.city.deckAt(px, pz, y); if (d !== null && d > h - 0.5 && (y < -1e8 || d <= y + 3)) h = Math.max(h, d); }
      return h + 0.12;
    };
    const tryAt = (px, pz) => {
      this.ensureGround(px, pz);
      let py = Math.max(y, ground(px, pz));
      for (let k = 0; k < 12; k++) { if (!blocked(px, py, pz)) return [px, py, pz]; py += 2.5; }
      return null;
    };
    const L = this.inEarth ? EARTH_HALF - 200 : MEGA.LIMIT - 10, lim = (v) => Math.max(-L, Math.min(L, v));
    let r = tryAt(lim(x), lim(z));
    for (let ring = 1; !r && ring < 12; ring++) for (let a = 0; a < 8 && !r; a++) { const ang = (a / 8) * Math.PI * 2; r = tryAt(lim(x + Math.cos(ang) * ring * 6), lim(z + Math.sin(ang) * ring * 6)); }
    return r || [lim(x), ground(lim(x), lim(z)) + 30, lim(z)];
  }

  shoreSpawn(x, z, body) {
    if (this.inEarth) { const q = this.earth.nearestLand(x, z) || [this.spawn.pos[0], this.spawn.pos[2]]; return this.safeSpawnAt(q[0], q[1], -1e9, { body }); }
    for (let r = 20; r < 1200; r += 20) for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2, px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
      if (this.heightAt(px, pz) < 1.2) continue;
      const s = this.city ? this.city.surfaceAt(px, pz) : null;
      if (s === 'asphalt' || r > 300) return this.safeSpawnAt(px, pz, -1e9, { body });
    }
    return this.safeSpawnAt(this.spawn.pos[0], this.spawn.pos[2], -1e9, { body });
  }

  eraFlags(eraId, d) {
    const natural = d && typeof d.natural === 'boolean' ? d.natural : NATURAL.has(eraId);
    const loop = d && typeof d.loop === 'boolean' ? d.loop : !natural && !NO_LOOP.has(eraId);
    const tracks = d && typeof d.tracks === 'boolean' ? d.tracks : !natural;
    return { natural, loop, tracks };
  }

  setEraTerrain(eraId, d) {
    if (this.inEarth) { this.era = eraId; this.pendingEra = [eraId, d]; this.mapDirty = true; return false; }
    const { natural, loop, tracks } = this.eraFlags(eraId, d);
    this.era = eraId;
    this.setFluids(d && d.fluids ? d.fluids : ERA_FLUIDS[eraId] || []);
    for (const v of this.views) v.setRoadMode({ loop: loop ? 1 : 0, track: tracks ? 1 : 0 });
    const t0 = performance.now();
    const bumps = (d && d.bumps) || [];
    const inB = bumps.filter((b) => this.isInner(b.x, b.z)), outB = bumps.filter((b) => !this.isInner(b.x, b.z));
    const changed = this.T.setEra(natural, inB);
    const changedO = this.O.setEra(natural, outB) || changed;
    if (changed) { this.buildColliders(); this.view.refresh(); }
    if (changedO) { this.O.innerHeights(this.T); this.oview.refresh(); this.reloadTiles(); this.water.build(); }
    if (changed || changedO) this.sendHeights();
    this.eraMs = performance.now() - t0;
    this.mapDirty = true;
    if (!this.cityExplicit) { const c = this.defaultCity(eraId); this.cityOpts = c; if (this.city) { if (changedO) this.city.markTerrain(); this.city.setCity(c).then(() => this.refreshRoads()); } }
    else if (this.city && changedO) this.city.terrainChanged();
    return changed || changedO;
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
    if (this.earth) { this.earth.palSnow = this.palette.snow || null; this.earth.applyClimate(); }
    for (const v of this.views) v.setPalette(this.palette);
    if (this.city) this.city.setPalette(this.palette);
    this.mapDirty = true;
  }

  preStep(dt, cars) {
    if (this.g.space && this.g.space.active) return;
    const lim = this.inEarth ? this.limit : MEGA.LIMIT, hard = this.inEarth ? EARTH_HALF - 40 : MEGA.HALF - 40;
    for (const c of cars) {
      const s = c.sim; if (!s.enabled) continue;
      const b = s.body, p = b.translation();
      const push = (v, lv) => { const over = Math.abs(v) - lim; if (over <= 0) return 0; const out = Math.sign(v); return -out * (over * 2.2 + Math.max(0, lv * out) * 1.6) * s.mass; };
      const lv = b.linvel(), fx = push(p.x, lv.x), fz = push(p.z, lv.z);
      if (fx || fz) b.applyImpulse({ x: fx * dt, y: 0, z: fz * dt }, true);
      const under = p.y < this.heightAt(p.x, p.z) - 4 && !this.inTunnel(p.x, p.z, p.y);
      if (Math.abs(p.x) > hard || Math.abs(p.z) > hard || under) {
        const q = this.safeSpawnAt(Math.max(-lim + 100, Math.min(lim - 100, p.x)), Math.max(-lim + 100, Math.min(lim - 100, p.z)), -1e9, { body: b });
        b.setTranslation({ x: q[0], y: q[1] + 0.3, z: q[2] }, true);
        const v = b.linvel(); b.setLinvel({ x: v.x * 0.2, y: Math.max(0, v.y), z: v.z * 0.2 }, true);
      }
      const fl = this.inEarth ? this.earth.fluidAt(p.x, p.z) : null;
      const sunk = this.inEarth ? !!fl && p.y < fl.level - 2.2 : !this.isInner(p.x, p.z) && p.y < -2.2 && this.O.waterAt(p.x, p.z) && !this.inTunnel(p.x, p.z, p.y);
      if (c === this.g.car && sunk) {
        s._sunk = (s._sunk || 0) + dt;
        if (s._sunk > 3) { s._sunk = 0; const q = this.shoreSpawn(p.x, p.z, b); b.setTranslation({ x: q[0], y: q[1] + 0.3, z: q[2] }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true); }
      } else s._sunk = 0;
    }
    if (this.city && !this.inEarth) this.city.preStep(dt, cars);
  }

  update(dt, camPos, camera) {
    const cam = camera || this.g.gfx.camera;
    cam.updateMatrixWorld();
    if (this.inEarth) {
      const t0 = performance.now();
      this.earth.update(dt, cam, this.anchors());
      const P = this.prof || (this.prof = { views: 0, tiles: 0, city: 0 }); P.views += (performance.now() - t0 - P.views) * 0.05;
      for (const m of this.skyMeshes) m.position.copy(cam.position);
      return;
    }
    if (this.earth) this.earth.update(dt, cam, null);
    const t0 = performance.now();
    for (const v of this.views) v.update(cam);
    const t1 = performance.now();
    this.streamTiles(false);
    const car = this.g.car && this.g.car.sim;
    this.water.update(dt, cam.position, car);
    const t2 = performance.now();
    if (this.city) this.city.update(dt, cam);
    const t3 = performance.now(), P = this.prof || (this.prof = { views: 0, tiles: 0, city: 0 }), k = 0.05;
    P.views += (t1 - t0 - P.views) * k; P.tiles += (t2 - t1 - P.tiles) * k; P.city += (t3 - t2 - P.city) * k;
    for (const m of this.skyMeshes) m.position.copy(cam.position);
    this.relight();
  }

  earthMap() {
    const S = 1024, c = this.mapCanvas || document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S), E = this.earth, P = E.P, ext = this.extent, org = this.origin;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const x = org + ext * (1 - (px + 0.5) / S), z = org + ext * (1 - (py + 0.5) / S);
      const h = P.base(x, z), hx = P.base(x + 40, z), hz = P.base(x, z + 40), w = P.waterAt(x, z);
      const sh = Math.max(0, Math.min(1, 0.6 + (h - hx) * 0.012 - (h - hz) * 0.012));
      let r, gg, b;
      if (w.cover > 0.4 && h < w.level) { const dd = Math.min(1, (w.level - h) / 60); r = 0.1 - dd * 0.05; gg = 0.21 - dd * 0.08; b = 0.33 - dd * 0.08; }
      else { const v = 0.09 + 0.12 * Math.min(1, Math.max(0, h / 2500)) + 0.14 * sh; r = v; gg = v * 1.02; b = v * 1.06; if (h > (E.snowLineEff ?? E.climate.snowLine)) { r = gg = b = 0.62 + 0.15 * sh; } }
      const o = (py * S + px) * 4;
      img.data[o] = Math.min(255, r * 255); img.data[o + 1] = Math.min(255, gg * 255); img.data[o + 2] = Math.min(255, b * 255); img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.mapCanvas = c; this.mapDirty = false;
    return c;
  }

  mapImage() {
    if (!this.mapDirty && this.mapCanvas) return this.mapCanvas;
    if (this.inEarth) return this.earthMap();
    const S = 1024, c = this.mapCanvas || document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S), O = this.O, H = O.H, NRM = O.NRM, NN = O.N, TNo = O.TN;
    const sun = [0.45, 0.72, 0.52], sl = Math.hypot(...sun);
    const ext = MEGA.EXTENT, org = MEGA.ORIGIN;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const x = org + ext * (1 - (px + 0.5) / S), z = org + ext * (1 - (py + 0.5) / S);
      const j = Math.min(NN - 1, Math.round((x - org) / O.CELL)), i = Math.min(NN - 1, Math.round((z - org) / O.CELL));
      const h = H[i * NN + j];
      const tj = j >> 1, ti = i >> 1, no = (ti * TNo + tj) * 2;
      const nx = NRM[no] / 127.5 - 1, nz = NRM[no + 1] / 127.5 - 1, ny = Math.sqrt(Math.max(0.0004, 1 - nx * nx - nz * nz));
      const sh = Math.max(0, (nx * sun[0] + ny * sun[1] + nz * sun[2]) / sl);
      const v = 0.085 + 0.09 * Math.min(1, Math.max(0, h / 700)) + 0.13 * sh * sh;
      let r = v, gg = v * 1.01, b = v * 1.07;
      const so = (ti * TNo + tj) * 4, sand = O.S[so] / 255, playa = O.S[so + 1] / 255;
      r += sand * 0.045 + playa * 0.06; gg += sand * 0.035 + playa * 0.06; b += playa * 0.06;
      if (h < -0.25 && z > 2300) { r = 0.06; gg = 0.12; b = 0.2; }
      const liq = this.isInner(x, z) ? this.fluidAt(x, z) : null;
      if (liq) { if (liq.kind === 'lava') { r = 0.6; gg = 0.17; b = 0.04; } else { r = 0.1; gg = 0.21; b = 0.33; } }
      const o = (py * S + px) * 4;
      img.data[o] = Math.min(255, r * 255); img.data[o + 1] = Math.min(255, gg * 255); img.data[o + 2] = Math.min(255, b * 255); img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const toPx = (x, z) => [(1 - (x - org) / ext) * S, (1 - (z - org) / ext) * S];
    if (this.city && this.city.plan) {
      g.fillStyle = 'rgba(205,208,214,0.14)';
      for (const b of this.city.plan.buildings) { if (b.h < 8) continue; const [a, bb] = toPx(b.cx, b.cz); const s = Math.max(0.6, Math.sqrt(Math.abs(b.area || 300)) / ext * S); g.fillRect(a - s / 2, bb - s / 2, s, s); }
    }
    if (!this.T.natural) {
      const U = this.view.U;
      for (const r of this.roads) {
        const vis = r.type === 'loop' || r.type === 'link' ? U.rLoop.value : r.type === 'track' ? U.rTrack.value : r.type === 'rail' ? 0 : U.rMain.value;
        if (vis < 0.3) continue;
        g.beginPath();
        r.pts.forEach((p, i) => { const [a, b] = toPx(p[0], p[1]); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
        if (r.closed) g.closePath();
        g.lineWidth = r.kind === 'highway' ? 2.6 : r.type === 'loop' ? 2 : r.type === 'track' ? 1.1 : r.city ? 0.9 : 1.4;
        g.strokeStyle = r.type === 'track' ? 'rgba(242,243,245,0.34)' : r.type === 'loop' ? 'rgba(242,243,245,0.6)' : r.city ? 'rgba(242,243,245,0.5)' : 'rgba(242,243,245,0.8)';
        g.setLineDash(r.type === 'track' ? [4, 4] : []);
        g.stroke();
      }
      g.setLineDash([]);
    }
    g.font = '500 17px "SF Pro Display", -apple-system, "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const l of this.landmarks) { const [a, b] = toPx(l.x, l.z); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText(l.label, a + 1, b + 1); g.fillStyle = 'rgba(242,243,245,0.7)'; g.fillText(l.label, a, b); }
    this.mapCanvas = c; this.mapDirty = false;
    return c;
  }
}

export async function createValley(game, progress0) {
  let lastP = -1;
  const progress = progress0 ? (f) => { if (f - lastP >= 0.1 || f >= 1) { lastP = f; progress0(f); } } : null;
  const D = buildDesign();
  const T = await generate(D, (f) => progress && progress(f * 0.3));
  const M = buildMega(D);
  const O = await generateOuter(D, M, T, (f) => progress && progress(0.3 + f * 0.6));
  const V = new Valley(game, D, T, M, O);
  if (progress) progress(0.95);
  if (!new URLSearchParams(location.search).has('nocity')) await V.attachCity();
  V.streamTiles(true);
  setTimeout(() => V.initEarth(), 1500);
  return V;
}
