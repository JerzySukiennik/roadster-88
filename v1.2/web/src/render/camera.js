// Roadster 88 cameras: spring-damped chase camera in the car's moving frame (orbit, recentre, look-ahead, speed FOV, shake, wall/ground avoidance) and the driver-eye FPP camera with head look.
import * as THREE from 'three/webgpu';

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

function noise1(t) { return Math.sin(t * 1.7) * 0.5 + Math.sin(t * 3.1 + 1.3) * 0.3 + Math.sin(t * 7.3 + 2.1) * 0.2; }

export class CameraRig {
  constructor(camera, tuning) {
    this.cam = camera; this.tu = tuning.camera;
    this.mode = 'chase';
    this.orbitYaw = 0; this.orbitPitch = 0; this.lastMouse = -99;
    this.heading = 0; this.offset = new THREE.Vector3(0, 2, -6); this.offVel = new THREE.Vector3();
    this.lookPos = new THREE.Vector3(); this.pos = new THREE.Vector3();
    this.fov = tuning.camera.fov_min; this.shake = 0; this.impact = 0; this.t = 0;
    this.fppYaw = 0; this.fppPitch = 0;
    this.hold = null; this.lag = new THREE.Vector3(); this.lagVel = new THREE.Vector3();
    this.initialized = false; this.heightAdj = 0;
  }

  addImpact(k) { this.impact = Math.min(1.5, this.impact + k); }

