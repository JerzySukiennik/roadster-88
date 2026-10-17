// Roadster 88 space parity: runs scripted ground, hop, hover and ballistic drives through the headless car sim and hashes every step of the full state, so the space flag can be proven not to change ground and air behaviour. Also checks the microgravity mode itself (drift, flip and burn).
// usage: node web/tools/space-parity.mjs [--save=file] [--check=file]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import R from '@dimforge/rapier3d-compat';
import { CarSim, GROUP, groups } from '../src/sim/car.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const tuning = JSON.parse(fs.readFileSync(path.join(root, 'shared/tuning.json'), 'utf8'));
await R.init();
const args = process.argv.slice(2);
const opt = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DT = 1 / tuning.physics_hz;
const IDLE = { throttle: 0, brake: 0, steer: 0, boost: false, lift: false, descend: false, pitch: 0, roll: 0 };
const I = (o) => ({ ...IDLE, ...o });

function makeWorld(assist = true) {
  const world = new R.World({ x: 0, y: -tuning.gravity, z: 0 });
  world.timestep = DT;
  world.createCollider(R.ColliderDesc.cuboid(20000, 1, 20000).setTranslation(0, -1, 0).setFriction(0.9).setCollisionGroups(groups(GROUP.STATIC, 0xffff)));
  world.createCollider(R.ColliderDesc.cuboid(6, 1.5, 3).setTranslation(0, 0.4, 120).setRotation({ x: -0.13, y: 0, z: 0, w: 0.99 }).setCollisionGroups(groups(GROUP.STATIC, 0xffff)));
  const car = new CarSim(R, world, tuning, { position: [0, 0.02, 0], yaw: 0 });
  car.flight.assist = assist;
  const eq = new R.EventQueue(true);
  const h = crypto.createHash('sha256'), buf = new Float64Array(26);
  const sim = { world, car, steps: 0 };
  sim.step = (inp) => {
    car.preStep(DT, inp); world.step(eq); eq.drainContactForceEvents(() => {}); car.postStep(DT);
    const s = car, w = s.wheels;
    buf.set([s.pos.x, s.pos.y, s.pos.z, s.q.x, s.q.y, s.q.z, s.q.w, s.vel.x, s.vel.y, s.vel.z, s.angW.x, s.angW.y, s.angW.z, w[0].omega, w[1].omega, w[2].omega, w[3].omega, s.steerAngle, s.thrusters.totalForce.x, s.thrusters.totalForce.y, s.thrusters.totalForce.z, s.thrusters.deploy, s.thrusters.sideDeploy, s.contacts, w[0].compression, w[3].compression]);
    h.update(Buffer.from(buf.buffer)); sim.steps++;
  };
  sim.run = (sec, inp) => { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) sim.step(typeof inp === 'function' ? inp(sim) : inp); };
  sim.done = () => { const d = h.digest('hex'); eq.free(); world.free(); return d; };
  return sim;
}

const drives = {
  launch(s) { s.run(1, IDLE); s.run(4, I({ throttle: 1 })); s.run(2, I({ throttle: 1, steer: 0.6 })); s.run(2, I({ brake: 1 })); },
  boost(s) { s.run(0.5, IDLE); s.run(3, I({ throttle: 1, boost: true })); s.run(2, I({ boost: true, brake: 1 })); },
  ramp(s) { s.run(0.5, IDLE); s.run(7, I({ throttle: 1, boost: true })); s.run(3, I({ throttle: 1, pitch: 1, roll: -1, steer: 0.4 })); },
  hop(s) { s.run(0.5, IDLE); s.run(0.3, I({ lift: true })); s.run(2.5, I({ throttle: 1 })); },
  hover(s) { s.run(0.5, IDLE); s.run(3, I({ lift: true })); s.run(2, I({ lift: true, throttle: 1, steer: 1 })); s.run(2, I({ pitch: 1, roll: 1 })); s.run(3, I({ descend: true })); },
  ballistic(s) { s.run(0.5, IDLE); s.car.teleport([0, 40, 0], 0.3, 30); s.run(1.5, I({ pitch: 1, steer: -1 })); s.run(1.5, I({ boost: true, roll: 1 })); s.run(2, I({ brake: 1 })); },
};

const results = {};
for (const assist of [true, false]) for (const [k, fn] of Object.entries(drives)) { const s = makeWorld(assist); fn(s); results[`${k}${assist ? '' : '_noassist'}`] = s.done(); }

const spaceOk = typeof CarSim.prototype.spaceStep === 'function';
const space = {};
if (spaceOk) {
  const mk = () => { const s = makeWorld(true); s.car.teleport([0, 6000, 0], 0, 0); s.car.env.space = true; return s; };
  let s = mk(); s.run(1, IDLE); s.car.body.setLinvel({ x: 0, y: 0, z: 20 }, true); s.run(5, IDLE);
  space.drift = { z: +s.car.pos.z.toFixed(2), y: +(s.car.pos.y - 6000).toFixed(4), v: +s.car.vel.z.toFixed(4) }; s.done();
  s = mk(); s.run(0.5, IDLE); s.run(4, I({ throttle: 1 }));
  const v1 = s.car.fwdSpeed; s.run(4, IDLE); const v2 = s.car.fwdSpeed;
  space.burn = { vAfter4s: +v1.toFixed(2), coast: +v2.toFixed(2), accel: +(v1 / 4).toFixed(2) };
  s.run(0.1, I({ brake: 1 })); let t = 0; while (t < 12 && s.car.fwd.dot(s.car.vel) / Math.max(0.01, s.car.speed) > -0.98) { s.run(0.1, I({ brake: 1 })); t += 0.1; }
  space.flipSec = +t.toFixed(1); s.run(0.5, I({ brake: 1 }));
  let tb = 0; while (tb < 20 && s.car.speed > 0.3) { s.run(0.1, I({ throttle: 1, brake: 1 })); tb += 0.1; }
  space.burnToStopSec = +tb.toFixed(1); space.restSpeed = +s.car.speed.toFixed(3); s.run(3, IDLE); space.angRate = +s.car.angW.len().toFixed(4);
  s.done();
  s = mk(); s.run(0.5, IDLE); s.run(1, I({ steer: 1 })); const w1 = s.car.angW.y; s.run(3, IDLE);
  space.yaw = { rateAt1s: +w1.toFixed(3), afterRelease3s: +s.car.angW.y.toFixed(4) }; s.done();
}

const text = JSON.stringify({ drives: results, space: spaceOk ? space : 'no spaceStep yet' }, null, 1);
console.log(text);
if (opt('save')) fs.writeFileSync(opt('save'), JSON.stringify(results, null, 1));
if (opt('check')) {
  const ref = JSON.parse(fs.readFileSync(opt('check'), 'utf8'));
  const bad = Object.keys(ref).filter((k) => ref[k] !== results[k]);
  console.log(bad.length ? `PARITY FAIL: ${bad.join(', ')}` : `PARITY OK: ${Object.keys(ref).length} drives byte-identical`);
  if (bad.length) process.exitCode = 1;
}
