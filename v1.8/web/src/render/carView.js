// Roadster 88 car view: loads assets/car/roadster.glb when present (else the procedural placeholder), maps contract nodes and materials, samples the model's animation clips (gullwing doors, flap, nozzle mounts, wing, targa) and drives wheels, steering, suspension, nozzle gimbals, lights and glass from the sim.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildPlaceholderCar, buildShadowProxy } from './carModel.js';
import { WHEEL_NAMES } from '../sim/car.js';

const REPLACE = new Set(['Paint', 'Paint_Black', 'Glass_Tint', 'Glass_Clear', 'LED_Head', 'LED_Tail', 'Screen', 'Cluster', 'Lens', 'Lens_Tail']);
const NOZZLE_RE = /^Nozzle_(RL1|RL2|RR1|RR2|FL|FR|SL1|SL2|SR1|SR2)$/;
const SHADOW_RE = /^(Body_Shell|Hood|Bumper_F|Bumper_R|Door_L|Door_R|Glass_|Roof_Targa)/;

function isDeformable(o, root) {
  for (let p = o; p; p = p.parent) { if (p.userData && p.userData.deform) return true; if (p === root) break; }
  return false;
}

function shareGeometry(g) {
  const n = new THREE.BufferGeometry();
  for (const k in g.attributes) n.setAttribute(k, k === 'normal' ? g.attributes[k].clone() : g.attributes[k]);
  n.setIndex(g.index);
  for (const gr of g.groups) n.addGroup(gr.start, gr.count, gr.materialIndex);
  n.boundingSphere = g.boundingSphere; n.boundingBox = g.boundingBox;
  n.userData = g.userData;
  n.userData.template = g;
  return n;
}

let realCarPromise = null;
export function loadRealCar(lod) {
  if (realCarPromise) return realCarPromise;
  realCarPromise = (async () => {
    const list = lod ? ['../assets/car/roadster_lod1.glb', '../assets/car/roadster.glb'] : ['../assets/car/roadster.glb', '../assets/car/roadster_raw.glb'];
    for (const f of list) {
      try {
        const h = await fetch(f, { method: 'HEAD' });
        if (!h.ok) continue;
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/draco/gltf/');
        loader.setDRACOLoader(draco);
        const gltf = await loader.loadAsync(f);
        const root = gltf.scene.getObjectByName('Roadster') || gltf.scene;
        root.userData.source = f;
        root.animations = gltf.animations || [];
        ensureUVs(root);
        optimizeTemplate(root);
        root.userData.shadowGeom = shadowFromTemplate(root);
        return root;
      } catch (e) { console.warn('car glb failed', f, e); }
    }
    return null;
  })();
  return realCarPromise;
}

