// Roadster 88 open water: the bay, the two rivers and city ponds as flat surfaces at their levels, built from the mega grid where the ground lies below the surface, plus the open sea to the horizon, with a depth-tinted, wind-rippled TSL water material that reflects the sky and the skyline and rings under a hovering car.
import * as THREE from 'three/webgpu';
import { uniform, texture, attribute, vec2, vec3, float, positionWorld, mix, smoothstep, normalize, transformNormalToView, length, sin, exp, max } from 'three/tsl';

export class Water {
  constructor(gfx, O, noise, opts = {}) {
    this.gfx = gfx; this.O = O; this.noise = noise;
    this.U = { time: uniform(0), blast: uniform(new THREE.Vector4(0, -1000, 0, 0)), wind: uniform(new THREE.Vector2(1, 0.3)), tint: uniform(new THREE.Color(1, 1, 1)), rough: uniform(0.07) };
    this.root = new THREE.Group(); this.root.name = 'Water';
    gfx.scene.add(this.root);
    this.mat = this.makeMaterial();
    this.bodies = [{ id: 'sea', level: 0, z0: opts.z0 || 2300 }];
    this.build();
  }

  makeMaterial() {
    this.camU = uniform(new THREE.Vector3());
    return makeWaterMaterial(this.U, this.noise, this.camU, attribute('depth', 'float'));
  }

  build() {
    for (const c of [...this.root.children]) { this.root.remove(c); c.geometry.dispose(); }
    const O = this.O, step = 32, T = 2048, per = T / step, n = Math.round(O.EXTENT / T), zMin = this.bodies[0].z0;
    const meshOf = (pos, dep, idx) => {
      if (!idx.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      g.setAttribute('depth', new THREE.Float32BufferAttribute(dep, 1));
      g.setIndex(idx); g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.userData.k = 'water';
      this.root.add(mesh);
      return mesh;
    };
    const pos = [], dep = [], idx = [];
    const quad = (x0, z0, x1, z1, y, d) => { const o = pos.length / 3; pos.push(x0, y, z0, x1, y, z0, x0, y, z1, x1, y, z1); dep.push(d, d, d, d); idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); };
    for (let ti = 0; ti < n; ti++) for (let tj = 0; tj < n; tj++) {
      const tx0 = O.ORIGIN + tj * T, tz0 = O.ORIGIN + ti * T;
      if (tz0 + T < zMin) continue;
      const wetC = [];
      let all = true, deep = true;
      for (let i = 0; i < per; i++) for (let j = 0; j < per; j++) {
        const xa = tx0 + j * step, za = tz0 + i * step;
        let wet = false, dmin = 99;
        for (let a = 0; a <= 2; a++) for (let b = 0; b <= 2; b++) { const h = O.hAt(xa + a * step / 2, za + b * step / 2); if (h < 0.7) wet = true; dmin = Math.min(dmin, -h); }
        if (za + step < zMin) wet = false;
        if (wet) wetC.push([i, j]); else all = false;
        if (dmin < 7) deep = false;
      }
      if (!wetC.length) continue;
      if (all && deep) { quad(tx0, tz0, tx0 + T, tz0 + T, 0, 20); continue; }
      const vid = new Map();
      const vert = (i, j) => { const k = i * (per + 1) + j; let v = vid.get(k); if (v === undefined) { const x = tx0 + j * step, z = tz0 + i * step; v = pos.length / 3; pos.push(x, 0, z); dep.push(Math.max(0, Math.min(40, -O.hAt(x, z)))); vid.set(k, v); } return v; };
      for (const [i, j] of wetC) { const a = vert(i, j), b = vert(i, j + 1), c = vert(i + 1, j), d = vert(i + 1, j + 1); idx.push(a, c, b, b, c, d); }
    }
    const far = 32000, E = O.ORIGIN + O.EXTENT;
    for (const [qx0, qz0, qx1, qz1] of [[-far, E, far, far], [-far, 7400, O.ORIGIN, E], [E, 7400, far, E]]) quad(qx0, qz0, qx1, qz1, -0.02, 30);
    for (const P of this.ponds || []) {
      const n2 = 40, rings = 6, base = pos.length / 3;
      pos.push(P.x, P.level, P.z); dep.push(P.depth);
      for (let r = 1; r <= rings; r++) for (let a = 0; a < n2; a++) { const t = r / rings * 1.08, ang = a / n2 * Math.PI * 2; pos.push(P.x + Math.cos(ang) * P.rx * t, P.level, P.z + Math.sin(ang) * P.rz * t); dep.push(Math.max(0, P.depth * (1 - t * t))); }
      for (let a = 0; a < n2; a++) idx.push(base, base + 1 + (a + 1) % n2, base + 1 + a);
      for (let r = 1; r < rings; r++) for (let a = 0; a < n2; a++) { const A = base + 1 + (r - 1) * n2 + a, B = base + 1 + (r - 1) * n2 + (a + 1) % n2, C = base + 1 + r * n2 + a, D = base + 1 + r * n2 + (a + 1) % n2; idx.push(A, B, C, B, D, C); }
    }
    this.mesh = meshOf(pos, dep, idx);
  }

