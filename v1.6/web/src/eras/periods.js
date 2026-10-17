// Roadster 88 periods: what every period of the timeline looks, sounds and behaves like (ground rules, sky, terrain palette, fluids, flora tints, weathering, weather climate, ambient and radio keys, sky extras, the city style per year and the town plan style), keyed by the period ids of sim/timetravel.js.
import { SKY_ERAS } from '../render/sky.js';
import { PERIODS as TIMELINE, eraOf } from '../sim/timetravel.js';

export const PERIOD_IDS = TIMELINE.map((p) => p.id);
export const PERIOD_INDEX = Object.fromEntries(PERIOD_IDS.map((id, i) => [id, i]));

const L = (floor, grass, rock, high, wash, road, o = {}) => ({
  layers: {
    floor: { color: floor[0], color2: floor[1], rough: floor[2] ?? 0.92 },
    grass: { color: grass[0], color2: grass[1], rough: grass[3] ?? 0.94, amount: grass[2] },
    ...(rock ? { rock: { color: rock[0], color2: rock[1], rough: rock[2] ?? 0.85 } } : {}),
    ...(high ? { high: { color: high[0], color2: high[1], rough: high[2] ?? 0.92 } } : {}),
    wash: { color: wash[0], color2: wash[1], rough: wash[2] ?? 0.9 },
    road: road || { amount: 0, lines: 0 },
  },
  wet: o.wet || 0,
  emissive: o.emissive || { amount: 0 },
  snow: o.snow || { amount: 0 },
});

const FRONTIER = L([[0.34, 0.26, 0.14], [0.44, 0.35, 0.19], 0.95], [[0.42, 0.32, 0.14], [0.3, 0.25, 0.11], 0.62, 0.96], [[0.36, 0.3, 0.23], [0.5, 0.42, 0.32], 0.86], [[0.13, 0.13, 0.075], [0.23, 0.2, 0.11]], [[0.52, 0.45, 0.34], [0.6, 0.53, 0.42]], { color: [0.22, 0.165, 0.105], rough: 0.97, amount: 0.42, lines: 0 });
const TODAY = L([[0.3, 0.225, 0.145], [0.22, 0.165, 0.105], 0.93], [[0.25, 0.21, 0.11], [0.16, 0.15, 0.075], 0.45, 0.95], [[0.2, 0.155, 0.12], [0.12, 0.095, 0.08], 0.86], [[0.15, 0.13, 0.085], [0.1, 0.09, 0.06]], [[0.6, 0.5, 0.36], [0.48, 0.4, 0.29], 0.95], { color: [0.075, 0.075, 0.08], rough: 0.8, amount: 1, lines: 1 });
const withRoad = (base, road, extra = {}) => { const p = JSON.parse(JSON.stringify(base)); p.layers.road = road; for (const k in extra) p.layers[k] = { ...p.layers[k], ...extra[k] }; return p; };

