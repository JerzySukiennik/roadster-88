// Roadster 88 procedural placeholder car: lofted 2nd-gen Roadster body split into the contract panels, glass canopy, wheels, brakes, nozzles, lights, interior and anchors with exact node names, pivots and material names (swap for assets/car/roadster.glb).
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeoms } from './plate.js';

function curve(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0]);
  const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function makeShape(tu) {
  const c = tu.car, W = tu.wheels;
  const ax = c.wheelbase / 2;
  const zN = c.collider_box.center[2] + c.length / 2 - 0.0, zT = zN - c.length;
  const H = c.height;
  const kz = (v) => v;
  const P = {
    zN, zT, ax,
    top: curve([[zN, 0.42], [zN - 0.1, 0.53], [zN - 0.3, 0.64], [ax + 0.28, 0.75], [ax, 0.805], [ax - 0.33, 0.815], [0.75, 0.83], [0.3, 0.87], [-0.3, 0.9], [-1.0, 0.93], [-ax, 0.94], [-ax - 0.38, 0.915], [zT + 0.16, 0.86], [zT, 0.8]].map(([z, v]) => [kz(z), v])),
    mid: curve([[zN, 0.33], [zN - 0.15, 0.4], [zN - 0.45, 0.5], [ax, 0.585], [1.0, 0.6], [0.3, 0.62], [-0.5, 0.66], [-ax, 0.685], [-ax - 0.48, 0.65], [zT, 0.58]]),
    w: curve([[zN, 0.56], [zN - 0.06, 0.7], [zN - 0.2, 0.8], [zN - 0.45, 0.9], [ax, 0.975], [1.0, 0.962], [0.4, 0.928], [-0.3, 0.94], [-1.0, 0.988], [-ax, 0.996], [-ax - 0.48, 0.95], [zT + 0.06, 0.86], [zT, 0.8]]),
    sill: curve([[zN, 0.17], [zN - 0.06, 0.15], [zN - 0.26, 0.15], [1.0, 0.17], [0, 0.18], [-1.0, 0.18], [-ax - 0.38, 0.2], [zT + 0.16, 0.21], [zT, 0.225]]),
    valley: curve([[zN, 0], [zN - 0.15, 0.0], [zN - 0.35, 0.05], [ax, 0.085], [1.0, 0.07], [0.78, 0.03], [0.6, 0.0], [-1.2, 0.0], [-1.55, 0.03], [zT + 0.25, 0.03], [zT, 0.0]]),
    n: curve([[zN, 2.2], [zN - 0.3, 2.5], [0, 2.7], [zT, 2.5]]),
    archF: { z: ax, y: W.radius_front, R: W.radius_front + 0.068 },
    archR: { z: -ax, y: W.radius_rear, R: W.radius_rear + 0.07 },
    cz0: 0.74, cz1: -1.64,
    cTop: curve([[0.74, 0.0], [0.55, 0.9], [0.25, 1.0], [-0.05, H - 0.03], [-0.35, H], [-0.7, H - 0.015], [-1.0, H - 0.07], [-1.3, H - 0.15], [-1.64, 0.0]]),
    wb: curve([[0.74, 0.62], [0.45, 0.75], [0.0, 0.79], [-0.55, 0.79], [-1.0, 0.74], [-1.38, 0.6], [-1.64, 0.4]]),
  };
  const cache = new Map();
  P.section = (z) => {
    const key = Math.round(z * 20000);
    let s = cache.get(key);
    if (s) return s;
    const top = P.top(z), mid = P.mid(z), w = P.w(z), sill = P.sill(z), n = P.n(z), val = P.valley(z), hu = top - mid;
    const xs = [], ys = [];
    const K = 48, M = 24;
    for (let k = 0; k <= K; k++) {
      const th = (Math.PI / 2) * (1 - k / K);
      const x = w * Math.pow(Math.cos(th), 2 / n), y0 = mid + hu * Math.pow(Math.sin(th), 2 / n);
      const vf = 1 - sstep(0.18, 0.72, x / w);
      xs.push(x); ys.push(y0 - val * vf);
    }
    for (let k = 1; k <= M; k++) { const f = k / M; xs.push(w - 0.065 * f * f); ys.push(mid - f * (mid - sill)); }
    const L = [0];
    for (let i = 1; i < xs.length; i++) L.push(L[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
    const tot = L[L.length - 1];
    s = { xs, ys, t: L.map((v) => v / tot), len: tot };
    cache.set(key, s);
    return s;
  };
  P.pt = (z, s, out) => {
    const S = P.section(z), a = Math.min(1, Math.abs(s));
    let i = 0; const t = S.t; while (i < t.length - 2 && t[i + 1] < a) i++;
    const f = (a - t[i]) / Math.max(1e-9, t[i + 1] - t[i]);
    const x = lerp(S.xs[i], S.xs[i + 1], f), y = lerp(S.ys[i], S.ys[i + 1], f);
    out[0] = s < 0 ? -x : x; out[1] = y; out[2] = z;
    return out;
  };
  P.arch = (z) => {
    let y = -9;
    for (const A of [P.archF, P.archR]) { const dz = z - A.z; if (Math.abs(dz) < A.R) y = Math.max(y, A.y + Math.sqrt(A.R * A.R - dz * dz)); }
    return y;
  };
  P.sAtY = (z, y) => {
    const S = P.section(z);
    for (let i = S.ys.length - 1; i > 0; i--) if (S.ys[i - 1] >= y && S.ys[i] <= y) { const f = (y - S.ys[i]) / Math.max(1e-9, S.ys[i - 1] - S.ys[i]); return lerp(S.t[i], S.t[i - 1], f); }
    return 1;
  };
  P.sAtX = (z, x) => {
    const S = P.section(z);
    for (let i = 1; i < S.xs.length; i++) if (S.xs[i] >= x) { const f = (x - S.xs[i - 1]) / Math.max(1e-9, S.xs[i] - S.xs[i - 1]); return lerp(S.t[i - 1], S.t[i], f); }
    return 0.5;
  };
  P.sEnd = (z) => P.sAtY(z, Math.max(P.sill(z) + 0.001, P.arch(z)));
  P.sBelt = (z) => P.sAtX(z, P.wb(z));
  P.yb = (z) => { const tmp = [0, 0, 0]; return P.pt(z, P.sBelt(z), tmp)[1]; };
  P.cpt = (z, s, out, inset = 0) => {
    const wb = P.wb(z) - inset, yb = P.yb(z) - 0.004, yc = Math.max(P.cTop(z) - inset, yb + 0.002);
    const a = Math.min(1, Math.abs(s)), th = (Math.PI / 2) * (1 - a), nc = 2.3;
    const x = wb * Math.pow(Math.cos(th), 2 / nc), y = yb + (yc - yb) * Math.pow(Math.sin(th), 2 / nc);
    out[0] = s < 0 ? -x : x; out[1] = y; out[2] = z;
    return out;
  };
  return P;
}

function gridGeom(nz, ns, fn, center) {
  const pos = new Float32Array((nz + 1) * (ns + 1) * 3), uv = new Float32Array((nz + 1) * (ns + 1) * 2), idx = [];
  const p = [0, 0, 0];
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= ns; j++) {
    fn(i / nz, j / ns, p);
    const k = i * (ns + 1) + j;
    pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
    uv[k * 2] = j / ns; uv[k * 2 + 1] = i / nz;
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < ns; j++) { const a = i * (ns + 1) + j, b = a + 1, c = a + ns + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  orient(g, center);
  return g;
}

function orient(g, center) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  let score = 0;
  for (let i = 0; i < pos.count; i += Math.max(1, (pos.count / 64) | 0)) {
    const cx = center ? center(pos.getZ(i)) : [0, 0.5, pos.getZ(i)];
    score += (pos.getX(i) - cx[0]) * nor.getX(i) + (pos.getY(i) - cx[1]) * nor.getY(i) + (pos.getZ(i) - cx[2]) * nor.getZ(i);
  }
  if (score < 0) flipGeom(g);
}

function flipGeom(g) {
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.index.needsUpdate = true;
  g.computeVertexNormals();
}

function mirrorX(g) {
  const m = g.clone();
  const p = m.attributes.position, n = m.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); if (n) n.setX(i, -n.getX(i)); }
  if (m.index) { const a = m.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
  else { for (let i = 0; i < p.count; i += 3) { for (const att of [p, n]) { if (!att) continue; const x = att.getX(i + 1), y = att.getY(i + 1), z = att.getZ(i + 1); att.setXYZ(i + 1, att.getX(i + 2), att.getY(i + 2), att.getZ(i + 2)); att.setXYZ(i + 2, x, y, z); } } }
  return m;
}

