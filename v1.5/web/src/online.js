// Roadster 88 online: one shared world over Firebase (anonymous auth, RTDB under roadster88/), one room per map and era, compact 10 Hz state, interpolated remote Roadsters and avatars with kinematic colliders, impact hand-off, name tags, and flashes when players leave for another era.
import * as THREE from 'three/webgpu';
import { CarView } from './render/carView.js';
import { CarMaterials, PAINTS } from './render/carMaterials.js';
import { Driver } from './render/driver.js';
import { Thrusters, thrustDir } from './sim/thrusters.js';
import { carHull, GROUP, groups } from './sim/car.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
const CONFIG = {
  apiKey: 'AIzaSyAaTuELH_mToxH3hRJ4WPIVTECSH7Z8-FY',
  authDomain: 'gzowos-games.firebaseapp.com',
  databaseURL: 'https://gzowos-games-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'gzowos-games',
  storageBucket: 'gzowos-games.firebasestorage.app',
  messagingSenderId: '658227201482',
  appId: '1:658227201482:web:627b44e3c4c2988bc4bb33',
};
const RATE = 0.1, LEAD = 0.01, MAXEX = 0.5, STALE = 20000, NEAR = 70, FAR = 900;
const r3 = (v) => Math.round(v * 1000) / 1000, r2 = (v) => Math.round(v * 100) / 100;
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

function pack(th) {
  let s = '';
  for (const n of th.all) {
    s += String(Math.min(9, Math.round(n.attached ? n.valve * 9 : 0)));
    s += B36[Math.max(0, Math.min(35, Math.round((n.pitch + 0.6) / 2.3 * 35)))];
  }
  return s;
}

class Remote {
  constructor(on, uid) {
    this.on = on; this.uid = uid; this.g = on.g;
    this.buf = []; this.name = ''; this.outfit = 0; this.last = 0;
    this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.vel = new THREE.Vector3();
    this.fwd = new THREE.Vector3(); this.left = new THREE.Vector3(); this.up = new THREE.Vector3();
    this.flags = 0; this.steer = 0; this.nozzles = ''; this.foot = null;
    this.view = null; this.body = null; this.ghost = null; this.driver = null; this.driverLoading = false;
    this.tag = document.createElement('div'); this.tag.className = 'name-tag'; on.tags.appendChild(this.tag);
    this.walk = { pose: { x: 0, y: 0, z: 0 }, yaw: 0, speed: 0, phase: 0, grounded: true, tumble: 0 };
    this.spin = 0; this.solid = false; this.cols = [];
    this.corrP = new THREE.Vector3(); this.corrQ = new THREE.Quaternion(); this.lastSample = 0;
    this._p0 = new THREE.Vector3(); this._q0 = new THREE.Quaternion(); this._v0 = new THREE.Vector3();
    this._p1 = new THREE.Vector3(); this._q1 = new THREE.Quaternion(); this._v1 = new THREE.Vector3();
    this._qa = new THREE.Quaternion(); this._qc = new THREE.Quaternion(); this._dq = new THREE.Quaternion();
  }

  get hidden() { return !!(this.flags & 512) || performance.now() < (this.hideUntil || 0); }

  clock() {
    const ml = this.minLat === undefined ? 0 : this.minLat, fix = ml < -0.02 || ml > 0.5 ? ml - 0.06 : 0;
    return (Date.now() + this.on.offset) / 1000 - fix - LEAD;
  }

