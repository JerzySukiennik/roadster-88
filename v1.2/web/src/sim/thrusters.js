// Roadster 88 thrusters: ten cold-gas nozzles in three groups (rear boost, front retro, side lift) with valve timing, gimbal slew, flap and pod deploy, frost and damage, all in the car frame (+Z forward, +X left).
import { V3, clamp, moveTowards, DEG } from './math.js';

export const REAR_NAMES = ['Nozzle_RL1', 'Nozzle_RL2', 'Nozzle_RR2', 'Nozzle_RR1'];
export const FRONT_NAMES = ['Nozzle_FL', 'Nozzle_FR'];
export const SIDE_NAMES = ['Nozzle_SL1', 'Nozzle_SL2', 'Nozzle_SR1', 'Nozzle_SR2'];

export const BASIS = {
  rear: { a0y: 0, a0z: 1, a9y: 1, a9z: 0 },
  front: { a0y: 0, a0z: -1, a9y: 1, a9z: 0 },
  side: { a0y: 1, a0z: 0, a9y: 0, a9z: 1 },
};

export function thrustDir(b, pitch, side, out) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cs = Math.cos(side), ss = Math.sin(side);
  const fa = cp * cs, fb = sp * cs;
  return out.set(ss, fa * b.a0y + fb * b.a9y, fa * b.a0z + fb * b.a9z);
}

export class Nozzle {
  constructor(name, group, pos, thrustMax, pitchRange, sideMax, exit) {
    this.name = name; this.group = group; this.front = group === 'front';
    this.b = BASIS[group];
    this.base = new V3(pos[0], pos[1], pos[2]);
    this.pos = this.base.clone();
    this.exit = exit;
    this.thrustMax = thrustMax;
    this.pitchMin = pitchRange[0] * DEG; this.pitchMax = pitchRange[1] * DEG; this.sideMax = sideMax;
    this.pitch = 0; this.side = 0; this.valve = 0;
    this.cmdPitch = 0; this.cmdSide = 0; this.cmdValve = 0;
    this.health = 1; this.misPitch = 0; this.misSide = 0; this.attached = true;
    this.frost = 0; this.groundGain = 1; this.groundDist = 99;
    this.dir = thrustDir(this.b, 0, 0, new V3());
    this.force = new V3();
    this.puff = 0; this.lastValve = 0;
  }
}

export class Thrusters {
  constructor(t) {
    this.t = t.thrusters;
    const mk = (g, names) => {
      const c = this.t[g];
      if (!c) return [];
      return c.positions.map((p, i) => new Nozzle(names[i], g, p, c.thrust_each, c.pitch_range_deg, c.side_deflect_deg * DEG, c.exit_m || 0.1));
    };
    this.rear = mk('rear', REAR_NAMES);
    this.front = mk('front', FRONT_NAMES);
    this.side = mk('side', SIDE_NAMES);
    this.all = [...this.rear, ...this.front, ...this.side];
    this.deploy = 0; this.deployTarget = 0; this.frontLastUse = -99; this.time = 0;
    this.sideDeploy = 0; this.sideTarget = 0; this.sideLastUse = -99;
    this.flap = 0; this.extend = 0;
    this.totalForce = new V3(); this.totalTorque = new V3();
    this._d = new V3(); this._r = new V3(); this._c = new V3();
  }

  requestFront() { this.frontLastUse = this.time; }
  requestSide() { this.sideLastUse = this.time; }

  available(n) {
    if (!n.attached) return 0;
    const d = n.group === 'front' ? clamp((this.deploy - 0.5) / 0.5, 0, 1) : n.group === 'side' ? clamp((this.sideDeploy - 0.5) / 0.5, 0, 1) : 1;
    return n.thrustMax * n.health * d;
  }

  update(dt, com) {
    const T = this.t, S = T.side;
    this.time += dt;
    this.deployTarget = (this.time - this.frontLastUse) < T.front.retract_delay_s ? 1 : 0;
    this.deploy = moveTowards(this.deploy, this.deployTarget, dt / T.front.deploy_time_s);
    this.flap = clamp(this.deploy / 0.45, 0, 1);
    this.extend = clamp((this.deploy - 0.35) / 0.65, 0, 1);
    if (S) {
      this.sideTarget = (this.time - this.sideLastUse) < S.retract_delay_s ? 1 : 0;
      this.sideDeploy = moveTowards(this.sideDeploy, this.sideTarget, dt / S.deploy_time_s);
    }
    const gRate = T.gimbal_rate_deg_s * DEG * dt;
    this.totalForce.set(0, 0, 0); this.totalTorque.set(0, 0, 0);
    for (const n of this.all) {
      if (n.group === 'front') n.pos.set(n.base.x, n.base.y, n.base.z + T.front.deploy_travel_m * this.extend);
      else if (n.group === 'side') n.pos.set(n.base.x, n.base.y - S.deploy_travel_m * this.sideDeploy, n.base.z);
      const avail = this.available(n);
      const wantPitch = clamp(n.cmdPitch - n.misPitch, n.pitchMin, n.pitchMax);
      const wantSide = clamp(n.cmdSide - n.misSide, -n.sideMax, n.sideMax);
      n.pitch = moveTowards(n.pitch, wantPitch, gRate);
      n.side = moveTowards(n.side, wantSide, gRate);
      const aimErr = Math.abs(n.pitch - wantPitch) + Math.abs(n.side - wantSide);
      const aimGate = aimErr < 0.35 ? 1 - aimErr / 0.35 * 0.85 : 0.15 * Math.max(0, 1 - (aimErr - 0.35) / 0.6);
      const target = avail > 0 ? clamp(n.cmdValve, 0, 1) * aimGate : 0;
      const rate = target > n.valve ? dt / T.valve_open_s : dt / T.valve_close_s;
      n.lastValve = n.valve;
      n.valve = moveTowards(n.valve, target, rate);
      if (n.valve > 0.02 && n.lastValve <= 0.02) n.puff = 1;
      else if (n.valve <= 0.02 && n.lastValve > 0.02) n.puff = -1;
      else n.puff = 0;
      thrustDir(n.b, n.pitch + n.misPitch, n.side + n.misSide, n.dir);
      const mag = n.valve * avail * n.groundGain;
      n.force.copy(n.dir).scale(mag);
      n.frost = clamp(n.frost + (n.valve * n.valve * dt) / 7 - dt / 26, 0, 1);
      this.totalForce.add(n.force);
      this._r.subVectors(n.pos, com);
      this._c.crossVectors(this._r, n.force);
      this.totalTorque.add(this._c);
    }
  }

  maxOf(list) { return list.reduce((s, n) => s + n.thrustMax * n.health * (n.attached ? 1 : 0), 0); }
  maxFront() { return this.maxOf(this.front); }
  maxRear() { return this.maxOf(this.rear); }
  maxSide() { return this.maxOf(this.side); }
}
