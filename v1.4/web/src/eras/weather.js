// Roadster 88 era weather and seasons: the season from the present month, weather rolled per arrival from era and season and drifting while driving, blended sky, fog and sun, GPU-animated rain, snow, ash and dust around the camera, lightning, wet and snowy surfaces, wind, and the game.weather API for the car side and the menu.
import * as THREE from 'three/webgpu';
import { uniform, vec2, vec3, float, uv, instancedBufferAttribute, cameraPosition, time, fract, smoothstep, sin, length, max, mx_noise_float } from 'three/tsl';
import { fxMaterial } from '../render/gfx.js';

export const WEATHER_KINDS = ['clear', 'clouds', 'overcast', 'fog', 'rain', 'storm', 'snow', 'dust', 'ash'];

const BASE = { clouds: 0.12, dens: 0.3, dark: 0, fogMul: 1, fogHeight: 0, sunMul: 1, rain: 0, snow: 0, dust: 0, ash: 0, wind: 3, gust: 0.2, lightning: 0, haze: [0.55, 0.45, 0.32], hazeMix: 0 };
const PARAMS = {
  clear: {},
  clouds: { clouds: 0.55, dens: 0.45, dark: 0.1, fogMul: 1.15, sunMul: 0.85, wind: 5, gust: 0.35 },
  overcast: { clouds: 0.97, dens: 0.85, dark: 0.5, fogMul: 1.8, sunMul: 0.3, wind: 6, gust: 0.35 },
  fog: { clouds: 0.75, dens: 0.6, dark: 0.32, fogMul: 45, fogHeight: 70, sunMul: 0.4, wind: 1, gust: 0.05 },
  rain: { clouds: 1, dens: 0.92, dark: 0.6, fogMul: 4.5, sunMul: 0.2, rain: 0.75, wind: 8, gust: 0.5 },
  storm: { clouds: 1, dens: 1, dark: 0.78, fogMul: 5.5, sunMul: 0.12, rain: 1, wind: 15, gust: 0.9, lightning: 1 },
  snow: { clouds: 1, dens: 0.85, dark: 0.42, fogMul: 3.2, sunMul: 0.32, snow: 0.85, wind: 4, gust: 0.3 },
  dust: { clouds: 0.25, dens: 0.4, dark: 0.22, fogMul: 14, fogHeight: 220, sunMul: 0.5, dust: 1, wind: 17, gust: 0.8, haze: [0.62, 0.45, 0.27], hazeMix: 0.9 },
  ash: { clouds: 0.92, dens: 0.85, dark: 0.45, fogMul: 3, sunMul: 0.5, ash: 1, wind: 4, gust: 0.3, haze: [0.36, 0.3, 0.27], hazeMix: 0.55 },
};
const NUM = ['clouds', 'dens', 'dark', 'fogMul', 'fogHeight', 'sunMul', 'rain', 'snow', 'dust', 'ash', 'wind', 'gust', 'lightning', 'hazeMix'];
const GREEN = [0.75, 0.9, 1, 0.9, 0.6, 0.3, 0.1, 0, 0, 0.05, 0.25, 0.5];

