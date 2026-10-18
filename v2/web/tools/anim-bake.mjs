// Roadster 88 animation bake: samples Quaternius Universal Animation Library clips (CC0, UE-style rig) at 30 fps as world-space rotation deltas from the source bind pose, plus pelvis motion, measured ground speed and gait phase, into assets/driver/anims/ual.json + ual.bin; driver.js retargets them onto the avatar at load.
// usage: node web/tools/anim-bake.mjs   (needs the dev server on 8788 and the source GLBs in Niepotrzebne/anim-src/)
import { chromium } from '/Users/jurek/openclaw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../../assets/driver/anims');
fs.mkdirSync(outDir, { recursive: true });
const CLIPS = {
  UAL1: ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Interact', 'PickUp_Table', 'Push_Loop', 'Idle_Talking_Loop', 'Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Exit', 'Sitting_Talking_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Roll', 'Fixing_Kneeling', 'Hit_Chest', 'Idle_Torch_Loop', 'Swim_Fwd_Loop', 'Swim_Idle_Loop', 'Dance_Loop', 'Death01'],
  UAL2: ['Chest_Open', 'ClimbUp_1m', 'Consume', 'Hit_Knockback', 'Idle_FoldArms_Loop', 'Idle_Lantern_Loop', 'Idle_No_Loop', 'Idle_TalkingPhone_Loop', 'LayToIdle', 'OverhandThrow', 'Walk_Carry_Loop', 'Yes', 'NinjaJump_Start', 'NinjaJump_Idle_Loop', 'NinjaJump_Land', 'Slide_Start', 'Slide_Loop', 'Slide_Exit'],
};
const FING = ['index', 'middle', 'ring', 'pinky', 'thumb'], FT = { index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Little', thumb: 'Thumb' };
const MAP = [['pelvis', 'Hips', 'spine_01'], ['spine_01', 'Spine', 'spine_02'], ['spine_02', 'Spine1', 'spine_03'], ['spine_03', 'Spine2', 'neck_01'], ['neck_01', 'Neck', 'Head'], ['Head', 'Head', null]];
for (const [s, S] of [['l', 'Left'], ['r', 'Right']]) {
  MAP.push([`clavicle_${s}`, `${S}Shoulder`, `upperarm_${s}`], [`upperarm_${s}`, `${S}Arm`, `lowerarm_${s}`], [`lowerarm_${s}`, `${S}ForeArm`, `hand_${s}`], [`hand_${s}`, `${S}Hand`, `middle_01_${s}`]);
  for (const f of FING) for (let i = 1; i <= 3; i++) MAP.push([`${f}_0${i}_${s}`, `${S}Hand${FT[f]}${i}`, `${f}_0${i + 1}_${s}`.replace('_04_', '_04_leaf_')]);
  MAP.push([`thigh_${s}`, `${S}UpLeg`, `calf_${s}`], [`calf_${s}`, `${S}Leg`, `foot_${s}`], [`foot_${s}`, `${S}Foot`, `ball_${s}`], [`ball_${s}`, `${S}ToeBase`, `ball_leaf_${s}`]);
}

const exe = '/Users/jurek/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
await page.goto('http://localhost:8788/web/tools/anim-bake.html');
await page.waitForFunction(() => window.ready);
const res = await page.evaluate(async ({ CLIPS, MAP }) => {
  const T = window.THREE, FPS = 30;
  const out = { fps: FPS, bones: MAP.map((m) => m[1]), dir: [], clips: [] }, data = [];
  let srcRestPelvis = null;
  for (const file of Object.keys(CLIPS)) {
    const g = await window.load(`/Niepotrzebne/anim-src/${file}_Standard.glb`), rm = await window.load(`/Niepotrzebne/anim-src/${file}_Standard_RM.glb`);
    const B = {}; g.scene.traverse((o) => { if (o.isBone) B[o.name] = o; });
    const RB = {}; rm.scene.traverse((o) => { if (o.isBone) RB[o.name] = o; });
    g.scene.updateMatrixWorld(true);
    const bindQ = MAP.map((m) => B[m[0]].getWorldQuaternion(new T.Quaternion()));
    if (!out.dir.length) {
      for (const m of MAP) {
        if (!m[2] || !B[m[2]]) { out.dir.push(null); continue; }
        const a = B[m[0]].getWorldPosition(new T.Vector3()), b = B[m[2]].getWorldPosition(new T.Vector3());
        out.dir.push(b.sub(a).normalize().toArray().map((v) => +v.toFixed(5)));
      }
      srcRestPelvis = B.pelvis.getWorldPosition(new T.Vector3());
      out.pelvis = srcRestPelvis.toArray().map((v) => +v.toFixed(4));
    }
    const mixer = new T.AnimationMixer(g.scene), rmMixer = new T.AnimationMixer(rm.scene);
    for (const name of CLIPS[file]) {
      const clip = g.animations.find((c) => c.name === name); if (!clip) { console.error('missing ' + name); continue; }
      mixer.stopAllAction(); mixer.uncacheRoot(g.scene);
      const act = mixer.clipAction(clip); act.setLoop(T.LoopOnce); act.clampWhenFinished = true; act.play();
      const n = Math.max(2, Math.round(clip.duration * FPS) + 1);
      const q = new Float32Array(n * MAP.length * 4), p = new Float32Array(n * 3), feet = [];
      const tq = new T.Quaternion(), inv = bindQ.map((b) => b.clone().invert());
      for (let f = 0; f < n; f++) {
        mixer.setTime(Math.min(clip.duration, f / FPS)); g.scene.updateMatrixWorld(true);
        MAP.forEach((m, i) => { B[m[0]].getWorldQuaternion(tq).multiply(inv[i]); if (tq.w < 0) tq.set(-tq.x, -tq.y, -tq.z, -tq.w); q.set([tq.x, tq.y, tq.z, tq.w], (f * MAP.length + i) * 4); });
        const pv = B.pelvis.getWorldPosition(new T.Vector3()); p.set([pv.x, pv.y, pv.z], f * 3);
        const fl = B.foot_l.getWorldPosition(new T.Vector3()), fr = B.foot_r.getWorldPosition(new T.Vector3());
        feet.push([fl.z - pv.z, fr.z - pv.z, fl.y, fr.y]);
      }
      let speed = 0;
      const rclip = rm.animations.find((c) => c.name === name);
      if (rclip) {
        rmMixer.stopAllAction(); rmMixer.uncacheRoot(rm.scene); const ra = rmMixer.clipAction(rclip); ra.setLoop(T.LoopOnce); ra.clampWhenFinished = true; ra.play();
        rmMixer.setTime(0); rm.scene.updateMatrixWorld(true); const a = RB.root.getWorldPosition(new T.Vector3()).add(RB.pelvis.getWorldPosition(new T.Vector3())).multiplyScalar(0.5);
        rmMixer.setTime(rclip.duration); rm.scene.updateMatrixWorld(true); const b = RB.root.getWorldPosition(new T.Vector3()).add(RB.pelvis.getWorldPosition(new T.Vector3())).multiplyScalar(0.5);
        speed = Math.hypot(b.x - a.x, b.z - a.z) / rclip.duration;
      }
      let best = 0, bz = -1e9; feet.forEach((v, f) => { if (v[0] - v[1] > bz) { bz = v[0] - v[1]; best = f; } });
      const minY = Math.min(...feet.map((v) => Math.min(v[2], v[3])));
      const air = feet.map((v) => Math.min(v[2], v[3]) - minY);
      const stat = MAP.map((m, i) => { for (let f = 1; f < n; f++) for (let k = 0; k < 4; k++) if (Math.abs(q[(f * MAP.length + i) * 4 + k] - q[i * 4 + k]) > 3e-3) return false; return true; });
      data.push({ q: Array.from(q), p: Array.from(p), stat });
      out.clips.push({ name, n, dur: +clip.duration.toFixed(4), loop: /_Loop$/.test(name), speed: +speed.toFixed(3), phase0: +(best / (n - 1)).toFixed(3), air: air.map((v) => +v.toFixed(3)) });
    }
  }
  out.child = MAP.map((m) => MAP.findIndex((x) => x[0] === m[2]));
  return { out, data };
}, { CLIPS, MAP });
await browser.close();

const { out, data } = res;
const chunks = [];
let off = 0;
out.clips.forEach((c, ci) => {
  const d = data[ci], nb = out.bones.length;
  c.stat = d.stat.map((s) => (s ? 1 : 0)).join('');
  const qs = [];
  for (let i = 0; i < nb; i++) { const frames = d.stat[i] ? 1 : c.n; for (let f = 0; f < frames; f++) for (let k = 0; k < 4; k++) qs.push(Math.round(d.q[(f * nb + i) * 4 + k] * 32767)); }
  const ps = []; for (let f = 0; f < c.n; f++) for (let k = 0; k < 3; k++) ps.push(Math.round((d.p[f * 3 + k] - out.pelvis[k]) * 10000));
  const buf = new Int16Array(qs.length + ps.length); buf.set(qs); buf.set(ps.map((v) => Math.max(-32767, Math.min(32767, v))), qs.length);
  c.off = off; c.len = buf.length; off += buf.length;
  chunks.push(Buffer.from(buf.buffer));
});
const bin = Buffer.concat(chunks);
fs.writeFileSync(path.join(outDir, 'ual.bin'), bin);
fs.writeFileSync(path.join(outDir, 'ual.json'), JSON.stringify(out));
console.log(`baked ${out.clips.length} clips, ${out.bones.length} bones, bin ${(bin.length / 1024).toFixed(0)} KB, json ${(fs.statSync(path.join(outDir, 'ual.json')).size / 1024).toFixed(0)} KB`);
for (const c of out.clips) console.log(`  ${c.name.padEnd(24)} ${c.dur.toFixed(2)}s  speed ${c.speed.toFixed(2)}  phase0 ${c.phase0}  static ${c.stat.split('').filter((x) => x === '1').length}/${out.bones.length}`);
