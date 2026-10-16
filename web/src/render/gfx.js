// Roadster 88 graphics core: WebGPURenderer (WebGL2 fallback), TSL post chain (GTAO, TAAU, motion blur, bloom, lens flare, flash), quality presets and dynamic resolution.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, velocity, normalView, packNormalToRGB, unpackRGBToNormal, sample, screenUV, uniform, vec2, vec3, vec4, int, float, mix, convertToTexture, smoothstep, length, exp, step, atan, cos, abs } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { taau } from 'three/addons/tsl/display/TAAUNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';

export function fxMaterial(m) {
  return m;
}

export const PRESETS = {
  low: { label: 'Low', dpr: 1.0, scale: 0.7, minScale: 0.5, ao: false, mblur: false, flare: false, bloom: true, shadowMap: 1024, shadowBox: 44, envEvery: 0, envSize: 64, mobileAvatar: true, sharpen: 0.25, particles: 0.5 },
  medium: { label: 'Medium', dpr: 1.25, scale: 0.8, minScale: 0.55, ao: false, mblur: true, flare: false, bloom: true, shadowMap: 2048, shadowBox: 56, envEvery: 30, envSize: 96, mobileAvatar: true, sharpen: 0.2, particles: 0.75 },
  high: { label: 'High', dpr: 1.5, scale: 0.85, minScale: 0.6, ao: true, mblur: true, flare: true, bloom: true, shadowMap: 2048, shadowBox: 64, envEvery: 8, envSize: 128, mobileAvatar: false, sharpen: 0.15, particles: 1 },
  ultra: { label: 'Ultra', dpr: 2.0, scale: 1.0, minScale: 0.65, ao: true, mblur: true, flare: true, bloom: true, shadowMap: 4096, shadowBox: 90, envEvery: 3, envSize: 256, mobileAvatar: false, sharpen: 0.1, particles: 1 },
};

export class Gfx {
  static async create(canvas, opts = {}) {
    const g = new Gfx();
    await g.init(canvas, opts);
    return g;
  }

  async init(canvas, opts) {
    const forceWebGL = !!opts.webgl || !navigator.gpu;
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance', forceWebGL, trackTimestamp: !!opts.gpuTime });
    this.gpuMs = 0; this.gpuTime = !!opts.gpuTime;
    await this.renderer.init();
    this.backend = this.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    const r = this.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.08, 9000);
    this.u = {
      blur: uniform(0), flash: uniform(0), exposure: uniform(0.5), sunUV: uniform(new THREE.Vector2(0.5, 0.5)), sunVis: uniform(0), sunCol: uniform(new THREE.Color(1, 0.9, 0.8)), aspect: uniform(1.6), bloomStrength: uniform(0.16), flareAmount: uniform(1), sharp: uniform(0.15), tint: uniform(new THREE.Color(1, 1, 1)),
    };
    this.presetName = opts.preset || 'high';
    this.preset = PRESETS[this.presetName];
    this.scale = this.preset.scale;
    this.frameMs = 16.7; this.slowT = 0; this.fastT = 0; this.cooldown = 0;
    this.dynres = opts.dynres !== false;
    this.flags = opts.flags || {};
    this.pipeline = new THREE.RenderPipeline(r);
    this.buildPipeline();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  setPreset(name) {
    if (!PRESETS[name]) return;
    this.presetName = name; this.preset = PRESETS[name];
    this.scale = this.preset.scale;
    this.buildPipeline();
    this.resize();
    if (this.onPreset) this.onPreset(this.preset);
  }

