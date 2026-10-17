// Roadster 88 city props: street furniture placed from the plan (street lights matching the road light pools, traffic signals on the shared clock, hydrants, trash cans, mailboxes, newspaper boxes, benches, bus shelters, parking meters, sign posts, bollards, construction barriers, cones, barrels and fences, gas pumps, waterfront railings, street and park trees), baked into near chunk meshes and far tree meshes, structure point lights in one instanced draw, fixed Rapier bodies near the car that break loose when hit hard (light ones always loose and blown by thrusters), the broken ones drawn as instances, and break effects (hydrant fountains, pump fires, glass, sparks, leaves).
import * as THREE from 'three/webgpu';
import { attribute, uniform, vec3, vec4, float, step, mod, abs, select, positionLocal, positionWorld, sin, mix, smoothstep, texture, length, normalize, max, exp, vec2, bumpMap } from 'three/tsl';
import { rng, chunkOf } from './plan.js';
import { Kit, PGeo, model } from './propgeo.js';
import { PONDS, PARK_DRIVE } from './layout.js';
import { GROUP, groups } from '../../sim/car.js';

export const DCH = 512, DCN = 32, DCO = -8192;
export const dchunkOf = (x, z) => Math.max(0, Math.min(DCN - 1, Math.floor((z - DCO) / DCH))) * DCN + Math.max(0, Math.min(DCN - 1, Math.floor((x - DCO) / DCH)));

const TYPES = {
  lamp: { mass: 260, breakV: 9, shape: 'cyl', hx: 0.14, hy: 4.3 },
  signal: { mass: 380, breakV: 10, shape: 'cyl', hx: 0.18, hy: 3.4 },
  hydrant: { mass: 120, breakV: 6, shape: 'cyl', hx: 0.2, hy: 0.42 },
  trash: { mass: 25, breakV: 0, shape: 'cyl', hx: 0.32, hy: 0.5 },
  mailbox: { mass: 80, breakV: 5, shape: 'box', hx: 0.3, hy: 0.62, hz: 0.28 },
  news: { mass: 30, breakV: 0, shape: 'box', hx: 0.28, hy: 0.55, hz: 0.25 },
  bench: { mass: 70, breakV: 4, shape: 'box', hx: 0.95, hy: 0.42, hz: 0.32 },
  shelter: { mass: 400, breakV: 8, shape: 'box', hx: 2.6, hy: 1.3, hz: 0.75 },
  meter: { mass: 35, breakV: 3, shape: 'cyl', hx: 0.07, hy: 0.7 },
  sign: { mass: 30, breakV: 3, shape: 'cyl', hx: 0.05, hy: 1.45 },
  bollard: { mass: 120, breakV: 12, shape: 'cyl', hx: 0.12, hy: 0.5 },
  jersey: { mass: 900, breakV: 0, shape: 'box', hx: 1.5, hy: 0.42, hz: 0.3 },
  barrier: { mass: 45, breakV: 0, shape: 'box', hx: 0.9, hy: 0.5, hz: 0.25 },
  cone: { mass: 4, breakV: 0, shape: 'cyl', hx: 0.2, hy: 0.36 },
  barrel: { mass: 22, breakV: 0, shape: 'cyl', hx: 0.3, hy: 0.46 },
  fence: { mass: 40, breakV: 0, shape: 'box', hx: 1.5, hy: 1.0, hz: 0.04 },
  pump: { mass: 300, breakV: 6, shape: 'box', hx: 0.5, hy: 0.9, hz: 0.35 },
  rail: { mass: 60, breakV: 7, shape: 'box', hx: 1.6, hy: 0.55, hz: 0.04 },
  hitch: { mass: 80, breakV: 4, shape: 'box', hx: 1.2, hy: 0.45, hz: 0.07 },
  tree: { mass: 900, breakV: 16, shape: 'cyl', hx: 0.22, hy: 2.2 },
  rock: { mass: 20000, breakV: 999, shape: 'box', hx: 1.6, hy: 0.9, hz: 1.4 },
  ptree: { mass: 1400, breakV: 18, shape: 'cyl', hx: 0.3, hy: 2.5 },
};
const STYLE_PROPS = {
  frontier: ['hitch', 'barrel', 'trash', 'ptree', 'tree'],
  early: ['lamp', 'hydrant', 'mailbox', 'trash', 'bench', 'sign', 'tree', 'ptree', 'rail', 'news', 'pump', 'signal'],
  future: ['lamp', 'signal', 'bench', 'bollard', 'tree', 'ptree', 'rail', 'trash', 'shelter', 'pump', 'cone', 'jersey', 'barrier', 'fence', 'barrel'],
  ruins: ['lamp', 'signal', 'hydrant', 'trash', 'mailbox', 'bench', 'shelter', 'sign', 'jersey', 'barrier', 'cone', 'barrel', 'fence', 'pump', 'rail', 'tree', 'ptree'],
  scifi: ['lamp', 'bollard', 'ptree', 'tree', 'rail'],
};

