// Roadster 88 sky and light: Preetham sky with clouds and stars, real solar position from date and hour, cascaded sun shadows, moon light at night, aerial haze, per-era sky presets (tint, haze, fog, sun, exposure) and a lightweight environment capture for reflections.
import * as THREE from 'three/webgpu';
import { uniform, vec3, vec4, float, hash, floor, normalize, positionWorld, cameraPosition, smoothstep, fog, exp, length, max, abs, select, mix, cubeTexture, color } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';

const LAT = 52.6 * Math.PI / 180;
const D2R = Math.PI / 180;

export const SKY_NEUTRAL = {
  turbidity: 2.6, rayleigh: 1.25, mie: 0.004, mieG: 0.8,
  clouds: 0.32, cloudDensity: 0.35, cloudElevation: 0.55, cloudScale: 0.00018,
  tint: [1, 1, 1], gain: 1, stars: 1,
  sunTint: [1, 1, 1], sunGain: 1, moonGain: 1,
  haze: null, hazeMix: 0, hazeTint: [1, 1, 1],
  fogDist: 5200, fogHeight: 900, fogMax: 0.92,
  exposure: 1, ambient: 1, envGround: [1, 1, 1],
};

export const WX_NEUTRAL = { clouds: null, dens: null, dark: 0, grey: 0, fogMul: 1, fogHeight: 0, sunMul: 1, haze: [0.55, 0.45, 0.32], hazeMix: 0 };

