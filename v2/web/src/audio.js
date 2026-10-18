// Roadster 88 audio: Web Audio engine with the parametric EV motor synth from motorSound.js (settings from the sound editor, live via storage or BroadcastChannel, or assets/audio/motor-sound.json), band-limited per-nozzle cold-gas roar, wind/tyre loops, positional one-shots and era radio from assets/audio/catalog.json (missing keys stay silent), with a voice cap and a watchdog that rebuilds the graph if any node starts emitting non-finite samples.
import { MotorSynth, DEFAULT_MOTOR, cleanMotor } from './motorSound.js';

const BASE = '../assets/audio/';

export class AudioEngine {
  constructor() {
    this.ctx = null; this.cat = {}; this.buffers = new Map(); this.loading = new Map(); this.ready = false;
    this.loops = new Map(); this.music = null; this.musicKey = null; this.radioOn = false; this.radioVol = 0.55;
    this.prevValve = new Map(); this.prevTotal = 0; this.prevDeploy = 0; this.cool = new Map();
    this.voices = 0; this.maxVoices = 40; this.watchT = 0; this.resets = 0; this.rebuilding = false; this.radioEra = null;
  }

  async unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    ctx.onerror = () => { if (this.ctx === ctx && !this.rebuilding) this.heal('audio device error'); };
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = 0.85;
    this.master.connect(comp); comp.connect(ctx.destination); this.comp = comp;
    this.guard = ctx.createAnalyser(); this.guard.fftSize = 256; comp.connect(this.guard); this.guardBuf = new Float32Array(256);
    { const o = ctx.createOscillator(), g = ctx.createGain(), an = ctx.createAnalyser(); an.fftSize = 256; g.gain.value = 0.25; o.connect(g); g.connect(an); o.start(); this.probe = { o, a: an }; this.guardBlind = undefined; this.lastCT = null; this.stall = 0; this.quiet = 0; }
    this.outside = ctx.createBiquadFilter(); this.outside.type = 'lowpass'; this.outside.frequency.value = 20000; this.outside.connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.buildMotor();
    this.buildThrust();
    this.buildFan();
    this.wash = this.noiseVoice('lowpass', 700, 0.6, this.outside);
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
    if (!this.motorSettings) this.loadMotorSettings();
    this.motorSynth = new MotorSynth(this.ctx, this.master, this.motorSettings || DEFAULT_MOTOR);
  }

  loadMotorSettings() {
    let P = null;
    try { P = JSON.parse(localStorage.getItem('r88.motorSound') || 'null'); } catch (e) { P = null; }
    this.motorSettings = P ? cleanMotor(P) : DEFAULT_MOTOR;
    if (!P) fetch('../assets/audio/motor-sound.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && !this.motorLocal) this.setMotor(j); }).catch(() => {});
    if (!this.motorListen) {
      this.motorListen = true;
      const apply = (j) => { this.motorLocal = true; this.setMotor(j); };
      addEventListener('storage', (e) => { if (e.key === 'r88.motorSound' && e.newValue) { try { apply(JSON.parse(e.newValue)); } catch (err) { /* bad json */ } } });
      try { new BroadcastChannel('r88-motor').onmessage = (e) => apply(e.data); } catch (e) { /* no channel */ }
    }
  }

  setMotor(P) { this.motorSettings = cleanMotor(P); if (this.motorSynth) this.motorSynth.set(this.motorSettings); }

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

  splash(s, pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 6; p.rolloffFactor = 0.7;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; p.connect(this.outside);
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(380, t + 0.5 + s * 0.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 + 0.75 * s, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7 + s * 0.9);
    src.connect(f); f.connect(g); g.connect(p); src.start(t, Math.random()); src.stop(t + 1.8);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(85, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.5 * s + 0.05, t + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(og); og.connect(p); o.start(t); o.stop(t + 0.5);
    src.onended = () => { try { p.disconnect(); } catch (e) { /* gone */ } };
  }

  buildFan() {
    const ctx = this.ctx, bus = ctx.createGain(); bus.gain.value = 0; bus.connect(this.outside);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2.5;
    const tone = ctx.createGain(); tone.gain.value = 0.32; bp.connect(tone); tone.connect(bus);
    const oscs = [1, 2.02, 3.97].map((m, i) => { const o = ctx.createOscillator(); o.type = i ? 'triangle' : 'sawtooth'; const g = ctx.createGain(); g.gain.value = [0.6, 0.35, 0.18][i]; o.connect(g); g.connect(bp); o.start(); return { o, m }; });
    const air = this.noiseVoice('bandpass', 2200, 0.7, bus);
    this.fanV = { bus, bp, oscs, air };
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
    if (!this.ctx || !this.cat[key] || this.voices >= this.maxVoices) return null;
    if (opt.pos && !(Number.isFinite(opt.pos.x) && Number.isFinite(opt.pos.y) && Number.isFinite(opt.pos.z))) return null;
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
    this.voices++;
    src.onended = () => { this.voices = Math.max(0, this.voices - 1); try { g.disconnect(); } catch (e) { /* already gone */ } };
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
    this.radioOn = on; this.radioEra = era;
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

  watchdog(dt) {
    this.watchT += dt;
    if (this.watchT < 0.4 || this.rebuilding) return;
    const span = this.watchT; this.watchT = 0;
    if (!this.watchHooks) {
      this.watchHooks = true;
      document.addEventListener('visibilitychange', () => { if (!document.hidden && this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); });
      if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', () => { if (this.ctx && !this.rebuilding) this.heal('output device changed'); });
    }
    const ctx = this.ctx;
    if (ctx.state !== 'running') { if (!document.hidden) ctx.resume().catch(() => {}); this.stall = 0; this.lastCT = null; if (this.lastState !== ctx.state) this.note('context ' + ctx.state); this.lastState = ctx.state; return; }
    this.lastState = 'running';
    const ct = ctx.currentTime, adv = this.lastCT === null || this.lastCT === undefined ? span : ct - this.lastCT; this.lastCT = ct;
    if (!document.hidden && adv < span * 0.25) { this.stall = (this.stall || 0) + 1; if (this.stall >= 3) { this.stall = 0; this.heal('audio clock stalled'); return; } } else this.stall = 0;
    this.guard.getFloatTimeDomainData(this.guardBuf);
    let e = 0;
    for (let i = 0; i < this.guardBuf.length; i++) { const v = this.guardBuf[i]; if (!Number.isFinite(v)) { this.heal('non-finite output'); return; } e += v * v; }
    this.rms = Math.sqrt(e / this.guardBuf.length);
    if (this.guardBlind === undefined && this.probe) {
      this.probe.a.getFloatTimeDomainData(this.guardBuf);
      let pe = 0; for (let i = 0; i < this.guardBuf.length; i++) pe += this.guardBuf[i] * this.guardBuf[i];
      this.guardBlind = Math.sqrt(pe / this.guardBuf.length) < 1e-4;
      if (this.guardBlind) this.note('analyser reads are blocked, silence check off');
      try { this.probe.o.stop(); this.probe.o.disconnect(); } catch (err) { /* stopped */ }
      this.probe = null;
    }
    const expect = (this.motorSynth ? this.motorSynth.level || 0 : 0) + (this.radioOn && this.musicKey && this.buffers.has(this.musicKey) ? this.radioVol * 0.2 : 0);
    if (!this.guardBlind && expect > 0.03 && this.rms < 1e-6) { this.quiet = (this.quiet || 0) + 1; if (this.quiet >= 4) { this.quiet = 0; this.heal('silent while sound was expected'); } }
    else this.quiet = 0;
  }

  heal(reason) {
    const now = performance.now();
    this.healTimes = (this.healTimes || []).filter((t) => now - t < 30000);
    this.note(reason);
    if (this.healPaused && now < this.healPaused) return;
    if (this.healTimes.length >= 3) { this.healPaused = now + 60000; this.note('too many rebuilds, auto-heal paused for 60 s'); console.warn('audio: too many rebuilds, pausing auto-heal'); return; }
    this.healTimes.push(now);
    console.warn('audio: ' + reason + ', rebuilding');
    this.rebuild();
  }

  note(t) { (this.log || (this.log = [])).push(new Date().toLocaleTimeString() + ' ' + t); if (this.log.length > 8) this.log.shift(); }

  stats() {
    const c = this.ctx;
    return { state: c ? c.state : 'none', rate: c ? c.sampleRate : 0, latency: c && c.baseLatency ? Math.round(c.baseLatency * 1000) : 0, out: c && c.outputLatency ? Math.round(c.outputLatency * 1000) : 0, time: c ? c.currentTime.toFixed(1) : '-', rms: (this.rms || 0).toFixed(4), motor: this.motorSynth ? (this.motorSynth.level || 0).toFixed(3) : '-', voices: this.voices, ready: this.ready, resets: this.resets, blind: !!this.guardBlind, radio: this.radioOn ? this.musicKey : 'off', log: (this.log || []).slice(-5) };
  }

  async rebuild() {
    this.rebuilding = true; this.resets++;
    console.warn('audio: rebuilding the graph', this.resets);
    const old = this.ctx;
    this.ctx = null; this.ready = false; this.loops.clear(); this.musicKey = null; this.voices = 0; this.boosting = false; this.ambKey = null;
    try { await old.close(); } catch (e) { /* closed */ }
    await this.unlock();
    if (this.radioEra) this.setRadio(this.radioOn, this.radioEra);
    this.rebuilding = false;
  }

  update(dt, s) {
    if (!this.ctx || !this.ready) return;
    this.watchdog(dt);
    if (!this.ctx) return;
    const t = this.ctx.currentTime, sim = s.sim, P = s.powertrain;
    const inside = s.fpp;
    this.outside.frequency.setTargetAtTime(s.space ? (s.reentry ? 1800 : 700) : inside ? 2600 : 20000, t, s.space ? 0.2 : 0.1);
    const load = Math.min(1, Math.abs(sim.motorForce) / P.max_wheel_force);
    const vol = sim.enabled && !s.gone ? 1 : 0;
    if (this.motorSynth) this.motorSynth.update(dt, sim.speed, load, sim.contacts, vol * (inside ? 1.15 : 0.85));
    const sp = s.space && !s.reentry ? 0 : sim.speed;
    this.wind.f.frequency.setTargetAtTime(300 + sp * 22, t, 0.1);
    this.wind.g.gain.setTargetAtTime(vol * Math.min(0.5, (sp / 90) ** 2 * 0.45), t, 0.1);
    this.setLoop('wind_loop', vol * Math.min(1, (sp / 80) ** 2) * 0.8, 0.7 + Math.min(0.8, sp / 110), 0.15);
    const ground = sim.contacts > 0 && !s.space;
    this.setLoop('tyre_roll_loop', vol * (ground ? Math.min(1, sp / 25) : 0) * 0.35, 0.9 + Math.min(0.8, sp / 60), 0.08, this.road);
    let slip = 0; for (const w of sim.wheels) if (w.contact) slip = Math.max(slip, w.slipVel);
    this.setLoop('tyre_skid_loop', vol * Math.min(1, Math.max(0, slip - 2.5) / 7), 0.85 + Math.min(0.3, slip / 40), 0.05);
    if (this.wash) {
      const w = sim.inWater || 0, wsp = Math.min(1, sim.speed / 6);
      this.wash.f.frequency.setTargetAtTime(380 + sim.speed * 70, t, 0.2);
      this.wash.g.gain.setTargetAtTime(vol * Math.min(1, w * 2.5) * (0.06 + 0.3 * wsp), t, 0.15);
      if (sim.splashN && sim.splashN !== this.splashSeen) { this.splashSeen = sim.splashN; this.splash(sim.splashAt.s, sim.splashAt); }
    }
    if (this.fanV) {
      const F = this.fanV, spool = sim.fanSpool || 0, suck = Math.min(1, (sim.fanSuck || 0) / 10500), f = 110 + 470 * spool - 40 * suck;
      for (const o of F.oscs) o.o.frequency.setTargetAtTime(f * o.m, t, 0.12);
      F.bp.frequency.setTargetAtTime(f * 2.6, t, 0.12);
      F.air.f.frequency.setTargetAtTime(1300 + 2300 * spool, t, 0.15);
      F.air.g.gain.setTargetAtTime(0.35 + 0.65 * suck, t, 0.15);
      F.bus.gain.setTargetAtTime(vol * spool * spool * 0.16, t, 0.1);
    }
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
    const W = s.weather;
    this.setLoop('rain_loop', W ? vol * (W.rain || 0) * (inside ? 0.45 : 0.8) : 0, 1, 0.4);
    this.setLoop('wind_storm_loop', W && W.wind ? vol * Math.min(1, Math.hypot(W.wind[0], W.wind[1]) / 18 + (W.gust || 0) * 0.4) * (inside ? 0.3 : 0.65) : 0, 1, 0.5);
    if (W && typeof W.strikes === 'number') {
      if (this.strikes !== undefined && W.strikes > this.strikes) setTimeout(() => this.play('thunder', { gain: 0.8, inside: true }), 300 + Math.random() * 1800);
      this.strikes = W.strikes;
    }
    if (s.ambient !== this.ambKey) { if (this.ambKey) this.setLoop(this.ambKey, 0, 1, 1.2); this.ambKey = s.ambient || null; }
    if (this.ambKey) this.setLoop(this.ambKey, vol * (inside ? 0.25 : 0.45), 1, 1.2);
    const tcs = s.tc;
    this.setLoop('tc_flux_loop', tcs.armed ? 0.25 + 0.75 * tcs.charge : (tcs.state === 'departing' ? 1 : 0), 0.8 + tcs.charge * 0.6, 0.1);
  }
}
