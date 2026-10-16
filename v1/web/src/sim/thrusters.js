// Roadster 88 thrusters: six cold-gas nozzles with valve timing, gimbal slew, front flap deploy, frost and damage, all in the car frame (+Z forward, +X left).
import { V3, clamp, moveTowards, DEG } from './math.js';

export const REAR_NAMES = ['Nozzle_RL1', 'Nozzle_RL2', 'Nozzle_RR2', 'Nozzle_RR1'];
export const FRONT_NAMES = ['Nozzle_FL', 'Nozzle_FR'];

export function thrustDir(front, pitch, side, out) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cs = Math.cos(side), ss = Math.sin(side);
  return out.set(ss, sp * cs, (front ? -cp : cp) * cs);
}

export class Nozzle {
  constructor(name, front, pos, thrustMax, pitchRange, sideMax) {
    this.name = name; this.front = front;
    this.base = new V3(pos[0], pos[1], pos[2]);
    this.pos = this.base.clone();
    this.thrustMax = thrustMax;
    this.pitchMin = pitchRange[0] * DEG; this.pitchMax = pitchRange[1] * DEG; this.sideMax = sideMax;
    this.pitch = 0; this.side = 0; this.valve = 0;
    this.cmdPitch = 0; this.cmdSide = 0; this.cmdValve = 0;
    this.health = 1; this.misPitch = 0; this.misSide = 0; this.attached = true;
    this.frost = 0; this.groundGain = 1; this.groundDist = 99;
    this.dir = new V3(0, 0, front ? -1 : 1);
    this.force = new V3();
    this.puff = 0; this.lastValve = 0;
  }
  available(deploy) {
    if (!this.attached) return 0;
    const d = this.front ? clamp((deploy - 0.5) / 0.5, 0, 1) : 1;
    return this.thrustMax * this.health * d;
  }
}

export class Thrusters {
  constructor(t) {
    this.t = t.thrusters;
    const r = this.t.rear, f = this.t.front;
    this.rear = r.positions.map((p, i) => new Nozzle(REAR_NAMES[i], false, p, r.thrust_each, r.pitch_range_deg, r.side_deflect_deg * DEG));
    this.front = f.positions.map((p, i) => new Nozzle(FRONT_NAMES[i], true, p, f.thrust_each, f.pitch_range_deg, f.side_deflect_deg * DEG));
    this.all = [...this.rear, ...this.front];
    this.deploy = 0; this.deployTarget = 0; this.frontLastUse = -99; this.time = 0;
    this.flap = 0; this.extend = 0;
    this.totalForce = new V3(); this.totalTorque = new V3();
    this._d = new V3(); this._r = new V3(); this._c = new V3();
  }

  requestFront() { this.frontLastUse = this.time; }

  update(dt, com) {
    const T = this.t;
    this.time += dt;
    this.deployTarget = (this.time - this.frontLastUse) < T.front.retract_delay_s ? 1 : 0;
    this.deploy = moveTowards(this.deploy, this.deployTarget, dt / T.front.deploy_time_s);
    this.flap = clamp(this.deploy / 0.45, 0, 1);
    this.extend = clamp((this.deploy - 0.35) / 0.65, 0, 1);
    const gRate = T.gimbal_rate_deg_s * DEG * dt;
    this.totalForce.set(0, 0, 0); this.totalTorque.set(0, 0, 0);
    for (const n of this.all) {
      if (n.front) n.pos.set(n.base.x, n.base.y, n.base.z + T.front.deploy_travel_m * this.extend);
      const avail = n.available(this.deploy);
      const wantPitch = clamp(n.cmdPitch - n.misPitch, n.pitchMin, n.pitchMax);
      const wantSide = clamp(n.cmdSide - n.misSide, -n.sideMax, n.sideMax);
      n.pitch = moveTowards(n.pitch, wantPitch, gRate);
      n.side = moveTowards(n.side, wantSide, gRate);
      const aimErr = Math.abs(n.pitch - wantPitch) + Math.abs(n.side - wantSide);
      const aimGate = aimErr < 0.35 ? 1 - aimErr / 0.35 * 0.85 : 0.15 * Math.max(0, 1 - (aimErr - 0.35) / 0.6);
      let target = avail > 0 ? clamp(n.cmdValve, 0, 1) * aimGate : 0;
      const rate = target > n.valve ? dt / T.valve_open_s : dt / T.valve_close_s;
      n.lastValve = n.valve;
      n.valve = moveTowards(n.valve, target, rate);
      if (n.valve > 0.02 && n.lastValve <= 0.02) n.puff = 1;
      else if (n.valve <= 0.02 && n.lastValve > 0.02) n.puff = -1;
      else n.puff = 0;
      thrustDir(n.front, n.pitch + n.misPitch, n.side + n.misSide, n.dir);
      const mag = n.valve * avail * n.groundGain;
      n.force.copy(n.dir).scale(mag);
      n.frost = clamp(n.frost + (n.valve * n.valve * dt) / 7 - dt / 26, 0, 1);
      this.totalForce.add(n.force);
      this._r.subVectors(n.pos, com);
      this._c.crossVectors(this._r, n.force);
      this.totalTorque.add(this._c);
    }
  }

  maxFront() { return this.front.reduce((s, n) => s + n.thrustMax * n.health * (n.attached ? 1 : 0), 0); }
  maxRear() { return this.rear.reduce((s, n) => s + n.thrustMax * n.health * (n.attached ? 1 : 0), 0); }
}
