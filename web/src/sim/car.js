// Roadster 88 car simulation: Rapier rigid body with raycast suspension, slip-based combined tyre model with implicit wheel spin, AWD powertrain (TC, ABS, regen, torque reallocation), aero and the thruster flight computer. Pure JS, Rapier is injected.
import { V3, Quat, clamp, smoothstep, moveTowards, DEG, MPH, yawOf } from './math.js';
import { Thrusters } from './thrusters.js';
import { FlightComputer } from './flight.js';

export const GROUP = { STATIC: 0x0001, CAR: 0x0002, PROP: 0x0004, DEBRIS: 0x0008 };
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const WHEEL_NAMES = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'];

export function carHull(tu, crush) {
  const c = tu.car, B = c.collider_box, w = B.size[0] / 2;
  const cf = crush ? crush.front : 0, cr = crush ? crush.rear : 0, cl = crush ? crush.left : 0, cri = crush ? crush.right : 0, top = crush ? crush.roof : 0;
  const zf = B.center[2] + B.size[2] / 2 - cf, zr = B.center[2] - B.size[2] / 2 + cr, wl = w - cl, wr = -(w - cri);
  const yb = B.center[1] - B.size[1] / 2, yt = B.center[1] + B.size[1] / 2;
  const ax = c.wheelbase / 2;
  const body = [
    [wl * 0.86, yb + 0.03, zf], [wr * 0.86, yb + 0.03, zf], [wl * 0.86, yb + 0.3, zf - 0.04], [wr * 0.86, yb + 0.3, zf - 0.04],
    [wl, yb, Math.min(zf, ax + 0.3)], [wr, yb, Math.min(zf, ax + 0.3)], [wl, yt - 0.18, Math.min(zf - 0.5, ax - 0.2)], [wr, yt - 0.18, Math.min(zf - 0.5, ax - 0.2)],
    [wl, yb, Math.max(zr, -ax - 0.35)], [wr, yb, Math.max(zr, -ax - 0.35)], [wl, yt - 0.1, Math.max(zr + 0.45, -ax - 0.2)], [wr, yt - 0.1, Math.max(zr + 0.45, -ax - 0.2)],
    [wl * 0.92, yb + 0.08, zr], [wr * 0.92, yb + 0.08, zr], [wl * 0.92, yt - 0.16, zr + 0.05], [wr * 0.92, yt - 0.16, zr + 0.05],
  ];
  const ct = c.height - top;
  const cabin = [
    [0.72, yt - 0.2, 0.8], [-0.72, yt - 0.2, 0.8], [0.6, ct - 0.08, 0.0], [-0.6, ct - 0.08, 0.0],
    [0.56, ct - 0.02, -0.6], [-0.56, ct - 0.02, -0.6], [0.7, yt - 0.1, -1.65], [-0.7, yt - 0.1, -1.65],
    [0.78, yt - 0.2, -0.4], [-0.78, yt - 0.2, -0.4],
  ];
  return { body: new Float32Array(body.flat()), cabin: new Float32Array(cabin.flat()) };
}

