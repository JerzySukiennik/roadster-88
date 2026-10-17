// Roadster 88 online: one shared world over Firebase (anonymous auth, RTDB under roadster88/), one room per map and era, compact 10 Hz state, interpolated remote Roadsters and avatars with kinematic colliders, impact hand-off, name tags, and flashes when players leave for another era.
import * as THREE from 'three/webgpu';
import { CarView } from './render/carView.js';
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
const RATE = 0.1, DELAY = 0.14, STALE = 20000, NEAR = 70, FAR = 900;
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
  }

  push(d, now) {
    if (!d || !d.c) return;
    this.name = String(d.n || '').slice(0, 20); this.outfit = d.o | 0; this.last = now;
    const prev = this.buf[this.buf.length - 1];
    if (prev && Math.hypot(prev.c[0] - d.c[0], prev.c[1] - d.c[1], prev.c[2] - d.c[2]) > 25) { this.buf.length = 0; this.setSolid(false); }
    this.buf.push({ at: now, c: d.c, k: d.k || [0, 0], z: d.z || '', f: d.f || null });
    if (this.buf.length > 12) this.buf.shift();
    if (this.tag.textContent !== this.name) this.tag.textContent = this.name;
  }

  sample(now) {
    const b = this.buf; if (!b.length) return false;
    const t = now - DELAY;
    let a = b[0], c = b[b.length - 1], k = 0;
    if (t <= a.at) { c = a; }
    else if (t >= c.at) { a = c; }
    else for (let i = 0; i < b.length - 1; i++) if (b[i].at <= t && b[i + 1].at >= t) { a = b[i]; c = b[i + 1]; k = (t - a.at) / Math.max(1e-3, c.at - a.at); break; }
    const A = a.c, C = c.c;
    this.pos.set(A[0] + (C[0] - A[0]) * k, A[1] + (C[1] - A[1]) * k, A[2] + (C[2] - A[2]) * k);
    this.vel.set(A[7] + (C[7] - A[7]) * k, A[8] + (C[8] - A[8]) * k, A[9] + (C[9] - A[9]) * k);
    const qa = new THREE.Quaternion(A[3], A[4], A[5], A[6]), qc = new THREE.Quaternion(C[3], C[4], C[5], C[6]);
    this.quat.slerpQuaternions(qa, qc, k).normalize();
    if (a === c && t > c.at) { const ex = Math.min(0.35, t - c.at); this.pos.addScaledVector(this.vel, ex); }
    this.steer = (c.k[0] || 0) / 100; this.flags = c.k[1] || 0; this.nozzles = c.z;
    this.fwd.set(0, 0, 1).applyQuaternion(this.quat); this.left.set(1, 0, 0).applyQuaternion(this.quat); this.up.set(0, 1, 0).applyQuaternion(this.quat);
    const F = c.f, Fa = a.f;
    if (F) {
      const P = Fa || F;
      this.walk.pose.x = P[0] + (F[0] - P[0]) * k; this.walk.pose.y = P[1] + (F[1] - P[1]) * k; this.walk.pose.z = P[2] + (F[2] - P[2]) * k;
      let dy = F[3] - P[3]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.walk.yaw = P[3] + dy * k; this.walk.speed = F[4]; this.walk.grounded = !!F[5]; this.walk.tumble = F[6] || 0;
      this.foot = this.walk;
    } else this.foot = null;
    return true;
  }

  ensure() {
    const g = this.g;
    if (this.view || !g.template) return;
    this.view = new CarView(g.tu, g.mats, g.template);
    this.view.root.name = 'Remote_' + this.uid;
    g.gfx.scene.add(this.view.root);
    const th = new Thrusters(g.tu);
    const sc = g.car.sim.wheels.map((w) => w.staticCompression);
    const rest = g.tu.suspension.rest_length;
    this.ghost = {
      thrusters: th, vel: new THREE.Vector3(), speed: 0, contacts: 4, steerAngle: 0, brakeOn: 0,
      wheels: g.car.sim.wheels.map((w, i) => ({ name: w.name, i, front: w.front, left: w.left, r: w.r, lost: false, staticCompression: sc[i], length: rest - sc[i], hub: { x: 0, y: 0, z: 0 }, steer: 0, spin: 0, toe: 0, camber: 0 })),
    };
    const R = g.R, world = g.phys.world;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z));
    const h = carHull(g.tu, null);
    this.ud = { kind: 'remote', uid: this.uid, vel: this.vel, mass: g.tu.car.mass };
    for (const pts of [h.body, h.cabin]) {
      const d = R.ColliderDesc.convexHull(pts); if (!d) continue;
      d.setFriction(0.45).setRestitution(0.08).setCollisionGroups(groups(GROUP.CAR, GROUP.STATIC | GROUP.CAR | GROUP.PROP | GROUP.DEBRIS));
      const col = world.createCollider(d, this.body); col.userData = this.ud; col.setEnabled(false); this.cols.push(col);
    }
  }

  setSolid(on) { this.solid = on; for (const c of this.cols) c.setEnabled(on); }

  physics() {
    if (!this.body) return;
    if (!this.solid) {
      const g = this.g, me = g.car.sim.pos;
      let clear = Math.hypot(me.x - this.pos.x, me.y - this.pos.y, me.z - this.pos.z) > 7;
      if (clear) for (const c of g.cars) if (Math.hypot(c.sim.pos.x - this.pos.x, c.sim.pos.z - this.pos.z) < 6) { clear = false; break; }
      if (clear) this.setSolid(true);
    }
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
    this.body.setNextKinematicRotation({ x: this.quat.x, y: this.quat.y, z: this.quat.z, w: this.quat.w });
  }

  render(dt, camPos, night) {
    const g = this.g, gh = this.ghost, v = this.view;
    if (!v) return;
    const dist = camPos.distanceTo(this.pos);
    v.root.visible = dist < FAR;
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
      const mine = g.car.sim.thrusters.all[i]; n.frost = mine ? mine.frost : 0;
      n.groundDist = ex.y < -0.3 ? Math.max(0, (wp.y - ground(wp.x, wp.z)) / -ex.y) : 99;
    });
    v.doorTarget = (this.flags & 2) ? 1 : 0;
    if (v.hasClip && v.hasClip('wing_deploy')) v.setWing(!!(this.flags & 4));
    v.setRoof(!(this.flags & 8));
    const u = g.mats.u, keep = [u.head.value, u.tail.value, u.brake.value];
    v.sync(dt, gh, { pos: this.pos, quat: this.quat }, night);
    u.head.value = keep[0]; u.tail.value = keep[1]; u.brake.value = keep[2];
    if (dist < 300 && g.fx) g.fx.thrusters(dt, gh, this.quat, this.pos, camPos);
    this.avatar(dt, dist);
    const tagAt = this.foot ? new THREE.Vector3(this.walk.pose.x, this.walk.pose.y + 2.2, this.walk.pose.z) : this.pos.clone().add(new THREE.Vector3(0, 1.9, 0));
    this.on.place(this.tag, tagAt, dist);
  }

  avatar(dt, dist) {
    const g = this.g;
    if (dist > NEAR && !this.foot) { if (this.driver && this.driver.root) this.driver.root.visible = false; return; }
    if (!this.driver && !this.driverLoading) {
      this.driverLoading = true;
      const d = new Driver(g);
      d.load(true, this.outfit % 5).then((root) => { this.driver = d; root.name = 'RemoteDriver_' + this.uid; }).catch(() => { this.driverLoading = false; });
      return;
    }
    const d = this.driver; if (!d || !d.ready) return;
    d.root.visible = true;
    if (this.foot) {
      if (d.root.parent !== g.gfx.scene) d.attach(g.gfx.scene, true);
      d.setHeadVisible(true);
      d.walkPose(this.walk, dt, { camYaw: this.walk.yaw, ground: g.valley ? (x, z) => g.valley.heightAt(x, z) : null });
    } else {
      if (d.root.parent !== this.view.root) d.attach(this.view.root, false);
      d.setHeadVisible(true);
      d.pose(this.view, dt, { accelZ: 0, accelX: 0 });
    }
  }

  dispose(flash) {
    const g = this.g;
    if (flash && this.vel.length() > 30 && g.fx) {
      g.fx.sparks(this.pos, this.vel.clone().multiplyScalar(0.2), new THREE.Vector3(0, 1, 0), 60);
      for (let i = 0; i < 24; i++) g.fx.add.spawn(this.pos.x, this.pos.y + 0.6, this.pos.z, (Math.random() - 0.5) * 8, Math.random() * 4, (Math.random() - 0.5) * 8, 0.5, 1.5, 4, 0.6, 0.8, 1.6, 1, 2, 0);
      if (g.audio) g.audio.play('tc_boom_double', { pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, gain: 0.8 });
    }
    if (this.view) g.gfx.scene.remove(this.view.root);
    if (this.driver && this.driver.root && this.driver.root.parent) this.driver.root.parent.remove(this.driver.root);
    if (this.body) g.phys.world.removeRigidBody(this.body);
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
    this._v = new THREE.Vector3();
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
    const flags = (s.brakeOn ? 1 : 0) | (g.car.view.doorTarget > 0.5 ? 2 : 0) | (g.settings.wing ? 4 : 0) | (g.settings.roof ? 0 : 8) | (th.deploy > 0.5 ? 16 : 0) | (th.sideDeploy > 0.5 ? 32 : 0) | (w.active ? 64 : 0);
    const gone = g.tc.state === 'gone';
    const d = {
      n: this.name, o: g.store.get('outfit', 0), t: Math.round(Date.now() + this.offset),
      c: [r3(s.pos.x), r3(s.pos.y), r3(s.pos.z), r3(s.q.x), r3(s.q.y), r3(s.q.z), r3(s.q.w), r2(s.vel.x), r2(s.vel.y), r2(s.vel.z)],
      k: [Math.round(s.steerAngle * 100), flags], z: pack(th),
    };
    if (w.active) d.f = [r3(w.pos.x), r3(w.pos.y), r3(w.pos.z), r3(w.yaw), r2(w.speed), w.grounded ? 1 : 0, r2(w.tumble)];
    if (gone) return;
    F.set(this.me, d).catch(() => {});
  }

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
    if (r) r.lastHit = performance.now();
  }

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
