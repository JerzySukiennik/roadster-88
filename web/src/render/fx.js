// Roadster 88 particle effects: pooled GPU sprites (alpha and additive) for cold-gas plumes, valve puffs, ground dust rings, tyre smoke, sparks, frost vapour and fire, plus tyre skid marks on the plate.
import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, uv, float, vec2, vec3, uniform, attribute, texture } from 'three/tsl';
import { softParticles } from 'three/addons/tsl/utils/SoftParticles.js';
import { fxMaterial } from './gfx.js';

const rnd = (a, b) => a + Math.random() * (b - a);

function spriteAtlas() {
  const S = 64, W = S * 4, data = new Uint8Array(W * S * 4);
  const hash = (x, y, s) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
  const noise = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  for (let k = 0; k < 4; k++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const qx = (x + 0.5) / S * 2 - 1, qy = (y + 0.5) / S * 2 - 1, r = Math.hypot(qx, qy);
    let n = 0, amp = 0.5, f = 3; for (let o = 0; o < 4; o++) { n += noise(qx * f + 10, qy * f + 10, k * 9 + o) * amp; amp *= 0.5; f *= 2; }
    const edge = Math.max(0, 1 - Math.max(0, (r + (n - 0.5) * 0.5 - 0.1) / 0.85));
    const a = k === 3 ? Math.pow(Math.max(0, 1 - r), 2.2) : Math.pow(edge, 1.4) * (0.55 + 0.6 * n);
    const i = (y * W + k * S + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(Math.min(1, a) * 255);
  }
  const t = new THREE.DataTexture(data, W, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
let ATLAS = null;

class Pool {
  constructor(scene, cap, additive, light) {
    this.cap = cap; this.n = 0; this.additive = additive;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.age = new Float32Array(cap); this.life = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap);
    this.c = new Float32Array(cap * 3); this.a0 = new Float32Array(cap);
    this.drag = new Float32Array(cap); this.buoy = new Float32Array(cap); this.rot = new Float32Array(cap); this.spin = new Float32Array(cap); this.seed = new Float32Array(cap);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.iPos.setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.iCol.setUsage(THREE.DynamicDrawUsage);
    this.iMisc = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.iMisc.setUsage(THREE.DynamicDrawUsage);
    const m = fxMaterial(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    const P = instancedBufferAttribute(this.iPos), C = instancedBufferAttribute(this.iCol), M = instancedBufferAttribute(this.iMisc);
    m.positionNode = P.xyz;
    m.scaleNode = vec2(P.w, P.w);
    m.rotationNode = M.x;
    ATLAS = ATLAS || spriteAtlas();
    const cell = additive ? float(3) : M.z.mul(2.999).floor();
    const shape = texture(ATLAS, vec2(uv().x.add(cell).mul(0.25), uv().y)).a;
    m.colorNode = additive ? C.xyz : C.xyz.mul(light);
    m.opacityNode = additive ? shape.mul(C.w) : softParticles({ opacity: shape.mul(C.w), distance: float(0.5), contrast: float(1.5) });
    const sp = new THREE.Sprite(m);
    sp.count = 0; sp.frustumCulled = false; sp.renderOrder = additive ? 11 : 10;
    scene.add(sp);
    this.sprite = sp;
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 1, buoy = 0) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b; this.a0[i] = a;
    this.drag[i] = drag; this.buoy[i] = buoy; this.rot[i] = Math.random() * 6.28; this.spin[i] = rnd(-1.5, 1.5); this.seed[i] = Math.random();
  }

  update(dt) {
    let i = 0;
    const P = this.iPos.array, C = this.iCol.array, M = this.iMisc.array;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const k = Math.exp(-this.drag[i] * dt);
      const j = i * 3;
      this.v[j] *= k; this.v[j + 1] = this.v[j + 1] * k + this.buoy[i] * dt; this.v[j + 2] *= k;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.02 && this.buoy[i] <= 0) { this.p[j + 1] = 0.02; this.v[j + 1] *= -0.2; }
      this.rot[i] += this.spin[i] * dt;
      const t = this.age[i] / this.life[i];
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - t) * (1 - t));
      const fade = Math.min(1, t * 8) * (1 - t) * (this.additive ? 1 - t : 1);
      const o = i * 4;
      P[o] = this.p[j]; P[o + 1] = this.p[j + 1]; P[o + 2] = this.p[j + 2]; P[o + 3] = size;
      C[o] = this.c[j]; C[o + 1] = this.c[j + 1]; C[o + 2] = this.c[j + 2]; C[o + 3] = this.a0[i] * fade;
      M[o] = this.rot[i]; M[o + 1] = t; M[o + 2] = this.seed[i];
      i++;
    }
    this.sprite.count = this.n;
    this.iPos.needsUpdate = true; this.iCol.needsUpdate = true; this.iMisc.needsUpdate = true;
    this.iPos.addUpdateRange(0, this.n * 4); this.iCol.addUpdateRange(0, this.n * 4); this.iMisc.addUpdateRange(0, this.n * 4);
  }

  kill(i) {
    const l = --this.n;
    if (i === l) return;
    for (const [arr, w] of [[this.p, 3], [this.v, 3], [this.c, 3]]) for (let k = 0; k < w; k++) arr[i * w + k] = arr[l * w + k];
    for (const arr of [this.age, this.life, this.s0, this.s1, this.a0, this.drag, this.buoy, this.rot, this.spin, this.seed]) arr[i] = arr[l];
  }

  clear() { this.n = 0; this.sprite.count = 0; }
}