const PALETTES = {
  hadean: L([[0.045, 0.04, 0.037], [0.075, 0.062, 0.054], 0.72], [[0.11, 0.1, 0.095], [0.16, 0.145, 0.13], 0.3, 0.96], [[0.07, 0.06, 0.055], [0.13, 0.095, 0.075], 0.68], [[0.1, 0.065, 0.045], [0.15, 0.09, 0.055], 0.8], [[0.03, 0.025, 0.022], [0.05, 0.04, 0.034], 0.55], null, { emissive: { color: [1.0, 0.16, 0.015], amount: 1.4, cracks: 1 } }),
  archean: L([[0.06, 0.068, 0.058], [0.095, 0.1, 0.082], 0.8], [[0.085, 0.075, 0.03], [0.12, 0.1, 0.04], 0.32, 0.9], [[0.1, 0.095, 0.085], [0.16, 0.14, 0.12], 0.74], [[0.11, 0.095, 0.075], [0.15, 0.12, 0.09], 0.82], [[0.19, 0.16, 0.11], [0.25, 0.21, 0.14], 0.6], null, { wet: 0.3, emissive: { color: [1.0, 0.25, 0.04], amount: 0.35, cracks: 1 } }),
  protero: L([[0.22, 0.085, 0.04], [0.3, 0.12, 0.055], 0.9], [[0.11, 0.085, 0.04], [0.15, 0.11, 0.05], 0.22, 0.92], [[0.26, 0.11, 0.065], [0.17, 0.095, 0.075], 0.82], [[0.2, 0.09, 0.055], [0.27, 0.13, 0.08], 0.88], [[0.38, 0.28, 0.19], [0.46, 0.35, 0.24], 0.8], null, { wet: 0.12 }),
  snowball: L([[0.56, 0.6, 0.67], [0.66, 0.7, 0.77], 0.55], [[0.6, 0.64, 0.7], [0.68, 0.72, 0.78], 0, 0.55], [[0.22, 0.25, 0.29], [0.36, 0.4, 0.46], 0.6], [[0.7, 0.73, 0.8], [0.76, 0.79, 0.85], 0.5], [[0.28, 0.4, 0.52], [0.4, 0.52, 0.63], 0.12], null, { snow: { color: [0.68, 0.72, 0.78], line: -60, amount: 1 } }),
  cambrian: L([[0.22, 0.18, 0.13], [0.3, 0.25, 0.18], 0.9], [[0.06, 0.07, 0.03], [0.09, 0.09, 0.04], 0.18, 0.9], [[0.26, 0.22, 0.18], [0.36, 0.3, 0.24], 0.84], [[0.24, 0.2, 0.16], [0.3, 0.25, 0.19], 0.9], [[0.45, 0.4, 0.3], [0.52, 0.46, 0.35], 0.7], null, { wet: 0.2 }),
  devonian: L([[0.12, 0.11, 0.06], [0.16, 0.14, 0.08], 0.9], [[0.05, 0.08, 0.02], [0.08, 0.1, 0.03], 0.6, 0.92], [[0.2, 0.18, 0.14], [0.28, 0.25, 0.2], 0.84], [[0.1, 0.1, 0.05], [0.14, 0.13, 0.07], 0.9], [[0.2, 0.17, 0.11], [0.26, 0.22, 0.15], 0.75], null, { wet: 0.35 }),
  carbon: L([[0.05, 0.045, 0.025], [0.07, 0.06, 0.03], 0.86], [[0.03, 0.06, 0.015], [0.05, 0.08, 0.02], 0.9, 0.9], [[0.1, 0.11, 0.08], [0.15, 0.15, 0.11], 0.8], [[0.035, 0.055, 0.02], [0.05, 0.07, 0.03], 0.9], [[0.08, 0.07, 0.045], [0.11, 0.09, 0.06], 0.5], null, { wet: 0.6 }),
  permian: L([[0.45, 0.18, 0.08], [0.55, 0.24, 0.1], 0.95], [[0.25, 0.16, 0.07], [0.3, 0.2, 0.09], 0.08, 0.96], [[0.38, 0.15, 0.08], [0.5, 0.22, 0.12], 0.86], [[0.36, 0.16, 0.08], [0.44, 0.2, 0.1], 0.92], [[0.62, 0.55, 0.48], [0.7, 0.63, 0.55], 0.8]),
  triassic: L([[0.4, 0.22, 0.12], [0.48, 0.28, 0.15], 0.94], [[0.14, 0.13, 0.05], [0.2, 0.17, 0.07], 0.3, 0.95], [[0.36, 0.2, 0.12], [0.46, 0.27, 0.16], 0.86], [[0.2, 0.15, 0.08], [0.28, 0.2, 0.1], 0.92], [[0.55, 0.42, 0.3], [0.62, 0.5, 0.36], 0.88], null, { wet: 0.05 }),
  jurassic: L([[0.05, 0.05, 0.025], [0.08, 0.07, 0.035], 0.88], [[0.035, 0.06, 0.02], [0.06, 0.08, 0.025], 0.8, 0.92], [[0.12, 0.12, 0.09], [0.18, 0.17, 0.13], 0.82], [[0.04, 0.06, 0.025], [0.065, 0.075, 0.03], 0.9], [[0.13, 0.11, 0.08], [0.18, 0.15, 0.1], 0.55], null, { wet: 0.35 }),
  dino: L([[0.045, 0.042, 0.022], [0.07, 0.06, 0.03], 0.88], [[0.03, 0.055, 0.017], [0.055, 0.075, 0.025], 0.7, 0.92], [[0.11, 0.12, 0.09], [0.17, 0.17, 0.13], 0.82], [[0.035, 0.05, 0.022], [0.06, 0.07, 0.03], 0.9], [[0.12, 0.105, 0.075], [0.17, 0.15, 0.1], 0.55], null, { wet: 0.4 }),
  paleo: L([[0.04, 0.045, 0.02], [0.065, 0.065, 0.03], 0.88], [[0.025, 0.06, 0.015], [0.045, 0.08, 0.02], 0.95, 0.92], [[0.1, 0.11, 0.08], [0.16, 0.16, 0.12], 0.82], [[0.03, 0.06, 0.02], [0.05, 0.075, 0.028], 0.9], [[0.1, 0.09, 0.06], [0.15, 0.13, 0.09], 0.55], null, { wet: 0.45 }),
  miocene: L([[0.32, 0.24, 0.12], [0.26, 0.2, 0.1], 0.94], [[0.42, 0.33, 0.14], [0.36, 0.29, 0.12], 0.85, 0.96], [[0.3, 0.25, 0.19], [0.42, 0.35, 0.27], 0.86], [[0.18, 0.16, 0.08], [0.24, 0.2, 0.1], 0.92], [[0.5, 0.42, 0.3], [0.58, 0.5, 0.38], 0.9]),
  iceage: L([[0.22, 0.2, 0.15], [0.28, 0.26, 0.2], 0.9], [[0.2, 0.19, 0.12], [0.15, 0.15, 0.09], 0.7, 0.95], [[0.22, 0.22, 0.22], [0.32, 0.32, 0.31], 0.84], [[0.48, 0.51, 0.56], [0.56, 0.59, 0.64], 0.7], [[0.35, 0.33, 0.28], [0.42, 0.4, 0.34], 0.85], null, { wet: 0.1, snow: { color: [0.7, 0.73, 0.78], line: 140, amount: 0.9 } }),
  native: withRoad(FRONTIER, { amount: 0, lines: 0 }, { grass: { amount: 0.75 } }),
  mission: withRoad(FRONTIER, { color: [0.24, 0.18, 0.115], rough: 0.97, amount: 0.3, lines: 0 }, { grass: { amount: 0.7 } }),
  1849: withRoad(FRONTIER, { color: [0.23, 0.17, 0.11], rough: 0.97, amount: 0.36, lines: 0 }, { wash: { color: [0.36, 0.3, 0.22], color2: [0.44, 0.37, 0.27] } }),
  1885: FRONTIER,
  1900: withRoad(FRONTIER, { color: [0.2, 0.17, 0.13], rough: 0.95, amount: 0.55, lines: 0 }),
  1920: withRoad(TODAY, { color: [0.12, 0.11, 0.1], rough: 0.9, amount: 0.8, lines: 0 }, { grass: { amount: 0.55 } }),
  1940: withRoad(TODAY, { color: [0.095, 0.092, 0.09], rough: 0.86, amount: 0.92, lines: 1 }, { grass: { amount: 0.5 } }),
  1950: withRoad(TODAY, { color: [0.085, 0.084, 0.086], rough: 0.84, amount: 1, lines: 1 }),
  1970: withRoad(TODAY, { color: [0.08, 0.08, 0.083], rough: 0.82, amount: 1, lines: 1 }),
  1990: TODAY,
  2000: TODAY,
  2026: TODAY,
  2050: withRoad(TODAY, { color: [0.06, 0.062, 0.068], rough: 0.76, amount: 1, lines: 1 }, { grass: { amount: 0.38 } }),
  2080: L([[0.36, 0.27, 0.17], [0.27, 0.2, 0.125], 0.94], [[0.32, 0.26, 0.13], [0.24, 0.2, 0.1], 0.3, 0.96], null, null, [[0.66, 0.56, 0.42], [0.54, 0.45, 0.33], 0.95], { color: [0.05, 0.052, 0.058], rough: 0.72, amount: 1, lines: 1 }),
  2150: L([[0.24, 0.21, 0.13], [0.2, 0.17, 0.11], 0.92], [[0.13, 0.17, 0.07], [0.1, 0.14, 0.06], 0.6, 0.94], [[0.22, 0.19, 0.15], [0.3, 0.26, 0.2], 0.86], [[0.1, 0.12, 0.06], [0.14, 0.15, 0.08], 0.92], [[0.55, 0.5, 0.4], [0.48, 0.43, 0.34], 0.9], { color: [0.035, 0.04, 0.048], rough: 0.55, amount: 1, lines: 1 }),
  2300: L([[0.14, 0.15, 0.1], [0.18, 0.18, 0.12], 0.9], [[0.07, 0.12, 0.06], [0.1, 0.15, 0.08], 0.7, 0.92], [[0.24, 0.24, 0.25], [0.32, 0.32, 0.34], 0.8], [[0.08, 0.11, 0.06], [0.11, 0.13, 0.08], 0.9], [[0.4, 0.42, 0.44], [0.48, 0.5, 0.52], 0.6], { color: [0.025, 0.028, 0.036], rough: 0.32, amount: 1, lines: 0 }),
  ruins: L([[0.11, 0.12, 0.055], [0.17, 0.16, 0.075], 0.9], [[0.085, 0.14, 0.04], [0.15, 0.18, 0.065], 0.92, 0.92], [[0.19, 0.2, 0.15], [0.28, 0.27, 0.21], 0.85], [[0.06, 0.09, 0.035], [0.1, 0.12, 0.05], 0.92], [[0.13, 0.13, 0.085], [0.19, 0.18, 0.12], 0.7], { color: [0.15, 0.15, 0.14], rough: 0.92, amount: 0.62, lines: 0 }, { wet: 0.18 }),
  3000: L([[0.06, 0.07, 0.03], [0.09, 0.1, 0.045], 0.9], [[0.045, 0.1, 0.025], [0.08, 0.13, 0.04], 0.95, 0.92], [[0.16, 0.17, 0.13], [0.24, 0.24, 0.19], 0.85], [[0.045, 0.08, 0.03], [0.07, 0.1, 0.04], 0.92], [[0.12, 0.12, 0.08], [0.17, 0.16, 0.11], 0.7], { color: [0.11, 0.12, 0.09], rough: 0.95, amount: 0.22, lines: 0 }, { wet: 0.22 }),
  scifi: L([[0.09, 0.12, 0.075], [0.13, 0.15, 0.095], 0.88], [[0.055, 0.11, 0.08], [0.09, 0.15, 0.11], 0.7, 0.9], [[0.24, 0.24, 0.26], [0.33, 0.33, 0.35], 0.78], [[0.075, 0.1, 0.065], [0.11, 0.13, 0.09], 0.9], [[0.36, 0.38, 0.41], [0.44, 0.46, 0.5], 0.5], { color: [0.018, 0.02, 0.028], rough: 0.22, amount: 1, lines: 0 }, { wet: 0.1 }),
  glacial: L([[0.6, 0.64, 0.7], [0.68, 0.72, 0.78], 0.55], [[0.6, 0.64, 0.7], [0.66, 0.7, 0.76], 0, 0.55], [[0.26, 0.28, 0.32], [0.38, 0.41, 0.46], 0.62], [[0.72, 0.75, 0.81], [0.78, 0.8, 0.86], 0.5], [[0.32, 0.44, 0.56], [0.44, 0.55, 0.66], 0.14], null, { snow: { color: [0.68, 0.72, 0.78], line: -60, amount: 1 } }),
  distant: L([[0.12, 0.08, 0.12], [0.16, 0.1, 0.15], 0.9], [[0.085, 0.04, 0.12], [0.12, 0.06, 0.15], 0.8, 0.9], [[0.2, 0.2, 0.24], [0.28, 0.27, 0.32], 0.8], [[0.1, 0.06, 0.12], [0.14, 0.09, 0.15], 0.9], [[0.3, 0.32, 0.36], [0.38, 0.4, 0.44], 0.6], null, { wet: 0.2 }),
  pangaea: L([[0.6, 0.32, 0.14], [0.7, 0.4, 0.18], 0.95], [[0.4, 0.25, 0.1], [0.46, 0.3, 0.12], 0.05, 0.96], [[0.45, 0.2, 0.1], [0.56, 0.27, 0.13], 0.88], [[0.5, 0.24, 0.12], [0.58, 0.3, 0.14], 0.92], [[0.75, 0.72, 0.66], [0.8, 0.77, 0.7], 0.7]),
  dying: L([[0.15, 0.11, 0.08], [0.21, 0.15, 0.1], 0.95], [[0.15, 0.11, 0.08], [0.18, 0.13, 0.09], 0, 0.95], [[0.08, 0.065, 0.06], [0.13, 0.1, 0.085], 0.86], [[0.18, 0.13, 0.09], [0.22, 0.16, 0.11], 0.92], [[0.6, 0.57, 0.52], [0.52, 0.5, 0.46], 0.6], null, { emissive: { color: [1.0, 0.35, 0.08], amount: 0.18, cracks: 1 } }),
};

