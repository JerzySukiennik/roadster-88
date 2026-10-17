// Roadster 88 life traffic: lanes built from the valley roads (right-hand traffic, two lanes each way on Highway 88, the Valley Loop, links, town streets, dirt tracks and air lanes above the roads), vehicles that follow them with an intelligent-driver model, brake and honk for the player, change lanes round obstacles and wrecks, U-turn at dead ends and recycle off-map, horse-drawn wagons with their team and driver, and the 1885 train on the rail grade.
import { colors } from './palette.js';
import { Agent, clamp, rnd, random, wrap } from './agents.js';

const LANES = {
  highway: [2.85, 6.65], loop: [3.8], link: [2.75], street13: [3.2], street18: [4.4], track: [1.2], rail: [0],
};

export class Lane {
  constructor(road, off, dir, opts = {}) {
    this.road = road; this.off = off; this.dir = dir; this.closed = !!road.closed; this.kind = road.type || road.kind; this.alt = opts.alt || 0;
    const P = dir > 0 ? road.pts.slice() : road.pts.slice().reverse();
    const n = P.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      out.push([P[i][0] - tz * off, P[i][1] + tx * off]);
    }
    if (this.closed) out.push(out[0].slice());
    this.p = out; this.s = new Float32Array(out.length);
    for (let i = 1; i < out.length; i++) this.s[i] = this.s[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
    this.len = this.s[this.s.length - 1];
    this.cars = [];
    this.vmax = opts.vmax || 25;
  }

  idx(s) {
    let lo = 0, hi = this.s.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    return lo;
  }

  at(s, out) {
    if (this.closed) s = ((s % this.len) + this.len) % this.len; else s = clamp(s, 0, this.len);
    const i = this.idx(s), a = this.p[i], b = this.p[Math.min(this.p.length - 1, i + 1)];
    const seg = Math.max(1e-3, this.s[Math.min(this.s.length - 1, i + 1)] - this.s[i]), t = clamp((s - this.s[i]) / seg, 0, 1);
    out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t;
    out.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    return out;
  }

  project(x, z, s0, ahead) {
    const i0 = this.idx(Math.max(0, s0)), n = this.p.length;
    let best = null;
    for (let k = 0; k < ahead / 4 + 2; k++) {
      let i = i0 + k; if (i >= n - 1) { if (!this.closed) break; i -= n - 1; }
      const a = this.p[i], b = this.p[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), px = a[0] + dx * t, pz = a[1] + dz * t, lat = Math.hypot(x - px, z - pz);
      if (lat < 2.4 && (!best || lat < best.lat)) { let s = this.s[i] + Math.sqrt(l2) * t; if (s < s0 && this.closed) s += this.len; best = { s, lat, tx: dx / Math.sqrt(l2), tz: dz / Math.sqrt(l2) }; }
    }
    return best;
  }
}

const TRAFFIC_R = 2200, KEEP_R = 2700, MAX_CARS = 150;
const PAINT = [[0.7, 0.7, 0.7], [0.03, 0.03, 0.035], [0.5, 0.5, 0.52], [0.12, 0.13, 0.16], [0.42, 0.04, 0.03], [0.05, 0.12, 0.3], [0.85, 0.85, 0.82], [0.2, 0.22, 0.2], [0.55, 0.42, 0.25]];
const PAINT_FUTURE = [[0.85, 0.86, 0.88], [0.6, 0.62, 0.66], [0.1, 0.11, 0.12], [0.2, 0.32, 0.4], [0.75, 0.6, 0.35]];
const PAINT_WAGON = [[0.3, 0.12, 0.06], [0.12, 0.16, 0.1], [0.08, 0.07, 0.06]];
const pick = (list) => { let r = random(), acc = 0; for (const [id, w] of list) { acc += w; if (r <= acc) return id; } return list[0][0]; };

export class Traffic {
  constructor(sys) {
    this.sys = sys; this.lanes = []; this.cars = []; this.extra = []; this._p = { x: 0, z: 0, yaw: 0 }; this._q = { x: 0, z: 0, yaw: 0 };
    this.train = null;
  }

