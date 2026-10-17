// Roadster 88 era site planner: what stands in the valley in a given year, from Hadean basalt and Archean vents, native tule villages, the Spanish mission and ranchos, the Gold Rush tent camp and the 1885 frontier town, through brick blocks, picture houses, orange groves and oil derricks, diners, motels, drive-ins, strip malls and cell towers, to the 2026 town, solar farms, maglev, sky towers, spires, ruins, a rewilded valley, ice-buried spires and far-future crystals. Sites keep their keys across periods so causality carries a lost building forward.
import { C, rng, hashStr } from './lib.js';

const PI = Math.PI;
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const between = (y, a, b) => y >= a && y < b;

const OLD = [
  [1, 70, 13, 'falseFront', { stories: 2, sign: 'GENERAL STORE', color: [0.62, 0.55, 0.42], trim: C.white, pat: 0 }, 1861],
  [1, 85, 10, 'falseFront', { sign: 'BARBER', color: C.white, trim: C.red, pat: 0 }, 1872],
  [1, 104, 17, 'hotel', { sign: 'HOTEL', color: [0.75, 0.7, 0.6], trim: C.green }, 1866],
  [1, 121, 11, 'falseFront', { sign: 'ASSAY OFFICE', bare: true, color: C.bare, trim: C.bare, pat: 1 }, 1878],
  [1, 134, 12, 'bank', { sign: 'BANK' }, 1874],
  [1, 164, 11, 'falseFront', { sign: 'POST OFFICE', color: [0.5, 0.56, 0.6], trim: C.white, pat: 0 }, 1880],
  [1, 178, 13, 'falseFront', { stories: 2, sign: 'DRY GOODS', color: [0.55, 0.42, 0.3], trim: C.cream, pat: 0 }, 1884],
  [1, 196, 10, 'falseFront', { sign: 'SHERIFF', bare: true, color: C.bare, pat: 1 }, 1869],
  [-1, 72, 15, 'falseFront', { stories: 2, sign: 'SALOON', color: [0.45, 0.2, 0.12], trim: C.cream, pat: 0, rail: true }, 1860],
  [-1, 89, 10, 'falseFront', { sign: 'GZOWO SPRINGS', color: C.white, trim: C.blue, pat: 0 }, 1864],
  [-1, 103, 12, 'falseFront', { sign: 'DRY GOODS', bare: true, color: C.bare, pat: 1 }, 1876],
  [-1, 118, 10, 'falseFront', { sign: 'BARBER', color: [0.6, 0.62, 0.55], trim: C.white, pat: 0 }, 1882],
  [-1, 132, 12, 'falseFront', { stories: 2, sign: 'HOTEL', color: [0.7, 0.6, 0.45], trim: C.green, pat: 0 }, 1870],
  [-1, 166, 13, 'falseFront', { sign: 'BLACKSMITH', bare: true, color: C.bare, pat: 1 }, 1862],
  [-1, 181, 10, 'falseFront', { sign: 'POST OFFICE', color: C.white, trim: C.red, pat: 0 }, 1868],
];
const SIGNS_2026 = { 'GENERAL STORE': 'GENERAL STORE', BARBER: 'CAFE', HOTEL: 'HOTEL', 'ASSAY OFFICE': 'ANTIQUES', BANK: 'BANK', 'POST OFFICE': 'POST OFFICE', 'DRY GOODS': 'BREWING CO', SHERIFF: 'SHERIFF', SALOON: 'SALOON', 'GZOWO SPRINGS': 'GZOWO SPRINGS', BLACKSMITH: 'DINER' };
const DECADE_SIGNS = {
  1900: ['GENERAL STORE', 'BARBER', 'HOTEL GZOWO', 'LAND OFFICE', 'BANK', 'POST OFFICE', 'DRY GOODS', 'SHERIFF', 'SALOON', 'GZOWO SPRINGS', 'FEED AND SEED', 'DRUG STORE', 'HOTEL', 'BLACKSMITH', 'TELEPHONE CO'],
  1910: ['GENERAL STORE', 'BARBER', 'HOTEL GZOWO', 'LAND OFFICE', 'BANK', 'POST OFFICE', 'PICTURE SHOW', 'SHERIFF', 'SALOON', 'GZOWO SPRINGS', 'ICE CREAM', 'DRUG STORE', 'HOTEL', 'GARAGE', 'TELEPHONE CO'],
  1920: ['FIVE AND DIME', 'BARBER', 'HOTEL GZOWO', 'AUTO REPAIR', 'BANK', 'POST OFFICE', 'PICTURE SHOW', 'SHERIFF', 'SODA FOUNTAIN', 'GZOWO SPRINGS', 'BAKERY', 'DRUG STORE', 'HOTEL', 'GARAGE', 'RADIO SHOP'],
  1930: ['FIVE AND DIME', 'BARBER', 'HOTEL GZOWO', 'AUTO REPAIR', 'BANK', 'POST OFFICE', 'THE PALACE', 'SHERIFF', 'SALOON', 'GZOWO SPRINGS', 'BAKERY', 'DRUG STORE', 'HOTEL', 'GARAGE', 'RADIO SHOP'],
  1940: ['FIVE AND DIME', 'BARBER', 'HOTEL GZOWO', 'SHOE REPAIR', 'BANK', 'POST OFFICE', 'THE PALACE', 'SHERIFF', 'LUNCH COUNTER', 'GZOWO SPRINGS', 'BAKERY', 'DRUG STORE', 'BUS DEPOT', 'GARAGE', 'RADIO SHOP'],
  1950: ['FIVE AND DIME', 'BARBER', 'HOTEL GZOWO', 'TV REPAIR', 'BANK', 'POST OFFICE', 'THE PALACE', 'SHERIFF', 'SODA SHOP', 'GZOWO SPRINGS', 'RECORDS', 'DRUG STORE', 'BUS DEPOT', 'BOWLING', 'DINER'],
  1960: ['FIVE AND DIME', 'BARBER', 'HOTEL GZOWO', 'TV REPAIR', 'BANK', 'POST OFFICE', 'CINEMA', 'SHERIFF', 'SODA SHOP', 'GZOWO SPRINGS', 'RECORDS', 'DRUG STORE', 'LAUNDROMAT', 'BOWLING', 'DINER'],
  1970: ['PIZZA', 'BARBER', 'HOTEL', 'TV REPAIR', 'BANK', 'POST OFFICE', 'CINEMA', 'SHERIFF', 'DISCO', 'GZOWO SPRINGS', 'RECORDS', 'DRUG STORE', 'LAUNDROMAT', 'SURF SHOP', 'DINER'],
  1980: ['PIZZA', 'BARBER', 'HOTEL', 'ARCADE', 'BANK', 'POST OFFICE', 'CINEMA', 'SHERIFF', 'SALOON', 'GZOWO SPRINGS', 'VIDEO RENTAL', 'DRUG STORE', 'LAUNDROMAT', 'SURF SHOP', 'DINER'],
  1990: ['PIZZA', 'CAFE', 'HOTEL', 'ARCADE', 'BANK', 'POST OFFICE', 'CINEMA', 'SHERIFF', 'SALOON', 'GZOWO SPRINGS', 'VIDEO RENTAL', 'PAGERS', 'COFFEE', 'SURF SHOP', 'DINER'],
  2000: ['GENERAL STORE', 'CAFE', 'HOTEL', 'INTERNET CAFE', 'BANK', 'POST OFFICE', 'CINEMA', 'SHERIFF', 'SALOON', 'GZOWO SPRINGS', 'DVD RENTAL', 'CELL PHONES', 'COFFEE', 'ANTIQUES', 'DINER'],
  2010: ['GENERAL STORE', 'CAFE', 'HOTEL', 'ANTIQUES', 'BANK', 'POST OFFICE', 'CINEMA', 'SHERIFF', 'SALOON', 'GZOWO SPRINGS', 'BREWING CO', 'PHONE REPAIR', 'COFFEE', 'ANTIQUES', 'DINER'],
};
const decade = (y) => Math.max(1900, Math.min(2010, Math.floor(y / 10) * 10));
const BILLBOARDS = (y) => (y < 1942 ? ['DRINK COLA', 'SEE THE VALLEY BY CAR', 'VISIT GZOWO SPRINGS', 'DRINK COLA'] : y < 1946 ? ['BUY WAR BONDS', 'DRINK COLA', 'BUY WAR BONDS', 'VISIT GZOWO SPRINGS'] : y < 1962 ? ['NEW CARS 1957', 'DRIVE-IN TONIGHT', 'VISIT GZOWO SPRINGS', 'MOTEL NEXT EXIT'] : y < 2020 ? ['VISIT GZOWO SPRINGS', 'MOTEL NEXT EXIT', 'DRINK COLA', 'VISIT GZOWO SPRINGS'] : ['VISIT GZOWO SPRINGS', 'ROADSTER 88  0-60 IN 1.1 S', 'VISIT GZOWO SPRINGS', 'ROADSTER 88  0-60 IN 1.1 S']);
const GAS = (y) => (y < 1930 ? 'GAS 21 CENTS' : y < 1950 ? 'GAS 19 CENTS' : y < 1965 ? 'GAS 29 CENTS' : y < 1985 ? 'GAS 55 CENTS' : y < 2000 ? 'GAS 1.19' : y < 2010 ? 'GAS 2.49' : 'GAS 3.99');
const PAINTS = [C.white, [0.62, 0.72, 0.68], [0.75, 0.62, 0.42], [0.55, 0.22, 0.15], [0.72, 0.68, 0.6], [0.36, 0.46, 0.52], [0.8, 0.74, 0.58]];
const DECADE_PAINTS = { 1950: [[0.62, 0.8, 0.72], [0.85, 0.62, 0.62], [0.88, 0.82, 0.6], [0.6, 0.72, 0.82], [0.82, 0.8, 0.76]], 1960: [[0.62, 0.8, 0.72], [0.85, 0.62, 0.62], [0.88, 0.82, 0.6], [0.6, 0.72, 0.82], [0.82, 0.8, 0.76]], 1970: [[0.62, 0.42, 0.2], [0.72, 0.58, 0.3], [0.45, 0.48, 0.25], [0.7, 0.62, 0.48], [0.5, 0.3, 0.18]], 1980: [[0.85, 0.85, 0.82], [0.45, 0.65, 0.7], [0.8, 0.55, 0.6], [0.7, 0.7, 0.72], [0.5, 0.55, 0.7]], 1990: [[0.85, 0.85, 0.82], [0.3, 0.55, 0.58], [0.75, 0.68, 0.5], [0.6, 0.62, 0.66], [0.62, 0.3, 0.35]] };
const BRICKS = [C.brick, [0.42, 0.2, 0.12], [0.5, 0.36, 0.25], [0.6, 0.5, 0.38], [0.32, 0.14, 0.1]];

