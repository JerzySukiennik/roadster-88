// Roadster 88 multiplayer ride test: network lag at 88 mph, paint sync, walking into cars and players, riding as a passenger (with a time jump), and taking over a friend's empty Roadster, with screenshots from both players.
// usage: node web/tools/mp-ride.mjs [--map=valley]
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const out = path.resolve(here, '../../Niepotrzebne/shots-mp');
const map = opt('map', 'valley');
fs.mkdirSync(out, { recursive: true });
const exe = '/Users/jurek/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1100,760', '--window-position=3000,3000', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const url = `http://localhost:8788/web/?debug&jitter&q=medium&map=${map}`;
const open = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 680 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(tag + ' ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__r88 && window.__r88.game.started, null, { timeout: 120000 });
  return { page, errors };
};
const A = await open('A');
const B = await open('B');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(ok ? 'PASS' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); };
for (let i = 0; i < 40; i++) { const ok = await Promise.all([A, B].map((P) => P.page.evaluate(() => window.__r88.game.online.remotes.size > 0))); if (ok[0] && ok[1]) break; await wait(500); }
const uidA = await A.page.evaluate(() => window.__r88.game.online.uid);

await A.page.evaluate(() => { const g = window.__r88.game; g.setPaint('red'); });
await B.page.evaluate(() => { const g = window.__r88.game; g.setPaint('white'); });
const Z0 = -1500, X0 = -900;
await A.page.evaluate(([x, z]) => window.__r88.tg(x, z, 0, 0), [X0, Z0]);
await B.page.evaluate(([x, z]) => window.__r88.tg(x + 9, z - 30, 0, 0), [X0, Z0]);
await wait(2500);
check('paint seen by B', await B.page.evaluate((u) => { const r = window.__r88.game.online.remotes.get(u); return r && r.viewPaint === 'red'; }, uidA), await B.page.evaluate((u) => { const g = window.__r88.game, r = g.online.remotes.get(u); return { has: !!r, paint: r && r.paint, view: r && r.viewPaint, fps: +(1000 / (g.frames.slice(-30).reduce((a, b) => a + b, 0) / 30)).toFixed(0), remotes: g.online.remotes.size }; }, uidA));

await A.page.evaluate(([x, z]) => window.__r88.tg(x, z, 0, 39.4), [X0, Z0]);
await A.page.evaluate(() => window.__r88.keys('KeyW'));
await wait(1800);
const lag = [];
for (let i = 0; i < 8; i++) {
  const [a, b] = await Promise.all([A.page.evaluate(() => { const s = window.__r88.game.car.sim; return [s.pos.x, s.pos.z, s.vel.z]; }), B.page.evaluate((u) => { const r = window.__r88.game.online.remotes.get(u); return r ? [r.pos.x, r.pos.z] : null; }, uidA)]);
  if (b) lag.push(+(a[1] - b[1]).toFixed(2));
  await wait(150);
}
await A.page.evaluate(() => window.__r88.release());
const avgLag = lag.reduce((s, v) => s + v, 0) / Math.max(1, lag.length);
check('remote not behind at 88 mph (m)', lag.length && Math.abs(avgLag) < 3, lag);

await A.page.evaluate(([x, z]) => window.__r88.tg(x, z, 0, 0), [X0, Z0]);
await B.page.evaluate(([x, z]) => window.__r88.tg(x + 9, z - 2, 0, 0), [X0, Z0]);
await wait(2000);
await B.page.evaluate(() => window.__r88.tap('KeyF'));
await wait(900);
const walk = await B.page.evaluate(([x, z]) => {
  const g = window.__r88.game, w = g.walker, y = g.valley ? g.valley.heightAt(x - 3.4, z) : 0;
  w.enter(x - 3.4, y + 0.02, z, Math.PI / 2); g.rig.footYaw = Math.PI / 2; g.rig.footInit = false;
  return w.active;
}, [X0, Z0]);
await B.page.evaluate(() => window.__r88.keys('KeyW'));
let minD = 99;
for (let i = 0; i < 12; i++) { await wait(150); const d = await B.page.evaluate((u) => { const g = window.__r88.game, r = g.online.remotes.get(u), w = g.walker.pos; return Math.hypot(w.x - r.pos.x, w.z - r.pos.z); }, uidA); minD = Math.min(minD, d); }
await B.page.evaluate(() => window.__r88.release());
check('walker blocked by remote car', walk && minD > 0.9, { minD: +minD.toFixed(2) });

