// Roadster 88 era system: swaps the valley between the periods of the timeline (terrain palette and deltas, ground rules, the city style of the year, sky and fog, fluids, flora, props, structures, ambient key), keeps the causality world state per year and streams era content around the camera.
import * as THREE from 'three/webgpu';
import { periodInfo, cityFor, detailKey, PERIOD_IDS } from './periods.js';
import { WorldState, defaultTurningPoints } from './worldstate.js';
import { Fluids } from './fluids.js';
import { SkyExtras } from './skyfx.js';
import { Scatter } from './scatter.js';
import { Structures } from './structures.js';
import { Library, inPoly, distToPolyline } from './lib.js';
import { Weather, greenness, seasonOf } from './weather.js';
import { eraOf, PERIODS } from '../sim/timetravel.js';

const DETAIL = { low: 0.35, medium: 0.6, high: 1, ultra: 1.35 };
export const ERA_IDS = PERIOD_IDS;

export class EraSystem {
  constructor(game, valley) {
    this.game = game; this.valley = valley;
    this.root = new THREE.Group(); this.root.name = 'Eras';
    game.gfx.scene.add(this.root);
    const inner = (pts) => pts.some(([x, z]) => Math.abs(x) < 2200 && Math.abs(z) < 2200);
    this.roadList = (valley.roads || []).map((r) => ({ ...r, pts: r.pts || (r.points || []).map((p) => [p[0], p[2]]) })).filter((r) => inner(r.pts));
    this.year = game.tc ? game.tc.present.year : 2026;
    this.worldState = new WorldState(() => this.year);
    defaultTurningPoints(this.worldState);
    this.detail = DETAIL[game.gfx.presetName] || 1;
    this.eraId = null; this.detailKey = null; this.ambient = null; this.period = null;
    this.lib = new Library(this);
    this.fluids = new Fluids(this);
    this.skyfx = new SkyExtras(this);
    this.scatter = new Scatter(this);
    this.structures = new Structures(this);
    this.weather = new Weather(this);
    this.cache = new Map();
    this.handed = new Set();
    this.camPos = new THREE.Vector3();
    this.stats = { applyMs: 0, cityMs: 0 };
  }

  regions(id) { return (this.valley.regions || []).filter((r) => r.id === id); }
  region(id) { return this.regions(id)[0] || null; }
  roads(kind) { return this.roadList.filter((r) => !kind || r.kind === kind); }
  roadDist(x, z, kinds) { let d = Infinity; for (const r of this.roadList) if (!kinds || kinds.includes(r.kind)) d = Math.min(d, distToPolyline(r.pts, x, z) - (r.width || 10) / 2); return d; }
  inRegion(id, x, z, margin = 0) {
    for (const r of this.regions(id)) {
      if (r.ring) continue;
      if (inPoly(r.poly, x, z)) return true;
      if (margin > 0 && distToPolyline(r.poly.concat([r.poly[0]]), x, z) < margin) return true;
    }
    return false;
  }

  yearFor(eraId) {
    const y = this.game.tc ? this.game.tc.present.year : 2026;
    if (eraOf(y).id === eraId) return y;
    const p = PERIODS.find((q) => q.id === eraId);
    return p ? p.date.year : y;
  }

