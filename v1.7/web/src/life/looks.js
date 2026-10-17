// Roadster 88 life looks: per-species TSL surface shading on rest-pose coordinates (countershaded scaly hides with blotches and banding for dinosaurs, short-hair coats, feathers, cloth and skin for people), returning colour, roughness, bump height and emissive for the crowd material.
import { float, vec3, mix, smoothstep, clamp, abs, sin, max, min, mx_noise_float, mx_worley_noise_float, fwidth, hash, fract, floor, dot } from 'three/tsl';

const c3 = (a) => vec3(a[0], a[1], a[2]);
const fade = (coord, f) => float(1).sub(smoothstep(0.2, 0.6, fwidth(coord).mul(f)));

function scales(rp, freq, amp, lite) {
  if (lite) return { w: float(0.5), k: float(0), h: float(0) };
  const w = mx_worley_noise_float(rp.mul(freq));
  const k = fade(rp.x, freq).mul(fade(rp.y, freq));
  return { w, k, h: smoothstep(0.0, 0.55, w).mul(amp).mul(k) };
}

export function hide(o) {
  return (S) => {
    const { rp, rn, ao, curv, seed, is } = S;
    const lite = S.lite;
    const n1 = mx_noise_float(rp.mul(o.blotchScale || 0.45)).mul(0.5).add(0.5);
    const n2 = lite ? n1 : mx_noise_float(rp.mul(1.9)).mul(0.5).add(0.5);
    const n4 = lite ? float(0.5) : mx_noise_float(rp.mul(o.mottleScale || 1.1).add(17.0)).mul(0.5).add(0.5);
    const n3 = lite ? float(0) : mx_noise_float(rp.mul(5.3));
    const dorsal = smoothstep(-0.15, 0.85, rn.y);
    const belly = smoothstep(-0.05, -0.75, rn.y).mul(smoothstep(o.bellyTop || 99, (o.bellyTop || 99) - 1.5, rp.y));
    const hv = hash(seed.mul(91.7));
    let col = mix(c3(o.side), c3(o.back), dorsal.mul(o.backMix || 0.75));
    col = col.mul(float(1 - (o.mottle === undefined ? 0.3 : o.mottle) / 2).add(n4.mul(o.mottle === undefined ? 0.3 : o.mottle)));
    col = mix(col, c3(o.blotch || o.back), smoothstep(0.55, 0.78, n1).mul(o.blotchAmt || 0.5));
    if (o.bands) {
      const b = smoothstep(0.58, 0.8, sin(rp.z.mul(o.bands).add(n1.mul(3.5)).add(rp.y.mul(0.6)).add(n4.mul(1.5))).mul(0.5).add(0.5));
      col = mix(col, c3(o.bandCol || o.back), b.mul(smoothstep(-0.1, 0.6, rn.y)).mul(o.bandAmt || 0.5).mul(smoothstep(o.bandFrom || 0, (o.bandFrom || 0) + 1.0, rp.y)));
    }
    if (o.spine) col = mix(col, c3(o.back).mul(0.7), smoothstep(o.spineW || 0.12, 0.0, abs(rp.x)).mul(dorsal).mul(o.spine));
    if (o.spots) col = mix(col, c3(o.spotCol), smoothstep(0.62, 0.7, mx_noise_float(rp.mul(o.spots)).mul(0.5).add(0.5)).mul(float(1).sub(belly)).mul(o.spotAmt || 0.6));
    col = mix(col, c3(o.belly), belly.mul(o.bellyAmt || 0.85));
    const sf = float(o.scaleFreq || 14).mul(mix(float(0.65), float(1.35), belly.add(float(1).sub(dorsal).mul(0.4)).min(1)));
    const sc = scales(rp.mul(sf.div(o.scaleFreq || 14)), o.scaleFreq || 14, 0.005, lite);
    col = col.mul(float(0.9).add(sc.w.mul(0.2).mul(sc.k)).add(n3.mul(0.05)));
    col = col.mul(float(1 - (o.vary || 0.18) / 2).add(hv.mul(o.vary || 0.18)));
    const crease = smoothstep(0.47, 0.28, curv);
    col = col.mul(float(1).sub(crease.mul(0.35))).mul(mix(float(0.62), float(1.0), ao));
    let rough = float(o.rough || 0.74).add(n2.mul(0.1)).sub(sc.w.mul(0.06).mul(sc.k)).sub(dorsal.mul(o.sheen || 0.08));
    const eye = is('eye'), tooth = is('tooth'), claw = is('claw'), mouth = is('mouth'), horn = is('horn'), frill = is('frill'), beak = is('beak'), hoof = is('hoof');
    col = mix(col, c3(o.eye || [0.32, 0.2, 0.05]).mul(n3.mul(0.2).add(0.9)), eye);
    col = mix(col, vec3(0.72, 0.66, 0.52).mul(n2.mul(0.25).add(0.8)), tooth);
    col = mix(col, vec3(0.1, 0.085, 0.07), claw.add(hoof).min(1));
    col = mix(col, vec3(0.26, 0.07, 0.06), mouth);
    col = mix(col, mix(vec3(0.55, 0.5, 0.42), vec3(0.18, 0.15, 0.12), smoothstep(0.0, 1.0, n2)), horn.add(beak).min(1));
    if (o.frill) {
      const fn = mx_noise_float(rp.mul(2.4)).mul(0.5).add(0.5), rim = smoothstep(0.86, 0.98, n1.mul(0.3).add(fn.mul(0.2)).add(smoothstep(0.0, 1.0, rp.y.sub(1.9).mul(1.2)).mul(0.7)));
      col = mix(col, mix(mix(c3(o.frill[0]), c3(o.frill[1]), smoothstep(0.35, 0.7, fn)), c3(o.frill[2] || o.frill[1]), rim), frill);
    }
    rough = mix(rough, float(0.06), eye); rough = mix(rough, float(0.38), tooth.add(claw).add(horn).add(beak).min(1)); rough = mix(rough, float(0.5), mouth);
    const wrinkle = lite ? float(0) : sin(rp.y.mul(70.0).add(rp.z.mul(20.0)).add(n2.mul(9.0))).mul(0.5).add(0.5).mul(crease).mul(0.003).mul(fade(rp.y, 70.0));
    const bump = sc.h.add(lite ? float(0) : mx_noise_float(rp.mul(3.1)).mul(0.006)).add(crease.mul(0.004)).add(wrinkle).mul(float(1).sub(eye));
    return { color: col.mul(o.albedo || 0.75), rough, bump };
  };
}