  buildPipeline() {
    const P = this.preset, scene = this.scene, camera = this.camera, u = this.u;
    if (this.nodes) for (const n of this.nodes) if (n && n.dispose) n.dispose();
    this.nodes = [];
    const scenePass = pass(scene, camera);
    const useAO = P.ao && !this.flags.noao;
    scenePass.setMRT(useAO ? mrt({ output, velocity, normal: packNormalToRGB(normalView) }) : mrt({ output, velocity }));
    this.scenePass = scenePass;
    this.prePass = null; this.aoPass = null;
    if (useAO) {
      scenePass.getTexture('normal').type = THREE.UnsignedByteType;
      const nrm = sample((uv) => unpackRGBToNormal(scenePass.getTextureNode('normal').sample(uv)));
      const aoPass = ao(scenePass.getTextureNode('depth'), nrm, camera);
      aoPass.resolutionScale = 0.5;
      aoPass.radius.value = 0.55; aoPass.thickness.value = 1.0; aoPass.scale.value = 1.0; aoPass.useTemporalFiltering = true;
      this.aoPass = aoPass;
      this.nodes.push(aoPass);
    }
    let color = scenePass.getTextureNode('output');
    if (this.aoPass) color = convertToTexture(vec4(color.rgb.mul(mix(float(1), this.aoPass.getTextureNode().sample(screenUV).r, float(0.75))), float(1)));
    const depth = scenePass.getTextureNode('depth');
    const vel = scenePass.getTextureNode('velocity');
    const aa = taau(color, depth, vel, camera);
    this.aa = aa;
    this.nodes.push(aa, scenePass);
    let img = this.flags.notaa ? color : aa;
    if (P.sharpen > 0 && !this.flags.notaa) { const sh = sharpen(aa.getTextureNode(), P.sharpen); this.nodes.push(sh); img = sh.getTextureNode(); }
    img = convertToTexture(vec4(img.rgb.mul(u.exposure), float(1)));
    this.nodes.push(img);
    if (P.mblur && !this.flags.nomblur) img = motionBlur(img, vel.mul(u.blur), int(8));
    let out = img;
    if (P.bloom && !this.flags.nobloom) {
      const b = bloom(img, u.bloomStrength, 0.4, 1.25);
      this.bloomNode = b; this.nodes.push(b);
      out = out.add(b);
    }
    if (P.flare && !this.flags.noflare) {
      const occ = step(0.99999, depth.sample(u.sunUV).r);
      const vis = u.sunVis.mul(occ);
      const toC = vec2(0.5, 0.5).sub(u.sunUV);
      const asp = vec2(u.aspect, 1);
      let fl = vec3(0);
      const ghosts = [[0.55, 0.03, [0.6, 0.75, 1.0], 0.12], [0.95, 0.05, [1.0, 0.8, 0.55], 0.07], [1.35, 0.02, [0.55, 1.0, 0.7], 0.14], [1.7, 0.08, [0.7, 0.6, 1.0], 0.035], [2.2, 0.04, [1.0, 0.6, 0.5], 0.07]];
      for (const [t, r, c, k] of ghosts) {
        const center = u.sunUV.add(toC.mul(t));
        const d = length(screenUV.sub(center).mul(asp));
        fl = fl.add(vec3(...c).mul(float(1).sub(smoothstep(float(r * 0.55), float(r), d)).mul(k)));
      }
      const ds = screenUV.sub(u.sunUV).mul(asp);
      const rs = length(ds);
      const ang = atan(ds.y, ds.x);
      const star = exp(rs.mul(-14)).mul(0.6).add(exp(rs.mul(-60)).mul(1.5)).add(abs(cos(ang.mul(6))).pow(40).mul(exp(rs.mul(-7))).mul(0.25));
      out = out.add(fl.add(vec3(star)).mul(u.sunCol).mul(vis));
    }
    out = vec4(mix(out.rgb.mul(u.tint), vec3(14.0), u.flash.clamp(0, 1)), float(1));
    this.pipeline.outputNode = out;
    this.pipeline.needsUpdate = true;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.preset.dpr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyScale();
  }

  applyScale() {
    this.scenePass.setResolutionScale(this.scale);
  }

  updateDynRes(frameDt) {
    if (!this.dynres) return;
    const ms = frameDt * 1000;
    if (ms > 200) return;
    this.frameMs += (ms - this.frameMs) * 0.08;
    this.cooldown -= frameDt;
    if (this.frameMs > 18.2) { this.slowT += frameDt; this.fastT = 0; } else if (this.frameMs < 16.2) { this.fastT += frameDt; this.slowT = 0; } else { this.slowT = Math.max(0, this.slowT - frameDt); this.fastT = 0; }
    if (this.cooldown > 0) return;
    if (this.slowT > 0.35 && this.scale > this.preset.minScale) { this.scale = Math.max(this.preset.minScale, this.scale - 0.05); this.applyScale(); this.cooldown = 0.6; this.slowT = 0; }
    else if (this.fastT > 3 && this.scale < this.preset.scale) { this.scale = Math.min(this.preset.scale, this.scale + 0.03); this.applyScale(); this.cooldown = 1.5; this.fastT = 0; }
  }

  updateSun(dir, color, strength) {
    const cam = this.camera, u = this.u;
    const p = cam.position.clone().addScaledVector(dir, 5000).project(cam);
    const front = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).dot(dir) > 0;
    u.sunUV.value.set(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
    const edge = Math.max(0, 1 - Math.max(0, Math.abs(p.x) - 0.85) / 0.4) * Math.max(0, 1 - Math.max(0, Math.abs(p.y) - 0.85) / 0.4);
    u.sunVis.value = front ? edge * strength : 0;
    u.sunCol.value.copy(color);
    u.aspect.value = cam.aspect;
  }

  render() {
    this.pipeline.render();
    if (this.gpuTime && !this.gpuPending) { this.gpuPending = true; this.renderer.resolveTimestampsAsync('render').then((v) => { this.gpuPending = false; if (v !== undefined && v !== null) this.gpuMs += ((typeof v === 'number' ? v : this.renderer.info.render.timestamp) - this.gpuMs) * 0.1; }).catch(() => { this.gpuPending = false; }); }
  }
}
