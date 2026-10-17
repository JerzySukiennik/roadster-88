// Roadster 88 city structures: the elevated 88 Ring and its ramps on hammerhead piers, the four bridges (stone and steel suspension, the great suspension bridge and the bascule lift bridge that opens on a shared clock), the river tunnel with trenches, portals and lights, parking garages you can drive up, gas stations, built-in jumps, quay walls, the stadium, the container port with gantry cranes and ships, oil tanks and the airport with parked airliners and runway lights; render meshes plus chunked static colliders, the kinematic bascule leaves and the terrain cut-outs.
import * as THREE from 'three/webgpu';
import { BGeo, GGeo, KIND, GK, roadStrip, flatPoly } from './geom.js';
import { chunkOf, rng, ccw, centroid, polyArea } from './plan.js';
import { TUNNEL, AIRPORT, PORT } from './layout.js';
import { GROUP, groups } from '../../sim/car.js';

const CONC = [0.52, 0.51, 0.49], CONC2 = [0.42, 0.41, 0.4], STEEL = [0.3, 0.36, 0.4], STONE = [0.58, 0.52, 0.44], RUST = [0.36, 0.2, 0.14], WHITE = [0.85, 0.86, 0.86], DARK = [0.1, 0.1, 0.11];
const CABLE = [0.25, 0.28, 0.3];

function dummy(style = 'concrete', color = CONC) { return { P: { style, color, floorH: 3.2, bayW: 3, winW: 0.5, winH: 0.5, ground: 4, lit: 0.4 }, seed: 7, ground: 0 }; }

function face(G, a, b, c, d, uLen = null) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const L = uLen === null ? Math.hypot(e1[0], e1[2]) : uLen;
  const A = G.v(a[0], a[1], a[2], nx, ny, nz, 0, a[1]), B = G.v(b[0], b[1], b[2], nx, ny, nz, L, b[1]), C = G.v(c[0], c[1], c[2], nx, ny, nz, L, c[1]), D = G.v(d[0], d[1], d[2], nx, ny, nz, 0, d[1]);
  G.quad(A, B, C, D);
}

function frames(r) {
  const P = r.points, n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[2] - a[2]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    out.push({ x: P[i][0], y: P[i][1], z: P[i][2], tx, tz, nx: tz, nz: -tx });
  }
  if (r.closed) { const f = out[0]; out.push({ ...f }); }
  return out;
}

function ribbon(G, F, off0, off1, dy0, dy1, faceSide) {
  for (let i = 0; i < F.length - 1; i++) {
    const a = F[i], b = F[i + 1];
    const p = (f, off, dy) => [f.x + f.nx * off, f.y + dy, f.z + f.nz * off];
    if (faceSide === 'left') face(G, p(b, off0, dy0), p(a, off0, dy0), p(a, off0, dy1), p(b, off0, dy1));
    else if (faceSide === 'right') face(G, p(a, off0, dy0), p(b, off0, dy0), p(b, off0, dy1), p(a, off0, dy1));
    else if (faceSide === 'top') face(G, p(a, off1, dy0), p(b, off1, dy0), p(b, off0, dy0), p(a, off0, dy0));
    else if (faceSide === 'bottom') face(G, p(a, off0, dy0), p(b, off0, dy0), p(b, off1, dy0), p(a, off1, dy0));
  }
}

export class Structures {
  constructor(city, plan, sink) {
    this.city = city; this.plan = plan; this.g = city.g; this.sink = sink;
    this.root = new THREE.Group(); this.root.name = 'CityStructures';
    this.cols = new Map();
    this.H = (x, z) => city.V.heightAt(x, z);
    this.bodies = [];
    this.anim = [];
    this.lights = [];
    this.leafDescs = [];
    this.cuts = null;
    this.active = false;
    this.B = null; this.G = null;
  }

  *steps() {
    const plan = this.plan;
    this.at(-900, 5000);
    this.B.setB(dummy(), KIND.concrete);
    const roads = Object.fromEntries(plan.roads.map((r) => [r.id, r]));
    for (const st of plan.structures) {
      const r = roads[st.road];
      try {
        if (st.type === 'viaduct' && r) this.viaduct(r, plan.style === 'ruins' && st.id === 'ring' ? { ...st, gaps: [[2100, 2190], [6900, 6960], [9800, 9900]] } : st);
        else if (st.type === 'bridge' && r) this.bridge(r, st);
        else if (st.type === 'tunnel' && r) this.tunnel(r, st);
        else if (st.type === 'cranes') this.cranes(st);
        else if (st.type === 'ship') this.ship(st);
        else if (st.type === 'airport') this.airport(st);
      } catch (e) { console.warn('structure failed', st.id, e); }
      yield;
    }
    for (const gs of plan.gas || []) { this.at(gs.x, gs.z); this.gas(gs); }
    yield;
    for (const ga of plan.garages || []) { this.at(ga.x, ga.z); this.garage(ga); }
    yield;
    for (const j of plan.jumps || []) { this.at(j.x, j.z); this.jump(j); }
    if (plan.stadium) { this.at(plan.stadium.x, plan.stadium.z); this.stadium(plan.stadium); }
    yield;
    for (const sb of plan.skybridges || []) this.skybridge(sb);
    this.quays();
    yield;
    this.port();
  }

  build() { for (const _ of this.steps()); return this; }