  push(d, now) {
    if (!d || !d.c) return;
    this.name = String(d.n || '').slice(0, 20); this.outfit = d.o | 0; this.last = now; this.paint = PAINTS[d.p] ? d.p : 'white'; this.ride = d.r || null; this.dy = typeof d.dy === 'number' ? d.dy : null;
    const fl = (d.k && d.k[1]) || 0, was = this.lastFl === undefined ? 0 : this.lastFl;
    if ((fl & 128) && !(was & 128) && this.lastFl !== undefined) { this.departed = true; this.pendingFx = 'depart'; }
    if ((fl & 256) && !(was & 256)) { this.departed = false; this.vanished = false; this.pendingFx = 'arrive'; }
    if (!(fl & 128) && this.departed && !(fl & 256)) { this.departed = false; this.vanished = false; }
    this.lastFl = fl;
    const srv = (Date.now() + this.on.offset) / 1000, at = typeof d.t === 'number' ? d.t / 1000 : srv, lat = srv - at;
    let prev = this.buf[this.buf.length - 1];
    if (prev && at < prev.at - 0.4) { this.buf.length = 0; this.minLat = undefined; this.lats = []; this.corrP.set(0, 0, 0); this.corrQ.identity(); prev = null; }
    if (prev && Math.hypot(prev.c[0] - d.c[0], prev.c[1] - d.c[1], prev.c[2] - d.c[2]) > 25) { this.buf.length = 0; this.setSolid(false); this.corrP.set(0, 0, 0); this.corrQ.identity(); }
    if (prev && at <= prev.at) return;
    const had = this.buf.length > 0;
    if (had) this.poseAt(this.clock(), this._p0, this._q0, this._v0);
    const L = this.lats || (this.lats = []); L.push(lat); if (L.length > 30) L.shift();
    this.minLat = Math.min(...L);
    this.buf.push({ at, c: d.c, k: d.k || [0, 0], z: d.z || '', f: d.f || null });
    if (this.buf.length > 12) this.buf.shift();
    if (had) {
      this.poseAt(this.clock(), this._p1, this._q1, this._v1);
      const e = this._p0.sub(this._p1);
      if (e.length() < 4) this.corrP.add(e); else this.corrP.set(0, 0, 0);
      this.corrQ.multiply(this._q0).multiply(this._q1.invert()).normalize();
    }
    if (this.tag.textContent !== this.name) this.tag.textContent = this.name;
  }

  poseAt(T, P, Q, V) {
    const b = this.buf, n = b.length;
    let a = b[0], c = b[n - 1], k = 0;
    if (T <= a.at) c = a;
    else if (T >= c.at) a = c;
    else for (let i = 0; i < n - 1; i++) if (b[i].at <= T && b[i + 1].at >= T) { a = b[i]; c = b[i + 1]; k = (T - a.at) / Math.max(1e-3, c.at - a.at); break; }
    const A = a.c, C = c.c;
    P.set(A[0] + (C[0] - A[0]) * k, A[1] + (C[1] - A[1]) * k, A[2] + (C[2] - A[2]) * k);
    V.set(A[7] + (C[7] - A[7]) * k, A[8] + (C[8] - A[8]) * k, A[9] + (C[9] - A[9]) * k);
    Q.slerpQuaternions(this._qa.set(A[3], A[4], A[5], A[6]), this._qc.set(C[3], C[4], C[5], C[6]), k).normalize();
    if (a === c && T > c.at) {
      const ex = Math.min(MAXEX, T - c.at);
      P.addScaledVector(V, ex);
      const p = n > 1 ? b[n - 2] : null, span = p ? c.at - p.at : 0;
      if (p && span > 0.02 && span < 0.6) {
        const dq = this._dq.set(C[3], C[4], C[5], C[6]).multiply(this._qa.set(p.c[3], p.c[4], p.c[5], p.c[6]).invert());
        if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
        const ang = 2 * Math.acos(Math.min(1, dq.w)), sn = Math.sqrt(Math.max(1e-12, 1 - dq.w * dq.w));
        if (ang > 1e-4) {
          const ext = Math.min(1.2, ang * ex / span), h = Math.sin(ext / 2) / sn;
          dq.set(dq.x * h, dq.y * h, dq.z * h, Math.cos(ext / 2));
          Q.premultiply(dq).normalize();
        }
      }
    }
    this._a = a; this._c = c; this._k = k;
  }

