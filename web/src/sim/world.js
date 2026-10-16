// Roadster 88 physics world: Rapier statics and dynamic props built from the layout, fixed stepping with contact-force events, and thrust plume pushes on light props. Pure JS, Rapier injected.
import { V3, Quat } from './math.js';
import { GROUP, groups } from './car.js';
import { groundRects } from './layout.js';

const PROP = {
  cone: { mass: 4.2, shape: (R) => R.ColliderDesc.cone(0.35, 0.2), friction: 0.7 },
  barrel: { mass: 22, shape: (R) => R.ColliderDesc.cylinder(0.44, 0.29), friction: 0.5 },
  pallet: { mass: 21, shape: (R) => R.ColliderDesc.cuboid(0.6, 0.072, 0.5), friction: 0.8 },
};
const HALF_H = { cone: 0.35, barrel: 0.44, pallet: 0.072 };

export class PhysicsWorld {
  constructor(R, tuning, layout) {
    this.R = R; this.tu = tuning; this.L = layout;
    this.world = new R.World({ x: 0, y: -tuning.gravity, z: 0 });
    this.world.timestep = 1 / tuning.physics_hz;
    this.eq = new R.EventQueue(true);
    this.statics = [];
    const sg = groups(GROUP.STATIC, 0xffff);
    for (const [x0, z0, x1, z1] of groundRects(layout)) {
      const d = R.ColliderDesc.cuboid((x1 - x0) / 2, 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, -2, (z0 + z1) / 2).setFriction(0.9).setCollisionGroups(sg);
      this.addStatic(d, { kind: 'ground', tag: 'ground' });
    }
    const outer = R.ColliderDesc.cuboid(9000, 2, 9000).setTranslation(0, -2.3, 0).setFriction(0.7).setCollisionGroups(sg);
    this.addStatic(outer, { kind: 'ground', tag: 'dirt' });
    const q = new Quat();
    for (const s of layout.statics) {
      let d = null;
      if (s.kind === 'box') { q.setFromYaw(s.rotY || 0); d = R.ColliderDesc.cuboid(...s.half).setTranslation(...s.pos).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); }
      else if (s.kind === 'cyl') d = R.ColliderDesc.cylinder(s.h / 2, s.r).setTranslation(...s.pos);
      else if (s.kind === 'hull') d = R.ColliderDesc.convexHull(new Float32Array(s.points.flat()));
      else if (s.kind === 'mesh' && s.collide) d = R.ColliderDesc.trimesh(new Float32Array(s.positions), new Uint32Array(s.indices));
      if (!d) continue;
      d.setFriction(s.tag === 'loop' || s.tag === 'halfpipe' || s.tag === 'bank' ? 1.0 : 0.75).setCollisionGroups(sg);
      this.addStatic(d, { kind: s.kind, tag: s.tag, r: s.r, mat: s.mat });
    }
    this.props = [];
    for (const p of layout.props) {
      const def = PROP[p.type];
      q.setFromYaw(p.rotY || 0);
      const b = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.pos[0], p.pos[1] + HALF_H[p.type] + 0.002, p.pos[2]).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.05).setAngularDamping(0.3).setCanSleep(true).setSleeping(true));
      const c = this.world.createCollider(def.shape(R).setMass(def.mass).setFriction(def.friction).setRestitution(0.2).setCollisionGroups(groups(GROUP.PROP, 0xffff)), b);
      c.userData = { kind: 'prop', type: p.type };
      this.props.push({ type: p.type, body: b, collider: c, mass: def.mass, home: p });
    }
    this.contactHandlers = [];
    this._o = new V3(); this._d = new V3(); this._r = new V3(); this._g = new V3();
  }

  addStatic(desc, data) {
    const c = this.world.createCollider(desc);
    c.userData = data;
    this.statics.push(c);
    return c;
  }

  step(onContact) {
    this.world.step(this.eq);
    this.eq.drainContactForceEvents((e) => {
      const c1 = this.world.getCollider(e.collider1()), c2 = this.world.getCollider(e.collider2());
      if (!c1 || !c2) return;
      const dir = e.maxForceDirection();
      onContact && onContact(c1, c2, e.totalForceMagnitude(), { x: dir.x, y: dir.y, z: dir.z });
    });
  }

  thrustOnProps(car, dt) {
    const th = car.thrusters;
    const o = this._o, d = this._d, r = this._r;
    for (const n of th.all) {
      if (!n.attached || n.valve < 0.04) continue;
      car.toWorld(n.pos, o);
      d.copy(n.dir).scale(-1).applyQuat(car.q);
      const F = n.valve * n.thrustMax * n.health;
      const gHit = n.groundDist < 6 && d.y < -0.3;
      const gx = o.x + d.x * n.groundDist, gz = o.z + d.z * n.groundDist;
      for (const p of this.props) {
        const t = p.body.translation();
        r.set(t.x - o.x, t.y - o.y, t.z - o.z);
        const along = r.dot(d);
        let ix = 0, iy = 0, iz = 0;
        if (along > 0 && along < 16) {
          const lat = Math.sqrt(Math.max(0, r.lenSq() - along * along));
          const rad = 0.3 + along * 0.32;
          if (lat < rad) {
            const k = F * 0.012 / (1 + along * along * 0.05) * (1 - lat / rad);
            ix += d.x * k; iy += d.y * k; iz += d.z * k;
          }
        }
        if (gHit) {
          const dx = t.x - gx, dz = t.z - gz, rr = Math.hypot(dx, dz);
          if (rr < 9 && rr > 0.01) {
            const k = F * 0.006 * (1 - n.groundDist / 6) / (1 + rr * rr * 0.12);
            ix += dx / rr * k; iz += dz / rr * k; iy += k * 0.35;
          }
        }
        if (ix || iy || iz) p.body.applyImpulse({ x: ix * dt, y: iy * dt, z: iz * dt }, true);
      }
    }
  }

  resetProps() {
    for (const p of this.props) {
      const h = p.home;
      p.body.setTranslation({ x: h.pos[0], y: h.pos[1] + HALF_H[p.type] + 0.002, z: h.pos[2] }, false);
      const q = new Quat().setFromYaw(h.rotY || 0);
      p.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, false);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, false); p.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      p.body.sleep(); p.synced = false;
    }
  }
}