  activate() {
    if (this.active) return;
    this.active = true;
    this.city.root.add(this.root);
    const R = this.g.R, world = this.g.phys.world;
    for (const L of this.leafDescs) {
      const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(L.px, L.deckY, L.z));
      const c = world.createCollider(R.ColliderDesc.cuboid(L.lw / 2, 0.6, L.half).setTranslation(L.sgn * L.lw / 2, -0.62, 0).setFriction(0.8).setCollisionGroups(groups(GROUP.STATIC, 0xffff)), body);
      c.userData = { kind: 'box', tag: 'bascule', mat: 'steel' };
      this.bodies.push(body);
      this.anim.push({ type: 'leaf', grp: L.grp, body, sgn: L.sgn, px: L.px, deckY: L.deckY, z: L.z, angle: 0 });
    }
    if (this.cuts) this.city.V.tunnelCuts = this.cuts;
    this.finish();
  }

  at(x, z) {
    const t = this.sink(x, z), prev = this.B;
    if (prev && t.mass !== prev) { t.mass.A = prev.A; t.mass.B = prev.B; t.mass.C = prev.C; t.mass.ground = prev.ground; }
    this.B = t.mass; this.G = t.ground;
  }

  col(x, z, desc, ud) { const k = chunkOf(x, z); if (!this.cols.has(k)) this.cols.set(k, []); this.cols.get(k).push({ desc, ud }); }
  hull(pts, ud = { kind: 'box', tag: 'structure', mat: 'concrete' }) { const R = this.g.R, a = new Float32Array(pts.flat()); let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[2]; } const d = R.ColliderDesc.convexHull(a); if (d) this.col(x / pts.length, z / pts.length, d, ud); }
  cuboid(cx, cy, cz, hx, hy, hz, yaw = 0, ud = { kind: 'box', tag: 'structure', mat: 'concrete' }) { const R = this.g.R, s = Math.sin(yaw / 2), c = Math.cos(yaw / 2); this.col(cx, cz, R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setRotation({ x: 0, y: s, z: 0, w: c }), ud); }
  trimesh(V, I, x, z, ud = { kind: 'ground', tag: 'deck', mat: 'concrete' }) { const R = this.g.R; this.col(x, z, R.ColliderDesc.trimesh(new Float32Array(V), new Uint32Array(I), R.TriMeshFlags.FIX_INTERNAL_EDGES), ud); }
  boxYaw(cx, cz, y0, w, d, h, yaw) { this.B.boxAt(cx, cz, y0, w, d, h, -yaw, 0); this.cuboid(cx, y0 + h / 2, cz, w / 2, h / 2, d / 2, -yaw); }

  collidersFor(k) { return this.cols.get(k) || []; }

  deckTop(F, half, step = 12) {
    for (let s = 0; s < F.length - 1; s += step) {
      const e = Math.min(F.length - 1, s + step), V = [], I = [];
      for (let i = s; i <= e; i++) { const f = F[i]; V.push(f.x + f.nx * half, f.y, f.z + f.nz * half, f.x - f.nx * half, f.y, f.z - f.nz * half); }
      for (let i = 0; i < e - s; i++) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const m = F[Math.floor((s + e) / 2)];
      this.trimesh(V, I, m.x, m.z);
    }
  }

  barrierCols(F, off, h = 1.0, w = 0.5, step = 3) {
    for (let s = 0; s < F.length - 1; s += step) {
      const e = Math.min(F.length - 1, s + step), a = F[s], b = F[e], pts = [];
      for (const f of [a, b]) for (const o of [off - w / 2, off + w / 2]) { pts.push([f.x + f.nx * o, f.y - 0.2, f.z + f.nz * o], [f.x + f.nx * o, f.y + h, f.z + f.nz * o]); }
      this.hull(pts, { kind: 'box', tag: 'barrier', mat: 'concrete' });
    }
  }

  deckStrip(G, Fp, S, half, kind) {
    let prev = null;
    const s0 = S[0], s1 = S[S.length - 1];
    for (let i = 0; i < Fp.length; i++) {
      const f = Fp[i], row = [];
      for (const u of [-half, half]) row.push(G.v(f.x + f.nx * u, f.y + 0.02, f.z + f.nz * u, 0, 1, 0, u, S[i], s0 - 1e4, s1 + 1e4, kind, Math.min(255, Math.round(half * 4)), 0, 0));
      if (prev) { G.tri(prev[0], row[0], prev[1]); G.tri(prev[1], row[0], row[1]); }
      prev = row;
    }
  }

  viaduct(r, st) {
    const F0 = frames(r), n0 = F0.length, H = this.H;
    const S0 = [0]; for (let i = 1; i < n0; i++) S0.push(S0[i - 1] + Math.hypot(F0[i].x - F0[i - 1].x, F0[i].z - F0[i - 1].z));
    const gaps = st.gaps || [];
    const runs = [];
    let cur = null;
    for (let i = 0; i < n0; i++) {
      const g = gaps.some(([a, b]) => S0[i] > a && S0[i] < b);
      if (!g) { if (!cur) { cur = { a: i, b: i }; runs.push(cur); } else cur.b = i; } else cur = null;
    }
    for (const run of runs) {
      if (run.b - run.a < 1) continue;
      const F = F0.slice(run.a, run.b + 1), S = S0.slice(run.a, run.b + 1);
      this.viaductRun(r, st, F, S, run.a > 0 || run.b < n0 - 1);
    }
  }

  viaductRun(r, st, F, S, broken) {
    const half = r.width / 2, H = this.H, n = F.length;
    const low = F.map((f) => f.y - H(f.x, f.z) < 3.5);
    const sp = st.pillar || 36;
    let acc = 0;
    for (let p0 = 0; p0 < n - 1; p0 += 16) {
      const p1 = Math.min(n - 1, p0 + 16), mid = F[(p0 + p1) >> 1];
      this.at(mid.x, mid.z);
      const B = this.B, Fp = F.slice(p0, p1 + 1);
      this.deckStrip(this.G, Fp, S.slice(p0, p1 + 1), half, GK.deck);
      B.setB(dummy('concrete', CONC), KIND.concrete);
      ribbon(B, Fp, half, -half, -1.5, 0, 'bottom');
      for (const off of [half, -half]) {
        for (let i = p0; i < p1; i++) {
          const a = F[i], b = F[i + 1], lw = low[i] && low[i + 1];
          const ga = lw ? H(a.x + a.nx * off, a.z + a.nz * off) - 0.5 : a.y - 1.5, gb = lw ? H(b.x + b.nx * off, b.z + b.nz * off) - 0.5 : b.y - 1.5;
          const p = (f, dy) => [f.x + f.nx * off, dy, f.z + f.nz * off];
          if (off > 0) face(B, p(b, gb), p(a, ga), p(a, a.y + 0.02), p(b, b.y + 0.02)); else face(B, p(a, ga), p(b, gb), p(b, b.y + 0.02), p(a, a.y + 0.02));
        }
      }
      if (broken) for (const k of [0, n - 1]) if (k >= p0 && k <= p1) { const f = F[k], p = (o, y) => [f.x + f.nx * o, y, f.z + f.nz * o]; face(B, p(half, f.y - 1.5), p(-half, f.y - 1.5), p(-half, f.y), p(half, f.y)); face(B, p(-half, f.y - 1.5), p(half, f.y - 1.5), p(half, f.y), p(-half, f.y)); }
      B.kind(KIND.trim, [0.6, 0.59, 0.56]);
      const bars = [half - 0.25, -(half - 0.25)];
      if (r.closed && st.width > 20) bars.push(0);
      for (const off of bars) {
        const w = off === 0 ? 0.3 : 0.25;
        ribbon(B, Fp, off - w, 0, 0, 0.95, 'right'); ribbon(B, Fp, off + w, 0, 0, 0.95, 'left');
        for (let i = 0; i < Fp.length - 1; i++) { const a = Fp[i], b = Fp[i + 1], p = (f, o) => [f.x + f.nx * o, f.y + 0.95, f.z + f.nz * o]; face(B, p(a, off + w), p(b, off + w), p(b, off - w), p(a, off - w)); }
      }
      B.kind(KIND.concrete, CONC2);
      for (let i = Math.max(1, p0); i < p1; i++) {
        acc += Math.hypot(F[i].x - F[i - 1].x, F[i].z - F[i - 1].z);
        if (acc < sp) continue;
        acc = 0;
        const f = F[i], g = H(f.x, f.z), top = f.y - 1.5;
        if (top - g < 2.5) continue;
        const yaw = Math.atan2(f.tx, f.tz);
        if (half > 8) {
          B.boxAt(f.x, f.z, g - 1, 2.4, 2.4, top - 1.4 - g + 1, -yaw + Math.PI / 2, 0);
          B.boxAt(f.x, f.z, top - 1.6, 2.2, half * 2 - 3, 1.6, -yaw + Math.PI / 2, 0);
          this.cuboid(f.x, (g + top) / 2, f.z, 1.2, (top - g) / 2, 1.2, -yaw + Math.PI / 2, { kind: 'box', tag: 'pillar', r: 1.2, mat: 'concrete' });
        } else {
          B.cyl(f.x, f.z, g - 1, 0.9, top - g + 1, 8);
          this.cuboid(f.x, (g + top) / 2, f.z, 0.9, (top - g) / 2, 0.9, 0, { kind: 'box', tag: 'pillar', r: 0.9, mat: 'concrete' });
        }
      }
    }
    for (const off of [half - 0.25, -(half - 0.25)]) this.barrierCols(F, off, 1.0, 0.5);
    if (r.closed && st.width > 20) this.barrierCols(F, 0, 0.85, 0.6, 3);
    this.deckTop(F, half);
    if (this.plan.style !== 'ruins') for (let i = 0; i < n; i += 6) { const f = F[i]; if (f.y - H(f.x, f.z) > 1) this.lights.push({ x: f.x + f.nx * (half - 0.25), y: f.y + 0.95, z: f.z + f.nz * (half - 0.25), yaw: Math.atan2(-f.nx, -f.nz), kind: 'lamp' }); }
  }

  skybridge(sb) {
    const dx = sb.x1 - sb.x0, dz = sb.z1 - sb.z0, L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), mx = (sb.x0 + sb.x1) / 2, mz = (sb.z0 + sb.z1) / 2;
    this.at(mx, mz); const B = this.B;
    B.setB(dummy('metal', [0.75, 0.77, 0.8]), KIND.metal);
    B.boxAt(mx, mz, sb.y - 1.2, sb.w, L, 1.2, -yaw, 0);
    B.kind(KIND.glassbox, [0.2, 0.25, 0.28]);
    for (const side of [-1, 1]) B.boxAt(mx + Math.cos(yaw) * side * (sb.w / 2 - 0.1), mz - Math.sin(yaw) * side * (sb.w / 2 - 0.1), sb.y, 0.15, L, 1.3, -yaw, 0);
    B.kind(16, [0.6, 0.85, 1]);
    for (const side of [-1, 1]) B.boxAt(mx + Math.cos(yaw) * side * (sb.w / 2 - 0.1), mz - Math.sin(yaw) * side * (sb.w / 2 - 0.1), sb.y - 1.25, 0.2, L, 0.1, -yaw, 0);
    this.cuboid(mx, sb.y - 0.6, mz, sb.w / 2, 0.6, L / 2, yaw, { kind: 'ground', tag: 'deck', mat: 'steel' });
    for (const side of [-1, 1]) this.cuboid(mx + Math.cos(yaw) * side * (sb.w / 2 - 0.1), sb.y + 0.65, mz - Math.sin(yaw) * side * (sb.w / 2 - 0.1), 0.1, 0.65, L / 2, yaw, { kind: 'box', tag: 'barrier', mat: 'glass' });
  }

  bridge(r, st) {
    const B0 = st.spec, F = frames(r), half = r.width / 2, H = this.H;
    let B = this.B;
    if (B0.kind === 'bascule') return this.bascule(r, st);
    const ruinGap = this.plan.style === 'ruins' && B0.kind === 'suspension_steel' ? (() => { const s0 = Math.abs((B0.x0 + B0.x1) / 2 - r.pts[0][0]); return [[s0 - 30, s0 + 34]]; })() : [];
    this.viaduct(r, { width: r.width, pillar: 46, gaps: ruinGap });
    this.at((B0.x0 + B0.x1) / 2, B0.z); B = this.B;
    const dir = Math.sign(B0.x1 - B0.x0), z = B0.z;
    const yAt = (x) => { let best = F[0], bd = Infinity; for (const f of F) { const d = Math.abs(f.x - x); if (d < bd) { bd = d; best = f; } } return best.y; };
    const stone = B0.kind === 'suspension_stone', great = B0.kind === 'suspension_great';
    const towerH = great ? 150 : stone ? 82 : 92;
    const [t0, t1] = B0.towers;
    const deckY = B0.deck;
    for (const tx of [t0, t1]) {
      const g = Math.min(H(tx, z), -1) - 6;
      if (stone) {
        B.setB(dummy('stone', STONE), KIND.trim);
        B.kind(KIND.trim, STONE);
        B.boxAt(tx, z, g, 22, half * 2 + 14, deckY - g - 2, 0, 0);
        for (const side of [-1, 1]) B.boxAt(tx, z + side * (half * 0.5 + 4), deckY - 2, 18, half * 0.55, towerH - (deckY - 2) - (deckY), 0, 0);
        B.boxAt(tx, z, deckY + 24, 18, half * 2 + 10, 14, 0, 0);
        B.boxAt(tx, z, deckY + towerH - deckY - 30, 20, half * 2 + 12, 10, 0, 0);
        this.cuboid(tx, (g + deckY) / 2, z, 11, (deckY - g) / 2, half + 7);
        for (const side of [-1, 1]) this.cuboid(tx, deckY + (towerH - deckY) / 2, z + side * (half * 0.5 + 4), 9, (towerH - deckY) / 2, half * 0.27, 0, { kind: 'box', tag: 'tower', r: 9, mat: 'stone' });
      } else {
        B.setB(dummy('metal', STEEL), KIND.metal);
        B.kind(KIND.concrete, CONC2); B.boxAt(tx, z, g, 16, half * 2 + 12, deckY - g - 3, 0, 0);
        this.cuboid(tx, (g + deckY) / 2, z, 8, (deckY - g) / 2 - 1.5, half + 6);
        B.kind(KIND.metal, great ? [0.5, 0.52, 0.53] : STEEL);
        for (const side of [-1, 1]) { const zz = z + side * (half + 1.5); B.boxAt(tx, zz, deckY - 3, great ? 9 : 6, great ? 7 : 5, towerH - deckY + 3, 0, 0); this.cuboid(tx, deckY + (towerH - deckY) / 2, zz, great ? 4.5 : 3, (towerH - deckY) / 2, great ? 3.5 : 2.5, 0, { kind: 'box', tag: 'tower', r: 4, mat: 'steel' }); }
        for (const yy of [deckY + 12, towerH * 0.62, towerH - 6]) B.boxAt(tx, z, yy, great ? 6 : 4.5, half * 2 + 4, great ? 6 : 3.5, 0, 0);
      }
    }
    B.setB(dummy('metal', CABLE), KIND.metal);
    const anchor0 = B0.x0 - dir * 140, anchor1 = B0.x1 + dir * 140;
    for (const side of [-1, 1]) {
      const zz = z + side * (half + (stone ? 0.5 : 1.5));
      const cable = (xa, ya, xb, yb, sag) => {
        const n = 40, pts = [];
        for (let i = 0; i <= n; i++) { const t = i / n, x = xa + (xb - xa) * t, y = ya + (yb - ya) * t - sag * 4 * t * (1 - t); pts.push([x, y]); }
        for (let i = 0; i < n; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const L = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2; segBeam(B, [x0, y0, zz], [x1, y1, zz], great ? 0.9 : 0.6); }
        return pts;
      };
      const top = towerH - 2;
      const main = cable(t0, top, t1, top, top - deckY - 4);
      cable(anchor0, deckY - 2, t0, top, 18 * 0);
      cable(t1, top, anchor1, deckY - 2, 0);
      for (let i = 1; i < main.length - 1; i++) { const [x, y] = main[i]; const dy = yAt(x) + 1; if (y - dy > 1) segBeam(B, [x, dy, zz], [x, y, zz], 0.12); }
      if (stone) for (let i = 2; i < main.length - 2; i += 4) { const [x, y] = main[i]; segBeam(B, [t0, top - 4, zz], [x, yAt(x) + 1, zz], 0.1); segBeam(B, [t1, top - 4, zz], [x, yAt(x) + 1, zz], 0.1); }
      for (let i = 0; i <= 24; i++) { const x = t0 + (t1 - t0) * i / 24, y = top - (top - deckY - 4) * 4 * (i / 24) * (1 - i / 24); this.lights.push({ x, y: y + 0.5, z: zz, yaw: 0, kind: 'necklace' }); }
    }
    B.setB(dummy('metal', great ? [0.45, 0.47, 0.48] : stone ? [0.3, 0.32, 0.3] : STEEL), KIND.metal);
    for (let i = 0; i < F.length - 1; i += 2) { const a = F[i], b = F[Math.min(F.length - 1, i + 2)]; if (a.x * dir < B0.x0 * dir || a.x * dir > B0.x1 * dir) continue; for (const side of [-1, 1]) segBeam(B, [a.x, a.y - 1.6, a.z + side * (half - 0.5)], [b.x, b.y - 1.6, b.z + side * (half - 0.5)], 1.2); }
  }

  bascule(r, st) {
    const S = st.spec, F = frames(r), half = r.width / 2, H = this.H, z = S.z;
    const [o0, o1] = S.open[0] < S.open[1] ? S.open : [S.open[1], S.open[0]];
    const keep = (f) => f.x < o0 - 0.5 || f.x > o1 + 0.5;
    const pieces = [];
    let cur = [];
    for (const f of F) { if (keep(f)) cur.push(f); else if (cur.length) { pieces.push(cur); cur = []; } }
    if (cur.length) pieces.push(cur);
    for (const P of pieces) {
      if (P.length < 2) continue;
      const pts = P.map((f) => [f.x, f.z]), points = P.map((f) => [f.x, f.y, f.z]);
      const sub = { ...r, pts, points, s: pts.map((p, i) => (i ? Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) : 0)), closed: false };
      sub.len = sub.s[sub.s.length - 1];
      this.viaduct(sub, { width: r.width, pillar: 30 });
    }
    const deckY = S.deck, lw = (o1 - o0) / 2;
    this.at((o0 + o1) / 2, z); const B = this.B;
    B.setB(dummy('concrete', CONC), KIND.concrete);
    for (const px of [o0, o1]) {
      const g = Math.min(-2, H(px, z)) - 4;
      B.boxAt(px + (px === o0 ? -6 : 6), z, g, 12, half * 2 + 6, deckY - g - 1.2, 0, 0);
      this.cuboid(px + (px === o0 ? -6 : 6), (g + deckY - 1.2) / 2, z, 6, (deckY - 1.2 - g) / 2, half + 3);
      B.kind(KIND.wall); B.setB({ P: { style: 'brick', color: [0.42, 0.2, 0.13], floorH: 3, bayW: 2.4, winW: 0.5, winH: 0.5, ground: 1, lit: 0.8 }, seed: 33, ground: deckY }, KIND.wall);
      B.boxAt(px + (px === o0 ? -8 : 8), z + half + 5, deckY, 6, 6, 7, 0, deckY);
      B.setB(dummy('concrete', CONC), KIND.concrete);
    }
    for (const [px, sgn] of [[o0, 1], [o1, -1]]) {
      const G = new BGeo(); G.setB(dummy('metal', [0.28, 0.3, 0.32]), KIND.metal);
      G.boxAt(sgn * lw / 2, 0, -1.4, lw, half * 2, 1.2, 0, 0);
      G.kind(KIND.trim, [0.62, 0.6, 0.55]);
      for (const zz of [-half + 0.3, half - 0.3]) G.boxAt(sgn * lw / 2, zz, -0.2, lw, 0.5, 1.1, 0, 0);
      G.kind(KIND.metal, [0.16, 0.17, 0.18]);
      for (let i = 0; i < 6; i++) G.boxAt(sgn * (i + 0.5) * lw / 6, 0, -2.6, 0.5, half * 2 - 1, 1.2, 0, 0);
      const GG = new GGeo(), deckR = { pts: [[0, 0], [sgn * lw, 0]], s: [0, lw], points: [[0, 0, 0], [sgn * lw, 0, 0]], width: r.width, len: lw };
      roadStrip(GG, deckR, 0, lw, () => 0, GK.deck, -0.18, true, [Math.round(half * 4), 0, 0]);
      const grp = new THREE.Group();
      const m1 = new THREE.Mesh(geoOf(G.out(), 'b'), this.city.facade); m1.castShadow = true; m1.receiveShadow = true; m1.frustumCulled = false;
      const m2 = new THREE.Mesh(geoOf(GG.out(), 'g'), this.city.street); m2.receiveShadow = true; m2.frustumCulled = false;
      grp.add(m1, m2); grp.position.set(px, deckY, z);
      this.root.add(grp);
      this.leafDescs.push({ grp, sgn, px, deckY, z, lw, half });
    }
    for (const side of [-1, 1]) for (const px of [o0 - 14, o1 + 14]) this.lights.push({ x: px, y: deckY + 1.4, z: z + side * (half + 0.4), kind: 'warn', yaw: 0 });
    this.drawbridge = { o0, o1, z, half, deckY };
  }

  tunnel(r, st) {
    const T = st.spec, F = frames(r), half = r.width / 2, H = this.H;
    this.at((T.x0 + T.x1) / 2, T.z);
    const B = this.B;
    roadStrip(this.G, r, 0, r.len, H, GK.deck, 0.02, true, [Math.min(255, Math.round(half * 4)), 0, 0]);
    this.deckTop(F, half);
    const inBore = (f) => f.x > T.portal0 && f.x < T.portal1;
    B.setB(dummy('concrete', [0.72, 0.72, 0.7]), KIND.concrete);
    for (const off of [half + 0.6, -(half + 0.6)]) {
      for (let i = 0; i < F.length - 1; i++) {
        const a = F[i], b = F[i + 1], bore = inBore(a) && inBore(b);
        const ta = bore ? a.y + T.height : Math.max(a.y + 1.2, H(a.x, a.z) + 0.6), tb = bore ? b.y + T.height : Math.max(b.y + 1.2, H(b.x, b.z) + 0.6);
        const p = (f, y) => [f.x + f.nx * off, y, f.z + f.nz * off];
        B.kind(bore ? KIND.trim : KIND.concrete, bore ? [0.78, 0.78, 0.74] : [0.55, 0.54, 0.52]);
        if (off > 0) face(B, p(a, a.y - 0.3), p(b, b.y - 0.3), p(b, tb), p(a, ta)); else face(B, p(b, b.y - 0.3), p(a, a.y - 0.3), p(a, ta), p(b, tb));
        const ud = { kind: 'box', tag: 'wall', mat: 'concrete' };
        const o2 = off + Math.sign(off) * 1.2;
        this.hull([p(a, a.y - 0.3), p(b, b.y - 0.3), p(a, ta), p(b, tb), [a.x + a.nx * o2, a.y - 0.3, a.z + a.nz * o2], [b.x + b.nx * o2, b.y - 0.3, b.z + b.nz * o2], [a.x + a.nx * o2, ta, a.z + a.nz * o2], [b.x + b.nx * o2, tb, b.z + b.nz * o2]], ud);
      }
    }
    const boreF = F.filter(inBore);
    B.kind(KIND.trim, [0.35, 0.35, 0.34]);
    ribbon(B, boreF, half + 0.6, -(half + 0.6), T.height, 0, 'bottom');
    for (let i = 0; i < boreF.length - 1; i += 2) { const a = boreF[i], b = boreF[Math.min(boreF.length - 1, i + 2)]; const pts = []; for (const f of [a, b]) for (const o of [half + 1, -(half + 1)]) pts.push([f.x + f.nx * o, f.y + T.height, f.z + f.nz * o], [f.x + f.nx * o, f.y + T.height + 1, f.z + f.nz * o]); this.hull(pts, { kind: 'box', tag: 'ceiling', mat: 'concrete' }); }
    B.kind(16, [1, 0.95, 0.85]);
    for (let i = 0; i < boreF.length - 1; i++) { const a = boreF[i], b = boreF[i + 1]; for (const o of [half - 1.2, -(half - 1.2)]) { const p = (f, oo) => [f.x + f.nx * oo, f.y + T.height - 0.05, f.z + f.nz * oo]; face(B, p(a, o - 0.15), p(b, o - 0.15), p(b, o + 0.15), p(a, o + 0.15)); } }
    B.kind(KIND.concrete, [0.6, 0.59, 0.56]);
    for (const px of [T.portal0, T.portal1]) {
      const f = F.reduce((best, q) => (Math.abs(q.x - px) < Math.abs(best.x - px) ? q : best), F[0]);
      const g = H(px, T.z) + 1.2;
      face(B, [px, f.y + T.height, T.z - half - 2], [px, f.y + T.height, T.z + half + 2], [px, g, T.z + half + 2], [px, g, T.z - half - 2]);
      face(B, [px, f.y + T.height, T.z + half + 2], [px, f.y + T.height, T.z - half - 2], [px, g, T.z - half - 2], [px, g, T.z + half + 2]);
      this.cuboid(px, (f.y + T.height + g) / 2, T.z, 0.6, Math.max(0.3, (g - f.y - T.height) / 2), half + 2);
    }
    for (let i = 0; i < boreF.length; i += 5) { const f = boreF[i]; this.lights.push({ x: f.x, y: f.y + T.height - 0.3, z: f.z, kind: 'tunnel', yaw: 0 }); }
    this.tunnelSpec = T;
    this.cuts = [{ x0: T.x0 - 4, x1: T.portal0, z: T.z, half: half + 1.5, ceil: 1000 }, { x0: T.portal1, x1: T.x1 + 4, z: T.z, half: half + 1.5, ceil: 1000 }];
  }

  garage(ga) {
    const B = this.B, G = this.G, H = this.H;
    const [ux, uz] = ga.ua, [vx, vz] = ga.ub, o = ga.fp ? null : null;
    const c0 = ga.corner ? [ga.corner[0] + (ux + vx) * 0.5, ga.corner[1] + (uz + vz) * 0.5] : [ga.x, ga.z];
    const W = ga.w, D = ga.d, at = (u, v) => [c0[0] + ux * u + vx * v, c0[1] + uz * u + vz * v];
    const g = Math.max(...[[0, 0], [W, 0], [W, D], [0, D]].map(([u, v]) => H(...at(u, v)))) + 0.2;
    const LH = 3.4, n = ga.levels || 6, rampW = 7.5, rampL = 34;
    const yaw = Math.atan2(ux, uz), cy = Math.atan2(-uz, ux);
    B.setB(dummy('concrete', [0.6, 0.59, 0.57]), KIND.concrete);
    const quad = (u0, v0, u1, v1) => ccw([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]);
    for (let L = 0; L <= n; L++) {
      const y = g + L * LH;
      const side = L % 2;
      const hole = L === 0 ? null : side ? [W - rampL - 6, D - rampW - 1, W - 6, D - 1] : [6, D - rampW - 1, 6 + rampL, D - 1];
      const parts = hole ? [[0, 0, W, hole[1]], [0, hole[1], hole[0], D], [hole[2], hole[1], W, D]] : [[0, 0, W, D]];
      for (const [u0, v0, u1, v1] of parts) {
        if (u1 - u0 < 0.5 || v1 - v0 < 0.5) continue;
        const fp = quad(u0, v0, u1, v1);
        if (L > 0) { B.kind(KIND.concrete, [0.55, 0.54, 0.52]); B.prism(fp, y - 0.45, y, 0, false, true); }
        flatPoly(G, fp, () => y, 0.01, GK.yard, 12);
        const [cx, cz] = centroid(fp);
        if (L > 0) this.cuboid(cx, y - 0.25, cz, (u1 - u0) / 2, 0.25, (v1 - v0) / 2, cy, { kind: 'ground', tag: 'garage', mat: 'concrete' });
      }
      if (L > 0) {
        const r0 = side ? [W - rampL - 6, W - 6] : [6, 6 + rampL];
        const yl = y - LH, uA = side ? r0[1] : r0[0], uB = side ? r0[0] : r0[1];
        const p = (u, v, yy) => { const [x, z] = at(u, v); return [x, yy, z]; };
        const v0 = D - rampW - 1, v1 = D - 1;
        B.kind(KIND.concrete, [0.5, 0.49, 0.47]);
        face(B, p(uA, v0, yl), p(uB, v0, y), p(uB, v1, y), p(uA, v1, yl));
        this.hull([p(uA, v0, yl - 0.3), p(uB, v0, y - 0.3), p(uB, v1, y - 0.3), p(uA, v1, yl - 0.3), p(uA, v0, yl + 0.02), p(uB, v0, y + 0.02), p(uB, v1, y + 0.02), p(uA, v1, yl + 0.02)], { kind: 'ground', tag: 'ramp', mat: 'concrete' });
      }
      if (L > 0) {
        B.kind(KIND.concrete, [0.62, 0.61, 0.58]);
        for (const [u0, v0, u1, v1] of [[0, 0, W, 0.3], [0, D - 0.3, W, D], [0, 0, 0.3, D], [W - 0.3, 0, W, D]]) { const fp = quad(u0, v0, u1, v1); B.prism(fp, y, y + 1.05, 0); const [cx, cz] = centroid(fp); this.cuboid(cx, y + 0.52, cz, Math.max(0.15, (u1 - u0) / 2), 0.52, Math.max(0.15, (v1 - v0) / 2), cy, { kind: 'box', tag: 'wall', mat: 'concrete' }); }
      }
      if (L < n) for (let i = 0; i <= 8; i++) for (let j = 0; j <= 3; j++) { const [x, z] = at(1 + i * (W - 2) / 8, 1 + j * (D - 2) / 3); if (j === 3) continue; B.boxAt(x, z, y, 0.7, 0.7, LH - 0.45, cy, 0); if (j === 0 || i % 2 === 0) this.cuboid(x, y + (LH - 0.45) / 2, z, 0.35, (LH - 0.45) / 2, 0.35, 0, { kind: 'box', tag: 'pillar', r: 0.4, mat: 'concrete' }); }
    }
    const ry = g + n * LH;
    const kick = [[W * 0.5 - 6, 0.6], [W * 0.5 + 6, 0.6], [W * 0.5 + 6, 8], [W * 0.5 - 6, 8]];
    const kp = kick.map(([u, v]) => at(u, v));
    const k3 = (i, h) => [kp[i][0], ry + h, kp[i][1]];
    B.kind(KIND.wood, [0.55, 0.42, 0.26]);
    face(B, k3(3, 0), k3(2, 0), k3(1, 1.8), k3(0, 1.8));
    this.hull([k3(0, 0), k3(1, 0), k3(2, 0), k3(3, 0), k3(0, 1.8), k3(1, 1.8)], { kind: 'ground', tag: 'ramp', mat: 'wood' });
    B.setB({ P: { style: 'concrete', color: [0.6, 0.59, 0.57], floorH: LH, bayW: 4, winW: 0.9, winH: 0.4, ground: 0.2, lit: 0.9 }, seed: 91, ground: g }, KIND.sign);
    const [sx, sz] = at(W / 2, -0.4);
    B.boxAt(sx, sz, ry - 1, 14, 0.4, 2.2, cy, 0);
    B.setB(dummy(), KIND.concrete);
    for (let i = 0; i < 6; i++) { const [x, z] = at(4 + i * (W - 8) / 5, D / 2); this.lights.push({ x, y: ry, z, kind: 'lamp', yaw }); }
  }

  gas(gs) {
    const B = this.B, H = this.H, [ux, uz] = gs.ua || [1, 0], [vx, vz] = gs.ub || [0, 1];
    const c0 = gs.corner ? [gs.corner[0], gs.corner[1]] : [gs.fp[0][0], gs.fp[0][1]];
    const at = (u, v) => [c0[0] + ux * u + vx * v, c0[1] + uz * u + vz * v];
    const W = gs.w || 42, D = gs.d || 32;
    const g = H(...at(W / 2, D / 2)) + 0.16;
    const yaw = Math.atan2(ux, uz), cy = Math.atan2(-uz, ux);
    const style = this.plan.style;
    const brand = [[0.75, 0.1, 0.08], [0.05, 0.25, 0.6], [0.1, 0.45, 0.2], [0.85, 0.6, 0.05]][Math.abs(gs.id.length * 7 + Math.round(c0[0])) % 4];
    flatPoly(this.G, ccw([at(0, 0), at(W, 0), at(W, D), at(0, D)]), () => g, 0.02, GK.yard, 10);
    B.setB(dummy('metal', [0.86, 0.87, 0.88]), KIND.metal);
    const cw = 22, cd = 12, cu = 4, cv = 5;
    const fpC = ccw([at(cu, cv), at(cu + cw, cv), at(cu + cw, cv + cd), at(cu, cv + cd)]);
    B.kind(KIND.trim, [0.92, 0.92, 0.92]); B.prism(fpC, g + 5, g + 5.9, 0, true, true);
    B.kind(KIND.sign, brand); B.prism(insetPoly2(fpC, -0.05), g + 5.25, g + 5.75, 0, false, false);
    const [ccx, ccz] = centroid(fpC);
    this.cuboid(ccx, g + 5.45, ccz, cw / 2, 0.45, cd / 2, cy);
    B.kind(KIND.metal, [0.8, 0.8, 0.8]);
    for (const [u, v] of [[cu + 2, cv + 2], [cu + cw - 2, cv + 2], [cu + 2, cv + cd - 2], [cu + cw - 2, cv + cd - 2]]) { const [x, z] = at(u, v); B.boxAt(x, z, g, 0.5, 0.5, 5, cy, 0); this.cuboid(x, g + 2.5, z, 0.25, 2.5, 0.25, 0, { kind: 'box', tag: 'pillar', r: 0.3, mat: 'steel' }); }
    B.kind(16, [1, 1, 0.95]);
    for (const [u, v] of [[cu + 5, cv + 3], [cu + 11, cv + 3], [cu + 17, cv + 3], [cu + 5, cv + 9], [cu + 11, cv + 9], [cu + 17, cv + 9]]) { const [x, z] = at(u, v); B.boxAt(x, z, g + 4.96, 2, 1, 0.05, cy, 0); }
    B.setB({ P: { style: 'glass', color: [0.85, 0.85, 0.83], floorH: 4, bayW: 2.2, winW: 0.9, winH: 0.75, ground: 4.2, lit: 0.9 }, seed: 17, ground: g }, KIND.wall);
    const kfp = ccw([at(cu + cw + 4, D - 12), at(W - 2, D - 12), at(W - 2, D - 2), at(cu + cw + 4, D - 2)]);
    B.prism(kfp, g - 0.2, g + 4.4, g, false); B.kind(KIND.roof, [0.3, 0.3, 0.3]); B.cap(kfp, g + 4.4, 1);
    const [kx, kz] = centroid(kfp); this.cuboid(kx, g + 2.1, kz, (W - 2 - cu - cw - 4) / 2, 2.3, 5, cy);
    B.setB(dummy('metal', [0.3, 0.3, 0.3]), KIND.metal);
    const [px, pz] = at(1.5, 1.5);
    B.boxAt(px, pz, g, 0.5, 0.5, 9, cy, 0); B.kind(KIND.sign, brand); B.boxAt(px, pz, g + 9, 3.2, 0.5, 3, cy, 0);
    this.cuboid(px, g + 4.5, pz, 0.25, 4.5, 0.25, 0, { kind: 'box', tag: 'pole', r: 0.25, mat: 'steel' });
    B.setB(dummy(), KIND.concrete);
    gs.pumps = [];
    for (const [u, v] of [[cu + 7, cv + cd / 2], [cu + 15, cv + cd / 2]]) { const [x, z] = at(u, v); gs.pumps.push([x, g, z, yaw]); }
  }

  jump(j) {
    const B = this.B, H = this.H, c = Math.cos(j.yaw), s = Math.sin(j.yaw);
    const at = (u, v) => [j.x + u * c + v * s, j.z - u * s + v * c];
    const g = H(j.x, j.z);
    const pts = [[-j.w / 2, -j.l / 2, 0], [j.w / 2, -j.l / 2, 0], [j.w / 2, j.l / 2, 0], [-j.w / 2, j.l / 2, 0], [-j.w / 2, j.l / 2, j.h], [j.w / 2, j.l / 2, j.h]].map(([u, v, h]) => { const [x, z] = at(u, v); return [x, g + h - 0.1, z]; });
    B.setB(dummy('concrete', [0.55, 0.42, 0.25]), KIND.wood);
    face(B, pts[0], pts[1], pts[5], pts[4]);
    face(B, pts[2], pts[3], pts[4], pts[5]);
    B.v(...pts[1], 1, 0, 0, 0, 0); B.v(...pts[2], 1, 0, 0, 0, 0); B.v(...pts[5], 1, 0, 0, 0, 0);
    const o = B.nv; B.v(...pts[0], -1, 0, 0, 0, 0); B.v(...pts[4], -1, 0, 0, 0, 0); B.v(...pts[3], -1, 0, 0, 0, 0); B.tri(o, o + 1, o + 2); B.tri(o - 3, o - 2, o - 1);
    this.hull(pts, { kind: 'ground', tag: 'ramp', mat: 'wood' });
  }

  stadium(S) {
    const B = this.B, H = this.H, n = 48, g = H(S.x, S.z) + 0.1;
    const c = Math.cos(S.yaw), s = Math.sin(S.yaw);
    const at = (a, k) => { const u = Math.cos(a) * S.rx * k, v = Math.sin(a) * S.rz * k; return [S.x + u * c - v * s, S.z + u * s + v * c]; };
    const fp = []; for (let i = 0; i < n; i++) fp.push(at((i / n) * Math.PI * 2, 0.62));
    flatPoly(this.G, fp, () => g, 0.05, GK.lawn, 14);
    const gates = [0, n / 2];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const gate = gates.some((q) => i === q || i === (q + n - 1) % n);
      const o0 = at(a0, 1), o1 = at(a1, 1), m0 = at(a0, 0.86), m1 = at(a1, 0.86), i0 = at(a0, 0.66), i1 = at(a1, 0.66);
      B.setB({ P: { style: 'concrete', color: [0.75, 0.74, 0.72], floorH: 4.5, bayW: 3.2, winW: 0.4, winH: 0.3, ground: 6, lit: 0.9 }, seed: 5, ground: g }, KIND.wall);
      if (!gate) face(B, [o1[0], g, o1[1]], [o0[0], g, o0[1]], [o0[0], g + S.h, o0[1]], [o1[0], g + S.h, o1[1]]);
      else face(B, [o1[0], g + 7, o1[1]], [o0[0], g + 7, o0[1]], [o0[0], g + S.h, o0[1]], [o1[0], g + S.h, o1[1]]);
      B.kind(KIND.concrete, [0.42, 0.42, 0.44]);
      const lo = gate ? 7 : 1.2;
      face(B, [i0[0], g + lo, i0[1]], [i1[0], g + lo, i1[1]], [m1[0], g + S.h * 0.55, m1[1]], [m0[0], g + S.h * 0.55, m0[1]]);
      face(B, [m0[0], g + S.h * 0.55, m0[1]], [m1[0], g + S.h * 0.55, m1[1]], [o1[0], g + S.h, o1[1]], [o0[0], g + S.h, o0[1]]);
      if (!gate) face(B, [i1[0], g, i1[1]], [i0[0], g, i0[1]], [i0[0], g + lo, i0[1]], [i1[0], g + lo, i1[1]]);
      const P = (p, y) => [p[0], y, p[1]];
      if (!gate) this.hull([P(o0, g), P(o1, g), P(i0, g), P(i1, g), P(o0, g + S.h), P(o1, g + S.h), P(i0, g + 1.2), P(i1, g + 1.2), P(m0, g + S.h * 0.55), P(m1, g + S.h * 0.55)], { kind: 'box', tag: 'stadium', mat: 'concrete' });
      else this.hull([P(o0, g + 7), P(o1, g + 7), P(i0, g + 7), P(i1, g + 7), P(o0, g + S.h), P(o1, g + S.h), P(m0, g + S.h * 0.55), P(m1, g + S.h * 0.55)], { kind: 'box', tag: 'stadium', mat: 'concrete' });
      B.kind(KIND.metal, [0.85, 0.86, 0.87]);
      const r0 = at(a0, 1.04), r1 = at(a1, 1.04), q0 = at(a0, 0.82), q1 = at(a1, 0.82);
      face(B, [q0[0], g + S.h + 6, q0[1]], [q1[0], g + S.h + 6, q1[1]], [r1[0], g + S.h + 4, r1[1]], [r0[0], g + S.h + 4, r0[1]]);
      face(B, [r0[0], g + S.h + 4, r0[1]], [r1[0], g + S.h + 4, r1[1]], [q1[0], g + S.h + 6, q1[1]], [q0[0], g + S.h + 6, q0[1]]);
    }
    for (const a of [0.6, 2.55, 3.75, 5.7]) { const [x, z] = at(a, 1.12); B.kind(KIND.metal, [0.5, 0.5, 0.5]); B.cyl(x, z, g, 1, S.h + 22, 8); B.kind(16, [1, 1, 0.95]); B.boxAt(x, z, g + S.h + 22, 8, 3, 4, a, 0); this.cuboid(x, g + (S.h + 22) / 2, z, 1, (S.h + 22) / 2, 1, 0, { kind: 'box', tag: 'pole', r: 1, mat: 'steel' }); }
  }

  quays() {
    const H = this.H;
    if (this.plan.style === 'none') return;
    let B = this.B;
    const edges = [[[-2625, 3500], [-2625, 7600]], [[580, 7600], [580, 3500]], [[-2625, 7600], [580, 7600]], [[1460, 7620], [1460, 6000]], [[1460, 7620], [4300, 7620]]];
    for (const [a, b] of edges) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 16);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
        const g0 = H(x0, z0), g1 = H(x1, z1);
        if (g0 < 1.5 && g1 < 1.5) continue;
        this.at((x0 + x1) / 2, (z0 + z1) / 2); B = this.B; B.setB(dummy('stone', [0.42, 0.4, 0.37]), KIND.trim);
        face(B, [x0, -4, z0], [x1, -4, z1], [x1, g1 + 0.6, z1], [x0, g0 + 0.6, z0]);
        face(B, [x1, -4, z1], [x0, -4, z0], [x0, g0 + 0.6, z0], [x1, g1 + 0.6, z1]);
      }
    }
  }

  cranes(st) {
    const H = this.H, q = st.quay, R = rng(42);
    let B = this.B;
    const cols = [[0.85, 0.25, 0.1], [0.15, 0.35, 0.65], [0.9, 0.7, 0.1]];
    const place = (x, z, yaw, color) => {
      this.at(x, z); B = this.B;
      const g = H(x, z) + 0.2, c = Math.cos(yaw), s = Math.sin(yaw), at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
      B.setB(dummy('metal', color), KIND.metal);
      const legH = 46, span = 30, gauge = 22;
      for (const [u, v] of [[-gauge / 2, -span / 2], [gauge / 2, -span / 2], [-gauge / 2, span / 2], [gauge / 2, span / 2]]) { const [px, pz] = at(u, v); B.boxAt(px, pz, g, 1.6, 1.6, legH, -yaw, 0); this.cuboid(px, g + legH / 2, pz, 0.8, legH / 2, 0.8, 0, { kind: 'box', tag: 'pole', r: 1, mat: 'steel' }); }
      for (const v of [-span / 2, span / 2]) { const [px, pz] = at(0, v); B.boxAt(px, pz, g + legH - 3, gauge + 2, 1.8, 3, -yaw + Math.PI / 2, 0); B.boxAt(px, pz, g + 10, gauge, 1.2, 1.4, -yaw + Math.PI / 2, 0); }
      const boom = 70, back = 30;
      const [bx, bz] = at(0, (boom - back) / 2 - 2);
      B.boxAt(bx, bz, g + legH, 4, boom + back, 3.4, -yaw, 0);
      const [hx, hz] = at(0, -back + 6); B.kind(KIND.wall, [0.85, 0.85, 0.82]); B.boxAt(hx, hz, g + legH + 3.4, 10, 12, 6, -yaw, 0);
      B.kind(KIND.metal, color); const [ax, az] = at(0, -6); B.boxAt(ax, az, g + legH + 3.4, 3, 3, 22, -yaw, 0);
      const [tx, tz] = at(0, boom - 8); B.kind(KIND.metal, [0.2, 0.2, 0.2]); B.boxAt(tx, tz, g + legH - 4, 6, 3, 3, -yaw, 0);
      this.lights.push({ x: tx, y: g + legH + 4, z: tz, kind: 'warn', yaw: 0 }, { x: ax, y: g + legH + 26, z: az, kind: 'warn', yaw: 0 });
    };
    for (let i = 0; i < st.n; i++) { const x = q.x0 + (q.x1 - q.x0) * (i + 0.5) / st.n; place(x, q.z - 26, Math.PI, cols[i % 3]); }
    for (let i = 0; i < 4; i++) { const z = st.quay2.z0 + (st.quay2.z1 - st.quay2.z0) * (i + 0.5) / 4; place(st.quay2.x + 26, z, -Math.PI / 2, cols[(i + 1) % 3]); }
  }

  ship(st) {
    this.at(st.x, st.z);
    const B = this.B, c = Math.cos(st.yaw), s = Math.sin(st.yaw), L = st.len, Wd = L * 0.15, R = rng(Math.round(st.x));
    const at = (u, v) => [st.x + u * c + v * s, st.z - u * s + v * c];
    const hull = [];
    const prof = [[-L / 2, 0.85], [-L / 2 + 8, 1], [L / 2 - 40, 1], [L / 2 - 12, 0.6], [L / 2, 0.08]];
    for (const [v, k] of prof) hull.push(at(Wd / 2 * k, v));
    for (const [v, k] of prof.slice().reverse()) hull.push(at(-Wd / 2 * k, v));
    const fp = ccw(hull);
    B.setB(dummy('metal', [0.12, 0.14, 0.18]), KIND.metal);
    B.prism(fp, -10, 4, 0, false);
    B.kind(KIND.metal, [0.55, 0.12, 0.08]); B.prism(fp, -10, -1, 0, false);
    B.kind(KIND.concrete, [0.35, 0.36, 0.36]); B.cap(fp, 4, 1);
    const P = (p, y) => [p[0], y, p[1]];
    this.hull(fp.flatMap((p) => [P(p, -10), P(p, 4)]), { kind: 'ground', tag: 'ship', mat: 'steel' });
    const [hx, hz] = at(0, -L / 2 + 18);
    B.setB({ P: { style: 'concrete', color: [0.9, 0.9, 0.88], floorH: 2.8, bayW: 2, winW: 0.7, winH: 0.5, ground: 0.5, lit: 0.8 }, seed: 3, ground: 4 }, KIND.wall);
    B.boxAt(hx, hz, 4, Wd * 0.9, 14, 18, -st.yaw, 4); this.cuboid(hx, 13, hz, Wd * 0.45, 9, 7, st.yaw);
    B.setB(dummy('metal', [0.5, 0.5, 0.5]), KIND.metal);
    const colors = [[0.6, 0.1, 0.08], [0.1, 0.25, 0.5], [0.15, 0.4, 0.2], [0.75, 0.55, 0.1], [0.5, 0.5, 0.52], [0.8, 0.8, 0.78], [0.35, 0.2, 0.12]];
    for (let v = -L / 2 + 32; v < L / 2 - 40; v += 13) {
      const h = 2 + Math.floor(R() * 4), [x, z] = at(0, v);
      B.setB({ P: { style: 'metal', color: colors[Math.floor(R() * colors.length)], floorH: 2.6, bayW: 2.44, winW: 0, winH: 0, ground: 0, lit: 0 }, seed: Math.floor(R() * 120), ground: 4 }, KIND.container);
      B.boxAt(x, z, 4, Wd - 3, 12.2, h * 2.6, -st.yaw, 4);
      this.cuboid(x, 4 + h * 1.3, z, Wd / 2 - 1.5, h * 1.3, 6.1, st.yaw, { kind: 'box', tag: 'container', mat: 'steel' });
    }
  }

  port() {
    if (this.plan.style === 'none' || this.plan.style === 'frontier' || this.plan.style === 'scifi') return;
    const H = this.H, R = rng(7);
    for (let x = PORT.road + 60; x < 4120; x += 46) for (let z = 7070; z < 7500; z += 44) {
      if (R() < 0.22) continue;
      this.at(x, z); const B = this.B;
      const h = 1 + Math.floor(R() * 4), rows = 3 + Math.floor(R() * 3), g = H(x, z) + 0.1, w = rows * 2.5;
      B.setB({ P: { style: 'metal', color: [0.5, 0.45, 0.4], floorH: 2.6, bayW: 2.5, winW: 0, winH: 0, ground: 0, lit: 0 }, seed: Math.floor(R() * 120), ground: g }, KIND.container);
      B.boxAt(x, z, g, w, 36.6, h * 2.6, 0, g);
      this.cuboid(x, g + h * 1.3, z, w / 2, h * 1.3, 18.3);
    }
    this.at(PORT.road + 400, 6150); const B = this.B;
    B.setB(dummy('metal', [0.82, 0.82, 0.8]), KIND.metal);
    for (let i = 0; i < 6; i++) { const x = PORT.road + 120 + (i % 3) * 360, z = 6100 + Math.floor(i / 3) * 130, g = H(x, z); B.cyl(x, z, g, 22, 18, 16, true, 22); this.cuboid(x, g + 9, z, 16, 9, 16); }
  }

  airport(st) {
    const A = AIRPORT, H = this.H, rw = A.runway;
    this.at(-4500, 7300); const B = this.B;
    for (let x = rw.x0; x <= rw.x1; x += 60) for (const side of [-1, 1]) this.lights.push({ x, y: H(x, rw.z) + 0.3, z: rw.z + side * (rw.w / 2 + 1), kind: 'runway', yaw: 0 });
    for (let k = 1; k <= 8; k++) this.lights.push({ x: rw.x0 - k * 40, y: H(rw.x0 - k * 40, rw.z) + 1, z: rw.z, kind: 'approach', yaw: 0 }, { x: rw.x1 + k * 40, y: H(rw.x1 + k * 40, rw.z) + 1, z: rw.z, kind: 'approach', yaw: 0 });
    for (let x = rw.x0 + 150; x <= rw.x1 - 150; x += 60) this.lights.push({ x, y: H(x, A.taxi.z) + 0.3, z: A.taxi.z + A.taxi.w / 2 + 1, kind: 'taxi', yaw: 0 });
    const planes = [[-6300, 6800, Math.PI], [-5800, 6780, Math.PI], [-5300, 6800, Math.PI], [-6650, 6640, -Math.PI / 2], [-7300, 7050, Math.PI / 2]];
    for (const [x, z, yaw] of planes) this.airliner(x, z, yaw);
    B.setB(dummy('metal', [0.86, 0.86, 0.86]), KIND.metal);
    const [wx, wz] = [-4500, 7300]; const g = H(wx, wz); B.cyl(wx, wz, g, 0.15, 6, 4); B.kind(KIND.awning, [0.95, 0.45, 0.05]); B.cyl(wx + 1.5, wz, g + 5.2, 0.45, 0.01, 6); B.boxAt(wx + 1.6, wz, g + 5.4, 3, 0.6, 0.6, 0, 0);
  }

  airliner(x, z, yaw) {
    this.at(x, z);
    const B = this.B, g = this.H(x, z), c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
    B.setB({ P: { style: 'metal', color: [0.92, 0.92, 0.93], floorH: 2, bayW: 0.6, winW: 0.4, winH: 0.15, ground: 0, lit: 0.6 }, seed: 11, ground: g }, KIND.metal);
    const L = 38, r = 2;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const v0 = -L / 2 + i * L / n, v1 = v0 + L / n, k0 = i === 0 ? 0.35 : i === n - 1 ? 0.55 : 1, k1 = i === n - 2 ? 0.55 : i === n - 1 ? 0.12 : 1;
      const [ax, az] = at(0, v0), [bx, bz] = at(0, v1);
      segTube(B, [ax, g + 3.4, az], [bx, g + 3.4 + (i === n - 1 ? 1.2 : 0), bz], r * k0, r * k1);
    }
    const wing = (side) => { const p = [[0, -2], [0, 5], [side * 17, -4], [side * 17, -6.5]].map(([u, v]) => at(u, v)); const y = g + 2.4; face(B, [p[0][0], y, p[0][1]], [p[1][0], y, p[1][1]], [p[2][0], y + 1.2, p[2][1]], [p[3][0], y + 1.2, p[3][1]]); face(B, [p[1][0], y, p[1][1]], [p[0][0], y, p[0][1]], [p[3][0], y + 1.2, p[3][1]], [p[2][0], y + 1.2, p[2][1]]); };
    wing(1); wing(-1);
    const [tx, tz] = at(0, -L / 2 + 3); const [tx2, tz2] = at(0, -L / 2 + 8);
    B.kind(KIND.metal, [0.1, 0.25, 0.55]);
    face(B, [tx, g + 5, tz], [tx2, g + 5, tz2], [tx2, g + 12, tz2], [tx, g + 12, tz]); face(B, [tx2, g + 5, tz2], [tx, g + 5, tz], [tx, g + 12, tz], [tx2, g + 12, tz2]);
    B.kind(KIND.metal, [0.6, 0.6, 0.62]);
    for (const side of [-1, 1]) { const [ex, ez] = at(side * 6, 1); B.cyl(ex, ez, g + 1.3, 1.1, 0.01, 8); segTube(B, [...at(side * 6, 4)].flatMap((v, i) => (i === 0 ? [v, g + 1.6] : [v])), [...at(side * 6, -1)].flatMap((v, i) => (i === 0 ? [v, g + 1.6] : [v])), 1.1, 1.1); }
    const pts = []; for (const [u, v] of [[-2.2, -L / 2], [2.2, -L / 2], [-2.2, L / 2], [2.2, L / 2]]) { const [px, pz] = at(u, v); pts.push([px, g + 1.4, pz], [px, g + 5.4, pz]); }
    this.hull(pts, { kind: 'box', tag: 'plane', mat: 'steel' });
    const wp = []; for (const [u, v] of [[-17, -6.5], [17, -6.5], [-1, 5], [1, 5]]) { const [px, pz] = at(u, v); wp.push([px, g + 2.2, pz], [px, g + 3.6, pz]); }
    this.hull(wp, { kind: 'box', tag: 'plane', mat: 'steel' });
  }

  finish() {
    if (this.city.props && this.lights.length) this.city.props.addLights(this.lights);
  }

  bridgeState(t) {
    const c = 150, ph = ((t % c) + c) % c;
    if (ph < 112) return { a: 0, warn: ph > 104 };
    if (ph < 122) return { a: (ph - 112) / 10, warn: true };
    if (ph < 138) return { a: 1, warn: true };
    if (ph < 148) return { a: 1 - (ph - 138) / 10, warn: true };
    return { a: 0, warn: true };
  }

  preStep(dt) {
    if (!this.anim.length) return;
    const st = this.city.debugBridge !== undefined ? { a: this.city.debugBridge, warn: true } : this.bridgeState(Date.now() / 1000), e = st.a * st.a * (3 - 2 * st.a), ang = e * 1.32;
    this.bridgeOpen = st;
    for (const L of this.anim) {
      if (L.type !== 'leaf') continue;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), L.sgn * ang);
      L.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      L.angle = L.sgn * ang;
    }
  }

  update(dt, cam) {
    for (const L of this.anim) if (L.type === 'leaf') { L.grp.rotation.z = L.angle; L.grp.updateMatrixWorld(true); }
  }

  dispose() {
    const world = this.g.phys.world;
    for (const b of this.bodies) { try { world.removeRigidBody(b); } catch (e) {} }
    this.bodies = []; this.anim = [];
    this.root.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    if (this.root.parent) this.root.parent.remove(this.root);
    if (this.active && this.city.props) this.city.props.clearLights();
    if (this.active && this.city.V.tunnelCuts === this.cuts) this.city.V.tunnelCuts = null;
    this.active = false;
  }
}