const SKY = {
  ...SKY_ERAS,
  archean: { turbidity: 8, rayleigh: 0.5, mie: 0.02, mieG: 0.84, clouds: 0.45, cloudDensity: 0.6, cloudElevation: 0.45, tint: [1.6, 1.05, 0.55], gain: 0.85, stars: 0.8, sunTint: [1, 0.8, 0.6], sunGain: 0.75, moonGain: 1.8, haze: [0.65, 0.45, 0.25], hazeMix: 0.75, fogDist: 2600, fogHeight: 700, fogMax: 0.95, exposure: 1.15, ambient: 1.2, envGround: [0.6, 0.45, 0.3] },
  protero: { turbidity: 3.2, rayleigh: 1.4, mie: 0.006, clouds: 0.35, cloudDensity: 0.35, tint: [0.98, 1.0, 1.05], sunTint: [1, 0.95, 0.88], sunGain: 0.9, haze: [0.7, 0.6, 0.5], hazeMix: 0.3, fogDist: 4200, exposure: 1.05, envGround: [0.9, 0.5, 0.35] },
  snowball: { turbidity: 1.8, rayleigh: 1.3, mie: 0.003, clouds: 0.25, cloudDensity: 0.3, tint: [0.95, 1.0, 1.08], sunTint: [1, 0.98, 0.96], sunGain: 0.8, haze: [0.72, 0.8, 0.92], hazeMix: 0.45, fogDist: 4500, exposure: 0.56, envGround: [1.2, 1.3, 1.5] },
  cambrian: { turbidity: 2.4, rayleigh: 1.3, mie: 0.004, clouds: 0.3, tint: [1, 1, 1.03], sunTint: [1, 0.97, 0.9], haze: [0.7, 0.7, 0.65], hazeMix: 0.25, fogDist: 5000, envGround: [1.0, 0.85, 0.65] },
  devonian: { turbidity: 3.6, rayleigh: 1.4, mie: 0.007, clouds: 0.45, cloudDensity: 0.4, tint: [0.98, 1.02, 1.0], haze: [0.62, 0.7, 0.66], hazeMix: 0.35, fogDist: 3600, exposure: 1.05, ambient: 1.1, envGround: [0.6, 0.7, 0.45] },
  carbon: { turbidity: 7, rayleigh: 1.4, mie: 0.016, mieG: 0.85, clouds: 0.65, cloudDensity: 0.6, cloudElevation: 0.45, tint: [0.88, 1.02, 0.9], gain: 0.92, sunTint: [1, 0.92, 0.78], sunGain: 0.75, haze: [0.42, 0.52, 0.4], hazeMix: 0.72, fogDist: 1050, fogHeight: 320, fogMax: 0.965, exposure: 1.2, ambient: 1.3, envGround: [0.4, 0.6, 0.35] },
  permian: { turbidity: 6.5, rayleigh: 0.9, mie: 0.012, mieG: 0.84, clouds: 0.08, cloudDensity: 0.25, tint: [1.12, 0.96, 0.82], sunTint: [1, 0.92, 0.8], sunGain: 1.05, haze: [0.85, 0.6, 0.42], hazeMix: 0.55, fogDist: 3000, fogHeight: 600, exposure: 0.95, envGround: [1.3, 0.75, 0.5] },
  triassic: { turbidity: 5, rayleigh: 1.0, mie: 0.009, clouds: 0.15, tint: [1.06, 0.98, 0.88], sunTint: [1, 0.94, 0.84], haze: [0.8, 0.64, 0.48], hazeMix: 0.45, fogDist: 3600, envGround: [1.15, 0.8, 0.55] },
  jurassic: { turbidity: 4.4, rayleigh: 1.55, mie: 0.008, mieG: 0.82, clouds: 0.42, cloudDensity: 0.4, tint: [0.97, 1.02, 0.99], sunTint: [1, 0.96, 0.88], haze: [0.62, 0.72, 0.68], hazeMix: 0.4, fogDist: 3000, fogHeight: 750, fogMax: 0.94, exposure: 1.05, ambient: 1.12, envGround: [0.55, 0.75, 0.45] },
  paleo: { turbidity: 5.6, rayleigh: 1.6, mie: 0.01, mieG: 0.82, clouds: 0.55, cloudDensity: 0.5, tint: [0.96, 1.02, 0.97], sunTint: [1, 0.95, 0.85], haze: [0.6, 0.7, 0.62], hazeMix: 0.5, fogDist: 2400, fogHeight: 650, fogMax: 0.94, exposure: 1.08, ambient: 1.18, envGround: [0.5, 0.75, 0.42] },
  miocene: { turbidity: 3.6, rayleigh: 1.2, mie: 0.006, clouds: 0.18, cloudDensity: 0.3, tint: [1.03, 1.0, 0.94], sunTint: [1, 0.96, 0.88], haze: [0.8, 0.74, 0.6], hazeMix: 0.3, fogDist: 4800, envGround: [1.15, 1.0, 0.7] },
  iceage: { turbidity: 2.0, rayleigh: 1.3, mie: 0.004, clouds: 0.4, cloudDensity: 0.45, tint: [0.96, 1.0, 1.06], sunTint: [1, 0.97, 0.94], sunGain: 0.9, haze: [0.75, 0.8, 0.88], hazeMix: 0.35, fogDist: 4200, exposure: 0.7, envGround: [1.0, 1.05, 1.15] },
  native: { turbidity: 2.2, rayleigh: 1.25, mie: 0.004, clouds: 0.25, cloudDensity: 0.3, sunTint: [1, 0.97, 0.92], haze: [0.7, 0.74, 0.75], hazeMix: 0.15, fogDist: 6000, envGround: [0.9, 0.95, 0.7] },
  mission: { turbidity: 2.8, rayleigh: 1.2, mie: 0.005, clouds: 0.2, cloudDensity: 0.3, tint: [1.03, 1.0, 0.95], sunTint: [1, 0.96, 0.88], haze: [0.8, 0.74, 0.62], hazeMix: 0.25, fogDist: 5200, envGround: [1.1, 0.98, 0.75] },
  1849: SKY_ERAS['1885'],
  1900: { ...SKY_ERAS['1885'], turbidity: 3.6, haze: [0.75, 0.7, 0.62], hazeMix: 0.3, fogDist: 4600 },
  1920: { turbidity: 3.8, rayleigh: 1.15, mie: 0.006, clouds: 0.22, tint: [1.02, 1.0, 0.96], sunTint: [1, 0.96, 0.9], haze: [0.74, 0.68, 0.58], hazeMix: 0.32, fogDist: 4500 },
  1940: { turbidity: 4.2, rayleigh: 1.15, mie: 0.007, clouds: 0.24, tint: [1.02, 0.99, 0.95], sunTint: [1, 0.95, 0.88], haze: [0.7, 0.62, 0.5], hazeMix: 0.36, fogDist: 4300 },
  1950: { turbidity: 4.6, rayleigh: 1.1, mie: 0.008, clouds: 0.2, tint: [1.03, 0.99, 0.94], sunTint: [1, 0.94, 0.86], haze: [0.72, 0.6, 0.45], hazeMix: 0.45, fogDist: 4200 },
  1970: { turbidity: 5, rayleigh: 1.05, mie: 0.009, clouds: 0.2, tint: [1.04, 0.98, 0.92], sunTint: [1, 0.92, 0.8], haze: [0.72, 0.58, 0.42], hazeMix: 0.5, fogDist: 3800 },
  1990: { turbidity: 4, rayleigh: 1.15, mie: 0.007, clouds: 0.25, tint: [1.02, 0.99, 0.96], sunTint: [1, 0.95, 0.88], haze: [0.72, 0.66, 0.55], hazeMix: 0.35, fogDist: 4600 },
  2000: { turbidity: 3.1, mie: 0.005, haze: [0.7, 0.7, 0.68], hazeMix: 0.18, fogDist: 5000 },
  2050: { turbidity: 2.8, rayleigh: 1.3, mie: 0.005, clouds: 0.28, tint: [1.0, 0.99, 1.01], sunTint: [1, 0.97, 0.95], fogDist: 5400, exposure: 1.08, ambient: 1.2 },
  2150: { turbidity: 2.2, rayleigh: 1.3, mie: 0.004, clouds: 0.3, tint: [0.98, 1.0, 1.03], haze: [0.6, 0.7, 0.85], hazeMix: 0.2, fogDist: 6500, exposure: 1.1, ambient: 1.3 },
  2300: { turbidity: 1.9, rayleigh: 1.1, mie: 0.003, mieG: 0.78, clouds: 0.18, cloudDensity: 0.25, tint: [0.95, 0.99, 1.06], stars: 1.8, haze: [0.58, 0.68, 0.88], hazeMix: 0.25, fogDist: 7000, exposure: 1.05, ambient: 1.25, envGround: [0.75, 0.8, 0.9] },
  3000: { turbidity: 2.4, rayleigh: 1.35, mie: 0.005, clouds: 0.35, cloudDensity: 0.38, haze: [0.62, 0.72, 0.72], hazeMix: 0.3, fogDist: 4600, ambient: 1.2, envGround: [0.55, 0.72, 0.5] },
  glacial: { turbidity: 1.7, rayleigh: 1.2, mie: 0.003, clouds: 0.3, cloudDensity: 0.35, tint: [0.94, 0.99, 1.08], stars: 1.4, sunTint: [1, 0.98, 0.96], sunGain: 0.8, haze: [0.72, 0.8, 0.92], hazeMix: 0.45, fogDist: 4500, exposure: 0.58, envGround: [1.2, 1.3, 1.5] },
  distant: { turbidity: 3, rayleigh: 1.1, mie: 0.006, clouds: 0.3, tint: [1.02, 0.95, 1.08], stars: 1.6, sunTint: [1, 0.92, 0.96], haze: [0.66, 0.56, 0.78], hazeMix: 0.4, fogDist: 4000, envGround: [0.7, 0.55, 0.8] },
  pangaea: { turbidity: 8, rayleigh: 0.8, mie: 0.016, mieG: 0.86, clouds: 0.03, cloudDensity: 0.2, tint: [1.18, 0.98, 0.78], sunTint: [1, 0.9, 0.75], sunGain: 1.15, haze: [0.86, 0.56, 0.34], hazeMix: 0.7, fogDist: 2800, fogHeight: 500, exposure: 0.8, envGround: [1.3, 0.75, 0.48] },
  dying: { turbidity: 12, rayleigh: 0.45, mie: 0.03, mieG: 0.9, clouds: 0, cloudDensity: 0.1, tint: [1.3, 0.95, 0.7], gain: 1.1, stars: 0.3, sunTint: [1, 0.82, 0.62], sunGain: 1.3, haze: [0.82, 0.52, 0.3], hazeMix: 0.65, fogDist: 3600, fogHeight: 420, fogMax: 0.94, exposure: 0.6, envGround: [1.2, 0.8, 0.55] },
};