export function plumage(o) {
  const skin = hide(o.skin);
  return (S) => {
    const { rp, rn, seed, is, c0 } = S;
    const base = skin(S);
    const fe = is('feather').add(is('mane')).min(1);
    const n1 = mx_noise_float(rp.mul(o.patch || 3.0)).mul(0.5).add(0.5);
    const along = rp.z.mul(o.barbs || 90.0).add(mx_noise_float(rp.mul(14.0)).mul(2.0));
    const barbs = sin(along).mul(0.5).add(0.5).mul(fade(rp.z, o.barbs || 90));
    const dorsal = smoothstep(-0.2, 0.8, rn.y), belly = smoothstep(0.0, -0.7, rn.y);
    const tint = o.tinted ? c0.xyz : c3(o.back);
    let col = mix(c3(o.side || o.back), tint, dorsal.mul(0.8));
    col = mix(col, c3(o.belly), belly.mul(o.bellyAmt === undefined ? 0.8 : o.bellyAmt));
    if (o.bars) col = mix(col, c3(o.barCol), smoothstep(0.55, 0.75, sin(rp.z.mul(o.bars).add(n1.mul(2.5))).mul(0.5).add(0.5)).mul(o.barAmt || 0.5).mul(smoothstep(o.barZ || 99, (o.barZ || 99) - 0.6, rp.z)));
    if (o.accent) col = mix(col, c3(o.accent), smoothstep(0.62, 0.8, n1).mul(o.accentAmt || 0.4));
    col = col.mul(float(0.86).add(barbs.mul(0.16)).add(n1.mul(0.08))).mul(float(0.9).add(hash(seed.mul(53.1)).mul(0.2)));
    if (o.tinted) col = mix(col, c0.xyz.mul(float(0.9).add(barbs.mul(0.15))), float(o.tintAmt || 0.85));
    const color = mix(base.color, col, fe);
    const rough = mix(base.rough, float(o.rough || 0.62).add(barbs.mul(0.12)), fe);
    const sheen = o.sheen ? smoothstep(0.3, 1.0, rn.y).mul(o.sheen) : float(0);
    return { color: color.add(vec3(0.02, 0.025, 0.04).mul(sheen).mul(fe)), rough, bump: mix(base.bump, barbs.mul(0.0015), fe) };
  };
}