export const seasonOf = (month) => (month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn');
export const greenness = (month) => GREEN[Math.max(0, Math.min(11, month - 1))];

export function kindsFor(eraId) {
  if (eraId === 'hadean') return ['clear', 'ash', 'storm'];
  if (eraId === 'dino') return ['clear', 'clouds', 'overcast', 'fog', 'rain', 'storm'];
  return ['clear', 'clouds', 'overcast', 'fog', 'rain', 'storm', 'snow', 'dust'];
}

function table(eraId, season) {
  if (eraId === 'hadean') return { clear: 0.45, ash: 0.35, storm: 0.2 };
  if (eraId === 'dino') return season === 'summer' || season === 'autumn' ? { clear: 0.36, clouds: 0.3, overcast: 0.1, fog: 0.07, rain: 0.1, storm: 0.07 } : { clear: 0.2, clouds: 0.25, overcast: 0.15, fog: 0.12, rain: 0.17, storm: 0.11 };
  const T = { summer: { clear: 0.6, clouds: 0.2, dust: 0.12, fog: 0.03, storm: 0.05 }, autumn: { clear: 0.45, clouds: 0.22, overcast: 0.1, fog: 0.1, rain: 0.08, dust: 0.05 }, winter: { clear: 0.25, clouds: 0.18, overcast: 0.15, fog: 0.15, rain: 0.15, storm: 0.05, snow: 0.07 }, spring: { clear: 0.45, clouds: 0.25, overcast: 0.1, rain: 0.12, storm: 0.05, fog: 0.03 } }[season];
  if (eraId === 'ruins' && T.dust) T.dust *= 0.3;
  return T;
}

const NEXT = { clear: ['clouds'], clouds: ['clear', 'overcast'], overcast: ['clouds', 'rain', 'fog'], fog: ['overcast', 'clouds'], rain: ['overcast', 'storm'], storm: ['rain'], snow: ['overcast'], dust: ['clear'], ash: ['clear', 'storm'] };

class Particles {
  constructor(parent, n, o) {
    this.n = n; this.alphaMax = o.alpha || 1;
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const S = instancedBufferAttribute(new THREE.InstancedBufferAttribute(seeds, 4));
    this.U = { box: uniform(new THREE.Vector3(...o.box)), fall: uniform(o.fall), wind: uniform(new THREE.Vector2()), alpha: uniform(0), light: uniform(new THREE.Color(1, 1, 1)), size: uniform(new THREE.Vector2(...o.size)) };
    const U = this.U;
    const m = fxMaterial(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    const t = time;
    const sp = S.w.mul(0.3).add(0.85);
    const y = fract(S.y.sub(t.mul(U.fall).mul(sp).div(U.box.y))).mul(U.box.y);
    const wob = o.wobble ? sin(t.mul(0.9).add(S.w.mul(6.283))).mul(o.wobble) : float(0);
    const x = S.x.mul(U.box.x).add(U.wind.x.mul(t)).add(wob);
    const z = S.z.mul(U.box.z).add(U.wind.y.mul(t)).add(wob.mul(0.7));
    const px = fract(x.sub(cameraPosition.x).div(U.box.x).add(0.5)).sub(0.5).mul(U.box.x).add(cameraPosition.x);
    const pz = fract(z.sub(cameraPosition.z).div(U.box.z).add(0.5)).sub(0.5).mul(U.box.z).add(cameraPosition.z);
    const py = cameraPosition.y.sub(U.box.y.mul(o.below || 0.35)).add(y);
    m.positionNode = vec3(px, py, pz);
    const q = uv().sub(0.5).mul(2);
    let shape;
    if (o.shape === 'streak') shape = float(1).sub(smoothstep(0.0, 1.0, q.x.abs())).mul(float(1).sub(smoothstep(0.55, 1.0, q.y.abs())));
    else if (o.shape === 'puff') shape = float(1).sub(smoothstep(0.2, 1.0, length(q).add(mx_noise_float(vec3(q.mul(1.7), S.w.mul(9.0))).mul(0.35)))).mul(0.8);
    else shape = float(1).sub(smoothstep(0.35, 1.0, length(q)));
    const dc = length(vec3(px, py, pz).sub(cameraPosition)), R = U.box.x.mul(0.5);
    const minW = dc.mul(o.minPx || 0.0013);
    m.scaleNode = vec2(max(U.size.x.mul(S.w.mul(0.6).add(0.7)), minW), max(U.size.y.mul(S.w.mul(0.6).add(0.7)), minW.mul(o.shape === 'streak' ? 18 : 1)));
    const fade = smoothstep(o.shape === 'streak' ? 2.0 : 0.6, o.shape === 'streak' ? 4.5 : 1.6, dc).mul(float(1).sub(smoothstep(R.mul(0.75), R, dc)));
    m.colorNode = vec3(...o.color).mul(U.light);
    m.opacityNode = shape.mul(U.alpha).mul(fade);
    m.fog = !!o.fog;
    this.sprite = new THREE.Sprite(m); this.sprite.count = 0; this.sprite.frustumCulled = false; this.sprite.renderOrder = 9; this.sprite.visible = false;
    parent.add(this.sprite);
  }
  set(k, wind, light) {
    const c = Math.round(this.n * Math.min(1, k));
    this.sprite.count = c; this.sprite.visible = c > 0;
    this.U.alpha.value = Math.min(1, k * 1.5) * this.alphaMax; this.U.wind.value.set(wind[0], wind[1]);
    if (light) this.U.light.value.copy(light);
  }
}

export class Weather {
  constructor(sys) {
    this.sys = sys;
    this.group = new THREE.Group(); this.group.name = 'EraWeather';
    sys.root.add(this.group);
    this.cur = { ...BASE }; this.target = { ...BASE }; this.kind = 'clear'; this.override = null; this.rate = 0.05;
    this.wet = 0; this.snowCover = 0; this.windDir = Math.random() * Math.PI * 2; this.t = 0; this.drift = 200; this.strikeT = 8; this.flash = 0; this.flashGain = 0; this.bolt = null;
    this.pushT = 0; this.lastPush = null; this.month = 0;
    this.fx = null;
    this.light = new THREE.Color();
    const api = this.api = {
      kind: 'clear', rain: 0, snow: 0, snowfall: 0, wet: 0, fog: 0, wind: [0, 0], gust: 0, season: 'autumn', kinds: [], override: null,
      lightning: { count: 0, pos: [0, 0, 0], dist: 0, t: 0 },
      set: (k) => this.set(k),
    };
    sys.game.weather = api;
  }

  sharedRng() {
    const g = this.sys.game, on = g.online;
    if (!on || on.status !== 'online' || this.override) return null;
    const slot = Math.floor((Date.now() + (on.offset || 0)) / 300000), key = on.roomId() + ':' + slot;
    let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    this.slot = slot;
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }

  roll(eraId, opts = {}) {
    const g = this.sys.game, month = g.tc ? g.tc.present.month : 10;
    const R = this.sharedRng() || Math.random;
    this.eraId = eraId; this.month = month;
    const season = seasonOf(month), kinds = kindsFor(eraId);
    this.api.kinds = kinds; this.api.season = eraId === 'hadean' ? 'none' : season;
    let kind = this.override && kinds.includes(this.override) ? this.override : null;
    if (!kind) {
      const T = table(eraId, season); let r = R(), acc = 0; kind = 'clear';
      for (const [k, p] of Object.entries(T)) { acc += p; if (r < acc) { kind = k; break; } }
      if (opts.kind && kinds.includes(opts.kind)) kind = opts.kind;
    }
    this.setTarget(kind, opts.instant !== false);
    this.windDir = R() * Math.PI * 2;
    this.drift = 150 + R() * 180;
    const P = this.target;
    this.wet = P.rain > 0 ? 0.9 : kind === 'fog' ? 0.35 : season === 'winter' && R() < 0.4 ? 0.4 : 0;
    this.snowCover = P.snow > 0 ? 0.75 : 0;
    this.pushNow();
  }

  set(kind) {
    this.override = kind || null;
    this.api.override = this.override;
    if (kind && this.api.kinds.includes(kind)) { this.setTarget(kind, false); this.rate = 0.35; if (PARAMS[kind].rain) this.wet = Math.max(this.wet, 0.5); if (PARAMS[kind].snow) this.snowCover = Math.max(this.snowCover, 0.4); }
    else if (!kind && this.eraId) this.roll(this.eraId, { instant: false });
  }

  setTarget(kind, instant) {
    this.kind = kind; this.api.kind = kind;
    this.target = { ...BASE, ...PARAMS[kind] };
    if (instant) { this.cur = { ...this.target }; this.rate = 0.05; }
    else this.rate = 0.06;
  }

  pushNow() { this.pushT = 99; }

  update(dt, cam) {
    if (!this.eraId) return;
    const g = this.sys.game, C = this.cur, T = this.target;
    this.t += dt;
    const k = 1 - Math.exp(-dt * this.rate * 4);
    for (const n of NUM) C[n] += (T[n] - C[n]) * k;
    C.haze = T.haze;
    if (this.rate > 0.06 && Math.abs(C.clouds - T.clouds) < 0.02) this.rate = 0.06;
    const on = g.online && g.online.status === 'online';
    if (on && !this.override) {
      const slot = Math.floor((Date.now() + (g.online.offset || 0)) / 300000);
      if (slot !== this.slot || g.online.roomId() !== this.sharedRoom) { this.sharedRoom = g.online.roomId(); this.roll(this.eraId, { instant: this.slot === undefined }); }
    } else if (!this.override) {
      this.drift -= dt;
      if (this.drift <= 0) { const opts = NEXT[this.kind].filter((x) => this.api.kinds.includes(x)); if (opts.length && Math.random() < 0.6) this.setTarget(opts[Math.floor(Math.random() * opts.length)], false); this.drift = 120 + Math.random() * 200; }
    }
    const month = g.tc ? g.tc.present.month : this.month;
    if (month !== this.month) { this.month = month; this.api.season = this.eraId === 'hadean' ? 'none' : seasonOf(month); this.sys.applySeason(); }
    this.wet = Math.min(1, Math.max(0, this.wet + dt * (C.rain > 0.05 ? C.rain * 0.025 : -(C.dark > 0.4 ? 0.0015 : 0.004))));
    if (this.kind === 'fog') this.wet = Math.max(this.wet, Math.min(0.35, this.wet + dt * 0.003));
    this.snowCover = Math.min(1, Math.max(0, this.snowCover + dt * (C.snow > 0.05 ? C.snow * 0.012 : -0.0015)));
    this.windDir += dt * 0.004 * Math.sin(this.t * 0.05);
    const gn = Math.sin(this.t * 0.31) * 0.5 + Math.sin(this.t * 1.13 + 1.7) * 0.3 + Math.sin(this.t * 2.9 + 0.4) * 0.2;
    const gust = Math.max(0, gn) * C.gust;
    const ws = C.wind * (1 + gust * 0.9);
    const wx = Math.sin(this.windDir) * ws, wz = Math.cos(this.windDir) * ws;
    const A = this.api;
    A.rain = C.rain; A.snowfall = C.snow; A.snow = this.snowCover; A.wet = this.wet; A.fog = Math.min(1, Math.max(0, (C.fogMul - 1) / 8)); A.wind[0] = wx; A.wind[1] = wz; A.gust = gust;
    const sky = g.sky;
    const day = Math.min(1, sky.sun.intensity / 6) * (1 - sky.state.night * 0.9) + 0.06;
    this.light.setRGB(day * 1.1, day * 1.12, day * 1.18);
    const need = C.rain > 0.01 || C.snow > 0.01 || C.ash > 0.01 || C.dust > 0.01;
    if (!this.fx && need && g.started) this.fx = this.makeParticles();
    if (this.fx) { const F = this.fx; F.rain.set(C.rain, [wx * 0.9, wz * 0.9], this.light); F.flakes.set(C.snow, [wx * 0.6, wz * 0.6], this.light); F.ash.set(C.ash, [wx * 0.5, wz * 0.5], this.light); F.dust.set(C.dust * 0.55, [wx, wz], this.light); }
    if (this.sys.scatter && this.sys.scatter.flora) this.sys.scatter.flora.U.wind.value = this.windBase(this.eraId) * (0.6 + ws / 7);
    this.sys.lib.U.wet.value = this.wet; this.sys.lib.U.snow.value = this.snowCover;
    if (this.sys.scatter && this.sys.scatter.flora) { this.sys.scatter.flora.U.wet.value = this.wet; this.sys.scatter.flora.U.snow.value = this.snowCover; }
    this.updateLightning(dt, cam, C);
    this.pushT += dt;
    const sig = [C.clouds, C.dark, C.fogMul, C.sunMul, C.hazeMix, this.wet, this.snowCover].map((v) => Math.round(v * 50)).join(',');
    if (this.pushT > 1.5 && sig !== this.lastPush) {
      this.pushT = 0; this.lastPush = sig;
      sky.setWeather({ clouds: C.clouds, dens: C.dens, dark: C.dark, grey: Math.min(1, C.dark * 1.1 + C.ash * 0.3), fogMul: C.fogMul, fogHeight: C.fogHeight > 1 ? C.fogHeight : 0, sunMul: C.sunMul, haze: C.haze, hazeMix: C.hazeMix });
      this.sys.pushPalette();
    }
  }

  makeParticles() {
    return {
      rain: new Particles(this.group, 9000, { box: [60, 32, 60], fall: 9, size: [0.03, 0.85], color: [0.8, 0.84, 0.9], shape: 'streak', alpha: 0.55, minPx: 0.0014 }),
      flakes: new Particles(this.group, 7000, { box: [56, 30, 56], fall: 1.1, size: [0.08, 0.08], color: [1, 1, 1], shape: 'flake', wobble: 0.6, minPx: 0.0022 }),
      ash: new Particles(this.group, 6000, { box: [56, 30, 56], fall: 0.7, size: [0.1, 0.1], color: [0.3, 0.27, 0.25], shape: 'flake', wobble: 0.9, minPx: 0.0024 }),
      dust: new Particles(this.group, 60, { box: [200, 26, 200], fall: 0, size: [22, 14], color: [0.6, 0.46, 0.29], shape: 'puff', below: 0.25, fog: false, alpha: 0.6 }),
    };
  }

  windBase(eraId) { return { hadean: 0.2, dino: 0.6, 1885: 0.9, 2026: 0.9, 2080: 1, ruins: 0.8, scifi: 0.5 }[eraId] || 0.8; }

  updateLightning(dt, cam, C) {
    const g = this.sys.game, sky = g.sky;
    this.flash = Math.max(0, this.flash - dt * 6);
    if (C.lightning > 0.5) {
      this.strikeT -= dt;
      if (this.strikeT <= 0) { this.strike(cam); this.strikeT = 5 + Math.random() * 14; }
    }
    const fl = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(this.t * 90)) : 0;
    sky.u.wxFlash.value = fl * this.flashGain;
    sky.flashLight.intensity = fl * 2.5 * this.flashGain;
    if (this.bolt) { this.bolt.t += dt; this.bolt.mesh.visible = this.bolt.t < 0.32 && Math.sin(this.bolt.t * 70) > -0.4; if (this.bolt.t > 0.4) { this.group.remove(this.bolt.mesh); this.bolt.mesh.geometry.dispose(); this.bolt = null; } }
  }

  strike(cam, ang, dist) {
    const V = this.sys.valley, a = ang === undefined ? Math.random() * Math.PI * 2 : ang, d = dist || 500 + Math.random() * 2200;
    const x = cam.x + Math.sin(a) * d, z = cam.z + Math.cos(a) * d, y0 = V.heightAt(x, z), top = 700 + Math.random() * 300;
    const pts = [], n = 18;
    let px = x + (Math.random() - 0.5) * 200, pz = z + (Math.random() - 0.5) * 200;
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new THREE.Vector3(px, top + (y0 - top) * t, pz)); px += (Math.random() - 0.5) * 60 * (1 - t * 0.5); pz += (Math.random() - 0.5) * 60 * (1 - t * 0.5); if (i === n - 1) { px = x; pz = z; } }
    const pos = [], idx = [], w = 3.2;
    const view = new THREE.Vector3(x - cam.x, 0, z - cam.z).normalize(), side = new THREE.Vector3(-view.z, 0, view.x);
    pts.forEach((p, i) => { pos.push(p.x - side.x * w, p.y, p.z - side.z * w, p.x + side.x * w, p.y, p.z + side.z * w); if (i) { const b = i * 2; idx.push(b - 2, b - 1, b, b - 1, b + 1, b); } });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    if (!this.boltMat) { const m = fxMaterial(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.colorNode = vec3(0.75, 0.82, 1.0).mul(40); m.opacityNode = float(1); m.fog = false; this.boltMat = m; }
    if (this.bolt) { this.group.remove(this.bolt.mesh); this.bolt.mesh.geometry.dispose(); }
    const mesh = new THREE.Mesh(geo, this.boltMat); mesh.frustumCulled = false; mesh.renderOrder = 8;
    this.group.add(mesh);
    this.bolt = { mesh, t: 0 };
    this.flash = 1; this.flashGain = Math.max(0.25, 1 - d / 3200);
    const L = this.api.lightning; L.count++; L.pos = [x, y0, z]; L.dist = Math.hypot(x - cam.x, z - cam.z); L.t = performance.now() / 1000;
  }

  debug() { return { kind: this.kind, override: this.override, season: this.api.season, rain: +this.cur.rain.toFixed(2), wet: +this.wet.toFixed(2), snow: +this.snowCover.toFixed(2), fog: +this.api.fog.toFixed(2), wind: this.api.wind.map((v) => +v.toFixed(1)) }; }
}
