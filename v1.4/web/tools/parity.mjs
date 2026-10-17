// Roadster 88 web parity harness: runs the pure JS sim headless in Node with scripted inputs and writes the "web" section of shared/parity.md.
// usage: node web/tools/parity.mjs [--print]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import R from '@dimforge/rapier3d-compat';
import { CarSim, GROUP, groups } from '../src/sim/car.js';
import { MPH } from '../src/sim/math.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const tuning = JSON.parse(fs.readFileSync(path.join(root, 'shared/tuning.json'), 'utf8'));
await R.init();

const DT = 1 / tuning.physics_hz;
const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false, lift: false, descend: false, pitch: 0, roll: 0 };

function makeWorld() {
  const world = new R.World({ x: 0, y: -tuning.gravity, z: 0 });
  world.timestep = DT;
  const g = R.ColliderDesc.cuboid(20000, 1, 20000).setTranslation(0, -1, 0).setFriction(0.9).setCollisionGroups(groups(GROUP.STATIC, 0xffff));
  world.createCollider(g);
  const car = new CarSim(R, world, tuning, { position: [0, 0.02, -9000], yaw: 0 });
  const eq = new R.EventQueue(true);
  const sim = { world, car, eq, t: 0 };
  sim.step = (inp) => { car.preStep(DT, inp); world.step(eq); eq.drainContactForceEvents(() => {}); car.postStep(DT); sim.t += DT; };
  sim.run = (sec, inp) => { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) sim.step(typeof inp === 'function' ? inp(sim) : inp); };
  sim.until = (cond, inp, max = 120) => { const t0 = sim.t; while (!cond(sim)) { sim.step(typeof inp === 'function' ? inp(sim) : inp); if (sim.t - t0 > max) return null; } return sim.t - t0; };
  sim.free = () => { eq.free(); world.free(); };
  sim.run(1.2, IDLE);
  return sim;
}

const results = {};
const fmt = (v, d = 2) => (v == null ? 'n/a' : Number(v).toFixed(d));

function zeroTo(target, inp) {
  const s = makeWorld();
  const t = s.until((x) => x.car.fwdSpeed >= target, inp, 60);
  s.free();
  return t;
}
results.zero60 = zeroTo(60 * MPH, { ...IDLE, throttle: 1 });
results.zero60boost = zeroTo(60 * MPH, { ...IDLE, throttle: 1, boost: true });
results.to88 = zeroTo(88 * MPH, { ...IDLE, throttle: 1 });
results.to88boost = zeroTo(88 * MPH, { ...IDLE, throttle: 1, boost: true });

function brake60(retro) {
  const s = makeWorld();
  s.until((x) => x.car.fwdSpeed >= 63 * MPH, { ...IDLE, throttle: 1 }, 30);
  const inp = { ...IDLE, brake: 1, boost: retro };
  let z0 = null, peakDecel = 0;
  const t0 = s.t;
  while (s.car.fwdSpeed > 0.05 && s.t - t0 < 20) {
    s.step(inp);
    if (z0 === null && s.car.fwdSpeed <= 60 * MPH) z0 = s.car.pos.z;
    peakDecel = Math.max(peakDecel, -s.car.lastAccel.z / tuning.gravity);
  }
  const d = s.car.pos.z - z0;
  s.free();
  return { d, peakDecel };
}
const b1 = brake60(false), b2 = brake60(true);
results.brake60 = b1.d; results.brake60g = b1.peakDecel;
results.brake60retro = b2.d; results.brake60retrog = b2.peakDecel;

{
  const s = makeWorld();
  let vmax = 0;
  s.run(70, (x) => { vmax = Math.max(vmax, x.car.speed); return { ...IDLE, throttle: 1 }; });
  results.top = vmax / MPH;
  const s2 = makeWorld();
  let vmax2 = 0;
  s2.run(40, (x) => { vmax2 = Math.max(vmax2, x.car.speed); return { ...IDLE, throttle: 1, boost: true }; });
  results.topBoost = vmax2 / MPH;
  s.free(); s2.free();
}

{
  const s = makeWorld();
  const y0 = s.car.comW.y;
  s.run(1.4, { ...IDLE, lift: true });
  s.run(6, IDLE);
  let rear = 0, front = 0, side = 0, thrust = 0, n = 0, vy = 0;
  s.run(2, (x) => {
    const th = x.car.thrusters;
    rear += th.rear.reduce((a, z) => a + z.valve, 0) / 4;
    front += th.front.reduce((a, z) => a + z.valve, 0) / 2;
    side += th.side.length ? th.side.reduce((a, z) => a + z.valve, 0) / th.side.length : 0;
    thrust += th.totalForce.y; vy += Math.abs(x.car.vel.y); n++;
    return IDLE;
  });
  results.hoverRear = rear / n; results.hoverFront = front / n; results.hoverSide = side / n;
  results.hoverTW = thrust / n / (tuning.car.mass * tuning.gravity);
  results.hoverMaxRatio = (thrust / n) / (s.car.thrusters.maxRear() + s.car.thrusters.maxFront() + s.car.thrusters.maxSide());
  results.hoverAlt = s.car.comW.y - y0; results.hoverVy = vy / n;
  results.hoverMode = s.car.flight.mode;
  s.run(2.5, { ...IDLE, steer: 1 });
  let yaw = 0, m = 0, prev = s.car.yaw();
  s.run(2, (x) => { const y = x.car.yaw(); let d = y - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; yaw += d; prev = y; m++; return { ...IDLE, steer: 1 }; });
  results.hoverYaw = (yaw / (m * DT)) * 180 / Math.PI;
  s.free();
}

