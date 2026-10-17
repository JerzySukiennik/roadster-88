// Roadster 88 year harness scenarios: a sheet with one frame per period of the timeline (or any typed years), a real time jump to a typed year through the time circuits at 88 mph, and driving frame times per period with a fresh car.
// usage: node web/tools/harness.mjs years|yearjump|yearperf --map=valley  (env YEARS=1957,-300000000 picks years, IDS=carbon,1950 picks periods, VP=vista overrides the view)
export function yearsScenarios(h) {
  const { R, wait, shot, stats, reset, tele, keys, release, state } = h;
  const periods = () => R(() => import('/web/src/sim/timetravel.js').then((tt) => tt.PERIODS.map((p) => ({ id: p.id, year: p.date.year, month: p.date.month, day: p.date.day, hour: p.date.hour }))));
  const goYear = (o) => R(async (o) => {
    const g = window.__r88.game, tt = await import('/web/src/sim/timetravel.js');
    const span = tt.eraOf(o.year), d = { ...span.date, year: o.year, month: o.month || span.date.month, day: o.day || span.date.day, hour: o.hour ?? span.date.hour, minute: 0 };
    Object.assign(g.tc.present, d); g.applyClock(true);
    const t0 = performance.now();
    g.eras.apply(span.id, { instant: true, year: o.year });
    const ms = performance.now() - t0;
    if (g.life) await g.life.setEra(span.id);
    g.sky.envDirty = true;
    return { id: span.id, label: span.label, ms: Math.round(ms), debug: g.eras.debug() };
  }, o);
  const view = (name) => R((name) => {
    const g = window.__r88.game, E = g.eras, V = g.valley;
    if (name.startsWith('site:')) return E.lookAt(name.slice(5), 42) || E.siteView(name.slice(5), 42);
    if (name === 'herd') {
      const L = g.life; if (!L) return null;
      const grp = L.groups.filter((q) => q.brain === 'grazer' && q.members.length).sort((a, b) => b.members[0].K.size - a.members[0].K.size)[0] || L.groups[0];
      if (!grp) return null;
      const cx = grp.cx, cz = grp.cz, a = 0.7, d = 32 + grp.radius * 1.6, x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
      return { pos: [x, V.heightAt(x, z) + 0.12, z], yaw: Math.atan2(cx - x, cz - z), pitch: 0.06 };
    }
    return E.viewpoint(name);
  }, name);
  const frame = (name) => R((name) => {
    const g = window.__r88.game, E = g.eras, V = g.valley;
    let cx, cz, cy, r, yaw;
    if (name === 'herd') {
      const L = g.life; if (!L) return false;
      const grp = L.groups.filter((q) => q.brain === 'grazer' && q.members.length && q.members[0].K).sort((a, b) => b.members[0].K.size - a.members[0].K.size)[0];
      if (!grp) return false;
      let sx = 0, sz = 0; for (const m of grp.members) { sx += m.x; sz += m.z; } cx = sx / grp.members.length; cz = sz / grp.members.length; r = Math.max(14, grp.radius * 1.1); cy = V.heightAt(cx, cz); yaw = 0.7;
      g.debugCam = () => { let x = 0, z = 0; for (const m of grp.members) { x += m.x; z += m.z; } x /= grp.members.length; z /= grp.members.length; const h = V.heightAt(x, z); return { pos: new window.__r88.THREE.Vector3(x + Math.sin(yaw) * r * 2.2, h + r * 0.55 + 4, z + Math.cos(yaw) * r * 2.2), look: new window.__r88.THREE.Vector3(x, h + 2, z), fov: 50 }; };
      return true;
    }
    const m = E.structures.cur && E.structures.cur.meta.get(name);
    if (!m) return false;
    const s = m.site, h = (m.info && m.info.h) || 8, f = m.info && m.info.foot ? Math.max(m.info.foot[0], m.info.foot[1]) : 10;
    const fx = Math.sin(s.yaw || 0), fz = Math.cos(s.yaw || 0), d = Math.max(28, f * 2.6 + h * 0.8);
    const lx = s.x - fx * (m.info.foot ? -m.info.foot[2] : 0), lz = s.z - fz * (m.info.foot ? -m.info.foot[2] : 0);
    const px = lx + (fx * 0.92 + fz * 0.38) * d, pz = lz + (fz * 0.92 - fx * 0.38) * d;
    const T3 = window.__r88.THREE, pos = new T3.Vector3(px, Math.max(V.heightAt(px, pz) + 2, m.y + h * 0.45 + d * 0.22), pz), look = new T3.Vector3(lx, m.y + h * 0.4, lz);
    g.debugCam = () => ({ pos, look, fov: 55 });
    return true;
  }, name);
  const unframe = () => R(() => { const g = window.__r88.game; g.debugCam = null; g.gfx.camera.fov = 60; g.gfx.camera.updateProjectionMatrix(); });
  const place = async (vp) => { if (!vp) return; await tele(vp.pos[0], vp.pos[1], vp.pos[2], vp.yaw, 0); await R((o) => window.__r88.orbit(o[0], o[1]), [vp.orbit || 0, vp.pitch || 0.08]); };
  const VIEW = { hadean: 'vista', archean: 'lake', protero: 'lake', snowball: 'vista', cambrian: 'lake', devonian: 'grove', carbon: 'grove', permian: 'herd', triassic: 'herd', jurassic: 'herd', dino: 'herd', paleo: 'grove', miocene: 'herd', iceage: 'herd', native: 'site:hut:0:0', mission: 'site:site:mission', 1849: 'main', 1885: 'main', 1900: 'main', 1920: 'main', 1940: 'main', 1950: 'site:site:diner', 1970: 'site:site:mall', 1990: 'site:site:bigbox', 2000: 'main', 2026: 'main', 2050: 'site:site:fuel', 2080: 'main', 2150: 'site:site:mall', 2300: 'main', ruins: 'main', 3000: 'grove', scifi: 'main', glacial: 'site:spire:0', distant: 'site:crystal:2', pangaea: 'vista', dying: 'vista' };
  const fresh = () => R(() => { const g = window.__r88.game; if (g.player) { g.player.kill = () => {}; g.player.died = () => {}; g.player.dead = null; const f = document.getElementById('fade'); if (f) f.style.opacity = '0'; } g.respawn(); for (const w of g.wrecks) { w.sim.destroy(); g.gfx.scene.remove(w.view.root); g.cars.splice(g.cars.indexOf(w), 1); } g.wrecks.length = 0; });
  const list = async () => {
    const all = await periods();
    if (process.env.YEARS) return process.env.YEARS.split(',').map((y) => ({ year: Number(y) }));
    if (process.env.IDS) { const ids = process.env.IDS.split(','); return all.filter((p) => ids.includes(p.id)); }
    return all;
  };
  return {
    async years() {
      const rows = [];
      for (const p of await list()) {
        const r = await goYear(p);
        if (process.env.WXK) await R((k) => { const g = window.__r88.game, W = g.eras.weather; g.weather.set(k); W.cur = { ...W.target }; W.pushNow(); }, process.env.WXK);
        else await R(() => { const g = window.__r88.game, W = g.eras.weather; if ((W.kind === 'fog' && g.eras.period.climate !== 'swamp') || W.kind === 'storm' || W.kind === 'rain' || W.kind === 'overcast') { g.weather.set(W.api.kinds.includes('clouds') ? 'clouds' : 'clear'); W.cur = { ...W.target }; W.wet = 0; W.pushNow(); } });
        await fresh(); await wait(200);
        const vpn = process.env.VP || VIEW[r.id] || 'vista';
        const framed = vpn === 'herd' || vpn.startsWith('site:') ? await frame(vpn === 'herd' ? 'herd' : vpn.slice(5)) : false;
        if (!framed) { let vp = await view(vpn === 'herd' || vpn.startsWith('site:') ? 'vista' : vpn); if (!vp) vp = await view('vista'); await place(vp); }
        await wait(3200);
        const name = `year_${String(p.year).replace('-', 'm')}_${r.id}`;
        await shot(name);
        await unframe();
        await reset(); await wait(1600); const s = await stats(`year ${p.year} ${r.id}`);
        const st = await state();
        const life = await R(() => { const L = window.__r88.game.life; return L ? { agents: L.agents.length, people: L.people.length, cars: L.traffic.cars.length } : null; });
        console.log('period', p.year, r.id, JSON.stringify(r.label), 'apply', r.ms, 'ms city', JSON.stringify(r.debug.city), 'weather', r.debug.weather && r.debug.weather.kind, 'sites', r.debug.structures.sites, 'calls', st.calls, 'life', JSON.stringify(life));
        rows.push({ name, year: p.year, id: r.id, label: r.label, p50: s.p50, p95: s.p95, calls: st.calls, apply: r.ms });
      }
      console.log('SHEET', JSON.stringify(rows));
    },
    async outer() {
      for (const [y, x, z, yaw] of [[-310000000, 3200, 2600, 0.8], [-310000000, -500, 5200, 3.1], [2026, -500, 5200, 3.1], [-20000, 4500, -4200, 2.2], [1500, -3000, -3000, 0.5]]) {
        await goYear({ year: y });
        await fresh(); await wait(200);
        const h = await R((a) => window.__r88.game.valley.heightAt(a[0], a[1]), [x, z]);
        await tele(x, h + 0.3, z, yaw, 0); await R(() => window.__r88.orbit(0, 0.1));
        await wait(5000);
        await shot(`outer_${String(y).replace('-', 'm')}_${x}_${z}`);
        console.log('outer', y, x, z, JSON.stringify(await R(() => { const S = window.__r88.game.eras.scatter; return { q: S.queue.length, counts: S.counts }; })));
      }
    },
    async probe() {
      for (const y of (process.env.YEARS || '1957,1945,2080').split(',').map(Number)) {
        await goYear({ year: y }); await wait(2500);
        console.log('probe', y, JSON.stringify(await R(() => { const g = window.__r88.game, S = g.sky; return { el: +(S.state.el * 57.3).toFixed(1), night: +S.state.night.toFixed(2), exp: +g.gfx.u.exposure.value.toFixed(3), skyExp: +S.exposure.toFixed(3), sunI: +S.sun.intensity.toFixed(2), wx: g.eras.weather.kind, dark: +g.eras.weather.cur.dark.toFixed(2), sunMul: +g.eras.weather.cur.sunMul.toFixed(2), tc: g.tc.state, present: g.tc.present, flash: g.timeFx.flashLevel, paused: g.paused, vis: g.car.view.root.visible }; })));
        await shot(`probe_${y}`);
      }
    },
    async yearjump() {
      const hops = (process.env.HOPS || '2026,1957,-66000000,1957,12000,2026').split(',').map(Number);
      await goYear({ year: hops[0] });
      const vp = (await view('runway')) || { pos: (await R(() => window.__r88.game.valley.spawn)).pos, yaw: 0 };
      for (let h = 1; h < hops.length; h++) {
        const target = hops[h];
        await fresh(); await wait(300);
        await R((y) => { const g = window.__r88.game; g.tc.setDestination({ ...g.tc.destination, year: y }); if (!g.tc.armed) g.toggleArm(); }, target); await wait(300);
        await tele(vp.pos[0], vp.pos[1], vp.pos[2], vp.yaw, 34); await keys('KeyW', 'ShiftLeft');
        for (let i = 0; i < 160; i++) { await wait(50); const st = await state(); if (st.tc === 'departing' || st.tc === 'gone') break; }
        if (h === 1) { await wait(250); await shot('yearjump_depart'); }
        const t0 = Date.now();
        for (let i = 0; i < 160; i++) { await wait(50); const st = await state(); if (st.tc === 'arriving') break; }
        await release();
        const d = await R(() => { const g = window.__r88.game; return { era: g.eraId(), year: g.tc.present.year, applyMs: Math.round(g.eras.stats.applyMs), steps: g.eras.stats.steps, label: g.eras.debug().label, struct: g.eras.structures.cur && Math.round(g.eras.structures.cur.ms), genMs: Math.round(g.eras.scatter.genMs || 0) }; });
        await wait(200); await shot(`yearjump_${h}_${String(target).replace('-', 'm')}`);
        await reset(); await wait(3000); const s = await stats(`after jump to ${target}`);
        console.log('jump', h, hops[h - 1], '->', target, JSON.stringify(d), 'wait', Date.now() - t0, 'ms', 'p95', s.p95 && s.p95.toFixed(1), 'max', s.max && s.max.toFixed(0));
      }
    },
    async drive() {
      const sp = await R(() => { const g = window.__r88.game, V = g.valley, rd = (V.roads || []).find((r) => r.kind === 'highway'); const p0 = rd.pts[30], p1 = rd.pts[31]; return { pos: [p0[0], V.heightAt(p0[0], p0[1]) + 0.15, p0[1]], yaw: Math.atan2(p1[0] - p0[0], p1[1] - p0[1]) }; });
      await fresh(); await wait(300);
      await tele(sp.pos[0], sp.pos[1], sp.pos[2], sp.yaw, 0); await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
      await wait(4000); await reset(); await keys('KeyW');
      const probes = [];
      for (let i = 0; i < 16; i++) { await wait(500); probes.push(await R(() => { const g = window.__r88.game; return [g.eras ? +g.eras.scatter.rebuildMs.toFixed(1) : 0, g.life ? +g.life.stats.sim.toFixed(1) : 0, g.life ? +g.life.stats.draw.toFixed(1) : 0, +g.prof.mid.toFixed(1)]; })); }
      await release();
      console.log('probes rebuild/lifeSim/lifeDraw/mid', JSON.stringify(probes));
      const s = await stats('drive'); const st = await state();
      console.log('drive p50', s.p50.toFixed(1), 'p95', s.p95.toFixed(1), 'calls', st.calls, 'tris', await R(() => window.__r88.game.gfx.renderer.info.render.triangles), 'cpu', JSON.stringify(st.prof), 'era', await R(() => window.__r88.game.eraId()));
      await shot('drive');
    },
    async yearperf() {
      for (const p of await list()) {
        const r = await goYear(p);
        await R(() => { const g = window.__r88.game, W = g.eras.weather; g.weather.set('clear'); W.cur = { ...W.target }; W.wet = 0; W.snowCover = 0; W.pushNow(); });
        const vp = (await view('road')) || { pos: (await R(() => window.__r88.game.valley.spawn)).pos, yaw: 0 };
        await fresh(); await wait(300);
        await tele(vp.pos[0], vp.pos[1], vp.pos[2], vp.yaw, 0); await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
        await wait(2500); await reset(); await keys('KeyW'); await wait(7000); await release();
        const s = await stats(`drive ${p.year} ${r.id}`); const st = await state();
        console.log('perf', p.year, r.id, 'p50', s.p50.toFixed(1), 'p95', s.p95.toFixed(1), 'calls', st.calls, 'tris', await R(() => window.__r88.game.gfx.renderer.info.render.triangles), 'cpu', JSON.stringify(st.prof));
        await shot(`perf_${r.id}`);
      }
    },
  };
}