  build(T, train) {
    const V = this.sys.V, roads = V.roads || [];
    this.lanes = []; this.T = T; this.rail = null;
    const air = T.air, horseOnly = T.tracksOnly;
    for (const r of roads) {
      const type = r.type || r.kind;
      let key = type === 'street' ? (r.width > 15 ? 'street18' : 'street13') : type;
      if (type === 'rail') continue;
      if (horseOnly) { if (!['track', 'street', 'highway'].includes(type)) continue; key = type === 'highway' || type === 'street' ? 'track' : key; }
      else if (type === 'track') continue;
      const offs = LANES[key]; if (!offs) continue;
      const vmax = horseOnly ? 3.2 : Math.min(T.vmax, { highway: T.vmax, loop: 22, link: 15, street: 11, track: 3.2 }[type] || 15);
      for (const dir of [1, -1]) offs.forEach((o, i) => this.lanes.push(Object.assign(new Lane(r, o, dir, { vmax, alt: air ? (type === 'highway' ? 26 + i * 9 : 32) + (dir > 0 ? 0 : 5) : 0 }), { slot: i, rtype: type })));
    }
    for (const L of this.lanes) L.twin = this.lanes.filter((o) => o !== L && o.road === L.road && o.dir === L.dir);
    if (train) { const rail = roads.find((r) => (r.type || r.kind) === 'rail'); if (rail) this.rail = new Lane(rail, 0, 1, { vmax: 15 }); }
  }

  focusPoint() { const c = this.sys.camPos, S = this.sys.game.car && this.sys.game.car.sim; return S ? [S.pos.x, S.pos.z] : c ? [c.x, c.z] : [0, 0]; }

  lanesNear(fx, fz, r) {
    const out = [];
    for (const L of this.lanes) { const P = L.p; let best = Infinity; for (let i = 0; i < P.length; i += 4) { const d = Math.hypot(P[i][0] - fx, P[i][1] - fz); if (d < best) best = d; } if (best < r) out.push(L); }
    return out;
  }

  populate(T, budget) {
    const list = T.models; if (!list || !list.length) return [];
    const agents = [];
    const horseOnly = T.tracksOnly;
    const [fx, fz] = this.focusPoint();
    this.focus = [fx, fz]; this.near = this.lanesNear(fx, fz, TRAFFIC_R);
    const cap = Math.round(MAX_CARS * Math.min(1.3, budget)), want = [];
    let total = 0;
    for (const L of this.near) {
      const per = horseOnly ? (L.rtype === 'highway' ? 900 : L.rtype === 'street' ? 1400 : 1100) : L.rtype === 'highway' ? 260 : L.rtype === 'loop' ? 520 : L.rtype === 'street' ? 420 : L.rtype === 'link' ? 500 : 900;
      const n = L.len / per * budget * (T.horse && !horseOnly ? 0.75 : 1) + (L.rtype === 'street' ? Math.random() * 0.8 : 0);
      want.push(n); total += n;
    }
    const k = total > cap ? cap / total : 1;
    for (let li = 0; li < this.near.length; li++) {
      const L = this.near[li], n = Math.round(want[li] * k);
      for (let i = 0; i < n; i++) {
        let model = pick(list);
        if (model === 'truck_semi' && L.slot !== 0) model = list.find(([m]) => m !== 'truck_semi')[0];
        if (L.rtype === 'street' && model === 'truck_semi') model = list.find(([m]) => m !== 'truck_semi')[0];
        const wagon = model === 'wagon' || model === 'coach', future = model === 'pod' || model === 'ev2080' || model === 'hover';
        const pal = wagon ? PAINT_WAGON : future ? PAINT_FUTURE : null;
        const c0 = pal ? [...pal[Math.floor(Math.random() * pal.length)], 0] : colors(model, Math.random())[0];
        if (!pal && c0[0] === 0.5 && c0[1] === 0.5) { const q = PAINT[Math.floor(Math.random() * PAINT.length)]; c0[0] = q[0]; c0[1] = q[1]; c0[2] = q[2]; }
        const a = new Agent(model, { brain: 'vehicle', seed: Math.random(), c0, c1: [0, 0, 0, 0] });
        const v0 = wagon ? 3.2 : L.vmax;
        a.lane = L; a.s = (i + Math.random() * 0.6) / Math.max(1, n) * L.len; a.v = v0 * rnd(0.8, 1.0); a.v0 = v0 * rnd(0.88, 1.08) * (model === 'truck_semi' ? 0.85 : 1);
        a.fly = model === 'hover'; a.ground = !a.fly;
        L.cars.push(a); this.cars.push(a); agents.push(a);
        if (wagon) agents.push(...this.team(a, model));
      }
    }
    return agents;
  }