  sample(now) {
    const b = this.buf; if (!b.length) return false;
    const dt = this.lastSample ? Math.min(0.1, now - this.lastSample) : 0; this.lastSample = now;
    this.poseAt(this.clock(), this.pos, this.quat, this.vel);
    const decay = Math.exp(-dt * 5);
    this.corrP.multiplyScalar(decay);
    this._dq.identity(); this.corrQ.slerp(this._dq, 1 - decay);
    this.pos.add(this.corrP);
    this.quat.premultiply(this.corrQ).normalize();
    const a = this._a, c = this._c, k = this._k;
    this.steer = (c.k[0] || 0) / 100; this.flags = c.k[1] || 0; this.nozzles = c.z;
    this.fwd.set(0, 0, 1).applyQuaternion(this.quat); this.left.set(1, 0, 0).applyQuaternion(this.quat); this.up.set(0, 1, 0).applyQuaternion(this.quat);
    const F = c.f, Fa = a.f;
    if (F) {
      const P = Fa || F;
      this.walk.pose.x = P[0] + (F[0] - P[0]) * k; this.walk.pose.y = P[1] + (F[1] - P[1]) * k; this.walk.pose.z = P[2] + (F[2] - P[2]) * k;
      let dy = F[3] - P[3]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.walk.yaw = P[3] + dy * k; this.walk.speed = F[4]; this.walk.grounded = !!F[5]; this.walk.tumble = F[6] || 0;
      this.walk.vy = F[7] || 0; this.walk.swim = !!F[8]; this.walk.dead = !!(this.flags & 2048);
      this.foot = this.walk;
    } else this.foot = null;
    return true;
  }

