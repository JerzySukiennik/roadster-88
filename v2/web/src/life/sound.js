// Roadster 88 life sound: procedural positional voices for everything that moves, synthesized in the game's Web Audio context and routed into its outside bus (dinosaur roars and bellows, sauropod trumpets, raptor calls, horse whinnies, cattle lows, dog barks, coyote howls, crow caws and wing flushes, car horns, the locomotive whistle and chuff, drone buzz and passing-traffic hiss).

const PROFILE = {
  trex: { f: 48, dur: 2.6, form: [260, 620], noise: 0.9, gain: 1.0 },
  raptor: { f: 210, dur: 0.9, form: [900, 2200], noise: 0.6, gain: 0.55, screech: true },
  triceratops: { f: 70, dur: 1.4, form: [300, 700], noise: 0.5, gain: 0.7 },
  hadrosaur: { f: 92, dur: 1.8, form: [380, 900], noise: 0.25, gain: 0.7, horn: true },
  sauropod: { f: 34, dur: 3.2, form: [180, 420], noise: 0.35, gain: 0.9, horn: true },
  quetzal: { f: 320, dur: 0.6, form: [1200, 2600], noise: 0.7, gain: 0.35, screech: true },
  longhorn: { f: 105, dur: 1.5, form: [400, 800], noise: 0.15, gain: 0.5, horn: true },
  mammoth: { f: 62, dur: 2.2, form: [260, 900], noise: 0.25, gain: 0.95, horn: true },
  bison: { f: 82, dur: 1.6, form: [300, 650], noise: 0.35, gain: 0.6, horn: true },
  stegosaurus: { f: 75, dur: 1.3, form: [280, 640], noise: 0.45, gain: 0.65 },
  dimetrodon: { f: 150, dur: 0.8, form: [700, 1600], noise: 0.8, gain: 0.4, screech: true },
};

export class LifeAudio {
  constructor(sys) {
    this.sys = sys; this.cool = new Map(); this.loops = {}; this.t = 0;
  }

  get A() { return this.sys.game.audio; }
  get ctx() { const A = this.A; return A && A.ctx && A.ctx.state === 'running' ? A.ctx : null; }

  out(pos, gain) {
    const ctx = this.ctx, A = this.A;
    const g = ctx.createGain(); g.gain.value = gain;
    if (pos) {
      const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 8; p.rolloffFactor = 1.1; p.maxDistance = 2000;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      g.connect(p); p.connect(A.outside || A.master);
    } else g.connect(A.outside || A.master);
    return g;
  }

  noise() { const A = this.A; const s = this.ctx.createBufferSource(); s.buffer = A.noiseBuf; s.loop = true; return s; }

  cue(type, a) {
    const ctx = this.ctx; if (!ctx || !a) return;
    const key = type + ':' + (a.kind || '');
    const now = ctx.currentTime;
    const cd = { roar: 3, bite: 1.5, trumpet: 5, call: 0.8, horn: 1.5, whistle: 3, neigh: 3, bark: 0.8, howl: 4, flush: 1.5, scream: 1.2, hitPerson: 0.3, hitAnimal: 0.3, hitCar: 0.3 }[type] || 1;
    if ((this.cool.get(key) || 0) > now) return;
    const c = this.sys.camPos, d = Math.hypot(a.x - c.x, a.z - c.z);
    if (d > 900) return;
    this.cool.set(key, now + cd);
    const pos = { x: a.x, y: a.y + 1.5, z: a.z };
    try {
      if (type === 'roar' || type === 'call' || type === 'trumpet' || type === 'bite') this.bellow(a.kind, pos, type === 'bite' ? 0.45 : 1, a.seed);
      else if (type === 'horn') this.horn(pos, a.kind);
      else if (type === 'whistle') this.whistle(pos);
      else if (type === 'neigh') this.neigh(pos);
      else if (type === 'bark') this.bark(pos);
      else if (type === 'howl') this.howl(pos);
      else if (type === 'flush') this.flush(pos);
      else if (type === 'hitAnimal' || type === 'hitPerson') this.thud(pos, a.K ? a.K.meta.mass : 80);
    } catch (e) { /* audio graph unavailable */ }
  }

