// Roadster 88 test plate visuals: procedural concrete ground with grid, zone tints and lane lines, course geometry, instanced light props, painted markers, speed gates and the horizon hills.
import * as THREE from 'three/webgpu';
import { vec3, float, positionWorld, positionLocal, fwidth, fract, abs, smoothstep, mix, max, step, mx_noise_float, mx_fractal_noise_float, bumpMap, length, sin, normalWorld, clamp, attribute } from 'three/tsl';
import { groundRects } from '../sim/layout.js';

const aaLine = (coord, period, width) => {
  const d = abs(fract(coord.div(period).add(0.5)).sub(0.5)).mul(period);
  const aa = fwidth(coord).max(1e-4);
  const cov = clamp(float(width).div(aa), 0, 1);
  return float(1).sub(smoothstep(float(width).mul(0.5).sub(aa.mul(0.5)), float(width).mul(0.5).add(aa.mul(0.5)), d)).mul(cov.mul(0.7).add(0.3));
};

const rectMask = (p, r, soft) => {
  const ix = smoothstep(r[0] - soft, r[0] + soft, p.x).mul(float(1).sub(smoothstep(r[2] - soft, r[2] + soft, p.x)));
  const iz = smoothstep(r[1] - soft, r[1] + soft, p.y).mul(float(1).sub(smoothstep(r[3] - soft, r[3] + soft, p.y)));
  return ix.mul(iz);
};

function groundMaterial(L) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.86, metalness: 0 });
  const p = positionWorld.xz;
  const big = mx_fractal_noise_float(vec3(p.mul(0.021), 0.0), 3, 2.0, 0.5);
  const mid = mx_noise_float(vec3(p.mul(0.23), 3.1));
  const fine = mx_noise_float(vec3(p.mul(3.7), 7.7));
  let base = mix(float(0.22), float(0.31), big.mul(0.5).add(0.5)).mul(float(1).add(mid.mul(0.05)).add(fine.mul(0.035)));
  const joints = max(aaLine(p.x, 6, 0.018), aaLine(p.y, 6, 0.018));
  base = base.mul(float(1).sub(joints.mul(0.32)));
  let col = vec3(base, base.mul(0.995), base.mul(0.975));
  for (const z of L.zones) col = mix(col, vec3(...z.color).mul(base.mul(2.1)), rectMask(p, z.rect, 0.04).mul(z.a));
  const g1 = max(aaLine(p.x, 1, 0.012), aaLine(p.y, 1, 0.012)).mul(0.07);
  const g10 = max(aaLine(p.x, 10, 0.05), aaLine(p.y, 10, 0.05)).mul(0.16);
  col = col.mul(float(1).sub(max(g1, g10)));
  const st = rectMask(p, [-14, -1080, 14, 1080], 0.02);
  const edge = max(aaLine(p.x.sub(12), 1e6, 0.22), aaLine(p.x.add(12), 1e6, 0.22));
  const dash = step(0.62, fract(p.y.div(9))).oneMinus();
  const centre = aaLine(p.x, 1e6, 0.16).mul(dash);
  const ticks = aaLine(p.y.add(1000), 100, 0.4).mul(step(abs(p.x), 12.0));
  const paint = max(max(edge, centre), ticks).mul(st);
  col = mix(col, vec3(0.86, 0.86, 0.84), paint.mul(0.92));
  m.colorNode = col;
  m.roughnessNode = mix(float(0.92), float(0.72), big.mul(0.5).add(0.5)).sub(paint.mul(0.25)).add(fine.mul(0.04));
  m.normalNode = bumpMap(fine.mul(0.5).add(mid.mul(0.5)).mul(0.6));
  return m;
}

function concrete(tint = [0.72, 0.71, 0.68], rough = 0.9, useAttr = false) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: rough, metalness: 0 });
  const p = positionWorld;
  const n = mx_fractal_noise_float(p.mul(0.6), 2, 2.0, 0.5);
  const f = mx_noise_float(p.mul(6.0));
  const k = float(1).add(n.mul(0.08)).add(f.mul(0.03));
  m.colorNode = (useAttr ? attribute('tint', 'vec3') : vec3(...tint)).mul(k);
  m.roughnessNode = float(rough).add(f.mul(0.05));
  m.normalNode = bumpMap(f.mul(0.25));
  return m;
}

