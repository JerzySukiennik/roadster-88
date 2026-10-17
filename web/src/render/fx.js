// Roadster 88 particle effects: cold-gas vapour from the Cycles flipbooks (axis-aligned jet billboards, valve puffs, ground billows, hover ring decal), pooled GPU sprites for tyre smoke, sparks, frost vapour and fire, plus tyre skid marks on the plate.
import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, uv, float, vec2, vec3, uniform, attribute, texture } from 'three/tsl';
import { softParticles } from './soft.js';
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

function flipbook(url) {
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
  return t;
}

function atlasUV(frame) {
  const col = frame.mod(8), row = frame.div(8).floor();
  return vec2(uv().x.add(col).div(8), uv().y.add(float(7).sub(row)).div(8));
}

class Pool {
  constructor(scene, cap, additive, light, opts = {}) {
    this.cap = cap; this.n = 0; this.additive = additive; this.flip = !!opts.atlas; this.anchorUp = opts.anchorUp || 0; this.noSpin = !!opts.noSpin; this.near = opts.near || 0; this.cam = null;
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
    let shape;
    if (this.flip) {
      const s = texture(opts.atlas, atlasUV(M.y.mul(63.99).floor()));
      shape = s.a;
      m.colorNode = s.rgb.mul(C.xyz).mul(light);
    } else {
      ATLAS = ATLAS || spriteAtlas();
      const cell = additive ? float(3) : M.z.mul(2.999).floor();
      shape = texture(ATLAS, vec2(uv().x.add(cell).mul(0.25), uv().y)).a;
      m.colorNode = additive ? C.xyz : C.xyz.mul(light);
    }
    m.opacityNode = additive ? shape.mul(C.w) : softParticles({ opacity: shape.mul(C.w), distance: float(opts.soft || 0.5), contrast: float(1.5) });
    const sp = new THREE.Sprite(m);
    sp.count = 0; sp.frustumCulled = false; sp.renderOrder = additive ? 11 : 10;
    scene.add(sp);
    this.sprite = sp;
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 1, buoy = 0) {
    if (this.n >= this.cap) return;
    if (this.vac) { life *= 0.3; s1 *= 1.6; a *= 0.22; drag = 0.05; buoy = 0; }
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b; this.a0[i] = a;
    this.drag[i] = drag; this.buoy[i] = buoy; this.rot[i] = this.noSpin ? 0 : Math.random() * 6.28; this.spin[i] = this.noSpin ? 0 : rnd(-0.8, 0.8) * (this.flip ? 0.4 : 1.9); this.seed[i] = Math.random();
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
      const fade = this.flip ? Math.min(1, t * 10) * Math.min(1, (1 - t) * 4) : Math.min(1, t * 8) * (1 - t) * (this.additive ? 1 - t : 1);
      let nf = 1;
      if (this.near && this.cam) { const dx = this.p[j] - this.cam.x, dy = this.p[j + 1] - this.cam.y, dz = this.p[j + 2] - this.cam.z; nf = Math.min(1, Math.max(0, (Math.sqrt(dx * dx + dy * dy + dz * dz) - size * 0.3 - 0.8) / this.near)); }
      const o = i * 4;
      P[o] = this.p[j]; P[o + 1] = this.p[j + 1] + size * this.anchorUp; P[o + 2] = this.p[j + 2]; P[o + 3] = size;
      C[o] = this.c[j]; C[o + 1] = this.c[j + 1]; C[o + 2] = this.c[j + 2]; C[o + 3] = this.a0[i] * fade * nf;
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

class Jets {
  constructor(scene, light, atlas, cap) {
    this.cap = cap; this.k = 0;
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.iData.setUsage(THREE.DynamicDrawUsage);
    const m = fxMaterial(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const D = instancedBufferAttribute(this.iData);
    const s = texture(atlas, atlasUV(D.x));
    m.colorNode = s.rgb.mul(light);
    m.opacityNode = softParticles({ opacity: s.a.mul(D.y), distance: float(0.3), contrast: float(1.5) });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
    scene.add(this.mesh);
    this.phase = new Float32Array(cap).map(() => Math.random() * 64);
    this.m = new THREE.Matrix4(); this.x = new THREE.Vector3(); this.y = new THREE.Vector3(); this.z = new THREE.Vector3(); this.c = new THREE.Vector3();
  }

  begin() { this.k = 0; }

  add(o, d, len, wid, alpha, rate, dt, cam, slot) {
    if (this.k >= this.cap) return;
    const i = this.k++;
    this.phase[slot] = (this.phase[slot] + dt * rate) % 64;
    const ctr = this.c.copy(o).addScaledVector(d, len * 0.488);
    this.z.subVectors(cam, ctr);
    const cosv = Math.abs(d.dot(this.z)) / (this.z.length() || 1);
    alpha *= 1 - Math.min(1, Math.max(0, (cosv - 0.4) / 0.5)) * 0.85;
    this.y.crossVectors(d, this.z);
    if (this.y.lengthSq() < 1e-8) this.y.set(0, 1, 0).cross(d);
    this.y.normalize();
    this.z.crossVectors(d, this.y).normalize();
    this.x.copy(d).multiplyScalar(len); this.y.multiplyScalar(wid);
    this.m.makeBasis(this.x, this.y, this.z).setPosition(ctr);
    this.mesh.setMatrixAt(i, this.m);
    const a = this.iData.array; a[i * 4] = Math.floor(this.phase[slot]); a[i * 4 + 1] = alpha;
  }

  end() { this.mesh.count = this.k; this.mesh.instanceMatrix.needsUpdate = true; this.iData.needsUpdate = true; }
}

class Ring {
  constructor(scene, light, atlas) {
    this.frame = uniform(0); this.alpha = uniform(0);
    const m = fxMaterial(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const s = texture(atlas, atlasUV(this.frame));
    m.colorNode = s.rgb.mul(light);
    m.opacityNode = s.a.mul(this.alpha);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m);
    this.mesh.visible = false; this.mesh.renderOrder = 8; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.phase = 0; this.rot = 0; this.a = 0;
  }

  set(dt, x, y, z, size, alpha) {
    this.a += (alpha - this.a) * Math.min(1, dt * (alpha > this.a ? 4 : 0.8));
    this.mesh.visible = this.a > 0.01;
    if (!this.mesh.visible) return;
    if (alpha > 0) { this.mesh.position.set(x, y + 0.05, z); this.mesh.scale.setScalar(size); }
    this.phase = (this.phase + dt * 20) % 64; this.rot += dt * 0.1;
    this.mesh.rotation.y = this.rot;
    this.frame.value = Math.floor(this.phase); this.alpha.value = this.a;
  }
}

export class FX {
  constructor(scene, preset) {
    this.light = uniform(new THREE.Color(1, 1, 1));
    this.q = preset.particles || 1;
    this.alpha = new Pool(scene, Math.round(2600 * this.q), false, this.light, { near: 3 });
    this.add = new Pool(scene, Math.round(1400 * this.q), true, this.light);
    this.skids = new SkidMarks(scene);
    const base = '../assets/fx/';
    this.tex = { jet: flipbook(base + 'vapour_jet.webp'), puff: flipbook(base + 'vapour_puff.webp'), ground: flipbook(base + 'vapour_ground.webp'), ring: flipbook(base + 'vapour_ground_ring.webp') };
    this.jets = new Jets(scene, this.light, this.tex.jet, 16);
    this.puffs = new Pool(scene, Math.round(300 * this.q), false, this.light, { atlas: this.tex.puff, soft: 0.4, near: 2 });
    this.billows = new Pool(scene, Math.round(240 * this.q), false, this.light, { atlas: this.tex.ground, anchorUp: 0.47, noSpin: true, soft: 0.6, near: 3 });
    this.ring = new Ring(scene, this.light, this.tex.ring);
    this.pools = [this.alpha, this.add, this.puffs, this.billows];
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

  thrusters(dt, sim, carQuat, carPos, camPos) {
    const th = sim.thrusters, vel = sim.vel, vac = !!(sim.env && sim.env.space);
    this.puffs.cam = camPos; this.billows.cam = camPos; this.alpha.cam = camPos;
    this.puffs.vac = this.alpha.vac = vac;
    this.jets.begin();
    let rw = 0, rx = 0, ry = 0, rz = 0, rh = 0;
    th.all.forEach((n, idx) => {
      if (!n.attached) return;
      const o = this._o.set(n.pos.x, n.pos.y, n.pos.z);
      const d = this._d.set(-n.dir.x, -n.dir.y, -n.dir.z);
      o.addScaledVector(d, n.exit).applyQuaternion(carQuat).add(carPos);
      d.applyQuaternion(carQuat);
      const v = n.valve;
      const gs = n.group === 'rear' ? 1 : n.group === 'front' ? 0.85 : 0.7;
      if (n.puff === 1 || n.puff === -1) {
        const big = n.puff === 1 ? 1 : 0.7;
        for (let k = 0; k < 3; k++) {
          const sz = k ? 0.55 : 1, sp = k ? rnd(2.4, 4.8) : 4, cell = 2.4 * sz * gs * big;
          this.puffs.spawn(o.x + d.x * cell * 0.2, o.y + d.y * cell * 0.2, o.z + d.z * cell * 0.2, vel.x + d.x * sp + rnd(-0.5, 0.5), vel.y + d.y * sp + rnd(-0.5, 0.5), vel.z + d.z * sp + rnd(-0.5, 0.5), rnd(0.7, 0.9), cell, cell * 1.15, 1, 1, 1, 0.75 * big, 2.5, 0.2);
        }
      }
      if (v <= 0.02) return;
      const boost = n.group === 'rear' && v > 0.85 && n.pitch < 0.3 && sim.contacts > 0 ? 1 : 0;
      const down = -d.y;
      let len = 4.0 * (0.45 + 0.4 * v) * gs;
      if (down > 0.35 && n.groundDist < 50) len = Math.min(len, Math.max(0.25, n.groundDist - n.exit + 0.2));
      const wid = 1.25 * (0.7 + 0.3 * v) * gs;
      this.jets.add(o, d, len, wid, Math.min(1, 0.3 + 0.5 * v) * Math.min(1, v * 6), 30 + 30 * v, dt, camPos, idx);
      const cnt = this.rate(n.name, (boost ? 40 : 15 + 25 * v) * (n.group === 'side' ? 0.6 : 1) * (down > 0.5 ? 0.3 : 1), dt);
      for (let k = 0; k < cnt; k++) {
        const sp = (6 + 6 * v) * rnd(0.8, 1.2), along = Math.random() * (boost ? len * 0.8 : Math.min(len, 1.2) * 0.5);
        if (boost) {
          this.alpha.spawn(o.x + d.x * along, o.y + d.y * along, o.z + d.z * along, vel.x * 0.3 + d.x * sp + rnd(-1.5, 1.5), vel.y * 0.3 + rnd(0.4, 1.6), vel.z * 0.3 + d.z * sp + rnd(-1.5, 1.5), rnd(1.8, 2.6), 0.7, rnd(2.4, 3.8), 1, 1, 1, rnd(0.5, 0.75), 2.2, 1.1);
        } else {
          const s1 = 2.0 * gs * (0.6 + 0.4 * v);
          this.alpha.spawn(o.x + d.x * along, o.y + d.y * along, o.z + d.z * along, vel.x * 0.3 + d.x * sp + rnd(-0.8, 0.8), vel.y * 0.3 + d.y * sp + rnd(-0.5, 0.8), vel.z * 0.3 + d.z * sp + rnd(-0.8, 0.8), rnd(0.85, 1.15), 0.3 * gs, s1, 1, 1, 1, 0.5 * (0.5 + 0.5 * v), 3, 0.35);
        }
      }
      if (down > 0.35 && n.groundDist < 4.5) {
        const reach = n.groundDist - n.exit;
        const gx = o.x + d.x * reach, gy = o.y + d.y * reach, gz = o.z + d.z * reach;
        const h = Math.max(0, o.y - gy);
        const f = Math.min(1.3, Math.max(0.35, 1.3 - h / 4));
        const k2 = this.rate(n.name + 'g', (3 + 5 * v) * (1 - n.groundDist / 4.5) * (n.group === 'side' ? 0.8 : 1), dt);
        for (let k = 0; k < k2; k++) {
          let ox = gx - carPos.x, oz = gz - carPos.z; const ol = Math.hypot(ox, oz) || 1;
          const a = Math.atan2(oz / ol, ox / ol) + rnd(-0.9, 0.9), sp = rnd(2, 4) * (0.6 + 0.4 * v);
          ox = Math.cos(a) * sp; oz = Math.sin(a) * sp;
          this.billows.spawn(gx, gy, gz, ox + vel.x * 0.4, rnd(0.1, 0.5), oz + vel.z * 0.4, rnd(2.2, 2.8), 1.5 * f, 5 * f, 1, 1, 1, 0.3 + 0.35 * v, 0.7, 0.12);
        }
        const w = v * n.thrustMax * down;
        rw += w; rx += gx * w; ry += gy * w; rz += gz * w; rh += h * w;
      }
    });
    this.jets.end();
    this.puffs.vac = this.alpha.vac = false;
    if (rw > 0) { const h = rh / rw; this.ring.set(dt, rx / rw, ry / rw, rz / rw, Math.min(9, 4 + 1.5 * h), Math.max(0, Math.min(1, 1 - h / 4.5)) * Math.min(1, rw / 14000)); }
    else this.ring.set(dt, 0, 0, 0, 1, 0);
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

  update(dt) { for (const p of this.pools) p.update(dt); }
}
