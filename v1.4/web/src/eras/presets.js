// Roadster 88 era presets: chronological order, terrain palettes (valley.setPalette), fluids and terrain deltas, ambient keys and per-era content knobs for flora, props and structures.
import { SKY_ERAS } from '../render/sky.js';

export const ERA_IDS = ['hadean', 'dino', '1885', '2026', '2080', 'ruins', 'scifi'];
export const ERA_INDEX = Object.fromEntries(ERA_IDS.map((id, i) => [id, i]));

export const PALETTES = {
  hadean: {
    layers: {
      floor: { color: [0.045, 0.04, 0.037], color2: [0.075, 0.062, 0.054], rough: 0.72 },
      grass: { color: [0.11, 0.1, 0.095], color2: [0.16, 0.145, 0.13], rough: 0.96, amount: 0.3 },
      rock: { color: [0.07, 0.06, 0.055], color2: [0.13, 0.095, 0.075], rough: 0.68 },
      high: { color: [0.1, 0.065, 0.045], color2: [0.15, 0.09, 0.055], rough: 0.8 },
      wash: { color: [0.03, 0.025, 0.022], color2: [0.05, 0.04, 0.034], rough: 0.55 },
      road: { amount: 0, lines: 0 },
    },
    wet: 0,
    emissive: { color: [1.0, 0.16, 0.015], amount: 1.4, cracks: 1 },
    snow: { amount: 0 },
  },
  dino: {
    layers: {
      floor: { color: [0.045, 0.042, 0.022], color2: [0.07, 0.06, 0.03], rough: 0.88 },
      grass: { color: [0.03, 0.055, 0.017], color2: [0.055, 0.075, 0.025], rough: 0.92, amount: 0.7 },
      rock: { color: [0.11, 0.12, 0.09], color2: [0.17, 0.17, 0.13], rough: 0.82 },
      high: { color: [0.035, 0.05, 0.022], color2: [0.06, 0.07, 0.03], rough: 0.9 },
      wash: { color: [0.12, 0.105, 0.075], color2: [0.17, 0.15, 0.1], rough: 0.55 },
      road: { amount: 0, lines: 0 },
    },
    wet: 0.4,
    emissive: { amount: 0 },
    snow: { amount: 0 },
  },
  1885: {
    layers: {
      floor: { color: [0.34, 0.26, 0.14], color2: [0.44, 0.35, 0.19], rough: 0.95 },
      grass: { color: [0.42, 0.32, 0.14], color2: [0.3, 0.25, 0.11], rough: 0.96, amount: 0.62 },
      rock: { color: [0.36, 0.3, 0.23], color2: [0.5, 0.42, 0.32], rough: 0.86 },
      high: { color: [0.13, 0.13, 0.075], color2: [0.23, 0.2, 0.11], rough: 0.92 },
      wash: { color: [0.52, 0.45, 0.34], color2: [0.6, 0.53, 0.42], rough: 0.9 },
      road: { color: [0.22, 0.165, 0.105], rough: 0.97, amount: 0.42, lines: 0 },
    },
    wet: 0,
    emissive: { amount: 0 },
    snow: { amount: 0 },
  },
  2026: {
    layers: {
      floor: { color: [0.3, 0.225, 0.145], color2: [0.22, 0.165, 0.105], rough: 0.93 },
      grass: { color: [0.25, 0.21, 0.11], color2: [0.16, 0.15, 0.075], rough: 0.95, amount: 0.45 },
      rock: { color: [0.2, 0.155, 0.12], color2: [0.12, 0.095, 0.08], rough: 0.86 },
      high: { color: [0.15, 0.13, 0.085], color2: [0.1, 0.09, 0.06], rough: 0.92 },
      wash: { color: [0.6, 0.5, 0.36], color2: [0.48, 0.4, 0.29], rough: 0.95 },
      road: { color: [0.075, 0.075, 0.08], rough: 0.8, amount: 1, lines: 1 },
    },
    wet: 0,
    emissive: { amount: 0 },
    snow: { amount: 0 },
  },
  2080: {
    layers: {
      floor: { color: [0.36, 0.27, 0.17], color2: [0.27, 0.2, 0.125], rough: 0.94 },
      grass: { color: [0.32, 0.26, 0.13], color2: [0.24, 0.2, 0.1], rough: 0.96, amount: 0.3 },
      wash: { color: [0.66, 0.56, 0.42], color2: [0.54, 0.45, 0.33], rough: 0.95 },
      road: { color: [0.05, 0.052, 0.058], rough: 0.72, amount: 1, lines: 1 },
    },
    wet: 0,
    emissive: { amount: 0 },
    snow: { amount: 0 },
  },
  ruins: {
    layers: {
      floor: { color: [0.11, 0.12, 0.055], color2: [0.17, 0.16, 0.075], rough: 0.9 },
      grass: { color: [0.085, 0.14, 0.04], color2: [0.15, 0.18, 0.065], rough: 0.92, amount: 0.92 },
      rock: { color: [0.19, 0.2, 0.15], color2: [0.28, 0.27, 0.21], rough: 0.85 },
      high: { color: [0.06, 0.09, 0.035], color2: [0.1, 0.12, 0.05], rough: 0.92 },
      wash: { color: [0.13, 0.13, 0.085], color2: [0.19, 0.18, 0.12], rough: 0.7 },
      road: { color: [0.15, 0.15, 0.14], rough: 0.92, amount: 0.62, lines: 0 },
    },
    wet: 0.18,
    emissive: { amount: 0 },
    snow: { amount: 0 },
  },
  scifi: {
    layers: {
      floor: { color: [0.09, 0.12, 0.075], color2: [0.13, 0.15, 0.095], rough: 0.88 },
      grass: { color: [0.055, 0.11, 0.08], color2: [0.09, 0.15, 0.11], rough: 0.9, amount: 0.7 },
      rock: { color: [0.24, 0.24, 0.26], color2: [0.33, 0.33, 0.35], rough: 0.78 },
      high: { color: [0.075, 0.1, 0.065], color2: [0.11, 0.13, 0.09], rough: 0.9 },
      wash: { color: [0.36, 0.38, 0.41], color2: [0.44, 0.46, 0.5], rough: 0.5 },
      road: { color: [0.018, 0.02, 0.028], rough: 0.22, amount: 1, lines: 0 },
    },
    wet: 0.1,
    emissive: { amount: 0 },
    snow: { amount: 0 },
  },
};

