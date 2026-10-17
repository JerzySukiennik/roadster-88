// Roadster 88 life bodies: Rapier dynamic bodies for agents near the car, velocity-driven with locked rotations while alive (so the car meets real mass and pushes or bowls them over through the normal contact and damage path), switched to free tumbling rigid bodies with gravity and terrain contact when hit hard, and righted again when they get up.
import { GROUP, groups } from '../sim/car.js';

const ALIVE = groups(GROUP.PROP, GROUP.CAR | GROUP.DEBRIS);
const LOOSE = groups(GROUP.PROP, GROUP.CAR | GROUP.DEBRIS | GROUP.STATIC);

export const SHAPES = {
  trex: [['box', [0, 3.2, 0.2], [0.65, 0.75, 2.4]], ['box', [0, 3.9, 3.6], [0.4, 0.45, 1.0]], ['box', [0, 3.2, -4.0], [0.35, 0.35, 2.5]], ['cap', [0.6, 1.2, 0.2], 1.0, 0.32], ['cap', [-0.6, 1.2, 0.2], 1.0, 0.32]],
  raptor: [['box', [0, 1.3, 0.3], [0.25, 0.32, 0.8]], ['box', [0, 1.4, -1.6], [0.12, 0.12, 1.2]], ['cap', [0, 0.6, 0.1], 0.35, 0.18]],
  triceratops: [['box', [0, 1.65, 0.1], [0.95, 0.85, 2.3]], ['box', [0, 1.9, 3.2], [0.9, 0.7, 0.9]], ['box', [0, 0.45, 0.1], [0.75, 0.45, 1.8]]],
  sauropod: [['box', [0, 4.3, 0.2], [1.7, 1.7, 3.6]], ['box', [0, 7.5, 6.5], [0.5, 0.5, 3.6], -0.7], ['box', [0, 3.6, -8.0], [0.5, 0.5, 4.5]], ['cap', [1.05, 1.5, -1.4], 1.3, 0.5], ['cap', [-1.05, 1.5, -1.4], 1.3, 0.5], ['cap', [1.05, 1.5, 2.5], 1.3, 0.45], ['cap', [-1.05, 1.5, 2.5], 1.3, 0.45]],
  hadrosaur: [['box', [0, 2.4, 0.2], [0.75, 0.75, 2.0]], ['box', [0, 2.7, 3.3], [0.3, 0.4, 1.0]], ['box', [0, 2.3, -3.5], [0.35, 0.4, 2.2]], ['cap', [0, 0.9, -0.3], 0.6, 0.45]],
  horse: [['box', [0, 1.25, 0.0], [0.32, 0.36, 0.95]], ['box', [0, 1.7, 1.15], [0.15, 0.32, 0.25]], ['box', [0, 0.45, 0.0], [0.28, 0.45, 0.65]]],
  longhorn: [['box', [0, 1.1, 0.0], [0.36, 0.38, 1.0]], ['box', [0, 1.15, 1.25], [0.35, 0.2, 0.25]], ['box', [0, 0.38, 0.0], [0.3, 0.38, 0.7]]],
  canid: [['box', [0, 0.52, 0.05], [0.12, 0.15, 0.5]], ['box', [0, 0.22, 0.0], [0.1, 0.22, 0.32]]],
  deer: [['box', [0, 0.88, 0.0], [0.18, 0.22, 0.6]], ['box', [0, 1.35, 0.7], [0.08, 0.2, 0.15]], ['box', [0, 0.35, 0.0], [0.15, 0.35, 0.45]]],
  human: [['cap', [0, 0.9, 0], 0.6, 0.24]],
  mammoth: [['box', [0, 2.4, 0.0], [1.05, 1.0, 1.9]], ['box', [0, 3.1, 2.2], [0.6, 0.7, 0.6]], ['box', [0, 0.8, 0.0], [0.8, 0.8, 1.4]]],
  bison: [['box', [0, 1.2, 0.05], [0.42, 0.5, 1.05]], ['box', [0, 1.1, 1.3], [0.3, 0.3, 0.3]], ['box', [0, 0.38, 0.0], [0.32, 0.38, 0.7]]],
  stegosaurus: [['box', [0, 1.9, 0.2], [0.85, 0.95, 2.0]], ['box', [0, 2.8, -0.2], [0.15, 0.7, 2.6]], ['box', [0, 1.6, -3.4], [0.35, 0.35, 1.9]], ['box', [0, 0.6, 0.3], [0.65, 0.6, 1.6]]],
  dimetrodon: [['box', [0, 0.55, 0.1], [0.28, 0.22, 0.95]], ['box', [0, 1.2, 0.12], [0.06, 0.55, 0.65]], ['box', [0, 0.35, -1.5], [0.12, 0.12, 0.8]]],
  car: [['box', [0, 0.75, 0], [0.92, 0.5, 2.35]]],
  wagon: [['box', [0, 1.2, -0.2], [0.75, 0.75, 1.6]]],
  truck: [['box', [0, 1.9, 0.0], [1.25, 1.6, 8.0]]],
};

