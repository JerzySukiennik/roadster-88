// Roadster 88 flora plans: which plants and rocks grow in every period and where (shores, washes, groves, slopes, lakebeds), built from small plan factories, with details that change with the year inside a period (first land plants in the Ordovician, Archaeopteris forests in the late Devonian, flowering plants spreading through the Cretaceous), plus the wild sets for the real Earth (biomes by climate zone in human and future times, the period's own flora in deep time, kept below the tree line and off snow, ice and water).
import { F } from './land.js';
import { hash2i } from './lib.js';

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const GROVE = { s: 70, lo: 0.44, hi: 0.66, base: 0.1, boost: 1.7 }, THICKET = { s: 38, lo: 0.36, hi: 0.6, base: 0.3, boost: 1.35 };

const clearGround = (g, roadLimit = 0.04) => (g.road > roadLimit || (g.flag & (F.TOWN | F.KEEP)) || g.blocked || g.wet < 0.3 ? 0 : 1);
const wild = (g, roadLimit = 0.55) => (g.road > roadLimit || g.flag & F.KEEP || g.blocked || g.wet < 0.3 ? 0 : 1);
const lakeBed = (g) => (g.flag & F.LAKE ? 1 : 0);
const shoreBand = (g, a, b) => (g.shore > a && g.shore < b ? 1 : 0);
const flat = (g, m) => (g.slope < m ? 1 : 0);