export function planSites(S, eraId, year, P) {
  const sys = S.sys, V = sys.valley, T = S.town(), sites = [];
  const add = (key, type, x, z, yaw, p = {}, tags = []) => sites.push({ key, type, x, z, yaw, p, tags });
  const R = rng(hashStr('plan' + eraId));
  const style = P.town, y = year;

  if (style === 'hadean' || style === 'vents') {
    const ctx = sys.eraContext(eraId), big = style === 'hadean';
    ctx.volcanoes.forEach((v, i) => { for (let j = 0; j < (big ? 2 : 1); j++) { const a = i * 2.1 + j * 2.6, r = v.r * (0.95 + j * 0.15); add(`basalt:${i}:${j}`, 'basaltColumns', v.x + Math.cos(a) * r, v.z + Math.sin(a) * r, a, { n: big ? 26 : 14, h: big ? 7 + j * 4 : 4, r: big ? 10 + j * 3 : 7, rng: rng(i * 31 + j) }); } if (!big) add(`vent:${i}`, 'vents', v.x + Math.cos(i) * v.r * 0.6, v.z + Math.sin(i) * v.r * 0.6, 0, { n: 6, rng: rng(70 + i) }); });
    const lake = sys.region('lake');
    if (big && lake) lake.poly.forEach((p, i) => { if (i % 9 === 0) add(`basaltL:${i}`, 'basaltColumns', p[0] * 1.08 + (lake.center ? -lake.center[0] * 0.08 : 0), p[1] * 1.08 + (lake.center ? -lake.center[1] * 0.08 : 0), i, { n: 18, h: 6, r: 8, rng: rng(500 + i) }); });
    return sites;
  }
  if (style === 'crystal') {
    const spots = sys.pickSpots(16, 280, (x, z) => (sys.roadDist(x, z) < 30 ? -1 : 0.5 + Math.sin(x * 0.003) * Math.cos(z * 0.004)), 5);
    spots.forEach((p, i) => add(`crystal:${i}`, 'crystals', p.x, p.z, i, { n: 5 + (i % 4) * 2, h: 10 + (i % 5) * 6, r: 5 + (i % 3) * 3, rng: rng(900 + i) }, []));
    return sites;
  }
  if (style === 'village') { village(sys, add, y); return sites; }
  if (!T) return sites;

  const railX = T.rail ? S.lineX(T.rail, T.p0[1]) : null;
  const mainZ = T.p0[1];
  const lastCross = T.cross.length ? T.cross[T.cross.length - 1].s : 300;
  const missionAt = T.at(Math.min(T.len - 30, lastCross + 64), -1, 24);
  const keepMission = y >= 1769 && !['ruins', 'rewild', 'scifi', 'buried', 'none'].includes(style);
  if (keepMission) {
    const wear = style === 'mission' ? (y < 1834 ? 0.12 : 0.55) : y < 1900 ? 0.6 : y < 1920 ? 0.4 : 0.08;
    add('site:mission', 'missionChurch', missionAt.x, missionAt.z, missionAt.yaw, { wear, l: 34 }, ['mission', 'old']);
    const ar = T.at(Math.min(T.len - 30, lastCross + 64) - 26, -1, 24);
    add('site:convento', 'arcade', ar.x, ar.z, ar.yaw, { l: 30, wear, ruin: style === 'mission' ? y >= 1834 : y < 1915 }, ['mission', 'old']);
  }
  if (style === 'mission') { mission(S, T, add, y, R); return sites; }
  if (style === 'camp') { camp(S, T, add, y, R); return sites; }
  if (style === 'buried') {
    const reg = T.reg; let cx = 0, cz = 0; for (const [x, z] of reg.poly) { cx += x; cz += z; } cx /= reg.poly.length; cz /= reg.poly.length;
    [[0, 0, 40], [-120, 90, 30], [110, -100, 34], [-150, -120, 22], [140, 110, 26]].forEach(([dx, dz, h], i) => add(`spire:${i}`, 'iceSpire', cx + dx, cz + dz, i * 0.7, { h, r: 7 + h / 8 }, ['scifi']));
    if (T.hwy) add('arch:1', 'arch', S.lineX(T.hwy, 600), 600, 0, { r: 64 }, ['scifi']);
    return sites;
  }
  if (style === 'none') return sites;

  const town = ['frontier', 'early', 'mid', 'modern', 'future', 'sky', 'space'].includes(style);
  const restored = ['modern', 'future', 'sky', 'space'].includes(style);
  const growthEra = style !== 'frontier';
  if (town || style === 'ruins' || style === 'rewild') {
    const brickShare = style === 'early' ? lerp(0.3, 0.8, (y - 1900) / 40) : style === 'mid' ? lerp(0.65, 0.42, (y - 1950) / 50) : 0;
    const dsign = DECADE_SIGNS[decade(y)];
    OLD.forEach(([side, s, w, type, p, built], i) => {
      if (!T.free(s, w)) return;
      const a = T.at(s, side, 3.2), key = `town:${i}`;
      if (style === 'frontier') { if (y >= built) add(key, type, a.x, a.z, a.yaw, { ...p, w, seed: i, lit: 0.25, wear: lerp(0.15, 0.35, (y - built) / 20) }, ['old']); return; }
      if (style === 'ruins') { add(key, type === 'bank' ? 'ruinShell' : 'rubblePile', a.x, a.z, a.yaw, type === 'bank' ? { w, d: 15, h: lerp(5, 3, (y - 2500) / 400), mat: 'masonry', tint: C.brick, pat: 0, rng: rng(i) } : { w, d: 12, n: 10, tint: [0.3, 0.26, 0.2], mat: 'wood', rng: rng(i) }, ['old']); return; }
      if (style === 'rewild') { if (i % 3 === 0) add(key, 'rubblePile', a.x, a.z, a.yaw, { w: w * 0.8, d: 10, n: y > 5000 ? 5 : 9, tint: [0.2, 0.24, 0.14], mat: 'masonry', rng: rng(i) }, ['old']); return; }
      const brick = style === 'early' || style === 'mid' ? ((i * 0.618) % 1) < brickShare && type !== 'hotel' : false;
      const sign = restored ? (style === 'modern' && y < 2020 ? dsign[i] : SIGNS_2026[p.sign] || p.sign) : dsign[i];
      if (brick) add(key, 'brickBlock', a.x, a.z, a.yaw, { w, d: 16, floors: 2 + (i % 3 === 0 ? 1 : 0), color: BRICKS[i % BRICKS.length], seed: i, lit: 0.65, sign, glow: style === 'mid' ? 1.4 : 0.6, awningTint: [[0.45, 0.1, 0.08], [0.12, 0.3, 0.2], [0.15, 0.2, 0.4]][i % 3] }, ['old']);
      else add(key, type, a.x, a.z, a.yaw, { ...p, w, seed: i, lit: style === 'early' ? 0.55 : 0.7, wear: style === 'early' ? 0.18 : style === 'mid' ? 0.12 : style === 'space' ? 0.02 : 0.06, bare: false, color: type === 'bank' ? C.brick : style === 'mid' ? DECADE_PAINTS[decade(y)][i % 5] : PAINTS[i % PAINTS.length], sign, glow: style === 'mid' ? 1.2 : 0.8, roofTint: [0.32, 0.33, 0.35] }, ['old']);
    });
    const ch = T.at(Math.min(lastCross - 30, 330), 1, 6);
    if (style === 'frontier' && y >= 1865) add('town:church', 'church', ch.x, ch.z, ch.yaw, {}, ['old']);
    if (town && style !== 'frontier') add('town:church', 'church', ch.x, ch.z, ch.yaw, { wear: style === 'early' ? 0.15 : 0.05 }, ['old']);
    const lv = T.at(212, -1, 14);
    if (style === 'frontier') add('town:livery', 'barn', lv.x, lv.z, lv.yaw, { sign: 'LIVERY' }, ['old']);
    if (style === 'early') add('town:livery', 'barn', lv.x, lv.z, lv.yaw, { sign: y < 1915 ? 'LIVERY' : 'GARAGE', wear: 0.25 }, ['old']);
    if (style === 'mid' || style === 'modern') add('town:livery', 'barn', lv.x, lv.z, lv.yaw, { sign: 'ANTIQUES', wear: 0.15 }, ['old']);
    if (style === 'future' || style === 'sky') add('town:livery', 'barn', lv.x, lv.z, lv.yaw, { sign: 'VERTICAL FARM', wear: 0.05, color: [0.4, 0.12, 0.08] }, ['old']);
    if (style === 'space') add('town:livery', 'barn', lv.x, lv.z, lv.yaw, { sign: 'MUSEUM OF THE ROAD', wear: 0.02, color: [0.4, 0.12, 0.08] }, ['old']);
    if (railX !== null) {
      const dep = { x: railX - 6.6, z: mainZ + T.hw + 3 + 20 + 3 }, ry = PI / 2;
      const railLive = y >= 1869;
      if ((style === 'frontier' && railLive) || style === 'early' || style === 'mid') add('site:depot', 'depot', dep.x, dep.z, ry, { sign: 'GZOWO SPRINGS', wear: style === 'mid' ? 0.2 : 0.3 }, ['old', 'rail']);
      if (restored) add('site:depot', 'depot', dep.x, dep.z, ry, { sign: 'HISTORIC DEPOT MUSEUM', wear: 0.05, color: [0.7, 0.55, 0.25], glow: 0.6 }, ['old', 'rail']);
      if (style === 'ruins') add('site:depot', 'rubblePile', dep.x, dep.z, ry, { w: 20, d: 7, n: 16, tint: [0.32, 0.26, 0.2], mat: 'wood', rng: rng(77) }, ['old']);
      if ((style === 'frontier' && railLive) || style === 'early') {
        add('site:watertower', 'waterTower', railX - 7.5, mainZ - T.hw - 16, 0, { sign: 'WATER' }, ['rail']);
        add('site:loco', 'locomotive', railX, mainZ + T.hw + 60, 0, { sign: 'GZOWO SPRINGS', lamp: 1.2 }, ['rail', 'train']);
        add('site:car1', 'railcar', railX, mainZ + T.hw + 42.5, 0, {}, ['rail', 'train']);
        add('site:car2', 'railcar', railX, mainZ + T.hw + 30.9, 0, { passenger: true }, ['rail', 'train']);
      }
      if (restored || style === 'mid') { const lp = T.at(232, -1, 9); add('site:loco', 'locomotive', lp.x, lp.z, lp.yaw + PI / 2, { sign: 'GZOWO SPRINGS', rust: 0.0 }, ['old']); }
      if (style === 'ruins') { const lp = T.at(232, -1, 9); add('site:loco', 'locomotive', lp.x, lp.z, lp.yaw + PI / 2 + 0.2, { rust: 1 }, ['old']); }
    }
    if (town) {
      const PR = rng(hashStr('props' + eraId));
      OLD.forEach(([side, s, w, type, , built], i) => {
        if (!T.free(s, w) || (style === 'frontier' && y < built)) return;
        const at = (off, along) => T.at(s + along, side, off);
        if (style === 'frontier') {
          const a = at(-0.9, -w * 0.3), b = at(-0.9, w * 0.32);
          if (['hotel', 'falseFront'].includes(type) && i % 2 === 0) add(`prop:hitch:${i}`, 'prop', a.x, a.z, a.yaw, { kind: 'hitch' }, ['old', 'prop']);
          if (i % 3 === 1) add(`prop:trough:${i}`, 'prop', a.x, a.z, a.yaw, { kind: 'trough' }, ['old', 'prop']);
          if (i % 3 !== 1) add(`prop:barrels:${i}`, 'prop', b.x, b.z, b.yaw + 0.1, { kind: PR() < 0.5 ? 'barrels' : 'crates', rng: rng(i + 7) }, ['old', 'prop']);
          if (i % 5 === 2) { const c = at(-3.2, 2); add(`prop:wagon:${i}`, 'prop', c.x, c.z, c.yaw + PI / 2 + (PR() - 0.5) * 0.3, { kind: 'wagon', cover: i % 2 === 0 }, ['old', 'prop']); }
        } else if (style === 'early' && y < 1925) {
          const a = at(-0.9, -w * 0.3);
          if (i % 3 === 0) add(`prop:hitch:${i}`, 'prop', a.x, a.z, a.yaw, { kind: 'hitch' }, ['old', 'prop']);
          if (i % 4 === 1) { const b = at(-0.9, w * 0.32); add(`prop:barrels:${i}`, 'prop', b.x, b.z, b.yaw, { kind: 'crates', rng: rng(i + 7) }, ['old', 'prop']); }
        } else if (i % 2 === 0) {
          const a = at(-0.9, -w * 0.25), b = at(-0.9, w * 0.3);
          add(`prop:bench:${i}`, 'prop', a.x, a.z, a.yaw, { kind: 'bench' }, ['prop']);
          add(`prop:bin:${i}`, 'prop', b.x, b.z, b.yaw, { kind: style === 'future' || style === 'sky' || style === 'space' ? 'planter' : 'bin' }, ['prop']);
        }
      });
      if (style === 'frontier') { const lv2 = T.at(212, -1, 3); add('prop:hay:1', 'prop', lv2.x, lv2.z, lv2.yaw, { kind: 'hay', rng: rng(3) }, ['old', 'prop']); }
    }
    const cabins = [[150, 1, 40], [150, 1, 75], [150, -1, 40], [150, -1, 80], [270, 1, 45], [270, -1, 50], [290, 1, 90], [250, -1, 95], [320, -1, 40], [360, 1, 60]];
    if (style === 'frontier') {
      cabins.forEach(([s, side, off], i) => { if (y < 1862 + i * 3) return; const a = T.at(s, side, off); if (!T.free(s, 10)) a.x += T.d[0] * 14; add(`cabin:${i}`, 'cabin', a.x, a.z, a.yaw + (i % 2 ? 0.25 : -0.2), { porch: i % 3 !== 2, seed: i, lit: 0.2, bare: i % 2 === 0, color: i % 2 ? C.white : C.bare, pat: i % 2 ? 0 : 1, roofTint: i % 3 ? C.shingle : C.tin, roofPat: i % 3 ? 1 : 0 }, ['old']); });
      if (y >= 1875) { const wm = T.at(240, -1, 70); add('site:windmill', 'windmill', wm.x, wm.z, 0.4, {}, []); }
    }
    if (style === 'early' || style === 'mid') {
      const share = style === 'early' ? lerp(0.4, 1, (y - 1900) / 25) : 1;
      cabins.forEach(([s, side, off], i) => { const a = T.at(s, side, off); if (!T.free(s, 10)) a.x += T.d[0] * 14; if ((i * 0.37) % 1 < share) add(`cabin:${i}`, 'bungalow', a.x, a.z, a.yaw + (i % 2 ? 0.25 : -0.2), { seed: i, lit: 0.55, color: [[0.62, 0.55, 0.42], [0.42, 0.5, 0.46], [0.78, 0.74, 0.66], [0.55, 0.36, 0.24]][i % 4] }, ['old']); else add(`cabin:${i}`, 'cabin', a.x, a.z, a.yaw, { porch: true, seed: i, lit: 0.4, color: C.white, roofTint: C.shingle, roofPat: 1, wear: 0.3 }, ['old']); });
      if (style === 'early' || y < 1965) { const wm = T.at(240, -1, 70); add('site:windmill', 'windmill', wm.x, wm.z, 0.4, {}, []); }
    }
    if (growthEra && (town || style === 'ruins')) {
      const lots = [];
      for (const c of T.cross) for (const side of [-1, 1]) for (let k = 0; k < 4; k++) lots.push({ s: c.s, side, off: 30 + k * 34, cross: c });
      const fill = style === 'early' ? lerp(0.12, 0.45, (y - 1900) / 50) : style === 'mid' ? lerp(0.5, 0.9, (y - 1950) / 45) : 1;
      lots.forEach((L, i) => {
        if (R() < 0.15) return;
        for (const ss of [-1, 1]) {
          const cx = T.p0[0] + T.d[0] * (L.s + ss * (L.cross.hw + 9)) + T.n[0] * L.side * (T.hw + L.off), cz = T.p0[1] + T.d[1] * (L.s + ss * (L.cross.hw + 9)) + T.n[1] * L.side * (T.hw + L.off);
          const yaw = Math.atan2(-ss * T.d[0], -ss * T.d[1]);
          const key = `lot:${i}:${ss}`, alt = (i + (ss > 0 ? 1 : 0)) % 2 === 0, h = hashStr(key) / 4294967296;
          if (h > fill) continue;
          if (style === 'early') add(key, 'bungalow', cx + T.d[0] * ss * 4, cz + T.d[1] * ss * 4, yaw, { w: 9 + (i % 3), d: 8.5, seed: i, lit: 0.55, color: [[0.62, 0.55, 0.42], [0.42, 0.5, 0.46], [0.78, 0.74, 0.66], [0.55, 0.36, 0.24]][i % 4] }, ['growth']);
          else if (style === 'mid' || style === 'modern' || (style === 'future' && y < 2065 && !(alt && h < 0.3))) add(key, 'ranch', cx + T.d[0] * ss * 4, cz + T.d[1] * ss * 4, yaw, { w: 13 + R() * 4, d: 9 + R() * 2, color: [C.stucco, C.stucco2, [0.78, 0.74, 0.66], [0.6, 0.62, 0.58]][i % 4], seed: i, lit: 0.6, roofPat: i % 3 === 0 ? 1 : 2, roofTint: i % 3 === 0 ? [0.25, 0.22, 0.2] : C.tile }, ['growth']);
          else if (style === 'future' && alt) add(key, 'midrise', cx + T.d[0] * ss * 10, cz + T.d[1] * ss * 10, yaw, { w: 22, d: 16, floors: 3 + (i % 3), seed: i, sign: i % 5 === 0 ? (y < 2065 ? 'GZOWO SPRINGS 2050' : 'GZOWO SPRINGS 2080') : null }, ['growth']);
          else if (style === 'sky') { if (alt) add(key, 'tower', cx + T.d[0] * ss * 12, cz + T.d[1] * ss * 12, yaw, { w: 20 + (i % 3) * 4, d: 20, h: 60 + ((i * 37) % 120) * lerp(0.7, 1.2, (y - 2120) / 130), seed: i, sign: i % 6 === 0 ? 'GZOWO SPRINGS 2150' : null }, ['growth']); else if (h < 0.6) add(key, 'midrise', cx + T.d[0] * ss * 10, cz + T.d[1] * ss * 10, yaw, { w: 22, d: 16, floors: 5 + (i % 4), seed: i }, ['growth']); }
          else if (style === 'space') { if (alt && h < 0.5) add(key, 'spire', cx + T.d[0] * ss * 12, cz + T.d[1] * ss * 12, i * 0.7, { h: 50 + ((i * 29) % 60), r: 5 + (i % 3) }, ['growth', 'scifi']); }
          else if (style === 'ruins' && alt) add(key, 'ruinShell', cx + T.d[0] * ss * 10, cz + T.d[1] * ss * 10, yaw, { w: 22, d: 16, h: (3 + (i % 3)) * 3.6 * lerp(0.8, 0.45, (y - 2500) / 400), rng: rng(i * 7 + (ss > 0 ? 1 : 0)), tint: [0.62, 0.62, 0.6], pat: 2, slabs: 2 }, ['growth']);
        }
      });
      const fuel = T.at(Math.max(60, (T.cross[0] ? T.cross[0].s : 140) - 70), -1, 60);
      const mall = T.at(Math.max(60, (T.cross[0] ? T.cross[0].s : 140) - 70), 1, 62);
      const sch = T.at(lastCross + 40, 1, 40);
      if (style === 'early' && y >= 1915) add('site:fuel', 'oldStation', fuel.x, fuel.z, fuel.yaw, { sign: y < 1920 ? 'GARAGE' : GAS(y), seed: 3 }, ['growth']);
      if (style === 'mid') { if (y < 1965) add('site:fuel', 'oldStation', fuel.x, fuel.z, fuel.yaw, { sign: GAS(y), seed: 3, accent: [0.7, 0.1, 0.06] }, ['growth']); else add('site:fuel', 'gasStation', fuel.x, fuel.z, fuel.yaw, { sign1: 'GZOWO FUEL', sign2: GAS(y) }, ['growth']); }
      if (style === 'modern') add('site:fuel', 'gasStation', fuel.x, fuel.z, fuel.yaw, { sign1: 'GZOWO FUEL', sign2: y < 2020 ? GAS(y) : '88 MART' }, ['growth']);
      if (style === 'future' || style === 'sky') add('site:fuel', 'evHub', fuel.x, fuel.z, fuel.yaw, { sign: style === 'sky' ? 'SKYPORT' : y < 2065 ? 'CHARGE  5 MIN' : 'CHARGE  2 MIN' }, ['growth']);
      if (style === 'ruins') add('site:fuel', 'rubblePile', fuel.x, fuel.z, fuel.yaw, { w: 20, d: 14, n: 18, tint: [0.5, 0.5, 0.5], mat: 'metal', aux: [0, 0.8, 0.5, 1], rng: rng(9) }, ['growth']);
      if (style === 'early' && y >= 1912) add('site:mall', 'theatre', mall.x, mall.z, mall.yaw, { w: 18, d: 22, sign: y < 1930 ? 'PICTURE SHOW' : 'THE PALACE', seed: 99 }, ['growth']);
      if (style === 'mid') { if (y < 1962) add('site:mall', 'theatre', mall.x, mall.z, mall.yaw, { w: 18, d: 22, sign: 'THE PALACE', seed: 99 }, ['growth']); else add('site:mall', 'stripMall', mall.x, mall.z, mall.yaw, { w: 44, signs: y < 1980 ? ['PIZZA', 'LAUNDROMAT', 'RECORDS'] : y < 1990 ? ['VIDEO RENTAL', 'ARCADE', 'PIZZA'] : ['VIDEO RENTAL', 'PAGERS', 'COFFEE'] }, ['growth']); }
      if (style === 'modern') add('site:mall', 'stripMall', mall.x, mall.z, mall.yaw, { w: 44, signs: y < 2010 ? ['INTERNET CAFE', 'CELL PHONES', 'DVD RENTAL'] : y < 2020 ? ['COFFEE', 'PHONE REPAIR', 'HARDWARE'] : ['DINER', 'HARDWARE', 'MOTEL'] }, ['growth']);
      if (style === 'future') add('site:mall', 'midrise', mall.x, mall.z, mall.yaw, { w: 34, d: 18, floors: y < 2065 ? 4 : 6, sign: y < 2065 ? 'DRONE DELIVERY' : 'GZOWO TRANSIT', seed: 99 }, ['growth']);
      if (style === 'sky') add('site:mall', 'tower', mall.x, mall.z, mall.yaw, { w: 34, d: 30, h: lerp(180, 260, (y - 2120) / 130), sign: 'GZOWO ARCOLOGY', seed: 99, crown: [1, 0.8, 0.5] }, ['growth']);
      if (style === 'ruins') add('site:mall', 'ruinShell', mall.x, mall.z, mall.yaw, { w: 34, d: 18, h: lerp(16, 9, (y - 2500) / 400), rng: rng(99), tint: [0.62, 0.62, 0.6], pat: 2, slabs: 3 }, ['growth']);
      if ((style === 'mid' && y >= 1955) || style === 'modern') add('site:school', 'stripMall', sch.x, sch.z, sch.yaw, { w: 50, signs: ['SCHOOL', 'LIBRARY'], color: [0.72, 0.66, 0.58] }, ['growth']);
      if (style === 'future' || style === 'sky') add('site:school', 'midrise', sch.x, sch.z, sch.yaw, { w: 40, d: 20, floors: 3, sign: 'LIBRARY', seed: 55 }, ['growth']);
      if (style === 'ruins') add('site:school', 'ruinShell', sch.x, sch.z, sch.yaw, { w: 40, d: 20, h: 9, rng: rng(55), tint: [0.62, 0.62, 0.6], pat: 2 }, ['growth']);
      if (style === 'early' && y < 1925) { const a = T.at(lastCross + 40, 1, 40); add('site:school', 'bungalow', a.x, a.z, a.yaw, { w: 16, d: 12, color: [0.55, 0.22, 0.15], seed: 5, lit: 0.4 }, ['growth']); }
      if (style === 'early' && y >= 1925) add('site:school', 'brickBlock', sch.x, sch.z, sch.yaw, { w: 30, d: 18, floors: 2, color: [0.5, 0.3, 0.2], sign: 'SCHOOL', seed: 55, awning: false }, ['growth']);
      const hw0 = T.hwy;
      if (hw0 && style === 'mid') {
        const sx = (z) => S.lineX(hw0, z) + hw0.width / 2;
        add('site:diner', 'diner', sx(mainZ - 360) + 34, mainZ - 360, -PI / 2, { sign: y < 1975 ? 'DINER' : 'DINER  OPEN 24 HRS', seed: 7 }, ['growth']);
        add('site:motel', 'motel', sx(mainZ - 470) + 40, mainZ - 470, -PI / 2, { sign: 'MOTEL', sign2: 'VACANCY', rooms: 10, seed: 11 }, ['growth']);
        if (y < 1986) add('site:drivein', 'driveIn', sx(mainZ + 520) + 90, mainZ + 520, -PI / 2, { sign: 'DRIVE-IN', show: true }, ['growth']);
        if (y >= 1985) add('site:bigbox', 'bigBox', sx(mainZ + 700) + 80, mainZ + 700, -PI / 2, { sign: 'MEGA MART' }, ['growth']);
      }
      if (hw0 && style === 'modern') {
        const sx = (z) => S.lineX(hw0, z) + hw0.width / 2;
        add('site:diner', 'diner', sx(mainZ - 360) + 34, mainZ - 360, -PI / 2, { sign: 'DINER  OPEN 24 HRS', seed: 7 }, ['growth']);
        add('site:bigbox', 'bigBox', sx(mainZ + 700) + 80, mainZ + 700, -PI / 2, { sign: 'MEGA MART' }, ['growth']);
      }
      if (hw0 && (style === 'mid' && y >= 1990 || style === 'modern' || (style === 'future' && y < 2065))) add('site:cell', 'cellTower', S.lineX(hw0, mainZ + 300) + hw0.width / 2 + 40, mainZ + 300, 0, { h: 34 }, ['growth']);
    }
    const lamps = style === 'early' ? (y < 1915 ? 'gas' : 'electric') : style === 'mid' ? 'cobra' : restored ? (style === 'modern' ? 'classic' : 'future') : style === 'ruins' ? 'ruin' : null;
    if (lamps) for (let s = 40; s < Math.min(T.len - 20, 420); s += 32) for (const side of [-1, 1]) {
      if (!T.free(s, 3)) continue;
      const a = T.at(s, side, 0.6);
      if (lamps === 'ruin') { if (R() < 0.35) add(`light:${s}:${side}`, 'streetLight', a.x, a.z, a.yaw + (R() - 0.5) * 0.6, { dark: true, rust: 1, h: 4 + R() * 4.5 }, []); }
      else if (lamps === 'gas' || lamps === 'electric') add(`light:${s}:${side}`, 'smallLamp', a.x, a.z, a.yaw, { style: lamps === 'gas' ? 'gas' : 'twin' }, []);
      else if (lamps === 'cobra') add(`light:${s}:${side}`, 'cobraLight', a.x, a.z, a.yaw, { sodium: y >= 1970 }, []);
      else add(`light:${s}:${side}`, 'streetLight', a.x, a.z, a.yaw, { style: lamps }, []);
    }
  }

  if (T.hwy) {
    const hw = T.hwy, sideX = (z) => S.lineX(hw, z) + (hw.width / 2 + 9);
    const poles = style === 'early' && y < 1925 ? 'tele' : (style === 'early' || style === 'mid' || style === 'modern' || (style === 'future' && y < 2065)) ? 'power' : null;
    if (poles) {
      let prev = null;
      for (let z = -2000; z <= 2000; z += 55) {
        const x = sideX(z);
        if (poles === 'power') add(`pp:${z}`, 'powerPole', x, z, PI / 2, { transformer: z % 440 === 0 }, []);
        else add(`pp:${z}`, 'telegraphPole', x, z, PI / 2, {}, []);
        if (prev) sites.push({ key: `wire:${z}`, type: 'wires', a: prev, b: [x, z], h: poles === 'power' ? 10.2 : 7.0, tags: [] });
        prev = [x, z];
      }
    }
    if ((style === 'early' && y >= 1920) || style === 'mid' || style === 'modern' || (style === 'future' && y < 2065)) {
      const texts = BILLBOARDS(y);
      [[-1150, PI], [-650, PI], [450, 0], [1050, 0]].forEach(([z, yaw], i) => add(`bb:${z}`, 'billboard', sideX(z) + 22, z, yaw, { sign: texts[i], glow: style === 'mid' ? 0.9 : 0.5 }, []));
    }
    if ((style === 'mid' && y >= 1958) || style === 'modern' || (style === 'future' && y < 2065)) {
      add('hws:1', 'hwSign', sideX(mainZ - 600) - 3, mainZ - 600, PI, { sign: 'GZOWO SPRINGS  EXIT 88' }, []);
      add('hws:2', 'hwSign', sideX(mainZ - 280) - 3, mainZ - 280, PI, { sign: 'MAIN ST  NEXT LEFT' }, []);
    }
    if (style === 'early' && y >= 1926) add('hws:1', 'hwSign', sideX(mainZ - 600) - 3, mainZ - 600, PI, { sign: 'ROUTE 88', w: 3 }, []);
    const maglev = (style === 'future' && y >= 2065) || style === 'sky' || (style === 'ruins' && y < 2900);
    if (maglev) {
      const mx = (z) => S.lineX(hw, z) + hw.width / 2 + 14;
      for (let z = -2000; z <= 2000; z += 40) sites.push({ key: `mag:${z}`, type: 'maglev', x: mx(z), z, z1: z + 40, x1: mx(z + 40), tags: [], ruin: style === 'ruins' });
      if (style !== 'ruins') for (const [z, sign, yaw] of [[-900, style === 'sky' ? 'MAGLEV  4 MIN' : 'GZOWO TRANSIT', PI], [700, style === 'sky' ? 'SKYPORT' : 'CHARGE  2 MIN', 0]]) add(`bb:${z}`, 'billboard', mx(z) + 26, z, yaw, { sign, glow: 1.5 }, []);
    }
  }
  if (T.rail && y >= 1869 && !['scifi', 'space', 'rewild', 'buried'].includes(style)) {
    sites.push({ key: 'rail', type: 'rail', era: eraId, year: y, ruin: style === 'ruins', tags: [] });
    if (style === 'frontier' || (style === 'early' && y < 1920)) for (let z = -2000; z <= 2000; z += 45) add(`tg:${z}`, 'telegraphPole', S.lineX(T.rail, z) + 5.5, z, PI / 2, {}, []);
  }
  if (style === 'frontier' && y >= 1861 && y < 1869 && T.hwy) for (let z = -2000; z <= 2000; z += 45) add(`tg:${z}`, 'telegraphPole', S.lineX(T.hwy, z) + T.hwy.width / 2 + 6, z, PI / 2, {}, []);
  const turbines = style === 'modern' && y >= 2010 ? 3 : style === 'future' ? (y < 2065 ? 6 : 9) : style === 'sky' ? 9 : style === 'ruins' ? 9 : style === 'rewild' && y < 4000 ? 4 : 0;
  if (turbines) {
    const spots = sys.pickSpots(9, 260, (x, z) => { const h = V.heightAt(x, z); if (h < 160) return -1; return h / 400 - Math.abs(Math.hypot(x, z) - 1500) / 3000; }, 3);
    spots.slice(0, turbines).forEach((p, i) => sites.push({ key: `turbine:${i}`, type: 'turbine', x: p.x, z: p.z, yaw: -0.6 + i * 0.07, tags: [], ruin: style === 'ruins' || style === 'rewild', broken: (style === 'ruins' && i % 3 !== 0) || style === 'rewild' }));
  }
  if ((style === 'future' && y >= 2045) || style === 'sky' || (style === 'ruins' && y < 2800)) { const lake = sys.region('lake'); if (lake) sites.push({ key: 'solar', type: 'solar', poly: lake.poly, tags: [], ruin: style === 'ruins' }); }
  if ((style === 'early' && y < 1946) || (style === 'frontier' && y >= 1892)) {
    const spots = sys.pickSpots(style === 'frontier' ? 2 : y < 1925 ? 7 : 4, 120, (x, z) => { const h = V.heightAt(x, z); if (h < 25 || h > 140 || sys.roadDist(x, z) < 40 || sys.inRegion('town', x, z, 60) || sys.inRegion('lake', x, z, 40)) return -1; return 1 - Math.abs(x - 300) / 1500; }, 9);
    spots.forEach((p, i) => add(`derrick:${i}`, 'derrick', p.x, p.z, i * 0.4, { h: 22 + (i % 3) * 3 }, []));
  }
  if (style === 'scifi' || style === 'space') {
    const reg = T.reg; let cx = 0, cz = 0; for (const [x, z] of reg.poly) { cx += x; cz += z; } cx /= reg.poly.length; cz /= reg.poly.length;
    const k = style === 'space' ? 0.6 : 1;
    [[0, 0, 165], [-120, 90, 120], [110, -100, 135], [-150, -120, 95], [140, 110, 105]].forEach(([dx, dz, h], i) => { if (style !== 'space' || i % 2 === 0) add(`spire:${i}`, 'spire', cx + dx, cz + dz, i * 0.7, { h: h * k, r: 7 + h * k / 30 }, ['scifi']); });
    if (T.hwy) add('arch:1', 'arch', S.lineX(T.hwy, 600), 600, 0, { r: 64 }, ['scifi']);
    const mesa = sys.region('mesa');
    if (mesa) { const c = mesa.center || [mesa.poly.reduce((a, p) => a + p[0], 0) / mesa.poly.length, mesa.poly.reduce((a, p) => a + p[1], 0) / mesa.poly.length]; add('pad:mesa', 'floatPad', c[0], c[1], 0, { r: 22, y: 0.4 }, ['scifi']); }
    [[-450, 230, 32], [150, -300, 40], [-650, 900, 26]].forEach(([x, z, yy], i) => add(`pad:${i}`, 'floatPad', x, z, 0, { r: 15, y: yy }, ['scifi']));
    for (const rd of sys.roadList) if (rd.kind === 'highway' || rd.type === 'loop' || rd.kind === 'road') sites.push({ key: 'glow:' + rd.id, type: 'roadglow', road: rd, tags: [] });
  }
  if (style === 'sky') {
    const mesa = sys.region('mesa');
    if (mesa) { const c = mesa.center || [mesa.poly.reduce((a, p) => a + p[0], 0) / mesa.poly.length, mesa.poly.reduce((a, p) => a + p[1], 0) / mesa.poly.length]; add('pad:mesa', 'floatPad', c[0], c[1], 0, { r: 22, y: 0.4 }, ['scifi']); }
  }
  return sites;
}

