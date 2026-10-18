// Roadster 88 lattice skinning: binds every deformable car vertex to its 4 nearest lattice nodes (inverse-distance weights), streams node displacements through a float data texture to the vertex shader, and rebuilds shading normals on the CPU after impacts.
import * as THREE from 'three/webgpu';
import { attribute, textureLoad, ivec2, int, positionLocal, vec3 } from 'three/tsl';

const TEX_W = 32;

function isDeform(o, root) {
  for (let p = o; p && p !== root.parent; p = p.parent) { if (p.userData && p.userData.deform) return true; if (p === root) break; }
  return false;
}

export class DeformBinding {
  constructor(root, lattice, opt = {}) {
    this.root = root; this.L = lattice;
    const N = lattice.n, H = Math.ceil(N / TEX_W);
    this.data = new Float32Array(TEX_W * H * 4);
    this.tex = new THREE.DataTexture(this.data, TEX_W, H, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = THREE.NearestFilter; this.tex.magFilter = THREE.NearestFilter; this.tex.needsUpdate = true;
    this.meshes = [];
    this.matCache = new Map();
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const nodes = [];
    for (let i = 0; i < N; i++) nodes.push([lattice.rest[i * 3], lattice.rest[i * 3 + 1], lattice.rest[i * 3 + 2]]);
    const grid = new Map(), cell = 0.5;
    const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    nodes.forEach((p, i) => { const k = key(...p); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
    const near = (x, y, z) => {
      const best = [[1e9, 0], [1e9, 0], [1e9, 0], [1e9, 0]];
      for (let r = 1; r <= 4; r++) {
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
          const l = grid.get(`${cx + a},${cy + b},${cz + c}`); if (!l) continue;
          for (const i of l) {
            const p = nodes[i], d = (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2;
            if (d < best[3][0] && !best.some((q) => q[1] === i && q[0] < 1e9)) { best[3] = [d, i]; best.sort((m, n) => m[0] - n[0]); }
          }
        }
        if (best[3][0] < 1e8) break;
      }
      return best;
    };
    const v = new THREE.Vector3(), m = new THREE.Matrix4();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !isDeform(o, root) || opt.skip) return;
      const g = o.geometry, pos = g.attributes.position, n = pos.count;
      m.multiplyMatrices(inv, o.matrixWorld);
      const rot = new THREE.Matrix3().setFromMatrix4(m);
      const rotInv = rot.clone().invert();
      const tg = g.userData && g.userData.template;
      if (tg && tg.attributes.latIdx && tg.userData.latN === N) { g.setAttribute('latIdx', tg.attributes.latIdx); g.setAttribute('latW', tg.attributes.latW); }
      else {
        const idx = new Float32Array(n * 4), wts = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m);
          const b = near(v.x, v.y, v.z);
          let sw = 0;
          for (let k = 0; k < 4; k++) { const w = 1 / (Math.sqrt(b[k][0]) + 0.12) ** 2; wts[i * 4 + k] = w; idx[i * 4 + k] = b[k][1]; sw += w; }
          for (let k = 0; k < 4; k++) wts[i * 4 + k] /= sw;
        }
        g.setAttribute('latIdx', new THREE.BufferAttribute(idx, 4));
        g.setAttribute('latW', new THREE.BufferAttribute(wts, 4));
        if (tg) { tg.setAttribute('latIdx', g.attributes.latIdx); tg.setAttribute('latW', g.attributes.latW); tg.userData.latN = N; }
      }
      const rec = { mesh: o, rotInv, origNormal: g.attributes.normal ? g.attributes.normal.array.slice() : null, restNormal: null, identity: isIdentity(rot) };
      this.meshes.push(rec);
      o.material = this.materialFor(o.material, rec);
    });
    this.dirtyNormals = false; this.lastVersion = -1; this.normalQueue = [];
  }

  materialFor(mat, rec) {
    const k = mat.uuid + (rec.identity ? '' : rec.mesh.uuid);
    if (this.matCache.has(k)) return this.matCache.get(k);
    const m = mat.clone();
    m.name = mat.name;
    const idx = attribute('latIdx', 'vec4'), w = attribute('latW', 'vec4');
    const fetch = (f) => { const i = int(f); return textureLoad(this.tex, ivec2(i.mod(TEX_W), i.div(TEX_W))).xyz; };
    let d = fetch(idx.x).mul(w.x).add(fetch(idx.y).mul(w.y)).add(fetch(idx.z).mul(w.z)).add(fetch(idx.w).mul(w.w));
    if (!rec.identity) { const e = rec.rotInv.elements; d = vec3(d.x.mul(e[0]).add(d.y.mul(e[3])).add(d.z.mul(e[6])), d.x.mul(e[1]).add(d.y.mul(e[4])).add(d.z.mul(e[7])), d.x.mul(e[2]).add(d.y.mul(e[5])).add(d.z.mul(e[8]))); }
    m.positionNode = positionLocal.add(d);
    this.matCache.set(k, m);
    return m;
  }

  update() {
    if (this.L.version === this.lastVersion) return false;
    this.lastVersion = this.L.version;
    this.L.setDisplacementInto(this.data, 4);
    this.tex.needsUpdate = true;
    return true;
  }

  deformedPositions(rec) {
    const g = rec.mesh.geometry, pos = g.attributes.position, idx = g.attributes.latIdx.array, w = g.attributes.latW.array, n = pos.count;
    const out = new Float32Array(n * 3), D = this.data, e = rec.rotInv.elements;
    for (let i = 0; i < n; i++) {
      let dx = 0, dy = 0, dz = 0;
      for (let k = 0; k < 4; k++) { const j = idx[i * 4 + k] * 4, ww = w[i * 4 + k]; dx += D[j] * ww; dy += D[j + 1] * ww; dz += D[j + 2] * ww; }
      if (!rec.identity) { const x = dx, y = dy, z = dz; dx = e[0] * x + e[3] * y + e[6] * z; dy = e[1] * x + e[4] * y + e[7] * z; dz = e[2] * x + e[5] * y + e[8] * z; }
      out[i * 3] = pos.getX(i) + dx; out[i * 3 + 1] = pos.getY(i) + dy; out[i * 3 + 2] = pos.getZ(i) + dz;
    }
    return out;
  }

  queueNormals() { this.normalQueue = this.meshes.slice(); }

  stepNormals(budget = 2) {
    let done = 0;
    while (this.normalQueue.length && done < budget) {
      const rec = this.normalQueue.shift(); done++;
      const g = rec.mesh.geometry;
      if (!g.index || !g.attributes.normal) continue;
      if (!rec.restNormal) rec.restNormal = computeNormals(g.attributes.position.array, g.index.array);
      const def = computeNormals(this.deformedPositions(rec), g.index.array);
      const nrm = g.attributes.normal.array, o = rec.origNormal, r = rec.restNormal;
      for (let i = 0; i < nrm.length; i += 3) {
        let x = o[i] + def[i] - r[i], y = o[i + 1] + def[i + 1] - r[i + 1], z = o[i + 2] + def[i + 2] - r[i + 2];
        const l = Math.hypot(x, y, z) || 1; nrm[i] = x / l; nrm[i + 1] = y / l; nrm[i + 2] = z / l;
      }
      g.attributes.normal.needsUpdate = true;
    }
  }

  bake(mesh) {
    const rec = this.meshes.find((r) => r.mesh === mesh);
    if (!rec) return;
    const g = mesh.geometry, p = this.deformedPositions(rec);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
  }
}

function isIdentity(r) { const e = r.elements; return Math.abs(e[0] - 1) < 1e-4 && Math.abs(e[4] - 1) < 1e-4 && Math.abs(e[8] - 1) < 1e-4; }

function computeNormals(pos, index) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}