{
  const s = makeWorld();
  const y0 = s.car.comW.y;
  let apex = 0;
  s.run(0.3, (x) => { apex = Math.max(apex, x.car.comW.y - y0); return { ...IDLE, lift: true }; });
  s.run(3, (x) => { apex = Math.max(apex, x.car.comW.y - y0); return IDLE; });
  results.hop = apex;
  s.free();
}

{
  const s = makeWorld();
  s.until((x) => x.car.fwdSpeed >= 60 * MPH, { ...IDLE, throttle: 1 }, 30);
  const hold = (x) => ({ ...IDLE, steer: 1, throttle: Math.max(0, Math.min(1, (60 * MPH - x.car.speed) * 0.6 + 0.08)) });
  s.run(8, hold);
  let rs = 0, n = 0, lat = 0, sp = 0;
  s.run(3, (x) => { const w = Math.abs(x.car.angW.y); rs += x.car.speed / Math.max(1e-3, w); lat += Math.abs(x.car.speed * w) / tuning.gravity; sp += x.car.speed; n++; return hold(x); });
  results.turnR = rs / n; results.turnG = lat / n; results.turnMph = sp / n / MPH;
  s.free();
}

const lines = [
  '<!-- web:begin -->',
  '## web (three.js build)',
  '',
  `Run: \`node web/tools/parity.mjs\` (Node ${process.version}, Rapier ${R.version()}, ${tuning.physics_hz} Hz, flat plate). Updated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
  '',
  '| Metric | Target | Web |',
  '|---|---|---|',
  `| 0-60 mph, motors | 1.9 s | ${fmt(results.zero60)} s |`,
  `| 0-60 mph, boost (W + Shift) | 1.1 s | ${fmt(results.zero60boost)} s |`,
  `| 0-88 mph, motors | (report) | ${fmt(results.to88)} s |`,
  `| 0-88 mph, boost | (report) | ${fmt(results.to88boost)} s |`,
  `| 60-0 mph, tyres (S) | about 32 m | ${fmt(results.brake60, 1)} m (peak ${fmt(results.brake60g)} g) |`,
  `| 60-0 mph, tyres + retro (S + Shift) | shorter | ${fmt(results.brake60retro, 1)} m (peak ${fmt(results.brake60retrog)} g) |`,
  `| Top speed, motors (70 s) | 250 mph | ${fmt(results.top, 1)} mph |`,
  `| Top speed, boost (40 s) | 250 mph | ${fmt(results.topBoost, 1)} mph |`,
  `| Hover throttle, rear / front / side valve | (report) | ${fmt(results.hoverRear, 3)} / ${fmt(results.hoverFront, 3)} / ${fmt(results.hoverSide, 3)} |`,
  `| Hover thrust / weight, thrust / max | 1.0 / (report) | ${fmt(results.hoverTW, 3)} / ${fmt(results.hoverMaxRatio, 3)} |`,
  `| Hop apex, 0.3 s Space (COM rise) | (report) | ${fmt(results.hop, 2)} m |`,
  `| Turn radius, 60 mph full lock | (report) | ${fmt(results.turnR, 1)} m at ${fmt(results.turnMph, 1)} mph, ${fmt(results.turnG)} g lateral |`,
  `| Hover yaw rate, A held | 70 deg/s (assist) | ${fmt(results.hoverYaw, 1)} deg/s |`,
  '',
  'Method: car settles 1.2 s at rest. 0-X: full W (plus Shift) from rest, time until forward speed crosses X. 60-0: accelerate to 63 mph, then S (plus Shift), distance from the moment speed drops through 60 mph to standstill. Hover: Space 1.4 s (enters hover after `hover_engage_s`), release, 6 s altitude hold, average over 2 s. Hop: Space held 0.3 s from rest, apex of COM rise. Turn: hold 60 mph with a throttle P-controller and full A for 8 s, average R = v / yaw rate over 3 s. Yaw: hovering, A held 2.5 s, average over 2 s.',
  '',
  'Model notes (so the Godot build can match): suspension force F = k x + c v (bump/rebound) + ARB k (x_l - x_r) + bump stop past `travel` (compression from free length); tyre combined slip s = hypot(kappa/peak_ratio, alpha/peak_angle), F = mu N f(s), f = s(2 - s) for s <= 1, f = fall + (1 - fall) / (1 + (1.5 (s - 1))^2) beyond, fall blended long/lat by slip direction; mu scaled by 1 - load_sensitivity (N/N0 - 1), N0 = m g / 4; slip ratio denominator max(|v|, 3 m/s); slip angle atan2(v_lat, max(|v_long|, 2)) with relaxation rate (|v| + 4) / relaxation_length; wheel spin integrated implicitly (4 substeps, `wheels.inertia_each`); drive force per axle is capped by the predicted tyre force at slip ratio `traction_control` (plus wheel spin-up inertia), the excess goes to the other axle, and a per-wheel slip governor trims torque above the cap; regen `regen_force` when off throttle; brakes split by `brake_front_share`. Thrust: allocator solves per-nozzle vectors (gimbal sector + magnitude) for wanted force + torque about the COM.',
  '<!-- web:end -->',
];
const out = path.join(root, 'shared/parity.md');
let text = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '# Parity results\n\nBoth engines write their own section between their markers. Targets from SPEC "Parity" must match within 5 percent.\n\n';
const block = lines.join('\n');
if (text.includes('<!-- web:begin -->')) text = text.replace(/<!-- web:begin -->[\s\S]*?<!-- web:end -->/, block);
else text = text.trimEnd() + '\n\n' + block + '\n';
if (!process.argv.includes('--print')) fs.writeFileSync(out, text);
console.log(JSON.stringify(results, (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v), 1));