const oak = (o = {}) => ({ sp: o.sp || 'oak', seed: o.seed || 'oak', density: o.d ?? 2.2, near: 180, far: 2300, scale: [0.72, 1.4], clump: GROVE, tint: o.tint, w: (g) => (o.wild ? wild(g) : clearGround(g)) * (0.15 + 0.85 * smooth(o.lo ?? 0.35, o.hi ?? 0.55, g.n1)) * flat(g, o.slope ?? 0.32) * (g.h < (o.maxH ?? 260) ? 1 : 0) * (1 - lakeBed(g)) * (o.keep === undefined || hash2i(Math.round(g.x), Math.round(g.z), 2080) < o.keep ? 1 : 0) });
const conifer = (o = {}) => ({ sp: o.sp || 'conifer', seed: o.seed || 'conifer', density: o.d ?? 3, near: 190, far: 2300, scale: o.scale || [0.72, 1.4], clump: GROVE, tint: o.tint, w: (g) => (o.wild ? wild(g) : clearGround(g)) * (0.12 + 0.88 * smooth(o.lo ?? 0.38, o.hi ?? 0.58, g.n1)) * flat(g, o.slope ?? 0.55) * (g.h > (o.minH ?? -99) ? 1 : 0) * (g.h < (o.maxH ?? 380) ? 1 : 0.3) * (1 - lakeBed(g)) });
const shoreTree = (sp, d, o = {}) => ({ sp, seed: o.seed || sp + 'Shore', density: d, near: 180, far: o.far ?? 2000, scale: o.scale || [0.72, 1.4], clump: o.clump, tint: o.tint, w: (g) => (o.wild ? wild(g) : clearGround(g)) * Math.max(g.flag & F.WASH ? o.wash ?? 0.7 : 0, shoreBand(g, o.s0 ?? 1, o.s1 ?? 14), o.base ?? 0) * flat(g, 0.45) });
const groveTree = (sp, d, o = {}) => ({ sp, seed: o.seed || sp + 'Grove', density: d, near: o.near ?? 180, far: o.far ?? 2000, scale: o.scale || [0.72, 1.4], clump: GROVE, tint: o.tint, w: (g) => (o.wild ? wild(g) : clearGround(g)) * ((o.base ?? 0.2) + (1 - (o.base ?? 0.2)) * smooth(o.lo ?? 0.3, o.hi ?? 0.5, g.n1)) * flat(g, o.slope ?? 0.4) * (g.h < (o.maxH ?? 400) ? 1 : 0.2) * (o.lake ? 1 : 1 - lakeBed(g)) * (o.nearWater ? Math.max(shoreBand(g, 0, o.nearWater), g.flag & F.WASH ? 1 : 0, o.away ?? 0.25) : 1) });
const dead = (d, seed = 'dead') => ({ sp: 'deadTree', seed, density: d, near: 170, far: 1400, scale: [0.7, 1.2], w: (g) => clearGround(g) * flat(g, 0.4) * (1 - lakeBed(g)) });
const bushes = (sp, d, o = {}) => ({ sp, seed: o.seed || sp, density: d, near: 260, scale: o.scale || [0.7, 1.4], clump: THICKET, tint: o.tint, w: (g) => (o.wild ? wild(g, 0.85) : clearGround(g, 0.3)) * (1 - lakeBed(g) * (o.lake ?? 1)) * (0.25 + smooth(0.06, 0.3, g.slope)) * (0.4 + 0.6 * g.n2) * (o.water ? Math.max(shoreBand(g, 0, o.water), g.flag & F.WASH ? 1 : 0) : 1) });
const ground = (sp, d, o = {}) => ({ sp, seed: o.seed || sp + 'G', density: d, near: o.near ?? 90, ground: true, scale: o.scale || [0.7, 1.3], tint: o.tint, w: (g) => (o.wild ? wild(g, 0.9) : clearGround(g, 0.5)) * (1 - lakeBed(g) * (o.lake ?? 0.7)) * (o.lo !== undefined ? smooth(o.lo, o.hi, g.n2) : 0.35 + 0.65 * g.n2) * (o.flatOnly ? 1 - smooth(0.3, 0.6, g.slope) : 1) * (o.water ? Math.max(shoreBand(g, 0, o.water), g.flag & F.WASH ? 0.8 : 0, o.dry ?? 0) : 1) * (o.patch ? smooth(o.patch, o.patch + 0.15, g.n1) : 1) });
const reeds = (sp = 'reed', d = 220, o = {}) => ({ sp, seed: o.seed || sp + 'R', density: d, near: 130, ground: true, scale: o.scale || [0.8, 1.3], tint: o.tint, w: (g) => (g.depth > (o.d0 ?? -0.35) && g.depth < (o.d1 ?? 1.3) ? 1 : 0) });
const cactus = (d, seed = 'cact') => ({ sp: 'cactus', seed, density: d, near: 200, scale: [0.7, 1.35], clump: THICKET, w: (g) => clearGround(g, 0.2) * (1 - lakeBed(g)) * (g.shore > 25 ? 1 : 0) * smooth(0.45, 0.7, g.n2) * flat(g, 0.45) * (g.h < 320 ? 1 : 0.2) });
const rocks = (d = 12, o = {}) => ({ sp: 'rock', seed: o.seed || 'rocks', density: d, near: 160, scale: o.scale || [0.3, 1.2], tint: o.tint, squash: o.squash, w: (g) => (o.any ? (g.road > 0.6 ? 0 : 1) : clearGround(g)) * (0.15 + g.slope * 2.5) });
const boulders = (d = 0.8, o = {}) => ({ sp: 'boulder', seed: o.seed || 'boulders', density: d, near: 220, far: 1500, scale: o.scale || [1.5, 4.5], tint: o.tint, squash: o.squash, w: (g) => (o.any ? (g.road > 0.6 ? 0 : 1) * (g.flag & F.KEEP ? 0 : 1) : clearGround(g, 0.1)) * (g.flag & (F.CANYON | F.MASSIF | F.MESA) ? 1 : (o.base ?? 0.25) + g.slope) });
const stromatolites = (d, o = {}) => ({ sp: 'stromatolite', seed: o.seed || 'strom', density: d, near: 200, far: 900, scale: o.scale || [0.6, 2.2], squash: 0.45, tint: o.tint, w: (g) => (g.depth > -1.4 && g.depth < (o.deep ?? 2.6) ? 1 : g.flag & F.WASH ? 0.35 : 0) * (0.3 + 0.7 * smooth(0.3, 0.6, g.n2)) });
const meadow = (sp, d, o = {}) => ({ sp, seed: o.seed || sp + 'M', density: d, near: o.near ?? 95, ground: true, scale: o.scale || [0.8, 1.3], tint: o.tint, w: (g) => clearGround(g, 0.5) * (1 - lakeBed(g)) * smooth(o.lo ?? 0.5, o.hi ?? 0.68, g.n1) * smooth(0.3, 0.6, g.n2) * flat(g, 0.35) });

