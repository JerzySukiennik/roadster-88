// Roadster 88 web entry: boots renderer, physics and world, runs the fixed-step sim with render interpolation, and wires cameras, input, cars and wrecks, damage, time circuits, effects, audio, HUD and the title and pause menu.
import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { Gfx, PRESETS } from './render/gfx.js';
import { SkySystem } from './render/sky.js';
import { PlateView } from './render/plate.js';
import { CarMaterials } from './render/carMaterials.js';
import { CarView, loadRealCar } from './render/carView.js';
import { CameraRig } from './render/camera.js';
import { FX } from './render/fx.js';
import { TimeFX } from './render/fxTime.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Menu } from './menu.js';
import { Walker } from './walker.js';
import { Online } from './online.js';
import { AudioEngine } from './audio.js';
import { DamageSystem } from './damage.js';
import { Cockpit } from './render/cockpit.js';
import { Driver } from './render/driver.js';
import { buildLayout } from './sim/layout.js';
import { PhysicsWorld } from './sim/world.js';
import { CarSim, GROUP, groups } from './sim/car.js';
import { MPH } from './sim/math.js';
import { generateLattice } from './sim/latticeGen.js';
import { TimeCircuits, ERAS, eraOf, formatYear } from './sim/timetravel.js';

const params = new URLSearchParams(location.search);
const SURFACE_GRIP = { asphalt: 1, rock: 0.9, dirt: 0.78, grass: 0.72, sand: 0.62, water: 0.35, lava: 0.6 };
const MAP = params.get('map') === 'plate' ? 'plate' : 'valley';
const $ = (id) => document.getElementById(id);
const store = { get(k, d) { try { const v = localStorage.getItem('r88.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('r88.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } } };

const T0 = performance.now();
function progress(f, text) { $('ldBar').style.width = `${Math.round(f * 100)}%`; if (text) $('ldText').textContent = text; if (params.has('debug')) console.log('boot', text, Math.round(performance.now() - T0)); }

class Game {
  async boot() {
    progress(0.05, 'Tuning');
    this.tu = await (await fetch('../shared/tuning.json', { cache: 'no-store' })).json();
    this.dt = 1 / this.tu.physics_hz;
    progress(0.12, 'Renderer');
    const preset = params.get('q') || store.get('quality', 'high');
    this.gfx = await Gfx.create($('view'), { preset: PRESETS[preset] ? preset : 'high', webgl: params.has('webgl'), dynres: !params.has('nodynres'), gpuTime: params.has('gputime'), flags: { noao: params.has('noao'), nomblur: params.has('nomblur'), noflare: params.has('noflare'), nobloom: params.has('nobloom'), notaa: params.has('notaa') } });
    progress(0.25, 'Physics');
    await RAPIER.init();
    this.R = RAPIER;
    this.mapName = this.mapId = MAP;
    this.maps = [{ id: 'valley', name: 'Valley', desc: 'An invented California valley: highway, race loop, canyon, mesa, dunes and a dry lake', ready: true }, { id: 'plate', name: 'Test plate', desc: 'Ramps, ravines, towers, loop and crash zone', ready: true }];
    this.layout = MAP === 'plate' ? buildLayout() : null;
    this.phys = new PhysicsWorld(RAPIER, this.tu, this.layout);
    this.walker = new Walker(this);
    progress(0.35, 'Sky');
    this.sky = new SkySystem(this.gfx, this.gfx.preset);
    if (params.has('envoff')) this.sky.envOff = true;
    if (params.has('shadowoff')) this.sky.sun.castShadow = false;
    this.gfx.onPreset = (P) => { this.sky.applyShadowPreset(P); };
    this.tc = new TimeCircuits(this.tu);
    this.tc.setDestination(ERAS[store.get('destEra', 1)].date);
    this.applyClock(true);
    if (this.layout) {
      progress(0.45, 'Test plate');
      this.plate = new PlateView(this.gfx, this.layout, this.sky);
    } else {
      progress(0.45, 'Valley');
      const { createValley } = await import('./world/valley.js');
      this.valley = await createValley(this, (f) => progress(0.45 + f * 0.12, 'Valley'));
    }
    this.map = this.valley || this.layout;
    if (params.has('noshadow')) this.sky.sun.castShadow = false;
    if (params.has('nodriverpose')) this.noDriverPose = true;
    this.fx = new FX(this.gfx.scene, this.gfx.preset);
    progress(0.6, 'Roadster');
    this.mats = new CarMaterials();
    this.settings = { assist: store.get('assist', true), wing: store.get('wing', false), roof: store.get('roof', true), paint: store.get('paint', 'white'), radio: store.get('radio', false) };
    this.mats.setPaint(this.settings.paint);
    this.template = await loadRealCar(this.gfx.preset.carLod);
    this.latticeData = await this.loadLattice();
    this.damage = new DamageSystem(this);
    this.timeFx = new TimeFX(this.gfx.scene, this.fx, this.mats);
    this.audio = new AudioEngine();
    this.store = store;
    this.cockpit = new Cockpit(this);
    this.cars = []; this.wrecks = [];
    this.lamps = { L: new THREE.SpotLight(0xf2f6ff, 0, 140, 0.42, 0.55, 1.6), R: new THREE.SpotLight(0xf2f6ff, 0, 140, 0.42, 0.55, 1.6), cabin: new THREE.PointLight(0x9fb8ff, 0, 1.6, 2) };
    for (const k of ['L', 'R']) { this.lamps[k].castShadow = false; this.gfx.scene.add(this.lamps[k], this.lamps[k].target); }
    this.gfx.scene.add(this.lamps.cabin);
    const sp = this.map.spawn.pos.slice(), sy = this.map.spawn.yaw;
    if (store.get('online', true) && !params.has('offline') && (!params.has('debug') || params.has('jitter'))) {
      const along = (Math.random() * 2 - 1) * 55, lane = Math.round(Math.random() * 2 - 1) * 3.6;
      sp[0] += Math.sin(sy) * along + Math.cos(sy) * lane; sp[2] += Math.cos(sy) * along - Math.sin(sy) * lane;
      this.rayObj = this.rayObj || new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
      const gy = this.groundHeight(sp[0], sp[2], sp[1] + 20); if (gy !== null) sp[1] = gy + 0.05;
    }
    this.spawn(sp, sy);
    if (this.valley) { await this.loadEras(); await this.loadLife(); }
    this.input = new Input($('view'));
    this.hud = new Hud($('hud'));
    this.rig = new CameraRig(this.gfx.camera, this.tu);
    this.rayObj = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this.acc = 0; this.last = performance.now(); this.paused = false; this.time = 0;
    this.frames = []; this.spikes = 0; this.frameCount = 0; this.warm = 0; this.prof = { sim: 0, mid: 0, render: 0 };
    this.menu = new Menu(this);
    this.online = new Online(this);
    this.harness = params.has('debug');
    this.input.onLockChange = (locked) => { if (!locked && !this.paused && this.started && !this.harness) this.setPaused(true); };
    const unlock = () => { this.audio.unlock().then(() => this.audio.setRadio(this.settings.radio, this.eraId())); };
    addEventListener('keydown', unlock); addEventListener('mousedown', unlock);
    if (this.harness) this.exposeDebug();
    this.driver = new Driver(this);
    if (!params.has('nodriver')) {
      progress(0.75, 'Driver');
      try { const root = await this.driver.load(this.gfx.preset.mobileAvatar, store.get('outfit', 0)); this.car.view.root.add(root); } catch (e) { console.warn('driver failed', e); this.driver.ready = false; }
    }
    progress(0.9, 'Shaders');
    this.started = false;
    this.sky.update(0, this.car.sim.pos, true);
    this.rig.updateChase(0.016, this.chaseState(0), performance.now() / 1000, (o, d, l) => this.camRay(o, d, l));
    this.placeLamps();
    if (this.valley) this.valley.update(0, this.gfx.camera.position, this.gfx.camera);
    if (params.has('noprewarm')) { try { await this.gfx.renderer.compileAsync(this.gfx.scene, this.gfx.camera); } catch (e) { /* ignore */ } } else await this.prewarm();
    progress(0.96, 'Shaders');
    this.gfx.renderer.setAnimationLoop(() => this.frame());
    const tw = performance.now();
    await new Promise((res) => { const chk = () => (this.stable >= 20 || performance.now() - tw > 25000 ? res() : setTimeout(chk, 50)); chk(); });
    progress(1, ''); $('loading').classList.add('done'); this.started = true;
    this.online.start();
    if (this.harness || params.has('nomenu')) this.hint('Click to drive. Esc for the menu.', 4);
    else { this.paused = true; this.menu.showTitle(); }
  }

  async loadLattice() {
    try { const r = await fetch('../shared/lattice.json', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); if (d.nodes && d.beams) return d; } } catch (e) { /* placeholder below */ }
    return generateLattice(this.tu);
  }

  async loadEras() {
    if (params.has('noeras')) { this.eras = null; this.applyEra(true); return; }
    try {
      const mod = await import('./eras/eras.js');
      this.eras = new mod.EraSystem(this, this.valley);
    } catch (e) { this.eras = null; if (params.has('debug')) console.warn('eras module not loaded:', e && e.message); }
    this.applyEra(true);
  }

  async loadLife() {
    if (params.has('nolife')) return;
    try {
      const mod = await import('./life/life.js');
      this.life = new mod.LifeSystem(this, this.valley, this.eras);
      if (this.life.setEra) this.life.setEra(this.eraId());
    } catch (e) { this.life = null; if (params.has('debug')) console.warn('life module not loaded:', e && e.message); }
  }

  applyEra(instant) {
    const id = this.eraId();
    if (this.eras) { try { this.eras.apply(id, { instant }); return; } catch (e) { console.warn('eras.apply failed', e); } }
    this.valley.setEraTerrain(id);
  }

  arriveValley() {
    this.applyEra(false);
    if (this.life && !this.lifeBroken) { try { this.life.setEra(this.eraId()); } catch (e) { this.lifeBroken = true; console.error('life.setEra failed', e); } }
    const sim = this.car.sim, p = sim.pos;
    const s = this.valley.safeSpawnAt(p.x, p.z, p.y, { body: sim.body, rot: sim.body.rotation() });
    if (s[1] > p.y + 0.01 || s[0] !== p.x || s[2] !== p.z) { sim.body.setTranslation({ x: s[0], y: s[1], z: s[2] }, true); sim.readState(); this.capture(this.car); this.capture(this.car); }
  }

  yearLabel(y) { if (this._yl !== y) { this._yl = y; this._yls = formatYear(y); } return this._yls; }

  eraId() { return eraOf(this.tc.present.year).id; }

  applyClock(force) {
    const p = this.tc.present;
    const h = p.hour + p.minute / 60;
    if (force || Math.abs(h - (this.lastSkyHour || -9)) > 0.02) { this.sky.setTime(p.month, p.day, h); this.lastSkyHour = h; }
  }

  spawn(pos, yaw) {
    const sim = new CarSim(this.R, this.phys.world, this.tu, { position: pos, yaw, wing: this.settings.wing });
    sim.id = 'c' + (this.carSerial = (this.carSerial || 0) + 1);
    sim.flight.assist = this.settings.assist;
    const view = new CarView(this.tu, this.mats, this.template);
    view.setWing(this.settings.wing); view.setRoof(this.settings.roof);
    this.gfx.scene.add(view.root);
    const car = { sim, view, prev: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, curr: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, pose: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() } };
    this.damage.attach(car, this.latticeData);
    this.capture(car); this.capture(car);
    car.pose.pos.copy(car.curr.pos); car.pose.quat.copy(car.curr.quat);
    view.root.position.copy(car.pose.pos); view.root.quaternion.copy(car.pose.quat); view.root.updateMatrixWorld(true);
    this.timeFx.setSurface(view.root);
    this.cockpit.bind(view);
    if (this.driver && this.driver.root && !this.walker.active) this.driver.attach(view.root, false);
    this.cars.push(car);
    this.car = car;
    return car;
  }

  placeLamps() {
    const v = this.car.view, root = v.root;
    root.updateMatrixWorld(true);
    for (const [k, nm, x] of [['L', 'Lamp_Head_L', 0.72], ['R', 'Lamp_Head_R', -0.72]]) {
      const lamp = this.lamps[k], a = v.n[nm];
      if (a) a.getWorldPosition(lamp.position); else lamp.position.set(x, 0.58, 2.0).applyMatrix4(root.matrixWorld);
      lamp.target.position.set(x * 1.3, -0.6, 20).applyMatrix4(root.matrixWorld);
      lamp.target.updateMatrixWorld();
    }
    this.lamps.cabin.position.set(0.1, 0.85, 0.15).applyMatrix4(root.matrixWorld);
  }

  async prewarm() {
    const g = this.gfx, fx = this.fx, tf = this.timeFx, p = this.car.curr.pos;
    for (const pool of fx.pools) { pool.spawn(p.x, p.y + 1, p.z + 4, 0, 0, 0, 0.05, 0.01, 0.01, 0, 0, 0, 0, 1, 0); pool.update(0.001); }
    fx.jets.begin(); fx.jets.add(new THREE.Vector3(p.x, p.y + 1, p.z + 4), new THREE.Vector3(0, 0, 1), 0.01, 0.01, 0, 0, 0, g.camera.position, 0); fx.jets.end();
    fx.ring.mesh.visible = true; fx.ring.alpha.value = 0;
    tf.depart(p.clone().add(new THREE.Vector3(0, 0, 4)), this.car.curr.quat.clone(), { x: 0, y: 0, z: 1 }, true, [{ x: p.x, y: 0, z: p.z + 4 }]);
    tf.depart(p.clone().add(new THREE.Vector3(0, 0, 4)), this.car.curr.quat.clone(), { x: 0, y: 0, z: 1 }, false, []);
    tf.state.flash = 0; tf.arcs.geometry.setDrawRange(0, 2);
    this.damage.shards.mesh.count = 1;
    const sk = fx.skids.mesh.geometry; sk.setDrawRange(0, 6);
    const cam = g.camera, saveQ = cam.quaternion.clone(), saveFov = cam.fov;
    cam.fov = 120; cam.updateProjectionMatrix();
    for (let i = 0; i < 4; i++) {
      cam.quaternion.setFromEuler(new THREE.Euler(-0.15, i * Math.PI / 2, 0, 'YXZ')); cam.updateMatrixWorld();
      try { await g.renderer.compileAsync(g.scene, cam); } catch (e) { console.warn('precompile', e); }
    }
    cam.quaternion.copy(saveQ); cam.fov = saveFov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    for (const t of tf.trails) g.scene.remove(t.mesh);
    tf.trails.length = 0; tf.implosion.visible = false; tf.arcs.geometry.setDrawRange(0, 0);
    this.damage.shards.mesh.count = 0; sk.setDrawRange(0, Infinity);
    for (const pool of fx.pools) pool.clear();
    fx.jets.begin(); fx.jets.end(); fx.ring.mesh.visible = false;
  }

  capture(car) {
    car.prev.pos.copy(car.curr.pos); car.prev.quat.copy(car.curr.quat);
    const s = car.sim; car.curr.pos.set(s.pos.x, s.pos.y, s.pos.z); car.curr.quat.set(s.q.x, s.q.y, s.q.z, s.q.w);
  }

  respawn() {
    if (this.tc.busy) return;
    const old = this.car;
    old.sim.wreck = true;
    this.wrecks.push(old);
    const o = this.tu.damage.respawn_offset;
    const yaw = old.sim.yaw();
    const ox = o[0] * Math.cos(yaw) + o[2] * Math.sin(yaw), oz = -o[0] * Math.sin(yaw) + o[2] * Math.cos(yaw);
    const p = [old.sim.pos.x + ox, Math.max(0, old.sim.pos.y) + 0.6, old.sim.pos.z + oz];
    const g = this.groundHeight(p[0], p[2], p[1] + 5);
    if (g !== null) p[1] = g + 0.08;
    if (this.valley) { const s = this.valley.safeSpawnAt(p[0], p[2], p[1]); p[0] = s[0]; p[1] = s[1]; p[2] = s[2]; }
    this.spawn(p, yaw);
    while (this.wrecks.length > this.tu.damage.max_wrecks) {
      const w = this.wrecks.shift();
      w.sim.destroy(); this.gfx.scene.remove(w.view.root);
      this.cars.splice(this.cars.indexOf(w), 1);
    }
    this.rig.initialized = false; this.gfx.cut();
    this.hint('New Roadster', 1.5);
  }

  groundHeight(x, z, from) {
    const r = this.rayObj;
    r.origin.x = x; r.origin.y = from; r.origin.z = z; r.dir.x = 0; r.dir.y = -1; r.dir.z = 0;
    const h = this.phys.world.castRay(r, 200, true, undefined, groups(GROUP.CAR, GROUP.STATIC));
    return h ? from - h.timeOfImpact : null;
  }

  camRay(o, d, len) {
    const r = this.rayObj;
    r.origin.x = o.x; r.origin.y = o.y; r.origin.z = o.z; r.dir.x = d.x; r.dir.y = d.y; r.dir.z = d.z;
    const h = this.phys.world.castRay(r, len, true, undefined, groups(GROUP.CAR, GROUP.STATIC));
    return h ? h.timeOfImpact : null;
  }

  hint(text, sec = 2.5) {
    const h = $('hint'); h.textContent = text; h.classList.add('on');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => h.classList.remove('on'), sec * 1000);
  }

  handleKeys() {
    const I = this.input;
    if (I.hit('Escape') && this.menu.mode !== 'title') this.setPaused(!this.paused);
    if (this.paused) return;
    if (I.hit('KeyF')) { if (this.walker.active) this.enterCar(); else this.exitCar(); }
    if (this.walker.active) { if (I.hit('KeyR')) this.spawnNearWalker(); return; }
    if (I.hit('KeyC')) { this.rig.mode = this.rig.mode === 'chase' ? 'fpp' : 'chase'; this.rig.fppYaw = 0; this.rig.fppPitch = 0; this.gfx.cut(); }
    if (I.hit('KeyR')) this.respawn();
    if (I.hit('KeyT')) this.toggleArm();
  }

  doorPulse(car, open) {
    car.view.doorTarget = open ? 1 : 0;
    this.audio.play(open ? 'door_open' : 'door_close', { pos: car.curr.pos });
  }

  exitCar() {
    const car = this.car, s = car.sim;
    if (this.tc.busy || this.tc.state === 'gone') return;
    if (s.speed > 4) { this.hint('Slow down to get out', 1.6); return; }
    const p = new THREE.Vector3(1.45, 0, -0.15).applyQuaternion(car.curr.quat).add(car.curr.pos);
    const gy = this.groundHeight(p.x, p.z, s.pos.y + 2.5);
    const y = gy === null ? s.pos.y : gy;
    const yaw = Math.atan2(s.left.x, s.left.z);
    this.doorPulse(car, true);
    this.walker.enter(p.x, y + 0.02, p.z, yaw);
    this.driver.attach(this.gfx.scene, true);
    this.rig.mode = 'foot'; this.rig.footYaw = s.yaw() + 0.35; this.rig.footPitch = 0.22; this.rig.footInit = false; this.rig.hold = null;
    this.gfx.cut();
    clearTimeout(this.doorT); this.doorT = setTimeout(() => { if (this.walker.active) this.doorPulse(car, false); }, 1600);
    this.hint('F to get in · Shift to run · Space to jump', 3);
  }

  enterCar() {
    const c = this.walker.nearestCar();
    if (!c) { this.hint('Walk up to a Roadster to get in', 1.6); return; }
    this.doorPulse(c, true);
    this.walker.leave();
    if (c !== this.car) {
      const wi = this.wrecks.indexOf(c); if (wi >= 0) this.wrecks.splice(wi, 1);
      c.sim.wreck = false; c.sim.flight.assist = this.settings.assist;
      this.car = c;
      this.cockpit.bind(c.view); this.timeFx.setSurface(c.view.root);
    }
    this.driver.attach(c.view.root, false);
    this.rig.mode = 'chase'; this.rig.initialized = false; this.gfx.cut();
    clearTimeout(this.doorT); this.doorT = setTimeout(() => { if (!this.walker.active) this.doorPulse(c, false); }, 1100);
  }

  spawnNearWalker() {
    const w = this.walker, f = { x: Math.sin(this.rig.footYaw), z: Math.cos(this.rig.footYaw) };
    const p = [w.pos.x + f.x * 6, w.pos.y + 1.2, w.pos.z + f.z * 6];
    const g = this.groundHeight(p[0], p[2], p[1] + 5); if (g !== null) p[1] = g + 0.08;
    const keep = this.car;
    const car = this.spawn(p, this.rig.footYaw + Math.PI / 2);
    this.car = keep; this.cockpit.bind(keep.view); this.timeFx.setSurface(keep.view.root);
    car.sim.flight.assist = this.settings.assist;
    this.hint('New Roadster', 1.5);
  }

  toggleArm() {
    this.tc.toggleArm();
    this.hint(this.tc.armed ? `Time circuits armed · ${formatYear(this.tc.destination.year)}` : 'Time circuits off', 1.8);
  }

  step(dt) {
    const inp = this.input.controls(dt);
    const gone = this.tc.state === 'gone';
    for (const c of this.cars) {
      this.applyEnv(c.sim);
      if (c === this.car && gone) { c.sim.readState(); continue; }
      c.sim.preStep(dt, c === this.car && !this.walker.active ? inp : this.walker.parked);
    }
    if (this.walker.active) this.walker.step(dt, this.input, this.rig.footYaw);
    this.online.preStep(dt);
    if (this.valley) this.valley.preStep(dt, this.cars);
    this.phys.thrustOnProps(this.car.sim, dt);
    this.phys.step((a, b, f) => this.damage.onContact(a, b, f));
    for (const c of this.cars) { c.sim.postStep(dt); this.capture(c); }
    this.damage.step(dt);
    this.tc.update(dt, this.car.sim.speed / MPH, { fpp: this.rig.mode !== 'chase' });
    this.handleTimeEvents();
    this.time += dt;
  }

  applyEnv(sim) {
    const w = this.weather, e = sim.env;
    e.grip = w ? 1 - 0.2 * (w.wet || 0) - 0.42 * (w.snow || 0) : 1;
    const gust = w ? 1 + (w.gust || 0) * 0.6 : 1;
    if (w && w.wind) e.wind.set(w.wind[0] * gust, 0, w.wind[1] * gust); else e.wind.set(0, 0, 0);
    const v = this.valley;
    e.surface = v && v.surfaceAt ? (this._surf || (this._surf = (x, z) => SURFACE_GRIP[v.surfaceAt(x, z)] ?? 1)) : null;
  }

  handleTimeEvents() {
    const car = this.car, sim = car.sim, A = this.audio;
    for (const e of this.tc.drain()) {
      if (e === 'arm') A.play('tc_arm', { inside: true });
      if (e === 'disarm') A.play('tc_disarm', { inside: true });
      if (e === 'charge') A.play('tc_crackle', { pos: car.curr.pos });
      if (e === 'depart') {
        const rear = sim.wheels.slice(2).filter((w) => w.contact), use = rear.length ? rear : sim.wheels.filter((w) => w.contact);
        const wheelPts = use.map((w) => ({ x: w.point.x, y: w.point.y, z: w.point.z }));
        this.timeFx.depart(car.curr.pos.clone(), car.curr.quat.clone(), sim.vel, sim.contacts >= 2, wheelPts);
        A.play('tc_boom_double', { gain: 1, inside: true });
        A.play('tc_fire_whoosh', { pos: car.curr.pos, gain: 0.9 });
        if (this.rig.mode === 'chase') {
          const v = new THREE.Vector3(sim.vel.x, 0, sim.vel.z); const f = v.lengthSq() > 1 ? v.normalize() : new THREE.Vector3(0, 0, 1).applyQuaternion(car.curr.quat).setY(0).normalize();
          const side = new THREE.Vector3(f.z, 0, -f.x);
          const base = car.curr.pos.clone();
          this.pendingHold = { pos: base.clone().addScaledVector(f, -6.5).addScaledVector(side, 2.4).add(new THREE.Vector3(0, 1.9, 0)), look: base.clone().addScaledVector(f, 9).add(new THREE.Vector3(0, 0.6, 0)) };
        }
      }
      if (e === 'vanish') {
        this.saved = { lin: sim.body.linvel(), ang: sim.body.angvel() };
        sim.body.setEnabled(false);
        car.view.root.visible = false;
      }
      if (e === 'arrive') {
        this.applyClock(true);
        sim.body.setEnabled(true);
        if (this.saved) { sim.body.setLinvel(this.saved.lin, true); sim.body.setAngvel(this.saved.ang, true); }
        car.view.root.visible = true;
        this.rig.hold = null; this.rig.initialized = false; this.gfx.cut();
        this.timeFx.arrive();
        A.play('tc_arrive_zap', { pos: car.curr.pos, gain: 1 });
        A.setRadio(this.settings.radio, this.eraId());
        if (this.valley) this.arriveValley();
        this.hint(`${eraOf(this.tc.present.year).label} · ${formatYear(this.tc.present.year)}`, 3);
      }
    }
  }

  chaseState(fdt) {
    const c = this.car, s = c.sim;
    const st = this._st || (this._st = { vel: new THREE.Vector3(), accel: new THREE.Vector3(), accelLocal: new THREE.Vector3() });
    st.pos = c.pose.pos; st.quat = c.pose.quat;
    st.vel.set(s.vel.x, s.vel.y, s.vel.z); st.speed = s.speed; st.fwdSpeed = s.fwdSpeed;
    st.grounded = s.contacts >= 2; st.airborne = s.contacts === 0; st.reverse = s.gear === 'R';
    st.accel.set(s.lastAccel.x, s.lastAccel.y, s.lastAccel.z).clampLength(0, 45);
    st.accelLocal.copy(st.accel).applyQuaternion(c.pose.quat.clone().invert());
    st.boost = (s.thrusters.rear.reduce((a, n) => a + n.valve, 0) / 4) * (s.flight.mode === 'ground' ? 1 : 0.3);
    st.thrust = s.thrusters.totalForce.len() / 40000;
    const cp = this.gfx.camera.position;
    const gy = fdt ? this.groundHeight(cp.x, cp.z, cp.y + 2) : 0;
    st.groundY = gy === null ? -50 : gy;
    return st;
  }

  screenFocus() {
    const sc = this.cockpit.screen; if (!sc) return null;
    const f = this._focus || (this._focus = { p: new THREE.Vector3(), k: 0, on: false, e: new THREE.Vector3(), d: new THREE.Vector3(), g: new THREE.Vector3() });
    sc.getWorldPosition(f.p);
    this.car.view.eyeWorld(f.e);
    f.d.subVectors(f.p, f.e).normalize();
    const ang = Math.acos(Math.min(1, Math.max(-1, this.rig.gazeDir(f.g).dot(f.d))));
    f.on = !this.paused && ang < (f.on ? 0.46 : 0.3);
    f.k = f.on ? 1 : 0;
    return f;
  }

  nozzleWorld(n) {
    const v = this._nw || (this._nw = new THREE.Vector3());
    return v.set(n.pos.x, n.pos.y, n.pos.z).applyQuaternion(this.car.pose.quat).add(this.car.pose.pos);
  }

  frame() {
    const now = performance.now();
    const fdt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frameCount++; this.warm++;
    this.stable = fdt < 0.034 ? (this.stable || 0) + 1 : 0;
    if (this.harness) { (this.dtLog || (this.dtLog = [])).push(Math.round(fdt * 1000) + (this.tc ? this.tc.state[0] : '') + (this.sky && this.sky.captures !== this._lc ? 'E' : '')); if (this.sky) this._lc = this.sky.captures; if (this.dtLog.length > 400) this.dtLog.shift(); }
    if (this.started && this.frameCount > 30) { this.frames.push(fdt * 1000); if (this.frames.length > 600) this.frames.shift(); if (fdt > 0.025) this.spikes++; }
    this.handleKeys();
    const tA = performance.now();
    if (!this.paused && this.started) {
      this.acc += fdt;
      let n = 0;
      while (this.acc >= this.dt && n < 12) { this.step(this.dt); this.acc -= this.dt; n++; }
      if (n === 12) this.acc = 0;
    }
    const tB = performance.now();
    const alpha = this.acc / this.dt;
    const night = this.sky.state.night;
    for (const c of this.cars) {
      c.pose.pos.lerpVectors(c.prev.pos, c.curr.pos, alpha);
      c.pose.quat.slerpQuaternions(c.prev.quat, c.curr.quat, alpha);
      c.view.sync(fdt, c.sim, c.pose, c.sim.wreck ? 0 : night);
    }
    if (this.walker.active) this.walker.interpolate(alpha);
    this.online.update(fdt);
    const [mx, my] = this.input.consumeMouse();
    this.rig.mouse(mx, my, now / 1000);
    const s = this.car.sim;
    const st = this.chaseState(fdt);
    this.menu.update(fdt);
    if (this.pendingHold) { this.rig.hold = this.pendingHold; this.pendingHold = null; this.gfx.cut(); }
    if (this.walker.active) this.rig.updateFoot(fdt, this.walker.pose, (o, d, l) => this.camRay(o, d, l));
    else if (this.rig.mode === 'chase') this.rig.updateChase(fdt, st, now / 1000, (o, d, l) => this.camRay(o, d, l));
    else { this.car.view.root.updateMatrixWorld(true); this.rig.updateFpp(fdt, this.car.view.eyeWorld(new THREE.Vector3()), this.car.pose.quat, st, this.screenFocus()); }
    const chase = this.rig.mode !== 'fpp';
    if (this.cabinGlass !== !chase) { CarView.setCabinView(this.mats, !chase); this.cabinGlass = !chase; }
    const nightK = THREE.MathUtils.smoothstep(this.sky.state.night, 0.05, 0.6), on = this.car.view.root.visible ? 1 : 0;
    this.lamps.L.intensity = this.lamps.R.intensity = 260 * nightK * on;
    this.lamps.cabin.intensity = 0.35 * nightK * on;
    this.placeLamps();
    const hit = chase ? (this.cockpit.hit = null) : this.cockpit.gaze(this.gfx.camera);
    const clicks = this.input.consumeClicks();
    if (!chase && clicks && !this.paused && this.cockpit.tap() && this.driver.ready) this.driver.touch(hit.point);
    if (this.driver.ready && this.walker.active) {
      this.driver.setHeadVisible(true);
      const v = this.valley;
      this.driver.walkPose(this.walker, fdt, { camYaw: this.rig.footYaw, ground: v ? (x, z) => v.heightAt(x, z) : null });
    } else if (this.driver.ready && !this.noDriverPose) {
      this.driver.look.yaw = chase ? THREE.MathUtils.clamp(s.steerAngle * 0.6, -0.4, 0.4) : this.rig.fppYaw;
      this.driver.look.pitch = chase ? 0 : this.rig.fppPitch;
      this.driver.setHeadVisible(chase);
      this.poseSkip = chase ? (this.poseSkip || 0) + 1 : 0;
      if (!chase || this.poseSkip % 3 === 0) this.driver.pose(this.car.view, chase ? fdt * 3 : fdt, { accelZ: st.accelLocal.z, accelX: st.accelLocal.x });
    }
    this.cockpit.update(fdt, !chase);
    $('gaze').classList.toggle('on', !chase && !this.paused);
    $('gaze').classList.toggle('hot', !!(hit && this.cockpit.hover));
    this.gfx.u.blur.value = THREE.MathUtils.smoothstep(s.speed / MPH, 40, 220) * 0.5 * (chase ? 1 : 0.5);
    this.expK = (this.expK || 1) + ((chase ? 1 : 1.55) - (this.expK || 1)) * Math.min(1, fdt * 1.5);
    this.gfx.u.exposure.value = this.sky.exposure * this.expK;
    if (this.sky.fpp !== !chase) { this.sky.fpp = !chase; this.sky.applyShadowPreset(this.gfx.preset); }
    this.gfx.updateSun(this.sky.sunDir, this.sky.sun.color, (1 - this.sky.state.night) * Math.min(1, this.sky.sun.intensity / 6) * (this.tc.state === 'gone' ? 0 : 1));
    this.sky.update(fdt, s.pos, false, this.viewDir || (this.viewDir = new THREE.Vector3()).set(0, 0, -1).applyQuaternion(this.gfx.camera.quaternion).setY(0).normalize());
    if (this.plate) this.plate.syncProps(this.phys);
    if (this.valley) this.valley.update(fdt, this.gfx.camera.position, this.gfx.camera);
    if (this.eras && !this.erasBroken) { try { this.eras.update(fdt, this.gfx.camera.position); } catch (e) { this.erasBroken = true; console.error('eras.update failed', e); } }
    if (this.life && !this.lifeBroken) { try { this.life.update(fdt, this.gfx.camera.position); } catch (e) { this.lifeBroken = true; console.error('life.update failed', e); } }
    this.fx.setLight(this.sky.sun.color, this.sky.sun.intensity, night);
    if (!this.paused) {
      if (this.car.view.root.visible && !params.has('noplume')) this.fx.thrusters(fdt, s, this.car.pose.quat, this.car.pose.pos, this.gfx.camera.position);
      for (const c of this.cars) this.fx.tyres(fdt, c.sim, c.pose.quat, c.pose.pos);
      this.damage.update(fdt);
      this.car.view.root.updateMatrixWorld(true);
      this.timeFx.update(fdt, this.tc, this.car.view.root.matrixWorld, this.car.pose.pos, this.gfx, this.tu.time_travel, this.car.view.root.visible);
      this.fx.update(fdt);
      this.applyClock(false);
      const fl = this.timeFx.flashLevel || 0;
      if (fl !== this.lastFlash) { $('flash').style.opacity = fl.toFixed(3); this.lastFlash = fl; }
    }
    this.hud.update(fdt, { view: this.rig.mode, hidden: this.paused || !this.started || this.walker.active, mph: s.speed / MPH, thrusters: s.thrusters, tc: { armed: this.tc.armed, trigger: this.tu.time_travel.trigger_mph, yearLabel: this.yearLabel(this.tc.destination.year) }, input: this.input.down.size > 0 });
    this.audio.listener(this.gfx.camera);
    this.audio.update(fdt, { sim: s, powertrain: this.tu.powertrain, fpp: !chase, gone: this.tc.state === 'gone', nozzleWorld: (n) => this.nozzleWorld(n), carPos: this.car.pose.pos, scrape: this.damage.scrape, tc: this.tc, weather: this.weather, ambient: this.eras && this.eras.ambient });
    if (this.started) this.gfx.updateDynRes(fdt);
    const tr = performance.now();
    this.gfx.render();
    const tE = performance.now(), pk = 0.05, P = this.prof;
    P.sim += (tB - tA - P.sim) * pk; P.mid += (tr - tB - P.mid) * pk; P.render += (tE - tr - P.render) * pk;
    this.input.endFrame();
  }

  setPaused(p) {
    this.paused = p;
    if (p) { if (document.pointerLockElement) document.exitPointerLock(); if (this.menu.mode !== 'title') this.menu.showPause(); }
    else this.menu.hide();
  }

  resumeFromMenu() {
    this.paused = false;
    this.input.requestLock();
    this.hint('Esc for the menu', 2.5);
  }

  setAssist(on) { this.settings.assist = on; store.set('assist', on); this.car.sim.flight.assist = on; }
  setPaint(k) { this.settings.paint = k; store.set('paint', k); this.mats.setPaint(k); }
  setRoof(on) { this.settings.roof = on; store.set('roof', on); this.car.view.setRoof(on); }
  setWing(on) { this.settings.wing = on; store.set('wing', on); this.car.view.setWing(on); this.car.sim.wing = on; }
  setOutfit(i) { store.set('outfit', i); if (this.driver.ready) this.driver.setOutfit(i).then(() => { this.cockpit.dirty = true; }); }
  setRadio(on) { this.settings.radio = on; store.set('radio', on); this.audio.setRadio(on, this.eraId()); }

  exposeDebug() {
    const g = this;
    window.__r88 = {
      game: g, THREE,
      keys(...codes) { g.input.virtual = new Set(codes); },
      release() { g.input.virtual = null; },
      tap(code) { g.input.pressed.add(code); },
      gpu() { const a = g.gfx.renderer.backend.adapter; return a && a.info ? { vendor: a.info.vendor, arch: a.info.architecture } : null; },
      state() { const s = g.car.sim; return { yaw: s.yaw() * 57.3, beta: Math.atan2(s.latSpeed, Math.abs(s.fwdSpeed) + 0.01) * 57.3, wy: s.angW.y * 57.3, cam: g.rig.heading * 57.3, mph: s.speed / MPH, pos: [s.pos.x, s.pos.y, s.pos.z], mode: s.flight.mode, gear: s.gear, contacts: s.contacts, tc: g.tc.state, fps: 1000 / (g.frames.slice(-60).reduce((a, b) => a + b, 0) / Math.max(1, g.frames.slice(-60).length)), scale: g.gfx.scale, backend: g.gfx.backend, gpu: g.gfx.gpuMs, calls: g.gfx.renderer.info.render.drawCalls, prof: g.prof, broken: g.car.lattice ? g.car.lattice.brokenCount : 0 }; },
      teleport(x, y, z, yaw = 0, v = 0) { g.car.sim.teleport([x, y, z], yaw, v); g.capture(g.car); g.capture(g.car); g.rig.initialized = false; g.gfx.cut(); },
      stats() { const f = g.frames.slice().sort((a, b) => a - b); const p = (q) => f[Math.min(f.length - 1, Math.floor(f.length * q))]; return { n: f.length, avg: f.reduce((a, b) => a + b, 0) / Math.max(1, f.length), p50: p(0.5), p95: p(0.95), p99: p(0.99), max: f[f.length - 1], spikes: g.spikes, scale: g.gfx.scale }; },
      resetStats() { g.frames.length = 0; g.spikes = 0; },
      setTime(h, m = 0, mo = 10, d = 15) { Object.assign(g.tc.present, { hour: h, minute: m, month: mo, day: d }); g.applyClock(true); },
      camera(mode) { g.rig.mode = mode; g.rig.fppYaw = 0; g.rig.fppPitch = 0; g.gfx.cut(); },
      look(yaw, pitch) { g.rig.fppYaw = yaw; g.rig.fppPitch = pitch; },
      orbit(yaw, pitch) { g.rig.orbitYaw = yaw; g.rig.orbitPitch = pitch; g.rig.lastMouse = performance.now() / 1000 + 1e6; },
      arm(era) { if (era !== undefined) g.tc.setDestination(ERAS[era].date); if (!g.tc.armed) g.toggleArm(); },
      respawn() { g.respawn(); },
      tg(x, z, yaw = 0, v = 0, up = 0.15) { const y = g.valley ? g.valley.heightAt(x, z) + up : up; this.teleport(x, y, z, yaw, v); return y; },
      valley() { const v = g.valley; if (!v) return null; const s = v.view.stats; return { chunks: s.chunks, tris: s.tris, built: s.built, cache: v.view.cache.size, era: v.era, surface: v.surfaceAt(g.car.sim.pos.x, g.car.sim.pos.z), region: (v.regionAt(g.car.sim.pos.x, g.car.sim.pos.z) || {}).id || null, h: v.heightAt(g.car.sim.pos.x, g.car.sim.pos.z), eras: !!g.eras }; },
      era(id) { if (g.eras) g.eras.apply(id, { instant: true }); else if (g.valley) g.valley.setEraTerrain(id); if (g.life) g.life.setEra(id); },
      click() { g.input.clicks++; },
    };
  }
}

const game = new Game();
game.boot().catch((e) => { console.error(e); $('ldText').textContent = 'Failed to start: ' + (e && e.message ? e.message : e); });