  parked(T, n) {
    if (!T.parkedOk) return [];
    const list = T.models.filter(([m]) => m !== 'truck_semi' && m !== 'wagon' && m !== 'coach' && m !== 'hover');
    if (!list.length) return [];
    const inner = (L) => { const m = L.p[Math.floor(L.p.length / 2)]; return Math.abs(m[0]) < 2100 && Math.abs(m[1]) < 2100; };
    const out = [], streets = this.lanes.filter((L) => L.rtype === 'street' && !L.road.city && inner(L));
    for (let i = 0; i < n && streets.length; i++) {
      const L = streets[Math.floor(random() * streets.length)], s = rnd(10, L.len - 10);
      const p = L.at(s, this._p), w = (L.road.width / 2) - 1.15 - L.off;
      const model = pick(list);
      const future = model === 'pod' || model === 'ev2080';
      const c0 = future ? [...PAINT_FUTURE[Math.floor(random() * PAINT_FUTURE.length)], 0] : colors(model, random())[0];
      if (!future && c0[0] === 0.5 && c0[1] === 0.5) { const q = PAINT[Math.floor(random() * PAINT.length)]; c0[0] = q[0]; c0[1] = q[1]; c0[2] = q[2]; }
      const a = new Agent(model, { brain: 'parked', c0, c1: [0, 0, 0, 0] });
      a.x = p.x - Math.cos(p.yaw) * w; a.z = p.z + Math.sin(p.yaw) * w; a.yaw = p.yaw; a.parked = true;
      if (this.sys.eras && this.sys.eras.overlaps(a.x, this.sys.V.heightAt(a.x, a.z), a.z, 2)) continue;
      out.push(a);
    }
    return out;
  }

  team(w, model) {
    const out = [], pairs = model === 'coach' ? 2 : 1;
    w.team = [];
    for (let pr = 0; pr < pairs; pr++) for (const side of [-1, 1]) {
      const h = new Agent('horse', { brain: 'harness', c0: null });
      h.hitch = { w, ahead: (model === 'coach' ? 2.7 : 2.4) + pr * 2.7, side: side * 0.62 };
      w.team.push(h); out.push(h);
    }
    const d = new Agent((this.T && this.T.driver) || 'human_m1885', { brain: 'seat' });
    d.seatOn = { w, at: model === 'coach' ? [0, 1.85, 1.38] : [0, 0.95, 1.42] };
    w.driver = d; out.push(d);
    return out;
  }

  recycle(dt) {
    this.recT = (this.recT || 0) - dt;
    if (this.recT > 0 || !this.cars.length || !this.T) return;
    this.recT = 0.5;
    const [fx, fz] = this.focusPoint();
    if (!this.focus || Math.hypot(fx - this.focus[0], fz - this.focus[1]) > 450) { this.focus = [fx, fz]; this.near = this.lanesNear(fx, fz, TRAFFIC_R); }
    if (!this.near || !this.near.length) return;
    let moved = 0;
    for (const a of this.cars) {
      if (moved >= 6) break;
      if (a.down || a.wreck || a.body) continue;
      if (Math.hypot(a.x - fx, a.z - fz) < KEEP_R) continue;
      for (let tries = 0; tries < 8; tries++) {
        const L = this.near[Math.floor(Math.random() * this.near.length)], s = Math.random() * L.len, p = L.at(s, this._q), d = Math.hypot(p.x - fx, p.z - fz);
        if (d < 320 || d > TRAFFIC_R) continue;
        if (L.cars.some((c) => Math.abs(c.s - s) < 30)) continue;
        if (a.lane) a.lane.cars = a.lane.cars.filter((c) => c !== a);
        a.lane = L; a.s = s; a.v = a.v0 * 0.85; a.lc = null; L.cars.push(a); a.prev = null; moved++;
        break;
      }
    }
  }

