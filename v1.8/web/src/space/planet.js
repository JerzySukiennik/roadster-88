// Roadster 88 space backdrop: one camera-centred shell that ray-traces the Earth at true scale per pixel (day, night and city lights, clouds with parallax and shadows, ocean sun glint, relief from GEBCO heights, PALEOMAP continents and procedural deep-time surfaces), single-scattering Rayleigh, Mie and haze atmosphere with airglow, the Moon with LROC colour and relief, the Sun disc, the Milky Way, the protoplanetary disk, the pre-solar nebula and a Dyson swarm. Units are kilometres in Earth-fixed axes.
import * as THREE from 'three/webgpu';
import { Fn, If, Loop, float, int, vec2, vec3, vec4, uniform, texture, positionWorld, cameraPosition, normalize, dot, length, sqrt, exp, max, min, clamp, mix, smoothstep, select, atan, asin, abs, fract, pow, cos, sin, fwidth, dFdx, dFdy, mx_fractal_noise_float, mx_noise_float, hash, floor, cross } from 'three/tsl';

const BR = [5.802e-3, 13.558e-3, 33.1e-3];
const PI = Math.PI;

export function blankTexture(rgba = [0, 0, 0, 255], srgb = true) {
  const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
  t.needsUpdate = true; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  return t;
}

export function makeUniforms() {
  return {
    cam: uniform(new THREE.Vector3(0, 0, 6771)), p2e: uniform(new THREE.Matrix3()), e2i: uniform(new THREE.Matrix3()),
    sun: uniform(new THREE.Vector3(1, 0, 0)), sunI: uniform(12), sunCol: uniform(new THREE.Color(1, 1, 1)), sunAng: uniform(0.00465), sunShow: uniform(1), sunGlow: uniform(1), sunEci: uniform(new THREE.Vector3(1, 0, 0)),
    planet: uniform(1), R: uniform(6371), top: uniform(100),
    ray: uniform(new THREE.Vector3(...BR)), mie: uniform(3.996e-3), haze: uniform(new THREE.Vector3(0, 0, 0)), hazeAbs: uniform(new THREE.Vector3(0, 0, 0)), hazeH: uniform(20),
    mode: uniform(0), lights: uniform(0), lightTint: uniform(new THREE.Color(1, 0.75, 0.45)), pattern: uniform(0),
    seaLevel: uniform(0), iceN: uniform(90), iceS: uniform(90), seaIce: uniform(0), veg: uniform(0.7), arid: uniform(0.4), tint: uniform(new THREE.Vector3(1, 1, 1)),
    warp: uniform(0), mirror: uniform(0), lonShift: uniform(0), magma: uniform(0), ocean: uniform(new THREE.Vector3(0.012, 0.035, 0.085)),
    clouds: uniform(1), cloudShift: uniform(0), cloudSpin: uniform(0), relief: uniform(2),
    moon: uniform(new THREE.Vector3(384400, 0, 0)), moonR: uniform(1737.4), moonM: uniform(new THREE.Matrix3()), moonZ: uniform(new THREE.Vector3(0, 0, 1)), moonShow: uniform(1), moonMaria: uniform(1), moonGlow: uniform(0), earthshine: uniform(0.02),
    milky: uniform(1), disk: uniform(0), nebula: uniform(0), swarm: uniform(0),
    eclN: uniform(new THREE.Vector3(0, -0.3978, 0.9175)), eclA: uniform(new THREE.Vector3(1, 0, 0)), eclB: uniform(new THREE.Vector3(0, 0.9175, 0.3978)),
    pixel: uniform(0.0008), steps: uniform(12, 'int'), patch: uniform(new THREE.Vector4(0, 0, 9, 0)), ozone: uniform(0.6), ms: uniform(0.12), sat: uniform(0.85), gain: uniform(1.06), glint: uniform(3.2),
  };
}

export function makeTextures() {
  return {
    day: texture(blankTexture([8, 18, 40, 255])), night: texture(blankTexture([0, 0, 0, 255], false)), clouds: texture(blankTexture([0, 0, 0, 255], false)),
    elev: texture(blankTexture([110, 110, 110, 255], false)), paleo: texture(blankTexture([100, 100, 100, 255], false)),
    patchDay: texture(blankTexture([8, 18, 40, 255])), patchNight: texture(blankTexture([0, 0, 0, 255], false)),
    moon: texture(blankTexture([120, 120, 118, 255])), moonElev: texture(blankTexture([128, 128, 128, 255], false)), milky: texture(blankTexture([0, 0, 0, 255])),
  };
}

const decodeElev = (v) => {
  const s = v.mul(255);
  const land = pow(s.sub(128).div(127).max(0), 2).mul(9000);
  const sea = pow(float(127).sub(s).div(127).max(0), 2).mul(-11000);
  return select(s.greaterThanEqual(127.5), land, sea);
};

