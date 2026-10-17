// Roadster 88 era fluids: water and lava surfaces filling valley regions at a period level (Archean and Cambrian seas, Carboniferous swamp, dino lake, 1885 shallow lake, Hadean lava lake), tinted per period, with animated ripples, crust and glow.
import * as THREE from 'three/webgpu';
import { vec3, vec2, float, positionWorld, time, mx_noise_float, mx_worley_noise_vec2, smoothstep, mix, bumpMap, uniform, max, pow } from 'three/tsl';

function waterMaterial(U) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.04, metalness: 0 });
  const p = positionWorld.xz;
  const t = time;
  const w1 = mx_noise_float(vec3(p.mul(0.09).add(vec2(t.mul(0.05), t.mul(0.03))), t.mul(0.12)));
  const w2 = mx_noise_float(vec3(p.mul(0.37).sub(vec2(t.mul(0.11), t.mul(-0.07))), t.mul(0.3)));
  const w3 = mx_noise_float(vec3(p.mul(1.6).add(vec2(t.mul(0.2), 0)), t.mul(0.6)));
  const big = mx_noise_float(vec3(p.mul(0.004), 3.3)).mul(0.5).add(0.5);
  m.normalNode = bumpMap(w1.mul(0.5).add(w2.mul(0.22)).add(w3.mul(0.06)).mul(U.chop));
  m.colorNode = mix(vec3(U.deep), vec3(U.shallow), big.mul(0.5));
  m.roughnessNode = float(0.035).add(w3.abs().mul(0.03)).add(U.murk.mul(0.1));
  return m;
}

function lavaMaterial(U) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0 });
  const p = positionWorld.xz;
  const t = time.mul(0.03);
  const f = mx_worley_noise_vec2(vec3(p.mul(0.028), t), 1.0);
  const f2 = mx_worley_noise_vec2(vec3(p.mul(0.11).add(4.1), t.mul(2.0)), 1.0);
  const n = mx_noise_float(vec3(p.mul(0.015), t.mul(3.0))).mul(0.5).add(0.5);
  const crack = float(1).sub(smoothstep(0.0, 0.09, f.y.sub(f.x)));
  const crack2 = float(1).sub(smoothstep(0.0, 0.06, f2.y.sub(f2.x))).mul(0.5);
  const hot = max(crack, crack2).mul(n.mul(0.7).add(0.45));
  const pulse = mx_noise_float(vec3(p.mul(0.006), time.mul(0.15))).mul(0.5).add(0.5);
  const molten = smoothstep(0.62, 0.9, n.add(pulse.mul(0.25)));
  const heat = max(hot, molten.mul(0.85));
  m.colorNode = mix(vec3(0.035, 0.026, 0.022), vec3(0.09, 0.03, 0.01), heat);
  m.roughnessNode = mix(float(0.82), float(0.35), heat);
  m.emissiveNode = mix(vec3(0.9, 0.12, 0.01), vec3(1.0, 0.55, 0.12), pow(heat, float(2))).mul(heat.mul(U.glow)).add(vec3(0.25, 0.03, 0.0).mul(U.glow.mul(0.04)));
  m.normalNode = bumpMap(float(1).sub(heat).mul(0.6).add(mx_noise_float(vec3(p.mul(0.9), 1.0)).mul(0.08)));
  return m;
}

export class Fluids {
  constructor(sys) {
    this.sys = sys;
    this.group = new THREE.Group(); this.group.name = 'EraFluids';
    sys.root.add(this.group);
    this.U = { deep: uniform(new THREE.Color(0.012, 0.035, 0.04)), shallow: uniform(new THREE.Color(0.04, 0.07, 0.06)), chop: uniform(1), murk: uniform(0), glow: uniform(9) };
    this.mats = { water: waterMaterial(this.U), lava: lavaMaterial(this.U) };
    this.meshes = [];
  }

  set(list, P) {
    for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); }
    this.meshes = [];
    const t = P.water;
    this.U.deep.value.setRGB(...t[0]); this.U.shallow.value.setRGB(...t[1]); this.U.murk.value = t[2];
    for (const f of list) {
      const poly = f.mesh || f.poly;
      if (!poly || poly.length < 3) continue;
      const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(shape, 24).rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, this.mats[f.kind] || this.mats.water);
      mesh.position.y = f.level; mesh.receiveShadow = f.kind === 'water'; mesh.userData.k = 'fluid_' + f.kind;
      this.group.add(mesh); this.meshes.push(mesh);
    }
  }
}
