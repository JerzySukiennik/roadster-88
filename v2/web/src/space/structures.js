// Roadster 88 space structures: far objects in kilometres drawn in a camera-scaled group (the orbital ring and debris rings fixed in the orbit's inertial frame, the Earth-fixed space elevator tether with climbers, satellites and the ISS as glints, all hidden behind the Earth with a per-pixel test and dark in its shadow), plus the near, true-scale pieces you can fly up to: a co-orbiting wheel station, the tether as it passes, a slice of the ring overhead and drifting planetesimals.
import * as THREE from 'three/webgpu';
import { Fn, If, Discard, float, vec3, vec4, uniform, attribute, positionLocal, cameraPosition, normalize, dot, length, sqrt, max, min, mix, smoothstep, select, fract, step, hash, floor, abs, time, sin, exp, varying, positionWorld, normalWorld, mx_noise_float, instancedBufferAttribute, uv } from 'three/tsl';
import { R_EARTH } from './astro.js';
import { fxMaterial } from '../render/gfx.js';

const RK = R_EARTH / 1000;

function occluders(U, P) {
  const d = P.sub(U.cam), L = length(d), rd = d.div(L);
  const b = dot(U.cam, rd), lr = length(U.cam);
  const h = b.mul(b).sub(lr.sub(U.R).mul(lr.add(U.R)));
  const tE = b.negate().sub(sqrt(max(h, 0)));
  const hidden = h.greaterThan(0).and(tE.greaterThan(0)).and(tE.lessThan(L)).and(U.planet.greaterThan(0));
  const ps = dot(P, U.sun), pl = length(P);
  const hs = ps.mul(ps).sub(pl.sub(U.R).mul(pl.add(U.R)));
  const shadow = select(hs.greaterThan(0).and(ps.lessThan(0)).and(U.planet.greaterThan(0)), float(1), float(0));
  return { hidden, shadow, L };
}

function farMaterial(U, opts) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, depthWrite: false, depthTest: false, transparent: !!opts.alpha, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  m.fog = false;
  const rot = opts.rot || uniform(new THREE.Matrix3());
  const center = rot.mul(attribute('center', 'vec3')), off = rot.mul(positionLocal).sub(center);
  const dist = length(center.sub(U.cam));
  const want = dist.mul(U.pixel).mul(opts.minPx || 0.75);
  const ol = length(off).max(1e-6);
  const grow = max(float(1), want.div(ol));
  m.positionNode = center.add(off.mul(grow));
  const cover = varying(min(float(1), ol.div(want)));
  const Pw = varying(center.add(off.mul(grow)));
  const nrm = varying(normalize(opts.normal ? rot.mul(attribute('nrm', 'vec3')) : off));
  m.colorNode = Fn(() => {
    const O = occluders(U, Pw);
    If(O.hidden, () => { Discard(); });
    const lit = float(1).sub(O.shadow);
    const c = opts.shade(Pw, nrm, lit, O.L);
    if (opts.fadeNear) If(O.L.lessThan(opts.fadeNear), () => { Discard(); });
    return vec4(c.rgb.mul(cover), opts.alpha ? c.a.mul(cover) : float(1));
  })();
  return m;
}