function ensureUVs(root) {
  root.traverse((o) => {
    if (!o.isMesh || o.geometry.attributes.uv) return;
    if (![].concat(o.material).some((m) => m && (m.map || m.normalMap || m.roughnessMap))) return;
    const g = o.geometry, p = g.attributes.position;
    g.computeBoundingBox();
    const s = g.boundingBox.getSize(new THREE.Vector3()), ax = [[0, s.x], [1, s.y], [2, s.z]].sort((a, b) => b[1] - a[1]), A = ax[0][0], B = ax[1][0], uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getComponent(i, A) * 6; uv[i * 2 + 1] = p.getComponent(i, B) * 6; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
}

const STATIC_ROOT = /^(Badge_|Diffuser|Housing_Nozzle|Sill_|Splitter)/;

function mergeByMaterial(meshes, parent, prefix, inv) {
  const groups = new Map();
  for (const m of meshes) { const k = m.material.uuid; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
  for (const list of groups.values()) {
    const geos = [];
    for (const m of list) {
      const g = m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      geos.push(g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]));
    }
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.name = prefix + '_' + (list[0].material.name || 'mat');
    mesh.userData.deform = true;
    mesh.castShadow = !/Interior/.test(prefix); mesh.receiveShadow = true;
    parent.add(mesh);
    for (const m of list) m.parent.remove(m);
  }
}

function optimizeTemplate(root) {
  root.updateMatrixWorld(true);
  const interior = root.getObjectByName('Interior');
  if (interior) {
    const inv = new THREE.Matrix4().copy(interior.matrixWorld).invert();
    const meshes = []; interior.traverse((o) => { if (o.isMesh) meshes.push(o); });
    mergeByMaterial(meshes, interior, 'Interior', inv);
  }
  const statics = root.children.filter((o) => o.isMesh && STATIC_ROOT.test(o.name) && !(o.userData && (o.userData.detach || o.userData.deform)));
  mergeByMaterial(statics, root, 'Static', new THREE.Matrix4().copy(root.matrixWorld).invert());
  root.traverse((o) => { if (o.isMesh && /^(Screen|Cluster|Badge)/.test(o.name)) o.castShadow = false; });
}

function shadowFromTemplate(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const pts = [];
  const v = new THREE.Vector3(), m = new THREE.Matrix4();
  for (const top of root.children) {
    if (!SHADOW_RE.test(top.name)) continue;
    top.traverse((o) => {
      if (!o.isMesh || /DoorCard|DoorArm/.test(o.name)) return;
      m.multiplyMatrices(inv, o.matrixWorld);
      const p = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(p.count / 30000));
      for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(m); if (v.y > 0.16) pts.push(v.x, v.y, v.z); }
    });
  }
  if (pts.length < 300) return null;
  let z0 = Infinity, z1 = -Infinity;
  for (let i = 2; i < pts.length; i += 3) { z0 = Math.min(z0, pts[i]); z1 = Math.max(z1, pts[i]); }
  const NZ = 46, NX = 16, base = 0.17;
  const wid = new Float32Array(NZ).fill(0);
  const zi = (z) => Math.min(NZ - 1, Math.max(0, Math.floor((z - z0) / (z1 - z0) * NZ)));
  for (let i = 0; i < pts.length; i += 3) { const k = zi(pts[i + 2]); wid[k] = Math.max(wid[k], Math.abs(pts[i])); }
  const top = new Float32Array(NZ * NX).fill(-1);
  for (let i = 0; i < pts.length; i += 3) {
    const k = zi(pts[i + 2]), w = wid[k] || 1;
    const j = Math.min(NX - 1, Math.max(0, Math.floor((pts[i] / w * 0.5 + 0.5) * NX)));
    top[k * NX + j] = Math.max(top[k * NX + j], pts[i + 1]);
  }
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NX; j++) {
    if (top[k * NX + j] >= 0) continue;
    let best = -1;
    for (let d = 1; d < NX && best < 0; d++) for (const jj of [j - d, j + d]) if (jj >= 0 && jj < NX && top[k * NX + jj] >= 0) best = Math.max(best, top[k * NX + jj]);
    top[k * NX + j] = best >= 0 ? best : base + 0.2;
  }
  const pos = [], idx = [];
  const zc = (k) => z0 + (k + 0.5) / NZ * (z1 - z0);
  const xc = (k, j) => (j / (NX - 1) * 2 - 1) * wid[k] * 0.98;
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NX; j++) pos.push(xc(k, j), top[k * NX + j], zc(k));
  const B = pos.length / 3;
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NX; j++) pos.push(xc(k, j), base, zc(k));
  const quad = (a, b, c, d) => idx.push(a, c, b, b, c, d);
  for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < NX - 1; j++) quad(k * NX + j, k * NX + j + 1, (k + 1) * NX + j, (k + 1) * NX + j + 1);
  for (let k = 0; k < NZ - 1; k++) for (const j of [0, NX - 1]) quad(k * NX + j, (k + 1) * NX + j, B + k * NX + j, B + (k + 1) * NX + j);
  for (const k of [0, NZ - 1]) for (let j = 0; j < NX - 1; j++) quad(k * NX + j, k * NX + j + 1, B + k * NX + j, B + k * NX + j + 1);
  for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < NX - 1; j++) quad(B + k * NX + j, B + (k + 1) * NX + j, B + k * NX + j + 1, B + (k + 1) * NX + j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class CarView {
  constructor(tuning, mats, template) {
    this.tu = tuning; this.mats = mats;
    if (template) {
      this.root = template.clone(true);
      this.root.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        if (isDeformable(o, this.root)) o.geometry = shareGeometry(o.geometry);
        const ms = [].concat(o.material).map((m) => {
          const mine = mats.get(m.name);
          if (!mine) return m;
          if (REPLACE.has(m.name) || !(m.map || m.normalMap)) { if (m.side === THREE.DoubleSide) mine.side = THREE.DoubleSide; return mine; }
          return m;
        });
        o.material = Array.isArray(o.material) ? ms : ms[0];
        const nzName = NOZZLE_RE.test(o.name) ? o.name : (o.parent && NOZZLE_RE.test(o.parent.name)) ? o.parent.name : null;
        if (nzName && [].concat(o.material).some((m) => m.name === 'Nozzle_Metal')) o.material = mats.nozzleMaterial(nzName).mat;
      });
      this.placeholder = false;
      this.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      const proxyMat = new THREE.MeshBasicNodeMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
      const proxy = new THREE.Mesh(template.userData.shadowGeom ? template.userData.shadowGeom.clone() : buildShadowProxy(tuning), proxyMat);
      proxy.name = 'ShadowProxy_Body'; proxy.castShadow = true; proxy.receiveShadow = false; proxy.layers.set(1); proxy.userData.deform = true;
      this.root.add(proxy);
      const W = tuning.wheels;
      for (const id of ['FL', 'FR', 'RL', 'RR']) {
        const wheel = this.root.getObjectByName('Wheel_' + id); if (!wheel) continue;
        const front = id[0] === 'F', r = front ? W.radius_front : W.radius_rear, w = front ? W.width_front : W.width_rear;
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2), proxyMat);
        cyl.name = 'ShadowProxy_' + id; cyl.castShadow = true; cyl.layers.set(1);
        wheel.add(cyl);
      }
    } else {
      this.root = buildPlaceholderCar(tuning, mats);
      this.placeholder = true;
    }
    this.root.name = 'Roadster';
    this.n = {};
    this.root.traverse((o) => { if (o.name && !this.n[o.name]) this.n[o.name] = o; });
    this.rest = new Map();
    this.root.traverse((o) => this.rest.set(o, { p: o.position.clone(), q: o.quaternion.clone() }));
    this.wheelNodes = WHEEL_NAMES.map((nm, i) => {
      const id = nm.slice(6), front = i < 2;
      const wheel = this.n[nm], brake = this.n['Brake_' + id], steer = this.n['Steer_' + id];
      const mover = front ? (steer || wheel) : wheel;
      return { wheel, brake, steer, mover, rest: mover ? mover.position.clone() : null, brakeRest: brake && !front ? brake.position.clone() : null, wheelRestQ: wheel ? wheel.quaternion.clone() : null };
    });
    this.root.updateMatrixWorld(true);
    const rootInv = new THREE.Quaternion().copy(this.root.getWorldQuaternion(new THREE.Quaternion())).invert();
    this.nozzleRig = {};
    for (const nm of Object.keys(this.n)) {
      if (!NOZZLE_RE.test(nm)) continue;
      const nz = this.n[nm];
      const group = /_S[LR]/.test(nm) ? 'side' : /_F[LR]/.test(nm) ? 'front' : 'rear';
      const ex = nz.getObjectByName('Exhaust_' + nm) || nz.getObjectByName('Exhaust');
      const exL = group === 'side' ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, group === 'front' ? 1 : -1);
      if (ex && ex.position.lengthSq() > 1e-8) exL.copy(ex.position).normalize();
      const r = this.rest.get(nz);
      const parentQ = rootInv.clone().multiply(nz.parent.getWorldQuaternion(new THREE.Quaternion()));
      this.nozzleRig[nm] = { node: nz, restQ: r.q.clone(), restAxis: exL.clone().applyQuaternion(r.q), parentInv: parentQ.clone().invert() };
    }
    this.clips = {};
    for (const clip of (template && template.animations) || []) {
      const tracks = [];
      for (const tr of clip.tracks) {
        const dot = tr.name.lastIndexOf('.');
        const node = this.n[tr.name.slice(0, dot)], prop = tr.name.slice(dot + 1);
        if (!node || (prop !== 'quaternion' && prop !== 'position') || tr.times.length <= 1) continue;
        tracks.push({ node, prop, interp: tr.createInterpolant() });
      }
      this.clips[clip.name] = { duration: clip.duration || 1, tracks, last: -1 };
    }
    this.doorT = 0; this.doorTarget = 0;
    this.wing = this.n.Wing; this.roof = this.n.Roof_Targa;
    this.wingT = 0; this.wingTarget = 0; this.roofT = 0; this.roofTarget = 0;
    this.headBase = 3.5;
    this.lostParts = new Set();
    this._q = new THREE.Quaternion(); this._a = new THREE.Vector3();
  }

  hasClip(name) { return !!(this.clips[name] && this.clips[name].tracks.length); }

  setClip(name, t) {
    const c = this.clips[name];
    if (!c || Math.abs(c.last - t) < 1e-4) return;
    c.last = t;
    const time = Math.min(1, Math.max(0, t)) * c.duration;
    for (const tr of c.tracks) {
      if (this.lostParts.has(tr.node.name)) continue;
      const v = tr.interp.evaluate(time);
      if (tr.prop === 'quaternion') tr.node.quaternion.set(v[0], v[1], v[2], v[3]);
      else tr.node.position.set(v[0], v[1], v[2]);
    }
  }

  setWing(on) {
    if (!this.wing || this.lostParts.has('Wing')) return;
    if (this.hasClip('wing_deploy')) { this.wingTarget = on ? 1 : 0; if (on) this.wing.visible = true; } else this.wing.visible = on;
  }

  setRoof(on) {
    if (!this.roof || this.lostParts.has('Roof_Targa')) return;
    if (this.hasClip('targa_remove')) this.roofTarget = on ? 0 : 1; else this.roof.visible = on;
  }

  toggleDoors() { this.doorTarget = this.doorTarget > 0.5 ? 0 : 1; return this.doorTarget; }

  static setCabinView(mats, fpp) {
    const g = mats.get('Glass_Tint');
    if (g) g.opacity = fpp ? 0.35 : 0.86;
  }

  sync(dt, sim, pose, night) {
    this.root.position.copy(pose.pos);
    this.root.quaternion.copy(pose.quat);
    const S = this.tu.suspension;
    sim.wheels.forEach((w, i) => {
      const N = this.wheelNodes[i];
      if (!N.mover || w.lost) return;
      const drop = (S.rest_length - w.staticCompression) - w.length;
      N.mover.position.set(N.rest.x + w.hub.x, N.rest.y + drop + w.hub.y, N.rest.z + w.hub.z);
      if (N.brakeRest) N.brake.position.set(N.brakeRest.x + w.hub.x, N.brakeRest.y + drop + w.hub.y, N.brakeRest.z + w.hub.z);
      if (N.steer) N.steer.rotation.y = w.steer;
      else if (i < 2 && N.wheel) N.wheel.rotation.y = w.steer;
      if (N.wheel) { N.wheel.rotation.order = 'YXZ'; N.wheel.rotation.x = w.spin % (Math.PI * 2); if (!N.steer && i < 2) N.wheel.rotation.y = w.steer; else if (i >= 2) N.wheel.rotation.y = w.toe; N.wheel.rotation.z = w.camber * (w.left ? 1 : -1); }
    });
    const sw = this.n.SteeringWheel;
    if (sw) { const r = this.rest.get(sw); sw.quaternion.copy(r.q).multiply(this._q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sim.steerAngle * 4.6)); }
    const th = sim.thrusters;
    for (const nz of th.all) {
      const rig = this.nozzleRig[nz.name];
      if (!rig || !nz.attached || this.lostParts.has(nz.name)) continue;
      const t = this._a.set(-nz.dir.x, -nz.dir.y, -nz.dir.z).applyQuaternion(rig.parentInv);
      rig.node.quaternion.copy(this._q.setFromUnitVectors(rig.restAxis, t)).multiply(rig.restQ);
      const rec = this.mats.nozzleMats.get(nz.name); if (rec) rec.frost.value = nz.frost;
    }
    if (this.hasClip('front_nozzles_deploy')) this.setClip('front_nozzles_deploy', th.extend);
    else { const mount = this.n.NozzleMount_F; if (mount) { const r = this.rest.get(mount); mount.position.set(r.p.x, r.p.y, r.p.z + this.tu.thrusters.front.deploy_travel_m * th.extend); } }
    if (this.hasClip('side_nozzles_deploy')) this.setClip('side_nozzles_deploy', th.sideDeploy);
    const flap = this.n.Flap_F;
    if (flap && !this.lostParts.has('Flap_F')) {
      if (this.hasClip('flap_open')) this.setClip('flap_open', th.flap);
      else { const r = this.rest.get(flap); flap.quaternion.copy(r.q).multiply(this._q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -th.flap * 1.45)); }
    }
    const doorDur = this.hasClip('door_L_open') ? this.clips.door_L_open.duration : 0.9;
    this.doorT += Math.sign(this.doorTarget - this.doorT) * Math.min(Math.abs(this.doorTarget - this.doorT), dt / doorDur);
    if (this.hasClip('door_L_open')) { this.setClip('door_L_open', this.doorT); this.setClip('door_R_open', this.doorT); }
    else {
      const e = this.doorT * this.doorT * (3 - 2 * this.doorT);
      for (const [nm, s] of [['Door_L', -1], ['Door_R', 1]]) {
        const d = this.n[nm]; if (!d || this.lostParts.has(nm)) continue;
        const r = this.rest.get(d); d.quaternion.copy(r.q).multiply(this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s * e * 1.12));
      }
    }
    if (this.hasClip('wing_deploy') && !this.lostParts.has('Wing')) {
      this.wingT += Math.sign(this.wingTarget - this.wingT) * Math.min(Math.abs(this.wingTarget - this.wingT), dt / this.clips.wing_deploy.duration);
      this.setClip('wing_deploy', this.wingT);
      this.wing.visible = this.wingT > 0.001 || this.wingTarget > 0;
    }
    if (this.roof && this.hasClip('targa_remove') && !this.lostParts.has('Roof_Targa')) {
      this.roofT += Math.sign(this.roofTarget - this.roofT) * Math.min(Math.abs(this.roofTarget - this.roofT), dt / this.clips.targa_remove.duration);
      this.setClip('targa_remove', this.roofT);
      this.roof.visible = this.roofT < 0.999;
    }
    const u = this.mats.u;
    u.head.value = (night > 0.3 ? 14 : 5.5);
    u.tail.value = night > 0.3 ? 3.2 : 2.0;
    u.brake.value += ((sim.brakeOn && sim.speed > 0.3 ? 1 : 0) - u.brake.value) * Math.min(1, dt * 18);
  }

  eyeWorld(out) {
    const e = this.n.Eye_Driver;
    if (!e) return out.set(0.38, 0.98, -0.3).applyMatrix4(this.root.matrixWorld);
    return e.getWorldPosition(out);
  }
}
