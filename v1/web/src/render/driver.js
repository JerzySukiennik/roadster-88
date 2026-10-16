// Roadster 88 driver: Jurek's avatar seated at Seat_Driver with garments rebound to the body skeleton by bone name (Cloth_* bones kept), body regions masked under clothes, two-bone IK legs and arms to the pedals and yoke grips, finger curl, head look and a right-hand reach to the touchscreen.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = '../assets/driver/';
const REGION = { torso: 0, neck: 1, arms: 2, forearms: 3, hands: 4, thighs: 5, shins: 6, feet: 7 };
export const OUTFITS = [
  { label: 'RTFKT hoodie', items: ['rtfkt-ar-hoodie', 'sweatpants-hm', 'crocs-green'] },
  { label: 'Biedronka tee', items: ['biedronka-tee', 'sweatpants-hm', 'crocs-green'] },
  { label: 'TNF Quest jacket', items: ['tnf-quest-jacket', 'biedronka-tee', 'sweatpants-hm', 'crocs-green'] },
  { label: 'Pigeon hoodie + cap', items: ['stapleverse-pigeon-hoodie', 'sweatpants-hm', 'crocs-green', 'cap-rtfkt-murakami'] },
  { label: 'AF1 tee + G.L.A.S.S.', items: ['rtfkt-nike-af1-tee', 'sweatpants-hm', 'crocs-green', 'gzowo-glass'] },
];
const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export class Driver {
  constructor(game) {
    this.g = game; this.outfits = OUTFITS; this.outfitIndex = 0;
    this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.items = new Map(); this.worn = []; this.ready = false;
    this.reach = 0; this.reachTarget = V(); this.look = { yaw: 0, pitch: 0 };
    this._a = V(); this._b = V(); this._c = V(); this._q = Q();
  }

  async load(mobile, outfitIndex = 0) {
    const gltf = await this.loader.loadAsync(BASE + (mobile ? 'character_nude_v2_mobile.glb' : 'character_nude_v2.glb'));
    this.root = gltf.scene; this.root.name = 'Driver';
    this.bones = new Map();
    this.root.traverse((o) => { if (o.isBone) this.bones.set(o.name, o); });
    this.headMeshes = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true;
      if (o.name === 'Body') this.body = o;
      if (/^(Head|Lashes|Eye\.|Eyebrow|Hair)/.test(o.name)) this.headMeshes.push(o);
      if (o.morphTargetInfluences) o.morphTargetInfluences.fill(0);
      for (const m of [].concat(o.material)) if (m && 'envMapIntensity' in m) m.envMapIntensity = 0.8;
    });
    const g = this.body.geometry;
    const rk = Object.keys(g.attributes).find((k) => /region/i.test(k));
    this.region = rk ? g.attributes[rk] : null;
    this.indexOrig = g.index.array.slice();
    this.root.updateMatrixWorld(true);
    this.rest = new Map();
    for (const [n, b] of this.bones) this.rest.set(n, { p: b.position.clone(), q: b.quaternion.clone() });
    const d = (a, b) => this.bones.get(a).getWorldPosition(V()).distanceTo(this.bones.get(b).getWorldPosition(V()));
    this.len = {};
    for (const s of ['Left', 'Right']) this.len[s] = { leg1: d(s + 'UpLeg', s + 'Leg'), leg2: d(s + 'Leg', s + 'Foot'), arm1: d(s + 'Arm', s + 'ForeArm'), arm2: d(s + 'ForeArm', s + 'Hand') };
    this.restWorldQ = new Map();
    for (const [n, b] of this.bones) this.restWorldQ.set(n, b.getWorldQuaternion(Q()));
    await this.setOutfit(outfitIndex);
    this.ready = true;
    return this.root;
  }

  async item(id) {
    if (this.items.has(id)) return this.items.get(id);
    const p = (async () => {
      const meta = await (await fetch(`${BASE}garments/${id}.item.json`)).json().catch(() => ({}));
      const gltf = await this.loader.loadAsync(`${BASE}garments/${id}.glb`);
      return { id, meta, gltf };
    })();
    this.items.set(id, p);
    return p;
  }

  async setOutfit(i) {
    this.outfitIndex = i;
    const ids = OUTFITS[i].items;
    const loaded = await Promise.all(ids.map((id) => this.item(id).catch(() => null)));
    for (const w of this.worn) this.unplace(w);
    this.worn = [];
    for (const it of loaded) if (it) this.worn.push(this.place(it));
    this.applyMask();
  }

  place(it) {
    const scene = it.gltf.scene;
    if (!it.placed) {
      scene.updateMatrixWorld(true);
      const extra = [], meshes = [];
      scene.traverse((o) => {
        if (o.isBone && !this.bones.has(o.name)) extra.push({ bone: o, parent: o.parent && o.parent.isBone ? o.parent.name : null });
        if (o.isMesh) meshes.push(o);
      });
      for (const m of meshes) {
        m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true;
        if (m.isSkinnedMesh) {
          const sk = m.skeleton;
          m.bind(new THREE.Skeleton(sk.bones.map((b) => this.bones.get(b.name) || b), sk.boneInverses.map((x) => x.clone())), m.bindMatrix.clone());
        }
        for (const mat of [].concat(m.material)) if (mat && 'envMapIntensity' in mat) mat.envMapIntensity = 0.7;
      }
      it.placed = { extra, meshes, mixer: null };
    }
    const rig = this.rig();
    for (const e of it.placed.extra) { const par = e.parent ? this.bones.get(e.parent) || it.placed.extra.find((x) => x.bone.name === e.parent)?.bone : rig; (par || rig).add(e.bone); }
    for (const m of it.placed.meshes) { if (m.parent) m.parent.remove(m); rig.add(m); }
    const clip = it.gltf.animations.find((a) => a.name === 'hood_state_down') || it.gltf.animations.find((a) => a.name === 'hood_down');
    if (clip) {
      const mixer = new THREE.AnimationMixer(rig);
      const act = mixer.clipAction(clip); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.play();
      mixer.update(clip.duration + 0.01);
      it.placed.mixer = mixer;
    }
    return it;
  }

  unplace(it) {
    if (!it.placed) return;
    for (const m of it.placed.meshes) if (m.parent) m.parent.remove(m);
    for (const e of it.placed.extra) if (e.bone.parent) e.bone.parent.remove(e.bone);
  }

  rig() { return this.root.getObjectByName('JurekRig') || this.root.getObjectByName('Jurek.Rig') || this.root; }

  applyMask() {
    if (!this.region) return;
    const hide = new Set();
    for (const it of this.worn) {
      let mask = it.meta.body_mask || [];
      if (typeof mask === 'string') mask = mask.split(',').map((s) => s.trim());
      for (const r of mask) { if (r === 'legs') { hide.add(REGION.thighs); hide.add(REGION.shins); } else if (REGION[r] !== undefined) hide.add(REGION[r]); }
    }
    const src = this.indexOrig, reg = this.region, out = [];
    for (let t = 0; t < src.length; t += 3) {
      const a = src[t], b = src[t + 1], c = src[t + 2];
      if (hide.has(Math.round(reg.getX(a))) && hide.has(Math.round(reg.getX(b))) && hide.has(Math.round(reg.getX(c)))) continue;
      out.push(a, b, c);
    }
    const g = this.body.geometry;
    g.setIndex(out);
  }

  setHeadVisible(v) {
    for (const m of this.headMeshes) m.visible = v;
    for (const it of this.worn) {
      const slot = it.meta.slot;
      if (slot === 'head' || slot === 'glasses') for (const m of it.placed.meshes) m.visible = v;
    }
  }

  resetPose() { for (const [n, b] of this.bones) { const r = this.rest.get(n); if (r) { b.position.copy(r.p); b.quaternion.copy(r.q); } } }

  setWorldQuat(b, qw) { const pq = b.parent.getWorldQuaternion(this._q).invert(); b.quaternion.copy(pq.multiply(qw)); b.updateWorldMatrix(true, false); }
  rotateWorld(b, axis, ang) { const cur = b.getWorldQuaternion(Q()); this.setWorldQuat(b, Q().setFromAxisAngle(axis, ang).multiply(cur)); }
  aim(b, child, want) {
    const bp = b.getWorldPosition(V()), cp = child.getWorldPosition(V());
    const cur = cp.sub(bp).normalize();
    const sw = Q().setFromUnitVectors(cur, want.clone().normalize());
    this.setWorldQuat(b, sw.multiply(b.getWorldQuaternion(Q())));
  }

  twoBone(b1, b2, b3, target, pole, L1, L2) {
    const P = b1.getWorldPosition(V());
    const dv = target.clone().sub(P); const d = dv.length();
    const dc = Math.min((L1 + L2) * 0.998, Math.max(Math.abs(L1 - L2) + 1e-3, d));
    const dir = dv.normalize();
    const a = (L1 * L1 - L2 * L2 + dc * dc) / (2 * dc), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pc = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))); if (pc.lengthSq() < 1e-8) pc.set(0, 0, 1); pc.normalize();
    const K = P.clone().addScaledVector(dir, a).addScaledVector(pc, h);
    this.aim(b1, b2, K.clone().sub(P));
    this.aim(b2, b3, P.clone().addScaledVector(dir, dc).sub(b2.getWorldPosition(V())));
  }

  curl(side, k) {
    for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) for (let i = 1; i <= 3; i++) {
      const b = this.bones.get(`${side}Hand${f}${i}`); if (!b) continue;
      const r = this.rest.get(b.name);
      b.quaternion.copy(r.q).multiply(this._q.setFromAxisAngle(X, k * (f === 'Thumb' ? 0.45 : 1.0) * (i === 1 ? 0.95 : 1.1)));
    }
  }

  pose(view, dt, opt) {
    if (!this.ready) return;
    const seat = view.n.Seat_Driver, gl = view.n.Grip_L, gr = view.n.Grip_R;
    if (!seat) return;
    const root = view.root;
    root.updateMatrixWorld(true);
    this.resetPose();
    const hips = this.bones.get('Hips');
    this.root.updateMatrixWorld(true);
    const carQ = root.getWorldQuaternion(Q());
    const seatW = seat.getWorldPosition(V());
    const recline = -0.42;
    const hq = carQ.clone().multiply(Q().setFromAxisAngle(X, recline)).multiply(this.restWorldQ.get('Hips'));
    this.setWorldQuat(hips, hq);
    hips.position.copy(hips.parent.worldToLocal(seatW.clone()));
    hips.updateWorldMatrix(true, false);
    const lean = 0.2 + (opt.accelZ || 0) * -0.004;
    for (const [n, w] of [['Spine', 0.3], ['Spine1', 0.35], ['Spine2', 0.35]]) { const b = this.bones.get(n); if (b) this.rotateWorld(b, this._a.set(1, 0, 0).applyQuaternion(carQ), lean * w); }
    const side = this._b.set(1, 0, 0).applyQuaternion(carQ);
    const roll = Math.max(-0.08, Math.min(0.08, (opt.accelX || 0) * 0.004));
    const sp = this.bones.get('Spine2'); if (sp) this.rotateWorld(sp, this._c.set(0, 0, 1).applyQuaternion(carQ), roll);
    const neck = this.bones.get('Neck'), head = this.bones.get('Head');
    const yaw = this.look.yaw, pitch = this.look.pitch;
    const up = Y.clone().applyQuaternion(carQ);
    if (neck && head) {
      this.rotateWorld(neck, up, yaw * 0.4); this.rotateWorld(head, up, yaw * 0.6);
      const hs = side.clone();
      this.rotateWorld(neck, hs, -pitch * 0.35 - 0.12); this.rotateWorld(head, hs, -pitch * 0.65);
    }
    const toW = (local) => local.clone().applyMatrix4(root.matrixWorld);
    const fwd = Z.clone().applyQuaternion(carQ);
    for (const s of ['Left', 'Right']) {
      const L = this.len[s];
      const sx = s === 'Left' ? 1 : -1;
      const sl = seat.position;
      const ankle = toW(new THREE.Vector3(sl.x + sx * 0.12 + (s === 'Right' ? -0.02 : 0.04), 0.22, sl.z + 0.86 - (s === 'Left' ? 0.06 : 0)));
      const pole = up.clone().multiplyScalar(0.8).add(fwd.clone().multiplyScalar(0.6)).add(side.clone().multiplyScalar(sx * 0.15));
      this.twoBone(this.bones.get(s + 'UpLeg'), this.bones.get(s + 'Leg'), this.bones.get(s + 'Foot'), ankle, pole, L.leg1, L.leg2);
      const foot = this.bones.get(s + 'Foot');
      if (foot) this.setWorldQuat(foot, carQ.clone().multiply(Q().setFromAxisAngle(X, -0.55)).multiply(this.restWorldQ.get(s + 'Foot')));
    }
    for (const s of ['Left', 'Right']) {
      const L = this.len[s], grip = s === 'Left' ? gl : gr;
      if (!grip) continue;
      const gp = grip.getWorldPosition(V());
      const wheelQ = grip.parent.getWorldQuaternion(Q());
      let target = gp.clone().addScaledVector(this._a.set(0, 0, -1).applyQuaternion(wheelQ), 0.05).addScaledVector(this._c.set(s === 'Left' ? 1 : -1, 0, 0).applyQuaternion(wheelQ), 0.03).addScaledVector(up, -0.03);
      if (s === 'Right' && this.reach > 0.001) target.lerp(this.reachTarget.clone().addScaledVector(fwd, -0.09), this.reach);
      const pole = up.clone().multiplyScalar(-1).add(side.clone().multiplyScalar(s === 'Left' ? 0.8 : -0.8));
      this.twoBone(this.bones.get(s + 'Arm'), this.bones.get(s + 'ForeArm'), this.bones.get(s + 'Hand'), target, pole, L.arm1, L.arm2);
      this.curl(s, s === 'Right' ? 0.75 * (1 - this.reach) + 0.15 : 0.75);
      if (s === 'Right' && this.reach > 0.3) { for (let i = 1; i <= 3; i++) { const b = this.bones.get('RightHandIndex' + i); if (b) b.quaternion.copy(this.rest.get(b.name).q); } }
    }
    this.reach = Math.max(0, this.reach - dt * 1.4);
  }

  touch(point) { this.reachTarget.copy(point); this.reach = 1; }
}
