// Roadster 88 era structures: builds what sites.js plans for the period and year from the valley's town, streets, rail and regions (villages, mission, camps, frontier town and railway, brick and mid-century towns, the 2026 town and highway, maglev, sky towers, turbines and solar farm, ruins, spires, crystals, Hadean basalt), keeps site lineage across eras, builds merged meshes with Rapier colliders, destroys buildings the car hits hard (debris, dust, rubble) and records it in the causality world state.
import * as THREE from 'three/webgpu';
import { Kit, C, rng, hashStr } from './lib.js';
import { SignAtlas } from './signs.js';
import * as B from './buildings.js';
import * as B2 from './buildings2.js';
import { planSites, plantedFor } from './sites.js';
import { periodInfo, PERIOD_INDEX } from './periods.js';
import { GROUP, groups } from '../sim/car.js';

const MATS = ['wood', 'masonry', 'plaster', 'roof', 'metal', 'glass', 'light', 'scifi', 'rubble', 'sign'];
const BUILD = { falseFront: B.falseFront, hotel: B.hotel, bank: B.bank, church: B.church, barn: B.barn, cabin: B.cabin, depot: B.depot, waterTower: B.waterTower, windmill: B.windmill, locomotive: B.locomotive, railcar: B.railcar, ranch: B.ranch, gasStation: B.gasStation, stripMall: B.stripMall, streetLight: B.streetLight, powerPole: B.powerPole, telegraphPole: B.telegraphPole, billboard: B.billboard, hwSign: B.hwSign, midrise: B.midrise, evHub: B.evHub, ruinShell: B.ruinShell, rubblePile: B.rubblePile, foundation: B.foundation, spire: B.spire, arch: B.arch, floatPad: B.floatPad, basaltColumns: B.basaltColumns, turbineTower: B.turbineTower, prop: B.prop, ...B2 };
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

  plan(eraId) { return planSites(this, eraId, this.year === undefined ? 2026 : this.year, periodInfo(eraId)); }

  variant(site, eraId) {
    const ws = this.sys.worldState, st = ws.status(site.key, eraId);
    if (st.state === 'intact' || st.state === 'moved') return site;
    if (st.same && site.tags.includes('prop')) return null;
    if (st.same) return { ...site, type: 'rubblePile', p: { w: (site.p.w || 10) + 2, d: 12, n: 18, tint: site.p.color || [0.35, 0.3, 0.24], mat: 'wood', rng: rng(hashStr(site.key)) }, destroyed: true };
    if (site.type === 'rubblePile' || site.type === 'ruinShell') return null;
    if (site.tags.includes('prop')) return null;
    if (site.tags.includes('old') || site.tags.includes('growth') || site.tags.includes('mission')) return { ...site, type: 'foundation', p: { w: site.p.w || site.p.l || 10, d: 14, plaque: PERIOD_INDEX[eraId] >= PERIOD_INDEX['1900'] && PERIOD_INDEX[eraId] <= PERIOD_INDEX['2300'] }, destroyed: true };
    return null;
  }

  build(eraId) {
    const t0 = performance.now();
    const turning = this.turning || { suppress: new Set() };
    const kit = new Kit(), meta = new Map();
    kit.signRect = (n) => this.signs.rect(n);
    const V = this.sys.valley, land = this.sys.scatter.land;
    const sites = this.plan(eraId).filter((s) => !s.tags.some((t) => turning.suppress.has(t)) && !this.handed.has(s.key));
    const extra = { rotors: [], solarCols: [] }, blocks = [];
    for (const raw of sites) {
      if (raw.type === 'wires') { const wh = raw.h || 10.2, hA = V.heightAt(raw.a[0], raw.a[1]) + wh, hB = V.heightAt(raw.b[0], raw.b[1]) + wh; kit.at(0, 0, 0, 0); B.wires(kit, raw.a, raw.b, hA, hB, wh < 9 ? [-0.65, -0.25, 0.25, 0.65] : [-1.15, 0, 1.15], 0.9); continue; }
      if (raw.type === 'rail') { this.buildRail(kit, raw); continue; }
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
      const br = [s.x + sn * f[2], s.z + c * f[2], f[0], f[1], -(s.yaw || 0), 2.5]; blocks.push(br); land.blockRect(...br);
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
    return { eraId, meshes, geos, ranges: kit.ranges, colliders: kit.colliders, meta, extra, ms, blocks, version: this.sys.worldState.version };
  }

  footprint(s) {
    const V = this.sys.valley, f = (BUILD_FOOT[s.type] || [6, 6, -3]);
    const c = Math.cos(s.yaw || 0), sn = Math.sin(s.yaw || 0);
    let hi = -Infinity;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const lx = a * f[0], lz = f[2] + b * f[1]; hi = Math.max(hi, V.heightAt(s.x + lx * c + lz * sn, s.z - lx * sn + lz * c)); }
    if (s.type === 'locomotive' || s.type === 'railcar') { const rail = this.town() && this.town().rail; if (rail && !s.tags.includes('old')) hi = this.roadY(rail, s.z) + 0.35; }
    if (s.type === 'floatPad' || s.type === 'spire' || s.type === 'arch' || s.type === 'basaltColumns' || s.type === 'crystals' || s.type === 'iceSpire' || s.type === 'vents' || s.type === 'canoe' || s.type === 'sluice') hi = V.heightAt(s.x, s.z);
    return { y: hi };
  }

  buildRail(kit, raw) {
    const rail = this.town().rail, P = rail.points || rail.pts.map((p) => [p[0], this.sys.valley.heightAt(p[0], p[1]), p[1]]);
    const T = this.town(), near = (z) => Math.abs(z - T.p0[1]) < 500, y = raw.year || 2026, ruin = raw.ruin;
    const eraId = ruin ? 'ruins' : y < 1960 ? '1885' : '2026';
    const rust = ruin ? 1 : y < 1900 ? 0.4 : 0.25;
    const tieT = eraId === '2026' ? [0.5, 0.49, 0.46] : [0.24, 0.18, 0.12];
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
        kit.obox(eraId === '2026' ? 'plaster' : 'wood', a[0] + dx * t, a[1] + dy * t + 0.3, a[2] + dz * t, 2.5, 0.16, 0.24, 0, yaw, 0, { tint: tieT, aux: eraId === '2026' ? [1, 0, 0, 0] : [2, 0.6, 1, 0] });
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

  enter(eraId, turning, year) {
    this.leave();
    this.eraId = eraId; this.turning = turning; this.year = year === undefined ? 2026 : year;
    const land = this.sys.scatter.land;
    land.clearBlock();
    let sig = 0;
    for (const [, list] of this.sys.worldState.changes) for (const c of list) if (c.state === 'destroyed' && c.year <= this.year) sig = (sig * 31 + c.t) >>> 0;
    const ck = [eraId, this.sys.detailKey, sig, [...this.handed].sort().join(','), (turning && turning.notes ? turning.notes.join(',') : '')].join('|');
    let B0 = this.cache.get(ck);
    if (B0) { this.cache.delete(ck); this.cache.set(ck, B0); for (const br of B0.blocks) land.blockRect(...br); B0.ms = 0; }
    else {
      B0 = this.build(eraId); B0.cached = true;
      this.cache.set(ck, B0);
      while (this.cache.size > 6) { const [k0, old] = this.cache.entries().next().value; this.cache.delete(k0); if (old !== this.cur) for (const m of old.meshes) m.geometry.dispose(); }
    }
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

  plantFlora(eraId) { this.sys.scatter.plant(eraId, plantedFor(this, eraId, this.year, periodInfo(eraId))); }

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
    if (this.cur) for (const m of this.cur.meshes) { this.group.remove(m); if (!this.cur.cached) m.geometry.dispose(); }
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

const BUILD_FOOT = { tuleHut: [2.6, 2.6, -2.4], granary: [1, 1, 0], sweatLodge: [4.5, 4.5, -4.2], dryingRack: [1.8, 0.4, 0], canoe: [0.5, 2.5, 0], firePit: [1, 1, 0], missionChurch: [8, 17, -16], arcade: [15, 6, -2], adobeWall: [6, 0.5, 0], adobeHouse: [5, 3.5, -3], corral: [9, 7, -6], tent: [1.8, 2.2, -2], bigTent: [4.6, 7, -7], sluice: [0.8, 7, 0], brickBlock: [6, 9, -7], theatre: [9, 11, -10], derrick: [4, 4, 0], oldStation: [4.5, 6, 0.5], bungalow: [5.5, 6, -3], diner: [9, 6, -3], motel: [24, 6, -2], driveIn: [16, 30, 24], bigBox: [36, 26, -25], cellTower: [1.5, 1.5, 0], tower: [13, 14, -11], crystals: [6, 6, 0], iceSpire: [10, 10, 0], vents: [6, 6, 0], smallLamp: [0.3, 0.3, 0], cobraLight: [0.3, 0.3, 0], prop: [0.8, 0.5, 0], falseFront: [6, 9, -8], hotel: [8, 10, -9], bank: [6, 8, -7], church: [5, 9, -9], barn: [7, 10, -10], cabin: [4, 3.5, -3], depot: [11, 4, -3.7], waterTower: [3, 3, 0], windmill: [1, 1, 0], ranch: [7, 5, -5], gasStation: [9, 9, 4], stripMall: [21, 8, -7], midrise: [11, 8, -8], evHub: [15, 7, 7], ruinShell: [11, 8, -8], rubblePile: [5, 5, 0], foundation: [5, 7, -7], streetLight: [0.3, 0.3, 0], powerPole: [0.3, 0.3, 0], telegraphPole: [0.3, 0.3, 0], billboard: [5, 1, 0], hwSign: [3, 0.5, 0], spire: [10, 10, 0], arch: [10, 4, 0], floatPad: [4, 4, 0], basaltColumns: [6, 6, 0], locomotive: [1.5, 9, -2], railcar: [1.5, 5.5, 0], turbineTower: [2, 2, 0] };