const bodyCenter = (z) => [0, 0.5, z];

export function buildShadowProxy(tu) {
  const P = makeShape(tu);
  const body = gridGeom(48, 28, (u, v, out) => { const z = lerp(P.zN, P.zT, u); const se = P.sEnd(z); P.pt(z, lerp(-se, se, v), out); }, bodyCenter);
  const canopy = gridGeom(20, 16, (u, v, out) => P.cpt(lerp(P.cz0, P.cz1, u), lerp(-1, 1, v), out), (z) => [0, 0.55, z]);
  const floor = new THREE.PlaneGeometry(1.7, P.zN - P.zT - 0.4).rotateX(Math.PI / 2); floor.translate(0, 0.2, (P.zN + P.zT) / 2);
  return mergeGeoms([body, canopy, floor]);
}

export function buildPlaceholderCar(tu, mats) {
  const P = makeShape(tu);
  const W = tu.wheels, C = tu.car, T = tu.thrusters;
  const root = new THREE.Group(); root.name = 'Roadster';
  const M = (n) => mats.get(n);
  const add = (parent, name, geom, matName, extras) => {
    const m = new THREE.Mesh(geom, M(matName)); m.name = name; m.castShadow = true; m.receiveShadow = true;
    if (extras) m.userData = { ...extras };
    parent.add(m); return m;
  };
  const group = (parent, name, pos, extras) => { const g = new THREE.Group(); g.name = name; if (pos) g.position.set(...pos); if (extras) g.userData = { ...extras }; parent.add(g); return g; };
  const G = 0.0045;
  const val = (f, z) => (typeof f === 'function' ? f(z) : f);
  const patch = (za, zb, sa, sb, nz, ns, inset = 0) => gridGeom(nz, ns, (u, v, out) => {
    const z = lerp(za, zb, u);
    const s0 = val(sa, z), s1 = val(sb, z);
    P.pt(z, lerp(s0, s1, v), out);
    if (inset) { out[0] *= 1 - inset / Math.max(0.3, Math.abs(out[0]) + 0.3); out[1] -= inset * 0.5; }
  }, bodyCenter);
  const zN = P.zN, zT = P.zT;
  const zBF = zN - 0.33, zHood0 = 0.85, zCowl = P.cz0, zDoor0 = 0.62, zDoor1 = -0.7, zDeck = P.cz1, zBR = zT + 0.26;
  const hoodS = (z) => P.sAtX(z, 0.56);
  const doorBot = (z) => P.sAtY(z, 0.25);
  const shell = [];
  shell.push(patch(zBF - G, zHood0 + G, (z) => hoodS(z) + G * 2, P.sEnd, 90, 34));
  shell.push(patch(zBF - G, zHood0 + G, (z) => -P.sEnd(z), (z) => -hoodS(z) - G * 2, 90, 34));
  shell.push(patch(zHood0 - G, zCowl, (z) => -P.sEnd(z), P.sEnd, 10, 96));
  shell.push(patch(zCowl, zDoor0 + G, P.sBelt, P.sEnd, 8, 30));
  shell.push(patch(zCowl, zDoor0 + G, (z) => -P.sEnd(z), (z) => -P.sBelt(z), 8, 30));
  shell.push(patch(zDoor0 + G, zDoor1 - G, (z) => doorBot(z) + G * 3, P.sEnd, 60, 6));
  shell.push(patch(zDoor0 + G, zDoor1 - G, (z) => -P.sEnd(z), (z) => -doorBot(z) - G * 3, 60, 6));
  shell.push(patch(zDoor1 - G, zDeck, P.sBelt, P.sEnd, 90, 34));
  shell.push(patch(zDoor1 - G, zDeck, (z) => -P.sEnd(z), (z) => -P.sBelt(z), 90, 34));
  shell.push(patch(zDeck, zBR + G, (z) => -P.sEnd(z), P.sEnd, 26, 96));
  const bodyShell = add(root, 'Body_Shell', mergeGeoms(shell), 'Paint', { deform: true });
  const filler = [
    patch(zN - 0.01, P.cz0, (z) => -P.sEnd(z) * 0.995, (z) => P.sEnd(z) * 0.995, 50, 60, 0.008),
    patch(P.cz0, P.cz1, P.sBelt, (z) => P.sEnd(z) * 0.995, 70, 24, 0.008),
    patch(P.cz0, P.cz1, (z) => -P.sEnd(z) * 0.995, (z) => -P.sBelt(z), 70, 24, 0.008),
    patch(P.cz1, zT + 0.01, (z) => -P.sEnd(z) * 0.995, (z) => P.sEnd(z) * 0.995, 24, 60, 0.008),
  ];
  add(bodyShell, 'Body_Inner', mergeGeoms(filler), 'Underbody', { deform: true });
  add(root, 'Hood', patch(zBF - G, zHood0 + G, (z) => -hoodS(z), hoodS, 70, 40), 'Paint', { deform: true, part: 'Hood' });

  const bumperF = group(root, 'Bumper_F', null, { part: 'Bumper_F', detach: true, deform: true });
  add(bumperF, 'Bumper_F_Skin', patch(zN, zBF - G, (z) => -P.sEnd(z), P.sEnd, 30, 110), 'Paint', { deform: true });
  const capF = endCap(P, zN, 1, [{ x0: -0.36, x1: 0.36, y0: 0.198, y1: 0.342 }]);
  add(bumperF, 'Bumper_F_Face', capF, 'Paint', { deform: true });
  const intake = new THREE.ShapeGeometry(roundRect(-0.5, 0.165, 0.5, 0.215, 0.03)); intake.translate(0, 0, zN + 0.004);
  add(bumperF, 'Bumper_F_Intake', intake, 'Paint_Black', { deform: true });
  add(bumperF, 'Bumper_F_Recess', recessBox(-0.36, 0.36, 0.198, 0.342, zN - 0.2, zN), 'Underbody');
  const splitter = new THREE.BoxGeometry(1.2, 0.012, 0.16); splitter.translate(0, 0.152, zN - 0.07);
  add(bumperF, 'Bumper_F_Splitter', splitter, 'Carbon');

  const flap = group(root, 'Flap_F', [0, 0.342, zN + 0.004], { part: 'Flap_F', detach: true });
  const flapG = new THREE.BoxGeometry(0.7, 0.142, 0.012); flapG.translate(0, -0.071, -0.004);
  add(flap, 'Flap_F_Panel', flapG, 'Paint');

  const bumperR = group(root, 'Bumper_R', null, { part: 'Bumper_R', detach: true, deform: true });
  add(bumperR, 'Bumper_R_Skin', patch(zBR - G, zT, (z) => -P.sEnd(z), P.sEnd, 24, 110), 'Paint', { deform: true });
  add(bumperR, 'Bumper_R_Face', endCap(P, zT, -1, [{ x0: -0.62, x1: 0.62, y0: 0.24, y1: 0.45 }]), 'Paint', { deform: true });
  add(bumperR, 'Bumper_R_Diffuser', recessBox(-0.62, 0.62, 0.24, 0.45, zT, zT + 0.24), 'Carbon');
  const fins = [];
  for (const x of [-0.62, -0.285, 0, 0.285, 0.62]) { const f = new THREE.BoxGeometry(0.012, 0.09, 0.42); f.translate(x, 0.19, zT + 0.24); fins.push(f); }
  const lip = new THREE.BoxGeometry(1.5, 0.014, 0.4); lip.rotateX(-0.12); lip.translate(0, 0.205, zT + 0.24); fins.push(lip);
  add(bumperR, 'Bumper_R_Fins', mergeGeoms(fins), 'Carbon');

  for (const side of [1, -1]) {
    const L = side > 0;
    const hingeZ = zDoor0, hingeX = side * 0.9;
    const door = group(root, L ? 'Door_L' : 'Door_R', [hingeX, 0.5, hingeZ], { part: L ? 'Door_L' : 'Door_R', detach: true, deform: true });
    const dg = side > 0 ? patch(zDoor0, zDoor1, P.sBelt, doorBot, 70, 40) : patch(zDoor0, zDoor1, (z) => -doorBot(z), (z) => -P.sBelt(z), 70, 40);
    dg.translate(-hingeX, -0.5, -hingeZ);
    add(door, (L ? 'Door_L' : 'Door_R') + '_Skin', dg, 'Paint', { deform: true });
    const card = new RoundedBoxGeometry(0.04, 0.42, 1.18, 3, 0.015); card.translate(side * 0.8 - hingeX, 0.55 - 0.5, (zDoor0 + zDoor1) / 2 - hingeZ);
    add(door, (L ? 'Door_L' : 'Door_R') + '_Card', card, 'Interior_Dark');
    const glass = canopyPatch(P, 0.36, -0.76, 0.69, 1.0, side, 40, 14);
    glass.translate(-hingeX, -0.5, -hingeZ);
    add(door, L ? 'Glass_Door_L' : 'Glass_Door_R', glass, 'Glass_Tint', { glass: true });
    const mirror = group(root, L ? 'Mirror_L' : 'Mirror_R', [side * 0.86, 0.86, 0.52], { part: L ? 'Mirror_L' : 'Mirror_R', detach: true });
    const stalk = new THREE.BoxGeometry(0.11, 0.018, 0.04); stalk.rotateZ(side * 0.35); stalk.translate(side * 0.05, 0.03, 0.01);
    const housing = new THREE.SphereGeometry(0.06, 20, 12); housing.scale(1.45, 0.62, 0.95); housing.translate(side * 0.12, 0.06, -0.005);
    add(mirror, (L ? 'Mirror_L' : 'Mirror_R') + '_Housing', mergeGeoms([stalk, housing]), 'Paint');
    const mg = new THREE.CircleGeometry(0.05, 20); mg.scale(1.35, 0.55, 1); mg.rotateY(Math.PI); mg.translate(side * 0.12, 0.06, -0.06);
    add(mirror, (L ? 'Mirror_L' : 'Mirror_R') + '_Glass', mg, 'Chrome');
  }

  const fr = [];
  const strip = (za, zb, sa, sb, nz, ns) => fr.push(canopyPatch(P, za, zb, sa, sb, 0, nz, ns, 0.004));
  for (const sg of [1, -1]) {
    const S = (a, b) => (sg > 0 ? [a, b] : [-b, -a]);
    strip(P.cz0, -0.8, ...S(0.6, 0.71), 60, 3);
    strip(P.cz0, 0.34, ...S(0.69, 1.0), 10, 6);
    strip(-0.74, -0.84, ...S(0.62, 1.0), 4, 8);
    strip(-0.8, P.cz1, ...S(0.62, 0.72), 30, 3);
    strip(-1.28, P.cz1, ...S(0.7, 1.0), 12, 6);
  }
  strip(-0.1, -0.19, -0.72, 0.72, 4, 30);
  strip(-0.72, -0.82, -0.72, 0.72, 4, 30);
  add(root, 'Canopy_Frame', mergeGeoms(fr), 'Paint_Black');
  add(root, 'Glass_Windshield', canopyPatch(P, P.cz0 - 0.005, -0.12, -0.63, 0.63, 0, 60, 60), 'Glass_Tint', { glass: true });
  add(root, 'Roof_Targa', canopyPatch(P, -0.17, -0.74, -0.6, 0.6, 0, 30, 50), 'Glass_Tint', { part: 'Roof_Targa', detach: true, glass: true });
  add(root, 'Glass_Rear', canopyPatch(P, -0.8, P.cz1 + 0.01, -0.64, 0.64, 0, 50, 50), 'Glass_Tint', { glass: true });
  add(root, 'Glass_Quarter_L', canopyPatch(P, -0.82, -1.3, 0.7, 1.0, 1, 24, 10), 'Glass_Tint', { glass: true });
  add(root, 'Glass_Quarter_R', canopyPatch(P, -0.82, -1.3, -1.0, -0.7, -1, 24, 10), 'Glass_Tint', { glass: true });

  const under = [];
  const plate = new THREE.BoxGeometry(1.62, 0.02, zN - zT - 0.5); plate.translate(0, 0.135, (zN + zT) / 2); under.push(plate);
  for (const A of [P.archF, P.archR]) for (const side of [1, -1]) {
    const bw = P.w(A.z) - 0.015, depth = 0.36;
    const liner = new THREE.CylinderGeometry(A.R + 0.006, A.R + 0.006, depth, 32, 1, true, 0, Math.PI);
    liner.rotateZ(Math.PI / 2); liner.translate(side * (bw - depth / 2), A.y, A.z);
    const lp = liner.attributes.position;
    for (let i = 0; i < lp.count; i++) if (lp.getY(i) < A.y - 0.02) lp.setY(i, A.y - 0.02);
    liner.computeVertexNormals();
    under.push(liner);
  }
  add(root, 'Underbody', mergeGeoms(under), 'Underbody', { deform: true });

  const headL = lightStrip(P, 1, [[zN - 0.06, 0.52], [zN - 0.2, 0.43], [zN - 0.36, 0.35]], 0.028);
  const headR = mirrorX(headL);
  add(root, 'Light_Head_L', headL, 'LED_Head');
  add(root, 'Light_Head_R', headR, 'LED_Head');
  const lensL = lightStrip(P, 1, [[zN - 0.045, 0.6], [zN - 0.2, 0.5], [zN - 0.38, 0.42]], 0.07, 0.0015);
  add(root, 'Light_Head_L_Lens', lensL, 'Paint_Black');
  add(root, 'Light_Head_R_Lens', mirrorX(lensL), 'Paint_Black');
  const tailG = new THREE.ShapeGeometry(tailShape(P)); const tp = tailG.attributes.position; for (let i = 0; i < tp.count; i++) tp.setZ(i, zT - 0.006); flipGeom(tailG);
  add(root, 'Light_Tail', tailG, 'LED_Tail');

  const wheelGeo = {};
  for (const front of [true, false]) {
    const r = front ? W.radius_front : W.radius_rear, w = front ? W.width_front : W.width_rear;
    const rimR = r - (front ? 0.093 : 0.0975);
    wheelGeo[front ? 'F' : 'R'] = { tire: tireGeom(r, rimR, w), rim: rimGeom(rimR, w), disc: discGeom(rimR - 0.06, front ? 0.034 : 0.03), caliper: caliperGeom(rimR - 0.06) };
  }
  const names = [['FL', 1, true], ['FR', -1, true], ['RL', 1, false], ['RR', -1, false]];
  for (const [id, side, front] of names) {
    const tr = (front ? C.track_front : C.track_rear) / 2, r = front ? W.radius_front : W.radius_rear;
    const z = front ? P.ax : -P.ax;
    const gset = wheelGeo[front ? 'F' : 'R'];
    const parent = front ? group(root, 'Steer_' + id, [side * tr, r, z]) : root;
    const wheel = group(parent, 'Wheel_' + id, front ? [0, 0, 0] : [side * tr, r, z], { part: 'Wheel_' + id, detach: true });
    const flip = side < 0;
    add(wheel, 'Tire_' + id, flip ? mirrorX(gset.tire) : gset.tire, 'Tire');
    add(wheel, 'Rim_' + id, flip ? mirrorX(gset.rim) : gset.rim, 'Rim');
    const brake = group(parent, 'Brake_' + id, front ? [0, 0, 0] : [side * tr, r, z]);
    add(brake, 'Disc_' + id, flip ? mirrorX(gset.disc) : gset.disc, 'Brake_Disc');
    const cal = flip ? mirrorX(gset.caliper) : gset.caliper.clone();
    if (!front) { cal.rotateX(Math.PI * 0.55); }
    add(brake, 'Caliper_' + id, cal, 'Caliper');
  }

  const rearNames = ['Nozzle_RL1', 'Nozzle_RL2', 'Nozzle_RR2', 'Nozzle_RR1'];
  T.rear.positions.forEach((p, i) => {
    const nz = group(root, rearNames[i], p, { part: rearNames[i], detach: true, nozzle: true });
    const m = new THREE.Mesh(nozzleGeom(0.052, 0.17, -1), mats.nozzleMaterial(rearNames[i]).mat); m.name = rearNames[i] + '_Bell'; m.castShadow = true; nz.add(m);
    group(nz, 'Exhaust_' + rearNames[i], [0, 0, -0.17]);
  });
  const mp = [0, 0.3, 2.1];
  const mount = group(root, 'NozzleMount_F', mp);
  const frontNames = ['Nozzle_FL', 'Nozzle_FR'];
  T.front.positions.forEach((p, i) => {
    const nz = group(mount, frontNames[i], [p[0] - mp[0], p[1] - mp[1], p[2] - mp[2]], { part: frontNames[i], detach: true, nozzle: true });
    const m = new THREE.Mesh(nozzleGeom(0.042, 0.12, 1), mats.nozzleMaterial(frontNames[i]).mat); m.name = frontNames[i] + '_Bell'; m.castShadow = true; nz.add(m);
    group(nz, 'Exhaust_' + frontNames[i], [0, 0, 0.12]);
  });

  const wing = group(root, 'Wing', null, { part: 'Wing', detach: true });
  const blade = new THREE.BoxGeometry(1.74, 0.022, 0.3); blade.rotateX(0.1); blade.translate(0, 1.13, zT + 0.28);
  const ends = []; for (const s of [1, -1]) { const e = new THREE.BoxGeometry(0.012, 0.16, 0.36); e.translate(s * 0.87, 1.1, zT + 0.28); ends.push(e); }
  const struts = []; for (const s of [1, -1]) { const st = new THREE.BoxGeometry(0.02, 0.26, 0.14); st.rotateX(0.35); st.translate(s * 0.45, 1.0, zT + 0.34); struts.push(st); }
  add(wing, 'Wing_Blade', mergeGeoms([blade, ...ends, ...struts]), 'Carbon');
  wing.visible = false;

  buildInterior(root, P, add, group, mats);

  group(root, 'COM', C.com);
  group(root, 'Lamp_Head_L', [0.68, 0.5, zN - 0.12]);
  group(root, 'Lamp_Head_R', [-0.68, 0.5, zN - 0.12]);
  group(root, 'Lamp_Tail', [0, 0.76, zT - 0.05]);
  group(root, 'Cam_Chase', [0, 1.6, -6]);
  root.userData.placeholder = true;
  return root;
}

