// Roadster 88 on-foot checks: a filmed sequence (walk, run, jump, turn, stop) from a tracking side camera and from the player's camera, split into contact sheets, and a collider audit that lists visible objects the walker would pass through.
// usage: node web/tools/foot.mjs [film|audit|all] [--era=2026] [--q=medium] [--tag=name]
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const mode = args.find((a) => !a.startsWith('--')) || 'all';
const tag = opt('tag', '');
const out = path.resolve(here, '../../Niepotrzebne/shots-foot');
fs.mkdirSync(out, { recursive: true });
const exe = '/Users/jurek/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=960,620', '--window-position=3000,3000', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const film = mode === 'film' || mode === 'all';
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const page = await ctx.newPage();
const t0 = Date.now();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.goto(`http://localhost:8788/web/?debug&nomenu&q=${opt('q', 'medium')}&map=valley`, { waitUntil: 'load' });
try { await page.waitForFunction(() => window.__r88 && window.__r88.game.started, null, { timeout: 120000 }); }
catch (e) { console.log('BOOT FAILED', await page.evaluate(() => document.getElementById('ldText').textContent), errors.slice(0, 8).join('\n')); await page.screenshot({ path: `${out}/bootfail.png` }); await browser.close(); process.exit(1); }
const wait = (ms) => page.waitForTimeout(ms);
const R = (fn, a) => page.evaluate(fn, a);
const marks = [];
const mark = (name) => marks.push({ name, t: Date.now() / 1000 });
const era = opt('era', '');
if (era) await R((y) => { const g = window.__r88.game; g.tc.present.year = Number(y); g.applyEra(true); if (g.life) g.life.setEra(g.eraId()); }, era);

const spot = await R(() => {
  const g = window.__r88.game, v = g.valley, town = v && v.region && v.region('town');
  const c = town && town.center ? town.center : { x: -1040, z: 0 };
  const cx = Array.isArray(c) ? c[0] : c.x, cz = Array.isArray(c) ? c[1] : c.z;
  window.__r88.tg(cx, cz, 0, 0, 0.2); window.__r88.setTime(13, 0);
  return { x: cx, z: cz };
});
await wait(2500);
await R(() => window.__r88.tap('KeyF'));
await wait(1200);

if (film) {
  const shots = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', (f) => { shots.push({ t: f.metadata.timestamp, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 960, maxHeight: 540, everyNthFrame: 1 });
  const sunSide = await R(() => Math.sign(window.__r88.game.sky.sunDir.x) || 1);
  const side = (dist, h, ang, fov) => R(([d, hh, a, f]) => {
    const g = window.__r88.game, T = window.__r88.THREE;
    g.debugCam = () => { const w = g.walker.pose; return { pos: new T.Vector3(w.x + Math.cos(a) * d, w.y + hh, w.z + Math.sin(a) * d), look: new T.Vector3(w.x, w.y + 0.85, w.z), fov: f }; };
  }, [dist, h, ang, fov]);
  const yaw = (y) => R((y) => { window.__r88.game.rig.footYaw = y; }, y);
  const keys = (...k) => R((k) => window.__r88.keys(...k), k);
  const release = () => R(() => window.__r88.release());
  await side(4.2, 1.0, sunSide > 0 ? 0 : Math.PI, 38); await yaw(0); await wait(600);
  mark('idle'); await wait(1500);
  mark('walk_start'); await keys('KeyW'); await wait(2600);
  mark('walk_stop'); await release(); await wait(1400);
  mark('run_start'); await keys('KeyW', 'ShiftLeft'); await wait(2600);
  mark('run_stop'); await release(); await wait(1400);
  mark('jump'); await R(() => window.__r88.tap('Space')); await wait(1400);
  mark('run_jump'); await keys('KeyW', 'ShiftLeft'); await wait(800); await R(() => window.__r88.tap('Space')); await wait(1300); await release(); await wait(1000);
  mark('turn'); await keys('KeyA'); await wait(1600); await release(); await wait(400); await keys('KeyD'); await wait(1600); await release(); await wait(800);
  await side(5, 1.4, Math.PI / 2, 40); await yaw(Math.PI);
  mark('front_walk'); await keys('KeyW'); await wait(2200); await release(); await wait(800);
  await R(() => { window.__r88.game.debugCam = null; window.__r88.game.rig.footYaw = 0; window.__r88.game.rig.footPitch = 0.22; });
  mark('player_walk'); await keys('KeyW'); await wait(2400);
  mark('player_strafe'); await keys('KeyD'); await wait(1800);
  mark('player_back'); await keys('KeyS'); await wait(1800); await release(); await wait(600);
  mark('player_mouse'); for (let i = 0; i < 30; i++) { await R(() => { window.__r88.game.rig.mouse(14, 0, performance.now() / 1000); }); await wait(33); } await wait(800);
  mark('end');
  await cdp.send('Page.stopScreencast');
  fs.writeFileSync(path.join(out, `marks${tag}.json`), JSON.stringify(marks, null, 1));
  const frames = path.join(out, 'frames' + tag);
  fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames);
  const fps = 12, start = marks[0].t, end = marks[marks.length - 1].t;
  let j = 0, n = 0;
  for (let t = start; t < end; t += 1 / fps) {
    while (j < shots.length - 1 && shots[j + 1].t <= t) j++;
    fs.writeFileSync(path.join(frames, `f${String(++n).padStart(4, '0')}.jpg`), Buffer.from(shots[j].data, 'base64'));
  }
  for (const m of marks) m.t -= start;
  fs.writeFileSync(path.join(out, `marks${tag}.json`), JSON.stringify(marks, null, 1));
  execFileSync('/usr/local/bin/ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', path.join(out, `foot${tag}.mp4`)]);
  execFileSync('python3', [path.join(here, 'contact.py'), frames, path.join(out, `marks${tag}.json`), out, tag]);
  console.log('frames', shots.length, 'in', (end - start).toFixed(1), 's');
  console.log('film done', marks.map((m) => `${m.name}@${m.t.toFixed(1)}`).join(' '));
}

