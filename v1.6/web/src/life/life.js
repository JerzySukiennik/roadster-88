// Roadster 88 life system: owns everything that moves in the valley (creatures from Meganeura and Dimetrodon to mammoths, people in period dress, traffic of the decade, flyers, the train), swaps the population per period and year (seeded per online room, with a leader that exports poses and followers that import them), simulates it with brains, groups and lanes, keeps Rapier bodies near the car so it can hit (and be hit by) them, reacts to boosts, hovering and time jumps, and draws it all through instanced, GPU-skinned crowds with LOD and culling.
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { Kind, loadBin } from './crowd.js';
import { LOOKS } from './looks.js';
import { CarSense } from './sense.js';
import { Bodies, eulerYXZ } from './body.js';
import { Agent, clamp, rnd, random, useRandom, seeded, towards, steerGround } from './agents.js';
import { BRAINS, scareAround } from './brains.js';
import { Sidewalks, walker, reactArrival, pet } from './people.js';
import { Traffic } from './traffic.js';
import { spawn, welcome, kindsFor, DETAIL as SPAWN_DETAIL } from './populate.js';
import { NET_STALE, assignIds, exportPoses, importPoses, netPose, netResume, softDown } from './net.js';
import { trafficOf } from './plans.js';
import { periodInfo } from '../eras/periods.js';
import { PERIODS } from '../sim/timetravel.js';
import { colors } from './palette.js';
import { LifeAudio } from './sound.js';
import { eraOf } from '../sim/timetravel.js';

const SPECIES = {
  trex: () => import('./species/trex.js'), triceratops: () => import('./species/triceratops.js'), sauropod: () => import('./species/sauropod.js'),
  raptor: () => import('./species/raptor.js'), hadrosaur: () => import('./species/hadrosaur.js'), quetzal: () => import('./species/quetzal.js'),
  bird: () => import('./species/bird.js'), horse: () => import('./species/horse.js'), longhorn: () => import('./species/longhorn.js'),
  canid: () => import('./species/canid.js'), deer: () => import('./species/deer.js'),
  mammoth: () => import('./species/mammoth.js'), stegosaurus: () => import('./species/stegosaurus.js'), dimetrodon: () => import('./species/dimetrodon.js'),
  dragonfly: () => import('./species/dragonfly.js'), bison: () => import('./species/bison.js'),
};
for (const v of ['m1885', 'f1885', 'm2026', 'f2026', 'm2080', 'f2080', 'scifi', 'mnative', 'fnative', 'mpadre', 'mvaquero', 'mminer', 'm1900', 'f1900', 'm1920', 'f1920', 'm1950', 'f1950', 'm1970', 'f1970', 'm1990', 'f1990']) SPECIES['human_' + v] = () => import('./species/human.js').then((m) => m.variant(v));
for (const v of ['car_sedan', 'car_hatch', 'car_suv', 'car_pickup', 'truck_semi', 'car_t', 'car_30s', 'truck_old', 'car_50s', 'car_70s', 'car_90s', 'pod', 'ev2080', 'hover', 'wagon', 'coach', 'drone', 'loco', 'railcar_pass', 'railcar_box']) SPECIES[v] = () => import('./species/vehicles.js').then((m) => m.variant(v));

const KIND_IDS = Object.keys(SPECIES);
const trafficKinds = (T) => (T ? [...T.models.map(([m]) => m), ...(T.horse ? ['horse', T.driver] : [])] : []);
const SHAPE = (id) => (id.startsWith('human') ? 'human' : id.startsWith('car_') || id === 'pod' || id === 'ev2080' || id === 'hover' || id === 'truck_old' ? 'car' : id === 'truck_semi' ? 'truck' : id === 'wagon' || id === 'coach' ? 'wagon' : id);
const DETAIL = { low: 0.6, medium: 0.8, high: 1, ultra: 1.2 };
const BUBBLE = 75;

