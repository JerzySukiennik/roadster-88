// Roadster 88 life agents: a swappable random source (seeded per online room so every client spawns the same world), the per-creature state (pose, speed, heading, timers, colours), clip playback with crossfades and speed-matched locomotion, ground-following steering with terrain and water avoidance, flight steering with banking, and groups (herds, packs, flocks) that share a centre, a goal and a mood.

export const TAU = Math.PI * 2;
export const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const towards = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
let R = Math.random;
export const random = () => R();
export const rnd = (a, b) => a + R() * (b - a);
export function useRandom(f) { R = f || Math.random; }
export function seeded(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = (h >>> 0) || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let SERIAL = 0;

export class Agent {
  constructor(kind, o = {}) {
    this.id = ++SERIAL;
    this.kind = kind; this.K = null;
    this.x = o.x || 0; this.z = o.z || 0; this.y = o.y || 0; this.yaw = o.yaw === undefined ? R() * TAU : o.yaw;
    this.speed = 0; this.want = 0; this.tx = this.x; this.tz = this.z; this.vy = 0;
    this.seed = o.seed === undefined ? R() : o.seed; this.scale = o.scale || 1;
    this.c0 = o.c0 || null; this.c1 = o.c1 || null;
    this.brain = o.brain || 'idle'; this.group = o.group || null; this.role = o.role || null;
    this.state = o.state || 'idle'; this.st = 0; this.timer = rnd(0, 4);
    this.clip = o.clip || 'idle'; this.t = R(); this.prev = null; this.pt = 0; this.fade = 1; this.fadeDur = 0.25; this.action = null;
    this.look = 0; this.lookTo = 0;
    this.pitch = 0; this.roll = 0; this.lean = 0;
    this.fly = !!o.fly; this.alt = o.alt || 0; this.vyAir = 0;
    this.body = null; this.down = null;
    this.slot = o.slot || [0, 0];
    this.data = o.data || {};
    this.lod = 3; this.vis = false; this.dist = 1e9;
    this.mount = null; this.rider = null;
    this.ground = o.ground !== false;
    this.hide = false;
  }

  play(clip, fade = 0.25, t = 0) {
    if (this.clip === clip) return;
    this.prev = this.clip; this.pt = this.t; this.clip = clip; this.t = t; this.fade = 0; this.fadeDur = fade;
  }

  act(clip, fade = 0.2) { this.play(clip, fade, 0); this.action = clip; }

  locomote(K) {
    if (this.action) { const c = K.clips[this.action]; if (c && (c.loop ? this.t < (this.actionUntil || 1) : this.t < 1)) return; this.action = null; }
    const C = K.clips, v = this.speed, walk = C.walk ? C.walk.speed : 1.5;
    const mid = C.trot ? 'trot' : null, fast = C.gallop ? 'gallop' : C.run ? 'run' : null;
    const midS = mid ? C[mid].speed : 0, fastS = fast ? C[fast].speed : 0;
    let c;
    if (v < walk * 0.12) c = this.rest || 'idle';
    else if (this.panic && C.flee && v > walk * 1.6) c = 'flee';
    else if (mid && fast) c = v < (walk + midS) / 2 ? 'walk' : v < (midS + fastS) / 2 ? mid : fast;
    else if (mid) c = v < (walk + midS) / 2 ? 'walk' : mid;
    else if (fast) c = v < (walk + fastS) / 2 ? 'walk' : fast;
    else c = C.walk ? 'walk' : 'idle';
    if (!C[c]) c = 'idle';
    this.play(c, 0.3, this.t);
  }

  advance(K, dt) {
    const rate = (name) => { const c = K.clips[name]; if (!c) return 1; return c.speed > 0 ? Math.max(this.speed, c.speed * 0.25) / (c.speed * c.dur) : 1 / c.dur; };
    this.t += dt * rate(this.clip);
    if (this.fade < 1) { this.pt += dt * rate(this.prev); this.fade = Math.min(1, this.fade + dt / this.fadeDur); }
  }

  done() { return this.t >= 1; }
}

export class Group {
  constructor(kind, o = {}) {
    this.kind = kind; this.members = [];
    this.cx = o.x || 0; this.cz = o.z || 0; this.cy = o.y || 0;
    this.gx = this.cx; this.gz = this.cz;
    this.mode = o.mode || 'calm'; this.mt = 0; this.timer = rnd(5, 20);
    this.radius = o.radius || 15; this.home = [this.cx, this.cz];
    this.range = o.range || 300; this.alt = o.alt || 0;
    this.threat = null; this.data = o.data || {};
    this.heading = R() * TAU;
  }

  centroid() {
    let x = 0, z = 0, n = 0;
    for (const a of this.members) { if (a.down) continue; x += a.x; z += a.z; n++; }
    if (n) { this.cx = x / n; this.cz = z / n; }
  }
}

export function steerGround(sys, a, dt, o = {}) {
  const K = a.K, turn = o.turn || 2.0, acc = o.accel || 3;
  const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
  let want = a.want;
  if (d < (o.arrive || 1.5)) want = 0;
  else if (o.slowR && d < o.slowR) want *= Math.max(0.3, d / o.slowR);
  if (want > 0.05 && d > 0.3) {
    let desired = Math.atan2(dx, dz);
    const look = Math.max(4, a.speed * 1.5) * (K ? Math.max(1, K.meta.length / 4) : 1);
    if (!sys.walkable(a.x + Math.sin(desired) * look, a.z + Math.cos(desired) * look, a)) {
      let found = false;
      for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4]) { const y2 = desired + off * (a.id % 2 ? 1 : -1); if (sys.walkable(a.x + Math.sin(y2) * look, a.z + Math.cos(y2) * look, a)) { desired = y2; found = true; break; } }
      if (!found) { desired = a.yaw + Math.PI * 0.7; want *= 0.4; }
    }
    const dy = wrap(desired - a.yaw);
    const tr = turn * (a.speed > 4 ? Math.max(0.35, 4 / a.speed) : 1);
    a.yaw = wrap(a.yaw + clamp(dy, -tr * dt, tr * dt));
    const align = Math.cos(dy);
    want *= align > 0 ? Math.max(0.25, align) : 0.2;
    a.lean = clamp(dy * a.speed * 0.02, -0.25, 0.25);
  } else a.lean *= 0.9;
  a.speed = towards(a.speed, want, (want > a.speed ? acc : acc * 1.6) * dt);
  if (!a.body) { a.x += Math.sin(a.yaw) * a.speed * dt; a.z += Math.cos(a.yaw) * a.speed * dt; }
}

export function steerAir(sys, a, dt, o = {}) {
  const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz), dy = wrap(desired - a.yaw);
  const turn = o.turn || 0.8;
  const yr = clamp(dy * 1.5, -turn, turn);
  a.yaw = wrap(a.yaw + yr * dt);
  a.roll = towards(a.roll, clamp(-yr * a.speed * (o.bank || 0.08), -0.9, 0.9), dt * 1.5);
  a.speed = towards(a.speed, a.want, (o.accel || 4) * dt);
  const gy = sys.V.heightAt(a.x, a.z);
  const ty = Math.max(gy + (o.minAgl || 3), a.alt);
  a.vyAir = towards(a.vyAir, clamp((ty - a.y) * 0.6, -o.sink || -6, o.climb || 4), dt * 3);
  a.pitch = towards(a.pitch, clamp(-a.vyAir / Math.max(4, a.speed) * 0.9, -0.5, 0.5), dt * 1.5);
  a.x += Math.sin(a.yaw) * a.speed * dt; a.z += Math.cos(a.yaw) * a.speed * dt; a.y += a.vyAir * dt;
  if (a.y < gy + 0.3) a.y = gy + 0.3;
  void d;
}
