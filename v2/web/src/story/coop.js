// Roadster 88 shared story: when two players share a room, the one longest in the session (the oldest story epoch, sent as sx with every player state, so a time jump that reorders the per-era room does not hand the story over) runs the story director and sends a compact story frame in its player state (sf: step, objective, flags, frunk, anchors, dialogue, radio, title, people, story items, usable spots, chapter extras); the other mirrors it and sends its own actions back as numbered events (se: use, advance, choose, pick, drop, stow, take, hold) that the leader acknowledges, so either player can finish a step and both keep the progress; a follower whose leader drops out for a moment (a room change mid jump) holds the last frame for a while before taking over.
import { LINES } from './lines.js';

const RATE = 0.25, BEAT = 1.5, FRESH = 4000, HOLD = 15000;
const q2 = (v) => Math.round(v * 100) / 100;

export class Coop {
  constructor(S) {
    this.S = S; this.g = S.g; this.mode = 'solo'; this.last = ''; this.sendT = 0; this.beatT = 0;
    this.out = []; this.serial = 0; this.ack = {}; this.seen = {}; this.mirror = { spots: new Map(), items: new Map(), dl: 0, rd: 0, tt: 0, an: '', step: '' };
    this.frameOut = null; this.epoch = 0; this.leadAt = 0;
  }

  online() { const o = this.g.online; return o && o.status === 'online' ? o : null; }

  leader() {
    const o = this.online(); if (!o || !this.epoch) return null;
    let L = null;
    for (const r of o.remotes.values()) if (r.sx && (r.sx < this.epoch || (r.sx === this.epoch && r.uid < o.uid)) && (!L || r.sx < L.sx)) L = r;
    return L;
  }

  update(dt) {
    const S = this.S, o = this.online(), now = performance.now();
    if (o && !this.epoch) this.epoch = o.joinAt || Math.round(Date.now() + (o.offset || 0));
    const L = this.leader(), fresh = !!(L && L.sf && now - (L.sfAt || 0) < FRESH);
    if (fresh) this.leadAt = now;
    const hold = !fresh && this.mode === 'follow' && now - this.leadAt < HOLD;
    const mode = fresh || hold ? 'follow' : L ? 'solo' : 'lead';
    if (mode !== this.mode) {
      const was = this.mode; this.mode = mode;
      if (mode === 'follow') this.enterFollow();
      else if (was === 'follow') this.leaveFollow();
    }
    if (mode === 'follow') { if (fresh) { this.applyFrame(L.sf, dt); this.outbox(L); } }
    else if (mode === 'lead' && o && o.remotes.size) { this.inbox(); this.carryForRemotes(); this.build(dt); }
    else this.frameOut = null;
  }

  netOut() {
    if (!this.epoch) return null;
    const x = { sx: this.epoch };
    if (this.mode === 'follow') { if (this.out.length) x.se = this.out.slice(-24); return x; }
    if (this.frameOut) { x.sf = this.frameOut; this.frameOut = null; }
    return x;
  }

  send(t, ...a) { if (this.mode !== 'follow') return false; this.out.push([++this.serial, t, ...a]); return true; }

  outbox(L) { const a = L.sf.ack && L.sf.ack[this.online().uid]; if (a) this.out = this.out.filter((e) => e[0] > a); }

