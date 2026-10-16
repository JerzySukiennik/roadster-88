// Roadster 88 sky and light: Preetham sky with clouds and stars, real solar position from date and hour, cascaded sun shadows, moon light at night, aerial haze and a lightweight environment capture for reflections.
import * as THREE from 'three/webgpu';
import { uniform, vec3, vec4, float, hash, floor, normalize, positionWorld, cameraPosition, smoothstep, fog, exp, length, max, color } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';

const LAT = 52.6 * Math.PI / 180;
const D2R = Math.PI / 180;

export function dayOfYear(month, day) {
  const md = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return md[Math.max(0, Math.min(11, month - 1))] + day;
}

export function solarPosition(month, day, hour) {
  const N = dayOfYear(month, day);
  const dec = -23.44 * D2R * Math.cos((2 * Math.PI / 365) * (N + 10));
  const H = (hour - 12) * 15 * D2R;
  const sinEl = Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(LAT) - Math.tan(dec) * Math.cos(LAT)) + Math.PI;
  return { el, az };
}

export function dirFromAzEl(az, el, out = new THREE.Vector3()) {
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

export class SkySystem {
  constructor(gfx, preset) {
    this.gfx = gfx;
    const scene = gfx.scene, renderer = gfx.renderer;
    this.u = { night: uniform(0), skyGain: uniform(1), haze: uniform(new THREE.Color(0.7, 0.78, 0.88)), starGain: uniform(1) };
    const sky = new SkyMesh();
    sky.scale.setScalar(8000);
    sky.frustumCulled = false;
    sky.turbidity.value = 2.6; sky.rayleigh.value = 1.25; sky.mieCoefficient.value = 0.004; sky.mieDirectionalG.value = 0.8;
    sky.cloudCoverage.value = 0.32; sky.cloudDensity.value = 0.35; sky.cloudElevation.value = 0.55; sky.cloudScale.value = 0.00018;
    const base = sky.material.colorNode;
    const dir = normalize(positionWorld.sub(cameraPosition));
    const cell = floor(dir.mul(900));
    const h = hash(cell.x.add(cell.y.mul(57.1)).add(cell.z.mul(113.7)));
    const twinkle = hash(cell.x.mul(3.1).add(cell.z));
    const star = smoothstep(0.9982, 1.0, h).mul(twinkle.mul(0.7).add(0.3)).mul(smoothstep(-0.02, 0.15, dir.y)).mul(1.4);
    const milky = smoothstep(0.55, 1.0, float(1).sub(dir.x.add(dir.y.mul(0.3)).abs())).mul(0.012);
    sky.material.colorNode = vec4(base.rgb.mul(this.u.skyGain).add(vec3(star.add(milky)).mul(this.u.night).mul(this.u.starGain)).add(vec3(0.0016, 0.0022, 0.0045).mul(this.u.night)), 1);
    this.sky = sky;
    scene.add(sky);

    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    sun.shadow.camera.layers.enable(1);
    this.sun = sun;
    scene.add(sun, sun.target);
    this.applyShadowPreset(preset);

    const dist = length(positionWorld.sub(cameraPosition));
    this.twilight = new THREE.HemisphereLight(0x6f86c8, 0x2a2622, 0);
    scene.add(this.twilight);
    const fogFactor = float(1).sub(exp(dist.div(-5200))).mul(exp(max(positionWorld.y, 0).div(-900))).mul(0.92);
    scene.fogNode = fog(color(this.u.haze), fogFactor);

    this.envScene = new THREE.Scene();
    const envSky = new SkyMesh();
    envSky.scale.setScalar(8000); envSky.frustumCulled = false; envSky.showSunDisc.value = 0;
    envSky.material.colorNode = vec4(envSky.material.colorNode.rgb.mul(this.u.skyGain).add(vec3(0.0016, 0.0022, 0.0045).mul(this.u.night)), 1);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG', 'cloudCoverage', 'cloudDensity', 'cloudElevation', 'cloudScale']) envSky[k].value = sky[k].value;
    this.envScene.add(envSky); this.envSky = envSky;
    this.lastCapture = new THREE.Vector3(1e9, 0, 0); this.captureAge = 99;
    this.envLight = new THREE.DirectionalLight(0xffffff, 2.5);
    this.envScene.add(this.envLight, this.envLight.target);
    this.envFill = new THREE.HemisphereLight(0xbfd4ff, 0x6b6660, 0.6);
    this.envScene.add(this.envFill);
    this.envRT = null; this.cubeCam = null;
    this.buildEnvTarget(preset.envSize || 128);
    this.envCounter = 0;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.state = { el: 0.4, az: 3.4, night: 0 };
    this.anchor = new THREE.Vector3();
  }

  buildEnvTarget(size) {
    if (this.envRT) this.envRT.dispose();
    this.envRT = new THREE.CubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCam = new THREE.CubeCamera(0.5, 9000, this.envRT);
    this.envScene.add(this.cubeCam);
    this.gfx.scene.environment = this.envRT.texture;
    this.envSize = size;
    this.envDirty = true;
  }

  applyShadowPreset(P) {
    const s = this.sun.shadow;
    s.mapSize.set(P.shadowMap, P.shadowMap);
    if (s.map) { s.map.dispose(); s.map = null; }
    const box = this.fpp ? Math.min(P.shadowBox, 18) : P.shadowBox;
    const h = box / 2, c = s.camera;
    c.left = -h; c.right = h; c.top = h; c.bottom = -h; c.near = 1; c.far = 900;
    c.updateProjectionMatrix();
    s.bias = -0.0002;
    s.normalBias = 0.02;
    s.radius = 1.6;
    this.texel = box / P.shadowMap;
    if (this.envSize && P.envSize && P.envSize !== this.envSize) this.buildEnvTarget(P.envSize);
    this.preset = P;
  }

  addEnvProxy(obj) { this.envScene.add(obj); }

  setTime(month, day, hour) {
    const { el, az } = solarPosition(month, day, hour);
    this.state.el = el; this.state.az = az;
    const night = 1 - THREE.MathUtils.smoothstep(el, -10 * D2R, 2 * D2R);
    this.state.night = night;
    dirFromAzEl(az, el, this.sunDir);
    const skyEl = el > -9 * D2R ? Math.max(el, 1.2 * D2R) : el;
    const skyDir = dirFromAzEl(az, skyEl, new THREE.Vector3());
    this.sky.sunPosition.value.copy(skyDir).multiplyScalar(1000);
    if (this.envSky) this.envSky.sunPosition.value.copy(skyDir).multiplyScalar(1000);
    this.u.night.value = night * night;
    const dayF = THREE.MathUtils.smoothstep(el, -3 * D2R, 10 * D2R);
    const golden = 1 - THREE.MathUtils.smoothstep(el, 4 * D2R, 28 * D2R);
    const sunCol = new THREE.Color(1, 0.97, 0.92).lerp(new THREE.Color(1.0, 0.56, 0.26), golden * 0.85);
    const moonDir = dirFromAzEl(az + Math.PI, 38 * D2R, new THREE.Vector3());
    const useMoon = dayF < 0.02;
    const ldir = useMoon ? moonDir : this.sunDir.clone().setY(Math.max(this.sunDir.y, 0.02)).normalize();
    this.lightDir = ldir;
    this.sun.color.copy(useMoon ? new THREE.Color(0.55, 0.65, 1.0) : sunCol);
    this.sun.intensity = useMoon ? 0.22 : 11 * dayF * (0.5 + 0.5 * (1 - golden));
    this.u.skyGain.value = 0.16 * (0.04 + 0.96 * THREE.MathUtils.smoothstep(el, -9 * D2R, 1 * D2R));
    this.haze = new THREE.Color(0.66, 0.74, 0.86).lerp(new THREE.Color(0.95, 0.66, 0.45), golden * 0.6).multiplyScalar(0.25 + 0.75 * dayF).lerp(new THREE.Color(0.012, 0.016, 0.03), night);
    const twl = 1 - THREE.MathUtils.smoothstep(el, -7 * D2R, 6 * D2R);
    this.haze.multiplyScalar(1 - 0.8 * twl);
    this.u.haze.value.copy(this.haze);
    const tw = 1 - THREE.MathUtils.smoothstep(el, -7 * D2R, 6 * D2R);
    this.exposure = THREE.MathUtils.lerp(0.42, 1.7, tw) * (1 + night * 0.7) * (1 + golden * 0.2 * dayF);
    this.twilight.intensity = 0.5 * tw * (1 - 0.75 * night);
    this.twilight.color.setRGB(0.42, 0.52, 0.85).lerp(new THREE.Color(0.25, 0.3, 0.5), night);
    this.envLight.color.copy(this.sun.color); this.envLight.intensity = this.sun.intensity;
    this.envLight.position.copy(ldir).multiplyScalar(100); this.envLight.target.position.set(0, 0, 0);
    this.envFill.intensity = 0.05 + 0.25 * dayF;
    this.envFill.color.setRGB(0.75, 0.85, 1.0).multiplyScalar(0.25 + 0.75 * dayF).lerp(new THREE.Color(0.05, 0.07, 0.12), night);
    this.envFill.groundColor.setRGB(0.42, 0.4, 0.37).multiplyScalar(0.2 + 0.8 * dayF);
    this.envDirty = true;
  }

  update(dt, anchor, force, view) {
    const L = this.lightDir || this.sunDir;
    this.anchor.copy(anchor);
    const c = this.focus || (this.focus = new THREE.Vector3());
    c.copy(anchor);
    if (view && !this.fpp) c.addScaledVector(view, this.preset.shadowBox * 0.22);
    const t = this.texel;
    const lq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), L);
    const local = c.clone().applyQuaternion(lq.clone().invert());
    local.x = Math.round(local.x / t) * t; local.y = Math.round(local.y / t) * t;
    c.copy(local.applyQuaternion(lq));
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(L, 400);
    this.captureAge += dt;
    const moved = this.lastCapture.distanceTo(anchor);
    const every = this.preset.envEvery;
    if (force || this.envDirty || (every > 0 && !this.envOff && moved > 30 && this.captureAge > every / 10)) {
      this.envDirty = false; this.captureAge = 0; this.lastCapture.copy(anchor);
      this.captureEnv(anchor);
    }
  }

  captureEnv(anchor) {
    this.captures = (this.captures || 0) + 1;
    this.cubeCam.position.set(anchor.x, Math.max(1.2, anchor.y + 1.0), anchor.z);
    this.cubeCam.update(this.gfx.renderer, this.envScene);
    this.envRT.texture.needsPMREMUpdate = true;
  }
}
