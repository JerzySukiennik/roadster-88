// Roadster 88 Earth world: the drivable patch of real Earth around a landing point (or the backdrop around the valley), with the valley API (heightAt on the same 4 m triangulation as the Rapier heightfield tiles streamed around every car, normals, water, surfaces, climate regions, spawn and shore rescue), the clipmap terrain and a water surface for oceans and lakes.
import * as THREE from 'three/webgpu';
import { uniform, texture, textureLoad, vec2, vec3, float, int, ivec2, positionLocal, positionWorld, varying, length, max, clamp, floor, mix, Fn, smoothstep } from 'three/tsl';
import { Patch, setBase, loadIndex, M_PER_DEG } from './data.js';
import { EarthTerrain } from './terrain.js';
import { makeWaterMaterial } from '../water.js';
import { GROUP, groups } from '../../sim/car.js';

const CELL = 4, TCELLS = 64, TW = CELL * TCELLS;
export const EARTH_HALF = 30000;

const SNOW = [[0, 5000], [20, 5000], [30, 4500], [35, 4000], [40, 3600], [46, 3100], [50, 2600], [55, 1900], [60, 1400], [65, 800], [70, 300], [75, 0], [90, 0]];
function snowLineAt(lat) {
  const a = Math.abs(lat);
  for (let i = 1; i < SNOW.length; i++) if (a <= SNOW[i][0]) { const [a0, h0] = SNOW[i - 1], [a1, h1] = SNOW[i]; return h0 + (h1 - h0) * (a - a0) / (a1 - a0); }
  return 0;
}

export function climateOf(lat, lon, elev, biome) {
  const a = Math.abs(lat);
  const temp = 27 - 0.0068 * Math.max(0, elev) - (a < 20 ? 0 : (a - 20) * 0.62);
  const veg = biome ? biome.veg : (a < 12 ? 0.85 : a < 33 ? 0.35 : a < 55 ? 0.65 : a < 66 ? 0.55 : 0.15);
  const arid = biome ? biome.arid : (a > 15 && a < 33 ? 0.7 : 0.15);
  const ice = (biome ? biome.ice : (a > 70 ? 0.6 : 0)) * Math.max(0, Math.min(1, (4 - temp) / 10));
  let zone = 'temperate';
  if (ice > 0.5 || temp < -8) zone = 'polar';
  else if (elev > snowLineAt(lat) * 0.7 && elev > 1800) zone = 'alpine';
  else if (arid > 0.55 && veg < 0.35) zone = 'arid';
  else if (temp > 22 && veg > 0.55) zone = 'tropical';
  else if (temp < 5) zone = 'continental';
  return { lat, lon, zone, temp: Math.round(temp * 10) / 10, veg, arid, ice, snowLine: snowLineAt(lat), elevation: Math.round(elev) };
}

export class EarthWorld {
  constructor(game, valley, U, noise) {
    this.g = game; this.V = valley;
    setBase(new URL('../../../../assets/earth/', import.meta.url).href);
    this.terrain = new EarthTerrain(game.gfx, game.sky, U, noise, { M: { low: 64, medium: 96 }[game.gfx.presetName] || 128, levels: game.gfx.presetName === 'low' ? 7 : 8, s0: CELL, backdrop: { half: 8192, blend: 3000, overlap: 4 } });
    this.terrain.visible = false;
    this.tiles = new Map();
    this.mode = 'off';
    this.P = null;
    this._n = { x: 0, y: 1, z: 0 };
    this.water = this.makeWater(noise);
  }

