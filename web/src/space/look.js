// Roadster 88 space look: what the Earth, its sky, the Moon, the Sun and the orbital structures look like for any year, from the pre-solar nebula and the protoplanetary disk through the magma ocean, Snowball Earth, the PALEOMAP continents, city lights by decade and the megastructures, to a dying Earth and the red giant. Keyed by E's period ids (eraOf) plus the year.
import { eraOf } from '../sim/timetravel.js';
import { moonDistanceFactor, sunLuminosity, sunRadiusFactor } from './astro.js';

export const PALEO_AGES = [0, 5, 20, 50, 70, 100, 150, 210, 245, 280, 310, 380, 460, 500];
const PALEO_SHIFT = { 0: 0, 5: 0, 20: 0.01, 50: 0.033, 70: 0.05, 100: 0.07, 150: 0.097, 210: 0.2589, 245: 0.3497, 280: 0.3448, 310: 0.4381, 380: 0.3619, 460: 0.7692, 500: 0.817 };

export const MODE = { present: 0, paleo: 1, hadean: 2, archean: 3, protero: 4, snowball: 5, dying: 6, venus: 7, lava: 8 };

const VEG = [[-541e6, 0], [-430e6, 0.05], [-390e6, 0.45], [-340e6, 1], [-300e6, 0.9], [-270e6, 0.4], [-200e6, 0.45], [-150e6, 0.7], [-90e6, 0.8], [-40e6, 0.95], [-10e6, 0.75], [-3e6, 0.6]];
const ARID = [[-541e6, 0.6], [-360e6, 0.35], [-310e6, 0.2], [-280e6, 0.7], [-210e6, 0.75], [-170e6, 0.5], [-100e6, 0.35], [-50e6, 0.25], [-10e6, 0.45]];
const LIGHTS = [[1880, 0], [1900, 0.03], [1920, 0.08], [1940, 0.16], [1960, 0.33], [1980, 0.56], [2000, 0.8], [2026, 1], [2050, 1.25], [2080, 1.5], [2150, 1.8], [2300, 2.05], [2499, 2.1]];

function table(tab, x) {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [a, va] = tab[i - 1], [b, vb] = tab[i]; return va + (vb - va) * (x - a) / (b - a); }
  return tab[tab.length - 1][1];
}

export function nearestPaleo(ma) {
  let best = PALEO_AGES[0];
  for (const a of PALEO_AGES) if (Math.abs(a - ma) < Math.abs(best - ma)) best = a;
  return best;
}

const ATMO = { rayleigh: 1, mie: 1, haze: [0, 0, 0], hazeAmt: 0, hazeH: 20, top: 100 };

