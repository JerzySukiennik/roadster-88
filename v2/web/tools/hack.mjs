// Roadster 88 hack test: plays the chapter 2 terminal hack like a normal player in one browser. Run 1 walks up, takes one decoy, throws it once and holds E with no timing tricks; run 2 ignores the drones and just holds E. Both must finish (run 2 slower), and every sighting must come from inside a drone's lit circle (never from across the plaza).
// usage: node web/tools/hack.mjs [--port=8788] [--q=medium]
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const out = path.resolve(here, '../../Niepotrzebne/shots-hack');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.endsWith('.png')) fs.rmSync(path.join(out, f));
const chromes = () => { try { return execSync('pgrep -f "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"').toString().trim().split('\n').filter(Boolean).length; } catch { return 0; } };
for (let i = 0; i < 120 && chromes() > 0; i++) { if (i % 6 === 0) console.log('waiting for other test browsers to finish...'); await new Promise((r) => setTimeout(r, 5000)); }
const exe = '/Users/jurek/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1100,700', '--window-position=3000,3000', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('404')) errors.push(t.slice(0, 240)); });
await page.goto(`http://localhost:${opt('port', '8788')}/web/?debug&nomenu&q=${opt('q', 'medium')}&map=valley&story=reset`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__r88 && window.__r88.game.started && window.__r88.game.story, null, { timeout: 200000 });
const R = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
await R(() => { const g = window.__r88.game; g.online.setEnabled(false); window.__r88.setTime(13, 0); });
const results = [];
let shotN = 0;
const live = async (ms = 90000) => { const t0 = Date.now(); let f0 = null; while (Date.now() - t0 < ms) { const f = await R(() => window.__r88.game.frameCount).catch(() => null); if (f !== null) { if (f0 === null) f0 = f; else if (f - f0 >= 6) return true; } await wait(400); } return false; };
const shot = async (name) => { await live(); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}_${name}.png` }); };
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(ok ? 'PASS' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); };
const where = (expr) => R((e) => { const g = window.__r88.game, S = g.story; const v = new Function('g', 'S', 'return ' + e)(g, S); return v ? { x: v.x, y: v.y, z: v.z } : null; }, expr);
const putWalker = (p, face) => R(([p, f]) => {
  const g = window.__r88.game, w = g.walker, y = g.valley.heightAt(p.x, p.z);
  if (!w.active) g.exitCar();
  const yaw = f ? Math.atan2(f.x - p.x, f.z - p.z) : w.yaw;
  w.enter(p.x, y + 0.03, p.z, yaw); g.rig.mode = 'foot'; g.rig.footYaw = yaw; g.rig.footPitch = 0.25; g.rig.footInit = false;
  if (g.driver.root && g.driver.root.parent !== g.gfx.scene) { g.driver.attach(g.gfx.scene, true); g.driver.root.visible = true; }
}, [p, face]).then(() => live(60000));
const key = async (k) => { await live(60000); await page.keyboard.press(k); await wait(150); };

await wait(2500);
await R(() => { const S = window.__r88.game.story; Object.assign(S.st.flags, { ch1: true, k2080: true, c2told: true, c2go: true, c2heard: true, c2seen: true, novaMet: true }); S.save(); window.__r88.story.goto('2.jump'); });
await R(() => { const g = window.__r88.game; if (g.walker.active) { g.walker.leave(); g.driver.attach(g.car.view.root, false); g.rig.mode = 'chase'; } g.tc.setDestination({ ...g.tc.destination, year: 2080 }); if (!g.tc.armed) g.toggleArm(); window.__r88.tg(-900, g.story.st.anchors.workshop.z - 900, 0, 40.5); window.__r88.keys('KeyW'); });
for (let i = 0; i < 60 && (await R(() => window.__r88.game.tc.present.year)) !== 2080; i++) await wait(500);
await R(() => window.__r88.release());
check('in 2080', (await R(() => window.__r88.game.tc.present.year)) === 2080);
await wait(3000);
await R(() => { const S = window.__r88.game.story; S.flags.hack = 0; window.__r88.story.goto('2.hack'); });
await wait(1500);
await R(() => {
  const D = window.__r88.game.story.drones, lit = D.lit.bind(D);
  window.__probe = { maxLit: 0, spots: [] };
  D.lit = (d, p) => { const ok = lit(d, p); if (ok) window.__probe.maxLit = Math.max(window.__probe.maxLit, Math.hypot(p.x - d.pos.x, p.z - d.pos.z)); return ok; };
  const up = D.update.bind(D);
  D.update = (dt, ctx) => { const r = up(dt, ctx); if (r.spotted) { const d = D.list.find((q) => q.mode === 'alert' && q.t < 0.2); window.__probe.spots.push(d ? Math.round(Math.hypot(r.spotted.x - d.pos.x, r.spotted.z - d.pos.z) * 10) / 10 : -1); } return r; };
});
const T = await R(() => { const s = window.__r88.game.story.props.sets.get('k_tower').spots; return { term: { x: s.terminal.x, z: s.terminal.z }, crate: { x: s.crate.x, z: s.crate.z } }; });
const hackRun = async (label, ms) => {
  await putWalker({ x: T.term.x, z: T.term.z + 1.1 }, T.term); await wait(700);
  check(`${label}: hack prompt at the terminal`, (await R(() => window.__r88.game.interact.shown || '')).includes('hack'), await R(() => window.__r88.game.interact.shown));
  const t0 = Date.now();
  await page.keyboard.down('KeyE');
  let warnShot = false, last = -1;
  while (Date.now() - t0 < ms) {
    const s = await R(() => { const S = window.__r88.game.story; return { step: S.st.step, hack: S.hack, warn: S.drones.list.some((d) => d.cone === 3), spots: S.hackSpots || 0 }; });
    if (s.step !== '2.hack') break;
    if (s.warn && !warnShot && label === 'ignore') { warnShot = true; await shot('warning_cone'); }
    if (Math.round(s.hack * 10) !== last) { last = Math.round(s.hack * 10); console.log(`  ${label} ${((Date.now() - t0) / 1000).toFixed(1)} s  hack ${Math.round(s.hack * 100)}%  spots ${s.spots}`); }
    await wait(400);
  }
  await page.keyboard.up('KeyE');
  return { sec: (Date.now() - t0) / 1000, step: await R(() => window.__r88.game.story.st.step), spots: await R(() => window.__r88.game.story.hackSpots || 0) };
};

await putWalker({ x: T.crate.x + 1.2, z: T.crate.z + 0.4 }, T.crate); await wait(800);
check('decoy prompt at the crate', (await R(() => window.__r88.game.interact.shown || '')).includes('decoy'), await R(() => window.__r88.game.interact.shown));
await key('KeyE'); await wait(800);
check('holding a decoy', await R(() => window.__r88.game.story.holding('decoy')));
const away = { x: T.term.x + 6, z: T.term.z + 10 };
await putWalker(away, { x: away.x + 4, z: away.z + 12 }); await wait(500);
await R(() => window.__r88.click()); await wait(1800);
check('the decoy pulls the drones', await R(() => { const D = window.__r88.game.story.drones; return !!D.decoy && D.list.filter((d) => d.mode === 'decoy').length >= 5; }), await R(() => window.__r88.game.story.drones.list.map((d) => d.mode).join(',')));
await shot('decoy_swarm');
await R(() => { window.__r88.game.story.hackSpots = 0; });
const run1 = await hackRun('decoy', 60000);
check('normal run with one decoy finishes within 35 s', run1.step === '2.roof' && run1.sec < 35, run1);

await R(() => { const S = window.__r88.game.story; S.flags.hack = 0; S.drones.decoy = null; for (const d of S.drones.list) { d.mode = 'patrol'; d.calm = 0; } for (const x of [...S.items.values()]) if (x.kind === 'decoy' && x.it) S.removeItem(x.it); window.__r88.story.goto('2.hack'); S.hackSpots = 0; });
await wait(4000);
const run2 = await hackRun('ignore', 150000);
check('ignoring the drones still finishes, just slower', run2.step === '2.roof' && run2.sec < 150 && run2.sec > run1.sec, run2);
check('ignoring the drones gets you seen at least once', run2.spots >= 1, run2);
const probe = await R(() => window.__probe);
check('every sighting is inside a lit circle (under 8 m away)', probe.maxLit < 8 && probe.spots.every((x) => x < 8), probe);
console.log('frames', JSON.stringify(await R(() => window.__r88.stats())));
console.log('errors', JSON.stringify([...new Set(errors)].slice(0, 10)));
check('no page errors', !errors.length);
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
await browser.close();