function hazardConcrete(tint) {
  const m = concrete(tint, 0.88);
  const base = m.colorNode;
  const y = positionWorld.y;
  const diag = fract(positionWorld.x.add(positionWorld.z).add(y).mul(0.9));
  const band = step(y, 0.5).mul(step(0.05, y));
  const stripe = step(0.5, diag);
  m.colorNode = mix(base, mix(vec3(0.05, 0.05, 0.05), vec3(0.95, 0.68, 0.08), stripe), band);
  return m;
}

function rampMaterial() {
  const m = concrete([0.74, 0.72, 0.68], 0.82);
  const base = m.colorNode;
  const up = normalWorld.y;
  const chev = fract(positionWorld.z.mul(0.25).add(abs(fract(positionWorld.x.mul(0.125)).sub(0.5)).mul(2.0)));
  const slope = float(1).sub(smoothstep(0.9, 0.995, up)).mul(step(0.3, up));
  m.colorNode = mix(base, vec3(0.92, 0.62, 0.1), step(0.72, chev).mul(slope).mul(0.85));
  return m;
}

function padMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
  const lp = positionLocal.xz;
  const r = length(lp);
  const n = mx_noise_float(positionWorld.mul(2.0));
  const ring = float(1).sub(smoothstep(0.0, 0.25, abs(r.sub(6.0)))).add(float(1).sub(smoothstep(0.0, 0.2, abs(r.sub(6.8)))));
  const hbar = step(abs(lp.x), 2.4).mul(step(abs(lp.y), 0.35)).add(step(abs(lp.x.sub(2.4)), 0.35).mul(step(abs(lp.y), 3.0))).add(step(abs(lp.x.add(2.4)), 0.35).mul(step(abs(lp.y), 3.0)));
  const mark = clamp(ring.add(hbar), 0, 1);
  m.colorNode = mix(vec3(0.16, 0.165, 0.17).mul(float(1).add(n.mul(0.1))), vec3(0.92, 0.92, 0.9), mark);
  m.roughnessNode = mix(float(0.85), float(0.6), mark);
  return m;
}

function containerMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.35 });
  const c = positionWorld.x.add(positionWorld.z).mul(9.0);
  const rib = sin(c).mul(0.5).add(0.5);
  const n = mx_noise_float(positionWorld.mul(1.3));
  m.colorNode = attribute('tint', 'vec3').mul(float(0.9).add(rib.mul(0.12)).add(n.mul(0.06)));
  m.normalNode = bumpMap(rib.mul(0.03));
  return m;
}

function textAtlas(items) {
  const cell = 256, cols = 16, rows = Math.ceil(items.length / cols);
  const c = document.createElement('canvas'); c.width = cell * cols; c.height = cell * Math.max(1, rows);
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  items.forEach((it, i) => {
    const x = (i % cols) * cell + cell / 2, y = Math.floor(i / cols) * cell + cell / 2;
    let fs = 170; g.font = `700 ${fs}px "SF Pro Display", -apple-system, "Helvetica Neue", Arial, sans-serif`;
    while (g.measureText(it.text).width > cell * 0.94 && fs > 30) { fs -= 8; g.font = `700 ${fs}px "SF Pro Display", -apple-system, "Helvetica Neue", Arial, sans-serif`; }
    g.fillText(it.text, x, y + 6);
    it.uv = [(i % cols) / cols, 1 - (Math.floor(i / cols) + 1) / Math.max(1, rows), 1 / cols, 1 / Math.max(1, rows)];
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function propGeometries() {
  const cone = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.2, 0), new THREE.Vector2(0.2, 0.03), new THREE.Vector2(0.15, 0.04), new THREE.Vector2(0.03, 0.7), new THREE.Vector2(0, 0.7)], 20);
  const base = new THREE.BoxGeometry(0.38, 0.03, 0.38); base.translate(0, 0.015, 0);
  const coneG = mergeGeoms([cone, base]); coneG.translate(0, -0.35, 0);
  const barrel = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 24, 8);
  const pos = barrel.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const r = Math.hypot(pos.getX(i), pos.getZ(i)); if (r > 0.1) { const k = 1 + 0.025 * (Math.abs(Math.abs(y) - 0.15) < 0.05 ? 1 : 0); pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); } }
  barrel.computeVertexNormals();
  const parts = [];
  for (const z of [-0.45, 0, 0.45]) { const b = new THREE.BoxGeometry(1.2, 0.022, 0.1); b.translate(0, 0.061, z); parts.push(b); }
  for (const x of [-0.55, 0, 0.55]) { const b = new THREE.BoxGeometry(0.1, 0.1, 1.0); b.translate(x, 0, 0); parts.push(b); }
  for (const z of [-0.45, -0.22, 0, 0.22, 0.45]) { const b = new THREE.BoxGeometry(1.2, 0.022, 0.09); b.translate(0, 0.061 - 0.122 + 0.011, z); parts.push(b); }
  const pallet = mergeGeoms(parts);
  return { cone: coneG, barrel, pallet };
}

