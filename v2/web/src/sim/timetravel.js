// Roadster 88 time circuits: era presets, the timeline of periods and labelled spans from the Hadean to a dying Earth, signed-year date math and formatting, and the arm / charge / depart / gone / arrive state machine driven by speed. Pure JS.

export const ERAS = [
  { id: 'hadean', label: 'Hadean', date: { year: -4000000000, month: 3, day: 1, hour: 11, minute: 0 } },
  { id: 'dino', label: 'Late Cretaceous', date: { year: -66000000, month: 6, day: 12, hour: 9, minute: 30 } },
  { id: '1885', label: 'Wild West', date: { year: 1885, month: 9, day: 2, hour: 8, minute: 0 } },
  { id: '2026', label: 'Today', date: { year: 2026, month: 10, day: 15, hour: 14, minute: 0 } },
  { id: '2080', label: 'Near future', date: { year: 2080, month: 6, day: 21, hour: 19, minute: 30 } },
  { id: 'ruins', label: 'Ruins', date: { year: 2600, month: 4, day: 18, hour: 16, minute: 40 } },
  { id: 'scifi', label: 'Far future', date: { year: 12000, month: 1, day: 7, hour: 22, minute: 40 } },
];

const SPAN_TABLE = [
  [-4600000000, 'hadean', 'Hadean', -4000000000, 3, 11], [-3999999999, 'archean', 'Archean', -3500000000, 6, 12], [-2500000000, 'protero', 'Proterozoic', -2000000000, 5, 13],
  [-720000000, 'snowball', 'Snowball Earth', -700000000, 2, 12], [-635000000, 'cambrian', 'Ediacaran', -560000000, 7, 11], [-541000000, 'cambrian', 'Cambrian', -520000000, 7, 11],
  [-485000000, 'cambrian', 'Ordovician', -460000000, 7, 11], [-444000000, 'devonian', 'Silurian', -430000000, 5, 12], [-419000000, 'devonian', 'Devonian', -380000000, 5, 12],
  [-359000000, 'carbon', 'Carboniferous', -310000000, 6, 11], [-299000000, 'permian', 'Permian', -280000000, 8, 13], [-252000000, 'triassic', 'Triassic', -220000000, 7, 12],
  [-201000000, 'jurassic', 'Jurassic', -150000000, 6, 10], [-145000000, 'dino', 'Early Cretaceous', -125000000, 6, 10], [-100000000, 'dino', 'Late Cretaceous', -66000000, 6, 10],
  [-65990000, 'paleo', 'Paleocene', -62000000, 5, 11], [-56000000, 'paleo', 'Eocene', -50000000, 5, 11], [-33900000, 'paleo', 'Oligocene', -30000000, 5, 11],
  [-23000000, 'miocene', 'Miocene', -15000000, 9, 15], [-5300000, 'miocene', 'Pliocene', -3500000, 9, 15], [-2580000, 'iceage', 'Ice Age', -20000, 4, 13],
  [-11700, 'native', 'First peoples', 1500, 4, 15], [1769, 'mission', 'Spanish missions', 1790, 5, 16], [1834, 'mission', 'Ranchos', 1840, 5, 16],
  [1848, '1849', 'Gold Rush', 1849, 7, 10], [1860, '1885', 'Wild West', 1885, 9, 8], [1900, '1900', 'Early 1900s', 1910, 5, 15],
  [1920, '1920', 'Roaring Twenties', 1925, 6, 16], [1930, '1920', 'The 1930s', 1935, 6, 16], [1940, '1940', 'The 1940s', 1945, 8, 15],
  [1950, '1950', 'The 1950s', 1957, 7, 17], [1962, '1970', 'The 1960s', 1966, 8, 16], [1970, '1970', 'The 1970s', 1975, 8, 16],
  [1980, '1990', 'The 1980s', 1985, 6, 15], [1990, '1990', 'The 1990s', 1995, 6, 15], [2000, '2000', 'The 2000s', 2005, 9, 14],
  [2010, '2000', 'The 2010s', 2015, 9, 14], [2020, '2026', 'Today', 2026, 10, 14], [2030, '2026', 'The 2030s', 2035, 10, 14],
  [2040, '2050', 'Mid-century', 2050, 5, 13], [2065, '2080', 'Near future', 2080, 6, 19], [2120, '2150', 'Sky cities', 2150, 9, 15],
  [2250, '2300', 'Space age', 2300, 3, 14], [2500, 'ruins', 'Ruins', 2600, 4, 16], [2900, '3000', 'Rewilded', 3000, 5, 10],
  [10000, 'scifi', 'Far future', 12000, 1, 22], [50000, 'glacial', 'Next ice age', 100000, 2, 12], [500000, 'distant', 'Distant future', 2000000, 7, 12],
  [150000000, 'pangaea', 'Pangaea Ultima', 250000000, 8, 13], [500000000, 'dying', 'Dying Earth', 800000000, 6, 12],
];

const PERIOD_NAMES = { cambrian: 'Cambrian', devonian: 'Devonian', dino: 'Cretaceous', paleo: 'Paleogene', miocene: 'Miocene', mission: 'Spanish missions', 1920: 'Twenties and thirties', 1970: 'Sixties and seventies', 1990: 'Eighties and nineties', 2000: '2000s and 2010s', 2026: 'Today' };