function village(sys, add, y) {
  const big = y >= -3000;
  const spots = [];
  const lake = sys.region('lake'), town = sys.region('town'), wash = sys.region('wash');
  const cen = (r) => r.center || [r.poly.reduce((a, p) => a + p[0], 0) / r.poly.length, r.poly.reduce((a, p) => a + p[1], 0) / r.poly.length];
  if (lake) { const c = cen(lake), p = lake.poly[Math.floor(lake.poly.length * 0.62)]; spots.push({ x: c[0] + (p[0] - c[0]) * 1.32, z: c[1] + (p[1] - c[1]) * 1.32, shore: c }); const q = lake.poly[Math.floor(lake.poly.length * 0.12)]; spots.push({ x: c[0] + (q[0] - c[0]) * 1.36, z: c[1] + (q[1] - c[1]) * 1.36, shore: c }); }
  if (town) { const c = cen(town); spots.push({ x: c[0] + 40, z: c[1] - 20 }); }
  if (wash && big) { const c = cen(wash); spots.push({ x: c[0] + 30, z: c[1] + 25 }); }
  const V = sys.valley;
  spots.forEach((s, vi) => {
    const R = rng(4000 + vi), n = big ? 6 + Math.floor(R() * 4) : 3;
    const ring = big ? 22 : 12;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + R() * 0.3, r = ring * (0.8 + R() * 0.4), x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r; add(`hut:${vi}:${i}`, 'tuleHut', x, z, Math.atan2(s.x - x, s.z - z), { r: 2.2 + R() * 0.8, h: 2.3 + R() * 0.7, rng: rng(vi * 100 + i) }, ['village']); }
    add(`fire:${vi}`, 'firePit', s.x, s.z, 0, {}, ['village']);
    if (big) {
      for (let i = 0; i < 3; i++) { const a = R() * 6.28, r = ring + 8 + R() * 6; add(`granary:${vi}:${i}`, 'granary', s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, 0, { r: 0.8 + R() * 0.3 }, ['village']); }
      const a = R() * 6.28; add(`lodge:${vi}`, 'sweatLodge', s.x + Math.cos(a) * (ring + 18), s.z + Math.sin(a) * (ring + 18), a, { r: 4 }, ['village']);
      for (let i = 0; i < 2; i++) { const b = R() * 6.28, r = ring * 0.5; add(`rack:${vi}:${i}`, 'dryingRack', s.x + Math.cos(b) * r, s.z + Math.sin(b) * r, b, { w: 3 }, ['village']); }
    }
    if (s.shore) for (let i = 0; i < 3; i++) { const dx = s.shore[0] - s.x, dz = s.shore[1] - s.z, L = Math.hypot(dx, dz), x = s.x + dx / L * (ring + 14) + i * 3.2, z = s.z + dz / L * (ring + 14) - i * 2; add(`canoe:${vi}:${i}`, 'canoe', x, z, Math.atan2(dx, dz) + (i - 1) * 0.3, { l: 4.5 + i * 0.4 }, ['village']); }
    void V;
  });
  return [];
}