  update(dt) {
    this.recycle(dt);
    const S = this.sys.sense;
    for (const L of this.lanes) { L.cars = L.cars.filter((a) => !a.wreck && a.lane === L); L.cars.sort((a, b) => a.s - b.s); }
    const obstacles = this.sys.obstacles;
    for (const L of this.lanes) {
      const n = L.cars.length;
      for (let k = 0; k < n; k++) {
        const a = L.cars[k];
        if (a.down) continue;
        const lead = L.cars[k + 1] || (L.closed && n > 1 ? L.cars[0] : null);
        let gap = 1e9, dv = 0, lv = a.v0;
        if (lead && lead !== a) { gap = (lead.s - a.s + (lead.s < a.s ? L.len : 0)) - ((lead.K ? lead.K.meta.length : 5) + (a.K ? a.K.meta.length : 5)) / 2; dv = a.v - lead.v; lv = lead.v; }
        const near = Math.hypot(a.x - S.x, a.z - S.z) < 260;
        a.blocked = 0;
        if (near) {
          const check = (ox, oz, ovx, ovz, len, isPlayer) => {
            if (a.fly && isPlayer && Math.abs(S.y - a.y) > 6) return;
            const pr = L.project(ox, oz, a.s, 150);
            if (!pr) return;
            const g = pr.s - a.s - (len + (a.K ? a.K.meta.length : 5)) / 2;
            if (g > -2 && g < gap) { gap = Math.max(0.1, g); const ov = ovx * pr.tx + ovz * pr.tz; dv = a.v - ov; lv = ov; a.blocked = isPlayer ? 1 : 2; }
          };
          if (S.visible) check(S.x, S.z, S.vx, S.vz, 4.4, true);
          for (const o of obstacles) check(o.x, o.z, 0, 0, o.len || 2, false);
        }
        const A = a.fly ? 3 : 1.6, B = 3.2, T = 1.3, s0 = 3.5;
        const ss = s0 + Math.max(0, a.v * T + a.v * dv / (2 * Math.sqrt(A * B)));
        let acc = A * (1 - Math.pow(Math.max(0, a.v) / a.v0, 4) - (gap < 1e8 ? (ss / gap) ** 2 : 0));
        acc = clamp(acc, -9, A);
        if (a.blocked && acc < -3.5 && (a.hornCool || 0) <= 0) { a.hornCool = rnd(4, 8); this.sys.emit('horn', a); }
        a.hornCool = (a.hornCool || 0) - dt;
        a.brake = acc < -0.6 ? 1 : a.v < 0.3 ? 0.6 : 0;
        if (a.blocked && a.v < 4 && gap < 25 && !a.lc && L.twin.length) {
          a.waitT = (a.waitT || 0) + dt;
          if (a.waitT > 1.5) { const T2 = L.twin[0]; const s2 = a.s * T2.len / L.len; if (T2.cars.every((c) => Math.abs(c.s - s2) > 14)) { a.lc = { from: L, t: 0 }; a.lane = T2; a.s = s2; T2.cars.push(a); a.waitT = 0; } }
        } else a.waitT = 0;
        if (a.blocked === 2 && a.v < 0.5 && gap < 12 && !L.twin.length) { a.stuck = (a.stuck || 0) + dt; if (a.stuck > 8) this.uturn(a); } else a.stuck = 0;
        a.v = Math.max(0, a.v + acc * dt);
        a.s += a.v * dt;
        if (!L.closed && a.s > L.len - 4) this.endOfLane(a);
      }
    }
    for (const a of this.cars) this.place(a, dt);
    if (this.trainCars) this.updateTrain(dt);
  }

  uturn(a) {
    const L = a.lane, back = this.lanes.find((o) => o.road === L.road && o.dir !== L.dir && o.slot === (L.slot || 0));
    if (!back) { a.s = 0; return; }
    a.lane = back; a.s = Math.max(0, back.len - a.s); a.v = 0; back.cars.push(a); a.stuck = 0;
  }

  endOfLane(a) {
    const L = a.lane, cam = this.sys.camPos;
    const p = L.at(4, this._q), far = !cam || Math.hypot(p.x - cam.x, p.z - cam.z) > 350;
    if (L.rtype === 'highway' && far) { a.s = 4 + Math.random() * 30; a.v = a.v0 * 0.8; return; }
    this.uturn(a);
  }

