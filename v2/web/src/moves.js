// Roadster 88 avatar moves: short scripted sequences that move the avatar with mocap clips instead of teleporting it: getting out (door opens, the driver turns out of the seat and stands up beside the door), getting in (step to the door, sit down backwards, swing in), and stowing or taking cargo at the frunk (walk to the nose, the powered lid lifts, the item goes in or comes out, the lid closes).
import * as THREE from 'three/webgpu';

const DOOR = new THREE.Vector3(1.45, 0, -0.15), NOSE = new THREE.Vector3(0, 0, 2.75), FRUNK = new THREE.Vector3(0, 0.62, 1.86);
const SEAT_UP = 0.55, SEAT_BACK = 0.29, Y = new THREE.Vector3(0, 1, 0);
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const turn = (a, b, t) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; };

export class Moves {
  constructor(game) {
    this.g = game; this.cur = null;
    this.w = { pose: { x: 0, y: 0, z: 0 }, yaw: 0, speed: 0, grounded: true, vy: 0, tumble: 0, dead: false, swim: false };
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }

  get busy() { return !!this.cur; }

  carYaw(car) { const f = this._v.set(0, 0, 1).applyQuaternion(car.curr.quat); return Math.atan2(f.x, f.z); }

  local(car, v) { return v.clone().applyQuaternion(car.curr.quat).add(car.curr.pos); }

  ground(p, from) { const h = this.g.groundHeight(p.x, p.z, from); return h === null ? p.y : h; }

