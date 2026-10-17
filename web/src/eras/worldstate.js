// Roadster 88 causality store: persistent changes keyed by place (destroyed, felled, moved) stamped with the era they happened in and a logical clock, resolved per era so the past rewrites the future, plus flags and a registry for scripted turning points.
import { ERA_INDEX } from './presets.js';

export class WorldState {
  constructor() {
    this.changes = new Map();
    this.flags = new Map();
    this.turningPoints = [];
    this.log = [];
    this.clock = 0;
    this.version = 0;
  }

  record(key, eraId, state, data = {}) {
    const c = { key, era: ERA_INDEX[eraId], eraId, t: ++this.clock, state, data };
    let list = this.changes.get(key);
    if (!list) this.changes.set(key, (list = []));
    list.push(c);
    this.log.push(c);
    if (this.log.length > 400) this.log.shift();
    this.version++;
    return c;
  }

  effective(key, eraId) {
    const list = this.changes.get(key);
    if (!list) return null;
    const E = ERA_INDEX[eraId];
    let best = null;
    for (const c of list) if (c.era <= E && (!best || c.t > best.t)) best = c;
    return best;
  }

  status(key, eraId) {
    const c = this.effective(key, eraId);
    if (!c) return { state: 'intact', since: null };
    return { state: c.state, since: c.eraId, same: c.era === ERA_INDEX[eraId], data: c.data, t: c.t };
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
      if (tp.eras && !tp.eras.includes(eraId)) continue;
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

export function defaultTurningPoints(ws) {
  ws.registerTurningPoint({
    id: 'railroad_bypass',
    label: 'The 1885 depot is destroyed, so the railroad bypasses the town and the newer districts are never built.',
    eras: ['2026', '2080', 'ruins'],
    when: (w, eraId) => { const s = w.status('site:depot', eraId); return s.state === 'destroyed' && s.since === '1885'; },
    apply: (eraId, ctx) => { ctx.suppress.add('growth'); },
  });
}