function roundRect(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

function endCap(P, z, dir, holes) {
  const s = new THREE.Shape();
  const n = 120, p = [0, 0, 0];
  const se = P.sEnd(z);
  for (let i = 0; i <= n; i++) { P.pt(z, lerp(-se, se, i / n), p); if (i === 0) s.moveTo(p[0], p[1]); else s.lineTo(p[0], p[1]); }
  s.closePath();
  for (const h of holes) { const hp = roundRect(h.x0, h.y0, h.x1, h.y1, 0.025); s.holes.push(new THREE.Path(hp.getPoints(6).reverse())); }
  const g = new THREE.ShapeGeometry(s, 8);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, z);
  if (dir < 0) flipGeom(g); else g.computeVertexNormals();
  return g;
}

function recessBox(x0, x1, y0, y1, za, zb) {
  const w = x1 - x0, h = y1 - y0, d = Math.abs(zb - za), cz = (za + zb) / 2;
  const parts = [];
  const back = new THREE.PlaneGeometry(w, h); back.translate((x0 + x1) / 2, (y0 + y1) / 2, za < zb ? zb : za); if (za > zb) back.rotateY(0);
  const pz = za < zb ? zb - 0.001 : zb + 0.001;
  const bk = new THREE.PlaneGeometry(w, h); if (za < zb) bk.rotateY(Math.PI); bk.translate((x0 + x1) / 2, (y0 + y1) / 2, za < zb ? za + 0.001 + d - d : pz);
  const top = new THREE.PlaneGeometry(w, d); top.rotateX(Math.PI / 2); top.translate((x0 + x1) / 2, y1, cz);
  const bot = new THREE.PlaneGeometry(w, d); bot.rotateX(-Math.PI / 2); bot.translate((x0 + x1) / 2, y0, cz);
  const l = new THREE.PlaneGeometry(d, h); l.rotateY(-Math.PI / 2); l.translate(x1, (y0 + y1) / 2, cz);
  const r = new THREE.PlaneGeometry(d, h); r.rotateY(Math.PI / 2); r.translate(x0, (y0 + y1) / 2, cz);
  parts.push(top, bot, l, r);
  const inner = new THREE.PlaneGeometry(w, h);
  const deepZ = za < zb ? za : za;
  if (za < zb) inner.translate((x0 + x1) / 2, (y0 + y1) / 2, deepZ); else { inner.rotateY(Math.PI); inner.translate((x0 + x1) / 2, (y0 + y1) / 2, deepZ); }
  parts.push(inner);
  void back; void bk;
  const g = mergeGeoms(parts);
  return g;
}

