// Roadster 88 side jobs test: plays the repeatable jobs like a player in one browser: the Jobs app on the tablet, the start beams, a courier across eras (pick up, frunk, jump, take out, carry into the beam), a taxi to the Cretaceous, a police chase lost and won, and the 1885 sheriff, with screenshots and the completed counts.
// usage: node web/tools/side.mjs [--port=8788] [--q=medium]
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const out = path.resolve(here, '../../Niepotrzebne/shots-side');
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
await R(() => { const g = window.__r88.game; g.online.setEnabled(false); window.__r88.setTime(13, 0); g.story.side.st = { done: {} }; g.story.side.save(); });
const results = [];
let shotN = 0;
const live = async (ms = 90000) => { const t0 = Date.now(); let f0 = null; while (Date.now() - t0 < ms) { const f = await R(() => window.__r88.game.frameCount).catch(() => null); if (f !== null) { if (f0 === null) f0 = f; else if (f - f0 >= 6) return true; } await wait(400); } return false; };
const shot = async (name) => { await live(); await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}_${name}.png` }); };
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(ok ? 'PASS' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); };
const until = async (fn, ms = 20000, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await R(fn, arg)) return true; await wait(300); } return false; };
const job = () => R(() => { const s = window.__r88.game.story.side, j = s.job; return { id: j ? j.def.id : null, phase: j ? j.phase : null, cargo: s.cargo.slice(), done: { ...s.st.done }, obj: window.__r88.game.story.el.text.textContent, hint: document.getElementById('hint').textContent }; });
const where = (expr) => R((e) => { const g = window.__r88.game, S = g.story, J = S.side; const v = new Function('g', 'S', 'J', 'return ' + e)(g, S, J); return v ? { x: v.x, y: v.y, z: v.z } : null; }, expr);
const putWalker = (p, face) => R(([p, f]) => {
  const g = window.__r88.game, w = g.walker, y = g.valley.heightAt(p.x, p.z);
  if (!w.active) g.exitCar();
  const yaw = f ? Math.atan2(f.x - p.x, f.z - p.z) : w.yaw;
  w.enter(p.x, y + 0.03, p.z, yaw); g.rig.mode = 'foot'; g.rig.footYaw = yaw; g.rig.footPitch = 0.25; g.rig.footInit = false;
  if (g.driver.root && g.driver.root.parent !== g.gfx.scene) { g.driver.attach(g.gfx.scene, true); g.driver.root.visible = true; }
}, [p, face]).then(() => live(60000));
const key = async (k) => { await live(60000); await page.keyboard.press(k); await wait(150); };
const carTo = (x, z, yaw = 0, v = 0) => R(([x, z, y, v]) => { const g = window.__r88.game; if (g.walker.active) { g.walker.leave(); g.driver.attach(g.car.view.root, false); g.rig.mode = 'chase'; } window.__r88.tg(x, z, y, v); }, [x, z, yaw, v]).then(() => live(60000));
const parkCar = (x, z) => R(([x, z]) => { const g = window.__r88.game, s = g.car.sim; s.teleport([x, g.valley.heightAt(x, z) + 0.6, z], 0, 0); g.capture(g.car); g.capture(g.car); }, [x, z]);
const timeJump = async (year) => {
  for (let i = 0; i < 80; i++) { if ((await R(() => window.__r88.game.tc.state)) === 'off') break; await wait(500); }
  await R((y) => { const g = window.__r88.game; g.tc.setDestination({ ...g.tc.destination, year: y }); if (!g.tc.armed) g.toggleArm(); }, year);
  const z0 = await R(() => window.__r88.game.story.st.anchors.workshop.z - 900);
  await carTo(-900, z0, 0, 40.5);
  await R(() => window.__r88.keys('KeyW'));
  for (let i = 0; i < 40; i++) { await wait(500); if ((await R(() => window.__r88.game.tc.present.year)) === year) break; }
  await R(() => window.__r88.release());
  await R(() => { const s = window.__r88.game.car.sim; s.teleport([s.pos.x, s.pos.y + 0.05, s.pos.z], s.yaw(), 0); });
  await wait(2500);
  return R(() => window.__r88.game.tc.present.year);
};
const tap = (id) => R((id) => { const c = window.__r88.game.cockpit; c.app = 'jobs'; c.draw(); const b = c.buttons.find((x) => x.id === id); if (b) b.fn(); return !!b; }, id);
const board = async (name) => {
  const png = await R(() => { const c = window.__r88.game.cockpit; c.app = 'jobs'; c.draw(); return c.canvas.toDataURL('image/png'); });
  fs.writeFileSync(`${out}/${String(++shotN).padStart(2, '0')}_${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
};
const look = (p, dx, dy, dz, ly = 2) => R(([p, dx, dy, dz, ly]) => { const g = window.__r88.game, T = window.__r88.THREE, y = g.valley.heightAt(p.x, p.z); g.debugCam = () => ({ pos: new T.Vector3(p.x + dx, y + dy, p.z + dz), look: new T.Vector3(p.x, y + ly, p.z), fov: 55 }); }, [p, dx, dy, dz, ly]);
const unlook = () => R(() => { window.__r88.game.debugCam = null; });

