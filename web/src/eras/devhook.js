// Roadster 88 era dev hook: wires the era system into a running valley game for the harness when main.js has not (per-frame update, arrival hook, valley spawn).
import { eraOf } from '../sim/timetravel.js';

export async function installEras(game, opts = {}) {
  if (game.eras && !opts.force) return game.eras;
  const valley = game.valley;
  if (!valley) throw new Error('the era system needs the valley: load with ?map=valley');
  const { EraSystem } = await import('./eras.js');
  const eras = new EraSystem(game, valley);
  game.eras = eras;
  eras.apply(eraOf(game.tc.present.year).id, { instant: true });
  const tc = game.tc, drain = tc.drain.bind(tc);
  tc.drain = () => { const ev = drain(); if (ev.includes('arrive')) eras.apply(eraOf(tc.present.year).id, { instant: false }); return ev; };
  if (game.plate) {
    const sync = game.plate.syncProps.bind(game.plate);
    let last = performance.now();
    game.plate.syncProps = (phys) => { sync(phys); const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now; eras.update(dt, game.gfx.camera.position); };
  }
  if (opts.spawn !== false && valley.spawn) {
    const sp = valley.spawn;
    game.car.sim.teleport(sp.pos, sp.yaw, 0); game.capture(game.car); game.capture(game.car); game.rig.initialized = false; game.gfx.cut();
  }
  return eras;
}