function canopyPatch(P, za, zb, sa, sb, side, nz, ns, inset = 0) {
  const g = gridGeom(nz, ns, (u, v, out) => P.cpt(lerp(za, zb, u), lerp(sa, sb, v), out, inset), (z) => [0, 0.55, z]);
  void side;
  return g;
}

function lightStrip(P, side, ctrl, width, lift = 0.003) {
  const n = 24, pos = [], idx = [];
  const pt = [0, 0, 0], q = [0, 0, 0];
  const cz = curve(ctrl.map((c, i) => [i / (ctrl.length - 1), c[0]])), cs = curve(ctrl.map((c, i) => [i / (ctrl.length - 1), c[1]]));
  for (let i = 0; i <= n; i++) {
    const t = i / n, z = cz(t), s = cs(t) * side;
    for (const k of [-0.5, 0.5]) {
      const S = P.section(z);
      const ds = k * width / S.len;
      P.pt(z, s + ds, pt);
      P.pt(z + 0.002, s + ds, q);
      const nx = pt[0], ny = pt[1] - 0.45;
      const l = Math.hypot(nx, ny) || 1;
      pos.push(pt[0] + nx / l * lift, pt[1] + ny / l * lift, pt[2]);
    }
  }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  orient(g, (z) => [0, 0.45, z]);
  return g;
}