await wait(2500);
const apps = await R(() => { const c = window.__r88.game.cockpit; c.app = 'jobs'; c.draw(); return c.buttons.map((b) => b.id); });
check('Jobs app on the tablet', apps.includes('app_jobs') && apps.filter((x) => x.startsWith('job_')).length === 7, apps.filter((x) => x.startsWith('job_') || x === 'app_jobs'));
await board('jobs_app_2026');
await until(() => window.__r88.game.story.side.markers.size >= 3, 8000);
const marks = await R(() => [...window.__r88.game.story.side.markers.entries()].map(([id, m]) => [id, m.obj.visible, Math.round(m.p.x), Math.round(m.p.z)]));
check('2026 start beams (capsule, tourist, police)', ['capsule', 'tourist', 'police'].every((id) => marks.some((m) => m[0] === id && m[1])), marks);
const cap = await where("S.side.markers.get('capsule').p");
await look(cap, 26, 9, 30, 6); await wait(2500); await shot('capsule_beam'); await unlook();

await putWalker({ x: cap.x + 2.4, z: cap.z + 1.4 }, cap); await wait(900);
check('walking up to a beam offers the job', (await R(() => window.__r88.game.interact.shown || '')).startsWith('Start job'), await R(() => window.__r88.game.interact.shown));
await key('KeyE'); await wait(800);
check('courier started from the beam, cargo spawned', (await until(() => { const j = window.__r88.game.story.side.job; return !!(j && j.phase === 'pick'); }, 6000)), await job());
const it = await where('J.job.item.body.translation()');
await putWalker({ x: it.x + 1.0, z: it.z + 0.3 }, it); await wait(900);
check('pick-up prompt for the time capsule', (await R(() => window.__r88.game.interact.shown || '')).startsWith('Pick up'), await R(() => window.__r88.game.interact.shown));
await key('KeyE'); await wait(800);
check('holding the parcel', await R(() => !!window.__r88.game.story.side.heldCargo()));
const w0 = await where('g.walker.pos');
await parkCar(w0.x + 6, w0.z + 6); await wait(1500);
const fr = await where('S.frontOfCar()');
await putWalker({ x: fr.x + 1.1, z: fr.z + 0.2 }, fr); await wait(900);
check('frunk prompt for side cargo', (await R(() => window.__r88.game.interact.shown || '')).includes('frunk'), await R(() => window.__r88.game.interact.shown));
await key('KeyE'); await wait(600);
check('parcel in the frunk, story frunk untouched', await R(() => { const S = window.__r88.game.story; return S.side.cargo.includes('parcel') && !S.st.frunk.includes('parcel'); }), await job());
await shot('courier_stowed');
const y1 = await timeJump(1885);
check('jumped to 1885 with the cargo', y1 === 1885 && (await job()).cargo.includes('parcel'), await job());
await until(() => window.__r88.game.story.side.goal.visible, 8000);
const to = await where("J.place(J.job.def, 'to')");
check('goal beam on the 1885 mesa', !!to, to);
await carTo(to.x + 18, to.z + 6, 0, 0); await wait(2000);
const fr2 = await where('S.frontOfCar()');
await putWalker({ x: fr2.x + 1.1, z: fr2.z + 0.2 }, fr2); await wait(900);
check('take-out prompt near the goal', (await R(() => window.__r88.game.interact.shown || '')).startsWith('Take parcel'), await R(() => window.__r88.game.interact.shown));
await key('KeyE'); await wait(700);
await putWalker({ x: to.x + 1.2, z: to.z + 0.5 }, to); await wait(1500);
check('time capsule delivered, count 1', await until(() => (window.__r88.game.story.side.st.done.capsule || 0) === 1 && !window.__r88.game.story.side.job, 6000), await job());
await shot('capsule_delivered');

