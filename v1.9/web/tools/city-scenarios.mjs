// Roadster 88 city harness scenarios: mega map and Gzowo City shots from fixed viewpoints (aerial, street level, bridges, park, harbour, airport, night), city styles, drives and flights with frame times and draw calls, collider and surface checks.
export function cityScenarios(h) {
  const { R, wait, shot, stats, reset, tele, keys, release, state, fmt } = h;
  const dbg = () => R(() => { const g = window.__r88.game, v = g.valley, c = v && v.city; const P = v && v.prof; return { prof: P ? `views ${P.views.toFixed(2)} tiles ${P.tiles.toFixed(2)} city ${P.city.toFixed(2)}` : null, city: c ? c.debug() : null, calls: g.gfx.renderer.info.render.drawCalls, tris: g.gfx.renderer.info.render.triangles, otiles: v ? v.otiles.size : 0, chunks: v ? v.views.map((w) => w.stats.chunks) : null }; });
  const hold = (pos, look, fov = 62) => R((a) => { const g = window.__r88.game, T = window.__r88.THREE; g.rig.hold = { pos: new T.Vector3(...a[0]), look: new T.Vector3(...a[1]), fov: a[2] }; }, [pos, look, fov]);
  const unhold = () => R(() => { window.__r88.game.rig.hold = null; });
  const tg = (x, z, yaw = 0, v = 0, up = 0.15) => R((a) => window.__r88.tg(...a), [x, z, yaw, v, up]);
  const deckTg = (x, z, yaw = 0, v = 0) => R((a) => { const g = window.__r88.game, V = g.valley, c = V.city, y = c && c.deckAt(a[0], a[1]); const yy = (y !== null && y !== undefined ? y : V.heightAt(a[0], a[1])) + 0.3; window.__r88.teleport(a[0], yy, a[1], a[2], a[3]); return yy; }, [x, z, yaw, v]);
  const setTime = (hh, mo = 10) => R((a) => { window.__r88.setTime(a[0], 0, a[1], 15); const w = window.__r88.game.weather; if (w && w.set) w.set(a[2] || 'clear'); }, [hh, mo, process.env.WX || 'clear']);
  const gy = (x, z) => R((a) => window.__r88.game.valley.heightAt(a[0], a[1]), [x, z]);
  const settle = async (ms = 2500) => { await wait(ms); };
  const VIEWS = {
    aerial_all: { pos: [-900, 5200, -3600], look: [-900, 0, 5200], fov: 55 },
    aerial_city: { pos: [1800, 1500, 2600], look: [-1100, 0, 6200], fov: 50 },
    pass_north: { pos: [-905, 120, 2150], look: [-900, 60, 6500], fov: 58 },
    skyline_river: { pos: [1300, 40, 6500], look: [-900, 140, 6700], fov: 55 },
    midtown_street: { pos: [-648, 7, 6250], look: [-640, 60, 6700], fov: 62 },
    broadway: { pos: [-280, 9, 5560], look: [-470, 40, 5960], fov: 62 },
    park: { pos: [-1150, 70, 4500], look: [-1550, 0, 5300], fov: 60 },
    old_bridge: { pos: [-2400, 60, 6820], look: [-2800, 30, 6920], fov: 55 },
    gzowo_bridge: { pos: [1900, 90, 4400], look: [1000, 50, 4700], fov: 55 },
    drawbridge: { pos: [-2700, 25, 3640], look: [-2910, 8, 3720], fov: 55 },
    harbour: { pos: [2000, 70, 7300], look: [2900, 10, 7550], fov: 55 },
    airport: { pos: [-4300, 120, 6700], look: [-6200, 10, 7150], fov: 55 },
    borough: { pos: [-3300, 90, 4200], look: [-4400, 20, 4600], fov: 55 },
    ring: { pos: [520, 30, 5900], look: [505, 15, 6600], fov: 60 },
    desert: { pos: [-900, 160, -3200], look: [-300, 60, -5600], fov: 60 },
  };
  const views = (process.env.VIEWS || '').split(',').filter(Boolean);
  const shootViews = async (tag, list) => {
    for (const name of list) {
      const v = VIEWS[name]; if (!v) continue;
      await R(() => { const g = window.__r88.game; if (!g._noDeath) { g._noDeath = true; g.onDeath = () => {}; } });
      const land = await R((a) => { const V = window.__r88.game.valley; return V.heightAt(a[0], a[1]) > 1.5 && !V.fluidAt(a[0], a[1]); }, [v.pos[0], v.pos[2]]);
      await R((a) => { const V = window.__r88.game.valley, q = V.safeSpawnAt(a[0], a[1]); window.__r88.teleport(q[0], q[1] + 0.2, q[2], 0, 0); }, [land ? v.pos[0] + 12 : -900, land ? v.pos[2] + 12 : 4100]); await hold(v.pos, v.look, v.fov);
      await settle(name.startsWith('aerial') ? 4500 : 3200);
      await shot(`city_${tag}_${name}`);
      console.log(name, JSON.stringify(await dbg()));
    }
    await unhold();
  };
  const breakdown = () => R(() => {
    const g = window.__r88.game, T = window.__r88.THREE, cam = g.gfx.camera, fr = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const out = {};
    const top = (o) => { let p = o, name = o.name || o.type; while (p.parent && p.parent.type !== 'Scene') { p = p.parent; } return (p.name || p.type) + (o.userData && o.userData.k ? ':' + o.userData.k : o.isInstancedMesh ? ':inst' : ''); };
    g.gfx.scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (o.frustumCulled !== false && o.geometry.boundingSphere) { const s = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld); if (!fr.intersectsSphere(s)) return; }
      const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
      if (o.isInstancedMesh && !o.count) return;
      const k = top(o); out[k] = out[k] || [0, 0]; out[k][0]++; out[k][1] += Math.round(n);
    });
    return Object.entries(out).sort((a, b) => b[1][1] - a[1][1]).map(([k, v]) => `${k} ${v[0]}d ${(v[1] / 1000).toFixed(0)}k`).join(' | ');
  });
  return {
    async citybreak() {
      for (const [name, x, z, yaw] of [['valley', -903, -330, 0], ['midtown', -640, 6300, 0], ['airport', -6000, 7230, Math.PI / 2]]) {
        await tg(x, z, yaw, 0); await R((y) => window.__r88.orbit(y, 0.12), 0.4); await wait(3000);
        console.log('break', name, await breakdown());
      }
    },
    async cityboot() {
      await wait(1500);
      console.log('boot dbg', JSON.stringify(await dbg()));
      console.log('state', fmt(await state()));
      await reset(); await wait(3000); await stats('spawn');
    },
    async cityshots() {
      await setTime(Number(process.env.HOUR || 15), 9);
      await shootViews(process.env.TAG || 'day', views.length ? views : Object.keys(VIEWS));
    },
    async citynight() {
      await setTime(21.5, 9);
      const nv = (process.env.NVIEWS || '').split(',').filter(Boolean);
      await shootViews('night', nv.length ? nv : views.length ? views : ['aerial_city', 'midtown_street', 'broadway', 'old_bridge', 'skyline_river']);
    },
    async citystyles() {
      for (const st of (process.env.STYLES || 'frontier,early,mid,modern,future,ruins,scifi').split(',')) {
        const H = { frontier: 14, early: 260, mid: 420, modern: 460, future: 820, ruins: 380, scifi: 1400 }[st] || 460;
        const t0 = Date.now();
        await R((a) => window.__r88.game.valley.setCity({ style: a[0], density: a[0] === 'scifi' ? 0.6 : 1, height: a[1] }), [st, H]);
        console.log('style', st, 'ms', Date.now() - t0, JSON.stringify(await dbg()));
        await shootViews(`style_${st}`, (process.env.SVIEWS || 'aerial_city,midtown_street').split(','));
      }
    },
    async earth() {
      await release();
      const ok = await R(async () => { const v = window.__r88.game.valley; for (let i = 0; i < 150 && !(v.earth && v.backdropPatch); i++) await new Promise((r) => setTimeout(r, 200)); return !!v.earth; });
      console.log('earth backdrop', ok, JSON.stringify(await R(() => { const v = window.__r88.game.valley; return { compileMs: v.earth && Math.round(v.earth.terrain.compileMs || 0), E0: v.E0 }; })));
      await setTime(Number(process.env.HOUR || 13), 7);
      const frames = (n = 120) => R(async (k) => { const d = []; let l = performance.now(); await new Promise((res) => { const f = () => { const t = performance.now(); d.push(t - l); l = t; if (d.length < k) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); const s = d.slice().sort((a, b) => a - b); return { p50: +s[Math.floor(k / 2)].toFixed(1), p95: +s[Math.floor(k * 0.95)].toFixed(1), max: +s[k - 1].toFixed(1), over25: d.filter((x) => x > 25).length }; }, n);
      const only = (process.env.PLACES || '').split(',').filter(Boolean);
      if (!only.length || only.includes('seam')) {
        await tg(-900, 3800, 0, 0);
        for (const [name, pos, look] of [['seam_south', [-900, 420, -7300], [-700, 150, -18000]], ['seam_west', [7000, 1500, 1500], [18000, 300, -2000]], ['seam_out', [-2500, 900, -14000], [-900, 200, -2000]]]) {
          await hold(pos, look, 58); await settle(4500); await shot(`earth_${name}`);
        }
        await unhold();
      }
      const PLACES = [['hawaii', 19.73, -155.12], ['alps', 46.03, 7.72], ['baltic', 54.45, 18.56], ['sahara', 23.5, 10.5], ['fuji', 35.33, 138.68]];
      for (const [name, lat, lon] of PLACES) {
        if (only.length && !only.includes(name)) continue;
        const r = await R(async (a) => {
          const v = window.__r88.game.valley, t = performance.now();
          const res = await v.setLocation(a[0], a[1]);
          const sp = v.spawn; window.__r88.teleport(sp.pos[0], sp.pos[1] + 0.6, sp.pos[2], sp.yaw, 0);
          return { mode: res.mode, ms: res.ms, wall: Math.round(performance.now() - t), spawn: sp.pos.map((x) => Math.round(x)), climate: res.climate, tiles: v.earth.tiles.size, surf: v.surfaceAt(sp.pos[0], sp.pos[2]) };
        }, [lat, lon]);
        console.log('land', name, JSON.stringify(r));
        console.log('frames after landing', name, JSON.stringify(await frames(150)));
        await wait(1500);
        await shot(`earth_${name}_car`);
        const [sx, sy, sz] = r.spawn;
        await hold([sx + 400, sy + 260, sz - 900], [sx - 300, sy - 50, sz + 2500], 60); await settle(4000); await shot(`earth_${name}_view`);
        await hold([sx - 2000, sy + 1800, sz - 6000], [sx, sy, sz + 4000], 55); await settle(4500); await shot(`earth_${name}_aerial`);
        await unhold();
        await R((y) => window.__r88.orbit(y, 0.2), 0);
        await keys('KeyW');
        const log = [];
        for (let i = 0; i < 12; i++) { await wait(500); const s = await state(); log.push(`${s.pos.map((q) => q.toFixed(0)).join(',')}@${s.mph.toFixed(0)}${s.contacts ? '' : 'A'}`); }
        await release();
        console.log('drive', name, log.join(' '));
        await R(() => { window.__r88.game.valley.earth.terrain.root.visible = false; window.__r88.game.valley.earth.water.root.visible = false; });
        const hid = await frames(90);
        await R(() => { const E = window.__r88.game.valley.earth; E.terrain.root.visible = true; E.water.root.visible = true; });
        console.log('frames no-earth-mesh', name, JSON.stringify(hid));
        console.log('frames driving', name, JSON.stringify(await frames(120)), JSON.stringify(await R(() => { const v = window.__r88.game.valley; const p = window.__r88.game.car.sim.pos; return { tiles: v.earth.tiles.size, h: v.heightAt(p.x, p.z), y: p.y, surf: v.surfaceAt(p.x, p.z), calls: window.__r88.game.gfx.renderer.info.render.drawCalls }; })));
        await shot(`earth_${name}_drive`);
      }
      const back = await R(async () => { const v = window.__r88.game.valley; const res = await v.setLocation(35.1, -117.9); const sp = v.spawn; window.__r88.teleport(sp.pos[0], sp.pos[1] + 0.6, sp.pos[2], sp.yaw, 0); return { mode: res.mode, roads: v.roads.length, regions: v.regions.length, tiles: v.tiles.length }; });
      console.log('back', JSON.stringify(back));
      await wait(2000); await shot('earth_back_valley');
    },
    async earthshots() {
      await release();
      await R(async () => { const v = window.__r88.game.valley; for (let i = 0; i < 150 && !(v.earth && v.backdropPatch); i++) await new Promise((r) => setTimeout(r, 200)); });
      await setTime(Number(process.env.HOUR || 11), 7);
      const SPOTS = [
        ['hawaii', 19.70, -155.26, [['maunakea', 19.8207, -155.468, 0.25], ['coast', 19.72, -155.05, 0.1]]],
        ['alps', 46.02, 7.75, [['matterhorn', 45.976, 7.658, 0.2], ['valley', 46.08, 7.78, 0.08]]],
        ['baltic', 54.44, 18.56, [['bay', 54.6, 18.85, 0.03], ['coast', 54.52, 18.55, 0.04]]],
        ['fuji', 35.47, 138.76, [['fuji', 35.3606, 138.7274, 0.3]]],
      ];
      const only = (process.env.PLACES || '').split(',').filter(Boolean);
      for (const [name, lat, lon, looks] of SPOTS) {
        if (only.length && !only.includes(name)) continue;
        const r = await R(async (a) => { const v = window.__r88.game.valley; const res = await v.setLocation(a[0], a[1]); const sp = v.spawn; window.__r88.teleport(sp.pos[0], sp.pos[1] + 0.6, sp.pos[2], sp.yaw, 0); return { spawn: sp.pos, climate: res.climate && res.climate.zone }; }, [lat, lon]);
        console.log('spot', name, JSON.stringify(r));
        await wait(2500);
        for (const [lk, la, lo, up] of looks) {
          const cam = await R((a) => { const v = window.__r88.game.valley, P = v.earth.P, sp = v.spawn.pos; const [tx, tz] = P.local(a[0], a[1]); const ty = v.heightAt(tx, tz); const dx = tx - sp[0], dz = tz - sp[2], d = Math.hypot(dx, dz); const back = 120; const px = sp[0] - dx / d * back, pz = sp[2] - dz / d * back, py = Math.max(v.heightAt(px, pz), sp[1]) + 25 + d * a[2] * 0.05; return { pos: [px, py, pz], look: [tx, ty + d * a[2] * 0.02, tz], d: Math.round(d), ty: Math.round(ty) }; }, [la, lo, up]);
          await hold(cam.pos, cam.look, 50); await settle(4500); await shot(`earth_${name}_${lk}`);
          console.log('look', name, lk, JSON.stringify(cam));
        }
        await unhold();
        await R((y) => window.__r88.orbit(y, 0.12), 0.5); await wait(1500); await shot(`earth_${name}_car2`);
      }
      const back = await R(async () => { const v = window.__r88.game.valley; await v.setLocation(35.1, -117.9); const sp = v.spawn; window.__r88.teleport(sp.pos[0], sp.pos[1] + 0.6, sp.pos[2], sp.yaw, 0); return v.location.mode; });
      console.log('back', back);
      for (const [nm, pos, look] of [['seam1', [-2500, 900, -14000], [-900, 200, -2000]], ['seam2', [-15000, 1100, 1500], [-3000, 150, 2500]]]) { await tg(-900, 3800, 0, 0); await hold(pos, look, 58); await settle(4500); await shot(`earth_${nm}`); }
      await unhold();
    },
    async earthsnap() {
      await release();
      await R(async () => { const v = window.__r88.game.valley; for (let i = 0; i < 150 && !(v.earth && v.backdropPatch); i++) await new Promise((r) => setTimeout(r, 200)); });
      const probe = [46.03, 7.73];
      for (const [name, lat, lon] of [['a', 46.02, 7.75], ['b', 46.09, 7.66], ['c', 45.93, 7.86], ['other', 46.2, 7.5], ['sea', 54.62, 18.75]]) {
        const r = await R(async (a) => {
          const v = window.__r88.game.valley, res = await v.setLocation(a[0], a[1]);
          const P = v.earth.P, [px, pz] = P.local(a[2], a[3]), [lx, lz] = P.local(a[0], a[1]);
          return { origin: v.location.origin, spawn: v.spawn.pos.map((x) => Math.round(x)), landing: [Math.round(lx), Math.round(lz)], probeXZ: [Math.round(px), Math.round(pz)], probeH: +v.heightAt(px, pz).toFixed(4), surf: v.surfaceAt(v.spawn.pos[0], v.spawn.pos[2]), ms: res.ms };
        }, [lat, lon, probe[0], probe[1]]);
        console.log('snap', name, JSON.stringify(r));
      }
      await R(async () => { await window.__r88.game.valley.setLocation(35.1, -117.9); });
    },
    async earthprof() {
      await release();
      await R(async () => { const v = window.__r88.game.valley; for (let i = 0; i < 150 && !(v.earth && v.backdropPatch); i++) await new Promise((r) => setTimeout(r, 200)); });
      await setTime(12, 7);
      const measure = (n = 150) => R(async (k) => {
        const g = window.__r88.game, d = []; let l = performance.now();
        await new Promise((res) => { const f = () => { const t = performance.now(); d.push(t - l); l = t; if (d.length < k) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        const s = d.slice().sort((a, b) => a - b), inf = g.gfx.renderer.info.render;
        return `p50 ${s[k >> 1].toFixed(1)} p95 ${s[Math.floor(k * 0.95)].toFixed(1)} gpu ${(g.gfx.gpuMs || 0).toFixed(1)} sc ${g.gfx.scale.toFixed(2)} dc ${inf.drawCalls} tri ${(inf.triangles / 1e6).toFixed(2)}M`;
      }, n);
      const vis = (what, on) => R((a) => {
        const g = window.__r88.game, E = g.valley.earth;
        const sel = { terrain: [E.terrain.root], water: [E.water.root], eras: g.gfx.scene.children.filter((c) => /^Eras|^Life|Story/.test(c.name)), car: [g.car && g.car.view && g.car.view.root].filter(Boolean) }[a[0]] || [];
        for (const o of sel) o.visible = a[1];
      }, [what, on]);
      const lock = (sc) => R((v) => { const g = window.__r88.game.gfx; if (v) { g.dynres = false; g.scale = v; g.applyScale(); } else g.dynres = true; }, sc);
      const only = (process.env.PLACES || '').split(',').filter(Boolean);
      for (const [name, lat, lon] of [['amazon', -3.4, -62.5], ['taiga', 61.5, 99.0], ['alps', 46.02, 7.75], ['sahara', 23.5, 10.5]]) {
        if (only.length && !only.includes(name)) continue;
        await R(async (a) => { const v = window.__r88.game.valley; await v.setLocation(a[0], a[1]); const sp = v.spawn; window.__r88.teleport(sp.pos[0], sp.pos[1] + 0.6, sp.pos[2], sp.yaw, 0); }, [lat, lon]);
        await R((y) => window.__r88.orbit(y, 0.12), 0.3); await wait(3000);
        const out = [];
        out.push('dyn ' + await measure());
        await lock(1); await wait(800); out.push('full ' + await measure());
        await R(() => { const T = window.__r88.game.valley.earth.terrain; for (const L of T.levels) { L.mesh.userData.minDistSave = L.mesh.userData.minDist; L.mesh.userData.minDist = 0; } });
        await wait(600); out.push('no-octave-skip ' + await measure());
        await R(() => { const T = window.__r88.game.valley.earth.terrain; for (const L of T.levels) L.mesh.userData.minDist = L.mesh.userData.minDistSave; });
        for (const w of ['terrain', 'water', 'eras', 'car']) { await vis(w, false); await wait(600); out.push(`no-${w} ` + await measure()); await vis(w, true); }
        await lock(0);
        await R((y) => window.__r88.orbit(y, 0.12), 0); await keys('KeyW', 'ShiftLeft');
        await wait(1500); out.push('drive ' + await measure(300));
        await release();
        out.push('tiles ' + await R(() => window.__r88.game.valley.earth.tiles.size) + ' mph ' + (await state()).mph.toFixed(0));
        console.log('prof', name, '\n  ' + out.join('\n  '));
        console.log('cpu', name, fmt(await state()));
      }
    },
    async spaceland() {
      const lat = Number(process.env.LAT || 27.99), lon = Number(process.env.LON || 86.93);
      const st = () => R(() => { const g = window.__r88.game, S = g.space, V = g.valley, p = g.car.sim.pos; return { s: S.state, a: S.active, p: [Math.round(p.x), Math.round(p.y), Math.round(p.z)], mode: V.location.mode, tiles: V.earth ? V.earth.tiles.size : -1, h: V.inEarth ? Math.round(V.heightAt(p.x, p.z)) : null }; });
      for (let i = 0; i < 100; i++) { const s = await st(); if (s.a && s.s === 'orbit') break; await wait(300); }
      await wait(2500);
      console.log('orbit', JSON.stringify(await st()));
      await R((a) => window.__r88.game.space.setTarget(a[0], a[1]), [lat, lon]);
      await R(() => window.__r88.game.space.press()); await wait(400); await R(() => window.__r88.game.space.press());
      const log = [];
      for (let i = 0; i < 50; i++) { await wait(300); const s = await st(); log.push(`${s.s}${s.a ? '*' : ''} ${s.mode} y${s.p[1]} h${s.h} t${s.tiles}`); if (s.s === 'ground' && i > 5) break; }
      console.log('reentry', log.join(' | '));
      await wait(3000);
      console.log('landed', JSON.stringify(await st()), JSON.stringify(await R(() => { const V = window.__r88.game.valley; return { loc: V.location.origin, spawn: V.spawn.pos.map((x) => Math.round(x)), surf: V.surfaceAt(V.spawn.pos[0], V.spawn.pos[2]) }; })));
      await R((y) => window.__r88.orbit(y, 0.15), 0.6); await wait(1500); await shot('earth_spaceland');
      await keys('KeyW'); await wait(4000); await release();
      console.log('after drive', JSON.stringify(await st()), fmt(await state()));
    },
    async earthperf() {
      await release();
      await R(async () => { const v = window.__r88.game.valley; for (let i = 0; i < 150 && !(v.earth && v.backdropPatch); i++) await new Promise((r) => setTimeout(r, 200)); });
      await setTime(13, 7);
      const frames = (n = 120) => R(async (k) => { const d = []; let l = performance.now(); await new Promise((res) => { const f = () => { const t = performance.now(); d.push(t - l); l = t; if (d.length < k) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); const s = d.slice().sort((a, b) => a - b); return `p50 ${s[Math.floor(k / 2)].toFixed(1)} p95 ${s[Math.floor(k * 0.95)].toFixed(1)} max ${s[k - 1].toFixed(1)} dc ${window.__r88.game.gfx.renderer.info.render.drawCalls}`; }, n);
      for (const [name, x, z, yaw] of [['valley', -903, -330, 0], ['midtown', -640, 6300, 0], ['edge', -900, -7000, Math.PI]]) {
        await tg(x, z, yaw, 0); await R((y) => window.__r88.orbit(y, 0.12), 0.4); await wait(3000);
        const a = await frames();
        await R(() => { window.__r88.game.valley.earth.terrain.root.visible = false; }); await wait(400);
        const b = await frames();
        await R(() => { window.__r88.game.valley.earth.terrain.root.visible = true; });
        console.log('vperf', name, 'backdrop', a, '| hidden', b);
      }
      for (const [name, lat, lon] of [['alps', 46.02, 7.75], ['baltic', 54.44, 18.56]]) {
        const r = await R(async (a) => { const v = window.__r88.game.valley; const t = performance.now(); await v.setLocation(a[0], a[1]); const sp = v.spawn; window.__r88.teleport(sp.pos[0], sp.pos[1] + 0.6, sp.pos[2], sp.yaw, 0); return Math.round(performance.now() - t); }, [lat, lon]);
        await R((y) => window.__r88.orbit(y, 0.12), 0.4); await wait(2500);
        console.log('eperf', name, 'land ms', r, await frames(), JSON.stringify(await R(() => window.__r88.game.valley.earth.terrain.levels.map((L) => L.mesh.visible ? 1 : 0).join(''))));
        await shot(`earth_perf_${name}`);
      }
      await R(async () => { const v = window.__r88.game.valley; await v.setLocation(35.1, -117.9); });
    },
    async cityswitch() {
      await release();
      await tg(-640, 6250, 0, 0); await reset();
      await R((y) => window.__r88.orbit(y, 0.25), 0);
      if (process.env.DRIVE) await keys('KeyW');
      await wait(3000);
      console.log('base', JSON.stringify(await R(async () => { const d = []; let l = performance.now(); await new Promise((res) => { const f = () => { const t = performance.now(); d.push(t - l); l = t; if (d.length < 90) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); d.sort((a, b) => a - b); return { p50: Math.round(d[45]), p95: Math.round(d[85]), max: Math.round(d[89]) }; })));
      const list = (process.env.STYLES || 'future,ruins,none,early,modern,scifi,frontier,mid,modern').split(',');
      for (const st of list) {
        const H = { frontier: 14, early: 260, mid: 420, modern: 460, future: 820, ruins: 380, scifi: 1400, none: 0 }[st] || 460;
        const r = await R(async (a) => {
          const v = window.__r88.game.valley, dts = [], long = []; let last = performance.now(), on = true;
          const t0 = performance.now();
          const tick = () => { const t = performance.now(); dts.push(t - last); if (t - last > 50) long.push([Math.round(last - t0), Math.round(t - last)]); last = t; if (on) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          const ok = await v.setCity({ style: a[0], density: a[0] === 'scifi' ? 0.6 : a[0] === 'none' ? 0 : 1, height: a[1] });
          const ms = performance.now() - t0;
          await new Promise((res) => setTimeout(res, 400));
          on = false;
          dts.sort((x, y) => y - x);
          const c = v.city, st2 = c.structures;
          let meshes = 0; c.root.traverse((o) => { if (o.isMesh && o.visible) meshes++; });
          return { ok, ms: Math.round(ms), long, tl: c.tl, frames: dts.length, worst: dts.slice(0, 4).map((x) => Math.round(x)), over33: dts.filter((x) => x > 33).length, tset: c.tset, style: c.style, buildings: c.plan.buildings.length, meshes, structs: st2 ? st2.root.children.length : 0, roads: v.roads.length, deck: c.deckAt(505, 6000) };
        }, [st, H]);
        console.log('switch', st, JSON.stringify(r));
      }
      await release();
      const s = await state(); console.log('car', fmt(s));
      await stats('after switches');
    },
    async cityab() {
      await release();
      const spots = [['midtown', -640, 6250, 0], ['park', -1150, 4500, 0.6], ['harbour', 2000, 7300, 1.2]];
      const measure = () => R(async () => { const g = window.__r88.game, d = []; let l = performance.now(); await new Promise((res) => { const f = () => { const t = performance.now(); d.push(t - l); l = t; if (d.length < 120) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); d.sort((a, b) => a - b); return `p50 ${d[60].toFixed(1)} p90 ${d[108].toFixed(1)} dc ${g.gfx.renderer.info.render.drawCalls} tri ${(g.gfx.renderer.info.render.triangles / 1e6).toFixed(2)}M`; });
      const setv = (mode) => R((m) => {
        const g = window.__r88.game, c = g.valley.city;
        c.root.visible = m !== 'nocity';
        c.root.traverse((o) => { if (o.isMesh) { if (o.userData.cs0 === undefined) o.userData.cs0 = o.castShadow; o.castShadow = m === 'noshadow' ? false : o.userData.cs0; } });
        for (const [k, d] of c.details) { if (d.mesh) d.mesh.material = c.facade; }
        c.hideDetail = m === 'nodetail';
        for (const d of c.details.values()) { if (d.mesh) d.mesh.visible = m !== 'nodetail'; if (d.props) d.props.visible = m !== 'nodetail'; }
        if (c.props && c.props.root) c.props.root.visible = m !== 'noprops' && m !== 'nocity';
        const car = g.car && g.car.view && g.car.view.root; if (car) car.visible = m !== 'nocar';
      }, mode);
      for (const [name, x, z, yaw] of spots) {
        await tg(x, z, yaw, 0); await R((y) => window.__r88.orbit(y, 0.25), 0); await wait(3500);
        const out = [];
        for (const m of ['all', 'nocity', 'noshadow', 'nodetail', 'noprops', 'nocar', 'all']) { await setv(m); await wait(600); out.push(`${m}: ${await measure()}`); }
        await setv('all');
        console.log('ab', name, out.join(' | '));
      }
    },
    async citydrive() {
      await release();
      const y = await tg(-900, 3500, 0, 0);
      await wait(1500); await reset();
      await keys('KeyW', 'ShiftLeft');
      for (let i = 0; i < 12; i++) { await wait(700); const s = await state(); console.log('drive', fmt(s)); if (i === 5) await shot('city_drive_avenue'); }
      await release(); await stats('avenue drive'); console.log(JSON.stringify(await dbg()));
    },
    async cityring() {
      await release();
      await deckTg(505, 4000, 0, 60);
      await wait(800); await reset();
      await keys('KeyW');
      for (let i = 0; i < 14; i++) { await wait(800); const s = await state(); console.log('ring', fmt(s)); if (i === 6) await shot('city_ring_drive'); }
      await release(); await stats('ring drive');
    },
    async cityfly() {
      await release();
      await tg(-900, 3400, 0, 60, 120);
      await wait(400); await reset();
      await keys('KeyW', 'Space');
      for (let i = 0; i < 16; i++) { await wait(700); const s = await state(); console.log('fly', fmt(s)); if (i === 6) await shot('city_fly'); if (i === 3) await keys('KeyW'); }
      await release(); await stats('flight over city'); console.log(JSON.stringify(await dbg()));
    },
    async cityperf() {
      const all = [['valley', -903, -330, 0], ['avenue', -900, 5000, 0], ['midtown', -640, 6300, 0], ['broadway', -385, 5700, -0.45], ['borough', -4380, 5150, 0.2], ['airport', -6000, 7230, Math.PI / 2], ['port', 2200, 6680, 0]];
      const pick = (process.env.SPOTS || '').split(',').filter(Boolean), spots = pick.length ? all.filter((s) => pick.includes(s[0])) : all;
      for (const [name, x, z, yaw] of spots) {
        await tg(x, z, yaw, 0); await R((y) => window.__r88.orbit(y, 0.12), 0.4);
        await wait(2500); await reset(); await wait(3000);
        const s = await stats(`perf ${name}`); const d = await dbg();
        console.log('perf', name, 'calls', d.calls, 'tris', d.tris, d.prof, JSON.stringify(d.city), fmt(await state()));
        if (process.env.BREAK) console.log('break', name, await breakdown());
        await shot(`city_perf_${name}`);
      }
    },
    async citytest() {
      const only = (process.env.RUNS || '').split(',').filter(Boolean);
      const runs0 = [
        ['avenue', -900, 3560, 0, 45, 6],
        ['ring', 497, 4000, 0, 50, 8, true],
        ['oldbridge', -2150, 6920, -Math.PI / 2, 40, 8],
        ['gzowo', 200, 4700, Math.PI / 2, 45, 8],
        ['tunnel', 120, 6360, Math.PI / 2, 35, 12],
        ['drawbridge', -2600, 3720, -Math.PI / 2, 25, 6],
        ['drawjump', -2600, 3716, -Math.PI / 2, 45, 7],
        ['rampsw', -890, 3150, 0, 30, 7],
      ];
      const runs = only.length ? runs0.filter((r) => only.includes(r[0])) : runs0;
      for (const [name, x, z, yaw, v, secs, deck] of runs) {
        await release();
        await R((b) => { const c = window.__r88.game.valley.city; c.debugBridge = b; }, name === 'drawjump' ? 0.2 : 0);
        if (deck) await deckTg(x, z, yaw, v); else await tg(x, z, yaw, v, 0.4);
        await R((y) => window.__r88.orbit(y, 0.25), 0);
        await keys('KeyW');
        const log = [];
        for (let i = 0; i < secs * 2; i++) { await wait(500); const s = await state(); log.push(`${s.pos.map((q) => q.toFixed(0)).join(',')}@${s.mph.toFixed(0)}${s.contacts ? '' : 'A'}`); if (i === secs) await shot(`city_test_${name}`); }
        await release();
        console.log('test', name, log.join(' '));
        console.log('surface', name, JSON.stringify(await R(() => { const g = window.__r88.game, p = g.car.sim.pos; return { s: g.valley.surfaceAt(p.x, p.z, p.y), h: g.valley.heightAt(p.x, p.z), deck: g.valley.city.deckAt(p.x, p.z, p.y), broken: g.car.lattice ? g.car.lattice.brokenCount : 0 }; })));
        await R(() => window.__r88.respawn());
      }
      await R(() => { window.__r88.game.valley.city.debugBridge = undefined; });
      console.log('dbg', JSON.stringify(await dbg()));
    },
    async citycheck() {
      const pts = [[-900, 5000], [-640, 6300], [600, 4700], [1000, 4700], [-2800, 6920], [-2910, 3720], [300, 6360], [1000, 6360], [900, 6700], [1150, 6800], [1300, 6600], [-3300, 4200], [-4300, 6700]];
      for (const [x, z] of pts) console.log('check', x, z, JSON.stringify(await R((a) => { const v = window.__r88.game.valley, c = v.city; return { h: v.heightAt(a[0], a[1]), s: v.surfaceAt(a[0], a[1]), deck: c ? c.deckAt(a[0], a[1]) : null, reg: (v.regionAt(a[0], a[1]) || {}).id }; }, [x, z])));
    },
  };
}
