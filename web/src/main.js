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
import { YearInput } from './yearInput.js';
import { Interact } from './interact.js';
import { Story } from './story/story.js';
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
    this.player = this.makePlayer();
    this.interact = new Interact(this);
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
    this.spaceHooks = true;
    await this.loadSpace();
    if (this.valley && this.life && !params.has('nostory')) { try { this.story = new Story(this); } catch (e) { this.story = null; console.error('story failed', e); } }
    this.input = new Input($('view'));
    this.hud = new Hud($('hud'));
    this.rig = new CameraRig(this.gfx.camera, this.tu);
    this.rayObj = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this.acc = 0; this.last = performance.now(); this.paused = false; this.time = 0;
    this.frames = []; this.spikes = 0; this.frameCount = 0; this.warm = 0; this.prof = { sim: 0, mid: 0, render: 0 };
    this.menu = new Menu(this);
    this.online = new Online(this);
    this.yearIn = new YearInput(this);
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

  async loadSpace() {
    if (params.has('nospace')) return;
    try {
      const mod = await import('./space/space.js');
      this.space = mod.createSpace(this);
    } catch (e) { this.space = null; if (params.has('debug') && !String(e && e.message).includes('Failed to fetch')) console.warn('space module not loaded:', e && e.message); }
  }

  async loadLife() {
    if (params.has('nolife')) return;
    try {
      const mod = await import('./life/life.js');
      this.life = new mod.LifeSystem(this, this.valley, this.eras);
      const emit = this.life.emit.bind(this.life);
      this.life.emit = (type, a) => {
        emit(type, a);
        if ((type !== 'bite' && type !== 'pounce') || !a) return;
        const w = this.walker, on = this.online, reach = 2.6 + ((a.K && a.K.meta && a.K.meta.length) || 2) * 0.35;
        if (a.target && on && a.target !== on.uid) { if (on.remotes.has(a.target)) on.request(a.target, 'kill', { c: type }); return; }
        if (w.active && !w.dead && Math.hypot(a.x - w.pos.x, a.z - w.pos.z) < reach) this.player.kill('dino', a);
      };
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
    if (this.life && this.life.seed && this.online && this.online.status === 'online') this.life.seed(this.online.roomId());
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

  spawn(pos, yaw, paint) {
    const sim = new CarSim(this.R, this.phys.world, this.tu, { position: pos, yaw, wing: this.settings.wing });
    sim.id = 'c' + (this.carSerial = (this.carSerial || 0) + 1);
    sim.flight.assist = this.settings.assist;
    const own = !paint || paint === this.settings.paint, mats = own ? this.mats : this.online.matsFor(paint);
    const view = new CarView(this.tu, mats, this.template);
    view.setWing(this.settings.wing); view.setRoof(this.settings.roof);
    this.gfx.scene.add(view.root);
    const car = { sim, view, mats, paint: own ? null : paint, prev: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, curr: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, pose: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() } };
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
    if (this.space && this.space.active) return this.space.respawnInSpace();
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

  onLanded(loc) {
    if (!loc || loc.mode !== 'earth') { this.mapId = this.mapName; return; }
    const o = loc.origin || loc, q = (v) => Math.round(v * 4);
    this.mapId = 'e' + (q(o.lat) + 360).toString(36) + (q(o.lon) + 720).toString(36);
  }

  makePlayer() {
    const g = this;
    return {
      dead: null,
      get onFoot() { return g.walker.active; },
      get pos() { return g.walker.active ? g.walker.pos : g.car.sim.pos; },
      get vel() { return g.walker.active ? g.walker.vel : g.car.sim.vel; },
      kill(cause, src) { g.killPlayer(cause, src); },
      died(cause, src) { g.onDeath(cause, src); },
    };
  }

  killPlayer(cause, src) {
    if (this.player.dead || !this.started || this.tc.busy) return;
    if (this.ride) this.exitRide(true);
    if (this.walker.active) { this.walker.die(cause, src); return; }
    const car = this.car;
    if (!car.sim.wreck) { car.sim.wreck = true; this.wrecks.push(car); }
    this.onDeath(cause, src);
  }

  onDeath(cause, src) {
    if (this.player.dead) return;
    const at = this.walker.active ? { ...this.walker.pos } : { x: this.car.sim.pos.x, y: this.car.sim.pos.y, z: this.car.sim.pos.z };
    this.player.dead = { cause, t: 0, at };
    const msg = { car: 'Hit by a car', fall: 'Fell too far', dino: 'Caught by a predator', lava: 'Burned in lava', water: 'Drowned' }[cause] || 'You died';
    $('fadeMsg').textContent = msg;
    this.audio.play(cause === 'lava' ? 'tc_crackle' : 'impact_light', { gain: 1, inside: true });
    if (this.rig) this.rig.addImpact(0.8);
    this.online.send();
  }

  deathStep(dt) {
    const d = this.player.dead; if (!d) return;
    d.t += dt;
    const o = d.t < 1.6 ? 0 : d.t < 2.4 ? (d.t - 1.6) / 0.8 : d.t < 3.0 ? 1 : Math.max(0, 1 - (d.t - 3.0) / 0.7);
    $('fade').style.opacity = o.toFixed(3);
    $('fadeMsg').style.opacity = d.t < 0.6 ? '0' : String(Math.min(1, (d.t - 0.6) / 0.5) * (d.t > 3.0 ? o : 1));
    if (d.t >= 2.8 && !d.respawned) { d.respawned = true; this.respawnPlayer(d.at); }
    if (d.t >= 3.8) { this.player.dead = null; $('fade').style.opacity = '0'; this.online.send(); }
  }

  dryGround(x, z) {
    const V = this.valley; if (!V) return { x, z, y: this.groundHeight(x, z, 50) ?? 0 };
    const ok = (px, pz) => !(V.fluidAt && V.fluidAt(px, pz)) && V.normalAt(px, pz).y > 0.88;
    for (let r = 0; r <= 260; r += r < 20 ? 4 : 12) for (let k = 0, n = r ? Math.ceil(r / 3) : 1; k < n; k++) {
      const a = k / n * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (ok(px, pz) && ok(px + 4, pz) && ok(px - 4, pz)) return { x: px, z: pz, y: V.heightAt(px, pz) };
    }
    return { x, z, y: V.heightAt(x, z) };
  }

  respawnPlayer(at) {
    const p = this.dryGround(at.x, at.z), yaw = this.rig.footYaw || 0;
    const s = this.valley ? this.valley.safeSpawnAt(p.x, p.z, p.y + 0.1) : [p.x, p.y + 0.1, p.z];
    const c = this.car, cs = c.sim;
    const keep = !cs.wreck && !c.given && cs.enabled && cs.up.y > 0.5 && Math.hypot(cs.pos.x - s[0], cs.pos.z - s[2]) < 80 && !(this.valley && this.valley.fluidAt && this.valley.fluidAt(cs.pos.x, cs.pos.z));
    let spot = s, face = yaw;
    if (keep) {
      const d = new THREE.Vector3(1.6, 0, -0.2).applyQuaternion(c.curr.quat).add(c.curr.pos);
      const gy = this.groundHeight(d.x, d.z, cs.pos.y + 2.5);
      spot = [d.x, gy === null ? cs.pos.y : gy + 0.02, d.z]; face = Math.atan2(-cs.left.x, -cs.left.z);
    } else {
      const side = [s[0] + Math.cos(yaw) * 3.0, s[1] + 0.4, s[2] - Math.sin(yaw) * 3.0];
      const g = this.groundHeight(side[0], side[2], side[1] + 6); if (g !== null) side[1] = g + 0.08;
      const old = this.car, car = this.spawn(side, yaw);
      if (old.given) this.dropCar(old);
      car.sim.flight.assist = this.settings.assist;
    }
    if (this.walker.active) this.walker.leave();
    this.walker.enter(spot[0], spot[1], spot[2], face);
    this.driver.attach(this.gfx.scene, true); this.driver.root.visible = true;
    this.rig.mode = 'foot'; this.rig.footYaw = yaw; this.rig.footPitch = 0.22; this.rig.footInit = false; this.rig.hold = null;
    this.gfx.cut();
    this.hint('F to get in', 2);
  }

  hint(text, sec = 2.5) {
    const h = $('hint'); h.textContent = text; h.classList.add('on');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => h.classList.remove('on'), sec * 1000);
  }

  audioDiag() {
    let el = document.getElementById('audioDiag');
    if (!el) { el = document.createElement('pre'); el.id = 'audioDiag'; el.style.cssText = 'position:fixed;right:16px;top:16px;margin:0;padding:10px 12px;border-radius:12px;background:rgba(10,11,14,0.78);color:#e8e8e8;font:11px/1.45 ui-monospace,Menlo,monospace;z-index:9;pointer-events:none;white-space:pre;max-width:46vw'; document.body.appendChild(el); }
    const st = this.audio.stats ? this.audio.stats() : {};
    el.textContent = `AUDIO  (F8 hide · Shift+F8 restart)\n${['state', 'rate', 'latency', 'time', 'rms', 'motor', 'voices', 'ready', 'resets', 'blind', 'radio'].map((k) => k.padEnd(8) + String(st[k])).join('\n')}\n${(st.log || []).join('\n')}`;
    el.style.display = this.showAudio ? 'block' : 'none';
  }

  handleKeys() {
    const I = this.input;
    if (I.hit('F8')) {
      if (I.down.has('ShiftLeft') || I.down.has('ShiftRight')) { this.audio.note && this.audio.note('manual restart (Shift+F8)'); if (this.audio.ctx) this.audio.rebuild(); else this.audio.unlock(); this.hint('Audio restarted', 1.4); }
      else this.showAudio = !this.showAudio;
    }
    if (this.showAudio || document.getElementById('audioDiag')) { this.diagT = (this.diagT || 0) + 1; if (this.diagT % 15 === 1) this.audioDiag(); }
    if (I.hit('Escape') && this.menu.mode !== 'title') this.setPaused(!this.paused);
    if (this.paused || this.player.dead) return;
    if (I.hit('KeyF')) { if (this.ride) this.exitRide(); else if (this.walker.active) this.enterCar(); else this.exitCar(); }
    if (this.ride) {
      if (I.hit('KeyC')) { this.rig.mode = this.rig.mode === 'chase' ? 'fpp' : 'chase'; this.rig.fppYaw = 0; this.rig.fppPitch = 0; this.gfx.cut(); }
      if (I.hit('KeyT')) this.hint('Your driver sets the year', 1.6);
      return;
    }
    if (this.walker.active) { if (I.hit('KeyR')) this.spawnNearWalker(); if (I.hit('KeyE')) this.interact.use(); return; }
    if (I.hit('KeyC')) { this.rig.mode = this.rig.mode === 'chase' ? 'fpp' : 'chase'; this.rig.fppYaw = 0; this.rig.fppPitch = 0; this.gfx.cut(); }
    if (I.hit('KeyR')) this.respawn();
    if (I.hit('KeyT')) this.toggleArm();
  }

  doorPulse(car, open) {
    car.view.doorTarget = open ? 1 : 0;
    this.audio.play(open ? 'door_open' : 'door_close', { pos: car.curr.pos });
  }

  exitCar() {
    if (this.space && this.space.active) { this.hint('No spacewalks yet · stay in the Roadster', 1.8); return; }
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
    const w = this.walker.pos, c = this.walker.nearestCar(), r = this.online.nearestRemoteCar(w, 3.2);
    const dc = c ? Math.hypot(c.sim.pos.x - w.x, c.sim.pos.z - w.z) : 1e9, dr = r ? Math.hypot(r.pos.x - w.x, r.pos.z - w.z) : 1e9;
    if (r && dr < dc) {
      if (r.foot) { this.online.request(r.uid, 'take'); this.hint(`Asking ${r.name || 'the owner'} for the keys`, 1.6); }
      else this.rideWith(r);
      return;
    }
    if (!c) { this.hint('Walk up to a Roadster to get in', 1.6); return; }
    this.boardCar(c);
  }

  boardCar(c) {
    this.doorPulse(c, true);
    this.walker.leave();
    if (c !== this.car) {
      const wi = this.wrecks.indexOf(c); if (wi >= 0) this.wrecks.splice(wi, 1);
      c.sim.wreck = false; c.sim.flight.assist = this.settings.assist;
      if (this.car.given) this.dropCar(this.car);
      this.car = c;
      this.cockpit.bind(c.view); this.timeFx.setSurface(c.view.root);
    }
    this.driver.attach(c.view.root, false);
    this.rig.mode = 'chase'; this.rig.initialized = false; this.gfx.cut();
    clearTimeout(this.doorT); this.doorT = setTimeout(() => { if (!this.walker.active) this.doorPulse(c, false); }, 1100);
    this.online.send();
  }

  dropCar(car) {
    car.sim.destroy(); this.gfx.scene.remove(car.view.root);
    const i = this.cars.indexOf(car); if (i >= 0) this.cars.splice(i, 1);
    const wi = this.wrecks.indexOf(car); if (wi >= 0) this.wrecks.splice(wi, 1);
  }

  giveCar(to) {
    const car = this.car, r = this.online.remotes.get(to);
    car.given = to; car.sim.enabled = false;
    car.sim.body.setEnabled(false);
    car.view.root.visible = false;
    this.online.send();
    this.hint(`${(r && r.name) || 'A friend'} took your Roadster · R for a new one`, 3);
  }

  takeGiven(c, from) {
    if (!this.walker.active || this.ride) return;
    const r = this.online.remotes.get(from);
    if (r) { r.hideUntil = performance.now() + 2500; r.setSolid(false); if (r.view) r.view.root.visible = false; }
    const q = new THREE.Quaternion(c[3], c[4], c[5], c[6]).normalize(), f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const keep = this.car, car = this.spawn([c[0], c[1], c[2]], Math.atan2(f.x, f.z), r && r.paint);
    car.sim.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true); car.sim.readState(); this.capture(car); this.capture(car);
    car.pose.quat.copy(car.curr.quat);
    this.car = keep;
    this.boardCar(car);
    this.hint(`${(r && r.name) || 'Your friend'}'s Roadster is yours`, 2.5);
  }

  rideWith(r) {
    this.walker.leave();
    this.ride = r.uid; this.rideLost = 0;
    this.rideLast = { pos: r.pos.clone(), quat: r.quat.clone() };
    if (r.view) this.driver.attach(r.view.root, false);
    this.audio.play('door_open', { pos: r.pos });
    this.rig.mode = 'chase'; this.rig.hold = null; this.rig.initialized = false; this.gfx.cut();
    this.online.send();
    this.hint(`Riding with ${r.name || 'a friend'} · F to get out · C to look around`, 3);
  }

  exitRide(force) {
    const r = this.online.remotes.get(this.ride), L = this.rideLast;
    if (!force && (this.tc.state === 'departing' || this.tc.state === 'gone' || (r && r.vel.length() > 4))) { this.hint('Wait for the car to stop', 1.6); return; }
    const p = new THREE.Vector3(-1.45, 0, -0.15).applyQuaternion(L.quat).add(L.pos);
    const gy = this.groundHeight(p.x, p.z, L.pos.y + 2.5), y = gy === null ? L.pos.y : gy;
    const left = new THREE.Vector3(1, 0, 0).applyQuaternion(L.quat), f = new THREE.Vector3(0, 0, 1).applyQuaternion(L.quat);
    this.ride = null;
    this.walker.enter(p.x, y + 0.02, p.z, Math.atan2(-left.x, -left.z));
    this.driver.attach(this.gfx.scene, true); this.driver.root.visible = true;
    this.rig.mode = 'foot'; this.rig.footYaw = Math.atan2(f.x, f.z) - 0.35; this.rig.footPitch = 0.22; this.rig.footInit = false; this.rig.hold = null;
    this.audio.play('door_close', { pos: L.pos });
    this.gfx.cut();
    this.online.send();
    this.hint('F to get in · Shift to run · Space to jump', 3);
  }

  followJump(year) {
    const tc = this.tc;
    if (tc.busy || !this.ride) return;
    tc.setDestination({ ...tc.destination, year });
    tc.departed = { ...tc.present };
    tc.state = 'departing'; tc.t = 0; tc.charge = 1; tc.events.push('depart');
  }

  rideState(fdt, r) {
    const st = this._rs || (this._rs = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), accel: new THREE.Vector3(), accelLocal: new THREE.Vector3(), raw: new THREE.Vector3(), iq: new THREE.Quaternion() });
    const L = this.rideLast;
    st.pos.copy(L.pos); st.quat.copy(L.quat);
    if (r) {
      if (fdt > 0) st.raw.subVectors(r.vel, st.vel).multiplyScalar(1 / fdt).clampLength(0, 45);
      st.accel.lerp(st.raw, Math.min(1, fdt * 4));
      st.vel.copy(r.vel);
    } else st.accel.multiplyScalar(0.9);
    st.accelLocal.copy(st.accel).applyQuaternion(st.iq.copy(st.quat).invert());
    const f = this._rf || (this._rf = new THREE.Vector3());
    f.set(0, 0, 1).applyQuaternion(st.quat);
    st.speed = st.vel.length(); st.fwdSpeed = st.vel.dot(f);
    const gy = this.groundHeight(st.pos.x, st.pos.z, st.pos.y + 0.6);
    st.grounded = gy !== null && st.pos.y - gy < 0.9; st.airborne = !st.grounded; st.reverse = st.fwdSpeed < -0.5;
    const th = r && r.ghost && r.ghost.thrusters;
    st.boost = th ? (th.rear.reduce((a, n) => a + n.valve, 0) / 4) * (st.grounded ? 1 : 0.3) : 0;
    st.thrust = th ? th.all.reduce((a, n) => a + n.valve * n.thrustMax, 0) / 40000 : 0;
    const cp = this.gfx.camera.position, cg = fdt ? this.groundHeight(cp.x, cp.z, cp.y + 2) : 0;
    st.groundY = cg === null ? -50 : cg;
    const au = this._ras || (this._ras = { motorRpm: 0, motorForce: 0, regenForce: 0, speed: 0, enabled: true, contacts: 4, wheels: [], thrusters: null });
    au.speed = st.speed; au.motorRpm = Math.abs(st.fwdSpeed) * this.tu.powertrain.motor_rpm_per_mps;
    au.motorForce = Math.min(this.tu.powertrain.max_wheel_force, Math.abs(st.accelLocal.z) * this.tu.car.mass); au.contacts = st.grounded ? 4 : 0;
    au.thrusters = th || this.car.sim.thrusters;
    st.audio = au;
    return st;
  }

  rideEye(view, out) {
    view.root.updateMatrixWorld(true);
    view.eyeWorld(out);
    const inv = this._ri || (this._ri = new THREE.Matrix4());
    out.applyMatrix4(inv.copy(view.root.matrixWorld).invert());
    out.x = -out.x;
    return out.applyMatrix4(view.root.matrixWorld);
  }

  spawnNearWalker() {
    const w = this.walker, f = { x: Math.sin(this.rig.footYaw), z: Math.cos(this.rig.footYaw) };
    const p = [w.pos.x + f.x * 6, w.pos.y + 1.2, w.pos.z + f.z * 6];
    const g = this.groundHeight(p[0], p[2], p[1] + 5); if (g !== null) p[1] = g + 0.08;
    let keep = this.car;
    const car = this.spawn(p, this.rig.footYaw + Math.PI / 2);
    if (keep.given) { this.dropCar(keep); keep = car; }
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
      c.sim.preStep(dt, c === this.car && !this.walker.active && !this.ride ? inp : this.walker.parked);
    }
    this.interact.preStep(dt);
    if (this.walker.active) this.walker.step(dt, this.input, this.rig.footYaw);
    else if (!this.ride && this.valley && this.valley.fluidAt && !this.player.dead) {
      const s = this.car.sim, l = this.valley.fluidAt(s.pos.x, s.pos.z);
      if (l && l.kind === 'lava' && s.pos.y < l.level + 0.6) this.killPlayer('lava');
    }
    this.deathStep(dt);
    this.online.preStep(dt);
    if (this.space && !this.spaceBroken) { try { this.space.preStep(dt); } catch (e) { this.spaceBroken = true; console.error('space.preStep failed', e); } }
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
      if (e === 'depart' && this.ride) {
        const L = this.rideLast, f = new THREE.Vector3(0, 0, 1).applyQuaternion(L.quat).setY(0).normalize(), side = new THREE.Vector3(f.z, 0, -f.x);
        this.timeFx.state.flash = 1;
        A.play('tc_boom_double', { gain: 1, inside: true });
        if (this.rig.mode === 'chase') this.pendingHold = { pos: L.pos.clone().addScaledVector(f, -6.5).addScaledVector(side, 2.4).add(new THREE.Vector3(0, 1.9, 0)), look: L.pos.clone().addScaledVector(f, 9).add(new THREE.Vector3(0, 0.6, 0)) };
      } else if (e === 'depart') {
        const rear = sim.wheels.slice(2).filter((w) => w.contact), use = rear.length ? rear : sim.wheels.filter((w) => w.contact);
        const wheelPts = use.map((w) => ({ x: w.point.x, y: w.point.y, z: w.point.z }));
        this.timeFx.depart(car.curr.pos.clone(), car.curr.quat.clone(), sim.vel, sim.contacts >= 2, wheelPts);
        this.online.flagDepart();
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
        sim.body.setEnabled(!car.given);
        if (this.saved) { sim.body.setLinvel(this.saved.lin, true); sim.body.setAngvel(this.saved.ang, true); }
        car.view.root.visible = !car.given;
        this.rig.hold = null; this.rig.initialized = false; this.gfx.cut();
        if (!this.ride) { this.timeFx.arrive(); this.online.flagArrive(); }
        A.play('tc_arrive_zap', { pos: car.curr.pos, gain: 1 });
        A.setRadio(this.settings.radio, this.eraId());
        if (this.valley) this.arriveValley();
        this.hint(`${eraOf(this.tc.present.year).label} · ${formatYear(this.tc.present.year)}`, 3);
      }
      if (this.story && (e === 'depart' || e === 'arrive')) this.story.onTime(e);
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
    const P = this.ride && this.rideLast ? this.rideLast : this.car.pose;
    return v.set(n.pos.x, n.pos.y, n.pos.z).applyQuaternion(P.quat).add(P.pos);
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
    if (this.space && !this.spaceBroken) { try { this.space.update(fdt); } catch (e) { this.spaceBroken = true; console.error('space.update failed', e); } }
    if (this.story && !this.storyBroken) { try { this.story.update(fdt); } catch (e) { this.storyBroken = true; console.error('story.update failed', e); } }
    let rideR = null, rs = null;
    if (this.ride) {
      rideR = this.online.remotes.get(this.ride) || null;
      const ok = !!(rideR && rideR.view && !rideR.vanished && !rideR.hidden);
      if (ok) { this.rideLast.pos.copy(rideR.pos); this.rideLast.quat.copy(rideR.quat); this.rideLost = 0; }
      else { this.rideLost += fdt; if (!this.tc.busy && (this.rideLost > 8 || (rideR && rideR.hidden))) this.exitRide(true); }
      if (!ok) rideR = null;
      if (this.ride) rs = this.rideState(fdt, rideR);
    }
    const [mx, my] = this.input.consumeMouse();
    this.rig.mouse(mx, my, now / 1000);
    const s = this.car.sim;
    const st = this.chaseState(fdt);
    this.menu.update(fdt);
    if (this.pendingHold) { this.rig.hold = this.pendingHold; this.pendingHold = null; this.gfx.cut(); }
    if (this.walker.active) this.rig.updateFoot(fdt, this.walker.pose, (o, d, l) => this.camRay(o, d, l), this.walker);
    else if (rs) {
      if (this.rig.mode === 'fpp' && rideR) this.rig.updateFpp(fdt, this.rideEye(rideR.view, this._eye || (this._eye = new THREE.Vector3())), rideR.quat, rs, null);
      else this.rig.updateChase(fdt, rs, now / 1000, (o, d, l) => this.camRay(o, d, l));
    } else if (this.rig.mode === 'chase') this.rig.updateChase(fdt, st, now / 1000, (o, d, l) => this.camRay(o, d, l));
    else { this.car.view.root.updateMatrixWorld(true); this.rig.updateFpp(fdt, this.car.view.eyeWorld(new THREE.Vector3()), this.car.pose.quat, st, this.screenFocus()); }
    if (this.debugCam) { const c = this.gfx.camera, d = this.debugCam(); c.position.copy(d.pos); c.lookAt(d.look); if (d.fov) { c.fov = d.fov; c.updateProjectionMatrix(); } }
    const chase = this.rig.mode !== 'fpp';
    const ownCab = !chase && !this.ride, cm = (rideR && rideR.mats) || this.car.mats || this.mats;
    if (this.cabinGlass !== !chase || this.cabinMats !== cm) { if (this.cabinMats && this.cabinMats !== cm) CarView.setCabinView(this.cabinMats, false); CarView.setCabinView(cm, !chase); this.cabinGlass = !chase; this.cabinMats = cm; }
    const nightK = THREE.MathUtils.smoothstep(this.sky.state.night, 0.05, 0.6), on = this.car.view.root.visible ? 1 : 0;
    this.lamps.L.intensity = this.lamps.R.intensity = 260 * nightK * on;
    this.lamps.cabin.intensity = 0.35 * nightK * on;
    this.placeLamps();
    const hit = !ownCab ? (this.cockpit.hit = null) : this.cockpit.gaze(this.gfx.camera);
    const clicks = this.input.consumeClicks();
    if (this.walker.active && clicks && !this.paused) this.interact.click();
    this.interact.update();
    this.interact.hold(fdt, this.walker.active && !this.paused && this.input.is('KeyE'));
    if (ownCab && clicks && !this.paused && this.cockpit.tap() && this.driver.ready) this.driver.touch(hit.point);
    if (this.driver.ready && this.walker.active) {
      this.driver.setHeadVisible(!this.rig.footClose);
      const v = this.valley;
      this.driver.walkPose(this.walker, fdt, { camYaw: this.rig.footYaw, ground: v ? (x, z) => v.heightAt(x, z) : null, overlay: this.interact.held && this.interact.pending === null ? 'Walk_Carry_Loop' : null });
    } else if (this.driver.ready && this.ride) {
      const d = this.driver;
      if (rideR) {
        if (d.root.parent !== rideR.view.root) d.attach(rideR.view.root, false);
        d.root.visible = true;
        d.look.yaw = chase ? 0 : this.rig.fppYaw; d.look.pitch = chase ? 0 : this.rig.fppPitch;
        d.setHeadVisible(chase);
        d.pose(rideR.view, fdt, { accelZ: rs.accelLocal.z, accelX: rs.accelLocal.x, passenger: true });
      } else d.root.visible = false;
    } else if (this.driver.ready && !this.noDriverPose) {
      this.driver.look.yaw = chase ? THREE.MathUtils.clamp(s.steerAngle * 0.6, -0.4, 0.4) : this.rig.fppYaw;
      this.driver.look.pitch = chase ? 0 : this.rig.fppPitch;
      this.driver.setHeadVisible(chase);
      this.poseSkip = chase ? (this.poseSkip || 0) + 1 : 0;
      if (!chase || this.poseSkip % 3 === 0) this.driver.pose(this.car.view, chase ? fdt * 3 : fdt, { accelZ: st.accelLocal.z, accelX: st.accelLocal.x });
    }
    this.cockpit.update(fdt, ownCab);
    $('gaze').classList.toggle('on', ownCab && !this.paused);
    $('gaze').classList.toggle('hot', !!(hit && this.cockpit.hover));
    this.gfx.u.blur.value = THREE.MathUtils.smoothstep((rs ? rs.speed : s.speed) / MPH, 40, 220) * 0.5 * (chase ? 1 : 0.5);
    this.expK = (this.expK || 1) + ((chase ? 1 : 1.55) - (this.expK || 1)) * Math.min(1, fdt * 1.5);
    this.gfx.u.exposure.value = this.sky.exposure * this.expK;
    if (this.sky.fpp !== !chase) { this.sky.fpp = !chase; this.sky.applyShadowPreset(this.gfx.preset); }
    this.gfx.updateSun(this.sky.sunDir, this.sky.sun.color, (1 - this.sky.state.night) * Math.min(1, this.sky.sun.intensity / 6) * (this.tc.state === 'gone' ? 0 : 1));
    this.sky.update(fdt, rs ? rs.pos : s.pos, false, this.viewDir || (this.viewDir = new THREE.Vector3()).set(0, 0, -1).applyQuaternion(this.gfx.camera.quaternion).setY(0).normalize());
    if (this.plate) this.plate.syncProps(this.phys);
    const inSpace = !!(this.space && this.space.active);
    if (this.valley && !inSpace) this.valley.update(fdt, this.gfx.camera.position, this.gfx.camera);
    if (this.eras && !this.erasBroken && !inSpace) { try { this.eras.update(fdt, this.gfx.camera.position); } catch (e) { this.erasBroken = true; console.error('eras.update failed', e); } }
    if (this.life && !this.lifeBroken && !inSpace) { try { this.life.update(fdt, this.gfx.camera.position); } catch (e) { this.lifeBroken = true; console.error('life.update failed', e); } }
    this.fx.setLight(this.sky.sun.color, this.sky.sun.intensity, night);
    if (!this.paused) {
      if (this.car.view.root.visible && !params.has('noplume')) this.fx.thrusters(fdt, s, this.car.pose.quat, this.car.pose.pos, this.gfx.camera.position);
      for (const c of this.cars) this.fx.tyres(fdt, c.sim, c.pose.quat, c.pose.pos);
      this.damage.update(fdt);
      const tv = this.ride ? (rideR ? rideR.view : null) : this.car.view;
      if (tv) tv.root.updateMatrixWorld(true);
      this.timeFx.update(fdt, this.tc, (tv || this.car.view).root.matrixWorld, this.ride ? this.rideLast.pos : this.car.pose.pos, this.gfx, this.tu.time_travel, !!tv && tv.root.visible);
      this.fx.update(fdt);
      this.applyClock(false);
      const fl = this.timeFx.flashLevel || 0;
      if (fl !== this.lastFlash) { $('flash').style.opacity = fl.toFixed(3); this.lastFlash = fl; }
    }
    this.hud.update(fdt, { view: this.rig.mode, hidden: this.paused || !this.started || this.walker.active || !!this.ride, mph: s.speed / MPH, thrusters: s.thrusters, tc: { armed: this.tc.armed, trigger: this.tu.time_travel.trigger_mph, yearLabel: this.yearLabel(this.tc.destination.year) }, input: this.input.down.size > 0 });
    this.audio.listener(this.gfx.camera);
    this.audio.update(fdt, { sim: rs ? rs.audio : s, powertrain: this.tu.powertrain, fpp: !chase, gone: this.tc.state === 'gone', nozzleWorld: (n) => this.nozzleWorld(n), carPos: rs ? rs.pos : this.car.pose.pos, scrape: this.damage.scrape, tc: this.tc, weather: inSpace ? null : this.weather, ambient: inSpace ? null : this.eras && this.eras.ambient, space: inSpace, reentry: inSpace && this.space.state === 'reentry' });
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
      story: { goto(id) { g.story.jump(id); }, reset() { g.story.reset(); }, state() { return JSON.stringify({ step: g.story.st.step, flags: g.story.st.flags, frunk: g.story.st.frunk, anchors: g.story.st.anchors }); } },
      item(kind = 'crate') { const w = g.walker, p = w.active ? w.pos : g.car.sim.pos, f = w.active ? { x: Math.sin(w.yaw), z: Math.cos(w.yaw) } : { x: 0, z: 3 }; return g.interact.spawnItem(kind, { x: p.x + f.x * 1.6, y: p.y + 0.6, z: p.z + f.z * 1.6 }); },
      kill(cause = 'fall') { g.player.kill(cause); },
    };
  }
}

const game = new Game();
game.boot().catch((e) => { console.error(e); $('ldText').textContent = 'Failed to start: ' + (e && e.message ? e.message : e); });