  env(g, t0, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.setValueAtTime(peak, t0 + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + rel);
  }

  bellow(kind, pos, scale, seed = 0.5) {
    const P = PROFILE[kind] || PROFILE.triceratops, ctx = this.ctx, t0 = ctx.currentTime, dur = P.dur * scale * (0.85 + seed * 0.3);
    const out = this.out(pos, P.gain * 0.9);
    const vca = ctx.createGain(); vca.connect(out);
    this.env(vca, t0, 0.12, 1, dur * 0.55, dur * 0.4);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 2.2; f1.frequency.setValueAtTime(P.form[0], t0); f1.frequency.linearRampToValueAtTime(P.form[1], t0 + dur * 0.35); f1.frequency.linearRampToValueAtTime(P.form[0] * 0.8, t0 + dur);
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = P.form[1] * 2.2; f2.Q.value = 0.7;
    f1.connect(f2); f2.connect(vca);
    const base = P.f * (0.9 + seed * 0.2);
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * (P.screech ? 1.4 : 0.8), t0); osc.frequency.linearRampToValueAtTime(base * (P.screech ? 1.9 : 1.15), t0 + dur * 0.3); osc.frequency.linearRampToValueAtTime(base * 0.75, t0 + dur);
    const lfo = ctx.createOscillator(); lfo.frequency.value = P.horn ? 5 : 22 + seed * 10; const lg = ctx.createGain(); lg.gain.value = base * (P.horn ? 0.03 : 0.12); lfo.connect(lg); lg.connect(osc.frequency);
    const og = ctx.createGain(); og.gain.value = P.horn ? 0.9 : 0.55; osc.connect(og); og.connect(f1);
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = base * 0.5; const sg = ctx.createGain(); sg.gain.value = P.horn ? 0.5 : 0.8; sub.connect(sg); sg.connect(vca);
    const n = this.noise(); const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = P.form[1]; nf.Q.value = 0.8; const ng = ctx.createGain(); ng.gain.value = P.noise * 0.7; n.connect(nf); nf.connect(ng); ng.connect(f1);
    for (const s of [osc, lfo, sub, n]) { s.start(t0); s.stop(t0 + dur + 0.1); }
  }

  horn(pos, kind) {
    const ctx = this.ctx, t0 = ctx.currentTime, out = this.out(pos, 0.35);
    const fut = kind === 'pod' || kind === 'ev2080' || kind === 'hover';
    const freqs = fut ? [880, 1320] : kind === 'truck_semi' ? [220, 277] : [415, 523];
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fut ? 1400 : 900; bp.Q.value = 1.2; bp.connect(out);
    const len = fut ? 0.18 : 0.45;
    for (const f of freqs) { const o = ctx.createOscillator(); o.type = fut ? 'sine' : 'square'; o.frequency.value = f; const g = ctx.createGain(); this.env(g, t0, 0.01, 0.3, len, 0.06); o.connect(g); g.connect(bp); o.start(t0); o.stop(t0 + len + 0.1); if (fut) { const o2 = ctx.createOscillator(); o2.frequency.value = f; const g2 = ctx.createGain(); this.env(g2, t0 + 0.22, 0.01, 0.3, len, 0.06); o2.connect(g2); g2.connect(bp); o2.start(t0 + 0.22); o2.stop(t0 + 0.5); } }
  }

  whistle(pos) {
    const ctx = this.ctx, t0 = ctx.currentTime, out = this.out(pos, 0.55), dur = 1.9;
    const vca = ctx.createGain(); vca.connect(out); this.env(vca, t0, 0.15, 1, dur, 0.4);
    for (const f of [587, 698, 880]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.97, t0); o.frequency.linearRampToValueAtTime(f, t0 + 0.2); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; const g = ctx.createGain(); g.gain.value = 0.22; o.connect(lp); lp.connect(g); g.connect(vca); o.start(t0); o.stop(t0 + dur + 0.5); }
    const n = this.noise(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.5; const ng = ctx.createGain(); ng.gain.value = 0.25; n.connect(bp); bp.connect(ng); ng.connect(vca); n.start(t0); n.stop(t0 + dur + 0.5);
  }

  neigh(pos) {
    const ctx = this.ctx, t0 = ctx.currentTime, out = this.out(pos, 0.4), dur = 1.1;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(700, t0); o.frequency.linearRampToValueAtTime(980, t0 + 0.15); o.frequency.linearRampToValueAtTime(520, t0 + dur);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = 70; lfo.connect(lg); lg.connect(o.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.4;
    const g = ctx.createGain(); this.env(g, t0, 0.04, 0.6, dur * 0.6, dur * 0.35);
    o.connect(bp); bp.connect(g); g.connect(out); o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.1); lfo.stop(t0 + dur + 0.1);
  }

  bark(pos) {
    const ctx = this.ctx, t0 = ctx.currentTime, out = this.out(pos, 0.45);
    for (const dt of [0, 0.22]) {
      const n = this.noise(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(420, t0 + dt); o.frequency.exponentialRampToValueAtTime(260, t0 + dt + 0.12);
      const g = ctx.createGain(); this.env(g, t0 + dt, 0.005, 0.7, 0.04, 0.09);
      n.connect(bp); o.connect(bp); bp.connect(g); g.connect(out); n.start(t0 + dt); o.start(t0 + dt); n.stop(t0 + dt + 0.2); o.stop(t0 + dt + 0.2);
    }
  }

  howl(pos) {
    const ctx = this.ctx, t0 = ctx.currentTime, out = this.out(pos, 0.3), dur = 2.8;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(420, t0); o.frequency.linearRampToValueAtTime(690, t0 + 0.6); o.frequency.linearRampToValueAtTime(600, t0 + dur);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5; const lg = ctx.createGain(); lg.gain.value = 9; lfo.connect(lg); lg.connect(o.frequency);
    const h = ctx.createOscillator(); h.type = 'triangle'; h.frequency.value = 1300; const hg = ctx.createGain(); hg.gain.value = 0.08;
    const g = ctx.createGain(); this.env(g, t0, 0.3, 0.6, dur * 0.6, dur * 0.3);
    o.connect(g); h.connect(hg); hg.connect(g); g.connect(out); for (const s of [o, lfo, h]) { s.start(t0); s.stop(t0 + dur + 0.2); }
  }

  flush(pos) {
    const ctx = this.ctx, t0 = ctx.currentTime, out = this.out(pos, 0.35), dur = 1.1;
    const n = this.noise(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const am = ctx.createGain(); am.gain.value = 0.5; const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 17; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
    const g = ctx.createGain(); this.env(g, t0, 0.02, 0.8, 0.4, 0.6);
    n.connect(bp); bp.connect(am); am.connect(g); g.connect(out); n.start(t0); lfo.start(t0); n.stop(t0 + dur); lfo.stop(t0 + dur);
    const c = ctx.createOscillator(); c.type = 'sawtooth'; c.frequency.setValueAtTime(760, t0 + 0.1); c.frequency.linearRampToValueAtTime(640, t0 + 0.32); const cb = ctx.createBiquadFilter(); cb.type = 'bandpass'; cb.frequency.value = 1300; cb.Q.value = 4; const cg = ctx.createGain(); this.env(cg, t0 + 0.1, 0.01, 0.4, 0.12, 0.1); c.connect(cb); cb.connect(cg); cg.connect(out); c.start(t0 + 0.1); c.stop(t0 + 0.5);
  }

  thud(pos, mass) {
    const ctx = this.ctx, t0 = ctx.currentTime, out = this.out(pos, Math.min(0.9, 0.25 + mass / 4000));
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110 * Math.pow(80 / Math.max(20, mass), 0.15), t0); o.frequency.exponentialRampToValueAtTime(40, t0 + 0.25);
    const g = ctx.createGain(); this.env(g, t0, 0.004, 1, 0.03, 0.25);
    const n = this.noise(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; const ng = ctx.createGain(); this.env(ng, t0, 0.002, 0.6, 0.02, 0.15);
    o.connect(g); g.connect(out); n.connect(lp); lp.connect(ng); ng.connect(out); o.start(t0); n.start(t0); o.stop(t0 + 0.4); n.stop(t0 + 0.3);
  }

  loop(name, build) {
    if (this.loops[name]) return this.loops[name];
    const ctx = this.ctx; if (!ctx) return null;
    const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 10; p.rolloffFactor = 1;
    const g = ctx.createGain(); g.gain.value = 0;
    g.connect(p); p.connect(this.A.outside || this.A.master);
    const L = { p, g, src: build(ctx, g) };
    this.loops[name] = L;
    return L;
  }

  update(dt) {
    this.t += dt;
    const ctx = this.ctx; if (!ctx) return;
    const S = this.sys.sense, now = ctx.currentTime;
    const nearest = (pred) => { let best = null, bd = 1e9; for (const a of this.sys.agents) { if (!pred(a)) continue; const d = Math.hypot(a.x - S.x, a.z - S.z); if (d < bd) { bd = d; best = a; } } return [best, bd]; };
    const set = (L, a, d, gain, rate) => { if (!L) return; if (!a) { L.g.gain.setTargetAtTime(0, now, 0.2); return; } L.p.positionX.setTargetAtTime(a.x, now, 0.05); L.p.positionY.setTargetAtTime(a.y + 1, now, 0.05); L.p.positionZ.setTargetAtTime(a.z, now, 0.05); L.g.gain.setTargetAtTime(gain, now, 0.15); if (rate && L.src.rate) L.src.rate(rate, now); void d; };
    const [car, dc] = nearest((a) => (a.brain === 'vehicle' || (a.brain === 'wreck' && false)) && a.speed > 3 && !a.fly);
    const traffic = this.loop('traffic', (c, g) => { const n = this.noise(), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6; n.connect(bp); bp.connect(g); n.start(); return { rate: (r, t) => bp.frequency.setTargetAtTime(400 + r * 25, t, 0.2) }; });
    set(traffic, dc < 120 ? car : null, dc, car ? Math.min(0.35, car.speed / 90) : 0, car ? car.speed : 0);
    const [dr, dd] = nearest((a) => a.kind === 'drone' || a.kind === 'hover');
    const drone = this.loop('drone', (c, g) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 190; const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 203; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; o.connect(lp); o2.connect(lp); const gg = c.createGain(); gg.gain.value = 0.12; lp.connect(gg); gg.connect(g); o.start(); o2.start(); return {}; });
    set(drone, dd < 60 ? dr : null, dd, 0.35);
    const T = this.sys.traffic, loco = T.trainCars && T.trainCars[0];
    const chuff = this.loop('chuff', (c, g) => { const n = this.noise(), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7; const am = c.createGain(); am.gain.value = 0; const lfo = c.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 3; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain); n.connect(bp); bp.connect(am); am.connect(g); n.start(); lfo.start(); return { rate: (r, t) => lfo.frequency.setTargetAtTime(Math.max(0.6, r * 0.45), t, 0.3) }; });
    if (loco) { const d = Math.hypot(loco.x - S.x, loco.z - S.z); set(chuff, d < 500 ? loco : null, d, 0.7, T.trainV + 1); } else set(chuff, null);
  }
}
