// Roadster 88 multiplayer crash test: two isolated browsers in the same world; B rams A's parked Roadster at speed and both report lattice damage, impacts and hit hand-offs, with screenshots.
// usage: node web/tools/mp-crash.mjs [--map=valley] [--speed=25]
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const out = path.resolve(here, '../../Niepotrzebne/shots-mp');
const map = opt('map', 'valley'), speed = Number(opt('speed', 25));
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
for (let i = 0; i < 40; i++) { const ok = await Promise.all([A, B].map((P) => P.page.evaluate(() => window.__r88.game.online.remotes.size > 0))); if (ok[0] && ok[1]) break; await wait(500); }
const dmg = (p) => p.evaluate(() => { const g = window.__r88.game, L = g.car.lattice; let maxd = 0; if (L && L.x && L.rest) for (let i = 0; i < L.n; i++) { const dx = L.x[i * 3] - L.rest[i * 3], dy = L.x[i * 3 + 1] - L.rest[i * 3 + 1], dz = L.x[i * 3 + 2] - L.rest[i * 3 + 2]; maxd = Math.max(maxd, Math.hypot(dx, dy, dz)); } return { broken: L ? L.brokenCount : -1, maxd: +maxd.toFixed(3), impacts: g.damage.lastImpact.size, remoteHits: g.damage.lastRemote.size, solid: [...g.online.remotes.values()].map((r) => r.solid).join(','), speed: +g.car.sim.speed.toFixed(1) }; });
await A.page.evaluate(() => { const g = window.__r88.game, s = g.car.sim; s.teleport([s.pos.x, s.pos.y + 0.1, s.pos.z], 0, 0); });
await wait(1500);
const apos = await A.page.evaluate(() => { const s = window.__r88.game.car.sim; return [s.pos.x, s.pos.y, s.pos.z]; });
await B.page.evaluate((a) => { const g = window.__r88.game; g.car.sim.teleport([a[0], a[1] + 0.3, a[2] - 60], 0, 0); g.capture(g.car); g.capture(g.car); g.rig.initialized = false; }, apos);
await wait(2500);
console.log('before A', JSON.stringify(await dmg(A.page)), 'B', JSON.stringify(await dmg(B.page)));
await B.page.evaluate((v) => { const g = window.__r88.game, s = g.car.sim; s.teleport([s.pos.x, s.pos.y, s.pos.z], 0, v); }, speed);
await B.page.evaluate(() => window.__r88.keys('KeyW'));
for (let i = 0; i < 16; i++) { await wait(250); if (i === 7) await B.page.screenshot({ path: `${out}/crash_B_view.png` }); }
await B.page.evaluate(() => window.__r88.release());
await wait(1500);
await A.page.screenshot({ path: `${out}/crash_A_view.png` });
console.log('after  A', JSON.stringify(await dmg(A.page)), 'B', JSON.stringify(await dmg(B.page)));
console.log('errors', JSON.stringify([...A.errors, ...B.errors].slice(0, 8)));
await A.page.evaluate(() => window.__r88.game.online.stop()); await B.page.evaluate(() => window.__r88.game.online.stop());
await wait(800);
await browser.close();