const BUMP = { mammoth: 1.8, bison: 2.8, stegosaurus: 2.2, dimetrodon: 3.4, trex: 3.5, raptor: 3.0, triceratops: 2.5, sauropod: 1.6, hadrosaur: 2.8, horse: 3.0, longhorn: 3.0, canid: 3.5, deer: 3.0, human: 2.6, car: 2.2, wagon: 2.5, truck: 1.5 };

export class Bodies {
  constructor(game) {
    this.g = game; this.R = game.R; this.world = game.phys.world;
    this.list = new Set();
    this.q = { x: 0, y: 0, z: 0, w: 1 };
    this.v = { x: 0, y: 0, z: 0 };
  }

  create(a, shapeKey, mass) {
    const R = this.R, sh = SHAPES[shapeKey];
    if (!sh) return null;
    const s = a.scale || 1;
    const bd = R.RigidBodyDesc.dynamic().setTranslation(a.x, a.y, a.z).setGravityScale(0).setLinearDamping(0).setAngularDamping(0.6).setCanSleep(false).lockRotations();
    const body = this.world.createRigidBody(bd);
    this.setYaw(body, a.yaw);
    let vol = 0; for (const p of sh) vol += p[0] === 'box' ? p[2][0] * p[2][1] * p[2][2] * 8 : Math.PI * p[3] * p[3] * (p[2] * 2 + p[3] * 4 / 3);
    const dens = mass / Math.max(1e-3, vol * s * s * s);
    const cols = [];
    for (const p of sh) {
      let d;
      if (p[0] === 'box') d = R.ColliderDesc.cuboid(p[2][0] * s, p[2][1] * s, p[2][2] * s);
      else d = R.ColliderDesc.capsule(p[2] * s, p[3] * s);
      d.setTranslation(p[1][0] * s, p[1][1] * s, p[1][2] * s);
      if (p[3] !== undefined && p[0] === 'box') { const h = p[3] / 2; d.setRotation({ x: Math.sin(h), y: 0, z: 0, w: Math.cos(h) }); }
      d.setDensity(dens).setFriction(0.6).setRestitution(0.1).setCollisionGroups(ALIVE);
      const c = this.world.createCollider(d, body);
      c.userData = { kind: 'prop', life: true, tag: shapeKey, agent: a };
      cols.push(c);
    }
    a.body = { b: body, cols, key: shapeKey, mass, cmd: { x: 0, y: 0, z: 0 }, bump: BUMP[shapeKey] || 3, loose: false, still: 0, age: 0 };
    this.list.add(a);
    return a.body;
  }

  setYaw(b, yaw) { const h = yaw / 2; this.q.x = 0; this.q.y = Math.sin(h); this.q.z = 0; this.q.w = Math.cos(h); b.setRotation(this.q, true); }

  remove(a) {
    if (!a.body) return;
    this.world.removeRigidBody(a.body.b);
    a.body = null;
    this.list.delete(a);
  }

