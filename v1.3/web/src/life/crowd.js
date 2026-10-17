// Roadster 88 life crowd renderer: loads baked species meshes, bakes their procedural clips into a bone-matrix texture and draws every creature of a species per LOD in one instanced call, skinned in the vertex shader from per-instance clip rows (frame interpolation and two-clip blending on the near LOD), head look, placement and per-instance colour, with region-aware procedural skin, fur, feather and cloth shading.
import * as THREE from 'three/webgpu';
import { Fn, attribute, textureLoad, ivec2, int, float, vec2, vec3, vec4, floor, fract, mix, dot, positionGeometry, normalGeometry, normalLocal, varying, smoothstep, clamp, abs, sin, cos, max, min, step, uniform, mx_noise_float, mx_worley_noise_float, mx_fractal_noise_float, bumpMap, fwidth, select, equal, hash, length } from 'three/tsl';
import { Rig, bakeClips } from './rig.js';

const BASE = new URL('../../../assets/life/', import.meta.url).href;

export async function loadBin(id) {
  const r = await fetch(BASE + id + '.bin', { cache: 'no-store' });
  if (!r.ok) throw new Error('life asset ' + id + ' ' + r.status);
  const buf = await r.arrayBuffer();
  const dv = new DataView(buf);
  const hl = dv.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, hl)));
  let o = 12 + hl; o += (4 - (o % 4)) % 4;
  const take = (Ctor, count) => { const a = new Ctor(buf, o, count); o += a.byteLength; o += (4 - (o % 4)) % 4; return a; };
  const lods = header.lods.map((L) => {
    const n = L.verts;
    const pos = take(Float32Array, n * 3), nor8 = take(Int8Array, n * 4), skinI = take(Uint8Array, n * 4), skinW = take(Uint8Array, n * 4), aux = take(Uint8Array, n * 4);
    const idx = L.idx32 ? take(Uint32Array, L.tris * 3) : take(Uint16Array, L.tris * 3);
    const nor = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) nor[v * 3 + c] = nor8[v * 4 + c] / 127;
    return { pos, nor, skinI, skinW, aux, idx, verts: n, tris: L.tris };
  });
  return { header, lods };
}