  eraContext(eraId) {
    if (this.cache.has(eraId)) return this.cache.get(eraId);
    const P = periodInfo(eraId), ctx = { eraId, fluids: [], bumps: [], volcanoes: [], herd: [] };
    for (const f of P.fluids) {
      const r = this.region(f.region);
      if (!r) continue;
      const lv = this.fluidLevel(r, f.fill);
      let cx = 0, cz = 0; for (const [x, z] of r.poly) { cx += x; cz += z; } cx /= r.poly.length; cz /= r.poly.length;
      const k = f.fill > 1 ? 1.3 : 1.08, mesh = r.poly.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);
      ctx.fluids.push({ kind: f.kind, region: f.region, level: lv, poly: r.poly, mesh });
    }
    if (P.volcanoes) {
      const small = eraId !== 'hadean';
      const picks = this.pickSpots(P.volcanoes, 760, (x, z) => {
        const rd = this.roadDist(x, z); if (rd < 170) return -1;
        if (this.inRegion('lake', x, z, 160) || this.inRegion('town', x, z, 120) || this.inRegion('mesa', x, z, 120)) return -1;
        const r = Math.hypot(x, z); return 1 - Math.abs(r - 1250) / 900;
      }, small ? 11 : 7);
      picks.forEach((p, i) => { const r = (small ? 110 : 150) + (i % 3) * 40, h = (small ? 34 : 50) + (i % 2) * (small ? 18 : 28); ctx.bumps.push({ x: Math.round(p.x), z: Math.round(p.z), r, h, crater: true }); ctx.volcanoes.push({ x: p.x, z: p.z, r, h }); });
    }
    if (P.skyfx.herd) {
      const lake = this.region('lake');
      if (lake) {
        let cx = 0, cz = 0; for (const [x, z] of lake.poly) { cx += x; cz += z; } cx /= lake.poly.length; cz /= lake.poly.length;
        const far = lake.poly.slice().sort((a, b) => Math.hypot(b[0], b[1]) - Math.hypot(a[0], a[1]));
        for (let i = 0; i < 3; i++) {
          const p = far[Math.min(far.length - 1, i * 2)];
          const x = cx + (p[0] - cx) * 1.12 + i * 18, z = cz + (p[1] - cz) * 1.12 - i * 25;
          ctx.herd.push({ x, z, y: 0, yaw: Math.atan2(cx - x, cz - z) + (i - 1) * 0.7, scale: 1.5 + i * 0.25 });
        }
      }
    }
    this.cache.set(eraId, ctx);
    return ctx;
  }

  fluidLevel(region, fill) {
    const V = this.valley, poly = region.poly;
    let bed = region.floor, rim = region.rim !== undefined ? region.rim : region.shore;
    if (bed === undefined || rim === undefined) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      bed = Infinity;
      for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) { const x = x0 + (x1 - x0) * i / 24, z = z0 + (z1 - z0) * j / 24; if (inPoly(poly, x, z)) bed = Math.min(bed, V.heightAt(x, z)); }
      const ring = poly.map(([x, z]) => V.heightAt(x, z)).sort((a, b) => a - b);
      rim = ring[Math.floor(ring.length * 0.15)];
    }
    if (fill <= 1) return bed + (rim - bed) * fill;
    const full = region.full !== undefined ? region.full : rim + 1;
    return rim + (full - rim) * Math.min(1, fill - 1);
  }

  pickSpots(n, sep, score, seed = 1) {
    const out = [], cand = [];
    let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let x = -1900; x <= 1900; x += 100) for (let z = -1900; z <= 1900; z += 100) {
      const px = x + (rnd() - 0.5) * 80, pz = z + (rnd() - 0.5) * 80;
      const v = score(px, pz); if (v > 0) cand.push({ x: px, z: pz, v: v + rnd() * 0.3 });
    }
    cand.sort((a, b) => b.v - a.v);
    for (const c of cand) { if (out.length >= n) break; if (out.every((o) => Math.hypot(o.x - c.x, o.z - c.z) > sep)) out.push(c); }
    return out;
  }

  apply(eraId, opts = {}) {
    if (!PERIOD_IDS.includes(eraId)) eraId = '2026';
    const year = opts.year !== undefined ? opts.year : this.yearFor(eraId);
    const key = detailKey(eraId, year);
    if (eraId === this.eraId && key === this.detailKey && !opts.force) { this.year = year; return; }
    const t0 = performance.now(), T = {}; let tl = t0;
    const lap = (k) => { const n = performance.now(); T[k] = Math.round((n - tl) * 10) / 10; tl = n; };
    const prev = this.eraId, samePeriod = prev === eraId;
    if (prev) { this.scatter.leave(prev); this.structures.leave(prev); }
    lap('leave');
    this.eraId = eraId; this.detailKey = key; this.year = year;
    const P = this.period = periodInfo(eraId);
    const V = this.valley, ctx = this.eraContext(eraId);
    lap('ctx');
    if (V.setEraTerrain && !(samePeriod && !opts.force)) V.setEraTerrain(eraId, { fluids: ctx.fluids.map((f) => ({ kind: f.kind, region: f.region, level: f.level, poly: f.mesh })), bumps: ctx.bumps, natural: P.natural, loop: P.loop, tracks: P.tracks });
    lap('terrain');
    this.city = cityFor(eraId, year);
    if (V.setCity) { try { V.setCity(this.city); } catch (e) { console.warn('valley.setCity failed', e); } }
    lap('city'); this.stats.cityMs = T.city;
    for (const v of ctx.volcanoes) v.y = V.heightAt(v.x, v.z);
    for (const h of ctx.herd) h.y = V.heightAt(h.x, h.z) - 0.5;
    const sky = this.game.sky;
    if (sky.setEra) sky.setEra(P.sky);
    this.lib.setEra(P);
    this.fluids.set(ctx.fluids, P);
    this.skyfx.build(eraId, ctx, P, year);
    lap('sky');
    this.turning = this.worldState.resolveTurningPoints(eraId);
    this.structures.enter(eraId, this.turning, year);
    lap('structures');
    this.scatter.enter(eraId, year);
    lap('flora');
    this.ambient = P.ambient;
    if (!samePeriod) this.weather.roll(eraId, { instant: true });
    this.applySeason();
    sky.envDirty = true;
    lap('season');
    this.stats.applyMs = performance.now() - t0; this.stats.steps = T;
    if (this.onApply) this.onApply(eraId, prev);
  }

  viewpoint(name) {
    const V = this.valley, rd = this.roads('highway')[0] || this.roadList[0];
    const centroid = (poly) => { let x = 0, z = 0; for (const p of poly) { x += p[0]; z += p[1]; } return [x / poly.length, z / poly.length]; };
    const at = (x, z, yaw, o = {}) => ({ pos: [x, V.heightAt(x, z) + 0.12, z], yaw, ...o });
    if (name === 'vista') {
      const m = this.region('mesa');
      if (m) {
        const [cx, cz] = centroid(m.poly);
        let r = 0; for (const p of m.poly) r += Math.hypot(p[0] - cx, p[1] - cz); r /= m.poly.length;
        const dl = Math.hypot(cx, cz) || 1, dx = -cx / dl, dz = -cz / dl;
        return at(cx + dx * (r - 12), cz + dz * (r - 12), Math.atan2(dx, dz), { pitch: 0.3 });
      }
    }
    if (name === 'road' && rd) {
      const t = this.region('town');
      const [tx, tz] = t ? centroid(t.poly) : [0, 0];
      let bi = 0, bd = Infinity;
      rd.pts.forEach((p, i) => { const d = Math.hypot(p[0] - tx, p[1] - tz); if (d < bd) { bd = d; bi = i; } });
      const i0 = Math.max(0, bi - 6), p0 = rd.pts[i0], p1 = rd.pts[i0 + 1];
      return at(p0[0], p0[1], Math.atan2(p1[0] - p0[0], p1[1] - p0[1]), { pitch: 0.06 });
    }
    if (name === 'town') {
      const st = this.roads('street').sort((a, b) => b.width - a.width)[0];
      if (st) { const p0 = st.pts[2], p1 = st.pts[3]; return at(p0[0], p0[1], Math.atan2(p1[0] - p0[0], p1[1] - p0[1]), { pitch: 0.05 }); }
    }
    if (name === 'main' || name === 'depot') {
      const T = this.structures.town();
      if (T) {
        if (name === 'main') { const a = T.at(100, 0, 0); return at(a.x - T.d[0] * 40 + 0.01, a.z - T.d[1] * 40, Math.atan2(T.d[0], T.d[1]), { pitch: 0.06, orbit: 0.35 }); }
        if (T.rail) { const x = this.structures.lineX(T.rail, T.p0[1]) + 16, z = T.p0[1] + T.hw + 18; return at(x, z, Math.atan2(-1, 0.25), { pitch: 0.08, orbit: 0.3 }); }
      }
    }
    if (name === 'lake') {
      const lk = this.region('lake');
      if (lk) { const [cx, cz] = lk.center || centroid(lk.poly); const p = lk.poly[Math.floor(lk.poly.length * 0.62)], x = cx + (p[0] - cx) * 1.25, z = cz + (p[1] - cz) * 1.25; return at(x, z, Math.atan2(cx - x, cz - z), { pitch: 0.04 }); }
    }
    if (name === 'grove') {
      const items = [];
      for (const p of this.scatter.pools) if (p.tall && !p.planted && p.M.def && p.M.def.trunk) for (const [, t] of p.tiles) items.push(...t.list);
      let best = null, bs = 0;
      for (const r of this.roadList) {
        if (r.kind === 'rail' || r.kind === 'highway') continue;
        const pts = r.pts || [];
        for (let i = 1; i < pts.length; i++) {
          const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], L = Math.hypot(x1 - x0, z1 - z0);
          for (let d = 0; d < L; d += 25) {
            const x = x0 + ((x1 - x0) * d) / L, z = z0 + ((z1 - z0) * d) / L;
            let n = 0, sx = 0, sz = 0;
            for (const it of items) { const e = Math.hypot(it.x - x, it.z - z); if (e > 22 && e < 85) { n++; sx += it.x; sz += it.z; } }
            if (n > bs) { bs = n; best = [x, z, sx / n, sz / n]; }
          }
        }
      }
      if (best) { const v = at(best[0], best[1], Math.atan2(best[2] - best[0], best[3] - best[1]), { pitch: 0.03 }); v.pos[1] += 1.2; return v; }
    }
    if (name === 'runway' && rd) {
      const p0 = rd.pts[3], p1 = rd.pts[4];
      return at(p0[0], p0[1], Math.atan2(p1[0] - p0[0], p1[1] - p0[1]));
    }
    return V.spawn ? { pos: V.spawn.pos, yaw: V.spawn.yaw } : null;
  }

  siteView(key, dist = 34) {
    const m = this.structures.cur && this.structures.cur.meta.get(key);
    if (!m) return null;
    const s = m.site, fx = Math.sin(s.yaw || 0), fz = Math.cos(s.yaw || 0);
    const T = this.structures.town();
    let x = s.x + fx * dist, z = s.z + fz * dist;
    if (T && key.startsWith('town:')) {
      const ox = s.x - T.p0[0], oz = s.z - T.p0[1], along = ox * T.d[0] + oz * T.d[1];
      const back = along > 60 ? -26 : 26;
      x = T.p0[0] + T.d[0] * (along + back); z = T.p0[1] + T.d[1] * (along + back);
    }
    return { pos: [x, this.valley.heightAt(x, z) + 0.15, z], yaw: Math.atan2(s.x - x, s.z - z), pitch: 0.1 };
  }

  lookAt(key, want = 42) {
    const m = this.structures.cur && this.structures.cur.meta.get(key);
    if (!m) return null;
    const s = m.site, V = this.valley, h = (m.info && m.info.h) || 8;
    let best = null, bs = Infinity;
    for (const r of this.roadList) {
      if (r.kind === 'rail') continue;
      const pts = r.pts || [];
      for (let i = 0; i < pts.length; i++) {
        const [x, z] = pts[i], d = Math.hypot(x - s.x, z - s.z);
        if (d < 18 || d > 110) continue;
        const y = V.heightAt(x, z);
        if (this.structures.overlaps(x, y + 1, z, 3.5)) continue;
        const fwd = ((x - s.x) * Math.sin(s.yaw || 0) + (z - s.z) * Math.cos(s.yaw || 0)) / d;
        const sc = Math.abs(d - Math.max(want, h * 1.3)) + (1 - fwd) * 60;
        if (sc < bs) { bs = sc; best = [x, z]; }
      }
    }
    if (!best) {
      const T = this.structures.town(), c = T && T.reg ? T.reg.center || [0, 0] : [0, 0];
      let dx = s.x - c[0], dz = s.z - c[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      for (let k = 0; k < 12 && !best; k++) { const a = k * 0.5, d = want + k * 4, x = s.x + (dx * Math.cos(a) - dz * Math.sin(a)) * d, z = s.z + (dz * Math.cos(a) + dx * Math.sin(a)) * d; if (!this.structures.overlaps(x, V.heightAt(x, z) + 1, z, 3.5)) best = [x, z]; }
    }
    if (!best) return null;
    const [x, z] = best;
    return { pos: [x, V.heightAt(x, z) + 0.15, z], yaw: Math.atan2(s.x - x, s.z - z), pitch: Math.min(0.3, 0.05 + h / 400) };
  }

  debugDestroy(key = 'town:8') {
    const vp = this.siteView(key);
    const m = this.structures.cur && this.structures.cur.meta.get(key);
    if (!m) return null;
    const s = m.site, v = new THREE.Vector3(-Math.sin(s.yaw || 0) * 32, 0, -Math.cos(s.yaw || 0) * 32);
    const r = this.structures.destroy(key, v, new THREE.Vector3(s.x, m.y + 1, s.z));
    return { ...r, vp };
  }

  handOver(key) {
    this.handed.add(key);
    if (key === 'herd') { const im = this.skyfx.items.sauropods; if (im) im.visible = false; return this.period && this.period.skyfx.herd ? this.eraContext(this.eraId).herd.map((h) => ({ ...h })) : null; }
    return this.structures.handOver(key);
  }

  paletteFor(eraId) {
    const P = periodInfo(eraId), month = this.game.tc ? this.game.tc.present.month : 10;
    const p = JSON.parse(JSON.stringify(P.palette));
    const L = p.layers || (p.layers = {});
    const gk = P.green || 0;
    const g = greenness(month), lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    if (gk && L.grass) {
      const t = g * gk;
      L.grass.color = lerp3(L.grass.color, [0.06, 0.11, 0.03], t); L.grass.color2 = lerp3(L.grass.color2 || L.grass.color, [0.09, 0.14, 0.04], t);
      L.grass.amount = Math.min(0.95, (L.grass.amount || 0.45) + t * 0.3);
      if (L.floor) { L.floor.color = lerp3(L.floor.color, [0.13, 0.15, 0.07], t * 0.45); L.floor.color2 = lerp3(L.floor.color2 || L.floor.color, [0.17, 0.18, 0.09], t * 0.45); }
      if (L.high) L.high.color = lerp3(L.high.color, [0.06, 0.09, 0.035], t * 0.5);
    }
    if (P.wetSeason && (month >= 11 || month <= 4)) p.wet = (p.wet || 0) + 0.15;
    const W = this.weather, base = p.snow || { amount: 0 };
    if (base.amount > 0 || P.kinds.includes('snow')) {
      const winter = gk && seasonOf(month) === 'winter';
      const cover = W ? W.snowCover : 0;
      const line0 = base.amount > 0 ? base.line : 430;
      const amt = Math.max(base.amount || 0, winter ? 0.8 : 0, cover * 0.95);
      p.snow = { color: base.color || [0.82, 0.85, 0.9], line: winter && cover < 0.05 ? line0 : line0 - cover * 470, amount: amt };
      if (P.cold && seasonOf(month) === 'winter') { p.snow.line = Math.min(p.snow.line, -20); p.snow.amount = Math.max(p.snow.amount, 0.85); }
    }
    if (W) p.wet = Math.max(p.wet || 0, W.wet * 0.85);
    return p;
  }

  pushPalette() { if (this.eraId && this.valley.setPalette) this.valley.setPalette(this.paletteFor(this.eraId)); }

  applySeason() {
    const month = this.game.tc ? this.game.tc.present.month : 10, g = greenness(month), P = this.period;
    const seasonal = P && !P.seasonless && !P.wetSeason;
    const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    this.scatter.tints = seasonal ? { dryGrass: lerp3([1, 1, 1], [0.42, 0.95, 0.3], g * 0.85), sage: lerp3([1, 1, 1], [0.75, 1.05, 0.7], g * 0.6), grass: lerp3([1, 1, 1], [0.85, 1.05, 0.8], g * 0.5), oak: lerp3([1, 1, 1], [0.92, 1.05, 0.9], g * 0.5) } : {};
    this.scatter.dirty = true;
    this.pushPalette();
  }

  overlaps(x, y, z, r = 2.5) { return this.structures.overlaps(x, y, z, r) || this.scatter.overlaps(x, y, z, r); }

  prebuild(eraId) { this.eraContext(eraId); this.structures.prebuild(eraId); }

  update(dt, camPos) {
    if (!this.eraId) return;
    const g = this.game;
    if (camPos) this.camPos.copy(camPos); else this.camPos.copy(g.gfx.camera.position);
    if (g.tc && g.tc.state === 'departing' && this.prebuiltFor !== g.tc.destination.year) { this.prebuiltFor = g.tc.destination.year; this.prebuild(eraOf(g.tc.destination.year).id); }
    this.lib.update(dt, g.sky);
    this.skyfx.update(dt, this.camPos, g.sky);
    this.weather.update(dt, this.camPos);
    this.scatter.update(dt, this.camPos);
    this.structures.update(dt, this.camPos);
  }

  debug() {
    return { era: this.eraId, year: this.year, label: eraOf(this.year).label, detail: this.detailKey, city: this.city, applyMs: +this.stats.applyMs.toFixed(1), steps: this.stats.steps, changes: this.worldState.log.length, scatter: this.scatter.debug(), structures: this.structures.debug(), weather: this.weather.debug(), turning: this.turning ? this.turning.notes : [] };
  }
}

export { inPoly, distToPolyline };
