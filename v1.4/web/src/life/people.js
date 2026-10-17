// Roadster 88 life people: town pedestrians on a sidewalk network built from the valley's streets (walk, turn at corners, cross the street after a look, stand and talk in small groups) with era temperament, and their reactions to the car (dodge a car coming at them, flee from speed, cower, gather round a stopped car to look, point, wave or cheer, and react to a time-jump arrival).
import { TAU, wrap, clamp, rnd, steerGround } from './agents.js';

const TEMPER = { 1885: { fear: 1.4, curious: 0.35, look: 'idle', arrive: 'cower' }, 2026: { fear: 1.0, curious: 0.8, look: 'point', arrive: 'point' }, 2080: { fear: 0.8, curious: 0.6, look: 'wave', arrive: 'point' }, scifi: { fear: 0.5, curious: 0.4, look: 'idle', arrive: 'idle' }, ruins: { fear: 1.6, curious: 0.2, look: 'idle', arrive: 'cower' } };

export class Sidewalks {
  constructor(valley) {
    this.segs = [];
    const streets = (valley.roads || []).filter((r) => r.kind === 'street');
    for (const r of streets) {
      const a = r.pts[0], b = r.pts[r.pts.length - 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
      const nx = dz / l, nz = -dx / l, off = r.width / 2 + 1.7;
      for (const s of [1, -1]) this.segs.push({ a: [a[0] + nx * off * s, a[1] + nz * off * s], b: [b[0] + nx * off * s, b[1] + nz * off * s], d: [dx / l, dz / l], n: [nx * s, nz * s], len: l, road: r, side: s, cross: [] });
    }
    for (let i = 0; i < this.segs.length; i++) for (let j = 0; j < this.segs.length; j++) {
      if (i === j) continue;
      const A = this.segs[i], B = this.segs[j];
      if (Math.abs(A.d[0] * B.d[0] + A.d[1] * B.d[1]) > 0.3) continue;
      const t = this.hit(A, B); if (t !== null) A.cross.push({ t, seg: j });
    }
    this.bounds = this.segs.length ? this.segs.reduce((b, s) => [Math.min(b[0], s.a[0], s.b[0]), Math.min(b[1], s.a[1], s.b[1]), Math.max(b[2], s.a[0], s.b[0]), Math.max(b[3], s.a[1], s.b[1])], [1e9, 1e9, -1e9, -1e9]) : null;
    this.center = this.bounds ? [(this.bounds[0] + this.bounds[2]) / 2, (this.bounds[1] + this.bounds[3]) / 2] : [0, 0];
  }

  hit(A, B) {
    const rx = A.b[0] - A.a[0], rz = A.b[1] - A.a[1], sx = B.b[0] - B.a[0], sz = B.b[1] - B.a[1];
    const den = rx * sz - rz * sx; if (Math.abs(den) < 1e-6) return null;
    const qx = B.a[0] - A.a[0], qz = B.a[1] - A.a[1];
    const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
    return t >= 0 && t <= 1 && u >= -0.02 && u <= 1.02 ? t : null;
  }

  at(seg, t) { const S = this.segs[seg]; return [S.a[0] + (S.b[0] - S.a[0]) * t, S.a[1] + (S.b[1] - S.a[1]) * t]; }
  opposite(seg) { const S = this.segs[seg]; return this.segs.findIndex((o) => o.road === S.road && o.side !== S.side); }
  random() { const i = Math.floor(Math.random() * this.segs.length); return { seg: i, t: Math.random() }; }
}

export function walker(sys, a, dt) {
  const W = sys.walks, S = sys.sense, K = a.K, T = TEMPER[sys.eraId] || TEMPER[2026];
  a.st += dt; a.timer -= dt; a.panic = false;
  const walk = K.clips.walk.speed * (0.85 + 0.3 * a.seed), run = K.clips.flee ? K.clips.flee.speed : K.clips.run.speed;
  const t = S.visible ? S.threat(a.x, a.z) : null;
  if (t && t.d < 70 && a.state !== 'dodge' && a.state !== 'down') {
    const danger = S.speed > 3.5 && t.ttc < 1.7 * T.fear && t.miss < 3.2;
    if (danger && (a.dodgeCool || 0) <= 0) {
      const vx = S.vx / (t.v || 1), vz = S.vz / (t.v || 1), rx = a.x - S.x, rz = a.z - S.z;
      const side = (vx * rz - vz * rx) > 0 ? 1 : -1;
      const ex = -vz * side, ez = vx * side;
      a.dodge = [ex, ez]; a.yaw = Math.atan2(ez, -ex); a.state = 'dodge'; a.st = 0; a.act('dodge', 0.08); a.dodgeCool = 3; a.speed = 0;
      sys.emit('scream', a);
      return;
    }
    if ((S.speed > 14 && t.d < 22 * T.fear) || (S.noise > 0.9 && t.d < 35 * T.fear) || (S.hover > 0.2 && t.d < 25)) {
      if (a.state !== 'flee') { a.state = 'flee'; a.st = 0; a.timer = rnd(5, 9); if (Math.random() < 0.3) sys.emit('scream', a); }
    } else if (S.speed < 1.5 && t.d < 16 && t.d > 4.5 && a.state === 'walk' && Math.random() < dt * T.curious) { a.state = 'gaze'; a.st = 0; a.timer = rnd(4, 9); }
  }
  a.dodgeCool = (a.dodgeCool || 0) - dt;
  if (a.state === 'dodge') {
    const k = Math.max(0, 1 - a.st / 0.55);
    a.speed = 0; a.want = 0;
    if (!a.body) { a.x += a.dodge[0] * 4.2 * k * dt; a.z += a.dodge[1] * 4.2 * k * dt; } else a.push = [a.dodge[0] * 4.2 * k, a.dodge[1] * 4.2 * k];
    if (a.done()) { a.action = null; a.state = sys.eraId === '1885' && Math.random() < 0.5 ? 'cower' : 'flee'; a.st = 0; a.timer = rnd(4, 8); a.yaw = Math.atan2(a.dodge[0], a.dodge[1]); a.push = null; }
    return;
  }
  if (a.state === 'flee') {
    let ax = a.x - S.x, az = a.z - S.z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
    if (S.speed > 3) { const vx = S.vx / S.speed, vz = S.vz / S.speed, side = (vx * (a.z - S.z) - vz * (a.x - S.x)) > 0 ? 1 : -1; ax = ax * 0.5 + -vz * side * 0.8; az = az * 0.5 + vx * side * 0.8; }
    a.tx = a.x + ax * 20; a.tz = a.z + az * 20; a.want = run * (0.85 + 0.2 * a.seed); a.panic = true;
    if (a.timer < 0 && (!t || t.d > 30)) { a.state = 'gaze'; a.st = 0; a.timer = rnd(3, 6); }
    steerGround(sys, a, dt, { turn: 4, accel: 6, arrive: 0.2 });
    return;
  }
  if (a.state === 'cower') { a.want = 0; a.speed = 0; a.rest = 'cower'; if (a.timer < 0) { a.state = 'gaze'; a.st = 0; a.timer = rnd(3, 6); } steerGround(sys, a, dt); return; }
  if (a.state === 'gaze' || a.state === 'react') {
    a.want = 0; a.rest = a.state === 'react' ? a.reactClip : (t && t.d < 30 ? T.look : 'idle');
    if (t) { const want = Math.atan2(S.x - a.x, S.z - a.z); a.yaw += clamp(wrap(want - a.yaw), -2 * dt, 2 * dt); a.lookTo = clamp(wrap(want - a.yaw), -0.9, 0.9); }
    if (a.timer < 0) { a.state = 'walk'; a.st = 0; a.lookTo = 0; }
    steerGround(sys, a, dt);
    return;
  }
  if (a.state === 'talk' || a.state === 'wait') {
    a.want = 0; a.rest = a.state === 'talk' ? (a.id % 3 ? 'talk' : 'idle') : 'idle';
    if (a.face !== undefined) a.yaw += clamp(wrap(a.face - a.yaw), -1.5 * dt, 1.5 * dt);
    if (a.timer < 0 && a.data.mobile !== false) { a.state = 'walk'; a.st = 0; }
    steerGround(sys, a, dt);
    return;
  }
  if (!W || !W.segs.length) { a.want = 0; a.rest = 'idle'; steerGround(sys, a, dt); return; }
  if (a.path === undefined) { const r = W.random(); a.path = { seg: r.seg, t: r.t, dir: Math.random() < 0.5 ? 1 : -1, crossing: null }; }
  const P = a.path, seg = W.segs[P.seg];
  if (P.crossing) {
    a.tx = P.crossing[0]; a.tz = P.crossing[1]; a.want = walk * 1.15; a.rest = 'idle';
    if (P.waitT > 0) { P.waitT -= dt; a.want = 0; a.lookTo = Math.sin(P.waitT * 2.5) * 0.8; }
    else if (Math.hypot(a.tx - a.x, a.tz - a.z) < 1.2) { P.seg = P.crossTo; P.t = P.crossT; P.crossing = null; a.lookTo = 0; }
    steerGround(sys, a, dt, { turn: 4, arrive: 0.6 });
    return;
  }
  const step = (walk * dt) / seg.len;
  const ahead = P.t + P.dir * Math.max(step, 3 / seg.len);
  const [tx, tz] = W.at(P.seg, clamp(ahead, 0, 1));
  a.tx = tx; a.tz = tz; a.want = walk; a.rest = 'idle';
  const proj = ((a.x - seg.a[0]) * (seg.b[0] - seg.a[0]) + (a.z - seg.a[1]) * (seg.b[1] - seg.a[1])) / (seg.len * seg.len);
  P.t = clamp(proj, 0, 1);
  if (a.timer < 0) {
    a.timer = rnd(8, 22);
    const r = Math.random();
    if (r < 0.18) { a.state = 'wait'; a.st = 0; a.timer = rnd(3, 8); }
    else if (r < 0.32) { const o = W.opposite(P.seg); if (o >= 0) { const [cx, cz] = W.at(o, P.t); P.crossing = [cx, cz]; P.crossTo = o; P.crossT = P.t; P.waitT = rnd(0.8, 2); } }
  }
  if (P.t <= 0.001 || P.t >= 0.999) {
    const end = P.t > 0.5 ? 1 : 0;
    const near = seg.cross.filter((c) => Math.abs(c.t - end) < 0.08);
    if (near.length && Math.random() < 0.75) { const c = near[Math.floor(Math.random() * near.length)], S2 = W.segs[c.seg]; const tt = clamp(((a.x - S2.a[0]) * (S2.b[0] - S2.a[0]) + (a.z - S2.a[1]) * (S2.b[1] - S2.a[1])) / (S2.len * S2.len), 0, 1); P.seg = c.seg; P.t = tt; P.dir = tt < 0.5 ? 1 : -1; }
    else P.dir = end ? -1 : 1;
  } else if (Math.random() < dt * 0.02) {
    const c = seg.cross.find((q) => Math.abs(q.t - P.t) < 0.01);
    if (c) { const S2 = W.segs[c.seg]; const tt = clamp(((a.x - S2.a[0]) * (S2.b[0] - S2.a[0]) + (a.z - S2.a[1]) * (S2.b[1] - S2.a[1])) / (S2.len * S2.len), 0, 1); P.seg = c.seg; P.t = tt; P.dir = Math.random() < 0.5 ? 1 : -1; }
  }
  steerGround(sys, a, dt, { turn: 3, arrive: 0.3 });
}

export function reactArrival(sys, ev) {
  const T = TEMPER[sys.eraId] || TEMPER[2026];
  for (const a of sys.people) {
    if (a.down || a.state === 'dodge') continue;
    const d = Math.hypot(a.x - ev.x, a.z - ev.z);
    if (d > ev.r * 0.6) continue;
    if (d < 25 || T.fear > 1.2 && d < 80) { a.state = Math.random() < 0.5 ? 'cower' : 'flee'; a.timer = rnd(3, 7); }
    else { a.state = 'react'; a.reactClip = T.arrive === 'cower' ? 'cower' : Math.random() < 0.4 ? 'cheer' : T.arrive; a.timer = rnd(5, 10); }
    a.st = 0;
  }
}

export function pet(sys, a, dt) {
  const o = a.owner, K = a.K;
  a.timer -= dt;
  if (!o || o.down) { a.want = 0; a.rest = 'idle'; steerGround(sys, a, dt); return; }
  const S = sys.sense, t = S.visible ? S.threat(a.x, a.z) : null;
  if (t && t.d < 18 && S.speed > 2) { a.tx = S.x; a.tz = S.z; a.want = K.clips.gallop.speed * 0.7; a.rest = 'alert'; if (t.d < 6) { a.tx = a.x + (a.x - S.x); a.tz = a.z + (a.z - S.z); } if (Math.random() < dt * 0.5) sys.emit('bark', a); }
  else {
    const side = a.id % 2 ? 1 : -1, fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
    a.tx = o.x + fx * 1.2 + fz * side * 0.9; a.tz = o.z + fz * 1.2 - fx * side * 0.9;
    const d = Math.hypot(a.tx - a.x, a.tz - a.z);
    a.want = d > 6 ? K.clips.trot.speed : d > 0.8 ? Math.max(o.speed, 1.0) : 0;
    a.rest = 'idle';
  }
  steerGround(sys, a, dt, { turn: 4, accel: 6, arrive: 0.4 });
  void TAU;
}