const B85 = () => [oak(), shoreTree('cottonwood', 7, { seed: 'cotton' }), dead(0.12, 'dead85'), cactus(3, 'cact85'), bushes('sage', 34), ground('dryGrass', 380, { seed: 'dgrass', scale: [0.55, 1.0] }), reeds(), rocks(), boulders()];
const B26 = () => [dead(0.1, 'dead26'), oak(), cactus(2.5, 'cact26'), bushes('sage', 30), ground('dryGrass', 330, { seed: 'dgrass', lake: 1 }), rocks(), boulders()];

const SETS = {
  hadean: () => [boulders(2.6, { seed: 'basaltB', any: true, base: 0.35, scale: [1.6, 5.5] }), { sp: 'rock', seed: 'basaltR', density: 70, near: 170, scale: [0.25, 1.1], w: (g) => (g.wet < 0.3 ? 0 : 0.5 + g.n2 * 0.5) }],
  archean: () => [stromatolites(55), rocks(45, { any: true }), boulders(1.4, { any: true, base: 0.3 })],
  protero: () => [stromatolites(40, { tint: [0.9, 0.95, 0.85] }), rocks(38, { any: true }), boulders(1.6, { any: true, base: 0.35 }), ground('moss', 160, { water: 10, lake: 1, wild: true, tint: [0.7, 0.6, 0.45] })],
  snowball: () => [boulders(1.8, { any: true, base: 0.4, squash: 1.6, scale: [1.4, 4.2] }), rocks(30, { any: true, squash: 1.3 })],
  cambrian: (y) => [stromatolites(18), rocks(30, { any: true }), boulders(1.1, { any: true }), ...(y >= -470000000 ? [ground('moss', 260, { water: 16, wild: true, tint: [0.9, 1, 0.8] })] : [])],
  devonian: (y) => [
    ground('moss', 420, { water: 40, dry: 0.15, wild: true }), reeds('horsetail', y >= -419000000 ? 200 : 90, { d1: 0.8 }),
    groveTree('prototax', y < -360000000 ? 1.4 : 0, { wild: true, base: 0.25, far: 1600 }),
    ...(y >= -419000000 ? [ground('fern', 260, { water: 30, dry: 0.3, wild: true, scale: [0.6, 1.2] })] : []),
    ...(y >= -385000000 ? [groveTree('archaeop', 5, { wild: true, nearWater: 40, far: 2300 })] : []),
    rocks(14, { any: true }), boulders(0.9, { any: true }),
  ],
  carbon: () => [
    groveTree('lepido', 12, { wild: true, nearWater: 80, away: 0.5, lake: true, far: 2600, lo: 0.2, hi: 0.42 }), shoreTree('calamites', 22, { wild: true, s0: 0, s1: 18, wash: 1, base: 0.12, far: 1800 }),
    groveTree('treefern', 14, { wild: true, near: 160, far: 900, base: 0.4 }), ground('fern', 760, { wild: true, flatOnly: true, scale: [0.9, 1.8] }), reeds('horsetail', 260, { d0: -0.6, d1: 1.0 }),
    ground('moss', 240, { wild: true, water: 30, dry: 0.4 }), rocks(6), boulders(0.4),
  ],
  permian: () => [groveTree('conifer', 1.4, { nearWater: 30, away: 0.08, scale: [0.6, 1.1], seed: 'walchia' }), groveTree('cycad', 6, { nearWater: 40, away: 0.1 }), reeds('horsetail', 90), ground('fern', 90, { water: 20, scale: [0.6, 1.1] }), rocks(30, { any: true }), boulders(1.6, { any: true, base: 0.4 })],
  triassic: () => [conifer({ d: 2.2, seed: 'tconifer', lo: 0.45, hi: 0.65 }), groveTree('cycad', 14, { base: 0.25 }), shoreTree('treefern', 6, { s1: 20 }), reeds('horsetail', 160), ground('fern', 260, { water: 40, dry: 0.15 }), rocks(18), boulders(1.1)],
  jurassic: () => [conifer({ d: 6, seed: 'jconifer', scale: [0.8, 1.6] }), groveTree('ginkgo', 2.5, { far: 2300 }), groveTree('cycad', 20, { base: 0.3 }), shoreTree('treefern', 10, { s1: 22, base: 0.15, far: 900 }), ground('fern', 620, { flatOnly: true, scale: [0.9, 1.8] }), reeds('horsetail', 170), rocks(14), boulders(0.8)],
  dino: (y) => [
    conifer({ d: 6, seed: 'dconifer' }), groveTree('magnolia', y >= -100000000 ? 5 : 1.8, { seed: 'dmag', base: 0.35, slope: 0.35, far: 1900 }), shoreTree('treefern', 9, { seed: 'dtf', wash: 1, s1: 14, base: 0.15, far: 900 }),
    groveTree('cycad', 22, { seed: 'dcy', base: 0.25, slope: 0.3 }), ground('fern', 650, { seed: 'dfern', flatOnly: true, scale: [0.9, 1.8] }), reeds('horsetail', 160, { d1: 0.9 }), rocks(14, { seed: 'drock' }), boulders(),
    ...(y < -125000000 ? [groveTree('ginkgo', 1.5)] : []),
  ],
  paleo: () => [groveTree('palm', 4, { seed: 'ppalm', far: 2300, nearWater: 80, away: 0.4 }), groveTree('magnolia', 5, { seed: 'pmag', far: 1900 }), conifer({ d: 2, seed: 'pcon', lo: 0.55, hi: 0.7 }), shoreTree('treefern', 6, { s1: 16, far: 900 }), groveTree('cycad', 8), ground('fern', 520, { flatOnly: true, scale: [0.9, 1.6] }), reeds('reed', 200), rocks(10), boulders(0.7)],
  miocene: () => [oak({ d: 1.1, seed: 'moak', lo: 0.45, hi: 0.62 }), shoreTree('cottonwood', 5, { seed: 'mcotton' }), bushes('shrub', 14, { seed: 'mshrub' }), ground('dryGrass', 520, { seed: 'mgrass', scale: [0.7, 1.25] }), meadow('flowers', 120), reeds(), rocks(12), boulders(0.8)],
  iceage: () => [conifer({ d: 4.5, seed: 'iconifer', lo: 0.4, hi: 0.6, minH: 20, maxH: 500 }), dead(0.25, 'idead'), bushes('shrub', 22, { seed: 'ishrub', tint: [0.8, 0.85, 0.8] }), ground('tundra', 520, { scale: [0.8, 1.4] }), ground('dryGrass', 140, { seed: 'igrass' }), reeds('reed', 120), rocks(16), boulders(1.6, { base: 0.4 })],
  native: () => [oak({ d: 3.2, seed: 'noak', lo: 0.3 }), shoreTree('cottonwood', 9, { seed: 'ncotton', s1: 18 }), bushes('sage', 30), ground('dryGrass', 420, { seed: 'ngrass', scale: [0.6, 1.1] }), meadow('flowers', 220, { lo: 0.42 }), reeds('reed', 300, { d0: -0.5, d1: 1.5 }), rocks(), boulders()],
  mission: () => [oak({ d: 2.0, seed: 'moak', lo: 0.38 }), shoreTree('cottonwood', 7, { seed: 'cotton' }), bushes('sage', 30), ground('dryGrass', 380, { seed: 'dgrass', scale: [0.55, 1.0] }), meadow('flowers', 260, { lo: 0.4, tint: [1.12, 1.06, 0.55] }), cactus(2, 'mcact'), reeds(), rocks(), boulders()],
  1849: () => [oak({ d: 1.7, seed: 'goak' }), shoreTree('cottonwood', 4, { seed: 'cotton' }), dead(0.35, 'gdead'), cactus(2.5, 'gcact'), bushes('sage', 30), ground('dryGrass', 360, { seed: 'dgrass', scale: [0.55, 1.0] }), reeds(), rocks(14), boulders()],
  1885: B85,
  1900: () => [oak({ d: 1.9 }), shoreTree('cottonwood', 6, { seed: 'cotton' }), dead(0.12, 'dead00'), cactus(2.6, 'cact00'), bushes('sage', 30), ground('dryGrass', 360, { seed: 'dgrass', scale: [0.55, 1.0] }), reeds(), rocks(), boulders()],
  1920: () => [dead(0.12, 'dead20'), oak({ d: 1.9 }), cactus(2.5, 'cact20'), bushes('sage', 30), ground('dryGrass', 340, { seed: 'dgrass' }), reeds('reed', 120), rocks(), boulders()],
  1940: B26, 1950: B26, 1970: B26, 1990: B26, 2000: B26, 2026: B26,
  2050: () => [dead(0.2, 'dead50'), oak({ keep: 0.9 }), cactus(3, 'cact50'), bushes('sage', 26), ground('dryGrass', 290, { seed: 'dgrass', lake: 1 }), rocks(), boulders()],
  2080: () => [dead(0.3, 'dead80'), oak({ keep: 0.8 }), cactus(4, 'cact80'), bushes('sage', 22, { scale: [0.7, 1.3] }), ground('dryGrass', 240, { seed: 'dgrass', lake: 1, scale: [0.6, 1.1] }), rocks(), boulders()],
  2150: () => [oak({ d: 2.8, seed: 'soak' }), conifer({ d: 0.8, seed: 'scon', lo: 0.62, hi: 0.74 }), bushes('sage', 22), ground('grass', 300, { seed: 'sgrass' }), meadow('flowers', 160), reeds('reed', 120, { d1: 1.0 }), rocks(10), boulders()],
  2300: () => [oak({ d: 2.4, seed: 'soak', lo: 0.45, hi: 0.6 }), conifer({ d: 1.6, seed: 'scon', lo: 0.6, hi: 0.72 }), ground('grass', 300, { seed: 'sgrass' }), meadow('flowers', 120), reeds('reed', 120, { d0: -0.3, d1: 1.0 }), rocks(8), boulders()],
  ruins: () => [
    oak({ d: 5, seed: 'roak', wild: true, lo: 0.3, hi: 0.5, slope: 0.45, maxH: 999 }), conifer({ d: 2.2, seed: 'rcon', wild: true, lo: 0.55, hi: 0.7 }), { ...dead(0.6, 'rdead'), w: (g) => clearGround(g, 0.5) },
    shoreTree('cottonwood', 7, { seed: 'cotton', s1: 16 }), bushes('shrub', 45, { seed: 'rshrub', wild: true, scale: [0.8, 1.6] }), ground('grass', 420, { seed: 'rgrass', wild: true, scale: [0.9, 1.6] }), reeds('reed', 240, { d1: 1.5, scale: [0.8, 1.4] }), rocks(), boulders(),
  ],
  3000: () => [
    oak({ d: 6.5, seed: 'woak', wild: true, lo: 0.25, hi: 0.45, slope: 0.5, maxH: 999 }), conifer({ d: 3.4, seed: 'wcon', wild: true, lo: 0.5, hi: 0.66 }), { ...dead(0.4, 'wdead'), w: (g) => wild(g) * flat(g, 0.45) },
    shoreTree('cottonwood', 9, { seed: 'wcotton', s1: 20, wild: true }), bushes('shrub', 55, { seed: 'wshrub', wild: true, scale: [0.8, 1.7] }), ground('fern', 260, { seed: 'wfern', wild: true, scale: [0.8, 1.4] }),
    ground('grass', 380, { seed: 'wgrass', wild: true, scale: [0.9, 1.5] }), meadow('flowers', 120), reeds('reed', 260, { d1: 1.5 }), rocks(10), boulders(),
  ],
  scifi: () => [oak({ d: 2.2, seed: 'soak', lo: 0.45, hi: 0.6, slope: 0.35, maxH: 999 }), conifer({ d: 1.6, seed: 'scon', lo: 0.6, hi: 0.72 }), ground('grass', 300, { seed: 'sgrass', scale: [0.8, 1.3] }), reeds('reed', 120, { d0: -0.3, d1: 1.0, scale: [0.8, 1.2] }), rocks(8), boulders()],
  glacial: () => [conifer({ d: 0.7, seed: 'gconifer', maxH: 30, scale: [0.5, 0.9] }), dead(0.15, 'gdead'), ground('tundra', 120, { patch: 0.55 }), boulders(1.5, { any: true, base: 0.45, scale: [1.6, 5] }), rocks(26, { any: true, squash: 1.2 })],
  distant: () => [groveTree('alienTree', 4.5, { wild: true, far: 2300, lo: 0.32, hi: 0.52 }), ground('alienFern', 260, { wild: true, scale: [0.8, 1.6], near: 140 }), ground('moss', 520, { wild: true, scale: [0.9, 1.5] }), reeds('reed', 200, { d1: 1.2, tint: [0.9, 0.7, 1.1] }), rocks(14, { any: true }), boulders(1.2)],
  pangaea: () => [{ ...cactus(1.6, 'pcact'), w: (g) => clearGround(g, 0.2) * (1 - lakeBed(g)) * smooth(0.5, 0.75, g.n2) * flat(g, 0.45) }, dead(0.08, 'pdead'), ground('tundra', 70, { patch: 0.6, tint: [1.15, 0.85, 0.6] }), rocks(34, { any: true }), boulders(1.8, { any: true, base: 0.4 })],
  dying: () => [rocks(40, { any: true }), boulders(2.2, { any: true, base: 0.45 })],
};