  drive(a, dt, vx, vy, vz) {
    const B = a.body; if (!B || B.loose) return;
    const b = B.b, t = b.translation();
    const cx = (a.x - t.x) / Math.max(dt, 1 / 120), cz = (a.z - t.z) / Math.max(dt, 1 / 120);
    this.v.x = vx + Math.max(-20, Math.min(20, cx)) * 0.5; this.v.y = vy + Math.max(-20, Math.min(20, (a.y - t.y) / Math.max(dt, 1 / 120))) * 0.8; this.v.z = vz + Math.max(-20, Math.min(20, cz)) * 0.5;
    b.setLinvel(this.v, true);
    B.cmd.x = this.v.x; B.cmd.y = this.v.y; B.cmd.z = this.v.z;
    this.setYaw(b, a.yaw);
  }

  probe(a) {
    const B = a.body; if (!B || B.loose) return null;
    const lv = B.b.linvel(), dx = lv.x - B.cmd.x, dy = lv.y - B.cmd.y, dz = lv.z - B.cmd.z;
    const dv = Math.hypot(dx, dy, dz);
    if (dv > B.bump) return { dv, vx: lv.x, vy: lv.y, vz: lv.z };
    if (dv > 0.6) { const t = B.b.translation(); a.x = t.x; a.z = t.z; a.pushed = Math.min(1, (a.pushed || 0) + dv * 0.2); }
    return null;
  }

  loosen(a, hit) {
    const B = a.body; if (!B) return;
    const b = B.b;
    B.loose = true; B.still = 0; B.age = 0;
    b.setGravityScale(1, true);
    b.lockRotations(false, true);
    b.setAngularDamping(0.8);
    for (const c of B.cols) c.setCollisionGroups(LOOSE);
    const up = Math.min(8, hit.dv * 0.35);
    b.setLinvel({ x: hit.vx, y: Math.max(hit.vy, 0) + up, z: hit.vz }, true);
    const s = Math.min(6, hit.dv * 0.4) / Math.max(0.6, Math.cbrt(B.mass / 80));
    b.setAngvel({ x: (Math.random() - 0.5) * s * 2, y: (Math.random() - 0.5) * s, z: (Math.random() - 0.5) * s * 2 }, true);
  }

  settle(a, dt) {
    const B = a.body; if (!B || !B.loose) return false;
    B.age += dt;
    const lv = B.b.linvel(), av = B.b.angvel();
    const sp = Math.hypot(lv.x, lv.y, lv.z) + Math.hypot(av.x, av.y, av.z) * 0.5;
    B.still = sp < 0.6 ? B.still + dt : 0;
    const t = B.b.translation();
    if (t.y < this.g.valley.heightAt(t.x, t.z) - 3) { B.b.setTranslation({ x: t.x, y: this.g.valley.heightAt(t.x, t.z) + 0.5, z: t.z }, true); }
    return B.still > 1.2 || B.age > 9;
  }

  pose(a) {
    const B = a.body; if (!B) return null;
    const t = B.b.translation(), r = B.b.rotation();
    return { x: t.x, y: t.y, z: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w };
  }

  firm(a) {
    const B = a.body; if (!B) return;
    const b = B.b;
    B.loose = false;
    b.setGravityScale(0, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.lockRotations(true, true);
    this.setYaw(b, a.yaw);
    for (const c of B.cols) c.setCollisionGroups(ALIVE);
  }

  clear() { for (const a of [...this.list]) this.remove(a); }
}

export function eulerYXZ(qx, qy, qz, qw) {
  const m02 = 2 * (qx * qz + qw * qy), m12 = 2 * (qy * qz - qw * qx), m22 = 1 - 2 * (qx * qx + qy * qy);
  const m10 = 2 * (qx * qy + qw * qz), m11 = 1 - 2 * (qx * qx + qz * qz);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -m12)));
  const yaw = Math.atan2(m02, m22);
  const roll = Math.atan2(m10, m11);
  return [yaw, pitch, roll];
}
