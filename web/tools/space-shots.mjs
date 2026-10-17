// Roadster 88 space harness: boots the game in a real Chrome, flies the space mode through window.__r88 (launch from the valley, views from orbit, years, flight, drive, re-entry, perf) and saves screenshots and stats to Niepotrzebne/shots-space.
// usage: node web/tools/space-shots.mjs <scenario[,scenario...]> [--q=high] [--webgl] [--w=1440 --h=900] [--years=-4.56e9,2026,...] [--video]
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const flag = (k) => args.includes(`--${k}`);
const scenarios = (args.find((a) => !a.startsWith('--')) || 'views').split(',');
const out = opt('out', path.resolve(here, '../../Niepotrzebne/shots-space'));
const W = Number(opt('w', 1440)), H = Number(opt('h', 900));
fs.mkdirSync(out, { recursive: true });
const LOCK = '/Users/jurek/Library/Application Support/Claude/side-session-notes/local_ce978bc5-42b6-4910-b640-4bf8558b25be/harness.lock';
const others = () => { try { return execSync('pgrep -f "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"').toString().trim().split('\n').filter(Boolean).length; } catch (e) { return 0; } };
if (!flag('nowait')) { let n = 0; while (others() > 0 && n < 600) { if (n % 30 === 0) console.log('waiting for other harness Chrome...'); await new Promise((r) => setTimeout(r, 2000)); n++; } }
fs.writeFileSync(LOCK, String(process.pid));
const exe = '/Users/jurek/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H + 80}`, '--window-position=3000,3000', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
const frames = [];
let cdp = null;
const startVideo = async () => {
  const dir = path.join(out, 'frames'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', async (f) => { const n = frames.length; fs.writeFileSync(path.join(dir, `f${String(n).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64')); frames.push(f.metadata.timestamp); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) { /* closed */ } });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
};
const stopVideo = async (name) => {
  await cdp.send('Page.stopScreencast');
  const dir = path.join(out, 'frames');
  const lines = frames.map((t, i) => `file 'f${String(i).padStart(5, '0')}.jpg'\nduration ${Math.max(0.01, Math.min(0.2, (frames[i + 1] || t + 0.04) - t)).toFixed(4)}`);
  fs.writeFileSync(path.join(dir, 'list.txt'), lines.join('\n') + `\nfile 'f${String(frames.length - 1).padStart(5, '0')}.jpg'\n`);
  execSync(`/usr/local/bin/ffmpeg -y -loglevel error -f concat -safe 0 -i list.txt -vf "fps=30,scale=${W}:-2" -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p "${path.join(out, name)}.mp4"`, { cwd: dir });
  console.log('video', name, frames.length, 'frames', (frames[frames.length - 1] - frames[0]).toFixed(1), 's');
};
const errors = [], logs = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 5).join(' | ')));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('404')) errors.push(t); else if (m.type() === 'warning' || m.type() === 'log') logs.push(`[${m.type()}] ${t}`); });
const q = opt('q', 'high');
const startSpace = scenarios.some((s) => ['views', 'years', 'fly', 'drive', 'reentry', 'perf', 'struct', 'struct2', 'moon', 'tjump', 'landfar', 'compare', 'film2', 'tablet'].includes(s)) && !scenarios.includes('launch') && !scenarios.includes('film');
const url = `http://localhost:8788/web/?debug&nomenu${flag('online') ? '' : '&offline'}${flag('earth') ? '' : '&noearth'}&q=${q}&map=valley${startSpace ? '&space' : ''}${flag('webgl') ? '&webgl' : ''}${opt('extra', '')}`;
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
try { await page.waitForFunction(() => window.__r88 && window.__r88.game.started, null, { timeout: 120000 }); }
catch (e) { console.log('BOOT FAILED', await page.evaluate(() => document.getElementById('ldText').textContent)); console.log(errors.join('\n')); await page.screenshot({ path: `${out}/bootfail.png` }); await browser.close(); fs.rmSync(LOCK, { force: true }); process.exit(1); }
console.log(`boot ${(Date.now() - t0) / 1000}s`, url);
const wait = (ms) => page.waitForTimeout(ms);
const R = (fn, a) => page.evaluate(fn, a);
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
const keys = (...k) => R((k) => window.__r88.keys(...k), k);
const release = () => R(() => window.__r88.release());
const tap = (k) => R((k) => window.__r88.tap(k), k);
const orbit = (y, p) => R((a) => window.__r88.orbit(a[0], a[1]), [y, p]);
const sp = () => R(() => { const g = window.__r88.game, s = g.space, c = g.car.sim; return { state: s.state, active: s.active, alt: Math.round(s.altitude() / 100) / 10, mph: +(c.speed / 0.44704).toFixed(1), mode: c.flight.mode, space: c.env.space, pos: [c.pos.x, c.pos.y, c.pos.z].map((v) => +v.toFixed(1)), year: g.tc.present.year, look: s.look && s.look.label, cruise: Math.round(s.cruise.speed), room: g.mapId, expo: +s.expo.toFixed(2), dark: +s.dark.toFixed(2), tc: g.tc.state, can: s.canUse(), dead: !!g.player.dead, paused: g.paused, walk: g.walker.active, ride: !!g.ride, broken: !!g.spaceBroken }; });
const stats = async (label) => { const s = await R(() => window.__r88.stats()); console.log(`${label} n=${s.n} avg=${s.avg.toFixed(1)} p50=${s.p50.toFixed(1)} p95=${s.p95.toFixed(1)} p99=${s.p99.toFixed(1)} max=${s.max.toFixed(1)} spikes=${s.spikes} scale=${s.scale.toFixed(2)}`); return s; };
const reset = () => R(() => window.__r88.resetStats());
const setYear = (y, h) => R((a) => { const g = window.__r88.game; g.tc.present.year = a[0]; if (a[1] !== undefined) { g.tc.present.hour = a[1]; g.tc.present.minute = 0; } }, [y, h]);
const waitActive = async () => { for (let i = 0; i < 150; i++) { const s = await sp(); if (s.active && s.state === 'orbit') return s; await wait(200); } return sp(); };
console.log('backend', JSON.stringify(await R(() => ({ b: window.__r88.game.gfx.backend, gpu: window.__r88.gpu() }))));

