// Roadster 88 audio: Web Audio engine with a live EV motor synth (clean sine whine on motor rpm, low-speed inverter sing, regen), band-limited per-nozzle cold-gas roar, wind/tyre loops, positional one-shots and era radio from assets/audio/catalog.json (missing keys stay silent).

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
    this.road = ctx.createBiquadFilter(); this.road.type = 'highpass'; this.road.frequency.value = 220; this.road.Q.value = 0.6; this.road.connect(this.outside);
    this.wind = this.noiseVoice('lowpass', 600, 0.7, this.outside);
    this.rumble = this.noiseVoice('lowpass', 150, 0.8, this.outside);
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
    const tone = ctx.createBiquadFilter(); tone.type = 'highshelf'; tone.frequency.value = 7000; tone.gain.value = -6;
    this.motorBus = ctx.createGain(); this.motorBus.gain.value = 0.0; this.motorBus.connect(tone); tone.connect(this.master);
    const parts = [[2.0, 0.5, 1.004], [2.0, 0.28, 0.996], [4.0, 0.2, 1], [6.07, 0.11, 1], [8.13, 0.05, 1], [1.0, 0.05, 1]];
    this.motor = parts.map(([ratio, amp, det]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 40 * ratio;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(this.motorBus); o.start();
      return { o, g, ratio: ratio * det, amp };
    });
    this.sing = ctx.createOscillator(); this.sing.type = 'sine';
    this.singGain = ctx.createGain(); this.singGain.gain.value = 0;
    this.sing.connect(this.singGain); this.singGain.connect(this.motorBus); this.sing.start();
    this.regenOsc = ctx.createOscillator(); this.regenOsc.type = 'sine';
    this.regenGain = ctx.createGain(); this.regenGain.gain.value = 0;
    this.regenOsc.connect(this.regenGain); this.regenGain.connect(this.motorBus); this.regenOsc.start();
    this.inverter = this.noiseVoice('bandpass', 9000, 6, this.motorBus);
  }

  buildThrust() {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.5;
    const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 3000; hs.gain.value = -8;
    const ls = ctx.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 250; ls.gain.value = 4;
    this.thrustBus = ctx.createGain(); this.thrustBus.gain.value = 1;
    this.thrustBus.connect(lp); lp.connect(hs); hs.connect(ls); ls.connect(this.outside);
    this.nozzleVoices = [];
    for (let i = 0; i < 10; i++) {
      const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 0.6;
      p.connect(this.thrustBus);
      const body = this.noiseVoice('bandpass', 420, 0.7, p);
      const mid = this.noiseVoice('bandpass', 1300, 0.9, p);
      const hi = this.noiseVoice('highpass', 2500, 0.5, p);
      this.nozzleVoices.push({ p, body, mid, hi });
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
      g.connect(p); p.connect(opt.dest || (opt.inside ? this.master : this.outside));
    } else g.connect(opt.dest || (opt.inside ? this.master : this.outside));
    src.start();
    return { src, g };
  }

  loop(key, dest) {
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
      src.connect(g); g.connect(dest || (key.startsWith('music_') || key === 'radio_static' ? this.master : this.outside)); src.start(0, Math.random() * buf.duration);
      rec.src = src; rec.g = g;
    });
    return rec;
  }

  setLoop(key, gain, rate = 1, tc = 0.08, dest) {
    const L = this.loop(key, dest);
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
    const rpm = sim.motorRpm, f0 = Math.max(4, rpm / 60);
    const load = Math.min(1, Math.abs(sim.motorForce) / P.max_wheel_force), regen = Math.min(1, sim.regenForce / P.regen_force) * Math.min(1, sim.speed / 6);
    const vol = sim.enabled && !s.gone ? 1 : 0;
    const band = (f) => { const a = Math.min(1, Math.max(0, (f - 120) / 330)), b = Math.min(1, Math.max(0, (f - 6000) / 6000)); return a * a * (3 - 2 * a) * (1 - b); };
    this.motorBus.gain.setTargetAtTime(vol * (0.015 + 0.3 * load + 0.1 * regen) * (inside ? 1.2 : 0.8), t, 0.06);
    for (const m of this.motor) {
      const f = f0 * m.ratio;
      m.o.frequency.setTargetAtTime(f, t, 0.03);
      m.g.gain.setTargetAtTime(m.amp * band(f) * (0.55 + 0.45 * load), t, 0.04);
    }
    const slow = Math.max(0, 1 - sim.speed / 12);
    this.sing.frequency.setTargetAtTime(520 + f0 * 3.1, t, 0.04);
    this.singGain.gain.setTargetAtTime(0.09 * slow * Math.min(1, sim.speed / 0.6) * (0.3 + 0.7 * load), t, 0.05);
    this.regenOsc.frequency.setTargetAtTime(f0 * 1.92, t, 0.03);
    this.regenGain.gain.setTargetAtTime(regen * 0.3 * band(f0 * 1.92), t, 0.06);
    this.inverter.g.gain.setTargetAtTime(vol * 0.01 * load, t, 0.05);
    const sp = sim.speed;
    this.wind.f.frequency.setTargetAtTime(300 + sp * 22, t, 0.1);
    this.wind.g.gain.setTargetAtTime(vol * Math.min(0.5, (sp / 90) ** 2 * 0.45), t, 0.1);
    this.setLoop('wind_loop', vol * Math.min(1, (sp / 80) ** 2) * 0.8, 0.7 + Math.min(0.8, sp / 110), 0.15);
    const ground = sim.contacts > 0;
    this.setLoop('tyre_roll_loop', vol * (ground ? Math.min(1, sp / 25) : 0) * 0.35, 0.9 + Math.min(0.8, sp / 60), 0.08, this.road);
    let slip = 0; for (const w of sim.wheels) if (w.contact) slip = Math.max(slip, w.slipVel);
    this.setLoop('tyre_skid_loop', vol * Math.min(1, Math.max(0, slip - 2.5) / 7), 0.85 + Math.min(0.3, slip / 40), 0.05);
    const th = sim.thrusters;
    let total = 0, active = 0;
    th.all.forEach((n) => { const v = n.attached && vol ? n.valve : 0; if (v > 0.05) active++; });
    this.thrustBus.gain.setTargetAtTime(1 / Math.sqrt(1 + active * 0.8), t, 0.05);
    th.all.forEach((n, i) => {
      const v = n.attached && vol ? n.valve : 0;
      total += v * n.thrustMax;
      const V = this.nozzleVoices[i];
      if (V) {
        const wp = s.nozzleWorld(n);
        V.p.positionX.setTargetAtTime(wp.x, t, 0.02); V.p.positionY.setTargetAtTime(wp.y, t, 0.02); V.p.positionZ.setTargetAtTime(wp.z, t, 0.02);
        const k = Math.sqrt(v) * (n.group === 'rear' ? 1 : n.group === 'front' ? 0.9 : 0.8);
        V.body.g.gain.setTargetAtTime(k * 0.2, t, 0.04); V.mid.g.gain.setTargetAtTime(k * 0.08, t, 0.04); V.hi.g.gain.setTargetAtTime(k * 0.01, t, 0.04);
        V.body.f.frequency.setTargetAtTime(340 + 160 * v, t, 0.08);
      }
      const pv = this.prevValve.get(n.name) || 0;
      if (n.puff === 1) this.play('valve_puff', { gain: 0.2 + 0.2 * v, pos: s.nozzleWorld(n), cooldown: 0.08, rate: 0.85 + Math.random() * 0.15, dest: this.thrustBus });
      else if (n.puff === -1 && pv > 0.15) this.play('valve_puff', { gain: 0.15, pos: s.nozzleWorld(n), cooldown: 0.08, rate: 0.95, dest: this.thrustBus });
      this.prevValve.set(n.name, v);
    });
    const tot = total / 40000;
    this.setLoop('thrust_loop', Math.min(0.6, Math.sqrt(tot) * 0.5), 0.8 + tot * 0.15, 0.08, this.thrustBus);
    const rearAll = th.rear.every((n) => n.valve > 0.6 && n.pitch < 0.25);
    const boostK = vol * th.rear.reduce((a, n) => a + (n.attached && n.pitch < 0.4 ? n.valve : 0), 0) / Math.max(1, th.rear.length);
    this.rumble.f.frequency.setTargetAtTime(110 + 70 * boostK, t, 0.1);
    this.rumble.g.gain.setTargetAtTime(boostK * (inside ? 0.75 : 0.6), t, 0.12);
    if (rearAll && !this.boosting) this.play('boost_big', { gain: 0.7, pos: s.carPos, dest: this.thrustBus });
    this.boosting = rearAll;
    if (tot > 0.08 && this.prevTotal <= 0.08) this.play('thrust_start', { gain: 0.35, pos: s.carPos, dest: this.thrustBus });
    if (tot < 0.04 && this.prevTotal >= 0.04) this.play('thrust_stop', { gain: 0.3, pos: s.carPos, dest: this.thrustBus });
    this.prevTotal = tot;
    const dep = th.deployTarget;
    if (dep !== this.prevDeploy) this.play('flap_servo', { gain: 0.6, pos: s.carPos });
    this.prevDeploy = dep;
    if (th.sideTarget !== this.prevSide && this.prevSide !== undefined) this.play('flap_servo', { gain: 0.35, pos: s.carPos, rate: 1.25 });
    this.prevSide = th.sideTarget;
    this.setLoop('metal_scrape_loop', vol * Math.min(1, s.scrape || 0), 0.9 + Math.min(0.3, sp / 80), 0.05);
    const tcs = s.tc;
    this.setLoop('tc_flux_loop', tcs.armed ? 0.25 + 0.75 * tcs.charge : (tcs.state === 'departing' ? 1 : 0), 0.8 + tcs.charge * 0.6, 0.1);
  }
}
