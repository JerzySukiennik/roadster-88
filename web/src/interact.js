// Roadster 88 interactions on foot: an E prompt for the nearest usable thing (registered spots such as people, doors and mission objects, plus any light physics object), picking up, carrying, dropping and throwing objects with matching avatar motions, and spawnable carry items for missions.
import * as THREE from 'three/webgpu';
import { GROUP, groups } from './sim/car.js';

const HOLD = new THREE.Vector3(0, 1.02, 0.52), MAX_MASS = 80;
const ITEMS = {
  crate: { label: 'crate', size: [0.55, 0.42, 0.42], mass: 14, color: 0x8a6440, rough: 0.85 },
  canister: { label: 'canister', r: 0.17, h: 0.48, mass: 9, color: 0xb3261e, rough: 0.45, metal: 0.3 },
  part: { label: 'thruster part', r: 0.16, h: 0.42, mass: 11, color: 0xb8bcc4, rough: 0.28, metal: 1, cone: true },
  decoy: { label: 'decoy', r: 0.09, h: 0.26, mass: 1.2, color: 0xffb648, rough: 0.35, metal: 0.4, glow: 0xffb648 },
  book: { label: 'sketchbook', size: [0.34, 0.07, 0.26], mass: 1.5, color: 0x6b3a22, rough: 0.8 },
  seed: { label: 'seed pod', r: 0.12, h: 0.22, mass: 1, color: 0x4f7a2a, rough: 0.6 },
  parcel: { label: 'parcel', size: [0.42, 0.3, 0.32], mass: 4, color: 0xb08a5a, rough: 0.9 },
};

export class Interact {
  constructor(game) {
    this.g = game; this.spots = new Set(); this.items = []; this.held = null; this.focus = null; this.pending = null;
    this.el = document.getElementById('prompt'); this.txt = document.getElementById('promptText');
    this.shape = new game.R.Ball(0.9);
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }

  add(spot) { this.spots.add(spot); return () => this.spots.delete(spot); }

