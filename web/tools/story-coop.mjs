// Roadster 88 co-op story test: two browsers in one room; A (first in, the leader) runs the story and B mirrors it and plays. Chapter 0: B talks to Ida and picks the answer, carries the canister to its own frunk, rides along in A's Roadster to 1885 and back, then rides as A's taxi fare to the Cretaceous. Chapter 2: B hacks the Kessler terminal while A lures the drones away with a fast car, B opens the vault, escapes the swarm and gives Nova the book. Both must agree on step, objective, flags, frunk and dialogue, and the leader must never change, with screenshots from both.
// usage: node web/tools/story-coop.mjs [--port=8788] [--chapter=0|2]
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const out = path.resolve(here, '../../Niepotrzebne/shots-coop');
fs.mkdirSync(out, { recursive: true });
const CH = opt('chapter', '0');
for (const f of fs.readdirSync(out)) if (f.includes(`_c${CH}_`) && f.endsWith('.png')) fs.rmSync(path.join(out, f));
const exe = '/Users/jurek/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1000,640', '--window-position=3000,3000', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required'] });
const url = `http://localhost:${opt('port', '8788')}/web/?debug&nomenu&q=low&map=valley&story=reset`;
const open = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 560 } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(tag + ' ' + m.text().slice(0, 200)); });
  await page.goto(url, { waitUntil: 'load' });
  const t1 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => { const r = window.__r88, g = r && r.game, el = document.getElementById('ldText'); return { ok: !!(g && g.started && g.story), ld: el ? el.textContent : '' }; }).catch(() => ({ ok: false, ld: 'eval' }));
    if (s.ok) break;
    if (Date.now() - t1 > 300000) { console.log(tag, 'BOOT FAILED at', s.ld, errors.slice(0, 6).join(' / ')); await browser.close(); process.exit(1); }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(tag, 'started in', ((Date.now() - t1) / 1000).toFixed(0) + 's');
  return { page, errors, tag };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(ok ? 'PASS' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); };
const A = await open('A');
await A.page.evaluate(() => window.__r88.game.gfx.renderer.setAnimationLoop(null));
const B = await open('B');
await A.page.evaluate(() => { const g = window.__r88.game; g.gfx.renderer.setAnimationLoop(() => g.frame()); });
const R = (P, fn, a) => P.page.evaluate(fn, a);
const st = (P) => R(P, () => { const g = window.__r88.game, S = g.story; return { mode: S.coop.mode, step: S.st.step, obj: S.el.text.textContent, frunk: S.st.frunk.slice(), tl: S.st.flags.timeline, dlg: S.dlgOpen ? S.dlgOpen.L.v : null, year: g.tc.present.year, remotes: g.online.remotes.size }; });
const until = async (P, fn, ms = 20000, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await R(P, fn, arg)) return true; await wait(300); } return false; };
const shot = async (P, n) => P.page.screenshot({ path: `${out}/${P.tag}_c${CH}_${n}.png` });
const put = (P, p, face) => R(P, ([p, f]) => {
  const g = window.__r88.game, w = g.walker, y = g.valley.heightAt(p.x, p.z);
  if (!w.active) g.exitCar();
  const yaw = f ? Math.atan2(f.x - p.x, f.z - p.z) : w.yaw;
  w.enter(p.x, y + 0.03, p.z, yaw); g.rig.mode = 'foot'; g.rig.footYaw = yaw; g.rig.footPitch = 0.25; g.rig.footInit = false;
  if (g.driver.root && g.driver.root.parent !== g.gfx.scene) { g.driver.attach(g.gfx.scene, true); g.driver.root.visible = true; }
}, [p, face]);
const key = async (P, k) => { await P.page.keyboard.press(k); await wait(150); };
for (let i = 0; i < 60; i++) { const [a, b] = await Promise.all([st(A), st(B)]); if (a.remotes && b.remotes && a.mode === 'lead' && b.mode === 'follow') break; await wait(500); }
const s0 = await Promise.all([st(A), st(B)]);
check('A leads, B follows', s0[0].mode === 'lead' && s0[1].mode === 'follow', s0.map((s) => s.mode));
const watch = (P) => R(P, () => { const C = window.__r88.game.story.coop; C.flips = []; let m = C.mode; setInterval(() => { if (C.mode !== m) { C.flips.push(m + '>' + C.mode); m = C.mode; } }, 100); });
await watch(A); await watch(B);