function ringGeometry(Rr, axis, a, hw, ht, segs, broken) {
  const b = new THREE.Vector3().crossVectors(axis, a).normalize();
  const pos = [], cen = [], nrm = [], idx = [];
  let v = 0;
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < segs; i++) {
    if (broken && (Math.sin(i * 0.37) + Math.sin(i * 0.13 + 1.3) + Math.sin(i * 0.029)) < -0.7) continue;
    for (const j of [i, i + 1]) {
      const t = j / segs * Math.PI * 2;
      const c = a.clone().multiplyScalar(Math.cos(t)).addScaledVector(b, Math.sin(t)).multiplyScalar(Rr + (broken ? Math.sin(j * 1.7) * 3 : 0));
      const er = c.clone().normalize();
      for (const [sx, sy] of corners) {
        const o = er.clone().multiplyScalar(sx * ht).addScaledVector(axis, sy * hw);
        pos.push(c.x + o.x, c.y + o.y, c.z + o.z); cen.push(c.x, c.y, c.z);
        const n = er.clone().multiplyScalar(sx * hw).addScaledVector(axis, sy * ht).normalize();
        nrm.push(n.x, n.y, n.z);
      }
    }
    for (let k = 0; k < 4; k++) { const a0 = v + k, a1 = v + (k + 1) % 4, b0 = a0 + 4, b1 = a1 + 4; idx.push(a0, b0, a1, a1, b0, b1); }
    v += 8;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('center', new THREE.Float32BufferAttribute(cen, 3));
  g.setAttribute('nrm', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

function bandGeometry(r0, r1, axis, a, segs) {
  const b = new THREE.Vector3().crossVectors(axis, a).normalize();
  const pos = [], cen = [], uvs = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs * Math.PI * 2, d = a.clone().multiplyScalar(Math.cos(t)).addScaledVector(b, Math.sin(t));
    for (const [k, r] of [[0, r0], [1, r1]]) { const p = d.clone().multiplyScalar(r); pos.push(p.x, p.y, p.z); cen.push(p.x, p.y, p.z); uvs.push(i / segs, k); }
    if (i < segs) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('center', new THREE.Float32BufferAttribute(cen, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

function tetherGeometry(base, dir, len, r, steps) {
  const side = new THREE.Vector3(0, 0, 1).cross(dir).normalize(), up = new THREE.Vector3().crossVectors(dir, side);
  const pos = [], cen = [], al = [], idx = [];
  for (let i = 0; i <= steps; i++) {
    const s = len * Math.pow(i / steps, 2.2);
    const c = base.clone().addScaledVector(dir, s);
    for (let k = 0; k < 6; k++) {
      const t = k / 6 * Math.PI * 2, o = side.clone().multiplyScalar(Math.cos(t) * r).addScaledVector(up, Math.sin(t) * r);
      pos.push(c.x + o.x, c.y + o.y, c.z + o.z); cen.push(c.x, c.y, c.z); al.push(s);
    }
    if (i < steps) for (let k = 0; k < 6; k++) { const a0 = i * 6 + k, a1 = i * 6 + (k + 1) % 6; idx.push(a0, a0 + 6, a1, a1, a0 + 6, a1 + 6); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('center', new THREE.Float32BufferAttribute(cen, 3));
  g.setAttribute('along', new THREE.Float32BufferAttribute(al, 1));
  g.setIndex(idx);
  return g;
}

export class Structures {
  constructor(space) {
    this.S = space; this.U = space.U;
    this.far = new THREE.Group(); this.far.name = 'SpaceFar'; this.far.matrixAutoUpdate = false;
    this.near = new THREE.Group(); this.near.name = 'SpaceNear';
    this.items = {};
    this.cfg = { ring: null, tether: null, station: false, debris: 0, impact: 0, rocks: 0, sats: 0 };
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3(); this.m4 = new THREE.Matrix4(); this.m4b = new THREE.Matrix4();
    this.ringRadius = RK + 430;
    this.eciRot = uniform(new THREE.Matrix3());
    this.stationPos = new THREE.Vector3(-1800, 6300, 2600);
    this.stTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.15, 0.4, 0));
  }

  geometry(anchorUp, north, east) {
    const up = new THREE.Vector3(...anchorUp), N = new THREE.Vector3(...north), E = new THREE.Vector3(...east);
    const Q = up.clone().addScaledVector(N, 3 / this.ringRadius).normalize();
    const tq = N.clone().multiplyScalar(Math.cos(75 * Math.PI / 180)).addScaledVector(E, Math.sin(75 * Math.PI / 180));
    this.ringAxis = new THREE.Vector3().crossVectors(Q, tq).normalize();
    this.ringA = Q.clone().sub(this.ringAxis.clone().multiplyScalar(Q.dot(this.ringAxis))).normalize();
    this.tetherDir = up.clone().multiplyScalar(RK).addScaledVector(E, 5.2).addScaledVector(N, 4.2).normalize();
    this.tetherBase = this.tetherDir.clone().multiplyScalar(RK);
  }

  orbitRing(hEci, pEci) {
    this.ringAxis = hEci.clone().normalize();
    this.ringA = pEci.clone().addScaledVector(this.ringAxis, -pEci.dot(this.ringAxis)).normalize();
    for (const k of ['ring_whole', 'ring_broken', 'band_debris']) { const m = this.items[k]; if (m) { this.far.remove(m); m.geometry.dispose(); delete this.items[k]; } }
  }

  shift(d) {
    this.stationPos.sub(d);
    const R = this.items.rocks;
    if (R) for (const r of R.userData.data) r.p.sub(d);
  }

  shadeMetal(U, base, lights) {
    return (P, n, lit, L) => {
      const sun = max(dot(n, U.sun), 0).mul(lit).mul(U.sunI).mul(0.25);
      const amb = max(dot(n, normalize(P).negate()), 0).mul(0.02).add(0.004);
      const lt = lights ? lights(P).mul(float(1).sub(lit.mul(0.85))) : vec3(0);
      return vec4(vec3(...base).mul(sun.add(amb)).add(lt), 1);
    };
  }

  makeRing(kind) {
    const U = this.U, key = 'ring_' + kind;
    if (this.items[key]) return this.items[key];
    const g = ringGeometry(this.ringRadius, this.ringAxis, this.ringA, 0.6, 0.15, 2880, kind === 'broken');
    const lights = (P) => vec3(1.0, 0.82, 0.55).mul(step(0.93, fract(dot(P, vec3(0.37, 0.61, 0.7)).mul(0.5)))).mul(kind === 'broken' ? 0 : 0.6);
    const mesh = new THREE.Mesh(g, farMaterial(U, { normal: true, rot: this.eciRot, shade: this.shadeMetal(U, [0.62, 0.64, 0.68], lights), fadeNear: 0.5 }));
    mesh.frustumCulled = false; mesh.renderOrder = -36;
    this.far.add(mesh); this.items[key] = mesh;
    return mesh;
  }

  makeBand(key, r0, r1, axis, a, look) {
    const U = this.U;
    if (this.items[key]) return this.items[key];
    const g = bandGeometry(r0, r1, axis, a, 720);
    const m = fxMaterial(new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, depthWrite: false, depthTest: false, transparent: true }));
    m.fog = false;
    const Pw = varying(this.eciRot.mul(attribute('center', 'vec3')));
    const uvv = uv();
    m.positionNode = this.eciRot.mul(positionLocal);
    m.colorNode = Fn(() => {
      const O = occluders(U, Pw);
      If(O.hidden, () => { Discard(); });
      const r = uvv.y;
      const grain = mx_noise_float(Pw.mul(look.grain)).mul(0.5).add(0.5);
      const rings = sin(r.mul(look.bands)).mul(0.5).add(0.5).mul(0.6).add(0.4);
      const dens = smoothstep(0, 0.15, r).mul(smoothstep(1, 0.8, r)).mul(rings).mul(grain.mul(0.6).add(0.4)).mul(look.alpha);
      const lit = float(1).sub(O.shadow.mul(0.97));
      const c = vec3(...look.color).mul(U.sunI.mul(0.06).mul(lit)).add(vec3(...(look.glow || [0, 0, 0])));
      return vec4(c, dens);
    })();
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -37;
    this.far.add(mesh); this.items[key] = mesh;
    return mesh;
  }

  makeTether(full) {
    const U = this.U, key = full ? 'tether_full' : 'tether_build';
    if (this.items[key]) return this.items[key];
    const len = full ? 100000 : 420;
    const g = tetherGeometry(this.tetherBase, this.tetherDir, len, 0.006, full ? 260 : 40);
    const al = attribute('along', 'float');
    const alv = varying(al);
    const shade = (P, n, lit) => {
      const climb = step(0.996, fract(alv.div(320).sub(time.mul(0.004))));
      const base = vec3(0.55, 0.58, 0.62).mul(max(dot(n, U.sun), 0).mul(0.6).add(0.4).mul(lit).mul(U.sunI).mul(0.2).add(0.01));
      return vec4(base.add(vec3(0.6, 0.85, 1.0).mul(climb.mul(30).add(0.08))), 1);
    };
    const mesh = new THREE.Mesh(g, farMaterial(U, { shade, minPx: 0.6, fadeNear: 2.5 }));
    mesh.frustumCulled = false; mesh.renderOrder = -35;
    this.far.add(mesh); this.items[key] = mesh;
    return mesh;
  }

  makeNearTether() {
    if (this.items.nearTether) return this.items.nearTether;
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0.85, roughness: 0.32 });
    const yl = positionLocal.y;
    mat.colorNode = vec3(0.62, 0.64, 0.68).mul(step(0.08, fract(yl.div(24))).mul(0.25).add(0.75));
    mat.emissiveNode = vec3(0.55, 0.8, 1.0).mul(step(0.985, fract(yl.div(120))).mul(6));
    const L = 24000;
    for (const [x, z] of [[-3.2, 0], [3.2, 0], [0, -3.2], [0, 3.2]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, L, 10, 1, true), mat); c.position.set(x, 0, z); grp.add(c);
    }
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(5.6, L, 0.5), mat); grp.add(ribbon);
    const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(4.6, 0.45, 6, 18), mat, Math.ceil(L / 60));
    const mm = new THREE.Matrix4();
    for (let i = 0; i < rings.count; i++) { mm.makeRotationX(Math.PI / 2).setPosition(0, -L / 2 + i * 60, 0); rings.setMatrixAt(i, mm); }
    grp.add(rings);
    const climber = new THREE.Mesh(new THREE.BoxGeometry(14, 22, 14), new THREE.MeshStandardNodeMaterial({ color: 0xd9dde3, metalness: 0.6, roughness: 0.35 }));
    climber.material.emissiveNode = vec3(1.0, 0.85, 0.6).mul(step(0.7, fract(positionLocal.y.div(3))).mul(step(6.9, abs(positionLocal.x).max(abs(positionLocal.z)))).mul(3));
    grp.add(climber); grp.userData.climber = climber;
    grp.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; } });
    this.near.add(grp); this.items.nearTether = grp;
    return grp;
  }

  makeStation() {
    if (this.items.station) return this.items.station;
    const grp = new THREE.Group();
    const hull = new THREE.MeshStandardNodeMaterial({ metalness: 0.55, roughness: 0.42 });
    hull.colorNode = vec3(0.82, 0.83, 0.85);
    const w = positionLocal;
    hull.emissiveNode = vec3(1.0, 0.86, 0.62).mul(step(0.86, fract(w.x.mul(0.35).add(w.z.mul(0.35)).add(w.y.mul(0.5)))).mul(step(0.5, fract(w.y.mul(0.6)))).mul(1.6));
    const R = 320;
    const torus = new THREE.Mesh(new THREE.TorusGeometry(R, 26, 16, 160), hull); grp.add(torus);
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, R * 2, 8), hull); s.rotation.z = Math.PI / 2; s.rotation.y = i * Math.PI / 6; s.rotation.order = 'YZX'; grp.add(s); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 120, 32), hull); hub.rotation.x = Math.PI / 2; grp.add(hub);
    const panelM = new THREE.MeshStandardNodeMaterial({ color: 0x0c1a3a, metalness: 0.3, roughness: 0.25 });
    for (const sgn of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(18, 3, 260), panelM); p.position.set(0, 0, sgn * 200); p.rotation.x = Math.PI / 2; grp.add(p); }
    grp.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } });
    grp.userData.spin = torus;
    this.near.add(grp); this.items.station = grp;
    return grp;
  }

  makeNearRing() {
    if (this.items.nearRing) return this.items.nearRing;
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0.7, roughness: 0.38 });
    const w = positionLocal;
    mat.colorNode = vec3(0.6, 0.62, 0.66).mul(step(0.05, fract(w.z.div(40))).mul(0.2).add(0.8));
    mat.emissiveNode = vec3(1.0, 0.84, 0.6).mul(step(0.97, fract(w.z.div(18))).mul(step(140, w.y.abs().negate().add(150))).mul(2.5)).add(vec3(0.4, 0.75, 1.0).mul(step(0.995, fract(w.z.div(500))).mul(8)));
    const L = 60000;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1200, 300, L, 1, 1, 1), mat); grp.add(deck);
    const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(40, 60, 900), mat, Math.ceil(L / 1000) * 2);
    const mm = new THREE.Matrix4();
    for (let i = 0; i < rails.count; i++) { mm.makeTranslation((i % 2 ? 1 : -1) * 640, 120, -L / 2 + Math.floor(i / 2) * 1000); rails.setMatrixAt(i, mm); }
    grp.add(rails);
    grp.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    this.near.add(grp); this.items.nearRing = grp;
    return grp;
  }

  makeRocks() {
    if (this.items.rocks) return this.items.rocks;
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + 0.28 * Math.sin(v.x * 3.1 + v.y * 1.7) * Math.cos(v.z * 2.3) + 0.12 * Math.sin(v.y * 7 + v.x * 5); v.multiplyScalar(k); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    mat.colorNode = mix(vec3(0.16, 0.12, 0.1), vec3(0.32, 0.25, 0.2), mx_noise_float(positionLocal.mul(2.5)).mul(0.5).add(0.5));
    const N = 260, inst = new THREE.InstancedMesh(g, mat, N);
    inst.frustumCulled = false;
    const data = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < N; i++) data.push({ p: new THREE.Vector3((rnd() - 0.5) * 3000, (rnd() - 0.5) * 900, (rnd() - 0.5) * 3000), v: new THREE.Vector3((rnd() - 0.5) * 2, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 2), s: 2 + Math.pow(rnd(), 3) * 60, q: new THREE.Quaternion().random(), w: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.4) });
    inst.userData.data = data;
    this.near.add(inst); this.items.rocks = inst;
    return inst;
  }

  makeSats() {
    if (this.items.sats) return this.items.sats;
    const N = 60, pos = new Float32Array(N * 3), col = new Float32Array(N * 4);
    const pa = new THREE.InstancedBufferAttribute(pos, 3), ca = new THREE.InstancedBufferAttribute(col, 4);
    pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.SpriteNodeMaterial({ transparent: false, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, sizeAttenuation: false });
    m.fog = false;
    const P = instancedBufferAttribute(pa), C = instancedBufferAttribute(ca);
    m.positionNode = P;
    m.scaleNode = C.w.mul(this.S.stars ? this.S.stars.px : uniform(0.0015));
    const q = uv().sub(0.5).mul(2);
    m.colorNode = vec4(C.xyz.mul(exp(dot(q, q).mul(-3)).sub(0.05).max(0)), 1);
    const s = new THREE.Sprite(m); s.count = 0; s.frustumCulled = false; s.renderOrder = -38;
    let seed = 99;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const orbits = [];
    for (let i = 0; i < N; i++) {
      const iss = i === 0, chain = i > 0 && i < 13;
      orbits.push({ inc: (iss ? 51.6 : chain ? 53 : 30 + rnd() * 68) * Math.PI / 180, node: iss ? 0.4 : chain ? 1.9 : rnd() * Math.PI * 2, ph: iss ? 0.05 : chain ? 0.1 + i * 0.012 : rnd() * Math.PI * 2, alt: iss ? 415 : chain ? 550 : 480 + rnd() * 700, size: iss ? 3.2 : 1.6, gain: iss ? 6 : chain ? 1.2 : 0.8 + rnd() * 1.4 });
    }
    s.userData = { pa, ca, orbits };
    this.near.add(s); this.items.sats = s;
    return s;
  }

  setLook(L) {
    this.cfg = L;
    const show = (k, on) => { if (this.items[k]) { this.items[k].visible = on; this.items[k].userData.on = on; } };
    for (const k of Object.keys(this.items)) show(k, false);
    if (L.ring) {
      if (L.ring === 'debris') this.makeBand('band_debris', RK * 1.5, RK * 2.4, this.ringAxis, this.ringA, { color: [0.42, 0.38, 0.34], alpha: 0.75, bands: 70, grain: 0.02 }).visible = true;
      else this.makeRing(L.ring).visible = true;
    }
    if (L.moon && L.moon.debris) this.makeBand('band_impact', RK * 1.3, RK * 4.2, new THREE.Vector3(0.1, 0.05, 1).normalize(), new THREE.Vector3(1, 0, 0), { color: [0.7, 0.45, 0.3], alpha: 0.9, bands: 40, grain: 0.004, glow: [0.25, 0.06, 0.01] }).visible = true;
    if (L.tether) {
      this.makeTether(L.tether === 'full'); show(L.tether === 'full' ? 'tether_full' : 'tether_build', true);
      if (L.tether === 'full') { this.makeNearTether(); show('nearTether', true); }
    }
    if (L.station) { this.makeStation(); show('station', true); }
    if (L.ring === 'whole') { this.makeNearRing(); show('nearRing', true); }
    if (L.rocks) { this.makeRocks(); show('rocks', true); }
    if (L.sats > 0) { const s = this.makeSats(); show('sats', true); s.count = Math.min(60, Math.round(1 + L.sats * 19)); }
  }

  update(dt, t) {
    const S = this.S, U = this.U, cam = S.camPocket;
    const k = 0.35;
    this.m4.makeTranslation(cam.x, cam.y, cam.z).multiply(this.m4b.makeScale(k, k, k)).multiply(S.e2pM4).multiply(new THREE.Matrix4().makeTranslation(-S.camEcefKm.x, -S.camEcefKm.y, -S.camEcefKm.z));
    this.far.matrix.copy(this.m4); this.far.matrixWorldNeedsUpdate = true;
    const I = this.items;
    if (I.nearTether && I.nearTether.userData.on) {
      const base = S.toPocket(this.tmp.copy(this.tetherBase).multiplyScalar(1000), new THREE.Vector3());
      const dirP = S.dirToPocket(this.tetherDir, new THREE.Vector3());
      const rel = cam.clone().sub(base), s = rel.dot(dirP);
      const snap = Math.round(s / 120) * 120;
      I.nearTether.position.copy(base).addScaledVector(dirP, snap);
      I.nearTether.visible = Math.abs(rel.length() ** 2 - s * s) < 60000 ** 2;
      I.nearTether.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirP);
      const cl = I.nearTether.userData.climber;
      cl.position.y = ((t * 180 + 391000) % 600000) - snap;
      cl.visible = Math.abs(cl.position.y) < 12000;
    }
    if (I.station && I.station.userData.on) {
      I.station.position.copy(this.stationPos);
      I.station.quaternion.copy(this.stTilt);
      I.station.userData.spin.rotation.z = t * 0.06;
      I.station.visible = I.station.position.distanceTo(cam) < 150000;
    }
    const er = this.eciRot.value.copy(S.eciToEcefM);
    if (I.nearRing && I.nearRing.userData.on) {
      const ce = S.camEcefKm, ax = this.ringAxis.clone().applyMatrix3(er), ra = this.ringA.clone().applyMatrix3(er);
      const inPlane = ce.clone().addScaledVector(ax, -ce.dot(ax)).normalize();
      const pt = inPlane.clone().multiplyScalar(this.ringRadius);
      const tan = new THREE.Vector3().crossVectors(ax, inPlane).normalize();
      const along = Math.atan2(inPlane.dot(new THREE.Vector3().crossVectors(ax, ra)), inPlane.dot(ra)) * this.ringRadius * 1000;
      const snapD = (Math.round(along / 1000) * 1000 - along) / 1000;
      pt.addScaledVector(tan, snapD);
      const dist = pt.distanceTo(ce);
      I.nearRing.visible = dist < 80;
      const P = S.toPocket(pt.multiplyScalar(1000), new THREE.Vector3());
      I.nearRing.position.copy(P);
      const zP = S.dirToPocket(tan, new THREE.Vector3()), xP = S.dirToPocket(ax, new THREE.Vector3()), yP = new THREE.Vector3().crossVectors(zP, xP);
      I.nearRing.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xP, yP, zP));
    }
    if (I.rocks && I.rocks.userData.on) {
      const inst = I.rocks, m = new THREE.Matrix4(), sc = new THREE.Vector3(), dq = new THREE.Quaternion();
      for (let i = 0; i < inst.userData.data.length; i++) {
        const d = inst.userData.data[i];
        d.p.addScaledVector(d.v, dt);
        const rel = d.p.clone().sub(cam);
        for (const ax of ['x', 'z']) { if (rel[ax] > 1500) d.p[ax] -= 3000; else if (rel[ax] < -1500) d.p[ax] += 3000; }
        if (rel.y > 450) d.p.y -= 900; else if (rel.y < -450) d.p.y += 900;
        dq.setFromAxisAngle(this.tmp2.copy(d.w).normalize(), d.w.length() * dt); d.q.premultiply(dq);
        m.compose(d.p, d.q, sc.setScalar(d.s)); inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
    }
    if (I.sats && I.sats.userData.on) this.updateSats(t);
  }

  updateSats(t) {
    const S = this.S, s = this.items.sats, { pa, ca, orbits } = s.userData;
    const v = this.tmp, P = this.tmp2, sun = S.sunEcef;
    const n = s.count;
    for (let i = 0; i < n; i++) {
      const o = orbits[i];
      const r = RK + o.alt, w = Math.sqrt(398600.4418 / (r * r * r));
      const th = o.ph + w * (t + S.orbitClock);
      const x = Math.cos(th) * r, y0 = Math.sin(th) * r;
      const y = y0 * Math.cos(o.inc), z = y0 * Math.sin(o.inc);
      const node = o.node - S.earthAngle;
      v.set(x * Math.cos(node) - y * Math.sin(node), x * Math.sin(node) + y * Math.cos(node), z);
      const ps = v.dot(sun), hs = ps * ps - (v.lengthSq() - RK * RK);
      const lit = !(hs > 0 && ps < 0);
      const rel = P.copy(v).sub(S.camEcefKm), dist = rel.length();
      const dir = rel.divideScalar(dist);
      const b = S.camEcefKm.dot(dir), h = b * b - (S.camEcefKm.lengthSq() - RK * RK);
      const behind = h > 0 && b < 0 && -b - Math.sqrt(h) < dist;
      S.dirToPocket(dir, P);
      pa.setXYZ(i, S.camPocket.x + P.x * 2400, S.camPocket.y + P.y * 2400, S.camPocket.z + P.z * 2400);
      const g = lit && !behind ? o.gain * Math.min(1, 900 / dist) * Math.min(1, 2500 / S.camEcefKm.length() * 2) * 0.6 : 0;
      ca.setXYZW(i, g, g * 0.97, g * 0.92, o.size);
    }
    pa.needsUpdate = true; ca.needsUpdate = true;
  }
}