export function membrane(o) {
  const skin = hide(o.skin);
  return (S) => {
    const { rp, is } = S;
    const base = skin(S);
    const fr = is('frill'), fur = is('mane');
    const veins = smoothstep(0.85, 1.0, sin(rp.x.mul(6.0).add(mx_noise_float(rp.mul(3.0)).mul(1.5))).mul(0.5).add(0.5)).mul(0.25);
    let color = mix(base.color, c3(o.membrane).mul(float(1).sub(veins)), fr);
    color = mix(color, c3(o.fur).mul(mx_noise_float(rp.mul(40.0)).mul(0.15).add(0.9)), fur);
    if (o.crest) color = mix(color, c3(o.crest), fr.mul(smoothstep(0.35, 0.5, rp.y)).mul(smoothstep(2.3, 2.5, rp.z)));
    return { color, rough: mix(base.rough, float(0.55), fr.add(fur).min(1)), bump: base.bump };
  };
}

export function coat(o) {
  return (S) => {
    const { rp, rn, ao, curv, seed, is, c0, c1 } = S;
    const n1 = mx_noise_float(rp.mul(o.patchScale || 2.2)).mul(0.5).add(0.5);
    const n2 = S.lite ? n1 : mx_noise_float(rp.mul(7.0)).mul(0.5).add(0.5);
    const hair = S.lite ? float(0.5) : mx_noise_float(vec3(rp.x.mul(420.0), rp.y.mul(60.0), rp.z.mul(60.0))).mul(0.5).add(0.5).mul(fade(rp.x, 420.0));
    const dorsal = smoothstep(-0.2, 0.9, rn.y), belly = smoothstep(0.05, -0.7, rn.y);
    const coatC = o.tinted ? c0.xyz : c3(o.coat);
    let col = coatC.mul(mix(float(1.08), float(0.82), dorsal.mul(o.dorsalDark || 0.6)));
    col = mix(col, coatC.mul(o.bellyLight || 1.5).add(vec3(0.04, 0.035, 0.03)), belly.mul(o.bellyAmt || 0.5));
    const lowLeg = smoothstep(o.sockTop || 0.35, (o.sockTop || 0.35) - 0.12, rp.y);
    col = mix(col, c3(o.legs || [0.05, 0.04, 0.035]), lowLeg.mul(o.legDark || 0.6));
    if (o.tinted) col = mix(col, vec3(0.75, 0.72, 0.66), lowLeg.mul(c1.x));
    if (o.patches) col = mix(col, c3(o.patchCol), smoothstep(0.58, 0.66, n1).mul(o.tinted ? c1.y : 1).mul(o.patches));
    if (o.blaze) col = mix(col, vec3(0.78, 0.75, 0.7), smoothstep(0.03, 0.015, abs(rp.x)).mul(smoothstep(o.blaze[0], o.blaze[1], rp.z)).mul(o.tinted ? c1.x : 0.6));
    col = col.mul(float(0.9).add(hair.mul(0.14)).add(n2.mul(0.06))).mul(float(0.92).add(hash(seed.mul(17.3)).mul(0.16)));
    col = col.mul(mix(float(0.75), float(1.0), smoothstep(0.25, 0.6, curv)));
    const mane = is('mane'), hoof = is('hoof'), eye = is('eye'), horn = is('horn'), nose = is('nose'), mouth = is('mouth');
    const maneC = o.maneTint ? coatC.mul(o.maneTint) : c3(o.mane || [0.03, 0.025, 0.02]);
    col = mix(col, maneC.mul(float(0.8).add(hair.mul(0.3))), mane);
    col = mix(col, vec3(0.06, 0.05, 0.045).mul(n2.mul(0.4).add(0.8)), hoof);
    col = mix(col, vec3(0.02, 0.015, 0.012), eye);
    col = mix(col, mix(vec3(0.62, 0.56, 0.44), vec3(0.15, 0.12, 0.1), smoothstep(0.2, 0.9, n2)), horn);
    col = mix(col, c3(o.nose || [0.06, 0.05, 0.05]), nose);
    col = mix(col, vec3(0.2, 0.08, 0.07), mouth);
    let rough = float(o.rough || 0.78).add(hair.mul(0.1));
    rough = mix(rough, float(0.08), eye); rough = mix(rough, float(0.45), hoof.add(horn).min(1)); rough = mix(rough, float(0.35), nose);
    const bump = hair.mul(0.0012).add(n2.mul(0.002));
    return { color: col.mul(o.albedo || 0.72), rough, bump };
  };
}

