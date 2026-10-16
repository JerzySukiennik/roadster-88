// Roadster 88 web entry: boots renderer, physics and world, runs the fixed-step sim with render interpolation, and wires cameras, input, cars and wrecks, damage, time circuits, effects, audio, HUD and the pause sheet.
import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { Gfx, PRESETS } from './render/gfx.js';
import { SkySystem } from './render/sky.js';
import { PlateView } from './render/plate.js';
import { CarMaterials, PAINTS } from './render/carMaterials.js';
import { CarView, loadRealCar } from './render/carView.js';
import { CameraRig } from './render/camera.js';
import { FX } from './render/fx.js';
import { TimeFX } from './render/fxTime.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
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
    this.layout = buildLayout();
    this.phys = new PhysicsWorld(RAPIER, this.tu, this.layout);
    progress(0.35, 'Sky');
    this.sky = new SkySystem(this.gfx, this.gfx.preset);
    if (params.has('envoff')) this.sky.envOff = true;
    if (params.has('shadowoff')) this.sky.sun.castShadow = false;
    this.gfx.onPreset = (P) => { this.sky.applyShadowPreset(P); };
    this.tc = new TimeCircuits(this.tu);
    this.tc.setDestination(ERAS[store.get('destEra', 1)].date);
    this.applyClock(true);
    progress(0.45, 'Test plate');
    this.plate = new PlateView(this.gfx, this.layout, this.sky);
    if (params.has('noshadow')) this.sky.sun.castShadow = false;
    if (params.has('nodriverpose')) this.noDriverPose = true;
    this.fx = new FX(this.gfx.scene, this.gfx.preset);
    progress(0.6, 'Roadster');
    this.mats = new CarMaterials();
    this.settings = { assist: store.get('assist', true), wing: store.get('wing', false), roof: store.get('roof', true), paint: store.get('paint', 'red'), radio: store.get('radio', false) };
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
    this.spawn(this.layout.spawn.pos, this.layout.spawn.yaw);
    this.input = new Input($('view'));
    this.hud = new Hud($('hud'));
    this.rig = new CameraRig(this.gfx.camera, this.tu);
    this.rayObj = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this.acc = 0; this.last = performance.now(); this.paused = false; this.time = 0;
    this.frames = []; this.spikes = 0; this.frameCount = 0; this.warm = 0; this.prof = { sim: 0, mid: 0, render: 0 };
    this.buildPause();
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
    if (params.has('noprewarm')) { try { await this.gfx.renderer.compileAsync(this.gfx.scene, this.gfx.camera); } catch (e) { /* ignore */ } } else await this.prewarm();
    progress(0.96, 'Shaders');
    this.gfx.renderer.setAnimationLoop(() => this.frame());
    const tw = performance.now();
    await new Promise((res) => { const chk = () => (this.stable >= 20 || performance.now() - tw > 25000 ? res() : setTimeout(chk, 50)); chk(); });
    progress(1, ''); $('loading').classList.add('done'); this.started = true;
    this.hint('Click to drive. Esc for keys and settings.', 4);
  }

  async loadLattice() {
    try { const r = await fetch('../shared/lattice.json', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); if (d.nodes && d.beams) return d; } } catch (e) { /* placeholder below */ }
    return generateLattice(this.tu);
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
    if (this.driver && this.driver.root) view.root.add(this.driver.root);
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
    for (const pool of [fx.alpha, fx.add]) { pool.spawn(p.x, p.y + 1, p.z + 4, 0, 0, 0, 0.05, 0.01, 0.01, 0, 0, 0, 0, 1, 0); pool.update(0.001); }
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
    fx.alpha.clear(); fx.add.clear();
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
    if (I.hit('Escape')) this.setPaused(!this.paused);
    if (this.paused) return;
    if (I.hit('KeyC')) { this.rig.mode = this.rig.mode === 'chase' ? 'fpp' : 'chase'; this.rig.fppYaw = 0; this.rig.fppPitch = 0; this.gfx.cut(); }
    if (I.hit('KeyR')) this.respawn();
    if (I.hit('KeyF')) { const open = this.car.view.toggleDoors(); this.audio.play(open ? 'door_open' : 'door_close', { pos: this.car.curr.pos }); }
    if (I.hit('KeyT')) this.toggleArm();
  }

  toggleArm() {
    this.tc.toggleArm();
    this.hint(this.tc.armed ? `Time circuits armed · ${formatYear(this.tc.destination.year)}` : 'Time circuits off', 1.8);
  }

  step(dt) {
    const inp = this.input.controls(dt);
    const gone = this.tc.state === 'gone';
    for (const c of this.cars) {
      if (c === this.car && gone) { c.sim.readState(); continue; }
      c.sim.preStep(dt, c === this.car ? inp : null);
    }
    this.phys.thrustOnProps(this.car.sim, dt);
    this.phys.step((a, b, f) => this.damage.onContact(a, b, f));
    for (const c of this.cars) { c.sim.postStep(dt); this.capture(c); }
    this.damage.step(dt);
    this.tc.update(dt, this.car.sim.speed / MPH, { fpp: this.rig.mode !== 'chase' });
    this.handleTimeEvents();
    this.time += dt;
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
    const [mx, my] = this.input.consumeMouse();
    this.rig.mouse(mx, my, now / 1000);
    const s = this.car.sim;
    const st = this.chaseState(fdt);
    if (this.pendingHold) { this.rig.hold = this.pendingHold; this.pendingHold = null; this.gfx.cut(); }
    if (this.rig.mode === 'chase') this.rig.updateChase(fdt, st, now / 1000, (o, d, l) => this.camRay(o, d, l));
    else { this.car.view.root.updateMatrixWorld(true); this.rig.updateFpp(fdt, this.car.view.eyeWorld(new THREE.Vector3()), this.car.pose.quat, st); }
    const chase = this.rig.mode === 'chase';
    const nightK = THREE.MathUtils.smoothstep(this.sky.state.night, 0.05, 0.6), on = this.car.view.root.visible ? 1 : 0;
    this.lamps.L.intensity = this.lamps.R.intensity = 260 * nightK * on;
    this.lamps.cabin.intensity = 0.35 * nightK * on;
    this.placeLamps();
    const hit = chase ? (this.cockpit.hit = null) : this.cockpit.gaze(this.gfx.camera);
    const clicks = this.input.consumeClicks();
    if (!chase && clicks && !this.paused && this.cockpit.tap() && this.driver.ready) this.driver.touch(hit.point);
    if (this.driver.ready && !this.noDriverPose) {
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
    this.plate.syncProps(this.phys);
    this.fx.setLight(this.sky.sun.color, this.sky.sun.intensity, night);
    if (!this.paused) {
      if (this.car.view.root.visible && !params.has('noplume')) this.fx.thrusters(fdt, s, this.car.pose.quat, this.car.pose.pos);
      for (const c of this.cars) this.fx.tyres(fdt, c.sim, c.pose.quat, c.pose.pos);
      this.damage.update(fdt);
      this.car.view.root.updateMatrixWorld(true);
      this.timeFx.update(fdt, this.tc, this.car.view.root.matrixWorld, this.car.pose.pos, this.gfx, this.tu.time_travel, this.car.view.root.visible);
      this.fx.update(fdt);
      this.applyClock(false);
      const fl = this.timeFx.flashLevel || 0;
      if (fl !== this.lastFlash) { $('flash').style.opacity = fl.toFixed(3); this.lastFlash = fl; }
    }
    this.hud.update(fdt, { view: this.rig.mode, hidden: this.paused || !this.started, mph: s.speed / MPH, thrusters: s.thrusters, tc: { armed: this.tc.armed, trigger: this.tu.time_travel.trigger_mph, yearLabel: this.yearLabel(this.tc.destination.year) }, input: this.input.down.size > 0 });
    this.audio.listener(this.gfx.camera);
    this.audio.update(fdt, { sim: s, powertrain: this.tu.powertrain, fpp: !chase, gone: this.tc.state === 'gone', nozzleWorld: (n) => this.nozzleWorld(n), carPos: this.car.pose.pos, scrape: this.damage.scrape, tc: this.tc });
    if (this.started) this.gfx.updateDynRes(fdt);
    const tr = performance.now();
    this.gfx.render();
    const tE = performance.now(), pk = 0.05, P = this.prof;
    P.sim += (tB - tA - P.sim) * pk; P.mid += (tr - tB - P.mid) * pk; P.render += (tE - tr - P.render) * pk;
    this.input.endFrame();
  }

  setPaused(p) {
    this.paused = p;
    $('pause').classList.toggle('hidden', !p);
    if (p) { if (document.pointerLockElement) document.exitPointerLock(); this.refreshPause(); }
  }

  buildPause() {
    const seg = (el, items, get, set) => {
      el.innerHTML = '';
      for (const [k, label] of items) { const b = document.createElement('button'); b.textContent = label; b.dataset.k = k; b.onclick = () => { set(k); this.refreshPause(); }; el.appendChild(b); }
      el._get = get;
    };
    seg($('quality'), Object.entries(PRESETS).map(([k, v]) => [k, v.label]), () => this.gfx.presetName, (k) => { this.gfx.setPreset(k); store.set('quality', k); });
    seg($('assistSeg'), [['on', 'On'], ['off', 'Off']], () => (this.settings.assist ? 'on' : 'off'), (k) => this.setAssist(k === 'on'));
    seg($('paintSeg'), Object.entries(PAINTS).map(([k, v]) => [k, v.label.replace(' Multi-Coat', '').replace(' Metallic', '')]), () => this.settings.paint, (k) => this.setPaint(k));
    seg($('roofSeg'), [['on', 'On'], ['off', 'Off']], () => (this.settings.roof ? 'on' : 'off'), (k) => this.setRoof(k === 'on'));
    seg($('wingSeg'), [['on', 'On'], ['off', 'Off']], () => (this.settings.wing ? 'on' : 'off'), (k) => this.setWing(k === 'on'));
    const keys = [['W', 'Drive / rear thrust'], ['S', 'Brake, reverse / retro'], ['A D', 'Steer / yaw'], ['Shift', 'Boost'], ['Shift + S', 'Retro brake'], ['Space', 'Tap hop, hold lift'], ['Ctrl', 'Descend'], ['Arrows', 'Pitch and roll'], ['Mouse', 'Look'], ['Click', 'Touch screen (cockpit)'], ['C', 'Cockpit / chase'], ['T', 'Arm time circuits'], ['R', 'New Roadster'], ['F', 'Doors'], ['Esc', 'Pause']];
    $('keys').innerHTML = keys.map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('');
    $('resume').onclick = () => { this.setPaused(false); this.input.requestLock(); };
  }

  refreshPause() {
    for (const id of ['quality', 'assistSeg', 'paintSeg', 'roofSeg', 'wingSeg']) { const el = $(id); const v = el._get(); for (const b of el.children) b.classList.toggle('on', b.dataset.k === v); }
    $('pauseSub').textContent = `${this.gfx.backend} · ${Math.round(this.gfx.scale * 100)}% res · ${this.car.view.placeholder ? 'placeholder car' : 'roadster.glb'}`;
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
      click() { g.input.clicks++; },
    };
  }
}

const game = new Game();
game.boot().catch((e) => { console.error(e); $('ldText').textContent = 'Failed to start: ' + (e && e.message ? e.message : e); });