export class LifeSystem {
  constructor(game, valley, eras) {
    this.game = game; this.valley = valley; this.V = valley; this.eras = eras;
    this.root = new THREE.Group(); this.root.name = 'Life';
    game.gfx.scene.add(this.root);
    this.U = { night: uniform(0), time: uniform(0) };
    this.kinds = new Map(); this.pending = new Map();
    this.agents = []; this.groups = []; this.solo = []; this.people = []; this.obstacles = [];
    this.sense = new CarSense(game, valley);
    this.bodies = new Bodies(game);
    this.traffic = new Traffic(this);
    this.townWalks = this.walks = new Sidewalks(valley);
    this.audio = new LifeAudio(this);
    this.eraId = null; this.version = 0; this.time = 0; this.night = false;
    this.frustum = new THREE.Frustum(); this.pm = new THREE.Matrix4(); this.sph = new THREE.Sphere();
    this.camPos = new THREE.Vector3();
    this.preset = game.gfx.presetName || 'high';
    this.detail = DETAIL[this.preset] || 1;
    this.stats = { sim: 0, draw: 0, bodies: 0, hits: 0 };
    this.events = [];
    this._n = { x: 0, y: 1, z: 0 };
    this.townC = (valley.region && valley.region('town') && valley.region('town').center) || [-1210, -200];
    this.wcache = new Map();
    this.toWarm = []; this.warming = false;
    this.seedKey = null; this.spawnSeed = null; this.netRole = null; this.netMap = new Map(); this.netQ = []; this.frameNo = 0;
  }

  async kind(id) {
    if (this.kinds.has(id)) return this.kinds.get(id);
    if (this.pending.has(id)) return this.pending.get(id);
    const p = (async () => {
      const [mod, data] = await Promise.all([SPECIES[id](), loadBin(id)]);
      const k = new Kind(this, data, mod, LOOKS[id] || LOOKS[id.split('_')[0]], { shadowLods: 1 });
      k.size = Math.max(mod.meta.length || 1, mod.meta.height || 1);
      this.kinds.set(id, k);
      this.toWarm.push(k);
      return k;
    })();
    this.pending.set(id, p);
    return p;
  }

  yearFor(eraId) {
    const tc = this.game.tc, y = tc ? tc.present.year : 2026;
    if (eraOf(y).id === eraId) return y;
    const p = PERIODS.find((q) => q.id === eraId);
    return p ? p.date.year : y;
  }

  async preload(eraId) {
    const year = this.yearFor(eraId), ids = kindsFor(eraId, year);
    for (const k of trafficKinds(trafficOf(eraId, year))) ids.add(k);
    await Promise.all([...ids].map((id) => this.kind(id).catch((e) => console.warn('life kind', id, e))));
    return ids;
  }

  clear() {
    this.bodies.clear();
    this.wcache = new Map();
    this.agents = []; this.groups = []; this.solo = []; this.people = []; this.obstacles = [];
    this.traffic = new Traffic(this);
    this.netMap = new Map();
  }

  async setEra(eraId) {
    try { await this.swap(eraId); } catch (e) { console.error('life.setEra failed', e); }
  }

