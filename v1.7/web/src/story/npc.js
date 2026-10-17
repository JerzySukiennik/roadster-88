// Roadster 88 story people: named characters built from the life system's hand-scripted humans (an Agent with a 'story' brain), kept alive across era swaps, walked, turned and gestured by the story, with a talk spot for the E prompt.
import { Agent, steerGround } from '../life/agents.js';
import { colors } from '../life/palette.js';

export class NPCs {
  constructor(game) { this.g = game; this.list = new Map(); }

  add(id, def) {
    const n = { id, ...def, a: null, ver: -1, loading: false, walk: null, on: false, seed: def.seed ?? Math.random() };
    this.list.set(id, n);
    return n;
  }

  get(id) { return this.list.get(id); }

  setActive(id, on) { const n = this.list.get(id); if (n) n.on = on; }

  pos(id) { const n = this.list.get(id); if (!n || !n.a || !n.on) return null; return { x: n.a.x, y: n.a.y, z: n.a.z }; }

  walkTo(id, x, z, speed = 1.35, done) { const n = this.list.get(id); if (n) n.walk = { x, z, speed, done }; }

  face(id, x, z) { const n = this.list.get(id); if (n && n.a) n.a.yaw = Math.atan2(x - n.a.x, z - n.a.z); }

  rest(id, clip) { const n = this.list.get(id); if (n) { n.restClip = clip; if (n.a) n.a.rest = clip; } }

  gesture(id, clip, cycles = 1.5) { const n = this.list.get(id); if (n && n.a && n.a.K && n.a.K.clips[clip]) { n.a.act(clip, 0.25); n.a.actionUntil = cycles; } }

  async ensure(n) {
    const life = this.g.life; if (!life || !life.ready || n.loading) return;
    if (n.a && n.ver === life.version && life.agents.includes(n.a)) return;
    n.loading = true;
    try {
      const K = await life.kind(n.kind);
      const V = this.g.valley, x = n.a ? n.a.x : n.x, z = n.a ? n.a.z : n.z;
      const [c0, c1] = colors(n.kind, n.seed);
      const a = new Agent(n.kind, { x, z, yaw: n.a ? n.a.yaw : n.yaw || 0, brain: 'story', c0, c1, scale: n.scale || 1 });
      a.K = K; a.y = V.heightAt(x, z); a.clip = 'idle'; a.t = Math.random(); a.prev = null; a.fade = 1; a.rest = n.restClip || 'idle';
      a.story = n.id;
      n.a = a; n.ver = life.version;
      if (n.on) life.agents.push(a);
    } catch (e) { console.warn('story npc', n.id, e); }
    n.loading = false;
  }

  update(dt) {
    const life = this.g.life; if (!life) return;
    for (const n of this.list.values()) {
      const inLife = n.a && life.agents.includes(n.a);
      if (n.on && (!n.a || n.ver !== life.version || !inLife)) { this.ensure(n); continue; }
      if (!n.on && inLife) { life.agents.splice(life.agents.indexOf(n.a), 1); continue; }
      if (!n.on || !n.a || n.a.down) continue;
      const a = n.a;
      if (n.walk) {
        a.tx = n.walk.x; a.tz = n.walk.z; a.want = n.walk.speed;
        steerGround(life, a, dt, { arrive: 1.2 });
        if (Math.hypot(a.x - n.walk.x, a.z - n.walk.z) < 1.4) { const w = n.walk; n.walk = null; a.want = 0; a.speed = 0; if (w.done) w.done(); }
      } else { a.want = 0; a.speed = Math.max(0, a.speed - dt * 4); }
    }
  }

  clear() { const life = this.g.life; for (const n of this.list.values()) { if (life && n.a) { const i = life.agents.indexOf(n.a); if (i >= 0) life.agents.splice(i, 1); } n.on = false; } }
}
