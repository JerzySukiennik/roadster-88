// Roadster 88 life brains: behaviour for every kind of mover (grazing herds that alert, flee or charge; a hunting T-rex that stalks, chases, roars and bites; raptor packs that run the car down, circle and pounce; shy coyote and wolf packs; soaring pterosaurs and vultures; bird flocks that perch and burst away; curious drones; tied horses) driven by what they sense of the car and by loud events.
import { TAU, wrap, clamp, rnd, towards, steerGround, steerAir } from './agents.js';

const runSpeed = (K) => (K.clips.gallop ? K.clips.gallop.speed : K.clips.run ? K.clips.run.speed : K.clips.trot ? K.clips.trot.speed : 3);
const walkSpeed = (K) => (K.clips.walk ? K.clips.walk.speed : 1.2);
const trotSpeed = (K) => (K.clips.trot ? K.clips.trot.speed : walkSpeed(K) * 2);

function faceCar(sys, a, k = 1) {
  const S = sys.sense;
  a.lookTo = clamp(wrap(Math.atan2(S.x - a.x, S.z - a.z) - a.yaw) * k, -1.1, 1.1);
}

function fear(sys, x, z, size, shy = 1) {
  const S = sys.sense;
  if (!S.visible) return 0;
  const t = S.threat(x, z);
  let f = 0;
  const alertR = (55 + size * 5) * shy, fleeR = (18 + size * 2.5) * shy + S.speed * 1.1;
  if (t.d < alertR) f = 0.35;
  if (t.d < fleeR) f = 1;
  if (S.noise > 0.75 && t.d < (70 + S.noise * 90) * shy) f = Math.max(f, 0.9);
  if (t.closing > 7 && t.d < 140 * shy && t.miss < 25 + size) f = 1;
  if (S.hover > 0.2 && t.d < 45) f = 1;
  return f;
}

function pickAway(sys, g, fromX, fromZ, dist) {
  let ax = g.cx - fromX, az = g.cz - fromZ; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
  for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
    const c = Math.cos(off), s = Math.sin(off), dx = ax * c - az * s, dz = ax * s + az * c;
    const x = g.cx + dx * dist, z = g.cz + dz * dist;
    if (sys.walkable(x, z, g.members[0])) return [x, z];
  }
  return [g.cx + ax * dist * 0.5, g.cz + az * dist * 0.5];
}

