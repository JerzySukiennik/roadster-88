// Roadster 88 flight computer: maps player intent to thrust (ground boost, retro, hop, hover, ballistic air, microgravity in space) and runs flight assist (attitude hold, rate damping, retrograde turn in space) through the control allocator.
import { V3, Quat, clamp, smoothstep, DEG, MPH } from './math.js';
import { Allocator } from './allocator.js';

export const SPACE = { yaw: 45, pitch: 50, roll: 80, kd: 6.0, kp: 2.4, main: 0.55, lift: 0.6, minSpeed: 0.25, fine: 2.5, fineBelow: 0.05 };

export class FlightComputer {
  constructor(tuning, thrusters) {
    this.tu = tuning; this.T = tuning.thrusters; this.F = tuning.flight_assist;
    this.th = thrusters;
    this.alloc = new Allocator(thrusters);
    this.mode = 'ground';
    this.assist = this.F.enabled_default;
    this.liftHeld = 0; this.hopT = 0; this.hopReady = 0; this.groundedT = 0; this.airT = 0;
    this.prevLift = false;
    this.wantF = new V3(); this.wantT = new V3();
    this.debug = { vzCmd: 0, yawCmd: 0, err: new V3() };
    this._q = new Quat(); this._q2 = new Quat(); this._e = new V3(); this._v = new V3(); this._fw = new V3(); this._up = new V3(); this._fwd = new V3(); this._lf = new V3();
  }