  ensure() {
    const g = this.g;
    if (this.view || !g.template) return;
    this.makeView();
    const th = new Thrusters(g.tu);
    const sc = g.car.sim.wheels.map((w) => w.staticCompression);
    const rest = g.tu.suspension.rest_length;
    this.ghost = {
      thrusters: th, vel: new THREE.Vector3(), speed: 0, contacts: 4, steerAngle: 0, brakeOn: 0,
      wheels: g.car.sim.wheels.map((w, i) => ({ name: w.name, i, front: w.front, left: w.left, r: w.r, lost: false, staticCompression: sc[i], length: rest - sc[i], hub: { x: 0, y: 0, z: 0 }, steer: 0, spin: 0, toe: 0, camber: 0 })),
    };
    const R = g.R, world = g.phys.world;
    const c = g.tu.car;
    this.body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(this.pos.x, this.pos.y, this.pos.z).setRotation({ x: this.quat.x, y: this.quat.y, z: this.quat.z, w: this.quat.w }).setGravityScale(0).setCanSleep(false).setCcdEnabled(true));
    this.body.setAdditionalMassProperties(c.mass, { x: c.com[0], y: c.com[1], z: c.com[2] }, { x: c.inertia.pitch, y: c.inertia.yaw, z: c.inertia.roll }, { x: 0, y: 0, z: 0, w: 1 }, true);
    const h = carHull(g.tu, null);
    this.ud = { kind: 'remote', uid: this.uid, vel: this.vel, mass: c.mass };
    for (const pts of [h.body, h.cabin]) {
      const d = R.ColliderDesc.convexHull(pts); if (!d) continue;
      d.setDensity(0).setFriction(0.45).setRestitution(0.08).setCollisionGroups(groups(GROUP.CAR, GROUP.CAR | GROUP.PROP | GROUP.DEBRIS | GROUP.WALKER));
      const col = world.createCollider(d, this.body); col.userData = this.ud; col.setEnabled(false); this.cols.push(col);
    }
  }

  makeView() {
    const g = this.g;
    if (this.view) g.gfx.scene.remove(this.view.root);
    this.viewPaint = this.paint || 'white';
    this.mats = this.on.matsFor(this.viewPaint);
    this.view = new CarView(g.tu, this.mats, g.template);
    this.view.root.name = 'Remote_' + this.uid;
    g.gfx.scene.add(this.view.root);
  }

  footBody() {
    const g = this.g, R = g.R, f = this.foot && !this.ride ? this.walk.pose : null;
    if (!f) { if (this.fb && this.fb.isEnabled()) this.fb.setEnabled(false); return; }
    const p = { x: f.x, y: f.y + 0.88, z: f.z };
    if (!this.fb) {
      this.fb = g.phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z));
      const c = g.phys.world.createCollider(R.ColliderDesc.capsule(0.58, 0.3).setCollisionGroups(groups(GROUP.WALKER, GROUP.WALKER)), this.fb);
      c.userData = { kind: 'walker', remote: this.uid };
    }
    if (!this.fb.isEnabled()) { this.fb.setEnabled(true); this.fb.setTranslation(p, true); }
    this.fb.setNextKinematicTranslation(p);
  }

  setSolid(on) { this.solid = on; for (const c of this.cols) c.setEnabled(on); }

  physics() {
    this.footBody();
    if (!this.body) return;
    if (!this.solid) {
      const g = this.g, me = g.car.sim.pos;
      let clear = !this.hidden && !this.vanished && Math.hypot(me.x - this.pos.x, me.y - this.pos.y, me.z - this.pos.z) > 5.5;
      if (clear) for (const c of g.cars) if (Math.hypot(c.sim.pos.x - this.pos.x, c.sim.pos.z - this.pos.z) < 6) { clear = false; break; }
      if (clear) this.setSolid(true);
    }
    const b = this.body, t = b.translation(), q = b.rotation();
    const ex = this.pos.x - t.x, ey = this.pos.y - t.y, ez = this.pos.z - t.z;
    if (Math.hypot(ex, ey, ez) > 4) {
      b.setTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, true);
      b.setRotation({ x: this.quat.x, y: this.quat.y, z: this.quat.z, w: this.quat.w }, true);
      b.setLinvel({ x: this.vel.x, y: this.vel.y, z: this.vel.z }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    const K = performance.now() < (this.softUntil || 0) ? 1.2 : 10;
    b.setLinvel({ x: this.vel.x + ex * K, y: this.vel.y + ey * K, z: this.vel.z + ez * K }, true);
    const qe = this._qe || (this._qe = new THREE.Quaternion()), qc = this._qc || (this._qc = new THREE.Quaternion());
    qe.copy(this.quat).multiply(qc.set(q.x, q.y, q.z, q.w).invert());
    if (qe.w < 0) qe.set(-qe.x, -qe.y, -qe.z, -qe.w);
    const ang = 2 * Math.acos(Math.min(1, qe.w)), sn = Math.sqrt(Math.max(1e-12, 1 - qe.w * qe.w));
    const w = ang > 1e-4 ? ang * K / sn : 0;
    b.setAngvel({ x: qe.x * w, y: qe.y * w, z: qe.z * w }, true);
  }

  render(dt, camPos, night) {
    const g = this.g, gh = this.ghost;
    if (!this.view) return;
    if (this.paint && this.paint !== this.viewPaint) this.makeView();
    const v = this.view;
    if (this.pendingFx) { const k = this.pendingFx; this.pendingFx = null; if (k === 'depart') { this.departFx(); if (g.ride === this.uid && this.dy !== null) g.followJump(this.dy); } else this.arriveFx(); }
    if (this.vanished) {
      v.root.visible = false; this.tag.style.display = 'none';
      if (this.driver && this.driver.root) this.driver.root.visible = false;
      if (this.solid) this.setSolid(false);
      return;
    }
    const dist = camPos.distanceTo(this.pos), hidden = this.hidden;
    v.root.visible = dist < FAR && !hidden;
    if (hidden && this.solid) this.setSolid(false);
    gh.vel.copy(this.vel); gh.speed = this.vel.length(); gh.steerAngle = this.steer; gh.brakeOn = this.flags & 1;
    const fspd = this.vel.dot(this.fwd);
    for (const w of gh.wheels) { w.steer = w.front ? this.steer : 0; w.spin += fspd / w.r * dt; }
    const th = gh.thrusters, z = this.nozzles;
    th.extend += (((this.flags & 16) ? 1 : 0) - th.extend) * Math.min(1, dt * 5);
    th.flap = Math.min(1, th.extend / 0.6);
    th.sideDeploy += (((this.flags & 32) ? 1 : 0) - th.sideDeploy) * Math.min(1, dt * 6);
    const ground = g.valley ? (x, zz) => g.valley.heightAt(x, zz) : () => 0;
    th.all.forEach((n, i) => {
      const valve = z.length >= i * 2 + 2 ? Number(z[i * 2]) / 9 : 0;
      const pitch = z.length >= i * 2 + 2 ? B36.indexOf(z[i * 2 + 1]) / 35 * 2.3 - 0.6 : 0;
      n.lastValve = n.valve; n.valve = valve; n.pitch = pitch; n.side = 0;
      n.puff = valve > 0.02 && n.lastValve <= 0.02 ? 1 : valve <= 0.02 && n.lastValve > 0.02 ? -1 : 0;
      thrustDir(n.b, pitch, 0, n.dir);
      if (n.group === 'front') n.pos.set(n.base.x, n.base.y, n.base.z + g.tu.thrusters.front.deploy_travel_m * th.extend);
      else if (n.group === 'side') n.pos.set(n.base.x, n.base.y - g.tu.thrusters.side.deploy_travel_m * th.sideDeploy, n.base.z);
      const ex = new THREE.Vector3(-n.dir.x, -n.dir.y, -n.dir.z).applyQuaternion(this.quat);
      const wp = new THREE.Vector3(n.pos.x, n.pos.y, n.pos.z).applyQuaternion(this.quat).add(this.pos);
      n.frost = 0;
      n.groundDist = ex.y < -0.3 ? Math.max(0, (wp.y - ground(wp.x, wp.z)) / -ex.y) : 99;
    });
    v.doorTarget = (this.flags & 2) ? 1 : 0;
    if (v.hasClip && v.hasClip('wing_deploy')) v.setWing(!!(this.flags & 4));
    v.setRoof(!(this.flags & 8));
    v.sync(dt, gh, { pos: this.pos, quat: this.quat }, night);
    if (dist < 300 && g.fx) g.fx.thrusters(dt, gh, this.quat, this.pos, camPos);
    this.avatar(dt, dist);
    const hp = this.ride ? (this.ride === this.on.uid ? g.car.pose.pos : (this.on.remotes.get(this.ride) || {}).pos) : null;
    const tagAt = hp ? hp.clone().add(new THREE.Vector3(0, 2.35, 0)) : this.foot ? new THREE.Vector3(this.walk.pose.x, this.walk.pose.y + 2.2, this.walk.pose.z) : this.pos.clone().add(new THREE.Vector3(0, 1.9, 0));
    this.on.place(this.tag, tagAt, camPos.distanceTo(tagAt));
  }

  avatar(dt, dist) {
    const g = this.g;
    const host = this.ride ? (this.ride === this.on.uid ? g.car && g.car.view : (this.on.remotes.get(this.ride) || {}).view) : null;
    if (!host && dist > NEAR && !this.foot) { if (this.driver && this.driver.root) this.driver.root.visible = false; return; }
    if (!this.driver && !this.driverLoading) {
      this.driverLoading = true;
      const d = new Driver(g);
      d.load(true, this.outfit % 5).then((root) => { this.driver = d; root.name = 'RemoteDriver_' + this.uid; }).catch(() => { this.driverLoading = false; });
      return;
    }
    const d = this.driver; if (!d || !d.ready) return;
    d.root.visible = true;
    if (host) {
      if (d.root.parent !== host.root) d.attach(host.root, false);
      d.setHeadVisible(true);
      d.pose(host, dt, { accelZ: 0, accelX: 0, passenger: true });
    } else if (this.foot) {
      if (d.root.parent !== g.gfx.scene) d.attach(g.gfx.scene, true);
      d.setHeadVisible(true);
      d.walkPose(this.walk, dt, { camYaw: this.walk.yaw, ground: g.valley ? (x, z) => g.valley.heightAt(x, z) : null, overlay: this.flags & 4096 ? 'Walk_Carry_Loop' : null });
    } else {
      if (d.root.parent !== this.view.root) d.attach(this.view.root, false);
      d.setHeadVisible(true);
      d.pose(this.view, dt, { accelZ: 0, accelX: 0 });
    }
  }

  wheelPoints() {
    const g = this.g, out = [];
    for (const [x, z] of [[0.79, -1.396], [-0.79, -1.396]]) {
      const p = new THREE.Vector3(x, 0, z).applyQuaternion(this.quat).add(this.pos);
      p.y = g.valley ? g.valley.heightAt(p.x, p.z) : 0;
      out.push({ x: p.x, y: p.y, z: p.z });
    }
    return out;
  }

  departFx() {
    const g = this.g;
    const ground = g.valley ? g.valley.heightAt(this.pos.x, this.pos.z) : 0;
    const grounded = this.pos.y - ground < 0.8;
    if (g.timeFx) g.timeFx.depart(this.pos.clone(), this.quat.clone(), this.vel, grounded, grounded ? this.wheelPoints() : [], { remote: true });
    if (g.audio) { g.audio.play('tc_boom_double', { pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, gain: 1 }); g.audio.play('tc_fire_whoosh', { pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, gain: 0.8 }); }
    setTimeout(() => { this.vanished = true; }, 350);
  }

  arriveFx() {
    const g = this.g, p = this.pos;
    if (g.fx) {
      g.fx.sparks(p, new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 80);
      for (let i = 0; i < 30; i++) g.fx.add.spawn(p.x + (Math.random() - 0.5) * 3, p.y + 0.4 + Math.random() * 1.2, p.z + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.35 + Math.random() * 0.3, 0.6, 2.5, 0.7, 0.85, 1.8, 1, 2, 0);
    }
    if (g.audio) g.audio.play('tc_arrive_zap', { pos: { x: p.x, y: p.y, z: p.z }, gain: 1 });
  }

  dispose(flash) {
    const g = this.g;
    if (flash && !this.departed && this.vel.length() > 30 && g.fx) {
      g.fx.sparks(this.pos, this.vel.clone().multiplyScalar(0.2), new THREE.Vector3(0, 1, 0), 60);
      for (let i = 0; i < 24; i++) g.fx.add.spawn(this.pos.x, this.pos.y + 0.6, this.pos.z, (Math.random() - 0.5) * 8, Math.random() * 4, (Math.random() - 0.5) * 8, 0.5, 1.5, 4, 0.6, 0.8, 1.6, 1, 2, 0);
      if (g.audio) g.audio.play('tc_boom_double', { pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, gain: 0.8 });
    }
    if (this.view) g.gfx.scene.remove(this.view.root);
    if (this.driver && this.driver.root && this.driver.root.parent) this.driver.root.parent.remove(this.driver.root);
    if (this.body) g.phys.world.removeRigidBody(this.body);
    if (this.fb) g.phys.world.removeRigidBody(this.fb);
    this.tag.remove();
  }
}

