// Roadster 88 audio: Web Audio engine with a live EV motor synth (whine harmonics on motor rpm, inverter noise, load and regen), per-nozzle cold-gas hiss, wind/tyre loops, positional one-shots and era radio from assets/audio/catalog.json (missing keys stay silent).

const BASE = '../assets/audio/';

export class AudioEngine {
  constructor() {
    this.ctx = null; this.cat = {}; this.buffers = new Map(); this.loading = new Map(); this.ready = false;
    this.loops = new Map(); this.music = null; this.musicKey = null; this.radioOn = false; this.radioVol = 0.55;
    this.prevValve = new Map(); this.prevTotal = 0; this.prevDeploy = 0; this.cool = new Map();
  }

  async unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = 0.85;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.outside = ctx.createBiquadFilter(); this.outside.type = 'lowpass'; this.outside.frequency.value = 20000; this.outside.connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.buildMotor();
    this.buildThrust();
    this.wind = this.noiseVoice('lowpass', 600, 0.7, this.outside);
    this.ext = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium/.test(navigator.userAgent) ? 'mp3' : (new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3');
    try {
      const r = await fetch(BASE + 'catalog.json', { cache: 'no-store' });
      if (r.ok) this.cat = await r.json();
    } catch (e) { this.cat = {}; }
    for (const k of Object.keys(this.cat)) if (!k.startsWith('music_')) this.preload(k);
    this.ready = true;
  }

  makeNoise(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  noiseVoice(type, freq, q, dest) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(dest); src.start();
    return { src, f, g };
  }

  buildMotor() {
    const ctx = this.ctx;
    this.motorBus = ctx.createGain(); this.motorBus.gain.value = 0.0; this.motorBus.connect(this.master);
    const parts = [[1, 'sine', 0.35], [2, 'sine', 0.12], [3, 'sine', 0.55], [4.5, 'triangle', 0.08], [6, 'sine', 0.32], [9.47, 'sine', 0.1], [12, 'sine', 0.06]];
    this.motor = parts.map(([ratio, type, amp]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = 40 * ratio;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(this.motorBus); o.start();
      return { o, g, ratio, amp };
    });
    this.regenOsc = ctx.createOscillator(); this.regenOsc.type = 'sawtooth';
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.Q.value = 9; this.regenFilter = rf;
    this.regenGain = ctx.createGain(); this.regenGain.gain.value = 0;
    this.regenOsc.connect(rf); rf.connect(this.regenGain); this.regenGain.connect(this.motorBus); this.regenOsc.start();
    this.inverter = this.noiseVoice('bandpass', 7800, 4, this.motorBus);
  }

  buildThrust() {
    const ctx = this.ctx;
    this.nozzleVoices = [];
    for (let i = 0; i < 6; i++) {
      const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 0.6;
      p.connect(this.outside);
      const hi = this.noiseVoice('highpass', 1800, 0.5, p);
      const body = this.noiseVoice('bandpass', 900, 0.8, p);
      this.nozzleVoices.push({ p, hi, body });
    }
  }

  fileFor(key, variant) {
    const e = this.cat[key]; if (!e || !e.files) return null;
    const files = e.files.filter((f) => f.endsWith('.' + this.ext));
    const list = files.length ? files : e.files;
    if (!list.length) return null;
    return list[(variant === undefined ? Math.floor(Math.random() * list.length) : variant) % list.length];
  }

  preload(key) {
    const e = this.cat[key]; if (!e || !e.files) return;
    const files = e.files.filter((f) => f.endsWith('.' + this.ext));
    for (const f of (files.length ? files : e.files)) this.decode(f);
  }