const SKIN = [[0.62, 0.43, 0.33], [0.5, 0.33, 0.24], [0.36, 0.23, 0.15], [0.22, 0.13, 0.085], [0.13, 0.08, 0.055]];
const HAIR = [[0.02, 0.016, 0.013], [0.09, 0.055, 0.03], [0.28, 0.18, 0.08], [0.45, 0.36, 0.22], [0.3, 0.29, 0.28], [0.3, 0.1, 0.04]];
const pal = (list, t) => { let c = c3(list[0]); for (let i = 1; i < list.length; i++) c = mix(c, c3(list[i]), smoothstep(float((i - 0.5) / list.length), float((i - 0.5) / list.length + 0.001), t)); return c; };

export function person(o = {}) {
  return (S) => {
    const { rp, rn, curv, seed, is, c0, c1, U } = S;
    const n1 = S.lite ? float(0.5) : mx_noise_float(rp.mul(23.0)).mul(0.5).add(0.5), n2 = S.lite ? float(0.5) : mx_noise_float(rp.mul(4.0)).mul(0.5).add(0.5);
    const weave = sin(rp.x.mul(900.0).add(rp.y.mul(900.0))).mul(sin(rp.y.mul(900.0).sub(rp.z.mul(900.0)))).mul(0.5).add(0.5).mul(fade(rp.y, 900.0));
    const skinC = pal(SKIN, c0.w).mul(float(0.95).add(n1.mul(0.08)));
    const hairC = pal(HAIR, c1.w);
    const fold = smoothstep(0.3, 0.6, curv);
    const cloth = (c) => c.mul(float(0.84).add(weave.mul(0.12)).add(n2.mul(0.06))).mul(mix(float(0.7), float(1.0), fold));
    const sclera = is('sclera'), isSkin = is('skin'), isHair = is('hair').add(is('brow')).min(1), shirt = is('shirt'), pants = is('pants'), shoes = is('shoes'), hat = is('hat'), dress = is('dress'), vest = is('vest'), belt = is('belt'), eye = is('eye'), lip = is('lip'), sole = is('sole'), glow = is('glow'), lens = is('lens');
    const denim = o.denim ? mix(c1.xyz, c1.xyz.mul(1.25), smoothstep(0.4, 0.7, sin(rp.y.mul(1400.0).add(rp.x.mul(1400.0))).mul(0.5).add(0.5)).mul(fade(rp.y, 1400.0))) : c1.xyz;
    let col = skinC;
    col = mix(col, cloth(c0.xyz), shirt);
    col = mix(col, cloth(denim), pants);
    col = mix(col, cloth(c0.xyz).mul(mix(float(1), float(0.92), smoothstep(0.45, 0.55, fract(rp.y.mul(14.0))))), dress);
    col = mix(col, cloth(c3(o.vest || [0.12, 0.08, 0.05]).mul(float(0.7).add(hash(seed.mul(7.7)).mul(0.6)))), vest);
    col = mix(col, c3(o.shoes || [0.06, 0.045, 0.035]).mul(float(0.8).add(n2.mul(0.3))).mul(float(0.7).add(hash(seed.mul(3.3)).mul(0.6))), shoes);
    col = mix(col, c3(o.hat || [0.16, 0.11, 0.07]).mul(float(0.6).add(hash(seed.mul(5.1)).mul(0.8))), hat);
    col = mix(col, vec3(0.045, 0.03, 0.02), belt);
    col = mix(col, hairC.mul(float(0.85).add(n1.mul(0.3))), isHair);
    col = mix(col, vec3(0.03, 0.022, 0.015), eye);
    col = mix(col, vec3(0.62, 0.6, 0.57), sclera);
    col = mix(col, skinC.mul(vec3(0.85, 0.62, 0.6)), lip);
    col = mix(col, vec3(0.8, 0.8, 0.78), sole);
    col = mix(col, vec3(0.02, 0.025, 0.03), lens.add(glow).min(1));
    let rough = mix(float(0.52).add(n1.mul(0.1)), float(0.86), shirt.add(pants).add(dress).add(vest).add(hat).min(1));
    rough = mix(rough, float(0.45), isHair); rough = mix(rough, float(0.4), shoes.add(belt).min(1)); rough = mix(rough, float(0.1), eye.add(lens).add(sclera).min(1));
    const emissive = vec3(0.35, 0.85, 1.0).mul(glow).mul(float(1.5).add(U.night.mul(4.0)));
    return { color: col, rough, bump: weave.mul(0.0004).add(n1.mul(0.0006)), emissive };
  };
}

