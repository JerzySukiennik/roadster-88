// Roadster 88 side jobs, repeatable and outside the story: couriers across eras (carry cargo in the frunk from one year to another), taxis (drive a passenger to a place in another year; in co-op a friend riding along is the fare) and chases (lose the 2026 police or the 1885 sheriff), started at light beams in the world or from the Jobs app on the tablet; each job keeps a plain completed count and nothing else.
import * as THREE from 'three/webgpu';
import { Agent, steerGround } from '../life/agents.js';
import { colors } from '../life/palette.js';
import { warmUp } from './props.js';

const KEY = 'r88.side.v1';
const DINO = -66000000;
const yearName = (y) => (y < 0 ? 'the Cretaceous' : String(y));
const LABEL = { seed: 'seed pod', parcel: 'parcel' };
const BUSY = new Set(['1.race', '2.hack', '2.roof', '2.escape']);
export const JOBS = [
  { id: 'seed', type: 'courier', name: 'Seed of Life', blurb: 'A glowing seed pod from Dry Lake in the Cretaceous for the 2080 park greenhouse', from: { year: DINO, at: 'lake', off: [40, 30] }, to: { year: 2080, at: 'park' }, item: 'seed' },
  { id: 'mail', type: 'courier', name: 'Late Mail', blurb: 'An 1885 parcel for the Gzowo Springs post office in 2026. Only 141 years late', from: { year: 1885, at: 'town', off: [-30, 40] }, to: { year: 2026, at: 'town', off: [20, -30] }, item: 'parcel' },
  { id: 'capsule', type: 'courier', name: 'Time Capsule', blurb: 'Bury a 2026 time capsule out on the 1885 mesa', from: { year: 2026, at: 'workshop' }, to: { year: 1885, at: 'mesa' }, item: 'parcel' },
  { id: 'cowboy', type: 'taxi', name: 'Cowboy Commute', blurb: 'A cowboy wants to see the future. Drive him to the 2080 park', from: { year: 1885, at: 'town', off: [40, 20] }, to: { year: 2080, at: 'park', off: [30, 0] }, fare: 'human_m1885' },
  { id: 'tourist', type: 'taxi', name: 'Dino Tour', blurb: 'A tourist wants to see real dinosaurs. Drive her to Dry Lake in the Cretaceous', from: { year: 2026, at: 'town', off: [-40, -20] }, to: { year: DINO, at: 'lake', off: [-30, 50] }, fare: 'human_f2026' },
  { id: 'police', type: 'chase', name: 'Speed Trap', blurb: 'The 2026 police want a word about that thruster. Lose them', from: { year: 2026, at: 'jumps' }, chaser: 'car_sedan', speed: 40, lose: 420 },
  { id: 'sheriff', type: 'chase', name: 'Wanted', blurb: 'The 1885 sheriff thinks your carriage is witchcraft. Outrun him', from: { year: 1885, at: 'town', off: [90, -60] }, chaser: 'horse', rider: 'human_m1885', speed: 15, lose: 300 },
];