  async swap(eraId) {
    const year = this.yearFor(eraId), key = eraId + ':' + Math.floor(year / 5);
    if (key === this.swapKey && this.agents.length && (!this.seedKey || this.spawnSeed === this.seedKey)) return;
    this.eraId = eraId; this.swapKey = key; this.year = year;
    const P = periodInfo(eraId), seedKey = this.seedKey;
    const rng = (part) => (seedKey ? seeded(seedKey + '|' + eraId + '|' + part) : null);
    this.spawnSeed = seedKey;
    this.townAvoid = !P.natural; this.roadAvoid = !P.natural && P.age !== 'post';
    this.trafficSpec = trafficOf(eraId, year);
    const ver = ++this.version;
    this.ready = false;
    this.clear();
    let plan;
    useRandom(rng('spawn'));
    try { plan = spawn(this, eraId, seedKey ? 'high' : this.preset, year); } finally { useRandom(null); }
    const need = new Set(plan.kinds);
    if (plan.traffic || plan.train || plan.parked) for (const k of trafficKinds(this.trafficSpec)) need.add(k);
    await Promise.all([...need].map((id) => this.kind(id).catch((e) => console.warn('life kind', id, e))));
    if (ver !== this.version) return;
    const base = plan.agents.slice();
    this.agents = plan.agents; this.groups = plan.groups; this.solo = plan.solo;
    const T = this.trafficSpec, tk = seedKey ? SPAWN_DETAIL[this.preset] || 1 : 1;
    if (plan.traffic && T) { this.traffic.build(T, plan.train); this.agents.push(...this.traffic.populate(T, plan.traffic * tk)); }
    let parked = [];
    if (plan.parked && T) {
      if (!this.traffic.lanes.length) this.traffic.build(T, plan.train);
      useRandom(rng('parked'));
      try { parked = this.traffic.parked(T, plan.parked); } finally { useRandom(null); }
      this.agents.push(...parked);
    }
    if (plan.train) { if (!this.traffic.lanes.length || !this.traffic.rail) this.traffic.build(T || trafficOf('1885', 1885), true); this.agents.push(...this.traffic.setupTrain()); this.handTrain(); }
    this.walks = this.walksFor(P);
    const n0 = this.agents.length;
    if (plan.peopleSpec) { useRandom(rng('people')); try { this.spawnPeople(plan.peopleSpec); } finally { useRandom(null); } }
    if (seedKey) { assignIds(this, [base, parked, this.agents.slice(n0)], KIND_IDS); this.cull(); }
    if (P.skyfx && P.skyfx.herd && this.eras && this.eras.handOver) { try { this.eras.handOver('herd'); } catch (e) { /* era system without hand-over */ } }
    for (const a of this.agents) { a.K = this.kinds.get(a.kind) || null; if (!a.fly && a.ground !== false) a.y = this.V.heightAt(a.x, a.z); a.tx = a.x; a.tz = a.z; if (a.K) { a.clip = a.K.clips.idle ? 'idle' : a.K.clips.glide ? 'glide' : Object.keys(a.K.clips)[0]; a.t = Math.random(); } a.prev = null; a.fade = 1; }
    const S = this.game.car && this.game.car.sim;
    if (S && this.netRole !== 'follow') welcome(this, eraId, S.pos.x, S.pos.z, S.yaw());
    if (this.game.tc && this.game.tc.state === 'arriving') this.sense.tcState = 'gone';
    this.ready = true;
    if (this.seedKey && this.seedKey !== this.spawnSeed) this.setEra(this.eraId);
  }

  cull() {
    const k = SPAWN_DETAIL[this.preset] || 1;
    if (k >= 1) return;
    const drop = new Set(), frac = (n) => (n * 0.6180339887) % 1;
    for (const g of this.groups) {
      if (k < 0.6 && g.gi >= Math.max(1, Math.round(g.pg * 0.67))) { for (const m of g.members) drop.add(m); continue; }
      const keep = Math.max(2, Math.round(g.members.length * Math.min(1, k + 0.15)));
      for (let i = keep; i < g.members.length; i++) drop.add(g.members[i]);
    }
    for (const a of this.agents) if (a.netId !== undefined && (a.brain === 'walker' || a.brain === 'parked') && frac(a.netId) >= k) drop.add(a);
    for (const a of this.agents) if (a.brain === 'pet' && (drop.has(a.owner) || frac(a.netId) >= k)) drop.add(a);
    if (!drop.size) return;
    const keep = (a) => !drop.has(a);
    this.agents = this.agents.filter(keep); this.people = this.people.filter(keep); this.solo = this.solo.filter(keep);
    this.groups = this.groups.filter((g) => (g.members = g.members.filter(keep)).length > 0);
    for (const a of drop) this.netMap.delete(a.netId);
  }

  seed(key) {
    key = key ? String(key).replace(/_[a-z0-9]{2,8}$/, '') || String(key) : null;
    if (key === this.seedKey) return;
    this.seedKey = key;
    if (key && this.ready && this.eraId && this.spawnSeed !== key) this.setEra(this.eraId);
  }

  netLeader(on) {
    const role = on === true ? 'lead' : on === false ? 'follow' : null;
    if (role === this.netRole) return;
    this.netRole = role;
    this.frameNo++;
    if (role !== 'follow') for (const a of this.agents) if (a.net) netResume(this, a);
    this.netQ = [];
  }

