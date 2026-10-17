// Roadster 88 era structures: plans every era's buildings from the valley's town, streets, rail and regions (frontier town and railway, 2026 town and highway, 2080 town with maglev, turbines and solar farm, ruins, far-future spires, Hadean basalt), keeps site lineage across eras, builds merged meshes with Rapier colliders, destroys buildings the car hits hard (debris, dust, rubble) and records it in the causality world state.
import * as THREE from 'three/webgpu';
import { Kit, C, rng, hashStr } from './lib.js';
import { SignAtlas } from './signs.js';
import * as B from './buildings.js';
import { GROUP, groups } from '../sim/car.js';
import { ERA_INDEX } from './presets.js';

const MATS = ['wood', 'masonry', 'plaster', 'roof', 'metal', 'glass', 'light', 'scifi', 'rubble', 'sign'];
const BUILD = { falseFront: B.falseFront, hotel: B.hotel, bank: B.bank, church: B.church, barn: B.barn, cabin: B.cabin, depot: B.depot, waterTower: B.waterTower, windmill: B.windmill, locomotive: B.locomotive, railcar: B.railcar, ranch: B.ranch, gasStation: B.gasStation, stripMall: B.stripMall, streetLight: B.streetLight, powerPole: B.powerPole, telegraphPole: B.telegraphPole, billboard: B.billboard, hwSign: B.hwSign, midrise: B.midrise, evHub: B.evHub, ruinShell: B.ruinShell, rubblePile: B.rubblePile, foundation: B.foundation, spire: B.spire, arch: B.arch, floatPad: B.floatPad, basaltColumns: B.basaltColumns, turbineTower: B.turbineTower, prop: B.prop };
const DEBRIS = { wood: { density: 520, size: [2.4, 0.22, 0.06], tint: [0.45, 0.35, 0.25], mat: 'wood', aux: [2, 0.5, 1, 0] }, brick: { density: 1800, size: [0.7, 0.4, 0.5], tint: [0.42, 0.18, 0.11], mat: 'masonry', aux: [0, 0, 0, 0] }, stucco: { density: 1600, size: [0.9, 0.5, 0.7], tint: [0.65, 0.6, 0.52], mat: 'plaster', aux: [0, 0, 0, 0] }, concrete: { density: 2200, size: [1.2, 0.6, 1.0], tint: [0.55, 0.55, 0.53], mat: 'plaster', aux: [1, 0, 0, 0] }, steel: { density: 900, size: [1.6, 0.08, 1.0], tint: [0.4, 0.41, 0.42], mat: 'metal', aux: [0, 0.5, 0.7, 0.3] }, pole: { density: 600, size: [1.8, 0.25, 0.25], tint: [0.3, 0.3, 0.3], mat: 'metal', aux: [0, 0.5, 0.6, 0.2] } };
const PI = Math.PI;

export class Structures {
  constructor(sys) {
    this.sys = sys;
    this.group = new THREE.Group(); this.group.name = 'EraStructures';
    sys.root.add(this.group);
    this.cache = new Map();
    this.colliders = [];
    this.debris = [];
    this.debrisMesh = new Map();
    this.rubble = null;
    this.sitesById = new Map();
    this.rotors = null;
    this.handed = new Set();
  }