  build(dt) {
    const S = this.S, g = this.g;
    this.sendT += dt; this.beatT += dt; this.anT = (this.anT || 0) + dt;
    if (this.sendT < RATE) return;
    this.sendT = 0;
    const O = S.side && S.side.job ? S.ob || [] : null, T0 = O ? O[1] : S.target, T = typeof T0 === 'function' ? T0() : T0;
    const sp = [];
    for (const s of S.spots) {
      const d = s.def; if (!d || !d.id || (d.enabled && !d.enabled())) continue;
      const p = typeof d.pos === 'function' ? d.pos() : d.pos; if (!p) continue;
      sp.push([d.id, d.label || '', q2(p.x), q2(p.y || 0), q2(p.z), d.radius || 2, d.holding ? 1 : 0, d.hold ? 1 : 0]);
    }
    const np = [];
    for (const n of S.npc.list.values()) if (n.on && n.a) np.push([n.id, q2(n.a.x), q2(n.a.z), q2(n.a.yaw), n.restClip || 'idle', q2(n.a.speed || 0)]);
    const it = [];
    for (const [key, x] of S.items) {
      if (!x.it || !g.interact.items.includes(x.it)) continue;
      const t = x.it.body.translation(), r = x.it.body.rotation();
      it.push([key, x.kind, q2(t.x), q2(t.y), q2(t.z), q2(r.x), q2(r.y), q2(r.z), q2(r.w), x.holder || (S.heldItem() === x.it ? this.online().uid : 0)]);
    }
    const D = S.dlgOpen, R = S.radioCur;
    const f = {
      st: S.st.step, done: S.st.done ? 1 : 0,
      ob: [O ? O[0] || '' : S.el.obj.classList.contains('on') ? S.el.text.textContent : '', (O ? O[2] : S.meta) || '', T ? q2(T.x) : null, T ? q2(T.z) : null, T && T.y !== undefined ? q2(T.y) : null],
      fl: S.st.flags, fr: S.st.frunk, at: S.allowTake ? 1 : 0,
      dl: D && D.L.v ? [S.dlgSerial, D.L.v, D.L.choices ? D.L.choices.map((c) => c.v || c.text) : 0] : 0,
      rd: R && R.v ? [S.radioSerial, R.v] : 0,
      tt: S.titleLast || 0, np, it, sp, ex: S.net || 0, ack: this.ack,
    };
    const key = JSON.stringify(f);
    if (key === this.last && this.beatT < BEAT) return;
    this.last = key; this.beatT = 0;
    const an = JSON.stringify(S.st.anchors);
    if (an !== this.anLast || this.anT > 3) { f.an = S.st.anchors; this.anLast = an; this.anT = 0; }
    this.frameOut = f;
  }

  inbox() {
    const S = this.S, o = this.online();
    for (const r of o.remotes.values()) {
      if (!r.se || !r.se.length) continue;
      const seen = this.seen[r.uid] || 0;
      for (const e of r.se) {
        if (e[0] <= seen) continue;
        this.seen[r.uid] = e[0]; this.ack[r.uid] = e[0];
        try { this.handle(r, e); } catch (err) { console.warn('coop event', e, err); }
      }
      r.se = null;
    }
  }

  handle(r, e) {
    const S = this.S, g = this.g, I = g.interact, t = e[1];
    if (t === 'use' || t === 'hold') {
      const s = S.spots.find((x) => x.def && x.def.id === e[2]); if (!s) return;
      if (t === 'hold') { if (s.def.onHold) s.def.onHold(e[3] || 0.25, r); return; }
      if (s.def.onUse) s.def.onUse(g.player, s.def, r);
    } else if (t === 'adv') { if (S.dlgOpen && S.dlgSerial === e[2]) { S.dlgOpen.shown = S.dlgOpen.full.length; if (!S.dlgOpen.L.choices) S.advance(); } }
    else if (t === 'ch') { if (S.dlgOpen && S.dlgSerial === e[2]) { S.dlgOpen.shown = S.dlgOpen.full.length; S.choose(e[3]); } }
    else if (t === 'pick') {
      const x = S.items.get(e[2]); if (!x || x.holder || S.heldItem() === x.it) return;
      x.holder = r.uid; x.it.body.setBodyType(g.R.RigidBodyType.KinematicPositionBased, true);
      for (let i = 0; i < x.it.body.numColliders(); i++) x.it.body.collider(i).setEnabled(false);
    } else if (t === 'drop') {
      const x = S.items.get(e[2]); if (!x || x.holder !== r.uid) return;
      x.holder = 0; const b = x.it.body;
      b.setTranslation({ x: e[3], y: e[4], z: e[5] }, true); b.setBodyType(g.R.RigidBodyType.Dynamic, true);
      for (let i = 0; i < b.numColliders(); i++) b.collider(i).setEnabled(true);
      b.setLinvel({ x: e[6] || 0, y: e[7] || 0, z: e[8] || 0 }, true);
    } else if (t === 'stow') {
      const x = S.items.get(e[2]); if (!x || x.holder !== r.uid) return;
      S.removeItem(x.it); S.st.frunk.push(x.kind); S.save(); S.emit('stow', x.kind);
    } else if (t === 'take') {
      if (!S.allowTake || !S.st.frunk.length) return;
      const kind = S.st.frunk.pop(), it = S.item(kind, { x: e[2], y: e[3] + 0.5, z: e[4] });
      const x = S.items.get(it.key); x.holder = r.uid; it.body.setBodyType(g.R.RigidBodyType.KinematicPositionBased, true);
      for (let i = 0; i < it.body.numColliders(); i++) it.body.collider(i).setEnabled(false);
      S.save(); S.emit('take', kind);
    } else if (S.onNet) S.onNet(r, e);
    void I;
  }