  netExport(maxN = 60, players = null) {
    if (!this.ready || this.netRole === 'follow') return [];
    return exportPoses(this, maxN, players);
  }

  netImport(list) {
    if (!this.ready || this.netRole === 'lead' || !list || !list.length) return;
    importPoses(this, list);
  }

  netEvents() { const out = this.netQ; this.netQ = []; return out; }

  netHit(netId, impulse) {
    const a = this.netMap.get(netId);
    if (!a || !a.K || a.down || a.hide || !impulse || !this.ready) return false;
    const [vx, vy, vz] = Array.isArray(impulse) ? impulse : [impulse.x || 0, impulse.y || 0, impulse.z || 0];
    if (a.net) netResume(this, a);
    this.knock(a, { dv: Math.hypot(vx, vy, vz), vx, vy, vz }, [a.x, a.z]);
    return true;
  }

  handTrain() {
    const E = this.eras; if (!E || !E.handOver) return;
    for (const key of ['site:loco', 'site:car1', 'site:car2']) {
      try { E.handOver(key); if (E.handed) E.handed.delete(key); if (E.structures && E.structures.handed) E.structures.handed.delete(key); } catch (e) { /* older era system */ }
    }
  }

  walksFor(P) {
    if (!P.natural) return this.townWalks;
    const meta = this.eras && this.eras.structures && this.eras.structures.cur ? this.eras.structures.cur.meta : null, roads = [];
    if (meta) for (const [k, m] of meta) {
      if (!k.startsWith('fire:')) continue;
      const { x, z } = m.site;
      roads.push({ kind: 'street', width: 2, pts: [[x - 26, z], [x + 26, z]] }, { kind: 'street', width: 2, pts: [[x, z - 26], [x, z + 26]] });
    }
    return roads.length ? new Sidewalks({ roads }) : this.walks;
  }

  spawnPeople(spec) {
    const W = this.walks; if (!W.segs.length) return;
    let made = 0;
    while (made < spec.n) {
      const r = W.random(), [x, z] = W.at(r.seg, r.t);
      const group = random() < 0.3 ? Math.max(2, Math.min(3, spec.n - made)) : 1;
      const yaw0 = random() * Math.PI * 2;
      for (let i = 0; i < group; i++) {
        const v = spec.variants[Math.floor(random() * spec.variants.length)];
        const [c0, c1] = colors(v, random());
        const ang = yaw0 + (i / group) * Math.PI * 2, rr = group > 1 ? 0.75 : 0;
        const a = new Agent(v, { x: x + Math.sin(ang) * rr, z: z + Math.cos(ang) * rr, brain: 'walker', c0, c1, scale: rnd(0.93, 1.06) });
        if (group > 1) { a.state = 'talk'; a.timer = rnd(15, 60); a.face = ang + Math.PI; a.yaw = a.face; }
        else { a.state = 'walk'; a.timer = rnd(5, 20); }
        this.agents.push(a); this.people.push(a); made++;
      }
    }
    const walkers = this.people.filter((p) => p.state === 'walk');
    for (let i = 0; i < spec.dogs && walkers.length; i++) {
      const o = walkers[(i * 7) % walkers.length];
      const [c0, c1] = colors('canid', random(), { breed: 'dog' });
      const d = new Agent('canid', { x: o.x + 1, z: o.z, brain: 'pet', c0, c1, scale: rnd(0.75, 1.0) });
      d.owner = o; this.agents.push(d);
    }
  }

  terrainBits(x, z) {
    const ix = Math.round(x / 4), iz = Math.round(z / 4), key = ix * 4096 + iz;
    let b = this.wcache.get(key);
    if (b !== undefined) return b;
    const V = this.V, cx = ix * 4, cz = iz * 4;
    b = 0;
    if (Math.abs(cx) > 1940 || Math.abs(cz) > 1940 || (V.fluidAt && V.fluidAt(cx, cz)) || V.heightAt(cx, cz) > 160) b = 3;
    else { const n = V.normalAt(cx, cz, this._n); if (n.y < 0.82) b = 3; else if (n.y < 0.9) b = 2; }
    if (this.wcache.size > 400000) this.wcache.clear();
    this.wcache.set(key, b);
    return b;
  }

