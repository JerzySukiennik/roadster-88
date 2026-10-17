// Roadster 88 life populations: spawns what plans.js says lives in each period and where (herds by the lake and on the flats, hunters in the wash and dunes, flocks and soaring birds, town people, dogs and tied horses, cattle on the open range, wildlife reclaiming the ruins, drones and air traffic), plus a welcome group placed near the car on every era change so life is always in view after a jump.
import { Agent, Group, rnd, random } from './agents.js';
import { colors } from './palette.js';
import { lifePlan, WELCOME, BIG_PREDATOR } from './plans.js';

export const DETAIL = { low: 0.4, medium: 0.7, high: 1, ultra: 1.25 };

export function kindsFor(eraId, year) {
  const out = new Set();
  for (const P of lifePlan(eraId, year)) {
    if (P.kind) out.add(P.kind);
    if (P.people) { for (const v of P.people) out.add(v); if (P.dogs) out.add('canid'); }
    if (P.train) for (const id of ['loco', 'railcar_box', 'railcar_pass']) out.add(id);
  }
  return out;
}

export function homeFor(sys, near, a0) {
  const V = sys.V, R = (id) => V.region && V.region(id);
  for (let tries = 0; tries < 40; tries++) {
    let p = null;
    if (near === 'lake') { const L = R('lake'); if (L) { const v = L.poly[Math.floor(random() * L.poly.length)], c = L.center || [-150, -620]; const k = rnd(1.15, 1.6); p = [c[0] + (v[0] - c[0]) * k, c[1] + (v[1] - c[1]) * k]; } }
    else if (near === 'wash' || near === 'dunes') { const W = R(random() < 0.6 ? 'wash' : 'dunes'); if (W) { const v = W.poly[Math.floor(random() * W.poly.length)]; p = [v[0] + rnd(-60, 60), v[1] + rnd(-60, 60)]; } }
    else if (near === 'town') { const T = R('town'); const c = T ? T.center : [-1210, -200]; p = [c[0] + rnd(-450, 450), c[1] + rnd(-450, 450)]; }
    else if (near === 'range') { p = [rnd(-500, 1100), rnd(-1500, 1500)]; }
    else if (near === 'hills') { p = [rnd(-1800, 1800), random() < 0.5 ? rnd(-1800, -1200) : rnd(1200, 1800)]; }
    if (!p) p = [rnd(-1500, 1500), rnd(-1500, 1500)];
    if (near === 'range' || near === 'hills') { const T = R('town'); if (T && Math.hypot(p[0] - T.center[0], p[1] - T.center[1]) < 450) continue; if (Math.abs(p[0] + 900) < 60) continue; }
    if (sys.walkable(p[0], p[1], a0)) return p;
  }
  return sys.randomWalkable(0, 0, 1500, a0) || [0, 0];
}