const WATER = {
  hadean: null, archean: [[0.02, 0.05, 0.03], [0.09, 0.12, 0.06], 0.45], protero: [[0.015, 0.04, 0.05], [0.07, 0.1, 0.08], 0.3], cambrian: [[0.01, 0.045, 0.06], [0.05, 0.11, 0.1], 0.2], devonian: [[0.015, 0.04, 0.04], [0.06, 0.09, 0.06], 0.3],
  carbon: [[0.02, 0.035, 0.02], [0.06, 0.07, 0.035], 0.55], triassic: [[0.02, 0.045, 0.05], [0.08, 0.09, 0.07], 0.3], jurassic: [[0.01, 0.04, 0.035], [0.05, 0.09, 0.05], 0.18], dino: [[0.01, 0.04, 0.035], [0.05, 0.09, 0.05], 0.15],
  paleo: [[0.01, 0.04, 0.03], [0.05, 0.09, 0.05], 0.2], miocene: [[0.02, 0.045, 0.05], [0.07, 0.08, 0.06], 0.25], iceage: [[0.01, 0.03, 0.045], [0.04, 0.07, 0.08], 0.1], native: [[0.02, 0.045, 0.05], [0.07, 0.08, 0.06], 0.2],
  mission: [[0.02, 0.045, 0.05], [0.07, 0.08, 0.06], 0.25], 1849: [[0.03, 0.045, 0.04], [0.09, 0.085, 0.06], 0.45], 1885: [[0.02, 0.045, 0.05], [0.07, 0.08, 0.06], 0.25], ruins: [[0.015, 0.035, 0.025], [0.05, 0.07, 0.035], 0.4],
  3000: [[0.012, 0.035, 0.03], [0.05, 0.08, 0.05], 0.3], scifi: [[0.005, 0.02, 0.04], [0.02, 0.05, 0.08], 0], 2300: [[0.005, 0.025, 0.045], [0.02, 0.06, 0.08], 0], distant: [[0.02, 0.015, 0.045], [0.07, 0.05, 0.1], 0.1],
};