  carryForRemotes() {
    const S = this.S, o = this.online();
    for (const x of S.items.values()) {
      if (!x.holder || !x.it) continue;
      const r = o.remotes.get(x.holder);
      if (!r) { x.holder = 0; x.it.body.setBodyType(this.g.R.RigidBodyType.Dynamic, true); for (let i = 0; i < x.it.body.numColliders(); i++) x.it.body.collider(i).setEnabled(true); continue; }
      const p = r.foot ? r.walk.pose : r.pos, yaw = r.foot ? r.walk.yaw : Math.atan2(r.fwd.x, r.fwd.z);
      x.it.body.setNextKinematicTranslation({ x: p.x + Math.sin(yaw) * 0.52, y: p.y + 1.02, z: p.z + Math.cos(yaw) * 0.52 });
    }
  }

  enterFollow() {
    const S = this.S;
    S.closeDlg(); S.voice.stop(); S.radioQ.length = 0; S.radioCur = null; S.el.radio.classList.remove('on');
    for (const off of S.spots) off(); S.spots = [];
    for (const it of [...S.items.values()]) if (it.it) S.removeItem(it.it);
    this.mirror = { spots: new Map(), items: new Map(), dl: 0, rd: 0, tt: 0, an: '', step: '' };
    this.out = [];
  }

  leaveFollow() {
    const S = this.S, M = this.mirror;
    for (const off of M.spots.values()) off.off();
    for (const m of M.items.values()) { if (m.spot) m.spot.off(); if (m.it) this.g.interact.removeItem(m.it); }
    this.mirror = { spots: new Map(), items: new Map(), dl: 0, rd: 0, tt: 0, an: '', step: '' };
    S.closeDlg();
    if (!S.st.done) S.goto(Math.max(0, S.steps.findIndex((s) => s.id === S.st.step)));
  }