function tailShape(P) {
  const z = P.zT, s = new THREE.Shape(), y = P.top(z) - 0.045, h = 0.026, n = 60, p = [0, 0, 0];
  const se = P.sAtY(z, y);
  const pts = [];
  for (let i = 0; i <= n; i++) { P.pt(z, lerp(-se, se, i / n), p); pts.push([p[0], p[1]]); }
  const xMax = Math.max(...pts.map((q) => q[0])) - 0.04;
  s.moveTo(-xMax, y); s.lineTo(xMax, y + 0.004); s.lineTo(xMax - 0.02, y + h); s.lineTo(-xMax + 0.02, y + h); s.closePath();
  return s;
}

function tireGeom(R, rimR, W) {
  const pts = [], n = 28;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * Math.PI;
    const side = Math.cos(a);
    const r = lerp(rimR + 0.004, R, Math.pow(Math.sin(a), 0.32));
    const x = side * W / 2 * (1 + 0.06 * Math.sin(a) * (1 - Math.abs(side)));
    pts.push(new THREE.Vector2(r, x));
  }
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x, p.y)), 72);
  g.rotateZ(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); pos.setX(i, -y); pos.setY(i, x); }
  g.computeVertexNormals();
  return fixLathe(g);
}

function fixLathe(g) {
  const pos = g.attributes.position, out = new THREE.BufferGeometry();
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z; }
  out.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  out.setIndex(g.index.clone());
  out.setAttribute('uv', g.attributes.uv.clone());
  out.computeVertexNormals();
  return out;
}