export function spawn(sys, eraId, preset, year) {
  const k = DETAIL[preset] || 1;
  const plan = lifePlan(eraId, year);
  const out = { agents: [], groups: [], solo: [], people: [], kinds: new Set() };
  const add = (a) => { out.agents.push(a); out.kinds.add(a.kind); return a; };
  for (const P of plan) {
    if (P.people) {
      const n = Math.round(P.count * k);
      for (const v of P.people) out.kinds.add(v);
      out.peopleSpec = { variants: P.people, n, dogs: Math.round((P.dogs || 0) * Math.min(1, k)) };
      if (P.dogs) out.kinds.add('canid');
      continue;
    }
    if (P.traffic !== undefined) { out.traffic = P.traffic * k; continue; }
    if (P.parked) { out.parked = Math.round(P.parked * k); continue; }
    if (P.train) { out.train = true; for (const id of ['loco', 'railcar_box', 'railcar_pass']) out.kinds.add(id); continue; }
    out.kinds.add(P.kind);
    if (P.town) {
      const T = sys.V.region && sys.V.region('town'), streets = (sys.V.roads || []).filter((r) => r.kind === 'street').sort((a, b) => b.width - a.width);
      const main = streets[0];
      for (let i = 0; i < Math.round(P.town * Math.min(1, k + 0.2)) && main; i++) {
        const p0 = main.pts[0], p1 = main.pts[main.pts.length - 1], t = 0.15 + 0.7 * random(), dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz), side = random() < 0.5 ? 1 : -1;
        const nx = dz / l * side, nz = -dx / l * side, off = main.width / 2 + 0.9;
        const x = p0[0] + dx * t + nx * off, z = p0[1] + dz * t + nz * off;
        const [c0, c1] = colors(P.kind, random());
        add(new Agent(P.kind, { x, z, yaw: Math.atan2(-nx, -nz) + rnd(-0.3, 0.3), brain: P.brain, c0, c1 }));
        void T;
      }
      continue;
    }
    if (P.solo) {
      for (let i = 0; i < Math.max(1, Math.round(P.solo * k)); i++) {
        const home = homeFor(sys, P.near, null);
        const [c0, c1] = colors(P.kind, random(), { breed: P.breed });
        const a = add(new Agent(P.kind, { x: home[0], z: home[1], brain: P.brain, c0, c1, fly: P.fly, scale: P.scale ? rnd(P.scale[0], P.scale[1]) : 1 }));
        a.home = home; a.range = P.range;
        if (P.fly) { a.y = sys.V.heightAt(home[0], home[1]) + rnd(20, 40); a.alt = a.y; }
        out.solo.push(a);
      }
      continue;
    }
    const ng = Math.max(1, Math.round(P.groups * (k < 0.6 ? 0.67 : 1)));
    for (let gi = 0; gi < ng; gi++) {
      const home = homeFor(sys, P.near, null);
      const g = new Group(P.kind, { x: home[0], z: home[1], radius: P.radius, range: P.range, mode: P.perch ? 'perch' : 'calm', data: { hunter: P.hunter, shy: P.shy, perch: P.perch, breed: P.breed } });
      if (P.alt) { g.alt = rnd(P.alt[0], P.alt[1]); g.cy = sys.V.heightAt(home[0], home[1]) + g.alt; }
      g.brain = P.brain; g.gi = gi; g.pg = P.groups;
      const n = Math.max(2, Math.round(rnd(P.size[0], P.size[1] + 1) * Math.min(1, k + 0.15)));
      for (let i = 0; i < n; i++) {
        const ang = random() * Math.PI * 2, r = P.radius * Math.sqrt(random());
        const slot = [Math.cos(ang) * r, Math.sin(ang) * r];
        const [c0, c1] = colors(P.kind, random(), { breed: P.breed });
        const a = add(new Agent(P.kind, { x: home[0] + slot[0], z: home[1] + slot[1], brain: P.brain, group: g, slot, c0, c1, fly: P.fly && !P.perch, scale: P.scale ? rnd(P.scale[0], P.scale[1]) : 1 }));
        if (P.bulls && random() < P.bulls) a.role = 'bull';
        if (P.fly && !P.perch) { a.y = g.cy + rnd(-10, 10); a.alt = a.y; a.speed = 10; a.fly = true; }
        if (P.perch) { a.fly = true; a.y = sys.V.heightAt(a.x, a.z); a.speed = 0; }
        g.members.push(a);
      }
      out.groups.push(g);
    }
  }
  return out;
}

export function welcome(sys, eraId, x, z, yaw) {
  const S = WELCOME[eraId] || (sys.wild ? [] : null);
  const res = [];
  if (S) {
    const kind = S.length ? S[Math.floor(random() * S.length)] : null;
    const big = () => sys.groups.filter((q) => q.brain === 'grazer' && q.members.length > 2).sort((p, q) => Math.hypot(p.cx - x, p.cz - z) - Math.hypot(q.cx - x, q.cz - z))[0];
    const g0 = sys.groups.find((q) => q.kind === kind && q.brain === 'grazer') || sys.groups.find((q) => S.includes(q.kind) && q.brain === 'grazer') || (sys.wild ? big() : null);
    for (let tries = 0; tries < 40 && g0; tries++) {
      const a = yaw + rnd(-0.4, 0.4) * (1 + tries / 20), d = rnd(85, 130), hx = x + Math.sin(a) * d, hz = z + Math.cos(a) * d;
      const probe = g0.members[0];
      let ok = sys.walkable(hx, hz, probe);
      for (let k = 0; k < 6 && ok; k++) ok = sys.walkable(hx + Math.sin(k) * g0.radius, hz + Math.cos(k) * g0.radius, probe);
      if (!ok) continue;
      const g = g0;
      if (g) { const dx = hx - g.cx, dz = hz - g.cz; g.home = [hx, hz]; g.ax = hx; g.az = hz; g.gx = hx; g.gz = hz; g.cx = hx; g.cz = hz; g.mode = 'calm'; g.timer = 30; for (const m of g.members) { m.x += dx; m.z += dz; if (m.body) sys.bodies.remove(m); } res.push(g); }
      break;
    }
  }
  if (BIG_PREDATOR[eraId]) {
    const t = sys.solo.find((a) => a.kind === BIG_PREDATOR[eraId]);
    if (t) for (let tries = 0; tries < 30; tries++) { const a = yaw + rnd(-1.6, 1.6), d = rnd(220, 300), hx = x + Math.sin(a) * d, hz = z + Math.cos(a) * d; if (sys.walkable(hx, hz, t)) { if (t.body) sys.bodies.remove(t); t.x = hx; t.z = hz; t.home = [hx, hz]; t.state = 'wander'; t.tx = x; t.tz = z; t.timer = 25; break; } }
    const fl = sys.groups.find((g) => g.kind === 'quetzal');
    if (fl) { const dx = x + Math.sin(yaw) * 120 - fl.cx, dz = z + Math.cos(yaw) * 120 - fl.cz; fl.cx += dx; fl.cz += dz; fl.gx = fl.cx; fl.gz = fl.cz; for (const m of fl.members) { m.x += dx; m.z += dz; } }
  }
  return res;
}