export function machine(o = {}) {
  return (S) => {
    const { rp, rn, curv, seed, is, c0, c1, U } = S;
    const n1 = S.lite ? float(0.5) : mx_noise_float(rp.mul(3.0)).mul(0.5).add(0.5), n2 = S.lite ? float(0.5) : mx_noise_float(rp.mul(17.0)).mul(0.5).add(0.5);
    const paint = is('paint'), glass = is('glass'), tire = is('tire'), rim = is('rim'), trim = is('trim'), lens = is('lens'), glow = is('glow'), white = is('white'), wood = is('wood'), canvas = is('canvas'), metal = is('metal'), brass = is('brass'), red = is('red'), coal = is('coal');
    const grain = sin(rp.z.mul(60.0).add(n1.mul(6.0))).mul(0.5).add(0.5);
    let col = c0.xyz.mul(float(0.92).add(n2.mul(0.08)));
    col = mix(col, vec3(0.012, 0.014, 0.016), glass);
    col = mix(col, vec3(0.022, 0.022, 0.022), tire);
    col = mix(col, c3(o.rim || [0.5, 0.5, 0.52]), rim);
    col = mix(col, vec3(0.025, 0.025, 0.027), trim);
    col = mix(col, vec3(0.75, 0.75, 0.72), lens);
    col = mix(col, c3(o.glowCol || [0.35, 0.02, 0.01]), glow);
    col = mix(col, vec3(0.72, 0.72, 0.7).mul(float(0.9).add(n1.mul(0.1))), white);
    col = mix(col, vec3(0.2, 0.12, 0.06).mul(float(0.7).add(grain.mul(0.5))), wood);
    col = mix(col, vec3(0.55, 0.5, 0.4).mul(float(0.85).add(n1.mul(0.2))), canvas);
    col = mix(col, vec3(0.035, 0.033, 0.03), metal);
    col = mix(col, vec3(0.5, 0.36, 0.12), brass);
    col = mix(col, vec3(0.32, 0.035, 0.025), red);
    col = mix(col, vec3(0.015, 0.014, 0.013), coal);
    const dirt = smoothstep(0.55, 0.05, rp.y).mul(o.dirt === undefined ? 0.5 : o.dirt).mul(float(1).sub(glass).sub(lens).max(0));
    col = mix(col, vec3(0.2, 0.17, 0.13), dirt.mul(n1));
    col = col.mul(mix(float(0.75), float(1.0), smoothstep(0.25, 0.6, curv)));
    let rough = mix(float(o.paintRough || 0.32), float(0.05), glass);
    rough = mix(rough, float(0.9), tire.add(canvas).add(coal).min(1)); rough = mix(rough, float(0.3), rim.add(brass).min(1)); rough = mix(rough, float(0.6), trim.add(metal).min(1)); rough = mix(rough, float(0.85), wood.add(red).min(1)); rough = mix(rough, float(0.15), lens);
    rough = mix(rough, float(0.9), dirt.mul(n1));
    let metalN = paint.mul(o.paintMetal === undefined ? 0.35 : o.paintMetal).add(rim.mul(0.9)).add(brass).add(metal.mul(0.5));
    const lightsOn = c1.y, brake = c1.x;
    const emissive = vec3(1.0, 0.92, 0.78).mul(lens).mul(lightsOn.mul(9.0).add(0.15)).add(c3(o.glowCol ? o.glowCol.map((v) => v * 3) : [1.0, 0.04, 0.02]).mul(glow).mul(float(0.25).add(brake.mul(2.5)).add(lightsOn.mul(0.9))));
    return { color: col, rough, metal: metalN.min(1), emissive, bump: n2.mul(0.0004).add(grain.mul(wood).mul(0.002)) };
  };
}

