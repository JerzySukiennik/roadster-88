// Roadster 88 life sensing test: one offline page in the Late Cretaceous leads with a stubbed online.players() list; a fake remote player on foot near the T-rex must be stalked, chased and bitten (bite carries a.target = its uid), a fake remote car must make a herd flee, and the local player on foot must be hunted too (bite near the walker).
// usage: node web/tools/life-sense.mjs [--year=-68000000] [--q=medium] [--extra=&nocity] [--out=dir]
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const out = opt('out', path.resolve(here, '../../Niepotrzebne/shots-net'));
const YEAR = Number(opt('year', -68000000)), Q = opt('q', 'medium');
fs.mkdirSync(out, { recursive: true });
const exe = '/Users/jurek/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1000,700', '--window-position=3000,3000', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.goto(`http://localhost:8788/web/?debug&q=${Q}&map=valley${opt('extra', '&nocity')}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__r88 && window.__r88.game.started && window.__r88.game.life && window.__r88.game.life.ready, null, { timeout: 300000 });
await page.waitForFunction(() => window.__r88.game.life.spawnSeed, null, { timeout: 20000 }).catch(() => console.log('no online seed, staying unseeded'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.evaluate(async (year) => {
  const g = window.__r88.game, tt = await import('/web/src/sim/timetravel.js'), span = tt.eraOf(year);
  Object.assign(g.tc.present, { ...span.date, year, minute: 0 }); g.applyClock(true);
  g.eras.apply(span.id, { instant: true, year });
  await g.life.setEra(span.id);
  for (let i = 0; i < 100 && !(g.life.ready && g.life.eraId === span.id); i++) await new Promise((r) => setTimeout(r, 50));
  g.player.kill = (cause) => { (window.__kills = window.__kills || []).push(cause); };
  const L = g.life, emit = L.emit.bind(L);
  window.__ev = [];
  L.emit = (type, a) => { emit(type, a); if (type === 'bite' || type === 'pounce' || type === 'roar') window.__ev.push([type, a.kind, a.target === undefined ? 'undef' : a.target, +L.sense.dist(a.x, a.z).toFixed(1)]); };
  window.__fake = [];
  g.online.players = () => [{ x: g.car.sim.pos.x, y: g.car.sim.pos.y, z: g.car.sim.pos.z, vx: 0, vz: 0, onFoot: false, uid: 'me', local: true }, ...window.__fake];
  L.netLeader(true);
}, YEAR);

const trex = await page.evaluate(() => { const L = window.__r88.game.life, t = L.solo.find((a) => a.kind === 'trex'); return t ? [t.x, t.z] : null; });
console.log('trex at', JSON.stringify(trex));
await page.evaluate((t) => { const r = window.__r88, g = r.game, x = t[0] + 900, z = t[1]; r.tg(x, z, 0, 0); window.__fake.push({ x: t[0] + 70, y: g.valley.heightAt(t[0] + 70, t[1]), z: t[1], vx: 0, vz: 0, onFoot: true, uid: 'remoteFoot' }); }, trex);
const log = [];
for (let i = 0; i < 40; i++) {
  await wait(500);
  const s = await page.evaluate(() => { const L = window.__r88.game.life, t = L.solo.find((a) => a.kind === 'trex'), f = window.__fake[0]; return { st: t.state, d: +Math.hypot(t.x - f.x, t.z - f.z).toFixed(1), clip: t.clip, ev: window.__ev.splice(0) }; });
  log.push(`${(i * 0.5).toFixed(1)}s ${s.st} d${s.d} ${s.clip}${s.ev.length ? ' ' + JSON.stringify(s.ev) : ''}`);
  if (s.ev.some((e) => e[0] === 'bite')) break;
}
console.log('remote on foot vs T-rex\n  ' + log.join('\n  '));
await page.screenshot({ path: `${out}/sense_trex_remote.png` });

const herd = await page.evaluate(() => {
  const g = window.__r88.game, L = g.life, G = L.groups.find((q) => q.brain === 'grazer' && q.members.length > 3 && q.kind !== 'sauropod') || L.groups.find((q) => q.brain === 'grazer');
  window.__fake.length = 0;
  const x = G.cx - 120, z = G.cz, d = Math.hypot(G.cx - x, G.cz - z);
  window.__fakeCar = { x, z, vx: (G.cx - x) / d * 25, vz: (G.cz - z) / d * 25 };
  window.__fake.push({ x, y: g.valley.heightAt(x, z), z, vx: window.__fakeCar.vx, vz: window.__fakeCar.vz, onFoot: false, uid: 'remoteCar' });
  window.__herd = G;
  return { kind: G.kind, n: G.members.length, mode: G.mode };
});
const hl = [];
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => { const g = window.__r88.game, c = window.__fakeCar, f = window.__fake[0]; c.x += c.vx * 0.25; c.z += c.vz * 0.25; f.x = c.x; f.z = c.z; f.y = g.valley.heightAt(c.x, c.z); });
  await wait(250);
  if (i % 2 === 1) hl.push(await page.evaluate(() => { const G = window.__herd, f = window.__fake[0]; return `${G.mode} d${Math.hypot(G.cx - f.x, G.cz - f.z).toFixed(0)}`; }));
}
console.log(`remote car vs ${herd.kind} herd (${herd.n}, ${herd.mode}): ${hl.join(' | ')}`);

await page.evaluate(() => { window.__fake.length = 0; });
const foot = await page.evaluate(() => {
  const g = window.__r88.game, L = g.life, t = L.solo.find((a) => a.kind === 'trex');
  t.state = 'wander'; t.timer = 0;
  const x = t.x + 60, z = t.z, y = g.valley.heightAt(x, z);
  g.walker.enter(x, y + 0.02, z, 0);
  return [x, z];
});
const fl = [];
let kills = 0;
for (let i = 0; i < 40; i++) {
  await wait(500);
  const s = await page.evaluate(() => { const g = window.__r88.game, L = g.life, t = L.solo.find((a) => a.kind === 'trex'), w = g.walker; const k = (window.__kills || []).length; window.__kills = []; if (w.dead) { w.dead = false; w.lock = 0; } return { st: t.state, clip: t.clip, d: +Math.hypot(t.x - w.pos.x, t.z - w.pos.z).toFixed(1), onFoot: L.sense.me.onFoot, ev: window.__ev.splice(0).filter((e) => e[1] === 'trex'), kills: k }; });
  kills += s.kills;
  fl.push(`${(i * 0.5).toFixed(1)}s ${s.st} ${s.clip} d${s.d} foot=${s.onFoot} kills=${kills}${s.ev.length ? ' ' + JSON.stringify(s.ev) : ''}`);
  if (s.ev.some((e) => e[0] === 'bite') && s.d < 8) break;
}
console.log('local walker vs T-rex\n  ' + fl.join('\n  '));
await page.screenshot({ path: `${out}/sense_trex_walker.png` });
console.log(errors.length ? 'ERRORS\n' + errors.slice(0, 20).join('\n') : 'no page errors');
await browser.close();