export const SPANS = SPAN_TABLE.map(([from, id, label, year, month, hour], i) => {
  const to = i + 1 < SPAN_TABLE.length ? SPAN_TABLE[i + 1][0] - 1 : Infinity;
  const preset = ERAS.find((e) => e.id === id && e.date.year === year);
  return { id, label, from, to, date: preset ? { ...preset.date } : { year, month, day: 14, hour, minute: 0 } };
});

export const PERIODS = [];
for (const s of SPANS) {
  let p = PERIODS.find((q) => q.id === s.id);
  if (!p) { p = { id: s.id, label: PERIOD_NAMES[s.id] || s.label, from: s.from, to: s.to, date: s.date, spans: [] }; PERIODS.push(p); }
  p.to = s.to; p.spans.push(s);
}
for (const p of PERIODS) { const e = ERAS.find((x) => x.id === p.id); if (e) p.date = { ...e.date }; }

export function eraOf(year) {
  let lo = 0, hi = SPANS.length - 1;
  if (!(year >= SPANS[0].from)) return SPANS[0];
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (SPANS[m].from <= year) lo = m; else hi = m - 1; }
  return SPANS[lo];
}

export function periodOf(year) { const id = eraOf(year).id; return PERIODS.find((p) => p.id === id); }

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const cloneDate = (d) => ({ year: d.year, month: d.month, day: d.day, hour: d.hour, minute: d.minute });

export function formatYear(y) {
  if (y < 0) return `${Math.abs(y).toLocaleString('en-US')} BC`;
  if (y >= 10000) return y.toLocaleString('en-US');
  return String(y);
}

export function monthName(m) { return MONTHS[(m - 1 + 12) % 12]; }
export const pad2 = (n) => String(n).padStart(2, '0');
export function formatDate(d) { return `${monthName(d.month)} ${pad2(d.day)} ${formatYear(d.year)} ${pad2(d.hour)}:${pad2(d.minute)}`; }

export function clampDate(d) {
  d.month = Math.min(12, Math.max(1, Math.round(d.month)));
  d.day = Math.min(DAYS_IN[d.month - 1], Math.max(1, Math.round(d.day)));
  d.hour = Math.min(23, Math.max(0, Math.round(d.hour)));
  d.minute = Math.min(59, Math.max(0, Math.round(d.minute)));
  if (d.year === 0) d.year = 1;
  return d;
}

export function tickDate(d, seconds) {
  let m = d.minute + d.hour * 60 + seconds / 60;
  while (m >= 1440) { m -= 1440; d.day++; if (d.day > DAYS_IN[d.month - 1]) { d.day = 1; d.month++; if (d.month > 12) { d.month = 1; d.year = d.year === -1 ? 1 : d.year + 1; } } }
  d.hour = Math.floor(m / 60); d.minute = Math.floor(m % 60); d.sec = m * 60 % 60;
  return d;
}

export class TimeCircuits {
  constructor(tuning) {
    this.T = tuning.time_travel;
    this.state = 'off';
    this.t = 0;
    this.present = cloneDate(ERAS[3].date); this.present.sec = 0;
    this.destination = cloneDate(ERAS[0].date);
    this.last = null;
    this.charge = 0; this.jumps = 0;
    this.events = [];
  }

  get armed() { return this.state === 'armed' || this.state === 'charging'; }
  get busy() { return this.state === 'departing' || this.state === 'gone' || this.state === 'arriving'; }

  setDestination(d) { this.destination = clampDate(cloneDate(d)); }
  toggleArm() {
    if (this.busy) return;
    if (this.armed) { this.state = 'off'; this.events.push('disarm'); } else { this.state = 'armed'; this.events.push('arm'); }
  }

  update(dt, mph, opts = {}) {
    const T = this.T;
    if (!this.busy) tickDate(this.present, dt * (opts.timeScale || 1));
    this.t += dt;
    if (this.state === 'armed' || this.state === 'charging') {
      const c = Math.max(0, Math.min(1, (mph - T.buildup_from_mph) / (T.trigger_mph - T.buildup_from_mph)));
      this.charge = c;
      const was = this.state;
      this.state = mph >= T.buildup_from_mph ? 'charging' : 'armed';
      if (was !== this.state && this.state === 'charging') this.events.push('charge');
      if (mph >= T.trigger_mph) { this.state = 'departing'; this.t = 0; this.departed = cloneDate(this.present); this.events.push('depart'); }
    } else if (this.state === 'departing') {
      this.charge = 1;
      if (this.t >= T.flash_s) { this.state = 'gone'; this.t = 0; this.events.push('vanish'); }
    } else if (this.state === 'gone') {
      if (this.t >= (opts.fpp ? 0 : T.departure_hold_s)) {
        this.last = this.departed; this.present = cloneDate(this.destination); this.present.sec = 0;
        this.state = 'arriving'; this.t = 0; this.jumps++; this.events.push('arrive');
      }
    } else if (this.state === 'arriving') {
      this.charge = 0;
      if (this.t >= T.arrival_vapour_s) { this.state = 'off'; this.t = 0; this.events.push('done'); }
    } else this.charge = 0;
  }

  drain() { const e = this.events; this.events = []; return e; }
}
