// Roadster 88 life plans per period: which animals live in the valley and where, which people walk the town and in what clothes, which vehicles drive the roads in a given year (wagons, Model T tourers, 1930s sedans, tail fins, 1970s land yachts, 1990s sedans, today's cars, EV pods, hover cars), how people react to the car and which herd greets a time-jump arrival.

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

const BIRDS = (breed = 'crow', n = 3, near = 'town') => ({ kind: 'bird', brain: 'flock', groups: n, size: [10, 16], breed, alt: [8, 22], radius: 16, range: 380, perch: true, near, fly: true });
const SOAR = (breed, scale, n = 1) => ({ kind: 'bird', brain: 'soar', groups: n, size: [2, 5], breed, alt: [80, 150], radius: 70, range: 750, fly: true, scale });
const PEOPLE = (variants, count, dogs = 0) => ({ people: variants, count, dogs });

const PLANS = {
  carbon: () => [{ kind: 'dragonfly', brain: 'flock', groups: 5, size: [4, 8], alt: [2, 8], radius: 14, range: 320, perch: true, near: 'lake', fly: true, scale: [0.9, 1.2] }],
  permian: () => [{ kind: 'dimetrodon', brain: 'grazer', groups: 4, size: [3, 6], near: 'lake', radius: 16, range: 360, shy: 0.8 }, { kind: 'dimetrodon', brain: 'predator', solo: 2, near: 'valley', scale: [1.1, 1.25] }],
  triassic: () => [
    { kind: 'raptor', brain: 'pack', groups: 3, size: [4, 7], near: 'wash', radius: 10, range: 420, hunter: true, scale: [0.55, 0.68] },
    { kind: 'sauropod', brain: 'grazer', groups: 3, size: [4, 7], near: 'lake', radius: 18, range: 380, scale: [0.28, 0.36] },
    { kind: 'dimetrodon', brain: 'grazer', groups: 1, size: [2, 3], near: 'lake', radius: 12, range: 300, scale: [0.9, 1.0] },
    { kind: 'quetzal', brain: 'soar', groups: 1, size: [2, 4], alt: [50, 110], radius: 70, range: 800, fly: true, scale: [0.3, 0.38] },
  ],
  jurassic: () => [
    { kind: 'sauropod', brain: 'grazer', groups: 3, size: [3, 6], near: 'lake', radius: 40, range: 520, scale: [1.05, 1.35] },
    { kind: 'stegosaurus', brain: 'grazer', groups: 3, size: [3, 6], near: 'range', radius: 22, range: 420, bulls: 0.3 },
    { kind: 'trex', brain: 'predator', solo: 2, near: 'valley', scale: [0.78, 0.86] },
    { kind: 'raptor', brain: 'pack', groups: 1, size: [3, 5], near: 'wash', radius: 10, range: 400, hunter: true, scale: [0.6, 0.72] },
    { kind: 'quetzal', brain: 'soar', groups: 2, size: [2, 4], alt: [50, 110], radius: 80, range: 850, fly: true, scale: [0.35, 0.45] },
    { kind: 'bird', brain: 'flock', groups: 2, size: [6, 10], breed: 'toothed', alt: [6, 18], radius: 14, range: 300, perch: true, near: 'lake', fly: true, scale: [0.8, 1.1] },
  ],
  dino: (y) => [
    ...(y >= -70000000 ? [{ kind: 'triceratops', brain: 'grazer', groups: 3, size: [5, 9], near: 'lake', radius: 22, range: 380, bulls: 0.3 }] : [{ kind: 'stegosaurus', brain: 'grazer', groups: y < -125000000 ? 2 : 0, size: [3, 5], near: 'range', radius: 20, range: 380 }]),
    { kind: 'hadrosaur', brain: 'grazer', groups: y >= -70000000 ? 3 : 4, size: [6, 11], near: 'lake', radius: 26, range: 420 },
    { kind: 'sauropod', brain: 'grazer', groups: y >= -100000000 ? 2 : 3, size: [3, 5], near: 'lake', radius: 40, range: 500, scale: [0.85, 1.1] },
    { kind: 'raptor', brain: 'pack', groups: 2, size: [4, 6], near: 'wash', radius: 10, range: 450, hunter: true },
    { kind: 'trex', brain: 'predator', solo: 2, near: 'valley', scale: y >= -68000000 ? [1, 1] : [0.85, 0.9] },
    { kind: 'quetzal', brain: 'soar', groups: 2, size: [2, 4], alt: [70, 130], radius: 90, range: 900, fly: true },
    { kind: 'bird', brain: 'flock', groups: 4, size: [10, 18], breed: 'toothed', alt: [8, 22], radius: 18, range: 400, perch: true, near: 'lake', fly: true, scale: [0.9, 1.3] },
  ].filter((p) => p.groups !== 0),
  paleo: () => [
    { kind: 'deer', brain: 'grazer', groups: 4, size: [5, 9], near: 'range', radius: 16, range: 400, shy: 1.4, scale: [0.42, 0.55] },
    { kind: 'bird', brain: 'flock', groups: 4, size: [10, 18], breed: 'parrot', alt: [8, 24], radius: 18, range: 400, perch: true, near: 'lake', fly: true },
    SOAR('hawk', [2.6, 3.2], 1),
  ],
  miocene: () => [
    { kind: 'horse', brain: 'grazer', groups: 4, size: [6, 12], near: 'range', radius: 22, range: 500, scale: [0.62, 0.72] },
    { kind: 'mammoth', brain: 'grazer', groups: 2, size: [4, 7], near: 'lake', radius: 30, range: 500, breed: 'gompho', scale: [0.72, 0.82] },
    { kind: 'deer', brain: 'grazer', groups: 2, size: [4, 8], near: 'hills', radius: 14, range: 380, shy: 1.5 },
    { kind: 'canid', brain: 'pack', groups: 2, size: [3, 5], breed: 'wolf', near: 'hills', radius: 9, range: 450, shy: 1.2, scale: [1.2, 1.35] },
    SOAR('teratorn', [5, 6], 1), BIRDS('crow', 2, 'lake'),
  ],
  iceage: () => [
    { kind: 'mammoth', brain: 'grazer', groups: 3, size: [4, 8], near: 'range', radius: 32, range: 560, bulls: 0.25 },
    { kind: 'bison', brain: 'grazer', groups: 3, size: [8, 14], near: 'range', radius: 26, range: 520, scale: [1.05, 1.2] },
    { kind: 'horse', brain: 'grazer', groups: 2, size: [5, 9], near: 'range', radius: 18, range: 450 },
    { kind: 'canid', brain: 'pack', groups: 2, size: [4, 6], breed: 'direwolf', near: 'hills', radius: 9, range: 500, shy: 1.1, scale: [1.4, 1.6] },
    { kind: 'deer', brain: 'grazer', groups: 2, size: [5, 9], near: 'hills', radius: 16, range: 420, shy: 1.4, scale: [1.25, 1.45] },
    SOAR('teratorn', [5.5, 6.5], 1),
  ],
  native: (y) => [
    { kind: 'deer', brain: 'grazer', groups: 4, size: [6, 12], near: 'range', radius: 20, range: 480, shy: 1.4, scale: [1.25, 1.4] },
    { kind: 'deer', brain: 'grazer', groups: 2, size: [5, 9], near: 'hills', radius: 14, range: 380, shy: 1.8, scale: [0.75, 0.85] },
    { kind: 'canid', brain: 'pack', groups: 2, size: [2, 4], breed: 'coyote', near: 'hills', radius: 8, range: 400, shy: 1.6 },
    SOAR('condor', [3.6, 4.2], 1), SOAR('hawk', [2.2, 2.6], 1), BIRDS('crow', 2, 'lake'),
    PEOPLE(['human_mnative', 'human_fnative'], y < -3000 ? 16 : 34, 2),
  ],
  mission: (y) => [
    { kind: 'longhorn', brain: 'grazer', groups: y < 1834 ? 5 : 6, size: [8, 16], near: 'range', radius: 30, range: 520 },
    { kind: 'horse', brain: 'grazer', groups: 2, size: [4, 7], near: 'range', radius: 16, range: 420 },
    { kind: 'horse', brain: 'tied', town: 6 },
    { kind: 'deer', brain: 'grazer', groups: 2, size: [5, 9], near: 'hills', radius: 16, range: 420, shy: 1.6, scale: [1.2, 1.35] },
    { kind: 'canid', brain: 'pack', groups: 2, size: [2, 4], breed: 'coyote', near: 'hills', radius: 8, range: 400, shy: 1.6 },
    SOAR('condor', [3.6, 4.2], 1), BIRDS('crow', 2),
    PEOPLE(y < 1834 ? ['human_mpadre', 'human_mvaquero', 'human_mnative', 'human_fnative', 'human_mnative'] : ['human_mvaquero', 'human_mvaquero', 'human_f1885', 'human_mnative', 'human_fnative'], 30, 3),
    { traffic: 0.4 },
  ],
  1849: () => [
    { kind: 'horse', brain: 'tied', town: 7 },
    { kind: 'horse', brain: 'grazer', groups: 2, size: [4, 7], near: 'range', radius: 16, range: 400, scale: [0.85, 0.92] },
    { kind: 'longhorn', brain: 'grazer', groups: 2, size: [6, 10], near: 'range', radius: 22, range: 420 },
    { kind: 'canid', brain: 'pack', groups: 2, size: [2, 4], breed: 'coyote', near: 'hills', radius: 8, range: 400, shy: 1.6 },
    SOAR('vulture', [3.2, 3.8], 1), BIRDS('crow', 3),
    PEOPLE(['human_mminer', 'human_mminer', 'human_mminer', 'human_m1885', 'human_f1885'], 52, 4),
    { traffic: 0.6 },
  ],
  1885: (y) => [
    { kind: 'longhorn', brain: 'grazer', groups: 4, size: [8, 14], near: 'range', radius: 28, range: 500 },
    { kind: 'horse', brain: 'grazer', groups: 2, size: [4, 7], near: 'range', radius: 16, range: 400 },
    { kind: 'horse', brain: 'tied', town: 9 },
    { kind: 'canid', brain: 'pack', groups: 2, size: [2, 4], breed: 'coyote', near: 'hills', radius: 8, range: 400, shy: 1.6 },
    SOAR('vulture', [3.2, 3.8], 1), BIRDS('crow', 3),
    PEOPLE(['human_m1885', 'human_m1885', 'human_f1885'], 44),
    { traffic: 0.8 }, ...(y >= 1869 ? [{ train: true }] : []),
  ],
  1900: (y) => [
    { kind: 'horse', brain: 'tied', town: y < 1912 ? 9 : 5 },
    { kind: 'longhorn', brain: 'grazer', groups: 2, size: [6, 10], near: 'range', radius: 22, range: 380 },
    { kind: 'canid', brain: 'pack', groups: 1, size: [2, 3], breed: 'coyote', near: 'hills', radius: 8, range: 400, shy: 1.7 },
    SOAR('hawk', [2.2, 2.6], 1), BIRDS('crow', 3),
    PEOPLE(['human_m1900', 'human_m1900', 'human_f1900', 'human_f1900', 'human_m1885'], 56, 3),
    { traffic: 0.9 }, { parked: y < 1912 ? 4 : 10 }, { train: true },
  ],
  1920: (y) => [
    { kind: 'horse', brain: 'tied', town: y < 1928 ? 3 : 0 },
    { kind: 'longhorn', brain: 'grazer', groups: 1, size: [6, 10], near: 'range', radius: 22, range: 340 },
    SOAR('hawk', [2.2, 2.6], 1), BIRDS('crow', 3),
    PEOPLE(['human_m1920', 'human_m1920', 'human_f1920', 'human_f1920', 'human_m1900'], 62, 4),
    { traffic: 1 }, { parked: 22 }, { train: true },
  ],
  1940: () => [
    { kind: 'longhorn', brain: 'grazer', groups: 1, size: [6, 10], near: 'range', radius: 20, range: 320 },
    SOAR('hawk', [2.2, 2.6], 1), BIRDS('crow', 3),
    PEOPLE(['human_m1920', 'human_m1920', 'human_f1920', 'human_f1950', 'human_m1950'], 62, 4),
    { traffic: 1 }, { parked: 24 }, { train: true },
  ],
  1950: () => [
    { kind: 'horse', brain: 'grazer', groups: 1, size: [3, 5], near: 'range', radius: 14, range: 250 },
    SOAR('hawk', [2.2, 2.6], 1), BIRDS('crow', 3),
    PEOPLE(['human_m1950', 'human_m1950', 'human_f1950', 'human_f1950', 'human_m1920'], 66, 6),
    { traffic: 1.05 }, { parked: 28 },
  ],
  1970: (y) => [
    { kind: 'horse', brain: 'grazer', groups: 1, size: [3, 5], near: 'range', radius: 14, range: 250 },
    { kind: 'canid', brain: 'pack', groups: 1, size: [2, 3], breed: 'coyote', near: 'hills', radius: 8, range: 400, shy: 1.8 },
    SOAR('hawk', [2.2, 2.6], 1), BIRDS('crow', 3),
    PEOPLE(y < 1966 ? ['human_m1950', 'human_f1950', 'human_m1970', 'human_f1970'] : ['human_m1970', 'human_m1970', 'human_f1970', 'human_f1970', 'human_m1950'], 66, 6),
    { traffic: 1.1 }, { parked: 28 },
  ],
  1990: (y) => [
    { kind: 'canid', brain: 'pack', groups: 1, size: [2, 3], breed: 'coyote', near: 'hills', radius: 8, range: 400, shy: 1.8 },
    SOAR('hawk', [2.2, 2.6], 1), BIRDS('crow', 3),
    PEOPLE(y < 1986 ? ['human_m1970', 'human_f1970', 'human_m1990', 'human_f1990'] : ['human_m1990', 'human_m1990', 'human_f1990', 'human_f1990', 'human_m2026'], 64, 6),
    { traffic: 1.1 }, { parked: 28 },
  ],
  2000: () => [
    { kind: 'longhorn', brain: 'grazer', groups: 1, size: [6, 10], near: 'range', radius: 20, range: 300 },
    { kind: 'canid', brain: 'pack', groups: 1, size: [2, 3], breed: 'coyote', near: 'hills', radius: 8, range: 400, shy: 1.8 },
    SOAR('hawk', [2.2, 2.6], 1), BIRDS('crow', 3),
    PEOPLE(['human_m2026', 'human_f2026', 'human_m1990', 'human_f1990'], 64, 5),
    { traffic: 1 }, { parked: 26 },
  ],
  2026: () => [
    { kind: 'longhorn', brain: 'grazer', groups: 1, size: [6, 10], near: 'range', radius: 20, range: 300 },
    { kind: 'horse', brain: 'grazer', groups: 1, size: [3, 5], near: 'range', radius: 14, range: 250 },
    { kind: 'canid', brain: 'pack', groups: 1, size: [2, 3], breed: 'coyote', near: 'hills', radius: 8, range: 400, shy: 1.8 },
    SOAR('hawk', [2.2, 2.6], 1), BIRDS('crow', 3),
    PEOPLE(['human_m2026', 'human_f2026'], 64, 5),
    { traffic: 1 }, { parked: 26 },
  ],
  2050: () => [
    BIRDS('sparrow', 2), { kind: 'drone', brain: 'drone', solo: 8, near: 'town', range: 600, fly: true },
    PEOPLE(['human_m2026', 'human_f2026', 'human_m2080', 'human_f2080'], 58, 4),
    { traffic: 1.05 }, { parked: 22 },
  ],
  2080: () => [
    { ...BIRDS('sparrow', 2), scale: [0.6, 0.8] }, { kind: 'drone', brain: 'drone', solo: 14, near: 'town', range: 600, fly: true },
    PEOPLE(['human_m2080', 'human_f2080'], 54, 3),
    { traffic: 1.1 }, { parked: 18 },
  ],
  2150: () => [
    { ...BIRDS('sparrow', 3), scale: [0.6, 0.8] }, { kind: 'drone', brain: 'drone', solo: 22, near: 'town', range: 800, fly: true },
    { kind: 'deer', brain: 'grazer', groups: 2, size: [4, 7], near: 'hills', radius: 14, range: 380, shy: 1.5 },
    PEOPLE(['human_m2080', 'human_f2080', 'human_scifi'], 56, 3),
    { traffic: 1.1 }, { parked: 10 },
  ],
  2300: () => [
    { kind: 'bird', brain: 'flock', groups: 2, size: [8, 14], breed: 'gull', alt: [15, 40], radius: 20, range: 500, near: 'lake', fly: true, scale: [1.1, 1.3] },
    { kind: 'drone', brain: 'drone', solo: 18, near: 'town', range: 900, fly: true },
    { kind: 'deer', brain: 'grazer', groups: 2, size: [4, 7], near: 'hills', radius: 14, range: 380, shy: 1.4 },
    PEOPLE(['human_scifi', 'human_m2080', 'human_f2080'], 40),
    { traffic: 0.9 },
  ],
  ruins: () => [
    { kind: 'deer', brain: 'grazer', groups: 3, size: [5, 9], near: 'town', radius: 18, range: 500, shy: 1.4 },
    { kind: 'horse', brain: 'grazer', groups: 2, size: [5, 8], near: 'range', radius: 18, range: 500, shy: 1.3 },
    { kind: 'canid', brain: 'pack', groups: 2, size: [4, 6], breed: 'wolf', near: 'hills', radius: 9, range: 500, shy: 1.2, scale: [1.25, 1.4] },
    SOAR('vulture', [3.2, 3.8], 1), BIRDS('crow', 4),
  ],
  3000: () => [
    { kind: 'deer', brain: 'grazer', groups: 4, size: [6, 11], near: 'range', radius: 20, range: 520, shy: 1.4, scale: [1.0, 1.35] },
    { kind: 'bison', brain: 'grazer', groups: 3, size: [8, 16], near: 'range', radius: 28, range: 560 },
    { kind: 'horse', brain: 'grazer', groups: 2, size: [5, 9], near: 'range', radius: 18, range: 480, shy: 1.3 },
    { kind: 'canid', brain: 'pack', groups: 2, size: [4, 7], breed: 'wolf', near: 'hills', radius: 9, range: 520, shy: 1.2, scale: [1.25, 1.4] },
    SOAR('condor', [3.6, 4.2], 1), BIRDS('crow', 3, 'lake'),
  ],
  scifi: () => [
    { kind: 'bird', brain: 'flock', groups: 2, size: [8, 14], breed: 'gull', alt: [15, 40], radius: 20, range: 500, near: 'lake', fly: true, scale: [1.1, 1.3] },
    { kind: 'drone', brain: 'drone', solo: 22, near: 'town', range: 900, fly: true },
    PEOPLE(['human_scifi'], 34),
    { traffic: 0.9 },
  ],
  glacial: () => [
    { kind: 'mammoth', brain: 'grazer', groups: 2, size: [4, 7], near: 'range', radius: 30, range: 520, breed: 'white' },
    { kind: 'canid', brain: 'pack', groups: 2, size: [4, 6], breed: 'white', near: 'hills', radius: 9, range: 500, shy: 1.2, scale: [1.3, 1.45] },
  ],
  distant: () => [
    { kind: 'deer', brain: 'grazer', groups: 4, size: [5, 10], near: 'range', radius: 20, range: 520, shy: 1.2, scale: [1.5, 1.8] },
    { kind: 'quetzal', brain: 'soar', groups: 3, size: [2, 5], alt: [50, 120], radius: 90, range: 900, fly: true, scale: [0.5, 0.7] },
    { kind: 'bird', brain: 'flock', groups: 4, size: [10, 18], breed: 'future', alt: [8, 24], radius: 18, range: 400, perch: true, near: 'lake', fly: true, scale: [1.1, 1.5] },
  ],
  pangaea: () => [SOAR('vulture', [2.2, 2.6], 1)],
};