await B.page.evaluate(([x, z]) => { const g = window.__r88.game, y = g.valley ? g.valley.heightAt(x - 2.2, z) : 0; g.walker.enter(x - 2.2, y + 0.02, z, Math.PI / 2); }, [X0, Z0]);
await wait(400);
await B.page.evaluate(() => window.__r88.tap('KeyF'));
await wait(1500);
check('B rides with A', await B.page.evaluate((u) => window.__r88.game.ride === u && !window.__r88.game.walker.active, uidA));
check('A sees passenger in its car', await A.page.evaluate(() => { const g = window.__r88.game, r = [...g.online.remotes.values()][0]; return !!(r && r.ride === g.online.uid && r.driver && r.driver.root && r.driver.root.parent === g.car.view.root); }));
await A.page.evaluate(() => window.__r88.keys('KeyW'));
await wait(2500);
await A.page.evaluate(() => { window.__r88.release(); window.__r88.game.rig.mode = 'chase'; });
await A.page.screenshot({ path: `${out}/ride_A_view.png` });
await B.page.screenshot({ path: `${out}/ride_B_view.png` });
const followCam = await Promise.all([A.page.evaluate(() => { const s = window.__r88.game.car.sim; return [s.pos.x, s.pos.z]; }), B.page.evaluate(() => { const c = window.__r88.game.gfx.camera.position; return [c.x, c.z]; })]);
check('B camera follows A', Math.hypot(followCam[0][0] - followCam[1][0], followCam[0][1] - followCam[1][1]) < 25, followCam);

await A.page.evaluate(([x, z]) => { const g = window.__r88.game; g.tc.setDestination({ ...g.tc.destination, year: 1885 }); if (!g.tc.armed) g.toggleArm(); window.__r88.tg(x, z, 0, 40.5); }, [X0, Z0]);
await A.page.evaluate(() => window.__r88.keys('KeyW'));
await wait(900);
await B.page.screenshot({ path: `${out}/ride_B_jump.png` });
await wait(6000);
await A.page.evaluate(() => window.__r88.release());
const jA = await A.page.evaluate(() => { const g = window.__r88.game; return { year: g.tc.present.year, room: g.online.room, state: g.tc.state }; });
const jB = await B.page.evaluate(() => { const g = window.__r88.game; return { year: g.tc.present.year, room: g.online.room, state: g.tc.state, ride: !!g.ride, host: !!(g.ride && g.online.remotes.get(g.ride)) }; });
check('passenger jumps with driver', jA.year === 1885 && jB.year === 1885 && jA.room === jB.room && jB.ride && jB.host, { jA, jB });

await A.page.evaluate(() => { const g = window.__r88.game, s = g.car.sim; s.teleport([s.pos.x, s.pos.y + 0.05, s.pos.z], s.yaw(), 0); });
await wait(1500);
await B.page.evaluate(() => window.__r88.tap('KeyF'));
await wait(800);
check('B gets out of the ride', await B.page.evaluate(() => window.__r88.game.walker.active && !window.__r88.game.ride), await B.page.evaluate(() => { const g = window.__r88.game, r = g.ride && g.online.remotes.get(g.ride); return { ride: !!g.ride, tc: g.tc.state, rv: r ? +r.vel.length().toFixed(1) : null, hint: document.getElementById('hint').textContent, dead: !!g.player.dead, fps: +(1000 / (g.frames.slice(-30).reduce((a, b) => a + b, 0) / 30)).toFixed(0) }; }));

await A.page.evaluate(() => window.__r88.tap('KeyF'));
await wait(900);
await A.page.evaluate(() => { const g = window.__r88.game, w = g.walker, s = g.car.sim; const x = s.pos.x + 9, z = s.pos.z; w.enter(x, (g.valley ? g.valley.heightAt(x, z) : 0) + 0.02, z, 0); });
await wait(800);
await B.page.evaluate((u) => { const g = window.__r88.game, r = g.online.remotes.get(u), x = r.pos.x - r.left.x * 2.3, z = r.pos.z - r.left.z * 2.3; g.walker.enter(x, (g.valley ? g.valley.heightAt(x, z) : 0) + 0.02, z, 0); }, uidA);
await wait(500);
await B.page.evaluate(() => window.__r88.tap('KeyF'));
await wait(2500);
const tB = await B.page.evaluate(() => { const g = window.__r88.game; return { walker: g.walker.active, paint: g.car.paint || g.settings.paint, cars: g.cars.length }; });
const tA = await A.page.evaluate(() => { const g = window.__r88.game; return { given: !!g.car.given, visible: g.car.view.root.visible }; });
check('B takes over A’s empty Roadster', !tB.walker && tB.paint === 'red' && tA.given && !tA.visible, { tA, tB });
await B.page.evaluate(() => window.__r88.keys('KeyW'));
await wait(1500);
await B.page.evaluate(() => window.__r88.release());
await A.page.screenshot({ path: `${out}/take_A_view.png` });
check('A sees its old car driven red by B', await A.page.evaluate(() => { const r = [...window.__r88.game.online.remotes.values()][0]; return !!(r && r.viewPaint === 'red' && r.view && r.view.root.visible); }));
await A.page.evaluate(() => window.__r88.tap('KeyR'));
await wait(600);
check('A spawns a new Roadster', await A.page.evaluate(() => { const g = window.__r88.game; return !g.car.given && g.car.view.root.visible; }));

console.log('errors', JSON.stringify([...A.errors, ...B.errors].slice(0, 8)));
console.log(results.filter((r) => r.ok).length + '/' + results.length + ' passed');
await A.page.evaluate(() => window.__r88.game.online.stop()); await B.page.evaluate(() => window.__r88.game.online.stop());
await wait(800);
await browser.close();
