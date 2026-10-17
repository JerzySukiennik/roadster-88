// Roadster 88 story voices: loads the baked line clips per chapter, plays them on their own bus straight into the game's compressor (face-to-face lines from the speaker's head in 3D, the player and radio inside the cabin), ducks the rest of the mix while someone speaks, and runs radio lines through a band-limited, softly clipped chain with static, squelch clicks and signal dropouts.
const BASE = '../assets/voice/', MASTER = 0.85, DUCK = 0.38;

export class Voice {
  constructor(game) {
    this.g = game; this.raw = new Map(); this.buf = new Map(); this.cur = null; this.ctx = null; this.duckOn = false;
    this.manifest = {};
    this.ready = fetch(BASE + 'manifest.json').then((r) => (r.ok ? r.json() : {})).then((m) => { this.manifest = m; }).catch(() => {});
  }

  graph() {
    const A = this.g.audio, ctx = A && A.ctx;
    if (!ctx || !A.comp) return null;
    if (this.ctx !== ctx) {
      this.ctx = ctx; this.buf.clear();
      this.bus = ctx.createGain(); this.bus.gain.value = 1; this.bus.connect(A.comp);
      this.fx(ctx);
    }
    return ctx;
  }

  fx(ctx) {
    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    const k = 2.2, curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
    this.curve = curve;
  }

  async renderOffline(lines, gap = 0.45, base = null) {
    await this.ready;
    const sr = 24000, bufs = [];
    for (const L of lines) { const ab = base ? await fetch(base + L.v + '.mp3').then((r) => r.arrayBuffer()) : await this.fetchRaw(L.v); bufs.push(await new OfflineAudioContext(1, 1, sr).decodeAudioData(ab.slice(0))); }
    const total = bufs.reduce((a, b) => a + b.duration + gap, 0.8);
    const ctx = new OfflineAudioContext(1, Math.ceil(total * sr), sr);
    if (!this.noise) this.fx(ctx);
    const out = ctx.createGain(); out.connect(ctx.destination);
    let t = 0.3;
    lines.forEach((L, i) => { const src = ctx.createBufferSource(); src.buffer = bufs[i]; if (L.radio) this.radioChain(ctx, src, out, t, bufs[i].duration, L.dropout, { stops: [] }); else src.connect(out); src.start(t); t += bufs[i].duration + gap + (L.radio ? 0.15 : 0); });
    return (await ctx.startRendering()).getChannelData(0);
  }

  has(id) { return !!(id && this.manifest[id]); }

  prefetch(prefix) {
    this.ready.then(() => { for (const id of Object.keys(this.manifest)) if (id.startsWith(prefix)) this.fetchRaw(id); });
  }

