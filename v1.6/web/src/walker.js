// Roadster 88 on foot: the driver's avatar as a Rapier kinematic character (walk, run, jump, slopes and steps, swimming, knock-back when a car hits it), camera-relative controls, deadly car hits, falls, lava and drowning, and getting in and out of any free Roadster.
import { GROUP, groups } from './sim/car.js';

const WALK = 1.3, RUN = 5.8, SWIM = 1.4, JUMP = 4.6, G = 9.81, RADIUS = 0.3, HALF = 0.58;
const LETHAL_HIT = 13, LETHAL_FALL = 15.5, DROWN = 6;
const PARKED = { throttle: 0, brake: 1, steer: 0, boost: false, lift: false, descend: false, pitch: 0, roll: 0, park: true };

export class Walker {
  constructor(game) {
    this.g = game; this.R = game.R; this.world = game.phys.world;
    this.active = false;
    this.pos = { x: 0, y: 0, z: 0 }; this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.speed = 0; this.phase = 0; this.grounded = true; this.air = 0; this.tumble = 0;
    this.dead = false; this.dying = null; this.swim = false; this.wet = 0; this.lock = 0;
    this.prev = { x: 0, y: 0, z: 0 }; this.curr = { x: 0, y: 0, z: 0 }; this.pose = { x: 0, y: 0, z: 0 };
    this.body = null; this.collider = null;
    this.ctl = this.world.createCharacterController(0.03);
    this.ctl.setUp({ x: 0, y: 1, z: 0 });
    this.ctl.setMaxSlopeClimbAngle(52 * Math.PI / 180);
    this.ctl.setMinSlopeSlideAngle(60 * Math.PI / 180);
    this.ctl.enableAutostep(0.45, 0.2, false);
    this.ctl.enableSnapToGround(0.45);
    this.ctl.setApplyImpulsesToDynamicBodies(true);
    this.parked = PARKED;
  }