export function lookFor(year, month = 10) {
  const span = eraOf(year), id = span.id;
  const L = {
    id, label: span.label, year,
    earth: true, mode: MODE.present, paleo: 0, season: month >= 5 && month <= 10 ? 'jul' : 'jan',
    lights: 0, lightTint: [1.0, 0.4, 0.1], pattern: 0,
    iceLat: 90, iceSouth: 90, seaLevel: 0, veg: 0.7, arid: 0.4, tint: [1, 1, 1], warp: 0, mirror: 0, lonShift: 0,
    clouds: 1, cloudShift: 0, magma: 0, ocean: [0.012, 0.035, 0.085], seaIce: 0,
    atmo: { ...ATMO },
    moon: { dist: moonDistanceFactor(year), maria: 1, glow: 0, show: true, debris: 0 },
    sun: { lum: sunLuminosity(year), radius: sunRadiusFactor(year), temp: 5772, show: true },
    ring: null, tether: null, station: false, swarm: 0, disk: 0, nebula: 0, rocks: 0, sats: 0,
    starAge: year - 2026,
  };
  const S = L.sun;
  if (year < -4.568e9) {
    Object.assign(L, { earth: false, nebula: 1, rocks: 0 });
    L.moon.show = false; S.show = year > -4.62e9; S.lum = 0.05; S.temp = 3200; S.radius = 4;
    return L;
  }
  if (year < -4.54e9) {
    Object.assign(L, { earth: false, disk: 1, rocks: 1 });
    L.moon.show = false; S.temp = 4300; S.lum = 0.75;
    return L;
  }
  if (year > 7.59e9) {
    Object.assign(L, { earth: false, nebula: 0.6 });
    L.moon.show = false; S.temp = 30000; S.lum = 0.25; S.radius = 0.012;
    return L;
  }
  if (year < -4.0e9) {
    Object.assign(L, { mode: MODE.hadean, magma: year < -4.45e9 ? 1 : year < -4.3e9 ? 0.6 : 0.3, clouds: 0.55, cloudShift: 0.31, veg: 0, ocean: [0.06, 0.03, 0.02] });
    L.atmo = { rayleigh: 1.4, mie: 2, haze: [0.42, 0.3, 0.24], hazeAmt: year < -4.45e9 ? 0.25 : 0.35, hazeH: 22, top: 130 };
    L.moon.maria = 0; L.moon.glow = year < -4.45e9 ? 1 : year < -4.35e9 ? 0.4 : 0;
    if (year < -4.51e9) L.moon.show = false;
    if (year >= -4.51e9 && year < -4.49e9) { L.moon.show = false; L.moon.debris = 1; }
    S.temp = 5450;
    return L;
  }
  if (year < -2.4e9) {
    Object.assign(L, { mode: MODE.archean, clouds: 0.7, cloudShift: 0.53, veg: 0, ocean: [0.02, 0.06, 0.05] });
    L.atmo = { rayleigh: 1.3, mie: 2.5, haze: [0.88, 0.55, 0.22], hazeAmt: year < -2.6e9 ? 0.65 : 0.35, hazeH: 32, top: 150 };
    L.moon.maria = Math.min(1, Math.max(0, (year + 3.8e9) / 0.7e9));
    S.temp = 5550;
    return L;
  }
  if (id === 'protero') {
    Object.assign(L, { mode: MODE.protero, clouds: 0.9, cloudShift: 0.17, veg: 0, arid: 0.7, ocean: [0.012, 0.04, 0.09] });
    S.temp = 5650;
    return L;
  }
  if (id === 'snowball') {
    Object.assign(L, { mode: MODE.snowball, clouds: 0.35, cloudShift: 0.71, veg: 0, iceLat: 8, iceSouth: 8, ocean: [0.01, 0.03, 0.07] });
    L.atmo = { ...ATMO, rayleigh: 0.95, mie: 0.5 };
    return L;
  }
  if (year < -2.58e6) {
    const ma = -year / 1e6;
    const age = nearestPaleo(ma);
    Object.assign(L, { mode: MODE.paleo, paleo: age, lonShift: PALEO_SHIFT[age], veg: table(VEG, year), arid: table(ARID, year), clouds: 1, cloudShift: (ma * 0.0037) % 1 });
    const cold = (year > -450e6 && year < -440e6) || (year > -335e6 && year < -265e6);
    L.iceLat = cold ? 58 : year > -34e6 ? 78 : 90;
    L.iceSouth = cold ? 55 : year > -34e6 ? 64 : 90;
    if (year < -400e6) L.atmo = { ...ATMO, rayleigh: 1.05 };
    if (id === 'carbon') L.atmo = { ...ATMO, mie: 1.6 };
    return L;
  }
  if (id === 'iceage') {
    Object.assign(L, { seaLevel: -120, iceLat: 47, iceSouth: 60, veg: 0.4, arid: 0.6, seaIce: 0.6, clouds: 0.9 });
    return L;
  }
  if (year < 2500) {
    L.lights = table(LIGHTS, year);
    if (year >= 2000) L.lightTint = year >= 2080 ? [0.92, 0.95, 1.0] : [1.0, 0.5, 0.17];
    if (year >= 2026) L.sats = Math.min(3, (year - 2000) / 30);
    if (year >= 2050) { L.iceLat = 90; L.seaIce = -0.5; }
    if (id === '2150') L.tether = 'build';
    if (id === '2300') { L.tether = 'full'; L.station = true; }
    return L;
  }
  if (year < 10000) {
    Object.assign(L, { veg: year < 2900 ? 0.85 : 0.95, tint: [0.92, 1.05, 0.92], seaIce: -0.3 });
    return L;
  }
  if (year < 50000) {
    Object.assign(L, { lights: 2.2, pattern: 1, lightTint: [0.8, 0.92, 1.0], ring: 'whole', tether: 'full', station: true, swarm: 1, sats: 3 });
    return L;
  }
  if (year < 500000) {
    Object.assign(L, { seaLevel: -90, iceLat: 50, iceSouth: 58, veg: 0.45, arid: 0.55, seaIce: 0.5, ring: 'broken' });
    return L;
  }
  if (year < 150e6) {
    Object.assign(L, { warp: Math.min(1, (year - 5e5) / 1.5e8) * 0.6 + 0.08, ring: 'debris', tint: [0.95, 0.88, 1.08], veg: 0.8 });
    return L;
  }
  if (year < 500e6) {
    Object.assign(L, { mode: MODE.paleo, paleo: 245, mirror: 1, lonShift: 0.37, veg: 0.35, arid: 0.85, iceLat: 90, iceSouth: 90, clouds: 0.7, cloudShift: 0.44 });
    return L;
  }
  if (year < 3.5e9) {
    Object.assign(L, { mode: MODE.dying, seaLevel: -6500, veg: 0, arid: 1, clouds: year < 1.5e9 ? 0.15 : 0.05, cloudShift: 0.6, iceLat: 90, iceSouth: 90 });
    L.atmo = { ...ATMO, rayleigh: 0.35, mie: 0.6, haze: [0.7, 0.5, 0.3], hazeAmt: 0.15, hazeH: 12 };
    S.radius = Math.max(S.radius, 1.9);
    return L;
  }
  if (year < 5.4e9) {
    Object.assign(L, { mode: MODE.venus, clouds: 1, cloudShift: 0.2, veg: 0 });
    L.atmo = { rayleigh: 1.5, mie: 4, haze: [0.95, 0.82, 0.5], hazeAmt: 1, hazeH: 30, top: 160 };
    return L;
  }
  Object.assign(L, { mode: MODE.lava, magma: 1, clouds: 0.25, cloudShift: 0.8, veg: 0 });
  L.atmo = { ...ATMO, rayleigh: 0.2, mie: 1.2, haze: [0.6, 0.3, 0.15], hazeAmt: 0.4, hazeH: 15 };
  S.temp = year > 6.5e9 ? 3300 : 4200;
  return L;
}

export function kelvinRGB(T) {
  const t = T / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = (v) => Math.min(1, Math.max(0, v / 255));
  const k = [c(r), c(g), c(b)], n = 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
  return k.map((v) => v / n);
}