export class CarSim {
  constructor(R, world, tuning, opts = {}) {
    this.R = R; this.world = world; this.tu = tuning;
    const c = tuning.car, S = tuning.suspension, W = tuning.wheels;
    this.mass = c.mass;
    this.comLocal = new V3(c.com[0], c.com[1], c.com[2]);
    this.inertia = { pitch: c.inertia.pitch, yaw: c.inertia.yaw, roll: c.inertia.roll };
    const p = opts.position || [0, 0.05, 0], yaw = opts.yaw || 0;
    const q0 = new Quat().setFromYaw(yaw);
    const bd = R.RigidBodyDesc.dynamic().setTranslation(p[0], p[1], p[2]).setRotation({ x: q0.x, y: q0.y, z: q0.z, w: q0.w }).setCcdEnabled(true).setCanSleep(false);
    this.body = world.createRigidBody(bd);
    this.body.setAdditionalMassProperties(c.mass, { x: c.com[0], y: c.com[1], z: c.com[2] }, { x: c.inertia.pitch, y: c.inertia.yaw, z: c.inertia.roll }, { x: 0, y: 0, z: 0, w: 1 }, true);
    this.colliders = [];
    this.buildColliders(null);
    this.thrusters = new Thrusters(tuning);
    this.flight = new FlightComputer(tuning, this.thrusters);
    const wb = c.wheelbase / 2, g = tuning.gravity;
    const frontLoad = c.mass * g * ((wb + this.comLocal.z) / c.wheelbase) / 2, rearLoad = c.mass * g - frontLoad * 2;
    this.N0 = c.mass * g / 4;
    this.wheels = WHEEL_NAMES.map((name, i) => {
      const front = i < 2, left = i % 2 === 0;
      const r = front ? W.radius_front : W.radius_rear;
      const k = front ? S.spring_front : S.spring_rear;
      const load = front ? frontLoad : rearLoad / 2;
      const xs = load / k;
      const x = (left ? 1 : -1) * (front ? c.track_front : c.track_rear) / 2;
      const z = front ? wb : -wb;
      return {
        name, i, front, left, r, k, width: front ? W.width_front : W.width_rear,
        arb: front ? S.antiroll_front : S.antiroll_rear,
        local: new V3(x, r + S.rest_length - xs, z), hard: new V3(x, r + S.rest_length - xs, z),
        staticCompression: xs,
        inertia: W.inertia_each,
        compression: xs, prevCompression: xs, length: S.rest_length - xs, contact: false, load: 0,
        point: new V3(), normal: new V3(0, 1, 0), hitCollider: null, groundDist: 99,
        omega: 0, spin: 0, steer: 0, kappa: 0, alpha: 0, fx: 0, fy: 0, slip: 0, slipVel: 0,
        tc: 1, abs: 1, drive: 0, brake: 0,
        lost: false, toe: 0, camber: 0, hub: new V3(), bent: 0,
      };
    });
    this.steerAngle = 0;
    this.gear = 'D'; this.reverseHold = 0; this.parkedT = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, boost: false, lift: false, descend: false, pitch: 0, roll: 0 };
    this.pos = new V3(); this.q = new Quat(); this.vel = new V3(); this.angW = new V3(); this.angLocal = new V3(); this.comW = new V3();
    this.fwd = new V3(); this.up = new V3(); this.left = new V3();
    this.speed = 0; this.fwdSpeed = 0; this.latSpeed = 0; this.contacts = 0; this.clearance = 0;
    this.motorForce = 0; this.regenForce = 0; this.load = 0; this.motorRpm = 0; this.brakeOn = 0;
    this.wing = !!opts.wing;
    this.enabled = true; this.wreck = false;
    this.forceAcc = new V3(); this.torqueAcc = new V3();
    this.lastAccel = new V3(); this.prevVel = new V3();
    this.groundNozzleHits = [];
    this._a = new V3(); this._b = new V3(); this._c = new V3(); this._d = new V3(); this._e = new V3(); this._f = new V3(); this._g = new V3();
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.readState();
  }

  buildColliders(crush) {
    const R = this.R;
    for (const col of this.colliders) this.world.removeCollider(col, false);
    this.colliders = [];
    const h = carHull(this.tu, crush);
    const mk = (pts, fric) => {
      let d = R.ColliderDesc.convexHull(pts);
      if (!d) d = R.ColliderDesc.cuboid(0.98, 0.3, 2.0).setTranslation(0, 0.55, 0);
      d.setDensity(0).setFriction(fric).setRestitution(0.08).setCollisionGroups(groups(GROUP.CAR, GROUP.STATIC | GROUP.CAR | GROUP.PROP | GROUP.DEBRIS))
        .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(9000);
      const col = this.world.createCollider(d, this.body);
      col.userData = { kind: 'car', car: this };
      this.colliders.push(col);
    };
    mk(h.body, 0.45);
    mk(h.cabin, 0.4);
  }

  readState() {
    const b = this.body, t = b.translation(), r = b.rotation(), lv = b.linvel(), av = b.angvel();
    this.pos.set(t.x, t.y, t.z); this.q.set(r.x, r.y, r.z, r.w); this.vel.set(lv.x, lv.y, lv.z); this.angW.set(av.x, av.y, av.z);
    this.comW.copy(this.comLocal).applyQuat(this.q).add(this.pos);
    this.angLocal.copy(this.angW).applyQuatInv(this.q);
    this.fwd.set(0, 0, 1).applyQuat(this.q); this.up.set(0, 1, 0).applyQuat(this.q); this.left.set(1, 0, 0).applyQuat(this.q);
    this.speed = this.vel.len(); this.fwdSpeed = this.vel.dot(this.fwd); this.latSpeed = this.vel.dot(this.left);
  }

  toWorld(local, out) { return out.copy(local).applyQuat(this.q).add(this.pos); }

  setRay(o, d) {
    const r = this.ray;
    r.origin.x = o.x; r.origin.y = o.y; r.origin.z = o.z;
    r.dir.x = d.x; r.dir.y = d.y; r.dir.z = d.z;
  }

  addForceAt(F, p) {
    this.forceAcc.add(F);
    const r = this._g.subVectors(p, this.comW);
    this.torqueAcc.x += r.y * F.z - r.z * F.y; this.torqueAcc.y += r.z * F.x - r.x * F.z; this.torqueAcc.z += r.x * F.y - r.y * F.x;
  }

  steering(dt, inp) {
    const W = this.tu.wheels, sf = W.steer_speed_falloff;
    const v = Math.abs(this.fwdSpeed);
    const k = v <= sf.full_until ? 1 : v >= sf.at ? sf.min_factor : 1 - (1 - sf.min_factor) * (v - sf.full_until) / (sf.at - sf.full_until);
    let target = inp.steer * W.max_steer_deg * DEG * k;
    if (this.contacts >= 2 && v > 6) {
      const beta = Math.atan2(this.latSpeed, Math.abs(this.fwdSpeed));
      const dz = 5 * DEG;
      if (Math.abs(beta) > dz) target += clamp((beta - Math.sign(beta) * dz) * 0.55, -12 * DEG, 12 * DEG) * Math.sign(this.fwdSpeed);
    }
    target = clamp(target, -W.max_steer_deg * DEG, W.max_steer_deg * DEG);
    this.steerAngle = moveTowards(this.steerAngle, target, W.steer_rate_deg_s * DEG * dt);
    const d = this.steerAngle, L = this.tu.car.wheelbase, t = this.tu.car.track_front;
    for (const w of this.wheels) {
      if (!w.front) { w.steer = w.toe; continue; }
      let a = d;
      if (Math.abs(d) > 1e-4) {
        const Rr = L / Math.tan(Math.abs(d));
        const inner = (d > 0) === w.left;
        const ack = Math.atan(L / (Rr + (inner ? -t / 2 : t / 2)));
        a = Math.sign(d) * (Math.abs(d) + W.ackermann * (ack - Math.abs(d)));
      }
      w.steer = a + w.toe;
    }
  }

  suspension(dt) {
    const S = this.tu.suspension, R = this.R, world = this.world;
    const dir = this._a.copy(this.up).scale(-1);
    this.contacts = 0;
    let minClear = 99;
    for (const w of this.wheels) {
      w.hard.copy(w.local).add(w.hub);
      if (w.lost) { w.contact = false; w.load = 0; w.compression = 0; continue; }
      const o = this.toWorld(w.hard, this._b);
      this.setRay(o, dir);
      const maxLen = S.rest_length + w.r + 0.6;
      const hit = world.castRayAndGetNormal(this.ray, maxLen, true, undefined, groups(GROUP.CAR, GROUP.STATIC | GROUP.CAR | GROUP.PROP), undefined, this.body);
      w.prevCompression = w.compression;
      const toi = hit ? hit.timeOfImpact : maxLen;
      w.groundDist = toi - w.r - S.rest_length;
      minClear = Math.min(minClear, Math.max(0, w.groundDist));
      const len = toi - w.r;
      const x = S.rest_length - len;
      if (hit && x > 0) {
        w.contact = true; this.contacts++;
        w.compression = Math.min(x, S.rest_length + w.r);
        w.point.copy(o).addScaled(dir, toi);
        w.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        if (w.normal.dot(this.up) < 0) w.normal.scale(-1);
        w.hitCollider = hit.collider;
      } else {
        w.contact = false; w.compression = 0; w.hitCollider = null;
      }
      w.length = clamp(S.rest_length - w.compression, S.rest_length - S.travel - 0.05, S.rest_length);
    }
    this.clearance = minClear;
    if (this.contacts === 0) {
      this.setRay(this.comW, this._f.set(0, -1, 0));
      const hit = world.castRay(this.ray, 80, true, undefined, groups(GROUP.CAR, GROUP.STATIC), undefined, this.body);
      this.clearance = hit ? Math.max(minClear, hit.timeOfImpact - this.comLocal.y) : 80;
    }
    const forces = [0, 0, 0, 0];
    for (const w of this.wheels) {
      if (!w.contact) { forces[w.i] = 0; continue; }
      const x = w.compression, vx = (x - w.prevCompression) / dt;
      let F = w.k * x + (vx > 0 ? S.damper_bump : S.damper_rebound) * vx;
      if (x > S.travel) F += S.bump_stop_k * (x - S.travel) * (1 + Math.min(4, (x - S.travel) * 30)) + Math.max(0, vx) * S.damper_bump * 2;
      forces[w.i] = F;
    }
    for (const pair of [[0, 1], [2, 3]]) {
      const a = this.wheels[pair[0]], b = this.wheels[pair[1]];
      const d = (a.contact ? a.compression : 0) - (b.contact ? b.compression : 0);
      const f = a.arb * d;
      if (a.contact) forces[a.i] += f;
      if (b.contact) forces[b.i] -= f;
    }
    const F = this._c;
    for (const w of this.wheels) {
      w.load = w.contact ? Math.max(0, forces[w.i]) : 0;
      if (w.load > 0) { F.copy(this.up).scale(w.load); this.addForceAt(F, w.point); }
    }
  }

  gripPrepass() {
    const Ty = this.tu.tyres, ap = Ty.peak_slip_angle_deg * DEG;
    for (const w of this.wheels) {
      const N = w.load;
      const ls = clamp(1 - Ty.load_sensitivity * (N / this.N0 - 1), 0.7, 1.15);
      const camberK = 1 - Math.min(0.5, Math.abs(w.camber) * 2.5);
      w.muX = Ty.mu_long * ls * camberK; w.muY = Ty.mu_lat * ls * camberK;
      w.sy = w.alpha / ap;
    }
  }

  wheelCap(w, kappa) {
    if (w.lost || !w.contact || w.load <= 0) return 0;
    const Ty = this.tu.tyres, sx = kappa / Ty.peak_slip_ratio;
    const c = tyreCurve(Ty, sx, w.sy);
    return c.s > 1e-6 ? w.muX * w.load * c.f * Math.abs(sx) / c.s : 0;
  }

  powertrain(dt, inp) {
    const P = this.tu.powertrain;
    const v = this.fwdSpeed, grounded = this.contacts > 0;
    const still = Math.abs(v) < 0.6;
    let drive = 0, brake = 0;
    if (this.gear === 'D') {
      drive = inp.throttle; brake = inp.brake;
      if (inp.brake && !inp.throttle && still && !inp.boost) { this.reverseHold += dt; if (this.reverseHold > 0.18) { this.gear = 'R'; this.reverseHold = 0; } } else this.reverseHold = 0;
    } else {
      drive = inp.brake; brake = inp.throttle;
      if (inp.throttle && !inp.brake && still) { this.reverseHold += dt; if (this.reverseHold > 0.12) { this.gear = 'D'; this.reverseHold = 0; } } else if (!inp.throttle) this.reverseHold = 0;
    }
    if (inp.boost && inp.brake && this.gear === 'D') drive = 0;
    const dirSign = this.gear === 'D' ? 1 : -1;
    const sp = Math.abs(v);
    let F = drive * P.max_wheel_force;
    F = Math.min(F, P.max_power_kw * 1000 / Math.max(sp, 0.5));
    const limit = this.gear === 'D' ? P.limiter_mph * MPH : P.reverse_max_mph * MPH;
    F *= clamp((limit - sp) / (1.2 * MPH), 0, 1);
    let regen = 0;
    if (!drive && !brake && this.gear === 'D' && v > 0) regen = P.regen_force * smoothstep(0.4, 4, v);
    if (!drive && !brake && this.gear === 'R' && v < 0) regen = P.regen_force * 0.5 * smoothstep(0.4, 3, -v);
    this.motorForce = F * dirSign; this.regenForce = regen; this.load = drive;
    const ws = this.wheels;
    this.gripPrepass();
    const steerAmt = Math.abs(inp.steer);
    const slide = steerAmt * (1 - smoothstep(5, 16, sp));
    const tcK = 1 + 0.15 * slide;
    const aFwd = Math.max(0, this.lastAccel.dot(this.fwd));
    for (const w of ws) w.cap = this.wheelCap(w, P.traction_control) * tcK + w.inertia * aFwd / (w.r * w.r) + (w.contact ? 0 : 1e9);
    const capF = ws[0].cap + ws[1].cap, capR = ws[2].cap + ws[3].cap;
    let Ff = F * P.front_share, Fr = F * (1 - P.front_share);
    if (Ff > capF) { Fr += Ff - capF; Ff = capF; }
    if (Fr > capR) { Ff = Math.min(capF, Ff + Fr - capR); Fr = capR; }
    const rf = P.front_share, bfs = P.brake_front_share;
    const held = this.gear === 'D' && !drive && !inp.boost && still && grounded;
    if (held) this.parkedT += dt; else this.parkedT = 0;
    this.brakeOn = brake > 0 || held ? 1 : 0;
    for (const w of ws) {
      if (w.lost) { w.drive = 0; w.brake = 0; w.regen = 0; continue; }
      const mate = ws[w.i ^ 1];
      const axF = w.front ? Ff : Fr;
      const share = mate.lost ? 1 : (w.cap + mate.cap > 0 ? w.cap / (w.cap + mate.cap) : 0.5);
      const fw = Math.min(axF * (mate.lost ? 1 : 0.5), w.cap);
      const fw2 = Math.min(axF * share, w.cap);
      w.drive = dirSign * Math.max(fw, fw2) * w.r;
      const n = mate.lost ? 1 : 2;
      w.regen = regen * (w.front ? rf : 1 - rf) / n * w.r;
      w.brake = (brake * P.brake_force * (w.front ? bfs : 1 - bfs) / n + (held ? P.brake_force * 0.25 : 0)) * w.r;
    }
    const mr = Math.abs(this.wheels[2].omega * this.wheels[2].r);
    this.motorRpm = mr * P.motor_rpm_per_mps;
  }

  tyres(dt) {
    const Ty = this.tu.tyres, P = this.tu.powertrain;
    const kp = Ty.peak_slip_ratio, ap = Ty.peak_slip_angle_deg * DEG;
    const NS = 4, h = dt / NS;
    let Nsum = 0; for (const w of this.wheels) Nsum += w.load;
    const fwdW = this._a, latW = this._b, vc = this._c, r = this._d, F = this._e;
    const sp = Math.abs(this.fwdSpeed);
    const tcLimit = P.traction_control * (1 + 2.5 * Math.abs(this.input.steer) * (1 - smoothstep(5, 16, sp))) + 0.06;
    for (const w of this.wheels) {
      if (w.lost) continue;
      const I = w.inertia;
      if (!w.contact || w.load <= 0) {
        let om = w.omega + dt * (w.drive * 0.25) / I;
        const rg = (w.regen || 0) + w.brake;
        const dec = dt * rg / I;
        om = Math.abs(om) <= dec ? 0 : om - Math.sign(om) * dec;
        w.omega = om * (1 - 0.15 * dt);
        w.spin += w.omega * dt; w.fx = 0; w.fy = 0; w.kappa = 0; w.slip = 0; w.slipVel = 0;
        w.alpha *= 0.9; w.tc = 1;
        continue;
      }
      const n = w.normal;
      const s = Math.sin(w.steer), c = Math.cos(w.steer);
      fwdW.set(s, 0, c).applyQuat(this.q);
      fwdW.addScaled(n, -fwdW.dot(n)).normalize();
      latW.crossVectors(n, fwdW);
      r.subVectors(w.point, this.comW);
      vc.crossVectors(this.angW, r).add(this.vel);
      const vLong = vc.dot(fwdW), vLat = vc.dot(latW);
      const N = w.load;
      const muX = w.muX, muY = w.muY;
      const alphaSS = Math.atan2(vLat, Math.max(Math.abs(vLong), 2.0));
      w.alpha += (alphaSS - w.alpha) * Math.min(1, (Math.abs(vLong) + 4) * dt / Ty.relaxation_length);
      const sy = w.alpha / ap;
      const mw = Math.max(80, this.mass * N / Math.max(1, Nsum));
      let vl = vLong, fxSum = 0, kap = 0, fyLast = 0;
      for (let k = 0; k < NS; k++) {
        const vden = Math.max(Math.abs(vl), 3);
        kap = (w.omega * w.r - vl) / vden;
        const sx = kap / kp;
        const cv = tyreCurve(Ty, sx, sy);
        const fx = cv.s > 1e-6 ? muX * N * cv.f * sx / cv.s : 0;
        fyLast = cv.s > 1e-6 ? -muY * N * cv.f * sy / cv.s : 0;
        const keff = muX * N * Math.max(0.05, cv.slope) / kp;
        const dirD = Math.sign(w.drive) || 1;
        if (w.drive !== 0 && dirD * kap > tcLimit) w.tc = Math.max(0.05, w.tc - h * 12 * (dirD * kap / tcLimit - 0.9));
        else w.tc = Math.min(1, w.tc + h * 4);
        if (w.brake > 0 && kap < -0.14) w.abs = Math.max(0.15, w.abs - h * 40);
        else w.abs = Math.min(1, w.abs + h * 12);
        const denom = I + h * w.r * w.r * keff / vden;
        let om = w.omega + h * (w.drive * w.tc - w.r * fx) / denom;
        const bt = w.brake * w.abs + (w.regen || 0) * w.abs;
        if (bt > 0) {
          const dec = h * bt / denom;
          om = Math.abs(om) <= dec ? 0 : om - Math.sign(om) * dec;
        }
        w.omega = om;
        fxSum += fx;
        vl += fx * h / mw;
      }
      let Fx = fxSum / NS;
      Fx -= Ty.rolling_resistance * N * smoothstep(0, 0.6, Math.abs(vLong)) * Math.sign(vLong);
      const Fy = fyLast - N * 0.35 * w.camber;
      w.kappa = kap; w.fx = Fx; w.fy = Fy;
      w.slipVel = Math.hypot(w.omega * w.r - vLong, vLat);
      w.slip = clamp(Math.hypot(kap / kp, w.alpha / ap) - 1, 0, 3);
      w.spin += w.omega * dt;
      F.copy(fwdW).scale(Fx).addScaled(latW, Fy);
      this.addForceAt(F, w.point);
    }
  }

  aero() {
    const A = this.tu.aero, rho = this.tu.air_density;
    const v = this.vel, sp = this.speed;
    const F = this._a;
    const cd = A.cd_a + (this.wing ? A.wing_drag_a : 0);
    F.copy(v).scale(-0.5 * rho * cd * sp);
    this.addForceAt(F, this.comW);
    const vf = Math.max(0, this.fwdSpeed);
    const q = 0.5 * rho * vf * vf;
    if (A.lift_a) { F.copy(this.up).scale(q * A.lift_a); this.addForceAt(F, this.comW); }
    if (this.wing) { F.copy(this.up).scale(-q * A.wing_downforce_a); this.addForceAt(F, this.toWorld(this._b.set(0, 0.9, -1.85), this._b)); }
    const ad = A.angular_drag, wl = this.angLocal;
    const t = this._c.set(-ad[0] * wl.x, -ad[1] * wl.y, -ad[2] * wl.z).applyQuat(this.q);
    this.torqueAcc.add(t);
  }

  thrust(dt, inp) {
    const th = this.thrusters;
    const comL = this.comLocal;
    this.flight.update(dt, inp, { q: this.q, vel: this.vel, speed: this.speed, fwdSpeed: this.fwdSpeed, angLocal: this.angLocal, mass: this.mass, inertia: this.inertia, com: comL, contacts: this.contacts, clearance: this.clearance });
    const ge = this.tu.thrusters.ground_effect;
    const o = this._a, d = this._b;
    for (const n of th.all) {
      n.groundGain = 1; n.groundDist = 99;
      if (!n.attached || n.valve < 0.01) continue;
      this.toWorld(n.pos, o);
      d.copy(n.dir).scale(-1).applyQuat(this.q);
      if (d.y > -0.2) continue;
      this.setRay(o, d);
      const hit = this.world.castRay(this.ray, ge.height * 2.5, true, undefined, groups(GROUP.CAR, GROUP.STATIC), undefined, this.body);
      if (hit) {
        n.groundDist = hit.timeOfImpact;
        if (hit.timeOfImpact < ge.height) n.groundGain = 1 + ge.boost * (1 - hit.timeOfImpact / ge.height) * -d.y;
      }
    }
    th.update(dt, comL);
    const F = this._c.copy(th.totalForce).applyQuat(this.q);
    const T = this._d.copy(th.totalTorque).applyQuat(this.q);
    this.forceAcc.add(F); this.torqueAcc.add(T);
  }

  preStep(dt, inp) {
    this.readState();
    this.forceAcc.set(0, 0, 0); this.torqueAcc.set(0, 0, 0);
    if (!this.enabled) return;
    if (this.wreck) inp = WRECK_INPUT;
    this.input = inp;
    this.steering(dt, inp);
    this.suspension(dt);
    this.powertrain(dt, inp);
    this.tyres(dt);
    this.aero();
    this.thrust(dt, inp);
    const J = this._a.copy(this.forceAcc).scale(dt), Jt = this._b.copy(this.torqueAcc).scale(dt);
    this.body.applyImpulse({ x: J.x, y: J.y, z: J.z }, true);
    this.body.applyTorqueImpulse({ x: Jt.x, y: Jt.y, z: Jt.z }, true);
  }

  postStep(dt) {
    this.prevVel.copy(this.vel);
    this.readState();
    this.lastAccel.subVectors(this.vel, this.prevVel).scale(1 / dt);
  }

  yaw() { return yawOf(this.q); }
  mph() { return this.speed / MPH; }

  teleport(p, yaw, v = 0) {
    const q = new Quat().setFromYaw(yaw);
    this.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: Math.sin(yaw) * v, y: 0, z: Math.cos(yaw) * v }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const w of this.wheels) { w.omega = v / w.r; w.compression = w.staticCompression; w.prevCompression = w.staticCompression; }
    this.readState();
  }

  destroy() {
    this.world.removeRigidBody(this.body);
    this.enabled = false;
  }
}

const CURVE = { f: 0, slope: 0, s: 0 };
export function tyreCurve(Ty, sx, sy) {
  const s = Math.hypot(sx, sy);
  CURVE.s = s;
  if (s < 1e-6) { CURVE.f = 0; CURVE.slope = 2; return CURVE; }
  if (s <= 1) { CURVE.f = s * (2 - s); CURVE.slope = 2 - 2 * s; return CURVE; }
  const fall = (Ty.falloff_long * sx * sx + Ty.falloff_lat * sy * sy) / (s * s);
  const u = (s - 1) * 1.5;
  CURVE.f = fall + (1 - fall) / (1 + u * u); CURVE.slope = 0;
  return CURVE;
}

const WRECK_INPUT = { throttle: 0, brake: 1, steer: 0, boost: false, lift: false, descend: false, pitch: 0, roll: 0 };