const FLUIDS = {
  hadean: [{ kind: 'lava', region: 'lake', fill: 0.85 }], archean: [{ kind: 'water', region: 'lake', fill: 2 }], protero: [{ kind: 'water', region: 'lake', fill: 1.8 }], cambrian: [{ kind: 'water', region: 'lake', fill: 2 }],
  devonian: [{ kind: 'water', region: 'lake', fill: 1.9 }], carbon: [{ kind: 'water', region: 'lake', fill: 2 }], triassic: [{ kind: 'water', region: 'lake', fill: 0.9 }], jurassic: [{ kind: 'water', region: 'lake', fill: 1.9 }],
  dino: [{ kind: 'water', region: 'lake', fill: 2 }], paleo: [{ kind: 'water', region: 'lake', fill: 2 }], miocene: [{ kind: 'water', region: 'lake', fill: 1.1 }], iceage: [{ kind: 'water', region: 'lake', fill: 1.6 }],
  native: [{ kind: 'water', region: 'lake', fill: 1.4 }], mission: [{ kind: 'water', region: 'lake', fill: 1.25 }], 1849: [{ kind: 'water', region: 'lake', fill: 1.2 }], 1885: [{ kind: 'water', region: 'lake', fill: 1.2 }],
  1900: [{ kind: 'water', region: 'lake', fill: 0.9 }], 1920: [{ kind: 'water', region: 'lake', fill: 0.5 }], ruins: [{ kind: 'water', region: 'lake', fill: 0.55 }], 3000: [{ kind: 'water', region: 'lake', fill: 1.5 }],
  scifi: [{ kind: 'water', region: 'lake', fill: 1.6 }], 2300: [{ kind: 'water', region: 'lake', fill: 1.5 }], distant: [{ kind: 'water', region: 'lake', fill: 1.7 }],
};