  walkable(x, z, a) {
    const b = this.terrainBits(x, z);
    if (b === 3) return false;
    if (b === 2 && a && a.K && a.K.size > 6) return false;
    if (a && !a.kind.startsWith('human') && a.brain !== 'pet' && a.brain !== 'tied' && this.townAvoid) {
      if (Math.abs(x - this.townC[0]) < 330 && Math.abs(z - this.townC[1]) < 280) return false;
      if (this.roadAvoid && Math.abs(x + 905) < 22) return false;
    }
    return true;
  }

  randomWalkable(cx, cz, r, a) {
    for (let i = 0; i < 24; i++) { const ang = random() * Math.PI * 2, d = r * Math.sqrt(random()), x = cx + Math.sin(ang) * d, z = cz + Math.cos(ang) * d; if (this.walkable(x, z, a)) return [x, z]; }
    return null;
  }

  randomPoint(cx, cz, r) { const ang = random() * Math.PI * 2, d = r * Math.sqrt(random()); return [clamp(cx + Math.sin(ang) * d, -1900, 1900), clamp(cz + Math.cos(ang) * d, -1900, 1900)]; }

  emit(type, a) { if (a && (type === 'bite' || type === 'pounce')) a.target = this.sense.uid; if (this.events.length > 64) this.events.shift(); this.events.push({ type, kind: a && a.kind, t: this.time }); this.audio.cue(type, a); }

  physics(dt) {
    const C = this.sense.car, B = this.bodies;
    let n = 0;
    for (const a of this.agents) {
      if (!a.K || !a.body) continue;
      const hit = B.probe(a);
      if (hit) this.knock(a, hit);
      if (a.body && !a.body.loose) { const t = a.body.b.translation(); a.x = t.x; a.z = t.z; if (a.fly) a.y = t.y; }
    }
    for (const a of this.agents) {
      if (!a.K || a.hide || a.brain === 'seat' || a.kind === 'bird' || a.kind === 'dragonfly' || a.brain === 'train') continue;
      const d = Math.hypot(a.x - C.x, a.z - C.z) - a.K.size * 0.5 * a.scale;
      const want = C.visible && d < BUBBLE + (a.brain === 'vehicle' ? 15 : 0) && (!a.fly || Math.abs(a.y - C.y) < 40);
      if (want && !a.body) B.create(a, SHAPE(a.kind), (a.K.meta.mass || 100) * a.scale * a.scale * a.scale);
      else if (!want && a.body && !a.down && d > BUBBLE + 30) B.remove(a);
      if (a.body) n++;
    }
    this.stats.bodies = n;
  }

  knock(a, hit, from) {
    this.stats.hits++;
    if (this.netRole === 'follow' && a.netId !== undefined && this.netQ.length < 32) this.netQ.push([a.netId, Math.round(hit.vx * 10) / 10, Math.round(hit.vy * 10) / 10, Math.round(hit.vz * 10) / 10]);
    a.down = a.body ? { t: 0, phase: 'air', dv: hit.dv } : { t: 0, phase: 'air', dv: hit.dv, soft: true, vx: hit.vx, vz: hit.vz };
    if (a.body) this.bodies.loosen(a, hit);
    a.action = null;
    const K = a.K;
    if (a.brain === 'vehicle' || a.brain === 'parked') { a.wreck = true; if (a.brain === 'vehicle') this.traffic.wrecked(a); a.brain = 'wreck'; }
    else if (K.clips.fall) a.play('fall', 0.08, 0);
    else if (K.clips.lie) a.play('lie', 0.15, 0);
    this.emit(a.kind.startsWith('human') ? 'hitPerson' : a.brain === 'wreck' ? 'hitCar' : 'hitAnimal', a);
    if (a.group) { a.group.scare = 6; a.group.scareX = from ? from[0] : this.sense.car.x; a.group.scareZ = from ? from[1] : this.sense.car.z; }
    for (const p of this.people) if (p !== a && !p.down && Math.hypot(p.x - a.x, p.z - a.z) < 30) { p.state = Math.random() < 0.5 ? 'flee' : 'cower'; p.timer = rnd(4, 8); p.st = 0; }
  }

