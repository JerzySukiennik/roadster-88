// Roadster 88 crash test: launches the car at era buildings, poles and trees at set speeds on a clear run-up and reports whether the target broke, the car's speed trace, its worst crush depth and debris, with screenshots right after impact.
// usage: node web/tools/crash.mjs [--cases=1885:falseFront:40,1885:cabin:44,1885:telegraphPole:24,2026:ranch:30,1885:t-oak:30,1885:t-cactus:20] [--out=dir] (t-<species> aims at a tree; needs the dev server on 8788)
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const out = opt('out', path.resolve(here, '../../Niepotrzebne/shots-web/crash'));
fs.mkdirSync(out, { recursive: true });
const cases = opt('cases', '1885:falseFront:40,1885:cabin:44,1885:telegraphPole:24,2026:ranch:30,1885:t-oak:30,1885:t-cactus:20').split(',');
const exe = '/Users/jurek/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required', '--window-position=3000,3000'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.goto('http://localhost:8788/web/?debug&q=high&map=valley', { waitUntil: 'load' });
await page.waitForFunction(() => window.__r88 && window.__r88.game.started, null, { timeout: 120000 });
const R = (fn, a) => page.evaluate(fn, a);
const wait = (ms) => page.waitForTimeout(ms);
const setEra = (id) => R(async (id) => { const g = window.__r88.game; const E = { hadean: 0, dino: 1, 1885: 2, 2026: 3, 2080: 4, ruins: 5, scifi: 6 }[id]; const tt = await import('/web/src/sim/timetravel.js'); const d = tt.ERAS[E].date; Object.assign(g.tc.present, { year: d.year, month: d.month, day: d.day, hour: 14, minute: 0 }); g.eras.apply(id, { instant: true }); g.applyClock(true); g.sky.envDirty = true; }, id);

let era = null, fails = 0;
for (const cs of cases) {
  const [e, type, v] = cs.split(':'), sp = Number(v);
  if (e !== era) { await setEra(e); era = e; await wait(2500); }
  await R(() => window.__r88.respawn()); await wait(500);
  const pick = await R(([type]) => {
    const g = window.__r88.game, S = g.eras.structures, V = g.valley, car = g.car.sim.pos;
    if (type.startsWith('t-')) {
      const spn = type.slice(2); let best = null, bd = 1e9;
      for (const pool of g.eras.scatter.pools) { if (pool.plan.sp !== spn) continue; for (const [, tile] of pool.tiles) for (const it of tile.list) { if (it.s < 0.75 || it.s > 1.25) continue; let clear = true; for (let d = 6; d <= 24 && clear; d += 3) if (S.overlaps(it.x - d, V.heightAt(it.x - d, it.z) + 1, it.z, 1.5)) clear = false; const dd = Math.hypot(it.x - car.x, it.z - car.z); if (clear && dd < bd) { bd = dd; best = it; } } }
      if (!best) return null;
      const x = best.x - 24, z = best.z;
      return { key: best.key, p: [x, V.heightAt(x, z) + 0.2, z, Math.PI / 2] };
    }
    for (const [key, m] of S.cur.meta) {
      if (m.site.type !== type || m.site.destroyed || !(m.eb > 0)) continue;
      const s = m.site, pole = type.includes('Pole'), D = pole ? 16 : 22, near = pole ? 3 : Math.max(6, (m.info.foot ? m.info.foot[1] : 5) + 2.5), h0 = V.heightAt(s.x, s.z);
      for (const a of pole ? [0, Math.PI / 2, -Math.PI / 2, Math.PI] : [0]) {
        const fx = Math.sin((s.yaw || 0) + a), fz = Math.cos((s.yaw || 0) + a);
        let clear = true;
        for (let d = near; d <= D && clear; d += 2) { const x = s.x + fx * d, z = s.z + fz * d, h = V.heightAt(x, z); if (Math.abs(h - h0) > 1.2 || S.overlaps(x, h + 1, z, 1.2)) clear = false; }
        if (!clear) continue;
        const x = s.x + fx * D, z = s.z + fz * D;
        return { key, p: [x, V.heightAt(x, z) + 0.15, z, Math.atan2(-fx, -fz)], vb: +Math.sqrt(2 * m.eb / g.car.sim.mass).toFixed(1) };
      }
    }
    return null;
  }, [type]);
  if (!pick) { console.log(cs.padEnd(24), 'no clear target'); fails++; continue; }
  await R((a) => { window.__r88.teleport(...a); window.__r88.orbit(0.9, 0.15); }, [...pick.p, sp]);
  const track = []; let hitAt = null;
  for (let i = 0; i < 30; i++) {
    await wait(60);
    const st = await R(() => { const g = window.__r88.game, L = g.car.lattice; let mx = 0; for (let i = 0; i < L.n; i++) mx = Math.max(mx, Math.hypot(L.x[i * 3] - L.rest[i * 3], L.x[i * 3 + 1] - L.rest[i * 3 + 1], L.x[i * 3 + 2] - L.rest[i * 3 + 2])); return { v: g.car.sim.speed, crush: mx, debris: g.eras.structures.debris.length }; });
    track.push(st);
    if (hitAt === null && (st.crush > 0.2 || st.v < sp * 0.8)) hitAt = i;
    if (hitAt !== null && i - hitAt === 2) await page.screenshot({ path: `${out}/${e}_${type}_${sp}.png` });
  }
  const state = await R(([k, e]) => window.__r88.game.eras.worldState.status(k, e).state, [pick.key, e]);
  const minV = Math.min(...track.map((t) => t.v)), crush = Math.max(...track.map((t) => t.crush));
  if (hitAt === null) fails++;
  console.log(`${cs.padEnd(24)} break=${pick.vb ?? '-'} m/s  ${state.padEnd(9)} v: ${track.filter((_, i) => i % 3 === 0).map((t) => t.v.toFixed(0)).join(' ')}  min=${minV.toFixed(1)} crush=${crush.toFixed(2)}m debris=${Math.max(...track.map((t) => t.debris))}${hitAt === null ? '  (no hit)' : ''}`);
}
console.log('page errors', errors.length, errors.slice(0, 4).join(' || '));
await browser.close();
process.exit(errors.length || fails ? 1 : 0);