  place(a, dt) {
    if (a.down || a.wreck) return;
    const L = a.lane, p = L.at(a.s, this._p);
    let x = p.x, z = p.z, yaw = p.yaw;
    if (a.lc) {
      a.lc.t += dt / 2.6;
      const q = a.lc.from.at(a.s * a.lc.from.len / L.len, this._q), k = clamp(a.lc.t, 0, 1), e = k * k * (3 - 2 * k);
      x = q.x + (x - q.x) * e; z = q.z + (z - q.z) * e; yaw += Math.sin(Math.PI * k) * 0.08 * (L.off > a.lc.from.off ? -1 : 1);
      if (a.lc.t >= 1) a.lc = null;
    }
    const V = this.sys.V, gy = V.heightAt(x, z);
    const turn = wrap(yaw - a.yaw);
    a.yaw = a.yaw + clamp(turn, -3 * dt, 3 * dt);
    if (a.fly) {
      a.x = x; a.z = z;
      const ty = gy + L.alt + Math.sin(this.sys.time * 0.7 + a.id) * 0.4;
      a.y = a.y ? a.y + clamp(ty - a.y, -8 * dt, 8 * dt) : ty;
      a.roll = clamp(-turn * 4, -0.4, 0.4); a.pitch = -clamp((a.v - (a.vPrev || a.v)) / Math.max(dt, 1e-3) * 0.02, -0.15, 0.15);
    } else if (Math.hypot(x - this.sys.camPos.x, z - this.sys.camPos.z) > 420) {
      a.x = x; a.z = z; a.y = gy; a.pitch = 0; a.roll = 0;
    } else {
      a.x = x; a.z = z; a.y = gy;
      const f = Math.sin(a.yaw), c = Math.cos(a.yaw), half = (a.K ? a.K.meta.length : 4.5) * 0.4;
      const hf = V.heightAt(x + f * half, z + c * half), hb = V.heightAt(x - f * half, z - c * half);
      a.pitch = -Math.atan2(hf - hb, half * 2) + clamp((a.v - (a.vPrev || a.v)) / Math.max(dt, 1e-3) * 0.006, -0.03, 0.03);
      const hl = V.heightAt(x + c * 0.8, z - f * 0.8), hr = V.heightAt(x - c * 0.8, z + f * 0.8);
      a.roll = Math.atan2(hl - hr, 1.6) * -0.8 + clamp(turn * a.v * 0.02, -0.04, 0.04);
      a.y = Math.max(gy, (hf + hb) / 2);
    }
    a.vPrev = a.v; a.speed = a.v;
    if (a.c1) { a.c1[0] = a.brake || 0; a.c1[1] = this.sys.night ? 1 : 0; }
    const K = a.K;
    if (K) { const r = K.meta.wheel || 0.35; a.wheelT = (a.wheelT || 0) + a.v * dt / (Math.PI * 2 * r); }
    if (a.team) for (const h of a.team) this.placeHorse(h, a);
    if (a.driver) this.placeSeat(a.driver, a);
  }

  placeHorse(h, w) {
    if (h.down) return;
    const f = Math.sin(w.yaw), c = Math.cos(w.yaw), H = h.hitch;
    h.x = w.x + f * H.ahead - c * H.side; h.z = w.z + c * H.ahead + f * H.side;
    h.y = this.sys.V.heightAt(h.x, h.z); h.yaw = w.yaw; h.speed = w.v; h.pitch = w.pitch * 0.5;
  }

  placeSeat(d, w) {
    if (d.down) return;
    const f = Math.sin(w.yaw), c = Math.cos(w.yaw), A = d.seatOn.at;
    d.x = w.x + f * A[2] - c * A[0]; d.z = w.z + c * A[2] + f * A[0]; d.y = w.y + A[1]; d.yaw = w.yaw; d.pitch = w.pitch; d.roll = w.roll;
  }

  wrecked(a) {
    a.wreck = true; a.v = 0;
    const i = a.lane.cars.indexOf(a); if (i >= 0) a.lane.cars.splice(i, 1);
    if (a.team) for (const h of a.team) { h.brain = 'loose'; h.hitch = null; }
    if (a.driver) { a.driver.brain = 'walker'; a.driver.seatOn = null; a.driver.state = 'flee'; a.driver.timer = 6; }
  }

