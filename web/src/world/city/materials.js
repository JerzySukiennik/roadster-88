// Roadster 88 city materials (TSL): one facade material for every building, roof, trim, sign, water tower and structure (procedural window grids per facade style with recessed frames, storefronts, lit windows at night, office floors, blinds, grime, brick and stone courses, reflective curtain walls, decay for ruins, city shadow heights), the street ground material (asphalt with lane markings, crosswalks, stop lines, bike lanes, runway markings, sidewalk slabs, curbs, plazas, lawns, yards, street-light pools and puddles) and small shared materials for props.
import * as THREE from 'three/webgpu';
import { Fn, uniform, attribute, uv, texture, bumpMap, vec2, vec3, vec4, float, floor, fract, abs, min, max, mix, step, smoothstep, clamp, hash, fwidth, positionWorld, positionLocal, normalWorld, normalView, transformNormalToView, exp, sin, cos, length, select, pow, cameraPosition, normalize, dot } from 'three/tsl';

const H = (x) => hash(x.add(524288.0));

export function cityUniforms() {
  return {
    night: uniform(0), fill: uniform(0.04), lights: uniform(1), scifi: uniform(0), decay: uniform(0), wet: uniform(0), time: uniform(0), litBoost: uniform(1),
    lawn: uniform(new THREE.Color(0.11, 0.16, 0.05)), lawn2: uniform(new THREE.Color(0.16, 0.18, 0.07)), dirtRoads: uniform(0), grime: uniform(0.35), snow: uniform(0),
    camPos: uniform(new THREE.Vector3()), smallR: uniform(2300),
    shadowTex: null, shadowOn: uniform(0), shadowBox: uniform(new THREE.Vector4(-6500, 3200, 4400, 7800)), lightDir: uniform(new THREE.Vector3(0.4, 0.7, 0.3)),
  };
}

function shadowTerm(U, nW) {
  if (!U.shadowTex) return float(1);
  const B = U.shadowBox;
  const p = positionWorld.xz.add(nW.xz.mul(1.6));
  const suv = p.sub(B.xy).div(B.zw.sub(B.xy)).toVar();
  const sh = texture(U.shadowTex, suv).r;
  const inside = step(0, suv.x).mul(step(suv.x, 1)).mul(step(0, suv.y)).mul(step(suv.y, 1));
  const lit = smoothstep(sh.sub(1.5), sh.add(1.5), positionWorld.y);
  return mix(float(1), lit, inside.mul(U.shadowOn));
}