  build(x, y, z) {
    const R = this.R;
    if (!this.body) {
      this.body = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + HALF + RADIUS, z));
      const d = R.ColliderDesc.capsule(HALF, RADIUS).setCollisionGroups(groups(GROUP.WALKER, GROUP.STATIC)).setFriction(0.6);
      this.collider = this.world.createCollider(d, this.body);
      this.collider.userData = { kind: 'walker' };
    }
    this.body.setEnabled(true);
    this.body.setTranslation({ x, y: y + HALF + RADIUS, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + HALF + RADIUS, z });
  }

  enter(x, y, z, yaw) {
    this.build(x, y, z);
    this.active = true; this.yaw = yaw; this.speed = 0; this.phase = 0; this.tumble = 0;
    this.dead = false; this.dying = null; this.swim = false; this.wet = 0; this.lock = 0;
    this.vel.x = this.vel.y = this.vel.z = 0;
    for (const k of ['prev', 'curr', 'pose']) Object.assign(this[k], { x, y, z });
    Object.assign(this.pos, { x, y, z });
  }

  leave() {
    this.active = false;
    if (this.body) this.body.setEnabled(false);
  }

  nearestCar() {
    let best = null, bd = 3.2;
    for (const c of this.g.cars) {
      if (!c.sim.enabled) continue;
      const s = c.sim, dx = s.pos.x - this.pos.x, dz = s.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) - 1.2;
      if (d < bd && Math.abs(s.pos.y - this.pos.y) < 2.5 && s.up.y > 0.5) { bd = d; best = c; }
    }
    return best;
  }

  die(cause, src) {
    if (this.dead) return;
    this.dead = true; this.dying = null; this.lock = 99;
    if (this.g.player) this.g.player.died(cause, src);
  }

  step(dt, input, camYaw) {
    if (!this.active) return;
    const I = input, V = this.g.valley;
    const D = this.g.driver, alock = D && D.anim && D.motionOn ? D.anim.lock : 0;
    const free = !this.dead && this.tumble <= 0 && this.lock <= 0 && alock <= 0;
    let mx = (I.is('KeyD') || I.is('ArrowRight') ? 1 : 0) - (I.is('KeyA') || I.is('ArrowLeft') ? 1 : 0);
    let mz = (I.is('KeyW') || I.is('ArrowUp') ? 1 : 0) - (I.is('KeyS') || I.is('ArrowDown') ? 1 : 0);
    if (!free) mx = mz = 0;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const run = I.is('ShiftLeft') || I.is('ShiftRight');
    const liq = V && V.fluidAt ? V.fluidAt(this.pos.x, this.pos.z) : null;
    const depth = liq ? liq.level - V.heightAt(this.pos.x, this.pos.z) : 0;
    if (liq && liq.kind === 'lava' && this.pos.y < liq.level + 0.25 && !this.dead) this.die('lava');
    this.swim = !!(liq && liq.kind !== 'lava' && depth > 1.45 && this.pos.y < liq.level - 0.9);
    const target = (this.swim ? SWIM : run ? RUN : WALK) * Math.min(1, ml);
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const wx = fx * mz - fz * mx, wz = fz * mz + fx * mx;
    const wl = Math.hypot(wx, wz);
    if (this.tumble > 0) this.tumble = Math.max(0, this.tumble - dt);
    this.lock = Math.max(0, this.lock - dt);
    const control = this.tumble > 0 ? 0.05 : this.swim ? 0.5 : this.grounded ? 1 : 0.25;
    const want = wl > 1e-3 && free ? target : 0;
    const dirX = wl > 1e-3 ? wx / wl : 0, dirZ = wl > 1e-3 ? wz / wl : 0;
    const k = Math.min(1, dt * (this.grounded || this.swim ? 10 : 2.5) * control);
    const stop = this.dead && this.grounded ? Math.min(1, dt * 6) : 0;
    this.vel.x += (dirX * want - this.vel.x) * Math.max(k, stop);
    this.vel.z += (dirZ * want - this.vel.z) * Math.max(k, stop);
    if (wl > 1e-3 && free) {
      const ty = Math.atan2(dirX, dirZ);
      let d = ty - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * (run ? 9 : 7));
    }
    if (this.swim) {
      const sy = liq.level - 1.3;
      this.vel.y += ((sy - this.pos.y) * 4 - this.vel.y) * Math.min(1, dt * 3);
      this.wet += dt;
      if (this.wet > DROWN && !this.dead) this.die('water');
    } else {
      this.wet = Math.max(0, this.wet - dt * 2);
      if (this.grounded && I.hit('Space') && free) { this.vel.y = JUMP; this.grounded = false; }
      this.vel.y -= G * (this.vel.y < 0 ? 1.45 : 1) * dt;
    }
    if (!this.dead) this.knock();
    const fallV = this.vel.y;
    const t = this.body.translation();
    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.ctl.computeColliderMovement(this.collider, desired, undefined, groups(GROUP.WALKER, GROUP.STATIC | GROUP.CAR | GROUP.PROP | GROUP.DEBRIS | GROUP.WALKER));
    const m = this.ctl.computedMovement();
    const nx = t.x + m.x, ny = t.y + m.y, nz = t.z + m.z;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    const was = this.grounded;
    this.grounded = this.ctl.computedGrounded() && !this.swim;
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    if (!was && this.grounded) {
      if (this.dying) this.die(this.dying.cause, this.dying.src);
      else if (fallV < -LETHAL_FALL) this.die('fall');
      else if (this.air > 0.5 && this.g.audio) this.g.audio.play('suspension_thump', { gain: Math.min(0.9, 0.25 + Math.max(0, -fallV - 6) * 0.06), pos: { x: nx, y: ny, z: nz } });
      if (!this.dead && fallV < -9) { this.lock = Math.max(this.lock, 0.45); if (this.g.rig) this.g.rig.addImpact(Math.min(1, (-fallV - 8) / 8)); }
    }
    this.air = this.grounded ? 0 : this.air + dt;
    if (Math.abs(m.y - desired.y) > 1e-4 && desired.y > 0 && m.y < desired.y * 0.5) this.vel.y = Math.min(this.vel.y, 0);
    this.speed = this.dead ? 0 : Math.hypot(this.vel.x, this.vel.z);
    Object.assign(this.prev, this.curr);
    Object.assign(this.curr, { x: nx, y: ny - HALF - RADIUS, z: nz });
    Object.assign(this.pos, this.curr);
    if (this.pos.y < -200) { const s = this.g.groundHeight(this.pos.x, this.pos.z, 500); this.enter(this.pos.x, (s ?? 0) + 0.5, this.pos.z, this.yaw); }
  }

  knock() {
    const list = this.g.cars.map((c) => (c.sim.enabled ? c.sim : null)).filter(Boolean);
    if (this.g.online) list.push(...this.g.online.carStates());
    if (this.g.life && this.g.life.vehicleStates) list.push(...this.g.life.vehicleStates());
    for (const s of list) {
      const dx = this.pos.x - s.pos.x, dy = this.pos.y + 0.9 - (s.pos.y + 0.6), dz = this.pos.z - s.pos.z;
      if (Math.abs(dy) > 1.6) continue;
      const lx = dx * s.left.x + dz * s.left.z, lz = dx * s.fwd.x + dz * s.fwd.z;
      if (Math.abs(lx) > (s.halfW || 1.25) || Math.abs(lz) > (s.halfL || 2.45)) continue;
      const rel = Math.hypot(s.vel.x - this.vel.x, s.vel.z - this.vel.z);
      if (rel < 3) continue;
      const out = Math.hypot(dx, dz) || 1;
      this.vel.x = s.vel.x * 0.85 + dx / out * 2.5;
      this.vel.z = s.vel.z * 0.85 + dz / out * 2.5;
      this.vel.y = Math.min(12, 2.5 + rel * 0.18);
      this.grounded = false; this.tumble = Math.min(2.2, 0.6 + rel * 0.04);
      if (rel > LETHAL_HIT) this.dying = { cause: 'car', src: s };
      if (this.g.audio) this.g.audio.play('impact_light', { gain: 0.9, pos: { x: this.pos.x, y: this.pos.y + 1, z: this.pos.z } });
      if (this.g.rig) this.g.rig.addImpact(Math.min(1, rel / 25));
      return;
    }
  }

  interpolate(alpha) {
    const p = this.prev, c = this.curr;
    this.pose.x = p.x + (c.x - p.x) * alpha; this.pose.y = p.y + (c.y - p.y) * alpha; this.pose.z = p.z + (c.z - p.z) * alpha;
  }
}
