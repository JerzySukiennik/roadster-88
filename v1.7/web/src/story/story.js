// Roadster 88 story director: runs the chapters step by step (objective panel, on-screen waypoint, dialogue with choices, radio lines, title cards), keeps the timeline flag that swaps the world between the normal present and the Kessler present, the Roadster's frunk for story items, and saves progress in the browser.
import * as THREE from 'three/webgpu';
import { eraOf } from '../sim/timetravel.js';
import { Props } from './props.js';
import { NPCs } from './npc.js';
import { CHAPTERS } from './chapters.js';
import { Voice } from './voice.js';
import { voiceOf } from './lines.js';

const KEY = 'r88.story.v1';
const $ = (id) => document.getElementById(id);

export class Story {
  constructor(game) {
    this.g = game; this.props = new Props(game); this.npc = new NPCs(game); this.voice = new Voice(game);
    this.el = { obj: $('storyObj'), ch: $('soCh'), text: $('soText'), meta: $('soMeta'), wp: $('storyWp'), wpd: $('wpDist'), radio: $('storyRadio'), rw: $('srWho'), rt: $('srText'), dlg: $('storyDlg'), dw: $('sdWho'), dt: $('sdText'), dc: $('sdChoices'), dh: $('sdHint'), title: $('storyTitle'), tm: $('stMain'), ts: $('stSub') };
    this.steps = CHAPTERS.flatMap((c) => c.steps.map((s) => ({ ...s, chapter: c })));
    this.st = this.load();
    this.i = -1; this.target = null; this.radioQ = []; this.dlgOpen = null; this.spots = []; this.t = 0; this.events = [];
    this._v = new THREE.Vector3();
    addEventListener('keydown', (e) => this.key(e), true);
    if (game.valley && game.valley.onLocation) game.valley.onLocation(() => this.applyWorld());
    const fs = { radius: 2.4, holding: true, pos: () => this.frontOfCar(), enabled: () => !!this.frunkLabel(), onUse: () => this.frunkUse() };
    Object.defineProperty(fs, 'label', { get: () => this.frunkLabel() });
    game.interact.add(fs);
    if (this.st.done) { this.applyWorld(); return; }
    this.goto(Math.max(0, this.steps.findIndex((s) => s.id === this.st.step)));
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
    for (const off of this.spots) off(); this.spots = [];
    this.i = i; this.target = null; this.meta = '';
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

  player() { const g = this.g; return g.walker.active ? g.walker.pos : g.car.sim.pos; }
  near(p, r) { if (!p) return false; const q = this.player(); return Math.hypot(q.x - p.x, q.z - p.z) < r; }
  dist(p) { const q = this.player(); return Math.hypot(q.x - p.x, q.z - p.z); }

  objective(text, target = null, meta = '') {
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
    const E = this.el; E.tm.textContent = main; E.ts.textContent = sub || '';
    E.title.classList.add('on'); clearTimeout(this.titleT); this.titleT = setTimeout(() => E.title.classList.remove('on'), sec * 1000);
  }

  radio(a, b, c) {
    const line = typeof a === 'object' ? a : { who: a, text: b }, sec = typeof a === 'object' ? b : c;
    this.radioQ.push({ ...line, sec: sec || Math.max(2.6, line.text.length / 16) });
  }

  voicePos(line) {
    const who = voiceOf(line), id = { ida: 'ida', marta: 'marta', kessler: 'kessler' }[who];
    if (!id || line.radio) return null;
    return () => { const p = this.npc.pos(id); return p ? { x: p.x, y: p.y + 1.62, z: p.z } : null; };
  }

  spot(def) { const off = this.g.interact.add(def); this.spots.push(off); return off; }

  talk(npcId, label, lines, done) {
    let busy = false;
    this.spot({ radius: 2.6, holding: true, label, pos: () => this.npc.pos(npcId), enabled: () => !busy && !this.dlgOpen, onUse: async () => {
      busy = true;
      const p = this.player(); this.npc.face(npcId, p.x, p.z); this.npc.rest(npcId, 'talk');
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

  openDlg(L, cb) {
    const E = this.el;
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
    const it = this.heldItem(), F = this.st.frunk;
    if (it) return `Put ${it.label} in the frunk`;
    if (F.length && this.allowTake) return `Take ${F[F.length - 1] === 'part' ? 'thruster part' : 'flux canister'} from the frunk`;
    return null;
  }

  heldItem() { const I = this.g.interact; if (!I.held) return null; return I.items.find((x) => x.body === I.held.body && x.story) || null; }

  frunkUse() {
    const I = this.g.interact, it = this.heldItem();
    if (it) { I.held = null; I.removeItem(it); this.st.frunk.push(it.story); this.save(); if (this.g.audio) this.g.audio.play('door_close', { pos: this.frontOfCar(), gain: 0.6 }); this.emit('stow', it.story); return; }
    if (this.allowTake && this.st.frunk.length) {
      const kind = this.st.frunk.pop(), p = this.frontOfCar();
      const item = this.item(kind, { x: p.x, y: p.y + 0.5, z: p.z });
      I.pick(item.body, item.col); this.save(); this.emit('take', kind);
    }
  }

  item(kind, pos) { const it = this.g.interact.spawnItem(kind, pos); it.story = kind; return it; }

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
    const N = this.npc;
    if (A.workshop && !N.get('ida')) { const p = P.sets.get('ws_normal').spots.inside; N.add('ida', { kind: 'human_f2026', x: p.x, z: p.z, yaw: Math.PI / 2, seed: 0.37, name: 'Ida' }); }
    if (A.statue && !N.get('marta')) { const s = A.statue; N.add('marta', { kind: 'human_f2026', x: s.x + 3.2, z: s.z + 1.5, yaw: -Math.PI / 2, seed: 0.81, name: 'Marta' }); }
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
  }

  update(dt) {
    if (!this.g.started) return;
    if (this.pendingTitle) { const t = this.pendingTitle; this.pendingTitle = null; this.title(...t); }
    this.t += dt;
    this.npc.update(dt); this.props.update(dt);
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
    const s = this.step;
    if (s && !this.st.done) {
      if (s.update && !this.sdone) { const r = s.update(this, dt, this.events); if (r) this.next(); }
      this.events.length = 0;
      if (this.sdone) { if (this.i + 1 < this.steps.length) this.goto(this.i + 1); else this.finish(); }
    } else this.events.length = 0;
    this.drawTarget();
  }

  radioStep(dt) {
    const E = this.el;
    E.radio.style.visibility = this.dlgOpen ? 'hidden' : '';
    if (this.dlgOpen && !this.radioCur) return;
    if (this.radioCur) { this.radioCur.sec -= dt; if (this.radioCur.sec <= 0) { this.radioCur = null; E.radio.classList.remove('on'); this.radioGap = 0.35; } return; }
    if (this.radioGap > 0) { this.radioGap -= dt; return; }
    const r = this.radioQ.shift(); if (!r) return;
    this.radioCur = r; E.rw.textContent = r.who; E.rt.textContent = r.text; E.radio.classList.add('on');
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