  update(dt, inp, s) {
    if (s.space) { this.spaceUpdate(dt, inp, s); return; }
    const T = this.T, F = this.F, th = this.th;
    const g = this.tu.gravity, m = s.mass;
    const grounded = s.contacts >= 2;
    if (grounded) { this.groundedT += dt; this.airT = 0; } else { this.airT += dt; this.groundedT = 0; }
    const liftEdge = inp.lift && !this.prevLift;
    this.prevLift = inp.lift;
    if (inp.lift) this.liftHeld += dt; else this.liftHeld = 0;

    if (this.mode === 'ground' || this.mode === 'ballistic') {
      if (liftEdge && grounded) { this.mode = 'hop'; this.hopT = 0; this.hopReady = 0; }
      else if (!grounded && this.assist && (inp.lift || inp.descend) && this.airT > 0.05) this.mode = 'hover';
      else if (!grounded && !this.assist && inp.lift) this.mode = 'hop';
    }
    if (this.mode === 'hop') {
      this.hopT += dt;
      th.requestFront();
      if (th.deploy >= 0.5 || th.maxFront() <= 0) this.hopReady += dt;
      if (this.assist && inp.lift && this.liftHeld >= T.hover_engage_s) this.mode = 'hover';
      else if (!inp.lift && this.hopReady >= T.hop_tap_max_s) this.mode = grounded ? 'ground' : 'ballistic';
      else if (!this.assist && !inp.lift && this.hopReady >= T.hop_tap_max_s) this.mode = 'ballistic';
    }
    if (this.mode === 'hover' && !this.assist) this.mode = grounded ? 'ground' : 'ballistic';
    if (this.mode === 'hover' && grounded && this.groundedT > 0.25 && !inp.lift) this.mode = 'ground';
    if (this.mode === 'ballistic' && grounded && this.groundedT > 0.05) this.mode = 'ground';
    if (this.mode === 'ground' && !grounded && this.airT > 0.12) this.mode = 'ballistic';

    const q = s.q;
    const up = this._up.set(0, 1, 0);
    const fwdW = this._fwd.set(0, 0, 1).applyQuat(q);
    const fh = Math.hypot(fwdW.x, fwdW.z) > 1e-3 ? this._lf.set(fwdW.x, 0, fwdW.z).normalize() : this._lf.set(0, 0, 1);
    const v = s.vel;
    const mph = s.speed / MPH;
    const gov = clamp((F.air_speed_governor_mph[1] - mph) / (F.air_speed_governor_mph[1] - F.air_speed_governor_mph[0]), 0, 1);
    const rearMax = th.maxRear(), frontMax = th.maxFront();
    const fw = this._fw.set(0, 0, 0);
    let useAlloc = false, attitude = false, direct = false;

    if (this.mode === 'ground') {
      direct = true;
      const boost = inp.boost && !inp.brake;
      const retro = inp.boost && inp.brake;
      for (const n of th.rear) { n.cmdPitch = 0; n.cmdSide = 0; n.cmdValve = boost ? gov : 0; }
      if (retro) th.requestFront();
      for (const n of th.front) { n.cmdPitch = 0; n.cmdSide = 0; n.cmdValve = retro && s.fwdSpeed > 0.5 ? 1 : 0; }
      for (const n of th.side) { n.cmdPitch = 0; n.cmdSide = 0; n.cmdValve = 0; }
      if (!boost && !retro) this.alloc.clear();
    } else if (this.mode === 'hop') {
      useAlloc = true; attitude = this.assist;
      th.requestSide();
      fw.copy(up).scale(rearMax + frontMax);
      if (inp.throttle || inp.boost) fw.addScaled(fh, (inp.boost ? 1 : 0.5) * rearMax * gov);
    } else if (this.mode === 'hover') {
      useAlloc = true; attitude = true;
      th.requestFront(); th.requestSide();
      let vzCmd = inp.lift ? F.climb_rate : inp.descend ? -F.descend_rate : 0;
      if (inp.descend && s.clearance < 3) vzCmd = Math.max(vzCmd, -(0.7 + s.clearance * 1.6));
      this.debug.vzCmd = vzCmd;
      const az = clamp(3.2 * (vzCmd - v.y), -g * 0.9, 16);
      const tilt = Math.max(0.5, (this._v.set(0, 1, 0).applyQuat(q)).y);
      fw.y = m * (g + az) / tilt;
      const vh = Math.hypot(v.x, v.z);
      if (inp.boost) fw.addScaled(fh, rearMax * gov);
      else if (inp.throttle) fw.addScaled(fh, rearMax * 0.75 * gov);
      else if (inp.brake) fw.addScaled(fh, -frontMax * 0.75);
      else if (this.assist && vh > 0.05) {
        const fade = 1 - smoothstep(18, 30, vh);
        const a = Math.min(3.0, 0.9 * vh) * fade;
        fw.x -= v.x / vh * a * m; fw.z -= v.z / vh * a * m;
      }
      if (this.assist) this.grip(fw, v, fh, m);
    } else if (this.mode === 'ballistic') {
      attitude = this.assist;
      if (inp.boost) fw.addScaled(fh, rearMax * gov);
      else if (inp.throttle) fw.addScaled(fh, rearMax * 0.75 * gov);
      else if (inp.brake) fw.addScaled(fh, -frontMax * 0.75);
      if (this.assist) this.grip(fw, v, fh, m);
      if (inp.brake) th.requestFront();
      const anyRot = inp.steer || inp.pitch || inp.roll;
      useAlloc = attitude || fw.lenSq() > 0 || anyRot;
      if (useAlloc) th.requestSide();
    }

    this.wantT.set(0, 0, 0);
    if (useAlloc) {
      const w = s.angLocal, I = s.inertia;
      const yawCmd = inp.steer * F.yaw_rate_deg_s * DEG;
      this.debug.yawCmd = yawCmd;
      if (attitude) {
        const yaw = Math.atan2(fwdW.x, fwdW.z);
        this._q2.setFromEulerYXZ(inp.pitch * F.max_pitch_deg * DEG, yaw, inp.roll * F.max_roll_deg * DEG);
        this._q.copy(q).conjugate().multiply(this._q2);
        const e = this._q.toAxisAngleVec(this._e);
        this.debug.err.copy(e);
        const kp = F.attitude_kp, kd = F.rate_kd;
        this.wantT.x = I.pitch * (kp * e.x - kd * w.x);
        this.wantT.z = I.roll * (kp * e.z - kd * w.z);
        this.wantT.y = I.yaw * (kd * 1.6 * (yawCmd - w.y)) + this.tu.aero.angular_drag[1] * w.y;
        if (this.mode === 'hop' && grounded) { this.wantT.x *= 0.6; this.wantT.z *= 0.6; this.wantT.y *= 0.3; }
      } else {
        const k = 4;
        if (inp.pitch) this.wantT.x = I.pitch * k * (inp.pitch * F.manual_rate_deg_s.pitch * DEG - w.x);
        if (inp.roll) this.wantT.z = I.roll * k * (inp.roll * F.manual_rate_deg_s.roll * DEG - w.z);
        if (inp.steer) this.wantT.y = I.yaw * k * (yawCmd - w.y);
      }
      this.wantF.copy(fw).applyQuatInv(q);
      this.alloc.solve(this.wantF, this.wantT, s.com);
    } else if (!direct) {
      this.alloc.clear();
    }
  }

