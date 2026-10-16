// Roadster 88 browser harness: drives the game through window.__r88 in a real Chrome (GPU, offscreen window), runs scripted scenarios, saves screenshots and frame-time stats.
// usage: node web/tools/harness.mjs <scenario[,scenario...]> [--q=high] [--webgl] [--out=dir] [--w=1440 --h=900]
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const flag = (k) => args.includes(`--${k}`);
const scenarios = (args.find((a) => !a.startsWith('--')) || 'idle').split(',');
const out = opt('out', path.resolve(here, '../../Niepotrzebne/shots-web'));
const W = Number(opt('w', 1440)), H = Number(opt('h', 900));
fs.mkdirSync(out, { recursive: true });
const exe = '/Users/jurek/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H + 80}`, '--window-position=3000,3000', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [], logs = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 6).join(' | ')));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('404')) errors.push(t); else if (m.type() === 'warning' || m.type() === 'log') logs.push(`[${m.type()}] ${t}`); });
const q = opt('q', 'high');
const url = `http://localhost:8788/web/?debug&q=${q}${flag('webgl') ? '&webgl' : ''}${flag('nodynres') ? '&nodynres' : ''}${flag('trace') ? '&trace' : ''}${opt('extra', '')}`;
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
try { await page.waitForFunction(() => window.__r88 && window.__r88.game.started, null, { timeout: 90000 }); }
catch (e) { console.log('BOOT FAILED', await page.evaluate(() => document.getElementById('ldText').textContent)); console.log(errors.join('\n')); console.log(logs.slice(0, 40).join('\n')); await page.screenshot({ path: `${out}/bootfail.png` }); await browser.close(); process.exit(1); }
console.log(`boot ${(Date.now() - t0) / 1000}s`);
const wait = (ms) => page.waitForTimeout(ms);
const R = (fn, a) => page.evaluate(fn, a);
const keys = (...k) => R((k) => window.__r88.keys(...k), k);
const release = () => R(() => window.__r88.release());
const tap = (k) => R((k) => window.__r88.tap(k), k);
const tag = opt('tag', '');
const shot = async (name) => { name = name + tag; await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
const state = () => R(() => window.__r88.state());
const fmt = (s) => `y${s.yaw.toFixed(1)} b${s.beta.toFixed(1)} wy${s.wy.toFixed(1)} ch${s.cam.toFixed(1)} ${s.mph.toFixed(1)}mph ${s.mode} g${s.gear} c${s.contacts} @${s.pos.map((v) => v.toFixed(1)).join(',')} fps${s.fps.toFixed(0)} sc${s.scale.toFixed(2)} gpu${(s.gpu || 0).toFixed(1)} dc${s.calls}${s.prof ? ` cpu[sim ${s.prof.sim.toFixed(1)} mid ${s.prof.mid.toFixed(1)} rnd ${s.prof.render.toFixed(1)}]` : ''}`;
const sample = async (n, ms, label) => { const a = []; for (let i = 0; i < n; i++) { await wait(ms); a.push(fmt(await state())); } console.log(label + ': ' + a.join(' | ')); };
const tele = (x, y, z, yaw = 0, v = 0) => R((a) => window.__r88.teleport(...a), [x, y, z, yaw, v]);
const stats = async (label) => { const s = await R(() => window.__r88.stats()); if (!s.n) { console.log(label, 'NO FRAMES', errors.slice(0, 5).join(' / ')); return s; } console.log(`${label} frames n=${s.n} avg=${s.avg.toFixed(1)} p50=${s.p50.toFixed(1)} p95=${s.p95.toFixed(1)} p99=${s.p99.toFixed(1)} max=${s.max.toFixed(1)} spikes=${s.spikes} scale=${s.scale.toFixed(2)}`); return s; };
const reset = () => R(() => window.__r88.resetStats());
if (opt('js')) console.log('js ->', await page.evaluate(opt('js')));
console.log('backend', (await state()).backend, JSON.stringify(await R(() => window.__r88.gpu())));

const S = {
  async idle() { await wait(6000); await reset(); await wait(5000); await stats('idle'); await sample(3, 300, 'state'); await shot('idle'); },
  async orbit() { for (const [i, y] of [[0, 2.4], [1, -2.2], [2, 3.14], [3, 0.9]]) { await R((a) => window.__r88.orbit(a[0], a[1]), [y, 0.05]); await wait(900); await shot(`orbit_${i}`); } },
  async launch() {
    await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
    await wait(800); await reset();
    await keys('KeyW'); await sample(10, 250, 'launch'); await shot('launch_2s');
    await wait(3000); await shot('launch_5s'); await sample(4, 500, 'cruise'); await release(); await stats('launch');
  },
  async boost() {
    await wait(5000); await reset();
    await keys('KeyW', 'ShiftLeft'); await sample(6, 200, 'boost'); await shot('boost_1s'); await wait(4000); await shot('boost_5s'); await release(); await stats('boost'); console.log('dtlog', await R(() => window.__r88.game.dtLog.slice(-300).join(' ')));
  },
  async hop() {
    await tele(120, 0.05, -620, 0, 22); await wait(300);
    await keys('KeyW'); await wait(600);
    const y0 = (await state()).pos[1];
    await keys('KeyW', 'Space'); await wait(260); await keys('KeyW');
    let maxY = y0;
    for (let i = 0; i < 16; i++) { await wait(60); const s = await state(); maxY = Math.max(maxY, s.pos[1]); if (i === 4) await shot('hop_air'); }
    console.log('hop rise', (maxY - y0).toFixed(2), 'm'); await release();
  },
  async hover() {
    await wait(500);
    await keys('Space'); await wait(1600); await shot('hover_climb'); await keys(); await wait(1500); await shot('hover_hold');
    await keys('KeyA'); await sample(6, 300, 'yaw'); await shot('hover_yaw'); await keys('Space', 'KeyW'); await wait(1200); await shot('hover_fwd'); await release();
  },
  async night() { await R(() => window.__r88.setTime(22, 30)); await wait(2500); await shot('night'); await keys('KeyW'); await wait(2000); await shot('night_drive'); await release(); },
  async fpp() {
    await R(() => window.__r88.camera('fpp')); await wait(1500); await shot('fpp');
    await R(() => window.__r88.look(-0.45, -0.3)); await wait(800); await shot('fpp_screen');
    console.log('gaze', await R(() => { const c = window.__r88.game.cockpit; return JSON.stringify(c.hit ? { x: Math.round(c.hit.x), y: Math.round(c.hit.y), hover: c.hover } : null); }));
    await R(() => window.__r88.click()); await wait(600); await shot('fpp_tap');
    await R(() => window.__r88.look(0.9, 0.05)); await wait(800); await shot('fpp_side');
    await R(() => window.__r88.camera('chase'));
  },
  async crash30() { await crash(30, 'crash30'); },
  async crash80() { await crash(80, 'crash80'); },
  async crash200() { await crash(200, 'crash200'); },
  async time() {
    await R(() => window.__r88.respawn()); await wait(300);
    await R(() => window.__r88.arm(4)); await wait(400);
    await tele(0, 0.05, -900, 0, 30); await keys('KeyW', 'ShiftLeft');
    for (let i = 0; i < 40; i++) { await wait(100); const st = await state(); if (st.mph > 76 && !this.c1) { this.c1 = 1; await shot('time_charge'); } if (st.tc === 'departing' || st.tc === 'gone') break; }
    const dbg = () => R(() => { const g = window.__r88.game; return JSON.stringify({ tc: g.tc.state, t: g.tc.t.toFixed(2), flash: g.gfx.u.flash.value.toFixed(2), exp: g.gfx.u.exposure.value.toFixed(2), arc: g.timeFx.arcIntensity.value.toFixed(2), glow: g.mats.u.arcGlow.value.toFixed(2), frost: g.mats.u.frost.value.toFixed(2), impl: g.timeFx.implosion.visible, vis: g.car.view.root.visible, hold: !!g.rig.hold, sunI: g.sky.sun.intensity.toFixed(2), night: g.sky.state.night.toFixed(2) }); });
    console.log('dbg0', await dbg());
    await wait(150); await shot('time_depart'); console.log('dbg1', await dbg()); await release(); await wait(700); await shot('time_trails'); console.log('dbg2', await dbg());
    await sample(6, 300, 'time'); await shot('time_arrive'); await wait(1500); await shot('time_after');
  },
  async driver() {
    await R(() => { const g = window.__r88.game; g.rig.tu = { ...g.rig.tu, chase_distance: 3.2, chase_height: 1.2 }; });
    for (const [i, y] of [[0, 1.4], [1, -1.7], [2, 2.6]]) { await R((a) => window.__r88.orbit(a[0], a[1]), [y, 0.12]); await wait(1200); await shot(`driver_${i}`); }
    await R(() => { const g = window.__r88.game; g.rig.tu = { ...g.rig.tu, chase_distance: 5.8, chase_height: 1.55 }; });
  },
  async charge() {
    await R(() => window.__r88.arm(4)); await tele(0, 0.05, -900, 0, 33.5); await wait(300); await shot('charge_a');
    await R(() => { window.__r88.game.timeFx.arcIntensity.value = 0; }); await wait(50); await shot('charge_b');
    console.log('flash', await R(() => window.__r88.game.gfx.u.flash.value), 'arc', await R(() => window.__r88.game.mats.u.arcGlow.value), 'tc', (await state()).tc);
  },
  async closeup() {
    await R(() => { const g = window.__r88.game; g.rig.tu = { ...g.rig.tu, chase_distance: 2.6, chase_height: 0.9 }; });
    for (const [i, y] of [[0, 2.0], [1, 0.9]]) { await R((a) => window.__r88.orbit(a[0], a[1]), [y, -0.05]); await wait(1300); await shot(`close_${i}`); }
  },
  async sun() {
    await tele(0, 0.05, -985, Math.PI * 0.8, 0); await wait(400);
    for (const [i, y] of [[0, 0.15], [1, 0.45]]) { await R((a) => window.__r88.orbit(a[0], a[1]), [y, -0.25]); await wait(1300); await shot(`sun_${i}`); }
  },
  async tod() {
    for (const [h, m, mo, d] of [[20, 30, 6, 21], [18, 10, 4, 18], [9, 30, 6, 12], [22, 40, 1, 7]]) {
      await R((a) => window.__r88.setTime(...a), [h, m, mo, d]); await wait(1500); await shot(`tod_${h}${m}`);
      console.log('tod', h, m, await R(() => { const g = window.__r88.game; return JSON.stringify({ exp: g.gfx.u.exposure.value.toFixed(2), el: (g.sky.state.el * 57.3).toFixed(1), az: (g.sky.state.az * 57.3).toFixed(0), sunI: g.sky.sun.intensity.toFixed(2), night: g.sky.state.night.toFixed(2) }); }));
    }
  },
  async timedbg() {
    await R(() => window.__r88.arm(4)); await tele(0, 0.05, -900, 0, 40.5); await wait(2600);
    console.log('st', (await state()).tc); await shot('td_0');
    await R(() => { const g = window.__r88.game; for (const t of g.timeFx.trails) t.mesh.visible = false; }); await wait(100); await shot('td_1');
    await R(() => { const g = window.__r88.game; g.fx.alpha.sprite.visible = false; g.fx.add.sprite.visible = false; }); await wait(100); await shot('td_2');
    await R(() => { const g = window.__r88.game; g.car.view.root.visible = false; }); await wait(100); await shot('td_3');
  },
  async depart() {
    await R(() => window.__r88.arm(6)); await tele(0, 0.05, -900, 0, 30.0); await wait(400); await keys('KeyW', 'ShiftLeft');
    for (let i = 0; i < 30; i++) { const st = await state(); if (st.tc === 'departing') break; await wait(30); }
    await R(() => { const g = window.__r88.game, T = window.__r88.THREE; const c = g.gfx.camera; const f = c.getWorldDirection(new T.Vector3()); const p = c.position.clone().addScaledVector(f, 10); for (let i = 0; i < 30; i++) g.fx.add.spawn(p.x + (Math.random() - 0.5) * 2, p.y + (Math.random() - 0.5), p.z, 0, 0, 0, 2, 0.6, 0.6, 0, 4, 0, 1, 1, 0); for (let i = 0; i < 30; i++) g.fx.alpha.spawn(p.x + 2 + (Math.random() - 0.5) * 2, p.y + (Math.random() - 0.5), p.z, 0, 0, 0, 2, 0.6, 0.6, 1, 0, 1, 1, 1, 0); });
    console.log('dtlog', await R(() => window.__r88.game.dtLog.join(' ')));
    console.log('dc', await R(async () => { const g = window.__r88.game; const r = g.gfx.renderer; const out = []; for (const vis of [true, false]) { g.fx.add.sprite.visible = vis; g.fx.alpha.sprite.visible = vis; await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); out.push(r.info.render.drawCalls + '/' + r.info.render.triangles); } g.fx.add.sprite.visible = true; g.fx.alpha.sprite.visible = true; return out.join(' vs ') + ' frame ' + g.frameCount + ' paused ' + g.paused + ' started ' + g.started; }));
    for (const t of [0, 1, 2, 3, 4, 5]) { await shot('dep_' + t); console.log('dep', t, (await state()).tc, await R(() => { const g = window.__r88.game, T = window.__r88.THREE; return JSON.stringify({ n: g.timeFx.trails.length, tr: g.timeFx.trails.map((t) => [t.mesh.getWorldPosition(new T.Vector3()).toArray().map((v) => v.toFixed(1)).join(','), t.mesh.scale.z.toFixed(2), t.len.toFixed(1), t.mesh.visible]), proj: (() => { const a = g.fx.add, c = g.gfx.camera, v = new T.Vector3(); const o = []; for (let i = 0; i < Math.min(4, a.n); i++) { v.set(a.iPos.array[i * 4], a.iPos.array[i * 4 + 1], a.iPos.array[i * 4 + 2]).project(c); o.push(v.toArray().map((x) => x.toFixed(2)).join(',')); } return o.join('|'); })(), camq: g.gfx.camera.getWorldDirection(new T.Vector3()).toArray().map((x) => x.toFixed(2)).join(','), addN: g.fx.add.n, alphaN: g.fx.alpha.n, addCount: g.fx.add.sprite.count, addVis: g.fx.add.sprite.visible, p0: Array.from(g.fx.add.iPos.array.slice(0, 4)).map((v) => v.toFixed(1)).join(','), cam: g.gfx.camera.position.toArray().map((v) => v.toFixed(1)).join(','), mode: g.rig.mode, off: g.rig.offset.toArray().map((v) => v.toFixed(1)).join(','), carz: g.car.pose.pos.z.toFixed(1), tu: g.rig.tu.chase_distance, hold: g.rig.hold ? g.rig.hold.look.toArray().map((v) => v.toFixed(1)).join(',') : null }); })); await wait(180); }
    await release();
  },
  async firetest() {
    await R(() => { const g = window.__r88.game, T = window.__r88.THREE; const p = g.car.curr.pos.clone().add(new T.Vector3(0, 0, 6)); g.timeFx.depart(p, g.car.curr.quat.clone(), { x: 0, y: 0, z: 30 }, true, [{ x: 2.5, y: 0, z: p.z }, { x: -2.5, y: 0, z: p.z }]); });
    await wait(700); await shot('fire_0');
    console.log('pool', await R(() => { const g = window.__r88.game; const a = g.fx.add; const out = []; for (let i = 0; i < Math.min(5, a.n); i++) out.push(Array.from(a.iPos.array.slice(i * 4, i * 4 + 4)).map((v) => v.toFixed(2)).join(',') + ' c' + Array.from(a.iCol.array.slice(i * 4, i * 4 + 4)).map((v) => v.toFixed(2)).join(',')); return a.n + ' ' + out.join(' | ') + ' trails ' + g.timeFx.trails.map((t) => t.t.toFixed(2) + '/' + t.base.toArray().map((v) => v.toFixed(1))).join(';'); }));
    await R(() => { const g = window.__r88.game, T = window.__r88.THREE; for (const t of g.timeFx.trails) { t.mesh.material = new T.MeshBasicNodeMaterial({ color: 0xff0000 }); t.mesh.children[0].material = new T.MeshBasicNodeMaterial({ color: 0x00ff00, side: T.DoubleSide }); } }); await wait(500); await shot('fire_1');
    console.log('fire', await R(() => { const g = window.__r88.game; const t = g.timeFx.trails[0]; return JSON.stringify({ n: g.timeFx.trails.length, vis: t.mesh.visible, parent: t.mesh.parent && t.mesh.parent.type, mat: t.mesh.material.type, alpha: g.timeFx.trailAlpha.value, sz: t.mesh.scale.toArray(), rot: t.mesh.rotation.toArray().slice(0, 3).map((v) => v.toFixed(2)), geo: t.mesh.geometry.attributes.position.count }); }));
  },
  async addtest() {
    if (flag('hidecar')) await R(() => { window.__r88.game.car.view.root.visible = false; });
    await R(() => { const g = window.__r88.game; const p = g.car.curr.pos; g.__spawnT = setInterval(() => { for (let i = 0; i < 40; i++) { g.fx.add.spawn(p.x + (Math.random() - 0.5) * 3, p.y + 1.5 + Math.random() * 0.4, p.z + 3, 0, 0.5, 0, 0.5, 0.4, 0.2, 4, 1, 0.2, 1, 1, 0); g.fx.alpha.spawn(p.x + 3 + (Math.random() - 0.5) * 2, p.y + 1.5, p.z + 3, 0, 0.5, 0, 0.5, 0.4, 0.6, 1, 1, 1, 0.6, 1, 0); } }, 50); });
    await wait(800); await shot('add_0'); await R(() => clearInterval(window.__r88.game.__spawnT));
  },
  async holdtest() {
    const ht = process.env.HT || '';
    await R((ht) => { const flag_hold = ht.includes('h'), flag_hide = ht.includes('v'), flag_tele = ht.includes('d'); const g = window.__r88.game, T = window.__r88.THREE; const p = g.car.curr.pos; if (flag_hold) g.rig.hold = { pos: p.clone().add(new T.Vector3(2.4, 1.9, -6)), look: p.clone().add(new T.Vector3(0, 0.6, 10)) }; if (flag_hide) g.car.view.root.visible = false; if (flag_tele) g.car.sim.body.setEnabled(false); const c = g.gfx.camera; g.__spawnT = setInterval(() => { const f = c.getWorldDirection(new T.Vector3()); const q = c.position.clone().addScaledVector(f, 10); for (let i = 0; i < 10; i++) g.fx.add.spawn(q.x + (Math.random() - 0.5) * 2, q.y + (Math.random() - 0.5), q.z, 0, 0, 0, 0.5, 0.6, 0.6, 0, 4, 0, 1, 1, 0); }, 50); }, ht);
    await wait(900); await shot('hold_' + (process.env.HT || 'x'));
    console.log('mats', await R(() => { const g = window.__r88.game; const o = []; g.plate.stat.traverse((m) => { if (m.isMesh) o.push(`${m.userData.k || m.name}:dw${m.material.depthWrite ? 1 : 0}dt${m.material.depthTest ? 1 : 0}t${m.material.transparent ? 1 : 0}s${m.material.side}ro${m.renderOrder}`); }); return o.join(' ') + ' near ' + g.gfx.camera.near + ' far ' + g.gfx.camera.far; })); await R(() => clearInterval(window.__r88.game.__spawnT));
  },
  async bandtest() {
    await wait(500); await shot('band_0');
    await R(() => { const g = window.__r88.game; g.plate.stat.traverse((o) => { if (o.userData.k === 'apron') o.visible = false; }); g.plate.stat.needsUpdate = true; }); await wait(500); await shot('band_1');
    await R(() => { const g = window.__r88.game; g.plate.stat.traverse((o) => { if (o.userData.k === 'apron') o.visible = true; }); g.plate.stat.needsUpdate = true; g.gfx.camera.near = 0.3; }); await wait(500); await shot('band_2');
  },
  async armedperf() {
    await tele(0, 0.05, -900, 0, 25); await wait(1500); await reset(); await wait(3000); await stats('unarmed-25ms');
    console.log('dtlog0', await R(() => window.__r88.game.dtLog.slice(-90).join(' ')));
    await R(() => window.__r88.arm(4)); await tele(0, 0.05, -900, 0, 25); await wait(1500); await reset(); await wait(3000); await stats('armed-25ms');
    console.log('dtlog', await R(() => window.__r88.game.dtLog.slice(-60).join(' ')));
  },
  async carcost() {
    await wait(8000);
    const save = await R(() => { const g = window.__r88.game; g.__cs = []; g.car.view.root.traverse((o) => { if (o.isMesh) { g.__cs.push([o, o.castShadow]); o.castShadow = false; } }); return g.__cs.length; });
    await wait(1500); await reset(); await wait(4000); await stats('car-noshadow');
    await R(() => { const g = window.__r88.game; for (const [o, c] of g.__cs) o.castShadow = c; }); await wait(1500); await reset(); await wait(4000); await stats('with-car');
    await R(() => { const g = window.__r88.game; g.car.view.root.traverse((o) => { if (o.isMesh) o.visible = false; }); }); await wait(1500); await reset(); await wait(4000); await stats('car-hidden');
    await R(() => { const g = window.__r88.game; g.car.view.root.traverse((o) => { if (o.isMesh) o.visible = true; }); }); await wait(1500); await reset(); await wait(4000); await stats('with-car-again');
  },
  async audio() {
    await page.mouse.click(700, 450); await page.keyboard.press('KeyT'); await wait(1500);
    console.log('audio', await R(() => { const a = window.__r88.game.audio; return JSON.stringify({ state: a.ctx && a.ctx.state, keys: Object.keys(a.cat).length, buffers: a.buffers.size, ext: a.ext }); }));
    await keys('KeyW', 'ShiftLeft'); await wait(2500); await keys('Space'); await wait(1500); await release(); await wait(500);
    console.log('audio2', await R(() => { const a = window.__r88.game.audio; return JSON.stringify({ buffers: a.buffers.size, loops: [...a.loops.keys()].join(','), state: a.ctx.state }); }));
  },
  async gap() {
    await tele(120, 0.05, -500, 0, 30); await wait(200); await keys('KeyW');
    for (let i = 0; i < 60; i++) { const s = await state(); if (s.pos[2] > -440) break; await wait(30); }
    await keys('KeyW', 'Space'); await wait(1000); await keys('KeyW'); await wait(300); await shot('gap_air');
    await sample(10, 250, 'gap'); await release();
  },
  async perf() { await wait(1500); await reset(); await keys('KeyW', 'KeyA'); await wait(8000); await release(); await stats('perf-drive'); },
};
async function crash(mph, name) {
  await release(); await R(() => window.__r88.respawn()); await wait(300);
  await tele(100, 0.05, 297.2 - 10, 0, mph * 0.44704); await R(() => window.__r88.orbit(0.9, 0.15));
  await wait(1200); await shot(name + '_a'); await R(() => window.__r88.orbit(2.2, 0.3)); await wait(900); await shot(name + '_b');
  await R(() => window.__r88.orbit(0, 0.1));
  console.log(name, fmt(await state()), 'broken', (await state()).broken);
}
for (const sc of scenarios) { if (!S[sc]) { console.log('unknown scenario', sc); continue; } console.log('== ' + sc); await S[sc](); }
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
if (flag('logs')) console.log(logs.slice(0, 40).join('\n'));
await browser.close();
