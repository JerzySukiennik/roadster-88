// Roadster 88 Kessler drones for chapter 2: patrol rings with visible amber scan cones, spotting any player (on foot or in a car) inside a cone with line of sight, chasing and tagging the spotted player, swarming to a thrown decoy, being lured off by a fast, close Roadster, and powering down when the city is freed; the leader runs them and followers draw the mirrored state. All drones draw as four instanced meshes (bodies, eyes, calm cones, hot cones).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GROUP, groups } from '../sim/car.js';
import { warmUp } from './props.js';

const CONE_R = 6.5, CONE_H = 26, SPEED = { patrol: 9, chase: 42, decoy: 30 };
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Drones {
  constructor(game) {
    this.g = game; this.list = []; this.root = new THREE.Group(); this.root.name = 'StoryDrones'; this.root.visible = false;
    game.gfx.scene.add(this.root);
    this.body = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.4, metalness: 0.7 });
    this.eye = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb648, emissiveIntensity: 3 });
    this.coneMat = new THREE.MeshBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.coneHot = new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.ray = new game.R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.decoy = null; this.spotted = null; this.on = false; this.down = false;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._s = new THREE.Vector3(1, 1, 1);
  }

  ground(x, z) { return this.g.valley ? this.g.valley.heightAt(x, z) : 0; }

  build(center, n, rings) {
    this.root.clear();
    const parts = [new THREE.BoxGeometry(0.9, 0.22, 0.9)];
    for (const [x, z] of [[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]]) parts.push(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 18).translate(x, 0.12, z));
    const inst = (geo, mat, order = 0) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.renderOrder = order; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.root.add(m); return m; };
    this.bodies = inst(mergeGeometries(parts), this.body);
    this.eyes = inst(new THREE.SphereGeometry(0.11, 12, 8).translate(0, -0.12, 0.42), this.eye);
    const cone = new THREE.ConeGeometry(CONE_R, CONE_H, 24, 1, true).translate(0, -CONE_H / 2 - 0.2, 0);
    this.cones = inst(cone, this.coneMat, 5); this.hot = inst(cone, this.coneHot, 5);
    this.list = [];
    for (let i = 0; i < n; i++) {
      const ring = rings[i % rings.length], a0 = (i / n) * Math.PI * 2;
      this.list.push({ i, mode: 'patrol', t: 0, ph: a0, r: ring.r, h: ring.h, sp: ring.sp, cx: center.x, cz: center.z, pos: new THREE.Vector3(center.x + Math.cos(a0) * ring.r, this.ground(center.x, center.z) + ring.h, center.z + Math.sin(a0) * ring.r), vel: new THREE.Vector3(), rot: { x: 0, y: 0, z: 0 }, cone: 1, target: null, tag: 0, fall: 0 });
    }
    this.draw();
    warmUp(this.g, this.root);
  }

  draw() {
    if (!this.bodies) return;
    for (const d of this.list) {
      this._e.set(d.rot.x, d.rot.y, d.rot.z); this._q.setFromEuler(this._e);
      this._m.compose(d.pos, this._q, this._s);
      this.bodies.setMatrixAt(d.i, this._m); this.eyes.setMatrixAt(d.i, this._m);
      this.cones.setMatrixAt(d.i, d.cone === 1 ? this._m : ZERO); this.hot.setMatrixAt(d.i, d.cone === 2 ? this._m : ZERO);
    }
    for (const m of [this.bodies, this.eyes, this.cones, this.hot]) m.instanceMatrix.needsUpdate = true;
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
    if (!this.on) return { spotted: null, caught: null };
    if (this.down) { for (const d of this.list) this.fallStep(d, dt); this.draw(); return { spotted: null, caught: null }; }
    const P = this.players(), hacker = ctx.hacker || null, carrier = ctx.carrier || null, swarm = !!ctx.swarm;
    let spotted = null, caught = null;
    const decoy = this.decoy && performance.now() < this.decoy.until ? this.decoy : null;
    for (const d of this.list) {
      d.t += dt;
      const gy = this.ground(d.pos.x, d.pos.z);
      if (d.mode !== 'chase' || !d.target) {
        if (swarm && carrier) { d.mode = 'chase'; d.target = carrier.uid; }
        for (const p of P) {
          const fast = !p.onFoot && Math.hypot(p.vx || 0, p.vz || 0) > 12, near = Math.hypot(p.x - d.pos.x, p.z - d.pos.z);
          if (fast && near < 32 && p.uid !== (hacker && hacker.uid) && d.mode !== 'decoy') { d.mode = 'chase'; d.target = p.uid; d.t = 0; d.lure = true; break; }
          if (near < CONE_R && p.y < d.pos.y && d.pos.y - p.y < CONE_H && this.los(d.pos, { x: p.x, y: p.y + 1, z: p.z })) { d.mode = 'chase'; d.target = p.uid; d.t = 0; d.lure = false; spotted = spotted || p; break; }
        }
      }
      if (decoy && d.mode !== 'decoy' && Math.hypot(decoy.x - d.pos.x, decoy.z - d.pos.z) < 160 && !(swarm && carrier)) { d.mode = 'decoy'; d.target = null; d.t = 0; }
      let goal;
      if (d.mode === 'chase') {
        const p = P.find((q) => q.uid === d.target);
        if (!p || (d.t > (d.lure ? 9 : 7) && !swarm) || Math.hypot(p.x - d.pos.x, p.z - d.pos.z) > 320) { d.mode = 'patrol'; d.target = null; d.t = 0; }
        else {
          goal = new THREE.Vector3(p.x, p.y + (p.onFoot ? 5 : 6.5), p.z);
          const dd = goal.distanceTo(d.pos);
          if (dd < 7) { d.tag += dt; if (d.tag > 1.4) { caught = caught || p; d.tag = 0; } } else d.tag = Math.max(0, d.tag - dt);
          if (!d.lure && Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < CONE_R + 2) spotted = spotted || p;
        }
      }
      if (d.mode === 'decoy') {
        if (!decoy) { d.mode = 'patrol'; d.t = 0; }
        else { const a = d.i * 2.4 + d.t * 1.3; goal = new THREE.Vector3(decoy.x + Math.cos(a) * 4, decoy.y + 5 + (d.i % 3), decoy.z + Math.sin(a) * 4); }
      }
      if (d.mode === 'patrol') {
        const a = d.ph + d.t * d.sp / d.r * 1.0;
        goal = new THREE.Vector3(d.cx + Math.cos(a) * d.r, 0, d.cz + Math.sin(a) * d.r);
        goal.y = this.ground(goal.x, goal.z) + d.h;
      }
      const sp = SPEED[d.mode === 'patrol' ? 'patrol' : d.mode === 'decoy' ? 'decoy' : 'chase'] * (d.mode === 'patrol' ? Math.max(1, d.r / 40) : 1);
      const to = goal.clone().sub(d.pos), dist = to.length();
      const want = dist > 0.01 ? to.multiplyScalar(Math.min(sp, dist * 2) / dist) : to.set(0, 0, 0);
      d.vel.lerp(want, Math.min(1, dt * 2.5));
      d.pos.addScaledVector(d.vel, dt);
      d.pos.y = Math.max(d.pos.y, gy + 3);
      d.rot.y = Math.atan2(d.vel.x, d.vel.z);
      d.rot.z = THREE.MathUtils.clamp(-d.vel.x * 0.01, -0.3, 0.3);
      d.cone = d.mode === 'decoy' ? 0 : d.mode === 'chase' && !d.lure ? 2 : 1;
    }
    this.spotted = spotted;
    this.draw();
    return { spotted, caught };
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

  netState() { return this.list.map((d) => [Math.round(d.pos.x * 10) / 10, Math.round(d.pos.y * 10) / 10, Math.round(d.pos.z * 10) / 10, d.mode === 'chase' && !d.lure ? 2 : d.mode === 'decoy' ? 1 : 0]); }

  netApply(a, dt) {
    if (!a) return;
    a.forEach((s, i) => {
      const d = this.list[i]; if (!d) return;
      const k = Math.min(1, dt * 8), vx = s[0] - d.pos.x, vz = s[2] - d.pos.z;
      d.pos.x += vx * k; d.pos.y += (s[1] - d.pos.y) * k; d.pos.z += vz * k;
      if (Math.hypot(vx, vz) > 0.05) d.rot.y = Math.atan2(vx, vz);
      d.cone = this.down || s[3] === 1 ? 0 : s[3] === 2 ? 2 : 1;
    });
    this.draw();
  }
}