export const FLUIDS = {
  hadean: [{ kind: 'lava', region: 'lake', fill: 0.85 }],
  dino: [{ kind: 'water', region: 'lake', fill: 2 }],
  1885: [{ kind: 'water', region: 'lake', fill: 1.2 }],
  2026: [],
  2080: [],
  ruins: [{ kind: 'water', region: 'lake', fill: 0.55 }],
  scifi: [{ kind: 'water', region: 'lake', fill: 1.6 }],
};

export const AMBIENT = { hadean: 'amb_hadean', dino: 'amb_dino', 1885: 'amb_1885', 2026: 'amb_2026', 2080: 'amb_2080', ruins: 'amb_ruins', scifi: 'amb_scifi' };

export const ERA_INFO = {
  hadean: { sky: SKY_ERAS.hadean, volcanoes: 4, flora: ['basalt', 'basaltSmall', 'lavaRock', 'vent'], age: 0 },
  dino: { sky: SKY_ERAS.dino, flora: ['conifer', 'cycad', 'treefern', 'magnolia', 'fern', 'horsetail', 'mossRock', 'boulder'], age: 0 },
  1885: { sky: SKY_ERAS['1885'], flora: ['oak', 'cottonwood', 'sage', 'dryGrass', 'rock', 'boulder', 'reed'], age: 0.35 },
  2026: { sky: SKY_ERAS['2026'], flora: ['oak', 'palm', 'eucalyptus', 'sage', 'dryGrass', 'rock', 'boulder', 'oleander'], age: 0.15 },
  2080: { sky: SKY_ERAS['2080'], flora: ['oak', 'palm', 'sage', 'dryGrass', 'rock', 'boulder'], age: 0.1 },
  ruins: { sky: SKY_ERAS.ruins, flora: ['forestOak', 'conifer', 'shrub', 'tallGrass', 'mossRock', 'boulder', 'reed', 'deadTree'], age: 1 },
  scifi: { sky: SKY_ERAS.scifi, flora: ['oak', 'conifer', 'meadow', 'rock', 'boulder'], age: 0 },
};