export class Props {
  constructor(city) {
    this.city = city; this.g = city.g;
    this.root = new THREE.Group(); this.root.name = 'CityProps';
    city.root.add(this.root);
    this.U = city.U;
    this.clock = uniform(0); this.blast = uniform(new THREE.Vector4(0, -1000, 0, 0)); this.cam = uniform(new THREE.Vector3()); this.nearR = uniform(420);
    this.models = {};
    this.items = [];
    this.byChunk = new Map(); this.byD = new Map();
    this.bodies = new Map();
    this.broken = []; this.frozen = [];
    this.fxList = [];
    this.dyn = {};
    this.mat = this.material(false); this.farMat = this.leafMaterial(true); this.leafMat = this.leafMaterial(false);
  }

  kit(type, variant = 0) { const k = type + ':' + variant; return this.models[k] || (this.models[k] = model(type, variant)); }

  material(far) {
    const U = this.U, m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.25 });
    m.name = far ? 'CityFarTrees' : 'CityProps';
    const c = attribute('color', 'vec3'), e = attribute('emit', 'float'), lamp = attribute('lamp', 'float'), S = attribute('sig', 'vec4');
    const leaf = step(lamp, -0.5);
    const night = U.night.mul(U.lights);
    const B = this.blast, wp = positionLocal;
    const bd = length(wp.xz.sub(B.xz)).max(0.5), push = B.w.mul(exp(bd.mul(-0.08))).mul(smoothstep(30, 0, wp.y.sub(B.y).abs()));
    const wind = sin(U.time.mul(1.7).add(wp.x.mul(0.31)).add(wp.z.mul(0.27))).mul(0.06);
    const dir = wp.xz.sub(B.xz).div(bd);
    let pos = positionLocal.add(vec3(dir.x.mul(push).mul(1.4).add(wind), push.mul(-0.3), dir.y.mul(push).mul(1.4).add(wind.mul(0.7))).mul(leaf));
    if (far) { const d = length(positionLocal.xz.sub(this.cam.xz)); pos = pos.sub(vec3(0, smoothstep(this.nearR, this.nearR.sub(60), d).mul(40), 0)); }
    m.positionNode = pos;
    let em = c.mul(e).mul(night.mul(1.1).add(select(e.greaterThan(0.5), float(0.02), float(0))));
    if (!far) {
      const t = this.clock, cyc = S.z.max(1), g = S.w;
      const ph = mod(t.add(S.x), cyc), ph2 = mod(ph.sub(g).sub(5.5).add(cyc), cyc), g2 = cyc.sub(g).sub(11);
      const stA = select(ph.lessThan(g), float(3), select(ph.lessThan(g.add(3.5)), float(2), float(1)));
      const stB = select(ph2.lessThan(g2), float(3), select(ph2.lessThan(g2.add(3.5)), float(2), float(1)));
      const axis = S.y;
      const mineMain = select(axis.greaterThan(0.5), stB, stA), mineSide = select(axis.greaterThan(0.5), stA, stB);
      const mine = select(lamp.greaterThan(3.5), mineSide.add(3), mineMain);
      const on = select(lamp.greaterThan(0.5).and(abs(lamp.sub(mine)).lessThan(0.5)), float(1), float(0)).mul(U.lights);
      em = em.add(c.mul(on).mul(2.2));
    }
    m.colorNode = c.mul(mix(float(1), texture(this.city.noise, positionWorld.xz.div(1.7)).g.mul(0.55).add(0.72), leaf));
    m.roughnessNode = mix(float(0.55), float(0.92), leaf);
    m.metalnessNode = mix(float(0.3), float(0), leaf);
    m.emissiveNode = em;
    return m;
  }

  leafMaterial(far) {
    const U = this.U, m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    m.name = far ? 'CityFarTrees' : 'CityLeaves';
    const c = attribute('color', 'vec3');
    const B = this.blast, wp = positionLocal;
    const bd = length(wp.xz.sub(B.xz)).max(0.5), push = B.w.mul(exp(bd.mul(-0.08))).mul(smoothstep(30, 0, wp.y.sub(B.y).abs()));
    const wind = sin(U.time.mul(1.7).add(wp.x.mul(0.31)).add(wp.z.mul(0.27))).mul(0.07);
    const dir = wp.xz.sub(B.xz).div(bd);
    let pos = positionLocal.add(vec3(dir.x.mul(push).mul(1.4).add(wind), push.mul(-0.3), dir.y.mul(push).mul(1.4).add(wind.mul(0.7))));
    if (far) { const d = length(positionLocal.xz.sub(this.cam.xz)); pos = pos.sub(vec3(0, smoothstep(this.nearR, this.nearR.sub(60), d).mul(40), 0)); }
    m.positionNode = pos;
    const w = positionWorld, n1 = texture(this.city.noise, w.xz.add(w.y.mul(0.61)).div(1.3)), n2 = texture(this.city.noise, w.zy.add(w.x.mul(0.37)).div(0.55));
    const leafy = n1.r.mul(0.6).add(n2.g.mul(0.4));
    m.colorNode = c.mul(leafy.mul(0.9).add(0.45)).mul(mix(vec3(1.0, 1.0, 1.0), vec3(1.25, 1.1, 0.7), n2.b.mul(0.5)));
    if (!far) m.maskNode = leafy.greaterThan(0.3);
    m.normalNode = bumpMap(leafy, float(far ? 0.4 : 1.2));
    return m;
  }

  build(plan) { this.adopt(this.prepare(plan)); }

  prepare(plan) { const st = this.newState(plan); for (const _ of this.prepareSteps(st)); return st; }

  newState(plan) {
    const st = { plan, items: [], byChunk: new Map(), byD: new Map(), vents: [] };
    const allow = plan && STYLE_PROPS[plan.style] || null, ok = (t) => !allow || allow.includes(t);
    const H = (x, z) => this.city.V.heightAt(x, z);
    st.add = (type, x, z, yaw, extra = {}) => { if (!ok(type)) return null; const y = extra.y !== undefined ? extra.y : H(x, z) + (extra.lift ?? 0.16); const it = { type, x, y, z, yaw, s: 1, v: 0, ...extra, id: st.items.length }; st.items.push(it); const k = chunkOf(x, z); if (!st.byChunk.has(k)) st.byChunk.set(k, []); st.byChunk.get(k).push(it); const d = dchunkOf(x, z); if (!st.byD.has(d)) st.byD.set(d, []); st.byD.get(d).push(it); return it; };
    return st;
  }

  adopt(st) {
    for (const k of [...this.bodies.keys()]) this.dropBody(k);
    this.broken = []; this.frozen = []; this.fxList = [];
    for (const d of Object.values(this.dyn)) d.count = 0;
    if (this.lightMesh) { this.root.remove(this.lightMesh); this.lightMesh.geometry.dispose(); this.lightMesh = null; }
    this.items = st.items; this.byChunk = st.byChunk; this.byD = st.byD; this.vents = st.vents; this.add = st.add;
  }

  *prepareSteps(st) {
    const plan = st.plan;
    if (!plan || plan.style === 'none') return;
    const H = (x, z) => this.city.V.heightAt(x, z), R = rng(1234), add = st.add;
    const S = plan.skeleton;
    const sigNodes = new Set();
    let mark = 0;
    for (const r of plan.roads) {
      if (st.items.length - mark > 900) { mark = st.items.length; yield; }
      if (r.elevated || r.tunnel || r.type !== 'street') continue;
      const hw = r.width / 2, P = r.pts, Sx = r.s;
      const at = (s) => { let i = 0; while (i < Sx.length - 2 && Sx[i + 1] < s) i++; const t = (s - Sx[i]) / Math.max(1e-6, Sx[i + 1] - Sx[i]); const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return { x: a[0] + dx * t, z: a[1] + dz * t, tx: dx / l, tz: dz / l }; };
      const avenue = r.cat === 'avenue' || r.cat === 'main' || r.cat === 'broadway' || r.cat === 'boulevard';
      for (const [s0, s1] of r.segs) {
        if (s1 - s0 < 10) continue;
        for (let s = s0 + 12; s < s1 - 6; s += 32) for (const side of [-1, 1]) { const p = at(s), off = hw + 0.6; add(plan.style === 'frontier' ? 'hitch' : 'lamp', p.x + p.tz * off * side, p.z - p.tx * off * side, Math.atan2(p.tz * side, -p.tx * side) + Math.PI / 2); }
        for (const side of [-1, 1]) {
          const off = hw + 1.2;
          for (let s = s0 + 3; s < s1 - 3; s += 7 + R() * 11) {
            const p = at(s), x = p.x + p.tz * off * side, z = p.z - p.tx * off * side, yaw = Math.atan2(p.tz * side, -p.tx * side);
            const near = Math.min(s - s0, s1 - s), q = R();
            if (near < 6) { if (q < 0.35) add('trash', x, z, yaw); else if (q < 0.55) add('news', x + p.tx * 1.2, z + p.tz * 1.2, yaw); else if (q < 0.62) add('mailbox', x, z, yaw); continue; }
            if (q < 0.06) add('hydrant', x, z, yaw);
            else if (q < 0.11 && avenue) add('bench', p.x + p.tz * (off + 0.6) * side, p.z - p.tx * (off + 0.6) * side, yaw);
            else if (q < 0.13 && avenue) add('shelter', p.x + p.tz * (off + 1.0) * side, p.z - p.tx * (off + 1.0) * side, yaw);
            else if (q < 0.24 && !avenue && r.district === 'island') add('meter', x - p.tz * 0.6 * side, z + p.tx * 0.6 * side, yaw);
            else if (q < 0.27) add('sign', x, z, yaw);
            else if (q < 0.55 && (!avenue || r.cat === 'main')) add('tree', p.x + p.tz * (off + 0.8) * side, p.z - p.tx * (off + 0.8) * side, R() * 6.28, { s: 0.75 + R() * 0.5, v: Math.floor(R() * 4) });
          }
        }
      }
      for (const sg of r.signals || []) {
        const sig = S.signals[sg.id]; if (!sig || sigNodes.has(sg.id + ':' + r.axis)) continue;
        sigNodes.add(sg.id + ':' + r.axis);
        const p = at(Math.max(0, Math.min(r.len, sg.s))), off = hw + 1.0, along = sg.half + 1.2;
        const side = 1;
        const x = p.x + p.tz * off * side - p.tx * along * side, z = p.z - p.tx * off * side - p.tz * along * side;
        add('signal', x, z, Math.atan2(-p.tz * side, p.tx * side) + Math.PI / 2, { sig: [sig.offset, r.axis === 0 ? 0 : 1, sig.cycle, sig.green] });
        const x2 = p.x - p.tz * off + p.tx * along, z2 = p.z + p.tx * off + p.tz * along;
        add('signal', x2, z2, Math.atan2(p.tz, -p.tx) + Math.PI / 2, { sig: [sig.offset, r.axis === 0 ? 0 : 1, sig.cycle, sig.green] });
      }
    }
    for (const gs of plan.gas || []) for (const [x, y, z, yaw] of gs.pumps || []) add('pump', x, z, yaw, { y });
    for (const p of S.parks) {
      yield;
      const [x0, z0] = p.poly[0], [x1, z1] = p.poly[2];
      const lx = Math.min(x0, x1), hx = Math.max(x0, x1), lz = Math.min(z0, z1), hz = Math.max(z0, z1);
      const centers = [];
      for (let i = 0; i < 70; i++) centers.push([lx + R() * (hx - lx), lz + R() * (hz - lz), 25 + R() * 60]);
      for (let i = 0; i < 4200; i++) {
        if (i % 300 === 299) yield;
        let x, z;
        if (R() < 0.75) { const c = centers[Math.floor(R() * centers.length)], a = R() * 6.283, d = Math.sqrt(R()) * c[2]; x = c[0] + Math.cos(a) * d; z = c[1] + Math.sin(a) * d; }
        else { x = lx + R() * (hx - lx); z = lz + R() * (hz - lz); }
        if (x < lx + 4 || x > hx - 4 || z < lz + 4 || z > hz - 4 || PARK_CLEAR(x, z, S)) continue;
        add('ptree', x, z, R() * 6.28, { s: 0.65 + R() * 0.65, lift: 0, v: Math.floor(R() * 4), far: true });
      }
      for (let i = 0; i < 45; i++) { const x = lx + R() * (hx - lx), z = lz + R() * (hz - lz); if (PARK_CLEAR(x, z, S)) continue; add('rock', x, z, R() * 6.28, { s: 0.8 + R() * 1.6, lift: -0.4, v: Math.floor(R() * 4) }); }
    }
    yield;
    for (const w of S.waterfront) {
      const P = w.poly;
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
        const water = (x, z) => H(x, z) < 1.5;
        for (let s = 1.6; s < L - 1.6; s += 3.2) { const x = a[0] + (b[0] - a[0]) * s / L, z = a[1] + (b[1] - a[1]) * s / L; if (!water(x + nx * 4, z + nz * 4) && !water(x - nx * 4, z - nz * 4)) continue; add('rail', x, z, Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2); }
        for (let s = 10; s < L - 10; s += 22) { const x = a[0] + (b[0] - a[0]) * s / L - nx * 16, z = a[1] + (b[1] - a[1]) * s / L - nz * 16; if (R() < 0.6 && !water(x, z)) add('tree', x, z, R() * 6, { s: 1 + R() * 0.4, lift: 0.05, v: Math.floor(R() * 4), far: true }); }
      }
    }
    yield;
    if (plan.style !== 'frontier' && plan.style !== 'scifi') for (const r of plan.roads) {
      if (r.type !== 'street' || (r.cat !== 'avenue' && r.cat !== 'main' && r.cat !== 'street')) continue;
      for (const [s0, s1] of r.segs) for (let s = s0 + 20; s < s1 - 20; s += 140) { if (R() > 0.35) continue; const P = r.pts, i = Math.min(P.length - 2, Math.floor(s / Math.max(1, r.len) * (P.length - 1))); const a = P[i], b = P[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, off = (R() - 0.5) * r.width * 0.5; const x = a[0] + (b[1] - a[1]) / l * off, z = a[1] - (b[0] - a[0]) / l * off; st.vents.push({ x, z, y: H(x, z) + 0.05, ph: R() * 10 }); }
    }
    for (const j of S.jumps) for (let i = -2; i <= 2; i++) add('cone', j.x + Math.cos(j.yaw) * i * 3 - Math.sin(j.yaw) * (j.l / 2 + 4), j.z - Math.sin(j.yaw) * i * 3 - Math.cos(j.yaw) * (j.l / 2 + 4), 0, { lift: 0.02 });
    for (const site of plan.sites || []) {
      for (let k = 0; k < site.fence.length; k++) { const [x, z, yaw] = site.fence[k]; add('fence', x, z, yaw); }
      for (const [x, z, t] of site.stuff) add(t, x, z, R() * 6.28);
    }
  }

  addLights(list) {
    if (!list.length) return;
    const colors = { necklace: [1, 0.92, 0.75, 0], warn: [1, 0.08, 0.04, 1], runway: [1, 0.95, 0.85, 0], approach: [1, 0.95, 0.8, 0], taxi: [0.1, 0.35, 1, 0], tunnel: [1, 0.9, 0.7, 2], lamp: [1, 0.85, 0.6, 0] };
    const sizes = { necklace: 0.4, warn: 0.7, runway: 0.35, approach: 0.55, taxi: 0.3, tunnel: 0.5, lamp: 0.4 };
    const pts = list.filter((L) => L.kind !== 'lamp');
    for (const L of list) if (L.kind === 'lamp' || !L.kind) this.add && this.add('lamp', L.x, L.z, L.yaw || 0, { y: L.y, fixed: true });
    if (!pts.length) return;
    const geo = new THREE.OctahedronGeometry(1, 0);
    const col = new Float32Array(pts.length * 4);
    pts.forEach((L, i) => { const c = colors[L.kind] || [1, 1, 1, 0]; col.set(c, i * 4); });
    geo.setAttribute('lc', new THREE.InstancedBufferAttribute(col, 4));
    if (!this.lightMat) {
      const m = this.lightMat = new THREE.MeshBasicNodeMaterial();
      const lc = attribute('lc', 'vec4');
      const blink = select(lc.w.equal(1), step(0.5, mod(this.clock.mul(0.9), 1)), float(1));
      const dayK = select(lc.w.equal(1), this.U.night.mul(0.6).add(0.4), select(lc.w.equal(2), float(1), this.U.night.mul(0.95).add(0.05)));
      m.colorNode = lc.xyz.mul(blink.mul(dayK).mul(this.U.lights).mul(1.8).add(0.02));
    }
    const m = this.lightMat;
    const mesh = new THREE.InstancedMesh(geo, m, pts.length);
    const mt = new THREE.Matrix4();
    pts.forEach((L, i) => { const s = sizes[L.kind] || 0.4; mesh.setMatrixAt(i, mt.makeScale(s, s, s).setPosition(L.x, L.y, L.z)); });
    mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = false; mesh.frustumCulled = false;
    this.root.add(mesh);
    this.lightMesh = mesh;
  }

  clearLights() {}

  chunkItems(dk) { return (this.byD.get(dk) || []).filter((it) => !it.broken).map((it) => ({ id: it.id, type: it.type, v: it.v || 0, x: it.x, y: it.y, z: it.z, yaw: it.yaw, s: it.s || 1, sig: it.sig || null })); }

  meshFromBaked(dk, res) {
    if (!res || !res.props) return null;
    const mesh = new THREE.Mesh(pgeo(res.props), this.mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.name = `props_${dk}`;
    if (res.leaves && res.leaves.count) { const lm = new THREE.Mesh(pgeo(res.leaves), this.leafMat); lm.castShadow = true; lm.receiveShadow = true; lm.matrixAutoUpdate = false; mesh.add(lm); mesh.userData.leaves = lm; }
    for (const [id, a, b, c, d] of res.ranges) { const it = this.items[id]; if (!it) continue; it.range = c >= 0 ? [a, b, c, d] : [a, b]; it.dk = dk; }
    this.root.add(mesh);
    for (const [id] of res.ranges) { const it = this.items[id]; if (it && it.broken) { it.range = it.range; this.hideIn(mesh, it); } }
    return mesh;
  }

  hideIn(mesh, it) {
    if (!it.range) return;
    const hide = (geo, a, b) => { const pos = geo.attributes.position; for (let i = a; i < b; i++) pos.setXYZ(i, it.x, -2000, it.z); pos.addUpdateRange(a * 3, (b - a) * 3); pos.needsUpdate = true; };
    hide(mesh.geometry, it.range[0], it.range[1]);
    if (it.range.length > 2 && mesh.userData.leaves) hide(mesh.userData.leaves.geometry, it.range[2], it.range[3]);
    it.range = null;
  }

  farItems(list) { return list.filter((it) => !it.broken).map((it) => ({ x: it.x, y: it.y, z: it.z, yaw: it.yaw, s: (it.s || 1) * (it.type === 'tree' ? 0.65 : 1) })); }

  farFromBaked(res) {
    if (!res || !res.props) return null;
    const mesh = new THREE.Mesh(pgeo(res.props), this.farMat);
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.name = 'props_far';
    this.root.add(mesh);
    return mesh;
  }

  bakeFarTrees(list) {
    const G = new PGeo();
    for (const it of list) if (!it.broken) G.add(this.kit('ftree'), it.x, it.y, it.z, it.yaw, (it.s || 1) * (it.type === 'tree' ? 0.65 : 1), null);
    if (!G.nv) return null;
    const mesh = new THREE.Mesh(pgeo(G.out()), this.farMat);
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.name = 'props_far';
    this.root.add(mesh);
    return mesh;
  }

  hideBaked(it) {
    const d = this.city.details.get(it.dk);
    if (!d || !d.props || !it.range) return;
    this.hideIn(d.props, it);
  }

  dynFor(type) {
    if (this.dyn[type]) return this.dyn[type];
    const K = this.kit(type), G = new PGeo(); G.add(K, 0, 0, 0, 0, 1, null);
    const mesh = new THREE.InstancedMesh(pgeo(G.out()), this.mat, 64);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    this.root.add(mesh);
    return (this.dyn[type] = mesh);
  }

  bodyFor(it) {
    const R = this.g.R, world = this.g.phys.world, d = TYPES[it.type] || TYPES.bench, sc = it.s || 1;
    const loose = d.breakV === 0;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw);
    const bd = (loose ? R.RigidBodyDesc.dynamic().setCanSleep(true).setSleeping(true).setLinearDamping(0.1).setAngularDamping(0.4) : R.RigidBodyDesc.fixed()).setTranslation(it.x, it.y + d.hy * sc, it.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    const body = world.createRigidBody(bd);
    const cd = d.shape === 'cyl' ? R.ColliderDesc.cylinder(d.hy * sc, d.hx * sc) : R.ColliderDesc.cuboid(d.hx * sc, d.hy * sc, (d.hz || d.hx) * sc);
    const col = world.createCollider(cd.setMass(d.mass * sc * sc * sc).setFriction(0.6).setRestitution(0.15).setCollisionGroups(groups(GROUP.PROP, 0xffff)), body);
    col.userData = { kind: 'prop', type: it.type, city: true, tag: d.shape === 'cyl' && d.hy > 1 ? 'pole' : 'prop', r: d.hx };
    const rec = { it, body, col, loose, mass: d.mass, home: { x: it.x, y: it.y + d.hy * sc, z: it.z }, def: d };
    if (loose) this.g.phys.props.push(rec);
    return rec;
  }

  dropBody(id) {
    const b = this.bodies.get(id); if (!b) return;
    this.g.phys.world.removeRigidBody(b.body);
    const i = this.g.phys.props.indexOf(b); if (i >= 0) this.g.phys.props.splice(i, 1);
    this.bodies.delete(id);
  }

  markBroken(rec, vel) {
    const it = rec.it;
    if (it.broken) return;
    it.broken = true; this.broken.push(rec); this.hideBaked(it);
    this.onBreak(rec, vel || { x: 0, y: 0, z: 0 });
  }

  breakLoose(rec, vel) {
    const R = this.g.R;
    if (!rec.loose) { rec.body.setBodyType(R.RigidBodyType.Dynamic, true); rec.loose = true; this.g.phys.props.push(rec); }
    rec.body.wakeUp();
    this.markBroken(rec, vel);
  }

  onBreak(rec, vel) {
    const fx = this.g.fx, it = rec.it, p = rec.body.translation();
    if (!fx) return;
    const V = THREE.Vector3;
    if (it.type === 'hydrant') this.fxList.push({ kind: 'water', x: it.x, y: it.y, z: it.z, t: 0, life: 24 });
    else if (it.type === 'pump') { this.fxList.push({ kind: 'fire', x: it.x, y: it.y, z: it.z, t: 0, life: 14 }); fx.dustBurst(new V(p.x, p.y, p.z), 26, 3); }
    else if (it.type === 'shelter') { for (let k = 0; k < 40; k++) fx.add.spawn(p.x + (Math.random() - 0.5) * 4, p.y + Math.random() * 2, p.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 6 + vel.x * 0.3, Math.random() * 4, (Math.random() - 0.5) * 6 + vel.z * 0.3, 0.8 + Math.random(), 0.06, 0.03, 1.6, 1.8, 2, 0.8, 0.8, -9.81); }
    else if (it.type === 'lamp' || it.type === 'signal' || it.type === 'sign' || it.type === 'meter') fx.sparks(new V(it.x, it.y + 0.3, it.z), new V(vel.x, 0, vel.z), new V(0, 1, 0), 18);
    else if (it.type === 'tree' || it.type === 'ptree') { for (let k = 0; k < 30; k++) fx.alpha.spawn(p.x + (Math.random() - 0.5) * 4, p.y + 3 + Math.random() * 3, p.z + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3 + vel.x * 0.2, Math.random() * 2, (Math.random() - 0.5) * 3 + vel.z * 0.2, 2 + Math.random() * 2, 0.3, 0.6, 0.18, 0.28, 0.08, 0.9, 1.5, -2); }
  }

  preStep(dt, cars) {
    if (!this.items.length) return;
    for (const c of cars) {
      const s = c.sim; if (!s.enabled) continue;
      const p = s.pos, v = s.vel, sp = Math.hypot(v.x, v.y, v.z);
      if (sp < 2.5) continue;
      const look = 0.12, ex = p.x + v.x * look, ez = p.z + v.z * look;
      for (const rec of this.bodies.values()) {
        if (rec.loose) continue;
        const it = rec.it, d = rec.def;
        const dx = it.x - p.x, dz = it.z - p.z;
        if (dx * dx + dz * dz > 400) continue;
        const sx = ex - p.x, sz = ez - p.z, l2 = sx * sx + sz * sz || 1, t = Math.max(0, Math.min(1, (dx * sx + dz * sz) / l2));
        const cx = p.x + sx * t - it.x, cz = p.z + sz * t - it.z;
        if (cx * cx + cz * cz > (2.6 + d.hx) ** 2) continue;
        if (Math.abs(p.y - (it.y + d.hy)) > d.hy + 2) continue;
        if (sp > d.breakV) this.breakLoose(rec, v);
      }
    }
    for (const rec of this.bodies.values()) {
      if (!rec.loose || rec.it.broken) continue;
      const t = rec.body.translation();
      if (Math.hypot(t.x - rec.home.x, t.y - rec.home.y, t.z - rec.home.z) > 0.25) this.markBroken(rec, null);
    }
  }

  streamBodies() {
    const A = this.city.colAnchors(), RR = 70, R2 = RR * RR;
    const want = new Set();
    for (let a = 0; a < A.length; a += 2) {
      const x = A[a], z = A[a + 1];
      for (let kz = Math.floor((z - RR + 8192) / 256); kz <= Math.floor((z + RR + 8192) / 256); kz++) for (let kx = Math.floor((x - RR + 8192) / 256); kx <= Math.floor((x + RR + 8192) / 256); kx++) {
        const list = this.byChunk.get(kz * 64 + kx); if (!list) continue;
        for (const it of list) { if (it.broken) continue; const dx = it.x - x, dz = it.z - z; if (dx * dx + dz * dz < R2) want.add(it.id); }
      }
    }
    let made = 0;
    for (const id of want) { if (this.bodies.has(id) || made > 60) continue; this.bodies.set(id, this.bodyFor(this.items[id])); made++; }
    for (const [id, rec] of this.bodies) { if (want.has(id) || rec.it.broken) continue; this.dropBody(id); }
    for (let i = this.broken.length - 1; i >= 0; i--) {
      const rec = this.broken[i], t = rec.body.translation();
      let near = false; for (let a = 0; a < A.length; a += 2) if (Math.hypot(t.x - A[a], t.z - A[a + 1]) < 400) { near = true; break; }
      if (!near || t.y < -50) { const q = rec.body.rotation(); rec.it.frozen = { x: t.x, y: t.y, z: t.z, q: [q.x, q.y, q.z, q.w] }; this.dropBody(rec.it.id); this.broken.splice(i, 1); this.frozen.push(rec.it); }
    }
  }

  update(dt, cam) {
    this.clock.value = (Date.now() / 1000) % 64000;
    this.cam.value.copy(cam.position);
    const car = this.g.car && this.g.car.sim;
    if (car && car.thrusters) { const p = car.pos, B = this.blast.value, f = Math.min(1, car.thrusters.totalForce.len() / 30000); B.set(p.x, p.y, p.z, B.w + (f - B.w) * Math.min(1, dt * 4)); }
    if (!this.items.length) return;
    this.streamBodies();
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), d = new THREE.Vector3(), cp = cam.position;
    const counts = {};
    const put = (it, x, y, z, qq) => { const M = this.dynFor(it.type); const n = counts[it.type] || 0; if (n >= 64) return; const sc = it.s || 1; mt.compose(p.set(x, y, z), qq, s.set(sc, sc, sc)); M.setMatrixAt(n, mt); counts[it.type] = n + 1; };
    for (const rec of this.broken) { const t = rec.body.translation(), r = rec.body.rotation(), hy = rec.def.hy * (rec.it.s || 1); q.set(r.x, r.y, r.z, r.w); d.set(0, -hy, 0).applyQuaternion(q); put(rec.it, t.x + d.x, t.y + d.y, t.z + d.z, q); }
    for (const it of this.frozen) { const f = it.frozen; if (Math.hypot(f.x - cp.x, f.z - cp.z) > 300) continue; q.set(...f.q); const hy = (TYPES[it.type] || TYPES.bench).hy * (it.s || 1); d.set(0, -hy, 0).applyQuaternion(q); put(it, f.x + d.x, f.y + d.y, f.z + d.z, q); }
    for (const t in this.dyn) { const M = this.dyn[t]; M.count = counts[t] || 0; M.visible = M.count > 0; if (M.count) M.instanceMatrix.needsUpdate = true; }
    const fx = this.g.fx;
    if (fx && this.vents && this.city.style !== 'ruins') {
      this.ventT = (this.ventT || 0) + dt;
      const B = this.blast.value;
      for (const v of this.vents) {
        const d = Math.hypot(v.x - cp.x, v.z - cp.z); if (d > 160) continue;
        const near = B.w > 0.2 && Math.hypot(v.x - B.x, v.z - B.z) < 14 && B.y - v.y < 12;
        if (Math.random() < dt * (near ? 30 : 2.2)) fx.alpha.spawn(v.x + (Math.random() - 0.5) * 0.6, v.y + 0.2, v.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.2 + (near ? 4 : 0), (Math.random() - 0.5) * 0.6, 3 + Math.random() * 2, 0.6, 3.5, 0.92, 0.92, 0.92, 0.32, 0.4, 0.6);
      }
      if (B.w > 0.25 && car && car.pos.y - this.city.V.heightAt(car.pos.x, car.pos.z) < 10 && this.city.rasterAt(car.pos.x, car.pos.z)) {
        const n = Math.min(4, Math.floor(B.w * 6 * dt * 60 * 0.2) + (Math.random() < B.w ? 1 : 0));
        for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, r = 2 + Math.random() * 7, x = B.x + Math.cos(a) * r, z = B.z + Math.sin(a) * r, g = this.city.V.heightAt(x, z) + 0.2, c = Math.random() < 0.5 ? [0.8, 0.78, 0.72] : [0.35, 0.28, 0.16]; fx.alpha.spawn(x, g, z, Math.cos(a) * (3 + Math.random() * 5), 1 + Math.random() * 3, Math.sin(a) * (3 + Math.random() * 5), 1.2 + Math.random(), 0.14, 0.1, c[0], c[1], c[2], 0.95, 0.6, -2.5); }
      }
    }
    for (let i = this.fxList.length - 1; i >= 0; i--) {
      const F = this.fxList[i]; F.t += dt; if (F.t > F.life) { this.fxList.splice(i, 1); continue; }
      if (!fx || Math.hypot(F.x - cp.x, F.z - cp.z) > 250) continue;
      const k = Math.min(1, (F.life - F.t) / 4);
      if (F.kind === 'water') for (let n = 0; n < 3; n++) fx.alpha.spawn(F.x + (Math.random() - 0.5) * 0.3, F.y + 0.6, F.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 1.6, 8 + Math.random() * 4 * k, (Math.random() - 0.5) * 1.6, 1.7, 0.18, 1.1, 0.82, 0.88, 0.95, 0.55 * k, 0.2, -9.81);
      if (F.kind === 'fire') { for (let n = 0; n < 2; n++) fx.add.spawn(F.x + (Math.random() - 0.5) * 1.2, F.y + 0.5 + Math.random(), F.z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5), 2 + Math.random() * 3, (Math.random() - 0.5), 0.7, 0.8, 0.2, 4, 1.4, 0.3, k, 1.2, 1.5); fx.alpha.spawn(F.x, F.y + 2.5, F.z, (Math.random() - 0.5), 2.5, (Math.random() - 0.5), 4, 1, 4, 0.08, 0.08, 0.08, 0.5 * k, 0.6, 0.8); }
    }
  }
}

function PARK_CLEAR(x, z, S) {
  for (const t of [4760, 5560]) if (Math.abs(z - t) < 16) return true;
  for (const P of PONDS) if (((x - P.x) / P.rx) ** 2 + ((z - P.z) / P.rz) ** 2 < 1.25) return true;
  const D = PARK_DRIVE, loop = Math.abs(Math.hypot((x - D.x) / D.rx, (z - D.z) / D.rz) - 1) * D.rx;
  if (loop < 10) return true;
  if (S && S.parkPaths) for (const pp of S.parkPaths) for (let i = 0; i < pp.length; i += 2) if (Math.abs(pp[i][0] - x) < 5 && Math.abs(pp[i][1] - z) < 5) return true;
  return false;
}

function pgeo(o) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(o.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(o.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(o.color, 3));
  g.setAttribute('emit', new THREE.BufferAttribute(o.emit, 1));
  g.setAttribute('lamp', new THREE.BufferAttribute(o.lamp, 1));
  g.setAttribute('sig', new THREE.BufferAttribute(o.sig, 4));
  g.setIndex(new THREE.BufferAttribute(o.index, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
