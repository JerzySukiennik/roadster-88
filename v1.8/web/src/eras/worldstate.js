// Roadster 88 causality store: persistent changes keyed by place (destroyed, felled, moved) stamped with the period and the exact year they happened in and a logical clock, resolved per year so the past rewrites the future, plus flags and a registry for scripted turning points.
import { PERIOD_INDEX } from './periods.js';

export class WorldState {
  constructor(now = () => 2026) {
    this.now = now;
    this.changes = new Map();
    this.flags = new Map();
    this.turningPoints = [];
    this.log = [];
    this.clock = 0;
    this.version = 0;
  }

  record(key, eraId, state, data = {}) {
    const c = { key, era: PERIOD_INDEX[eraId], eraId, year: this.now(), t: ++this.clock, state, data };
    let list = this.changes.get(key);
    if (!list) this.changes.set(key, (list = []));
    list.push(c);
    this.log.push(c);
    if (this.log.length > 400) this.log.shift();
    this.version++;
    return c;
  }

  effective(key, eraId, year = this.now()) {
    const list = this.changes.get(key);
    if (!list) return null;
    let best = null;
    for (const c of list) if (c.year <= year && (!best || c.t > best.t)) best = c;
    return best;
  }

  status(key, eraId, year) {
    const c = this.effective(key, eraId, year);
    if (!c) return { state: 'intact', since: null };
    return { state: c.state, since: c.eraId, year: c.year, same: c.eraId === eraId, data: c.data, t: c.t };
  }

  setFlag(id, eraId, value = true) {
    this.record('flag:' + id, eraId, value ? 'set' : 'clear');
  }

  flag(id, eraId) {
    const c = this.effective('flag:' + id, eraId);
    return !!c && c.state === 'set';
  }

  registerTurningPoint(tp) {
    this.turningPoints = this.turningPoints.filter((x) => x.id !== tp.id);
    this.turningPoints.push(tp);
  }

  resolveTurningPoints(eraId) {
    const ctx = { suppress: new Set(), extra: [], notes: [] };
    for (const tp of this.turningPoints) {
      if (tp.eras && !tp.eras(eraId)) continue;
      if (tp.when(this, eraId)) { tp.apply(eraId, ctx, this); ctx.notes.push(tp.id); }
    }
    return ctx;
  }

  keysChangedIn(eraId) {
    const out = [];
    for (const [k] of this.changes) { const c = this.effective(k, eraId); if (c) out.push(c); }
    return out;
  }

  toJSON() { return { clock: this.clock, changes: [...this.changes.values()].flat() }; }

  load(json) {
    this.changes.clear(); this.clock = json.clock || 0;
    for (const c of json.changes || []) { let l = this.changes.get(c.key); if (!l) this.changes.set(c.key, (l = [])); l.push(c); }
    this.version++;
  }
}

const between = (a, b) => (id) => PERIOD_INDEX[id] > PERIOD_INDEX[a] && PERIOD_INDEX[id] <= PERIOD_INDEX[b];

export function defaultTurningPoints(ws) {
  ws.registerTurningPoint({
    id: 'railroad_bypass',
    label: 'The depot is destroyed before 1900, so the railroad bypasses the town and the newer districts are never built.',
    eras: between('1885', 'ruins'),
    when: (w, eraId) => { const s = w.status('site:depot', eraId); return s.state === 'destroyed' && s.year < 1900; },
    apply: (eraId, ctx) => { ctx.suppress.add('growth'); },
  });
  ws.registerTurningPoint({
    id: 'mission_lost',
    label: 'The mission church is destroyed, so the town that grows around it keeps an empty plaza where the church stood.',
    eras: between('mission', 'ruins'),
    when: (w, eraId) => { const s = w.status('site:mission', eraId); return s.state === 'destroyed'; },
    apply: (eraId, ctx) => { ctx.suppress.add('mission'); },
  });
}