const MODELS = (id, y) => {
  if (id === 'mission') return [['wagon', 1]];
  if (id === '1849' || id === '1885') return [['wagon', 0.8], ['coach', 0.2]];
  if (id === '1900') { const c = lerp(0, 0.45, (y - 1906) / 13); return [['wagon', 0.75 * (1 - c)], ['coach', 0.25 * (1 - c)], ['car_t', c * 0.85], ['truck_old', c * 0.15]]; }
  if (id === '1920') return y < 1928 ? [['car_t', 0.62], ['car_30s', 0.18], ['truck_old', 0.15], ['wagon', 0.05]] : [['car_30s', 0.68], ['car_t', 0.14], ['truck_old', 0.18]];
  if (id === '1940') return [['car_30s', 0.8], ['truck_old', 0.2]];
  if (id === '1950') return y < 1955 ? [['car_30s', 0.45], ['car_50s', 0.4], ['truck_old', 0.15]] : [['car_50s', 0.7], ['car_30s', 0.15], ['truck_old', 0.1], ['truck_semi', 0.05]];
  if (id === '1970') return y < 1968 ? [['car_50s', 0.5], ['car_70s', 0.35], ['car_pickup', 0.1], ['truck_semi', 0.05]] : [['car_70s', 0.66], ['car_50s', 0.14], ['car_pickup', 0.13], ['truck_semi', 0.07]];
  if (id === '1990') return y < 1990 ? [['car_70s', 0.4], ['car_90s', 0.38], ['car_pickup', 0.14], ['truck_semi', 0.08]] : [['car_90s', 0.56], ['car_70s', 0.12], ['car_suv', 0.12], ['car_pickup', 0.12], ['truck_semi', 0.08]];
  if (id === '2000') return [['car_sedan', 0.3], ['car_90s', 0.22], ['car_hatch', 0.14], ['car_suv', 0.18], ['car_pickup', 0.1], ['truck_semi', 0.06]];
  if (id === '2026') return [['car_sedan', 0.34], ['car_hatch', 0.2], ['car_suv', 0.24], ['car_pickup', 0.14], ['truck_semi', 0.08]];
  if (id === '2050') return [['ev2080', 0.35], ['car_sedan', 0.25], ['car_suv', 0.15], ['pod', 0.2], ['truck_semi', 0.05]];
  if (id === '2080') return [['pod', 0.45], ['ev2080', 0.55]];
  if (id === '2150') return [['hover', 0.6], ['pod', 0.4]];
  if (id === '2300' || id === 'scifi') return [['hover', 1]];
  return null;
};

