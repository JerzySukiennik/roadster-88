// Roadster 88 damage glue: turns Rapier contact-force events into lattice impacts, drives the GPU lattice skinning, detaches parts as debris bodies, cracks and shatters glass, feeds bent suspension and damaged nozzles back into the sim, sounds, sparks and camera shake.
import * as THREE from 'three/webgpu';
import { texture, uv, mix, vec3, float } from 'three/tsl';
import { Lattice } from './sim/lattice.js';
import { GROUP, groups } from './sim/car.js';
import { DeformBinding } from './render/deform.js';
import { fxMaterial } from './render/gfx.js';
import { V3 } from './sim/math.js';

const PART_MASS = { Bumper_F: 9, Bumper_R: 9, Hood: 14, Flap_F: 1.5, Door_L: 26, Door_R: 26, Mirror_L: 2, Mirror_R: 2, Roof_Targa: 12, Wing: 7, Wheel_FL: 30, Wheel_FR: 30, Wheel_RL: 32, Wheel_RR: 32 };
const GLASS = ['Glass_Windshield', 'Glass_Rear', 'Glass_Door_L', 'Glass_Door_R', 'Glass_Quarter_L', 'Glass_Quarter_R', 'Roof_Targa'];
const rnd = (a, b) => a + Math.random() * (b - a);

