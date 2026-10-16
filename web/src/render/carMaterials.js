// Roadster 88 car materials by contract name: multi-coat clearcoat paint with metallic flake, tinted glass, emissive LEDs, rubber, rims, brakes, carbon, interior, frosting gold nozzles; paint presets.
import * as THREE from 'three/webgpu';
import { fxMaterial } from './gfx.js';
import { uniform, vec3, float, mix, hash, floor, positionLocal, normalView, positionViewDirection, dot, pow, max, clamp, fwidth, length, smoothstep, mx_noise_float, positionWorld, normalize, bumpMap, sin, atan, fract, abs, step } from 'three/tsl';

export const PAINTS = {
  red: { label: 'Red Multi-Coat', a: [0.72, 0.012, 0.018], b: [0.14, 0.0, 0.004], metal: 0.45, rough: 0.3, flake: 0.5 },
  white: { label: 'Pearl White Multi-Coat', a: [0.86, 0.86, 0.84], b: [0.6, 0.62, 0.66], metal: 0.08, rough: 0.3, flake: 0.25 },
  black: { label: 'Solid Black', a: [0.014, 0.014, 0.016], b: [0.006, 0.006, 0.007], metal: 0.0, rough: 0.22, flake: 0.0 },
  silver: { label: 'Midnight Silver Metallic', a: [0.2, 0.21, 0.225], b: [0.07, 0.075, 0.085], metal: 0.78, rough: 0.3, flake: 0.7 },
  blue: { label: 'Deep Blue Metallic', a: [0.03, 0.08, 0.32], b: [0.004, 0.012, 0.07], metal: 0.6, rough: 0.32, flake: 0.65 },
};