  applyFrame(f, dt) {
    const S = this.S, g = this.g, M = this.mirror, I = g.interact, me = this.online().uid;
    if (!M.an && !f.an) return;
    const an = JSON.stringify(f.an || {});
    if (f.an && an !== M.an) { M.an = an; if (JSON.stringify(S.st.anchors) !== an) { S.st.anchors = JSON.parse(an); S.props.clearAll(); S.npc.clearAll(); } }
    const flags = JSON.stringify(f.fl || {}), changed = flags !== JSON.stringify(S.st.flags) || f.st !== S.st.step;
    S.st.flags = JSON.parse(flags); S.st.frunk = (f.fr || []).slice(); S.allowTake = !!f.at; S.st.done = !!f.done;
    if (f.st !== M.step) {
      M.step = f.st; S.st.step = f.st;
      const i = S.steps.findIndex((s) => s.id === f.st); if (i >= 0) S.i = i;
    }
    if (changed) { S.save(); S.applyWorld(); }
    const ob = f.ob || [];
    S.objective(ob[0] || null, ob[2] !== null && ob[2] !== undefined ? { x: ob[2], z: ob[3], y: ob[4] === null ? undefined : ob[4] } : null, ob[1] || '');
    S.net = f.ex || null;
    for (const n of S.npc.list.values()) n.net = null;
    for (const [id, x, z, yaw, rest, sp] of f.np || []) { const n = S.npc.get(id); if (!n) continue; n.on = true; n.net = { x, z, yaw, sp }; if (n.restClip !== rest) S.npc.rest(id, rest); }
    for (const n of S.npc.list.values()) if (!n.net) n.on = false;
    const keep = new Set();
    for (const a of f.it || []) {
      const [key, kind, x, y, z, qx, qy, qz, qw, holder] = a; keep.add(key);
      let m = M.items.get(key);
      if (!m) {
        const it = I.spawnItem(kind, { x, y, z }); it.story = kind; it.netKey = key;
        it.body.setBodyType(g.R.RigidBodyType.KinematicPositionBased, true);
        m = { it, key, kind, holder: 0 }; M.items.set(key, m);
      }
      const mine = holder === me;
      if (mine && !m.holder) { m.holder = me; I.pick(m.it.body, m.it.col); }
      if (!mine && m.holder === me && I.held && I.held.body === m.it.body) { I.held = null; }
      m.holder = holder;
      if (!mine) {
        for (let i = 0; i < m.it.body.numColliders(); i++) m.it.body.collider(i).setEnabled(!holder);
        m.it.body.setNextKinematicTranslation({ x, y, z }); m.it.body.setNextKinematicRotation({ x: qx, y: qy, z: qz, w: qw });
      }
      if (!holder && !m.spot) { const def = { radius: 1.8, label: 'Pick up ' + m.it.label, pos: { x, y, z }, onUse: () => this.send('pick', key) }; def.off = I.add(def); m.spot = def; }
      if (holder && m.spot) { m.spot.off(); m.spot = null; }
      if (m.spot) { m.spot.pos.x = x; m.spot.pos.y = y; m.spot.pos.z = z; }
    }
    for (const [key, m] of M.items) if (!keep.has(key)) { if (m.spot) m.spot.off(); if (I.held && I.held.body === m.it.body) I.held = null; I.removeItem(m.it); M.items.delete(key); }
    const ids = new Set();
    for (const [id, label, x, y, z, r, holding, hold] of f.sp || []) {
      ids.add(id);
      let s = M.spots.get(id);
      if (!s) {
        const def = { id, radius: r, holding: !!holding, label, pos: { x, y, z }, onUse: () => this.send('use', id) };
        if (hold) def.onHold = (sec) => this.send('hold', id, sec);
        def.off = I.add(def); s = def; M.spots.set(id, s);
      }
      s.label = label; s.pos.x = x; s.pos.y = y; s.pos.z = z; s.radius = r;
    }
    for (const [id, s] of M.spots) if (!ids.has(id)) { s.off(); M.spots.delete(id); }
    if (f.dl && f.dl[0] !== M.dl) {
      M.dl = f.dl[0];
      const L = LINES[f.dl[1]];
      if (L) {
        const line = { ...L, v: f.dl[1] };
        if (f.dl[2]) line.choices = f.dl[2].map((c) => (LINES[c] ? { ...LINES[c], v: c } : { text: c }));
        S.closeDlg(); S.openDlg(line, (choice) => { if (choice === null) this.send('adv', M.dl); else this.send('ch', M.dl, choice); }, true);
      }
    } else if (!f.dl && M.dl) { M.dl = 0; S.voice.stop(); S.closeDlg(); }
    if (f.rd && f.rd[0] !== M.rd) { M.rd = f.rd[0]; const L = LINES[f.rd[1]]; if (L) { S.radioQ.length = 0; if (S.radioCur) { S.radioCur = null; S.voice.stop(); } S.radioGap = 0; S.radio({ ...L, v: f.rd[1] }); } }
    if (f.tt && f.tt[0] !== M.tt) { M.tt = f.tt[0]; S.title(f.tt[1], f.tt[2], f.tt[3]); }
    void dt;
  }
}