class Shards {
  constructor(scene, cap = 420) {
    this.cap = cap; this.list = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.05, 0.012, 0.01, 0.012, 0.045, -0.006], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    const m = fxMaterial(new THREE.MeshPhysicalNodeMaterial({ color: 0x1a1d20, roughness: 0.05, metalness: 0.0, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    this.mesh = new THREE.InstancedMesh(g, m, cap); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3();
  }
  burst(points, vel) {
    for (const p of points) {
      if (this.list.length >= this.cap) this.list.shift();
      this.list.push({ p: p.clone(), v: new THREE.Vector3(vel.x * 0.85 + rnd(-3, 3), vel.y * 0.5 + rnd(0.5, 4), vel.z * 0.85 + rnd(-3, 3)), r: new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6)), w: new THREE.Vector3(rnd(-15, 15), rnd(-15, 15), rnd(-15, 15)), s: rnd(0.6, 2.2), rest: false, age: 0 });
    }
  }
  update(dt) {
    let i = 0;
    for (const s of this.list) {
      s.age += dt;
      if (!s.rest) {
        s.v.y -= 9.81 * dt; s.v.multiplyScalar(Math.exp(-0.4 * dt));
        s.p.addScaledVector(s.v, dt);
        s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt;
        if (s.p.y < 0.01) { s.p.y = 0.01; s.v.y *= -0.25; s.v.x *= 0.5; s.v.z *= 0.5; s.w.multiplyScalar(0.4); if (Math.abs(s.v.y) < 0.4) s.rest = true; }
      }
      this.q.setFromEuler(s.r); this.s.setScalar(s.s);
      this.m.compose(s.p, this.q, this.s); this.mesh.setMatrixAt(i++, this.m);
    }
    this.mesh.count = i; this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class DamageSystem {
  constructor(game) {
    this.g = game; this.tu = game.tu;
    this.debris = [];
    this.shards = new Shards(game.gfx.scene);
    this.scrape = 0; this.scrapeT = 0;
    this.lastImpact = new Map();
    this.lastRemote = new Map();
    this._v = new V3();
  }

  attach(car, latticeData) {
    const L = new Lattice(latticeData, this.tu);
    car.lattice = L;
    car.binding = new DeformBinding(car.view.root, L, { skip: new URLSearchParams(location.search).has('nodeform') });
    car.glass = new Map();
    for (const nm of GLASS) { const m = car.view.n[nm]; if (m && m.isMesh) car.glass.set(nm, { mesh: m, state: 0, canvas: null, tex: null }); }
    car.lost = new Set();
  }

  carOf(col) { const d = col && col.userData; return d && d.kind === 'car' ? this.g.cars.find((c) => c.sim === d.car) : null; }

  onContact(c1, c2, force) {
    const A = this.carOf(c1), B = this.carOf(c2);
    if (A) this.handle(A, c1, c2, force, false);
    if (B) this.handle(B, c2, c1, force, true);
  }

  handle(car, mine, other, force) {
    const world = this.g.phys.world, sim = car.sim;
    let pt = null, nrm = null;
    world.contactPair(mine, other, (man, flipped) => {
      if (pt || man.numSolverContacts() === 0) return;
      const p = man.solverContactPoint(0); const n = man.normal();
      pt = new THREE.Vector3(p.x, p.y, p.z);
      let k = 1; for (let i = 1; i < man.numSolverContacts(); i++) { const q = man.solverContactPoint(i); pt.x += q.x; pt.y += q.y; pt.z += q.z; k++; }
      pt.divideScalar(k);
      nrm = new THREE.Vector3(n.x, n.y, n.z).multiplyScalar(flipped ? -1 : 1);
    });
    if (!pt) return;
    const od = other.userData || {};
    const otherBody = other.parent();
    const otherDyn = otherBody && otherBody.isDynamic();
    const r = new THREE.Vector3(pt.x - sim.comW.x, pt.y - sim.comW.y, pt.z - sim.comW.z);
    const pv = sim.prevVel, pw = sim.angW;
    const vCar = new THREE.Vector3(pv.x, pv.y, pv.z).add(new THREE.Vector3(pw.x, pw.y, pw.z).cross(r));
    let vOther = new THREE.Vector3();
    let mOther = Infinity;
    if (otherDyn) { const lv = otherBody.linvel(); vOther.set(lv.x, lv.y, lv.z); mOther = otherBody.mass(); }
    if (od.kind === 'car') { const os = od.car; vOther.set(os.prevVel.x, os.prevVel.y, os.prevVel.z); mOther = os.mass; }
    if (od.kind === 'remote') { vOther.set(od.vel.x, od.vel.y, od.vel.z); mOther = od.mass; }
    const rel = vCar.clone().sub(vOther);
    if (rel.dot(nrm) < 0) nrm.negate();
    const vn = rel.dot(nrm);
    const vt = rel.clone().addScaledVector(nrm, -vn).length();
    const mu = mOther === Infinity ? sim.mass : sim.mass * mOther / (sim.mass + mOther);
    const now = this.g.time;
    if (vn < this.tu.damage.min_impact_speed) {
      if (vt > 3 && force > 2000 && od.kind !== 'prop' && mu > 200) { this.scrapeT = 0.12; this.scrape = Math.min(1, vt / 20); if (Math.random() < 0.6) this.g.fx.sparks(pt, rel.clone().multiplyScalar(0.3), new THREE.Vector3(0, 1, 0), 3); }
      return;
    }
    if (!od.kind && mu < 150) return;
    const key = car.sim.id + ':' + other.handle;
    if (now - (this.lastImpact.get(key) || -9) < 0.12) return;
    this.lastImpact.set(key, now);
    const J = mu * vn * 1.1;
    const E = 0.5 * mu * vn * vn * 0.99;
    if (od.kind === 'remote' && car === this.g.car) { this.lastRemote.set(od.uid, now); if (this.g.online) { this.g.online.sendHit(od.uid, J, nrm, pt); this.g.online.soften(od.uid); } }
    this.impactAt(car, pt, nrm, vn, J, E, rel, od);
  }

  recentRemote(car, uid) { return car === this.g.car && this.g.time - (this.lastRemote.get(uid) || -9) < 0.5; }

  impactAt(car, pt, nrm, vn, J, E, rel, od) {
    const q = car.curr.quat.clone().invert();
    const pL = pt.clone().sub(car.curr.pos).applyQuaternion(q);
    const nL = nrm.clone().applyQuaternion(q);
    let cylRadius = 0, footprint = 50;
    if (od.tag === 'pillar' || od.tag === 'pole' || od.tag === 'tower') cylRadius = od.r || 0.5;
    if (od.kind === 'prop') footprint = 0.5;
    if (od.kind === 'car' || od.kind === 'remote') footprint = 1.2;
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const depth = car.lattice.impact({ p: pL.toArray(), n: nL.toArray(), speed: vn, energy: E, cylRadius, axis: axis.toArray(), footprint });
    if (car === this.g.car) {
      this.g.rig.addImpact(Math.min(1.5, J / 25000));
      const a = this.g.audio;
      const pos = { x: pt.x, y: pt.y, z: pt.z };
      if (J > 30000) { a.play('impact_heavy', { pos, gain: 1 }); a.play('metal_crunch', { pos, gain: Math.min(1, J / 60000) }); }
      else if (J > 9000) { a.play('impact_medium', { pos, gain: 0.9 }); if (depth > 0.05) a.play('metal_crunch', { pos, gain: 0.5 }); }
      else if (J > 1500) a.play('impact_light', { pos, gain: Math.min(1, J / 6000) + 0.2 });
    }
    if (J > 4000 && od.kind !== 'prop') this.g.fx.sparks(pt, rel.clone().multiplyScalar(0.4), nrm.clone().negate(), Math.min(60, Math.round(J / 1500)));
    if (J > 8000 && od.kind !== 'car') this.g.fx.dustBurst(pt, Math.min(20, Math.round(J / 4000)), 1);
    this.checkParts(car, pL, J);
    this.checkGlass(car, pL, J);
    this.checkNozzles(car, pL, J);
  }

  checkParts(car, pL, J) {
    const L = car.lattice;
    for (const part of L.parts) {
      if (part.detached || !part.nodes.length) continue;
      let dmin = 9;
      for (const i of part.nodes) dmin = Math.min(dmin, Math.hypot(L.x[i * 3] - pL.x, L.x[i * 3 + 1] - pL.y, L.x[i * 3 + 2] - pL.z));
      const Jl = J * Math.exp(-Math.max(0, dmin - 0.2) / 0.5);
      if (Jl > part.breakImpulse * (0.85 + Math.random() * 0.3)) {
        part.detached = true;
        const gl = car.glass.get(part.name);
        if (gl) { if (gl.state < 2) this.shatter(car, part.name, gl); } else this.detach(car, part.name, Jl);
      }
    }
    const W = this.tu.damage.wheel_break_impulse;
    for (const name in L.wheels) {
      if (car.lost.has(name)) continue;
      const ids = L.wheels[name]; let dmin = 9;
      for (const i of ids) dmin = Math.min(dmin, Math.hypot(L.x[i * 3] - pL.x, L.x[i * 3 + 1] - pL.y, L.x[i * 3 + 2] - pL.z));
      const Jl = J * Math.exp(-Math.max(0, dmin - 0.15) / 0.35);
      if (Jl > W * (0.85 + Math.random() * 0.3)) this.loseWheel(car, name, Jl);
    }
  }

  checkGlass(car, pL, J) {
    const fall = this.tu.damage.glass_falloff_m;
    for (const [nm, gl] of car.glass) {
      if (gl.state >= 2 || !gl.mesh.visible) continue;
      const near = this.nearestOnMesh(car, gl.mesh, pL);
      const Jg = J * Math.exp(-near.d / fall);
      if (Jg > this.tu.damage.glass_shatter_impulse) this.shatter(car, nm, gl);
      else if (Jg > this.tu.damage.glass_crack_impulse) { this.crack(car, gl, near.uv, Jg); if (car === this.g.car) this.g.audio.play('glass_crack', { pos: car.curr.pos, gain: 0.9 }); }
    }
  }

  checkNozzles(car, pL, J) {
    const th = car.sim.thrusters;
    for (const n of th.all) {
      if (!n.attached) continue;
      const d = Math.hypot(n.pos.x - pL.x, n.pos.y - pL.y, n.pos.z - pL.z);
      const Jn = J * Math.exp(-Math.max(0, d - 0.15) / 0.4);
      if (Jn > this.tu.damage.nozzle_break_impulse * 1.6) { n.attached = false; n.health = 0; this.detachNode(car, n.name, 3, Jn); }
      else if (Jn > this.tu.damage.nozzle_break_impulse * 0.35) { n.health = Math.max(0.25, n.health - Jn / this.tu.damage.nozzle_break_impulse * 0.45); n.misPitch += rnd(-0.25, 0.25) * Jn / this.tu.damage.nozzle_break_impulse; n.misSide += rnd(-0.12, 0.12); }
    }
  }

  nearestOnMesh(car, mesh, pL) {
    const inv = new THREE.Matrix4().copy(car.view.root.matrixWorld).invert();
    const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const pos = mesh.geometry.attributes.position, uvA = mesh.geometry.attributes.uv;
    const v = new THREE.Vector3(); let best = 1e9, bi = 0;
    const step = Math.max(1, Math.floor(pos.count / 400));
    for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(m); const d = v.distanceTo(pL); if (d < best) { best = d; bi = i; } }
    return { d: best, uv: uvA ? [uvA.getX(bi), uvA.getY(bi)] : [0.5, 0.5] };
  }

  crack(car, gl, uvp, J) {
    if (!gl.canvas) {
      gl.canvas = document.createElement('canvas'); gl.canvas.width = gl.canvas.height = 1024;
      gl.tex = new THREE.CanvasTexture(gl.canvas); gl.tex.colorSpace = THREE.SRGBColorSpace;
      const base = gl.mesh.material;
      const m = fxMaterial(base.clone()); m.name = base.name;
      const t = texture(gl.tex, uv());
      m.colorNode = mix(vec3(0.02, 0.022, 0.025), vec3(0.85, 0.88, 0.9), t.a.mul(0.75));
      m.opacityNode = float(base.opacity).add(t.a.mul(0.5)).clamp(0, 1);
      m.roughnessNode = mix(float(0.02), float(0.4), t.a);
      gl.mesh.material = m;
    }
    const c = gl.canvas.getContext('2d'), S = gl.canvas.width;
    const cx = uvp[0] * S, cy = (1 - uvp[1]) * S;
    const k = Math.min(1, J / this.tu.damage.glass_shatter_impulse);
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineCap = 'round';
    const rays = 10 + Math.floor(k * 14);
    for (let i = 0; i < rays; i++) {
      let a = (i / rays) * Math.PI * 2 + rnd(-0.2, 0.2), x = cx, y = cy, len = S * (0.12 + k * 0.5) * rnd(0.5, 1.2);
      c.lineWidth = rnd(1.2, 2.6);
      c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 14; s++) { a += rnd(-0.25, 0.25); x += Math.cos(a) * len / 14; y += Math.sin(a) * len / 14; c.lineTo(x, y); if (Math.random() < 0.15) { c.moveTo(x, y); } }
      c.stroke();
    }
    for (let ring = 1; ring <= 2 + Math.floor(k * 3); ring++) {
      const R = ring * S * (0.03 + k * 0.05);
      c.lineWidth = 1.1; c.beginPath();
      for (let s = 0; s <= 24; s++) { const a = (s / 24) * Math.PI * 2; const rr = R * rnd(0.85, 1.15); const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; if (s === 0 || Math.random() < 0.25) c.moveTo(px, py); else c.lineTo(px, py); }
      c.stroke();
    }
    const grd = c.createRadialGradient(cx, cy, 0, cx, cy, S * 0.05 * (1 + k));
    grd.addColorStop(0, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grd; c.beginPath(); c.arc(cx, cy, S * 0.05 * (1 + k), 0, Math.PI * 2); c.fill();
    gl.tex.needsUpdate = true;
    gl.state = Math.max(gl.state, 1);
    gl.amount = Math.min(1, (gl.amount || 0) + 0.35 + k * 0.4);
  }

  shatter(car, nm, gl) {
    gl.state = 2;
    const mesh = gl.mesh;
    mesh.updateMatrixWorld(true);
    const pos = mesh.geometry.attributes.position, pts = [];
    const step = Math.max(1, Math.floor(pos.count / 140));
    for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
    this.shards.burst(pts, car.sim.vel);
    mesh.visible = false;
    if (car === this.g.car) this.g.audio.play('glass_shatter', { pos: car.curr.pos, gain: 1 });
  }

  loseWheel(car, name, J) {
    car.lost.add(name);
    const w = car.sim.wheels.find((x) => x.name === name);
    if (w) w.lost = true;
    this.detachNode(car, name, PART_MASS[name] || 30, J);
    const brake = car.view.n['Brake_' + name.slice(6)];
    if (brake) brake.visible = false;
  }

  detach(car, name, J) {
    if (name === 'Roof_Targa' && car.glass.has('Roof_Targa')) car.glass.get('Roof_Targa').state = 2;
    if (name.startsWith('Door_')) { const g = car.glass.get('Glass_' + name); if (g) g.state = 2; }
    this.detachNode(car, name, PART_MASS[name] || 8, J);
  }

  detachNode(car, name, mass, J) {
    const node = car.view.n[name];
    if (!node || !node.parent || car.view.lostParts.has(name)) return;
    car.view.lostParts.add(name);
    node.updateMatrixWorld(true);
    node.traverse((o) => { if (o.isMesh) car.binding.bake(o); });
    node.traverse((o) => { if (o.isMesh && o.material && o.material.positionNode) { const orig = this.g.mats.get(o.material.name); if (orig) o.material = orig; } });
    const box = new THREE.Box3().setFromObject(node);
    if (box.isEmpty()) { node.parent.remove(node); return; }
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const scene = this.g.gfx.scene;
    scene.attach(node);
    const R = this.g.R, world = this.g.phys.world;
    const q = node.getWorldQuaternion(new THREE.Quaternion());
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(center.x, center.y, center.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setCcdEnabled(true).setLinearDamping(0.1).setAngularDamping(0.4));
    const inv = q.clone().invert();
    const localSize = size.clone();
    const hx = Math.max(0.03, localSize.x / 2 * 0.9), hy = Math.max(0.03, localSize.y / 2 * 0.9), hz = Math.max(0.03, localSize.z / 2 * 0.9);
    const isWheel = name.startsWith('Wheel_');
    const desc = isWheel ? R.ColliderDesc.cylinder(Math.max(0.08, Math.min(hx, hz) * 0.4), Math.max(hy, hz)).setRotation({ x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) }) : R.ColliderDesc.cuboid(hx, hy, hz);
    desc.setMass(mass).setFriction(isWheel ? 1.0 : 0.6).setRestitution(isWheel ? 0.35 : 0.15).setCollisionGroups(groups(GROUP.DEBRIS, GROUP.STATIC | GROUP.CAR | GROUP.DEBRIS | GROUP.PROP | GROUP.WALKER));
    world.createCollider(desc, body);
    const v = car.sim.vel, k = Math.min(1, J / 40000);
    body.setLinvel({ x: v.x * 0.92 + rnd(-2, 2) * k, y: v.y + rnd(1, 4) * (0.3 + k), z: v.z * 0.92 + rnd(-2, 2) * k }, true);
    body.setAngvel({ x: rnd(-4, 4) * (0.3 + k), y: rnd(-4, 4) * (0.3 + k), z: rnd(-4, 4) * (0.3 + k) }, true);
    const offset = node.position.clone().sub(center).applyQuaternion(inv);
    this.debris.push({ node, body, offset, age: 0 });
    if (car === this.g.car) this.g.audio.play('part_clunk', { pos: center, gain: 0.9 });
    while (this.debris.length > 60) { const d = this.debris.shift(); world.removeRigidBody(d.body); scene.remove(d.node); }
  }

