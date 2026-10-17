// Roadster 88 life populations: what lives in each era and where (herds by the lake and on the flats, hunters in the wash and dunes, flocks and soaring birds, town people, dogs and tied horses, cattle on the open range, wildlife reclaiming the ruins, drones and air traffic), plus a welcome group placed near the car on every era change so life is always in view after a jump.
import { Agent, Group, rnd } from './agents.js';
import { colors } from './palette.js';

const DETAIL = { low: 0.4, medium: 0.7, high: 1, ultra: 1.25 };

export const PLAN = {
  hadean: [],
  dino: [
    { kind: 'triceratops', brain: 'grazer', groups: 3, size: [5, 9], near: 'lake', radius: 22, range: 380, bulls: 0.3 },
    { kind: 'hadrosaur', brain: 'grazer', groups: 3, size: [6, 11], near: 'lake', radius: 26, range: 420 },
    { kind: 'sauropod', brain: 'grazer', groups: 2, size: [3, 5], near: 'lake', radius: 40, range: 500, scale: [0.85, 1.1] },
    { kind: 'raptor', brain: 'pack', groups: 2, size: [4, 6], near: 'wash', radius: 10, range: 450, hunter: true },
    { kind: 'trex', brain: 'predator', solo: 2, near: 'valley' },
    { kind: 'quetzal', brain: 'soar', groups: 2, size: [2, 4], alt: [70, 130], radius: 90, range: 900, fly: true },
    { kind: 'bird', brain: 'flock', groups: 4, size: [10, 18], breed: 'toothed', alt: [8, 22], radius: 18, range: 400, perch: true, near: 'lake', fly: true, scale: [0.9, 1.3] },
  ],
  1885: [
    { kind: 'longhorn', brain: 'grazer', groups: 4, size: [8, 14], near: 'range', radius: 28, range: 500 },
    { kind: 'horse', brain: 'grazer', groups: 2, size: [4, 7], near: 'range', radius: 16, range: 400 },
    { kind: 'horse', brain: 'tied', town: 9 },
    { kind: 'canid', brain: 'pack', groups: 2, size: [2, 4], breed: 'coyote', near: 'hills', radius: 8, range: 400, shy: 1.6 },
    { kind: 'bird', brain: 'soar', groups: 1, size: [4, 6], breed: 'vulture', alt: [90, 150], radius: 70, range: 700, fly: true, scale: [3.2, 3.8] },
    { kind: 'bird', brain: 'flock', groups: 3, size: [8, 14], breed: 'crow', alt: [8, 20], radius: 14, range: 350, perch: true, near: 'town', fly: true },
    { people: ['human_m1885', 'human_m1885', 'human_f1885'], count: 44 },
    { traffic: 0.8 }, { train: true },
  ],
  2026: [
    { kind: 'longhorn', brain: 'grazer', groups: 1, size: [6, 10], near: 'range', radius: 20, range: 300 },
    { kind: 'horse', brain: 'grazer', groups: 1, size: [3, 5], near: 'range', radius: 14, range: 250 },
    { kind: 'canid', brain: 'pack', groups: 1, size: [2, 3], breed: 'coyote', near: 'hills', radius: 8, range: 400, shy: 1.8 },
    { kind: 'bird', brain: 'soar', groups: 1, size: [2, 3], breed: 'hawk', alt: [70, 120], radius: 60, range: 700, fly: true, scale: [2.2, 2.6] },
    { kind: 'bird', brain: 'flock', groups: 3, size: [10, 16], breed: 'crow', alt: [8, 20], radius: 14, range: 350, perch: true, near: 'town', fly: true },
    { people: ['human_m2026', 'human_f2026'], count: 64, dogs: 5 },
    { traffic: 1 }, { parked: 26 },
  ],
  2080: [
    { kind: 'bird', brain: 'flock', groups: 2, size: [10, 16], breed: 'sparrow', alt: [10, 25], radius: 14, range: 350, perch: true, near: 'town', fly: true, scale: [0.6, 0.8] },
    { kind: 'drone', brain: 'drone', solo: 14, near: 'town', range: 600, fly: true },
    { people: ['human_m2080', 'human_f2080'], count: 54, dogs: 3 },
    { traffic: 1.1 }, { parked: 18 },
  ],
  ruins: [
    { kind: 'deer', brain: 'grazer', groups: 3, size: [5, 9], near: 'town', radius: 18, range: 500, shy: 1.4 },
    { kind: 'horse', brain: 'grazer', groups: 2, size: [5, 8], near: 'range', radius: 18, range: 500, shy: 1.3 },
    { kind: 'canid', brain: 'pack', groups: 2, size: [4, 6], breed: 'wolf', near: 'hills', radius: 9, range: 500, shy: 1.2, scale: [1.25, 1.4] },
    { kind: 'bird', brain: 'soar', groups: 1, size: [4, 6], breed: 'vulture', alt: [80, 140], radius: 70, range: 700, fly: true, scale: [3.2, 3.8] },
    { kind: 'bird', brain: 'flock', groups: 4, size: [10, 18], breed: 'crow', alt: [8, 20], radius: 14, range: 400, perch: true, near: 'town', fly: true },
  ],
  scifi: [
    { kind: 'bird', brain: 'flock', groups: 2, size: [8, 14], breed: 'gull', alt: [15, 40], radius: 20, range: 500, near: 'lake', fly: true, scale: [1.1, 1.3] },
    { kind: 'drone', brain: 'drone', solo: 22, near: 'town', range: 900, fly: true },
    { people: ['human_scifi'], count: 34 },
    { traffic: 0.9 },
  ],
};