export function plansFor(id, year) {
  const f = SETS[id] || SETS[2026];
  return f(year).filter((p) => p.density > 0);
}

export function planKey(p) { return `${p.seed}:${p.sp}:${p.density}`; }

const TALL = new Set(['oak', 'conifer', 'palm', 'magnolia', 'eucalyptus', 'cottonwood', 'treefern', 'ginkgo', 'lepido', 'calamites', 'archaeop', 'prototax', 'alienTree', 'deadTree', 'cycad', 'orange']);
const veg = (d, v) => d * (0.25 + 1.1 * v);
const BIOME = {
  tropical: (c) => {
    const t = [0.82, 1.08, 0.78];
    return [
      groveTree('palm', veg(3, c.veg), { seed: 'Tpalm', wild: true, base: 0.35, far: 2300, maxH: 1e9, tint: t }),
      groveTree('magnolia', veg(5.5, c.veg), { seed: 'Tbroad', wild: true, base: 0.3, far: 2000, slope: 0.5, maxH: 1e9, tint: t }),
      groveTree('treefern', veg(6, c.veg), { seed: 'Ttf', wild: true, base: 0.3, far: 900, slope: 0.5, maxH: 1e9, tint: t }),
      ground('fern', veg(420, c.veg), { seed: 'Tfern', wild: true, scale: [0.9, 1.8], tint: t }),
      ground('grass', veg(240, c.veg), { seed: 'Tgrass', wild: true, tint: t }),
      bushes('shrub', veg(34, c.veg), { seed: 'Tshrub', wild: true, tint: t }),
      reeds('reed', 220), rocks(8, { any: true }), boulders(0.5, { any: true }),
    ];
  },
  arid: (c) => [
    ...(c.lon < -30 ? [{ ...cactus(veg(3, c.veg), 'Acact'), w: (g) => wild(g, 0.2) * smooth(0.45, 0.7, g.n2) * flat(g, 0.45) }] : []),
    { ...dead(veg(0.12, c.veg), 'Adead'), w: (g) => wild(g) * flat(g, 0.4) },
    bushes('sage', veg(26, c.veg), { seed: 'Asage', wild: true }),
    ground('dryGrass', veg(220, c.veg), { seed: 'Agrass', wild: true, scale: [0.55, 1.0] }),
    rocks(18, { any: true }), boulders(1.2, { any: true, base: 0.35 }),
  ],
  temperate: (c) => [
    oak({ d: veg(3.2, c.veg), seed: 'Woak', wild: true, lo: 0.32, hi: 0.52, slope: 0.4, maxH: 1e9 }),
    conifer({ d: veg(1.4, c.veg), seed: 'Wcon', wild: true, lo: 0.55, hi: 0.7, maxH: 1e9 }),
    shoreTree('cottonwood', veg(5, c.veg), { seed: 'Wcotton', wild: true, s1: 18 }),
    bushes('shrub', veg(30, c.veg), { seed: 'Wshrub', wild: true }),
    ground('grass', veg(380, c.veg), { seed: 'Wgrass', wild: true, scale: [0.8, 1.4] }),
    { ...meadow('flowers', veg(110, c.veg), { seed: 'Wflower' }), w: (g) => wild(g, 0.5) * smooth(0.5, 0.68, g.n1) * smooth(0.3, 0.6, g.n2) * flat(g, 0.35) },
    reeds('reed', 200), rocks(10, { any: true }), boulders(0.8, { any: true }),
  ],
  continental: (c) => [
    conifer({ d: veg(6, c.veg), seed: 'Ccon', wild: true, lo: 0.3, hi: 0.5, slope: 0.6, maxH: 1e9, scale: [0.7, 1.5] }),
    { ...dead(veg(0.2, c.veg), 'Cdead'), w: (g) => wild(g) * flat(g, 0.45) },
    bushes('shrub', veg(22, c.veg), { seed: 'Cshrub', wild: true, tint: [0.85, 0.9, 0.85] }),
    ground('tundra', veg(300, c.veg), { seed: 'Ctundra', wild: true }),
    ground('moss', veg(260, c.veg), { seed: 'Cmoss', wild: true }),
    reeds('reed', 140), rocks(14, { any: true }), boulders(1.2, { any: true, base: 0.35 }),
  ],
  polar: (c) => [
    ...(c.ice < 0.5 ? [ground('tundra', veg(160, c.veg), { seed: 'Ptundra', wild: true, patch: 0.45 }), ground('moss', veg(140, c.veg), { seed: 'Pmoss', wild: true })] : []),
    rocks(24, { any: true, squash: 1.2 }), boulders(1.6, { any: true, base: 0.4 }),
  ],
  alpine: (c) => [
    conifer({ d: veg(2.2, c.veg), seed: 'Lcon', wild: true, lo: 0.45, hi: 0.62, slope: 0.6, maxH: 1e9, scale: [0.6, 1.2] }),
    bushes('shrub', veg(16, c.veg), { seed: 'Lshrub', wild: true, tint: [0.85, 0.92, 0.85] }),
    ground('tundra', veg(260, c.veg), { seed: 'Ltundra', wild: true }),
    { ...meadow('flowers', veg(60, c.veg), { seed: 'Lflower' }), w: (g) => wild(g, 0.5) * smooth(0.55, 0.7, g.n1) * flat(g, 0.4) },
    rocks(34, { any: true }), boulders(2.4, { any: true, base: 0.45 }),
  ],
};
const COLDER = { tropical: 'temperate', arid: 'arid', temperate: 'continental', continental: 'polar', polar: 'polar', alpine: 'alpine' };