const FLORA_LIB = {
  hadean: { leaf: [1, 1, 1], bark: [1, 1, 1], rock: [0.11, 0.095, 0.09], moss: 0, lava: 3.5, wind: 0.2 },
  archean: { leaf: [1, 1, 1], bark: [1, 1, 1], rock: [0.26, 0.25, 0.21], moss: 0.35, lava: 0.6, wind: 0.6 },
  protero: { leaf: [1, 1, 1], bark: [1, 1, 1], rock: [0.42, 0.24, 0.17], moss: 0.15, lava: 0, wind: 0.7 },
  snowball: { leaf: [1, 1, 1], bark: [1, 1, 1], rock: [0.55, 0.62, 0.72], moss: 0, lava: 0, wind: 1.2 },
  cambrian: { leaf: [1, 1, 1], bark: [1, 1, 1], rock: [0.48, 0.42, 0.35], moss: 0.2, lava: 0, wind: 0.8 },
  devonian: { leaf: [0.85, 1.0, 0.75], bark: [0.85, 0.82, 0.75], rock: [0.44, 0.42, 0.37], moss: 0.6, lava: 0, wind: 0.6 },
  carbon: { leaf: [0.72, 1.0, 0.7], bark: [0.8, 0.82, 0.72], rock: [0.36, 0.38, 0.34], moss: 0.9, lava: 0, wind: 0.35 },
  permian: { leaf: [0.95, 0.92, 0.7], bark: [1.05, 0.9, 0.8], rock: [0.62, 0.32, 0.2], moss: 0, lava: 0, wind: 1.0 },
  triassic: { leaf: [0.92, 0.95, 0.72], bark: [1, 0.92, 0.82], rock: [0.58, 0.38, 0.26], moss: 0.05, lava: 0, wind: 0.9 },
  jurassic: { leaf: [0.8, 1.05, 0.78], bark: [0.9, 0.85, 0.8], rock: [0.42, 0.42, 0.38], moss: 0.6, lava: 0, wind: 0.6 },
  dino: { leaf: [0.82, 1.05, 0.8], bark: [0.9, 0.85, 0.8], rock: [0.42, 0.42, 0.38], moss: 0.75, lava: 0, wind: 0.6 },
  paleo: { leaf: [0.78, 1.08, 0.74], bark: [0.88, 0.84, 0.78], rock: [0.4, 0.41, 0.36], moss: 0.85, lava: 0, wind: 0.55 },
  miocene: { leaf: [1.06, 1.0, 0.78], bark: [1, 1, 1], rock: [0.55, 0.5, 0.42], moss: 0.05, lava: 0, wind: 1.0 },
  iceage: { leaf: [0.85, 0.95, 0.88], bark: [0.9, 0.9, 0.9], rock: [0.5, 0.5, 0.5], moss: 0.2, lava: 0, wind: 1.1 },
  native: { leaf: [0.98, 1.02, 0.86], bark: [1, 1, 1], rock: [0.52, 0.47, 0.4], moss: 0.15, lava: 0, wind: 0.8 },
  1885: { leaf: [1.05, 1.0, 0.82], bark: [1, 1, 1], rock: [0.55, 0.49, 0.41], moss: 0.05, lava: 0, wind: 0.9 },
  2026: { leaf: [1, 1, 0.9], bark: [1, 1, 1], rock: [0.52, 0.47, 0.41], moss: 0.05, lava: 0, wind: 0.9 },
  2080: { leaf: [1.08, 1.0, 0.8], bark: [1, 1, 1], rock: [0.56, 0.5, 0.42], moss: 0, lava: 0, wind: 1 },
  2150: { leaf: [0.95, 1.02, 0.88], bark: [1, 1, 1], rock: [0.52, 0.48, 0.42], moss: 0.1, lava: 0, wind: 0.85 },
  ruins: { leaf: [0.85, 1.05, 0.78], bark: [0.85, 0.85, 0.8], rock: [0.4, 0.4, 0.35], moss: 0.85, lava: 0, wind: 0.8 },
  3000: { leaf: [0.82, 1.05, 0.76], bark: [0.86, 0.86, 0.8], rock: [0.4, 0.41, 0.36], moss: 0.95, lava: 0, wind: 0.7 },
  scifi: { leaf: [0.8, 1.0, 0.95], bark: [0.9, 0.9, 0.9], rock: [0.45, 0.45, 0.46], moss: 0.3, lava: 0, wind: 0.5 },
  glacial: { leaf: [0.8, 0.9, 0.86], bark: [0.9, 0.9, 0.92], rock: [0.5, 0.55, 0.62], moss: 0, lava: 0, wind: 1.2 },
  distant: { leaf: [0.95, 0.55, 1.15], bark: [0.7, 0.62, 0.8], rock: [0.42, 0.4, 0.48], moss: 0.5, lava: 0, wind: 0.6 },
  pangaea: { leaf: [1.05, 0.9, 0.65], bark: [1.05, 0.92, 0.8], rock: [0.66, 0.36, 0.2], moss: 0, lava: 0, wind: 1.2 },
  dying: { leaf: [1, 1, 1], bark: [1, 1, 1], rock: [0.24, 0.21, 0.19], moss: 0, lava: 0, wind: 1.0 },
};
for (const [id, src] of [['mission', 'native'], ['1849', '1885'], ['1900', '1885'], ['1920', '2026'], ['1940', '2026'], ['1950', '2026'], ['1970', '2026'], ['1990', '2026'], ['2000', '2026'], ['2050', '2026'], ['2300', 'scifi']]) FLORA_LIB[id] = FLORA_LIB[src];

const WEAR = {
  hadean: [0, 0, 0, 0, 0], native: [0.2, 0.1, 0.35, 0, 0.3], mission: [0.1, 0.25, 0.4, 0.05, 0.35], 1849: [0, 0.35, 0.45, 0.2, 0.4], 1885: [0, 0.25, 0.35, 0.15, 0.5],
  1900: [0, 0.3, 0.3, 0.15, 0.55], 1920: [0, 0.3, 0.2, 0.15, 0.55], 1940: [0, 0.3, 0.15, 0.15, 0.6], 1950: [0, 0.25, 0.1, 0.1, 0.6], 1970: [0, 0.3, 0.1, 0.12, 0.6], 1990: [0, 0.25, 0.08, 0.1, 0.6],
  2000: [0, 0.2, 0.05, 0.1, 0.6], 2026: [0, 0.2, 0.05, 0.1, 0.6], 2050: [0, 0.12, 0.03, 0.05, 0.65], 2080: [0, 0.08, 0.02, 0, 0.7], 2150: [0.1, 0.05, 0, 0, 0.75], 2300: [0, 0, 0, 0, 0.8],
  ruins: [0.85, 0.75, 0, 0.9, 0], 3000: [1, 0.85, 0, 1, 0], scifi: [0, 0, 0, 0, 0.8], glacial: [0, 0.4, 0, 0.5, 0],
};

