// Roadster 88 life net mode: stable net ids for the seeded population, the leader's compact pose export (nearest and most dangerous movers first), follower import with buffered interpolation, clip and sound replay and a decaying error offset, brain resume from the last imported state, and hit events from followers applied on the leader.
import { clamp, rnd, wrap } from './agents.js';

export const NET_DELAY = 0.3, NET_STALE = 2.5;
const SNAP = 20;
const CUE = { roar: 'roar', bite: 'bite', pounce: 'call', howl: 'howl', dodge: 'scream', takeoff: 'flush' };
const q = (v, k) => Math.round(v * k) / k;

export function clipNames(K) {
  if (!K.netClips) { K.netClips = Object.keys(K.clips); K.netIndex = new Map(K.netClips.map((n, i) => [n, i])); }
  return K.netClips;
}

export function assignIds(sys, lists, kindIds) {
  const count = new Map(), map = new Map();
  for (const list of lists) for (const a of list) {
    const ki = kindIds.indexOf(a.kind); if (ki < 0) continue;
    const n = count.get(a.kind) || 0; count.set(a.kind, n + 1);
    a.netId = ki * 10000 + n; map.set(a.netId, a);
  }
  sys.netMap = map;
}

export function stateOf(a) {
  if (a.wreck) return 7;
  if (a.down) return a.down.phase === 'air' ? 4 : a.down.phase === 'rest' ? 5 : 6;
  const g = a.group;
  if (a.state === 'charge' || a.state === 'chase' || a.state === 'stalk' || (g && g.mode === 'hunt')) return 3;
  if (a.panic || a.state === 'flee' || (g && g.mode === 'flee')) return 2;
  if ((g && g.mode === 'alert') || a.state === 'gaze' || a.state === 'cower' || a.state === 'react') return 1;
  return 0;
}

function rank(a, d) {
  const b = a.brain;
  if (a.wreck) return a.down && a.down.t < 12 && d < 500 ? d * 0.5 : -1;
  if (a.down) return d < 500 ? d * 0.5 : -1;
  if (b === 'predator' || (a.group && a.group.data.hunter)) return d < 1200 ? d * 0.3 : -1;
  if (a.K.size * a.scale > 6) return d < 700 ? d * 0.6 : -1;
  if (b === 'grazer' || b === 'pack' || b === 'loose') return d < 450 ? d : -1;
  if (b === 'walker' || b === 'pet' || b === 'tied') return d < 250 ? d * 1.2 : -1;
  if (b === 'flock' || b === 'soar' || b === 'drone') return d < 300 ? d * 1.5 : -1;
  return -1;
}

export function exportPoses(sys, maxN, players) {
  const P = players && players.length ? players.map((p) => (Array.isArray(p) ? p : [p.x, p.z])) : [[sys.camPos.x, sys.camPos.z]];
  const cand = [];
  for (const a of sys.agents) {
    if (a.netId === undefined || !a.K || a.hide) continue;
    let d = 1e9;
    for (const p of P) { const e = Math.hypot(a.x - p[0], a.z - p[1]); if (e < d) d = e; }
    const r = rank(a, d);
    if (r >= 0) cand.push([r, a]);
  }
  cand.sort((u, v) => u[0] - v[0]);
  const out = [];
  for (let i = 0; i < cand.length && out.length < maxN; i++) {
    const a = cand[i][1], K = a.K;
    clipNames(K);
    const c = K.clips[a.clip], ci = K.netIndex.has(a.clip) ? K.netIndex.get(a.clip) : 0;
    const t = c && c.loop ? ((a.t % 1) + 1) % 1 : clamp(a.t, 0, 1);
    const s = stateOf(a), e = [a.netId, q(a.x, 20), q(a.z, 20), q(wrap(a.yaw), 100), ci, q(t, 100), q(a.speed, 10), s];
    if (a.fly || s >= 4) e.push(q(a.y, 20), q(a.pitch, 100), q(a.roll, 100));
    out.push(e);
  }
  return out;
}

export function importPoses(sys, list) {
  const now = performance.now() / 1000;
  for (const e of list) {
    const a = sys.netMap.get(e[0]); if (!a || !a.K) continue;
    const N = a.net || (a.net = { buf: [], at: 0, c: -1, frame: -9, ox: 0, oz: 0, oy: 0 });
    const last = N.buf[N.buf.length - 1], t = last ? Math.min(Math.max(now, last.t + 0.1), now + 0.15) : now;
    N.at = now;
    N.buf.push({ t, x: e[1], z: e[2], yaw: e[3], c: e[4], ct: e[5], v: e[6], s: e[7], y: e[8], p: e[9], r: e[10] });
    if (N.buf.length > 6) N.buf.shift();
  }
}

