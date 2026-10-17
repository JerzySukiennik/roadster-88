// Roadster 88 browser harness: drives the game through window.__r88 in a real Chrome (GPU, offscreen window), runs scripted scenarios, saves screenshots and frame-time stats.
// usage: node web/tools/harness.mjs <scenario[,scenario...]> [--q=high] [--webgl] [--out=dir] [--w=1440 --h=900] [--map=plate|valley] (the game defaults to the valley, the harness to the plate unless --map or --extra=&map=... is given)
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
const mapArg = opt('map', opt('extra', '').includes('map=') ? '' : 'plate');
const url = `http://localhost:8788/web/?debug&q=${q}${mapArg ? '&map=' + mapArg : ''}${flag('webgl') ? '&webgl' : ''}${flag('nodynres') ? '&nodynres' : ''}${flag('trace') ? '&trace' : ''}${opt('extra', '')}`;
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
  async v2() {
    await wait(1500);
    await R(() => window.__r88.orbit(2.3, 0.08)); await wait(400);
    await tap('KeyF'); await wait(1900); await shot('v2_doors');
    await R(() => window.__r88.orbit(-1.2, 0.25)); await wait(500); await shot('v2_doors_top');
    await tap('KeyF'); await wait(1700);
    await R(() => window.__r88.game.setWing(true)); await R(() => window.__r88.orbit(2.6, 0.1)); await wait(1600); await shot('v2_wing');
    await R(() => window.__r88.game.setWing(false)); await wait(1400);
    await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
    await keys('Space'); await wait(700); await shot('v2_lift'); await wait(600); await keys(); await wait(1500); await shot('v2_hover');
    await R(() => window.__r88.orbit(1.7, 0.05)); await wait(700); await shot('v2_hover_side');
    console.log('nozzles', await R(() => window.__r88.game.car.sim.thrusters.all.map((n) => `${n.name.slice(7)}:${n.valve.toFixed(2)}/${(n.pitch * 57.3).toFixed(0)}`).join(' ') + ' side ' + window.__r88.game.car.sim.thrusters.sideDeploy.toFixed(2)));
    await sample(3, 300, 'hover');
    await R(() => window.__r88.orbit(0, 0.05)); await keys('ControlLeft'); await wait(2500); await keys(); await wait(1500);
    await sample(2, 300, 'landed');
  },
  async v2b() {
    await wait(1500);
    await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
    await keys('Space'); await wait(620); await keys(); await wait(200); await keys('Space'); await wait(180); await keys(); await wait(1600);
    await sample(1, 10, 'low');
    await R(() => window.__r88.orbit(2.2, 0.06)); await wait(900); await shot('v2_lowhover');
    await R(() => window.__r88.orbit(0.6, 0.02)); await wait(900); await shot('v2_lowhover_b');
    await keys('ControlLeft'); await wait(2500); await keys(); await wait(1500);
    await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
    await reset(); await keys('KeyW', 'ShiftLeft'); await wait(900); await shot('v2_boost_1'); await wait(1300); await shot('v2_boost_2'); await release(); await stats('boost');
    await wait(1500);
    await R(() => window.__r88.camera('fpp')); await wait(1500); await shot('v2_fpp');
    await R(() => window.__r88.look(0.9, 0.05)); await wait(800); await shot('v2_fpp_side');
    await R(() => window.__r88.look(-0.45, -0.3)); await wait(800); await shot('v2_fpp_screen');
    await R(() => window.__r88.camera('chase'));
    await R(() => window.__r88.setTime(22, 30)); await wait(1500);
    await keys('Space'); await wait(700); await keys(); await wait(200); await keys('Space'); await wait(250); await keys(); await wait(1800);
    await R(() => window.__r88.orbit(2.0, 0.08)); await wait(900); await shot('v2_night_hover'); await reset(); await wait(2000); await stats('night hover');
  },
  async v2c() {
    await wait(1500);
    await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
    await keys('Space'); await wait(450); await keys(); await wait(150); await keys('Space'); await wait(150); await keys(); await wait(2500);
    await sample(1, 10, 'low'); await reset(); await wait(4000); await stats('low hover');
    console.log('fx', await R(() => { const f = window.__r88.game.fx; return `puffs ${f.puffs.n} billows ${f.billows.n} alpha ${f.alpha.n} jets ${f.jets.mesh.count} ring ${f.ring.a.toFixed(2)}`; }));
    await R(() => window.__r88.orbit(2.2, 0.06)); await wait(900); await shot('v2_lowhover');
    await keys('ControlLeft'); await wait(2500); await keys(); await wait(1500);
    await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
    await reset(); await keys('KeyW', 'ShiftLeft'); await wait(900); await shot('v2_boost_1'); await wait(1300); await shot('v2_boost_2'); await release(); await stats('boost');
    console.log('fx', await R(() => { const f = window.__r88.game.fx; return `puffs ${f.puffs.n} billows ${f.billows.n}`; }));
    await wait(1500);
    await R(() => window.__r88.camera('fpp')); await wait(1500); await shot('v2_fpp');
    await R(() => window.__r88.look(0.9, 0.05)); await wait(800); await shot('v2_fpp_side');
    await R(() => window.__r88.camera('chase'));
  },
  async fxdbg() {
    await wait(4000);
    await keys('KeyW', 'ShiftLeft'); await wait(1500);
    const vis = (j, p, a, b) => R((v) => { const f = window.__r88.game.fx; f.jets.mesh.visible = v[0]; f.puffs.sprite.visible = v[1]; f.alpha.sprite.visible = v[2]; f.billows.sprite.visible = v[3]; window.__r88.game.paused = true; }, [j, p, a, b]);
    await vis(true, true, true, true); await wait(200); await shot('dbg_all');
    await vis(false, true, true, true); await wait(200); await shot('dbg_nojets');
    await vis(true, false, true, true); await wait(200); await shot('dbg_nopuffs');
    await vis(true, true, false, true); await wait(200); await shot('dbg_noalpha');
    console.log('fx', await R(() => { const f = window.__r88.game.fx; return `puffs ${f.puffs.n} billows ${f.billows.n} alpha ${f.alpha.n} jets ${f.jets.mesh.count} a ${Array.from(f.jets.iData.array.slice(0, 16)).map((x) => x.toFixed(2)).join(',')}`; }));
    await release();
  },
  async v2boost() {
    await wait(4000);
    await keys('KeyW', 'ShiftLeft'); await wait(1300); await shot('vb_behind');
    await R(() => window.__r88.orbit(1.5, 0.04)); await wait(900); await shot('vb_side');
    await R(() => window.__r88.orbit(2.6, 0.1)); await wait(700); await shot('vb_front');
    await release();
  },
  async spr() {
    await wait(4000);
    await R(() => { const g = window.__r88.game; g.paused = true; const p = g.car.curr.pos; const f = g.fx;
      f.alpha.spawn(p.x - 1.5, p.y + 1.2, p.z - 3, 0, 0, 0, 100, 2.5, 2.5, 1, 1, 1, 0.9, 0, 0);
      f.alpha.spawn(p.x + 1.5, p.y + 1.2, p.z - 3, 0, 0, 0, 100, 2.5, 2.5, 1, 0.2, 0.2, 0.9, 0, 0);
      f.puffs.spawn(p.x, p.y + 2.8, p.z - 3, 0, 0, 0, 100, 2.5, 2.5, 1, 1, 1, 0.9, 0, 0);
      for (let i = 0; i < 20; i++) { f.alpha.update(0.05); f.puffs.update(0.05); }
      return JSON.stringify(g.fx.light.value); });
    await wait(500); await shot('spr');
    console.log('light', await R(() => JSON.stringify(window.__r88.game.fx.light.value)));
  },
  async scr2() {
    await wait(2500);
    await R(() => window.__r88.camera('fpp')); await wait(1200); await shot('scr2_ahead');
    await R(() => window.__r88.look(-0.3, -0.12)); await wait(1500); await shot('scr2_focus');
    console.log('hit', await R(() => { const c = window.__r88.game.cockpit; return JSON.stringify(c.hit ? { x: Math.round(c.hit.x), y: Math.round(c.hit.y), hover: c.hover } : null) + ' fk ' + window.__r88.game.rig.focusK.toFixed(2); }));
    await R(() => window.__r88.look(-0.36, -0.2)); await wait(900); await shot('scr2_focus2');
    console.log('hit2', await R(() => { const c = window.__r88.game.cockpit; return JSON.stringify(c.hit ? { x: Math.round(c.hit.x), y: Math.round(c.hit.y), hover: c.hover } : null); }));
    await R(() => window.__r88.camera('chase')); await wait(800); await shot('scr2_chase');
  },
  async scr() {
    await wait(2500);
    await R(() => window.__r88.camera('fpp')); await wait(1200); await shot('scr_ahead');
    for (const [y, p, nm] of [[-0.3, -0.14, 'a'], [0.3, -0.14, 'b']]) { await R((a) => window.__r88.look(a[0], a[1]), [y, p]); await wait(900); await shot('scr_' + nm); console.log(nm, await R(() => { const c = window.__r88.game.cockpit; return JSON.stringify(c.hit ? { x: Math.round(c.hit.x), y: Math.round(c.hit.y), hover: c.hover } : null); })); }
    console.log('screen', await R(() => { const g = window.__r88.game, s = g.cockpit.screen, v = new g.constructor === Object ? null : null; const e = g.car.view.eyeWorld(new window.__r88.THREE.Vector3()); const p = s.getWorldPosition(new window.__r88.THREE.Vector3()); return JSON.stringify({ d: e.distanceTo(p).toFixed(2), sx: s.scale.x }); }));
  },
  async menu() {
    await wait(2500);
    await R(() => { const g = window.__r88.game; g.paused = true; g.menu.showTitle(); });
    await wait(2500); await shot('menu_title');
    for (const [i, nm] of [[1, 'map'], [2, 'garage'], [3, 'settings'], [4, 'controls']]) { await R((k) => window.__r88.game.menu.setFocus(k, false), i); await wait(700); await shot('menu_' + nm); }
    await R(() => { const g = window.__r88.game; g.menu.play(); g.paused = false; }); await wait(400); await shot('menu_leaving'); await wait(1200); await shot('menu_ingame');
    await R(() => window.__r88.game.setPaused(true)); await wait(900); await shot('menu_pause');
    console.log('menu', await R(() => { const g = window.__r88.game; return `mode ${g.menu.mode} paused ${g.paused} hold ${!!g.rig.hold}`; }));
  },
  async hero() {
    await wait(2000);
    await R(() => { document.getElementById('hud').style.display = 'none'; document.getElementById('hint').style.display = 'none'; window.__r88.setTime(15, 40); });
    await wait(1500);
    await keys('Space'); await wait(700); await keys(); await wait(2600); console.log('hero', JSON.stringify((await state()).pos), (await state()).mode);
    for (const [i, y, p] of [[0, 2.35, 0.02], [1, 1.75, 0.0], [2, 0.75, 0.04], [3, 2.9, 0.08]]) { await R((a) => window.__r88.orbit(a[0], a[1]), [y, p]); await wait(1100); await shot('hero_' + i); }
    await keys('ControlLeft'); await wait(3000); await keys(); await wait(1500);
    await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
    await keys('KeyW', 'ShiftLeft'); await wait(1600);
    await R(() => window.__r88.orbit(1.45, 0.02)); await wait(700); await shot('hero_boost'); await release();
  },
  async audionan() {
    await wait(2000);
    await R(async () => { const g = window.__r88.game; await g.audio.unlock(); });
    await wait(1500);
    await R(() => {
      const a = window.__r88.game.audio, ctx = a.ctx;
      const taps = { comp: a.comp, master: a.master, outside: a.outside, thrust: a.thrustBus, motor: a.motorBus };
      window.__probe = { hits: [], an: {} };
      for (const [k, n] of Object.entries(taps)) { const an = ctx.createAnalyser(); an.fftSize = 2048; n.connect(an); window.__probe.an[k] = an; }
      const buf = new Float32Array(2048);
      window.__probe.check = (label) => { const out = {}; for (const [k, an] of Object.entries(window.__probe.an)) { an.getFloatTimeDomainData(buf); let nan = 0, peak = 0; for (const v of buf) { if (!Number.isFinite(v)) nan++; else peak = Math.max(peak, Math.abs(v)); } out[k] = nan ? 'NaN' + nan : peak.toFixed(3); } return label + ' ' + JSON.stringify(out); };
      window.__probe.timer = setInterval(() => { const r = window.__probe.check(''); if (r.includes('NaN') && window.__probe.hits.length < 5) window.__probe.hits.push((performance.now() / 1000).toFixed(1) + r + ' mode ' + window.__r88.game.car.sim.flight.mode); }, 50);
    });
    console.log(await R(() => window.__probe.check('idle') + ' state ' + window.__r88.game.audio.ctx.state + ' sr ' + window.__r88.game.audio.ctx.sampleRate));
    for (let i = 0; i < 6; i++) {
      await keys('Space'); await wait(i % 2 ? 250 : 900); await keys(); await wait(1200);
      if (i === 2) { await keys('KeyW', 'ShiftLeft', 'Space'); await wait(1500); await keys(); await wait(800); }
      if (i === 4) { await R(() => window.__r88.camera('fpp')); await keys('Space'); await wait(1200); await keys(); await wait(800); await R(() => window.__r88.camera('chase')); }
      console.log(await R((k) => window.__probe.check('hop' + k), i));
      await keys('ControlLeft'); await wait(1500); await keys(); await wait(600);
    }
    console.log('hits', await R(() => JSON.stringify(window.__probe.hits)));
  },
  async audioheal() {
    await wait(2000);
    await R(async () => { await window.__r88.game.audio.unlock(); });
    await wait(1200);
    const probe = () => R(() => { const a = window.__r88.game.audio; if (!a.ctx) return 'no ctx'; a.guard.getFloatTimeDomainData(a.guardBuf); let nan = 0, peak = 0; for (const v of a.guardBuf) { if (!Number.isFinite(v)) nan++; else peak = Math.max(peak, Math.abs(v)); } return `state ${a.ctx.state} nan ${nan} peak ${peak.toFixed(3)} resets ${a.resets} voices ${a.voices}`; });
    await keys('KeyW'); await wait(800);
    console.log('before', await probe());
    await R(() => { const a = window.__r88.game.audio, ctx = a.ctx; const b = ctx.createBuffer(1, 4096, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = i % 7 ? NaN : 1; const src = ctx.createBufferSource(); src.buffer = b; src.connect(a.outside); src.start(); });
    await wait(150);
    console.log('poisoned', await probe());
    await wait(2000);
    console.log('after', await probe());
    await release();
  },
  async foot() {
    await wait(2500);
    await tap('KeyF'); await wait(1500); await shot('foot_exit');
    console.log('walker', await R(() => { const w = window.__r88.game.walker; return JSON.stringify({ active: w.active, pos: w.pos, grounded: w.grounded }); }));
    await keys('KeyW'); await wait(1500); await shot('foot_walk');
    await keys('KeyW', 'ShiftLeft'); await wait(1500); await shot('foot_run');
    console.log('walker run', await R(() => { const w = window.__r88.game.walker; return JSON.stringify({ speed: w.speed.toFixed(2), pos: [w.pos.x.toFixed(1), w.pos.y.toFixed(2), w.pos.z.toFixed(1)], grounded: w.grounded }); }));
    await keys('KeyW', 'ShiftLeft', 'Space'); await wait(250); await shot('foot_jump'); await keys('KeyW', 'ShiftLeft'); await wait(800);
    await R(() => window.__r88.game.rig.footYaw += Math.PI); await keys(); await wait(600); await shot('foot_turn');
    await R(() => { const g = window.__r88.game, w = g.walker, c = g.car.sim; g.rig.footYaw = Math.atan2(c.pos.x - w.pos.x, c.pos.z - w.pos.z); });
    await keys('KeyW', 'ShiftLeft');
    for (let i = 0; i < 40; i++) { await wait(150); if (await R(() => !!window.__r88.game.walker.nearestCar())) break; await R(() => { const g = window.__r88.game, w = g.walker, c = g.car.sim; g.rig.footYaw = Math.atan2(c.pos.x - w.pos.x, c.pos.z - w.pos.z); }); }
    await keys(); await wait(400); await shot('foot_near');
    await tap('KeyF'); await wait(1500); await shot('foot_enter');
    console.log('after enter', await R(() => { const g = window.__r88.game; return JSON.stringify({ active: g.walker.active, mode: g.rig.mode }); }));
  },
  async yearin() {
    await wait(2500);
    await page.keyboard.press('KeyY'); await wait(200);
    for (const k of ['Digit1', 'Digit8', 'Digit8', 'Digit5']) { await page.keyboard.press(k); await wait(80); }
    await wait(300); await shot('yearin_typing');
    await page.keyboard.press('Enter'); await wait(400); await shot('yearin_set');
    console.log('dest', await R(() => window.__r88.game.tc.destination.year));
    await page.keyboard.press('KeyY'); await page.keyboard.press('KeyB');
    for (const k of '66000000') await page.keyboard.press('Digit' + k);
    await wait(200); await shot('yearin_bc'); await page.keyboard.press('Enter'); await wait(300);
    console.log('dest bc', await R(() => window.__r88.game.tc.destination.year));
    await page.keyboard.press('KeyY'); await page.keyboard.press('Digit3'); await page.keyboard.press('Escape'); await wait(200);
    console.log('after esc', await R(() => JSON.stringify({ y: window.__r88.game.tc.destination.year, paused: window.__r88.game.paused, open: window.__r88.game.yearIn.open })));
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
    await tele(0, 0.05, -900, 0, 35.3); await keys('KeyW'); await wait(500); await shot('time_charge'); await keys('KeyW', 'ShiftLeft');
    for (let i = 0; i < 40; i++) { await wait(60); const st = await state(); if (st.tc === 'departing' || st.tc === 'gone') break; }
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
    await R(() => window.__r88.respawn()); await wait(300);
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
  async spritetest() {
    await R(() => { const g = window.__r88.game; g.car.view.root.visible = false; if (location.search.includes('nodt')) { g.fx.add.sprite.material.depthTest = false; g.fx.add.sprite.material.needsUpdate = true; } });
    await R(() => { const g = window.__r88.game, T = window.__r88.THREE; const c = g.gfx.camera; const f = c.getWorldDirection(new T.Vector3()); g.__spawnT = setInterval(() => { for (const [h, col] of [[0.3, [0, 4, 0]], [1.0, [4, 0, 0]], [1.8, [0, 0, 4]]]) { const q = c.position.clone().addScaledVector(f, 8); for (let i = 0; i < 6; i++) g.fx.add.spawn(q.x + (Math.random() - 0.5) * 2, h, q.z, 0, 0, 0, 0.5, 0.5, 0.5, ...col, 1, 1, 0); } }, 50); });
    await wait(900); await shot('sprite' + tag); await R(() => clearInterval(window.__r88.game.__spawnT));
  },
  async alt() {
    await keys('Space'); await wait(1800); await keys(); await wait(1500); await shot('alt');
  },
  async perf() { await wait(1500); await reset(); await keys('KeyW', 'KeyA'); await wait(8000); await release(); await stats('perf-drive'); },
  async valley() {
    const V = () => R(() => window.__r88.valley());
    const tg = (x, z, yaw = 0, v = 0, up = 0.15) => R((a) => window.__r88.tg(...a), [x, z, yaw, v, up]);
    const look = (yaw, pitch) => R((a) => window.__r88.orbit(a[0], a[1]), [yaw, pitch]);
    const free = () => R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
    console.log('valley', JSON.stringify(await V()));
    await wait(2500); await shot('valley_spawn'); await reset(); await wait(4000); await stats('valley-idle'); console.log('state', fmt(await state()), JSON.stringify(await V()));
    await free(); await reset(); await keys('KeyW', 'ShiftLeft'); await sample(8, 1000, 'highway'); await shot('valley_highway_fast'); await release(); await stats('valley-highway'); console.log(JSON.stringify(await V()));
    const spots = [
      ['town', -1150, -205, -Math.PI / 2, 0.3, 0.12], ['lake', -150, -300, Math.PI, 0.4, 0.12], ['mesa_ramp', 520, 650, -Math.PI / 2, 0.2, 0.06], ['mesa_top', -150, 650, -Math.PI / 2, 2.6, 0.18],
      ['jumps', -800, 230, Math.PI / 2, 0.2, 0.05], ['canyon', 1180, 398, Math.PI / 2, 0.2, 0.06], ['canyon_mid', 1710, 200, Math.PI, 0.3, 0.06], ['dunes', 760, -1250, Math.PI / 2, 0.6, 0.1],
      ['loop_north', -171, 1283, Math.PI / 2, 0.2, 0.05], ['rollers', 640, 650, Math.PI, 0.2, 0.05], ['north_pass', -900, 1750, 0, 0.2, 0.05], ['wash', 520, 152, -2.0, 0.6, 0.1],
    ];
    for (const [nm, x, z, yaw, oy, op] of spots) { await tg(x, z, yaw, 0, 0.3); await look(oy, op); await wait(1600); await shot('valley_' + nm); console.log(nm, fmt(await state()), JSON.stringify(await V())); }
    await tg(640, 760, Math.PI, 0, 0.3); await free(); await wait(800); await reset(); await keys('KeyW', 'ShiftLeft');
    for (let i = 0; i < 14; i++) { await wait(500); const s = await state(); if (i % 2) console.log('rollers', s.mph.toFixed(0), 'mph y', s.pos[1].toFixed(1), 'z', s.pos[2].toFixed(0), 'c', s.contacts); if (i === 9) await shot('valley_rollers_air'); }
    await release(); await stats('valley-rollers');
    await tg(-300, 0, 0, 0, 0.3); await free(); await keys('Space'); await wait(5000); await keys('Space', 'KeyW'); await wait(3000); await keys(); await wait(500); await shot('valley_flight'); await reset(); await wait(3000); await stats('valley-flight'); console.log('flight', fmt(await state()), JSON.stringify(await V())); await release();
  },
  async valleylook() {
    const views = [['spawn', -903.5, -330, 0, 0.0, 0.08], ['canyon', 1180, 398, Math.PI / 2, 0.3, 0.1], ['mesa', 300, 560, -1.9, 0.0, 0.12], ['lakeshore', 150, -250, -2.6, 0.2, 0.1], ['dunes', 950, -1150, Math.PI / 2, 0.5, 0.12], ['town', -1000, -230, -Math.PI / 2, 0.4, 0.15]];
    for (const [h, m] of [[14, 0], [16, 40]]) {
      await R((a) => window.__r88.setTime(a[0], a[1]), [h, m]); await wait(800);
      for (const [nm, x, z, yaw, oy, op] of views) { await R((a) => window.__r88.tg(...a), [x, z, yaw, 0, 0.3]); await R((a) => window.__r88.orbit(a[0], a[1]), [oy, op]); await wait(1800); await shot(`look_${nm}_${h}`); }
    }
    await R(() => window.__r88.tg(-200, 200, 2.4, 0, 0.3)); await R(() => { const g = window.__r88.game; g.car.sim.body.setTranslation({ x: -200, y: 260, z: 200 }, true); }); await R(() => window.__r88.orbit(0, 0.5)); await wait(1500); await shot('look_aerial_18');
    await R((a) => window.__r88.setTime(14, 0)); await wait(1500); await shot('look_aerial_14');
  },
  async valleyfun() {
    const pilot = async (road, idx, mph, secs, label, shots = []) => {
      await R((a) => {
        const g = window.__r88.game, V = g.valley, r = V.roads.find((q) => q.id === a.road);
        const p = r.pts[a.i], q = r.pts[(a.i + 3) % r.pts.length];
        window.__r88.tg(p[0], p[1], Math.atan2(q[0] - p[0], q[1] - p[1]), a.v, 0.3);
        g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99;
        const P = g.__pilot = { r, target: a.v, maxLat: 0, maxV: 0, minV: 999, air: 0, off: 0, n: 0, maxY: -1e9, lastIdx: a.i, steer: 0 };
        if (!g.input.__orig) { g.input.__orig = g.input.controls.bind(g.input); g.input.controls = (dt) => { const c = g.input.__orig(dt); if (g.__pilot && g.__pilot.on) c.steer = g.__pilot.steer; return c; }; }
        P.on = true;
        clearInterval(g.__pilotT);
        g.__pilotT = setInterval(() => {
          const s = g.car.sim, pts = P.r.pts, n = pts.length;
          let best = P.lastIdx, bd = 1e18;
          for (let k = -40; k <= 80; k++) { const i = (P.lastIdx + k + n) % n, d = (pts[i][0] - s.pos.x) ** 2 + (pts[i][1] - s.pos.z) ** 2; if (d < bd) { bd = d; best = i; } }
          P.lastIdx = best;
          const ld = Math.max(22, s.speed * 0.95), la = Math.round(ld / 4), t = pts[(best + la) % n];
          const want = Math.atan2(t[0] - s.pos.x, t[1] - s.pos.z);
          let e = want - s.yaw(); while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI;
          const W = g.tu.wheels, sf = W.steer_speed_falloff, v = Math.abs(s.fwdSpeed);
          const f = v <= sf.full_until ? 1 : v >= sf.at ? sf.min_factor : 1 - (1 - sf.min_factor) * (v - sf.full_until) / (sf.at - sf.full_until);
          const kap = 2 * Math.sin(e) / ld, rdes = s.fwdSpeed * kap, rerr = rdes - s.angW.y; P.I = Math.max(-0.25, Math.min(0.25, (P.I || 0) + rerr * 0.025 * 0.6)); const delta = Math.atan(g.tu.car.wheelbase * kap) + 0.06 * rerr + P.I;
          P.steer = Math.max(-1, Math.min(1, delta / (W.max_steer_deg * Math.PI / 180 * f)));
          const k = new Set();
          if (s.speed < P.target) { k.add('KeyW'); if (P.target - s.speed > 4) k.add('ShiftLeft'); }
          if (s.speed > P.target + 4) k.add('KeyS');
          g.input.virtual = k;
          const lat = Math.sqrt(bd); P.n++; if (lat > P.maxLat) { P.maxLat = lat; P.worst = `idx${best} v${(s.speed / 0.44704).toFixed(0)} air${s.contacts === 0} bank${(P.r.bank ? 0 : 0)}`; } if (lat > 11 && !P.firstOff) P.firstOff = `idx${best} @${s.pos.x.toFixed(0)},${s.pos.z.toFixed(0)} v${(s.speed / 0.44704).toFixed(0)} c${s.contacts}`; P.maxV = Math.max(P.maxV, s.speed); if (P.n > 30) P.minV = Math.min(P.minV, s.speed);
          if (s.contacts === 0) P.air++; if (lat > 11) P.off++; P.maxY = Math.max(P.maxY, s.pos.y - V.heightAt(s.pos.x, s.pos.z));
        }, 25);
      }, { road, i: idx, v: mph * 0.44704 });
      await reset();
      for (let t = 0; t < secs; t++) { await wait(1000); if (shots.includes(t)) await shot(`fun_${label}_${t}`); }
      const P = await R(() => { const g = window.__r88.game; clearInterval(g.__pilotT); g.input.virtual = null; const P = g.__pilot; P.on = false; return { maxLat: P.maxLat.toFixed(1), worst: P.worst, firstOff: P.firstOff, off: P.off, n: P.n, air: P.air, maxMph: (P.maxV / 0.44704).toFixed(0), minMph: (P.minV / 0.44704).toFixed(0), maxAGL: P.maxY.toFixed(1), broken: g.car.lattice ? g.car.lattice.brokenCount : 0 }; });
      console.log('pilot', label, JSON.stringify(P), fmt(await state())); await stats('fun-' + label);
    };
    await pilot('loop', 300, 200, 40, 'loop200', [6, 9, 14, 20, 30]);
    await pilot('loop', 300, 240, 40, 'loop240', [8, 30]);
    if (process.env.FUN === 'loop') return;
    const run = async (label, x, z, yaw, mph, secs, keysDown, shotAt = []) => {
      await R((a) => window.__r88.tg(a[0], a[1], a[2], a[3], 0.3), [x, z, yaw, mph * 0.44704]);
      await R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
      await keys(...keysDown);
      let air = 0, maxAGL = 0, maxY = -1e9, trace = [];
      for (let i = 0; i < secs * 10; i++) {
        await wait(100);
        const st = await state(); const h = await R((p) => window.__r88.game.valley.heightAt(p[0], p[2]), st.pos);
        if (st.contacts === 0) air++; maxAGL = Math.max(maxAGL, st.pos[1] - h); maxY = Math.max(maxY, st.pos[1]);
        if (i % 5 === 0) trace.push(`${st.mph.toFixed(0)}mph agl${(st.pos[1] - h).toFixed(1)} c${st.contacts}`);
        if (shotAt.includes(i)) await shot(`fun_${label}_${i}`);
      }
      await release();
      console.log('run', label, 'air', (air / 10).toFixed(1) + 's', 'maxAGL', maxAGL.toFixed(1), 'broken', (await state()).broken, '|', trace.join(' '));
    };
    await R(() => window.__r88.respawn());
    await run('mesa_lip', -250, 690, 0, 70, 6, ['KeyW'], [18, 26]);
    await R(() => window.__r88.respawn());
    await run('kickers', -760, 230, Math.PI / 2, 80, 12, ['KeyW'], [22, 40, 70]);
    await R(() => window.__r88.respawn());
    await run('dunes', 720, -1240, Math.PI / 2, 60, 10, ['KeyW'], [30, 60]);
    await R(() => window.__r88.respawn());
    await run('mesa_ramp', 520, 650, -Math.PI / 2, 60, 9, ['KeyW', 'ShiftLeft'], [30, 60]);
  },
  async valleyperf() {
    const tg = (x, z, yaw = 0, v = 0, up = 0.15) => R((a) => window.__r88.tg(...a), [x, z, yaw, v, up]);
    const free = () => R(() => { const g = window.__r88.game; g.rig.orbitYaw = 0; g.rig.orbitPitch = 0; g.rig.lastMouse = -99; });
    const V = () => R(() => window.__r88.valley());
    await wait(3000); await reset(); await wait(4000); await stats('perf-spawn'); console.log(fmt(await state()), JSON.stringify(await V()));
    await free(); await reset(); await keys('KeyW', 'ShiftLeft'); await wait(9000); await release(); await stats('perf-highway'); console.log(fmt(await state()));
    for (const [nm, x, z, yaw] of [['canyon', 1400, 470, 1.2], ['mesa', -150, 650, -1.6], ['town', -1150, -205, -1.57], ['dunes', 900, -1200, 1.57]]) { await tg(x, z, yaw, 0, 0.3); await free(); await wait(2500); await reset(); await wait(3500); await stats('perf-' + nm); console.log(fmt(await state()), JSON.stringify(await V())); }
    await tg(-300, 100, 0.5, 0, 0.3); await R(() => { const b = window.__r88.game.car.sim.body; const p = b.translation(); b.setTranslation({ x: p.x, y: p.y + 220, z: p.z }, true); }); await R(() => window.__r88.orbit(0, 0.45)); await keys('Space'); await wait(2500); await reset(); await wait(3500); await release(); await stats('perf-aerial'); console.log(fmt(await state()), JSON.stringify(await V())); await shot('perf_aerial');
  },
  async valleyq() {
    for (const q of ['low', 'medium', 'ultra', 'high']) { await R((q) => window.__r88.game.gfx.setPreset(q), q); await wait(2500); console.log('preset', q, JSON.stringify(await R(() => window.__r88.valley()))); }
    await shot('valley_preset_back_high');
  },
  async valleymap() {
    await R(() => { const g = window.__r88.game; g.cockpit.app = 'map'; g.cockpit.dirty = true; });
    await R(() => window.__r88.tg(-560, 1395, Math.PI / 2, 0, 0.3)); await wait(1500);
    const png = await R(() => { const g = window.__r88.game; g.cockpit.draw(); return g.cockpit.canvas.toDataURL('image/png'); });
    fs.writeFileSync(`${out}/valley_mapapp${tag}.png`, Buffer.from(png.split(',')[1], 'base64')); console.log('shot valley_mapapp');
    await R(() => window.__r88.camera('fpp')); await wait(1200); await R(() => window.__r88.look(-0.42, -0.22)); await wait(1500); await shot('valley_mapapp_fpp');
    await R(() => window.__r88.camera('chase'));
  },
  async valleyeras() {
    const V = () => R(() => window.__r88.valley());
    const vantage = async (nm) => { await R(() => window.__r88.tg(-560, -60, 2.3, 0, 0.3)); await R(() => window.__r88.orbit(0.0, 0.32)); await wait(2500); await shot('valley_era_' + nm); };
    for (const e of ['hadean', 'dino', '1885', '2080', 'ruins', 'scifi', '2026']) {
      const t0 = Date.now(); await R((e) => window.__r88.era(e), e); console.log('era', e, 'apply ms', Date.now() - t0, 'valley ms', (await R(() => window.__r88.game.valley.eraMs)).toFixed(0), JSON.stringify(await V()));
      await vantage(e);
      console.log('surface lake', await R(() => window.__r88.game.valley.surfaceAt(-150, -620)), 'highway', await R(() => window.__r88.game.valley.surfaceAt(-900, 0)), 'fluids', await R(() => JSON.stringify(window.__r88.game.valley.fluids.map((f) => [f.kind, f.level.toFixed(1)]))));
    }
    await reset(); await wait(3000); await stats('valley-eras-idle');
    await R(() => window.__r88.tg(-903.5, -600, 0, 0, 0.2)); await R(() => window.__r88.arm(1)); await R(() => window.__r88.tg(-903.5, -600, 0, 36, 0.2)); await keys('KeyW', 'ShiftLeft');
    for (let i = 0; i < 60; i++) { await wait(100); const st = await state(); if (st.tc === 'arriving') break; }
    await release(); await wait(1500); await shot('valley_arrive_dino'); console.log('arrive', fmt(await state()), JSON.stringify(await V()));
  },
};
async function crash(mph, name) {
  await release(); await R(() => window.__r88.respawn()); await wait(300);
  await tele(100, 0.05, 297.2 - 10, 0, mph * 0.44704); await R(() => window.__r88.orbit(0.9, 0.15));
  await wait(1200); await shot(name + '_a'); await R(() => window.__r88.orbit(2.2, 0.3)); await wait(900); await shot(name + '_b');
  await R(() => window.__r88.orbit(0, 0.1));
  console.log(name, fmt(await state()), 'broken', (await state()).broken);
}
Object.assign(S, (await import('./eras-scenarios.mjs')).erasScenarios({ page, R, wait, shot, stats, reset, tele, keys, release, tap, state, sample }));
if (fs.existsSync(path.join(here, 'life-scenarios.mjs'))) Object.assign(S, (await import('./life-scenarios.mjs')).lifeScenarios({ page, R, wait, shot, stats, reset, tele, keys, release, tap, state, sample, fmt, out, errors }));
if (fs.existsSync(path.join(here, 'years-scenarios.mjs'))) Object.assign(S, (await import('./years-scenarios.mjs')).yearsScenarios({ page, R, wait, shot, stats, reset, tele, keys, release, tap, state, sample, fmt, out, errors }));
for (const sc of scenarios) { if (!S[sc]) { console.log('unknown scenario', sc); continue; } console.log('== ' + sc); await S[sc](); }
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
if (flag('logs')) console.log(logs.slice(0, 40).join('\n'));
await browser.close();