  fetchRaw(id) {
    if (!this.raw.has(id)) this.raw.set(id, fetch(BASE + id + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
    return this.raw.get(id);
  }

  async decode(id) {
    const ctx = this.graph(); if (!ctx) return null;
    if (this.buf.has(id)) return this.buf.get(id);
    const p = (async () => { const ab = await this.fetchRaw(id); if (!ab) return null; try { return await ctx.decodeAudioData(ab.slice(0)); } catch (e) { return null; } })();
    this.buf.set(id, p);
    return p;
  }

  async play(line, opt = {}) {
    await this.ready;
    if (!this.has(line.v)) return null;
    const ctx = this.graph(); if (!ctx) return null;
    const b = await this.decode(line.v); if (!b) return null;
    this.stop();
    const t = ctx.currentTime + 0.02, src = ctx.createBufferSource(); src.buffer = b;
    const out = ctx.createGain(); out.gain.value = 1; out.connect(this.bus);
    const h = { dur: b.duration, src, out, ended: false, pos: opt.pos || null, panner: null, stops: [] };
    let head = src;
    if (line.radio) head = this.radioChain(ctx, src, out, t, b.duration, line.dropout, h);
    else if (opt.pos) {
      const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.6; p.rolloffFactor = 1.1; p.maxDistance = 60;
      src.connect(p); p.connect(out); h.panner = p; this.place(h);
    } else src.connect(out);
    void head;
    src.onended = () => { h.ended = true; if (this.cur === h) this.cur = null; };
    src.start(t);
    this.cur = h;
    return h;
  }

  radioChain(ctx, src, out, t, dur, dropout, h) {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380; hp.Q.value = 0.7;
    const hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 380; hp2.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.8;
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 3200; lp2.Q.value = 0.7;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1700; pk.gain.value = 5; pk.Q.value = 1.1;
    const pre = ctx.createGain(); pre.gain.value = 1.5;
    const sh = ctx.createWaveShaper(); sh.curve = this.curve; sh.oversample = '2x';
    const post = ctx.createGain(); post.gain.value = 0.4;
    const lift = ctx.createGain(); lift.gain.value = 1.35;
    const gate = ctx.createGain(); gate.gain.value = 1;
    src.connect(hp); hp.connect(hp2); hp2.connect(lp); lp.connect(lp2); lp2.connect(pk); pk.connect(lift); lift.connect(pre); pre.connect(sh); sh.connect(post); post.connect(gate); gate.connect(out);
    const st = ctx.createBufferSource(); st.buffer = this.noise; st.loop = true;
    const sbp = ctx.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 2400; sbp.Q.value = 0.6;
    const sg = ctx.createGain(); sg.gain.value = 0;
    st.connect(sbp); sbp.connect(sg); sg.connect(out);
    const end = t + dur;
    sg.gain.setValueAtTime(0, t - 0.02); sg.gain.linearRampToValueAtTime(0.022, t + 0.05); sg.gain.setValueAtTime(0.022, end); sg.gain.linearRampToValueAtTime(0, end + 0.12);
    st.start(t - 0.06); st.stop(end + 0.3);
    this.squelch(ctx, out, t - 0.07); this.squelch(ctx, out, end + 0.05);
    if (dropout) {
      for (let i = 0; i < 6; i++) {
        const at = t + dur * (0.45 + i * 0.09) + Math.random() * 0.05, len = 0.06 + Math.random() * 0.14;
        gate.gain.setValueAtTime(1, at); gate.gain.linearRampToValueAtTime(0.06, at + 0.02); gate.gain.setValueAtTime(0.06, at + len); gate.gain.linearRampToValueAtTime(1, at + len + 0.03);
        sg.gain.setValueAtTime(0.022, at); sg.gain.linearRampToValueAtTime(0.09, at + 0.02); sg.gain.setValueAtTime(0.09, at + len); sg.gain.linearRampToValueAtTime(0.022, at + len + 0.03);
      }
    }
    h.stops.push(st);
    return hp;
  }

  squelch(ctx, out, at) {
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.16, at + 0.004); g.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
    n.connect(f); f.connect(g); g.connect(out); n.start(at, Math.random() * 0.5); n.stop(at + 0.08);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1150;
    const og = ctx.createGain(); og.gain.setValueAtTime(0, at); og.gain.linearRampToValueAtTime(0.035, at + 0.003); og.gain.exponentialRampToValueAtTime(0.001, at + 0.035);
    o.connect(og); og.connect(out); o.start(at); o.stop(at + 0.05);
  }

  place(h) {
    if (!h.panner || !h.pos) return;
    const p = h.pos(); if (!p) return;
    const P = h.panner, t = this.ctx.currentTime;
    if (P.positionX) { P.positionX.setTargetAtTime(p.x, t, 0.05); P.positionY.setTargetAtTime(p.y, t, 0.05); P.positionZ.setTargetAtTime(p.z, t, 0.05); }
    else P.setPosition(p.x, p.y, p.z);
  }

  stop() {
    const h = this.cur; if (!h) return;
    this.cur = null; h.ended = true;
    try { const t = this.ctx.currentTime; h.out.gain.setTargetAtTime(0, t, 0.03); h.src.stop(t + 0.12); for (const s of h.stops) s.stop(t + 0.12); } catch (e) { /* already stopped */ }
  }

  get speaking() { return !!(this.cur && !this.cur.ended); }

  update() {
    const A = this.g.audio;
    if (this.cur) this.place(this.cur);
    const on = this.speaking;
    if (A && A.master && A.ctx && on !== this.duckOn) {
      this.duckOn = on;
      A.master.gain.setTargetAtTime(MASTER * (on ? DUCK : 1), A.ctx.currentTime, on ? 0.12 : 0.45);
    }
  }
}
