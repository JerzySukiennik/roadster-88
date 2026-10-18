// Roadster 88 city skeleton: the fixed, deterministic street layout of Gzowo City north of the valley (island grid with avenues, streets and Broadway, the park, the Heights, the borough grid across the East River, the port and the airport), the elevated ring, bridges, the river tunnel and the city ground height. Pure data shared by the terrain generator, the city planner, workers and Node tools.

export const SEA_LEVEL = 0;

export const ISLAND = { x0: -2625, x1: 580, z0: 3420, z1: 7600 };
export const AVE_X = [-2460, -2200, -1940, -1680, -1420, -1160, -900, -640, -380, -120, 140, 400];
export const MAIN_AVE = -900;
export const STREET_Z0 = 3480, STREET_DZ = 80, STREET_N = 51;
export const STREET_Z = Array.from({ length: STREET_N }, (_, k) => STREET_Z0 + k * STREET_DZ);
export const W = { ave: 24, main: 32, street: 13, broadway: 20, walkAve: 6, walkStreet: 4.5, walkMain: 7, curb: 0.15 };

export const BROADWAY = { a: [400, 4100], b: [-1175, 7480] };
export const PARK = { x0: -1940 + W.ave / 2, x1: -1160 - W.ave / 2, z0: 4280 + W.street / 2, z1: 6040 - W.street / 2, transverse: [4760, 5560] };
export const PONDS = [{ id: 'reservoir', x: -1520, z: 5320, rx: 250, rz: 170, depth: 4 }, { id: 'lake', x: -1600, z: 4620, rx: 140, rz: 90, depth: 3 }, { id: 'pond', x: -1330, z: 5880, rx: 60, rz: 40, depth: 2 }];
export const PARK_DRIVE = { x: -1550, z: 5160, rx: 330, rz: 790, width: 9 };
export const HEIGHTS = { x0: -560, x1: 380, z0: 4150, z1: 5250, top: 34, bluff: 560 };

export const BOROUGH = { cx: -4700, cz: 4900, ang: 0.2, ave: 210, street: 96, land: [[-3070, 3880], [-3070, 6330], [-6450, 6330], [-6450, 3560], [-3420, 3420]] };
export const PORT = { x0: 1460, x1: 4300, z0: 5950, z1: 7620, road: 1900 };
export const AIRPORT = { x0: -8000, x1: -4250, z0: 6350, z1: 7720, runway: { z: 7230, x0: -7900, x1: -4350, w: 60 }, taxi: { z: 7050, w: 24 }, apron: { x0: -6700, x1: -5100, z0: 6480, z1: 6930 } };

export const RIVERS = {
  west: { id: 'west_river', name: 'Thunder River', ctrl: [[3400, 2380, 22, 3], [2900, 2760, 34, 4], [2200, 3080, 90, 6], [1500, 3360, 250, 9], [1080, 3800, 380, 12], [1000, 4400, 420, 14], [1000, 5400, 420, 15], [1000, 6400, 420, 15.5], [990, 7300, 440, 16], [960, 8400, 620, 18]] },
  east: { id: 'east_river', name: 'East River', ctrl: [[-3700, 2780, 14, 2.5], [-3420, 3120, 40, 4], [-3080, 3460, 95, 6.5], [-2900, 3760, 130, 8], [-2810, 4200, 175, 10], [-2800, 5000, 175, 11], [-2800, 6000, 178, 11.5], [-2800, 7000, 185, 12.5], [-2790, 7700, 230, 14], [-2760, 8400, 300, 16]] },
};

export const RING = { deck: 9, width: 26, west: 505, east: -2548, north: 7548, south: 3480, r: 170 };

export const BRIDGES = [
  { id: 'old_bridge', name: 'Old Bridge', kind: 'suspension_stone', z: 6920, x0: -2625, x1: -2975, deck: 26, towers: [-2690, -2910], width: 28 },
  { id: 'steel_bridge', name: 'Steel Bridge', kind: 'suspension_steel', z: 6200, x0: -2625, x1: -2975, deck: 27, towers: [-2685, -2915], width: 30 },
  { id: 'drawbridge', name: 'Lift Bridge', kind: 'bascule', z: 3720, x0: -2790, x1: -3030, deck: 7.5, open: [-2948, -2872], width: 22 },
  { id: 'gzowo_bridge', name: 'Gzowo Bridge', kind: 'suspension_great', z: 4700, x0: 560, x1: 1440, deck: 44, towers: [700, 1300], width: 34 },
];

export const TUNNEL = { id: 'river_tunnel', name: 'River Tunnel', z: 6360, x0: 170, x1: 1830, portal0: 330, portal1: 1670, floor: -26, grade: 0.06, width: 15, height: 7 };

export function cityGround(x, z) {
  let h = 4.6 + 1.1 * Math.sin(x * 0.00071 + 1.3) * Math.cos(z * 0.00053 - 0.7) + 0.6 * Math.sin(z * 0.0011 + x * 0.0004);
  const H = HEIGHTS;
  if (x > H.x0 - 400 && x < H.bluff + 40 && z > H.z0 - 400 && z < H.z1 + 400) {
    const ex = x < H.x0 ? (H.x0 - x) / 400 : x > H.x1 ? (x - H.x1) / (H.bluff - H.x1) : 0;
    const ez = z < H.z0 ? (H.z0 - z) / 400 : z > H.z1 ? (z - H.z1) / 400 : 0;
    const e = Math.min(1, Math.hypot(ex, ez));
    const k = 1 - e * e * (3 - 2 * e);
    const dome = 1 - 0.18 * Math.min(1, Math.hypot((x - (H.x0 + H.x1) / 2) / 600, (z - (H.z0 + H.z1) / 2) / 700) ** 2);
    h += (H.top - 4) * k * dome;
  }
  return h;
}

export function boroughToWorld(u, v) {
  const B = BOROUGH, c = Math.cos(B.ang), s = Math.sin(B.ang);
  return [B.cx + u * c - v * s, B.cz + u * s + v * c];
}

export function worldToBorough(x, z) {
  const B = BOROUGH, c = Math.cos(B.ang), s = Math.sin(B.ang), dx = x - B.cx, dz = z - B.cz;
  return [dx * c + dz * s, -dx * s + dz * c];
}

export function boroughPoly() { return BOROUGH.land.map((p) => p.slice()); }

export function islandPoly() {
  const I = ISLAND;
  return [[I.x0, I.z0], [I.x1, I.z0], [I.x1, I.z1], [I.x0, I.z1]];
}

export function rect(x0, z0, x1, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }

export function broadwayX(z) {
  const { a, b } = BROADWAY;
  return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
}
