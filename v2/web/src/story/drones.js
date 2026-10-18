// Roadster 88 Kessler drones for chapter 2: patrol rings and a sentry pacing in front of the tower terminal, each with a visible scan cone. A player is only seen inside the lit circle the cone throws on the ground (plus a little margin, with line of sight); the cone warms to bright amber while it watches, and only after a short exposure does it turn red and report a single sighting, then hovers over the spot and calms down before it can see anyone again. Drones swarm to a thrown decoy, chase a fast close Roadster that lures them, chase the book carrier during the escape, and power down when the city is freed; the leader runs them and followers draw the mirrored state. All drones draw as five instanced meshes.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GROUP, groups } from '../sim/car.js';
import { warmUp } from './props.js';

const CONE_R = 6.5, CONE_H = 26, MARGIN = 1.5, WARN = 0.6, ALERT = 2.5, CALM = 4, SPEED = { patrol: 9, chase: 42, decoy: 30, alert: 14 };
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Drones {
  constructor(game) {
    this.g = game; this.list = []; this.root = new THREE.Group(); this.root.name = 'StoryDrones'; this.root.visible = false;
    game.gfx.scene.add(this.root);
    this.body = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.4, metalness: 0.7 });
    this.eye = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb648, emissiveIntensity: 3 });
    const cone = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.coneMat = cone(0xffb648, 0.1); this.coneWarn = cone(0xffc04a, 0.17); this.coneHot = cone(0xff4a26, 0.15);
    this.ray = new game.R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.decoy = null; this.spotted = null; this.on = false; this.down = false;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._s = new THREE.Vector3(1, 1, 1);
  }

  ground(x, z) { return this.g.valley ? this.g.valley.heightAt(x, z) : 0; }

  build(center, specs) {
    this.root.clear();
    const n = specs.length;
    const parts = [new THREE.BoxGeometry(0.9, 0.22, 0.9)];
    for (const [x, z] of [[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]]) parts.push(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 18).translate(x, 0.12, z));
    const inst = (geo, mat, order = 0) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.renderOrder = order; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.root.add(m); return m; };
    this.bodies = inst(mergeGeometries(parts), this.body);
    this.eyes = inst(new THREE.SphereGeometry(0.11, 12, 8).translate(0, -0.12, 0.42), this.eye);
    const geo = new THREE.ConeGeometry(CONE_R, CONE_H, 24, 1, true).translate(0, -CONE_H / 2 - 0.2, 0);
    this.cones = [inst(geo, this.coneMat, 5), inst(geo, this.coneHot, 5), inst(geo, this.coneWarn, 5)];
    const yaw = center.yaw || 0, gy = this.ground(center.x, center.z);
    this.list = specs.map((s, i) => {
      const d = { i, ...s, mode: 'patrol', t: 0, cx: center.x, cz: center.z, yaw, vel: new THREE.Vector3(), rot: { x: 0, y: 0, z: 0 }, cone: 1, target: null, tag: 0, fall: 0, watch: 0, watchUid: null, calm: 0 };
      d.pos = this.patrolGoal(d, 0); d.pos.y = gy + s.h;
      return d;
    });
    this.draw();
    warmUp(this.g, this.root);
  }

  patrolGoal(d, t) {
    let lx, lz;
    if (d.pace) { const u = Math.sin((t + (d.ph || 0)) * Math.PI * 2 / d.pace.period); lx = u * d.pace.half; lz = d.pace.off; }
    else { const a = (d.ph || 0) + t * d.sp * Math.max(1, d.r / 40) * SPEED.patrol / d.r; lx = Math.cos(a) * d.r; lz = Math.sin(a) * d.r; }
    const c = Math.cos(d.yaw), s = Math.sin(d.yaw), x = d.cx + lx * c + lz * s, z = d.cz - lx * s + lz * c;
    return new THREE.Vector3(x, this.ground(x, z) + d.h, z);
  }

  lit(d, p) {
    const h = d.pos.y - p.y; if (h < 1 || h > CONE_H) return false;
    return Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < CONE_R * h / CONE_H + MARGIN;
  }

  draw() {
    if (!this.bodies) return;
    for (const d of this.list) {
      this._e.set(d.rot.x, d.rot.y, d.rot.z); this._q.setFromEuler(this._e);
      this._m.compose(d.pos, this._q, this._s);
      this.bodies.setMatrixAt(d.i, this._m); this.eyes.setMatrixAt(d.i, this._m);
      this.cones.forEach((m, k) => m.setMatrixAt(d.i, d.cone === k + 1 ? this._m : ZERO));
    }
    for (const m of [this.bodies, this.eyes, ...this.cones]) m.instanceMatrix.needsUpdate = true;
  }

  show(on) { this.on = on; this.root.visible = on; }

  players() {
    const o = this.g.online, out = [];
    if (o && o.status === 'online' && o.players) for (const p of o.players()) out.push(p);
    else { const w = this.g.walker, me = w.active ? w.pos : this.g.car.sim.pos, v = w.active ? w.vel : this.g.car.sim.vel; out.push({ x: me.x, y: me.y, z: me.z, vx: v.x, vz: v.z, onFoot: w.active, uid: 'me', local: true }); }
    return out;
  }

  los(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz);
    if (d < 0.5) return true;
    this.ray.origin = { x: a.x, y: a.y, z: a.z }; this.ray.dir = { x: dx / d, y: dy / d, z: dz / d };
    const h = this.g.phys.world.castRay(this.ray, d - 0.6, true, undefined, groups(GROUP.CAR, GROUP.STATIC));
    return !h;
  }

  update(dt, ctx = {}) {
    this.ticked = true;
    if (!this.on) return { spotted: null, caught: null, watching: null };
    if (this.down) { for (const d of this.list) this.fallStep(d, dt); this.draw(); return { spotted: null, caught: null, watching: null }; }
    const P = this.players(), hacker = ctx.hacker || null, carrier = ctx.carrier || null, swarm = !!ctx.swarm;
    let spotted = null, caught = null, watching = null;
    const decoy = this.decoy && performance.now() < this.decoy.until ? this.decoy : null;
    for (const d of this.list) {
      d.t += dt; d.calm = Math.max(0, d.calm - dt);
      const gy = this.ground(d.pos.x, d.pos.z);
      if (swarm && carrier) { if (d.mode !== 'chase' || d.target !== carrier.uid) { d.mode = 'chase'; d.target = carrier.uid; d.lure = false; d.t = 0; } }
      else if (d.mode === 'chase' && !d.lure) { d.mode = 'patrol'; d.target = null; }
      if (decoy && d.mode !== 'decoy' && !(swarm && carrier) && Math.hypot(decoy.x - d.pos.x, decoy.z - d.pos.z) < 160) { d.mode = 'decoy'; d.target = null; d.t = 0; d.watch = 0; }
      if (d.mode === 'patrol') {
        for (const p of P) {
          const fast = !p.onFoot && Math.hypot(p.vx || 0, p.vz || 0) > 12;
          if (fast && p.uid !== (hacker && hacker.uid) && Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < 32) { d.mode = 'chase'; d.target = p.uid; d.t = 0; d.lure = true; d.watch = 0; break; }
        }
      }
      if (d.mode === 'patrol') {
        let seen = null;
        if (d.calm <= 0) for (const p of P) if (this.lit(d, p) && this.los(d.pos, { x: p.x, y: p.y + 1, z: p.z })) { seen = p; break; }
        if (seen) { d.watch = d.watchUid === seen.uid ? d.watch + dt : dt; d.watchUid = seen.uid; watching = watching || seen; }
        else d.watch = Math.max(0, d.watch - dt * 0.5);
        if (seen && d.watch >= WARN) { spotted = spotted || seen; d.mode = 'alert'; d.t = 0; d.watch = 0; d.at = { x: seen.x, y: seen.y, z: seen.z }; }
      }
      let goal;
      if (d.mode === 'alert') {
        if (d.t > ALERT) { d.mode = 'patrol'; d.t = 0; d.calm = CALM; }
        else goal = new THREE.Vector3(d.at.x, d.at.y + d.h * 0.7, d.at.z);
      }
      if (d.mode === 'chase') {
        const p = P.find((q) => q.uid === d.target);
        if (!p || (d.lure && d.t > 9) || Math.hypot(p.x - d.pos.x, p.z - d.pos.z) > 320) { d.mode = 'patrol'; d.target = null; d.t = 0; d.calm = CALM; }
        else {
          goal = new THREE.Vector3(p.x, p.y + (p.onFoot ? 5 : 6.5), p.z);
          if (!d.lure) { if (goal.distanceTo(d.pos) < 7) { d.tag += dt; if (d.tag > 1.4) { caught = caught || p; d.tag = 0; } } else d.tag = Math.max(0, d.tag - dt); }
        }
      }
      if (d.mode === 'decoy') {
        if (!decoy) { d.mode = 'patrol'; d.t = 0; d.calm = CALM; }
        else { const a = d.i * 2.4 + d.t * 1.3; goal = new THREE.Vector3(decoy.x + Math.cos(a) * 4, decoy.y + 5 + (d.i % 3), decoy.z + Math.sin(a) * 4); }
      }
      if (d.mode === 'patrol') goal = this.patrolGoal(d, d.pt = (d.pt || 0) + dt);
      const sp = SPEED[d.mode] || SPEED.patrol, fast = d.mode === 'patrol' ? sp * (d.pace ? 2 : Math.max(1, d.r / 40) * 1.4) : sp;
      const to = goal.clone().sub(d.pos), dist = to.length();
      const want = dist > 0.01 ? to.multiplyScalar(Math.min(fast, dist * 2) / dist) : to.set(0, 0, 0);
      d.vel.lerp(want, Math.min(1, dt * 2.5));
      d.pos.addScaledVector(d.vel, dt);
      d.pos.y = Math.max(d.pos.y, gy + 3);
      if (d.vel.lengthSq() > 0.01) d.rot.y = Math.atan2(d.vel.x, d.vel.z);
      d.rot.z = THREE.MathUtils.clamp(-d.vel.x * 0.01, -0.3, 0.3);
      d.cone = d.mode === 'decoy' ? 0 : d.mode === 'alert' || (d.mode === 'chase' && !d.lure) ? 2 : d.watch > 0.05 ? 3 : 1;
    }
    this.spotted = spotted;
    this.draw();
    return { spotted, caught, watching };
  }

  fallStep(d, dt) {
    d.cone = 0;
    if (d.fall > 4) return;
    d.fall += dt; d.vel.y -= 9.81 * dt; d.vel.x *= 0.98; d.vel.z *= 0.98;
    d.pos.addScaledVector(d.vel, dt);
    const gy = this.ground(d.pos.x, d.pos.z) + 0.2;
    if (d.pos.y < gy) { d.pos.y = gy; d.vel.set(0, 0, 0); d.fall = 5; if (this.g.fx && this.g.fx.sparks) this.g.fx.sparks(d.pos.clone(), new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 20); }
    d.rot.x += dt * 2;
  }

  powerDown() { if (this.down) return; this.down = true; for (const d of this.list) { d.fall = 0; d.cone = 0; d.vel.set((Math.random() - 0.5) * 4, 1, (Math.random() - 0.5) * 4); } this.eye.emissiveIntensity = 0; this.draw(); }

  throwDecoy(p) { this.decoy = { x: p.x, y: p.y, z: p.z, until: performance.now() + 14000 }; }

  netState() { return this.list.map((d) => [Math.round(d.pos.x * 10) / 10, Math.round(d.pos.y * 10) / 10, Math.round(d.pos.z * 10) / 10, d.cone]); }

  netApply(a, dt) {
    if (!a) return;
    a.forEach((s, i) => {
      const d = this.list[i]; if (!d) return;
      const k = Math.min(1, dt * 8), vx = s[0] - d.pos.x, vz = s[2] - d.pos.z;
      d.pos.x += vx * k; d.pos.y += (s[1] - d.pos.y) * k; d.pos.z += vz * k;
      if (Math.hypot(vx, vz) > 0.05) d.rot.y = Math.atan2(vx, vz);
      d.cone = this.down ? 0 : s[3] | 0;
    });
    this.draw();
  }
}