  seatRoot(car, yaw) {
    const seat = car.view.n.Seat_Driver, p = seat ? seat.getWorldPosition(new THREE.Vector3()) : this.local(car, new THREE.Vector3(0.36, 0.26, -0.3));
    return p.addScaledVector(Y, -SEAT_UP).add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(SEAT_BACK));
  }

  start(kind, car, o) {
    if (!this.g.driver.anim) { if (o.done) o.done(); return false; }
    this.cur = { kind, car, t: 0, step: -1, ...o };
    const W = this.g.walker; W.lock = Math.max(W.lock, o.dur + 0.1);
    return true;
  }

  motion() {
    const D = this.g.driver;
    if (D.motionOn) return;
    D.resetPose(); D.anim.reset(); D.motionOn = true; D.drop = 0;
  }

  exit(car, stand, yaw) {
    const out = Math.atan2(car.sim.left.x, car.sim.left.z);
    this.g.doorPulse(car, true);
    this.start('exit', car, { dur: 1.65, stand: stand.clone(), out, yaw });
  }

  enter(car, done) {
    const W = this.g.walker, out = Math.atan2(car.sim.left.x, car.sim.left.z), stand = this.local(car, DOOR);
    stand.y = this.ground(stand, car.sim.pos.y + 2.5);
    const from = new THREE.Vector3(W.pos.x, W.pos.y, W.pos.z), path = this.around(car, from, stand);
    let len = 0; for (let i = 1; i < path.length; i++) len += path[i].distanceTo(path[i - 1]);
    const walk = Math.max(0.35, len / 2.6);
    this.start('enter', car, { dur: walk + 1.15 + 0.35, walk, path, len, from, stand, out, yaw0: W.yaw, done });
  }

  around(car, from, stand) {
    const inv = car.curr.quat.clone().invert(), L = from.clone().sub(car.curr.pos).applyQuaternion(inv), pts = [from];
    const at = (x, z) => { const p = this.local(car, new THREE.Vector3(x, 0, z)); p.y = this.ground(p, car.sim.pos.y + 2.5); return p; };
    if (L.x < -1.05) { const z = L.z > 0 ? 2.75 : -2.85; pts.push(at(-1.5, z), at(1.5, z)); }
    else if (L.x < 1.2 && Math.abs(L.z) > 1.4) pts.push(at(1.5, Math.max(-2.6, Math.min(2.6, L.z))));
    pts.push(stand);
    return pts;
  }

  along(path, len, u) {
    let d = u * len;
    for (let i = 1; i < path.length; i++) { const s = path[i].distanceTo(path[i - 1]); if (d <= s || i === path.length - 1) return { p: path[i - 1].clone().lerp(path[i], s > 1e-6 ? Math.min(1, d / s) : 1), dir: Math.atan2(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z) }; d -= s; }
    return { p: path[path.length - 1].clone(), dir: 0 };
  }

  nose(kind, car, o) {
    const W = this.g.walker, stand = this.local(car, NOSE); stand.y = this.ground(stand, car.sim.pos.y + 2.5);
    const from = new THREE.Vector3(W.pos.x, W.pos.y, W.pos.z), walk = Math.min(1.1, 0.15 + from.distanceTo(stand) / 2.2), face = this.carYaw(car) + Math.PI;
    if (this.start(kind, car, { dur: walk + (kind === 'stow' ? 2.0 : 1.9), walk, from, stand, face, yaw0: W.yaw, ...o })) { W.enter(stand.x, stand.y + 0.02, stand.z, face); W.lock = this.cur.dur + 0.1; }
  }

  stow(item, car, done) { this.nose('stow', car, { item, done }); }

  take(car, spawn) { this.nose('take', car, { spawn }); }

  play(name, opt) { const A = this.g.driver.anim; if (A) A.play(name, { lock: true, ...opt }); }

  stepTo(n, fn) { const c = this.cur; if (c.step < n) { c.step = n; fn(); } }

  abort() {
    const c = this.cur, g = this.g; this.cur = null; this.flush();
    g.walker.lock = 0;
    if (c && c.car) c.car.view.hoodTarget = 0;
    if (g.walker.active && g.driver.root && g.driver.root.parent !== g.gfx.scene) g.driver.attach(g.gfx.scene, true);
  }

  render(dt) {
    const c = this.cur, g = this.g, D = g.driver;
    if (!c || !D.ready) return false;
    const W = g.walker, ref = c.kind === 'enter' ? c.from : c.stand;
    if (!W.active || W.dead || Math.hypot(W.pos.x - ref.x, W.pos.z - ref.z) > 2.5) { this.abort(); return false; }
    c.t += dt;
    const car = c.car, w = this.w, t = c.t;
    w.speed = 0; w.grounded = true; w.vy = 0;
    let ground = null;
    if (c.kind === 'exit') {
      if (t < 0.35) { if (D.root.parent !== car.view.root) D.attach(car.view.root, false); D.pose(car.view, dt, {}); return this.finish(false); }
      if (D.root.parent !== g.gfx.scene) D.attach(g.gfx.scene, true);
      this.stepTo(0, () => { this.motion(); this.play('Sitting_Idle_Loop', { until: 0.3 }); });
      const carYaw = this.carYaw(car), yaw = turn(carYaw, c.out, ease((t - 0.35) / 0.25));
      if (t < 0.6) { const r = this.seatRoot(car, yaw); Object.assign(w.pose, { x: r.x, y: r.y, z: r.z }); w.yaw = yaw; }
      else {
        this.stepTo(1, () => this.play('Sitting_Exit'));
        const u = ease((t - 0.6) / 1.0), r = this.seatRoot(car, c.out).lerp(c.stand, u);
        Object.assign(w.pose, { x: r.x, y: r.y, z: r.z }); w.yaw = turn(c.out, c.yaw, ease((t - 1.3) / 0.35));
      }
      D.walkPose(w, dt, { ground: null });
      return this.finish(t >= c.dur);
    }
    if (c.kind === 'enter') {
      if (D.root.parent !== g.gfx.scene) D.attach(g.gfx.scene, true);
      if (t < c.walk) {
        const u = t / c.walk, a = this.along(c.path, c.len, u), p = a.p;
        Object.assign(w.pose, { x: p.x, y: p.y, z: p.z });
        c.dirS = c.dirS === undefined ? c.yaw0 : turn(c.dirS, a.dir, Math.min(1, dt * 10));
        w.yaw = u < 0.82 ? c.dirS : turn(c.dirS, c.out, ease((u - 0.82) / 0.18));
        w.speed = c.len / c.walk;
        ground = (x, z) => g.valley ? g.valley.heightAt(x, z) : 0;
        this.stepTo(0, () => g.doorPulse(car, true));
      } else if (t < c.walk + 1.15) {
        this.stepTo(1, () => this.play('Sitting_Enter'));
        const u = ease((t - c.walk) / 1.15), r = c.stand.clone().lerp(this.seatRoot(car, c.out), u);
        Object.assign(w.pose, { x: r.x, y: r.y, z: r.z }); w.yaw = c.out;
      } else {
        this.stepTo(2, () => this.play('Sitting_Idle_Loop', { until: 0.6 }));
        const yaw = turn(c.out, this.carYaw(car), ease((t - c.walk - 1.15) / 0.3)), r = this.seatRoot(car, yaw);
        Object.assign(w.pose, { x: r.x, y: r.y, z: r.z }); w.yaw = yaw;
      }
      D.walkPose(w, dt, { ground });
      if (t >= c.dur) { this.cur = null; this.queue = null; c.done(); }
      return true;
    }
    const I = g.interact, front = this.local(car, FRUNK);
    if (D.root.parent !== g.gfx.scene) D.attach(g.gfx.scene, true);
    let overlay = c.kind === 'stow' && c.step < 2 ? 'Walk_Carry_Loop' : null;
    if (t < c.walk) {
      const u = ease(t / c.walk), p = c.from.clone().lerp(c.stand, u);
      Object.assign(w.pose, { x: p.x, y: p.y, z: p.z }); w.yaw = turn(c.yaw0, c.face, ease(u / 0.7));
      w.speed = c.from.distanceTo(c.stand) / c.walk * (1 - Math.abs(u - 0.5));
      ground = (x, z) => g.valley ? g.valley.heightAt(x, z) : 0;
    } else {
      Object.assign(w.pose, { x: c.stand.x, y: c.stand.y, z: c.stand.z }); w.yaw = c.face;
      const s = t - c.walk;
      this.stepTo(0, () => { car.view.hoodTarget = 1; if (g.audio) g.audio.play('door_open', { pos: front, gain: 0.45, rate: 1.25 }); });
      if (s >= 0.5) this.stepTo(1, () => this.play('PickUp_Table', { rate: 0.85 }));
      if (c.kind === 'stow') {
        if (s >= 0.5 && s < 1.2) overlay = null;
        if (s >= 1.2) this.stepTo(2, () => { const it = c.item; c.item = null; c.done(); if (it && I.items.includes(it)) I.removeItem(it); });
      } else {
        if (s >= 0.85) this.stepTo(2, () => { c.item = c.spawn(front); if (c.item) I.pick(c.item.body, c.item.col, { anim: false, blend: 0.45 }); });
        if (s >= 1.3) overlay = 'Walk_Carry_Loop';
      }
      if (s >= 1.45) this.stepTo(4, () => { car.view.hoodTarget = 0; if (g.audio) g.audio.play('door_close', { pos: front, gain: 0.5 }); });
    }
    D.walkPose(w, dt, { ground, overlay });
    if (c.kind === 'stow' && c.item && t >= c.walk + 0.5) { const hp = I.handPoint(); if (hp) c.item.mesh.position.copy(hp).lerp(front, ease((t - c.walk - 0.75) / 0.45)); }
    return this.finish(t >= c.dur);
  }

  flush() { const q = this.queue; this.queue = null; if (q) setTimeout(q, 0); }

  finish(end) {
    if (!end) return true;
    const c = this.cur; this.cur = null; this.flush();
    const W = this.g.walker; W.lock = 0;
    if (c && c.kind === 'exit') { W.yaw = c.yaw; }
    if (c && (c.kind === 'stow' || c.kind === 'take')) { W.yaw = c.face; c.car.view.hoodTarget = 0; }
    return true;
  }
}