const sphereUV = (n) => {
  const u = atan(n.y, n.x).div(2 * PI).add(0.5), v = float(0.5).sub(asin(clamp(n.z, -1, 1)).div(PI));
  const u2 = fract(u.add(0.5)).sub(0.5);
  return vec2(select(fwidth(u).greaterThan(fwidth(u2).add(1e-7)), u2, u), v);
};

const raySphere = (ro, rd, r) => {
  const b = dot(ro, rd), lr = length(ro);
  const c = lr.sub(r).mul(lr.add(r));
  const h = b.mul(b).sub(c);
  const s = sqrt(max(h, 0));
  return vec3(b.negate().sub(s), b.negate().add(s), h);
};

const chapman = (X, h, mu) => {
  const c = sqrt(X.add(h));
  const up = c.div(c.mul(mu).add(1)).mul(exp(h.negate()));
  const x0 = sqrt(max(float(1).sub(mu.mul(mu)), 0)).mul(X.add(h));
  const down = sqrt(x0).mul(2).mul(exp(min(X.sub(x0), 60))).sub(c.div(float(1).sub(c.mul(mu))).mul(exp(h.negate())));
  return select(mu.greaterThanEqual(0), up, max(down, 0));
};

const acos2 = (x) => { const c = clamp(x, -1, 1); return atan(sqrt(max(float(1).sub(c.mul(c)), 0)), c); };