function axleLathe(profile, segs) {
  const g = new THREE.LatheGeometry(profile.map(([r, x]) => new THREE.Vector2(r, x)), segs);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); pos.setXYZ(i, y, x, z); }
  const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

function rimGeom(rimR, W) {
  const parts = [];
  const barrel = axleLathe([[rimR - 0.012, -W / 2 + 0.01], [rimR - 0.012, W / 2 - 0.03], [rimR + 0.006, W / 2 - 0.012], [rimR + 0.012, W / 2 + 0.002], [rimR - 0.01, W / 2 + 0.008]], 64);
  parts.push(barrel);
  const hub = axleLathe([[0.0, W / 2 - 0.02], [0.05, W / 2 - 0.02], [0.075, W / 2 - 0.045], [0.075, W / 2 - 0.09]], 32);
  parts.push(hub);
  const nSp = 10;
  for (let i = 0; i < nSp; i++) {
    const a = (i / nSp) * Math.PI * 2;
    const len = rimR - 0.08;
    const sp = new THREE.BoxGeometry(0.03, len, 0.026);
    const p = sp.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) + len / 2; const t = y / len; p.setZ(k, p.getZ(k) * (1.25 - 0.45 * t)); p.setX(k, p.getX(k) - 0.012 * t * t); }
    sp.translate(0, len / 2 + 0.07, 0);
    sp.rotateY(Math.PI / 2);
    sp.rotateX(a + (i % 2 ? 0.07 : -0.07));
    const pp = sp.attributes.position;
    for (let k = 0; k < pp.count; k++) { const r = Math.hypot(pp.getY(k), pp.getZ(k)); pp.setX(k, pp.getX(k) + W / 2 - 0.035 - 0.05 * Math.pow(1 - r / rimR, 1.5)); }
    sp.computeVertexNormals();
    parts.push(sp);
  }
  return mergeGeoms(parts);
}

