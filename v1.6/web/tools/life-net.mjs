// Roadster 88 life net test: two offline pages in one Chrome spawn the same seeded population for a period, page A leads and its pose export is pumped into page B (position error, payload size, export and import cost), a hit on B goes to A as an event, the lead moves to B, and a 'story' agent is checked for grounding.
// usage: node web/tools/life-net.mjs [--year=-68000000] [--q=medium] [--secs=12] [--extra=&nocity] [--out=dir]
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const out = opt('out', path.resolve(here, '../../Niepotrzebne/shots-net'));
const YEAR = Number(opt('year', -68000000)), SECS = Number(opt('secs', 12)), Q = opt('q', 'medium');
fs.mkdirSync(out, { recursive: true });
const exe = '/Users/jurek/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1000,700', '--window-position=3000,3000', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const url = `http://localhost:8788/web/?debug&q=${Q}&map=valley${opt('extra', '&nocity')}`;
const errors = [];
const open = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 620 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(tag + ' ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  const t1 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => { const r = window.__r88, g = r && r.game, el = document.getElementById('ldText'); return { ok: !!(g && g.started && g.life && g.life.ready), ld: el ? el.textContent : '' }; }).catch(() => ({ ok: false, ld: 'eval' }));
    if (s.ok) break;
    if (Date.now() - t1 > 300000) { console.log(tag, 'BOOT FAILED at', s.ld, errors.slice(0, 6).join(' / ')); await browser.close(); process.exit(1); }
    if (((Date.now() - t1) / 1000 | 0) % 30 < 2) console.log(tag, 'booting', ((Date.now() - t1) / 1000).toFixed(0) + 's', s.ld);
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(tag, 'started in', ((Date.now() - t1) / 1000).toFixed(0) + 's');
  return page;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const A = await open('A');
await A.evaluate(() => window.__r88.game.gfx.renderer.setAnimationLoop(null));
const B = await open('B');
await A.evaluate(() => { const g = window.__r88.game; g.gfx.renderer.setAnimationLoop(() => g.frame()); });
console.log(`boot ${(Date.now() - t0) / 1000}s`);

const goYear = (p, year) => p.evaluate(async (year) => {
  const g = window.__r88.game, tt = await import('/web/src/sim/timetravel.js');
  const span = tt.eraOf(year);
  Object.assign(g.tc.present, { ...span.date, year, minute: 0 }); g.applyClock(true);
  g.eras.apply(span.id, { instant: true, year });
  g.player.kill = () => {}; g.player.died = () => {};
  return span.id;
}, year);
const id = await goYear(A, YEAR); await goYear(B, YEAR);
const key = 'valley_' + id;
const seed = (p) => p.evaluate(async (key) => {
  const L = window.__r88.game.life;
  L.netLeader(false); L.seed(key);
  await L.setEra(window.__r88.game.eraId());
  for (let i = 0; i < 200 && !(L.ready && L.spawnSeed === key); i++) await new Promise((r) => setTimeout(r, 50));
  return [...L.netMap.values()].map((a) => [a.netId, a.kind, a.x, a.z]);
}, key);
const [sa, sb] = await Promise.all([seed(A), seed(B)]);
const mb = new Map(sb.map((e) => [e[0], e]));
let same = 0, kindBad = 0, missing = 0; const dd = [];
for (const e of sa) { const f = mb.get(e[0]); if (!f) { missing++; continue; } if (f[1] !== e[1]) kindBad++; else { same++; dd.push(Math.hypot(e[2] - f[2], e[3] - f[3])); } }
dd.sort((u, v) => u - v);
console.log(`spawn ${id}: A ${sa.length} ids, B ${sb.length} ids, matched ${same}, kind mismatch ${kindBad}, missing ${missing}, pos diff median ${(dd[dd.length >> 1] || 0).toFixed(2)} m, p95 ${(dd[Math.floor(dd.length * 0.95)] || 0).toFixed(2)} m, max ${(dd[dd.length - 1] || 0).toFixed(2)} m`);

const herd = await A.evaluate(() => {
  const L = window.__r88.game.life, g = L.groups.filter((q) => q.brain === 'grazer' && q.members.length).sort((u, v) => v.members.length * v.members[0].K.size - u.members.length * u.members[0].K.size)[0];
  return g ? [g.cx, g.cz, g.kind, g.members.length] : null;
});
console.log('herd', JSON.stringify(herd));
if (herd) {
  await A.evaluate((h) => { const r = window.__r88, x = h[0] - 140, z = h[1]; r.tg(x, z, Math.atan2(h[0] - x, h[1] - z), 22); r.keys('KeyW'); }, herd);
  await B.evaluate((h) => { const r = window.__r88, x = h[0] + 30, z = h[1] + 30; r.tg(x, z, Math.atan2(h[0] - x, h[1] - z), 0); }, herd);
}
await A.evaluate(() => window.__r88.game.life.netLeader(true));

const pump = async (from, to, secs, label) => {
  const errs = [], lag = [], sizes = [], exp = [], imp = [], sims = [], hist = new Map();
  const n = Math.round(secs * 5);
  const at = (id, t) => { const h = hist.get(id); if (!h || h.length < 2 || t < h[0][0]) return null; for (let i = h.length - 1; i > 0; i--) if (h[i - 1][0] <= t) { const a = h[i - 1], b = h[i], k = Math.min(1, (t - a[0]) / Math.max(1e-3, b[0] - a[0])); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; } return null; };
  for (let i = 0; i < n; i++) {
    const r = await from.evaluate(() => { const L = window.__r88.game.life, t = performance.now(), e = L.netExport(60); return { e, ms: performance.now() - t, pos: e.map((x) => { const a = L.netMap.get(x[0]); return [x[0], a.x, a.z]; }) }; });
    const ta = Date.now() / 1000;
    for (const p of r.pos) { const h = hist.get(p[0]) || []; h.push([ta, p[1], p[2]]); if (h.length > 12) h.shift(); hist.set(p[0], h); }
    sizes.push(JSON.stringify(r.e).length); exp.push(r.ms);
    const s = await to.evaluate((e) => { const L = window.__r88.game.life, t = performance.now(); L.netImport(e); const ms = performance.now() - t; return { ms, sim: L.stats.sim }; }, r.e);
    imp.push(s.ms); sims.push(s.sim);
    await wait(100);
    const tb = Date.now() / 1000;
    const here = await to.evaluate((ids) => ids.map((id) => { const a = window.__r88.game.life.netMap.get(id); return a && a.net ? [a.x, a.z] : null; }), r.pos.map((p) => p[0]));
    if (i > 8) r.pos.forEach((p, k) => { const h = here[k]; if (!h) return; const q0 = at(p[0], tb - 0.3); if (q0) errs.push(Math.hypot(q0[0] - h[0], q0[1] - h[1])); const q1 = at(p[0], tb); if (q1) lag.push(Math.hypot(q1[0] - h[0], q1[1] - h[1])); });
    await wait(100);
  }
  const srt = (a) => a.sort((u, v) => u - v), md = (a) => (a[a.length >> 1] || 0).toFixed(2), p95 = (a) => (a[Math.floor(a.length * 0.95)] || 0).toFixed(2);
  srt(errs); srt(lag); srt(sims);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  console.log(`${label}: msgs ${n}, bytes/msg avg ${avg(sizes).toFixed(0)} max ${Math.max(...sizes)}, export ${avg(exp).toFixed(3)} ms, import ${avg(imp).toFixed(3)} ms, follower life sim p50 ${md(sims)} ms p95 ${p95(sims)} ms`);
  console.log(`  follower vs leader 0.3 s earlier: median ${md(errs)} m, p95 ${p95(errs)} m (n ${errs.length}); vs leader now: median ${md(lag)} m, p95 ${p95(lag)} m`);
};
await pump(A, B, SECS, 'A->B');
console.log('B debug', JSON.stringify(await B.evaluate(() => window.__r88.game.life.debug().net)));
console.log('A debug', JSON.stringify(await A.evaluate(() => window.__r88.game.life.debug().net)));
await A.evaluate(() => window.__r88.release());
await B.screenshot({ path: `${out}/B_follower.png` });
await A.screenshot({ path: `${out}/A_leader.png` });

const hit = await B.evaluate(() => {
  const L = window.__r88.game.life, S = L.sense;
  const a = L.agents.filter((q) => q.net && !q.down && q.K && q.brain === 'grazer').sort((u, v) => Math.hypot(u.x - S.x, u.z - S.z) - Math.hypot(v.x - S.x, v.z - S.z))[0];
  if (!a) return null;
  L.knock(a, { dv: 9, vx: 6, vy: 2, vz: 3 });
  return { netId: a.netId, kind: a.kind, body: !!a.body, events: L.netEvents() };
});
console.log('B hit', JSON.stringify(hit));
if (hit && hit.events.length) {
  const ok = await A.evaluate((ev) => ev.map((e) => window.__r88.game.life.netHit(e[0], [e[1], e[2], e[3]])), hit.events);
  console.log('A netHit ->', JSON.stringify(ok));
  const seen = [];
  for (let i = 0; i < 30; i++) {
    const e = await A.evaluate(() => window.__r88.game.life.netExport(60));
    await B.evaluate((e) => window.__r88.game.life.netImport(e), e);
    if (i % 3 === 0) {
      const sa2 = e.find((x) => x[0] === hit.netId);
      const sb2 = await B.evaluate((id) => { const a = window.__r88.game.life.netMap.get(id); return a ? { down: a.down ? a.down.phase : null, hold: !!(a.net && a.net.hold), clip: a.clip, net: !!a.net } : null; }, hit.netId);
      seen.push(`t${(i * 0.2).toFixed(1)} A:${sa2 ? sa2[7] : '-'} B:${JSON.stringify(sb2)}`);
    }
    await wait(200);
  }
  console.log('hit replay\n  ' + seen.join('\n  '));
}

await A.evaluate(() => window.__r88.game.life.netLeader(false));
const sw = await B.evaluate(() => { const L = window.__r88.game.life; let before = 0; for (const a of L.agents) if (a.net) before++; L.netLeader(true); let after = 0; for (const a of L.agents) if (a.net) after++; return { before, after }; });
console.log('lead -> B, imported before/after', JSON.stringify(sw));
await pump(B, A, 4, 'B->A');

const story = await B.evaluate(async () => {
  const g = window.__r88.game, L = g.life, mod = await import('/web/src/life/agents.js');
  const K = await L.kind('human_m2026');
  const S = L.sense, x = S.x + 6, z = S.z + 6;
  const a = new mod.Agent('human_m2026', { x, z, brain: 'story' });
  a.K = K; a.y = 50; L.agents.push(a);
  a.tx = x + 10; a.tz = z; a.want = 1.3;
  await new Promise((r) => setTimeout(r, 1500));
  const exp = L.netExport(200).some((e) => e[0] === a.netId);
  const res = { dy: +(a.y - g.valley.heightAt(a.x, a.z)).toFixed(3), moved: +Math.hypot(a.x - x, a.z - z).toFixed(2), clip: a.clip, exported: exp, netId: a.netId === undefined ? 'none' : a.netId };
  L.agents.splice(L.agents.indexOf(a), 1);
  return res;
});
console.log('story agent', JSON.stringify(story));
console.log(errors.length ? 'ERRORS\n' + errors.slice(0, 20).join('\n') : 'no page errors');
await browser.close();
