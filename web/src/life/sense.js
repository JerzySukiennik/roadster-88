// Roadster 88 life senses: what creatures and people perceive of the players each frame (the local player in the car or on foot, plus every remote player in the room when this client leads: position, velocity, height above ground, boost and thruster noise, hovering downwash, headlights), the car itself for physics, the time-jump departure and arrival events, per-agent focus on the nearest or loudest player, and threat geometry (distance, closing speed, time to closest approach, miss distance).

const FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'speed', 'agl', 'air', 'boost', 'thrust', 'hover', 'noise', 'visible', 'onFoot', 'uid'];
const blank = () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, speed: 0, agl: 0, air: false, boost: 0, thrust: 0, hover: 0, noise: 0, visible: true, onFoot: false, uid: null });

export class CarSense {
  constructor(game, valley) {
    this.g = game; this.V = valley;
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.speed = 0;
    this.agl = 0; this.air = false; this.boost = 0; this.thrust = 0; this.hover = 0; this.noise = 0; this.visible = true;
    this.onFoot = false; this.uid = null;
    this.events = []; this.tcState = 'off'; this.boostHeld = 0; this.lastBoostEvent = -9; this.time = 0;
    this.car = { x: 0, y: 0, z: 0, visible: true };
    this.me = blank(); this.players = [this.me]; this.remote = new Map(); this.cur = this.me; this.multi = false;
  }

  update(dt) {
    this.time += dt;
    this.events.length = 0;
    const car = this.g.car; if (!car) return;
    const s = car.sim, M = this.me, C = this.car, tcs = this.g.tc.state;
    C.x = s.pos.x; C.y = s.pos.y; C.z = s.pos.z;
    C.visible = car.view.root.visible && tcs !== 'gone';
    const gy = this.V.heightAt(C.x, C.z);
    const th = s.thrusters;
    let rear = 0, down = 0;
    for (const n of th.all) { if (!n.attached) continue; if (n.group === 'rear' && n.pitch < 0.4) rear += n.valve; if (n.dir && n.dir.y > 0.5) down += n.valve * n.thrustMax; }
    const boost = rear / 4, thrust = Math.min(1.5, th.totalForce.len() / 40000), agl = C.y - gy, air = s.contacts === 0;
    const w = this.g.walker, foot = !!(w && w.active);
    if (foot) {
      M.x = w.pos.x; M.y = w.pos.y; M.z = w.pos.z; M.vx = w.vel.x; M.vy = w.vel.y; M.vz = w.vel.z; M.speed = Math.hypot(w.vel.x, w.vel.z);
      M.agl = 0; M.air = !w.grounded; M.boost = 0; M.thrust = 0; M.hover = 0;
      M.noise = Math.min(0.25, M.speed / 25); M.visible = !w.dead && tcs !== 'gone';
    } else {
      M.x = C.x; M.y = C.y; M.z = C.z; M.vx = s.vel.x; M.vy = s.vel.y; M.vz = s.vel.z; M.speed = s.speed;
      M.agl = agl; M.air = air; M.boost = boost; M.thrust = thrust;
      M.hover = air && agl < 40 ? Math.min(1, down / 30000) * (1 - agl / 40) : 0;
      M.noise = C.visible ? Math.min(1, M.speed / 45) * 0.7 + boost * 1.6 + thrust * 0.6 : 0;
      M.visible = C.visible;
    }
    M.onFoot = foot; M.uid = (this.g.online && this.g.online.uid) || null;
    this.boostHeld = !foot && boost > 0.6 ? this.boostHeld + dt : 0;
    if (this.boostHeld > 0.15 && this.time - this.lastBoostEvent > 1.5) { this.lastBoostEvent = this.time; this.events.push({ type: 'boom', x: C.x, z: C.z, r: 140, level: 0.6 }); }
    if (tcs !== this.tcState) {
      if (tcs === 'departing') this.events.push({ type: 'depart', x: C.x, z: C.z, r: 260, level: 1 });
      if (tcs === 'arriving') this.events.push({ type: 'arrive', x: C.x, z: C.z, r: 320, level: 1 });
      this.tcState = tcs;
    }
    this.lights = this.g.sky && this.g.sky.state ? this.g.sky.state.night > 0.3 : false;
    this.gather();
    this.use(M);
  }

  gather() {
    const P = this.players, on = this.g.online;
    P.length = 1;
    if (!this.multi || !on || typeof on.players !== 'function') return;
    let list;
    try { list = on.players(); } catch (e) { return; }
    if (!list) return;
    const seen = new Set();
    for (const q of list) {
      if (q.local || !q.uid || q.uid === this.me.uid) continue;
      let p = this.remote.get(q.uid);
      if (!p) { p = blank(); this.remote.set(q.uid, p); }
      const foot = !!q.onFoot, sp = Math.hypot(q.vx || 0, q.vz || 0), agl = q.y - this.V.heightAt(q.x, q.z);
      p.x = q.x; p.y = q.y; p.z = q.z; p.vx = q.vx || 0; p.vy = 0; p.vz = q.vz || 0; p.speed = sp;
      p.agl = foot ? 0 : agl; p.air = !foot && agl > 1.5; p.boost = 0; p.thrust = 0; p.hover = 0;
      p.noise = foot ? Math.min(0.25, sp / 25) : Math.min(1, sp / 45) * 0.7;
      p.visible = true; p.onFoot = foot; p.uid = q.uid;
      P.push(p); seen.add(q.uid);
    }
    for (const k of this.remote.keys()) if (!seen.has(k)) this.remote.delete(k);
  }

  use(p) {
    if (this.cur === p && p !== this.me) return;
    for (const f of FIELDS) this[f] = p[f];
    this.cur = p;
  }

  pick(x, z) {
    const P = this.players;
    if (P.length < 2) { if (this.cur !== this.me) this.use(this.me); return this.me; }
    let best = null, bd = Infinity;
    for (const p of P) { if (!p.visible) continue; const d = Math.hypot(x - p.x, z - p.z) - p.noise * 25; if (d < bd) { bd = d; best = p; } }
    if (best && best !== this.cur) this.use(best);
    return best || this.cur;
  }

  local() { if (this.cur !== this.me) this.use(this.me); }

  dist(x, z) { return Math.hypot(x - this.x, z - this.z); }

  threat(x, z) {
    const rx = x - this.x, rz = z - this.z, d = Math.hypot(rx, rz) || 1e-3;
    const v2 = this.vx * this.vx + this.vz * this.vz, v = Math.sqrt(v2);
    const closing = (rx * this.vx + rz * this.vz) / d;
    let ttc = Infinity, miss = d;
    if (v > 0.5) { const t = (rx * this.vx + rz * this.vz) / v2; if (t > 0) { ttc = t; miss = Math.hypot(rx - this.vx * t, rz - this.vz * t); } }
    return { d, closing, ttc, miss, v };
  }
}
