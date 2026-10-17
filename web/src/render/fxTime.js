// Roadster 88 time-travel visuals: blue-white arcs crawling over the body while charging, implosion flash, twin fire trails or a burning ring at the departure point, arrival lightning and frost vapour.
import * as THREE from 'three/webgpu';
import { fxMaterial } from './gfx.js';
import { uniform, uv, vec3, float, mx_noise_float, time, smoothstep, mix, abs, normalView, positionViewDirection, dot, pow, clamp } from 'three/tsl';

const rnd = (a, b) => a + Math.random() * (b - a);

function fireMaterial(alphaU) {
  const m = fxMaterial(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const u = uv();
  const n = mx_noise_float(vec3(u.x.mul(14), u.y.mul(3).sub(time.mul(3.2)), time.mul(0.7))).mul(0.5).add(0.5);
  const n2 = mx_noise_float(vec3(u.x.mul(40), u.y.mul(8).sub(time.mul(6)), 3.3)).mul(0.5).add(0.5);
  const flame = smoothstep(0.0, 0.6, n.mul(0.7).add(n2.mul(0.5)).sub(u.y.mul(0.9)));
  const edge = smoothstep(0.0, 0.15, u.y).mul(float(1).sub(smoothstep(0.35, 1.0, u.y)));
  const heat = flame.mul(edge);
  m.colorNode = mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.75, 0.3), heat).mul(heat.mul(7.0)).mul(alphaU);
  m.opacityNode = heat.mul(alphaU).clamp(0, 1);
  return m;
}