  makeWater(noise) {
    const T = this.terrain, u = T.u, levels = [];
    const U = { time: uniform(0), blast: uniform(new THREE.Vector4(0, -1000, 0, 0)), wind: uniform(new THREE.Vector2(1, 0.3)), tint: uniform(new THREE.Color(1, 1, 1)), rough: uniform(0.07) };
    const camU = uniform(new THREE.Vector3());
    const root = new THREE.Group(); root.name = 'EarthWater'; root.visible = false;
    this.g.gfx.scene.add(root);
    const M = 96;
    const center = uniform(new THREE.Vector2()).onObjectUpdate(({ object }) => object.userData.center);
    const inner = uniform(new THREE.Vector4(0, 0, -1, -1)).onObjectUpdate(({ object }) => object.userData.inner);
    const sU = uniform(1).onObjectUpdate(({ object }) => object.userData.s);
    const gridNode = T.gridNode;
    const wxz = center.add(positionLocal.xz.mul(sU));
    const G = (j, i) => textureLoad(gridNode, ivec2(j, i));
    const gx = clamp(u.cj.sub(wxz.x.mul(u.kx)), 1, u.nx.sub(2.001)), gz = clamp(u.ci.add(wxz.y.mul(u.kz)), 1, u.nz.sub(2.001));
    const jf = floor(gx), if_ = floor(gz), fx = gx.sub(jf), fz = gz.sub(if_), j = int(jf), i = int(if_);
    const a = G(j, i), b = G(j.add(1), i), c = G(j, i.add(1)), d = G(j.add(1), i.add(1));
    const wl = mix(mix(a.z, b.z, fx), mix(c.z, d.z, fx), fz), wf = mix(mix(a.w, b.w, fx), mix(c.w, d.w, fx), fz), eb = mix(mix(a.x, b.x, fx), mix(c.x, d.x, fx), fz);
    const camD2 = wxz.sub(u.cam.xz).dot(wxz.sub(u.cam.xz));
    const vD = varying(wl.sub(eb).max(0)), vF = varying(wf);
    const m = makeWaterMaterial(U, noise, camU, vD.add(2));
    m.positionNode = vec3(wxz.x, wl.sub(camD2.div(2 * 6371000)), wxz.y);
    const wp = positionWorld;
    m.maskNode = Fn(() => vF.greaterThan(0.02).and(wp.x.sub(inner.x).abs().lessThan(inner.z).and(wp.z.sub(inner.y).abs().lessThan(inner.w)).not()))();
    for (let l = 0; l < 4; l++) {
      const s = 8 * 4 ** l, half = M / 2, hole = l === 0 ? -1 : M / 8 - 1;
      const pos = [], idx = [], id = (i, j) => i * (M + 1) + j;
      for (let i = 0; i <= M; i++) for (let j = 0; j <= M; j++) pos.push(j - half, 0, i - half);
      for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) { const cx = j - half + 0.5, cz = i - half + 0.5; if (Math.abs(cx) < hole && Math.abs(cz) < hole) continue; idx.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
      const mesh = new THREE.Mesh(geo, m);
      mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.receiveShadow = true; mesh.name = `earth_water_${l}`; mesh.renderOrder = 20 + l;
      mesh.userData = { center: new THREE.Vector2(), inner: new THREE.Vector4(0, 0, -1, -1), s };
      root.add(mesh);
      levels.push({ s, mesh, center: { value: mesh.userData.center }, inner: { value: mesh.userData.inner } });
    }
    return { root, levels, U, camU, M, mat: m };
  }

  prefetch(lat, lon) {
    const k = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (!this.pre || this.pre.k !== k) { const p = this.load(lat, lon); p.catch(() => {}); this.pre = { k, p }; }
    return this.pre.p;
  }

  async load(lat, lon, opts = {}) {
    if (!opts.valleyFrame && this.pre && this.pre.k === `${lat.toFixed(4)},${lon.toFixed(4)}`) return this.pre.p;
    const idx = await loadIndex();
    const P = new Patch(lat, lon, { radius: opts.radius || 66000, yOff: opts.valleyFrame ? idx.valley.E0 : opts.yOff || 0 });
    await P.load();
    P.E0 = idx.valley.E0;
    return P;
  }

  setPatch(P, mode) {
    this.P = P; this.mode = mode;
    this.terrain.setPatch(P);
    const u = this.terrain.u;
    u.yOff.value = P.yOff;
    if (mode === 'backdrop') { u.bdHalf.value = 8192; u.bdBlend.value = 3000; }
    else { u.bdHalf.value = 0; u.bdBlend.value = 0.001; }
    for (const L of this.terrain.levels) L.mesh.renderOrder = (mode === 'backdrop' ? 5 : -20) + L.l;
    const e0 = P.base(0, 0) + P.yOff;
    this.climate = climateOf(P.lat0, P.lon0, e0, P.biome || null);
    this.applyClimate();
    this.dropAll();
    this.tileCache = new Map();
    this.hasWater = mode === 'earth' && P.Wf.some((v) => v > 0);
  }

  setClimateAt(lat, lon, x, z) {
    if (!this.P) return;
    this.climate = climateOf(lat, lon, this.P.base(x, z) + this.P.yOff, this.P.biome || null);
    this.applyClimate();
    this.regionsDirty = true;
  }

  applyClimate() {
    if (!this.climate) return;
    const ps = this.palSnow || { line: 950, amount: 0 }, E0 = (this.P && this.P.E0) || 733;
    const drop = (ps.amount || 0) * Math.max(0, 3900 - ((ps.line ?? 950) + E0)) * 0.8;
    this.snowLineEff = Math.max(0, this.climate.snowLine - drop);
    this.terrain.setClimate({ ...this.climate, snowLine: this.snowLineEff });
  }