  step(dt) {
    for (const car of this.g.cars) {
      const L = car.lattice; if (!L) continue;
      const active = L.step(dt);
      for (const e of L.drain()) {
        if (e.type === 'sleep') { car.binding.queueNormals(); this.applyHandling(car); this.reshape(car); }
      }
      if (active) this.applyHandling(car);
      for (const part of L.parts) {
        if (part.detached || !part.nodes.length || !active) continue;
        if (L.attachmentBroken(part.nodes) > 0.7) { part.detached = true; const gl = car.glass.get(part.name); if (gl) { if (gl.state < 2) this.shatter(car, part.name, gl); } else this.detach(car, part.name, part.breakImpulse); }
      }
    }
  }

  applyHandling(car) {
    const L = car.lattice, sim = car.sim;
    for (const w of sim.wheels) {
      if (w.lost) continue;
      const dmg = L.groupDamage(L.wheels[w.name]);
      w.hub.set(dmg.hub[0] * 0.7, dmg.hub[1] * 0.7, dmg.hub[2] * 0.7);
      w.toe = Math.max(-0.3, Math.min(0.3, dmg.toe));
      w.camber = Math.max(-0.3, Math.min(0.3, dmg.camber));
      if (dmg.mag > 0.5 && !car.lost.has(w.name)) this.loseWheel(car, w.name, 1e5);
    }
    for (const n of sim.thrusters.all) {
      const ids = L.nozzles[n.name]; if (!ids || !n.attached) continue;
      const dmg = L.groupDamage(ids);
      if (dmg.mag > 0.05) { n.health = Math.min(n.health, Math.max(0.2, 1 - dmg.mag * 2.5)); n.misPitch = Math.max(-0.5, Math.min(0.5, dmg.hub[1] * 2)); n.misSide = Math.max(-0.3, Math.min(0.3, dmg.hub[0] * 2)); }
      if (dmg.mag > 0.35) { n.attached = false; n.health = 0; this.detachNode(car, n.name, 3, 1e4); }
    }
  }

  reshape(car) {
    const ex = car.lattice.extents();
    if (ex.front + ex.rear + ex.left + ex.right + ex.roof < 0.03) return;
    car.sim.buildColliders({ front: Math.min(1.8, ex.front), rear: Math.min(1.8, ex.rear), left: Math.min(0.6, ex.left), right: Math.min(0.6, ex.right), roof: Math.min(0.5, ex.roof) });
  }

  update(dt) {
    for (const car of this.g.cars) {
      if (!car.binding) continue;
      car.binding.update();
      car.binding.stepNormals(2);
    }
    const tq = new THREE.Quaternion();
    for (const d of this.debris) {
      const t = d.body.translation(), r = d.body.rotation();
      tq.set(r.x, r.y, r.z, r.w);
      d.node.quaternion.copy(tq);
      d.node.position.set(t.x, t.y, t.z).add(d.offset.clone().applyQuaternion(tq));
    }
    this.shards.update(dt);
    this.scrapeT -= dt;
    if (this.scrapeT <= 0) this.scrape = Math.max(0, this.scrape - dt * 4);
  }
}
