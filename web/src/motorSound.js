// Roadster 88 motor sound: the parametric EV motor synth shared by the game and the sound editor (tones of sine and triangle pairs, filter, echo, shimmer, an air noise layer, a speed-driven volume curve and optional pitch follow), with presets and a settings sanitiser.
export const MOTOR_PRESETS = {
  jurek: { name: "Jurek", tones: [[515.118885362368, 0.305], [282.5455829795911, 0.26]], wave: 0, detune: 0, cutoff: 331.8235917958316, q: 1.2, echo: 0, feedback: 0, shimmer: 0, shimmerHz: 0.05, noise: 0, noiseTone: 150, idle: 0.05, top: 0.14, topSpeed: 45, throttle: 0.06, pitch: 0.23, airMute: true, gain: 1.2 },
  muted: { name: 'Przytłumiony', tones: [[110, 0.34], [165, 0.2], [220, 0.12], [330, 0.04]], wave: 0.3, detune: 4, cutoff: 1500, q: 0.5, echo: 0.12, feedback: 0.46, shimmer: 0.035, shimmerHz: 0.17, noise: 0, noiseTone: 1400, idle: 0.035, top: 0.13, topSpeed: 38, throttle: 0.05, pitch: 0, airMute: true, gain: 1.25 },
  heavenly: { name: 'Niebiański', tones: [[220, 0.3], [277.18, 0.14], [329.63, 0.2], [440, 0.13], [554.37, 0.07], [659.25, 0.05]], wave: 0.3, detune: 4, cutoff: 2600, q: 0.4, echo: 0.42, feedback: 0.46, shimmer: 0.08, shimmerHz: 0.17, noise: 0, noiseTone: 1400, idle: 0.035, top: 0.13, topSpeed: 38, throttle: 0.05, pitch: 0, airMute: true, gain: 1 },
  hover: { name: 'Poduszkowiec', tones: [[82.4, 0.3], [123.5, 0.16], [164.8, 0.1], [247, 0.05]], wave: 0.8, detune: 11, cutoff: 900, q: 1.2, echo: 0.06, feedback: 0.3, shimmer: 0.12, shimmerHz: 5.5, noise: 0.05, noiseTone: 700, idle: 0.05, top: 0.14, topSpeed: 45, throttle: 0.06, pitch: 0.15, airMute: true, gain: 1.2 },
  ev: { name: 'Klasyczny EV', tones: [[160, 0.22], [320, 0.16], [480, 0.06], [960, 0.03]], wave: 0.1, detune: 2, cutoff: 3200, q: 0.7, echo: 0.04, feedback: 0.2, shimmer: 0.01, shimmerHz: 0.3, noise: 0.02, noiseTone: 2500, idle: 0.02, top: 0.12, topSpeed: 55, throttle: 0.07, pitch: 2, airMute: true, gain: 1 },
};
export const DEFAULT_MOTOR = MOTOR_PRESETS.jurek;

const num = (v, d, a, b) => (Number.isFinite(+v) ? Math.max(a, Math.min(b, +v)) : d);

export function cleanMotor(P) {
  const D = DEFAULT_MOTOR; P = P || {};
  const tones = Array.isArray(P.tones) ? P.tones.slice(0, 8).map((t) => [num(t[0], 110, 20, 4000), num(t[1], 0, 0, 1)]).filter((t) => t[1] > 0) : D.tones;
  return {
    name: String(P.name || 'Mój').slice(0, 40), tones: tones.length ? tones : D.tones,
    wave: num(P.wave, D.wave, 0, 1), detune: num(P.detune, D.detune, 0, 50), cutoff: num(P.cutoff, D.cutoff, 100, 12000), q: num(P.q, D.q, 0.1, 12),
    echo: num(P.echo, D.echo, 0, 0.9), feedback: num(P.feedback, D.feedback, 0, 0.85), shimmer: num(P.shimmer, D.shimmer, 0, 0.6), shimmerHz: num(P.shimmerHz, D.shimmerHz, 0.02, 20),
    noise: num(P.noise, D.noise, 0, 0.5), noiseTone: num(P.noiseTone, D.noiseTone, 100, 10000),
    idle: num(P.idle, D.idle, 0, 0.5), top: num(P.top, D.top, 0, 0.6), topSpeed: num(P.topSpeed, D.topSpeed, 5, 120), throttle: num(P.throttle, D.throttle, 0, 0.4),
    pitch: num(P.pitch, D.pitch, 0, 4), airMute: P.airMute !== false, gain: num(P.gain, D.gain, 0, 4),
  };
}