export const SKY_ERAS = {
  hadean: { turbidity: 10, rayleigh: 0.6, mie: 0.03, mieG: 0.86, clouds: 0.62, cloudDensity: 0.75, cloudElevation: 0.35, cloudScale: 0.00022, tint: [1.9, 0.5, 0.24], gain: 0.62, stars: 0.5, sunTint: [1, 0.5, 0.3], sunGain: 0.34, moonGain: 2.2, haze: [0.5, 0.2, 0.1], hazeMix: 0.82, fogDist: 1700, fogHeight: 520, fogMax: 0.95, exposure: 1.15, ambient: 1.1, envGround: [0.4, 0.15, 0.08] },
  dino: { turbidity: 5.2, rayleigh: 1.6, mie: 0.009, mieG: 0.82, clouds: 0.5, cloudDensity: 0.45, cloudElevation: 0.6, cloudScale: 0.00016, tint: [0.96, 1.02, 0.98], gain: 1, sunTint: [1, 0.95, 0.86], sunGain: 0.95, haze: [0.62, 0.72, 0.7], hazeMix: 0.45, fogDist: 2600, fogHeight: 700, fogMax: 0.94, exposure: 1.05, ambient: 1.15, envGround: [0.55, 0.75, 0.45] },
  1885: { turbidity: 3.4, rayleigh: 1.15, mie: 0.006, mieG: 0.82, clouds: 0.16, cloudDensity: 0.3, cloudElevation: 0.6, tint: [1.04, 1.0, 0.94], sunTint: [1, 0.96, 0.88], haze: [0.8, 0.74, 0.62], hazeMix: 0.3, fogDist: 4800, exposure: 1.0, envGround: [1.15, 1.0, 0.75] },
  2026: {},
  2080: { turbidity: 3.0, rayleigh: 1.35, mie: 0.005, clouds: 0.26, cloudDensity: 0.3, tint: [1.0, 0.98, 1.02], sunTint: [1, 0.97, 0.95], fogDist: 5600, exposure: 1.15, ambient: 1.4 },
  ruins: { turbidity: 4.4, rayleigh: 1.5, mie: 0.008, mieG: 0.84, clouds: 0.42, cloudDensity: 0.4, cloudElevation: 0.5, tint: [1.02, 0.95, 0.96], sunTint: [1, 0.9, 0.82], haze: [0.62, 0.62, 0.58], hazeMix: 0.35, fogDist: 3000, fogHeight: 650, fogMax: 0.94, exposure: 1.35, ambient: 1.8, envGround: [0.6, 0.72, 0.5] },
  scifi: { turbidity: 1.7, rayleigh: 1.0, mie: 0.0025, mieG: 0.78, clouds: 0.1, cloudDensity: 0.25, cloudElevation: 0.7, tint: [0.92, 0.98, 1.08], stars: 2.4, sunTint: [0.98, 0.98, 1.0], moonGain: 1.6, haze: [0.55, 0.66, 0.85], hazeMix: 0.25, fogDist: 7000, exposure: 1.0, ambient: 1.25, envGround: [0.7, 0.75, 0.9] },
};

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
    this.u = { night: uniform(0), skyGain: uniform(1), haze: uniform(new THREE.Color(0.7, 0.78, 0.88)), starGain: uniform(1), skyTint: uniform(new THREE.Color(1, 1, 1)), fogDist: uniform(5200), fogHeight: uniform(900), fogMax: uniform(0.92), skyFog: uniform(1), wxHaze: uniform(new THREE.Color(0.55, 0.45, 0.32)), wxHazeMix: uniform(0), wxFlash: uniform(0), wxGrey: uniform(0) };
    this.wx = { ...WX_NEUTRAL };
    this.era = { ...SKY_NEUTRAL };
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
    const greyed = (c) => mix(c, vec3(c.dot(vec3(0.3, 0.55, 0.15))).mul(vec3(0.95, 0.98, 1.04)), this.u.wxGrey);
    sky.material.colorNode = vec4(greyed(base.rgb).mul(this.u.skyGain).mul(this.u.skyTint).mul(this.u.wxFlash.mul(7).add(1)).add(vec3(star.add(milky)).mul(this.u.night).mul(this.u.starGain)).add(vec3(0.0016, 0.0022, 0.0045).mul(this.u.night)), 1);
    this.sky = sky;
    scene.add(sky);

    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    sun.shadow.camera.layers.enable(1);
    this.sun = sun;
    scene.add(sun, sun.target);
    this.applyShadowPreset(preset);

    this.fogScene = new THREE.Scene();
    const fogSky = new SkyMesh();
    fogSky.scale.setScalar(8000); fogSky.frustumCulled = false; fogSky.showSunDisc.value = 0;
    fogSky.material.colorNode = vec4(greyed(fogSky.material.colorNode.rgb).mul(this.u.skyGain).mul(this.u.skyTint).add(vec3(0.0016, 0.0022, 0.0045).mul(this.u.night)), 1);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG', 'cloudCoverage', 'cloudDensity', 'cloudElevation', 'cloudScale']) fogSky[k].value = sky[k].value;
    this.fogScene.add(fogSky); this.fogSky = fogSky;
    this.fogRT = new THREE.CubeRenderTarget(32, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.fogCam = new THREE.CubeCamera(1, 9000, this.fogRT);
    this.fogScene.add(this.fogCam);
    const dist = length(positionWorld.sub(cameraPosition));
    this.twilight = new THREE.HemisphereLight(0x6f86c8, 0x2a2622, 0);
    scene.add(this.twilight);
    this.flashLight = new THREE.HemisphereLight(0xd8e0ff, 0x30323a, 0);
    scene.add(this.flashLight);
    const H = this.u.fogHeight, yc = max(cameraPosition.y, 0), yp = max(positionWorld.y, 0), dy = yp.sub(yc);
    const ec = exp(yc.div(H).negate()), ep = exp(yp.div(H).negate());
    const along = select(abs(dy).greaterThan(0.5), ec.sub(ep).div(dy.div(H)), ec);
    const fogFactor = float(1).sub(exp(dist.div(this.u.fogDist).mul(along).negate())).mul(this.u.fogMax);
    const vdir = normalize(positionWorld.sub(cameraPosition));
    const skyCol = cubeTexture(this.fogRT.texture, normalize(vec3(vdir.x, max(vdir.y, 0.035), vdir.z))).rgb;
    const fogBase = mix(color(this.u.haze).mul(this.u.skyGain.mul(2.2)), skyCol, this.u.skyFog);
    const lum = skyCol.dot(vec3(0.3, 0.55, 0.15)).max(0.0001);
    scene.fogNode = fog(mix(fogBase, vec3(this.u.wxHaze).mul(lum.mul(2.2)), this.u.wxHazeMix).mul(this.u.wxFlash.mul(3).add(1)), fogFactor);

    this.envScene = new THREE.Scene();
    const envSky = new SkyMesh();
    envSky.scale.setScalar(8000); envSky.frustumCulled = false; envSky.showSunDisc.value = 0;
    envSky.material.colorNode = vec4(greyed(envSky.material.colorNode.rgb).mul(this.u.skyGain).mul(this.u.skyTint).add(vec3(0.0016, 0.0022, 0.0045).mul(this.u.night)), 1);
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
    s.bias = -0.0006;
    s.normalBias = 0.06;
    s.radius = 1.6;
    this.texel = box / P.shadowMap;
    if (this.envSize && P.envSize && P.envSize !== this.envSize) this.buildEnvTarget(P.envSize);
    this.preset = P;
  }

  addEnvProxy(obj) { this.envScene.add(obj); }

  setEra(preset) {
    const E = this.era = { ...SKY_NEUTRAL, ...(preset || {}) };
    for (const s of [this.sky, this.envSky, this.fogSky]) {
      if (!s) continue;
      s.turbidity.value = E.turbidity; s.rayleigh.value = E.rayleigh; s.mieCoefficient.value = E.mie; s.mieDirectionalG.value = E.mieG;
      s.cloudCoverage.value = E.clouds; s.cloudDensity.value = E.cloudDensity; s.cloudElevation.value = E.cloudElevation; s.cloudScale.value = E.cloudScale;
    }
    if (this.fogSky) this.fogSky.cloudCoverage.value = 0;
    this.u.skyTint.value.setRGB(...E.tint);
    this.u.starGain.value = E.stars;
    this.applyWeather();
    if (this.lastTime) this.setTime(...this.lastTime);
  }

  setWeather(w) {
    this.wx = { ...WX_NEUTRAL, ...(w || {}) };
    this.applyWeather();
    if (this.lastTime) this.setTime(...this.lastTime);
  }

  applyWeather() {
    const E = this.era, W = this.wx;
    for (const s of [this.sky, this.envSky]) {
      if (!s) continue;
      s.cloudCoverage.value = W.clouds === null ? E.clouds : THREE.MathUtils.lerp(E.clouds, W.clouds, 0.85);
      s.cloudDensity.value = W.dens === null ? E.cloudDensity : THREE.MathUtils.lerp(E.cloudDensity, W.dens, 0.85);
    }
    this.u.fogDist.value = E.fogDist / Math.max(0.2, W.fogMul);
    this.u.fogHeight.value = W.fogHeight > 0 ? Math.min(E.fogHeight, W.fogHeight) : E.fogHeight;
    this.u.fogMax.value = W.fogMul > 2 ? Math.max(E.fogMax, 0.985) : E.fogMax;
    this.u.wxHaze.value.setRGB(...W.haze); this.u.wxHazeMix.value = W.hazeMix; this.u.wxGrey.value = W.grey || 0;
  }

  setTime(month, day, hour) {
    this.lastTime = [month, day, hour];
    if (this.external) return;
    const E = this.era;
    const { el, az } = solarPosition(month, day, hour);
    this.state.el = el; this.state.az = az;
    const night = 1 - THREE.MathUtils.smoothstep(el, -10 * D2R, 2 * D2R);
    this.state.night = night;
    dirFromAzEl(az, el, this.sunDir);
    const skyEl = el > -9 * D2R ? Math.max(el, 1.2 * D2R) : el;
    const skyDir = dirFromAzEl(az, skyEl, new THREE.Vector3());
    this.sky.sunPosition.value.copy(skyDir).multiplyScalar(1000);
    if (this.envSky) this.envSky.sunPosition.value.copy(skyDir).multiplyScalar(1000);
    if (this.fogSky) this.fogSky.sunPosition.value.copy(skyDir).multiplyScalar(1000);
    this.u.night.value = night * night;
    const dayF = THREE.MathUtils.smoothstep(el, -3 * D2R, 10 * D2R);
    const golden = 1 - THREE.MathUtils.smoothstep(el, 4 * D2R, 28 * D2R);
    const sunCol = new THREE.Color(1, 0.97, 0.92).lerp(new THREE.Color(1.0, 0.56, 0.26), golden * 0.85);
    const moonDir = dirFromAzEl(az + Math.PI, 38 * D2R, new THREE.Vector3());
    const useMoon = dayF < 0.02;
    const ldir = useMoon ? moonDir : this.sunDir.clone().setY(Math.max(this.sunDir.y, 0.02)).normalize();
    this.lightDir = ldir;
    this.sun.color.copy(useMoon ? new THREE.Color(0.55, 0.65, 1.0) : sunCol.multiply(new THREE.Color(...E.sunTint)));
    const W = this.wx;
    this.sun.intensity = (useMoon ? 0.22 * E.moonGain : 11 * dayF * (0.5 + 0.5 * (1 - golden)) * E.sunGain) * W.sunMul;
    this.u.skyGain.value = 0.16 * (0.04 + 0.96 * THREE.MathUtils.smoothstep(el, -9 * D2R, 1 * D2R)) * E.gain * (1 - 0.55 * W.dark);
    const hazeDay = new THREE.Color(0.66, 0.74, 0.86);
    if (E.haze) hazeDay.lerp(new THREE.Color(...E.haze), E.hazeMix);
    this.haze = hazeDay.lerp(new THREE.Color(0.95, 0.66, 0.45), golden * 0.6).multiply(new THREE.Color(...E.hazeTint)).multiplyScalar(0.25 + 0.75 * dayF).lerp(new THREE.Color(0.012, 0.016, 0.03), night);
    const twl = 1 - THREE.MathUtils.smoothstep(el, -7 * D2R, 6 * D2R);
    this.haze.multiplyScalar(1 - 0.8 * twl);
    this.u.haze.value.copy(this.haze);
    const tw = 1 - THREE.MathUtils.smoothstep(el, -7 * D2R, 6 * D2R);
    this.exposure = THREE.MathUtils.lerp(0.42, 1.7, tw) * (1 + night * 0.7) * (1 + golden * 0.2 * dayF) * E.exposure * (1 + 0.5 * W.dark);
    this.twilight.intensity = (0.5 * tw * (1 - 0.75 * night) + 0.9 * W.dark * dayF) * E.ambient;
    this.twilight.color.setRGB(0.42, 0.52, 0.85).lerp(new THREE.Color(0.25, 0.3, 0.5), night);
    this.envLight.color.copy(this.sun.color); this.envLight.intensity = this.sun.intensity;
    this.envLight.position.copy(ldir).multiplyScalar(100); this.envLight.target.position.set(0, 0, 0);
    this.envFill.intensity = (0.05 + 0.25 * dayF) * E.ambient;
    this.envFill.color.setRGB(0.75, 0.85, 1.0).multiply(new THREE.Color(...E.tint).lerp(new THREE.Color(1, 1, 1), 0.5)).multiplyScalar(0.25 + 0.75 * dayF).lerp(new THREE.Color(0.05, 0.07, 0.12), night);
    this.envFill.groundColor.setRGB(0.42, 0.4, 0.37).multiply(new THREE.Color(...E.envGround)).multiplyScalar(0.2 + 0.8 * dayF);
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
    this.fogCam.position.copy(this.cubeCam.position);
    this.fogCam.update(this.gfx.renderer, this.fogScene);
    this.envRT.texture.needsPMREMUpdate = true;
  }
}
