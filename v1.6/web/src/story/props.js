// Roadster 88 story props: procedural set pieces the story places in the valley (Ida's workshop and its Kessler twin, the 1885 forge, the Kessler statue, billboards, the Kessler tower and patrol drones), each with simple static colliders, shown and hidden per timeline.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GROUP, groups } from '../sim/car.js';

const M = (color, rough = 0.8, metal = 0, emissive = 0x000000, ei = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei });

function sign(lines, w = 1024, h = 256, bg = '#16181c', fg = '#f2efe6', accent = '#ffb648') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = accent; g.fillRect(0, h - 10, w, 10);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    g.fillStyle = i === 0 ? fg : accent;
    g.font = `${i === 0 ? 700 : 500} ${i === 0 ? Math.round(h * 0.36) : Math.round(h * 0.16)}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText(l, w / 2, lines.length === 1 ? h / 2 : h * (i === 0 ? 0.4 : 0.76));
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25 });
}

export class Props {
  constructor(game) {
    this.g = game; this.sets = new Map(); this.droneList = [];
    this.root = new THREE.Group(); this.root.name = 'StoryProps'; game.gfx.scene.add(this.root);
  }

  ground(x, z) { const V = this.g.valley; return V ? V.heightAt(x, z) : (this.g.groundHeight(x, z, 50) ?? 0); }

  free(x, z, hw, hd, yaw = 0) {
    const g = this.g, R = g.R, y = this.ground(x, z);
    const V = g.valley; if (V && V.fluidAt && V.fluidAt(x, z)) return false;
    if (V && V.normalAt && V.normalAt(x, z).y < 0.94) return false;
    if (this.onRoad(x, z, Math.hypot(hw, hd) + 2.5)) return false;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    let hit = false;
    g.phys.world.intersectionsWithShape({ x, y: y + 2.2, z }, { x: q.x, y: q.y, z: q.z, w: q.w }, new R.Cuboid(hw, 1.6, hd), (col) => { const ud = col.userData || {}; if (ud.story || (col.shapeType && col.shapeType() === R.ShapeType.HeightField)) return true; hit = true; return false; }, undefined, groups(GROUP.STATIC, GROUP.STATIC | GROUP.PROP));
    return !hit;
  }

  onRoad(x, z, margin) {
    const V = this.g.valley; if (!V || !V.roads) return false;
    if (!this.roadGrid) {
      const G = new Map(), C = 16;
      for (const r of V.roads) { const hw = (r.width || 8) / 2; for (const p of r.pts || []) { const k = Math.floor(p[0] / C) + ',' + Math.floor(p[1] / C); let a = G.get(k); if (!a) G.set(k, (a = [])); a.push(p[0], p[1], hw); } }
      this.roadGrid = G; this.roadCell = C;
    }
    const C = this.roadCell, n = Math.ceil((margin + 16) / C), cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const a = this.roadGrid.get((cx + i) + ',' + (cz + j)); if (!a) continue;
      for (let k = 0; k < a.length; k += 3) if (Math.hypot(a[k] - x, a[k + 1] - z) < a[k + 2] + margin) return true;
    }
    return false;
  }

  findSpot(cx, cz, hw, hd, yaw = 0, maxR = 160) {
    for (let r = 0; r <= maxR; r += 6) for (let k = 0, n = r ? Math.ceil(r / 4) : 1; k < n; k++) {
      const a = k / n * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (this.free(x, z, hw, hd, yaw)) return { x, z, y: this.ground(x, z), yaw };
    }
    return { x: cx, z: cz, y: this.ground(cx, cz), yaw };
  }

  set(name) {
    let s = this.sets.get(name);
    if (!s) { s = { group: new THREE.Group(), cols: [], body: null, spots: {} }; s.group.name = 'Story_' + name; s.group.visible = false; this.root.add(s.group); this.sets.set(name, s); }
    return s;
  }

  box(s, w, h, d, mat, x, y, z, solid = true, at = null) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    s.local.add(m);
    if (solid) s.boxes.push({ w, h, d, x, y, z });
    return m;
  }

  begin(name, at) {
    const s = this.set(name);
    s.local = new THREE.Group(); s.local.position.set(at.x, at.y, at.z); s.local.rotation.y = at.yaw || 0; s.group.add(s.local);
    s.boxes = []; s.at = at;
    return s;
  }

  merge(s) {
    const by = new Map();
    for (const m of s.local.children.slice()) {
      if (!m.isMesh) continue;
      m.updateMatrix();
      const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
      const key = m.material.uuid + ':' + (m.castShadow ? 1 : 0);
      if (!by.has(key)) by.set(key, { mat: m.material, cast: m.castShadow, geos: [] });
      by.get(key).geos.push(geo);
      s.local.remove(m); m.geometry.dispose();
    }
    for (const { mat, cast, geos } of by.values()) {
      const mm = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], mat);
      mm.castShadow = cast; mm.receiveShadow = true; s.local.add(mm);
    }
  }

  end(s) {
    const g = this.g, R = g.R;
    this.merge(s);
    s.body = g.phys.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(s.at.x, s.at.y, s.at.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.at.yaw || 0)));
    for (const b of s.boxes) {
      const c = g.phys.world.createCollider(R.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.x, b.y, b.z).setFriction(0.8).setCollisionGroups(groups(GROUP.STATIC, 0xffff)), s.body);
      c.userData = { kind: 'static', story: true }; c.setEnabled(false); s.cols.push(c);
    }
    return s;
  }

  local(s, x, y, z) { return new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.at.yaw || 0).add(new THREE.Vector3(s.at.x, s.at.y, s.at.z)); }

  show(name, on = true) {
    const s = this.sets.get(name); if (!s) return;
    if (s.group.visible === on) return;
    s.group.visible = on; for (const c of s.cols) c.setEnabled(on);
  }

  hideAll() { for (const n of this.sets.keys()) this.show(n, false); }

  workshop(name, at, brand) {
    const kessler = brand === 'kessler', s = this.begin(name, at);
    const wall = kessler ? M(0x1d2433, 0.55, 0.3) : M(0xc9ccd1, 0.6, 0.5), trim = kessler ? M(0xb08a4a, 0.35, 0.8) : M(0x2a2d33, 0.7, 0.2), floor = M(0x55524c, 0.95);
    this.box(s, 10, 0.12, 8, floor, 0, 0.06, 0, false);
    this.box(s, 10, 4.4, 0.25, wall, 0, 2.2, -4);
    this.box(s, 0.25, 4.4, 8, wall, -5, 2.2, 0); this.box(s, 0.25, 4.4, 8, wall, 5, 2.2, 0);
    this.box(s, 2.4, 4.4, 0.25, wall, -3.8, 2.2, 4); this.box(s, 2.4, 4.4, 0.25, wall, 3.8, 2.2, 4);
    this.box(s, 10.6, 0.3, 8.6, trim, 0, 4.55, 0).castShadow = false;
    for (const x of [-3, 0, 3]) { const l = this.box(s, 1.8, 0.05, 0.3, M(0xffffff, 0.4, 0, 0xfff1d6, 2.2), x, 4.36, 0, false); l.castShadow = false; }
    this.box(s, 5.2, 1.1, 0.25, wall, 0, 3.85, 4, false);
    const sg = this.box(s, 6.4, 1.3, 0.08, sign(kessler ? ['KESSLER JET Co.', 'SINCE 1886'] : ['GZOWSKA LABS', 'TIME CIRCUITS · REPAIRS'], 1024, 208, kessler ? '#10131b' : '#16181c', '#f2efe6', kessler ? '#c9a45c' : '#ffb648'), 0, 5.4, 4.2, false);
    sg.castShadow = false;
    this.box(s, 3.2, 0.95, 1.0, M(0x6b4b2e, 0.85), -2.6, 0.48, -3.0);
    this.box(s, 3.3, 0.06, 1.1, M(0x3a3d42, 0.5, 0.6), -2.6, 0.98, -3.0, false);
    this.box(s, 0.6, 2.2, 1.6, M(0x30343a, 0.6, 0.4), 4.2, 1.1, -2.4);
    if (kessler) { this.box(s, 1.2, 1.6, 0.1, M(0xb08a4a, 0.35, 0.9, 0xb08a4a, 0.2), 2.2, 2.2, -3.85, false); }
    else for (let i = 0; i < 3; i++) this.box(s, 0.5, 0.5, 0.5, M(0x8a6440, 0.85), 3.2 - i * 0.6, 0.25, -3.3, false);
    s.spots.bench = this.local(s, -2.6, 1.05, -2.2);
    s.spots.door = this.local(s, 0, 0, 5.2);
    s.spots.inside = this.local(s, 0, 0, 1.0);
    return this.end(s);
  }

  forge(name, at) {
    const s = this.begin(name, at), wood = M(0x5a3d24, 0.9), stone = M(0x4a4641, 0.95), iron = M(0x2b2b2e, 0.45, 0.8);
    for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) this.box(s, 0.25, 3.2, 0.25, wood, x, 1.6, z);
    this.box(s, 5.2, 0.2, 5.2, wood, 0, 3.3, 0, false);
    this.box(s, 1.8, 1.0, 1.4, stone, -1.0, 0.5, -1.3);
    const coal = M(0x161412, 0.95), ember = M(0x2a0e04, 0.9, 0, 0xff6a1e, 0.9), ash = M(0x1c1a19, 1);
    this.box(s, 1.3, 0.05, 0.9, ash, -1.0, 1.02, -1.3, false);
    for (let i = 0; i < 24; i++) { const hot = i % 3 === 0, c = new THREE.Mesh(new THREE.DodecahedronGeometry(hot ? 0.032 : 0.05 + (i % 4) * 0.01, 0), hot ? ember : coal); c.position.set(-1.44 + (i % 6) * 0.17 + (i % 3) * 0.02, 1.06 + (hot ? 0.025 : 0), -1.6 + Math.floor(i / 6) * 0.17); c.rotation.set(i, i * 2, 0); c.scale.y = 0.6; s.local.add(c); }
    this.box(s, 0.7, 3.6, 0.7, stone, -1.0, 2.6, -1.9, false);
    this.box(s, 0.5, 0.6, 0.5, wood, 1.2, 0.3, 0.2);
    this.box(s, 0.9, 0.25, 0.32, iron, 1.2, 0.72, 0.2, false);
    this.box(s, 0.12, 1.4, 1.6, wood, 2.2, 0.7, 0.6, false);
    s.spots.anvil = this.local(s, 1.2, 0, 1.3);
    return this.end(s);
  }

  statue(name, at) {
    const s = this.begin(name, at), stone = M(0xb7b1a6, 0.9), bronze = M(0x7a5a32, 0.38, 0.85);
    this.box(s, 1.6, 1.5, 1.6, stone, 0, 0.75, 0);
    const part = (geo, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, bronze); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; s.local.add(m); return m; };
    for (const sx of [-1, 1]) { part(new THREE.CylinderGeometry(0.1, 0.085, 0.85, 12), sx * 0.13, 1.93, 0); part(new THREE.BoxGeometry(0.16, 0.08, 0.3), sx * 0.13, 1.54, 0.05); }
    part(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 14), 0, 2.66, 0);
    part(new THREE.CylinderGeometry(0.27, 0.19, 0.12, 14), 0, 2.97, 0);
    part(new THREE.CylinderGeometry(0.21, 0.32, 0.55, 14), 0, 2.3, 0.02);
    part(new THREE.CylinderGeometry(0.06, 0.07, 0.22, 10), 0, 3.08, 0);
    part(new THREE.SphereGeometry(0.13, 16, 12), 0, 3.28, 0.01);
    part(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16), 0, 3.38, 0);
    part(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 14), 0, 3.47, 0);
    part(new THREE.CylinderGeometry(0.045, 0.055, 0.6, 10), -0.27, 2.68, 0.02, 0, 0.25);
    part(new THREE.CylinderGeometry(0.045, 0.055, 0.62, 10), 0.3, 3.18, 0.06, 0, -2.75);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.15, 0.34, 18, 1, true), bronze); nozzle.material.side = THREE.DoubleSide; nozzle.position.set(0.42, 3.62, 0.08); s.local.add(nozzle);
    const plaque = this.box(s, 1.0, 0.5, 0.04, sign(['ELIAS KESSLER', 'INVENTOR OF THE KESSLER JET'], 512, 256, '#2b2418', '#e8dcc0', '#c9a45c'), 0, 0.85, 0.82, false); plaque.castShadow = false;
    s.spots.plaque = this.local(s, 0, 0, 1.6);
    return this.end(s);
  }

  billboard(name, at, lines) {
    const s = this.begin(name, at), post = M(0x3a3d42, 0.6, 0.6);
    this.box(s, 0.35, 7, 0.35, post, -3, 3.5, 0); this.box(s, 0.35, 7, 0.35, post, 3, 3.5, 0);
    const p = this.box(s, 9, 4.2, 0.2, sign(lines, 1024, 480, '#0f1420', '#f2efe6', '#c9a45c'), 0, 8.2, 0, false); p.castShadow = true;
    return this.end(s);
  }

  tower(name, at) {
    const s = this.begin(name, at), glass = M(0x121722, 0.15, 0.9);
    this.box(s, 18, 96, 18, glass, 0, 48, 0);
    this.box(s, 19, 2, 19, M(0x2c2a26, 0.5, 0.7), 0, 97, 0);
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const km = sign(['KESSLER'], 1024, 512, '#0b0e15', '#f3e2b8', '#c9a45c'); km.emissiveIntensity = 1.4;
      const k = this.box(s, 12, 6, 0.3, km, 0, 88, 0, false);
      k.position.set(Math.sin(r) * 9.2, 88, Math.cos(r) * 9.2); k.rotation.y = r; k.castShadow = false;
    }
    return this.end(s);
  }

  drones(name, around, n = 3) {
    const s = this.set(name), body = M(0x14171d, 0.4, 0.6), eye = M(0x000000, 0.4, 0, 0xc9a45c, 3);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Group();
      d.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.7), body));
      for (const [x, z] of [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 16), body); r.position.set(x, 0.1, z); d.add(r); }
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), eye); e.position.set(0, -0.08, 0.36); d.add(e);
      d.userData = { cx: around.x, cz: around.z, r: 18 + i * 9, h: 14 + i * 4, ph: i * 2.1, sp: 0.18 + i * 0.05 };
      s.group.add(d); this.droneList.push(d);
    }
    return s;
  }

  update(dt) {
    const t = performance.now() / 1000;
    for (const d of this.droneList) {
      if (!d.parent || !d.parent.visible) continue;
      const u = d.userData, a = u.ph + t * u.sp;
      const x = u.cx + Math.cos(a) * u.r, z = u.cz + Math.sin(a) * u.r;
      d.position.set(x, this.ground(x, z) + u.h + Math.sin(t * 1.3 + u.ph) * 0.6, z);
      d.rotation.y = -a; d.rotation.z = Math.sin(t * 0.9 + u.ph) * 0.06;
    }
  }
}