function mission(S, T, add, y, R) {
  const ranchos = y >= 1834;
  const end = Math.min(T.len - 30, (T.cross.length ? T.cross[T.cross.length - 1].s : 300) + 64);
  for (let i = 0; i < 4; i++) { const a = T.at(end - 8 - i * 12.2, -1, 66); add(`mwall:${i}`, 'adobeWall', a.x, a.z, a.yaw, { l: 12.4, h: 2.6 }, ['mission']); }
  OLD.forEach(([side, s, w], i) => {
    if (!T.free(s, w) || i % 2 === 1) return;
    const a = T.at(s, side, 4), key = `town:${i}`;
    if (!ranchos && i > 9) return;
    add(key, 'adobeHouse', a.x, a.z, a.yaw, { w: Math.min(w, 11), d: 7, seed: i, flat: i % 4 === 0, color: i % 3 ? [0.62, 0.52, 0.4] : [0.8, 0.76, 0.68], lit: 0.3 }, ['old']);
  });
  const cor = T.at(150, 1, 46); add('mcorral:1', 'corral', cor.x, cor.z, cor.yaw, { w: 22, d: 16 }, ['mission']);
  const cor2 = T.at(250, -1, 52); add('mcorral:2', 'corral', cor2.x, cor2.z, cor2.yaw, { w: 18, d: 14 }, ['mission']);
  if (ranchos) for (let i = 0; i < 4; i++) { const a = T.at(120 + i * 70, i % 2 ? 1 : -1, 110 + (i % 3) * 30); add(`rancho:${i}`, 'adobeHouse', a.x, a.z, a.yaw + (R() - 0.5) * 0.4, { w: 14, d: 8, seed: 20 + i, color: [0.66, 0.55, 0.42], lit: 0.4 }, ['old']); const c = T.at(120 + i * 70 + 18, i % 2 ? 1 : -1, 110 + (i % 3) * 30); add(`ranchoc:${i}`, 'corral', c.x, c.z, c.yaw, { w: 14, d: 12 }, []); }
  if (!ranchos) for (let i = 0; i < 6; i++) { const a = T.at(end - 70 + (i % 3) * 12, 1, 70 + Math.floor(i / 3) * 12); add(`hut:m:${i}`, 'tuleHut', a.x, a.z, a.yaw, { r: 2.3, h: 2.4, rng: rng(300 + i) }, ['village']); }
  return [];
}