const ride = async () => {
  await R(A, () => { const g = window.__r88.game; if (g.walker.active) { g.walker.leave(); g.driver.attach(g.car.view.root, false); g.rig.mode = 'chase'; } });
  for (let i = 0; i < 3; i++) {
    await wait(1500);
    const ar = await R(B, () => { const r = [...window.__r88.game.online.remotes.values()][0]; return { x: r.pos.x, z: r.pos.z, lx: r.left.x, lz: r.left.z }; });
    await put(B, { x: ar.x - ar.lx * 2.2, z: ar.z - ar.lz * 2.2 }, ar); await wait(800); await key(B, 'KeyF');
    if (await until(B, () => !!window.__r88.game.ride, 8000)) return true;
  }
  return false;
};
const jumpA = async (year) => {
  await until(A, () => window.__r88.game.tc.state === 'off', 30000);
  await R(A, (y) => { const g = window.__r88.game; g.tc.setDestination({ ...g.tc.destination, year: y }); if (!g.tc.armed) g.toggleArm(); window.__r88.tg(-900, g.story.st.anchors.workshop.z - 900, 0, 40.5); window.__r88.keys('KeyW'); }, year);
  const ok = await until(A, (y) => window.__r88.game.tc.present.year === y, 30000, year) && await until(B, (y) => window.__r88.game.tc.present.year === y, 30000, year);
  await R(A, () => window.__r88.release());
  return ok;
};
const dialogByB = async (stop, pick = 1, ms = 120000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await R(A, (s) => window.__r88.game.story.st.step === s, stop)) return true;
    const d = await R(B, () => { const S = window.__r88.game.story, D = S.dlgOpen; return D ? { full: D.shown >= D.full.length, ch: !!D.L.choices } : null; });
    if (d && d.full) await key(B, d.ch ? 'Digit' + pick : 'KeyE');
    await wait(400);
  }
  return false;
};
const both = async (id, ms = 15000) => (await until(A, (s) => window.__r88.game.story.st.step === s, ms, id)) && (await until(B, (s) => window.__r88.game.story.st.step === s, ms, id));
if (CH === '0') {
  const door = await R(A, () => { const s = window.__r88.game.story.props.sets.get('ws_normal').spots.door; return { x: s.x, z: s.z }; });
  await R(A, (d) => window.__r88.tg(d.x + 12, d.z + 4, -Math.PI / 2, 0), door);
  await R(B, (d) => window.__r88.tg(d.x + 14, d.z - 6, -Math.PI / 2, 0), door);
  await until(A, () => window.__r88.game.story.st.step === '0.meet', 10000);
  await until(B, () => window.__r88.game.story.st.step === '0.meet', 10000);
  const s1 = await Promise.all([st(A), st(B)]);
  check('B mirrors step and objective', s1[1].step === s1[0].step && s1[1].obj === s1[0].obj, { A: s1[0].step + ' / ' + s1[0].obj, B: s1[1].step + ' / ' + s1[1].obj });
  const ida = await R(B, () => { const p = window.__r88.game.story.npc.pos('ida'); return p && { x: p.x, z: p.z }; });
  check('B sees Ida', !!ida, ida);
  await put(B, { x: ida.x + 1.7, z: ida.z + 0.4 }, ida); await wait(900);
  check('B gets the talk prompt', (await R(B, () => window.__r88.game.interact.shown || '')).startsWith('Talk'), await R(B, () => window.__r88.game.interact.shown));
  await key(B, 'KeyE');
  check('dialogue opens on both', await until(A, () => !!window.__r88.game.story.dlgOpen, 12000) && await until(B, () => !!window.__r88.game.story.dlgOpen, 12000));
  await wait(1200); await shot(B, 'ida_dialog_B'); await shot(A, 'ida_dialog_A');
  check('B hears the line too', await R(B, () => { const D = window.__r88.game.story.dlgOpen; return !!(D && (D.vh || window.__r88.game.story.voice.speaking)); }));
  for (let i = 0; i < 80; i++) {
    const d = await R(B, () => { const S = window.__r88.game.story, D = S.dlgOpen; return D ? { full: D.shown >= D.full.length, ch: !!D.L.choices } : null; });
    const a = await R(A, () => !!window.__r88.game.story.dlgOpen);
    if (!a && !d) break;
    if (d && d.full) await key(B, d.ch ? 'Digit2' : 'KeyE');
    await wait(400);
  }
  check('dialogue finished by B, step moves on', await until(A, () => window.__r88.game.story.st.step === '0.canister', 15000), await R(A, () => window.__r88.game.story.st.step));
  check('B picked answer 2 (Famous last words)', await R(A, () => window.__r88.game.story.st.flags.met === true));
  await wait(1500);
  const can = await R(B, () => { const m = [...window.__r88.game.story.coop.mirror.items.values()][0]; if (!m) return null; const t = m.it.body.translation(); return { x: t.x, z: t.z }; });
  check('B sees the canister', !!can, can);
  await put(B, { x: can.x + 1.1, z: can.z + 0.3 }, can); await wait(900);
  check('B gets the pick-up prompt', (await R(B, () => window.__r88.game.interact.shown || '')).startsWith('Pick up'), await R(B, () => window.__r88.game.interact.shown));
  await key(B, 'KeyE');
  check('B is holding the canister', await until(B, () => !!window.__r88.game.story.heldItem(), 12000));
  check('A sees B holding it', await until(A, () => window.__r88.game.story.holding('canister'), 12000));
  await shot(B, 'carry_B'); await shot(A, 'carry_A');
  const fr = await R(B, () => { const f = window.__r88.game.story.frontOfCar(); return { x: f.x, z: f.z }; });
  await put(B, { x: fr.x + 1.2, z: fr.z }, fr); await wait(900);
  check('B gets the frunk prompt', (await R(B, () => window.__r88.game.interact.shown || '')).includes('frunk'), await R(B, () => window.__r88.game.interact.shown));
  await key(B, 'KeyE');
  check('canister in the shared frunk, step 0.jump', await until(A, () => window.__r88.game.story.st.step === '0.jump', 8000), await st(A));
  await until(B, () => window.__r88.game.story.st.step === '0.jump', 12000);
  const s2 = await Promise.all([st(A), st(B)]);
  check('both agree after the canister', s2[0].step === s2[1].step && JSON.stringify(s2[0].frunk) === JSON.stringify(s2[1].frunk), s2);
  const ac = await R(A, () => { const s = window.__r88.game.car.sim.pos; return { x: s.x, z: s.z }; });
  await R(A, () => { const g = window.__r88.game; if (g.walker.active) { g.walker.leave(); g.driver.attach(g.car.view.root, false); g.rig.mode = 'chase'; } });
  const ar = await R(B, () => { const r = [...window.__r88.game.online.remotes.values()][0]; return { x: r.pos.x, z: r.pos.z, lx: r.left.x, lz: r.left.z }; });
  await put(B, { x: ar.x - ar.lx * 2.2, z: ar.z - ar.lz * 2.2 }, ar); await wait(800); await key(B, 'KeyF');
  check('B rides with A', await until(B, () => !!window.__r88.game.ride, 12000));
  await R(A, () => { const g = window.__r88.game; g.tc.setDestination({ ...g.tc.destination, year: 1885 }); if (!g.tc.armed) g.toggleArm(); window.__r88.tg(-900, g.story.st.anchors.workshop.z - 900, 0, 40.5); window.__r88.keys('KeyW'); });
  check('both in 1885', await until(A, () => window.__r88.game.tc.present.year === 1885, 30000) && await until(B, () => window.__r88.game.tc.present.year === 1885, 30000));
  await R(A, () => window.__r88.release());
  check('0.lost on both', await until(B, () => window.__r88.game.story.st.step === '0.lost', 15000), await st(B));
  await until(A, () => window.__r88.game.story.st.flags.clang, 20000);
  await wait(2500); await shot(B, 'radio_1885_B');
  check('B hears Ida on the radio', await R(B, () => !!window.__r88.game.story.radioCur || window.__r88.game.story.voice.speaking));
  await until(A, () => window.__r88.game.tc.state === 'off', 20000);
  await R(A, () => { const g = window.__r88.game; if (!g.tc.armed) g.toggleArm(); window.__r88.tg(-900, g.story.st.anchors.workshop.z - 900, 0, 40.5); window.__r88.keys('KeyW'); });
  check('both back in 2026', await until(A, () => window.__r88.game.tc.present.year === 2026, 30000) && await until(B, () => window.__r88.game.tc.present.year === 2026, 30000));
  await R(A, () => window.__r88.release());
  check('the Kessler present on both', await until(B, () => window.__r88.game.story.st.flags.timeline === 'kessler', 15000), await st(B));
  await wait(2500); await shot(B, 'kessler_B');
  const s3 = await Promise.all([st(A), st(B)]);
  check('both agree at the end', s3[0].step === s3[1].step && s3[0].tl === s3[1].tl, s3);
  await R(A, () => { const J = window.__r88.game.story.side; J.st = { done: {} }; J.save(); });
  check('B still riding with A', await R(B, () => !!window.__r88.game.ride) || await ride());
  check('A starts the Dino Tour taxi job from the tablet', await R(A, () => { const c = window.__r88.game.cockpit; c.app = 'jobs'; c.draw(); const b = c.buttons.find((x) => x.id === 'job_tourist'); if (b) b.fn(); const j = window.__r88.game.story.side.job; return !!(j && j.def.id === 'tourist'); }));
  const pick = await R(A, () => { const j = window.__r88.game.story.side.job; return { x: j.at.x, z: j.at.z }; });
  await R(A, (p) => window.__r88.tg(p.x + 8, p.z + 3, -Math.PI / 2, 0), pick);
  check('the friend in the passenger seat is the fare', await until(A, () => { const j = window.__r88.game.story.side.job; return j && j.phase === 'drive' && !!j.friend; }, 12000), await R(A, () => { const j = window.__r88.game.story.side.job; return j && { phase: j.phase, friend: j.friend }; }));
  check('taxi to the Cretaceous, both there', await jumpA(-66000000));
  await wait(2500);
  const lake = await R(A, () => { const J = window.__r88.game.story.side, p = J.place(J.job.def, 'to'); return p && { x: p.x, z: p.z }; });
  await R(A, (p) => window.__r88.tg(p.x + 1.5, p.z + 1, 0, 0), lake);
  check('no stale radio on B', await R(B, () => { const S = window.__r88.game.story; return !S.el.radio.classList.contains('on') || !!S.radioCur; }));
  check('fare delivered with the friend aboard', await until(A, () => (window.__r88.game.story.side.st.done.tourist || 0) === 1, 15000), await R(A, () => window.__r88.game.story.side.st.done));
  await wait(1500); await shot(B, 'taxi_cretaceous_B'); await shot(A, 'taxi_cretaceous_A');
}
if (CH === '2') {
  await R(A, () => { const S = window.__r88.game.story; Object.assign(S.st.flags, { timeline: 'normal', met: true, inPast: true, clang: true, goneRead: true, plaque: true, guide: true, helped: true, kesslerTalked: true, traded: true, idaBack: true, benched: true, ch1: true }); S.save(); window.__r88.story.goto('2.start'); });
  check('2.start on both', await both('2.start'), await Promise.all([st(A), st(B)]));
  check('B advances Ida and the radio advert', await dialogByB('2.jump'), await st(A));
  await R(B, () => { const S = window.__r88.game.story; window.__rl = []; const r = S.radio.bind(S); S.radio = (a, b, c) => { window.__rl.push(typeof a === 'object' ? a.v : a); return r(a, b, c); }; });
  check('B rides with A', await ride());
  check('both in 2080', await jumpA(2080));
  check('2.city on both', await both('2.city', 20000), await Promise.all([st(A), st(B)]));
  await wait(9000);
  const hb = await R(B, () => window.__rl.slice()), ob = await R(B, () => window.__r88.game.story.el.text.textContent);
  check('B hears the arrival radio and gets the city objective', hb.includes('c2_arrive_r1') && hb.includes('c2_nova_r0') && ob.includes('Gzowo City'), { hb, ob });
  check('no drones-everywhere thought in the small town (B)', !hb.includes('c2_city_t'), hb);
  await wait(2500); await shot(B, 'city_2080_B');
  const nova = await R(A, () => { const S = window.__r88.game.story, p = S.npc.pos('nova') || S.st.anchors.nova; return { x: p.x, z: p.z }; });
  await R(A, (p) => window.__r88.tg(p.x + 14, p.z + 4, -Math.PI / 2, 0), nova);
  check('2.nova on both', await both('2.nova', 20000), await Promise.all([st(A), st(B)]));
  check('B hears the thought once, inside the city', await until(B, () => window.__rl.filter((x) => x === 'c2_city_t').length === 1, 12000), await R(B, () => window.__rl.slice()));
  await R(B, () => { const g = window.__r88.game; if (g.ride) g.exitRide(); }); await wait(1200);
  const nb = await R(B, () => { const p = window.__r88.game.story.npc.pos('nova'); return p && { x: p.x, z: p.z }; });
  check('B sees Nova', !!nb, nb);
  await put(B, { x: nb.x + 1.7, z: nb.z + 0.4 }, nb); await wait(900);
  check('B gets the Nova prompt', (await R(B, () => window.__r88.game.interact.shown || '')).startsWith('Talk'), await R(B, () => window.__r88.game.interact.shown));
  await key(B, 'KeyE');
  check('B talks to Nova, 2.hack on both', await dialogByB('2.hack', 1) && await both('2.hack'), await Promise.all([st(A), st(B)]));
  const term = await R(B, () => { const s = window.__r88.game.story.props.sets.get('k_tower'); return s && { x: s.spots.terminal.x, z: s.spots.terminal.z }; });
  check('B has the Kessler tower', !!term, term);
  await put(B, { x: term.x + Math.cos(Math.PI / 2) * 1.1, z: term.z + Math.sin(Math.PI / 2) * 1.1 }, term); await wait(900);
  check('B gets the hack prompt', (await R(B, () => window.__r88.game.interact.shown || '')).includes('hack'), await R(B, () => window.__r88.game.interact.shown));
  await B.page.keyboard.down('KeyE');
  let lured = false;
  for (let i = 0; i < 90; i++) {
    await R(A, (k) => { const g = window.__r88.game, D = g.story.drones.list, d = D[k % D.length]; window.__r88.tg(d.pos.x + 18, d.pos.z + 6, Math.PI / 2 + k * 0.3, 22); }, i);
    if (!lured) lured = await R(A, () => window.__r88.game.story.drones.list.some((d) => d.mode === 'chase' && d.lure));
    if (lured && i % 10 === 5) await shot(B, 'hack_lure_B_' + i);
    if (await R(A, () => window.__r88.game.story.st.step !== '2.hack')) break;
    await wait(600);
  }
  await B.page.keyboard.up('KeyE');
  check('A lures drones with the fast car', lured);
  check('B finished the hack, 2.roof on both', await both('2.roof'), await R(A, () => ({ step: window.__r88.game.story.st.step, hack: window.__r88.game.story.flags.hack })));
  const vault = await R(B, () => { const v = window.__r88.game.story.props.sets.get('k_tower').spots.vault; return { x: v.x, y: v.y, z: v.z }; });
  await R(B, ([p]) => { const g = window.__r88.game, w = g.walker; w.enter(p.x - 1.4, p.y + 0.05, p.z + 1.2, Math.atan2(1.4, -1.2)); g.rig.mode = 'foot'; g.rig.footInit = false; }, [vault]); await wait(1200);
  check('B gets the vault prompt on the roof', (await R(B, () => window.__r88.game.interact.shown || '')).includes('vault'), await R(B, () => window.__r88.game.interact.shown));
  await key(B, 'KeyE');
  check('B holds the sketchbook (A sees it), 2.escape on both', await until(A, () => window.__r88.game.story.holding('book'), 12000) && await both('2.escape'), await Promise.all([st(A), st(B)]));
  await wait(1500); await shot(B, 'swarm_B'); await shot(A, 'swarm_A');
  const kt = await R(A, () => { const k = window.__r88.game.story.st.anchors.ktower; return { x: k.x, z: k.z }; });
  await put(B, { x: kt.x + 650, z: kt.z + 120 }, kt);
  check('B loses the swarm, 2.upload on both', await both('2.upload', 25000), await Promise.all([st(A), st(B)]));
  const nb2 = await R(B, () => { const p = window.__r88.game.story.npc.pos('nova'); return p && { x: p.x, z: p.z }; });
  await put(B, { x: nb2.x + 1.7, z: nb2.z + 0.4 }, nb2); await wait(900);
  await key(B, 'KeyE');
  check('B gives Nova the book, 2.page on both', await dialogByB('2.page') && await both('2.page'), await Promise.all([st(A), st(B)]));
  check('the city is free on both, drones down on B', await R(B, () => { const S = window.__r88.game.story; return S.st.flags.free2080 && S.drones.down; }), await R(B, () => ({ free: window.__r88.game.story.st.flags.free2080, down: window.__r88.game.story.drones.down })));
  await wait(3000); await shot(B, 'city_free_B');
  check('chapter 2 complete on both', await until(A, () => window.__r88.game.story.st.flags.ch2, 30000) && await until(B, () => window.__r88.game.story.st.flags.ch2, 15000));
}
const flips = await Promise.all([A, B].map((P) => R(P, () => window.__r88.game.story.coop.flips)));
check('A always leads, B always follows (time jumps included)', !flips[0].length && !flips[1].length, flips);
console.log('errors', JSON.stringify([...A.errors, ...B.errors].slice(0, 10)));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
await R(A, () => window.__r88.game.online.stop()); await R(B, () => window.__r88.game.online.stop());
await wait(800); await browser.close();