  hideSite(key) {
    const w = this.sys.game.phys.world, cur = this.cur;
    if (!cur) return null;
    const m = cur.meta.get(key);
    if (!m) return null;
    for (const rec of (this.byKey && this.byKey.get(key)) || []) if (rec.col) { w.removeCollider(rec.col, false); rec.col = null; }
    const box = new THREE.Box3();
    for (const [mat, r] of cur.ranges.get(key) || []) {
      const geo = cur.geos.get(mat), pos = geo.attributes.position, [a, b] = r;
      for (let i = a; i < b; i++) { box.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))); pos.setXYZ(i, 0, -1000, 0); }
      pos.addUpdateRange(a * 3, (b - a) * 3); pos.needsUpdate = true;
    }
    return { m, box };
  }

  handOver(key) {
    this.handed.add(key);
    const m = this.cur && this.cur.meta.get(key);
    const out = m ? { key, type: m.site.type, x: m.site.x, y: m.y, z: m.site.z, yaw: m.site.yaw || 0, params: m.site.p } : null;
    if (m && !m.site.handed) { this.hideSite(key); m.site.handed = true; }
    return out;
  }

  get signs() { if (!this._signs) this._signs = new SignAtlas(this.sys.lib); return this._signs; }

  mat(name) { return name === 'sign' ? this.signs.mat : this.sys.lib.mats[name]; }

  town() {
    if (this._town) return this._town;
    const S = this.sys, reg = S.region('town');
    const streets = S.roads('street');
    let main = streets.slice().sort((a, b) => b.width - a.width)[0];
    if (!main && reg) { const [x0, z0] = reg.poly[0], [x1, z1] = reg.poly[2]; main = { width: 16, pts: [[Math.max(x0, x1), (z0 + z1) / 2], [Math.min(x0, x1), (z0 + z1) / 2]] }; }
    if (!main) return (this._town = null);
    const p0 = main.pts[0], p1 = main.pts[main.pts.length - 1], len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const d = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len], n = [d[1], -d[0]];
    const T = { p0, d, n, len, hw: main.width / 2, cross: [], railX: null, hwX: null, reg };
    for (const s of streets) { if (s === main) continue; const a = s.pts[0], b = s.pts[s.pts.length - 1]; const sd = [(b[0] - a[0]), (b[1] - a[1])]; const l = Math.hypot(...sd); if (Math.abs((sd[0] * d[0] + sd[1] * d[1]) / l) < 0.3) { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; T.cross.push({ s: (mx - p0[0]) * d[0] + (mz - p0[1]) * d[1], hw: s.width / 2, pts: s.pts }); } else if (s !== main) (T.parallel || (T.parallel = [])).push(s); }
    T.cross.sort((a, b) => a.s - b.s);
    const rail = S.roads('rail')[0];
    if (rail) T.rail = rail;
    const hwy = S.roads('highway')[0];
    if (hwy) T.hwy = hwy;
    T.at = (s, side, off) => { const hw = T.hw + off; const x = p0[0] + d[0] * s + n[0] * side * hw, z = p0[1] + d[1] * s + n[1] * side * hw; return { x, z, yaw: Math.atan2(-side * n[0], -side * n[1]) }; };
    T.free = (s, w) => T.cross.every((c) => Math.abs(s - c.s) > c.hw + w / 2 + 1.5);
    return (this._town = T);
  }

  lineX(road, z) {
    const P = road.pts; let best = P[0], bd = Infinity;
    for (const p of P) { const dd = Math.abs(p[1] - z); if (dd < bd) { bd = dd; best = p; } }
    return best[0];
  }

  roadY(road, z) {
    const P = road.points || road.pts; let best = null, bd = Infinity;
    for (const p of P) { const pz = p.length === 3 ? p[2] : p[1]; const dd = Math.abs(pz - z); if (dd < bd) { bd = dd; best = p; } }
    return best && best.length === 3 ? best[1] : this.sys.valley.heightAt(best[0], best[1]);
  }

  plan(eraId) {
    const T = this.town(), sites = [];
    const add = (key, type, x, z, yaw, p = {}, tags = []) => sites.push({ key, type, x, z, yaw, p, tags });
    const R = rng(hashStr('plan' + eraId));
    if (eraId === 'hadean') {
      const ctx = this.sys.eraContext('hadean');
      ctx.volcanoes.forEach((v, i) => { for (let j = 0; j < 2; j++) { const a = i * 2.1 + j * 2.6, r = v.r * (0.95 + j * 0.15); add(`basalt:${i}:${j}`, 'basaltColumns', v.x + Math.cos(a) * r, v.z + Math.sin(a) * r, a, { n: 26, h: 7 + j * 4, r: 10 + j * 3, rng: rng(i * 31 + j) }); } });
      const lake = this.sys.region('lake');
      if (lake) lake.poly.forEach((p, i) => { if (i % 9 === 0) add(`basaltL:${i}`, 'basaltColumns', p[0] * 1.08 + (lake.center ? -lake.center[0] * 0.08 : 0), p[1] * 1.08 + (lake.center ? -lake.center[1] * 0.08 : 0), i, { n: 18, h: 6, r: 8, rng: rng(500 + i) }); });
      return sites;
    }
    if (eraId === 'dino' || !T) return sites;
    const railX = T.rail ? this.lineX(T.rail, T.p0[1]) : null, hwX = T.hwy ? this.lineX(T.hwy, T.p0[1]) : null;
    const mainZ = T.p0[1];
    const old = [
      [1, 70, 13, 'falseFront', { stories: 2, sign: 'GENERAL STORE', color: [0.62, 0.55, 0.42], trim: C.white, pat: 0 }],
      [1, 85, 10, 'falseFront', { sign: 'BARBER', color: C.white, trim: C.red, pat: 0 }],
      [1, 104, 17, 'hotel', { sign: 'HOTEL', color: [0.75, 0.7, 0.6], trim: C.green }],
      [1, 121, 11, 'falseFront', { sign: 'ASSAY OFFICE', bare: true, color: C.bare, trim: C.bare, pat: 1 }],
      [1, 134, 12, 'bank', { sign: 'BANK' }],
      [1, 164, 11, 'falseFront', { sign: 'POST OFFICE', color: [0.5, 0.56, 0.6], trim: C.white, pat: 0 }],
      [1, 178, 13, 'falseFront', { stories: 2, sign: 'DRY GOODS', color: [0.55, 0.42, 0.3], trim: C.cream, pat: 0 }],
      [1, 196, 10, 'falseFront', { sign: 'SHERIFF', bare: true, color: C.bare, pat: 1 }],
      [-1, 72, 15, 'falseFront', { stories: 2, sign: 'SALOON', color: [0.45, 0.2, 0.12], trim: C.cream, pat: 0, rail: true }],
      [-1, 89, 10, 'falseFront', { sign: 'GZOWO SPRINGS', color: C.white, trim: C.blue, pat: 0 }],
      [-1, 103, 12, 'falseFront', { sign: 'DRY GOODS', bare: true, color: C.bare, pat: 1 }],
      [-1, 118, 10, 'falseFront', { sign: 'BARBER', color: [0.6, 0.62, 0.55], trim: C.white, pat: 0 }],
      [-1, 132, 12, 'falseFront', { stories: 2, sign: 'HOTEL', color: [0.7, 0.6, 0.45], trim: C.green, pat: 0 }],
      [-1, 166, 13, 'falseFront', { sign: 'BLACKSMITH', bare: true, color: C.bare, pat: 1 }],
      [-1, 181, 10, 'falseFront', { sign: 'POST OFFICE', color: C.white, trim: C.red, pat: 0 }],
    ];
    const signs2026 = { 'GENERAL STORE': 'GENERAL STORE', BARBER: 'CAFE', HOTEL: 'HOTEL', 'ASSAY OFFICE': 'ANTIQUES', BANK: 'BANK', 'POST OFFICE': 'POST OFFICE', 'DRY GOODS': 'BREWING CO', SHERIFF: 'SHERIFF', SALOON: 'SALOON', 'GZOWO SPRINGS': 'GZOWO SPRINGS', BLACKSMITH: 'DINER' };
    const paints = [C.white, [0.62, 0.72, 0.68], [0.75, 0.62, 0.42], [0.55, 0.22, 0.15], [0.72, 0.68, 0.6], [0.36, 0.46, 0.52], [0.8, 0.74, 0.58]];
    const growth = (eraId === '2026' || eraId === '2080' || eraId === 'ruins');
    if (eraId === '1885' || eraId === '2026' || eraId === '2080' || eraId === 'ruins') {
      old.forEach(([side, s, w, type, p], i) => {
        if (!T.free(s, w)) return;
        const a = T.at(s, side, 3.2), key = `town:${i}`;
        if (eraId === '1885') add(key, type, a.x, a.z, a.yaw, { ...p, w, seed: i, lit: 0.25, wear: 0.35 }, ['old']);
        else if (eraId === '2026' || eraId === '2080') add(key, type, a.x, a.z, a.yaw, { ...p, w, seed: i, lit: 0.7, wear: 0.06, bare: false, color: type === 'bank' ? C.brick : paints[i % paints.length], sign: signs2026[p.sign] || p.sign, glow: 0.8, roofTint: [0.32, 0.33, 0.35] }, ['old']);
        else add(key, type === 'bank' ? 'ruinShell' : 'rubblePile', a.x, a.z, a.yaw, type === 'bank' ? { w, d: 15, h: 5, mat: 'masonry', tint: C.brick, pat: 0, rng: rng(i) } : { w, d: 12, n: 10, tint: [0.3, 0.26, 0.2], mat: 'wood', rng: rng(i) }, ['old']);
      });
      const cs = T.cross.length ? T.cross[T.cross.length - 1].s : 300;
      const ch = T.at(Math.min(cs - 30, 330), 1, 6);
      if (eraId === '1885') add('town:church', 'church', ch.x, ch.z, ch.yaw, {}, ['old']);
      if (eraId === '2026' || eraId === '2080') add('town:church', 'church', ch.x, ch.z, ch.yaw, { wear: 0.05 }, ['old']);
      const lv = T.at(212, -1, 14);
      if (eraId === '1885') add('town:livery', 'barn', lv.x, lv.z, lv.yaw, { sign: 'LIVERY' }, ['old']);
      if (eraId === '2026') add('town:livery', 'barn', lv.x, lv.z, lv.yaw, { sign: 'ANTIQUES', wear: 0.15 }, ['old']);
      if (eraId === '2080') add('town:livery', 'barn', lv.x, lv.z, lv.yaw, { sign: 'VERTICAL FARM', wear: 0.05, color: [0.4, 0.12, 0.08] }, ['old']);
      if (railX !== null) {
        const dep = { x: railX - 6.6, z: mainZ + T.hw + 3 + 20 + 3 }, ry = PI / 2;
        if (eraId === '1885') add('site:depot', 'depot', dep.x, dep.z, ry, { sign: 'GZOWO SPRINGS' }, ['old', 'rail']);
        if (eraId === '2026' || eraId === '2080') add('site:depot', 'depot', dep.x, dep.z, ry, { sign: 'HISTORIC DEPOT MUSEUM', wear: 0.05, color: [0.7, 0.55, 0.25], glow: 0.6 }, ['old', 'rail']);
        if (eraId === 'ruins') add('site:depot', 'rubblePile', dep.x, dep.z, ry, { w: 20, d: 7, n: 16, tint: [0.32, 0.26, 0.2], mat: 'wood', rng: rng(77) }, ['old']);
        if (eraId === '1885') {
          add('site:watertower', 'waterTower', railX - 7.5, mainZ - T.hw - 16, 0, { sign: 'WATER' }, ['rail']);
          add('site:loco', 'locomotive', railX, mainZ + T.hw + 60, 0, { sign: 'GZOWO SPRINGS', lamp: 1.2 }, ['rail', 'train']);
          add('site:car1', 'railcar', railX, mainZ + T.hw + 42.5, 0, {}, ['rail', 'train']);
          add('site:car2', 'railcar', railX, mainZ + T.hw + 30.9, 0, { passenger: true }, ['rail', 'train']);
        }
        if (eraId === '2026' || eraId === '2080') { const lp = T.at(232, -1, 9); add('site:loco', 'locomotive', lp.x, lp.z, lp.yaw + PI / 2, { sign: 'GZOWO SPRINGS', rust: 0.0 }, ['old']); }
        if (eraId === 'ruins') { const lp = T.at(232, -1, 9); add('site:loco', 'locomotive', lp.x, lp.z, lp.yaw + PI / 2 + 0.2, { rust: 1 }, ['old']); }
      }
      if (eraId === '1885' || eraId === '2026' || eraId === '2080') {
        const PR = rng(hashStr('props' + eraId));
        old.forEach(([side, s, w, type], i) => {
          if (!T.free(s, w)) return;
          const at = (off, along) => T.at(s + along, side, off);
          if (eraId === '1885') {
            const a = at(-0.9, -w * 0.3), b = at(-0.9, w * 0.32);
            if (['hotel', 'falseFront'].includes(type) && i % 2 === 0) add(`prop:hitch:${i}`, 'prop', a.x, a.z, a.yaw, { kind: 'hitch' }, ['old', 'prop']);
            if (i % 3 === 1) add(`prop:trough:${i}`, 'prop', a.x, a.z, a.yaw, { kind: 'trough' }, ['old', 'prop']);
            if (i % 3 !== 1) add(`prop:barrels:${i}`, 'prop', b.x, b.z, b.yaw + 0.1, { kind: PR() < 0.5 ? 'barrels' : 'crates', rng: rng(i + 7) }, ['old', 'prop']);
            if (i % 5 === 2) { const c = at(-3.2, 2); add(`prop:wagon:${i}`, 'prop', c.x, c.z, c.yaw + Math.PI / 2 + (PR() - 0.5) * 0.3, { kind: 'wagon', cover: i % 2 === 0 }, ['old', 'prop']); }
          } else if (i % 2 === 0) {
            const a = at(-0.9, -w * 0.25), b = at(-0.9, w * 0.3);
            add(`prop:bench:${i}`, 'prop', a.x, a.z, a.yaw, { kind: 'bench' }, ['prop']);
            add(`prop:bin:${i}`, 'prop', b.x, b.z, b.yaw, { kind: eraId === '2080' ? 'planter' : 'bin' }, ['prop']);
          }
        });
        if (eraId === '1885') { const lv = T.at(212, -1, 3); add('prop:hay:1', 'prop', lv.x, lv.z, lv.yaw, { kind: 'hay', rng: rng(3) }, ['old', 'prop']); }
      }
      if (eraId === '1885') {
        const cabins = [[150, 1, 40], [150, 1, 75], [150, -1, 40], [150, -1, 80], [270, 1, 45], [270, -1, 50], [290, 1, 90], [250, -1, 95], [320, -1, 40], [360, 1, 60]];
        cabins.forEach(([s, side, off], i) => { const a = T.at(s, side, off); if (!T.free(s, 10)) a.x += T.d[0] * 14; add(`cabin:${i}`, 'cabin', a.x, a.z, a.yaw + (i % 2 ? 0.25 : -0.2), { porch: i % 3 !== 2, seed: i, lit: 0.2, bare: i % 2 === 0, color: i % 2 ? C.white : C.bare, pat: i % 2 ? 0 : 1, roofTint: i % 3 ? C.shingle : C.tin, roofPat: i % 3 ? 1 : 0 }, ['old']); });
        const wm = T.at(240, -1, 70); add('site:windmill', 'windmill', wm.x, wm.z, 0.4, {}, []);
      }
      if (growth) {
        const lots = [];
        for (const c of T.cross) for (const side of [-1, 1]) for (let k = 0; k < 4; k++) lots.push({ s: c.s, side, off: 30 + k * 34, cross: c });
        lots.forEach((L, i) => {
          if (R() < 0.15) return;
          for (const ss of [-1, 1]) {
            const cx = T.p0[0] + T.d[0] * (L.s + ss * (L.cross.hw + 9)) + T.n[0] * L.side * (T.hw + L.off), cz = T.p0[1] + T.d[1] * (L.s + ss * (L.cross.hw + 9)) + T.n[1] * L.side * (T.hw + L.off);
            const yaw = Math.atan2(-ss * T.d[0], -ss * T.d[1]);
            const key = `lot:${i}:${ss}`;
            if (eraId === '2026') add(key, 'ranch', cx + T.d[0] * ss * 4, cz + T.d[1] * ss * 4, yaw, { w: 13 + R() * 4, d: 9 + R() * 2, color: [C.stucco, C.stucco2, [0.78, 0.74, 0.66], [0.6, 0.62, 0.58]][i % 4], seed: i, lit: 0.6, roofPat: i % 3 === 0 ? 1 : 2, roofTint: i % 3 === 0 ? [0.25, 0.22, 0.2] : C.tile }, ['growth']);
            if (eraId === '2080' && (i + (ss > 0 ? 1 : 0)) % 2 === 0) add(key, 'midrise', cx + T.d[0] * ss * 10, cz + T.d[1] * ss * 10, yaw, { w: 22, d: 16, floors: 3 + (i % 3), seed: i, sign: i % 5 === 0 ? 'GZOWO SPRINGS 2080' : null }, ['growth']);
            if (eraId === 'ruins' && (i + (ss > 0 ? 1 : 0)) % 2 === 0) add(key, 'ruinShell', cx + T.d[0] * ss * 10, cz + T.d[1] * ss * 10, yaw, { w: 22, d: 16, h: (3 + (i % 3)) * 3.6 * 0.8, rng: rng(i * 7 + (ss > 0 ? 1 : 0)), tint: [0.62, 0.62, 0.6], pat: 2, slabs: 2 }, ['growth']);
          }
        });
        const fuel = T.at(Math.max(60, (T.cross[0] ? T.cross[0].s : 140) - 70), -1, 60);
        if (eraId === '2026') add('site:fuel', 'gasStation', fuel.x, fuel.z, fuel.yaw, { sign1: 'GZOWO FUEL', sign2: '88 MART' }, ['growth']);
        if (eraId === '2080') add('site:fuel', 'evHub', fuel.x, fuel.z, fuel.yaw, { sign: 'CHARGE  2 MIN' }, ['growth']);
        if (eraId === 'ruins') add('site:fuel', 'rubblePile', fuel.x, fuel.z, fuel.yaw, { w: 20, d: 14, n: 18, tint: [0.5, 0.5, 0.5], mat: 'metal', aux: [0, 0.8, 0.5, 1], rng: rng(9) }, ['growth']);
        const mall = T.at(Math.max(60, (T.cross[0] ? T.cross[0].s : 140) - 70), 1, 62);
        if (eraId === '2026') add('site:mall', 'stripMall', mall.x, mall.z, mall.yaw, { w: 44, signs: ['DINER', 'HARDWARE', 'MOTEL'] }, ['growth']);
        if (eraId === '2080') add('site:mall', 'midrise', mall.x, mall.z, mall.yaw, { w: 34, d: 18, floors: 6, sign: 'GZOWO TRANSIT', seed: 99 }, ['growth']);
        if (eraId === 'ruins') add('site:mall', 'ruinShell', mall.x, mall.z, mall.yaw, { w: 34, d: 18, h: 16, rng: rng(99), tint: [0.62, 0.62, 0.6], pat: 2, slabs: 3 }, ['growth']);
        const sch = T.at(T.cross.length ? T.cross[T.cross.length - 1].s + 40 : 400, 1, 40);
        if (eraId === '2026') add('site:school', 'stripMall', sch.x, sch.z, sch.yaw, { w: 50, signs: ['SCHOOL', 'LIBRARY'], color: [0.72, 0.66, 0.58] }, ['growth']);
        if (eraId === '2080') add('site:school', 'midrise', sch.x, sch.z, sch.yaw, { w: 40, d: 20, floors: 3, sign: 'LIBRARY', seed: 55 }, ['growth']);
        if (eraId === 'ruins') add('site:school', 'ruinShell', sch.x, sch.z, sch.yaw, { w: 40, d: 20, h: 9, rng: rng(55), tint: [0.62, 0.62, 0.6], pat: 2 }, ['growth']);
      }
      if (eraId === '2026' || eraId === '2080' || eraId === 'ruins') {
        for (let s = 40; s < Math.min(T.len - 20, 420); s += 32) for (const side of [-1, 1]) {
          if (!T.free(s, 3)) continue;
          const a = T.at(s, side, 0.6);
          if (eraId === 'ruins') { if (R() < 0.35) add(`light:${s}:${side}`, 'streetLight', a.x, a.z, a.yaw + (R() - 0.5) * 0.6, { dark: true, rust: 1, h: 4 + R() * 4.5 }, []); }
          else add(`light:${s}:${side}`, 'streetLight', a.x, a.z, a.yaw, { style: eraId === '2080' ? 'future' : 'classic' }, []);
        }
      }
    }
    if (T.hwy && (eraId === '2026' || eraId === '2080' || eraId === 'ruins')) {
      const hw = T.hwy;
      const sideX = (z) => this.lineX(hw, z) + (hw.width / 2 + 9);
      if (eraId === '2026') {
        let prev = null;
        for (let z = -2000; z <= 2000; z += 55) {
          const x = sideX(z);
          add(`pp:${z}`, 'powerPole', x, z, PI / 2, { transformer: z % 440 === 0 }, []);
          if (prev) sites.push({ key: `wire:${z}`, type: 'wires', a: prev, b: [x, z], tags: [] });
          prev = [x, z];
        }
        for (const [z, sign, yaw] of [[-1150, 'VISIT GZOWO SPRINGS', PI], [-650, 'ROADSTER 88  0-60 IN 1.1 S', PI], [450, 'VISIT GZOWO SPRINGS', 0], [1050, 'ROADSTER 88  0-60 IN 1.1 S', 0]]) add(`bb:${z}`, 'billboard', sideX(z) + 22, z, yaw, { sign }, []);
        add('hws:1', 'hwSign', sideX(mainZ - 600) - 3, mainZ - 600, PI, { sign: 'GZOWO SPRINGS  EXIT 88' }, []);
        add('hws:2', 'hwSign', sideX(mainZ - 280) - 3, mainZ - 280, PI, { sign: 'MAIN ST  NEXT LEFT' }, []);
      }
      if (eraId === '2080' || eraId === 'ruins') {
        const mx = (z) => this.lineX(hw, z) + hw.width / 2 + 14;
        for (let z = -2000; z <= 2000; z += 40) sites.push({ key: `mag:${z}`, type: 'maglev', x: mx(z), z, z1: z + 40, x1: mx(z + 40), tags: [], ruin: eraId === 'ruins' });
        for (const [z, sign, yaw] of [[-900, 'GZOWO TRANSIT', PI], [700, 'CHARGE  2 MIN', 0]]) if (eraId === '2080') add(`bb:${z}`, 'billboard', mx(z) + 26, z, yaw, { sign, glow: 1.5 }, []);
      }
    }
    if (T.rail && eraId !== 'scifi') {
      sites.push({ key: 'rail', type: 'rail', era: eraId, tags: [] });
      if (eraId === '1885') for (let z = -2000; z <= 2000; z += 45) add(`tg:${z}`, 'telegraphPole', this.lineX(T.rail, z) + 5.5, z, PI / 2, {}, []);
    }
    if (eraId === '2080' || eraId === 'ruins') {
      const spots = this.sys.pickSpots(9, 260, (x, z) => { const h = this.sys.valley.heightAt(x, z); if (h < 160) return -1; return h / 400 - Math.abs(Math.hypot(x, z) - 1500) / 3000; }, 3);
      spots.forEach((p, i) => sites.push({ key: `turbine:${i}`, type: 'turbine', x: p.x, z: p.z, yaw: -0.6 + i * 0.07, tags: [], ruin: eraId === 'ruins', broken: eraId === 'ruins' && i % 3 !== 0 }));
      const lake = this.sys.region('lake');
      if (lake) sites.push({ key: 'solar', type: 'solar', poly: lake.poly, tags: [], ruin: eraId === 'ruins' });
    }
    if (eraId === 'scifi') {
      const reg = T.reg; let cx = 0, cz = 0; for (const [x, z] of reg.poly) { cx += x; cz += z; } cx /= reg.poly.length; cz /= reg.poly.length;
      [[0, 0, 165], [-120, 90, 120], [110, -100, 135], [-150, -120, 95], [140, 110, 105]].forEach(([dx, dz, h], i) => add(`spire:${i}`, 'spire', cx + dx, cz + dz, i * 0.7, { h, r: 7 + h / 30 }, ['scifi']));
      if (T.hwy) add('arch:1', 'arch', this.lineX(T.hwy, 600), 600, 0, { r: 64 }, ['scifi']);
      const mesa = this.sys.region('mesa');
      if (mesa) { const c = mesa.center || [mesa.poly.reduce((a, p) => a + p[0], 0) / mesa.poly.length, mesa.poly.reduce((a, p) => a + p[1], 0) / mesa.poly.length]; add('pad:mesa', 'floatPad', c[0], c[1], 0, { r: 22, y: 0.4 }, ['scifi']); }
      [[-450, 230, 32], [150, -300, 40], [-650, 900, 26]].forEach(([x, z, y], i) => add(`pad:${i}`, 'floatPad', x, z, 0, { r: 15, y }, ['scifi']));
      for (const rd of this.sys.roadList) if (rd.kind === 'highway' || rd.type === 'loop' || rd.kind === 'road') sites.push({ key: 'glow:' + rd.id, type: 'roadglow', road: rd, tags: [] });
    }
    return sites;
  }

  variant(site, eraId) {
    const ws = this.sys.worldState, st = ws.status(site.key, eraId);
    if (st.state === 'intact' || st.state === 'moved') return site;
    if (st.same && site.tags.includes('prop')) return null;
    if (st.same) return { ...site, type: 'rubblePile', p: { w: (site.p.w || 10) + 2, d: 12, n: 18, tint: site.p.color || [0.35, 0.3, 0.24], mat: 'wood', rng: rng(hashStr(site.key)) }, destroyed: true };
    if (site.type === 'rubblePile' || site.type === 'ruinShell') return null;
    if (site.tags.includes('prop')) return null;
    if (site.tags.includes('old') || site.tags.includes('growth')) return { ...site, type: 'foundation', p: { w: site.p.w || 10, d: 14, plaque: ERA_INDEX[eraId] <= ERA_INDEX['2080'] }, destroyed: true };
    return null;
  }

  build(eraId) {
    const t0 = performance.now();
    const turning = this.turning || { suppress: new Set() };
    const kit = new Kit(), meta = new Map();
    const V = this.sys.valley, land = this.sys.scatter.land;
    const sites = this.plan(eraId).filter((s) => !s.tags.some((t) => turning.suppress.has(t)) && !this.handed.has(s.key));
    const extra = { rotors: [], solarCols: [] };
    for (const raw of sites) {
      if (raw.type === 'wires') { const hA = V.heightAt(raw.a[0], raw.a[1]) + 10.2, hB = V.heightAt(raw.b[0], raw.b[1]) + 10.2; kit.at(0, 0, 0, 0); B.wires(kit, raw.a, raw.b, hA, hB, [-1.15, 0, 1.15], 0.9); continue; }
      if (raw.type === 'rail') { this.buildRail(kit, eraId); continue; }
      if (raw.type === 'maglev') { this.buildMaglev(kit, raw); continue; }
      if (raw.type === 'turbine') { this.buildTurbine(kit, raw, extra); continue; }
      if (raw.type === 'solar') { this.buildSolar(kit, raw, land); continue; }
      if (raw.type === 'roadglow') { this.buildRoadGlow(kit, raw.road); continue; }
      const s = this.variant(raw, eraId);
      if (!s) continue;
      const fn = BUILD[s.type]; if (!fn) continue;
      const pr = s.p || {};
      const foot = this.footprint(s);
      kit.at(s.x, foot.y, s.z, s.yaw || 0);
      kit.begin(s.key);
      const info = fn(kit, pr) || {};
      kit.end();
      meta.set(s.key, { site: s, info, y: foot.y });
      const f = info.foot || [5, 5, 0];
      const c = Math.cos(s.yaw || 0), sn = Math.sin(s.yaw || 0);
      land.blockRect(s.x + sn * f[2], s.z + c * f[2], f[0], f[1], -(s.yaw || 0), 2.5);
    }
    const geos = kit.build();
    const meshes = [];
    for (const [m, g] of geos) {
      const mesh = new THREE.Mesh(g, this.mat(m));
      mesh.castShadow = m !== 'light' && m !== 'sign'; mesh.receiveShadow = true; mesh.userData.k = 'era_' + m;
      mesh.frustumCulled = true;
      meshes.push(mesh);
    }
    const ms = performance.now() - t0;
    return { eraId, meshes, geos, ranges: kit.ranges, colliders: kit.colliders, meta, extra, ms, version: this.sys.worldState.version };
  }

  footprint(s) {
    const V = this.sys.valley, f = (BUILD_FOOT[s.type] || [6, 6, -3]);
    const c = Math.cos(s.yaw || 0), sn = Math.sin(s.yaw || 0);
    let hi = -Infinity;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const lx = a * f[0], lz = f[2] + b * f[1]; hi = Math.max(hi, V.heightAt(s.x + lx * c + lz * sn, s.z - lx * sn + lz * c)); }
    if (s.type === 'locomotive' || s.type === 'railcar') { const rail = this.town() && this.town().rail; if (rail && !s.tags.includes('old')) hi = this.roadY(rail, s.z) + 0.35; }
    if (s.type === 'floatPad' || s.type === 'spire' || s.type === 'arch' || s.type === 'basaltColumns') hi = V.heightAt(s.x, s.z);
    return { y: hi };
  }

  buildRail(kit, eraId) {
    const rail = this.town().rail, P = rail.points || rail.pts.map((p) => [p[0], this.sys.valley.heightAt(p[0], p[1]), p[1]]);
    const T = this.town(), near = (z) => Math.abs(z - T.p0[1]) < 500;
    const rust = eraId === 'ruins' ? 1 : eraId === '1885' ? 0.4 : 0.25;
    const tieT = eraId === '2026' || eraId === '2080' ? [0.5, 0.49, 0.46] : [0.24, 0.18, 0.12];
    kit.at(0, 0, 0, 0);
    let acc = 0;
    for (let i = 0; i < P.length - 1; i += 2) {
      const a = P[i], b = P[Math.min(P.length - 1, i + 2)];
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dz);
      if (L < 0.01) continue;
      const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, L);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = (a[2] + b[2]) / 2;
      kit.obox('rubble', mx, my + 0.12, mz, 3.4, 0.32, L + 0.05, pitch, yaw, 0, { tint: eraId === 'ruins' ? [0.2, 0.22, 0.14] : [0.42, 0.4, 0.37], aux: [0, 0, 0, 0] });
      if (eraId === 'ruins' && (i / 2) % 5 === 3) continue;
      for (const s of [-1, 1]) kit.obox('metal', mx + Math.cos(yaw) * s * 0.75, my + 0.42, mz - Math.sin(yaw) * s * 0.75, 0.08, 0.14, L + 0.02, pitch, yaw, 0, { tint: [0.33, 0.3, 0.28], aux: [0, 0.35, 0.9, rust] });
      const step = near(mz) ? 0.65 : 1.3;
      for (acc += L; acc > step; acc -= step) {
        const t = 1 - (acc - step) / L; if (t < 0 || t > 1) continue;
        if (eraId === 'ruins' && Math.sin(acc * 91.7 + i) > 0.3) continue;
        kit.obox(eraId === '2026' || eraId === '2080' ? 'plaster' : 'wood', a[0] + dx * t, a[1] + dy * t + 0.3, a[2] + dz * t, 2.5, 0.16, 0.24, 0, yaw, 0, { tint: tieT, aux: eraId === '2026' || eraId === '2080' ? [1, 0, 0, 0] : [2, 0.6, 1, 0] });
      }
    }
  }

  buildMaglev(kit, s) {
    const V = this.sys.valley, h = 10, ruin = s.ruin, R = rng(hashStr(s.key));
    const y0 = V.heightAt(s.x, s.z), y1 = V.heightAt(s.x1, s.z1);
    kit.at(s.x, y0, s.z, 0);
    kit.begin(s.key);
    const tilt = ruin && R() < 0.25 ? (R() - 0.5) * 0.4 : 0;
    kit.obox('plaster', 0, h / 2 - 0.5, 0, 1.6, h + 1, 1.6, tilt, 0, tilt * 0.5, { tint: [0.82, 0.83, 0.83], aux: [1, 0, 0, 0] });
    kit.obox('plaster', 0, h + 0.4, 0, 6.5, 1.0, 2.2, 0, 0, tilt, { tint: [0.85, 0.86, 0.86], aux: [1, 0, 0, 0] });
    kit.collider(0, h / 2, 0, 0.8, h / 2, 0.8, 0, 'pole');
    const L = Math.hypot(s.x1 - s.x, s.z1 - s.z, y1 - y0);
    if (!ruin || R() < 0.4) {
      const yaw = Math.atan2(s.x1 - s.x, s.z1 - s.z), pitch = -Math.atan2(y1 - y0, Math.hypot(s.x1 - s.x, s.z1 - s.z));
      kit.obox('plaster', (s.x1 - s.x) / 2, h + 1.6 + (y1 - y0) / 2, (s.z1 - s.z) / 2, 4.2, 1.5, L, pitch, yaw, 0, { tint: [0.88, 0.89, 0.9], aux: [2, 0, 0, 0], bottom: true });
      if (!ruin) kit.obox('light', (s.x1 - s.x) / 2, h + 0.88 + (y1 - y0) / 2, (s.z1 - s.z) / 2, 0.1, 0.06, L, pitch, yaw, 0, { tint: [0.5, 0.85, 1.0], aux: [0.6, 3, 0, 0], bottom: true });
      kit.collider((s.x1 - s.x) / 2, h + 1.6 + (y1 - y0) / 2, (s.z1 - s.z) / 2, 2.1, 0.75, L / 2, yaw, 'beam');
    } else {
      kit.obox('plaster', 6 + R() * 4, 1.2, 20, 4.2, 1.5, L * 0.9, R() * 0.3, 0.3 + R() * 0.5, R() * 0.4, { tint: [0.5, 0.52, 0.45], aux: [2, 0, 0, 0], bottom: true });
      kit.collider(8, 1.2, 20, 2.2, 0.9, L * 0.45, 0.5, 'beam');
    }
    kit.end();
  }

  buildTurbine(kit, s, extra) {
    const V = this.sys.valley, y = V.heightAt(s.x, s.z) - 1, h = s.broken ? 38 + (hashStr(s.key) % 20) : 82;
    kit.at(s.x, y, s.z, s.yaw);
    kit.begin(s.key);
    kit.cyl('plaster', 0, 0, 0, 1.5, 2.4, h, 16, { tint: s.ruin ? [0.5, 0.5, 0.47] : [0.9, 0.91, 0.9], aux: [2, 0, 0, 0], cap: true });
    if (!s.broken) { kit.box('plaster', 0, h, -1.2, 3.2, 3.4, 9, { tint: s.ruin ? [0.48, 0.48, 0.45] : [0.92, 0.93, 0.92], aux: [2, 0, 0, 0], bottom: true }); extra.rotors.push({ x: s.x, y: y + h + 1.7, z: s.z, yaw: s.yaw, ruin: s.ruin, phase: (hashStr(s.key) % 100) / 16 }); }
    else for (let i = 0; i < 2; i++) kit.obox('plaster', 12 + i * 9, 1.2, 8 - i * 14, 38, 0.5, 2.4, 0.05, 0.8 + i * 1.7, 0.08, { tint: [0.55, 0.55, 0.52], aux: [2, 0, 0, 0], bottom: true });
    kit.collider(0, h / 2, 0, 2.2, h / 2, 2.2, 0, 'pole');
    kit.end();
  }

  buildRoadGlow(kit, rd) {
    const P = rd.points || rd.pts.map((p) => [p[0], this.sys.valley.heightAt(p[0], p[1]), p[1]]);
    const half = rd.width / 2 - 0.6, n = P.length, step = 2;
    kit.at(0, 0, 0, 0);
    for (let i = 0; i + step < n || (rd.closed && i < n); i += step) {
      const a = P[i], b = P[(i + step) % n];
      const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz);
      if (L < 0.5 || L > 40) continue;
      const nx = -dz / L, nz = dx / L, yaw = Math.atan2(dx, dz), pitch = -Math.atan2(b[1] - a[1], L);
      for (const s of [-1, 1]) {
        const k = (i / step) % 6 === 0 ? 1.6 : 1;
        kit.obox('light', (a[0] + b[0]) / 2 + nx * half * s, (a[1] + b[1]) / 2 + 0.06, (a[2] + b[2]) / 2 + nz * half * s, 0.18, 0.05, L * 0.8, pitch, yaw, 0, { tint: [0.45, 0.8, 1.0], aux: [0.35 * k, 2.2 * k, 0, 0], bottom: false });
      }
    }
  }

  buildSolar(kit, s, land) {
    const poly = s.poly, V = this.sys.valley;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, cx = 0, cz = 0;
    for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); cx += x; cz += z; }
    cx /= poly.length; cz /= poly.length;
    const shrink = poly.map(([x, z]) => [cx + (x - cx) * 0.9, cz + (z - cz) * 0.9]);
    const inside = (x, z) => { let c = false; for (let i = 0, j = shrink.length - 1; i < shrink.length; j = i++) { const [xi, zi] = shrink[i], [xj, zj] = shrink[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
    kit.at(0, 0, 0, 0);
    const seg = 24, R = rng(42);
    let row = 0;
    for (let z = z0 + 10; z < z1 - 10; z += 11, row++) {
      let run = null;
      const close = () => { if (run) { const cx2 = (run.x0 + run.x1) / 2; kit.collider(cx2, run.y + 1.5, z, (run.x1 - run.x0) / 2 - 0.3, 0.9, 1.9, 0, 'solar'); run = null; } };
      for (let x = x0; x < x1; x += seg) {
        const mx = x + seg / 2;
        const lane = Math.abs(((mx - cx) % 160 + 160) % 160 - 80) < 12;
        if (lane || !inside(mx, z) || !inside(x, z) || !inside(x + seg, z)) { close(); continue; }
        if (s.ruin && R() < 0.45) { close(); continue; }
        const y = V.heightAt(mx, z);
        const tilt = s.ruin ? 0.45 + (R() - 0.5) * 0.8 : 0.45;
        kit.obox('metal', mx, y + 1.7, z, seg - 0.6, 0.06, 4.0, tilt, 0, s.ruin ? (R() - 0.5) * 0.3 : 0, { tint: s.ruin ? [0.06, 0.06, 0.07] : [0.02, 0.03, 0.07], aux: [0, 0.18, 0.75, s.ruin ? 0.8 : 0] });
        for (let k = 0; k <= 4; k++) kit.box('metal', x + 0.3 + k * (seg - 0.6) / 4, y - 0.2, z, 0.1, 1.9, 0.1, { tint: [0.6, 0.6, 0.62], aux: [0, 0.4, 0.9, s.ruin ? 0.8 : 0] });
        if (!run) run = { x0: x, x1: x + seg, y }; else { run.x1 = x + seg; run.y = Math.max(run.y, y); }
      }
      close();
    }
  }

  enter(eraId, turning) {
    this.leave();
    this.eraId = eraId; this.turning = turning;
    const land = this.sys.scatter.land;
    land.clearBlock();
    const B0 = this.build(eraId);
    this.cur = B0;
    for (const m of B0.meshes) this.group.add(m);
    const R = this.sys.game.R, w = this.sys.game.phys.world;
    this.colliders = [];
    this.byKey = new Map();
    for (const c of B0.colliders) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, c.ry || 0, c.rz || 0, 'YXZ'));
      const d = R.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setTranslation(c.x, c.y, c.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setFriction(0.7).setCollisionGroups(groups(GROUP.STATIC, 0xffff));
      const col = w.createCollider(d);
      col.userData = { kind: 'era', tag: c.tag === 'pole' ? 'pole' : c.tag, r: Math.min(c.hx, c.hz), key: c.id };
      const rec = { col, def: c, key: c.id };
      this.colliders.push(rec);
      if (c.id) { let l = this.byKey.get(c.id); if (!l) this.byKey.set(c.id, (l = [])); l.push(rec); }
    }
    this.setupRotors(B0.extra.rotors);
    this.plantFlora(eraId);
    this.buildRubble();
  }

  plantFlora(eraId) {
    const T = this.town(), list = [];
    if (T && (eraId === '2026' || eraId === '2080')) {
      for (let s = 56; s < Math.min(T.len - 20, 420); s += 32) for (const side of [-1, 1]) {
        if (!T.free(s + 16, 4)) continue;
        const a = T.at(s + 16, side, 1.2), y = this.sys.valley.heightAt(a.x, a.z);
        list.push({ sp: eraId === '2026' ? 'palm' : 'oak', key: `street:${s}:${side}`, x: a.x, y, z: a.z, s: eraId === '2026' ? 0.85 + ((s * 7) % 5) * 0.06 : 0.55, sy: eraId === '2026' ? 0.85 + ((s * 13) % 7) * 0.05 : 0.55, rot: s * 1.7 });
      }
      if (eraId === '2026' && T.hwy) for (let z = -1600; z < 1600; z += 14) { if (Math.abs(z - T.p0[1]) < 520) continue; const x = this.lineX(T.hwy, z) - T.hwy.width / 2 - 70; list.push({ sp: 'eucalyptus', key: `euc:${z}`, x, y: this.sys.valley.heightAt(x, z), z, s: 0.8 + ((z * 7) % 9) / 30, sy: 0.85 + ((z * 3) % 7) / 25, rot: z }); }
    }
    this.sys.scatter.plant(eraId, list);
  }

  setupRotors(list) {
    if (!list.length) { if (this.rotors) this.rotors.mesh.visible = false; return; }
    if (!this.rotors) {
      const kit = new Kit(); kit.at(0, 0, 0, 0);
      kit.cyl('plaster', 0, -1.2, 0, 0.9, 1.3, 2.4, 12, { tint: [0.92, 0.93, 0.92], aux: [2, 0, 0, 0], rx: Math.PI / 2 });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; kit.obox('plaster', Math.cos(a) * 21, Math.sin(a) * 21, 0.6, 40, 2.2, 0.35, 0, 0.12, a, { tint: [0.92, 0.93, 0.92], aux: [2, 0, 0, 0], bottom: true }); }
      const g = kit.build().get('plaster');
      const mesh = new THREE.InstancedMesh(g, this.sys.lib.mats.plaster, 32); mesh.castShadow = true; mesh.frustumCulled = false; mesh.userData.k = 'rotors';
      this.group.add(mesh);
      this.rotors = { mesh, list: [] };
    }
    this.rotors.list = list; this.rotors.mesh.count = list.length; this.rotors.mesh.visible = true; this.rotors.t = 0;
  }

  buildRubble() {
    if (this.rubble) { for (const m of this.rubble.meshes) { this.group.remove(m); m.geometry.dispose(); } for (const c of this.rubble.cols) this.sys.game.phys.world.removeCollider(c, false); }
    this.rubble = null;
  }

  leave() {
    const w = this.sys.game.phys.world;
    if (this.cur) for (const m of this.cur.meshes) { this.group.remove(m); m.geometry.dispose(); }
    this.cur = null;
    for (const c of this.colliders) if (c.col) w.removeCollider(c.col, false);
    this.colliders = [];
    for (const d of this.debris) if (d.body) w.removeRigidBody(d.body);
    this.debris = [];
    for (const [, D] of this.debrisMesh) { D.mesh.count = 0; D.n = 0; }
    this.buildRubble();
  }

  prebuild() {}

  destroy(key, vel, hitPos) {
    const g = this.sys.game, w = g.phys.world, cur = this.cur;
    if (!cur) return null;
    const m = cur.meta.get(key);
    if (!m || m.site.destroyed) return null;
    m.site.destroyed = true;
    const { box } = this.hideSite(key);
    this.sys.worldState.record(key, this.eraId, 'destroyed', { type: m.site.type });
    const cls = DEBRIS[m.info.cls] || DEBRIS.wood;
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const n = m.info.small ? Math.min(10, Math.max(5, Math.round(size.x * size.z * 3))) : Math.min(46, Math.max(10, Math.round(size.x * size.z / 6)));
    this.spawnDebris(cls, m.info.cls, box, vel, n, hitPos || center);
    if (m.info.small) { if (g.audio) g.audio.play('impact_medium', { pos: { x: center.x, y: center.y, z: center.z }, gain: 0.8 }); if (g.fx) g.fx.dustBurst(center, 6, 1.2); return { key, type: m.site.type, n }; }
    const s = m.site, rk = new Kit();
    rk.at(s.x, m.y, s.z, s.yaw || 0);
    B.rubblePile(rk, { w: Math.max(4, (s.p.w || 8)), d: Math.max(4, Math.min(16, size.z * 0.6)), n: 16, tint: cls.tint, mat: cls.mat, aux: cls.aux, rng: rng(hashStr(key)) });
    for (const [mat, geo] of rk.build()) { const mesh = new THREE.Mesh(geo, this.mat(mat)); mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh); (this.rubble || (this.rubble = { meshes: [], cols: [] })).meshes.push(mesh); }
    const R = g.R, rc = w.createCollider(R.ColliderDesc.cuboid(Math.max(2, size.x * 0.35), 0.35, Math.max(2, size.z * 0.35)).setTranslation(center.x, m.y + 0.2, center.z).setFriction(0.8).setCollisionGroups(groups(GROUP.STATIC, 0xffff)));
    rc.userData = { kind: 'era', tag: 'rubble' };
    (this.rubble || (this.rubble = { meshes: [], cols: [] })).cols.push(rc);
    const p = hitPos || center;
    if (g.fx) { g.fx.dustBurst(p, 24, 3.2); for (let i = 0; i < 26; i++) g.fx.alpha.spawn(center.x + (Math.random() - 0.5) * size.x, m.y + Math.random() * size.y * 0.6, center.z + (Math.random() - 0.5) * size.z, vel.x * 0.15 + (Math.random() - 0.5) * 4, 1 + Math.random() * 3, vel.z * 0.15 + (Math.random() - 0.5) * 4, 3 + Math.random() * 3, 2, 6 + Math.random() * 6, 0.55, 0.5, 0.44, 0.45, 0.6, 0.3); }
    if (g.audio) { g.audio.play('impact_heavy', { pos: { x: p.x, y: p.y, z: p.z }, gain: 1 }); g.audio.play('metal_crunch', { pos: { x: p.x, y: p.y, z: p.z }, gain: 0.6 }); if (m.info.cls !== 'pole') g.audio.play('glass_shatter', { pos: { x: p.x, y: p.y, z: p.z }, gain: 0.7 }); }
    return { key, type: m.site.type, n };
  }

  debrisFor(clsName) {
    let D = this.debrisMesh.get(clsName);
    if (D) return D;
    const cls = DEBRIS[clsName] || DEBRIS.wood;
    const g = new THREE.BoxGeometry(1, 1, 1);
    const n = g.attributes.position.count;
    g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    const aux = new Float32Array(n * 4); for (let i = 0; i < n; i++) aux.set(cls.aux, i * 4);
    g.setAttribute('aux', new THREE.BufferAttribute(aux, 4));
    const mesh = new THREE.InstancedMesh(g, this.mat(cls.mat), 220);
    mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.userData.k = 'debris_' + clsName;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(220 * 3).fill(1), 3);
    this.group.add(mesh);
    D = { mesh, n: 0, cls };
    this.debrisMesh.set(clsName, D);
    return D;
  }

  spawnDebris(cls, clsName, box, vel, n, hit) {
    const g = this.sys.game, R = g.R, w = g.phys.world, D = this.debrisFor(clsName);
    const size = box.getSize(new THREE.Vector3());
    const sp = Math.hypot(vel.x, vel.z) || 1;
    for (let i = 0; i < n; i++) {
      if (this.debris.length > 150) { const old = this.debris.shift(); if (old.body) { w.removeRigidBody(old.body); old.body = null; } }
      if (D.n >= 220) break;
      const sx = cls.size[0] * (0.5 + Math.random()), sy = cls.size[1] * (0.6 + Math.random() * 0.8), sz = cls.size[2] * (0.6 + Math.random() * 0.8);
      const p = new THREE.Vector3(box.min.x + Math.random() * size.x, box.min.y + 0.3 + Math.random() * Math.max(0.5, size.y * 0.7), box.min.z + Math.random() * size.z);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      const body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.15).setAngularDamping(0.4).setCcdEnabled(sp > 30));
      const mass = Math.max(4, sx * sy * sz * cls.density);
      w.createCollider(R.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setMass(mass).setFriction(0.8).setRestitution(0.15).setCollisionGroups(groups(GROUP.DEBRIS, GROUP.STATIC | GROUP.CAR | GROUP.DEBRIS)), body);
      const near = Math.max(0, 1 - p.distanceTo(hit) / 10);
      const k = 0.25 + near * 0.6;
      body.setLinvel({ x: vel.x * k + (Math.random() - 0.5) * 6, y: 1 + Math.random() * 5 * (0.4 + near), z: vel.z * k + (Math.random() - 0.5) * 6 }, true);
      body.setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 }, true);
      const i3 = D.n * 3, t = cls.tint, v = 0.8 + Math.random() * 0.4;
      D.mesh.instanceColor.array.set([t[0] * v, t[1] * v, t[2] * v], i3); D.mesh.instanceColor.needsUpdate = true;
      this.debris.push({ body, D, i: D.n++, s: new THREE.Vector3(sx, sy, sz), t: 0 });
    }
    D.mesh.count = D.n;
  }

  checkHits(dt) {
    const g = this.sys.game, car = g.car;
    if (!car || !car.view.root.visible || !this.cur) return;
    const s = car.sim, v = s.vel, sp = Math.hypot(v.x, v.y, v.z);
    if (sp < 8) return;
    const T = Math.max(0.05, dt * 2.5);
    const px = s.pos.x, py = s.pos.y, pz = s.pos.z;
    const q = new THREE.Quaternion(), inv = new THREE.Quaternion(), lp = new THREE.Vector3(), lv = new THREE.Vector3();
    for (const rec of this.colliders) {
      if (!rec.col || !rec.key) continue;
      const c = rec.def;
      const dx = c.x - px, dz = c.z - pz, rr = Math.max(c.hx, c.hz) + sp * T + 4;
      if (dx * dx + dz * dz > rr * rr) continue;
      const m = this.cur.meta.get(rec.key);
      if (!m || m.site.destroyed) continue;
      const bv = m.info.breakV || 999;
      if (sp < bv * 0.8) continue;
      q.setFromEuler(new THREE.Euler(0, c.ry || 0, c.rz || 0, 'YXZ')); inv.copy(q).invert();
      lp.set(px - c.x, py + 0.6 - c.y, pz - c.z).applyQuaternion(inv);
      lv.set(v.x, v.y, v.z).applyQuaternion(inv);
      const pad = 1.3;
      let t0 = 0, t1 = T, hit = true;
      for (const [p0, d0, h] of [[lp.x, lv.x, c.hx + pad], [lp.y, lv.y, c.hy + 0.8], [lp.z, lv.z, c.hz + pad]]) {
        if (Math.abs(d0) < 1e-6) { if (Math.abs(p0) > h) { hit = false; break; } continue; }
        let a = (-h - p0) / d0, b = (h - p0) / d0; if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) { hit = false; break; }
      }
      if (!hit) continue;
      const nrm = new THREE.Vector3(), ax = Math.abs(lp.x) / (c.hx + pad), az = Math.abs(lp.z) / (c.hz + pad), ay = Math.abs(lp.y) / (c.hy + 0.8);
      if (ax >= az && ax >= ay) nrm.set(Math.sign(lp.x), 0, 0); else if (az >= ay) nrm.set(0, 0, Math.sign(lp.z)); else nrm.set(0, Math.sign(lp.y), 0);
      nrm.applyQuaternion(q);
      const vn = -(v.x * nrm.x + v.y * nrm.y + v.z * nrm.z);
      if (vn < bv) continue;
      this.destroy(rec.key, v, new THREE.Vector3(px + v.x * t0, py + 0.6 + v.y * t0, pz + v.z * t0));
    }
  }

  update(dt, cam) {
    if (!this.cur) return;
    this.checkHits(dt);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3();
    const dirty = new Set();
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      if (!d.body) continue;
      const t = d.body.translation(), r = d.body.rotation();
      P.set(t.x, t.y, t.z); Q.set(r.x, r.y, r.z, r.w);
      M.compose(P, Q, d.s); d.D.mesh.setMatrixAt(d.i, M); dirty.add(d.D);
      if ((d.t > 3 && d.body.isSleeping()) || d.t > 25) { this.sys.game.phys.world.removeRigidBody(d.body); d.body = null; }
    }
    for (const D of dirty) D.mesh.instanceMatrix.needsUpdate = true;
    if (this.rotors && this.rotors.mesh.visible) {
      this.rotors.t += dt;
      const E = new THREE.Euler(), S1 = new THREE.Vector3(1, 1, 1);
      this.rotors.list.forEach((r, i) => { E.set(0, r.yaw, r.ruin ? r.phase : r.phase + this.rotors.t * 1.35, 'YXZ'); Q.setFromEuler(E); P.set(r.x, r.y, r.z).add(new THREE.Vector3(0, 0, 3.4).applyEuler(new THREE.Euler(0, r.yaw, 0))); M.compose(P, Q, S1); this.rotors.mesh.setMatrixAt(i, M); });
      this.rotors.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  overlaps(x, y, z, r) {
    for (const rec of this.colliders) { if (!rec.col) continue; const c = rec.def; if (Math.abs(x - c.x) < c.hx + r + 0.5 && Math.abs(z - c.z) < c.hz + r + 0.5 && Math.abs(y - c.y) < c.hy + 1.5) return true; }
    return false;
  }

  debug() { return this.cur ? { meshes: this.cur.meshes.length, colliders: this.colliders.length, buildMs: +this.cur.ms.toFixed(1), sites: this.cur.meta.size, debris: this.debris.length } : {}; }
}

const BUILD_FOOT = { prop: [0.8, 0.5, 0], falseFront: [6, 9, -8], hotel: [8, 10, -9], bank: [6, 8, -7], church: [5, 9, -9], barn: [7, 10, -10], cabin: [4, 3.5, -3], depot: [11, 4, -3.7], waterTower: [3, 3, 0], windmill: [1, 1, 0], ranch: [7, 5, -5], gasStation: [9, 9, 4], stripMall: [21, 8, -7], midrise: [11, 8, -8], evHub: [15, 7, 7], ruinShell: [11, 8, -8], rubblePile: [5, 5, 0], foundation: [5, 7, -7], streetLight: [0.3, 0.3, 0], powerPole: [0.3, 0.3, 0], telegraphPole: [0.3, 0.3, 0], billboard: [5, 1, 0], hwSign: [3, 0.5, 0], spire: [10, 10, 0], arch: [10, 4, 0], floatPad: [4, 4, 0], basaltColumns: [6, 6, 0], locomotive: [1.5, 9, -2], railcar: [1.5, 5.5, 0], turbineTower: [2, 2, 0] };
