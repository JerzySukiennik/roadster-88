// Roadster 88 life dev hook: wires the life system into a running valley game for the harness until main.js does (eras via their own hook, per-frame update through the valley update, era swap and arrival through the time-jump arrival).
import { eraOf } from '../sim/timetravel.js';

export async function installLife(game, opts = {}) {
  if (game.life && !opts.force) return game.life;
  if (!game.valley) throw new Error('life needs the valley: load with ?map=valley');
  if (!game.eras) { const m = await import('../eras/devhook.js'); await m.installEras(game, { spawn: opts.spawn }); }
  const { LifeSystem } = await import('./life.js');
  const life = new LifeSystem(game, game.valley, game.eras);
  game.life = life;
  await life.setEra(eraOf(game.tc.present.year).id);
  const V = game.valley;
  if (!V.__lifeHooked) {
    V.__lifeHooked = true;
    const vu = V.update.bind(V);
    let last = performance.now();
    V.update = (dt, camPos, camera) => { vu(dt, camPos, camera); const now = performance.now(), fdt = Math.min(0.1, (now - last) / 1000); last = now; if (game.life && !game.lifeBroken) { try { game.life.update(game.paused ? 0 : fdt, game.gfx.camera.position); } catch (e) { game.lifeBroken = true; console.error('life.update failed', e); } } };
    const arrive = game.arriveValley.bind(game);
    game.arriveValley = () => { arrive(); if (game.life) game.life.setEra(eraOf(game.tc.present.year).id); };
  }
  return life;
}