const S = {
  async launch() {
    await wait(3000);
    await orbit(2.5, 0.12); await wait(800); await shot('launch_0_valley');
    await tap('KeyO'); await wait(600); console.log('armed', JSON.stringify(await sp()));
    await tap('KeyO'); await wait(250); await shot('launch_1_depart');
    await wait(500); await shot('launch_2_flash');
    const s = await waitActive(); console.log('arrived', JSON.stringify(s));
    await wait(1500); await shot('launch_3_arrive');
    await wait(4000); await orbit(0, 0.1); await wait(1500); await shot('launch_4_orbit');
  },
  async views() {
    console.log('state', JSON.stringify(await waitActive()));
    await wait(6000);
    for (const [n, y, p] of [['chase', 0, 0.1], ['side', 1.6, 0.05], ['up', 3.1, 0.6], ['back', 3.1, -0.2]]) { await orbit(y, p); await wait(1800); await shot('view_' + n); }
    await R(() => window.__r88.camera('fpp')); await wait(1500); await shot('view_fpp');
    await R(() => window.__r88.camera('chase'));
    console.log('state', JSON.stringify(await sp()));
  },
  async years() {
    await waitActive(); await wait(4000);
    const list = opt('years', '-4580000000,-4550000000,-4520000000,-4400000000,-3000000000,-1500000000,-680000000,-500000000,-300000000,-150000000,-66000000,-20000,1885,1960,2026,2080,2300,2700,12000,200000,5000000,250000000,800000000').split(',').map(Number);
    await orbit(0, 0.25);
    const high = flag('high');
    if (high) await R(() => { const g = window.__r88.game, s = g.space; s.orbit.displace(new window.__r88.THREE.Vector3(0, 9e6, 0)); g.debugCam = () => { const p = g.car.pose.pos, T = window.__r88.THREE; return { pos: new T.Vector3(p.x, p.y + 7, p.z - 11), look: new T.Vector3(p.x, p.y - 1000, p.z + 160), fov: 62 }; }; });
    for (const y of list) { await setYear(y, 14); await wait(y === list[0] ? 4000 : 2600); const s = await sp(); await shot(`${high ? 'globe' : 'year'}_${String(y).replace('-', 'm')}`); console.log('year', y, s.look, s.alt); }
  },
  async moon() {
    await waitActive(); await wait(3000);
    const aim = (fov, back) => R((a) => { const g = window.__r88.game, s = g.space, T = window.__r88.THREE; g.debugCam = () => { const p = g.car.pose.pos, m = s.toPocket(s.moonEcef, new T.Vector3()); const d = m.clone().sub(p).normalize(); return { pos: p.clone().addScaledVector(d, -a[1]).add(new T.Vector3(0, 1.2, 0)), look: m, fov: a[0] }; }; }, [fov, back]);
    for (const [y, h] of [[2026, 14], [2026, 22], [-4400000000, 14], [-3000000000, 14]]) {
      await setYear(y, h); await wait(2500);
      await aim(55, 9); await wait(1500); await shot(`moon_${String(y).replace('-', 'm')}_${h}_wide`);
      await aim(1.2, 9); await wait(1500); await shot(`moon_${String(y).replace('-', 'm')}_${h}_tele`);
    }
    await R(() => { window.__r88.game.debugCam = null; });
  },
  async fly() {
    await waitActive(); await wait(3000);
    await orbit(0.4, 0.15);
    console.log('start', JSON.stringify(await sp()));
    await keys('KeyW'); await wait(3000); await release(); console.log('after burn', JSON.stringify(await sp())); await shot('fly_burn');
    await wait(2000); console.log('coast', JSON.stringify(await sp()));
    await keys('KeyS'); await wait(4500); console.log('flipped', JSON.stringify(await sp())); await shot('fly_flip');
    await keys('KeyS', 'KeyW'); for (let i = 0; i < 20; i++) { await wait(250); const s = await sp(); if (s.mph < 1) break; } await release();
    console.log('stopped', JSON.stringify(await sp())); await shot('fly_stopped');
  },
  async drive() {
    await waitActive(); await wait(3000);
    await R(() => { const g = window.__r88.game; g.car.sim.body.setRotation({ x: -0.7071, y: 0, z: 0, w: 0.7071 }, true); });
    await wait(1500);
    await keys('KeyX');
    for (const t of [3, 6, 9, 12]) { await wait(3000); const s = await sp(); console.log('drive', t, JSON.stringify(s)); await shot('drive_' + t); }
    await release(); await wait(2500); await orbit(3.1, -0.3); await wait(1500); await shot('drive_globe_back');
  },
  async film() {
    const sweep = async (y0, y1, p0, p1, ms) => { const n = Math.round(ms / 60); for (let i = 0; i <= n; i++) { const k = i / n, e = k * k * (3 - 2 * k); await orbit(y0 + (y1 - y0) * e, p0 + (p1 - p0) * e); await wait(60); } };
    const cine = (fn) => R((src) => { const g = window.__r88.game, T = window.__r88.THREE; const f = new Function('g', 'T', 't', src); const t0 = performance.now(); g.debugCam = () => f(g, T, (performance.now() - t0) / 1000); }, fn);
    const nocine = () => R(() => { window.__r88.game.debugCam = null; });
    await wait(2500);
    await R(() => { const g = window.__r88.game; g.setPaint && g.setPaint('white'); });
    await keys('KeyW'); await sweep(2.6, 0.4, 0.1, 0.05, 2200); await release();
    await tap('KeyO'); await wait(900); await tap('KeyO');
    await sweep(0.4, 0.0, 0.05, 0.1, 1500);
    const s0 = await waitActive(); console.log('film orbit', JSON.stringify(s0));
    await sweep(0, 2.2, 0.1, 0.25, 4500);
    await sweep(2.2, 0.3, 0.25, 0.12, 3500);
    await keys('KeyW'); await wait(2200); await release(); await wait(800);
    await keys('KeyS'); await sweep(0.3, 0.0, 0.12, 0.15, 4300); await keys('KeyS', 'KeyW'); await wait(3200); await release();
    console.log('film stop', JSON.stringify(await sp()));
    await R(() => { const g = window.__r88.game; g.tc.present.hour = 22; g.tc.present.minute = 30; });
    await sweep(0.0, 0.5, 0.15, 0.55, 3500);
    await R(() => { const g = window.__r88.game; g.tc.present.hour = 14; g.tc.present.minute = 0; });
    for (const y of [-66000000, -680000000, -4400000000, -4550000000, 12000, 800000000]) {
      await setYear(y, 14); await R(() => window.__r88.game.hint(window.__r88.game.space.look.label + ' · ' + window.__r88.game.yearLabel(window.__r88.game.tc.present.year), 2.2));
      if (y === 12000) { await sweep(0.4, 1.4, 0.3, 0.9, 2800); } else await sweep(0.3, 0.6, 0.2, 0.3, 2300);
    }
    await setYear(2026, 14); await wait(800);
    await cine("const p = g.car.pose.pos; const k = Math.min(1, t / 6); return { pos: new T.Vector3(p.x, p.y + 6 + k * 3, p.z - 12 - k * 4), look: new T.Vector3(p.x, p.y - 1000, p.z + 260 - k * 120), fov: 60 };");
    await R(() => { const s = window.__r88.game.space, T = window.__r88.THREE; window.__film = setInterval(() => { const a = s.altitude(); if (a < 2.6e7) s.orbit.displace(new T.Vector3(0, a * 0.055 + 20000, 0)); }, 50); });
    await wait(6500);
    await R(() => { clearInterval(window.__film); });
    await wait(1500);
    await R(() => { const s = window.__r88.game.space, T = window.__r88.THREE; s.orbit.displace(new T.Vector3(0, 400000 - s.altitude(), 0)); });
    await nocine(); await orbit(0, 0.12); await wait(1200);
    await tap('KeyO'); await wait(700); await tap('KeyO');
    await wait(7500); await sweep(0, 0.6, 0.1, 0.2, 2500);
    console.log('film end', JSON.stringify(await sp()));
  },
  async tjump() {
    await waitActive(); await wait(3000);
    await R(() => window.__r88.arm(1));
    await keys('KeyW', 'ShiftLeft');
    let s;
    for (let i = 0; i < 80; i++) { await wait(150); s = await sp(); if (s.tc === 'arriving' || s.tc === 'off' && i > 30) break; }
    await release(); await wait(2500);
    s = await sp(); console.log('after time jump', JSON.stringify(s)); await shot('tjump_after');
    await keys('KeyS'); await wait(4500); await keys('KeyS', 'KeyW'); await wait(5000); await release();
    console.log('stopped', JSON.stringify(await sp()));
  },
  async landfar() {
    await waitActive(); await wait(3000);
    const lat = Number(opt('lat', -2.9)), lon = Number(opt('lon', 37.4));
    await R((a) => window.__r88.game.space.setTarget(a[0], a[1]), [lat, lon]);
    await tap('KeyO'); await wait(500); await tap('KeyO');
    for (let i = 0; i < 40; i++) { await wait(500); const s = await sp(); if (s.state === 'ground') break; }
    await wait(3000);
    console.log('landed far', JSON.stringify(await sp()), JSON.stringify(await R(() => { const V = window.__r88.game.valley; return { loc: V.location, spawn: V.spawn && V.spawn.pos }; })));
    await orbit(0.6, 0.15); await wait(1500); await shot('landfar');
  },
  async compare() {
    await waitActive(); await wait(5000);
    const views = [
      ['cmp_limb_day', 34.5, -121.0, 14, 300, -9, 55, false],
      ['cmp_limb_car', 34.5, -121.0, 14, 300, -14, 60, true],
      ['cmp_nadir_bay', 37.6, -122.2, 13, 0, -90, 28, false],
      ['cmp_glint', 18.0, -150.0, 13, 215, -42, 55, false],
      ['cmp_sunset', 36.0, -118.0, 18.9, 255, -8, 7, false],
      ['cmp_night_la', 35.9, -117.6, 23, 215, -40, 50, false],
      ['cmp_sun_limb', 34.5, -121.0, 16.8, 250, -2, 60, false],
    ];
    const only = opt('only', '');
    for (const [name, lat, lon, hour, az, el, fov, car] of views.filter((v) => !only || only.split(',').includes(v[0].slice(4)))) {
      await R((a) => {
        const g = window.__r88.game, s = g.space, T = window.__r88.THREE;
        const [lat, lon, hour, az, el, fov, car, name] = a;
        g.tc.present.hour = Math.floor(hour); g.tc.present.minute = Math.round((hour % 1) * 60);
        s.orbit.start(lat, lon, 400000, s.serverT());
        const A = az * Math.PI / 180, E = el * Math.PI / 180;
        let dir = new T.Vector3(-Math.sin(A) * Math.cos(E), Math.sin(E), Math.cos(A) * Math.cos(E));
        if (name === 'cmp_sunset' || name === 'cmp_sun_limb') {
          const want = name === 'cmp_sunset' ? -21.0 : 7;
          for (let hh = 12; hh < 21; hh += 0.02) { g.tc.present.hour = Math.floor(hh); g.tc.present.minute = Math.floor((hh % 1) * 60); s.updateFrame(0); const e = Math.asin(g.sky.sunDir.y) * 180 / Math.PI; if (e < want) break; }
          const sd = g.sky.sunDir.clone(); sd.y = 0; sd.normalize(); const pe = name === 'cmp_sunset' ? -0.345 : -0.2; dir = sd.multiplyScalar(Math.cos(pe)).add(new T.Vector3(0, Math.sin(pe), 0)).normalize();
        }
        if (name === 'cmp_glint') {
          s.updateFrame(0);
          const cam = s.camEcef.clone(), sun = s.sunEcef.clone(), R = 6371000; let best = null, bd = 9;
          for (let k = 0; k <= 400; k++) { const f = k / 400; const n = cam.clone().normalize().lerp(sun, f).normalize(); const P = n.clone().multiplyScalar(R); const v = cam.clone().sub(P).normalize(); if (v.dot(n) <= 0) continue; const hv = v.clone().add(sun).normalize(); const d = 1 - hv.dot(n); if (d < bd) { bd = d; best = P; } }
          if (best) dir = s.toPocket(best, new T.Vector3()).sub(g.car.pose.pos).normalize();
        }
        const t0 = s.serverT();
        g.debugCam = () => { const p = g.car.pose.pos; const pos = car ? p.clone().addScaledVector(dir, -11).add(new T.Vector3(0, 2.2, 0)) : p.clone().add(new T.Vector3(0, 60, 0)).addScaledVector(dir, 30); return { pos, look: pos.clone().add(dir), fov }; };
      }, [lat, lon, hour, az, el, fov, car, name]);
      await wait(name === 'cmp_nadir_bay' ? 9000 : 4500);
      await shot(name);
      console.log(name, JSON.stringify(await R(() => { const s = window.__r88.game.space; return { expo: +s.expo.toFixed(2), stars: +s.stars.gain.value.toFixed(2), sub: s.latLonOf(s.anchorEcef) }; })));
    }
    await R(() => { window.__r88.game.debugCam = null; });
  },
  async film2() {
    await waitActive(); await wait(4000);
    const sweep = async (y0, y1, p0, p1, ms) => { const n = Math.round(ms / 60); for (let i = 0; i <= n; i++) { const k = i / n, e = k * k * (3 - 2 * k); await orbit(y0 + (y1 - y0) * e, p0 + (p1 - p0) * e); await wait(60); } };
    const view = (a) => R((a) => {
      const g = window.__r88.game, s = g.space, T = window.__r88.THREE;
      const [lat, lon, hour, az, el, fov, mode] = a;
      if (hour !== null) { g.tc.present.hour = Math.floor(hour); g.tc.present.minute = Math.round((hour % 1) * 60); }
      if (lat !== null) s.orbit.start(lat, lon, 400000, s.serverT());
      s.updateFrame(0);
      const A = az * Math.PI / 180, E = el * Math.PI / 180;
      let dir = new T.Vector3(-Math.sin(A) * Math.cos(E), Math.sin(E), Math.cos(A) * Math.cos(E));
      if (mode === 'sun') { const sd = g.sky.sunDir.clone(); sd.y = 0; sd.normalize(); dir = sd.multiplyScalar(Math.cos(-0.345)).add(new T.Vector3(0, Math.sin(-0.345), 0)).normalize(); }
      if (mode === 'glint') { const cam = s.camEcef.clone(), sun = s.sunEcef.clone(); let best = null, bd = 9; for (let k = 0; k <= 400; k++) { const n = cam.clone().normalize().lerp(sun, k / 400).normalize(), P = n.clone().multiplyScalar(6371000), v = cam.clone().sub(P).normalize(); if (v.dot(n) <= 0) continue; const d = 1 - v.clone().add(sun).normalize().dot(n); if (d < bd) { bd = d; best = P; } } if (best) dir = s.toPocket(best, new T.Vector3()).sub(g.car.pose.pos).normalize(); }
      if (mode === 'free') { g.debugCam = null; return; }
      g.debugCam = () => { const p = g.car.pose.pos, pos = p.clone().add(new T.Vector3(0, 60, 0)).addScaledVector(dir, 30); return { pos, look: pos.clone().add(dir), fov }; };
    }, a);
    await R(() => { const g = window.__r88.game; g.tc.present.hour = 14; g.tc.present.minute = 0; g.space.orbit.start(37.0, -123.4, 400000, g.space.serverT()); });
    await sweep(0.2, 1.4, 0.1, 0.28, 8000);
    await view([null, null, null, 40, -62, 32, null]); await wait(6500);
    await view([18.0, -150.0, 13, 0, 0, 55, 'glint']); await wait(6000);
    await R(() => { const g = window.__r88.game, s = g.space; s.orbit.start(36.0, -118.0, 400000, s.serverT()); for (let hh = 16; hh < 21; hh += 0.02) { g.tc.present.hour = Math.floor(hh); g.tc.present.minute = Math.floor((hh % 1) * 60); s.updateFrame(0); if (Math.asin(g.sky.sunDir.y) * 180 / Math.PI < -21.0) break; } });
    await view([null, null, null, 0, 0, 7, 'sun']); await wait(6000);
    await view([41.5, -97.0, 23.2, 60, -38, 52, null]); await wait(7500);
    await view([34.6, -119.0, 14, 0, 0, 60, 'free']); await R(() => { const g = window.__r88.game; g.rig.initialized = false; });
    await sweep(2.4, 0.2, 0.15, 0.1, 3000);
    await tap('KeyO'); await wait(600); await tap('KeyO');
    await wait(8000); await sweep(0.2, 0.7, 0.1, 0.2, 2500);
    console.log('film2 end', JSON.stringify(await sp()));
  },
  async struct2() {
    await waitActive();
    const aimAt = (what, fov) => R((a) => { const g = window.__r88.game, s = g.space, T = window.__r88.THREE; g.debugCam = () => { const p = g.car.pose.pos, I = s.structures.items; let t; if (a[0] === 'station') t = I.station ? I.station.getWorldPosition(new T.Vector3()) : p.clone().add(new T.Vector3(-5500, 0, 4400)); else if (a[0] === 'up') t = p.clone().add(new T.Vector3(0, 1000, 200)); else t = p.clone().add(new T.Vector3(-5500, 600, 4400)); const d = t.clone().sub(p).normalize(); return { pos: p.clone().addScaledVector(d, -10).add(new T.Vector3(0, 2, 0)), look: t, fov: a[1] }; }; }, [what, fov]);
    for (const y of [2300, 12000, 200000]) {
      await setYear(y, 15); await wait(3000);
      for (const [w, f] of [['station', 50], ['up', 70], ['tether', 50]]) { await aimAt(w, f); await wait(1500); await shot(`st2_${y}_${w}`); }
    }
    console.log(JSON.stringify(await R(() => { const s = window.__r88.game.space, I = s.structures.items; return Object.fromEntries(Object.entries(I).map(([k, v]) => [k, { vis: v.visible, pos: v.position ? v.position.toArray().map((x) => Math.round(x)) : null }])); })));
    await R(() => { window.__r88.game.debugCam = null; });
  },
  async struct() {
    await waitActive();
    for (const y of [2150, 2300, 12000, 200000, 5000000]) { await setYear(y, 15); await wait(3500); await orbit(1.2, 0.35); await wait(1200); await shot(`struct_${y}`); }
  },
  async reentry() {
    await waitActive(); await wait(3000);
    await tap('KeyO'); await wait(500); await tap('KeyO');
    for (const t of [1, 2.5, 3.8, 4.8]) { await wait(t === 1 ? 1000 : 1300); await shot('reentry_' + t); console.log('re', JSON.stringify(await sp())); }
    await wait(2000); await shot('reentry_landed'); console.log('landed', JSON.stringify(await sp()));
  },
  async tablet() {
    await waitActive(); await wait(4000);
    const grab = async (name) => { const d = await R(() => { const c = window.__r88.game.cockpit; c.dirty = true; c.draw && c.draw(); return c.canvas.toDataURL('image/png'); }); fs.writeFileSync(`${out}/${name}.png`, Buffer.from(d.split(',')[1], 'base64')); console.log('tablet', name); };
    await R(() => { window.__r88.game.cockpit.app = 'map'; }); await wait(1500); await grab('tablet_map');
    await R(() => { const s = window.__r88.game.space, h = s.info().home; s.setTarget(h.lat, h.lon); }); await wait(800); await grab('tablet_map_home');
    console.log('target', JSON.stringify(await R(() => { const I = window.__r88.game.space.info(); return { landing: I.landing, name: I.landingName, track: I.track && I.track.length, sub: I.sub }; })));
    await R(() => { window.__r88.game.cockpit.app = 'space'; }); await wait(800); await grab('tablet_space');
  },
  async perf() {
    await waitActive(); await wait(6000);
    await orbit(0, 0.15); await reset(); await wait(6000); await stats('orbit-chase');
    await R(() => window.__r88.camera('fpp')); await reset(); await wait(5000); await stats('orbit-fpp'); await R(() => window.__r88.camera('chase'));
    console.log('prof', JSON.stringify(await R(() => window.__r88.state().prof)), 'calls', await R(() => window.__r88.state().calls), 'gpuMs', await R(() => window.__r88.game.gfx.gpuMs.toFixed(2)));
  },
};
if (flag('video')) await startVideo();
for (const sc of scenarios) { if (!S[sc]) { console.log('unknown', sc); continue; } console.log('== ' + sc); try { await S[sc](); } catch (e) { console.log('scenario error', e.message); } }
if (flag('video')) await stopVideo(opt('name', 'space_film'));
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
if (flag('logs')) console.log(logs.slice(0, 60).join('\n'));
await ctx.close(); await browser.close();
fs.rmSync(LOCK, { force: true });
