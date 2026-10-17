// Roadster 88 life palette: deterministic per-instance colours (coats, plumage, clothing per era, skin and hair tones) packed into the two colour vectors the crowd material reads.

export function rand(seed) {
  let s = Math.floor(seed * 2147483647) >>> 0 || 1;
  return () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const jit = (r, c, k = 0.12) => c.map((v) => Math.max(0, v * (1 - k / 2 + r() * k)));

const HORSE = [[0.22, 0.1, 0.045], [0.28, 0.12, 0.05], [0.16, 0.08, 0.04], [0.035, 0.028, 0.022], [0.46, 0.44, 0.41], [0.5, 0.36, 0.17], [0.36, 0.27, 0.16]];
const COW = [[0.32, 0.13, 0.06], [0.22, 0.1, 0.05], [0.55, 0.47, 0.36], [0.06, 0.05, 0.04], [0.4, 0.26, 0.14]];
const CANID = { coyote: [[0.36, 0.28, 0.18], [0.32, 0.25, 0.17]], wolf: [[0.28, 0.27, 0.25], [0.2, 0.19, 0.18], [0.36, 0.33, 0.28]], dog: [[0.3, 0.18, 0.08], [0.05, 0.045, 0.04], [0.5, 0.42, 0.3], [0.42, 0.25, 0.1]] };
const BIRD = { crow: [[0.025, 0.025, 0.03]], hawk: [[0.24, 0.15, 0.08]], vulture: [[0.06, 0.05, 0.045]], gull: [[0.62, 0.62, 0.62]], sparrow: [[0.3, 0.22, 0.14]], parrot: [[0.1, 0.42, 0.18], [0.5, 0.15, 0.08]], toothed: [[0.18, 0.2, 0.22], [0.3, 0.24, 0.17]] };

const SHIRTS = {
  1885: [[0.55, 0.52, 0.45], [0.42, 0.36, 0.28], [0.28, 0.12, 0.08], [0.2, 0.24, 0.3], [0.48, 0.44, 0.36], [0.16, 0.14, 0.12]],
  2026: [[0.8, 0.8, 0.78], [0.05, 0.05, 0.055], [0.14, 0.22, 0.4], [0.5, 0.08, 0.06], [0.2, 0.32, 0.18], [0.6, 0.48, 0.2], [0.4, 0.4, 0.42], [0.55, 0.3, 0.38]],
  2080: [[0.72, 0.73, 0.74], [0.08, 0.085, 0.09], [0.3, 0.32, 0.34], [0.12, 0.2, 0.3], [0.45, 0.42, 0.38]],
  scifi: [[0.85, 0.86, 0.88], [0.7, 0.72, 0.76], [0.12, 0.13, 0.15]],
};
const DRESS = [[0.3, 0.12, 0.1], [0.2, 0.22, 0.3], [0.38, 0.33, 0.26], [0.16, 0.2, 0.16], [0.42, 0.32, 0.3], [0.12, 0.1, 0.1]];
const PANTS = {
  1885: [[0.2, 0.17, 0.13], [0.14, 0.13, 0.12], [0.26, 0.22, 0.16], [0.1, 0.09, 0.08]],
  2026: [[0.1, 0.16, 0.3], [0.07, 0.1, 0.2], [0.04, 0.04, 0.045], [0.4, 0.34, 0.24], [0.16, 0.22, 0.36]],
  2080: [[0.05, 0.05, 0.055], [0.22, 0.23, 0.25], [0.5, 0.5, 0.5]],
  scifi: [[0.85, 0.86, 0.88], [0.12, 0.13, 0.15]],
};

export function colors(kind, seed, opts = {}) {
  const r = rand(seed + 0.137);
  if (kind === 'horse') return [[...jit(r, pick(r, HORSE)), 0], [r() < 0.35 ? 1 : 0, 0, 0, 0]];
  if (kind === 'longhorn') return [[...jit(r, pick(r, COW)), 0], [0, r() < 0.6 ? 1 : 0, 0, 0]];
  if (kind === 'canid') return [[...jit(r, pick(r, CANID[opts.breed || 'coyote'])), 0], [0, 0, 0, 0]];
  if (kind === 'bird') return [[...jit(r, pick(r, BIRD[opts.breed || 'crow']), 0.2), 0], [0, 0, 0, 0]];
  if (kind.startsWith('human')) {
    const era = kind.endsWith('1885') ? '1885' : kind.endsWith('2080') ? '2080' : kind.endsWith('scifi') ? 'scifi' : '2026';
    const shirt = kind === 'human_f1885' ? pick(r, DRESS) : pick(r, SHIRTS[era]);
    const skin = Math.min(0.99, Math.pow(r(), 1.3) * 1.05);
    const hair = era === 'scifi' ? r() * 0.4 : r() < 0.1 ? 0.72 : Math.pow(r(), 1.6) * 0.62;
    return [[...jit(r, shirt), skin], [...jit(r, pick(r, PANTS[era])), hair]];
  }
  if (/^(car_|truck)/.test(kind)) return [[...jit(r, pick(r, [[0.7, 0.7, 0.7], [0.03, 0.03, 0.035], [0.45, 0.45, 0.47], [0.12, 0.13, 0.16], [0.42, 0.04, 0.03], [0.05, 0.12, 0.3], [0.85, 0.85, 0.82]])), 0], [0, 0, 0, 0]];
  if (kind === 'pod' || kind === 'ev2080' || kind === 'hover' || kind === 'drone') return [[...jit(r, pick(r, [[0.85, 0.86, 0.88], [0.12, 0.13, 0.15], [0.2, 0.32, 0.4]])), 0], [0, 0, 0, 0]];
  return [[0.5, 0.5, 0.5, 0], [0, 0, 0, 0]];
}
