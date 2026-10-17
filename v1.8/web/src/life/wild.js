// Roadster 88 life in the wild: the fauna of the real Earth outside the valley (the period's own animals in deep and far time, wildlife by climate zone in human and future times, thinner on ice and in deserts), spawned per 1.6 km square around the players from a stream seeded by the Earth cell, the period and the square, with stable net ids per square, and no people, traffic or trains.
import { Agent, Group, rnd, random, useRandom, seeded } from './agents.js';
import { lifePlan } from './plans.js';
import { colors } from './palette.js';

export const SQ = 1600;
const PER_SQ = 0.12;

const BIRDS = (breed, n, o = {}) => ({ kind: 'bird', brain: 'flock', groups: n, size: [8, 14], breed, alt: [8, 22], radius: 16, range: 380, perch: true, fly: true, ...o });
const SOAR = (breed, n = 1, scale) => ({ kind: 'bird', brain: 'soar', groups: n, size: [2, 4], breed, alt: [80, 150], radius: 70, range: 750, fly: true, scale });
const HERD = (kind, n, size, o = {}) => ({ kind, brain: 'grazer', groups: n, size, radius: 20, range: 450, ...o });
const PACK = (breed, n, size, o = {}) => ({ kind: 'canid', brain: 'pack', groups: n, size, breed, radius: 9, range: 450, shy: 1.4, ...o });

const ZONES = {
  tropical: () => [BIRDS('parrot', 6), HERD('deer', 3, [3, 6], { shy: 1.6, scale: [0.42, 0.55] }), SOAR('vulture', 1)],
  arid: (c) => [PACK('coyote', 3, [2, 4], { shy: 1.6 }), HERD('deer', 2, [3, 6], { shy: 1.7, scale: [0.8, 0.9] }), SOAR(c.lon < -30 ? 'condor' : 'vulture', 2), BIRDS('crow', 2)],
  temperate: () => [HERD('deer', 5, [4, 9], { shy: 1.4 }), PACK('wolf', 2, [3, 5], { shy: 1.2, scale: [1.2, 1.35] }), SOAR('hawk', 1), BIRDS('crow', 3), BIRDS('sparrow', 2)],
  continental: (c) => [HERD('deer', 4, [5, 10], { shy: 1.3, scale: [1.25, 1.45] }), c.lon < -50 ? HERD('bison', 3, [8, 14], { radius: 26, range: 520, scale: [1.05, 1.2], bulls: 0.2 }) : HERD('horse', 2, [4, 8], { scale: [0.62, 0.72] }), PACK('wolf', 2, [3, 6], { shy: 1.1, scale: [1.2, 1.35] }), SOAR('hawk', 1), BIRDS('crow', 2)],
  polar: () => [HERD('deer', 3, [6, 12], { shy: 1.2, scale: [1.0, 1.15], radius: 24 }), PACK('white', 2, [2, 4], { shy: 1.3 }), BIRDS('gull', 3)],
  alpine: (c) => [HERD('deer', 3, [3, 7], { shy: 1.8, scale: [0.75, 0.85] }), PACK('wolf', 1, [2, 4], { shy: 1.3, scale: [1.2, 1.3] }), SOAR(c.lon < -30 ? 'condor' : 'hawk', 1)],
};
const FUTURE = { 2050: 0.85, 2080: 0.7, 2150: 0.8, 2300: 0.9, scifi: 0.8, ruins: 1.3, 3000: 1.5 };

export function wildPlan(id, year, climate, age) {
  const c = climate || { zone: 'temperate', veg: 0.5, ice: 0, lon: 0 };
  let list, k = 0.35 + 0.9 * (c.veg ?? 0.5);
  if ((c.ice ?? 0) > 0.5) k *= 0.35;
  if (age === 'deep' || age === 'far') list = lifePlan(id, year).filter((P) => P.kind && !P.people && !P.town && P.traffic === undefined && !P.parked && !P.train && P.brain !== 'drone');
  else { list = (ZONES[c.zone] || ZONES.temperate)(c); k *= FUTURE[id] || 1; }
  return list.map((P) => ({ ...P, m: k }));
}

