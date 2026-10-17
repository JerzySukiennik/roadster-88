// Roadster 88 space astronomy: game date to Julian day, sun and moon positions, Greenwich sidereal angle, the valley's place on Earth and its local frame, deep-time moon distance and solar luminosity. Pure JS, Earth-centred Earth-fixed metres (x to lon 0, z to the north pole).

export const R_EARTH = 6371000;
export const R_MOON = 1737400;
export const AU = 149597870700;
export const R_SUN = 696000000;
export const VALLEY = { lat: 35.1, lon: -117.9 };
export const D2R = Math.PI / 180;
const OBL = 23.4393 * D2R;
const MDAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function dayOfYear(d) { return MDAYS[Math.max(0, Math.min(11, d.month - 1))] + d.day + (d.hour + d.minute / 60 + (d.sec || 0) / 3600) / 24; }

export function utcHours(d) { return d.hour + d.minute / 60 + (d.sec || 0) / 3600 - VALLEY.lon / 15; }

export function daysSinceJ2000(d) {
  const y = d.year < 0 ? d.year + 1 : d.year;
  return (y - 2000) * 365.2422 + dayOfYear(d) - 1.5 - VALLEY.lon / 360;
}

export function sunEci(d, out) {
  const n = daysSinceJ2000(d);
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * D2R;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  return out.set(Math.cos(lam), Math.cos(OBL) * Math.sin(lam), Math.sin(OBL) * Math.sin(lam));
}

export function gmst(d, sun) {
  const ra = Math.atan2(sun.y, sun.x);
  return ra + (utcHours(d) - 12) * 15 * D2R;
}

export function moonEci(d, out) {
  const n = daysSinceJ2000(d);
  const Lp = ((218.316 + 13.176396 * n) % 360) * D2R, Mp = ((134.963 + 13.064993 * n) % 360) * D2R, F = ((93.272 + 13.22935 * n) % 360) * D2R;
  const lam = Lp + 6.289 * D2R * Math.sin(Mp), beta = 5.128 * D2R * Math.sin(F);
  const dist = (385001 - 20905 * Math.cos(Mp)) * 1000;
  const x = Math.cos(beta) * Math.cos(lam), y = Math.cos(beta) * Math.sin(lam), z = Math.sin(beta);
  out.set(x, Math.cos(OBL) * y - Math.sin(OBL) * z, Math.sin(OBL) * y + Math.cos(OBL) * z);
  return dist;
}

export function eciToEcef(v, theta, out) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return out.set(c * v.x + s * v.y, -s * v.x + c * v.y, v.z);
}

export function geodetic(lat, lon, alt, out) {
  const r = R_EARTH + alt, cl = Math.cos(lat * D2R);
  return out.set(r * cl * Math.cos(lon * D2R), r * cl * Math.sin(lon * D2R), r * Math.sin(lat * D2R));
}

export function enuBasis(lat, lon) {
  const p = lat * D2R, l = lon * D2R;
  const up = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  const north = [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)];
  const east = [-Math.sin(l), Math.cos(l), 0];
  return { up, north, east, west: east.map((v) => -v) };
}

const lerpTable = (tab, x) => {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [a, va] = tab[i - 1], [b, vb] = tab[i]; const k = (x - a) / (b - a); return va + (vb - va) * k * k * (3 - 2 * k); }
  return tab[tab.length - 1][1];
};

const MOON_FRAC = [[-4.53e9, 0.06], [-4.5e9, 0.1], [-4.4e9, 0.2], [-4.0e9, 0.42], [-3.2e9, 0.8], [-2.45e9, 0.88], [-6.2e8, 0.965], [2026, 1], [1e9, 1.05], [5e9, 1.2]];
export function moonDistanceFactor(year) { return lerpTable(MOON_FRAC, year); }

export function sunLuminosity(year) {
  const t = (year + 4.57e9) / 1e9;
  if (t <= 0) return 0;
  if (t < 10.9) return Math.min(2.2, 1 / (1 + 0.4 * (1 - t / 4.57)));
  return 2.2;
}

const SUN_RADIUS = [[-4.57e9, 1.5], [-4.5e9, 0.9], [2026, 1], [1e9, 1.06], [3.5e9, 1.25], [5e9, 1.6], [6.0e9, 3], [7.0e9, 40], [7.59e9, 200], [7.62e9, 0.012]];
export function sunRadiusFactor(year) { return lerpTable(SUN_RADIUS, year); }