export function netPose(sys, a, dt, now) {
  const N = a.net, B = N.buf, rt = now - NET_DELAY, K = a.K;
  if (N.hold) {
    if (B[B.length - 1].s < 4) N.hold = false;
    else { a.speed = 0; a.want = 0; a.locomote(K); sys.ground(a, dt); N.frame = -9; return; }
  }
  let i = B.length - 1;
  while (i > 0 && B[i].t > rt) i--;
  const s0 = B[i], s1 = B[i + 1] && B[i].t <= rt ? B[i + 1] : null;
  let x, z, yaw, v, y = s0.y, p = s0.p, r = s0.r;
  if (s1) {
    const k = clamp((rt - s0.t) / Math.max(1e-3, s1.t - s0.t), 0, 1);
    x = s0.x + (s1.x - s0.x) * k; z = s0.z + (s1.z - s0.z) * k; yaw = s0.yaw + wrap(s1.yaw - s0.yaw) * k; v = s0.v + (s1.v - s0.v) * k;
    if (s0.y !== undefined && s1.y !== undefined) { y = s0.y + (s1.y - s0.y) * k; p = s0.p + wrap(s1.p - s0.p) * k; r = s0.r + wrap(s1.r - s0.r) * k; }
  } else {
    const e = clamp(rt - s0.t, 0, 0.4);
    x = s0.x + Math.sin(s0.yaw) * s0.v * e; z = s0.z + Math.cos(s0.yaw) * s0.v * e; yaw = s0.yaw; v = s0.v;
  }
  if (N.frame !== sys.frameNo - 1) {
    const ex = a.x - x, ez = a.z - z;
    if (Math.hypot(ex, ez) < SNAP) { N.ox = ex; N.oz = ez; N.oyaw = wrap(a.yaw - yaw); }
    else { N.ox = N.oz = N.oyaw = 0; if (a.body && !a.body.loose) a.body.b.setTranslation({ x, y: a.y, z }, true); }
  }
  N.frame = sys.frameNo;
  const k = Math.exp(-dt * 2.5);
  N.ox *= k; N.oz *= k; N.oyaw *= k;
  a.x = x + N.ox; a.z = z + N.oz; a.yaw = wrap(yaw + N.oyaw); a.speed = v; a.want = v; a.tx = a.x; a.tz = a.z;
  a.panic = s0.s === 2; a.lean = 0; a.push = null;
  if (s0.c !== N.c) {
    N.c = s0.c;
    const name = clipNames(K)[s0.c];
    if (name && name !== a.clip) {
      const c = K.clips[name];
      a.play(name, 0.25, s0.ct);
      a.action = c && !c.loop ? name : null;
      const cue = name === 'rear' ? (a.brain === 'tied' ? 'neigh' : 'trumpet') : CUE[name];
      if (cue && s0.ct < 0.5) sys.audio.cue(cue, a);
    }
  }
  if (s0.s === 7 && !a.wreck) { a.wreck = true; if (a.brain === 'parked' || a.brain === 'vehicle') a.brain = 'wreck'; }
  if (y !== undefined && (a.fly || s0.s >= 4)) { a.y = y; a.pitch = p || 0; a.roll = r || 0; }
  else if (!a.fly) sys.ground(a, dt);
}

function regroup(sys, g, s) {
  if (g.netFrame === sys.frameNo) return;
  g.netFrame = sys.frameNo;
  g.centroid();
  g.ax = g.cx; g.az = g.cz; g.gx = g.cx; g.gz = g.cz;
  for (const m of g.members) m.slot = [clamp(m.x - g.cx, -g.radius, g.radius), clamp(m.z - g.cz, -g.radius, g.radius)];
  if (Math.hypot(g.cx - g.home[0], g.cz - g.home[1]) > g.range * 0.8) g.home = [g.cx, g.cz];
  g.mt = 0; g.timer = rnd(5, 15);
  if (g.brain === 'grazer' || g.brain === 'pack') g.mode = s === 1 || s === 2 ? 'alert' : 'calm';
  if (g.brain === 'grazer' && s === 2) { g.startle = 4; }
  if (g.brain === 'pack' && g.mode === 'alert') g.mode = 'calm';
}

export function netResume(sys, a) {
  const N = a.net; a.net = null;
  if (!N || !N.buf.length) return;
  const s = N.buf[N.buf.length - 1].s;
  a.tx = a.x; a.tz = a.z; a.st = 0; a.timer = rnd(1, 4); a.acc = 0; a.want = 0;
  if (a.action && a.done()) a.action = null;
  if (a.group) regroup(sys, a.group, s);
  switch (a.brain) {
    case 'predator': a.state = s === 3 ? 'stalk' : 'wander'; break;
    case 'grazer': a.state = 'rejoin'; break;
    case 'walker': {
      const W = sys.walks, n = W && W.segs.length ? W.nearest(a.x, a.z) : null;
      if (n) a.path = { seg: n.seg, t: n.t, dir: Math.random() < 0.5 ? 1 : -1, crossing: null };
      a.dodge = null; a.push = null;
      a.state = s === 2 ? 'flee' : s === 1 ? 'gaze' : a.state === 'talk' ? 'talk' : 'walk';
      a.timer = rnd(3, 8);
      break;
    }
    default: break;
  }
  if (a.fly) { a.alt = a.y; a.vyAir = 0; }
}

export function softDown(sys, a, dt) {
  const D = a.down;
  if (D.phase === 'air') {
    const k = Math.exp(-dt * 2.2);
    D.vx *= k; D.vz *= k;
    a.x += D.vx * dt; a.z += D.vz * dt; a.y = sys.V.heightAt(a.x, a.z);
    if (a.wreck) { a.speed = 0; return true; }
    if (D.t > 0.9) { D.phase = 'rest'; D.t = 0; D.from = [0, 0]; D.wait = rnd(1.2, 2.5); if (a.K.clips.lie) a.play('lie', 0.4, 0); }
    return true;
  }
  if (D.phase === 'rest') {
    if (D.t > D.wait) { D.phase = 'up'; D.t = 0; a.pitch = 0; a.roll = 0; if (a.K.clips.getup) a.play('getup', 0.35, 0); }
    return true;
  }
  return false;
}