const y2 = await timeJump(2026);
check('back in 2026', y2 === 2026, y2);
check('job started from the tablet', await tap('job_tourist') && (await job()).id === 'tourist', await job());
await board('jobs_app_active');
const at = await where('J.job.at');
await carTo(at.x + 9, at.z + 3, -Math.PI / 2, 0); await wait(1500);
check('passenger waiting', await until(() => { const j = window.__r88.game.story.side.job; return !!(j && j.phase === 'board' && j.fare && j.fare.a); }, 10000), await job());
const fa = await where('J.job.fare.a');
await carTo(fa.x + 4.5, fa.z + 1, -Math.PI / 2, 0); await wait(1200);
await shot('taxi_pickup');
check('passenger walks over and boards', await until(() => { const j = window.__r88.game.story.side.job; return !!(j && j.phase === 'drive'); }, 20000), await job());
const y3 = await timeJump(-66000000);
check('jumped to the Cretaceous with the passenger', y3 === -66000000, y3);
await until(() => window.__r88.game.story.side.goal.visible, 8000);
const lake = await where("J.place(J.job.def, 'to')");
await carTo(lake.x + 2, lake.z + 1, 0, 0); await wait(2500);
check('fare delivered at the lake, count 1', await until(() => (window.__r88.game.story.side.st.done.tourist || 0) === 1, 8000), await job());
await look(lake, 12, 4, 10, 1); await wait(2000); await shot('taxi_dropoff_cretaceous'); await unlook();

const y4 = await timeJump(2026);
check('back in 2026 for the chase', y4 === 2026, y4);
const pm = await where("S.side.markers.get('police').p");
await carTo(pm.x + 3, pm.z, Math.PI / 2, 0); await wait(600);
await key('KeyE'); await wait(600);
check('police chase started in the car (E at the beam)', (await job()).id === 'police', await job());
check('police car spawned', await until(() => { const j = window.__r88.game.story.side.job; return !!(j && j.chaser && j.chaser.a); }, 12000), await job());
const d0 = await R(() => { const j = window.__r88.game.story.side.job, c = j.chaser.a, p = window.__r88.game.car.sim.pos; return Math.hypot(c.x - p.x, c.z - p.z); });
await wait(3000);
const d1 = await R(() => { const j = window.__r88.game.story.side.job; if (!j || !j.chaser.a) return -1; const c = j.chaser.a, p = window.__r88.game.car.sim.pos; return Math.hypot(c.x - p.x, c.z - p.z); });
check('police close in', d1 >= 0 && d1 < d0, { d0: Math.round(d0), d1: Math.round(d1) });
const pc = await where('J.job.chaser.a');
if (pc) { await look(pc, 9, 3.5, 9, 1); await wait(1200); await shot('police_chase'); await unlook(); }
check('stand still and get pulled over (fail, count stays 0)', await until(() => !window.__r88.game.story.side.job, 20000) && !(await R(() => window.__r88.game.story.side.st.done.police)), await job());
await carTo(pm.x + 3, pm.z, Math.PI / 2, 0); await wait(600); await key('KeyE');
await until(() => { const j = window.__r88.game.story.side.job; return !!(j && j.chaser && j.chaser.a); }, 12000);
const cp = await where('g.car.sim.pos');
await carTo(cp.x + 700, cp.z, Math.PI / 2, 0);
check('lose the police, count 1', await until(() => (window.__r88.game.story.side.st.done.police || 0) === 1, 15000), await job());

const y5 = await timeJump(1885);
check('1885 for the sheriff', y5 === 1885, y5);
check('sheriff job from the tablet', await tap('job_sheriff') && (await job()).id === 'sheriff', await job());
const sm = await where('J.job.at');
await carTo(sm.x + 3, sm.z, Math.PI / 2, 0);
check('sheriff on horseback', await until(() => { const j = window.__r88.game.story.side.job; return !!(j && j.chaser && j.chaser.a && j.rider && j.rider.a); }, 12000), await job());
await wait(2500);
const hs = await where('J.job.chaser.a');
if (hs) { await look(hs, 7, 2.5, 7, 1.4); await wait(1200); await shot('sheriff_chase'); await unlook(); }
const sp = await where('g.car.sim.pos');
await carTo(sp.x - 600, sp.z, -Math.PI / 2, 0);
check('outrun the sheriff, count 1', await until(() => (window.__r88.game.story.side.st.done.sheriff || 0) === 1, 15000), await job());
await board('jobs_app_counts');
const sst = await R(() => { const S = window.__r88.game.story; return { step: S.st.step, frunk: S.st.frunk }; });
check('story untouched by the side jobs', ['0.drive', '0.meet'].includes(sst.step) && !sst.frunk.length, sst);
console.log('frames', JSON.stringify(await R(() => window.__r88.stats())));
console.log('errors', JSON.stringify([...new Set(errors)].slice(0, 10)));
check('no page errors', !errors.length);
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
await browser.close();