export class SideJobs {
  constructor(S) {
    this.S = S; this.g = S.g; this.st = this.load(); this.job = null; this.cargo = []; this.allowTake = false;
    this.places = new Map(); this.markers = new Map(); this.t = 0; this.nearJob = null;
    this.root = new THREE.Group(); this.root.name = 'SideJobs'; this.g.gfx.scene.add(this.root);
    this.beamMat = this.beamMaterial(0x3e8bff); this.goalMat = this.beamMaterial(0xffb648);
    this.goal = this.beam(this.goalMat); this.goal.visible = false; this.root.add(this.goal);
    this.lightA = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x2f6bff, emissiveIntensity: 0 });
    this.lightB = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xe8eeff, emissiveIntensity: 0 });
    this.bar = new THREE.Group();
    for (const [x, m] of [[-0.32, this.lightA], [0.32, this.lightB]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.26), m); b.position.x = x; this.bar.add(b); }
    this.bar.visible = false; this.root.add(this.bar);
    const w = this.beam(this.beamMat); w.add(this.bar.clone()); warmUp(this.g, w);
  }

  load() { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && s.done ? s : { done: {} }; } catch (e) { return { done: {} }; } }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.st)); } catch (e) { /* private mode */ } }

  beamMaterial(hex) { return new THREE.MeshBasicMaterial({ color: hex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); }

  beam(mat) {
    const g = new THREE.Group(), geo = new THREE.CylinderGeometry(1.6, 1.6, 90, 20, 6, true), pos = geo.attributes.position, col = [];
    for (let i = 0; i < pos.count; i++) { const k = Math.pow(1 - (pos.getY(i) + 45) / 90, 2.2) * 0.55; col.push(k, k, k); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const c = new THREE.Mesh(geo, mat); c.position.y = 45; c.renderOrder = 4; g.add(c);
    const rg = new THREE.RingGeometry(3.2, 3.8, 40), rc = []; for (let i = 0; i < rg.attributes.position.count; i++) rc.push(0.9, 0.9, 0.9);
    rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
    const r = new THREE.Mesh(rg, mat); r.rotation.x = -Math.PI / 2; r.position.y = 0.15; g.add(r);
    return g;
  }

  count() { return Object.values(this.st.done).reduce((a, b) => a + b, 0); }
  here(year) { return this.S.inYear(year); }
  busy() { const S = this.S, s = S.step; return !!(S.dlgOpen || this.g.ride || (s && BUSY.has(s.id)) || (this.g.space && this.g.space.active)); }
  me() { return this.S.player(); }
  dist(p) { return this.S.dist(p); }

  place(job, end) {
    const spec = job[end], key = job.id + ':' + end;
    if (this.places.has(key)) return this.places.get(key);
    if (!this.here(spec.year)) return null;
    const S = this.S, A = S.st.anchors, V = this.g.valley, lm = (id) => (V.landmarks || []).find((l) => l.id === id);
    let c = null;
    if (spec.at === 'town' && A.town) c = { x: A.town.x, z: A.town.z };
    else if (spec.at === 'workshop' && A.workshop) c = { x: A.workshop.x + 16, z: A.workshop.z + 10 };
    else if (spec.at === 'park' && A.park) c = { x: (A.park.x0 + A.park.x1) / 2, z: (A.park.z0 + A.park.z1) / 2 };
    else if (lm(spec.at)) c = { x: lm(spec.at).x, z: lm(spec.at).z };
    if (!c) return null;
    if (spec.off) { c.x += spec.off[0]; c.z += spec.off[1]; }
    const p = S.props.findSpot(c.x, c.z, 2.5, 2.5, 0, 180) || { x: c.x, z: c.z, y: V.heightAt(c.x, c.z) };
    this.places.set(key, p);
    return p;
  }

  start(job) {
    if (this.job || this.busy()) return false;
    if (!this.here(job.from.year)) { this.g.hint(`${job.name} starts in ${yearName(job.from.year)}`, 3); return false; }
    const at = this.place(job, 'from'); if (!at) return false;
    this.job = { def: job, phase: 'go', t: 0, at, free: 0, grab: 0 };
    this.g.hint(`Job: ${job.name}`, 2.5);
    if (this.g.audio) this.g.audio.play('ui_toggle', { inside: true, gain: 0.6 });
    this.dirty();
    return true;
  }

  begin() {
    const j = this.job, D = j.def, g = this.g, at = j.at;
    if (D.type === 'courier') { j.item = g.interact.spawnItem(D.item, { x: at.x, y: at.y + 0.6, z: at.z }); j.item.sideJob = D.item; j.phase = 'pick'; }
    if (D.type === 'taxi') {
      const o = g.online, friend = o && o.status === 'online' && !g.walker.active ? [...o.remotes.values()].find((r) => r.ride === o.uid) : null;
      if (friend) { j.friend = friend.uid; j.phase = 'drive'; g.hint('Your friend is the passenger', 2.5); }
      else { j.fare = this.agent(D.fare, 'story', at.x + 2, at.z + 1.5); j.phase = 'board'; }
    }
    if (D.type === 'chase') {
      const p = this.me(), a = Math.atan2(at.x - p.x, at.z - p.z), x = at.x - Math.sin(a) * 45, z = at.z - Math.cos(a) * 45;
      j.chaser = this.agent(D.chaser, 'story', x, z, D.chaser === 'car_sedan' ? [[0.03, 0.04, 0.08, 0], [0, 0, 0, 0]] : null);
      if (D.rider) j.rider = this.agent(D.rider, 'seat', x, z);
      j.phase = 'run';
      g.hint(D.id === 'police' ? 'Here come the police!' : 'Here comes the sheriff!', 2.5);
      if (g.audio) g.audio.play('tc_crackle', { inside: true, gain: 0.5 });
    }
  }

  agent(kind, brain, x, z, col) {
    const life = this.g.life, h = { kind, a: null, gone: false };
    if (!life) return h;
    life.kind(kind).then((K) => {
      if (h.gone) return;
      const [c0, c1] = col || colors(kind, Math.random());
      const a = new Agent(kind, { x, z, yaw: 0, brain, c0, c1 }); a.K = K; a.y = this.g.valley.heightAt(x, z); a.clip = 'idle'; a.prev = null; a.fade = 1; a.rest = 'idle';
      if (brain === 'seat') a.seatOn = true;
      h.a = a; life.agents.push(a);
    }).catch((e) => console.warn('side job agent', kind, e));
    return h;
  }

  drop(h) { if (!h) return; h.gone = true; const life = this.g.life; if (h.a && life) { const i = life.agents.indexOf(h.a); if (i >= 0) life.agents.splice(i, 1); } h.a = null; }

  end(ok, msg) {
    const j = this.job; if (!j) return;
    if (j.item && this.g.interact.items.includes(j.item)) this.g.interact.removeItem(j.item);
    this.drop(j.fare); this.drop(j.chaser); this.drop(j.rider);
    this.cargo = []; this.allowTake = false; this.bar.visible = false; this.goal.visible = false;
    if (ok) { this.st.done[j.def.id] = (this.st.done[j.def.id] || 0) + 1; this.save(); }
    this.g.hint(msg || (ok ? `Job done: ${j.def.name}` : `Job failed: ${j.def.name}`), 3);
    if (this.g.audio) this.g.audio.play(ok ? 'tc_arrive_zap' : 'ui_tap', { inside: true, gain: ok ? 0.45 : 0.6 });
    this.job = null;
    const S = this.S, o = S.ob; S.el.text.textContent = '';
    if (o) S.objective(...o); else S.objective(null);
    this.dirty();
  }

  cancel() { if (this.job) this.end(false, 'Job cancelled'); }

  dirty() { if (this.g.cockpit) this.g.cockpit.dirty = true; }

  objective(text, target = null, meta = '') {
    const S = this.S, E = S.el;
    E.ch.textContent = `Job · ${this.job.def.name}`;
    if (E.text.textContent !== text) { E.text.textContent = text; E.obj.classList.remove('pulse'); void E.obj.offsetWidth; E.obj.classList.add('pulse'); }
    E.obj.classList.add('on');
    S.target = target; S.meta = meta;
  }

  heldCargo() { const I = this.g.interact; if (!I.held) return null; return I.items.find((x) => x.body === I.held.body && x.sideJob) || null; }

  frunkLabel() {
    const it = this.heldCargo();
    if (it) return `Put ${it.label} in the frunk`;
    if (this.allowTake && this.cargo.length) return `Take ${LABEL[this.cargo[this.cargo.length - 1]] || 'cargo'} from the frunk`;
    return null;
  }

  frunkUse() {
    const I = this.g.interact, it = this.heldCargo(), S = this.S;
    if (it) { I.held = null; I.removeItem(it); if (this.job && this.job.item === it) this.job.item = null; this.cargo.push(it.sideJob); if (this.g.audio) this.g.audio.play('door_close', { pos: S.frontOfCar(), gain: 0.6 }); return true; }
    if (this.allowTake && this.cargo.length) {
      const kind = this.cargo.pop(), p = S.frontOfCar(), item = I.spawnItem(kind, { x: p.x, y: p.y + 0.5, z: p.z });
      item.sideJob = kind; if (this.job) this.job.item = item; I.pick(item.body, item.col); return true;
    }
    return false;
  }

  update(dt) {
    const g = this.g; if (!g.started || g.paused) return;
    this.t += dt;
    this.markersUpdate();
    const j = this.job; if (!j) return;
    j.t += dt;
    const D = j.def;
    if (j.phase === 'go') {
      if (!this.here(D.from.year)) { this.objective(`Jump to ${yearName(D.from.year)} to start the job`); return; }
      this.objective(D.type === 'taxi' ? 'Drive to your passenger' : D.type === 'chase' ? 'Drive into the beam to start' : 'Go to the pickup', j.at);
      if (this.dist(j.at) < (D.type === 'courier' ? 5 : 12)) this.begin();
      return;
    }
    if (D.type === 'courier') this.courier(j, D);
    else if (D.type === 'taxi') this.taxi(j, D, dt);
    else this.chase(j, D, dt);
  }

  courier(j, D) {
    const held = !!this.heldCargo(), stowed = this.cargo.includes(D.item), name = LABEL[D.item];
    if (j.phase === 'pick') {
      if (stowed) { j.phase = 'carry'; return; }
      const p = j.item && this.g.interact.items.includes(j.item) ? j.item.body.translation() : j.at;
      this.objective(held ? `Put the ${name} in the frunk (E at the front of the car)` : `Pick up the ${name}`, held ? null : { x: p.x, y: p.y, z: p.z });
      return;
    }
    if (!this.here(D.to.year)) { this.allowTake = false; this.goal.visible = false; this.objective(stowed ? `Jump to ${yearName(D.to.year)} with the ${name}` : `Put the ${name} back in the frunk`, null); return; }
    const to = this.place(D, 'to'); if (!to) return;
    this.goalAt(to); this.allowTake = this.dist(to) < 60;
    if (held && this.dist(to) < 4) { const it = this.heldCargo(); this.g.interact.held = null; this.g.interact.removeItem(it); j.item = null; this.end(true, `Delivered: ${D.name}`); return; }
    this.objective(held ? `Carry the ${name} into the beam` : this.allowTake ? `Take the ${name} out of the frunk` : `Bring the ${name} to the beam`, to);
  }

  taxi(j, D, dt) {
    const g = this.g, o = g.online;
    if (j.phase === 'board') {
      const a = j.fare && j.fare.a, car = g.car.sim.pos;
      if (!a) { this.objective('Pick up your passenger', j.at); return; }
      const d = Math.hypot(car.x - a.x, car.z - a.z), slow = !g.walker.active && g.car.sim.speed < 3;
      this.objective(slow && d < 14 ? 'Wait for your passenger to get in' : 'Pull up next to your passenger and stop', { x: a.x, y: a.y, z: a.z });
      if (slow && d < 14) { a.tx = car.x; a.tz = car.z; a.want = 1.6; steerGround(g.life, a, dt, { arrive: 1.8 }); if (d < 2.6) { this.drop(j.fare); j.fare = null; j.phase = 'drive'; g.hint('Passenger on board', 2); if (g.audio) g.audio.play('door_close', { pos: car, gain: 0.7 }); } }
      else { a.want = 0; a.speed = 0; }
      return;
    }
    if (j.friend) {
      const r = o && o.remotes.get(j.friend);
      j.lost = r ? 0 : (j.lost || 0) + dt;
      if ((r && r.ride !== o.uid) || j.lost > 15) { this.end(false, 'Your passenger got out'); return; }
    }
    if (!j.friend && g.walker.active) { this.objective('Get back in, your passenger is waiting', null); return; }
    if (!this.here(D.to.year)) { this.goal.visible = false; this.objective(`Take your passenger to ${yearName(D.to.year)}`, null, j.friend ? 'Passenger: your friend' : ''); return; }
    const to = this.place(D, 'to'); if (!to) return;
    this.goalAt(to);
    this.objective('Stop in the beam to drop off your passenger', to);
    if (this.dist(to) < 8 && g.car.sim.speed < 2.5) {
      if (!j.friend) { const p = g.car.sim.pos, a = this.agent(D.fare, 'story', p.x + 2.2, p.z + 1.2); setTimeout(() => this.drop(a), 9000); }
      this.end(true, 'Fare delivered');
    }
  }

  chase(j, D, dt) {
    const g = this.g, c = j.chaser && j.chaser.a;
    if (!this.here(D.from.year)) { this.end(true, 'Time-jumped away! They will never find you'); return; }
    if (!c) { this.objective('Get ready to run', null); return; }
    const me = this.me(), d = Math.hypot(me.x - c.x, me.z - c.z);
    if (!c.down) { c.tx = me.x; c.tz = me.z; c.want = Math.min(D.speed, Math.sqrt(2 * 10 * Math.max(0, d - 10))); steerGround(g.life, c, dt, { turn: D.chaser === 'horse' ? 3 : 1.8, accel: D.chaser === 'horse' ? 6 : 11, arrive: 3 }); }
    const r = j.rider && j.rider.a;
    if (r) { const f = Math.sin(c.yaw), k = Math.cos(c.yaw); r.x = c.x - f * 0.15; r.z = c.z - k * 0.15; r.y = c.y + 0.98; r.yaw = c.yaw; r.pitch = c.pitch || 0; r.roll = c.roll || 0; }
    if (D.chaser === 'car_sedan') {
      const f = Math.sin(c.yaw), k = Math.cos(c.yaw), on = Math.floor(this.t * 6) % 2;
      this.bar.visible = true; this.bar.position.set(c.x - f * 0.2, c.y + 1.5, c.z - k * 0.2); this.bar.rotation.set(c.pitch || 0, c.yaw, c.roll || 0, 'YXZ');
      this.lightA.emissiveIntensity = on ? 4 : 0.2; this.lightB.emissiveIntensity = on ? 0.2 : 3;
    }
    const crashed = c.down && d > 40;
    j.grab = d < 13 ? j.grab + dt : Math.max(0, j.grab - dt * 0.5);
    j.free = d > D.lose || crashed ? j.free + dt : 0;
    this.objective(D.id === 'police' ? 'Lose the police' : 'Outrun the sheriff', null, crashed ? 'They crashed!' : `${Math.round(d)} m behind you · lose them at ${D.lose} m`);
    if (j.grab > 2.2) this.end(false, D.id === 'police' ? 'Pulled over! Try again' : 'The sheriff got you! Try again');
    else if (j.free > 3) this.end(true, 'You got away!');
  }

  goalAt(p) { this.goal.visible = true; this.goal.position.set(p.x, p.y, p.z); }

  markersUpdate() {
    const g = this.g, show = !this.job && !this.busy();
    let near = null;
    for (const job of JOBS) {
      let m = this.markers.get(job.id);
      const here = show && this.here(job.from.year);
      if (here && !m) {
        const p = this.place(job, 'from'); if (!p) continue;
        m = { obj: this.beam(this.beamMat), p, spot: null };
        m.obj.position.set(p.x, p.y, p.z); this.root.add(m.obj); this.markers.set(job.id, m);
        m.spot = { radius: 3.4, label: `Start job: ${job.name}`, pos: () => m.p, enabled: () => !this.job && !this.busy() && this.here(job.from.year), onUse: () => this.start(job) };
        m.off = g.interact.add(m.spot);
      }
      if (!m) continue;
      m.obj.visible = here;
      if (here && !g.walker.active && this.dist(m.p) < 9) near = job;
    }
    if (near && near !== this.nearJob) g.hint(`E · Start job: ${near.name}`, 2.5);
    this.nearJob = near;
    if (near && g.input && g.input.hit('KeyE')) this.start(near);
  }

  drawBoard(g, cockpit, K) {
    const { W, C, FONT, rr } = K, era = this.g.eraId();
    g.textBaseline = 'alphabetic';
    g.font = `600 13px ${FONT}`; g.fillStyle = C.faint; g.fillText('JOBS', 48, 92);
    g.textAlign = 'right'; g.fillText(`DONE ${this.count()}`, W - 48, 92); g.textAlign = 'left';
    const cw = (W - 96 - 24) / 2, ch = 128;
    JOBS.forEach((job, i) => {
      const x = 48 + (i % 2) * (cw + 24), y = 108 + Math.floor(i / 2) * (ch + 14);
      const here = era === this.S.period(job.from.year), active = this.job && this.job.def.id === job.id, n = this.st.done[job.id] || 0;
      const hot = cockpit.btn('job_' + job.id, x, y, cw, ch, () => { if (active) this.cancel(); else this.start(job); this.dirty(); });
      g.fillStyle = active ? 'rgba(62,139,255,0.18)' : hot ? 'rgba(255,255,255,0.09)' : C.panel; rr(g, x, y, cw, ch, 18); g.fill();
      if (active) { g.fillStyle = C.blue; g.fillRect(x, y + 22, 3, ch - 44); }
      g.font = `600 22px ${FONT}`; g.fillStyle = C.ink; g.fillText(job.name, x + 24, y + 38);
      g.font = `500 13px ${FONT}`; g.fillStyle = here ? C.blue : C.faint; g.textAlign = 'right';
      g.fillText(`${job.type.toUpperCase()} · ${yearName(job.from.year).replace('the ', '').toUpperCase()}`, x + cw - 24, y + 36); g.textAlign = 'left';
      g.font = `400 15px ${FONT}`; g.fillStyle = C.dim;
      const words = job.blurb.split(' '); let line = '', ly = y + 66;
      for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > cw - 48) { g.fillText(line, x + 24, ly); line = w; ly += 20; } else line = t; }
      if (line) g.fillText(line, x + 24, ly);
      g.font = `500 14px ${FONT}`; g.fillStyle = active ? C.ink : C.faint;
      g.fillText(active ? 'Active · tap to cancel' : n ? `Done ×${n}` : here ? 'Tap to start' : `Starts in ${yearName(job.from.year)}`, x + 24, y + ch - 16);
    });
  }
}