class SkidMarks {
  constructor(scene, cap = 2400) {
    this.cap = cap; this.head = 0; this.count = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 4 * 3); this.alpha = new Float32Array(cap * 4);
    const idx = new Uint32Array(cap * 6);
    for (let i = 0; i < cap; i++) { const o = i * 4; idx.set([o, o + 2, o + 1, o + 1, o + 2, o + 3], i * 6); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('skid', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = fxMaterial(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.colorNode = vec3(0.02, 0.02, 0.022);
    m.opacityNode = attribute('skid', 'float').mul(0.55);
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.last = new Map();
  }

  add(key, x, y, z, nx, nz, w, a) {
    const L = this.last.get(key);
    if (L && Math.hypot(x - L.x, z - L.z) < 0.25) return;
    if (L && Math.hypot(x - L.x, z - L.z) < 3 && a > 0.02) {
      const i = this.head; this.head = (this.head + 1) % this.cap; this.count = Math.min(this.cap, this.count + 1);
      const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz) || 1, px = -dz / d * w / 2, pz = dx / d * w / 2;
      const o = i * 12;
      this.pos.set([L.x + L.px, L.y + 0.015, L.z + L.pz, L.x - L.px, L.y + 0.015, L.z - L.pz, x + px, y + 0.015, z + pz, x - px, y + 0.015, z - pz], o);
      this.alpha.set([L.a, L.a, a, a], i * 4);
      this.last.set(key, { x, y, z, px, pz, a });
      const g = this.mesh.geometry;
      g.attributes.position.needsUpdate = true; g.attributes.skid.needsUpdate = true;
      return;
    }
    this.last.set(key, { x, y, z, px: -nz * w / 2, pz: nx * w / 2, a });
  }

  cut(key) { this.last.delete(key); }
}

export class FX {
  constructor(scene, preset) {
    this.light = uniform(new THREE.Color(1, 1, 1));
    this.q = preset.particles || 1;
    this.alpha = new Pool(scene, Math.round(2600 * this.q), false, this.light);
    this.add = new Pool(scene, Math.round(1400 * this.q), true, this.light);
    this.skids = new SkidMarks(scene);
    this.acc = new Map();
    this._o = new THREE.Vector3(); this._d = new THREE.Vector3(); this._v = new THREE.Vector3();
  }

  setLight(sunColor, sunI, night) {
    const k = 0.35 + Math.min(1, sunI / 11) * 2.4;
    this.light.value.setRGB(0.62 + sunColor.r * 0.38, 0.64 + sunColor.g * 0.36, 0.7 + sunColor.b * 0.3).multiplyScalar(k * (1 - night * 0.88));
  }

  rate(key, perSec, dt) {
    const a = (this.acc.get(key) || 0) + perSec * dt * this.q;
    const n = Math.floor(a); this.acc.set(key, a - n);
    return n;
  }