function skinMaterial(kind, lite) {
  const L = kind.look, tex = kind.tex, U = kind.U;
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
  const iA = attribute('iA', 'vec4'), iB = attribute('iB', 'vec4'), iC = attribute('iC', 'vec4');
  const si = attribute('skinIndex', 'vec4'), sw = attribute('skinWeight', 'vec4'), aux = attribute('aux', 'vec4');
  const nb = lite ? 2 : 4;
  const evalRow = (row, p4, n3) => {
    let pa = vec3(0), na = vec3(0);
    for (let k = 0; k < nb; k++) {
      const ch = ['x', 'y', 'z', 'w'][k], b = int(si[ch].mul(255).add(0.5)).mul(3);
      const r0 = textureLoad(tex, ivec2(b, row)), r1 = textureLoad(tex, ivec2(b.add(1), row)), r2 = textureLoad(tex, ivec2(b.add(2), row));
      const w = lite && k === 1 ? float(1).sub(sw.x) : sw[ch];
      pa = pa.add(vec3(dot(r0, p4), dot(r1, p4), dot(r2, p4)).mul(w));
      na = na.add(vec3(dot(r0.xyz, n3), dot(r1.xyz, n3), dot(r2.xyz, n3)).mul(w));
    }
    return [pa, na];
  };
  const pos = Fn(() => {
    const p4 = vec4(positionGeometry, 1), n3 = normalGeometry;
    let P, N;
    if (lite) {
      const r = int(floor(iC.x.add(0.5)));
      [P, N] = evalRow(r, p4, n3);
    } else {
      const ra = int(floor(iC.x)), fa = fract(iC.x), rb = int(floor(iC.y)), fb = fract(iC.y);
      const [a0, an0] = evalRow(ra, p4, n3), [a1, an1] = evalRow(ra.add(1), p4, n3);
      const [b0, bn0] = evalRow(rb, p4, n3), [b1, bn1] = evalRow(rb.add(1), p4, n3);
      P = mix(mix(a0, a1, fa), mix(b0, b1, fb), iC.z);
      N = mix(mix(an0, an1, fa), mix(bn0, bn1, fb), iC.z);
    }
    const piv = vec3(...(kind.pivot || [0, 0, 0]));
    const la = iC.w.mul(aux.w);
    const cl = cos(la), sl = sin(la);
    const q = P.sub(piv);
    P = vec3(q.x.mul(cl).add(q.z.mul(sl)), q.y, q.z.mul(cl).sub(q.x.mul(sl))).add(piv);
    N = vec3(N.x.mul(cl).add(N.z.mul(sl)), N.y, N.z.mul(cl).sub(N.x.mul(sl)));
    const s = iB.z;
    const cy = cos(iA.w), sy = sin(iA.w), cp = cos(iB.x), sp = sin(iB.x), cr = cos(iB.y), sr = sin(iB.y);
    const rot = (v) => {
      const z1 = vec3(v.x.mul(cr).sub(v.y.mul(sr)), v.x.mul(sr).add(v.y.mul(cr)), v.z);
      const x1 = vec3(z1.x, z1.y.mul(cp).sub(z1.z.mul(sp)), z1.y.mul(sp).add(z1.z.mul(cp)));
      return vec3(x1.x.mul(cy).add(x1.z.mul(sy)), x1.y, x1.z.mul(cy).sub(x1.x.mul(sy)));
    };
    normalLocal.assign(rot(N).normalize());
    return rot(P.mul(s)).add(iA.xyz);
  })();
  m.positionNode = pos;
  const region = varying(floor(aux.x.mul(255).add(0.5)));
  const ao = varying(aux.y), curv = varying(aux.z);
  const seed = varying(iB.w), c0 = varying(attribute('iD', 'vec4')), c1 = varying(attribute('iE', 'vec4'));
  const rp = varying(positionGeometry), rn = varying(normalGeometry);
  const regs = kind.header.regions;
  const is = (name) => { const ri = regs.indexOf(name); return ri < 0 ? float(0) : step(abs(region.sub(float(ri))), 0.5); };
  const out = L.shade({ rp, rn, ao, curv, seed, c0, c1, is, U, region, lite });
  m.colorNode = out.color;
  m.roughnessNode = out.rough;
  if (out.metal) m.metalnessNode = out.metal;
  if (out.bump && !lite) m.normalNode = bumpMap(out.bump);
  if (out.emissive) m.emissiveNode = out.emissive;
  m.aoNode = mix(float(1), ao, float(L.aoAmount === undefined ? 0.85 : L.aoAmount));
  m.name = 'life_' + kind.id + (lite ? '_lite' : '');
  return m;
}

export class Kind {
  constructor(life, data, mod, look, opts = {}) {
    this.life = life; this.id = data.header.id; this.mod = mod; this.look = look; this.meta = mod.meta;
    this.header = data.header;
    this.rig = new Rig(data.header.bones);
    const clipList = mod.clips(this.rig);
    this.anim = bakeClips(this.rig, clipList);
    this.clips = this.anim.clips;
    this.tex = new THREE.DataTexture(this.anim.data, this.anim.width, this.anim.height, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter; this.tex.generateMipmaps = false; this.tex.needsUpdate = true;
    this.pivot = mod.meta.pivot || [0, 0, 0];
    this.U = { night: life.U.night, time: life.U.time };
    this.mats = [skinMaterial(this, false), skinMaterial(this, true)];
    this.lods = data.lods.map((L, i) => this.makeLod(L, i, opts));
    this.group = new THREE.Group(); this.group.name = 'life_' + this.id;
    for (const l of this.lods) this.group.add(l.mesh);
    life.root.add(this.group);
  }

  makeLod(L, i, opts) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(L.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(L.nor, 3));
    const n = L.verts, pk = new Uint8Array(n * 12);
    for (let v = 0; v < n; v++) for (let c = 0; c < 4; c++) { pk[v * 12 + c] = L.skinI[v * 4 + c]; pk[v * 12 + 4 + c] = L.skinW[v * 4 + c]; pk[v * 12 + 8 + c] = L.aux[v * 4 + c]; }
    const ib = new THREE.InterleavedBuffer(pk, 12);
    g.setAttribute('skinIndex', new THREE.InterleavedBufferAttribute(ib, 4, 0, true));
    g.setAttribute('skinWeight', new THREE.InterleavedBufferAttribute(ib, 4, 4, true));
    g.setAttribute('aux', new THREE.InterleavedBufferAttribute(ib, 4, 8, true));
    g.setIndex(new THREE.BufferAttribute(L.idx, 1));
    const cap = (opts.caps || [24, 96, 400])[i] || 64;
    const lod = { g, cap, n: 0, i };
    this.alloc(lod, cap);
    const mesh = new THREE.Mesh(g, this.mats[i === 0 ? 0 : 1]);
    mesh.frustumCulled = false; mesh.castShadow = i < (opts.shadowLods === undefined ? 2 : opts.shadowLods); mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.userData.k = 'life_' + this.id + '_' + i;
    lod.mesh = mesh;
    g.instanceCount = 0;
    return lod;
  }

