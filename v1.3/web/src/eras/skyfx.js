// Roadster 88 era sky extras: the close Hadean moon, volcano ash plumes and meteors, distant Cretaceous sauropod silhouettes, and the far-future orbital ring with a space elevator and station.
import * as THREE from 'three/webgpu';
import { vec3, vec2, float, uv, uniform, positionLocal, positionWorld, mx_noise_float, mx_fractal_noise_float, smoothstep, mix, abs, fract, sin, time, instancedBufferAttribute, texture, step, max, pow, normalWorld, dot, clamp } from 'three/tsl';
import { fxMaterial } from '../render/gfx.js';

const D2R = Math.PI / 180;
const dirAzEl = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

function moonMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  m.fog = false;
  const p = positionLocal.normalize();
  const maria = smoothstep(0.1, 0.45, mx_fractal_noise_float(p.mul(1.6), 3, 2.0, 0.5));
  const cr = mx_noise_float(p.mul(14.0)).abs();
  const craters = smoothstep(0.0, 0.08, cr).mul(0.25).add(0.75);
  const lava = smoothstep(0.55, 0.75, mx_noise_float(p.mul(3.0).add(7.0)).mul(0.5).add(0.5));
  m.colorNode = mix(vec3(0.42, 0.4, 0.38), vec3(0.16, 0.15, 0.15), maria).mul(craters);
  m.emissiveNode = vec3(1.0, 0.25, 0.04).mul(lava.mul(0.35)).add(vec3(0.03, 0.025, 0.02));
  return m;
}

function ringMaterial(U) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  m.fog = false;
  const u = uv();
  const across = abs(u.y.sub(0.5)).mul(2);
  const fine = mx_noise_float(vec3(u.y.mul(60.0), 0.5, 0.0)).mul(0.5).add(0.5);
  const gap = float(1).sub(smoothstep(0.0, 0.035, abs(u.y.sub(0.36))));
  const bands = smoothstep(0.25, 0.75, fine).mul(0.7).add(0.3).mul(float(1).sub(gap.mul(0.85)));
  const seg = smoothstep(0.0, 0.03, abs(fract(u.x.mul(720.0)).sub(0.5))).mul(0.18).add(0.82);
  const lights = step(0.992, fract(u.x.mul(5200.0))).mul(step(abs(u.y.sub(0.62)), 0.03)).mul(2.5);
  const edge = float(1).sub(smoothstep(0.6, 1.0, across));
  const shadow = smoothstep(0.4, 0.47, abs(u.x.sub(0.5)));
  const lit = mix(float(1), shadow.mul(0.85).add(0.15), U.night);
  m.colorNode = vec3(0.78, 0.8, 0.86).mul(bands.mul(seg).mul(edge).mul(lit).mul(U.ringGain).mul(mix(float(0.22), float(0.12), U.night))).add(vec3(1.0, 0.85, 0.6).mul(lights.mul(U.night).mul(0.4)));
  m.opacityNode = edge;
  return fxMaterial(m);
}

function silhouetteGeometry(kind) {
  const parts = [];
  const add = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); parts.push(g); };
  if (kind === 'sauropod') {
    add(new THREE.SphereGeometry(1, 14, 10).scale(2.4, 2.0, 5.2), 0, 5.0, 0);
    add(new THREE.CylinderGeometry(0.45, 1.1, 9.5, 10).translate(0, 4.75, 0), 0, 6.2, 3.6, 0.62);
    add(new THREE.SphereGeometry(0.62, 10, 8).scale(1, 0.8, 1.6), 0, 13.6, 8.8);
    add(new THREE.CylinderGeometry(0.9, 0.08, 13, 8).translate(0, -6.5, 0), 0, 5.2, -4.0, 1.35);
    for (const [x, z] of [[1.5, 2.6], [-1.5, 2.2], [1.6, -2.4], [-1.4, -2.8]]) add(new THREE.CylinderGeometry(0.55, 0.62, 5.0, 8), x, 2.5, z);
  }
  const out = new THREE.BufferGeometry();
  const merged = parts.map((g) => g.toNonIndexed());
  let n = 0; for (const g of merged) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0; for (const g of merged) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