  setPonds(list) { this.ponds = list; this.build(); }

  update(dt, cam, car) {
    this.U.time.value += dt;
    if (this.camU) this.camU.value.copy(cam);
    const B = this.U.blast.value;
    if (car && car.thrusters) {
      const p = car.pos, h = p.y;
      const push = Math.min(1, car.thrusters.totalForce.len() / 30000) * Math.max(0, 1 - h / 22);
      B.set(p.x, 0, p.z, B.w + (push - B.w) * Math.min(1, dt * 3));
    }
  }
}

export function makeWaterMaterial(U, noise, camU, d) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.07, metalness: 0 });
  m.name = 'Water';
  const wxz = positionWorld.xz, t = U.time;
  const camD = length(positionWorld.sub(camU));
  const fade = float(1).sub(smoothstep(250, 2200, camD));
  const n1 = texture(noise, wxz.div(61).add(U.wind.mul(t.mul(0.011)))), n2 = texture(noise, wxz.div(17).sub(U.wind.yx.mul(t.mul(0.023)))), n3 = texture(noise, wxz.div(4.3).add(vec2(t.mul(0.05), t.mul(-0.031))));
  let sx = n1.r.sub(0.5).mul(0.55).add(n2.g.sub(0.5).mul(0.35)), sz = n1.g.sub(0.5).mul(0.55).add(n2.b.sub(0.5).mul(0.35));
  sx = sx.add(n3.a.sub(0.5).mul(0.22).mul(fade)); sz = sz.add(n3.r.sub(0.5).mul(0.22).mul(fade));
  const B = U.blast, bd = length(wxz.sub(B.xz)), ring = sin(bd.mul(1.6).sub(t.mul(9))).mul(exp(bd.mul(-0.09))).mul(B.w).mul(0.9);
  const rx = wxz.x.sub(B.x).div(bd.max(0.5)).mul(ring), rz = wxz.y.sub(B.z).div(bd.max(0.5)).mul(ring);
  const k = mix(float(0.38), float(0.12), smoothstep(150, 1800, camD));
  const N = normalize(vec3(sx.mul(k).add(rx), float(1), sz.mul(k).add(rz)));
  m.normalNode = transformNormalToView(N);
  const shallow = vec3(0.045, 0.085, 0.075), mid = vec3(0.014, 0.04, 0.048), deep = vec3(0.006, 0.018, 0.028);
  const c = mix(mix(shallow, mid, smoothstep(0.3, 4, d)), deep, smoothstep(4, 16, d));
  const foam = smoothstep(0.6, 0.0, d).mul(n2.r.mul(0.7).add(0.3)).mul(0.5).add(B.w.mul(exp(bd.mul(-0.25))).mul(0.5));
  m.colorNode = mix(c.mul(U.tint), vec3(0.6, 0.62, 0.62), foam.clamp(0, 0.8));
  m.roughnessNode = U.rough.add(foam.mul(0.5)).add(smoothstep(300, 3000, camD).mul(0.05));
  return m;
}