  setupTrain(kinds) {
    if (!this.rail) return [];
    const order = [['loco', 15.6], ['railcar_box', 11.4], ['railcar_pass', 11.4], ['railcar_pass', 11.4]];
    this.trainCars = []; let off = 0;
    for (const [id, len] of order) {
      const a = new Agent(id, { brain: 'train', c0: id === 'railcar_box' ? [0.3, 0.1, 0.06, 0] : [0.18, 0.2, 0.14, 0], c1: [0, 0, 0, 0] });
      a.trainOff = off + len / 2; a.trainLen = len; off += len + 0.9;
      this.trainCars.push(a);
    }
    this.trainS = 600; this.trainV = 0; this.trainState = 'run'; this.trainT = 0;
    const T = this.sys.eras && this.sys.eras.structures && this.sys.eras.structures.town ? this.sys.eras.structures.town() : null;
    this.depotS = T ? (T.p0[1] + T.hw + 25) - this.rail.p[0][1] : this.rail.len / 2;
    void kinds;
    return this.trainCars;
  }

  updateTrain(dt) {
    const S = this.sys.sense, R = this.rail, cars = this.trainCars;
    this.trainT += dt;
    const head = this.trainS;
    let vmax = 15;
    const toDepot = this.depotS - head;
    if (this.trainState === 'run' && toDepot > 0 && toDepot < 160) vmax = Math.max(1.2, Math.sqrt(2 * 0.45 * Math.max(0, toDepot - 2)));
    if (this.trainState === 'run' && Math.abs(toDepot) < 2.5 && this.trainV < 1.5) { this.trainState = 'stop'; this.trainT = 0; this.sys.emit('whistle', cars[0]); }
    if (this.trainState === 'stop') { vmax = 0; if (this.trainT > 35) { this.trainState = 'leave'; this.trainT = 0; this.sys.emit('whistle', cars[0]); } }
    if (this.trainState === 'leave' && head > this.depotS + 200) this.trainState = 'run2';
    if (S.visible) {
      const pr = R.project(S.x, S.z, head, 400);
      if (pr && pr.s > head && pr.lat < 2.8) { const g = pr.s - head - 10; if (g < 300) { vmax = Math.min(vmax, Math.max(0, Math.sqrt(2 * 0.7 * Math.max(0, g)))); if ((this.whistleCool || 0) <= 0) { this.whistleCool = 4; this.sys.emit('whistle', cars[0]); } } }
    }
    this.whistleCool = (this.whistleCool || 0) - dt;
    const acc = vmax > this.trainV ? 0.35 : -0.8;
    this.trainV = clamp(this.trainV + acc * dt, Math.min(this.trainV, vmax), Math.max(this.trainV, vmax));
    this.trainS += this.trainV * dt;
    if (this.trainS > R.len - 30) { const cam = this.sys.camPos; if (!cam || Math.hypot(cam.x - R.p[0][0], cam.z - R.p[0][1]) > 500) { this.trainS = 40; this.trainState = 'run'; this.trainV = 10; } else this.trainV = 0; }
    for (const a of cars) {
      const p = R.at(this.trainS - a.trainOff, this._p);
      a.x = p.x; a.z = p.z; a.yaw = p.yaw;
      const rp = R.road.points, i = R.idx(this.trainS - a.trainOff);
      a.y = rp && rp[i] ? rp[i][1] + 0.15 : this.sys.V.heightAt(a.x, a.z) + 0.3;
      a.speed = this.trainV; a.pitch = 0; a.roll = 0;
      const K = a.K; if (K) a.wheelT = (a.wheelT || 0) + this.trainV * dt / (Math.PI * 2 * (K.meta.wheel || 0.45));
    }
    const loco = cars[0];
    if (loco && (this.trainV > 0.2 || this.trainState === 'stop')) this.smoke(loco, dt);
  }

  smoke(a, dt) {
    const fx = this.sys.game.fx; if (!fx || !a.K) return;
    const f = Math.sin(a.yaw), c = Math.cos(a.yaw);
    const sx = a.x + f * 4.95, sz = a.z + c * 4.95, sy = a.y + 4.5;
    this.puff = (this.puff || 0) + dt * (2 + this.trainV * 1.2);
    while (this.puff > 1) {
      this.puff -= 1;
      fx.alpha.spawn(sx + rnd(-0.2, 0.2), sy, sz + rnd(-0.2, 0.2), rnd(-0.4, 0.4) - f * this.trainV * 0.3, rnd(2.2, 3.4), rnd(-0.4, 0.4) - c * this.trainV * 0.3, rnd(3.5, 6), 0.8, rnd(4, 7), 0.32, 0.31, 0.3, 0.55, 0.6, 0.6);
    }
  }
}