export function mergeGeoms(geoms) {
  const out = new THREE.BufferGeometry();
  const pos = [], nor = [], uv = [], idx = [];
  let off = 0;
  for (const g of geoms) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i)); else nor.push(0, 1, 0); if (u) uv.push(u.getX(i), u.getY(i)); else uv.push(0, 0); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

export class PlateView {
  constructor(gfx, L, sky) {
    this.gfx = gfx; this.L = L;
    const scene = gfx.scene;
    const root = new THREE.Group(); root.name = 'Plate';
    scene.add(root); this.root = root;
    const stat = new THREE.BundleGroup(); stat.name = 'PlateStatic'; stat.static = true;
    root.add(stat); this.stat = stat;
    const envRoot = new THREE.Group();
    sky.addEnvProxy(envRoot);
    const gmat = groundMaterial(L);
    const gparts = [];
    for (const [x0, z0, x1, z1] of groundRects(L)) {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      gparts.push(g);
    }
    const ground = new THREE.Mesh(mergeGeoms(gparts), gmat); ground.receiveShadow = true; ground.userData.k = 'ground';
    stat.add(ground);
    const envGround = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55565a, roughness: 0.9 }));
    envRoot.add(envGround);
    const TINT = {
      concrete: [0.72, 0.71, 0.68], ravine: [0.42, 0.41, 0.39], tower: [0.68, 0.67, 0.65], loop: [0.7, 0.71, 0.72], loop_shell: [0.55, 0.55, 0.56], halfpipe: [0.62, 0.66, 0.68], bank: [0.6, 0.63, 0.62], barrier: [0.85, 0.85, 0.84],
      container_a: [0.13, 0.3, 0.5], container_b: [0.72, 0.73, 0.74],
    };
    const family = (mk, kind) => (mk.startsWith('container') ? 'container' : mk === 'wall' || mk === 'ramp' || mk === 'pole' || mk === 'pad' ? mk : kind === 'mesh' ? 'concrete2s' : 'concrete');
    const mats = {
      concrete: concrete(null, 0.88, true), concrete2s: concrete(null, 0.75, true), wall: hazardConcrete([0.74, 0.73, 0.7]), ramp: rampMaterial(), container: containerMaterial(),
      pole: (() => { const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.9 }); m.colorNode = mix(vec3(0.6, 0.61, 0.62), vec3(0.95, 0.7, 0.1), step(0.5, fract(positionWorld.y.mul(1.2))).mul(step(positionWorld.y, 2.0))); return m; })(),
      pad: padMaterial(),
    };
    mats.concrete2s.side = THREE.DoubleSide;
    const envMat = new THREE.MeshStandardMaterial({ color: 0x9a9894, roughness: 0.9 });
    const byMat = new Map(), envParts = [], pads = [];
    const tmp = new THREE.Object3D();
    for (const s of L.statics) {
      let geo;
      if (s.kind === 'box') geo = new THREE.BoxGeometry(s.half[0] * 2, s.half[1] * 2, s.half[2] * 2);
      else if (s.kind === 'cyl') geo = new THREE.CylinderGeometry(s.r, s.r, s.h, s.r > 0.5 ? 28 : 12);
      else if (s.kind === 'hull') geo = wedgeGeometry(s.points);
      else if (s.kind === 'mesh') { geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(s.positions, 3)); geo.setIndex(s.indices); geo.computeVertexNormals(); }
      if (s.mat === 'pad') { const m = new THREE.Mesh(geo, mats.pad); m.position.set(...s.pos); m.castShadow = true; m.receiveShadow = true; pads.push(m); stat.add(m); continue; }
      if (s.kind === 'box' || s.kind === 'cyl') { tmp.position.set(...s.pos); tmp.rotation.set(0, s.rotY || 0, 0); tmp.updateMatrix(); geo.applyMatrix4(tmp.matrix); }
      const fam = family(s.mat, s.kind);
      if (!byMat.has(fam)) byMat.set(fam, []);
      const t = TINT[s.mat] || TINT.concrete;
      byMat.get(fam).push({ geo, t });
      if (s.kind !== 'mesh' || s.collide) envParts.push(geo);
    }
    for (const [fam, list] of byMat) {
      const g = mergeGeoms(list.map((x) => x.geo));
      const tint = new Float32Array(g.attributes.position.count * 3);
      let o = 0;
      for (const x of list) { const n = x.geo.index ? x.geo.attributes.position.count : x.geo.attributes.position.count; for (let i = 0; i < n; i++) { tint[o++] = x.t[0]; tint[o++] = x.t[1]; tint[o++] = x.t[2]; } }
      g.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
      const mesh = new THREE.Mesh(g, mats[fam]);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.k = 'static_' + fam;
      stat.add(mesh);
    }
    for (const p of pads) envParts.push(p.geometry.clone().translate(p.position.x, p.position.y, p.position.z));
    envRoot.add(new THREE.Mesh(mergeGeoms(envParts), envMat));
    this.buildMarkers(L, stat);
    this.buildGates(L, stat, envRoot);
    this.buildHorizon(stat, envRoot);
    this.props = this.buildProps(L, root);
  }

  buildMarkers(L, root) {
    const items = L.markers.map((m) => ({ ...m }));
    const tex = textAtlas(items);
    const pos = [], uv = [], idx = [];
    items.forEach((it, i) => {
      const s = it.size, cx = it.pos[0], cz = it.pos[1];
      const w = s, h = s;
      const c = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
      const [u0, v0, du, dv] = it.uv;
      const uvs = [[u0, v0], [u0 + du, v0], [u0 + du, v0 + dv], [u0, v0 + dv]];
      for (let k = 0; k < 4; k++) { pos.push(cx - c[k][0], 0.012, cz - c[k][1]); uv.push(uvs[k][0], uvs[k][1]); }
      const o = i * 4; idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, color: 0xf2f2ee, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.renderOrder = 1; mesh.userData.k = 'markers';
    root.add(mesh);
  }

  buildGates(L, root, envRoot) {
    const parts = [];
    for (const gt of L.gates) {
      const w = gt.width;
      for (const sx of [-1, 1]) { const b = new THREE.BoxGeometry(0.35, 6, 0.35); b.translate(sx * w / 2, 3, gt.z); parts.push(b); }
      const top = new THREE.BoxGeometry(w + 0.35, 0.5, 0.5); top.translate(0, 6.1, gt.z); parts.push(top);
    }
    const geo = mergeGeoms(parts);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.4, metalness: 0.8 });
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; root.add(mesh);
    const strip = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 2.2 });
    const lights = [];
    for (const gt of L.gates) { const b = new THREE.BoxGeometry(gt.width - 1, 0.06, 0.04); b.translate(0, 5.86, gt.z - 0.26); lights.push(b); }
    root.add(new THREE.Mesh(mergeGeoms(lights), strip));
    envRoot.add(new THREE.Mesh(geo, mat));
  }

  buildHorizon(root, envRoot) {
    const segs = 220, rings = 10, r0 = 1600, r1 = 8500;
    const pos = [], idx = [];
    const noise = (a, k) => Math.sin(a * 3 + k) * 0.5 + Math.sin(a * 7.3 + k * 2.1) * 0.3 + Math.sin(a * 17.1 + k * 0.7) * 0.2;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings, r = r0 + (r1 - r0) * Math.pow(t, 1.6);
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const hill = Math.max(0, noise(a, 1.3)) * 260 * Math.pow(t, 1.2) + Math.max(0, noise(a * 2, 4.1)) * 120 * t;
        pos.push(Math.cos(a) * r, -0.32 + hill * THREE.MathUtils.smoothstep(t, 0.15, 0.9) - 0.4 * (1 - t), Math.sin(a) * r);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * (segs + 1) + j, b = a + 1, c = a + segs + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    const n = mx_fractal_noise_float(positionWorld.mul(0.004), 4, 2, 0.5);
    const n2 = mx_noise_float(positionWorld.mul(0.05));
    const trees = smoothstep(0.35, 0.6, mx_noise_float(positionWorld.mul(0.012).add(vec3(3, 0, 1))));
    m.colorNode = mix(mix(vec3(0.42, 0.33, 0.19), vec3(0.6, 0.48, 0.28), n.mul(0.5).add(0.5)).mul(float(1).add(n2.mul(0.1))), vec3(0.1, 0.12, 0.06), trees.mul(0.75));
    const ring = new THREE.Mesh(g, m); ring.receiveShadow = false; ring.userData.k = 'horizon'; root.add(ring);
    const apron = new THREE.RingGeometry(0, 1700, 64, 1).rotateX(-Math.PI / 2);
    const am = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    const an = mx_fractal_noise_float(positionWorld.mul(0.02), 3, 2, 0.5);
    am.colorNode = mix(vec3(0.36, 0.3, 0.2), vec3(0.5, 0.42, 0.27), an.mul(0.5).add(0.5));
    const apronMesh = new THREE.Mesh(apron, am); apronMesh.userData.k = 'apron'; apronMesh.position.y = -0.3; root.add(apronMesh);
    envRoot.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6b5a3c, roughness: 1 })));
  }

  buildProps(L, root) {
    const geos = propGeometries();
    const coneMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
    const yl = positionLocal.y;
    const band = step(-0.02, yl).mul(step(yl, 0.08)).add(step(0.14, yl).mul(step(yl, 0.2)));
    coneMat.colorNode = mix(vec3(1.0, 0.33, 0.04), vec3(0.95, 0.95, 0.95), band);
    const barrelMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.42, metalness: 0.4 });
    barrelMat.colorNode = mix(vec3(0.08, 0.24, 0.55), vec3(0.9, 0.9, 0.88), step(abs(positionLocal.y), 0.07));
    const palletMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92 });
    palletMat.colorNode = vec3(0.58, 0.44, 0.27).mul(float(0.85).add(mx_noise_float(positionLocal.mul(vec3(2, 40, 2))).mul(0.15)));
    const types = { cone: [geos.cone, coneMat], barrel: [geos.barrel, barrelMat], pallet: [geos.pallet, palletMat] };
    const out = {};
    for (const t in types) {
      const list = L.props.filter((p) => p.type === t);
      const im = new THREE.InstancedMesh(types[t][0], types[t][1], Math.max(1, list.length));
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.userData.k = 'props';
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(im);
      out[t] = im;
    }
    return out;
  }

  syncProps(world) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const counters = { cone: 0, barrel: 0, pallet: 0 };
    const dirty = { cone: false, barrel: false, pallet: false };
    for (const pr of world.props) {
      const im = this.props[pr.type]; const i = counters[pr.type]++;
      if (pr.synced && pr.body.isSleeping()) continue;
      const t = pr.body.translation(), r = pr.body.rotation();
      p.set(t.x, t.y, t.z); q.set(r.x, r.y, r.z, r.w);
      m.compose(p, q, s); im.setMatrixAt(i, m); dirty[pr.type] = true; pr.synced = true;
    }
    for (const t in dirty) if (dirty[t]) this.props[t].instanceMatrix.needsUpdate = true;
  }
}

function wedgeGeometry(points) {
  const [a, b, c, d, e, f] = points.map((p) => new THREE.Vector3(...p));
  const tris = [[a, c, b], [b, c, d], [a, e, c], [b, d, f], [c, e, f], [c, f, d], [a, b, f], [a, f, e]];
  const pos = [];
  for (const t of tris) for (const v of t) pos.push(v.x, v.y, v.z);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const n = g.attributes.normal, cen = new THREE.Vector3();
  for (const p of points) cen.add(new THREE.Vector3(...p)); cen.divideScalar(points.length);
  const pp = g.attributes.position;
  for (let i = 0; i < pp.count; i += 3) {
    const v = new THREE.Vector3(pp.getX(i), pp.getY(i), pp.getZ(i)), nn = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
    if (nn.dot(v.sub(cen)) < 0) { for (let k = 0; k < 3; k++) { const x = pp.getX(i + 1), y = pp.getY(i + 1), z = pp.getZ(i + 1); pp.setXYZ(i + 1, pp.getX(i + 2), pp.getY(i + 2), pp.getZ(i + 2)); pp.setXYZ(i + 2, x, y, z); break; } }
  }
  g.computeVertexNormals();
  return g;
}