function insetPoly2(fp, d) {
  const [cx, cz] = centroid(fp), k = 1 + d / Math.sqrt(Math.abs(polyArea(fp)));
  return fp.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);
}

function segBeam(B, a, b, r) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  if (L < 0.01) return;
  const t = [dx / L, dy / L, dz / L];
  let ux = -t[2], uy = 0, uz = t[0]; let ul = Math.hypot(ux, uy, uz);
  if (ul < 1e-3) { ux = 1; uy = 0; uz = 0; ul = 1; }
  ux /= ul; uz /= ul;
  const vx = t[1] * uz - t[2] * uy, vy = t[2] * ux - t[0] * uz, vz = t[0] * uy - t[1] * ux;
  const P = (p, su, sv) => [p[0] + (ux * su + vx * sv) * r, p[1] + (uy * su + vy * sv) * r, p[2] + (uz * su + vz * sv) * r];
  const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < 4; i++) { const [s0, t0] = c[i], [s1, t1] = c[(i + 1) % 4]; face(B, P(a, s0, t0), P(b, s0, t0), P(b, s1, t1), P(a, s1, t1), L); }
}

function segTube(B, a, b, r0, r1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  if (L < 0.01) return;
  const t = [dx / L, dy / L, dz / L];
  let ux = -t[2], uy = 0, uz = t[0]; let ul = Math.hypot(ux, uy, uz); if (ul < 1e-3) { ux = 1; uz = 0; ul = 1; }
  ux /= ul; uz /= ul;
  const vx = t[1] * uz - t[2] * uy, vy = t[2] * ux - t[0] * uz, vz = t[0] * uy - t[1] * ux;
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const P = (p, r, a) => [p[0] + (ux * Math.cos(a) + vx * Math.sin(a)) * r, p[1] + (uy * Math.cos(a) + vy * Math.sin(a)) * r, p[2] + (uz * Math.cos(a) + vz * Math.sin(a)) * r];
    face(B, P(a, r0, a1), P(b, r1, a1), P(b, r1, a0), P(a, r0, a0), L);
  }
}

export function geoOf(o, kind) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(o.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(o.normal, 3));
  if (kind === 'b') { g.setAttribute('uv', new THREE.BufferAttribute(o.uv, 2)); g.setAttribute('fa', new THREE.BufferAttribute(o.fa, 4, true)); g.setAttribute('fb', new THREE.BufferAttribute(o.fb, 4, true)); g.setAttribute('fc', new THREE.BufferAttribute(o.fc, 4, true)); }
  else { g.setAttribute('rq', new THREE.BufferAttribute(o.rq, 4)); g.setAttribute('rk', new THREE.BufferAttribute(o.rk, 4, true)); }
  g.setIndex(new THREE.BufferAttribute(o.index, 1));
  g.computeBoundingSphere();
  return g;
}
