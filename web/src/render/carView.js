// Roadster 88 car view: loads assets/car/roadster.glb when present (else the procedural placeholder), maps contract nodes and materials, and drives wheels, steering, suspension, nozzle gimbals, flap, doors, lights, wing and roof from the sim.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildPlaceholderCar, buildShadowProxy } from './carModel.js';
import { WHEEL_NAMES } from '../sim/car.js';

const REPLACE = new Set(['Paint', 'Paint_Black', 'Glass_Tint', 'Glass_Clear', 'LED_Head', 'LED_Tail', 'Screen', 'Cluster', 'Lens', 'Lens_Tail']);

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
export function loadRealCar() {
  if (realCarPromise) return realCarPromise;
  realCarPromise = (async () => {
    for (const f of ['../assets/car/roadster.glb', '../assets/car/roadster_raw.glb']) {
      try {
        const h = await fetch(f, { method: 'HEAD' });
        if (!h.ok) continue;
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/draco/gltf/');
        loader.setDRACOLoader(draco);
        const gltf = await loader.loadAsync(f);
        const root = gltf.scene.getObjectByName('Roadster') || gltf.scene;
        root.userData.source = f;
        optimizeTemplate(root);
        return root;
      } catch (e) { console.warn('car glb failed', f, e); }
    }
    return null;
  })();
  return realCarPromise;
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
        const nzName = /^Nozzle_(RL1|RL2|RR1|RR2|FL|FR)$/.test(o.name) ? o.name : /^Nozzle_/.test(o.parent && o.parent.name) ? o.parent.name : null;
        if (nzName && [].concat(o.material).some((m) => m.name === 'Nozzle_Metal')) o.material = mats.nozzleMaterial(nzName).mat;
      });
      this.placeholder = false;
      this.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      const proxyMat = new THREE.MeshBasicNodeMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
      const proxy = new THREE.Mesh(buildShadowProxy(tuning), proxyMat);
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
    this.nozzleSign = {};
    for (const nm of ['Nozzle_RL1', 'Nozzle_RL2', 'Nozzle_RR2', 'Nozzle_RR1', 'Nozzle_FL', 'Nozzle_FR']) {
      const nz = this.n[nm]; if (!nz) continue;
      const front = nm.includes('_F');
      const ex = nz.getObjectByName('Exhaust_' + nm) || nz.getObjectByName('Exhaust');
      const restAxis = new THREE.Vector3(0, 0, front ? 1 : -1);
      if (ex && ex.position.lengthSq() > 1e-8) restAxis.copy(ex.position).normalize();
      const test = restAxis.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      this.nozzleSign[nm] = { sign: test.y < 0 ? 1 : -1, axis: restAxis };
    }
    this.doorT = 0; this.doorTarget = 0;
    this.wing = this.n.Wing; this.roof = this.n.Roof_Targa;
    this.headBase = 3.5;
    this.lostParts = new Set();
  }

  setWing(on) { if (this.wing && !this.lostParts.has('Wing')) this.wing.visible = on; }
  setRoof(on) { if (this.roof && !this.lostParts.has('Roof_Targa')) this.roof.visible = on; }
  toggleDoors() { this.doorTarget = this.doorTarget > 0.5 ? 0 : 1; return this.doorTarget; }

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
    if (sw) { const r = this.rest.get(sw); sw.quaternion.copy(r.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sim.steerAngle * 4.6)); }
    const th = sim.thrusters;
    for (const nz of th.all) {
      const node = this.n[nz.name]; if (!node || !nz.attached) continue;
      const r = this.rest.get(node), sg = this.nozzleSign[nz.name];
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(nz.pitch * sg.sign, nz.front ? -nz.side : nz.side, 0, 'XYZ'));
      node.quaternion.copy(r.q).multiply(q);
      const rec = this.mats.nozzleMats.get(nz.name); if (rec) rec.frost.value = nz.frost;
    }
    const mount = this.n.NozzleMount_F;
    if (mount) { const r = this.rest.get(mount); mount.position.set(r.p.x, r.p.y, r.p.z + this.tu.thrusters.front.deploy_travel_m * th.extend); }
    const flap = this.n.Flap_F;
    if (flap && !this.lostParts.has('Flap_F')) { const r = this.rest.get(flap); flap.quaternion.copy(r.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -th.flap * 1.45)); }
    this.doorT += Math.sign(this.doorTarget - this.doorT) * Math.min(Math.abs(this.doorTarget - this.doorT), dt / 0.9);
    const e = this.doorT * this.doorT * (3 - 2 * this.doorT);
    for (const [nm, s] of [['Door_L', -1], ['Door_R', 1]]) {
      const d = this.n[nm]; if (!d || this.lostParts.has(nm)) continue;
      const r = this.rest.get(d); d.quaternion.copy(r.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s * e * 1.12));
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