function earthMul(sp, g, c, tree) {
  if (g.wet < 0.3) return 0;
  const rocky = sp === 'rock' || sp === 'boulder' || sp === 'stromatolite';
  if (g.surf === 'snow' || g.surf === 'ice') return rocky ? 0.6 : 0;
  if (rocky) return 1;
  if (g.ha > c.snowLine) return 0;
  if (TALL.has(sp) && g.ha > tree) return 0;
  if (g.surf === 'rock') return TALL.has(sp) ? 0.25 : 0.4;
  if (g.surf === 'sand') return sp === 'palm' || sp === 'cactus' || sp === 'dryGrass' || sp === 'reed' ? 0.8 : 0.15;
  return 1;
}

export function wildPlansFor(id, year, climate, age, cell) {
  const c = climate || { zone: 'temperate', veg: 0.5, arid: 0.3, ice: 0, snowLine: 3000, lon: 0 };
  const tree = c.snowLine - 550;
  let list;
  if ((age === 'deep' || age === 'far') && id !== 'miocene' && id !== 'iceage') list = plansFor(id, year).map((p) => ({ ...p, density: p.density * (0.6 + 0.6 * c.veg) }));
  else list = (BIOME[id === 'iceage' ? COLDER[c.zone] : c.zone] || BIOME.temperate)(c);
  return list.filter((p) => p.density > 0).map((p) => ({ ...p, density: p.density * (p.ground ? 0.7 : TALL.has(p.sp) ? 0.6 : 0.8), seed: cell + ':' + p.seed, w: (g) => { const m = earthMul(p.sp, g, c, tree); return m > 0 ? m * p.w(g) : 0; } }));
}

export function wildSpecies(id, year, age) {
  const out = new Set();
  for (const zone of Object.keys(BIOME)) for (const lon of [-100, 10]) for (const p of wildPlansFor(id, year, { zone, veg: 0.6, arid: 0.3, ice: 0, snowLine: 3000, lon, elevation: 0 }, age, 'w')) out.add(p.sp);
  return [...out];
}