  downUpdate(a, dt) {
    const D = a.down, B = this.bodies;
    D.t += dt;
    if (D.soft) { if (softDown(this, a, dt)) return; }
    else {
      if (!a.body) { a.down = null; if (a.net) a.net.hold = true; return; }
      const P = B.pose(a);
      a.x = P.x; a.y = P.y; a.z = P.z;
      const [yaw, pitch, roll] = eulerYXZ(P.qx, P.qy, P.qz, P.qw);
      if (D.phase === 'air') {
        a.yaw = yaw; a.pitch = pitch; a.roll = roll;
        if (a.wreck) return;
        if (B.settle(a, dt)) { D.phase = 'rest'; D.t = 0; D.from = [pitch, roll]; D.wait = rnd(1.2, 2.5); if (a.K.clips.lie) a.play('lie', 0.4, 0); }
        return;
      }
      if (D.phase === 'rest') {
        const k = Math.min(1, D.t / 0.9);
        a.yaw = yaw; a.pitch = D.from[0] * (1 - k); a.roll = D.from[1] * (1 - k);
        if (D.t > D.wait) {
          D.phase = 'up'; D.t = 0; a.pitch = 0; a.roll = 0;
          const gy = this.V.heightAt(a.x, a.z); a.y = gy;
          B.firm(a); a.body.b.setTranslation({ x: a.x, y: gy, z: a.z }, true);
          if (a.K.clips.getup) a.play('getup', 0.35, 0);
        }
        return;
      }
    }
    if (D.phase === 'up' && (!a.K.clips.getup || a.t >= 1)) {
      a.down = null; a.action = null; a.speed = 0;
      if (a.net) a.net.hold = true;
      if (a.kind.startsWith('human')) { a.state = 'flee'; a.timer = rnd(4, 8); }
      else if (a.brain === 'predator') { a.state = 'chase'; a.act('roar'); this.emit('roar', a); }
      else if (a.group) a.group.scare = 5;
    }
  }

  think(a, dt) {
    switch (a.brain) {
      case 'grazer': BRAINS.grazer.agent(this, a, dt); break;
      case 'predator': BRAINS.predator.agent(this, a, dt); break;
      case 'pack': BRAINS.pack.agent(this, a, dt); break;
      case 'soar': BRAINS.soar.agent(this, a, dt); break;
      case 'flock': BRAINS.flock.agent(this, a, dt); break;
      case 'drone': BRAINS.drone.agent(this, a, dt); break;
      case 'tied': BRAINS.tied.agent(this, a, dt); break;
      case 'walker': walker(this, a, dt); break;
      case 'pet': pet(this, a, dt); break;
      case 'story': break;
      case 'loose': { a.timer -= dt; if (a.timer < 0) { const p = this.randomWalkable(a.x, a.z, 60, a); if (p) { a.tx = p[0]; a.tz = p[1]; } a.timer = rnd(6, 14); } a.want = Math.hypot(a.tx - a.x, a.tz - a.z) > 3 ? (a.K.clips.trot ? a.K.clips.trot.speed : 2) : 0; steerGround(this, a, dt); break; }
      default: break;
    }
  }

  warmNext() {
    const g = this.game, gx = g.gfx;
    if (this.warming || !this.toWarm.length || !g.started || !gx.renderer.compileAsync) return;
    const k = this.toWarm.shift();
    if (k.lods.some((l) => l.n > 0)) return;
    this.warming = true;
    k.warm(gx.renderer, gx.camera, gx.scene).finally(() => { this.warming = false; });
  }