export const BRAINS = {
  grazer: {
    group(sys, g, dt) {
      g.mt += dt; g.centroid();
      const a0 = g.members.find((m) => m.K) || g.members[0]; if (!a0 || !a0.K) return;
      const size = a0.K.meta.length, S = sys.sense;
      const f = Math.max(fear(sys, g.cx, g.cz, size, g.data.shy || 1), g.scare > 0 ? 1 : 0);
      g.scare = Math.max(0, (g.scare || 0) - dt);
      if (f >= 0.8 && g.mode !== 'flee') { g.mode = 'flee'; g.mt = 0; g.timer = rnd(7, 12); const sx = g.scareX !== undefined && g.scare > 0 ? g.scareX : S.x, sz = g.scareX !== undefined && g.scare > 0 ? g.scareZ : S.z; [g.gx, g.gz] = pickAway(sys, g, sx, sz, rnd(120, 200)); g.ax = g.cx; g.az = g.cz; }
      else if (f >= 0.3 && g.mode === 'calm') { g.mode = 'alert'; g.mt = 0; }
      g.startle = Math.max(0, (g.startle || 0) - dt);
      if (g.startle > 0 && g.mode !== 'flee') g.mode = 'alert';
      if (g.mode === 'alert' && (f < 0.3 && g.mt > 5) && !(g.startle > 0)) g.mode = 'calm';
      if (g.mode === 'flee') { if (g.mt > g.timer && f < 0.8) { g.mode = 'calm'; g.timer = rnd(30, 60); } else if (Math.hypot(g.gx - g.cx, g.gz - g.cz) < 25 && f >= 0.8) [g.gx, g.gz] = pickAway(sys, g, S.x, S.z, rnd(100, 160)); }
      if (g.ax === undefined) { g.ax = g.cx; g.az = g.cz; g.gx = g.cx; g.gz = g.cz; }
      if (g.mode === 'calm') {
        g.timer -= dt;
        if (g.timer < 0 || Math.hypot(g.gx - g.home[0], g.gz - g.home[1]) > g.range) { const p = sys.randomWalkable(g.home[0], g.home[1], g.range, a0); if (p) { g.gx = p[0]; g.gz = p[1]; } g.timer = rnd(40, 80); }
        const dx = g.gx - g.ax, dz = g.gz - g.az, d = Math.hypot(dx, dz);
        if (d > 2) { const v = walkSpeed(a0.K) * 0.45 * dt; g.ax += dx / d * Math.min(v, d); g.az += dz / d * Math.min(v, d); }
      } else if (g.mode === 'flee') {
        const dx = g.gx - g.ax, dz = g.gz - g.az, d = Math.hypot(dx, dz);
        if (d > 2) { const v = runSpeed(a0.K) * 0.85 * dt; g.ax += dx / d * Math.min(v, d); g.az += dz / d * Math.min(v, d); }
      }
    },
    agent(sys, a, dt) {
      const g = a.group, K = a.K, S = sys.sense;
      a.st += dt; a.timer -= dt;
      a.panic = false;
      const sx = g.ax + a.slot[0], sz = g.az + a.slot[1];
      if (a.state === 'charge') {
        const t = S.threat(a.x, a.z);
        a.tx = S.x + S.vx * 0.4; a.tz = S.z + S.vz * 0.4; a.want = runSpeed(K); faceCar(sys, a, 0.6);
        if (a.st > 7 || t.d > 70 || (t.d < 4 && a.st > 1.5)) { a.state = 'rejoin'; a.st = 0; }
        steerGround(sys, a, dt, { turn: 1.4, accel: 5, arrive: 0.5 });
        return;
      }
      if (g.mode === 'flee') {
        if (a.role === 'bull' && S.visible && S.speed < 14 && S.dist(a.x, a.z) < 40 && a.state !== 'rejoin' && !a.charged) { a.state = 'charge'; a.st = 0; a.charged = true; if (K.clips.roar) a.act('roar'); return; }
        if (K.clips.rear && S.dist(a.x, a.z) < 22 && !a.reared) { a.reared = true; a.act('rear'); sys.emit('trumpet', a); }
        a.tx = g.ax + a.slot[0] * 1.4 + (g.gx - g.ax) * 0.25; a.tz = g.az + a.slot[1] * 1.4 + (g.gz - g.az) * 0.25;
        a.want = runSpeed(K) * (0.85 + 0.15 * a.seed); a.panic = true; a.rest = 'alert'; a.lookTo = 0;
        steerGround(sys, a, dt, { turn: 2.2, accel: 5 });
        return;
      }
      if (g.mode === 'calm') { a.charged = false; a.reared = false; }
      if (g.mode === 'alert') { a.want = 0; a.rest = 'alert'; faceCar(sys, a); steerGround(sys, a, dt); return; }
      a.lookTo = 0;
      const d = Math.hypot(sx - a.x, sz - a.z);
      if (a.state === 'rejoin' || d > 7) { a.tx = sx; a.tz = sz; a.want = d > 30 ? trotSpeed(K) : walkSpeed(K) * 0.9; if (d < 3) a.state = 'graze'; steerGround(sys, a, dt, { turn: 1.5 }); return; }
      if (a.timer < 0) { a.timer = rnd(4, 14); a.state = Math.random() < 0.65 && K.clips.graze ? 'graze' : Math.random() < 0.5 ? 'idle' : 'stroll'; if (a.state === 'stroll') { const r = sys.randomWalkable(sx, sz, 5, a); if (r) { a.tx = r[0]; a.tz = r[1]; } } }
      if (a.state === 'stroll') { a.want = walkSpeed(K) * 0.7; a.rest = 'idle'; }
      else { a.want = 0; a.rest = a.state === 'graze' && K.clips.graze ? 'graze' : 'idle'; a.tx = a.x; a.tz = a.z; }
      steerGround(sys, a, dt, { turn: 1.2 });
    },
  },

  predator: {
    agent(sys, a, dt) {
      const K = a.K, S = sys.sense, t = S.visible ? S.threat(a.x, a.z) : null;
      a.st += dt; a.timer -= dt; a.panic = false;
      const run = runSpeed(K), walk = walkSpeed(K);
      if (t && t.d < 120) faceCar(sys, a, 0.8); else a.lookTo = 0;
      if (a.heard && a.state !== 'chase' && a.state !== 'bite') { a.state = 'investigate'; a.st = 0; a.tx = a.heard[0]; a.tz = a.heard[1]; a.heard = null; if (Math.random() < 0.6) { a.act('roar'); sys.emit('roar', a); } }
      switch (a.state) {
        case 'investigate': a.want = walk * 1.6; if (Math.hypot(a.tx - a.x, a.tz - a.z) < 8 || a.st > 40) { a.state = 'wander'; a.st = 0; } if (t && t.d < 90) { a.state = 'stalk'; a.st = 0; } break;
        case 'stalk': a.tx = S.x; a.tz = S.z; a.want = walk * 1.5; if (!t || t.d > 220) { a.state = 'wander'; a.st = 0; } else if (t.d < 75 || a.st > 12) { a.state = 'chase'; a.st = 0; a.lost = 0; a.act('roar'); sys.emit('roar', a); } break;
        case 'chase': {
          if (!t) { a.state = 'wander'; break; }
          const lead = clamp(t.d / Math.max(run, 1), 0, 1.5);
          a.tx = S.x + S.vx * lead; a.tz = S.z + S.vz * lead; a.want = run;
          a.lost = t.d > 150 ? (a.lost || 0) + dt : 0;
          if (t.d < 6.5 + K.meta.length * 0.35 && !a.action) { a.act('bite'); sys.emit('bite', a); a.want = run * 0.5; }
          if (S.hover > 0.1 && S.agl < 9 && t.d < 12 && !a.action) { a.act('bite'); sys.emit('bite', a); }
          if (a.lost > 7) { a.state = 'rest'; a.st = 0; a.timer = rnd(12, 20); a.act('roar'); sys.emit('roar', a); }
          break;
        }
        case 'rest': a.want = 0; a.rest = 'idle'; if (a.timer < 0) { a.state = 'wander'; a.st = 0; } if (t && t.d < 45) { a.state = 'chase'; a.st = 0; } break;
        default: {
          a.state = 'wander';
          if (a.timer < 0 || Math.hypot(a.tx - a.x, a.tz - a.z) < 6) { const p = sys.randomWalkable(a.home ? a.home[0] : a.x, a.home ? a.home[1] : a.z, 350, a); if (p) { a.tx = p[0]; a.tz = p[1]; } a.timer = rnd(20, 40); if (Math.random() < 0.15) { a.act('roar'); sys.emit('roar', a); } }
          a.want = walk; a.rest = 'idle';
          if (t && t.d < 160 && (S.speed < 30 || t.d < 60)) { a.state = 'stalk'; a.st = 0; }
        }
      }
      if (a.action === 'roar') a.want = 0;
      steerGround(sys, a, dt, { turn: a.state === 'chase' ? 1.0 : 0.7, accel: 3.5, arrive: a.state === 'chase' ? 0.1 : 2 });
    },
  },

  pack: {
    group(sys, g, dt) {
      g.mt += dt; g.centroid();
      const a0 = g.members.find((m) => m.K); if (!a0) return;
      const S = sys.sense, t = S.visible ? S.threat(g.cx, g.cz) : null;
      if (g.ax === undefined) { g.ax = g.cx; g.az = g.cz; g.gx = g.cx; g.gz = g.cz; }
      if (g.data.hunter) {
        if (t && t.d < 110 && g.mode !== 'hunt') { g.mode = 'hunt'; g.mt = 0; g.lost = 0; }
        if (g.mode === 'hunt') { g.lost = !t || t.d > 190 ? (g.lost || 0) + dt : 0; if (g.lost > 6) { g.mode = 'calm'; g.timer = rnd(20, 40); } }
      } else {
        const f = Math.max(fear(sys, g.cx, g.cz, 3, g.data.shy || 1.4), g.scare > 0 ? 1 : 0);
        g.scare = Math.max(0, (g.scare || 0) - dt);
        if (f >= 0.8 && g.mode !== 'flee') { g.mode = 'flee'; g.mt = 0; [g.gx, g.gz] = pickAway(sys, g, S.x, S.z, rnd(150, 250)); g.ax = g.cx; g.az = g.cz; }
        if (g.mode === 'flee' && g.mt > 10 && f < 0.5) { g.mode = 'calm'; g.timer = 1; }
      }
      if (g.mode === 'calm') {
        g.timer -= dt;
        if (g.timer < 0) { const p = sys.randomWalkable(g.home[0], g.home[1], g.range, a0); if (p) { g.gx = p[0]; g.gz = p[1]; } g.timer = rnd(25, 50); g.howl = sys.night && !g.data.hunter && Math.random() < 0.5; }
        const dx = g.gx - g.ax, dz = g.gz - g.az, d = Math.hypot(dx, dz);
        if (d > 2) { const v = trotSpeed(a0.K) * 0.6 * dt; g.ax += dx / d * Math.min(v, d); g.az += dz / d * Math.min(v, d); }
      } else if (g.mode === 'flee') {
        const dx = g.gx - g.ax, dz = g.gz - g.az, d = Math.hypot(dx, dz);
        if (d > 2) { const v = runSpeed(a0.K) * 0.8 * dt; g.ax += dx / d * Math.min(v, d); g.az += dz / d * Math.min(v, d); }
      }
    },
    agent(sys, a, dt) {
      const g = a.group, K = a.K, S = sys.sense;
      a.st += dt; a.timer -= dt; a.panic = false;
      if (g.mode === 'hunt') {
        const t = S.threat(a.x, a.z), n = g.members.indexOf(a), m = g.members.length;
        const ang = (n / m) * TAU + sys.time * 0.35;
        const slow = S.speed < 7;
        const R = slow ? 7 + (n % 2) * 3 : 0;
        a.tx = S.x + Math.sin(ang) * R + S.vx * 0.5; a.tz = S.z + Math.cos(ang) * R + S.vz * 0.5;
        const dd = Math.hypot(a.tx - a.x, a.tz - a.z);
        a.want = dd > 12 ? runSpeed(K) * (0.92 + 0.08 * a.seed) : slow ? trotSpeed(K) * 0.8 : runSpeed(K);
        faceCar(sys, a, 0.9);
        a.cool = (a.cool || rnd(1, 3)) - dt;
        if (t.d < 9 && a.cool < 0 && K.clips.pounce && !a.action) { a.act('pounce'); a.cool = rnd(2.5, 5); a.speed = Math.max(a.speed, 9); sys.emit('call', a); }
        if (Math.random() < dt * 0.15 && K.clips.roar && !a.action) { a.act('roar'); sys.emit('call', a); }
        steerGround(sys, a, dt, { turn: 3.2, accel: 9, arrive: 0.2 });
        return;
      }
      const sx = g.ax + a.slot[0], sz = g.az + a.slot[1], d = Math.hypot(sx - a.x, sz - a.z);
      a.lookTo = 0;
      if (g.mode === 'flee') { a.tx = sx; a.tz = sz; a.want = runSpeed(K) * 0.95; a.panic = true; steerGround(sys, a, dt, { turn: 2.5, accel: 7 }); return; }
      if (d > 5) { a.tx = sx; a.tz = sz; a.want = d > 20 ? trotSpeed(K) : walkSpeed(K); a.rest = 'idle'; }
      else {
        a.want = 0; a.tx = a.x; a.tz = a.z;
        if (a.timer < 0) { a.timer = rnd(5, 12); a.rest = g.howl && K.clips.howl && Math.random() < 0.5 ? null : Math.random() < 0.5 && K.clips.graze ? 'graze' : 'idle'; if (!a.rest) { a.act('howl'); a.rest = 'idle'; sys.emit('howl', a); } }
      }
      steerGround(sys, a, dt, { turn: 2 });
    },
  },

  soar: {
    group(sys, g, dt) {
      g.mt += dt; g.timer -= dt;
      if (g.timer < 0) { g.timer = rnd(30, 70); const p = sys.randomPoint(g.home[0], g.home[1], g.range); g.gx = p[0]; g.gz = p[1]; }
      if (g.gx === undefined) { g.gx = g.cx; g.gz = g.cz; }
      g.cx = towards(g.cx, g.gx, dt * 3); g.cz = towards(g.cz, g.gz, dt * 3);
    },
    agent(sys, a, dt) {
      const g = a.group, K = a.K, n = g.members.indexOf(a);
      const R = g.radius * (0.7 + 0.5 * ((n * 0.37) % 1)), w = (a.seed > 0.5 ? 1 : -1) * 0.9 * (K.meta.speeds.fly || 12) / R;
      const ang = sys.time * w + n * 2.1;
      a.tx = g.cx + Math.sin(ang + 0.6 * Math.sign(w)) * R; a.tz = g.cz + Math.cos(ang + 0.6 * Math.sign(w)) * R;
      const gy = sys.V.heightAt(a.x, a.z);
      a.alt = Math.max(gy + 25, g.cy + (a.seed - 0.5) * 30 + Math.sin(sys.time * 0.05 + n) * 15);
      a.want = (K.meta.speeds.fly || 12) * (0.9 + 0.2 * a.seed);
      a.timer -= dt;
      if (a.timer < 0) { a.timer = rnd(4, 12); a.flap = a.vyAir > 0.5 || Math.random() < 0.3; }
      a.play(a.flap || a.vyAir > 1.5 ? 'flap' : 'glide', 0.6, a.t);
      steerAir(sys, a, dt, { turn: 0.6, bank: 0.05, minAgl: 20 });
    },
  },

  flock: {
    group(sys, g, dt) {
      g.mt += dt; g.timer -= dt;
      const S = sys.sense, d = S.visible ? S.dist(g.cx, g.cz) : 1e9;
      if (g.mode === 'perch') {
        if ((d < 28 + S.speed * 0.8) || (S.noise > 0.7 && d < 90) || g.scare > 0) { g.mode = 'fly'; g.mt = 0; g.timer = rnd(20, 40); g.burst = 1; const p = sys.randomPoint(g.cx, g.cz, 160); g.gx = p[0]; g.gz = p[1]; sys.emit('flush', g.members[0]); }
      } else {
        if (g.timer < 0) { if (g.data.perch && Math.random() < 0.6) { const p = sys.randomWalkable(g.home[0], g.home[1], g.range, g.members[0]); if (p) { g.gx = p[0]; g.gz = p[1]; g.mode = 'land'; } } else { const p = sys.randomPoint(g.home[0], g.home[1], g.range); g.gx = p[0]; g.gz = p[1]; } g.timer = rnd(20, 40); }
        if (g.gx === undefined) { g.gx = g.cx; g.gz = g.cz; }
        const dx = g.gx - g.cx, dz = g.gz - g.cz, dd = Math.hypot(dx, dz), v = 9 * dt;
        if (dd > 1) { g.cx += dx / dd * Math.min(v, dd); g.cz += dz / dd * Math.min(v, dd); }
        if (g.mode === 'land' && dd < 2) { g.mode = 'perch'; g.mt = 0; }
      }
      g.scare = Math.max(0, (g.scare || 0) - dt);
      g.burst = Math.max(0, (g.burst || 0) - dt * 0.5);
    },
    agent(sys, a, dt) {
      const g = a.group, K = a.K, n = g.members.indexOf(a);
      if (g.mode === 'perch') {
        const px = g.cx + a.slot[0] * 0.5, pz = g.cz + a.slot[1] * 0.5;
        if (a.y > sys.V.heightAt(a.x, a.z) + 0.6) {
          a.tx = px; a.tz = pz; a.alt = sys.V.heightAt(px, pz); a.want = 5; a.play('glide', 0.4, a.t);
          steerAir(sys, a, dt, { turn: 2.5, minAgl: 0, sink: 4 });
          if (Math.hypot(px - a.x, pz - a.z) < 3) { a.y = sys.V.heightAt(a.x, a.z); a.pitch = 0; a.roll = 0; }
          return;
        }
        a.y = sys.V.heightAt(a.x, a.z); a.speed = 0; a.pitch = 0; a.roll = 0;
        a.timer -= dt;
        if (a.timer < 0) { a.timer = rnd(1, 4); a.play(Math.random() < 0.5 ? 'peck' : 'perch', 0.2, Math.random()); if (Math.random() < 0.3) { a.yaw += rnd(-1, 1); a.x += Math.sin(a.yaw) * 0.2; a.z += Math.cos(a.yaw) * 0.2; } }
        return;
      }
      const ang = sys.time * (0.4 + 0.3 * a.seed) + n * 1.7;
      const R = g.radius * (0.4 + 0.6 * a.seed) * (1 + (g.burst || 0) * 2);
      a.tx = g.cx + Math.sin(ang) * R; a.tz = g.cz + Math.cos(ang) * R;
      const gy = sys.V.heightAt(a.x, a.z);
      a.alt = gy + (g.mode === 'land' ? 6 : g.alt + Math.sin(ang * 1.3) * 4);
      a.want = (K.meta.speeds.fly || 12) * (0.85 + 0.3 * a.seed);
      if (a.speed < 2) { a.vyAir = 3; a.act('takeoff'); }
      if (!a.action) a.play(a.vyAir > 0.5 || (n + Math.floor(sys.time * 0.7)) % 3 ? 'flap' : 'glide', 0.25, a.t);
      else if (a.done()) a.action = null;
      steerAir(sys, a, dt, { turn: 3.5, bank: 0.04, minAgl: 2, climb: 6 });
    },
  },

  drone: {
    agent(sys, a, dt) {
      const S = sys.sense, t = S.visible ? S.threat(a.x, a.z) : null;
      a.timer -= dt; a.st += dt;
      if (a.state === 'scatter') { if (a.st > 6) { a.state = 'patrol'; a.st = 0; } }
      else if (t && S.noise > 0.9 && t.d < 50) { a.state = 'scatter'; a.st = 0; const p = sys.randomPoint(a.x + (a.x - S.x) * 3, a.z + (a.z - S.z) * 3, 40); a.tx = p[0]; a.tz = p[1]; a.alt = sys.V.heightAt(a.x, a.z) + 60; }
      else if (t && t.d < 60 && S.speed < 6 && a.state !== 'follow' && Math.random() < dt * 0.3) { a.state = 'follow'; a.st = 0; }
      if (a.state === 'follow') { const side = a.id % 2 ? 1 : -1; a.tx = S.x + Math.cos(sys.time * 0.3 + a.id) * 7 * side; a.tz = S.z + Math.sin(sys.time * 0.3 + a.id) * 7; a.alt = S.y + 5; a.want = Math.max(3, S.speed * 1.2); if (a.st > 14 || (t && t.d > 90)) { a.state = 'patrol'; a.st = 0; } }
      else if (a.state !== 'scatter' && (a.timer < 0 || Math.hypot(a.tx - a.x, a.tz - a.z) < 5)) { const p = sys.randomPoint(a.home[0], a.home[1], a.range || 400); a.tx = p[0]; a.tz = p[1]; a.alt = sys.V.heightAt(p[0], p[1]) + rnd(18, 45); a.timer = rnd(20, 40); a.want = rnd(8, 14); }
      if (a.state === 'scatter') a.want = 18;
      a.play('roll', 0.1, a.t);
      steerAir(sys, a, dt, { turn: 2.5, bank: 0.03, minAgl: 4, climb: 6, accel: 6 });
      a.pitch = clamp(a.speed * 0.025, 0, 0.35);
    },
  },

  tied: {
    agent(sys, a, dt) {
      const S = sys.sense, t = S.visible ? S.threat(a.x, a.z) : null;
      a.timer -= dt; a.speed = 0; a.want = 0;
      if (t && (t.d < 12 + S.speed * 0.6 || (S.noise > 0.8 && t.d < 50)) && a.K.clips.rear && !a.action && (a.cool || 0) <= 0) { a.act('rear'); a.cool = 6; sys.emit('neigh', a); }
      a.cool = (a.cool || 0) - dt;
      if (a.timer < 0) { a.timer = rnd(5, 12); a.rest = Math.random() < 0.4 && a.K.clips.graze ? 'graze' : 'idle'; }
      if (t && t.d < 40) faceCar(sys, a, 0.7); else a.lookTo = 0;
    },
  },
};

export function scareAround(sys, ev) {
  const jump = ev.type === 'arrive' || ev.type === 'depart';
  for (const g of sys.groups) {
    if (!g.members.length) continue;
    const d = Math.hypot(g.cx - ev.x, g.cz - ev.z);
    if (d > ev.r) continue;
    if (jump && d > 65 && g.brain === 'grazer') { g.startle = rnd(6, 10); g.mode = 'alert'; g.mt = 0; continue; }
    g.scare = Math.max(g.scare || 0, 3 + ev.level * 4); g.scareX = ev.x; g.scareZ = ev.z;
  }
  for (const a of sys.solo) if (a.brain === 'predator' && Math.hypot(a.x - ev.x, a.z - ev.z) < ev.r * 2.2) a.heard = [ev.x, ev.z];
}
