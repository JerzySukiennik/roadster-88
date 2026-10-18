// Roadster 88 space stars: the 9,096 naked-eye stars of the Yale Bright Star Catalog as one instanced sprite batch at infinity, coloured by B-V, sized by magnitude, hidden behind the Earth and the Moon, and drifting apart in deep time as the constellations dissolve.
import * as THREE from 'three/webgpu';
import { float, vec3, vec4, uniform, uv, instancedBufferAttribute, cameraPosition, length, dot, sqrt, max, exp, mix, select, vertexStage, smoothstep } from 'three/tsl';

function bvRGB(bv) {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const k = t / 100;
  const r = k <= 66 ? 1 : Math.min(1, 1.293 * Math.pow(k - 60, -0.1332));
  const g = k <= 66 ? Math.min(1, Math.max(0, 0.39 * Math.log(k) - 0.632)) : Math.min(1, 1.13 * Math.pow(k - 60, -0.0755));
  const b = k >= 66 ? 1 : k <= 19 ? 0 : Math.min(1, Math.max(0, 0.543 * Math.log(k - 10) - 1.196));
  const n = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [r / n, g / n, b / n];
}

export class Stars {
  constructor(U) {
    this.U = U;
    this.i2p = uniform(new THREE.Matrix3());
    this.i2e = uniform(new THREE.Matrix3());
    this.px = uniform(0.0015);
    this.gain = uniform(1);
    this.mesh = null; this.base = null; this.age = null;
  }

  async load(url) {
    const buf = new DataView(await (await fetch(url)).arrayBuffer());
    const n = buf.byteLength / 8;
    this.n = n;
    this.base = new Float32Array(n * 3);
    const props = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      this.base[i * 3] = buf.getInt16(o, true) / 32767; this.base[i * 3 + 1] = buf.getInt16(o + 2, true) / 32767; this.base[i * 3 + 2] = buf.getInt16(o + 4, true) / 32767;
      const mag = buf.getUint8(o + 6) / 25 - 2, bv = buf.getUint8(o + 7) / 100 - 0.4;
      const c = bvRGB(bv), lum = Math.pow(10, -0.4 * mag * 0.62) * 0.55;
      props[i * 4] = c[0] * lum; props[i * 4 + 1] = c[1] * lum; props[i * 4 + 2] = c[2] * lum;
      props[i * 4 + 3] = Math.min(3.2, 1.25 + Math.max(0, 2.4 - mag) * 0.55);
    }
    this.dirAttr = new THREE.InstancedBufferAttribute(this.base.slice(), 3);
    this.propAttr = new THREE.InstancedBufferAttribute(props, 4);
    this.build();
  }

  build() {
    const U = this.U;
    const m = new THREE.SpriteNodeMaterial({ transparent: false, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, sizeAttenuation: false });
    m.fog = false;
    const dir = instancedBufferAttribute(this.dirAttr), prop = instancedBufferAttribute(this.propAttr);
    m.positionNode = cameraPosition.add(this.i2p.mul(dir).mul(2500));
    m.scaleNode = prop.w.mul(this.px);
    const vis = vertexStage((() => {
      const d = this.i2e.mul(dir);
      const ro = U.cam;
      const b = dot(ro, d), lr = length(ro), r = U.R.add(U.top.mul(0.4));
      const h = b.mul(b).sub(lr.sub(r).mul(lr.add(r)));
      const earth = select(h.greaterThan(0).and(b.lessThan(0)), float(0), float(1));
      const mo = ro.sub(U.moon), bm = dot(mo, d), lm = length(mo);
      const hm = bm.mul(bm).sub(lm.sub(U.moonR).mul(lm.add(U.moonR)));
      const moon = select(hm.greaterThan(0).and(bm.lessThan(0)).and(U.moonShow.greaterThan(0)), float(0), float(1));
      const glare = smoothstep(0.9995, 0.99, dot(d, U.sun));
      return select(U.planet.greaterThan(0), earth, float(1)).mul(moon).mul(mix(float(1), glare, U.sunShow));
    })());
    const p = uv().sub(0.5).mul(2);
    const fall = exp(dot(p, p).mul(-3.2)).sub(0.04).max(0);
    m.colorNode = vec4(prop.xyz.mul(fall).mul(vis).mul(this.gain), 1);
    const s = new THREE.Sprite(m);
    s.count = this.n; s.frustumCulled = false; s.renderOrder = -39; s.name = 'SpaceStars';
    this.mesh = s;
  }

  setAge(years) {
    if (!this.base) return;
    const a = Math.abs(years);
    const key = a < 2e4 ? 0 : Math.round(Math.log10(a) * 8);
    if (key === this.age) return;
    this.age = key;
    const out = this.dirAttr.array, B = this.base;
    let seed = 12345;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    const drift = Math.min(3, a * 3e-7);
    const shuffle = Math.min(1, Math.max(0, (a - 2e7) / 2e8));
    for (let i = 0; i < this.n; i++) {
      const k = (0.3 + Math.abs(rnd()) * 2) * drift, j = i * 3;
      let x = B[j] + rnd() * k, y = B[j + 1] + rnd() * k, z = B[j + 2] + rnd() * k;
      if (shuffle > 0) { const u = rnd() * 2, t = (rnd() + 0.5) * Math.PI * 2, q = Math.sqrt(Math.max(0, 1 - u * u)); x += (q * Math.cos(t) - x) * shuffle; y += (q * Math.sin(t) - y) * shuffle; z += (u - z) * shuffle; }
      const l = Math.hypot(x, y, z) || 1;
      out[j] = x / l; out[j + 1] = y / l; out[j + 2] = z / l;
    }
    this.dirAttr.needsUpdate = true;
  }
}
