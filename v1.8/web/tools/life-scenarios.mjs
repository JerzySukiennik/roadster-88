// Roadster 88 life harness scenarios: installs the life system through its dev hook and checks creatures, people and traffic per era (screenshots, frame times, hits, a real time jump).
const ERA_DATE = { hadean: 0, dino: 1, 1885: 2, 2026: 3, 2080: 4, ruins: 5, scifi: 6 };

export function lifeScenarios(h) {
  const { R, wait, stats, reset, tele, keys, release, state, fmt, page, out } = h;
  const shot = async (name) => { for (let i = 0; i < 3; i++) { try { await page.screenshot({ path: `${out}/${name}.png`, timeout: 90000 }); console.log('shot', name); return; } catch (e) { console.log('shot retry', name, e.message.split('\n')[0]); } } };
  const install = () => R(async () => { const m = await import('/web/src/life/devhook.js'); await m.installLife(window.__r88.game); return window.__r88.game.life.debug(); });
  const setEra = (id) => R(async (id) => {
    const g = window.__r88.game, tt = await import('/web/src/sim/timetravel.js'), d = tt.ERAS[{ hadean: 0, dino: 1, 1885: 2, 2026: 3, 2080: 4, ruins: 5, scifi: 6 }[id]].date;
    Object.assign(g.tc.present, { year: d.year, month: d.month, day: d.day, hour: d.hour, minute: d.minute });
    g.eras.apply(id, { instant: true }); g.applyClock(true); g.sky.envDirty = true;
    await g.life.setEra(id);
    return g.life.debug();
  }, id);
  const orbit = (y, p) => R((a) => window.__r88.orbit(a[0], a[1]), [y, p]);
  const tg = (x, z, yaw = 0, v = 0) => R((a) => window.__r88.tg(a[0], a[1], a[2], a[3], 0.3), [x, z, yaw, v]);
  void ERA_DATE; void keys; void release; void tele; void state; void fmt;
  return {
    async perf() {
      const has = await R(() => !!window.__r88.game.life);
      if (has) await install();
      for (const id of (process.env.ERAS || 'dino,1885,2026,2080,ruins,scifi').split(',')) {
        if (has) await setEra(id); else await R(async (id) => { const g = window.__r88.game, tt = await import('/web/src/sim/timetravel.js'), d = tt.ERAS[{ hadean: 0, dino: 1, 1885: 2, 2026: 3, 2080: 4, ruins: 5, scifi: 6 }[id]].date; Object.assign(g.tc.present, { year: d.year, month: d.month, day: d.day, hour: d.hour, minute: d.minute }); g.eras.apply(id, { instant: true }); g.applyClock(true); }, id);
        for (let i = 0; i < 40 && has; i++) { if (await R(() => window.__r88.game.life.ready)) break; await wait(250); }
        const vp = await R(() => { const g = window.__r88.game; const v = g.eras && g.eras.viewpoint ? g.eras.viewpoint('road') : null; return v || { pos: g.valley.spawn.pos, yaw: g.valley.spawn.yaw }; });
        await R((v) => { window.__r88.teleport(v.pos[0], v.pos[1], v.pos[2], v.yaw, 0); const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0.05; g.rig.lastMouse = -99; }, vp);
        await wait(5000);
        await reset(); await wait(4000); const on = await R(() => window.__r88.stats());
        const dbg = has ? await R(() => window.__r88.game.life.debug()) : { simMs: 0, drawMs: 0, agents: 0, bodies: 0, drawn: [] };
        const tris = await R(() => window.__r88.game.gfx.renderer.info.render.triangles), st1 = await state(), calls = st1.calls;
        if (has) await R(() => { window.__r88.game.life.root.visible = false; }); await wait(1500);
        await reset(); await wait(4000); const off = await R(() => window.__r88.stats());
        const tris0 = await R(() => window.__r88.game.gfx.renderer.info.render.triangles), st0 = await state(), calls0 = st0.calls;
        const pf = (st) => `gpu ${(st.gpu || 0).toFixed(1)} cpu sim ${st.prof.sim.toFixed(1)} mid ${st.prof.mid.toFixed(1)} rnd ${st.prof.render.toFixed(1)}`;
        console.log(`prof ${id}: on ${pf(st1)} | hidden ${pf(st0)}`);
        if (has) await R(() => { window.__r88.game.life.root.visible = true; });
        console.log(`perf ${id}: life on p50 ${(on.p50 || 0).toFixed(1)} p95 ${(on.p95 || 0).toFixed(1)} avg ${(on.avg || 0).toFixed(1)} calls ${calls} tris ${tris} | hidden p50 ${(off.p50 || 0).toFixed(1)} p95 ${(off.p95 || 0).toFixed(1)} avg ${(off.avg || 0).toFixed(1)} calls ${calls0} tris ${tris0} | sim ${dbg.simMs} ms draw ${dbg.drawMs} ms agents ${dbg.agents} bodies ${dbg.bodies} drawn ${dbg.drawn.join(' ')}`);
      }
    },
    async jump() {
      await install();
      const to = Number(process.env.TO || 1), from = process.env.FROM || '2026';
      if (from !== '2026') await setEra(from);
      for (let i = 0; i < 40; i++) { if (await R(() => window.__r88.game.life.ready)) break; await wait(250); }
      await R(() => window.__r88.respawn()); await wait(300);
      await R((e) => window.__r88.arm(e), to); await wait(300);
      const start = await R(() => { const g = window.__r88.game, rd = g.valley.roads.find((r) => r.id === 'highway'), p = rd.pts[300], q = rd.pts[310]; return [p[0] - 2.85, p[1], Math.atan2(q[0] - p[0], q[1] - p[1])]; });
      await R((a) => window.__r88.tg(a[0], a[1], a[2], 34, 0.3), start);
      await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0.05; g.rig.lastMouse = -99; document.getElementById('hint').style.display = 'none'; });
      await keys('KeyW', 'ShiftLeft');
      for (let i = 0; i < 120; i++) { await wait(50); const st = await state(); if (st.tc === 'departing' || st.tc === 'gone') break; }
      await wait(200); await shot('jump_depart');
      for (let i = 0; i < 120; i++) { await wait(50); const st = await state(); if (st.tc === 'arriving') break; }
      await keys('KeyS');
      console.log('arrived', JSON.stringify(await R(() => window.__r88.game.life.debug())));
      await wait(600); await shot('jump_arrive');
      await release(); await wait(1500);
      const info = () => R(() => { const g = window.__r88.game, L = g.life, S = g.car.sim.pos; const near = L.agents.filter((a) => Math.hypot(a.x - S.x, a.z - S.z) < 300); const by = {}; for (const a of near) by[a.kind] = (by[a.kind] || 0) + 1; return { era: L.eraId, ready: L.ready, near: by, trex: L.solo.filter((a) => a.kind === 'trex').map((a) => [Math.round(Math.hypot(a.x - S.x, a.z - S.z)), a.state]), herds: L.groups.filter((G) => !G.members[0].fly).map((G) => [G.kind, Math.round(Math.hypot(G.cx - S.x, G.cz - S.z)), G.mode]).sort((p, q) => p[1] - q[1]).slice(0, 4) }; });
      console.log('after', JSON.stringify(await info()));
      for (const [i, y] of [[0, 0.0], [1, 1.2], [2, -1.2], [3, 3.1]]) { await R((y) => window.__r88.orbit(y, 0.06), y); await wait(1200); await shot('jump_look_' + i); }
      await wait(6000); console.log('later', JSON.stringify(await info())); await shot('jump_later');
      await reset(); await wait(3000); await stats('after jump');
      console.log('events', JSON.stringify(await R(() => window.__r88.game.life.events.slice(-14).map((e) => e.type + ':' + e.kind))));
    },
    async snap() {
      await wait(4000); await shot('snap' + (process.env.TAG || ''));
      console.log('gl', await R(() => { const b = window.__r88.game.gfx.renderer.backend; return b.gl ? 'lost=' + b.gl.isContextLost() + ' err=' + b.gl.getError() + ' err2=' + b.gl.getError() : 'webgpu'; }));
      console.log('state', fmt(await state()), JSON.stringify(await R(() => window.__r88.game.life ? window.__r88.game.life.debug() : null)));
    },
    async tour() {
      const list = (process.env.ERAS || '1885,2026,2080,ruins,scifi').split(',');
      for (const id of list) { console.log('---- ' + id); await this.era(id); }
    },
    async era(idArg) {
      await install();
      const id = idArg || process.env.ERA || 'dino';
      console.log('era', JSON.stringify(await setEra(id)));
      await R((h) => window.__r88.setTime(h, 0), Number(process.env.HOUR || 11));
      for (let i = 0; i < 40; i++) { if (await R(() => window.__r88.game.life.ready)) break; await wait(250); }
      const target = await R((kind) => {
        const g = window.__r88.game, L = g.life, S = g.car.sim.pos;
        let best = null, bd = 1e9;
        for (const G of L.groups) { if (kind && G.kind !== kind) continue; if (G.members[0] && G.members[0].fly) continue; const d = Math.hypot(G.cx - S.x, G.cz - S.z); if (d < bd) { bd = d; best = G; } }
        if (!best && L.people.length) { const p = L.people[0]; return { x: p.x, z: p.z, kind: p.kind }; }
        if (!best) { const a = L.agents.find((q) => !q.fly); return a ? { x: a.x, z: a.z, kind: a.kind } : null; }
        return { x: best.cx, z: best.cz, kind: best.kind };
      }, process.env.KIND || '');
      console.log('target', JSON.stringify(target));
      if (target) {
        await R((t) => { const g = window.__r88.game, V = g.valley; let best = null; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, x = t.x + Math.sin(a) * 70, z = t.z + Math.cos(a) * 70; if (V.fluidAt(x, z)) continue; const sd = g.sky.sunDir; const sun = -Math.sin(a) * sd.x - Math.cos(a) * sd.z; const sc = sun + Math.abs(V.heightAt(x, z) - V.heightAt(t.x, t.z)) * 0.05; if (!best || sc < best.sc) best = { x, z, sc, yaw: Math.atan2(t.x - x, t.z - z) }; } if (best) window.__r88.tg(best.x, best.z, best.yaw, 0, 0.3); }, target);
      }
      await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0.05; g.rig.lastMouse = -99; document.getElementById('hint').style.display = 'none'; });
      await wait(2500); await shot(`era_${id}_a`);
      console.log('near', JSON.stringify(await R(() => { const g = window.__r88.game, L = g.life, S = g.car.sim.pos; return L.agents.filter((a) => !a.fly).map((a) => ({ k: a.kind, d: Math.round(Math.hypot(a.x - S.x, a.z - S.z)), y: +(a.y - g.valley.heightAt(a.x, a.z)).toFixed(2), clip: a.clip, st: a.state || (a.group && a.group.mode), K: !!a.K })).sort((p, q) => p.d - q.d).slice(0, 8); })));
      await reset(); await wait(3000); await stats(`life ${id} idle`);
      console.log('debug', JSON.stringify(await R(() => window.__r88.game.life.debug())));
      await keys('KeyW'); await wait(2500); await shot(`era_${id}_b`); await keys('KeyW', 'ShiftLeft'); await wait(1500); await shot(`era_${id}_c`); await release();
      await keys('KeyS'); await wait(2000); await release(); await wait(1500); await shot(`era_${id}_d`);
      await reset(); await wait(3000); await stats(`life ${id} after`);
      console.log('debug2', JSON.stringify(await R(() => window.__r88.game.life.debug())));
      console.log('events', JSON.stringify(await R(() => window.__r88.game.life.events.slice(-12).map((e) => e.type + ':' + e.kind))));
    },
    async lineup() {
      await install(); await setEra(process.env.ERA || 'dino');
      await R(() => window.__r88.setTime(13, 0));
      const spot = await R((a) => {
        const g = window.__r88.game, V = g.valley, n = { x: 0, y: 1, z: 0 };
        let best = null;
        for (let i = 0; i < 400; i++) {
          const x = a[0] + (Math.random() - 0.5) * 1400, z = a[1] + (Math.random() - 0.5) * 1400;
          let ok = true, hmin = 1e9, hmax = -1e9;
          for (let dx = -40; dx <= 40 && ok; dx += 10) for (let dz = -10; dz <= 50 && ok; dz += 10) {
            if (V.fluidAt(x + dx, z + dz)) ok = false;
            const h = V.heightAt(x + dx, z + dz); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
          }
          if (!ok) continue;
          const sc = hmax - hmin + (V.regionAt(x, z) ? 0 : 0) + (g.eras && g.eras.overlaps(x, V.heightAt(x, z), z + 20, 20) ? 5 : 0);
          if (!best || sc < best.sc) best = { x, z, sc };
        }
        const sd = g.sky.sunDir || g.sky.lightDir; const yaw = Math.atan2(-sd.x, -sd.z);
        return { ...best, yaw };
      }, (process.env.AT || '-300,-200').split(',').map(Number));
      console.log('spot', JSON.stringify(spot));
      await tg(spot.x, spot.z, spot.yaw);
      const kinds = (process.env.KINDS || 'trex,triceratops,sauropod,raptor,hadrosaur,quetzal,bird').split(',');
      const clip = process.env.CLIP || 'idle';
      await R(async (a) => {
        const g = window.__r88.game, L = g.life, PAL = await import('/web/src/life/palette.js'), AG = await import('/web/src/life/agents.js');
        L.agents.length = 0; L.groups.length = 0; L.people.length = 0; L.solo.length = 0; L.traffic.cars.length = 0; L.traffic.lanes.length = 0; L.traffic.trainCars = null;
        const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), rx = fz, rz = -fx;
        const ws = [];
        for (const id of a.kinds) { const k = await L.kind(id); ws.push(Math.max(a.gap, Math.min(20, k.meta.length * 0.55))); }
        let off = -ws.reduce((p, c) => p + c + 1.5, 0) / 2, n = 0;
        for (const id of a.kinds) {
          const k = L.kinds.get(id), w = ws[n];
          off += w / 2;
          const x = a.x + fx * a.ahead + rx * off, z = a.z + fz * a.ahead + rz * off;
          const fl = k.meta.flyer;
          const c = fl ? (k.clips.glide ? 'glide' : k.clips.roll ? 'roll' : 'flap') : (k.clips[a.clip] ? a.clip : 'idle');
          const seed = 0.11 + n * 0.173, [c0, c1] = PAL.colors(id, seed);
          const ag = new AG.Agent(id, { x, z, y: fl ? g.valley.heightAt(x, z) + (id === 'bird' ? 1.5 : id === 'drone' ? 2 : 5) : g.valley.heightAt(x, z), yaw: a.yaw + Math.PI + 0.6, brain: 'none', seed, c0, c1, scale: id === 'bird' ? 2.5 : 1, fly: fl });
          ag.K = k; ag.clip = c; ag.t = n * 0.1; ag.fade = 1; ag.ground = !fl; if (k.meta.vehicle) { ag.brain = 'parked'; ag.wheelT = 0; }
          L.agents.push(ag);
          off += w / 2 + 1.5; n++;
        }
      }, { x: spot.x, z: spot.z, yaw: spot.yaw, kinds, clip, gap: Number(process.env.GAP || 3), ahead: Number(process.env.AHEAD || 30) });
      await R(() => { const g = window.__r88.game; g.car.view.root.visible = false; document.getElementById('hud').style.display = 'none'; document.getElementById('hint').style.display = 'none'; });
      const D = Number(process.env.DIST || 16);
      for (const [i, y, p] of [[0, 0, 0.12], [1, 0.45, 0.06], [2, -0.45, 0.18]]) {
        await R((a) => { const g = window.__r88.game; g.rig.tu = { ...g.rig.tu, chase_distance: a[2], chase_height: a[2] * 0.25 }; window.__r88.orbit(a[0], a[1]); }, [y, p, D]);
        await wait(1800); await shot((process.env.TAG || 'lineup_') + clip + '_' + i);
      }
      await R(() => { const g = window.__r88.game; g.rig.tu = { ...g.rig.tu, chase_distance: 5.8, chase_height: 1.55 }; });
      console.log('gl', await R(() => { const b = window.__r88.game.gfx.renderer.backend; return b.gl ? 'lost=' + b.gl.isContextLost() + ' err=' + b.gl.getError() : 'webgpu'; }));
      console.log('life', JSON.stringify(await R(() => window.__r88.game.life.debug())));
    },
    async lifetest() {
      console.log('install', JSON.stringify(await install()));
      console.log('era', JSON.stringify(await setEra('dino')));
      await tg(-640, -980, 0);
      await R(async () => {
        const g = window.__r88.game, L = g.life;
        await L.kind('trex');
        const p = g.car.sim.pos;
        L.agents.length = 0;
        const clips = ['idle', 'walk', 'run', 'roar', 'bite', 'walk'];
        clips.forEach((c, i) => L.agents.push({ kind: 'trex', x: p.x - 14 + i * 7, z: p.z + 22 + (i % 2) * 6, yaw: Math.PI + (i - 2.5) * 0.3, clip: c, t: i * 0.13, seed: i * 0.17 }));
      });
      await orbit(Math.PI, 0.1); await wait(2500); await shot('life_trex_a');
      await reset(); await wait(2500); await stats('lifetest');
      console.log('life', JSON.stringify(await R(() => window.__r88.game.life.debug())));
    },
  };
}