export function lifePlan(id, year) { const f = PLANS[id]; return f ? f(year) : []; }

export function trafficOf(id, year) {
  const models = MODELS(id, year);
  if (!models) return null;
  const list = models.filter(([, w]) => w > 0.001);
  const horse = list.some(([m]) => m === 'wagon' || m === 'coach');
  const cars = list.some(([m]) => m !== 'wagon' && m !== 'coach');
  const air = id === 'scifi' || id === '2300' || id === '2150';
  const hover = list.some(([m]) => m === 'hover');
  const early = ['mission', '1849', '1885'].includes(id);
  const v = id === '1900' ? 13 : id === '1920' ? (year < 1928 ? 17 : 22) : id === '1940' ? 24 : id === '1950' ? 27 : id === '2080' || id === '2150' ? 34 : 30;
  return { models: list, horse, cars, air, hover, tracksOnly: early, vmax: v, driver: id === 'mission' ? 'human_mvaquero' : id === '1849' ? 'human_mminer' : id === '1900' ? 'human_m1900' : 'human_m1885', parkedOk: !air && cars };
}

export const TEMPER = {
  native: { fear: 1.8, curious: 0.25, look: 'point', arrive: 'cower' }, mission: { fear: 1.5, curious: 0.3, look: 'point', arrive: 'cower' }, 1849: { fear: 1.3, curious: 0.45, look: 'point', arrive: 'cower' },
  1885: { fear: 1.4, curious: 0.35, look: 'idle', arrive: 'cower' }, 1900: { fear: 1.3, curious: 0.6, look: 'point', arrive: 'cower' }, 1920: { fear: 1.1, curious: 0.75, look: 'point', arrive: 'point' },
  1940: { fear: 1.1, curious: 0.7, look: 'point', arrive: 'point' }, 1950: { fear: 1.0, curious: 0.9, look: 'wave', arrive: 'cheer' }, 1970: { fear: 1.0, curious: 0.85, look: 'wave', arrive: 'cheer' },
  1990: { fear: 1.0, curious: 0.8, look: 'point', arrive: 'point' }, 2000: { fear: 1.0, curious: 0.8, look: 'point', arrive: 'point' }, 2026: { fear: 1.0, curious: 0.8, look: 'point', arrive: 'point' },
  2050: { fear: 0.9, curious: 0.7, look: 'point', arrive: 'point' }, 2080: { fear: 0.8, curious: 0.6, look: 'wave', arrive: 'point' }, 2150: { fear: 0.7, curious: 0.5, look: 'wave', arrive: 'idle' },
  2300: { fear: 0.5, curious: 0.4, look: 'idle', arrive: 'idle' }, scifi: { fear: 0.5, curious: 0.4, look: 'idle', arrive: 'idle' }, ruins: { fear: 1.6, curious: 0.2, look: 'idle', arrive: 'cower' },
};

export const WELCOME = { dino: ['hadrosaur', 'triceratops'], jurassic: ['stegosaurus', 'sauropod'], triassic: ['sauropod'], permian: ['dimetrodon'], miocene: ['horse', 'mammoth'], iceage: ['mammoth', 'bison'], native: ['deer'], mission: ['longhorn'], 1849: ['longhorn'], 1885: ['longhorn'], ruins: ['deer', 'horse'], 3000: ['bison', 'deer'], glacial: ['mammoth'], distant: ['deer'], paleo: ['deer'] };

export const BIG_PREDATOR = { dino: 'trex', jurassic: 'trex', permian: 'dimetrodon' };