export function facadeMaterial(U, noise, opts = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  m.name = 'CityFacade';
  const hq = opts.quality !== 'low';
  const fa = attribute('fa', 'vec4'), fb = attribute('fb', 'vec4'), fc = attribute('fc', 'vec4');
  const style = fa.x.mul(255).round(), floorH = fa.y.mul(255 / 32).max(2.4), bayW = fa.z.mul(255 / 32).max(0.8), kind = fa.w.mul(255).round();
  const base = fb.xyz, seed = fb.w.mul(255);
  const winW = fc.x.max(0.004), winH = fc.y.max(0.004), groundH = fc.z.mul(255 / 16), litF = fc.w;
  const UV = uv(), u = UV.x, v = UV.y;
  const wp = positionWorld;
  const is = (k) => kind.equal(k);
  const sty = (k) => style.equal(k);
  const curtain = sty(5).or(sty(9));
  const glassy = curtain.or(sty(3));
  const nTile = texture(noise, wp.xz.add(wp.y).div(23)), nFine = texture(noise, vec2(u.add(seed.mul(7.3)), v).div(3.7)), nBig = texture(noise, wp.xz.div(310).add(seed.mul(0.013)));
  const bx = u.div(bayW), col = floor(bx), fu = fract(bx);
  const fy = v.sub(groundH).div(floorH), row = floor(fy), fv = fract(fy);
  const above = step(groundH, v);
  const wx = fwidth(bx).max(0.0001), wy = fwidth(fy).max(0.0001);
  const hw = winW.mul(0.5), sill = float(1).sub(winH).mul(0.55);
  const mx = smoothstep(hw.add(wx), hw.sub(wx), abs(fu.sub(0.5)));
  const my = smoothstep(sill.sub(wy), sill.add(wy), fv).mul(smoothstep(sill.add(winH).add(wy), sill.add(winH).sub(wy), fv));
  const far = smoothstep(0.18, 0.55, max(wx, wy));
  const winSharp = mx.mul(my);
  const win = mix(winSharp, winW.mul(winH), far).mul(above);
  const wu = fu.sub(float(0.5).sub(hw)).div(winW.max(0.01)), wv = fv.sub(sill).div(winH.max(0.01));
  const frW = select(curtain, float(0.03), float(0.07));
  const frm = max(max(smoothstep(frW.add(wx.div(winW)), frW, wu), smoothstep(float(1).sub(frW).sub(wx.div(winW)), float(1).sub(frW), wu)), max(smoothstep(frW.add(wy.div(winH)), frW, wv), smoothstep(float(1).sub(frW).sub(wy.div(winH)), float(1).sub(frW), wv)));
  const mull = select(winW.mul(bayW).greaterThan(1.7).and(curtain.not()), smoothstep(0.035, 0.015, abs(wu.sub(0.5))), float(0));
  const frame = max(frm, mull).mul(winSharp).mul(float(1).sub(far));
  const lintel = smoothstep(0.78, 1.0, wv).mul(winSharp).mul(float(1).sub(far)).mul(select(curtain, float(0.3), float(0.7)));
  const sillBand = select(sty(0).or(sty(1)).or(sty(11)), mx.mul(smoothstep(sill.sub(0.07).sub(wy), sill.sub(0.07), fv)).mul(smoothstep(sill.add(wy), sill, fv)).mul(above).mul(float(1).sub(far)), float(0));
  const sfx = fract(u.div(max(bayW.mul(1.6), 3.2))), sfw = fwidth(u.div(max(bayW.mul(1.6), 3.2))).max(0.0001);
  const store = smoothstep(sfw.add(0.42), sfw.negate().add(0.42), abs(sfx.sub(0.5))).mul(smoothstep(0.35, 0.5, v)).mul(smoothstep(groundH.sub(0.9), groundH.sub(1.05), v)).mul(float(1).sub(above));
  const band = smoothstep(groundH.sub(0.95), groundH.sub(0.85), v).mul(smoothstep(groundH.sub(0.05), groundH.sub(0.15), v)).mul(float(1).sub(above));
  const cellId = col.mul(31.7).add(row.mul(97.3)).add(seed.mul(13.1));
  const hc = H(cellId), hb = H(seed.mul(1.37));
  const office = glassy.or(sty(6)).or(sty(2));
  const litProb = litF.mul(U.night.mul(0.75).add(0.25)).mul(U.litBoost);
  const lit = select(office, step(H(row.mul(13.3).add(floor(col.div(6)).mul(5.1)).add(seed)), litProb.mul(1.15)), step(hc, litProb)).mul(U.lights);
  const warm = select(office, vec3(0.86, 0.92, 1.0), mix(vec3(1.0, 0.68, 0.38), vec3(1.0, 0.82, 0.6), H(cellId.add(3.1))));
  const brickP = Fn(() => {
    const by = v.div(0.077), br = floor(by), bfy = fract(by);
    const bxx = u.div(0.21).add(br.mod(2).mul(0.5)), bfx = fract(bxx);
    const k = float(1).sub(smoothstep(0.08, 0.3, fwidth(by)));
    const mortar = max(step(bfy, 0.12), step(bfx, 0.06));
    return mix(float(1), mix(float(1.06).add(H(floor(bxx).add(br.mul(91.0))).mul(0.18).sub(0.09)), float(1.32), mortar), k);
  })();
  const stoneP = Fn(() => {
    const cy = v.div(0.62), k = float(1).sub(smoothstep(0.1, 0.35, fwidth(cy)));
    const blk = floor(u.div(1.4).add(floor(cy).mod(2).mul(0.5)));
    return mix(float(1), float(1).sub(step(fract(cy), 0.05).mul(0.12)).mul(H(blk.add(floor(cy).mul(7.0))).mul(0.08).add(0.96)), k);
  })();
  const conP = Fn(() => {
    const px = fract(u.div(bayW.mul(2))), py = fract(v.div(floorH));
    const k = float(1).sub(smoothstep(0.1, 0.4, fwidth(u.div(bayW.mul(2)))));
    return float(1).sub(max(step(px, 0.012), step(py, 0.02)).mul(0.2).mul(k));
  })();
  const woodP = Fn(() => { const k = float(1).sub(smoothstep(0.08, 0.3, fwidth(v.div(0.21)))); return mix(float(1), smoothstep(0.0, 0.12, fract(v.div(0.21))).mul(0.25).add(0.75).mul(H(floor(v.div(0.21)).add(seed)).mul(0.1).add(0.95)), k); })();
  const pat = select(sty(0), brickP, select(sty(1).or(sty(2)).or(sty(6)), stoneP, select(sty(4).or(sty(11)), conP, select(sty(7), woodP, float(1)))));
  const streak = texture(noise, vec2(u.div(2.3), v.div(19))).g;
  const grime = smoothstep(4, 0, v).mul(0.2).add(streak.sub(0.42).max(0).mul(U.grime).mul(1.3));
  const tone = H(seed.mul(2.71)).mul(0.24).add(0.88);
  let wall = base.mul(tone).mul(nTile.r.mul(0.2).add(0.9)).mul(nBig.g.mul(0.14).add(0.93)).mul(pat).mul(float(1).sub(grime));
  const spand = select(sty(2).or(sty(3)), mx.mul(float(1).sub(my)).mul(above).mul(float(1).sub(far)), float(0));
  wall = mix(wall, wall.mul(0.62), spand);
  wall = mix(wall, mix(wall, vec3(0.62, 0.6, 0.55), 0.6), sillBand);
  const blind = step(0.7, H(cellId.add(5.5))).mul(smoothstep(0.45, 0.5, wv.mul(H(cellId.add(8.8)).mul(0.6).add(0.4)))).mul(float(1).sub(far));
  const curtainC = mix(vec3(0.26, 0.2, 0.16), vec3(0.5, 0.46, 0.38), H(cellId.add(4.4)));
  const interior = mix(mix(vec3(0.018, 0.02, 0.022), vec3(0.07, 0.065, 0.06), H(cellId.add(7.7))), curtainC, blind.mul(0.85));
  const tint = mix(vec3(0.42, 0.52, 0.56), vec3(0.5, 0.52, 0.48), hb).mul(mix(float(1), base.mul(5).clamp(0.5, 1.5), 0.3));
  const broken = U.decay.mul(step(0.35, H(cellId.add(9.1))));
  const glassMix = win.mul(float(1).sub(broken)).mul(float(1).sub(frame));
  const frameC = select(curtain, vec3(0.12, 0.13, 0.14), select(sty(0), vec3(0.75, 0.73, 0.68), mix(vec3(0.08, 0.08, 0.085), vec3(0.7, 0.69, 0.66), hb)));
  const glassC = select(curtain, tint.mul(0.55), interior).mul(float(1).sub(lintel));
  let col3 = mix(wall, frameC, frame.mul(win));
  col3 = mix(col3, glassC, glassMix);
  col3 = mix(col3, vec3(0.012, 0.012, 0.012), win.mul(broken));
  const sfCol = mix(vec3(0.04, 0.045, 0.05), vec3(0.3, 0.28, 0.24), H(seed.add(floor(u.div(5)))).mul(0.4));
  col3 = mix(col3, sfCol, store);
  col3 = mix(col3, mix(base.mul(0.7), vec3(0.06, 0.06, 0.065), 0.6), band);
  const glassMetal = select(curtain, float(0.9), float(0.0));
  const winRough = mix(float(0.03), float(0.09), H(cellId.add(2.2))).add(nFine.g.mul(0.03));
  const wallRough = select(glassy, float(0.45), float(0.9));
  const rough = mix(mix(wallRough, winRough, glassMix), float(0.5), frame.mul(win)).max(store.mul(0.08)).min(mix(float(1), float(0.08), store));
  const metal = mix(float(0), glassMetal, glassMix).add(store.mul(0.2));
  const night = U.night;
  const em0 = warm.mul(lit).mul(glassMix).mul(night).mul(mix(float(0.1), float(0.3), hc.mul(hc))).mul(float(1).sub(blind.mul(0.6))).mul(wv.mul(0.4).add(0.65));
  const storeLit = store.mul(night).mul(U.lights).mul(mix(vec3(1.0, 0.85, 0.6), vec3(0.8, 0.9, 1.0), H(seed.add(floor(u.div(5)).mul(3.3))))).mul(0.32);
  const bandLit = band.mul(night).mul(U.lights).mul(step(0.4, H(seed.add(floor(u.div(6)).mul(1.7))))).mul(mix(vec3(1, 0.3, 0.2), vec3(0.3, 0.7, 1.0), H(seed.add(floor(u.div(6)))))).mul(0.4);
  const em = em0.add(storeLit.add(bandLit).mul(float(1).sub(U.decay)));
  const roofT = H(seed.mul(5.3));
  const roofBase = select(roofT.lessThan(0.35), vec3(0.15, 0.145, 0.14), select(roofT.lessThan(0.8), vec3(0.5, 0.5, 0.49), select(roofT.lessThan(0.92), vec3(0.32, 0.31, 0.3), vec3(0.2, 0.26, 0.12))));
  const roofC = mix(roofBase, base.mul(0.5), select(kind.equal(1).and(base.x.greaterThan(0.55)), float(0.6), float(0))).mul(texture(noise, wp.xz.div(9.1)).r.mul(0.4).add(0.78)).mul(texture(noise, wp.xz.div(1.7)).g.mul(0.2).add(0.9));
  const trimC = select(sty(0), mix(base, vec3(0.62, 0.58, 0.5), 0.6), base.mul(1.06)).mul(nTile.g.mul(0.15).add(0.92));
  const metalC = base.mul(nFine.r.mul(0.2).add(0.9));
  const woodC = base.mul(smoothstep(0.0, 0.08, fract(u.div(0.18))).mul(0.25).add(0.75)).mul(nFine.b.mul(0.3).add(0.8));
  const signEm = base.mul(night).mul(U.lights).mul(0.9).mul(float(1).sub(U.decay));
  const crownEm = mix(vec3(1.0, 0.86, 0.62), vec3(0.85, 0.92, 1.0), hb).mul(night).mul(U.lights).mul(0.45).mul(float(1).sub(U.decay));
  const cw = select(abs(normalWorld.x).greaterThan(abs(normalWorld.z)), float(12.2), float(2.5));
  const cc = floor(u.div(cw)), cr = floor(v.div(2.6)), ch = H(cc.mul(17.3).add(cr.mul(5.1)).add(seed));
  const conPal = select(ch.lessThan(0.16), vec3(0.3, 0.09, 0.06), select(ch.lessThan(0.3), vec3(0.08, 0.14, 0.24), select(ch.lessThan(0.42), vec3(0.11, 0.2, 0.13), select(ch.lessThan(0.52), vec3(0.38, 0.3, 0.12), select(ch.lessThan(0.66), vec3(0.32, 0.33, 0.34), select(ch.lessThan(0.78), vec3(0.46, 0.46, 0.44), select(ch.lessThan(0.9), vec3(0.24, 0.15, 0.09), vec3(0.07, 0.22, 0.23))))))));
  const rib = smoothstep(0.0, 0.25, abs(fract(u.div(0.31)).sub(0.5))).mul(0.18).add(0.82);
  const seamC = max(smoothstep(0.035, 0.0, fract(u.div(cw))), smoothstep(0.05, 0.0, fract(v.div(2.6))));
  const containerC = conPal.mul(rib).mul(float(1).sub(seamC.mul(0.6))).mul(nFine.r.mul(0.3).add(0.8));
  let finalC = col3, finalR = rough, finalM = metal, finalE = em;
  const set = (cond, c, r, mm, e) => { finalC = select(cond, c, finalC); finalR = select(cond, r, finalR); finalM = select(cond, mm, finalM); finalE = select(cond, e, finalE); };
  set(is(1), roofC, float(0.9), float(0), vec3(0));
  set(is(2), trimC, float(0.85), float(0), vec3(0));
  set(is(3).or(is(14)), metalC, float(0.42), float(0.7), vec3(0));
  set(is(6), base.mul(0.8), float(0.4), float(0), signEm);
  set(is(7).or(is(15)), base.mul(nTile.r.mul(0.25).add(0.85)), float(0.92), float(0), vec3(0));
  set(is(8), woodC, float(0.9), float(0), vec3(0));
  set(is(9), base.mul(nFine.r.mul(0.3).add(0.85)), float(0.85), float(0), vec3(0));
  set(is(10), base.mul(nTile.g.mul(0.15).add(0.9)), float(0.35), float(0.55), crownEm);
  const pr = length(UV), ring = smoothstep(0.12, 0.0, abs(pr.sub(8.2)).sub(0.45));
  const hm = max(step(abs(abs(UV.x).sub(2.6)), 0.5).mul(step(abs(UV.y), 4.2)), step(abs(UV.y), 0.45).mul(step(abs(UV.x), 2.6)));
  set(is(11), mix(mix(vec3(0.16, 0.16, 0.17), vec3(0.75, 0.6, 0.1), ring), vec3(0.85, 0.85, 0.85), hm), float(0.8), float(0), vec3(1.0, 0.75, 0.2).mul(ring).mul(night).mul(U.lights).mul(0.6));
  set(is(12), vec3(0.18, 0.22, 0.24), float(0.05), float(0.95), vec3(0.6, 0.75, 0.9).mul(night).mul(U.lights).mul(0.3));
  set(is(13), base.mul(nFine.g.mul(0.2).add(0.85)), float(0.95), float(0), vec3(0));
  set(is(16), base, float(0.4), float(0), base.mul(1.1).mul(U.lights.mul(0.9).add(0.1)));
  set(is(17), containerC, float(0.6), float(0.35), vec3(0));
  const decayK = U.decay;
  const moss = smoothstep(0.55, 0.8, nBig.r.mul(0.5).add(texture(noise, wp.xz.add(wp.y.mul(0.7)).div(7)).b.mul(0.5))).mul(decayK);
  const wetK = U.wet.mul(normalWorld.y.max(0).mul(0.6).add(0.4));
  m.colorNode = mix(finalC.mul(float(1).sub(decayK.mul(0.25))), vec3(0.05, 0.07, 0.03), moss.mul(0.7)).mul(float(1).sub(wetK.mul(0.25)));
  m.roughnessNode = clamp(finalR.add(decayK.mul(0.15)).sub(wetK.mul(0.35)), 0.03, 1);
  m.metalnessNode = finalM.mul(float(1).sub(decayK.mul(0.8)));
  m.emissiveNode = finalE.add(finalC.mul(U.fill));
  if (hq) {
    const recess = win.mul(float(1).sub(far)).mul(select(curtain, float(0.02), float(0.12))).add(frame.mul(win).mul(0.04)).add(sillBand.mul(0.05));
    m.normalNode = bumpMap(recess.negate().add(pat.sub(1).mul(0.06)), float(1));
  }
  const sh = shadowTerm(U, normalWorld);
  if (U.shadowTex) m.receivedShadowNode = Fn(([s]) => s.mul(sh));
  return m;
}