  show(on) {
    this.terrain.visible = on;
    this.water.root.visible = on && this.mode === 'earth' && !!this.hasWater;
    for (const L of this.terrain.levels) L.mesh.visible = on;
  }

  node(j, i) {
    const tx = Math.floor(j / TCELLS), tz = Math.floor(i / TCELLS), t = this.tiles.get(tx + ',' + tz);
    if (t) { const jj = j - tx * TCELLS, ii = i - tz * TCELLS; return t.hts[jj * (TCELLS + 1) + ii]; }
    const k = j * 100003 + i, c = this.tileCache;
    let v = c.get(k);
    if (v === undefined) { v = this.P.f(j * CELL, i * CELL); if (c.size > 20000) c.clear(); c.set(k, v); }
    return v;
  }

  heightAt(x, z) {
    if (!this.P) return 0;
    const fx = x / CELL, fz = z / CELL, j = Math.floor(fx), i = Math.floor(fz), u = fx - j, v = fz - i;
    const h00 = this.node(j, i), h01 = this.node(j + 1, i), h10 = this.node(j, i + 1);
    if (u + v < 1) return h00 + (h01 - h00) * u + (h10 - h00) * v;
    const h11 = this.node(j + 1, i + 1);
    return h11 + (h10 - h11) * (1 - u) + (h01 - h11) * (1 - v);
  }

  normalAt(x, z, out) {
    const e = 2;
    const nx = this.heightAt(x - e, z) - this.heightAt(x + e, z), nz = this.heightAt(x, z - e) - this.heightAt(x, z + e), ny = 2 * e;
    const l = Math.hypot(nx, ny, nz);
    out = out || { x: 0, y: 1, z: 0 };
    out.x = nx / l; out.y = ny / l; out.z = nz / l;
    return out;
  }

  waterAt(x, z) { return this.P ? this.P.waterAt(x, z) : { level: -1e4, cover: 0 }; }

  fluidAt(x, z) {
    const w = this.waterAt(x, z);
    if (w.cover < 0.02) return null;
    if (this.heightAt(x, z) >= w.level) return null;
    return { id: w.level === 0 ? 'ocean' : 'lake', kind: 'water', level: w.level };
  }

  surfaceAt(x, z) {
    if (this.fluidAt(x, z)) return 'water';
    const h = this.heightAt(x, z), n = this.normalAt(x, z, this._n), w = this.waterAt(x, z), C = this.climate || {};
    if (h > (this.snowLineEff ?? C.snowLine) && n.y > 0.75) return 'snow';
    if (C.ice > 0.5 && n.y > 0.8) return 'ice';
    if (n.y < 0.74) return 'rock';
    if (w.cover > 0.02 && h - w.level < 3) return 'sand';
    if (C.arid > 0.55) return 'sand';
    return C.veg > 0.45 ? 'grass' : 'dirt';
  }

  regions() {
    const H = EARTH_HALF;
    return [{ id: 'wild', kind: 'wild', name: 'Wild', climate: this.climate, poly: [[-H, -H], [H, -H], [H, H], [-H, H]] }];
  }