  alloc(lod, cap) {
    lod.cap = cap;
    const buf = new THREE.InstancedInterleavedBuffer(new Float32Array(cap * 20), 20, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    lod.buf = buf; lod.data = buf.array;
    ['iA', 'iB', 'iC', 'iD', 'iE'].forEach((k, i) => lod.g.setAttribute(k, new THREE.InterleavedBufferAttribute(buf, 4, i * 4)));
  }

  begin() { for (const l of this.lods) l.n = 0; }

  push(li, x, y, z, yaw, pitch, roll, scale, seed, rowA, rowB, blend, look, d, e) {
    const lod = this.lods[Math.min(li, this.lods.length - 1)];
    if (lod.n >= lod.cap) { const old = lod.data; this.alloc(lod, lod.cap * 2); lod.data.set(old); }
    const o = lod.n * 20, A = lod.data;
    A[o] = x; A[o + 1] = y; A[o + 2] = z; A[o + 3] = yaw;
    A[o + 4] = pitch; A[o + 5] = roll; A[o + 6] = scale; A[o + 7] = seed;
    A[o + 8] = rowA; A[o + 9] = rowB; A[o + 10] = blend; A[o + 11] = look;
    if (d) { A[o + 12] = d[0]; A[o + 13] = d[1]; A[o + 14] = d[2]; A[o + 15] = d[3]; }
    if (e) { A[o + 16] = e[0]; A[o + 17] = e[1]; A[o + 18] = e[2]; A[o + 19] = e[3]; }
    lod.n++;
  }

  end() {
    for (const l of this.lods) {
      l.g.instanceCount = l.n;
      l.mesh.visible = l.n > 0;
      if (l.n) { l.buf.clearUpdateRanges(); l.buf.addUpdateRange(0, l.n * 20); l.buf.needsUpdate = true; }
    }
  }

  async warm(renderer, camera, scene) {
    const cam = camera.position;
    this.warmup = true;
    this.begin();
    for (let i = 0; i < this.lods.length; i++) this.push(i, cam.x, cam.y - 400, cam.z, 0, 0, 0, 0.001, 0, 0, 0, 0, 0, null, null);
    this.end();
    try { await renderer.compileAsync(this.group, camera, scene); } catch (e) { /* compile on first draw instead */ }
    this.warmup = false;
  }

  row(clip, t) {
    const c = this.clips[clip] || this.clips.idle || this.first || (this.first = this.clips[Object.keys(this.clips)[0]]);
    if (c.loop) { const u = ((t % 1) + 1) % 1; return c.row + u * c.frames; }
    return c.row + Math.min(c.frames - 0.001, Math.max(0, t) * c.frames);
  }

  stats() { return this.lods.map((l) => l.n); }

  dispose() {
    this.life.root.remove(this.group);
    for (const l of this.lods) l.g.dispose();
    for (const m of this.mats) m.dispose();
    this.tex.dispose();
  }
}

export const tsl = { Fn, float, vec2, vec3, vec4, mix, smoothstep, clamp, abs, sin, cos, max, min, step, uniform, mx_noise_float, mx_worley_noise_float, mx_fractal_noise_float, fwidth, select, equal, hash, length, floor, fract, dot };