  update(dt, camPos) {
    this.warmNext();
    const tc = this.game.tc;
    if (tc && tc.armed && tc.destination) { const id = eraOf(tc.destination.year).id; if (id !== this.preloaded) { this.preloaded = id; this.preload(id); } }
    if (!this.ready) return;
    if (this.game.paused || this.game.started === false) dt = 0;
    const t0 = performance.now(), g = this.game;
    if (camPos) this.camPos.copy(camPos);
    this.time += dt; this.U.time.value = this.time;
    this.night = !!(g.sky && g.sky.state && g.sky.state.night > 0.35);
    this.U.night.value = g.sky && g.sky.state ? THREE.MathUtils.smoothstep(g.sky.state.night, 0.05, 0.5) : 0;
    const S = this.sense;
    S.multi = this.netRole !== 'follow';
    S.update(dt);
    if (dt > 0) {
      for (const ev of S.events) { scareAround(this, ev); if (ev.type === 'arrive' || ev.type === 'depart') reactArrival(this, ev); }
      this.physics(dt);
      for (const G of this.groups) { const B = BRAINS[G.brain]; if (B && B.group && G.members.length) { S.pick(G.cx, G.cz); B.group(this, G, dt); } }
      S.local();
      this.obstacles.length = 0;
      for (const a of this.agents) if ((a.down && !a.fly) || a.wreck || (a.path && a.path.crossing)) this.obstacles.push({ x: a.x, z: a.z, len: a.K ? a.K.meta.length : 2 });
      if (S.onFoot && S.car.visible) this.obstacles.push({ x: S.car.x, z: S.car.z, len: 4.4 });
      this.traffic.update(dt);
      const frame = Math.floor(this.time * 60), follow = this.netRole !== 'lead', now = performance.now() / 1000;
      this.frameNo++;
      for (const a of this.agents) {
        if (!a.K) continue;
        if (a.down) { this.downUpdate(a, dt); a.advance(a.K, dt); continue; }
        if (a.net && follow) {
          if (now - a.net.at < NET_STALE) { netPose(this, a, dt, now); a.advance(a.K, dt); this.driveBody(a, dt); continue; }
          netResume(this, a);
        }
        const far = !a.body && Math.hypot(a.x - this.camPos.x, a.z - this.camPos.z) > 600;
        a.acc = (a.acc || 0) + dt;
        if (far && (frame + a.id) % 4 !== 0) { if (!a.fly && a.brain !== 'vehicle' && a.brain !== 'train' && a.brain !== 'harness' && a.brain !== 'seat' && a.speed > 0) { a.x += Math.sin(a.yaw) * a.speed * dt; a.z += Math.cos(a.yaw) * a.speed * dt; } a.advance(a.K, dt); continue; }
        const sdt = Math.min(0.25, a.acc); a.acc = 0;
        const fixed = a.brain === 'harness' || a.brain === 'seat' || a.brain === 'vehicle' || a.brain === 'parked' || a.brain === 'train' || a.brain === 'wreck';
        if (fixed) this.passive(a, sdt);
        else { S.pick(a.x, a.z); this.think(a, sdt); if (!a.fly && a.brain !== 'tied') this.ground(a, sdt); else if (a.brain === 'tied') a.y = this.V.heightAt(a.x, a.z); }
        if (!fixed && (!a.fly || (a.brain === 'flock' && a.group && a.group.mode === 'perch' && a.speed < 0.5))) a.locomote(a.K);
        a.look = towards(a.look, a.lookTo, sdt * 2.2);
        a.advance(a.K, dt);
        this.driveBody(a, dt);
      }
      S.local();
    }
    this.audio.update(dt);
    this.stats.sim = performance.now() - t0;
    this.draw();
    this.stats.draw = performance.now() - t0 - this.stats.sim;
  }

  driveBody(a, dt) {
    if (!a.body || a.body.loose) return;
    const bt = a.body.b.translation();
    const vx = Math.sin(a.yaw) * a.speed * (a.fly ? Math.cos(a.pitch) : 1) + (a.push ? a.push[0] : 0), vz = Math.cos(a.yaw) * a.speed * (a.fly ? Math.cos(a.pitch) : 1) + (a.push ? a.push[1] : 0);
    const vy = a.fly ? clamp((a.y - bt.y) * 4, -15, 15) : clamp((this.V.heightAt(a.x, a.z) - bt.y) * 6, -12, 12);
    if (a.brain === 'vehicle' || a.brain === 'parked' || a.brain === 'train') { a.body.cmd.x = 0; }
    this.bodies.drive(a, dt, vx, vy, vz);
  }

