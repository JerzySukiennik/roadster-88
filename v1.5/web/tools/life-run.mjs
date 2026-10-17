// Roadster 88 life runner: the browser harness boot and helpers with patient timeouts (the machine is shared with other agents' runs), running the life scenarios from life-scenarios.mjs.
// usage: node web/tools/life-run.mjs <scenario[,scenario...]> [--q=high] [--extra='&map=valley'] [--out=dir]
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lifeScenarios } from './life-scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(a.indexOf('=') + 1) : d; };
const scenarios = (args.find((a) => !a.startsWith('--')) || 'lineup').split(',');
const out = opt('out', path.resolve(here, '../../Niepotrzebne/shots-map'));
const W = Number(opt('w', 1440)), H = Number(opt('h', 900));
fs.mkdirSync(out, { recursive: true });
const exe = '/Users/jurek/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: false, executablePath: exe, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H + 80}`, '--window-position=3000,3000', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.setDefaultTimeout(180000);
const errors = [], logs = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 6).join(' | ')));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('404')) errors.push(t); else if (m.type() === 'warning' || m.type() === 'log') logs.push(`[${m.type()}] ${t}`); });
const q = opt('q', 'high');
const url = `http://localhost:8788/web/?debug&q=${q}${args.includes('--nodynres') ? '&nodynres' : ''}${opt('extra', '&map=valley')}`;
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
try { await page.waitForFunction(() => window.__r88 && window.__r88.game.started, null, { timeout: Number(opt('boot', 300)) * 1000 }); }
catch (e) { console.log('BOOT FAILED', await page.evaluate(() => document.getElementById('ldText').textContent)); console.log(errors.join('\n')); await browser.close(); process.exit(1); }
console.log(`boot ${(Date.now() - t0) / 1000}s`);
const wait = (ms) => page.waitForTimeout(ms);
const R = (fn, a) => page.evaluate(fn, a);
const keys = (...k) => R((k) => window.__r88.keys(...k), k);
const release = () => R(() => window.__r88.release());
const tap = (k) => R((k) => window.__r88.tap(k), k);
const state = () => R(() => window.__r88.state());
const fmt = (s) => `${s.mph.toFixed(1)}mph ${s.mode} c${s.contacts} @${s.pos.map((v) => v.toFixed(1)).join(',')} fps${s.fps.toFixed(0)} sc${s.scale.toFixed(2)} dc${s.calls}${s.prof ? ` cpu[sim ${s.prof.sim.toFixed(1)} mid ${s.prof.mid.toFixed(1)} rnd ${s.prof.render.toFixed(1)}]` : ''}`;
const sample = async (n, ms, label) => { const a = []; for (let i = 0; i < n; i++) { await wait(ms); a.push(fmt(await state())); } console.log(label + ': ' + a.join(' | ')); };
const tele = (x, y, z, yaw = 0, v = 0) => R((a) => window.__r88.teleport(...a), [x, y, z, yaw, v]);
const stats = async (label) => { const s = await R(() => window.__r88.stats()); if (!s.n) { console.log(label, 'NO FRAMES'); return s; } console.log(`${label} frames n=${s.n} avg=${s.avg.toFixed(1)} p50=${s.p50.toFixed(1)} p95=${s.p95.toFixed(1)} p99=${s.p99.toFixed(1)} max=${s.max.toFixed(1)} spikes=${s.spikes} scale=${s.scale.toFixed(2)}`); return s; };
const reset = () => R(() => window.__r88.resetStats());
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); console.log('shot', name); };
const S = lifeScenarios({ page, R, wait, shot, stats, reset, tele, keys, release, tap, state, sample, fmt, out, errors });
for (const sc of scenarios) { if (!S[sc]) { console.log('unknown scenario', sc); continue; } console.log('== ' + sc); try { await S[sc](); } catch (e) { console.log('SCENARIO FAILED', sc, e.message.split('\n')[0]); } }
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
if (args.includes('--logs')) console.log(logs.filter((l) => !l.includes('boot ')).slice(0, 40).join('\n'));
await browser.close();
