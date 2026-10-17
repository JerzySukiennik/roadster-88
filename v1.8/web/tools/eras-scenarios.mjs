// Roadster 88 era harness scenarios: era sheet (every era from a vista and from the road, with frame times), a real time jump into an era, and a causality run (destroy in 1885, check 2026).
const ERA_LIST = ['hadean', 'dino', '1885', '2026', '2080', 'ruins', 'scifi'];

export function erasScenarios(h) {
  const { R, wait, shot, stats, reset, tele, keys, release, state } = h;
  const install = () => R(async () => { const m = await import('/web/src/eras/devhook.js'); await m.installEras(window.__r88.game); return window.__r88.game.eras.debug(); });
  const setEra = (id) => R((id) => { const g = window.__r88.game; const E = { hadean: 0, dino: 1, 1885: 2, 2026: 3, 2080: 4, ruins: 5, scifi: 6 }[id]; return import('/web/src/sim/timetravel.js').then((tt) => { const d = tt.ERAS[E].date; Object.assign(g.tc.present, { year: d.year, month: d.month, day: d.day, hour: d.hour, minute: d.minute }); g.eras.apply(id, { instant: true }); g.applyClock(true); g.sky.envDirty = true; return g.eras.debug(); }); }, id);
  const view = (name) => R((name) => window.__r88.game.eras && window.__r88.game.eras.viewpoint ? window.__r88.game.eras.viewpoint(name) : null, name);
  const place = async (vp) => { if (!vp) return; await tele(vp.pos[0], vp.pos[1], vp.pos[2], vp.yaw, 0); await R((o) => window.__r88.orbit(o[0], o[1]), [vp.orbit || 0, vp.pitch || 0.08]); };
  const groundAt = (x, z) => R((a) => window.__r88.game.valley.heightAt(a[0], a[1]), [x, z]);
  const only = (process.env.ERAS || '').split(',').filter(Boolean);
  return {
    async eras() {
      console.log('install', JSON.stringify(await install()));
      for (const id of only.length ? only : ERA_LIST) {
        const d = await setEra(id);
        if (process.env.WXK) await R((k) => { const g = window.__r88.game, W = g.eras.weather; g.weather.set(k); W.cur = { ...W.target }; W.wet = 0; W.snowCover = 0; W.pushNow(); }, process.env.WXK);
        for (const vpName of (process.env.VPS || 'vista,town,road').split(',')) {
          let vp = await view(vpName);
          if (!vp) { const v = await R(() => window.__r88.game.valley.spawn); vp = { pos: v.pos, yaw: v.yaw }; }
          await place(vp);
          await wait(vpName === 'vista' ? 2600 : 1800);
          await shot(`era_${id}_${vpName}`);
        }
        await reset(); await wait(2500); const s = await stats(`era ${id}`);
        console.log('era', id, JSON.stringify(d), 'calls', (await state()).calls, 'tris', await R(() => window.__r88.game.gfx.renderer.info.render.triangles));
      }
    },
    async erajump() {
      await install();
      const from = process.env.FROM || '2026', to = Number(process.env.TO || 2);
      await setEra(from);
      const vp = (await view('runway')) || { pos: (await R(() => window.__r88.game.valley.spawn)).pos, yaw: 0 };
      await R(() => window.__r88.respawn()); await wait(300);
      await R((e) => window.__r88.arm(e), to); await wait(300);
      await tele(vp.pos[0], vp.pos[1], vp.pos[2], vp.yaw, 34); await keys('KeyW', 'ShiftLeft');
      for (let i = 0; i < 80; i++) { await wait(50); const st = await state(); if (st.tc === 'departing' || st.tc === 'gone') break; }
      await wait(250); await shot('jump_depart');
      for (let i = 0; i < 80; i++) { await wait(50); const st = await state(); if (st.tc === 'arriving') break; }
      await release();
      console.log('arrived', JSON.stringify(await R(() => window.__r88.game.eras.debug())), 'year', await R(() => window.__r88.game.tc.present.year));
      await wait(200); await shot('jump_arrive'); await wait(1800); await shot('jump_after');
      await reset(); await wait(2500); await stats('after jump');
    },
    async eradbg() {
      await install();
      const vp = await view('town');
      for (const [id, h] of (process.env.COMBOS || '2026:14,2026:8,1885:14,1885:8').split(',').map((c) => c.split(':'))) {
        await setEra(id);
        await R((h) => window.__r88.setTime(h, 0, 9, 2), Number(h));
        await place(vp); await wait(2500); await shot(`dbg_${id}_${h}`);
        console.log(id, h, await R(() => { const g = window.__r88.game; return JSON.stringify({ era: g.eras.eraId, vera: g.valley.era, roads: g.valley.palette.roads, ground: g.valley.palette.ground, u: g.valley.view.U.ground.c1.value.toArray().map((v) => v.toFixed(2)), sunI: g.sky.sun.intensity.toFixed(2), el: (g.sky.state.el * 57.3).toFixed(1), exp: g.gfx.u.exposure.value.toFixed(2), night: g.sky.state.night.toFixed(2) }); }));
      }
    },
    async eraperf() {
      const noeras = await R(() => !window.__r88.game.eras);
      if (!noeras) await install();
      const list = (process.env.ERAS || '2026').split(',');
      for (const id of list) {
        if (!noeras) { await setEra(id); if (process.env.WXK) await R((k) => { const g = window.__r88.game, W = g.eras.weather; g.weather.set(k); W.cur = { ...W.target }; W.wet = 0; W.snowCover = 0; W.pushNow(); }, process.env.WXK); }
        if (process.env.HOUR) await R((h) => window.__r88.setTime(h, 0, 6, 15), Number(process.env.HOUR));
        if (process.env.NOLAMPS) await R(() => { const g = window.__r88.game; g.lamps.L.visible = false; g.lamps.R.visible = false; g.lamps.cabin.visible = false; });
        const vp = await view('road');
        const v = vp || { pos: (await R(() => window.__r88.game.valley.spawn)).pos, yaw: 0 };
        await R(() => { const g = window.__r88.game; g.respawn(); for (const w of g.wrecks) { w.sim.destroy(); g.gfx.scene.remove(w.view.root); g.cars.splice(g.cars.indexOf(w), 1); } g.wrecks.length = 0; }); await wait(300);
        await tele(v.pos[0], v.pos[1], v.pos[2], v.yaw, 0); await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
        await wait(2500); await reset(); await keys('KeyW'); await wait(7000); await release(); const s = await stats(`drive ${noeras ? 'noeras' : id}`);
        const st = await state(); console.log('perf', noeras ? 'noeras' : id, 'calls', st.calls, 'tris', await R(() => window.__r88.game.gfx.renderer.info.render.triangles), 'cpu', JSON.stringify(st.prof), noeras ? '' : JSON.stringify(await R(() => window.__r88.game.eras.debug())));
        await shot(`perf_${noeras ? 'noeras' : id}`);
        if (noeras) break;
      }
    },
    async floracount() {
      await install();
      for (const id of only.length ? only : ['1885', '2026']) {
        await setEra(id);
        const vp = await view(process.env.VP || 'vista'); await place(vp); await wait(2500);
        console.log(id, await R(() => { const S = window.__r88.game.eras.scatter, out = []; for (const p of S.pools) { let tot = 0; for (const [, t] of p.tiles) tot += t.list.length; out.push(`${p.plan.sp}${p.planted ? '*' : ''}: tiles=${tot} near=[${p.M.near.map((n) => n.count).join(',')}] far=${p.M.far ? p.M.far.count : '-'} vis=${p.M.near[0].visible}`); } return out.join('\n'); }));
      }
    },
    async variantab() {
      await install(); await setEra(process.env.ERA || '2026');
      const vp = await view(process.env.VP || 'road'); await place(vp); await wait(3000);
      const res = { on: [], off: [] };
      for (let r = 0; r < 3; r++) for (const mode of r % 2 ? ['off', 'on'] : ['on', 'off']) {
        await R((one) => { const S = window.__r88.game.eras.scatter; S.oneVariant = one; S.dirty = true; }, mode === 'off');
        await wait(1200); await reset(); await wait(3000);
        const s = await R(() => window.__r88.stats()), st = await state();
        res[mode].push([s.p50, s.p95, st.prof.render, st.calls]);
        console.log(`ab ${mode} p50=${(s.p50 || 0).toFixed(1)} p95=${(s.p95 || 0).toFixed(1)} cpu=${st.prof.render.toFixed(1)} calls=${st.calls}`);
      }
      const avg = (a, i) => (a.reduce((x, y) => x + y[i], 0) / a.length).toFixed(2);
      console.log('ab mean on', avg(res.on, 0), avg(res.on, 2), 'off', avg(res.off, 0), avg(res.off, 2));
    },
    async eraprobe() {
      await install(); await setEra(process.env.ERA || '2026');
      const vp = await view(process.env.VP || 'town'); await place(vp); await wait(3000);
      const toggles = process.env.PROBE === 'flora' ? [['all', 'true'], ['floraNoShadow', "for (const [,M] of g.eras.scatter.meshes) M.near.forEach((n)=>n.castShadow=false)"], ['noFar', "for (const [,M] of g.eras.scatter.meshes) { M.near.forEach((n)=>n.castShadow=true); if (M.far) M.far.visible=false; }"], ['noNear', "for (const [,M] of g.eras.scatter.meshes) { if (M.far) M.far.visible=true; M.near.forEach((n)=>n.visible=false); }"], ['onlyGround', "for (const [k,M] of g.eras.scatter.meshes) { const gr=['dryGrass','grass','fern','reed','horsetail'].includes(k); M.near.forEach((n)=>n.visible=gr); if (M.far) M.far.visible=false; }"], ['noGround', "for (const [k,M] of g.eras.scatter.meshes) { const gr=['dryGrass','grass','fern','reed','horsetail'].includes(k); M.near.forEach((n)=>n.visible=!gr); if (M.far) M.far.visible=true; }"]] : [['all', 'true'], ['noStruct', "g.eras.structures.group.visible=false"], ['noFlora', "g.eras.structures.group.visible=true; g.eras.scatter.group.visible=false"], ['noEras', "g.eras.root.visible=false"], ['noValley', "g.eras.root.visible=true; g.valley.view.root.visible=false"], ['noShadow', "g.valley.view.root.visible=true; g.sky.sun.castShadow=false"], ['none', "g.eras.root.visible=false; g.valley.view.root.visible=false"]];
      for (const [name, js] of toggles) {
        await R((js) => { const g = window.__r88.game; new Function('g', js)(g); }, js);
        await wait(1200); await reset(); await wait(2500);
        const s = await R(() => window.__r88.stats()), st = await state();
        console.log(`probe ${name.padEnd(13)} p50=${(s.p50 || 0).toFixed(1)} p95=${(s.p95 || 0).toFixed(1)} gpu=${(st.gpu || 0).toFixed(1)} calls=${st.calls} tris=${await R(() => window.__r88.game.gfx.renderer.info.render.triangles)} cpu=${st.prof.render.toFixed(1)}`);
      }
      console.log('meshes', await R(() => { const g = window.__r88.game, out = []; g.eras.root.traverse((o) => { if (o.isMesh || o.isSprite) { const gg = o.geometry, n = gg.index ? gg.index.count / 3 : gg.attributes.position.count / 3; const inst = o.isInstancedMesh ? o.count : 1; if (n * inst > 2000 && o.visible) out.push(`${o.userData.k || o.name}:${Math.round(n)}x${inst}`); } }); return out.join(' '); }));
    },
    async moondbg() {
      await install(); await setEra('hadean');
      const vp = await view('road'); await place(vp); await wait(2500);
      console.log('moon', await R(() => { const g = window.__r88.game, T = window.__r88.THREE, m = g.eras.skyfx.items.moon; if (!m) return 'none'; const p = m.position.clone().project(g.gfx.camera); return JSON.stringify({ vis: m.visible, pos: m.position.toArray().map((v) => v.toFixed(0)), scale: m.scale.x.toFixed(0), ndc: p.toArray().map((v) => v.toFixed(2)), parentVis: m.parent.visible, rootVis: g.eras.root.visible, cam: g.gfx.camera.position.toArray().map((v) => v.toFixed(0)), far: g.gfx.camera.far }); }));
      await R(() => window.__r88.orbit(Math.PI, 0.45)); await wait(1500); await shot('moon_a');
    },
    async skydbg() {
      await install(); await setEra('2026');
      const vp = await view('road'); await place(vp); await wait(2500); await shot('sky_a');
      await R(() => { window.__r88.game.valley.view.far.visible = false; }); await wait(800); await shot('sky_nofar');
      await R(() => { window.__r88.game.valley.view.far.visible = true; window.__r88.game.eras.root.visible = false; }); await wait(800); await shot('sky_noeras');
      await R(() => { window.__r88.game.eras.root.visible = true; const v = window.__r88.game.valley.view; v.root.visible = false; }); await wait(800); await shot('sky_novalley');
      console.log('scene', await R(() => { const g = window.__r88.game; return g.gfx.scene.children.map((c) => (c.name || c.type) + (c.visible ? '' : '(h)')).join(', '); }));
      console.log('sky', await R(() => { const s = window.__r88.game.sky; return JSON.stringify({ cov: s.sky.cloudCoverage.value, dens: s.sky.cloudDensity.value, el: s.sky.cloudElevation.value, sc: s.sky.cloudScale.value, tur: s.sky.turbidity.value }); }));
    },
    async smash() {
      await install(); await setEra('1885');
      const key = process.env.KEY || 'town:9', sp = Number(process.env.SPEED || 32);
      const p = await R((key) => { const g = window.__r88.game, m = g.eras.structures.cur.meta.get(key); const s = m.site, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw); const x = s.x + fx * 15, z = s.z + fz * 15; return [x, g.valley.heightAt(x, z) + 0.15, z, Math.atan2(-fx, -fz)]; }, key);
      await tele(p[0], p[1], p[2], p[3], sp); await R(() => window.__r88.orbit(0.9, 0.12)); await keys('KeyW');
      await wait(300); await shot('smash_0'); await wait(500); await shot('smash_1'); await release(); await wait(1500); await shot('smash_2');
      console.log('smash', key, JSON.stringify(await R((key) => window.__r88.game.eras.worldState.status(key, '1885'), key)), 'debris', await R(() => window.__r88.game.eras.structures.debris.length), 'car', JSON.stringify((await state()).pos.map((v) => +v.toFixed(1))), 'broken', (await state()).broken);
      const t = await R(() => { const g = window.__r88.game, sc = g.eras.scatter; let best = null, bd = 1e9; for (const pool of sc.pools) { if (pool.plan.sp !== 'oak') continue; for (const [, tile] of pool.tiles) for (const it of tile.list) { const d = Math.hypot(it.x + 700, it.z + 300); if (d < bd && it.s > 0.85) { bd = d; best = [it.x, it.z, it.key]; } } } return best; });
      console.log('tree pick', JSON.stringify(t));
      if (t) {
        const y = await R((t) => window.__r88.game.valley.heightAt(t[0] - 30, t[1]), t);
        await R(() => window.__r88.respawn()); await wait(300);
        await tele(t[0] - 30, y + 0.2, t[1], Math.PI / 2, 28); await R(() => window.__r88.orbit(0.6, 0.1)); await keys('KeyW');
        await wait(900); await shot('tree_0'); await wait(900); await shot('tree_1'); await release(); await wait(2500); await shot('tree_2');
        console.log('tree', t[2], JSON.stringify(await R((k) => window.__r88.game.eras.worldState.status(k, '1885'), t[2])), JSON.stringify(await R(() => window.__r88.game.eras.scatter.debug())));
      }
    },
    async weather() {
      await install();
      const list = (process.env.WX || '2026:clear,2026:rain,2026:storm,2026:fog,2026:snow,2026:dust,hadean:ash,dino:rain').split(',').map((c) => c.split(':'));
      for (const [era, kind] of list) {
        await setEra(era);
        await R((k) => { const g = window.__r88.game; g.weather.set(k); g.eras.weather.cur = { ...g.eras.weather.target }; g.eras.weather.wet = ['rain', 'storm'].includes(k) ? 1 : 0; g.eras.weather.snowCover = k === 'snow' ? 0.9 : 0; g.eras.weather.pushNow(); }, kind);
        const vp = await view(process.env.VP || 'main'); await place(vp); await wait(kind === 'storm' ? 2000 : 2600);
        if (kind === 'storm') { await wait(500); await R(() => { const g = window.__r88.game, c = g.gfx.camera, f = new window.__r88.THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion); g.eras.weather.strike(c.position.clone(), Math.atan2(f.x, f.z) + 0.25, 900); }); await wait(60); } else await wait(120); await shot(`wx_${era}_${kind}`);
        await reset(); await wait(2000); const s = await R(() => window.__r88.stats());
        console.log('wx', era, kind, JSON.stringify(await R(() => window.__r88.game.eras.weather.debug())), 'p50', s.p50 && s.p50.toFixed(1), 'api', JSON.stringify(await R(() => { const w = window.__r88.game.weather; return { kind: w.kind, rain: +w.rain.toFixed(2), wet: +w.wet.toFixed(2), snow: +w.snow.toFixed(2), season: w.season, kinds: w.kinds, override: w.override }; })));
      }
    },
    async leakcheck() {
      await install();
      for (const id of ['hadean', 'dino', '1885', '2026', '2080', 'ruins', 'scifi', '2026', '1885']) {
        await setEra(id); await wait(1500);
        console.log('leak', id.padEnd(6), await R(() => { const g = window.__r88.game, w = g.phys.world, info = g.gfx.renderer.info; let objs = 0, vis = 0, inst = 0; g.gfx.scene.traverse((o) => { objs++; if (o.visible && (o.isMesh || o.isSprite)) vis++; if (o.isInstancedMesh && o.visible) inst += o.count; }); return JSON.stringify({ colliders: w.colliders.len(), bodies: w.bodies.len(), statics: g.phys.statics.length, objs, vis, inst, geo: info.memory.geometries, tex: info.memory.textures, eraKids: g.eras.root.children.map((c) => c.children.length).join('/') }); }));
      }
    },
    async driveprobe() {
      await install(); await setEra(process.env.ERA || '2026');
      const vp = await view('road');
      const cfgs = [['all', 'true'], ['noRebuild', "g.eras.scatter.rebuild = () => {}"], ['noScatterUpd', "g.eras.scatter.update = () => {}"], ['noStructUpd', "g.eras.structures.update = () => {}"], ['erasHidden', "g.eras.root.visible=false"]];
      for (const [name, js] of cfgs) {
        await R(() => { const g = window.__r88.game; if (!g.__orig) g.__orig = { rb: g.eras.scatter.rebuild, su: g.eras.scatter.update, tu: g.eras.structures.update }; g.eras.scatter.rebuild = g.__orig.rb; g.eras.scatter.update = g.__orig.su; g.eras.structures.update = g.__orig.tu; g.eras.root.visible = true; });
        await R((js) => { const g = window.__r88.game; new Function('g', js)(g); }, js);
        await tele(vp.pos[0], vp.pos[1], vp.pos[2], vp.yaw, 30); await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
        await keys('KeyW'); await wait(1500); await reset(); await wait(5000); await release();
        const s = await R(() => window.__r88.stats()), st = await state();
        console.log(`drive ${name.padEnd(12)} p50=${s.p50.toFixed(1)} p95=${s.p95.toFixed(1)} sim=${st.prof.sim.toFixed(1)} mid=${st.prof.mid.toFixed(1)} render=${st.prof.render.toFixed(1)} rebuildMs=${await R(() => (window.__r88.game.eras.scatter.rebuildMs || 0).toFixed(2))}`);
      }
    },
    async gpuprof() {
      await install(); await setEra(process.env.ERA || '2026');
      const vp = await view(process.env.VP || 'road'); await place(vp); await wait(3000);
      const G = {
        base: 'true',
        struct: "g.eras.structures.group.visible=false",
        floraNear: "for (const [k,M] of g.eras.scatter.meshes) M.near.forEach((n)=>n.visible=false)",
        floraFar: "for (const [k,M] of g.eras.scatter.meshes) if (M.far) M.far.visible=false",
        ground: "for (const [k,M] of g.eras.scatter.meshes) if (['dryGrass','grass','fern','reed','horsetail'].includes(k)) M.near.forEach((n)=>n.visible=false)",
        floraShadow: "for (const [k,M] of g.eras.scatter.meshes) M.near.forEach((n)=>n.castShadow=false)",
        structShadow: "g.eras.structures.group.traverse((o)=>{o.castShadow=false})",
        allEras: "g.eras.root.visible=false",
      };
      const restore = "g.eras.root.visible=true; g.eras.structures.group.visible=true; g.eras.structures.group.traverse((o)=>{ if (o.isMesh && !['era_light','era_sign'].includes(o.userData.k)) o.castShadow=true }); for (const [k,M] of g.eras.scatter.meshes) { M.near.forEach((n)=>n.visible=n.userData.on!==false); if (M.far) M.far.visible=true; M.near.forEach((n)=>n.castShadow=!['dryGrass','grass','fern','reed','horsetail','rock'].includes(k)); }";
      await R(() => { for (const [, M] of window.__r88.game.eras.scatter.meshes) M.near.forEach((n) => { n.userData.on = n.visible; }); });
      const res = {};
      for (let rep = 0; rep < 3; rep++) for (const [name, js] of Object.entries(G)) {
        await R((js) => { const g = window.__r88.game; new Function('g', js)(g); }, restore);
        await R((js) => { const g = window.__r88.game; new Function('g', js)(g); }, js);
        await wait(1800);
        const v = await R(() => window.__r88.game.gfx.gpuMs);
        (res[name] = res[name] || []).push(v);
      }
      for (const [k, a] of Object.entries(res)) console.log('gpu', k.padEnd(13), a.map((v) => v.toFixed(2)).join(' '), 'min', Math.min(...a).toFixed(2));
    },
    async glassdbg() {
      await install(); await setEra('2080'); await R(() => window.__r88.setTime(22, 0, 9, 2));
      const vp = await view('main'); await place(vp); await wait(2500); await shot('glass_a');
      console.log('U', await R(() => { const L = window.__r88.game.eras.lib; return JSON.stringify({ night: L.U.night.value, lit: L.U.lit.value, lights: L.U.lights.value }); }));
      await R(async () => { const g = window.__r88.game, m = g.eras.lib.mats.glass; const tsl = await import('three/tsl'); m.emissiveNode = tsl.vec3(4, 0, 0); m.needsUpdate = true; });
      await wait(1500); await shot('glass_b');
    },
    async causal() {
      await install();
      await setEra('1885');
      const r = await R(() => window.__r88.game.eras.debugDestroy ? window.__r88.game.eras.debugDestroy() : null);
      console.log('destroyed', JSON.stringify(r));
      if (r && r.vp) { await place(r.vp); await wait(2600); await shot('causal_1885'); }
      await setEra('2026');
      const v2 = await R(() => window.__r88.game.eras.siteView('town:8')) || (r && r.vp);
      if (v2) { await place(v2); await wait(2600); await shot('causal_2026'); }
      const ok = await R(() => window.__r88.game.eras.worldState.status('town:8', '2026'));
      console.log('2026 status of town:8', JSON.stringify(ok));
      console.log('state', JSON.stringify(await R(() => window.__r88.game.eras.debug())));
    },
  };
}
