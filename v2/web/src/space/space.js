// Roadster 88 space mode: arm and launch from the tablet or O, leave through the time machine's departure, arrive 400 km above the spot you left on a real 51.6° orbit at 7.67 km/s, carried in a local orbital frame (microgravity car, true-scale Earth backdrop, sun, moon and stars from the present date), change the year in orbit, cruise anywhere with the orbital drive (hold X), pick a landing point on the tablet map, and come back through a plasma re-entry onto the ground under you (the valley, or D's real-Earth patch anywhere else). Shared online room space_<period>.
import * as THREE from 'three/webgpu';
import { R_EARTH, R_MOON, AU, R_SUN, VALLEY, D2R, sunEci, moonEci, gmst, eciToEcef, enuBasis } from './astro.js';
import { lookFor, MODE, kelvinRGB } from './look.js';
import { makeUniforms, makeTextures, backdropMesh } from './planet.js';
import { Stars } from './stars.js';
import { Structures } from './structures.js';
import { Reentry } from './reentry.js';
import { Orbit, earthTurn } from './orbit.js';
import { DetailPatch } from './detail.js';
import { eraOf, formatYear, cloneDate } from '../sim/timetravel.js';

const params = new URLSearchParams(location.search);
const ASSET = '../assets/space/';
const ALT0 = 400000;
const POCKET = new THREE.Vector3(0, 6000, 0);
const RECENTER = 2600;
const LAYER = 31;
const BR = [5.802e-3, 13.558e-3, 33.1e-3];
const MIE = 0.012;
const KEY = 0.28;

export function createSpace(game) { return new SpaceMode(game); }