export class Online {
  constructor(game) {
    this.g = game;
    this.enabled = game.store.get('online', true) && !new URLSearchParams(location.search).has('offline');
    this.name = game.store.get('name', '') || 'Driver ' + Math.floor(1000 + Math.random() * 9000);
    game.store.set('name', this.name);
    this.remotes = new Map(); this.room = null; this.uid = null; this.status = 'off'; this.sendT = 0; this.offset = 0;
    this.tags = document.createElement('div'); this.tags.className = 'name-tags'; document.body.appendChild(this.tags);
    this._v = new THREE.Vector3(); this.paintMats = new Map();
  }

  matsFor(key) {
    if (!this.paintMats.has(key)) { const m = new CarMaterials(); m.setPaint(key); this.paintMats.set(key, m); }
    return this.paintMats.get(key);
  }

  get count() { return this.status === 'online' ? this.remotes.size + 1 : 0; }

  async start() {
    if (!this.enabled || this.started) return;
    this.started = true; this.status = 'connecting';
    try {
      const [app, auth, db] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-database.js`)]);
      const a = app.getApps().find((x) => x.name === 'roadster88') || app.initializeApp(CONFIG, 'roadster88');
      const au = auth.getAuth(a);
      const cred = await auth.signInAnonymously(au);
      this.uid = cred.user.uid;
      this.F = db; this.db = db.getDatabase(a);
      db.onValue(db.ref(this.db, '.info/serverTimeOffset'), (s) => { this.offset = s.val() || 0; });
      const hits = db.ref(this.db, `roadster88/hits/${this.uid}`);
      db.onChildAdded(hits, (s) => { const h = s.val(); db.remove(s.ref).catch(() => {}); this.receiveHit(h); });
      const reqs = db.ref(this.db, `roadster88/req/${this.uid}`);
      db.onChildAdded(reqs, (s) => { const r = s.val(); db.remove(s.ref).catch(() => {}); this.receiveReq(r); });
      this.status = 'online';
      this.join();
    } catch (e) {
      console.warn('online unavailable', e);
      this.status = 'offline';
    }
  }

  stop() {
    if (this.me) this.F.remove(this.me).catch(() => {});
    this.leaveRoom(false);
    this.status = 'off'; this.started = false;
  }

  setEnabled(on) {
    this.enabled = on; this.g.store.set('online', on);
    if (on) { if (this.status === 'off' || this.status === 'offline') { this.started = false; this.start(); } }
    else this.stop();
  }

  setName(n) {
    this.name = String(n || '').replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 20) || this.name;
    this.g.store.set('name', this.name);
  }

  roomId() { return `${this.g.mapId || 'plate'}_${this.g.eraId()}`; }

  leaveRoom(flash) {
    const F = this.F;
    if (this.unsub) for (const u of this.unsub) u();
    this.unsub = null;
    for (const r of this.remotes.values()) r.dispose(flash);
    this.remotes.clear();
    if (this.me && F) F.remove(this.me).catch(() => {});
    this.me = null; this.room = null;
  }

  join() {
    const F = this.F, id = this.roomId();
    if (id === this.room) return;
    this.leaveRoom(false);
    this.room = id;
    const ref = F.ref(this.db, `roadster88/world/${id}`);
    this.me = F.child(ref, this.uid);
    F.onDisconnect(this.me).remove();
    const now = () => performance.now() / 1000;
    const up = (s) => {
      if (s.key === this.uid) return;
      const d = s.val(); if (!d || Date.now() + this.offset - (d.t || 0) > STALE) return;
      let r = this.remotes.get(s.key);
      if (!r) { r = new Remote(this, s.key); this.remotes.set(s.key, r); }
      r.push(d, now());
    };
    this.unsub = [
      F.onChildAdded(ref, up), F.onChildChanged(ref, up),
      F.onChildRemoved(ref, (s) => { const r = this.remotes.get(s.key); if (r) { r.dispose(true); this.remotes.delete(s.key); } }),
    ];
    this.send();
  }

  send() {
    const g = this.g, s = g.car.sim, w = g.walker, F = this.F;
    if (!this.me || !F) return;
    const th = s.thrusters;
    const nowMs = performance.now();
    const flags = (nowMs - (this.departAt || -1e9) < 2500 ? 128 : 0) | (nowMs - (this.arriveAt || -1e9) < 2500 ? 256 : 0) | (s.brakeOn ? 1 : 0) | (g.car.view.doorTarget > 0.5 ? 2 : 0) | (g.settings.wing ? 4 : 0) | (g.settings.roof ? 0 : 8) | (th.deploy > 0.5 ? 16 : 0) | (th.sideDeploy > 0.5 ? 32 : 0) | (w.active ? 64 : 0) | (g.player && g.player.dead ? 2048 : 0) | (g.interact && g.interact.held ? 4096 : 0);
    const gone = g.tc.state === 'gone';
    const d = {
      n: this.name, o: g.store.get('outfit', 0), t: Math.round(Date.now() + this.offset),
      c: [r3(s.pos.x), r3(s.pos.y), r3(s.pos.z), r3(s.q.x), r3(s.q.y), r3(s.q.z), r3(s.q.w), r2(s.vel.x), r2(s.vel.y), r2(s.vel.z)],
      k: [Math.round(s.steerAngle * 100), flags], z: pack(th), p: g.car.paint || g.settings.paint,
    };
    if (w.active) d.f = [r3(w.pos.x), r3(w.pos.y), r3(w.pos.z), r3(w.yaw), r2(w.speed), w.grounded ? 1 : 0, r2(w.tumble), r2(w.vel.y), w.swim ? 1 : 0];
    if (g.ride) d.r = g.ride;
    if (g.tc.armed || g.tc.state === 'departing') d.dy = g.tc.destination.year;
    if (g.car.given) d.k[1] |= 512;
    if (gone) return;
    F.set(this.me, d).catch(() => {});
  }

  request(uid, a, extra = {}) {
    const F = this.F; if (!F || this.status !== 'online') return;
    F.push(F.ref(this.db, `roadster88/req/${uid}`), { f: this.uid, a, t: Date.now(), ...extra }).catch(() => {});
  }

  receiveReq(r) {
    const g = this.g;
    if (!r || !r.f || !r.a) return;
    if (r.a === 'take') {
      if (g.walker.active && !g.car.given && !g.ride) {
        const s = g.car.sim;
        this.request(r.f, 'given', { c: [r3(s.pos.x), r3(s.pos.y), r3(s.pos.z), r3(s.q.x), r3(s.q.y), r3(s.q.z), r3(s.q.w)] });
        g.giveCar(r.f);
      } else this.request(r.f, 'deny');
    } else if (r.a === 'given' && Array.isArray(r.c)) g.takeGiven(r.c, r.f);
    else if (r.a === 'deny') g.hint('That Roadster is not free', 1.6);
  }

  nearestRemoteCar(p, maxD) {
    let best = null, bd = maxD;
    for (const r of this.remotes.values()) {
      if (!r.view || r.vanished || r.hidden || r.ride) continue;
      const d = Math.hypot(r.pos.x - p.x, r.pos.z - p.z) - 1.2;
      if (d < bd && Math.abs(r.pos.y - p.y) < 2.5) { bd = d; best = r; }
    }
    return best;
  }

  flagDepart() { this.departAt = performance.now(); this.send(); }

  flagArrive() { this.arriveAt = performance.now(); }

  sendHit(uid, J, nrm, pt) {
    const F = this.F; if (!F || this.status !== 'online') return;
    F.push(F.ref(this.db, `roadster88/hits/${uid}`), { f: this.uid, j: Math.round(J), n: [r3(nrm.x), r3(nrm.y), r3(nrm.z)], p: [r2(pt.x), r2(pt.y), r2(pt.z)], t: Date.now() }).catch(() => {});
  }

  receiveHit(h) {
    if (!h || !h.n || !h.p) return;
    const g = this.g, car = g.car, r = this.remotes.get(h.f);
    if (g.damage.recentRemote(car, h.f)) return;
    const n = new THREE.Vector3(h.n[0], h.n[1], h.n[2]), p = new THREE.Vector3(h.p[0], h.p[1], h.p[2]);
    const J = Math.min(120000, h.j || 0);
    car.sim.body.applyImpulseAtPoint({ x: n.x * J * 0.6, y: n.y * J * 0.6, z: n.z * J * 0.6 }, { x: p.x, y: p.y, z: p.z }, true);
    const vn = J / (car.sim.mass * 0.5 * 1.1);
    g.damage.impactAt(car, p, n.clone().negate(), vn, J, 0.5 * car.sim.mass * 0.5 * vn * vn, n.clone().multiplyScalar(-vn), { kind: 'car' });
    if (r) { r.lastHit = performance.now(); r.softUntil = performance.now() + 1200; }
  }

  soften(uid) { const r = this.remotes.get(uid); if (r) r.softUntil = performance.now() + 1200; }

  carStates() { const out = []; for (const r of this.remotes.values()) if (r.view) out.push({ pos: r.pos, vel: r.vel, fwd: r.fwd, left: r.left, up: r.up }); return out; }

  preStep() { for (const r of this.remotes.values()) r.physics(); }

  place(el, p, dist) {
    const cam = this.g.gfx.camera, v = this._v.copy(p).project(cam);
    const show = v.z < 1 && v.z > -1 && dist < 400 && !this.g.paused;
    el.style.display = show ? 'block' : 'none';
    if (!show) return;
    el.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
    el.style.opacity = String(Math.max(0.35, 1 - dist / 400));
  }

  update(dt) {
    if (this.status !== 'online') { this.tags.style.display = 'none'; return; }
    this.tags.style.display = '';
    if (this.roomId() !== this.room) this.join();
    this.sendT += dt;
    if (this.sendT >= RATE) { this.sendT = 0; this.send(); }
    const g = this.g, now = performance.now() / 1000, cam = g.gfx.camera.position, night = g.sky ? g.sky.state.night : 0;
    for (const [uid, r] of this.remotes) {
      if (now - r.last > STALE / 1000) { r.dispose(false); this.remotes.delete(uid); continue; }
      if (!r.sample(now)) continue;
      r.ensure();
      r.render(dt, cam, night);
    }
  }
}