export function kindsFor(eraId) {
  const out = new Set();
  for (const P of PLAN[eraId] || []) {
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
    if (near === 'lake') { const L = R('lake'); if (L) { const v = L.poly[Math.floor(Math.random() * L.poly.length)], c = L.center || [-150, -620]; const k = rnd(1.15, 1.6); p = [c[0] + (v[0] - c[0]) * k, c[1] + (v[1] - c[1]) * k]; } }
    else if (near === 'wash' || near === 'dunes') { const W = R(Math.random() < 0.6 ? 'wash' : 'dunes'); if (W) { const v = W.poly[Math.floor(Math.random() * W.poly.length)]; p = [v[0] + rnd(-60, 60), v[1] + rnd(-60, 60)]; } }
    else if (near === 'town') { const T = R('town'); const c = T ? T.center : [-1210, -200]; p = [c[0] + rnd(-450, 450), c[1] + rnd(-450, 450)]; }
    else if (near === 'range') { p = [rnd(-500, 1100), rnd(-1500, 1500)]; }
    else if (near === 'hills') { p = [rnd(-1800, 1800), Math.random() < 0.5 ? rnd(-1800, -1200) : rnd(1200, 1800)]; }
    if (!p) p = [rnd(-1500, 1500), rnd(-1500, 1500)];
    if (near === 'range' || near === 'hills') { const T = R('town'); if (T && Math.hypot(p[0] - T.center[0], p[1] - T.center[1]) < 450) continue; if (Math.abs(p[0] + 900) < 60) continue; }
    if (sys.walkable(p[0], p[1], a0)) return p;
  }
  return sys.randomWalkable(0, 0, 1500, a0) || [0, 0];
}

export function spawn(sys, eraId, preset) {
  const k = DETAIL[preset] || 1;
  const plan = PLAN[eraId] || [];
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
        const p0 = main.pts[0], p1 = main.pts[main.pts.length - 1], t = 0.15 + 0.7 * Math.random(), dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz), side = Math.random() < 0.5 ? 1 : -1;
        const nx = dz / l * side, nz = -dx / l * side, off = main.width / 2 + 0.9;
        const x = p0[0] + dx * t + nx * off, z = p0[1] + dz * t + nz * off;
        const [c0, c1] = colors(P.kind, Math.random());
        add(new Agent(P.kind, { x, z, yaw: Math.atan2(-nx, -nz) + rnd(-0.3, 0.3), brain: P.brain, c0, c1 }));
        void T;
      }
      continue;
    }
    if (P.solo) {
      for (let i = 0; i < Math.max(1, Math.round(P.solo * k)); i++) {
        const home = homeFor(sys, P.near, null);
        const [c0, c1] = colors(P.kind, Math.random(), { breed: P.breed });
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
      g.brain = P.brain;
      const n = Math.max(2, Math.round(rnd(P.size[0], P.size[1] + 1) * Math.min(1, k + 0.15)));
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, r = P.radius * Math.sqrt(Math.random());
        const slot = [Math.cos(ang) * r, Math.sin(ang) * r];
        const [c0, c1] = colors(P.kind, Math.random(), { breed: P.breed });
        const a = add(new Agent(P.kind, { x: home[0] + slot[0], z: home[1] + slot[1], brain: P.brain, group: g, slot, c0, c1, fly: P.fly && !P.perch, scale: P.scale ? rnd(P.scale[0], P.scale[1]) : 1 }));
        if (P.bulls && Math.random() < P.bulls) a.role = 'bull';
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
  const S = { dino: ['hadrosaur', 'triceratops'], 1885: ['longhorn'], ruins: ['deer', 'horse'] }[eraId];
  const res = [];
  if (S) {
    const kind = S[Math.floor(Math.random() * S.length)];
    const g0 = sys.groups.find((q) => q.kind === kind && q.brain === 'grazer');
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
  if (eraId === 'dino') {
    const t = sys.solo.find((a) => a.kind === 'trex');
    if (t) for (let tries = 0; tries < 30; tries++) { const a = yaw + rnd(-1.6, 1.6), d = rnd(220, 300), hx = x + Math.sin(a) * d, hz = z + Math.cos(a) * d; if (sys.walkable(hx, hz, t)) { if (t.body) sys.bodies.remove(t); t.x = hx; t.z = hz; t.home = [hx, hz]; t.state = 'wander'; t.tx = x; t.tz = z; t.timer = 25; break; } }
    const fl = sys.groups.find((g) => g.kind === 'quetzal');
    if (fl) { const dx = x + Math.sin(yaw) * 120 - fl.cx, dz = z + Math.cos(yaw) * 120 - fl.cz; fl.cx += dx; fl.cz += dz; fl.gx = fl.cx; fl.gz = fl.cz; for (const m of fl.members) { m.x += dx; m.z += dz; } }
  }
  return res;
}