function discGeom(r, th) {
  const g = axleLathe([[0.09, -th / 2], [r, -th / 2], [r, th / 2], [0.09, th / 2]], 48);
  g.translate(0.02, 0, 0);
  return g;
}

function caliperGeom(r) {
  const g = new RoundedBoxGeometry(0.07, 0.16, 0.08, 3, 0.02);
  g.translate(0.035, r - 0.02, -0.05);
  g.rotateX(-0.6);
  return g;
}

function nozzleGeom(exitR, len, dir) {
  const prof = [[0.0, 0.03], [0.034, 0.03], [0.04, 0.0], [0.03, -0.02], [0.026, -0.04], [exitR * 0.55, -len * 0.45], [exitR, -len], [exitR - 0.004, -len], [exitR * 0.5, -len * 0.5], [0.02, -0.04]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  g.rotateX(dir < 0 ? Math.PI / 2 : -Math.PI / 2);
  const ring = new THREE.TorusGeometry(0.046, 0.007, 8, 28);
  return mergeGeoms([g, ring]);
}

function buildInterior(root, P, add, group, mats) {
  const it = group(root, 'Interior', null, {});
  const parts = { dark: [], leather: [], alc: [] };
  const floor = new THREE.BoxGeometry(1.56, 0.04, 2.3); floor.translate(0, 0.16, -0.45); parts.dark.push(floor);
  const dash = new RoundedBoxGeometry(1.46, 0.14, 0.34, 4, 0.05); dash.translate(0, 0.63, 0.62); parts.dark.push(dash);
  const dashTop = new RoundedBoxGeometry(1.4, 0.026, 0.3, 3, 0.012); dashTop.rotateX(0.12); dashTop.translate(0, 0.705, 0.64); parts.alc.push(dashTop);
  const lower = new THREE.BoxGeometry(1.4, 0.4, 0.2); lower.translate(0, 0.4, 0.74); parts.dark.push(lower);
  const tunnel = new RoundedBoxGeometry(0.22, 0.26, 1.15, 3, 0.04); tunnel.translate(0, 0.3, -0.05); parts.dark.push(tunnel);
  const tunnelTop = new RoundedBoxGeometry(0.2, 0.03, 0.8, 3, 0.012); tunnelTop.translate(0, 0.44, -0.1); parts.leather.push(tunnelTop);
  for (const side of [1, -1]) {
    const x = side * 0.38;
    const cush = new RoundedBoxGeometry(0.5, 0.12, 0.52, 4, 0.05); cush.rotateX(-0.12); cush.translate(x, 0.26, -0.08); parts.leather.push(cush);
    const back = new RoundedBoxGeometry(0.5, 0.72, 0.13, 4, 0.05); back.translate(0, 0.36, 0); back.rotateX(-0.36); back.translate(x, 0.27, -0.38); parts.leather.push(back);
    for (const bs of [1, -1]) { const bol = new RoundedBoxGeometry(0.07, 0.5, 0.16, 3, 0.03); bol.translate(bs * 0.24, 0.3, 0.03); bol.rotateX(-0.36); bol.translate(x, 0.27, -0.38); parts.leather.push(bol); }
    const rear = new RoundedBoxGeometry(0.42, 0.1, 0.36, 3, 0.04); rear.translate(x, 0.3, -1.05); parts.leather.push(rear);
    const rearBack = new RoundedBoxGeometry(0.42, 0.42, 0.1, 3, 0.04); rearBack.rotateX(-0.25); rearBack.translate(x, 0.55, -1.25); parts.leather.push(rearBack);
    const sill = new RoundedBoxGeometry(0.1, 0.12, 2.1, 3, 0.03); sill.translate(side * 0.8, 0.3, -0.4); parts.dark.push(sill);
  }
  const ped = new THREE.BoxGeometry(0.06, 0.12, 0.02); const pedA = ped.clone(); pedA.rotateX(-0.6); pedA.translate(0.3, 0.24, 0.86); parts.dark.push(pedA);
  const pedB = new THREE.BoxGeometry(0.1, 0.1, 0.02); pedB.rotateX(-0.6); pedB.translate(0.46, 0.25, 0.84); parts.dark.push(pedB);
  add(it, 'Interior_Dark_Parts', mergeGeoms(parts.dark), 'Interior_Dark');
  add(it, 'Interior_Seats', mergeGeoms(parts.leather), 'Interior_Leather');
  add(it, 'Interior_Alcantara', mergeGeoms(parts.alc), 'Alcantara');

  const wheel = group(root, 'SteeringWheel', [0.38, 0.69, 0.33]);
  wheel.rotation.x = 0.36;
  const yoke = [];
  const ring = new THREE.TorusGeometry(0.15, 0.017, 10, 40, Math.PI * 1.25); ring.rotateZ(-Math.PI * 1.125 + Math.PI); ring.scale(1.12, 0.78, 1); yoke.push(ring);
  for (const s of [1, -1]) { const grip = new THREE.CapsuleGeometry(0.021, 0.1, 4, 10); grip.translate(s * 0.165, -0.01, 0); yoke.push(grip); }
  const bar = new THREE.BoxGeometry(0.3, 0.03, 0.025); bar.translate(0, -0.11, 0); yoke.push(bar);
  const hubG = new THREE.CylinderGeometry(0.055, 0.06, 0.05, 24); hubG.rotateX(Math.PI / 2); hubG.translate(0, 0, 0.02); yoke.push(hubG);
  add(wheel, 'SteeringWheel_Yoke', mergeGeoms(yoke), 'Alcantara');
  const col = new THREE.CylinderGeometry(0.03, 0.04, 0.22, 12); col.rotateX(Math.PI / 2); col.translate(0, 0, 0.13);
  add(wheel, 'SteeringWheel_Column', col, 'Interior_Dark');
  group(wheel, 'Grip_L', [0.165, -0.01, 0]);
  group(wheel, 'Grip_R', [-0.165, -0.01, 0]);

  const screen = new THREE.PlaneGeometry(0.33, 0.20625);
  const sm = new THREE.Mesh(screen, mats.get('Screen')); sm.name = 'Screen';
  sm.position.set(0.02, 0.8, 0.5); sm.rotation.set(-0.5, Math.PI + 0.18, 0, 'YXZ');
  root.add(sm);
  const bezel = new RoundedBoxGeometry(0.345, 0.222, 0.016, 3, 0.008); bezel.translate(0, 0, -0.0095);
  const bz = new THREE.Mesh(bezel, mats.get('Interior_Dark')); bz.name = 'Screen_Bezel'; sm.add(bz);
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.06), mats.get('Cluster')); cl.name = 'Cluster';
  cl.position.set(0.38, 0.745, 0.5); cl.rotation.set(-0.55, Math.PI, 0, 'YXZ');
  root.add(cl);
  group(root, 'Seat_Driver', [0.38, 0.27, -0.14]);
  group(root, 'Eye_Driver', [0.38, 0.985, -0.3]);
}