  decode(file) {
    if (this.buffers.has(file)) return Promise.resolve(this.buffers.get(file));
    if (this.loading.has(file)) return this.loading.get(file);
    const p = fetch(BASE + file).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => (ab ? this.ctx.decodeAudioData(ab) : null)).then((b) => { if (b) this.buffers.set(file, b); return b; }).catch(() => null);
    this.loading.set(file, p);
    return p;
  }

  play(key, opt = {}) {
    if (!this.ctx || !this.cat[key]) return null;
    const now = this.ctx.currentTime, cd = opt.cooldown || 0.03;
    if ((this.cool.get(key) || 0) > now) return null;
    this.cool.set(key, now + cd);
    const file = this.fileFor(key);
    const buf = file && this.buffers.get(file);
    if (!buf) { if (file) this.decode(file); return null; }
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = opt.rate || 1;
    const g = this.ctx.createGain(); g.gain.value = (this.cat[key].gain || 1) * (opt.gain === undefined ? 1 : opt.gain);
    src.connect(g);
    if (opt.pos) {
      const p = this.ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 5; p.rolloffFactor = 0.8;
      p.positionX.value = opt.pos.x; p.positionY.value = opt.pos.y; p.positionZ.value = opt.pos.z;
      g.connect(p); p.connect(opt.inside ? this.master : this.outside);
    } else g.connect(opt.inside ? this.master : this.outside);
    src.start();
    return { src, g };
  }

  loop(key) {
    if (this.loops.has(key)) return this.loops.get(key);
    const rec = { g: null, src: null, target: 0, rate: 1, key };
    this.loops.set(key, rec);
    if (!this.ctx || !this.cat[key]) return rec;
    const file = this.fileFor(key, 0);
    if (!file) return rec;
    this.decode(file).then((buf) => {
      if (!buf) return;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(key.startsWith('music_') || key === 'radio_static' ? this.master : this.outside); src.start(0, Math.random() * buf.duration);
      rec.src = src; rec.g = g;
    });
    return rec;
  }

  setLoop(key, gain, rate = 1, tc = 0.08) {
    const L = this.loop(key);
    if (!L.g) return;
    const t = this.ctx.currentTime, base = (this.cat[key] && this.cat[key].gain) || 1;
    L.g.gain.setTargetAtTime(gain * base, t, tc);
    L.src.playbackRate.setTargetAtTime(rate, t, tc);
  }

  setRadio(on, era) {
    this.radioOn = on;
    if (!this.ctx) return;
    const key = 'music_' + era;
    if (this.musicKey && this.musicKey !== key) this.setLoop(this.musicKey, 0, 1, 0.3);
    if (on && this.musicKey !== key) { this.play('radio_static', { gain: 0.6, inside: true }); }
    this.musicKey = key;
    this.setLoop(key, on ? this.radioVol : 0, 1, 0.4);
  }

  listener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime, p = cam.position, e = cam.matrixWorld.elements;
    if (L.positionX) { L.positionX.setTargetAtTime(p.x, t, 0.02); L.positionY.setTargetAtTime(p.y, t, 0.02); L.positionZ.setTargetAtTime(p.z, t, 0.02); L.forwardX.value = -e[8]; L.forwardY.value = -e[9]; L.forwardZ.value = -e[10]; L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6]; }
    else { L.setPosition(p.x, p.y, p.z); L.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]); }
  }

  update(dt, s) {
    if (!this.ctx || !this.ready) return;
    const t = this.ctx.currentTime, sim = s.sim, P = s.powertrain;
    const inside = s.fpp;
    this.outside.frequency.setTargetAtTime(inside ? 2600 : 20000, t, 0.1);
    const rpm = sim.motorRpm, f0 = Math.max(8, rpm / 60);
    const load = Math.min(1, Math.abs(sim.motorForce) / P.max_wheel_force), regen = Math.min(1, sim.regenForce / P.regen_force) * Math.min(1, sim.speed / 6);
    const vol = sim.enabled && !s.gone ? 1 : 0;
    const spd = Math.min(1, sim.speed / 20);
    this.motorBus.gain.setTargetAtTime(vol * (0.05 + 0.2 * load + 0.08 * regen) * (0.35 + 0.65 * Math.min(1, f0 / 60)) * (inside ? 1.25 : 1), t, 0.05);
    for (const m of this.motor) {
      const f = f0 * m.ratio;
      m.o.frequency.setTargetAtTime(f, t, 0.02);
      const audible = f < 14000 ? 1 : 0;
      const lk = m.ratio === 3 || m.ratio === 6 ? 0.4 + 0.6 * load : 0.6 + 0.4 * load;
      m.g.gain.setTargetAtTime(m.amp * lk * audible * (f > 9000 ? 0.4 : 1), t, 0.03);
    }
    this.regenOsc.frequency.setTargetAtTime(f0 * 4.2, t, 0.02);
    this.regenFilter.frequency.setTargetAtTime(Math.min(12000, f0 * 4.2), t, 0.02);
    this.regenGain.gain.setTargetAtTime(regen * 0.35, t, 0.05);
    this.inverter.f.frequency.setTargetAtTime(3500 + 5000 * Math.min(1, f0 / 600), t, 0.05);
    this.inverter.g.gain.setTargetAtTime(vol * (0.02 + 0.12 * load) * (spd > 0.02 ? 1 : 0.3), t, 0.04);
    const sp = sim.speed;
    this.wind.f.frequency.setTargetAtTime(300 + sp * 22, t, 0.1);
    this.wind.g.gain.setTargetAtTime(vol * Math.min(0.5, (sp / 90) ** 2 * 0.45), t, 0.1);
    this.setLoop('wind_loop', vol * Math.min(1, (sp / 80) ** 2) * 0.8, 0.7 + Math.min(0.8, sp / 110), 0.15);
    const ground = sim.contacts > 0;
    this.setLoop('tyre_roll_loop', vol * (ground ? Math.min(1, sp / 25) : 0) * 0.8, 0.6 + Math.min(1.0, sp / 60), 0.08);
    let slip = 0; for (const w of sim.wheels) if (w.contact) slip = Math.max(slip, w.slipVel);
    this.setLoop('tyre_skid_loop', vol * Math.min(1, Math.max(0, slip - 2.5) / 7), 0.85 + Math.min(0.3, slip / 40), 0.05);
    const th = sim.thrusters;
    let total = 0;
    th.all.forEach((n, i) => {
      const v = n.attached && vol ? n.valve : 0;
      total += v * n.thrustMax;
      const V = this.nozzleVoices[i];
      if (V) {
        const wp = s.nozzleWorld(n);
        V.p.positionX.setTargetAtTime(wp.x, t, 0.02); V.p.positionY.setTargetAtTime(wp.y, t, 0.02); V.p.positionZ.setTargetAtTime(wp.z, t, 0.02);
        const k = v * (n.front ? 1.1 : 0.85);
        V.hi.g.gain.setTargetAtTime(k * 0.22, t, 0.015); V.body.g.gain.setTargetAtTime(k * 0.12, t, 0.02);
        V.hi.f.frequency.setTargetAtTime(1400 + 1600 * v, t, 0.05);
      }
      const pv = this.prevValve.get(n.name) || 0;
      if (n.puff === 1) this.play('valve_puff', { gain: 0.35 + 0.4 * v, pos: s.nozzleWorld(n), cooldown: 0.05, rate: 0.9 + Math.random() * 0.25 });
      else if (n.puff === -1 && pv > 0.15) this.play('valve_puff', { gain: 0.25, pos: s.nozzleWorld(n), cooldown: 0.05, rate: 1.1 });
      this.prevValve.set(n.name, v);
    });
    const tot = total / 40000;
    this.setLoop('thrust_loop', Math.min(1, tot * 1.4), 0.85 + tot * 0.3, 0.04);
    const rearAll = th.rear.every((n) => n.valve > 0.6 && n.pitch < 0.25);
    if (rearAll && !this.boosting) this.play('boost_big', { gain: 0.9, pos: s.carPos });
    this.boosting = rearAll;
    if (tot > 0.08 && this.prevTotal <= 0.08) this.play('thrust_start', { gain: 0.6, pos: s.carPos });
    if (tot < 0.04 && this.prevTotal >= 0.04) this.play('thrust_stop', { gain: 0.5, pos: s.carPos });
    this.prevTotal = tot;
    const dep = th.deployTarget;
    if (dep !== this.prevDeploy) this.play('flap_servo', { gain: 0.6, pos: s.carPos });
    this.prevDeploy = dep;
    this.setLoop('metal_scrape_loop', vol * Math.min(1, s.scrape || 0), 0.9 + Math.min(0.3, sp / 80), 0.05);
    const tcs = s.tc;
    this.setLoop('tc_flux_loop', tcs.armed ? 0.25 + 0.75 * tcs.charge : (tcs.state === 'departing' ? 1 : 0), 0.8 + tcs.charge * 0.6, 0.1);
  }
}