function camp(S, T, add, y, R) {
  const lots = [[1, 72, 'SALOON'], [1, 104, 'MINERS SUPPLY'], [-1, 89, 'GOLD BOUGHT HERE'], [-1, 118, 'CLAIM OFFICE'], [1, 134, y >= 1852 ? 'BATHS  25 CENTS' : null], [-1, 150, y >= 1855 ? 'STAGE LINE' : null]];
  const keyOf = { 72: 8, 104: 2, 89: 9, 118: 11, 134: 4, 150: 13 };
  lots.forEach(([side, s, sign], i) => { if (!sign) return; const a = T.at(s, side, 3.2); const frame = y >= 1853 && i % 2 === 0; add(`town:${keyOf[s] ?? 20 + i}`, frame ? 'falseFront' : 'bigTent', a.x, a.z, a.yaw, frame ? { w: 11, sign, bare: true, color: C.bare, pat: 1, wear: 0.5, lit: 0.25, seed: i } : { w: 9, d: 13, sign, seed: i }, ['old']); });
  let k = 0;
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) for (let s = 60; s < 230; s += 14) { if (R() < 0.35) continue; const a = T.at(s + (R() - 0.5) * 4, side, 28 + row * 12 + R() * 4); add(`tent:${k++}`, 'tent', a.x, a.z, a.yaw + (R() - 0.5) * 0.5, { seed: k, w: 3 + R(), d: 3.6 + R() }, ['camp']); }
  for (let i = 0; i < (y >= 1852 ? 5 : 2); i++) { const a = T.at(160 + i * 26, i % 2 ? 1 : -1, 70); add(`cabin:${i}`, 'cabin', a.x, a.z, a.yaw, { porch: false, seed: i, lit: 0.2, bare: true, color: C.bare, pat: 1, roofTint: C.shingle, roofPat: 1, wear: 0.6 }, ['old']); }
  const sys = S.sys, wash = sys.region('wash');
  if (wash) wash.poly.forEach((p, i) => { if (i % 3) return; const q = wash.poly[(i + 1) % wash.poly.length]; add(`sluice:${i}`, 'sluice', p[0] * 0.6 + q[0] * 0.4, p[1] * 0.6 + q[1] * 0.4, Math.atan2(q[0] - p[0], q[1] - p[1]), { l: 12 + (i % 3) * 3 }, ['camp']); });
  const lake = sys.region('lake');
  if (lake) { const c = lake.center || [0, 0]; lake.poly.forEach((p, i) => { if (i % 7) return; const x = c[0] + (p[0] - c[0]) * 1.08, z = c[1] + (p[1] - c[1]) * 1.08; add(`sluiceL:${i}`, 'sluice', x, z, Math.atan2(c[0] - x, c[1] - z), { l: 10 }, ['camp']); add(`tentL:${i}`, 'tent', x + 9, z + 4, R() * 6, { seed: i }, ['camp']); }); }
  const cor = T.at(212, -1, 30); add('camp:corral', 'corral', cor.x, cor.z, cor.yaw, { w: 20, d: 14 }, []);
  return [];
}