  thrusters(dt, sim, carQuat, carPos) {
    const th = sim.thrusters;
    const vel = sim.vel;
    for (const n of th.all) {
      if (!n.attached) continue;
      const o = this._o.set(n.pos.x, n.pos.y, n.pos.z);
      const d = this._d.set(-n.dir.x, -n.dir.y, -n.dir.z);
      const ext = n.front ? 0.12 : 0.17;
      o.addScaledVector(d, ext).applyQuaternion(carQuat).add(carPos);
      d.applyQuaternion(carQuat);
      const v = n.valve;
      const big = n.front ? 1.25 : 1;
      if (n.puff === 1 || n.puff === -1) {
        for (let k = 0; k < 7; k++) this.alpha.spawn(o.x, o.y, o.z, vel.x + d.x * rnd(6, 14) + rnd(-2, 2), vel.y + d.y * rnd(6, 14) + rnd(-2, 2), vel.z + d.z * rnd(6, 14) + rnd(-2, 2), rnd(0.25, 0.5), 0.1, rnd(0.6, 1.0), 1, 1, 1, 0.55, 5, 0.3);
      }
      if (v > 0.02) {
        const boost = !n.front && v > 0.85 && n.pitch < 0.3 ? 1 : 0;
        const cnt = this.rate(n.name, 55 + 95 * v, dt);
        for (let k = 0; k < cnt; k++) {
          const sp = rnd(18, 34) * (0.45 + 0.55 * v);
          const t = Math.random() * dt;
          const s1 = (rnd(0.55, 0.95) + boost * rnd(0.25, 0.45)) * big * (0.45 + 0.6 * v);
          this.alpha.spawn(o.x + vel.x * t, o.y + vel.y * t, o.z + vel.z * t, vel.x + d.x * sp + rnd(-1.2, 1.2), vel.y + d.y * sp + rnd(-1.2, 1.2), vel.z + d.z * sp + rnd(-1.2, 1.2), rnd(0.14, 0.24) * (0.7 + 0.5 * v) * (1 + boost * 0.4), 0.06 * big, s1, 1, 1, 1, (0.42 + boost * 0.1) * (0.45 + 0.55 * v), 6, 0.5);
        }
        if (n.groundDist < 4.5 && d.y < -0.35) {
          const gx = o.x + d.x * n.groundDist, gy = o.y + d.y * n.groundDist, gz = o.z + d.z * n.groundDist;
          const k2 = this.rate(n.name + 'd', 70 * v * (1 - n.groundDist / 4.5), dt);
          for (let k = 0; k < k2; k++) {
            const a = Math.random() * Math.PI * 2, s = rnd(7, 16) * v;
            this.alpha.spawn(gx, gy + 0.15, gz, Math.cos(a) * s + vel.x * 0.5, rnd(0.3, 1.5), Math.sin(a) * s + vel.z * 0.5, rnd(0.9, 1.7), 0.4, rnd(1.6, 3.2), 0.62, 0.6, 0.56, 0.2, 1.6, 0.25);
          }
        }
      }
    }
  }

  tyres(dt, sim, carQuat, carPos) {
    for (const w of sim.wheels) {
      const key = sim.id + w.name;
      if (!w.contact || w.lost) { this.skids.cut(key); continue; }
      const slip = Math.max(0, w.slipVel - 2.5);
      const p = w.point;
      if (slip > 0.5) {
        const cnt = this.rate(key, Math.min(60, slip * 5), dt);
        for (let k = 0; k < cnt; k++) this.alpha.spawn(p.x + rnd(-0.15, 0.15), p.y + 0.12, p.z + rnd(-0.15, 0.15), sim.vel.x * 0.15 + rnd(-1, 1), rnd(0.4, 1.4), sim.vel.z * 0.15 + rnd(-1, 1), rnd(1.0, 2.2), 0.3, rnd(1.6, 3.0), 0.9, 0.9, 0.92, Math.min(0.32, slip * 0.025), 1.4, 0.35);
        const fw = this._v.set(Math.sin(w.steer), 0, Math.cos(w.steer)).applyQuaternion(carQuat);
        this.skids.add(key, p.x, p.y, p.z, fw.x, fw.z, w.width * 0.9, Math.min(1, slip * 0.08));
      } else this.skids.cut(key);
    }
  }

  sparks(p, v, n, count) {
    for (let k = 0; k < count; k++) {
      const s = rnd(2, 9);
      this.add.spawn(p.x, p.y, p.z, v.x * 0.6 + rnd(-1, 1) * s + n.x * 2, Math.abs(v.y) * 0.2 + rnd(0.5, 3) + n.y * 2, v.z * 0.6 + rnd(-1, 1) * s + n.z * 2, rnd(0.2, 0.55), 0.035, 0.015, 6, 3.2, 1.2, 1, 1.2, -9.81);
    }
  }

  dustBurst(p, count, size = 1.5) {
    for (let k = 0; k < count; k++) { const a = Math.random() * 6.28, s = rnd(2, 7); this.alpha.spawn(p.x, p.y + 0.2, p.z, Math.cos(a) * s, rnd(0.5, 2.5), Math.sin(a) * s, rnd(0.8, 1.8), 0.4, size * rnd(1.2, 2.2), 0.6, 0.58, 0.55, 0.3, 1.8, 0.2); }
  }

  update(dt) { this.alpha.update(dt); this.add.update(dt); }
}