export function wildKinds(plan) { const s = new Set(); for (const P of plan) s.add(P.kind); return s; }

export function squareKey(i, j) { return i + ',' + j; }

export function spawnSquare(sys, plan, i, j, base, eraId, detail) {
  const out = { i, j, agents: [], groups: [], solo: [] };
  const x0 = i * SQ, z0 = j * SQ, V = sys.V;
  let n = 0;
  const nid = () => 5000000 + ((i + 64) * 128 + (j + 64)) * 256 + (n++ & 255);
  const spot = () => { for (let t = 0; t < 14; t++) { const x = x0 + random() * SQ, z = z0 + random() * SQ; if (sys.walkable(x, z, null)) return [x, z]; } return null; };
  const keepFor = (len) => Math.max(2, Math.round(len * Math.min(1, detail + 0.15)));
  useRandom(seeded(base + '|' + eraId + '|sq' + i + ',' + j));
  try {
    for (const P of plan) {
      const e = (P.solo !== undefined ? P.solo : P.groups) * PER_SQ * P.m;
      const cnt = Math.floor(e) + (random() < e % 1 ? 1 : 0);
      const keepGroups = detail < 0.6 ? Math.max(1, Math.round(cnt * 0.67)) : cnt;
      for (let gi = 0; gi < cnt; gi++) {
        const home = spot();
        if (!home) continue;
        if (P.solo !== undefined) {
          const [c0, c1] = colors(P.kind, random(), { breed: P.breed });
          const a = new Agent(P.kind, { x: home[0], z: home[1], brain: P.brain, c0, c1, fly: P.fly, scale: P.scale ? rnd(P.scale[0], P.scale[1]) : 1 });
          a.home = home; a.range = P.range; a.netId = nid();
          if (P.fly) { a.y = V.heightAt(home[0], home[1]) + rnd(20, 40); a.alt = a.y; }
          out.agents.push(a); out.solo.push(a);
          continue;
        }
        const g = new Group(P.kind, { x: home[0], z: home[1], radius: P.radius, range: P.range, mode: P.perch ? 'perch' : 'calm', data: { hunter: P.hunter, shy: P.shy, perch: P.perch, breed: P.breed } });
        if (P.alt) { g.alt = rnd(P.alt[0], P.alt[1]); g.cy = V.heightAt(home[0], home[1]) + g.alt; }
        g.brain = P.brain; g.gi = gi; g.pg = cnt;
        const size = Math.max(2, Math.round(rnd(P.size[0], P.size[1] + 1)));
        const members = [];
        for (let m = 0; m < size; m++) {
          const ang = random() * Math.PI * 2, r = P.radius * Math.sqrt(random()), slot = [Math.cos(ang) * r, Math.sin(ang) * r];
          const [c0, c1] = colors(P.kind, random(), { breed: P.breed });
          const a = new Agent(P.kind, { x: home[0] + slot[0], z: home[1] + slot[1], brain: P.brain, group: g, slot, c0, c1, fly: P.fly && !P.perch, scale: P.scale ? rnd(P.scale[0], P.scale[1]) : 1 });
          if (P.bulls && random() < P.bulls) a.role = 'bull';
          if (P.fly && !P.perch) { a.y = g.cy + rnd(-10, 10); a.alt = a.y; a.speed = 10; a.fly = true; }
          if (P.perch) { a.fly = true; a.y = V.heightAt(a.x, a.z); a.speed = 0; }
          a.netId = nid();
          members.push(a);
        }
        if (gi >= keepGroups) continue;
        g.members = members.slice(0, detail < 1 ? keepFor(members.length) : members.length);
        out.groups.push(g); out.agents.push(...g.members);
      }
    }
  } finally { useRandom(null); }
  return out;
}