  mouse(dx, dy, now) {
    if (this.mode === 'chase') {
      this.orbitYaw -= dx * 0.0032; this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.0024, -0.35, 0.9);
      if (dx || dy) this.lastMouse = now;
    } else {
      const T = this.tu;
      this.fppYaw = THREE.MathUtils.clamp(this.fppYaw - dx * 0.0026, -T.fpp_yaw_limit_deg * Math.PI / 180, T.fpp_yaw_limit_deg * Math.PI / 180);
      this.fppPitch = THREE.MathUtils.clamp(this.fppPitch - dy * 0.0026, -T.fpp_pitch_limit_deg * Math.PI / 180, T.fpp_pitch_limit_deg * Math.PI / 180);
    }
  }

  updateChase(dt, s, now, raycast) {
    const T = this.tu;
    this.t += dt;
    const carPos = s.pos, q = s.quat;
    const fwd = tmpV.set(0, 0, 1).applyQuaternion(q);
    let carYaw = Math.atan2(fwd.x, fwd.z);
    const vh = Math.hypot(s.vel.x, s.vel.z);
    let target = carYaw;
    if (s.grounded && vh > 4 && s.fwdSpeed > 0) {
      const velYaw = Math.atan2(s.vel.x, s.vel.z);
      let d = velYaw - carYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      target = carYaw + d * 0.45;
    }
    if (s.reverse && vh > 1) target = carYaw;
    if (!this.initialized) { this.heading = target; }
    let dh = target - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const hs = Math.min(1, dt * (3.2 + Math.min(vh, 60) * 0.05));
    this.heading += dh * hs;
    if (now - this.lastMouse > T.recentre_after_s) {
      const k = Math.min(1, dt * 1.6);
      this.orbitYaw += (Math.atan2(Math.sin(-this.orbitYaw), Math.cos(-this.orbitYaw))) * k;
      this.orbitPitch += (0 - this.orbitPitch) * k;
    }
    const yaw = this.heading + this.orbitYaw;
    const mph = s.speed / 0.44704;
    const dist = T.chase_distance * (1 + 0.1 * THREE.MathUtils.smoothstep(mph, 30, 200)) + (s.airborne ? 0.6 : 0);
    const height = T.chase_height + this.orbitPitch * 3.2 + (s.airborne ? 0.25 : 0);
    const desired = tmpV2.set(-Math.sin(yaw) * dist * Math.cos(this.orbitPitch * 0.6), height, -Math.cos(yaw) * dist * Math.cos(this.orbitPitch * 0.6));
    if (!this.initialized) { this.offset.copy(desired); this.offVel.set(0, 0, 0); this.initialized = true; this.pos.copy(carPos).add(desired); }
    const k = T.follow_stiffness, c = 2 * Math.sqrt(k) * 0.9;
    const acc = desired.clone().sub(this.offset).multiplyScalar(k).addScaledVector(this.offVel, -c);
    this.offVel.addScaledVector(acc, dt);
    this.offset.addScaledVector(this.offVel, dt);
    const accLocal = s.accel.clone();
    const lagT = accLocal.multiplyScalar(-0.018);
    lagT.y *= 0.5;
    lagT.clampLength(0, 0.7);
    const la = lagT.sub(this.lag).multiplyScalar(30).addScaledVector(this.lagVel, -2 * Math.sqrt(30) * 0.85);
    this.lagVel.addScaledVector(la, dt); this.lag.addScaledVector(this.lagVel, dt);
    const camPos = carPos.clone().add(this.offset).add(this.lag);
    const look = carPos.clone().add(new THREE.Vector3(0, 0.75, 0));
    if (vh > 1) look.addScaledVector(new THREE.Vector3(s.vel.x, 0, s.vel.z).normalize(), T.look_ahead * Math.min(vh, 40) * 0.07);
    const pivot = carPos.clone().add(new THREE.Vector3(0, 0.9, 0));
    const dir = camPos.clone().sub(pivot); const len = dir.length(); dir.divideScalar(len || 1);
    const hit = raycast ? raycast(pivot, dir, len + 0.3) : null;
    let useLen = len;
    if (hit !== null && hit < len + 0.3) useLen = Math.max(1.2, hit - 0.35);
    camPos.copy(pivot).addScaledVector(dir, useLen);
    const gy = s.groundY !== undefined ? s.groundY : 0;
    if (camPos.y < gy + 0.45) camPos.y = gy + 0.45;
    this.pos.copy(camPos);
    this.lookPos.copy(look);
    const fovT = T.fov_min + (T.fov_max - T.fov_min) * THREE.MathUtils.smoothstep(mph, 0, T.fov_full_at_mph) + s.boost * 3.5;
    this.fov += (fovT - this.fov) * Math.min(1, dt * 2.5);
    this.shake = Math.max(s.boost * 0.5 + s.thrust * 0.35, THREE.MathUtils.smoothstep(mph, 120, 250) * 0.25);
    this.impact = Math.max(0, this.impact - dt * 1.8);
    this.apply(dt);
  }

  apply() {
    const cam = this.cam;
    if (this.hold) { cam.position.copy(this.hold.pos); cam.lookAt(this.hold.look); cam.fov = this.fov; cam.updateProjectionMatrix(); return; }
    const amp = this.shake * 0.02 + this.impact * 0.12, t = this.t * 6;
    cam.position.copy(this.pos);
    cam.position.x += noise1(t) * amp; cam.position.y += noise1(t + 17) * amp * 0.7; cam.position.z += noise1(t + 31) * amp;
    cam.lookAt(this.lookPos);
    cam.rotateZ(noise1(t + 50) * amp * 0.25);
    cam.near = 0.2;
    cam.fov = this.fov; cam.updateProjectionMatrix();
  }

  updateFpp(dt, eyeWorld, carQuat, s, focus) {
    const cam = this.cam;
    const qLook = tmpQ.setFromEuler(new THREE.Euler(this.fppPitch, this.fppYaw + Math.PI * 0, 0, 'YXZ'));
    const base = carQuat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    cam.quaternion.copy(base).multiply(qLook);
    const lean = s.accelLocal ? s.accelLocal : new THREE.Vector3();
    const off = new THREE.Vector3(THREE.MathUtils.clamp(-lean.x * 0.0025, -0.03, 0.03), THREE.MathUtils.clamp(-lean.y * 0.0015, -0.02, 0.02), THREE.MathUtils.clamp(-lean.z * 0.003, -0.04, 0.04)).applyQuaternion(carQuat);
    cam.position.copy(eyeWorld).add(off);
    this.focusK = (this.focusK || 0) + (((focus && focus.k) || 0) - (this.focusK || 0)) * Math.min(1, dt * 5);
    const fk = this.focusK * this.focusK * (3 - 2 * this.focusK);
    if (focus && fk > 0.001) cam.position.lerp(focus.p, fk * 0.42);
    this.t += dt;
    const amp = this.impact * 0.02 + s.boost * 0.002;
    cam.position.x += noise1(this.t * 9) * amp; cam.position.y += noise1(this.t * 9 + 7) * amp;
    this.impact = Math.max(0, this.impact - dt * 1.8);
    cam.near = 0.03;
    const fovT = 72 - 20 * fk;
    this.fov += (fovT - this.fov) * Math.min(1, dt * 4);
    cam.fov = this.fov; cam.updateProjectionMatrix();
  }

  gazeDir(out) { return out.set(0, 0, -1).applyQuaternion(this.cam.quaternion); }
}