export function streetMaterial(U, noise) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.name = 'CityStreet';
  const q = attribute('rq', 'vec4'), k4 = attribute('rk', 'vec4');
  const kind = k4.x.mul(255).round(), halfW = k4.y.mul(255 / 4), flag = k4.z.mul(255).round(), segTone = k4.w;
  const u = q.x, s = q.y, s0 = q.z, s1 = q.w;
  const wp = positionWorld, xz = wp.xz;
  const is = (k) => kind.equal(k);
  const n1 = texture(noise, xz.div(13)), n2 = texture(noise, xz.div(2.1)), n3 = texture(noise, xz.div(97));
  const isRoad = select(kind.lessThanEqual(6).or(is(13)).or(is(14)).or(is(17)), float(1), float(0));
  const aw = fwidth(u).max(0.002), sw = fwidth(s).max(0.002);
  const line = (c, w) => { const ww = float(w); return smoothstep(ww.add(aw), ww.sub(aw), abs(u.sub(c))); };
  const dash = (len, gap, off = 0) => step(fract(s.add(off).div(len + gap)), len / (len + gap));
  const endD = min(s.sub(s0), s1.sub(s));
  let asphalt = mix(vec3(0.052, 0.053, 0.056), vec3(0.085, 0.084, 0.082), n1.r).mul(n2.g.mul(0.25).add(0.88)).mul(n3.b.mul(0.2).add(0.9)).mul(segTone.mul(0.45).add(0.8));
  const pc = floor(xz.div(7.3)), patch = step(0.86, H(pc.x.mul(13.1).add(pc.y.mul(71.7))));
  asphalt = mix(asphalt, asphalt.mul(0.72), patch.mul(0.8));
  const lane = abs(abs(u).sub(halfW.mul(0.45)));
  asphalt = mix(asphalt, asphalt.mul(0.82), smoothstep(1.4, 0.2, lane).mul(0.6));
  const crack = smoothstep(0.035, 0.0, abs(n2.b.sub(0.5))).mul(smoothstep(0.55, 0.75, n1.g));
  asphalt = mix(asphalt, asphalt.mul(0.55), crack.mul(0.7));
  const yellow = vec3(0.62, 0.42, 0.06), white = vec3(0.62, 0.62, 0.6);
  const worn = n2.r.mul(0.35).add(0.65);
  const dbl = line(0.22, 0.06).add(line(-0.22, 0.06));
  let markY = select(is(1).or(is(3)).or(is(4)), dbl, select(is(5), line(1.6, 0.08).add(line(-1.6, 0.08)), select(is(2), line(0, 0.07).mul(dash(3, 5)), float(0))));
  const laneDash = dash(3, 9);
  let markW = select(is(1), line(6, 0.075).add(line(-6, 0.075)).mul(laneDash), select(is(3).or(is(4)), line(5, 0.075).add(line(-5, 0.075)).mul(laneDash), select(is(5), line(5.6, 0.075).add(line(-5.6, 0.075)).add(line(10.6, 0.075)).add(line(-10.6, 0.075)).mul(laneDash), float(0))));
  const hatch = select(is(5), smoothstep(1.55, 1.45, abs(u)).mul(step(0.5, fract(s.add(u).div(3)))), float(0));
  markW = markW.add(hatch.mul(0.8));
  const cross = step(0.6, endD).mul(step(endD, 4.4)).mul(step(fract(u.div(1.1)), 0.55)).mul(step(abs(u), halfW.sub(0.4)));
  const stop = step(5.0, endD).mul(step(endD, 5.45)).mul(select(s.sub(s0).lessThan(s1.sub(s)), step(0, u), step(u, 0)));
  const onSeg = select(kind.lessThanEqual(5), float(1), float(0));
  const cs = cross.add(stop).mul(onSeg);
  markY = markY.mul(step(6, endD));
  markW = markW.mul(step(6, endD)).add(cs);
  const bike = select(is(4), smoothstep(8.1, 8.0, u).mul(smoothstep(6.4, 6.5, u)), float(0));
  const rwCenter = select(is(13), line(0, 0.45).mul(dash(30, 20)), float(0));
  const rwEdge = select(is(13), line(halfW.sub(1.5), 0.5).add(line(halfW.sub(1.5).negate(), 0.5)), float(0));
  const piano = select(is(13), step(endD, 60).mul(step(6, endD)).mul(step(fract(u.div(3.6)), 0.5)).mul(step(abs(u), halfW.sub(4))), float(0));
  const tdz = select(is(13), step(150, endD).mul(step(endD, 900)).mul(step(fract(s.div(150)), 0.15)).mul(step(abs(abs(u).sub(9)), 2.6)), float(0));
  markW = markW.add(rwCenter.add(rwEdge).add(piano).add(tdz));
  markY = markY.add(select(is(14), line(0, 0.12), float(0)));
  markW = markW.clamp(0, 1).mul(worn); markY = markY.clamp(0, 1).mul(worn);
  const manhole = smoothstep(0.42, 0.38, length(vec2(fract(s.div(37)).sub(0.5).mul(37), u.sub(halfW.mul(0.45))))).mul(step(0.5, H(floor(s.div(37)).add(s0))));
  let road = mix(asphalt, vec3(0.05, 0.05, 0.05), manhole);
  road = mix(road, vec3(0.08, 0.3, 0.12), bike.mul(0.85));
  road = mix(road, white, markW);
  road = mix(road, yellow, markY);
  const deck = mix(vec3(0.21, 0.21, 0.205), vec3(0.3, 0.295, 0.285), n1.r).mul(n2.g.mul(0.2).add(0.9));
  const deckC = mix(deck, white, line(halfW.sub(1.2), 0.1).add(line(halfW.sub(1.2).negate(), 0.1)).add(line(0, 0.1).mul(dash(3, 9))).clamp(0, 1).mul(0.85));
  road = select(is(17), deckC, road);
  const taxi = mix(vec3(0.16, 0.16, 0.16), vec3(0.22, 0.22, 0.21), n1.r);
  road = select(is(14), mix(taxi, yellow, line(0, 0.12)), road);
  const slab = (sz) => { const f = fract(xz.div(sz)), fw = fwidth(xz.div(sz)).max(0.001); const j = max(smoothstep(fw.x.mul(1.5), float(0), f.x.min(f.x.oneMinus())), smoothstep(fw.y.mul(1.5), float(0), f.y.min(f.y.oneMinus()))); return j.mul(float(1).sub(smoothstep(0.1, 0.3, fw.x))); };
  const cellW = floor(xz.div(1.5)), hw2 = H(cellW.x.mul(31.1).add(cellW.y.mul(17.3)));
  const walk = mix(vec3(0.3, 0.3, 0.29), vec3(0.4, 0.39, 0.37), hw2.mul(0.5).add(n1.g.mul(0.5))).mul(float(1).sub(slab(1.5).mul(0.28))).mul(n3.r.mul(0.15).add(0.92));
  const curbC = vec3(0.38, 0.38, 0.37).mul(n2.r.mul(0.2).add(0.9));
  const pav = floor(xz.div(0.6)), plazaC = mix(vec3(0.42, 0.38, 0.33), vec3(0.32, 0.3, 0.28), H(pav.x.mul(7.7).add(pav.y.mul(3.1)))).mul(float(1).sub(slab(0.6).mul(0.3)));
  const grassN = texture(noise, xz.div(3.3)), grassN2 = texture(noise, xz.div(0.7));
  const lawn = mix(U.lawn, U.lawn2, grassN.r.mul(0.7).add(grassN2.g.mul(0.3))).mul(n3.g.mul(0.3).add(0.85));
  const espC = mix(vec3(0.33, 0.24, 0.18), vec3(0.4, 0.3, 0.22), H(floor(xz.x.div(0.3)).add(floor(xz.y.div(0.6)).mul(7.1)))).mul(float(1).sub(slab(0.6).mul(0.25)));
  const yard = mix(vec3(0.3, 0.3, 0.29), vec3(0.4, 0.39, 0.37), n1.r).mul(float(1).sub(slab(6).mul(0.3))).mul(n2.b.mul(0.25).add(0.85));
  const apron = mix(vec3(0.42, 0.42, 0.41), vec3(0.5, 0.5, 0.49), n1.r).mul(float(1).sub(slab(7.5).mul(0.25)));
  const dirt = mix(vec3(0.28, 0.21, 0.14), vec3(0.36, 0.28, 0.19), n1.r).mul(n2.g.mul(0.3).add(0.8));
  let col = road;
  col = select(is(7), walk, col); col = select(is(8), curbC, col); col = select(is(9), plazaC, col); col = select(is(10), lawn, col);
  col = select(is(11), espC, col); col = select(is(12), yard, col); col = select(is(15), apron, col); col = select(is(16), dirt, col); col = select(is(18), mix(vec3(0.3, 0.27, 0.22), vec3(0.36, 0.33, 0.27), n1.g), col);
  col = mix(col, dirt.mul(mix(float(1), float(0.85), smoothstep(1.5, 0.5, abs(abs(u).sub(1.6))))), U.dirtRoads.mul(isRoad));
  const over = smoothstep(0.45, 0.62, n3.g.mul(0.6).add(n1.b.mul(0.4))).mul(U.decay);
  col = mix(col, mix(vec3(0.07, 0.09, 0.03), vec3(0.16, 0.14, 0.08), n2.r), over.mul(0.85));
  col = mix(col, col.mul(0.6), crack.mul(U.decay));
  const sci = U.scifi.mul(isRoad);
  col = mix(col, mix(vec3(0.62, 0.64, 0.66), vec3(0.75, 0.76, 0.78), n1.r).mul(float(1).sub(slab(4).mul(0.15))), sci);
  const puddle = smoothstep(0.64, 0.7, n3.r.mul(0.6).add(n1.b.mul(0.4))).mul(smoothstep(0.3, 0.7, U.wet)).mul(isRoad.max(select(is(7), float(0.5), float(0))));
  const wetK = U.wet;
  m.colorNode = mix(col.mul(float(1).sub(wetK.mul(0.3))), col.mul(0.55), puddle);
  const roughBase = select(isRoad.greaterThan(0.5), float(0.88).sub(markW.mul(0.2)), select(is(10), float(0.97), float(0.82)));
  m.roughnessNode = clamp(mix(roughBase.sub(wetK.mul(0.4)), float(0.03), puddle), 0.02, 1);
  const lampS = s0.add(12).add(floor(s.sub(s0).sub(12).div(32).add(0.5)).mul(32));
  const du = abs(u).sub(halfW.add(0.6)), dv = s.sub(lampS);
  const pool = exp(du.mul(du).add(dv.mul(dv)).div(-90)).mul(select(kind.lessThanEqual(5), float(1), float(0)));
  const glow = U.night.mul(U.lights).mul(float(1).sub(U.decay));
  const edgeGlow = smoothstep(0.35, 0.1, abs(abs(u).sub(halfW.sub(0.6)))).mul(sci).mul(vec3(0.2, 0.75, 1.0)).mul(U.night.mul(0.9).add(0.3));
  m.emissiveNode = vec3(1.0, 0.78, 0.5).mul(pool.mul(0.32).add(isRoad.mul(0.004))).mul(glow).mul(col.mul(3).add(0.06)).add(col.mul(U.fill)).add(edgeGlow);
  const sh = shadowTerm(U, vec3(0, 0, 0));
  if (U.shadowTex) m.receivedShadowNode = Fn(([sv]) => sv.mul(sh));
  return m;
}

export function propMaterial(U, noise, opts = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: opts.rough ?? 0.6, metalness: opts.metal ?? 0.3 });
  m.name = opts.name || 'CityProp';
  const c = attribute('color', 'vec3'), e = attribute('emit', 'float');
  m.colorNode = c.mul(texture(noise, positionWorld.xz.add(positionWorld.y).div(1.3)).r.mul(0.2).add(0.9));
  m.emissiveNode = c.mul(e).mul(U.night.mul(0.85).add(0.15)).mul(U.lights).mul(4);
  return m;
}