export function plantedFor(S, eraId, year, P) {
  const T = S.town(), list = [], V = S.sys.valley, style = P.town;
  if (!T) return list;
  const hY = (x, z) => V.heightAt(x, z);
  if (['modern', 'future', 'sky'].includes(style) || (style === 'mid' && year >= 1955) || (style === 'early' && year >= 1925)) {
    for (let s = 56; s < Math.min(T.len - 20, 420); s += 32) for (const side of [-1, 1]) {
      if (!T.free(s + 16, 4)) continue;
      const a = T.at(s + 16, side, 1.2), palm = style !== 'future' && style !== 'sky';
      list.push({ sp: palm ? 'palm' : 'oak', key: `street:${s}:${side}`, x: a.x, y: hY(a.x, a.z), z: a.z, s: palm ? 0.85 + ((s * 7) % 5) * 0.06 : 0.55, sy: palm ? 0.85 + ((s * 13) % 7) * 0.05 : 0.55, rot: s * 1.7 });
    }
  }
  if (T.hwy && ((style === 'early') || style === 'mid' || style === 'modern' || (style === 'frontier' && year >= 1878))) for (let z = -1600; z < 1600; z += 14) { if (Math.abs(z - T.p0[1]) < 520) continue; const x = S.lineX(T.hwy, z) - T.hwy.width / 2 - 70; list.push({ sp: 'eucalyptus', key: `euc:${z}`, x, y: hY(x, z), z, s: 0.8 + ((z * 7) % 9) / 30, sy: 0.85 + ((z * 3) % 7) / 25, rot: z }); }
  const grove = (key, cx, cz, yaw, nx, nz, sp, step = 7.5) => { const c = Math.cos(yaw), s = Math.sin(yaw); for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const lx = (i - nx / 2) * step, lz = (j - nz / 2) * step, x = cx + lx * c + lz * s, z = cz - lx * s + lz * c; if (S.sys.scatter.land.roadNear(x, z, true) > 0.02) continue; list.push({ sp, key: `${key}:${i}:${j}`, x, y: hY(x, z), z, s: 0.85 + ((i * 7 + j * 3) % 5) * 0.06, sy: 0.9 + ((i + j) % 4) * 0.05, rot: i * 1.3 + j }); } };
  const groves = style === 'early' ? 1 : style === 'mid' ? lerp(1, 0, (year - 1950) / 16) : style === 'frontier' && year >= 1885 ? 0.4 : 0;
  if (groves > 0) {
    const yaw = Math.atan2(T.d[0], T.d[1]);
    const base = [[T.at(260, 1, 170), 16, 12], [T.at(120, -1, 190), 14, 10], [T.at(380, 1, 150), 12, 10], [T.at(330, -1, 160), 12, 9]];
    base.slice(0, Math.max(1, Math.round(base.length * groves))).forEach(([a, nx, nz], gi) => grove(`orange:${gi}`, a.x, a.z, yaw, nx, nz, 'orange'));
  }
  if (style === 'mission') {
    const end = Math.min(T.len - 30, (T.cross.length ? T.cross[T.cross.length - 1].s : 300) + 64), a = T.at(end - 40, 1, 60), yaw = Math.atan2(T.d[0], T.d[1]);
    grove('mgrove', a.x, a.z, yaw, 10, 6, 'orange', 8);
    const f = T.at(end - 120, -1, 120); grove('wheat', f.x, f.z, yaw, 34, 26, 'wheat', 1.6);
    for (let i = 0; i < 26; i++) { const b = T.at(end - 70 + i * 2.2, -1, 58); list.push({ sp: 'cactus', key: `pear:${i}`, x: b.x, y: hY(b.x, b.z), z: b.z, s: 1.1, sy: 1.1, rot: i, v: 2 }); }
  }
  if (style === 'early' && year < 1935) { const f = T.at(200, -1, 230), yaw = Math.atan2(T.d[0], T.d[1]); grove('wheat', f.x, f.z, yaw, 40, 22, 'wheat', 1.7); }
  return list;
}
