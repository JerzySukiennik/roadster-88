// Roadster 88 space co-op test: two isolated browsers go online in the same world, both launch to space with O twice, and each must see the other's Roadster in orbit (room space_<period>, or the valley room with --room=valley while the RTDB rule for space rooms is missing). Screenshots from both.
// usage: node web/tools/space-coop.mjs [--room=valley]
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const out = path.resolve(here, '../../Niepotrzebne/shots-space');
fs.mkdirSync(out, { recursive: true });
const others = () => { try { return execSync('pgrep -f "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"').toString().trim().split('\n').filter(Boolean).length; } catch (e) { return 0; } };
for (let n = 0; others() > 0 && n < 400; n++) await new Promise((r) => setTimeout(r, 2000));
const exe = '/Users/jurek/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1100,760', '--window-position=3000,3000', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const room = opt('room', '');
const url = `http://localhost:8788/web/?debug&jitter&nostory&noearth&q=medium&map=valley${room ? '&spaceroom=' + room : ''}`;
const open = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 680 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('Earth')) errors.push(tag + ' ' + m.text().slice(0, 200)); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__r88 && window.__r88.game.started, null, { timeout: 150000 });
  return { page, errors };
};
const A = await open('A');
const B = await open('B');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const st = (p) => p.evaluate(() => { const g = window.__r88.game, o = g.online, s = g.space; const rs = [...o.remotes.values()].map((r) => ({ pos: [r.pos.x, r.pos.y, r.pos.z].map((v) => +v.toFixed(1)), view: !!(r.view && r.view.root.visible), hidden: r.hidden })); return { status: o.status, room: o.room, remotes: rs, space: s.state, pos: [g.car.sim.pos.x, g.car.sim.pos.y, g.car.sim.pos.z].map((v) => +v.toFixed(1)) }; });
for (let i = 0; i < 40; i++) { const a = await st(A.page), b = await st(B.page); if (a.remotes.length && b.remotes.length) break; await wait(500); }
console.log('valley A', JSON.stringify(await st(A.page)));
for (const P of [A, B]) { await P.page.evaluate(() => window.__r88.tap('KeyO')); await wait(400); await P.page.evaluate(() => window.__r88.tap('KeyO')); }
for (let i = 0; i < 40; i++) { const a = await st(A.page), b = await st(B.page); if (a.space === 'orbit' && b.space === 'orbit') break; await wait(500); }
await wait(4000);
console.log('orbit A', JSON.stringify(await st(A.page)));
console.log('orbit B', JSON.stringify(await st(B.page)));
await B.page.evaluate(() => { const g = window.__r88.game, r = [...g.online.remotes.values()][0]; if (!r) return; const T = window.__r88.THREE; g.debugCam = () => { const p = g.car.pose.pos, d = r.pos.clone().sub(p); const back = d.clone().normalize().multiplyScalar(-9); return { pos: p.clone().add(back).add(new T.Vector3(0, 2.5, 0)), look: r.pos, fov: 55 }; }; });
await wait(1500);
await B.page.screenshot({ path: `${out}/coop_B_sees_A.png` });
await A.page.evaluate(() => window.__r88.keys('KeyW')); await wait(2500); await A.page.evaluate(() => window.__r88.release()); await wait(1500);
await B.page.screenshot({ path: `${out}/coop_B_sees_A_burn.png` });
console.log('after A burn, B sees', JSON.stringify((await st(B.page)).remotes), 'A at', JSON.stringify((await st(A.page)).pos));
await A.page.evaluate(() => { const g = window.__r88.game, r = [...g.online.remotes.values()][0]; if (!r) return; const T = window.__r88.THREE; g.debugCam = () => ({ pos: g.car.pose.pos.clone().add(new T.Vector3(0, 3, -9)), look: r.pos, fov: 60 }); });
await wait(1500);
await A.page.screenshot({ path: `${out}/coop_A_sees_B.png` });
console.log('errors', JSON.stringify([...A.errors, ...B.errors].slice(0, 8)));
await A.page.evaluate(() => window.__r88.game.online.stop()); await B.page.evaluate(() => window.__r88.game.online.stop());
await wait(800);
await browser.close();