if (mode === 'act') {
  const shot = (n) => page.screenshot({ path: `${out}/act_${n}${tag}.png` });
  const keys = (...k) => R((k) => window.__r88.keys(...k), k);
  const release = () => R(() => window.__r88.release());
  const S = () => R(() => { const g = window.__r88.game, w = g.walker, A = g.driver.anim; return { held: !!g.interact.held, focus: g.interact.shown || null, mode: A && A.mode, dead: !!g.player.dead, walker: w.active, pos: [w.pos.x, w.pos.y, w.pos.z].map((v) => +v.toFixed(2)), cars: g.cars.length }; });
  await R(() => { window.__r88.game.rig.footYaw = window.__r88.game.walker.yaw; window.__r88.game.rig.footPitch = 0.3; });
  await R(() => { window.__r88.item('crate'); }); await wait(1200);
  console.log('near crate', JSON.stringify(await S())); await shot('prompt');
  await R(() => window.__r88.tap('KeyE')); await wait(1300);
  console.log('picked', JSON.stringify(await S()));
  await keys('KeyW'); await wait(1200); await shot('carry'); await release(); await wait(300);
  await R(() => window.__r88.click()); await wait(250); await shot('throw'); await wait(1200);
  console.log('thrown', JSON.stringify(await S()), await R(() => { const it = window.__r88.game.interact.items[0], t = it.body.translation(), w = window.__r88.game.walker.pos; return Math.hypot(t.x - w.x, t.z - w.z).toFixed(1) + ' m away'; }));
  await R(() => { const g = window.__r88.game, w = g.walker; w.enter(w.pos.x, w.pos.y + 32, w.pos.z, w.yaw); }); await wait(3400);
  console.log('after 32 m fall', JSON.stringify(await S())); await shot('fall_dead');
  await wait(3000); console.log('respawned', JSON.stringify(await S())); await shot('respawn');
  await R(() => { const g = window.__r88.game, w = g.walker, c = g.car, s = c.sim; const y = w.yaw; s.teleport([w.pos.x - Math.sin(y) * 9, w.pos.y + 0.4, w.pos.z - Math.cos(y) * 9], y, 22); });
  await wait(2600); console.log('after car hit', JSON.stringify(await S())); await shot('car_dead');
  await wait(4000); console.log('respawned 2', JSON.stringify(await S()));
  await R(() => window.__r88.kill('water')); await wait(1200); await shot('water_msg'); await wait(3500);
  console.log('after kill water', JSON.stringify(await S()));
}