export const LOOKS = {
  trex: { shade: hide({ side: [0.2, 0.15, 0.1], back: [0.075, 0.06, 0.04], blotch: [0.13, 0.09, 0.055], belly: [0.42, 0.36, 0.26], bellyTop: 3.6, bands: 2.4, bandCol: [0.045, 0.035, 0.025], bandAmt: 0.65, bandFrom: 2.6, spine: 0.5, scaleFreq: 11, eye: [0.55, 0.32, 0.04], rough: 0.68, mottle: 0.35 }), aoAmount: 0.9 },
  triceratops: { shade: hide({ side: [0.25, 0.2, 0.14], back: [0.12, 0.1, 0.07], blotch: [0.17, 0.13, 0.085], belly: [0.42, 0.37, 0.28], bellyTop: 1.6, spots: 1.6, spotCol: [0.08, 0.065, 0.045], spotAmt: 0.5, scaleFreq: 15, frill: [[0.32, 0.17, 0.08], [0.15, 0.09, 0.05], [0.06, 0.04, 0.03]], eye: [0.3, 0.2, 0.06], rough: 0.72, mottle: 0.3 }), aoAmount: 0.9 },
  sauropod: { shade: hide({ side: [0.27, 0.24, 0.2], back: [0.15, 0.13, 0.11], blotch: [0.2, 0.17, 0.14], blotchScale: 0.18, belly: [0.38, 0.35, 0.29], bellyTop: 4.5, bands: 1.1, bandCol: [0.12, 0.1, 0.085], bandAmt: 0.3, bandFrom: 3.5, scaleFreq: 5, eye: [0.2, 0.14, 0.06], rough: 0.78, vary: 0.12, mottle: 0.25, mottleScale: 0.5 }), aoAmount: 0.95 },
  hadrosaur: { shade: hide({ side: [0.21, 0.19, 0.12], back: [0.085, 0.09, 0.055], blotch: [0.14, 0.13, 0.08], belly: [0.42, 0.38, 0.28], bellyTop: 2.6, bands: 3.6, bandCol: [0.06, 0.06, 0.04], bandAmt: 0.6, bandFrom: 2.0, spine: 0.4, scaleFreq: 15, eye: [0.32, 0.22, 0.05], rough: 0.72, mottle: 0.3 }), aoAmount: 0.9 },
  raptor: { shade: plumage({ skin: { side: [0.2, 0.17, 0.12], back: [0.12, 0.1, 0.07], belly: [0.3, 0.26, 0.2], scaleFreq: 40, eye: [0.6, 0.4, 0.05], rough: 0.65 }, back: [0.075, 0.052, 0.035], side: [0.2, 0.14, 0.09], belly: [0.42, 0.36, 0.27], bars: 9.0, barCol: [0.03, 0.022, 0.016], barAmt: 0.6, barZ: -0.8, accent: [0.32, 0.12, 0.05], accentAmt: 0.35, barbs: 70 }), aoAmount: 0.85 },
  quetzal: { shade: membrane({ skin: { side: [0.62, 0.58, 0.5], back: [0.5, 0.46, 0.4], belly: [0.7, 0.66, 0.6], scaleFreq: 30, eye: [0.2, 0.15, 0.05], rough: 0.5 }, membrane: [0.22, 0.17, 0.13], fur: [0.36, 0.3, 0.24], crest: [0.55, 0.12, 0.06] }), aoAmount: 0.7 },
  horse: { shade: coat({ tinted: true, dorsalDark: 0.35, bellyAmt: 0.25, bellyLight: 1.2, sockTop: 0.38, legDark: 0.75, legs: [0.03, 0.025, 0.02], blaze: [1.45, 1.6], mane: [0.025, 0.02, 0.018], rough: 0.62 }), aoAmount: 0.85 },
  longhorn: { shade: coat({ tinted: true, dorsalDark: 0.3, bellyAmt: 0.4, sockTop: 0.2, legDark: 0.2, patches: 1, patchCol: [0.6, 0.55, 0.47], patchScale: 3.0, maneTint: 0.6, nose: [0.2, 0.15, 0.13], rough: 0.8 }), aoAmount: 0.85 },
  canid: { shade: coat({ tinted: true, dorsalDark: 0.7, bellyAmt: 0.7, bellyLight: 1.8, sockTop: 0.1, legDark: 0.2, maneTint: 0.75, nose: [0.03, 0.025, 0.02], rough: 0.85 }), aoAmount: 0.85 },
  deer: { shade: coat({ coat: [0.22, 0.17, 0.12], dorsalDark: 0.5, bellyAmt: 0.7, bellyLight: 1.9, sockTop: 0.1, legDark: 0.15, mane: [0.03, 0.025, 0.02], nose: [0.55, 0.53, 0.5], rough: 0.85 }), aoAmount: 0.85 },
  human: { shade: person({ denim: true }), aoAmount: 0.75 },
  human_m1885: { shade: person({ vest: [0.1, 0.07, 0.04], hat: [0.18, 0.13, 0.08], shoes: [0.08, 0.05, 0.03] }), aoAmount: 0.75 },
  human_f1885: { shade: person({ hat: [0.3, 0.26, 0.2], shoes: [0.05, 0.04, 0.03] }), aoAmount: 0.75 },
  human_m2080: { shade: person({ vest: [0.1, 0.11, 0.12], shoes: [0.12, 0.12, 0.13] }), aoAmount: 0.75 },
  human_f2080: { shade: person({ shoes: [0.8, 0.8, 0.82] }), aoAmount: 0.75 },
  human_scifi: { shade: person({ vest: [0.85, 0.86, 0.88], shoes: [0.85, 0.86, 0.88] }), aoAmount: 0.75 },
  mammoth: { shade: coat({ tinted: true, dorsalDark: 0.3, bellyAmt: 0.2, sockTop: 0.45, legDark: 0.35, maneTint: 0.78, nose: [0.08, 0.06, 0.05], rough: 0.88 }), aoAmount: 0.9 },
  bison: { shade: coat({ tinted: true, dorsalDark: 0.4, bellyAmt: 0.2, sockTop: 0.2, legDark: 0.5, maneTint: 0.55, nose: [0.05, 0.04, 0.04], rough: 0.86 }), aoAmount: 0.85 },
  stegosaurus: { shade: hide({ side: [0.28, 0.24, 0.14], back: [0.14, 0.12, 0.07], blotch: [0.2, 0.16, 0.09], belly: [0.42, 0.38, 0.28], bellyTop: 2.2, bands: 2.0, bandCol: [0.1, 0.08, 0.05], bandAmt: 0.5, bandFrom: 1.2, scaleFreq: 14, frill: [[0.55, 0.2, 0.08], [0.3, 0.12, 0.06], [0.75, 0.45, 0.15]], eye: [0.3, 0.2, 0.05], rough: 0.72, mottle: 0.3 }), aoAmount: 0.9 },
  dimetrodon: { shade: hide({ side: [0.32, 0.2, 0.12], back: [0.2, 0.12, 0.07], blotch: [0.26, 0.15, 0.08], belly: [0.45, 0.38, 0.26], bellyTop: 0.9, bands: 6, bandCol: [0.12, 0.07, 0.04], bandAmt: 0.55, bandFrom: 0.3, scaleFreq: 30, frill: [[0.62, 0.32, 0.12], [0.35, 0.15, 0.08], [0.8, 0.6, 0.25]], eye: [0.6, 0.4, 0.05], rough: 0.7 }), aoAmount: 0.85 },
  dragonfly: { shade: membrane({ skin: { side: [0.08, 0.22, 0.12], back: [0.04, 0.12, 0.08], belly: [0.25, 0.22, 0.12], scaleFreq: 300, eye: [0.25, 0.06, 0.04], rough: 0.35 }, membrane: [0.42, 0.43, 0.38], fur: [0.1, 0.1, 0.1] }), aoAmount: 0.6 },
  human_mnative: { shade: person({ hat: [0.4, 0.08, 0.05], shoes: [0.3, 0.2, 0.12] }), aoAmount: 0.75 },
  human_fnative: { shade: person({ hat: [0.42, 0.33, 0.18], vest: [0.34, 0.28, 0.22], shoes: [0.3, 0.2, 0.12] }), aoAmount: 0.75 },
  human_mpadre: { shade: person({ shoes: [0.2, 0.13, 0.07] }), aoAmount: 0.75 },
  human_mvaquero: { shade: person({ vest: [0.18, 0.11, 0.06], hat: [0.3, 0.24, 0.16], shoes: [0.1, 0.06, 0.03] }), aoAmount: 0.75 },
  human_mminer: { shade: person({ hat: [0.2, 0.15, 0.1], shoes: [0.09, 0.06, 0.04] }), aoAmount: 0.75 },
  human_m1900: { shade: person({ vest: [0.07, 0.07, 0.08], hat: [0.05, 0.045, 0.04], shoes: [0.03, 0.03, 0.03] }), aoAmount: 0.75 },
  human_f1900: { shade: person({ hat: [0.62, 0.56, 0.45], shoes: [0.05, 0.04, 0.03] }), aoAmount: 0.75 },
  human_m1920: { shade: person({ vest: [0.12, 0.11, 0.1], hat: [0.18, 0.15, 0.12], shoes: [0.05, 0.035, 0.025] }), aoAmount: 0.75 },
  human_f1920: { shade: person({ hat: [0.35, 0.12, 0.2], shoes: [0.06, 0.04, 0.04] }), aoAmount: 0.75 },
  human_m1950: { shade: person({ denim: true, shoes: [0.7, 0.7, 0.68] }), aoAmount: 0.75 },
  human_f1950: { shade: person({ hat: [0.75, 0.25, 0.4], shoes: [0.06, 0.05, 0.05] }), aoAmount: 0.75 },
  human_m1970: { shade: person({ denim: true, shoes: [0.25, 0.15, 0.08] }), aoAmount: 0.75 },
  human_f1970: { shade: person({ denim: true, hat: [0.6, 0.35, 0.1], shoes: [0.25, 0.15, 0.08] }), aoAmount: 0.75 },
  human_m1990: { shade: person({ denim: true, hat: [0.1, 0.2, 0.45], shoes: [0.8, 0.8, 0.8] }), aoAmount: 0.75 },
  human_f1990: { shade: person({ denim: true, vest: [0.2, 0.3, 0.5], hat: [0.8, 0.3, 0.5], shoes: [0.85, 0.85, 0.85] }), aoAmount: 0.75 },
  car: { shade: machine({}), aoAmount: 0.9 },
  truck: { shade: machine({ paintRough: 0.4 }), aoAmount: 0.9 },
  pod: { shade: machine({ paintRough: 0.22, glowCol: [0.1, 0.5, 0.7], dirt: 0.1 }), aoAmount: 0.85 },
  ev2080: { shade: machine({ paintRough: 0.18, glowCol: [0.6, 0.05, 0.05], dirt: 0.1 }), aoAmount: 0.85 },
  hover: { shade: machine({ paintRough: 0.15, glowCol: [0.2, 0.7, 1.0], dirt: 0 }), aoAmount: 0.85 },
  wagon: { shade: machine({ paintRough: 0.8, paintMetal: 0, rim: [0.3, 0.2, 0.1], dirt: 0.7 }), aoAmount: 0.9 },
  coach: { shade: machine({ paintRough: 0.55, paintMetal: 0.05, rim: [0.35, 0.06, 0.04], dirt: 0.6 }), aoAmount: 0.9 },
  loco: { shade: machine({ paintRough: 0.6, paintMetal: 0.1, rim: [0.32, 0.04, 0.03], dirt: 0.6 }), aoAmount: 0.9 },
  railcar: { shade: machine({ paintRough: 0.7, paintMetal: 0.0, rim: [0.05, 0.05, 0.05], dirt: 0.6 }), aoAmount: 0.9 },
  drone: { shade: machine({ paintRough: 0.3, glowCol: [0.1, 0.9, 0.4], dirt: 0 }), aoAmount: 0.7 },
  bird: { shade: plumage({ skin: { side: [0.05, 0.05, 0.05], back: [0.04, 0.04, 0.04], belly: [0.06, 0.06, 0.06], scaleFreq: 200, eye: [0.05, 0.04, 0.02], rough: 0.45 }, back: [0.03, 0.03, 0.035], belly: [0.05, 0.05, 0.06], tinted: true, tintAmt: 0.85, barbs: 400, sheen: 1.0, rough: 0.5 }), aoAmount: 0.6 },
};