const CLIMATE = {
  cal: (s) => ({ summer: { clear: 0.6, clouds: 0.2, dust: 0.12, fog: 0.03, storm: 0.05 }, autumn: { clear: 0.45, clouds: 0.22, overcast: 0.1, fog: 0.1, rain: 0.08, dust: 0.05 }, winter: { clear: 0.25, clouds: 0.18, overcast: 0.15, fog: 0.15, rain: 0.15, storm: 0.05, snow: 0.07 }, spring: { clear: 0.45, clouds: 0.25, overcast: 0.1, rain: 0.12, storm: 0.05, fog: 0.03 } }[s]),
  green: (s) => ({ summer: { clear: 0.55, clouds: 0.25, fog: 0.06, rain: 0.06, storm: 0.08 }, autumn: { clear: 0.42, clouds: 0.25, overcast: 0.12, fog: 0.11, rain: 0.1 }, winter: { clear: 0.25, clouds: 0.18, overcast: 0.17, fog: 0.15, rain: 0.17, storm: 0.04, snow: 0.04 }, spring: { clear: 0.45, clouds: 0.27, overcast: 0.1, rain: 0.12, storm: 0.03, fog: 0.03 } }[s]),
  tropic: (s) => (s === 'summer' || s === 'autumn' ? { clear: 0.36, clouds: 0.3, overcast: 0.1, fog: 0.07, rain: 0.1, storm: 0.07 } : { clear: 0.2, clouds: 0.25, overcast: 0.15, fog: 0.12, rain: 0.17, storm: 0.11 }),
  hadean: () => ({ clear: 0.45, ash: 0.35, storm: 0.2 }),
  barren: () => ({ clear: 0.38, clouds: 0.24, overcast: 0.1, fog: 0.1, rain: 0.1, storm: 0.08 }),
  rusty: () => ({ clear: 0.45, clouds: 0.22, overcast: 0.08, dust: 0.15, rain: 0.06, storm: 0.04 }),
  frozen: () => ({ clear: 0.35, clouds: 0.15, overcast: 0.15, fog: 0.1, snow: 0.25 }),
  swamp: () => ({ clear: 0.12, clouds: 0.2, overcast: 0.2, fog: 0.25, rain: 0.15, storm: 0.08 }),
  desert: () => ({ clear: 0.6, clouds: 0.12, dust: 0.22, storm: 0.06 }),
  steppe: (s) => (s === 'winter' ? { clear: 0.25, clouds: 0.1, overcast: 0.2, fog: 0.1, snow: 0.35 } : s === 'summer' ? { clear: 0.5, clouds: 0.3, overcast: 0.1, rain: 0.06, fog: 0.04 } : { clear: 0.35, clouds: 0.22, overcast: 0.15, fog: 0.1, rain: 0.08, snow: 0.1 }),
  rewild: (s) => ({ summer: { clear: 0.45, clouds: 0.3, fog: 0.08, rain: 0.08, storm: 0.09 }, autumn: { clear: 0.35, clouds: 0.25, overcast: 0.14, fog: 0.14, rain: 0.12 }, winter: { clear: 0.2, clouds: 0.18, overcast: 0.18, fog: 0.16, rain: 0.2, storm: 0.04, snow: 0.04 }, spring: { clear: 0.38, clouds: 0.28, overcast: 0.1, rain: 0.17, storm: 0.04, fog: 0.03 } }[s]),
  alien: () => ({ clear: 0.4, clouds: 0.25, fog: 0.15, rain: 0.1, storm: 0.1 }),
  scorch: () => ({ clear: 0.72, dust: 0.28 }),
};
const KINDS = { cal: ['clear', 'clouds', 'overcast', 'fog', 'rain', 'storm', 'snow', 'dust'], green: ['clear', 'clouds', 'overcast', 'fog', 'rain', 'storm', 'snow', 'dust'], rewild: ['clear', 'clouds', 'overcast', 'fog', 'rain', 'storm', 'snow'], tropic: ['clear', 'clouds', 'overcast', 'fog', 'rain', 'storm'], hadean: ['clear', 'ash', 'storm'], barren: ['clear', 'clouds', 'overcast', 'fog', 'rain', 'storm', 'dust'], rusty: ['clear', 'clouds', 'overcast', 'fog', 'rain', 'storm', 'dust'], frozen: ['clear', 'clouds', 'overcast', 'fog', 'snow'], swamp: ['clear', 'clouds', 'overcast', 'fog', 'rain', 'storm'], desert: ['clear', 'clouds', 'dust', 'storm'], steppe: ['clear', 'clouds', 'overcast', 'fog', 'rain', 'snow'], alien: ['clear', 'clouds', 'overcast', 'fog', 'rain', 'storm'], scorch: ['clear', 'dust'] };

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const along = (y, y0, y1) => (y - y0) / (y1 - y0);

const DEF = {
  hadean: { age: 'deep', climate: 'hadean', ambient: 'amb_hadean', town: 'hadean', volcanoes: 4, skyfx: { moon: 3.4, plumes: true, meteors: 0.5 }, seasonless: true },
  archean: { age: 'deep', climate: 'barren', ambient: 'amb_shore', town: 'vents', volcanoes: 3, skyfx: { moon: 2.4, plumes: true, meteors: 0.12, moonTint: [1.1, 0.95, 0.8] }, seasonless: true },
  protero: { age: 'deep', climate: 'rusty', ambient: 'amb_shore', town: 'none', skyfx: { moon: 1.4, meteors: 0.04 }, seasonless: true },
  snowball: { age: 'deep', climate: 'frozen', ambient: 'amb_wind', town: 'ice', skyfx: { meteors: 0.03 }, seasonless: true },
  cambrian: { age: 'deep', climate: 'barren', ambient: 'amb_shore', town: 'none', skyfx: { meteors: 0.02 }, seasonless: true },
  devonian: { age: 'deep', climate: 'barren', ambient: 'amb_shore', town: 'none', skyfx: {}, seasonless: true },
  carbon: { age: 'deep', climate: 'swamp', ambient: 'amb_swamp', town: 'none', skyfx: {}, seasonless: true },
  permian: { age: 'deep', climate: 'desert', ambient: 'amb_desert', town: 'none', skyfx: {}, seasonless: true },
  triassic: { age: 'deep', climate: 'desert', ambient: 'amb_desert', town: 'none', skyfx: {}, seasonless: true },
  jurassic: { age: 'deep', climate: 'tropic', ambient: 'amb_dino', town: 'none', skyfx: {}, wetSeason: true },
  dino: { age: 'deep', climate: 'tropic', ambient: 'amb_dino', town: 'none', skyfx: { herd: true }, wetSeason: true },
  paleo: { age: 'deep', climate: 'tropic', ambient: 'amb_dino', town: 'none', skyfx: {}, wetSeason: true },
  miocene: { age: 'deep', climate: 'cal', ambient: 'amb_savanna', town: 'none', green: 0.9, skyfx: {} },
  iceage: { age: 'deep', climate: 'steppe', ambient: 'amb_wind', town: 'none', green: 0.35, skyfx: {}, cold: 0.6 },
  native: { age: 'early', climate: 'green', ambient: 'amb_native', town: 'village', green: 1, skyfx: {} },
  mission: { age: 'early', climate: 'cal', ambient: 'amb_1885', town: 'mission', green: 0.9, skyfx: {} },
  1849: { age: 'early', climate: 'cal', ambient: 'amb_1885', town: 'camp', green: 0.85, skyfx: {} },
  1885: { age: 'human', climate: 'cal', ambient: 'amb_1885', town: 'frontier', green: 0.85, skyfx: {} },
  1900: { age: 'human', climate: 'cal', ambient: 'amb_1885', town: 'early', green: 0.85, skyfx: {} },
  1920: { age: 'human', climate: 'cal', ambient: 'amb_1885', town: 'early', green: 0.85, skyfx: {} },
  1940: { age: 'human', climate: 'cal', ambient: 'amb_2026', town: 'early', green: 0.85, skyfx: {} },
  1950: { age: 'human', climate: 'cal', ambient: 'amb_2026', town: 'mid', green: 0.85, skyfx: {} },
  1970: { age: 'human', climate: 'cal', ambient: 'amb_2026', town: 'mid', green: 0.85, skyfx: {} },
  1990: { age: 'human', climate: 'cal', ambient: 'amb_2026', town: 'mid', green: 0.85, skyfx: {} },
  2000: { age: 'human', climate: 'cal', ambient: 'amb_2026', town: 'modern', green: 0.85, skyfx: {} },
  2026: { age: 'human', climate: 'cal', ambient: 'amb_2026', town: 'modern', green: 0.85, skyfx: {} },
  2050: { age: 'human', climate: 'cal', ambient: 'amb_2080', town: 'future', green: 0.75, skyfx: {} },
  2080: { age: 'human', climate: 'cal', ambient: 'amb_2080', town: 'future', green: 0.7, skyfx: {} },
  2150: { age: 'human', climate: 'green', ambient: 'amb_2080', town: 'sky', green: 0.85, skyfx: { tether: 'build' } },
  2300: { age: 'human', climate: 'green', ambient: 'amb_scifi', town: 'space', green: 0.65, skyfx: { tether: true, station: true, meteors: 0.03 } },
  ruins: { age: 'post', climate: 'rewild', ambient: 'amb_ruins', town: 'ruins', green: 0.35, skyfx: {} },
  3000: { age: 'post', climate: 'rewild', ambient: 'amb_native', town: 'rewild', green: 0.5, skyfx: {} },
  scifi: { age: 'human', climate: 'cal', ambient: 'amb_scifi', town: 'scifi', green: 0.5, skyfx: { ring: true, tether: true, station: true, meteors: 0.04 } },
  glacial: { age: 'far', climate: 'frozen', ambient: 'amb_wind', town: 'buried', skyfx: { ring: 'broken', meteors: 0.03 }, seasonless: true },
  distant: { age: 'far', climate: 'alien', ambient: 'amb_alien', town: 'crystal', skyfx: { ring: 'debris', meteors: 0.05, moon: 0.9 }, seasonless: true },
  pangaea: { age: 'far', climate: 'desert', ambient: 'amb_desert', town: 'none', skyfx: { moon: 0.7 }, seasonless: true },
  dying: { age: 'far', climate: 'scorch', ambient: 'amb_desert', town: 'none', skyfx: { sun: 1.9, moon: 0.6 }, seasonless: true },
};