if (mode === 'death') {
  const frames = [];
  const grab = async (n, ms, label) => { for (let i = 0; i < n; i++) { await wait(ms); frames.push({ label, buf: await page.screenshot({ clip: { x: 300, y: 40, width: 360, height: 460 } }) }); } };
  await R(() => { const g = window.__r88.game, T = window.__r88.THREE; g.debugCam = () => { const w = g.walker.pose; return { pos: new T.Vector3(w.x + 4.5, w.y + 1.6, w.z + 1.5), look: new T.Vector3(w.x, w.y + 0.6, w.z), fov: 42 }; }; });
  await R(() => { const g = window.__r88.game, w = g.walker, s = g.car.sim, y = w.yaw; s.teleport([w.pos.x - Math.sin(y) * 7, w.pos.y + 0.4, w.pos.z - Math.cos(y) * 7], y, 9); });
  await grab(10, 250, 'knock 9 m/s + get up');
  await wait(1500);
  await R(() => window.__r88.kill('fall'));
  await grab(10, 260, 'death');
  fs.writeFileSync(path.join(out, `death_frames${tag}.json`), JSON.stringify(frames.map((f) => f.label)));
  frames.forEach((f, i) => fs.writeFileSync(path.join(out, `d_${String(i).padStart(2, '0')}.png`), f.buf));
  execFileSync('python3', ['-c', `
import glob
from PIL import Image
fs=sorted(glob.glob('${out}/d_*.png'))
ims=[Image.open(f).resize((180,230)) for f in fs]
sheet=Image.new('RGB',(180*10,230*((len(ims)+9)//10)))
for i,im in enumerate(ims): sheet.paste(im,((i%10)*180,(i//10)*230))
sheet.save('${out}/sheet_death${tag}.png')
`]);
}

if (mode === 'audit' || mode === 'all') {
  const p = film ? await ctx.newPage() : page;
  if (film) { await p.goto(`http://localhost:8788/web/?debug&nomenu&q=low&map=valley`, { waitUntil: 'load' }); await p.waitForFunction(() => window.__r88 && window.__r88.game.started, null, { timeout: 120000 }); if (era) await p.evaluate((y) => { const g = window.__r88.game; g.tc.present.year = Number(y); g.applyEra(true); if (g.life) g.life.setEra(g.eraId()); }, era); await p.evaluate((s) => window.__r88.tg(s.x, s.z, 0, 0, 0.2), spot); await p.waitForTimeout(3000); }
  const res = await p.evaluate(async (s) => {
    const g = window.__r88.game, T = window.__r88.THREE, Rp = g.R, world = g.phys.world, v = g.valley;
    const W = 0x10, mask = 0x1 | 0x2 | 0x4 | 0x8 | 0x10, filt = (W << 16) | mask;
    const skip = new Set([g.car.view.root, g.driver.root]);
    const rc = new T.Raycaster(); rc.far = 12;
    const ray = new Rp.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const miss = new Map(), hitN = new Map();
    const nameOf = (o) => { let n = o, path = []; while (n && n !== g.gfx.scene) { if (n.name) path.push(n.name); n = n.parent; } return path.slice(0, 3).reverse().join('/') || o.type; };
    const targets = []; g.gfx.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && !o.isSprite) { let n = o, sk = false; while (n) { if (skip.has(n)) { sk = true; break; } n = n.parent; } if (!sk) targets.push(o); } });
    let rays = 0, solid = 0;
    for (let ix = -6; ix <= 6; ix++) for (let iz = -6; iz <= 6; iz++) {
      const x = s.x + ix * 22, z = s.z + iz * 22, gy = v.heightAt(x, z) + 1.0;
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
        rc.set(new T.Vector3(x, gy, z), new T.Vector3(dx, 0, dz));
        const hits = rc.intersectObjects(targets, false).filter((h) => h.point.y > v.heightAt(h.point.x, h.point.z) + 0.35);
        rays++;
        if (!hits.length) continue;
        const h = hits[0];
        ray.origin = { x, y: gy, z }; ray.dir = { x: dx, y: 0, z: dz };
        const r = world.castRay(ray, h.distance + 0.8, true, undefined, filt);
        const nm = nameOf(h.object);
        if (r) { solid++; hitN.set(nm, (hitN.get(nm) || 0) + 1); continue; }
        const e = miss.get(nm) || { n: 0, at: null }; e.n++; if (!e.at) e.at = [Math.round(h.point.x), Math.round(h.point.y), Math.round(h.point.z)]; miss.set(nm, e);
      }
      if (ix % 3 === 0 && iz === 6) await new Promise((r) => setTimeout(r, 0));
    }
    return { rays, solid, era: g.eraId(), miss: [...miss.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 40), solidBy: [...hitN.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15) };
  }, spot);
  console.log(`audit era ${res.era}: rays ${res.rays}, solid hits ${res.solid}`);
  console.log('PASS-THROUGH (visible, no collider):'); for (const [n, e] of res.miss) console.log(`  ${String(e.n).padStart(4)}  ${n}  e.g. at ${e.at}`);
  console.log('solid:'); for (const [n, c] of res.solidBy) console.log(`  ${String(c).padStart(4)}  ${n}`);
}
console.log('errors', JSON.stringify(errors.slice(0, 6)));
await browser.close();
