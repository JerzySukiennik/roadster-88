// Roadster 88 time circuits: era presets, signed-year date math and formatting, and the arm / charge / depart / gone / arrive state machine driven by speed. Pure JS.

export const ERAS = [
  { id: 'hadean', label: 'Hadean', date: { year: -4000000000, month: 3, day: 1, hour: 11, minute: 0 } },
  { id: 'dino', label: 'Late Cretaceous', date: { year: -66000000, month: 6, day: 12, hour: 9, minute: 30 } },
  { id: '1885', label: 'Wild West', date: { year: 1885, month: 9, day: 2, hour: 8, minute: 0 } },
  { id: '2026', label: 'Today', date: { year: 2026, month: 10, day: 15, hour: 14, minute: 0 } },
  { id: '2080', label: 'Near future', date: { year: 2080, month: 6, day: 21, hour: 20, minute: 30 } },
  { id: 'ruins', label: 'Ruins', date: { year: 2600, month: 4, day: 18, hour: 18, minute: 10 } },
  { id: 'scifi', label: 'Far future', date: { year: 12000, month: 1, day: 7, hour: 22, minute: 40 } },
];

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

export function eraOf(year) {
  let best = ERAS[0];
  for (const e of ERAS) if (e.date.year <= year) best = e;
  return best;
}

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