function city(id, y) {
  switch (id) {
    case '1849': return { style: 'frontier', density: lerp(0.05, 0.15, along(y, 1848, 1860)), height: 8 };
    case '1885': return { style: 'frontier', density: lerp(0.15, 0.35, along(y, 1860, 1900)), height: lerp(10, 24, along(y, 1860, 1900)) };
    case '1900': return { style: 'early', density: lerp(0.3, 0.45, along(y, 1900, 1920)), height: lerp(40, 90, along(y, 1900, 1920)) };
    case '1920': return { style: 'early', density: lerp(0.5, 0.62, along(y, 1920, 1940)), height: y < 1930 ? lerp(90, 240, along(y, 1920, 1930)) : 380 };
    case '1940': return { style: 'early', density: lerp(0.62, 0.7, along(y, 1940, 1950)), height: 380 };
    case '1950': return { style: 'mid', density: lerp(0.72, 0.8, along(y, 1950, 1962)), height: 390 };
    case '1970': return { style: 'mid', density: lerp(0.8, 0.88, along(y, 1962, 1980)), height: lerp(390, 420, along(y, 1962, 1974)) };
    case '1990': return { style: 'mid', density: lerp(0.88, 0.95, along(y, 1980, 2000)), height: 420 };
    case '2000': return { style: 'modern', density: lerp(0.95, 1, along(y, 2000, 2020)), height: lerp(420, 540, along(y, 2000, 2015)) };
    case '2026': return { style: 'modern', density: 1, height: lerp(540, 600, along(y, 2020, 2040)) };
    case '2050': return { style: 'modern', density: 1, height: lerp(600, 700, along(y, 2040, 2065)) };
    case '2080': return { style: 'future', density: lerp(0.8, 1, along(y, 2065, 2120)), height: lerp(700, 900, along(y, 2065, 2120)) };
    case '2150': return { style: 'future', density: 1, height: lerp(900, 1200, along(y, 2120, 2250)) };
    case '2300': return { style: 'future', density: 0.9, height: 1500 };
    case 'ruins': return { style: 'ruins', density: lerp(0.85, 0.6, along(y, 2500, 2900)), height: lerp(380, 220, along(y, 2500, 2900)) };
    case '3000': return { style: 'ruins', density: lerp(0.45, 0, along(Math.log10(y), Math.log10(2900), Math.log10(10000))), height: lerp(150, 0, along(Math.log10(y), Math.log10(2900), Math.log10(10000))) };
    case 'scifi': return { style: 'scifi', density: 0.6, height: 1200 };
    default: return { style: 'none', density: 0, height: 0 };
  }
}

const SPECIAL = { 1849: { gold: true }, native: { natural: true } };

export function periodInfo(id) {
  const D = DEF[id] ? id : '2026';
  const d = DEF[D];
  const natural = d.age === 'deep' || d.age === 'far' || id === 'native';
  return {
    id: D, ...d, natural, loop: ['2026', '2000', '1990', '2050', '2080', '2150', '2300', 'ruins', 'scifi'].includes(D), tracks: !natural || id === 'native',
    sky: SKY[D] || {}, palette: PALETTES[D] || PALETTES[2026], fluids: FLUIDS[D] || [], water: WATER[D] || WATER.dino,
    floraLib: FLORA_LIB[D] || FLORA_LIB[2026], wear: WEAR[D] || [0, 0, 0, 0, 0.5], lights: d.age === 'human' || d.age === 'early' ? 1 : 0,
    climate: d.climate, kinds: KINDS[d.climate], music: 'music_' + D, special: SPECIAL[D] || {},
  };
}

export function climateTable(id, season) { const P = periodInfo(id); return { ...CLIMATE[P.climate](season) }; }

export function cityFor(id, year) { const c = city(id, year); return { ...c, density: Math.round(c.density * 100) / 100, height: Math.round(c.height), year }; }

export function detailKey(id, year) {
  const P = DEF[id] || {};
  if (P.age === 'deep' || P.age === 'far') { const s = eraOf(year); return id + ':' + s.label; }
  if (id === 'native') return id + ':' + (year < -3000 ? 'camp' : 'village');
  if (id === 'mission') return id + ':' + (year < 1834 ? 'm' : 'r');
  if (id === '3000') return id + ':' + Math.floor(Math.log2(Math.max(1, year - 2800)));
  return id + ':' + Math.floor(year / 5);
}

export { PALETTES, SKY, FLUIDS };