  makeTile(tx, tz) {
    const R = this.g.R, phys = this.g.phys, n = TCELLS, P = this.P;
    const hts = new Float32Array((n + 1) * (n + 1));
    const x0 = tx * TW, z0 = tz * TW, c = this.tileCache;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const gj = tx * n + j, gi = tz * n + i, k = gj * 100003 + gi;
      let v = c.get(k);
      if (v === undefined) v = P.f(x0 + j * CELL, z0 + i * CELL);
      hts[j * (n + 1) + i] = v;
    }
    const d = R.ColliderDesc.heightfield(n, n, hts, { x: TW, y: 1, z: TW }, R.HeightFieldFlags.FIX_INTERNAL_EDGES)
      .setTranslation(x0 + TW / 2, 0, z0 + TW / 2).setFriction(0.85).setRestitution(0.05).setCollisionGroups(groups(GROUP.STATIC, 0xffff));
    return { hts, col: phys.addStatic(d, { kind: 'ground', tag: 'terrain' }) };
  }

  dropTile(k) {
    const t = this.tiles.get(k); if (!t) return;
    const phys = this.g.phys; phys.world.removeCollider(t.col, false);
    const i = phys.statics.indexOf(t.col); if (i >= 0) phys.statics.splice(i, 1);
    this.tiles.delete(k);
  }

  dropAll() { for (const k of [...this.tiles.keys()]) this.dropTile(k); }

  ensureGround(x, z, r = 140) {
    if (this.mode !== 'earth') return;
    const tx0 = Math.floor((x - r) / TW), tx1 = Math.floor((x + r) / TW), tz0 = Math.floor((z - r) / TW), tz1 = Math.floor((z + r) / TW);
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) { const k = tx + ',' + tz; if (!this.tiles.has(k)) this.tiles.set(k, this.makeTile(tx, tz)); }
  }

  streamTiles(anchors) {
    if (this.mode !== 'earth') return;
    const need = new Map(), r = 440, keep = 820;
    for (let a = 0; a < anchors.length; a += 2) {
      const x = anchors[a], z = anchors[a + 1];
      for (let tz = Math.floor((z - r) / TW); tz <= Math.floor((z + r) / TW); tz++) for (let tx = Math.floor((x - r) / TW); tx <= Math.floor((x + r) / TW); tx++) {
        const d = Math.hypot((tx + 0.5) * TW - x, (tz + 0.5) * TW - z), k = tx + ',' + tz;
        if (!need.has(k) || need.get(k)[0] > d) need.set(k, [d, tx, tz]);
      }
    }
    const missing = [...need.entries()].filter(([k]) => !this.tiles.has(k)).sort((a, b) => a[1][0] - b[1][0]);
    const t0 = performance.now();
    for (const [k, [, tx, tz]] of missing) { this.tiles.set(k, this.makeTile(tx, tz)); if (performance.now() - t0 > 2.5) break; }
    if ((this.frame = (this.frame || 0) + 1) % 30 === 0) for (const k of [...this.tiles.keys()]) {
      if (need.has(k)) continue;
      const [tx, tz] = k.split(',').map(Number);
      let far = true;
      for (let a = 0; a < anchors.length; a += 2) if (Math.hypot((tx + 0.5) * TW - anchors[a], (tz + 0.5) * TW - anchors[a + 1]) < keep) { far = false; break; }
      if (far) this.dropTile(k);
    }
  }

  nearestLand(x, z, maxR = 30000) {
    if (!this.fluidAt(x, z) && !this.P.waterAt(x, z).cover) return [x, z];
    for (let r = 50; r < maxR; r *= 1.35) {
      const n = Math.max(12, Math.round(r / 40));
      let best = null;
      for (let a = 0; a < n; a++) {
        const ang = (a / n) * Math.PI * 2, px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
        const w = this.P.waterAt(px, pz), h = this.P.base(px, pz);
        if (h > w.level + 2 && h > -5000) { if (!best || h < best[2]) best = [px, pz, h]; }
      }
      if (best) {
        let [px, pz] = best;
        for (let k = 0; k < 40; k++) { const w = this.P.waterAt(px, pz); if (this.P.base(px, pz) > w.level + 4) break; px += (px - x) / r * 20; pz += (pz - z) / r * 20; }
        return [px, pz];
      }
    }
    return null;
  }

  update(dt, cam, anchors) {
    if (!this.terrain.visible) return;
    this.terrain.update(cam);
    const W = this.water;
    if (W.root.visible) {
      W.U.time.value += dt; W.camU.value.copy(cam.position);
      const half = W.M / 2;
      for (let i = 0; i < W.levels.length; i++) {
        const L = W.levels[i], step = 2 * L.s;
        L.cx = Math.floor(cam.position.x / step + 0.5) * step; L.cz = Math.floor(cam.position.z / step + 0.5) * step;
        L.center.value.set(L.cx, L.cz);
        const Pv = W.levels[i - 1];
        if (Pv) L.inner.value.set(Pv.cx, Pv.cz, half * Pv.s - 0.01, half * Pv.s - 0.01);
      }
    }
    if (anchors) this.streamTiles(anchors);
  }

  dispose() {
    this.dropAll();
    this.terrain.dispose();
    for (const L of this.water.levels) L.mesh.geometry.dispose();
    this.water.mat.dispose();
    if (this.water.root.parent) this.water.root.parent.remove(this.water.root);
  }
}

export const ORIGIN_STEP = 0.25;

export function earthOrigin(lat, lon) {
  const la = Math.max(-84, Math.min(84, Math.round(lat / ORIGIN_STEP) * ORIGIN_STEP));
  let lo = Math.round(lon / ORIGIN_STEP) * ORIGIN_STEP; if (lo >= 180) lo -= 360; if (lo < -180) lo += 360;
  return { lat: la, lon: lo };
}

export function haversine(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export { M_PER_DEG };