export function haversine(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dp = p2 - p1, dl = (b.lon - a.lon) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

class SpaceMode {
  constructor(game) {
    this.g = game;
    this.state = 'ground';
    this.active = false;
    this.armT = 0;
    this.U = makeUniforms(); this.T = makeTextures();
    this.root = new THREE.Group(); this.root.name = 'Space'; this.root.visible = false;
    this.stars = new Stars(this.U);
    this.structures = new Structures(this);
    this.reentry = new Reentry(this);
    this.backdrop = null;
    this.orbit = new Orbit();
    this.camPocket = new THREE.Vector3(); this.camEcef = new THREE.Vector3(); this.camEcefKm = new THREE.Vector3(); this.carEcef = new THREE.Vector3();
    this.anchorEcef = new THREE.Vector3(); this.sunEcef = new THREE.Vector3(1, 0, 0); this.moonEcef = new THREE.Vector3();
    this.B = new THREE.Matrix3(); this.Bt = new THREE.Matrix3(); this.e2pM4 = new THREE.Matrix4(); this.eciToEcefM = new THREE.Matrix3();
    this.orbitClock = 0; this.earthAngle = 0; this.t = 0;
    this.cruise = { k: 0, hold: 0, speed: 0 };
    this.loaded = {}; this.loading = {};
    this.lookKey = null; this.look = null;
    this.expo = 0.5; this.dark = 0;
    this.target = null; this.landing = null;
    const vb = enuBasis(VALLEY.lat, VALLEY.lon);
    this.structures.geometry(vb.up, vb.north, vb.east);
    this.orbit.start(VALLEY.lat, VALLEY.lon, ALT0, this.serverT()).frame(this.serverT());
    this.syncFrame();
    this.quality = game.gfx.backend === 'WebGL2' || game.gfx.presetName === 'low' ? 'low' : game.gfx.presetName === 'medium' ? 'medium' : 'high';
    this.detail = new DetailPatch(this, this.quality === 'low' ? 2 : 4);
    this.hud = this.makeHud();
    this.installShims();
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._m3 = new THREE.Matrix3();
  }

  get busy() { return this.state === 'launch' || this.state === 'reentry'; }

  serverT() { const o = this.g.online; return (Date.now() + ((o && o.offset) || 0)) / 1000; }

  syncFrame() {
    const O = this.orbit;
    this.B.copy(O.B); this.Bt.copy(O.Bt); this.e2pM4.setFromMatrix3(this.Bt);
    this.anchorEcef.copy(O.anchor);
  }

  orbitSpeed() { const O = this.orbit; return O.rate() * O.P.length(); }

  toPocket(ecefM, out) { return out.copy(ecefM).sub(this.anchorEcef).applyMatrix3(this.Bt).add(POCKET); }
  dirToPocket(d, out) { return out.copy(d).applyMatrix3(this.Bt); }
  altitude() { return this.camEcef.length() - R_EARTH; }
  latLonOf(ecef) { const r = ecef.length(); return { lat: Math.asin(ecef.z / r) / D2R, lon: Math.atan2(ecef.y, ecef.x) / D2R }; }

  makeHud() {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:46px;bottom:104px;font:500 13px "SF Pro Display",-apple-system,BlinkMacSystemFont,Inter,Helvetica,Arial,sans-serif;letter-spacing:0.04em;color:rgba(242,243,245,0.78);text-shadow:0 1px 10px rgba(0,0,0,0.5);display:none;white-space:nowrap;font-variant-numeric:tabular-nums';
    const hud = document.getElementById('hud');
    if (hud) hud.appendChild(el);
    return el;
  }

  installShims() {
    const g = this.g, self = this;
    const us = g.gfx.updateSun.bind(g.gfx);
    g.gfx.updateSun = (d, c, k) => us(d, c, self.active && self.root.visible ? k * 0.3 : k);
    if (g.spaceHooks) return;
    for (const k of ['valley', 'eras', 'life']) {
      const o = g[k];
      if (o && o.update && !o.__spaceWrapped) { const orig = o.update.bind(o); o.update = (...a) => (self.active ? undefined : orig(...a)); o.__spaceWrapped = true; }
    }
    const resp = g.respawn.bind(g);
    g.respawn = () => (this.active ? this.respawnInSpace() : resp());
    const exit = g.exitCar.bind(g);
    g.exitCar = () => { if (this.active) { g.hint('No spacewalks yet · stay in the Roadster', 1.8); return; } exit(); };
    const A = g.audio;
    if (A && A.update && !A.__spaceWrapped) {
      const orig = A.update.bind(A);
      A.update = (dt, s) => {
        if (!self.active) return orig(dt, s);
        const sim = Object.create(s.sim, { speed: { value: self.state === 'reentry' ? s.sim.speed : 0 } });
        orig(dt, { ...s, sim, weather: null, ambient: null });
        if (A.ctx && A.outside) A.outside.frequency.setTargetAtTime(self.state === 'reentry' ? 1800 : 700, A.ctx.currentTime, 0.2);
      };
      A.__spaceWrapped = true;
    }
  }

  canUse() {
    const g = this.g;
    return g.started && !g.paused && !g.player.dead && !g.walker.active && !g.ride && !g.tc.busy && !(g.yearIn && g.yearIn.open);
  }

  press() {
    const g = this.g;
    if (!this.canUse()) { if (g.walker.active) g.hint('Get in the Roadster first', 1.6); else if (g.ride) g.hint('Your driver flies the car', 1.6); return; }
    if (this.state === 'ground') { this.state = 'armed'; this.armT = 0; g.audio.play('tc_arm', { inside: true }); g.hint('Space armed · press O again to launch', 3); this.preload(); }
    else if (this.state === 'armed') this.launch();
    else if (this.state === 'orbit') { this.state = 'armedReturn'; this.armT = 0; g.audio.play('tc_arm', { inside: true }); g.hint(`Return armed · landing ${this.landingName(this.landingTarget())} · press O again`, 3.5); }
    else if (this.state === 'armedReturn') this.startReentry();
    if (g.cockpit) g.cockpit.dirty = true;
  }

  cancel() {
    if (this.state === 'armed') this.state = 'ground';
    else if (this.state === 'armedReturn') this.state = 'orbit';
    this.g.audio.play('tc_disarm', { inside: true });
    if (this.g.cockpit) this.g.cockpit.dirty = true;
  }

  async preload() {
    if (this.preloading) return this.preloading;
    this.preloading = (async () => {
      const big = this.quality === 'high';
      const month = this.g.tc.present.month, season = month >= 5 && month <= 10 ? 'jul' : 'jan';
      this.ensureObjects();
      const jobs = [
        this.tex('day', `earth_day_${season}_${big ? 8 : 4}k.webp`, true),
        this.makeThumb(season),
        this.tex('clouds', `earth_clouds_${big ? 8 : 4}k.webp`, false),
        this.tex('night', `earth_night_${big ? 8 : 4}k.webp`, false),
        this.tex('elev', 'earth_elev_4k.webp', false),
        this.tex('moon', `moon_${big ? 4 : 2}k.webp`, true),
        this.tex('moonElev', 'moon_elev.webp', false),
        this.tex('milky', 'milkyway_2k.webp', true),
        this.stars.mesh ? null : this.stars.load(ASSET + 'stars.bin').then(() => this.root.add(this.stars.mesh)),
      ];
      await Promise.all(jobs.filter(Boolean));
      this.loaded.season = season;
      await this.compile();
    })().catch((e) => { console.warn('space preload failed', e); });
    return this.preloading;
  }

  async tex(slot, file, srgb) {
    const key = slot + ':' + file;
    if (this.loaded[key]) { this.T[slot].value = this.loaded[key]; return this.loaded[key]; }
    if (this.loading[key]) return this.loading[key];
    this.loading[key] = (async () => {
      const loader = new THREE.ImageBitmapLoader();
      loader.setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const bmp = await loader.loadAsync(ASSET + file);
      const t = new THREE.Texture(bmp);
      t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      this.loaded[key] = t;
      this.T[slot].value = t;
      return t;
    })();
    return this.loading[key];
  }

  async makeThumb(season) {
    try { this.thumb = await createImageBitmap(await (await fetch(ASSET + `earth_thumb_${season}.webp`)).blob()); } catch (e) { this.thumb = null; }
  }

  ensureObjects() {
    if (this.backdrop) return;
    this.backdrop = backdropMesh(this.U, this.T);
    this.backdrop.onBeforeRender = (r, s, c) => { this.backdrop.position.copy(c.position); this.backdrop.scale.setScalar(Math.min(c.far * 0.45, 4000)); this.backdrop.updateMatrixWorld(); };
    this.root.add(this.backdrop, this.structures.far, this.structures.near);
    this.g.gfx.scene.add(this.root);
    this.envBackdrop = new THREE.Mesh(this.backdrop.geometry, this.backdrop.material);
    this.envBackdrop.frustumCulled = false; this.envBackdrop.visible = false; this.envBackdrop.scale.setScalar(4000);
    this.envBackdrop.onBeforeRender = (r, s, c) => { this.envBackdrop.position.copy(c.position); this.envBackdrop.updateMatrixWorld(); };
    if (this.g.sky.addEnvProxy) this.g.sky.addEnvProxy(this.envBackdrop);
  }

  async compile() {
    if (this.compiled) return;
    this.compiled = true;
    const g = this.g, was = this.root.visible;
    this.updateFrame(0);
    this.root.visible = true;
    let p = null;
    try { p = g.gfx.renderer.compileAsync(this.root, g.gfx.camera, g.gfx.scene); } catch (e) { p = null; }
    this.root.visible = was || this.active;
    if (p) { try { await p; } catch (e) { /* compiled on first draw */ } }
  }

  departureLoc() {
    const V = this.g.valley;
    return V && V.location ? { lat: V.location.lat, lon: V.location.lon, mode: V.location.mode } : { lat: VALLEY.lat, lon: VALLEY.lon, mode: 'valley' };
  }

  saveDeparture() {
    const g = this.g, tc = g.tc, s = g.car.sim;
    this.saved = { dest: cloneDate(tc.destination), last: tc.last ? cloneDate(tc.last) : null, jumps: tc.jumps, pos: new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z), quat: new THREE.Quaternion(s.q.x, s.q.y, s.q.z, s.q.w), mapId: g.mapId, loc: this.departureLoc() };
  }

  launch() {
    const tc = this.g.tc;
    this.state = 'launch';
    this.saveDeparture();
    tc.setDestination(tc.present);
    tc.departed = cloneDate(tc.present);
    tc.state = 'departing'; tc.t = 0; tc.charge = 1; tc.events.push('depart');
    this.preload();
  }

  preStep(dt) {
    const g = this.g, tc = g.tc;
    if (this.state === 'launch' && tc.state === 'gone' && !this.teleported) { this.enterSpace(false); this.teleported = true; }
    if (this.state === 'launch' && this.teleported && tc.state !== 'gone' && tc.state !== 'departing') {
      this.teleported = false; this.state = 'orbit';
      this.enterView();
      tc.setDestination(this.saved.dest); tc.last = this.saved.last; tc.jumps = this.saved.jumps;
      g.hint(`Low Earth orbit · ${Math.round(this.altitude() / 1000)} km · ${this.look ? this.look.label : ''}`, 3.5);
    }
    if (this.active) this.orbitClock += dt;
  }

  enterSpace(instant) {
    const g = this.g, car = g.car, sim = car.sim;
    this.ensureObjects();
    const T = this.serverT(), mate = this.orbitMate();
    this.target = null;
    const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 30;
    const p = POCKET.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 8, Math.sin(a) * r));
    if (mate) { Orbit.unpack(mate.so, this.orbit).propagate(T); p.copy(mate.pos).add(new THREE.Vector3(Math.cos(a) * 25, 4, Math.sin(a) * 25)); }
    else this.orbit.start(this.saved.loc.lat, this.saved.loc.lon, ALT0, T);
    this.orbit.frame(T); this.syncFrame();
    this.structures.orbitRing(this.orbit.h, this.orbit.P);
    this.structures.stationPos.set(-1800, POCKET.y + 300, 2600);
    sim.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    if (instant) { sim.body.setLinvel({ x: 0, y: 0, z: 0 }, true); sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
    sim.env.space = true;
    sim.readState(); g.capture(car); g.capture(car);
    car.pose.pos.copy(car.curr.pos);
    this.active = true;
    g.mapId = params.get('spaceroom') || 'space';
    if (instant) this.enterView();
  }

  enterView() {
    const g = this.g;
    this.root.visible = true;
    g.sky.external = this;
    if (g.sky.envSky) g.sky.envSky.visible = false;
    if (this.envBackdrop) this.envBackdrop.visible = true;
    this.prevFogMax = g.sky.u.fogMax.value;
    this.lookKey = null;
    this.camMask = g.gfx.camera.layers.mask;
    g.gfx.camera.layers.set(LAYER);
    this.tagT = 0; this.tagKeep();
    this.updateFrame(0);
    g.rig.initialized = false; g.gfx.cut();
    this.hud.style.display = '';
    this.expo = 0.5;
  }

  enterInstant() {
    this.saveDeparture();
    this.preload();
    this.enterSpace(true);
    this.state = 'orbit';
  }

  landingTarget() {
    if (this.target) return this.target;
    return this.latLonOf(this.carEcef.lengthSq() > 1 ? this.carEcef : this.anchorEcef);
  }

  landingName(t) {
    if (!t) return '';
    const home = this.saved && haversine(t, this.saved.loc) < 3000;
    if (home) return this.saved.loc.mode === 'valley' ? 'where you left (the valley)' : 'where you left';
    if (haversine(t, VALLEY) < 9000) return 'the valley';
    const ns = `${Math.abs(t.lat).toFixed(1)}°${t.lat >= 0 ? 'N' : 'S'}`, ew = `${Math.abs(t.lon).toFixed(1)}°${t.lon >= 0 ? 'E' : 'W'}`;
    return `${ns} ${ew}`;
  }

  setTarget(lat, lon) {
    this.target = { lat: Math.max(-84, Math.min(84, lat)), lon: ((lon + 540) % 360) - 180 };
    this.g.hint(`Landing target · ${this.landingName(this.target)}`, 2.2);
    if (this.g.cockpit) this.g.cockpit.dirty = true;
  }

  startReentry() {
    const g = this.g, V = g.valley;
    this.state = 'reentry';
    const t = this.landingTarget();
    this.landing = { lat: t.lat, lon: t.lon, result: null };
    const home = haversine(t, this.saved.loc) < 3000;
    if (home || !V || !V.setLocation) this.landing.result = 'home';
    else {
      const L = this.landing;
      V.setLocation(t.lat, t.lon, { year: g.tc.present.year }).then((r) => { L.result = r || { mode: 'valley' }; }, (e) => { console.warn('setLocation failed', e); L.result = 'home'; L.failed = true; });
    }
    this.reentry.start();
    g.hint(`Re-entry · ${this.landingName(t)}`, 2.5);
  }

  landingReady() { return !!(this.landing && this.landing.result); }

  landInValley() {
    const g = this.g, car = g.car, sim = car.sim, S = this.saved, V = g.valley, L = this.landing || { result: 'home' };
    for (const c of g.cars) if (c.sim.env.space) c.sim.env.space = false;
    let p, q = S && S.quat ? S.quat.clone() : new THREE.Quaternion();
    const yaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(sim.q.x, sim.q.y, sim.q.z, sim.q.w), 'YXZ').y;
    if (L.result === 'home' && !L.failed) p = S.pos.clone();
    else if (L.failed && S.loc.mode !== (V && V.location ? V.location.mode : 'valley')) { const s = V.safeSpawnAt(V.spawn.pos[0], V.spawn.pos[2]); p = new THREE.Vector3(s[0], s[1], s[2]); q.setFromEuler(new THREE.Euler(0, yaw, 0)); }
    else if (L.result === 'home') p = S.pos.clone();
    else {
      const sp = V.spawn && V.spawn.pos ? V.spawn.pos : [0, 0, 0];
      const s = V.safeSpawnAt ? V.safeSpawnAt(sp[0], sp[2]) : sp;
      p = new THREE.Vector3(s[0], s[1], s[2]);
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
    }
    sim.body.setTranslation({ x: p.x, y: p.y + 0.4, z: p.z }, true);
    sim.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    sim.body.setLinvel({ x: f.x * 6, y: 0, z: f.z * 6 }, true); sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    sim.readState(); g.capture(car); g.capture(car); car.pose.pos.copy(car.curr.pos); car.pose.quat.copy(car.curr.quat);
    this.active = false; this.state = 'ground'; this.root.visible = false;
    g.gfx.camera.layers.mask = this.camMask || 1;
    g.sky.external = null;
    if (g.sky.envSky) g.sky.envSky.visible = true;
    if (this.envBackdrop) this.envBackdrop.visible = false;
    if (this.prevFogMax !== undefined) g.sky.u.fogMax.value = this.prevFogMax;
    g.sky.twilight.position.set(0, 1, 0);
    if (g.sky.flashLight) { g.sky.flashLight.intensity = 0; g.sky.flashLight.color.set(0xd8e0ff); g.sky.flashLight.groundColor.set(0x30323a); }
    const loc = V && V.location ? V.location : { mode: 'valley' };
    g.mapId = loc.mode === 'valley' ? (S && S.mapId && S.mapId !== 'space' ? S.mapId : 'valley') : 'earth';
    g.applyClock(true);
    if (V) g.arriveValley();
    g.timeFx.arrive();
    if (g.online && g.online.flagArrive) g.online.flagArrive();
    g.audio.play('tc_arrive_zap', { pos: car.curr.pos, gain: 1 });
    g.audio.setRadio(g.settings.radio, g.eraId());
    g.rig.initialized = false; g.rig.hold = null; g.gfx.cut();
    this.hud.style.display = 'none';
    this.cruise.k = 0; this.target = null;
    if (g.onLanded) { try { g.onLanded(loc); } catch (e) { console.warn(e); } }
    const where = loc.mode === 'valley' ? '' : ` · ${this.landingName(L)}`;
    g.hint(`${eraOf(g.tc.present.year).label} · ${formatYear(g.tc.present.year)}${where}`, 3);
  }

  respawnInSpace() {
    const g = this.g, old = g.car;
    if (g.tc.busy || this.busy) return;
    old.sim.wreck = true; g.wrecks.push(old);
    const q = old.curr.quat, side = new THREE.Vector3(5, 0, 0).applyQuaternion(q);
    const p = old.sim.pos;
    const car = g.spawn([p.x + side.x, p.y + side.y + 1, p.z + side.z], old.sim.yaw());
    car.sim.env.space = true;
    car.sim.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    const v = old.sim.vel; car.sim.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    car.sim.readState(); g.capture(car); g.capture(car); car.pose.quat.copy(car.curr.quat);
    while (g.wrecks.length > g.tu.damage.max_wrecks) { const w = g.wrecks.shift(); w.sim.destroy(); g.gfx.scene.remove(w.view.root); g.cars.splice(g.cars.indexOf(w), 1); }
    g.rig.initialized = false; g.gfx.cut(); this.tagKeep();
    g.hint('New Roadster', 1.5);
  }

  keepRoots() {
    const g = this.g, keep = new Set([this.root]);
    const add = (o) => { if (o && o.isObject3D && !o.isScene) keep.add(o); };
    for (const c of g.cars) if (c.sim.env.space) add(c.view.root);
    const scan = (obj, depth) => {
      if (!obj || depth > 2) return;
      for (const v of Object.values(obj)) {
        if (!v || typeof v !== 'object') continue;
        if (v.isObject3D) add(v);
        else if (Array.isArray(v)) for (const x of v) { if (x && x.isObject3D) add(x); else if (x && typeof x === 'object') scan(x, depth + 1); }
        else if (v.mesh && v.mesh.isObject3D) add(v.mesh);
        else if (depth < 2 && v.constructor === Object) scan(v, depth + 1);
      }
    };
    scan(g.fx, 0); scan(g.timeFx, 0); scan(g.damage, 0);
    if (g.online && g.online.remotes) for (const r of g.online.remotes.values()) { if (r.view) add(r.view.root); if (r.driver && r.driver.root) add(r.driver.root); }
    if (g.driver && g.driver.root) add(g.driver.root);
    if (this.reentry.mesh) add(this.reentry.mesh);
    const sky = g.sky;
    for (const o of [sky.sun, sky.twilight, sky.flashLight, g.lamps.L, g.lamps.R, g.lamps.cabin]) add(o);
    return keep;
  }

  tagKeep() {
    for (const r of this.keepRoots()) r.traverse((o) => { if (o.layers.isEnabled(0)) o.layers.enable(LAYER); });
  }

  recenter() {
    const g = this.g, car = g.car, d = this._v.copy(car.sim.pos).sub(POCKET);
    if (d.length() < RECENTER) return;
    d.set(Math.round(d.x), Math.round(d.y), Math.round(d.z));
    this.orbit.displace(d);
    this.structures.shift(d);
    for (const c of g.cars) {
      if (!c.sim.env.space) continue;
      const t = c.sim.body.translation();
      c.sim.body.setTranslation({ x: t.x - d.x, y: t.y - d.y, z: t.z - d.z }, true);
      c.sim.readState(); c.prev.pos.sub(d); c.curr.pos.sub(d); c.pose.pos.sub(d);
    }
    g.gfx.cut();
  }

  updateCruise(dt) {
    const g = this.g, inp = g.input, C = this.cruise;
    const want = (this.state === 'orbit' || this.state === 'armedReturn') && !g.paused && inp.is('KeyX');
    C.hold = want ? C.hold + dt : 0;
    const alt = this.altitude(), dMoon = this.camEcef.distanceTo(this.moonEcef) - R_MOON;
    const near = Math.min(alt, this.look.moon.show ? dMoon : Infinity);
    const on = C.hold > 0.35 && alt > 150000;
    C.k += ((on ? 1 : 0) - C.k) * Math.min(1, dt * (on ? 0.7 : 1.8));
    if (C.k < 0.002) { C.k = 0; C.speed = 0; return; }
    C.speed = Math.min(near * 0.35, 3e8) * C.k * C.k;
    this.orbit.displace(this._v2.set(0, 0, 1).applyQuaternion(g.car.curr.quat).multiplyScalar(C.speed * dt));
  }

  updateFrame(dt) {
    const g = this.g, U = this.U, d = g.tc.present;
    const key = d.year + ':' + d.month;
    if (key !== this.lookKey) { this.lookKey = key; this.applyLook(lookFor(d.year, d.month)); }
    const L = this.look;
    this.orbit.frame(this.serverT()); this.syncFrame();
    const cam = g.gfx.camera;
    this.camPocket.copy(cam.position);
    this.camEcef.copy(this.camPocket).sub(POCKET).applyMatrix3(this.B).add(this.anchorEcef);
    this.carEcef.set(g.car.sim.pos.x, g.car.sim.pos.y, g.car.sim.pos.z).sub(POCKET).applyMatrix3(this.B).add(this.anchorEcef);
    this.camEcefKm.copy(this.camEcef).multiplyScalar(0.001);
    U.cam.value.copy(this.camEcefKm);
    U.p2e.value.copy(this.B);
    const sE = sunEci(d, this._v), theta = gmst(d, sE);
    this.earthAngle = earthTurn(this.orbit.T);
    { const a = -this.earthAngle, c = Math.cos(a), s2 = Math.sin(a); this.eciToEcefM.set(c, -s2, 0, s2, c, 0, 0, 0, 1); }
    U.sunEci.value.copy(sE);
    eciToEcef(sE, theta, this.sunEcef);
    U.sun.value.copy(this.sunEcef);
    const c = Math.cos(theta), s = Math.sin(theta);
    U.e2i.value.set(c, -s, 0, s, c, 0, 0, 0, 1);
    const i2e = this._m3.set(c, s, 0, -s, c, 0, 0, 0, 1);
    this.stars.i2e.value.copy(i2e);
    this.stars.i2p.value.copy(this.Bt).multiply(i2e);
    const mDir = this._v2;
    const md = moonEci(d, mDir) * L.moon.dist;
    eciToEcef(mDir, theta, mDir);
    this.moonEcef.copy(mDir).multiplyScalar(md);
    U.moon.value.copy(this.moonEcef).multiplyScalar(0.001);
    const xm = mDir.clone().negate(), zm = new THREE.Vector3(0, 0, 1).addScaledVector(xm, -xm.z).normalize(), ym = new THREE.Vector3().crossVectors(zm, xm);
    U.moonM.value.set(xm.x, xm.y, xm.z, ym.x, ym.y, ym.z, zm.x, zm.y, zm.z);
    U.moonZ.value.copy(zm);
    const H = g.gfx.renderer.domElement.height || innerHeight;
    const pix = 2 * Math.tan(cam.fov * D2R / 2) / Math.max(200, H * (g.gfx.scale || 1));
    U.pixel.value = pix; this.stars.px.value = pix;
    U.cloudSpin.value = (this.orbitClock * 2e-6) % 1;
    this.lighting(dt);
    if (!params.has('nodetail')) { const ah = this._ah || (this._ah = new Orbit()); ah.copy(this.orbit).propagate(this.orbit.T + 25); const ll = this.latLonOf(ah.anchor.copy(ah.P).applyMatrix3(this.eciToEcefM)); this.detail.update(ll.lat, ll.lon, this.altitude()); }
  }

  applyLook(L) {
    const U = this.U;
    this.look = L;
    U.planet.value = L.earth ? 1 : 0;
    U.mode.value = L.mode; U.lights.value = L.lights; U.lightTint.value.setRGB(...L.lightTint); U.pattern.value = L.pattern;
    U.seaLevel.value = L.seaLevel; U.iceN.value = L.iceLat; U.iceS.value = L.iceSouth; U.seaIce.value = L.seaIce; U.veg.value = L.veg; U.arid.value = L.arid;
    U.tint.value.set(...L.tint); U.warp.value = L.warp; U.mirror.value = L.mirror; U.lonShift.value = L.lonShift; U.magma.value = L.magma; U.ocean.value.set(...L.ocean);
    U.clouds.value = L.clouds; U.cloudShift.value = L.cloudShift;
    const A = L.atmo;
    U.ray.value.set(BR[0] * A.rayleigh, BR[1] * A.rayleigh, BR[2] * A.rayleigh); U.mie.value = MIE * A.mie;
    U.haze.value.set(A.haze[0] * A.hazeAmt * 0.012, A.haze[1] * A.hazeAmt * 0.012, A.haze[2] * A.hazeAmt * 0.012);
    U.hazeAbs.value.set((1 - A.haze[0]) * A.hazeAmt * 0.01, (1 - A.haze[1]) * A.hazeAmt * 0.01, (1 - A.haze[2]) * A.hazeAmt * 0.01);
    U.hazeH.value = A.hazeH; U.top.value = A.top;
    U.moonShow.value = L.moon.show ? 1 : 0; U.moonR.value = R_MOON / 1000; U.moonMaria.value = L.moon.maria; U.moonGlow.value = L.moon.glow;
    U.disk.value = L.disk; U.nebula.value = L.nebula; U.swarm.value = L.swarm;
    U.sunShow.value = L.sun.show ? 1 : 0;
    U.steps.value = this.quality === 'low' ? 8 : this.quality === 'medium' ? 10 : 12;
    U.relief.value = 2.2;
    U.sunAng.value = Math.max(0.0006, Math.atan(R_SUN * L.sun.radius / AU));
    const kc = kelvinRGB(L.sun.temp);
    this.sunColor = new THREE.Color(kc[0], kc[1], kc[2]);
    if (L.mode === MODE.paleo) this.tex('paleo', `paleo_${String(L.paleo).padStart(3, '0')}.webp`, false);
    if (L.mode === MODE.present && this.loaded.season && L.season !== this.loaded.season) { this.loaded.season = L.season; this.tex('day', `earth_day_${L.season}_${this.quality === 'high' ? 8 : 4}k.webp`, true); this.makeThumb(L.season); }
    this.structures.setLook(L);
    this.stars.setAge(L.starAge);
    if (this.g.sky) this.g.sky.envDirty = true;
    if (this.active) this.tagKeep();
  }

  lighting(dt) {
    const g = this.g, sky = g.sky, U = this.U, L = this.look;
    const sunP = this.dirToPocket(this.sunEcef, this._v).normalize();
    sky.sunDir.copy(sunP);
    if (sky.lightDir && sky.lightDir.isVector3) sky.lightDir.copy(sunP); else sky.lightDir = sunP.clone();
    const ce = this.camEcef, sd = this.sunEcef;
    const b = ce.dot(sd), closest = Math.sqrt(Math.max(0, ce.lengthSq() - b * b)) - R_EARTH;
    let T = [1, 1, 1], vis = 1;
    if (L.earth && b < 0) {
      if (closest < 0) vis = 0;
      else if (closest < L.atmo.top * 1000) {
        const Hs = 8000, sq = Math.sqrt(2 * Math.PI * (R_EARTH + closest) * Hs) / 1000;
        const dens = Math.exp(-closest / Hs) * L.atmo.rayleigh, mie = Math.exp(-closest / 1200) * MIE * 1.11 * L.atmo.mie * Math.sqrt(2 * Math.PI * (R_EARTH + closest) * 1200) / 1000;
        T = BR.map((k) => Math.exp(-(k * dens * sq + mie)));
      }
    }
    const sunI = 12 * Math.min(1.6, L.sun.show ? L.sun.lum : 0) * (L.nebula ? 0.15 : 1);
    U.sunI.value = sunI;
    U.sunCol.value.copy(this.sunColor);
    const k = vis * (L.sun.show ? 1 : 0);
    sky.sun.color.setRGB(this.sunColor.r * T[0], this.sunColor.g * T[1], this.sunColor.b * T[2]);
    sky.sun.intensity = sunI * k * (T[0] + T[1] + T[2]) / 3 * (L.sun.radius > 30 ? 0.6 : 1);
    sky.state.night = this.dark; sky.u.night.value = 0;
    const up = this._v2.copy(ce).normalize();
    const r = ce.length(), frac = L.earth ? 1 - Math.sqrt(Math.max(0, 1 - (R_EARTH / r) ** 2)) : 0;
    const phase = 0.5 * (1 + up.dot(sd));
    const glow = L.mode === MODE.hadean || L.mode === MODE.lava ? 0.35 * L.magma : 0;
    sky.twilight.intensity = 2.4 * phase * frac * sunI / 12 + glow * frac * 2;
    const ec = L.mode === MODE.archean ? [1.0, 0.62, 0.32] : L.mode === MODE.hadean || L.mode === MODE.lava ? [1.0, 0.45, 0.2] : L.mode === MODE.snowball ? [0.85, 0.92, 1.0] : L.mode === MODE.dying ? [0.9, 0.7, 0.5] : [0.55, 0.7, 1.0];
    sky.twilight.color.setRGB(0.012, 0.012, 0.018);
    sky.twilight.groundColor.setRGB(...ec);
    if (L.nebula) { sky.twilight.intensity = 1.1 * L.nebula; sky.twilight.color.setRGB(0.9, 0.35, 0.3); sky.twilight.groundColor.setRGB(0.5, 0.25, 0.35); sky.sun.intensity = Math.max(sky.sun.intensity, 2.5 * vis); sky.sun.color.setRGB(1, 0.6, 0.35); }
    if (L.disk) { sky.twilight.intensity = 0.7; sky.twilight.color.setRGB(0.9, 0.7, 0.5); sky.twilight.groundColor.setRGB(0.6, 0.45, 0.3); }
    sky.twilight.position.copy(this.dirToPocket(up, new THREE.Vector3()));
    if (sky.flashLight) { const h = this.reentry.heat; sky.flashLight.intensity = h * 7; sky.flashLight.color.setRGB(1, 0.45, 0.18); sky.flashLight.groundColor.setRGB(1, 0.35, 0.08); }
    sky.u.fogMax.value = 0;
    if (sky.envLight) { sky.envLight.color.copy(sky.sun.color); sky.envLight.intensity = sky.sun.intensity; sky.envLight.position.copy(sunP).multiplyScalar(100); }
    if (sky.envFill) sky.envFill.intensity = 0;
    const darkT = k < 0.5 ? 1 : 0;
    this.dark += (darkT - this.dark) * Math.min(1, dt * 0.6);
    const target = THREE.MathUtils.clamp(KEY / Math.max(this.meter(sunI * k, sunP), 0.004), 0.3, 2.2);
    const rate = target > this.expo ? 0.7 : 2.2;
    this.expo = Math.exp(Math.log(this.expo) + (Math.log(target) - Math.log(this.expo)) * Math.min(1, dt * rate));
    sky.exposure = this.expo;
    const seen = THREE.MathUtils.smoothstep(this.expo, 0.9, 2.4);
    this.stars.gain.value = seen;
    U.milky.value = seen;
    this.envT = (this.envT || 0) + dt;
    const ek = (k > 0.5 ? 1 : 0) + Math.round(this.altitude() / 2e5);
    if (this.envT > 6 || ek !== this.envKey) { this.envT = 0; this.envKey = ek; sky.envDirty = true; }
  }

  meter(sunLight, sunP) {
    const cam = this.g.gfx.camera, U = this.U, L = this.look;
    const f = this._mf || (this._mf = new THREE.Vector3()), r = this._mr || (this._mr = new THREE.Vector3()), u = this._mu || (this._mu = new THREE.Vector3()), d = this._md || (this._md = new THREE.Vector3());
    cam.getWorldDirection(f); r.set(1, 0, 0).applyQuaternion(cam.quaternion); u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const ty = Math.tan(cam.fov * D2R / 2), tx = ty * cam.aspect;
    const ro = this.camEcef, R = R_EARTH, sun = this.sunEcef, lr = ro.length();
    let sum = 0, n = 0;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      d.copy(f).addScaledVector(r, i / 2 * tx * 0.9).addScaledVector(u, j / 2 * ty * 0.9).normalize().applyMatrix3(this.B);
      const b = ro.dot(d), h = b * b - (lr - R) * (lr + R);
      if (L.earth && h > 0 && b < 0) {
        const t = -b - Math.sqrt(h), px = ro.x + d.x * t, py = ro.y + d.y * t, pz = ro.z + d.z * t;
        const lit = Math.max(0, (px * sun.x + py * sun.y + pz * sun.z) / R);
        sum += 0.3 * U.sunI.value / Math.PI * Math.pow(lit, 0.8) + 0.002;
      }
      n++;
    }
    const carLit = sunLight > 0 ? 0.18 * sunLight / 12 : 0;
    const sunSeen = sunLight > 0 && f.dot(sunP) > Math.cos(cam.fov * D2R * 0.5) ? 0.25 * sunLight / 12 : 0;
    return sum / n + carLit + sunSeen;
  }

  update(fdt) {
    const g = this.g;
    if (params.has('space') && !this.autoDone && g.started && !g.paused) { this.autoDone = true; this.enterInstant(); }
    if (g.input && g.input.hit('KeyO') && !g.paused) this.press();
    this.reentry.tick(fdt);
    if (this.state === 'armed' || this.state === 'armedReturn') { this.armT += fdt; if (this.armT > 12) { this.cancel(); g.hint(this.active ? 'Return disarmed' : 'Space disarmed', 1.4); } }
    if (!this.active || !this.root.visible) return;
    this.t += fdt;
    if (this.state !== 'reentry') g.mapId = params.get('spaceroom') || 'space';
    if (this.state === 'orbit' || this.state === 'armedReturn') this.updateCruise(fdt);
    this.recenter();
    this.tagT += fdt;
    if (this.tagT > 0.3) { this.tagT = 0; this.tagKeep(); }
    if (this.state === 'reentry') this.reentry.update(fdt);
    if (!this.active) return;
    this.updateFrame(fdt);
    this.structures.update(fdt, this.t);
    if (this.state === 'orbit' && this.altitude() < 120000) this.startReentry();
    this.updateHud();
  }

  updateHud() {
    const alt = this.altitude(), C = this.cruise;
    const km = alt / 1000;
    const altS = km < 10000 ? `${Math.round(km).toLocaleString('en-US')} km` : `${Math.round(km / 1000).toLocaleString('en-US')},000 km`;
    const zone = km < 2000 ? 'LOW EARTH ORBIT' : km < 35000 ? 'HIGH ORBIT' : km < 37000 ? 'GEOSTATIONARY' : km < 300000 ? 'CISLUNAR SPACE' : 'NEAR THE MOON';
    const cruise = C.k > 0.01 ? ` · DRIVE ${C.speed >= 1e6 ? (C.speed / 1e6).toFixed(1) + 'k' : Math.round(C.speed / 1000)} km/s` : '';
    const st = this.state === 'armedReturn' ? ' · RETURN ARMED' : this.state === 'reentry' ? ' · RE-ENTRY' : '';
    const vo = this.look && this.look.earth && km < 40000 ? ` · ${(this.orbitSpeed() / 1000).toFixed(2)} km/s` : '';
    const txt = `${this.look && !this.look.earth ? 'NO EARTH YET' : zone} · ${altS}${vo}${cruise}${st}`;
    if (txt !== this.hudTxt) { this.hudTxt = txt; this.hud.textContent = txt; }
  }

  netOffset() {
    return this.active && this.root.visible ? this.orbit.pack() : null;
  }

  orbitMate() {
    const on = this.g.online;
    if (!on || !on.remotes) return null;
    for (const r of on.remotes.values()) if (Array.isArray(r.so) && r.so.length >= 10 && !r.hidden) return r;
    return null;
  }

  netAdjust(r) {
    const o = r.so;
    if (!this.active || !Array.isArray(o) || o.length < 10) return;
    const T = this.orbit.T;
    const ro = r._orb || (r._orb = new Orbit());
    if (r._soKey !== o[9]) { Orbit.unpack(o, ro); r._soKey = o[9]; }
    ro.frame(T);
    const X = this._na || (this._na = new THREE.Vector3());
    X.copy(r.pos).sub(POCKET).applyMatrix3(ro.B).add(ro.anchor);
    this.toPocket(X, r.pos);
    const M = this._nm || (this._nm = new THREE.Matrix3());
    M.copy(this.Bt).multiply(ro.B);
    r.vel.applyMatrix3(M);
    const q = this._nq || (this._nq = new THREE.Quaternion());
    r.quat.premultiply(q.setFromRotationMatrix(new THREE.Matrix4().setFromMatrix3(M))).normalize();
    if (r.pos.distanceTo(POCKET) > 40000) { r.hideUntil = performance.now() + 400; r.pos.copy(POCKET).add(new THREE.Vector3(0, -30000, 0)); }
  }

  groundTrack() {
    const now = performance.now();
    if (this._gt && now - this._gtAt < 1000) return this._gt;
    const o = this._gto || (this._gto = new Orbit());
    o.copy(this.orbit);
    const T0 = o.T, per = 2 * Math.PI / o.rate(), pts = [];
    for (let i = 0; i <= 72; i++) { o.frame(T0 + per * i / 72); pts.push(this.latLonOf(o.anchor)); }
    this._gt = pts; this._gtAt = now;
    return pts;
  }

  info() {
    const t = this.active ? this.landingTarget() : null;
    const track = this.active && this.altitude() < 2e6 ? this.groundTrack() : null;
    return { state: this.state, active: this.active, alt: this.active ? this.altitude() : 0, cruise: this.cruise.speed, label: this.look ? this.look.label : '', earth: this.look ? this.look.earth : true, sunlit: this.dark < 0.5, landing: t, landingName: this.landingName(t), sub: this.active ? this.latLonOf(this.carEcef) : null, picked: !!this.target, track, home: this.active && this.saved ? this.saved.loc : null };
  }
}

export { POCKET };