  passive(a, dt) {
    if (a.brain === 'harness') { a.locomote(a.K); return; }
    if (a.brain === 'seat') { a.play(a.seatOn ? 'sit' : 'idle', 0.2, a.t); return; }
    if (a.brain === 'parked' || a.brain === 'wreck') { a.speed = 0; if (!a.body && !a.wreck) a.y = this.V.heightAt(a.x, a.z); return; }
    if (a.brain === 'vehicle' && a.body && !a.body.loose) { const f = Math.sin(a.yaw), c = Math.cos(a.yaw); a.speed = a.v || 0; void f; void c; }
    void dt;
  }

  ground(a, dt) {
    const V = this.V, gy = V.heightAt(a.x, a.z);
    const K = a.K, f = Math.sin(a.yaw), c = Math.cos(a.yaw), half = Math.min(4, K.meta.length * 0.35) * a.scale;
    a.y = gy;
    if (half > 0.4 && !a.kind.startsWith('human')) {
      const hf = V.heightAt(a.x + f * half, a.z + c * half), hb = V.heightAt(a.x - f * half, a.z - c * half);
      const tp = -Math.atan2(hf - hb, half * 2) * (K.meta.length > 6 ? 0.5 : 0.7);
      a.pitch = towards(a.pitch, tp, dt * 1.5);
      a.y = (gy + (hf + hb) / 2) / 2;
    } else a.pitch = towards(a.pitch, 0, dt * 2);
    a.roll = towards(a.roll, -a.lean, dt * 3);
  }

  draw() {
    const cam = this.game.gfx.camera, cp = this.camPos;
    this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    for (const k of this.kinds.values()) k.begin();
    const det = this.detail;
    for (const a of this.agents) {
      const K = a.K; if (!K || a.hide) continue;
      const s = K.size * a.scale;
      const d = Math.hypot(a.x - cp.x, a.y - cp.y, a.z - cp.z);
      a.dist = d;
      const l0 = clamp(s * 5, 16, 70) * det, l1 = clamp(s * 22, 55, 420) * det, l2 = clamp(s * 90, 140, 3000) * det;
      if (d > l2) continue;
      this.sph.center.set(a.x, a.y + s * 0.3, a.z); this.sph.radius = s * 0.7 + 1;
      if (!this.frustum.intersectsSphere(this.sph)) continue;
      const lod = d < l0 ? 0 : d < l1 ? 1 : 2;
      let rA, rB, bl;
      const machine = a.brain === 'vehicle' || a.brain === 'parked' || a.brain === 'train' || a.brain === 'wreck' || a.kind === 'drone';
      if (machine) {
        const clip = K.clips.roll ? 'roll' : 'idle', tt = a.kind === 'drone' ? this.time * 10 + a.id : (a.wheelT || 0);
        rA = rB = K.row(clip, tt); bl = 0;
      } else {
        rB = K.row(a.clip, a.t);
        if (lod === 0 && a.fade < 1 && a.prev) { rA = K.row(a.prev, a.pt); bl = a.fade; }
        else { rA = rB; bl = 0; }
      }
      K.push(lod, a.x, a.y, a.z, a.yaw, a.pitch, a.roll, a.scale, a.seed, rA, rB, bl, a.look, a.c0, a.c1);
    }
    for (const k of this.kinds.values()) k.end();
  }

  debug() {
    const by = {};
    for (const a of this.agents) by[a.kind] = (by[a.kind] || 0) + 1;
    let imported = 0;
    for (const a of this.agents) if (a.net) imported++;
    return { era: this.eraId, net: { role: this.netRole, seed: this.seedKey, ids: this.netMap.size, imported, queued: this.netQ.length }, agents: this.agents.length, groups: this.groups.length, people: this.people.length, cars: this.traffic.cars.length, bodies: this.stats.bodies, hits: this.stats.hits, simMs: +this.stats.sim.toFixed(2), drawMs: +this.stats.draw.toFixed(2), by, drawn: [...this.kinds.values()].filter((k) => k.lods.some((l) => l.n)).map((k) => `${k.id}:${k.stats().join('/')}`) };
  }
}

export { Agent };
