// Roadster 88 Earth terrain: a camera-centred geometry clipmap (nested rings of grids, 2 m to 512 m spacing, out past the horizon) whose heights are computed on the GPU with the same function as the CPU patch (bicubic real elevation plus relief-scaled ridged and fine noise, faded with distance), geomorphed at ring edges, with Earth curvature, and a layered material (soil, vegetation, rock, alpine, sand and beaches, snow and ice) driven by climate and the era palette.
import * as THREE from 'three/webgpu';
import { Fn, uniform, texture, textureLoad, vec2, vec3, vec4, float, int, ivec2, positionLocal, positionWorld, smoothstep, mix, max, min, abs, floor, clamp, normalize, varying, transformNormalToView, length, sqrt, fract, select, Discard, If } from 'three/tsl';
import { OCT, LAT } from './data.js';

const R_EARTH = 6371000;

function floatTex(data, w, h, format) {
  const t = new THREE.DataTexture(data, w, h, format, THREE.FloatType);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

export const FADE = (l) => [l * 60, l * 95];

export class EarthTerrain {
  constructor(gfx, sky, U, noise, opts = {}) {
    this.gfx = gfx; this.U = U; this.noise = noise;
    this.M = opts.M || 128; this.L = opts.levels || 9; this.s0 = opts.s0 || 2;
    this.backdrop = opts.backdrop || null;
    this.haze = sky && sky.u && sky.u.haze ? sky.u.haze : uniform(new THREE.Color(0.7, 0.78, 0.88));
    this.root = new THREE.Group(); this.root.name = 'Earth';
    gfx.scene.add(this.root);
    this.u = {
      cj: uniform(0), ci: uniform(0), kx: uniform(0), kz: uniform(0), nx: uniform(2), nz: uniform(2),
      cam: uniform(new THREE.Vector3()), snowLine: uniform(3000), veg: uniform(0.5), arid: uniform(0.3), ice: uniform(0), yOff: uniform(0),
      bdHalf: uniform(this.backdrop ? this.backdrop.half : 0), bdBlend: uniform(this.backdrop ? this.backdrop.blend : 1), edgeN: uniform(1),
    };
    this.gridTex = floatTex(new Float32Array(4 * 4), 2, 2, THREE.RGBAFormat);
    this.latTex = floatTex(LAT, 256, 256, THREE.RedFormat);
    this.edgeTex = floatTex(new Float32Array(4), 1, 4, THREE.RedFormat);
    this.gridNode = texture(this.gridTex); this.edgeNode = this.backdrop ? texture(this.edgeTex) : null;
    this.mat = this.makeMaterial();
    this.levels = [];
    for (let l = 0; l < this.L; l++) this.levels.push(this.makeLevel(l));
  }

  setPatch(P) {
    this.P = P;
    const t = floatTex(P.grid, P.nx, P.nz, THREE.RGBAFormat);
    this.gridNode.value = t;
    if (this.gridTex) this.gridTex.dispose();
    this.gridTex = t;
    const u = this.u;
    u.cj.value = P.cj; u.ci.value = P.ci; u.kx.value = P.kx; u.kz.value = P.kz; u.nx.value = P.nx; u.nz.value = P.nz;
  }

  setEdge(data, n) {
    const t = floatTex(data, n, 4, THREE.RedFormat);
    if (this.edgeNode) this.edgeNode.value = t;
    if (this.edgeTex) this.edgeTex.dispose();
    this.edgeTex = t; this.u.edgeN.value = n;
  }

  setClimate(c) {
    const u = this.u;
    u.snowLine.value = c.snowLine; u.veg.value = c.veg; u.arid.value = c.arid; u.ice.value = Math.max(0, Math.min(1, ((c.ice || 0) - 0.6) / 0.25));
  }

  heightNode(gridNode, edgeNode, x, z, distK) {
    const u = this.u;
    const G = (j, i) => textureLoad(gridNode, ivec2(j, i));
    const gx = clamp(u.cj.sub(x.mul(u.kx)), 1, u.nx.sub(2.001)), gz = clamp(u.ci.add(z.mul(u.kz)), 1, u.nz.sub(2.001));
    const jf = floor(gx), if_ = floor(gz), fx = gx.sub(jf), fz = gz.sub(if_);
    const j = int(jf), i = int(if_);
    const cr = (p0, p1, p2, p3, t) => p1.add(t.mul(0.5).mul(p2.sub(p0).add(t.mul(p0.mul(2).sub(p1.mul(5)).add(p2.mul(4)).sub(p3).add(t.mul(p1.sub(p2).mul(3).add(p3).sub(p0)))))));
    const crd = (p0, p1, p2, p3, t) => p2.sub(p0).add(t.mul(2).mul(p0.mul(2).sub(p1.mul(5)).add(p2.mul(4)).sub(p3))).add(t.mul(t).mul(3).mul(p1.sub(p2).mul(3).add(p3).sub(p0))).mul(0.5);
    const rows = [], rowd = [], mid = [];
    for (let di = -1; di <= 2; di++) {
      const a = G(j.sub(1), i.add(di)), b = G(j, i.add(di)), c = G(j.add(1), i.add(di)), d = G(j.add(2), i.add(di));
      rows.push(cr(a.x, b.x, c.x, d.x, fx)); rowd.push(crd(a.x, b.x, c.x, d.x, fx));
      if (di === 0 || di === 1) mid.push([b, c]);
    }
    const bl = (k) => mix(mix(mid[0][0][k], mid[0][1][k], fx), mix(mid[1][0][k], mid[1][1][k], fx), fz);
    const b = cr(rows[0], rows[1], rows[2], rows[3], fz);
    let dhx = cr(rowd[0], rowd[1], rowd[2], rowd[3], fz).mul(u.kx).negate(), dhz = crd(rows[0], rows[1], rows[2], rows[3], fz).mul(u.kz);
    const r = bl('y'), wl = bl('z'), wf = bl('w');
    const above = abs(b.sub(wl));
    const near = wf.greaterThan(0.001).or(above.lessThan(30));
    const sh = select(near, clamp(above.sub(0.5).div(25), 0, 1).mul(0.8).add(0.2), float(1));
    const big = clamp(r.mul(0.32), 1.5, 220).mul(sh), small = r.mul(0.01).min(4).add(0.5).mul(sh), ridge = clamp(r.sub(80).div(320), 0, 1);
    const w256 = (v) => int(v.sub(floor(v.div(256)).mul(256)));
    const L = (a, c) => textureLoad(this.latTex, ivec2(a, c)).x;
    const oct = Fn(([X, Z, D, BIG, SMALL, RIDGE, H0, DX0, DZ0]) => {
      const hh = H0.toVar(), gx2 = DX0.toVar(), gz2 = DZ0.toVar();
      for (const o of OCT) {
        const [f0, f1] = FADE(o.l);
        If(distK.minDist.lessThan(f1), () => {
          const px = X.mul(o.c).sub(Z.mul(o.s)).add(o.ox), pz = X.mul(o.s).add(Z.mul(o.c)).add(o.oz);
          const xi = floor(px), zi = floor(pz), ffx = px.sub(xi), ffz = pz.sub(zi);
          const i0 = w256(xi), j0 = w256(zi), i1 = w256(xi.add(1)), j1 = w256(zi.add(1));
          const na = L(i0, j0), nb = L(i1, j0), nc = L(i0, j1), nd = L(i1, j1);
          const uu = ffx.mul(ffx).mul(ffx.mul(-2).add(3)), vv = ffz.mul(ffz).mul(ffz.mul(-2).add(3));
          const du = ffx.mul(float(1).sub(ffx)).mul(6), dv = ffz.mul(float(1).sub(ffz)).mul(6);
          const n = mix(mix(na, nb, uu), mix(nc, nd, uu), vv);
          const dnx = du.mul(mix(nb.sub(na), nd.sub(nc), vv)), dnz = dv.mul(mix(nc.sub(na), nd.sub(nb), uu));
          const v = o.ridge ? n.sub(0.5).mul(2).mul(RIDGE.oneMinus()).add(float(1).sub(abs(n.mul(2).sub(1))).sub(0.5).mul(2).mul(RIDGE)) : n.sub(0.5).mul(2);
          const dvdn = o.ridge ? float(2).mul(RIDGE.oneMinus()).sub(RIDGE.mul(4).mul(select(n.greaterThan(0.5), float(1), float(-1)))) : float(2);
          const k = float(o.a).mul(o.small ? SMALL : BIG).mul(float(1).sub(smoothstep(f0, f1, D)));
          hh.addAssign(v.mul(k));
          const g = dvdn.mul(k);
          gx2.addAssign(dnx.mul(o.c).add(dnz.mul(o.s)).mul(g));
          gz2.addAssign(dnz.mul(o.c).sub(dnx.mul(o.s)).mul(g));
        });
      }
      return vec3(hh, gx2, gz2);
    });
    const od = oct(x, z, distK.d, big, small, ridge, b, dhx, dhz);
    let h = od.x;
    dhx = od.y; dhz = od.z;
    if (edgeNode) {
      const H = u.bdHalf, ax = abs(x), az = abs(z), out = max(ax, az).sub(H);
      const onX = ax.greaterThanEqual(az);
      const t = select(onX, clamp(z, H.negate(), H), clamp(x, H.negate(), H)).add(H).div(H.mul(2).max(1)).mul(u.edgeN.sub(1));
      const row = select(onX, select(x.lessThan(0), int(0), int(1)), select(z.lessThan(0), int(2), int(3)));
      const t0 = floor(t), tf = t.sub(t0), ti = int(t0), tj = int(min(t0.add(1), u.edgeN.sub(1)));
      const e = mix(textureLoad(edgeNode, ivec2(ti, row)).x, textureLoad(edgeNode, ivec2(tj, row)).x, tf);
      const wb = select(H.greaterThan(0.5), smoothstep(0, u.bdBlend, out), float(1));
      h = mix(e, h, wb); dhx = dhx.mul(wb); dhz = dhz.mul(wb);
    }
    return { h, dhx, dhz, wl, wf, r };
  }

  makeMaterial() {
    const center = uniform(new THREE.Vector2()).onObjectUpdate(({ object }) => object.userData.center);
    const inner = uniform(new THREE.Vector4(0, 0, -1, -1)).onObjectUpdate(({ object }) => object.userData.inner);
    const s = uniform(1).onObjectUpdate(({ object }) => object.userData.s);
    const minDist = uniform(0).onObjectUpdate(({ object }) => object.userData.minDist);
    const gridNode = this.gridNode, edgeNode = this.edgeNode;
    const u = this.u, U = this.U, M = this.M, half = M / 2;
    const gl = positionLocal.xz;
    const cheb = max(abs(gl.x), abs(gl.y));
    const mk = smoothstep(half - 10, half - 2, cheb);
    const glm = gl.sub(fract(gl.mul(0.5)).mul(2).mul(mk));
    const wxz = center.add(glm.mul(s));
    const c0 = this.heightNode(gridNode, edgeNode, wxz.x, wxz.y, { d: length(wxz.sub(u.cam.xz)), minDist });
    const h = c0.h;
    const camD2 = wxz.sub(u.cam.xz).dot(wxz.sub(u.cam.xz));
    const curve = camD2.div(2 * R_EARTH);
    const vH = varying(h), vWl = varying(c0.wl), vWf = varying(c0.wf), vR = varying(c0.r);
    const vN = varying(normalize(vec3(c0.dhx.negate(), float(1), c0.dhz.negate())));
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    m.name = 'Earth';
    m.positionNode = vec3(wxz.x, h.sub(curve), wxz.y);
    const wp = positionWorld;
    const nBig = texture(this.noise, wp.xz.div(1400)), nMid = texture(this.noise, wp.xz.div(160)), nSm = texture(this.noise, wp.xz.div(19));
    const N = normalize(vN), slope = float(1).sub(N.y);
    const hh = vH.add(u.yOff);
    const wet = u.veg.mul(float(1).sub(u.arid)).clamp(0, 1);
    const ground = mix(mix(U.ground.c1, U.ground.c2, nMid.g), vec3(0.11, 0.09, 0.06), wet.mul(0.55)).mul(nSm.r.mul(0.25).add(0.88));
    const lush = mix(vec3(0.07, 0.13, 0.04), vec3(0.035, 0.08, 0.03), nMid.b.mul(0.7).add(nBig.a.mul(0.3)));
    const veg = mix(mix(U.grass.c1, U.grass.c2, nMid.b.mul(0.6).add(nSm.g.mul(0.4))), lush, wet.mul(0.85));
    const sand = mix(U.sand.c1, U.sand.c2, nSm.b);
    const high = mix(U.high.c1, U.high.c2, nMid.r);
    const strata = fract(hh.mul(0.021).add(nBig.b.mul(3)));
    const rock = mix(U.rock.c1, U.rock.c2, smoothstep(0.3, 0.7, strata).mul(0.5).add(nMid.a.mul(0.5)));
    const flat = float(1).sub(smoothstep(0.12, 0.3, slope));
    const vegW = smoothstep(0.12, 0.75, u.veg.add(nBig.g.sub(0.5).mul(0.5)).add(nMid.a.sub(0.5).mul(0.25))).mul(float(1).sub(smoothstep(0.2, 0.45, slope))).mul(float(1).sub(smoothstep(u.snowLine.mul(0.7), u.snowLine.mul(0.9), hh))).mul(mix(U.grassAmount.mul(0.6).add(0.7), float(1), wet)).clamp(0, 1);
    const aridW = smoothstep(0.4, 0.8, u.arid.add(nBig.r.sub(0.5).mul(0.5)));
    const beachW = smoothstep(3.5, 0.6, vH.sub(vWl).add(nSm.r.mul(1.2))).mul(smoothstep(0.0, 0.05, vWf.add(smoothstep(40, 0, vH.sub(vWl)).mul(0.1)))).mul(flat);
    const highW = smoothstep(u.snowLine.mul(0.62), u.snowLine.mul(0.85), hh.add(nBig.r.sub(0.5).mul(400)));
    const rockW = max(smoothstep(0.34, 0.52, slope.add(nMid.r.sub(0.5).mul(0.2))), smoothstep(0.55, 0.9, vR.div(900).add(nMid.g.sub(0.5).mul(0.4))).mul(smoothstep(0.12, 0.25, slope)));
    const snowW = max(smoothstep(u.snowLine, u.snowLine.add(220), hh.add(nMid.r.sub(0.5).mul(300))), u.ice).mul(float(1).sub(smoothstep(0.55, 0.8, slope)));
    let col = mix(ground, sand, aridW.mul(0.65));
    col = mix(col, veg, vegW.mul(float(1).sub(aridW.mul(0.8))));
    col = mix(col, high, highW.mul(0.8));
    col = mix(col, sand, beachW);
    col = mix(col, rock, rockW);
    col = mix(col, U.snow, snowW);
    const dist = length(wp.sub(u.cam));
    const air = float(1).sub(dist.div(-5200).exp()).mul(0.55).mul(smoothstep(300, 3000, dist));
    m.colorNode = col.mul(float(1).sub(air));
    m.emissiveNode = vec3(this.haze).mul(air);
    m.roughnessNode = mix(mix(float(0.92), float(0.97), vegW), float(0.6), snowW);
    m.normalNode = transformNormalToView(N);
    const inside = (cx, cz, hx, hz) => abs(wp.x.sub(cx)).lessThan(hx).and(abs(wp.z.sub(cz)).lessThan(hz));
    const bd = this.backdrop;
    {
      m.maskNode = Fn(() => {
        let keep = inside(inner.x, inner.y, inner.z, inner.w).not();
        if (bd) keep = keep.and(inside(0, 0, u.bdHalf.sub(bd.overlap || 4), u.bdHalf.sub(bd.overlap || 4)).not());
        return keep;
      })();
    }
    return m;
  }

  makeLevel(l) {
    const M = this.M, s = this.s0 * 2 ** l, half = M / 2, hole = l === 0 ? -1 : M / 4 - 1;
    const pos = [], idx = [], id = (i, j) => i * (M + 1) + j;
    for (let i = 0; i <= M; i++) for (let j = 0; j <= M; j++) pos.push(j - half, 0, i - half);
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
      const cx = j - half + 0.5, cz = i - half + 0.5;
      if (Math.abs(cx) < hole && Math.abs(cz) < hole) continue;
      idx.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i + 1, j + 1), id(i, j + 1), id(i + 1, j));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.name = `earth_L${l}`; mesh.renderOrder = -20 + l;
    mesh.userData = { center: new THREE.Vector2(), inner: new THREE.Vector4(0, 0, -1, -1), s, minDist: l === 0 ? 0 : (M / 4 - 2) * s };
    this.root.add(mesh);
    return { l, s, mesh, center: { value: mesh.userData.center }, inner: { value: mesh.userData.inner } };
  }

  update(cam) {
    const u = this.u, cp = cam.position;
    u.cam.value.copy(cp);
    const half = this.M / 2;
    for (const L of this.levels) {
      const step = 2 * L.s;
      L.cx = Math.floor(cp.x / step + 0.5) * step; L.cz = Math.floor(cp.z / step + 0.5) * step;
      L.center.value.set(L.cx, L.cz);
    }
    for (let i = 0; i < this.levels.length; i++) {
      const L = this.levels[i], P = this.levels[i - 1];
      if (P) L.inner.value.set(P.cx, P.cz, half * P.s - 0.01, half * P.s - 0.01);
      let vis = true;
      if (this.backdrop && u.bdHalf.value > 0) { const h = u.bdHalf.value - 8, ext = half * L.s; vis = !(Math.abs(L.cx) + ext < h && Math.abs(L.cz) + ext < h); }
      const far = (half / 2 - 1) * L.s;
      if (far > 40000) vis = false;
      L.mesh.visible = vis && this.visible !== false;
    }
  }

  async precompile(renderer, camera, scene, extra = []) {
    const roots = [this.root, ...extra];
    const state = roots.map((r) => ({ r, parent: r.parent, vis: r.visible, kids: r.children.map((c) => c.visible) }));
    for (const s of state) { if (s.parent) s.parent.remove(s.r); s.r.visible = true; for (const c of s.r.children) c.visible = true; }
    const t0 = performance.now();
    const sp = this.gfx.scenePass, prevRT = renderer.getRenderTarget(), prevMRT = renderer.getMRT ? renderer.getMRT() : null;
    try {
      for (const s of state) {
        if (sp && sp.renderTarget) { renderer.setRenderTarget(sp.renderTarget); if (renderer.setMRT) renderer.setMRT(sp.getMRT()); }
        const p = renderer.compileAsync(s.r, camera, scene);
        renderer.setRenderTarget(prevRT); if (renderer.setMRT) renderer.setMRT(prevMRT);
        await p;
      }
    } catch (e) { console.warn('earth precompile', e); renderer.setRenderTarget(prevRT); if (renderer.setMRT) renderer.setMRT(prevMRT); }
    for (const s of state) { s.r.visible = s.vis; s.r.children.forEach((c, i) => { c.visible = s.kids[i]; }); if (s.parent) s.parent.add(s.r); }
    this.compileMs = performance.now() - t0;
  }

  dispose() {
    for (const L of this.levels) L.mesh.geometry.dispose();
    this.mat.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
    if (this.gridTex) this.gridTex.dispose();
    this.latTex.dispose(); this.edgeTex.dispose();
  }
}