class Plumes {
  constructor(parent, cap = 96) {
    this.cap = cap; this.list = [];
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.iPos.setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.iCol.setUsage(THREE.DynamicDrawUsage);
    const m = fxMaterial(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false }));
    const P = instancedBufferAttribute(this.iPos), C = instancedBufferAttribute(this.iCol);
    m.positionNode = P.xyz; m.scaleNode = vec2(P.w, P.w);
    const q = uv().sub(0.5).mul(2);
    const r = q.length();
    const n = mx_fractal_noise_float(vec3(q.mul(2.2), C.w.mul(13.0).add(time.mul(0.05))), 3, 2.0, 0.5).mul(0.5).add(0.5);
    const a = float(1).sub(smoothstep(0.35, 1.0, r.add(n.sub(0.5).mul(0.6)))).mul(n.mul(0.6).add(0.4));
    const glow = float(1).sub(smoothstep(0.0, 1.0, uv().y)).mul(C.y);
    m.colorNode = vec3(0.09, 0.075, 0.07).mul(C.x).add(vec3(1.0, 0.3, 0.05).mul(glow.mul(0.8)));
    m.opacityNode = a.mul(C.z);
    m.fog = true;
    this.sprite = new THREE.Sprite(m); this.sprite.count = 0; this.sprite.frustumCulled = false; this.sprite.renderOrder = 5;
    parent.add(this.sprite);
    this.sources = [];
  }
  setSources(src) { this.sources = src; this.list.length = 0; for (const s of src) for (let i = 0; i < 14; i++) this.spawn(s, Math.random()); }
  spawn(s, age = 0) { if (this.list.length < this.cap) this.list.push({ s, age, life: 60 + Math.random() * 40, ox: (Math.random() - 0.5) * 30, oz: (Math.random() - 0.5) * 30, seed: Math.random(), drift: new THREE.Vector2(14 + Math.random() * 10, 4 + Math.random() * 6) }); }
  update(dt, light) {
    const P = this.iPos.array, C = this.iCol.array;
    let i = 0;
    for (const p of this.list) {
      p.age += dt / p.life;
      if (p.age >= 1) { p.age -= 1; p.seed = Math.random(); }
      const t = p.age, s = p.s;
      const o = i * 4;
      P[o] = s.x + p.ox + p.drift.x * t * p.life * 0.4; P[o + 1] = s.y + 10 + t * (520 + s.r * 0.8); P[o + 2] = s.z + p.oz + p.drift.y * t * p.life * 0.4; P[o + 3] = 50 + t * 380;
      C[o] = light; C[o + 1] = Math.max(0, 1 - t * 4); C[o + 2] = Math.min(1, t * 6) * (1 - t) * 0.9; C[o + 3] = p.seed;
      i++;
    }
    this.sprite.count = i;
    this.iPos.needsUpdate = true; this.iCol.needsUpdate = true;
  }
}

export class SkyExtras {
  constructor(sys) {
    this.sys = sys;
    this.group = new THREE.Group(); this.group.name = 'EraSky';
    sys.root.add(this.group);
    this.U = { night: uniform(0), ringGain: uniform(1) };
    this.items = {};
    this.meteors = [];
  }

