// Roadster 88 re-entry: five seconds of falling into the atmosphere from orbit, with a pulsing plasma sheath and a fiery wake around the car, sparks, an orange heat glow on the body, camera shake and roar, the Earth rushing up, then a white flash and the landing in the valley while the sheath cools off.
import * as THREE from 'three/webgpu';
import { fxMaterial } from '../render/gfx.js';
import { float, vec3, uniform, positionLocal, normalView, positionViewDirection, dot, abs, pow, clamp, smoothstep, mx_noise_float, time, mix } from 'three/tsl';

const DUR = 5.2;

export class Reentry {
  constructor(space) {
    this.S = space;
    this.k = uniform(0);
    this.mesh = null; this.t = 0; this.cool = 0; this.heat = 0;
  }

  build() {
    const m = fxMaterial(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.fog = false;
    const p = positionLocal;
    const fres = pow(float(1).sub(clamp(abs(dot(normalView, positionViewDirection.negate())), 0, 1)), float(1.6));
    const flow = mx_noise_float(vec3(p.x.mul(2.2), p.y.mul(0.9).sub(time.mul(9)), p.z.mul(2.2))).mul(0.5).add(0.5);
    const front = smoothstep(0.15, -1.0, p.y);
    const streak = mx_noise_float(vec3(p.x.mul(9), p.y.mul(1.2).sub(time.mul(14)), p.z.mul(9))).mul(0.5).add(0.5);
    const heat = flow.mul(0.55).add(0.45).mul(front.pow(1.5).mul(1.4).add(fres.mul(front.add(0.15)).mul(0.9))).mul(streak.mul(0.5).add(0.6));
    m.colorNode = mix(vec3(1.0, 0.22, 0.06), vec3(1.0, 0.82, 0.6), front.mul(flow)).add(vec3(0.5, 0.15, 0.6).mul(fres.mul(0.4))).mul(heat).mul(this.k).mul(3.2);
    m.opacityNode = clamp(heat.mul(this.k).mul(0.8), 0, 1);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 28), m);
    shell.scale.set(2.3, 1.9, 3.3); shell.position.y = -0.25;
    const tm = fxMaterial(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    tm.fog = false;
    const along = positionLocal.y.add(0.5);
    const tn = mx_noise_float(vec3(positionLocal.x.mul(5), along.mul(3).sub(time.mul(6)), positionLocal.z.mul(5))).mul(0.5).add(0.5);
    tm.colorNode = mix(vec3(1.0, 0.45, 0.12), vec3(0.6, 0.12, 0.3), along).mul(float(1).sub(along)).mul(tn).mul(this.k).mul(2.2);
    tm.opacityNode = float(1).sub(along).mul(tn).mul(this.k);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(2.6, 34, 24, 1, true), tm);
    tail.position.y = 18; tail.rotation.x = Math.PI;
    const g = new THREE.Group(); g.add(shell, tail); g.renderOrder = 14; g.visible = false;
    shell.renderOrder = 14; tail.renderOrder = 13;
    shell.frustumCulled = false; tail.frustumCulled = false;
    this.mesh = g;
    this.S.g.gfx.scene.add(g);
  }

  start() {
    if (!this.mesh) this.build();
    const S = this.S;
    this.t = 0; this.wall = 0; this.h0 = S.altitude(); this.mesh.visible = true; this.landed = false; this.flashed = false;
    S.g.audio.play('tc_fire_whoosh', { inside: true, gain: 0.7 });
  }

  place() {
    const car = this.S.g.car;
    this.mesh.position.copy(car.pose.pos);
  }

  update(dt) {
    const S = this.S, g = S.g;
    this.t += dt;
    this.wall = (this.wall || 0) + dt;
    if (this.wall > DUR + 8 && S.landing && !S.landing.result) S.landing.result = 'home';
    const t = this.t, u = Math.min(1, t / (DUR - 0.4));
    const e = u * u * (3 - 2 * u);
    const h = 55000 + (this.h0 - 55000) * Math.pow(1 - e, 1.6);
    S.orbit.displace(new THREE.Vector3(0, h - S.altitude(), 0));
    const k = THREE.MathUtils.smoothstep(t, 0.5, 2.4) * (1 - THREE.MathUtils.smoothstep(t, DUR - 0.5, DUR));
    this.k.value = k;
    this.heat = k * (0.85 + 0.3 * Math.random());
    this.place();
    g.rig.addImpact(dt * 2.6 * k);
    if (g.audio.setLoop) g.audio.setLoop('wind_storm_loop', Math.min(1, k * 1.2), 0.7 + k * 0.5, 0.15);
    const fx = g.fx, p = g.car.pose.pos;
    if (fx && fx.add && k > 0.05) {
      const n = Math.round(60 * k * dt * 60 / 4);
      for (let i = 0; i < n; i++) fx.add.spawn(p.x + (Math.random() - 0.5) * 4, p.y - 1.2 + Math.random() * 1.5, p.z + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, 25 + Math.random() * 30, (Math.random() - 0.5) * 3, 0.35 + Math.random() * 0.4, 0.25, 0.06, 2.4, 0.8, 0.25, 0.9 * k, 0.4, 0);
    }
    const ready = S.landingReady() || t > DUR + 8;
    if (!ready && t > DUR - 0.6) { this.t = DUR - 0.6; this.k.value = 1; }
    if (ready && t > DUR - 0.35 && !this.flashed) { this.flashed = true; g.timeFx.state.flash = 1; if (g.online && g.online.flagDepart) g.online.flagDepart(); g.audio.play('tc_boom_double', { inside: true, gain: 0.8 }); }
    if (ready && t >= DUR && !this.landed) {
      this.landed = true;
      if (g.audio.setLoop) g.audio.setLoop('wind_storm_loop', 0, 1, 0.6);
      S.landInValley();
      this.cool = 1.6;
    }
  }

  tick(dt) {
    if (!this.mesh || this.S.state === 'reentry') return;
    if (this.cool > 0) {
      this.cool -= dt;
      this.k.value = Math.pow(Math.max(0, this.cool / 1.6), 2) * 0.22;
      this.heat = this.k.value * 0.6;
      this.place();
      if (this.cool <= 0) { this.mesh.visible = false; this.k.value = 0; this.heat = 0; }
    }
  }
}