  spawnItem(kind, pos, yaw = 0) {
    const g = this.g, R = g.R, d = ITEMS[kind] || ITEMS.crate;
    const mat = new THREE.MeshStandardMaterial({ color: d.color, roughness: d.rough, metalness: d.metal || 0, emissive: d.glow || 0x000000, emissiveIntensity: d.glow ? 1.2 : 0 });
    const geo = d.size ? new THREE.BoxGeometry(...d.size) : d.cone ? new THREE.CylinderGeometry(d.r * 0.45, d.r, d.h, 20, 1, true) : new THREE.CylinderGeometry(d.r, d.r, d.h, 20);
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'Item_' + kind;
    g.gfx.scene.add(mesh);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const body = g.phys.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setCcdEnabled(true));
    const cd = d.size ? R.ColliderDesc.cuboid(d.size[0] / 2, d.size[1] / 2, d.size[2] / 2) : R.ColliderDesc.cylinder(d.h / 2, d.r);
    cd.setMass(d.mass).setFriction(0.7).setRestitution(0.2).setCollisionGroups(groups(GROUP.PROP, 0xffff));
    const col = g.phys.world.createCollider(cd, body);
    const it = { kind, label: d.label, mesh, body, col };
    col.userData = { kind: 'prop', item: it };
    this.items.push(it);
    return it;
  }

  removeItem(it) {
    if (!it || !this.items.includes(it)) return;
    if (this.held && this.held.body === it.body) this.held = null;
    this.g.gfx.scene.remove(it.mesh); this.g.phys.world.removeRigidBody(it.body);
    this.items.splice(this.items.indexOf(it), 1);
  }

  nearestBody(w) {
    const g = this.g, fx = Math.sin(w.yaw), fz = Math.cos(w.yaw);
    const c = { x: w.pos.x + fx * 0.8, y: w.pos.y + 0.55, z: w.pos.z + fz * 0.8 };
    let best = null, bd = 1e9;
    g.phys.world.intersectionsWithShape(c, { x: 0, y: 0, z: 0, w: 1 }, this.shape, (col) => {
      const b = col.parent(), ud = col.userData || {};
      if (!b || !b.isDynamic() || ud.life || ud.kind === 'car' || ud.kind === 'remote' || ud.kind === 'walker' || b.mass() > MAX_MASS) return true;
      const t = b.translation(), d = Math.hypot(t.x - c.x, t.z - c.z) + Math.abs(t.y - c.y) * 0.5;
      if (d < bd) { const ex = t.x - w.pos.x, ez = t.z - w.pos.z, dw = Math.hypot(ex, ez); bd = d; best = { body: b, col, d: dw - ((ex * fx + ez * fz) / (dw || 1)) * 0.6, label: (ud.item && ud.item.label) || ud.label || (b.mass() > 30 ? 'heavy object' : 'object') }; }
      return true;
    }, undefined, groups(GROUP.WALKER, GROUP.PROP | GROUP.DEBRIS));
    return best;
  }

  nearestSpot(w, holding = false) {
    let best = null, bd = 1e9;
    for (const s of this.spots) {
      if (holding && !s.holding) continue;
      if (s.enabled && !s.enabled()) continue;
      const p = typeof s.pos === 'function' ? s.pos() : s.pos; if (!p) continue;
      const dx = p.x - w.pos.x, dz = p.z - w.pos.z, d = Math.hypot(dx, dz);
      if (d > (s.radius || 2) || Math.abs((p.y || w.pos.y) - w.pos.y) > 2.5) continue;
      const front = (dx * Math.sin(w.yaw) + dz * Math.cos(w.yaw)) / (d || 1);
      const score = d - front * 0.6;
      if (score < bd) { bd = score; best = s; }
    }
    this.spotScore = bd;
    return best;
  }

  use() {
    const g = this.g, w = g.walker;
    if (!w.active || w.dead) return;
    const f = this.focus;
    if (this.held && !(f && f.spot)) { this.drop(); return; }
    if (!f) return;
    if (f.spot) { f.spot.onUse && f.spot.onUse(g.player, f.spot); return; }
    if (f.body) this.pick(f.body, f.col);
  }

  click() { if (this.held && !this.pending) this.throw(); }

  pick(body, col) {
    const g = this.g, A = g.driver.anim;
    const cols = []; for (let i = 0; i < body.numColliders(); i++) { const c = body.collider(i); cols.push({ c, gr: c.collisionGroups() }); c.setCollisionGroups(groups(GROUP.PROP, 0)); }
    body.setBodyType(g.R.RigidBodyType.KinematicPositionBased, true);
    const t = body.translation();
    this.held = { body, cols, from: new THREE.Vector3(t.x, t.y, t.z), k: 0, q0: new THREE.Quaternion().copy(body.rotation()) };
    if (A) A.play('PickUp_Table', { rate: 1.4, lock: true });
    if (g.audio) g.audio.play('ui_tap', { pos: { x: t.x, y: t.y, z: t.z }, gain: 0.5 });
  }

  release(vel) {
    const g = this.g, h = this.held; if (!h) return;
    if (g.story && g.story.netRelease && g.story.netRelease(h.body, vel)) { for (const e of h.cols) e.c.setCollisionGroups(e.gr); this.held = null; return; }
    h.body.setBodyType(g.R.RigidBodyType.Dynamic, true);
    for (const e of h.cols) e.c.setCollisionGroups(e.gr);
    h.body.setLinvel(vel, true);
    h.body.setAngvel({ x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 4 }, true);
    this.held = null;
  }

  drop() {
    const w = this.g.walker, fx = Math.sin(w.yaw), fz = Math.cos(w.yaw), h = this.held;
    h.body.setNextKinematicTranslation({ x: w.pos.x + fx * 0.85, y: w.pos.y + 0.6, z: w.pos.z + fz * 0.85 });
    h.body.setTranslation({ x: w.pos.x + fx * 0.85, y: w.pos.y + 0.6, z: w.pos.z + fz * 0.85 }, true);
    this.release({ x: w.vel.x, y: 0, z: w.vel.z });
  }

  throw() {
    const g = this.g, A = g.driver.anim;
    if (A) A.play('OverhandThrow', { upper: true, rate: 1.3 });
    this.pending = 0.42 / 1.3;
  }

  preStep(dt) {
    const g = this.g, w = g.walker, h = this.held;
    if (h && (!w.active || w.dead)) { this.release({ x: w.vel.x, y: w.vel.y, z: w.vel.z }); return; }
    if (!h) return;
    if (this.pending !== null) {
      this.pending -= dt;
      if (this.pending <= 0) {
        this.pending = null;
        const yaw = g.rig.footYaw, pitch = Math.max(-0.2, Math.min(0.9, -g.rig.footPitch * 0.6 + 0.35)), v = 11;
        this.release({ x: Math.sin(yaw) * Math.cos(pitch) * v + w.vel.x, y: Math.sin(pitch) * v + 1.5, z: Math.cos(yaw) * Math.cos(pitch) * v + w.vel.z });
        if (g.audio) g.audio.play('valve_puff', { gain: 0.4, pos: { x: w.pos.x, y: w.pos.y + 1.4, z: w.pos.z } });
        return;
      }
    }
    h.k = Math.min(1, h.k + dt / 0.45);
    const q = this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.yaw);
    const raise = this.pending !== null ? new THREE.Vector3(0, 0.55, -0.15) : new THREE.Vector3();
    const tgt = this._v.copy(HOLD).add(raise).applyQuaternion(q).add(new THREE.Vector3(w.pos.x, w.pos.y, w.pos.z));
    const e = h.k * h.k * (3 - 2 * h.k);
    const p = h.from.clone().lerp(tgt, e);
    h.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    const r = h.q0.clone().slerp(q, e);
    h.body.setNextKinematicRotation({ x: r.x, y: r.y, z: r.z, w: r.w });
  }

  hold(dt, down) {
    const s = this.focus && this.focus.spot;
    if (!down || !s || !s.onHold) { this.holdAcc = 0; return; }
    this.holdAcc = (this.holdAcc || 0) + dt;
    if (this.holdAcc >= 0.2) { s.onHold(this.holdAcc); this.holdAcc = 0; }
  }

  update() {
    const g = this.g, w = g.walker;
    for (const it of this.items) { const t = it.body.translation(), r = it.body.rotation(); it.mesh.position.set(t.x, t.y, t.z); it.mesh.quaternion.set(r.x, r.y, r.z, r.w); }
    let label = null;
    this.focus = null;
    if (w.active && !w.dead && !g.paused) {
      if (this.held) {
        const s = this.pending === null ? this.nearestSpot(w, true) : null;
        if (s) { this.focus = { spot: s }; label = s.label; } else label = this.pending !== null ? null : 'Drop · Click to throw';
      }
      else {
        const s = this.nearestSpot(w), sd = this.spotScore, b = this.nearestBody(w);
        if (s && (!b || sd <= b.d + 0.25)) { this.focus = { spot: s }; label = s.label; }
        else if (b) { this.focus = b; label = 'Pick up ' + b.label; }
      }
    }
    if (label !== this.shown) {
      this.shown = label;
      if (this.el) { this.el.classList.toggle('on', !!label); if (label) this.txt.textContent = label; }
    }
  }
}