  build(eraId, ctx) {
    for (const k in this.items) this.items[k].visible = false;
    if (this.plumes) this.plumes.sprite.visible = false;
    const key = eraId;
    if (eraId === 'hadean') {
      if (!this.items.moon) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), moonMaterial());
        m.frustumCulled = false; m.renderOrder = -1; m.userData.k = 'moon';
        this.group.add(m); this.items.moon = m;
      }
      this.plumes = this.plumes || new Plumes(this.group);
      this.plumes.sprite.visible = true;
      this.plumes.setSources(ctx.volcanoes || []);
      this.items.moon.visible = true;
    }
    if (eraId === 'dino') {
      if (!this.items.sauropods) {
        const g = silhouetteGeometry('sauropod');
        const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
        mat.colorNode = vec3(0.09, 0.085, 0.07).mul(mx_noise_float(positionLocal.mul(0.8)).mul(0.15).add(0.9));
        const im = new THREE.InstancedMesh(g, mat, 6); im.castShadow = false; im.receiveShadow = false; im.userData.k = 'sauropods';
        this.group.add(im); this.items.sauropods = im;
      }
      const im = this.items.sauropods, M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      const spots = ctx.herd || [];
      im.count = spots.length;
      spots.forEach((h, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.yaw); s.setScalar(h.scale); M.compose(new THREE.Vector3(h.x, h.y, h.z), q, s); im.setMatrixAt(i, M); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
      im.visible = spots.length > 0 && !this.sys.handed.has('herd');
    }
    if (eraId === 'scifi') {
      if (!this.items.ring) {
        const R = 8850, tilt = 30 * D2R;
        const axis = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0.25).normalize();
        const a = new THREE.Vector3(0, 0, 1).cross(axis).normalize(), b = axis.clone().cross(a).normalize();
        const W = 0.95 * D2R * R;
        const pos = [], uvs = [], idx = [];
        const segs = 360;
        for (let i = 0; i <= segs; i++) {
          const t = (i / segs) * Math.PI * 2, d = a.clone().multiplyScalar(Math.cos(t)).addScaledVector(b, Math.sin(t));
          const c = d.clone().multiplyScalar(R);
          const w = axis.clone().multiplyScalar(W / 2);
          pos.push(c.x - w.x, c.y - w.y, c.z - w.z, c.x + w.x, c.y + w.y, c.z + w.z);
          uvs.push(i / segs, 0, i / segs, 1);
          if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
        const ring = new THREE.Mesh(g, ringMaterial(this.U)); ring.frustumCulled = false; ring.renderOrder = -1; ring.userData.k = 'ring';
        ring.userData.follow = true;
        this.group.add(ring); this.items.ring = ring;
        const tm = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.6 });
        tm.fog = false;
        const hgt = positionLocal.y;
        const climb = step(0.993, fract(hgt.div(380).sub(time.mul(0.05))));
        tm.colorNode = vec3(0.6, 0.62, 0.66);
        tm.emissiveNode = vec3(0.6, 0.85, 1.0).mul(float(0.25).add(climb.mul(30)));
        const tether = new THREE.Mesh(new THREE.CylinderGeometry(4, 9, 8200, 8, 1, true).translate(0, 4100, 0), tm);
        tether.position.set(-5200, 0, 4200); tether.frustumCulled = false; tether.userData.k = 'tether'; tether.userData.follow = true;
        this.group.add(tether); this.items.tether = tether;
        const st = new THREE.Group();
        const sm = new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0.7 }); sm.fog = false;
        sm.colorNode = vec3(0.7, 0.72, 0.76);
        sm.emissiveNode = vec3(0.5, 0.75, 1.0).mul(step(0.92, fract(positionLocal.y.mul(0.05).add(positionLocal.x.mul(0.01)))).mul(4));
        st.add(new THREE.Mesh(new THREE.TorusGeometry(160, 22, 10, 48), sm));
        st.add(new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 260, 16).rotateX(Math.PI / 2), sm));
        st.position.copy(dirAzEl(150 * D2R, 38 * D2R).multiplyScalar(7200)); st.lookAt(0, 0, 0); st.rotateX(0.5);
        st.userData.k = 'station'; st.userData.follow = true; st.traverse((o) => { o.frustumCulled = false; });
        this.group.add(st); this.items.station = st;
      }
      for (const k of ['ring', 'tether', 'station']) this.items[k].visible = true;
    }
    if (eraId === 'hadean') this.meteorRate = 0.5; else if (eraId === 'scifi') this.meteorRate = 0.04; else this.meteorRate = 0.02;
    this.eraId = key;
  }

  update(dt, camPos, sky) {
    this.U.night.value = sky.state.night;
    const moon = this.items.moon;
    if (moon && moon.visible) {
      const d = dirAzEl(0.42, 0.23);
      moon.position.copy(camPos).addScaledVector(d, 6400);
      moon.scale.setScalar(6400 * Math.tan(3.4 * D2R));
      moon.rotation.y = 0.6;
    }
    for (const k of ['ring', 'tether', 'station']) { const o = this.items[k]; if (o && o.visible && o.userData.follow) { if (!o.userData.base) o.userData.base = o.position.clone(); o.position.set(camPos.x + o.userData.base.x, o.userData.base.y, camPos.z + o.userData.base.z); } }
    if (this.plumes && this.plumes.sprite.visible) this.plumes.update(dt, 0.4 + 1.6 * Math.min(1, sky.sun.intensity / 6));
  }
}