  spaceUpdate(dt, inp, s) {
    const th = this.th, I = s.inertia, w = s.angLocal, S = SPACE;
    this.mode = 'space'; this.prevLift = inp.lift; this.airT += dt; this.groundedT = 0; this.retro = -1;
    if (inp.park) { this.alloc.clear(); return; }
    th.requestFront(); th.requestSide();
    const fw = this._fw.set(0, 0, 0);
    if (inp.boost || inp.throttle) fw.z = th.maxRear() * (inp.boost ? 1 : S.main);
    if (inp.lift) fw.y = th.maxSide() * S.lift;
    const cmd = this._e.set(inp.pitch * S.pitch * DEG, inp.steer * S.yaw * DEG, inp.roll * S.roll * DEG);
    const free = this._v.set(inp.pitch ? 1 : 0, inp.steer ? 1 : 0, inp.roll ? 1 : 0);
    if (inp.brake && s.speed > S.minSpeed) {
      const d = this._lf.copy(s.vel).applyQuatInv(s.q).scale(-1 / s.speed);
      const yawErr = Math.atan2(d.x, d.z), pitchErr = -Math.atan2(d.y, Math.hypot(d.x, d.z));
      this.retro = Math.acos(clamp(d.z, -1, 1));
      if (!inp.pitch) { cmd.x = clamp(pitchErr * S.kp * (Math.abs(yawErr) < 1.2 ? 1 : 0.25), -S.pitch * DEG, S.pitch * DEG); free.x = 1; }
      if (!inp.steer) { cmd.y = clamp(yawErr * S.kp, -S.yaw * DEG, S.yaw * DEG); free.y = 1; }
      if (fw.z > 0) fw.z *= clamp((0.6 - this.retro) / 0.4, 0, 1) * clamp(s.speed / 2.5, 0.12, 1);
    } else if (inp.brake && fw.z > 0) fw.z = 0;
    const k = this.assist ? S.kd : 4;
    const want = this.wantT.set(0, 0, 0);
    if (this.assist || free.x) want.x = I.pitch * k * (cmd.x - w.x);
    if (this.assist || free.y) want.y = I.yaw * k * (cmd.y - w.y);
    if (this.assist || free.z) want.z = I.roll * k * (cmd.z - w.z);
    this.debug.yawCmd = cmd.y;
    const fine = this.fineT || (this.fineT = new V3());
    fine.set(0, 0, 0);
    if (this.assist) {
      const e = this._er || (this._er = new V3());
      e.set(cmd.x - w.x, cmd.y - w.y, cmd.z - w.z);
      if (Math.abs(e.x) < S.fineBelow) fine.x = I.pitch * S.fine * e.x;
      if (Math.abs(e.y) < S.fineBelow) fine.y = I.yaw * S.fine * e.y;
      if (Math.abs(e.z) < S.fineBelow) fine.z = I.roll * S.fine * e.z;
    }
    if (!this.assist && !free.x && !free.y && !free.z && fw.lenSq() === 0) { this.alloc.clear(); return; }
    this.wantF.copy(fw);
    this.alloc.solve(this.wantF, this.wantT, s.com);
  }

  grip(fw, v, fh, m) {
    const along = v.x * fh.x + v.z * fh.z;
    const lx = v.x - fh.x * along, lz = v.z - fh.z * along;
    const ll = Math.hypot(lx, lz);
    if (ll < 0.05) return;
    const a = Math.min(16, (this.tu.flight_assist.lateral_grip || 4.5) * ll);
    fw.x -= lx / ll * a * m; fw.z -= lz / ll * a * m;
  }
}
