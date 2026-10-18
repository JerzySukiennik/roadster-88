// Roadster 88 story director: runs the chapters step by step (objective panel, on-screen waypoint, dialogue with choices, radio lines, title cards), keeps the timeline flag that swaps the world between the normal present and the Kessler present, the Roadster's frunk for story items, and saves progress in the browser.
import * as THREE from 'three/webgpu';
import { eraOf } from '../sim/timetravel.js';
import { Props } from './props.js';
import { NPCs } from './npc.js';
import { CHAPTERS } from './chapters.js';
import { Voice } from './voice.js';
import { voiceOf } from './lines.js';
import { Coop } from './coop.js';
import { Drones } from './drones.js';
import { SideJobs } from './side.js';

const KEY = 'r88.story.v1';
const $ = (id) => document.getElementById(id);

export class Story {
  constructor(game) {
    this.g = game; this.props = new Props(game); this.npc = new NPCs(game); this.voice = new Voice(game);
    this.el = { obj: $('storyObj'), ch: $('soCh'), text: $('soText'), meta: $('soMeta'), wp: $('storyWp'), wpd: $('wpDist'), radio: $('storyRadio'), rw: $('srWho'), rt: $('srText'), dlg: $('storyDlg'), dw: $('sdWho'), dt: $('sdText'), dc: $('sdChoices'), dh: $('sdHint'), title: $('storyTitle'), tm: $('stMain'), ts: $('stSub') };
    this.steps = CHAPTERS.flatMap((c) => c.steps.map((s) => ({ ...s, chapter: c })));
    this.st = this.load();
    this.i = -1; this.target = null; this.radioQ = []; this.dlgOpen = null; this.spots = []; this.t = 0; this.events = [];
    this.items = new Map(); this.itemSerial = 0; this.spotSerial = 0; this.dlgSerial = 0; this.radioSerial = 0; this.titleSerial = 0; this.titleLast = 0; this.net = null;
    this.coop = new Coop(this); this.drones = new Drones(game); this.side = new SideJobs(this);
    this._v = new THREE.Vector3();
    addEventListener('keydown', (e) => this.key(e), true);
    if (game.valley && game.valley.onLocation) game.valley.onLocation(() => this.applyWorld());
    const fs = { radius: 2.4, holding: true, pos: () => this.frontOfCar(), enabled: () => !!this.frunkLabel(), onUse: () => this.frunkUse() };
    Object.defineProperty(fs, 'label', { get: () => this.frunkLabel() });
    game.interact.add(fs);
    const at = this.steps.findIndex((s) => s.id === this.st.step);
    if (this.st.done && at >= 0 && at + 1 < this.steps.length) { this.st.done = false; this.goto(at + 1); return; }
    if (this.st.done) { this.applyWorld(); return; }
    this.goto(Math.max(0, at));
  }

  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (new URLSearchParams(location.search).get('story') === 'reset') s = null;
    return s || { step: CHAPTERS[0].steps[0].id, flags: { timeline: 'normal' }, frunk: [], anchors: {}, done: false };
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.st)); } catch (e) { /* private mode */ } }

  get flags() { return this.st.flags; }
  get step() { return this.steps[this.i]; }

  goto(i) {
    const prev = this.step;
    if (prev && prev.exit) prev.exit(this);
    for (const s of this.spots) s.off(); this.spots = [];
    this.i = i; this.target = null; this.meta = ''; this.net = null;
    const s = this.step; if (!s) return;
    this.st.step = s.id; this.save();
    this.applyWorld();
    if (!prev || prev.chapter !== s.chapter) {
      this.title(s.chapter.title, s.chapter.name, 4);
      const ci = CHAPTERS.indexOf(s.chapter); this.voice.prefetch(`c${ci}_`); this.voice.prefetch(`c${ci + 1}_`);
    }
    this.sdone = false;
    if (s.enter) s.enter(this);
  }

  next() { this.sdone = true; }

  jump(id) { const i = this.steps.findIndex((s) => s.id === id); if (i >= 0) this.goto(i); }

  finish() {
    this.st.done = true; this.save();
    this.objective(null);
  }

  earth() { const L = this.g.valley && this.g.valley.location; return !!(L && L.mode === 'earth'); }

  period(year) { return eraOf(year).id; }
  inYear(year) { return this.g.eraId() === this.period(year); }

  player() { const g = this.g, host = g.ride && g.online && g.online.remotes.get(g.ride); return host ? host.pos : g.walker.active ? g.walker.pos : g.car.sim.pos; }
  near(p, r) { if (!p) return false; const q = this.player(); return Math.hypot(q.x - p.x, q.z - p.z) < r; }
  dist(p) { const q = this.player(); return Math.hypot(q.x - p.x, q.z - p.z); }
  anyNear(p, r, ok) { if (!p) return false; for (const q of this.drones.players()) if (Math.hypot(q.x - p.x, q.z - p.z) < r && (!ok || ok(q))) return true; return false; }

  objective(text, target = null, meta = '') {
    this.ob = [text, target, meta];
    if (this.side && this.side.job) return;
    const E = this.el;
    this.target = target; this.meta = meta;
    if (!text) { E.obj.classList.remove('on'); E.wp.classList.remove('on'); return; }
    const s = this.step;
    E.ch.textContent = s ? `${s.chapter.title} · ${s.chapter.name}` : '';
    if (E.text.textContent !== text) { E.text.textContent = text; E.obj.classList.remove('pulse'); void E.obj.offsetWidth; E.obj.classList.add('pulse'); if (this.g.audio) this.g.audio.play('ui_toggle', { inside: true, gain: 0.35 }); }
    E.obj.classList.add('on');
  }

  title(main, sub, sec = 3) {
    if (!this.g.started) { this.pendingTitle = [main, sub, sec]; return; }
    this.titleLast = [++this.titleSerial, main, sub || '', sec];
    const E = this.el; E.tm.textContent = main; E.ts.textContent = sub || '';
    E.title.classList.add('on'); clearTimeout(this.titleT); this.titleT = setTimeout(() => E.title.classList.remove('on'), sec * 1000);
  }

  radio(a, b, c) {
    const line = typeof a === 'object' ? a : { who: a, text: b }, sec = typeof a === 'object' ? b : c;
    this.radioQ.push({ ...line, sec: sec || Math.max(2.6, line.text.length / 16) });
  }

  voicePos(line) {
    const who = voiceOf(line), id = { ida: 'ida', marta: 'marta', kessler: 'kessler', nova: 'nova' }[who];
    if (!id || line.radio) return null;
    return () => { const p = this.npc.pos(id); return p ? { x: p.x, y: p.y + 1.62, z: p.z } : null; };
  }

  spot(def) {
    def.id = def.id || `${this.st.step}:${++this.spotSerial}`;
    const off = this.g.interact.add(def); this.spots.push({ def, off });
    return () => { off(); this.spots = this.spots.filter((x) => x.def !== def); };
  }

  get following() { return this.coop.mode === 'follow'; }

  holding(kind) {
    const h = this.heldItem(); if (h && h.story === kind) return true;
    for (const x of this.items.values()) if (x.holder && x.kind === kind) return true;
    return false;
  }

  takeHeld(kind) {
    const h = this.heldItem(); if (h && h.story === kind) { this.g.interact.held = null; this.removeItem(h); return true; }
    for (const x of this.items.values()) if (x.holder && x.kind === kind) { this.removeItem(x.it); return true; }
    return false;
  }

  removeItem(it) { if (!it) return; if (it.key) this.items.delete(it.key); this.g.interact.removeItem(it); }

  giveItem(kind, at, remote) {
    const it = this.item(kind, { x: at.x, y: (at.y ?? this.g.valley.heightAt(at.x, at.z)) + 0.9, z: at.z });
    if (remote) { const x = this.items.get(it.key); x.holder = remote.uid; it.body.setBodyType(this.g.R.RigidBodyType.KinematicPositionBased, true); for (let i = 0; i < it.body.numColliders(); i++) it.body.collider(i).setEnabled(false); }
    else if (this.g.walker.active && !this.g.interact.held) this.g.interact.pick(it.body, it.col);
    return it;
  }

  carrierOf(kind) {
    const h = this.heldItem(); if (h && h.story === kind) return { uid: (this.g.online && this.g.online.status === 'online' && this.g.online.uid) || 'me' };
    for (const x of this.items.values()) if (x.holder && x.kind === kind) return { uid: x.holder };
    return null;
  }

  itemPos(kind) { for (const x of this.items.values()) if (x.kind === kind && x.it) { const t = x.it.body.translation(); return { x: t.x, y: t.y, z: t.z }; } return null; }

  decoys() {
    for (const x of this.items.values()) {
      if (x.kind !== 'decoy' || !x.it || x.holder || this.heldItem() === x.it) continue;
      const b = x.it.body, v = b.linvel(), sp = Math.hypot(v.x, v.y, v.z);
      if (sp > 2 && !x.moving) { x.moving = true; x.t0 = performance.now(); }
      const t = b.translation(), age = performance.now() - (x.t0 || 0), low = t.y - this.g.valley.heightAt(t.x, t.z) < 0.35;
      if (x.moving && !x.fired && (sp < 0.6 || (low && age > 250) || age > 2500)) { x.fired = true; this.drones.throwDecoy(t); this.g.audio && this.g.audio.play('tc_crackle', { pos: t, gain: 0.5 }); setTimeout(() => this.removeItem(x.it), 15000); }
    }
  }

  netRelease(body, vel) {
    if (!this.following) return false;
    const it = this.g.interact.items.find((x) => x.body === body && x.netKey); if (!it) return false;
    const t = body.translation();
    this.coop.send('drop', it.netKey, t.x, t.y, t.z, vel.x || 0, vel.y || 0, vel.z || 0);
    return true;
  }

  talk(npcId, label, lines, done) {
    let busy = false;
    this.spot({ radius: 2.6, holding: true, label, pos: () => this.npc.pos(npcId), enabled: () => !busy && !this.dlgOpen, onUse: async (pl, def, remote) => {
      busy = true;
      const p = remote ? (remote.foot ? remote.walk.pose : remote.pos) : this.player(); this.npc.face(npcId, p.x, p.z); this.npc.rest(npcId, 'talk');
      const r = await this.say(typeof lines === 'function' ? lines(this) : lines);
      this.npc.rest(npcId, 'idle'); busy = false;
      if (done) done(r);
    } });
  }

  say(lines) {
    return new Promise((resolve) => {
      const picks = [];
      const run = (k) => {
        if (k >= lines.length) { this.closeDlg(); resolve(picks); return; }
        const L = lines[k];
        if (L.do) L.do(this);
        if (L.skip && L.skip(this)) { run(k + 1); return; }
        this.openDlg(L, (choice) => {
          if (choice !== null) {
            picks.push(choice); const c = L.choices[choice]; if (c.do) c.do(this);
            const seq = [...(c.v ? [{ who: c.who || 'YOU', text: c.text, v: c.v }] : []), ...(c.then || [])];
            if (seq.length) { this.say(seq).then((p2) => { picks.push(...p2); run(k + 1); }); return; }
          }
          run(k + 1);
        });
      };
      run(0);
    });
  }

  openDlg(L, cb, mirror = false) {
    const E = this.el;
    if (!mirror) this.dlgSerial++;
    E.dw.textContent = L.who || ''; E.dc.innerHTML = '';
    const D = this.dlgOpen = { L, cb, shown: 0, full: L.text, sel: 0, t: 0, rate: 60, vh: null, wait: !!this.voice.has(L.v), after: 0 };
    E.dt.textContent = '';
    if (L.v) this.voice.play(L, { pos: this.voicePos(L) }).then((h) => { if (this.dlgOpen !== D) { if (h) this.voice.stop(); return; } D.wait = false; if (h) { D.vh = h; D.rate = Math.max(12, D.full.length / Math.max(0.5, h.dur * 0.9)); } });
    if (L.choices) L.choices.forEach((c, i) => { const d = document.createElement('div'); d.className = 'sd-choice'; d.innerHTML = `<b>${i + 1}</b><span></span>`; d.lastChild.textContent = c.text; d.onclick = () => this.choose(i); E.dc.appendChild(d); });
    E.dh.textContent = L.choices ? '1, 2 or click to answer' : 'E to continue';
    E.dc.style.visibility = 'hidden';
    E.dlg.classList.add('on');
    if (document.pointerLockElement && L.choices) document.exitPointerLock();
  }

  closeDlg() { this.dlgOpen = null; this.el.dlg.classList.remove('on'); }

  advance() { const D = this.dlgOpen; if (!D) return; this.voice.stop(); this.dlgOpen = null; D.cb(null); if (!this.dlgOpen) this.el.dlg.classList.remove('on'); }

  choose(i) {
    const D = this.dlgOpen; if (!D || !D.L.choices || D.shown < D.full.length || i >= D.L.choices.length) return;
    this.voice.stop(); this.dlgOpen = null; D.cb(i);
    if (!this.dlgOpen) this.el.dlg.classList.remove('on');
    if (this.g.input && !document.pointerLockElement) this.g.input.requestLock && this.g.input.requestLock();
  }

  key(e) {
    const D = this.dlgOpen; if (!D) return;
    const k = e.code;
    if (k === 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    const go = k === 'KeyE' || k === 'Space' || k === 'Enter';
    if (D.shown < D.full.length) { if (go) { D.shown = D.full.length; D.wait = false; if (!D.L.choices) this.advance(); else this.voice.stop(); } return; }
    if (D.L.choices) { const n = Number(k.replace(/^(Digit|Numpad)/, '')); if (n >= 1 && n <= D.L.choices.length) this.choose(n - 1); return; }
    if (go) this.advance();
  }

  frontOfCar() { const c = this.g.car; if (!c || c.given) return null; return this._v.set(0, 0, 2.5).applyQuaternion(c.curr.quat).add(c.curr.pos).clone(); }

  frunkLabel() {
    const side = this.side && this.side.frunkLabel(); if (side) return side;
    const it = this.heldItem(), F = this.st.frunk;
    if (it) return `Put ${it.label} in the frunk`;
    if (F.length && this.allowTake) return `Take ${F[F.length - 1] === 'part' ? 'thruster part' : 'flux canister'} from the frunk`;
    return null;
  }

  heldItem() { const I = this.g.interact; if (!I.held) return null; return I.items.find((x) => x.body === I.held.body && x.story) || null; }

  frunkUse() {
    if (this.side && this.side.frunkUse()) return;
    const I = this.g.interact, it = this.heldItem();
    if (it && this.following && it.netKey) { this.coop.send('stow', it.netKey); I.held = null; it.body.setBodyType(this.g.R.RigidBodyType.KinematicPositionBased, true); if (this.g.audio) this.g.audio.play('door_close', { pos: this.frontOfCar(), gain: 0.6 }); return; }
    if (it) { const fin = () => { if (I.held && I.held.body === it.body) I.held = null; this.removeItem(it); this.st.frunk.push(it.story); this.save(); this.emit('stow', it.story); }; if (this.g.moves && !this.g.moves.busy) this.g.moves.stow(it, this.g.car, fin); else fin(); return; }
    if (this.allowTake && this.st.frunk.length && this.following) { const p = this.frontOfCar(); this.coop.send('take', p.x, p.y, p.z); return; }
    if (this.allowTake && this.st.frunk.length) {
      const take = (p) => { const kind = this.st.frunk.pop(), item = this.item(kind, { x: p.x, y: p.y, z: p.z }); this.save(); this.emit('take', kind); return item; };
      if (this.g.moves && !this.g.moves.busy) this.g.moves.take(this.g.car, take);
      else { const p = this.frontOfCar(), item = take({ x: p.x, y: p.y + 0.5, z: p.z }); I.pick(item.body, item.col); }
    }
  }

  frontLeftNozzle(car) { const th = car.sim.thrusters; return th.all.find((n) => n.group === 'front' && n.base.x > 0) || th.all.find((n) => n.group === 'front'); }

  loseNozzle() {
    const g = this.g, car = g.car, n = car && this.frontLeftNozzle(car); if (!n) return;
    const p = car.sim.pos, v = car.sim.vel, sp = Math.hypot(v.x, v.z) || 1;
    this.flags.nozzle = n.name; this.flags.repaired = false;
    this.flags.lostAt = { x: p.x - v.x / sp * 6, z: p.z - v.z / sp * 6 };
    const node = car.view.n[n.name];
    if (node && node.parent && g.damage) {
      const clone = node.clone(true);
      clone.traverse((o) => { if (o.isMesh) o.geometry = o.geometry.clone(); });
      node.parent.add(clone); clone.position.copy(node.position); clone.quaternion.copy(node.quaternion); clone.scale.copy(node.scale);
      car.view.n[n.name] = clone;
      try { g.damage.detachNode(car, n.name, 3, 2.5e4); } catch (e) { clone.removeFromParent(); }
      car.view.n[n.name] = node; car.view.lostParts.delete(n.name);
    }
    if (g.fx && g.fx.sparks) g.fx.sparks(new THREE.Vector3(p.x, p.y + 0.6, p.z), new THREE.Vector3(v.x * 0.3, 2, v.z * 0.3), new THREE.Vector3(0, 1, 0), 40);
    this.enforceNozzle(); this.save();
  }

  enforceNozzle() {
    const f = this.flags, car = this.g.car; if (!f.nozzle || !car || !car.sim) return;
    const n = car.sim.thrusters.all.find((x) => x.name === f.nozzle), node = car.view.n[f.nozzle]; if (!n) return;
    if (!f.repaired) { if (n.attached || n.health > 0) { n.attached = false; n.health = 0; } if (node && node.visible) node.visible = false; }
    else if (f.repairCar !== car.sim.id) { f.repairCar = car.sim.id; n.attached = true; n.health = 1; if (node) node.visible = true; }
  }

  repairNozzle() {
    this.flags.repaired = true; this.flags.repairCar = null; this.enforceNozzle(); this.save();
    if (this.g.audio) this.g.audio.play('part_clunk', { inside: true, gain: 0.8 });
  }

  item(kind, pos) {
    const it = this.g.interact.spawnItem(kind, pos); it.story = kind; it.key = kind + (++this.itemSerial);
    this.items.set(it.key, { key: it.key, kind, it, holder: 0 });
    return it;
  }

  emit(type, data) { this.events.push({ type, data }); }

  onTime(e) {
    if (e === 'arrive') { this.emit('arrive', this.g.eraId()); setTimeout(() => this.applyWorld(), 50); }
    if (e === 'depart') this.emit('depart');
  }

  anchors() {
    const A = this.st.anchors, g = this.g, V = g.valley; if (!V) return A;
    const town = V.region && V.region('town'), c = town && town.center ? (Array.isArray(town.center) ? { x: town.center[0], z: town.center[1] } : town.center) : { x: -1210, z: -200 };
    A.town = A.town || c;
    if (!A.workshop && this.inYear(2026)) A.workshop = this.props.findSpot(c.x + 70, c.z + 40, 5.6, 4.6, Math.PI / 2, 220);
    if (!A.statue && this.inYear(2026)) A.statue = this.props.findSpot(c.x, c.z, 1.2, 1.2, Math.PI / 2, 120);
    if (!A.tower && this.inYear(2026)) A.tower = this.props.findSpot(c.x - 160, c.z + 260, 9.6, 9.6, 0, 300);
    if (!A.forge && this.inYear(1885)) A.forge = this.props.findSpot(c.x + 30, c.z - 50, 2.8, 2.8, Math.PI / 2, 160);
    if (!A.park && V.region && V.region('park')) {
      const pk = V.region('park'), xs = pk.poly.map((p) => p[0]), zs = pk.poly.map((p) => p[1]);
      A.park = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    }
    if (A.park && !A.ktower && this.inYear(2080)) {
      const P = A.park, cx = (P.x0 + P.x1) / 2;
      A.ktower = this.props.findSpot(cx, P.z0 + 70, 18, 18, 0, 220);
      A.sb = [[P.x0 - 30, P.z0 - 30], [P.x1 + 30, P.z0 - 30], [cx, P.z1 + 40]].map(([x, z], i) => this.props.findSpot(x, z, 6.5, 0.6, i === 2 ? Math.PI : 0, 120));
    }
    if (A.park && A.ktower && !A.sbCity && this.inYear(2080)) { const P = A.park, cx = (P.x0 + P.x1) / 2; A.sbCity = [[cx - 170, P.z0 - 150], [cx + 170, P.z0 - 170]].map(([x, z]) => this.props.findSpot(x, z, 6.5, 0.6, 0, 140)).filter(Boolean); }
    if (A.town && !A.sbTown && this.inYear(2080)) A.sbTown = this.props.findSpot(A.town.x + 40, A.town.z + 60, 6.5, 0.6, 0, 160);
    if (A.nova && this.props.inPond(A.nova.x, A.nova.z)) A.nova = null;
    if (A.park && !A.nova && this.inYear(2080)) A.nova = this.props.findSpot((A.park.x0 + A.park.x1) / 2 + 40, A.park.z0 + 620, 1.2, 1.2, 0, 160);
    if (!A.wash) {
      const w = V.region && V.region('wash'), wc = w && w.center ? (Array.isArray(w.center) ? { x: w.center[0], z: w.center[1] } : w.center) : { x: c.x + 300, z: c.z - 300 };
      A.wash = { x: wc.x, z: wc.z, y: V.heightAt(wc.x, wc.z) };
    }
    this.save();
    return A;
  }

  build() {
    const A = this.anchors(), P = this.props;
    if (A.workshop && !P.sets.has('ws_normal')) { P.workshop('ws_normal', A.workshop, 'gzowska'); P.workshop('ws_kessler', A.workshop, 'kessler'); }
    if (A.statue && !P.sets.has('statue')) P.statue('statue', A.statue);
    if (A.tower && !P.sets.has('tower')) { P.tower('tower', A.tower); P.drones('drones', A.town, 3); }
    if (A.workshop && !P.sets.has('bb0')) {
      const hx = -900, z0 = A.workshop.z;
      [[hx + 26, z0 - 140, -Math.PI / 2, ['KESSLER JET', 'THE FUTURE, SINCE 1886']], [hx - 26, z0 + 220, Math.PI / 2, ['FLY KESSLER', 'EVERY CAR, A JET']], [hx + 26, z0 + 520, -Math.PI / 2, ['KESSLER CITY 14 MI', 'HOME OF THE JET']]].forEach(([x, z, yaw, t], i) => {
        const s = P.findSpot(x, z, 4.6, 0.6, yaw, 40); P.billboard('bb' + i, s, t);
      });
    }
    if (A.forge && !P.sets.has('forge')) P.forge('forge', A.forge);
    if (A.ktower && !P.sets.has('k_tower')) {
      P.kesslerTower('k_tower', A.ktower);
      A.sb.forEach((p, i) => P.sketchBoard('k_sb' + i, p, ['THE FIRE CARRIAGE', 'SKETCHED BY ELIAS KESSLER, 1885 · KESSLER AEROSPACE']));
      this.drones.build(A.ktower, [
        { h: 14, pace: { half: 22, off: 21.5, period: 12 } },
        { r: 45, h: 18, sp: 1, ph: 0 }, { r: 45, h: 18, sp: 1, ph: Math.PI },
        { r: 75, h: 22, sp: 1.2, ph: 0 }, { r: 75, h: 22, sp: 1.2, ph: 2.1 }, { r: 75, h: 22, sp: 1.2, ph: 4.2 },
        { r: 110, h: 24, sp: 1.3, ph: 1 },
      ]);
    }
    (A.sbCity || []).forEach((p, i) => { if (!P.sets.has('k_sc' + i)) P.sketchBoard('k_sc' + i, p, ['THE FIRE CARRIAGE', 'SKETCHED BY ELIAS KESSLER, 1885 · KESSLER AEROSPACE']); });
    if (A.sbTown && !P.sets.has('k_st')) P.sketchBoard('k_st', A.sbTown, ['THE FIRE CARRIAGE', 'KESSLER AEROSPACE · DOWNTOWN GZOWO CITY']);
    const N = this.npc;
    if (A.workshop && !N.get('ida')) { const p = P.sets.get('ws_normal').spots.inside; N.add('ida', { kind: 'human_f2026', x: p.x, z: p.z, yaw: Math.PI / 2, seed: 0.37, name: 'Ida' }); }
    if (A.statue && !N.get('marta')) { const s = A.statue; N.add('marta', { kind: 'human_f2026', x: s.x + 3.2, z: s.z + 1.5, yaw: -Math.PI / 2, seed: 0.81, name: 'Marta' }); }
    if (A.nova && !N.get('nova')) N.add('nova', { kind: 'human_f2080', x: A.nova.x, z: A.nova.z, yaw: Math.PI, seed: 0.58, name: 'Nova' });
    if (A.forge && !N.get('kessler')) { const p = P.sets.get('forge').spots.anvil; N.add('kessler', { kind: 'human_m1885', x: p.x, z: p.z, yaw: -Math.PI / 2, seed: 0.12, name: 'Elias Kessler', scale: 1.04 }); }
  }

  applyWorld() {
    const g = this.g; if (!g.valley || !g.life) return;
    this.build();
    const earth = this.earth(), P = this.props, N = this.npc, f = this.flags, y26 = !earth && this.inYear(2026), y85 = !earth && this.inYear(1885), kes = f.timeline === 'kessler';
    P.show('ws_normal', y26 && !kes); P.show('ws_kessler', y26 && kes);
    for (const n of ['statue', 'tower', 'drones', 'bb0', 'bb1', 'bb2']) P.show(n, y26 && kes);
    P.show('forge', y85);
    N.setActive('ida', y26 && !kes && !f.idaAway);
    N.setActive('marta', y26 && kes);
    N.setActive('kessler', y85 && !f.kesslerGone);
    const y80 = !earth && this.inYear(2080), k80 = y80 && !!f.k2080;
    P.show('k_tower', k80); P.dim('k_tower', !!f.free2080);
    for (const n of ['k_sb0', 'k_sb1', 'k_sb2', 'k_sc0', 'k_sc1', 'k_st']) P.show(n, k80 && !f.free2080);
    this.drones.show(k80 && (!f.free2080 || this.drones.down));
    if (k80 && f.free2080 && !this.drones.down) this.drones.powerDown();
    N.setActive('nova', k80);
  }

  update(dt) {
    if (!this.g.started) return;
    if (this.pendingTitle) { const t = this.pendingTitle; this.pendingTitle = null; this.title(...t); }
    this.t += dt;
    this.npc.update(dt); this.props.update(dt); this.enforceNozzle();
    if (this.following && this.net && this.net.dr) this.drones.netApply(this.net.dr, dt);
    this.drones.ticked = false;
    if (this.earth()) { if (!this.away) { this.away = true; this.el.obj.classList.remove('on'); this.el.wp.classList.remove('on'); } return; }
    if (this.away) { this.away = false; if (this.el.text.textContent && !this.st.done) this.el.obj.classList.add('on'); }
    if (this.dlgOpen) {
      const D = this.dlgOpen; D.t += dt;
      if (D.wait && D.t > 1.5) D.wait = false;
      if (!D.wait && D.shown < D.full.length) { D.shown = Math.min(D.full.length, D.shown + dt * D.rate); this.el.dt.textContent = D.full.slice(0, Math.floor(D.shown)); if (D.shown >= D.full.length) this.el.dc.style.visibility = ''; }
      if (D.vh && D.vh.ended && D.shown >= D.full.length && !D.L.choices) { D.after += dt; if (D.after > 0.65) this.advance(); }
      if (this.g.walker.active) this.g.walker.lock = Math.max(this.g.walker.lock, 0.15);
    }
    this.radioStep(dt);
    this.voice.update();
    this.coop.update(dt);
    this.side.update(dt);
    const s = this.step;
    if (this.following) { this.events.length = 0; }
    else if (s && !this.st.done) {
      if (s.update && !this.sdone) { const r = s.update(this, dt, this.events); if (r) this.next(); }
      this.events.length = 0;
      if (this.sdone) { if (this.i + 1 < this.steps.length) this.goto(this.i + 1); else this.finish(); }
    } else this.events.length = 0;
    if (!this.following && this.drones.on && !this.drones.ticked) { this.drones.update(dt, {}); this.net = { ...(this.net || {}), dr: this.drones.netState() }; }
    this.drawTarget();
  }

  radioStep(dt) {
    const E = this.el;
    E.radio.style.visibility = this.dlgOpen ? 'hidden' : '';
    if (this.dlgOpen && !this.radioCur) return;
    if (this.radioCur) { this.radioCur.sec -= dt; if (this.radioCur.sec <= 0) { this.radioCur = null; E.radio.classList.remove('on'); this.radioGap = 0.35; } return; }
    if (this.radioGap > 0) { this.radioGap -= dt; return; }
    const r = this.radioQ.shift(); if (!r) return;
    this.radioCur = r; this.radioSerial++; E.rw.textContent = r.who; E.rt.textContent = r.text; E.radio.classList.add('on');
    if (r.v && this.voice.has(r.v)) this.voice.play(r, {}).then((h) => { if (h && this.radioCur === r) r.sec = Math.max(r.sec, h.dur + 0.5); });
    else if (this.g.audio) this.g.audio.play('ui_tap', { inside: true, gain: 0.3 });
  }

  drawTarget() {
    const E = this.el, T = typeof this.target === 'function' ? this.target() : this.target;
    if (!T || this.g.paused || this.dlgOpen || (this.g.space && this.g.space.active)) { E.wp.classList.remove('on'); E.meta.textContent = this.meta || ''; return; }
    const d = this.dist(T);
    E.meta.textContent = (this.meta ? this.meta + ' · ' : '') + (d > 950 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m');
    const cam = this.g.gfx.camera, v = this._v.set(T.x, (T.y ?? this.g.valley.heightAt(T.x, T.z)) + 2.2, T.z).project(cam);
    let x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
    if (v.z > 1) { x = innerWidth - x; y = innerHeight - 40; }
    x = Math.max(28, Math.min(innerWidth - 28, x)); y = Math.max(60, Math.min(innerHeight - 40, y));
    if (d < 4) { E.wp.classList.remove('on'); return; }
    E.wp.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    E.wpd.textContent = d > 950 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
    E.wp.classList.add('on');
  }

  reset() { try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ } location.reload(); }
}