export class CarMaterials {
  constructor() {
    this.u = {
      paintA: uniform(new THREE.Color()), paintB: uniform(new THREE.Color()), flake: uniform(0.5), frost: uniform(0), arcGlow: uniform(0),
      head: uniform(4), tail: uniform(3), brake: uniform(0), scorch: uniform(0), rough: uniform(0.36),
    };
    const u = this.u;
    const paint = new THREE.MeshPhysicalNodeMaterial({ name: 'Paint', metalness: 0.42, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.018 });
    const ndv = clamp(dot(normalView, positionViewDirection.negate()), 0, 1);
    const facing = pow(ndv, float(0.55));
    const base = mix(vec3(u.paintB), vec3(u.paintA), facing);
    const fz = fwidth(positionLocal.x).mul(900);
    const cell = floor(positionLocal.mul(1300));
    const hx = hash(cell.x.add(cell.y.mul(31.7)).add(cell.z.mul(97.3)));
    const hy = hash(cell.y.add(cell.z.mul(17.1)).add(cell.x.mul(53.3)));
    const hz = hash(cell.z.add(cell.x.mul(11.9)).add(cell.y.mul(71.7)));
    const fl = vec3(hx, hy, hz).sub(0.5).mul(u.flake).mul(float(1).sub(clamp(fz, 0, 1)));
    paint.normalNode = normalize(normalView.add(fl.mul(0.55)));
    const frostN = mx_noise_float(positionLocal.mul(18.0)).mul(0.5).add(0.5);
    const frostMask = clamp(u.frost.mul(1.4).sub(frostN.mul(0.6)), 0, 1);
    paint.colorNode = mix(base, vec3(0.86, 0.9, 0.95), frostMask).mul(float(1).sub(u.scorch.mul(0.7)));
    paint.roughnessNode = mix(u.rough, float(0.85), frostMask);
    paint.clearcoatRoughnessNode = mix(float(0.018), float(0.6), frostMask);
    paint.emissiveNode = vec3(0.45, 0.65, 1.0).mul(u.arcGlow);
    this.paint = paint;
    this.setPaint('red');

    const std = (name, o) => new THREE.MeshStandardNodeMaterial({ name, ...o });
    const phys = (name, o) => new THREE.MeshPhysicalNodeMaterial({ name, ...o });
    this.byName = {
      Paint: paint,
      Paint_Black: phys('Paint_Black', { color: 0x050506, roughness: 0.18, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide }),
      Carbon: (() => {
        const m = phys('Carbon', { roughness: 0.32, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
        const p = positionLocal.mul(260);
        const weave = step(0.5, fract(p.x.add(floor(p.z).mul(0.5)))).mul(0.5).add(step(0.5, fract(p.z.add(floor(p.x).mul(0.5)))).mul(0.5));
        m.colorNode = vec3(0.018, 0.019, 0.021).mul(float(0.7).add(weave.mul(0.6)));
        return m;
      })(),
      Chrome: phys('Chrome', { color: 0xdedede, roughness: 0.06, metalness: 1 }),
      Rubber: std('Rubber', { color: 0x0b0b0c, roughness: 0.85 }),
      Tire: (() => {
        const m = std('Tire', { color: 0x141416, roughness: 0.88 });
        const r = length(positionLocal.yz);
        const ang = atan(positionLocal.y, positionLocal.z);
        const tread = step(0.55, fract(ang.mul(36))).mul(smoothstep(0.3, 0.33, r));
        m.colorNode = vec3(0.045, 0.045, 0.048).mul(float(1).sub(tread.mul(0.35)));
        m.roughnessNode = float(0.86).add(tread.mul(0.08));
        return m;
      })(),
      Rim: phys('Rim', { color: 0x0b0b0c, roughness: 0.22, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 }),
      Brake_Disc: (() => {
        const m = std('Brake_Disc', { color: 0x6d6e70, roughness: 0.38, metalness: 0.9 });
        const r = length(positionLocal.yz);
        m.colorNode = vec3(0.42, 0.42, 0.43).mul(float(0.85).add(sin(r.mul(900)).mul(0.08)));
        return m;
      })(),
      Caliper: phys('Caliper', { color: 0xb88a3a, roughness: 0.32, metalness: 0.75, clearcoat: 1, clearcoatRoughness: 0.12 }),
      Glass_Tint: phys('Glass_Tint', { color: 0x010102, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.86, specularIntensity: 1, ior: 1.52, clearcoat: 1, clearcoatRoughness: 0.01, depthWrite: false, side: THREE.DoubleSide }),
      Glass_Clear: phys('Glass_Clear', { color: 0x9aa3a8, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.25, ior: 1.52, depthWrite: false }),
      Lens: phys('Lens', { color: 0x0a0b0c, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.55, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, side: THREE.DoubleSide }),
      Lens_Tail: phys('Lens_Tail', { color: 0x5a0606, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.7, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false, side: THREE.DoubleSide }),
      LED_Head: (() => { const m = std('LED_Head', { color: 0x111111, roughness: 0.3 }); m.emissiveNode = vec3(0.86, 0.92, 1.0).mul(u.head); return m; })(),
      LED_Tail: (() => { const m = std('LED_Tail', { color: 0x1a0202, roughness: 0.3 }); m.emissiveNode = vec3(1.0, 0.04, 0.03).mul(u.tail.add(u.brake.mul(9))); return m; })(),
      Interior_Leather: (() => {
        const m = std('Interior_Leather', { color: 0xdfddd8, roughness: 0.55 });
        const p = positionLocal.mul(220);
        const perf = step(0.82, hash(floor(p.x).add(floor(p.y).mul(13.1)).add(floor(p.z).mul(7.3))));
        m.colorNode = vec3(0.78, 0.77, 0.74).mul(float(1).sub(perf.mul(0.25)));
        m.normalNode = bumpMap(mx_noise_float(positionLocal.mul(90)).mul(0.08));
        return m;
      })(),
      Interior_Dark: std('Interior_Dark', { color: 0x141416, roughness: 0.6 }),
      Alcantara: std('Alcantara', { color: 0x1d1d20, roughness: 0.96 }),
      Nozzle_Metal: phys('Nozzle_Metal', { color: 0xc8a160, roughness: 0.3, metalness: 1 }),
      Screen: new THREE.MeshBasicNodeMaterial({ name: 'Screen', color: 0x000000 }),
      Cluster: new THREE.MeshBasicNodeMaterial({ name: 'Cluster', color: 0x000000 }),
      Underbody: std('Underbody', { color: 0x0e0e10, roughness: 0.9 }),
    };
    for (const k of ['Glass_Tint', 'Glass_Clear', 'Lens', 'Lens_Tail']) fxMaterial(this.byName[k]);
    this.nozzleMats = new Map();
  }

  nozzleMaterial(name) {
    if (this.nozzleMats.has(name)) return this.nozzleMats.get(name);
    const frost = uniform(0);
    const m = new THREE.MeshPhysicalNodeMaterial({ name: 'Nozzle_Metal', roughness: 0.3, metalness: 1 });
    const n = mx_noise_float(positionWorld.mul(40)).mul(0.5).add(0.5);
    const k = clamp(frost.mul(1.3).sub(n.mul(0.5)), 0, 1);
    m.colorNode = mix(vec3(0.78, 0.6, 0.33), vec3(0.85, 0.88, 0.92), k);
    m.metalnessNode = mix(float(1), float(0.1), k);
    m.roughnessNode = mix(float(0.3), float(0.75), k);
    const rec = { mat: m, frost };
    this.nozzleMats.set(name, rec);
    return rec;
  }

  setPaint(key) {
    const p = PAINTS[key] || PAINTS.red;
    this.paintKey = key in PAINTS ? key : 'red';
    this.u.paintA.value.setRGB(...p.a); this.u.paintB.value.setRGB(...p.b);
    this.u.flake.value = p.flake;
    this.u.rough.value = p.rough;
    this.paint.metalness = p.metal;
  }

  get(name) { return this.byName[name] || null; }
}