function groundFireMaterial(alphaU) {
  const m = fxMaterial(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const u = uv();
  const across = float(1).sub(abs(u.x.sub(0.5)).mul(2)).clamp(0, 1);
  m.colorNode = vec3(1.0, 0.32, 0.05).mul(across.mul(across).mul(3.5)).mul(alphaU);
  m.opacityNode = across.mul(alphaU);
  return m;
}

export class TimeFX {
  constructor(scene, fx, mats) {
    this.scene = scene; this.fx = fx; this.mats = mats;
    const max = 64 * 12;
    this.arcPos = new Float32Array(max * 2 * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.arcIntensity = uniform(0);
    const lm = fxMaterial(new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    lm.colorNode = vec3(0.55, 0.75, 1.0).mul(this.arcIntensity.mul(22));
    this.arcs = new THREE.LineSegments(g, lm); this.arcs.frustumCulled = false; this.arcs.renderOrder = 12;
    scene.add(this.arcs);
    this.arcTimer = 0; this.surface = [];
    this.implU = uniform(0);
    const im = fxMaterial(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const fres = pow(float(1).sub(clamp(dot(normalView, positionViewDirection.negate()).abs(), 0, 1)), float(2.5));
    im.colorNode = vec3(0.7, 0.85, 1.0).mul(fres.mul(30).add(2)).mul(this.implU);
    im.opacityNode = this.implU;
    this.implosion = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), im); this.implosion.visible = false; this.implosion.renderOrder = 13; this.implosion.frustumCulled = false;
    scene.add(this.implosion);
    this.trails = [];
    this.trailAlpha = uniform(1);
    this.fireMat = fireMaterial(this.trailAlpha);
    this.groundFire = groundFireMaterial(this.trailAlpha);
    this.state = { charge: 0, flash: 0, arrive: 0, frost: 0 };
  }

  setSurface(root) {
    const pts = [];
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.visible) return;
      if (!/Body|Hood|Bumper|Door|Roof|Glass|Mirror|Wing/.test(o.name)) return;
      const p = o.geometry.attributes.position; const step = Math.max(1, Math.floor(p.count / 120));
      for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv); pts.push(v.clone()); }
    });
    this.surface = pts;
  }

  buildArcs(count, carMatrix, spread = 1) {
    const S = this.surface; if (!S.length) return 0;
    let k = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let c = 0; c < count; c++) {
      a.copy(S[(Math.random() * S.length) | 0]);
      b.copy(a); let best = null, bd = 1e9;
      for (let t = 0; t < 8; t++) { const cand = S[(Math.random() * S.length) | 0]; const d = Math.abs(cand.distanceTo(a) - 0.9 * spread); if (d < bd) { bd = d; best = cand; } }
      b.copy(best);
      const segs = 10;
      p.copy(a);
      for (let s = 1; s <= segs; s++) {
        q.lerpVectors(a, b, s / segs);
        if (s < segs) q.add(new THREE.Vector3(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)).multiplyScalar(0.07 * spread));
        q.y += Math.sin(s / segs * Math.PI) * 0.06 * spread;
        const wa = p.clone().applyMatrix4(carMatrix), wb = q.clone().applyMatrix4(carMatrix);
        this.fx.add.spawn(wb.x, wb.y, wb.z, 0, 0, 0, 0.07, 0.045 * spread, 0.02, 2.2, 3.4, 6, 0.9, 1, 0);
        if (k + 6 > this.arcPos.length) return k / 3;
        this.arcPos.set([wa.x, wa.y, wa.z, wb.x, wb.y, wb.z], k); k += 6;
        p.copy(q);
      }
      if (Math.random() < 0.5) { const w = a.clone().applyMatrix4(carMatrix); this.fx.add.spawn(w.x, w.y, w.z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(0.08, 0.2), 0.12, 0.02, 3, 4.5, 8, 1, 3, 0); }
    }
    return k / 3;
  }

  depart(carPos, carQuat, vel, grounded, wheelPts, opts = {}) {
    const v = new THREE.Vector3(vel.x, vel.y, vel.z);
    const dir = v.clone(); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1).applyQuaternion(carQuat); dir.normalize();
    this.implosion.position.copy(carPos).add(new THREE.Vector3(0, 0.6, 0));
    this.implosion.visible = true; this.implT = 0;
    if (grounded) {
      const len = Math.max(18, Math.min(60, v.length() * 0.7));
      for (const wp of wheelPts) {
        const g = new THREE.PlaneGeometry(0.5, len, 1, 4); g.rotateX(-Math.PI / 2); g.translate(0, 0.03, len / 2);
        const mesh = new THREE.Mesh(g, this.groundFire); mesh.frustumCulled = false; mesh.renderOrder = 9;
        mesh.position.set(wp.x, wp.y, wp.z); mesh.lookAt(wp.x + dir.x, wp.y, wp.z + dir.z);
        mesh.scale.set(1, 1, 0.001);
        this.scene.add(mesh);
        this.trails.push({ mesh, t: 0, len, dir: dir.clone(), base: new THREE.Vector3(wp.x, wp.y, wp.z) });
      }
      this.fx.dustBurst(carPos, 14, 1.4);
    } else {
      const g = new THREE.TorusGeometry(2.3, 0.35, 12, 48);
      const mesh = new THREE.Mesh(g, this.fireMat); mesh.position.copy(carPos).add(new THREE.Vector3(0, 0.6, 0));
      mesh.lookAt(mesh.position.clone().add(dir)); mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.trails.push({ mesh, t: 0, len: 0, ring: true, base: mesh.position.clone(), dir });
    }
    if (!opts.remote) this.state.flash = 1;
  }

  arrive() { this.state.arrive = 1; this.state.frost = 1; this.arrT = 0; }

  update(dt, tc, carMatrix, carPos, gfx, T, visibleCar) {
    const st = this.state;
    let arcsOn = 0, spread = 1;
    if (tc.state === 'charging') { arcsOn = tc.charge; spread = 0.6 + tc.charge * 0.8; }
    if (tc.state === 'departing') { arcsOn = 1.4; spread = 1.6; }
    if (st.arrive > 0) { arcsOn = Math.max(arcsOn, st.arrive * 1.6); spread = 1.4; }
    this.arcTimer -= dt;
    if (arcsOn > 0.02 && visibleCar) {
      if (this.arcTimer <= 0) { this.arcTimer = rnd(0.03, 0.07); const n = this.buildArcs(Math.ceil(2 + arcsOn * 9), carMatrix, spread); this.arcs.geometry.setDrawRange(0, n); this.arcs.visible = n > 0; this.arcs.geometry.attributes.position.needsUpdate = true; }
      this.arcIntensity.value = arcsOn * rnd(0.6, 1.2);
    } else { this.arcIntensity.value = 0; this.arcs.geometry.setDrawRange(0, 0); this.arcs.visible = false; }
    this.mats.u.arcGlow.value = arcsOn * 0.18 * rnd(0.6, 1.0);
    if (this.implosion.visible) {
      this.implT += dt;
      const k = this.implT / Math.max(0.05, T.flash_s);
      const r = Math.max(0.01, 5.5 * (1 - k) * (1 - k));
      this.implosion.scale.setScalar(r);
      this.implU.value = Math.max(0, 1 - k * 0.6);
      if (k >= 1) this.implosion.visible = false;
    }
    if (st.flash > 0) { st.flash = Math.max(0, st.flash - dt / Math.max(0.05, T.flash_s * 1.6)); }
    if (st.arrive > 0) { this.arrT += dt; st.arrive = Math.max(0, 1 - this.arrT / 0.7); }
    if (st.frost > 0) {
      st.frost = Math.max(0, st.frost - dt / T.arrival_vapour_s);
      this.mats.u.frost.value = Math.pow(st.frost, 1.4) * 0.8;
      if (visibleCar && this.surface.length) {
        const n = this.fx.rate('vapour', 45 * st.frost, dt);
        for (let i = 0; i < n; i++) {
          const p = this.surface[(Math.random() * this.surface.length) | 0].clone().applyMatrix4(carMatrix);
          this.fx.alpha.spawn(p.x, p.y, p.z, rnd(-0.4, 0.4), rnd(0.2, 0.9), rnd(-0.4, 0.4), rnd(0.8, 1.6), 0.1, rnd(0.4, 0.9), 1, 1, 1, 0.14 * st.frost, 1.2, 0.35);
        }
      }
    } else this.mats.u.frost.value = 0;
    this.flashLevel = Math.max(st.flash, st.arrive * st.arrive * 0.6);
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      tr.t += dt;
      const life = T.fire_trail_life_s;
      const fade = tr.t < life - 1.5 ? 1 : Math.max(0, (life - tr.t) / 1.5);
      if (!tr.ring) {
        tr.mesh.scale.z = Math.min(1, tr.t / 0.35) + 0.001;
        const n = this.fx.rate('trail' + i, 420 * fade, dt);
        for (let k = 0; k < n; k++) {
          const along = Math.random() * tr.len * tr.mesh.scale.z;
          const p = tr.base.clone().addScaledVector(tr.dir, along);
          const hot = Math.random();
          this.fx.add.spawn(p.x + rnd(-0.18, 0.18), p.y + 0.12, p.z + rnd(-0.18, 0.18), rnd(-0.25, 0.25), rnd(1.2, 3.2), rnd(-0.25, 0.25), rnd(0.25, 0.6), rnd(0.35, 0.7), 0.1, 2.6 + hot * 1.4, 0.65 + hot * 0.6, 0.12 + hot * 0.2, 0.8 * fade, 1.5, 1.5);
        }
        if (Math.random() < 0.25 * fade) { const p = tr.base.clone().addScaledVector(tr.dir, Math.random() * tr.len); this.fx.alpha.spawn(p.x, p.y + 0.6, p.z, rnd(-0.3, 0.3), rnd(1, 2.2), rnd(-0.3, 0.3), rnd(1.5, 2.6), 0.5, rnd(1.6, 2.6), 0.18, 0.16, 0.15, 0.35 * fade, 0.8, 0.6); }
      } else {
        tr.mesh.scale.setScalar(1 + tr.t * 0.08);
      }
      this.trailAlpha.value = fade;
      if (tr.t >= life) { this.scene.remove(tr.mesh); tr.mesh.geometry.dispose(); this.trails.splice(i, 1); }
    }
    if (!this.trails.length) this.trailAlpha.value = 1;
  }
}