export function motorLevel(P, v, load) {
  return (P.idle * Math.min(1, v / 1.5) + P.top * Math.min(1, v / P.topSpeed) + P.throttle * load * Math.min(1, v / 3)) * P.gain;
}

export class MotorSynth {
  constructor(ctx, out, P) {
    this.ctx = ctx; this.out = out; this.nodes = []; this.air = 0;
    this.bus = ctx.createGain(); this.bus.gain.value = 0; this.bus.connect(out);
    this.set(P);
  }

  node(n) { this.nodes.push(n); return n; }

  set(P) {
    const ctx = this.ctx;
    for (const n of this.nodes) { try { if (n.stop) n.stop(); } catch (e) { /* already stopped */ } try { n.disconnect(); } catch (e) { /* detached */ } }
    this.nodes = []; this.P = P = cleanMotor(P);
    const lp = this.node(ctx.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = P.cutoff; lp.Q.value = P.q;
    const dry = this.node(ctx.createGain()); dry.gain.value = 1 - P.echo * 0.5; lp.connect(dry); dry.connect(this.bus);
    if (P.echo > 0.001) {
      const wet = this.node(ctx.createGain()); wet.gain.value = P.echo; lp.connect(wet);
      for (const [time, pan] of [[0.137, -0.6], [0.193, 0.6]]) {
        const d = this.node(ctx.createDelay(1)); d.delayTime.value = time;
        const fb = this.node(ctx.createGain()); fb.gain.value = P.feedback;
        const damp = this.node(ctx.createBiquadFilter()); damp.type = 'lowpass'; damp.frequency.value = Math.min(P.cutoff, 2400);
        wet.connect(d); d.connect(damp); damp.connect(fb); fb.connect(d);
        if (ctx.createStereoPanner) { const p = this.node(ctx.createStereoPanner()); p.pan.value = pan; damp.connect(p); p.connect(this.bus); } else damp.connect(this.bus);
      }
    }
    const sh = this.node(ctx.createGain()); sh.gain.value = 1; sh.connect(lp);
    if (P.shimmer > 0.001) { const lfo = this.node(ctx.createOscillator()); lfo.frequency.value = P.shimmerHz; const amt = this.node(ctx.createGain()); amt.gain.value = P.shimmer; lfo.connect(amt); amt.connect(sh.gain); lfo.start(); }
    this.oscs = [];
    const c = Math.pow(2, P.detune / 1200);
    for (const [f, a] of P.tones) for (const [det, type, k] of [[1 / c, 'sine', 1 - P.wave], [c, 'triangle', P.wave * 0.8 + 0.08]]) {
      if (k <= 0.001) continue;
      const o = this.node(ctx.createOscillator()); o.type = type; o.frequency.value = f * det;
      const g = this.node(ctx.createGain()); g.gain.value = a * k;
      o.connect(g); g.connect(sh); o.start();
      this.oscs.push({ o, f: f * det });
    }
    if (P.noise > 0.001) {
      const n = Math.floor(ctx.sampleRate * 2), b = ctx.createBuffer(1, n, ctx.sampleRate), dd = b.getChannelData(0);
      for (let i = 0; i < n; i++) dd[i] = Math.random() * 2 - 1;
      const src = this.node(ctx.createBufferSource()); src.buffer = b; src.loop = true;
      const bp = this.node(ctx.createBiquadFilter()); bp.type = 'bandpass'; bp.frequency.value = P.noiseTone; bp.Q.value = 0.8;
      const g = this.node(ctx.createGain()); g.gain.value = P.noise * 3;
      src.connect(bp); bp.connect(g); g.connect(sh); src.start();
    }
  }

  update(dt, v, load, contacts, vol = 1) {
    const ctx = this.ctx, t = ctx.currentTime, P = this.P;
    this.air = contacts > 0 ? 0 : this.air + dt;
    const ground = !P.airMute || this.air < 0.25 ? 1 : 0;
    this.level = vol * ground * motorLevel(P, v, load);
    this.bus.gain.setTargetAtTime(this.level, t, ground ? 0.25 : 0.12);
    if (P.pitch > 0.001) { const k = 1 + P.pitch * Math.min(1, v / P.topSpeed); for (const s of this.oscs) s.o.frequency.setTargetAtTime(s.f * k, t, 0.08); }
  }
}