export function buildBackdrop(U, T) {
  const sunOD = Fn(([p, r]) => {
    const mu = dot(p, U.sun).div(r);
    const h = r.sub(U.R);
    const lit = mu.greaterThan(sqrt(max(float(1).sub(U.R.mul(U.R).div(r.mul(r))), 0)).negate());
    const odR = chapman(U.R.div(8), h.div(8), mu).mul(8);
    const odM = chapman(U.R.div(1.2), h.div(1.2), mu).mul(1.2);
    const odH = chapman(U.R.div(U.hazeH), h.div(U.hazeH), mu).mul(U.hazeH);
    return vec4(odR, odM, odH, select(lit, float(1), float(0)));
  });
  const O3 = vec3(0.65e-3, 1.881e-3, 0.085e-3);
  const ext = (odR, odM, odH, odO = float(0)) => U.ray.mul(odR).add(U.mie.mul(1.11).mul(odM)).add(U.haze.add(U.hazeAbs).mul(odH)).add(O3.mul(odO).mul(U.ozone));
  const ozSun = (s, h) => s.x.mul(1.875).mul(clamp(float(40).sub(h).div(30), 0, 1));
  const transTo = (p, r) => { const s = sunOD(p, r); return exp(ext(s.x, s.y, s.z, ozSun(s, r.sub(U.R))).negate()).mul(s.w); };

  const cloudTex = (uv, g) => T.clouds.sample(vec2(fract(uv.x.add(U.cloudShift).add(U.cloudSpin)), uv.y)).grad(g.xy, g.zw).r;
  const cloudAlpha = (c) => { const thin = float(1).sub(U.clouds); return smoothstep(thin.mul(0.55).add(0.08), thin.mul(0.25).add(0.85), c).mul(min(U.clouds.mul(1.3), 1)); };

  function surface(n, lat, lon, uvE, g, puv, gP) {
    const S = { albedo: vec3(0).toVar(), water: float(0).toVar(), emit: vec3(0).toVar(), lights: float(0).toVar(), relief: float(0).toVar() };
    const tex = (t, uv) => t.sample(uv).grad(g.xy, g.zw);
    const mode = U.mode;
    If(mode.lessThan(0.5), () => {
      const wn = vec3(mx_noise_float(n.mul(3.1)), mx_noise_float(n.mul(3.1).add(7.7)), mx_noise_float(n.mul(3.1).add(3.3))).mul(U.warp.mul(0.18));
      const uvW = select(U.warp.greaterThan(0), vec2(atan(n.add(wn).y, n.add(wn).x).div(2 * PI).add(0.5), uvE.y.add(wn.z.mul(0.05))), uvE);
      const d = tex(T.day, uvW);
      const e = decodeElev(tex(T.elev, uvW).r);
      const lum = dot(d.rgb, vec3(0.3, 0.59, 0.11));
      const n1 = mx_noise_float(n.mul(40));
      S.albedo.assign(mix(vec3(lum), d.rgb, U.sat).mul(U.tint).mul(U.gain));
      S.water.assign(d.a);
      const isIce = e.lessThan(0).and(lum.greaterThan(0.18)).and(abs(lat).greaterThan(50));
      const melt = clamp(U.seaIce.negate(), 0, 1).mul(select(isIce, float(1), float(0))).mul(smoothstep(-0.3, 0.3, n1.add(U.seaIce.negate().mul(0.6)).sub(0.3)));
      S.albedo.assign(mix(S.albedo, U.ocean, melt)); S.water.assign(max(S.water, melt));
      const exposed = e.lessThan(-5).and(e.greaterThan(U.seaLevel)).and(U.seaLevel.lessThan(-1));
      const steppe = mix(vec3(0.16, 0.15, 0.1), vec3(0.27, 0.24, 0.17), n1.mul(0.5).add(0.5)).mul(mix(float(1), float(1.25), U.arid));
      S.albedo.assign(select(exposed, steppe, S.albedo)); S.water.assign(select(exposed, float(0), S.water));
      const L = tex(T.night, uvW).r;
      S.lights.assign(L.mul(L));
      S.relief.assign(1);
      If(U.patch.w.greaterThan(0.001), () => {
        const edge = min(min(puv.x, float(1).sub(puv.x)), min(puv.y, float(1).sub(puv.y)));
        const pf = smoothstep(0.0, 0.08, edge).mul(U.patch.w);
        const pc = clamp(puv, 0.0005, 0.9995);
        const pd = T.patchDay.sample(pc).grad(gP.xy, gP.zw).rgb;
        const pl = dot(pd, vec3(0.3, 0.59, 0.11));
        const pdc = mix(vec3(pl), pd, U.sat).mul(U.tint).mul(U.gain);
        S.albedo.assign(mix(S.albedo, select(S.water.greaterThan(0.5).and(pl.lessThan(0.06)), S.albedo, pdc), pf));
        const pn = T.patchNight.sample(pc).grad(gP.xy, gP.zw).rgb;
        const lum = dot(pn, vec3(0.3, 0.59, 0.11));
        const lp = clamp(lum.sub(0.16).sub(max(pn.b.sub(pn.r), 0).mul(0.5)).div(0.84), 0, 1);
        S.lights.assign(mix(S.lights, pow(lp, float(1.6)).mul(0.9), pf));
      });
    }).ElseIf(mode.lessThan(1.5), () => {
      const det = mx_fractal_noise_float(n.mul(160), 3, 2.1, 0.5), det2 = mx_fractal_noise_float(n.mul(30), 4, 2.0, 0.55);
      const u = vec2(uvE.x.add(U.lonShift), select(U.mirror.greaterThan(0.5), float(1).sub(uvE.y), uvE.y));
      const e = decodeElev(tex(T.paleo, u).r).add(det.mul(90)).add(det2.mul(220));
      const land = e.greaterThan(U.seaLevel);
      const alat = abs(lat);
      const dryBelt = smoothstep(10, 22, alat).mul(float(1).sub(smoothstep(32, 42, alat)));
      const humid = clamp(float(1).sub(dryBelt.mul(U.arid).mul(1.4)).add(det2.mul(0.25)), 0, 1);
      const green = mix(vec3(0.035, 0.07, 0.025), vec3(0.06, 0.09, 0.035), det2.mul(0.5).add(0.5));
      const bare = mix(vec3(0.32, 0.22, 0.14), vec3(0.42, 0.34, 0.24), det.mul(0.5).add(0.5));
      const desert = mix(vec3(0.5, 0.36, 0.22), vec3(0.58, 0.47, 0.32), det2.mul(0.5).add(0.5));
      const c1 = mix(bare, green, U.veg.mul(humid));
      const c2 = mix(c1, desert, dryBelt.mul(U.arid).mul(float(1).sub(U.veg.mul(0.5))));
      const landC = mix(c2, vec3(0.22, 0.2, 0.18), smoothstep(1500, 3500, e));
      const sea = mix(U.ocean, U.ocean.mul(vec3(1.6, 2.8, 1.8)), smoothstep(-260, -20, e));
      S.albedo.assign(select(land, mix(vec3(dot(landC, vec3(0.3, 0.59, 0.11))), landC, U.sat.add(0.15)), sea)); S.water.assign(select(land, float(0), float(1)));
    }).ElseIf(mode.lessThan(2.5), () => {
      const det = mx_fractal_noise_float(n.mul(60), 3, 2.1, 0.5), det2 = mx_fractal_noise_float(n.mul(6), 4, 2.0, 0.55);
      const crack = float(1).sub(abs(mx_fractal_noise_float(n.mul(9), 4, 2.2, 0.5))).pow(9);
      const plates = smoothstep(-0.25, 0.35, det2.add(U.magma.mul(-0.6)).add(0.3));
      const crust = mix(vec3(0.035, 0.03, 0.028), vec3(0.06, 0.05, 0.045), det.mul(0.5).add(0.5));
      S.albedo.assign(crust.mul(plates));
      S.emit.assign(vec3(1.0, 0.3, 0.05).mul(mix(float(1), crack, plates).mul(U.magma.mul(0.85).add(0.15))).mul(mix(float(6), float(3), U.magma)));
      const lowSea = det2.lessThan(-0.35).and(U.magma.lessThan(0.5));
      S.albedo.assign(select(lowSea, U.ocean, S.albedo)); S.water.assign(select(lowSea, float(1), float(0)));
    }).ElseIf(mode.lessThan(3.5), () => {
      const det = mx_fractal_noise_float(n.mul(60), 3, 2.1, 0.5);
      const c = mx_fractal_noise_float(n.mul(2.3).add(4.1), 6, 2.1, 0.52).add(det.mul(0.06));
      const land = c.greaterThan(0.42);
      S.albedo.assign(select(land, mix(vec3(0.07, 0.055, 0.05), vec3(0.2, 0.1, 0.06), det.mul(0.5).add(0.5)), U.ocean.mul(mix(float(1), float(1.8), smoothstep(0.3, 0.42, c)))));
      S.water.assign(select(land, float(0), float(1)));
    }).ElseIf(mode.lessThan(4.5), () => {
      const det = mx_fractal_noise_float(n.mul(60), 3, 2.1, 0.5);
      const c = mx_fractal_noise_float(n.mul(1.6).add(9.3), 6, 2.05, 0.55).add(det.mul(0.05));
      const land = c.greaterThan(0.12);
      const rust = mix(vec3(0.3, 0.16, 0.09), vec3(0.45, 0.3, 0.18), det.mul(0.5).add(0.5));
      S.albedo.assign(select(land, mix(rust, vec3(0.2, 0.18, 0.17), smoothstep(0.45, 0.7, c)), U.ocean.mul(mix(float(1), float(2.4), smoothstep(0.02, 0.12, c)))));
      S.water.assign(select(land, float(0), float(1)));
    }).ElseIf(mode.lessThan(5.5), () => {
      const det = mx_fractal_noise_float(n.mul(60), 3, 2.1, 0.5);
      const c = mx_fractal_noise_float(n.mul(7.0).add(9.3), 4, 2.1, 0.5);
      const open = abs(lat).lessThan(U.iceN.add(det.mul(4)));
      const ice = mix(vec3(0.62, 0.7, 0.78), vec3(0.85, 0.89, 0.93), det.mul(0.5).add(0.5));
      S.albedo.assign(select(open, U.ocean.mul(1.6), select(c.greaterThan(0.6), vec3(0.14, 0.13, 0.12), ice)));
      S.water.assign(select(open, float(1), float(0)));
    }).ElseIf(mode.lessThan(6.5), () => {
      const n1 = mx_fractal_noise_float(n.mul(30), 3, 2.0, 0.55);
      const e = decodeElev(tex(T.elev, uvE).r);
      const basin = smoothstep(-2500, -5200, e);
      const salt = mix(vec3(0.52, 0.47, 0.4), vec3(0.78, 0.75, 0.68), n1.mul(0.5).add(0.5));
      const floor0 = mix(vec3(0.36, 0.26, 0.18), vec3(0.3, 0.22, 0.16), smoothstep(-200, -2500, e));
      const conti = mix(vec3(0.42, 0.24, 0.13), vec3(0.55, 0.36, 0.2), n1.mul(0.5).add(0.5));
      S.albedo.assign(select(e.greaterThan(0), conti, mix(floor0, salt, basin)));
      S.relief.assign(1);
    }).ElseIf(mode.lessThan(7.5), () => {
      S.albedo.assign(vec3(0.6, 0.52, 0.32));
    }).Else(() => {
      const crack = float(1).sub(abs(mx_fractal_noise_float(n.mul(7), 4, 2.2, 0.5))).pow(5);
      S.albedo.assign(vec3(0.04, 0.03, 0.03));
      S.emit.assign(vec3(1.0, 0.36, 0.08).mul(crack.mul(0.8).add(0.25)).mul(2.6));
    });
    const wob = mx_noise_float(n.mul(18)).mul(5);
    const alat = abs(lat);
    const thrN = U.iceN.add(select(lon.greaterThan(60).and(lon.lessThan(175)), float(16), float(0))).add(select(lon.greaterThan(-15).and(lon.lessThan(60)), float(4), float(0)));
    const thr = select(lat.greaterThan(0), thrN, U.iceS);
    const iceK = smoothstep(thr.sub(2.5), thr.add(2.5), alat.add(wob).add(select(S.water.greaterThan(0.5), float(-3), float(0))));
    const sI = U.seaIce.max(0);
    const seaIceK = select(S.water.greaterThan(0.5).and(sI.greaterThan(0)), smoothstep(float(78).sub(sI.mul(28)), float(82).sub(sI.mul(28)), alat.add(wob.mul(0.6))), float(0));
    const ice = max(select(mode.lessThan(4.5).or(mode.greaterThan(5.5)), iceK, float(0)), seaIceK);
    S.albedo.assign(mix(S.albedo, mix(vec3(0.7, 0.76, 0.82), vec3(0.88, 0.9, 0.93), wob.mul(0.1).add(0.5)), ice));
    S.water.assign(S.water.mul(float(1).sub(ice)));
    return S;
  }

  return Fn(() => {
    const rdP = normalize(positionWorld.sub(cameraPosition)).toVar();
    const rd = normalize(U.p2e.mul(rdP)).toVar();
    const ro = U.cam;
    const col = vec3(0).toVar();
    const mu = dot(rd, U.sun).toVar();
    const rdI = normalize(U.e2i.mul(rd)).toVar();

    const mwUV = vec2(fract(float(0.5).sub(atan(rdI.y, rdI.x).div(2 * PI))), float(0.5).sub(asin(clamp(rdI.z, -1, 1)).div(PI)));
    const mw = T.milky.sample(mwUV).rgb;
    col.addAssign(mw.mul(mw).mul(0.012).mul(U.milky));

    If(U.nebula.greaterThan(0), () => {
      const q = rdI.mul(3);
      const n1 = mx_fractal_noise_float(q, 5, 2.0, 0.55), n2 = mx_fractal_noise_float(q.mul(2.3).add(5.0), 4, 2.0, 0.5);
      const dust = smoothstep(-0.25, 0.45, n1);
      col.mulAssign(float(1).sub(dust.mul(0.97).mul(U.nebula)));
      col.addAssign(vec3(0.9, 0.2, 0.25).mul(smoothstep(-0.1, 0.8, n2).mul(float(1).sub(dust.mul(0.75)))).mul(0.35).mul(U.nebula));
      col.addAssign(vec3(0.35, 0.45, 0.9).mul(smoothstep(0.2, 0.9, mx_fractal_noise_float(q.mul(1.3).add(11.0), 4, 2.0, 0.5))).mul(float(1).sub(dust)).mul(0.12).mul(U.nebula));
      col.addAssign(vec3(1.0, 0.55, 0.3).mul(exp(float(1).sub(mu).mul(-40))).mul(2.5).mul(U.nebula));
    });

    If(U.disk.greaterThan(0), () => {
      const el = asin(clamp(dot(rdI, U.eclN), -1, 1));
      const lonE = atan(dot(rdI, U.eclB), dot(rdI, U.eclA));
      const thick = float(0.07).add(abs(sin(lonE.mul(0.5))).mul(0.03));
      const dens = exp(el.div(thick).pow(2).negate());
      const lanes = smoothstep(-0.4, 0.5, mx_fractal_noise_float(vec3(cos(lonE).mul(3.0), sin(lonE).mul(3.0), el.mul(26)), 5, 2.0, 0.5));
      const fwd = pow(mu.mul(0.5).add(0.5), 6).mul(3).add(0.25);
      const dustCol = mix(vec3(0.55, 0.32, 0.18), vec3(0.9, 0.66, 0.42), lanes);
      col.mulAssign(float(1).sub(dens.mul(0.92).mul(U.disk)));
      col.addAssign(dustCol.mul(dens).mul(lanes.mul(0.7).add(0.3)).mul(fwd).mul(0.7).mul(U.sunI).mul(U.disk).div(12));
    });

    If(U.sunShow.greaterThan(0), () => {
      const sAng = acos2(mu), a = U.sunAng;
      const x = clamp(sAng.div(a), 0, 1);
      const limb = float(1).sub(float(1).sub(sqrt(max(float(1).sub(x.mul(x)), 0))).mul(0.62));
      const disc = smoothstep(a.add(U.pixel), a.sub(U.pixel).max(0), sAng);
      const rad = min(U.sunI.div(a.mul(a).mul(PI)), 900);
      col.addAssign(U.sunCol.mul(disc.mul(limb).mul(rad)));
      col.addAssign(U.sunCol.mul(exp(sAng.div(a.mul(1.4).max(0.0015)).negate()).mul(2.5).add(exp(sAng.div(0.02).negate()).mul(0.012))).mul(U.sunGlow).mul(U.sunI.div(12)));
    });

    If(U.swarm.greaterThan(0), () => {
      const S0 = U.sunEci, acc = float(0).toVar();
      for (const [nx, ny, nz, r, w] of [[0.2, 0.1, 0.97, 0.62, 0.012], [0.8, 0.2, 0.56, 0.55, 0.01], [-0.5, 0.7, 0.5, 0.7, 0.014], [0.1, -0.9, 0.42, 0.48, 0.009], [-0.7, -0.3, 0.64, 0.8, 0.016]]) {
        const nk = new THREE.Vector3(nx, ny, nz).normalize();
        const N = vec3(nk.x, nk.y, nk.z);
        const dn = dot(rdI, N);
        const t = dot(S0, N).div(select(abs(dn).lessThan(1e-4), float(1e-4), dn));
        const p = rdI.mul(t).sub(S0);
        const band = smoothstep(w, 0.0, abs(length(p).sub(r))).mul(select(t.greaterThan(0), float(1), float(0)));
        const gl = hash(floor(p.mul(700)).dot(vec3(1, 57.13, 113.7)));
        acc.addAssign(band.mul(smoothstep(0.985, 1.0, gl).mul(4).add(0.06)));
      }
      col.addAssign(vec3(1.0, 0.86, 0.6).mul(acc).mul(0.012).mul(U.swarm).mul(U.sunI.div(12)));
    });

    const ps = raySphere(ro, rd, U.R).toVar();
    const hitE = U.planet.greaterThan(0).and(ps.z.greaterThan(0)).and(ps.x.greaterThan(0)).toVar();
    const tE = select(hitE, ps.x, float(1e9)).toVar();
    const ms = raySphere(ro.sub(U.moon), rd, U.moonR).toVar();
    const hitM = U.moonShow.greaterThan(0).and(ms.z.greaterThan(0)).and(ms.x.greaterThan(0)).toVar();
    const tM = select(hitM, ms.x, float(1e9)).toVar();
    const cs = raySphere(ro, rd, U.R.add(8)).toVar();
    const tC = select(cs.x.greaterThan(0), cs.x, cs.y).toVar();
    const hitC = U.planet.greaterThan(0).and(cs.z.greaterThan(0)).and(cs.y.greaterThan(0)).and(tC.lessThan(tM)).toVar();

    const tg = select(hitE, ps.x, max(dot(ro, rd).negate(), 0)).toVar();
    const nE = normalize(ro.add(rd.mul(tg))).toVar();
    const uvE = sphereUV(nE).toVar();
    const gE = vec4(dFdx(uvE), dFdy(uvE)).toVar();
    const puv = vec2(fract(uvE.x.sub(0.5).mul(360).sub(U.patch.x).div(360)).mul(360).div(U.patch.z), U.patch.y.sub(float(0.5).sub(uvE.y).mul(180)).div(U.patch.z)).toVar();
    const gP = vec4(dFdx(puv), dFdy(puv)).toVar();
    const nC = normalize(ro.add(rd.mul(max(tC, 0)))).toVar();
    const uvC = sphereUV(nC).toVar();
    const gC = vec4(dFdx(uvC), dFdy(uvC)).toVar();
    const nM = normalize(ro.add(rd.mul(select(hitM, ms.x, max(dot(ro.sub(U.moon), rd).negate(), 0)))).sub(U.moon)).toVar();
    const ml = U.moonM.mul(nM).toVar();
    const uvM0 = vec2(atan(ml.y, ml.x).div(2 * PI).add(0.5), float(0.5).sub(asin(clamp(ml.z, -1, 1)).div(PI))).toVar();
    const uvM2 = vec2(fract(uvM0.x.add(0.5)).sub(0.5), uvM0.y);
    const uvM = select(fwidth(uvM0.x).greaterThan(fwidth(uvM2.x).add(1e-7)), uvM2, uvM0).toVar();
    const gM = vec4(dFdx(uvM), dFdy(uvM)).toVar();

    If(hitM.and(tM.lessThan(tE)), () => {
      const a0 = T.moon.sample(uvM).grad(gM.xy, gM.zw).rgb;
      const lum = dot(a0, vec3(0.3, 0.59, 0.11));
      const alb = mix(vec3(lum.mul(1.25).add(0.08)), a0, U.moonMaria).mul(0.9);
      const du = vec2(1 / 1440, 0), dv = vec2(0, 1 / 720);
      const me = (o) => T.moonElev.sample(uvM.add(o)).grad(gM.xy, gM.zw).r;
      const hx = me(du).sub(me(du.negate())), hy = me(dv.negate()).sub(me(dv));
      const east = normalize(cross(U.moonZ, nM).add(vec3(1e-5, 0, 0)));
      const north = cross(nM, east);
      const nb = normalize(nM.sub(east.mul(hx.mul(2.6))).sub(north.mul(hy.mul(2.6))));
      const m0 = max(dot(nb, U.sun), 0), mv = max(dot(nM, rd.negate()), 0.02);
      const ls = m0.div(m0.add(mv)).mul(1.6).add(m0.mul(0.2));
      const es = max(dot(nM, normalize(U.moon).negate()), 0).mul(U.earthshine);
      col.assign(alb.mul(U.sunCol).mul(ls.mul(U.sunI).div(PI)).add(alb.mul(es)));
      col.addAssign(vec3(1.0, 0.3, 0.05).mul(smoothstep(0.35, 0.05, lum)).mul(U.moonGlow).mul(1.5));
    });

    If(hitE.and(tE.lessThanEqual(tM)), () => {
      const n = nE;
      const lat = asin(clamp(n.z, -1, 1)).mul(180 / PI).toVar(), lon = atan(n.y, n.x).mul(180 / PI).toVar();
      const S = surface(n, lat, lon, uvE, gE, puv, gP);
      const du = vec2(1 / 4096, 0), dv = vec2(0, 1 / 2048);
      const el = (o) => decodeElev(T.elev.sample(uvE.add(o)).grad(gE.xy, gE.zw).r);
      const e0 = el(du).sub(el(du.negate())), e1 = el(dv.negate()).sub(el(dv));
      const east = normalize(cross(vec3(0, 0, 1), n).add(vec3(1e-5, 0, 0)));
      const north = cross(n, east);
      const k = U.relief.div(9780 * 2).mul(S.relief).mul(float(1).sub(S.water));
      const nr = normalize(n.sub(east.mul(e0.mul(k).div(cos(lat.mul(PI / 180)).max(0.2)))).sub(north.mul(e1.mul(k))));
      const p = ro.add(rd.mul(tE));
      const Ts = transTo(p, U.R);
      const cosS = dot(n, U.sun), cosR = max(dot(nr, U.sun), 0);
      const day = smoothstep(-0.12, 0.08, cosS);
      const sh = U.sun.sub(n.mul(cosS));
      const shadowN = normalize(n.add(sh.mul(float(8).div(U.R).div(max(cosS, 0.08)))));
      const cShadow = float(1).sub(cloudAlpha(cloudTex(sphereUV(shadowN), gE)).mul(0.72));
      const skyAmb = vec3(0.32, 0.45, 0.75).mul(U.sunI).mul(0.05).mul(day);
      const diffuse = S.albedo.mul(Ts.mul(U.sunCol).mul(U.sunI).mul(cosR).mul(cShadow).add(skyAmb)).div(PI);
      const v = rd.negate(), hv = normalize(U.sun.add(v));
      const nh = max(dot(n, hv), 0), nv = max(dot(n, v), 0.001);
      const fres = float(0.02).add(float(0.98).mul(pow(float(1).sub(nv), 5)));
      const a2 = 0.028;
      const dd = nh.mul(nh).mul(a2 - 1).add(1);
      const ggx = float(a2).div(dd.mul(dd).mul(PI));
      const spec = ggx.mul(fres).mul(max(cosS, 0)).div(nv.mul(4).max(0.1)).mul(S.water).mul(cShadow);
      const specC = Ts.mul(U.sunCol).mul(U.sunI).mul(min(spec, 60)).mul(U.glint);
      const pat = select(U.pattern.greaterThan(0.5), smoothstep(0.6, 0.95, max(abs(sin(lat.mul(6.0))), abs(sin(lon.mul(6.0))))).mul(0.85).add(0.15), float(1));
      const L = S.lights;
      const grown = select(U.lights.greaterThan(1), pow(L.max(1e-5), float(1).div(U.lights)).mul(min(U.lights, 1.6)), smoothstep(float(1).sub(U.lights), float(1).sub(U.lights.mul(0.6)), sqrt(L)).mul(L).mul(U.lights).mul(1.4));
      const cell = hash(floor(n.mul(5200)).dot(vec3(1, 57.13, 113.7)));
      const dens = clamp(sqrt(grown).mul(1.15), 0, 1);
      const speck = smoothstep(float(1).sub(dens), float(1).sub(dens).add(0.08), cell).mul(mix(cell.mul(0.6).add(0.4), float(1), dens.mul(dens)));
      const fp = U.pixel.mul(tE).div(max(nv, 0.15));
      const km = vec2(lon.mul(cos(lat.mul(PI / 180))), lat).mul(111.2);
      const fw = fp.div(1.609);
      const dq = abs(fract(km.div(1.609).add(0.5)).sub(0.5));
      const ln = vec2(1).sub(smoothstep(vec2(0.06).sub(fw), vec2(0.06).add(fw), dq));
      const grid = mix(max(ln.x, ln.y), float(0.23), smoothstep(0.2, 0.5, fw));
      const fill = mix(hash(floor(km.div(0.45)).dot(vec2(1, 57.13))), float(0.5), smoothstep(0.2, 0.6, fp));
      const street = mix(float(1), grid.add(fill.mul(0.4)).div(0.43), smoothstep(0.15, 0.6, dens));
      const speckF = mix(speck, dens.mul(mix(float(0.7), float(1), dens.mul(dens))), smoothstep(0.5, 1.2, fp.div(1.225)));
      const core = smoothstep(0.75, 1.0, L).mul(mix(grid, float(1), smoothstep(0.2, 0.5, fw)));
      const vary = mx_fractal_noise_float(n.mul(1800), 2, 2.3, 0.5).mul(0.5).add(0.85).max(0.3);
      const cityL = mix(U.lightTint, vec3(1.0, 0.78, 0.5), core.mul(0.55)).mul(speckF.mul(pow(grown.max(0), float(2.6)).mul(1.5).add(0.03)).mul(pat).mul(street).mul(vary)).mul(float(1).sub(day)).mul(0.065);
      col.assign(diffuse.add(specC).add(S.emit).add(cityL));
    });

    If(hitC, () => {
      const pc = ro.add(rd.mul(tC));
      const cN = normalize(pc);
      const Tc = transTo(pc, U.R.add(8));
      const cosC = dot(cN, U.sun);
      const grazing = float(1).div(max(abs(dot(cN, rd)), 0.12));
      const cA = clamp(cloudAlpha(cloudTex(uvC, gC)).mul(select(hitE, float(1), grazing.mul(0.35))), 0, 1);
      const skyAmb = vec3(0.32, 0.45, 0.75).mul(U.sunI).mul(0.05).mul(smoothstep(-0.12, 0.08, cosC));
      const lit = Tc.mul(U.sunCol).mul(U.sunI).mul(max(cosC.mul(0.75).add(0.25), 0).mul(smoothstep(-0.15, 0.05, cosC))).mul(0.82).div(PI).add(skyAmb.mul(0.6));
      const under = select(U.mode.greaterThan(1.5).and(U.mode.lessThan(2.5)).or(U.mode.greaterThan(7.5)), vec3(1.0, 0.3, 0.06).mul(U.magma.mul(0.5).add(0.1)), vec3(0));
      col.assign(mix(col, lit.add(under), cA));
    });

    If(U.planet.greaterThan(0), () => {
      const a = raySphere(ro, rd, U.R.add(U.top));
      If(a.z.greaterThan(0).and(a.y.greaterThan(0)), () => {
        const t0 = max(a.x, 0).toVar(), t1 = min(a.y, min(tE, tM)).toVar();
        const tm = clamp(dot(ro, rd).negate(), t0, t1).toVar();
        const N = float(U.steps);
        const n1 = select(t1.sub(tm).lessThan(1), N, select(tm.sub(t0).lessThan(1), float(0), N.mul(0.5).floor())).toVar();
        const odR = float(0).toVar(), odM = float(0).toVar(), odH = float(0).toVar(), odO = float(0).toVar();
        const inR = vec3(0).toVar(), inM = vec3(0).toVar(), inH = vec3(0).toVar(), glow = float(0).toVar(), sunlit = vec3(0).toVar();
        Loop({ start: int(0), end: U.steps, type: 'int', condition: '<' }, ({ i }) => {
          const fi = float(i);
          const first = fi.lessThan(n1);
          const u = select(first, fi.add(0.5).div(n1.max(1)), fi.sub(n1).add(0.5).div(N.sub(n1).max(1)));
          const om = float(1).sub(u);
          const x = select(first, float(1).sub(om.mul(om).mul(om)), u.mul(u).mul(u));
          const dx = select(first, om.mul(om).mul(3).div(n1.max(1)), u.mul(u).mul(3).div(N.sub(n1).max(1)));
          const t = select(first, t0.add(tm.sub(t0).mul(x)), tm.add(t1.sub(tm).mul(x)));
          const dt = select(first, tm.sub(t0), t1.sub(tm)).mul(dx);
          const p = ro.add(rd.mul(t));
          const r = length(p);
          const h = r.sub(U.R);
          const dR = exp(h.div(-8)).mul(dt), dM = exp(h.div(-1.2)).mul(dt), dH = exp(h.div(U.hazeH.negate())).mul(dt);
          const dO = max(float(1).sub(abs(h.sub(25)).div(15)), 0).mul(dt);
          odR.addAssign(dR); odM.addAssign(dM); odH.addAssign(dH); odO.addAssign(dO);
          const s = sunOD(p, r);
          const Tt = exp(ext(odR.add(s.x), odM.add(s.y), odH.add(s.z), odO.add(ozSun(s, h))).negate()).mul(s.w);
          inR.addAssign(Tt.mul(dR)); inM.addAssign(Tt.mul(dM)); inH.addAssign(Tt.mul(dH));
          sunlit.addAssign(exp(ext(s.x, s.y, s.z, ozSun(s, h)).negate()).mul(s.w).mul(dR));
          glow.addAssign(exp(h.sub(95).div(5).pow(2).negate()).mul(dt).mul(float(1).sub(s.w)));
        });
        const pR = float(3 / (16 * PI)).mul(mu.mul(mu).add(1));
        const g = 0.76, g2 = g * g;
        const pM = float(3 / (8 * PI) * (1 - g2) / (2 + g2)).mul(mu.mul(mu).add(1)).div(pow(float(1 + g2).sub(mu.mul(2 * g)), 1.5));
        const gh = 0.6, gh2 = gh * gh;
        const pH = float((1 - gh2) / (4 * PI)).div(pow(float(1 + gh2).sub(mu.mul(2 * gh)), 1.5));
        const scat = U.ray.mul(inR).mul(pR).add(inM.mul(U.mie).mul(pM)).add(U.haze.mul(inH).mul(pH)).mul(U.sunCol).mul(U.sunI);
        const trans = exp(ext(odR, odM, odH, odO).negate());
        const lit = sunlit.div(odR.max(1e-4));
        const ms = vec3(1).sub(trans).mul(lit).mul(U.sunCol).mul(U.sunI).mul(U.ms);
        col.assign(col.mul(trans).add(scat).add(ms).add(vec3(0.25, 0.9, 0.35).mul(glow).mul(0.00007)));
      });
    });
    return vec4(col, 1);
  })();
}

export function backdropMesh(U, T) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false });
  m.fog = false;
  m.colorNode = buildBackdrop(U, T);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), m);
  mesh.frustumCulled = false; mesh.renderOrder = -40; mesh.name = 'SpaceBackdrop';
  return mesh;
}
