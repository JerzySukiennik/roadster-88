// Roadster 88 life gaits: procedural clip generators shared by the species (digitigrade biped locomotion, quadruped walk, trot and gallop, idle breathing and look-around, grazing, lying and getting up), all solved with sagittal leg IK on the baked rig.
import { TAU, clamp, lerp, smooth, foot, wave, aim, pitchOf } from './rig.js';

const restPitch = (rig, a, b) => { const A = rig.joint(a), B = typeof b === 'string' ? rig.joint(b) : b; return pitchOf(B[1] - A[1], B[2] - A[2]); };

export function chainWave(P, rig, names, axis, amp, t, lag, k = 1, grow = 0) {
  names.forEach((n, i) => { if (!rig.has(n)) return; P[axis][rig.i(n)] += amp * (1 + grow * i) * wave(t, -lag * i, k); });
}

export function bipedLegs(rig, P, t, o, legs) {
  for (const L of legs) {
    const f = foot(t, L.off, o.duty, o.stride, o.lift, L.z0, { liftSkew: o.liftSkew || 1 });
    const hip = rig.joint(L.names[0]);
    const target = [hip[0], L.y0 + f.y, f.z];
    let meta;
    if (f.stance) meta = lerp(L.metaRest - o.metaPlant, L.metaRest + o.metaPush, smooth(f.s));
    else { const s = f.s; meta = s < 0.5 ? lerp(L.metaRest + o.metaPush, L.metaRest + o.metaSwing, smooth(s * 2)) : lerp(L.metaRest + o.metaSwing, L.metaRest - o.metaPlant, smooth(s * 2 - 1)); }
    const toe = f.stance ? L.toeRest + (f.s > 0.75 ? (f.s - 0.75) * 4 * o.toePush : 0) : L.toeRest + o.toeCurl * Math.sin(Math.PI * f.s);
    rig.leg(P, L.names, target, { bend: 1, foot: meta, toeAngle: toe, toeEnd: L.toeEnd });
  }
}

export function bipedSetup(rig, side, names, toeEnd) {
  const [thigh, shin, meta, toe] = names;
  const tj = rig.joint(toe);
  return { names, off: side, z0: tj[2], y0: tj[1], metaRest: restPitch(rig, meta, toe), toeRest: restPitch(rig, toe, toeEnd), toeEnd };
}

export function quadLeg(rig, P, t, o, L) {
  const f = foot(t, L.off, o.duty, o.stride, L.front ? o.liftF : o.liftH, L.z0, { liftSkew: o.liftSkew || 1 });
  const hip = rig.joint(L.names[0]);
  const target = [hip[0], L.y0 + f.y, f.z];
  let pastern;
  if (f.stance) pastern = lerp(L.metaRest - o.plant, L.metaRest + o.push, smooth(f.s));
  else pastern = L.metaRest + o.push + (o.fold * (L.front ? 1.2 : 1)) * Math.sin(Math.PI * f.s) - (o.push + o.plant) * smooth(f.s);
  const toeA = L.toeEnd ? (f.stance ? L.toeRest : L.toeRest + o.toeCurl * Math.sin(Math.PI * f.s)) : undefined;
  rig.leg(P, L.names, target, { bend: L.bend, foot: pastern, toeAngle: toeA, toeEnd: L.toeEnd, toe: L.toe });
  return f;
}

export function quadSetup(rig, names, off, front, opts = {}) {
  const [a, b, c, d] = names;
  const cj = rig.joint(c), dj = d ? rig.joint(d) : opts.toe;
  const L = { names: names.filter(Boolean), off, front, bend: opts.bend === undefined ? (front ? -1 : 1) : opts.bend, z0: dj[2], y0: dj[1], metaRest: restPitch(rig, c, dj), toe: d ? undefined : opts.toe };
  if (d && opts.toeEnd) { L.toeEnd = opts.toeEnd; L.toeRest = restPitch(rig, d, opts.toeEnd); }
  return L;
}

export function stand(rig, P, legs, quad) {
  for (const L of legs) {
    const hip = rig.joint(L.names[0]);
    if (quad) rig.leg(P, L.names, [hip[0], L.y0, L.z0], { bend: L.bend, foot: L.metaRest, toeAngle: L.toeEnd ? L.toeRest : undefined, toeEnd: L.toeEnd, toe: L.toe });
    else rig.leg(P, L.names, [hip[0], L.y0, L.z0], { bend: 1, foot: L.metaRest, toeAngle: L.toeRest, toeEnd: L.toeEnd });
  }
}

export function theropodClips(rig, C) {
  const tail = C.tail;
  const legs = [bipedSetup(rig, 0, ['thighL', 'shinL', 'metaL', 'toeL'], C.toeEnd(1)), bipedSetup(rig, 0.5, ['thighR', 'shinR', 'metaR', 'toeR'], C.toeEnd(-1))];
  const I = (n) => rig.i(n);
  const arms = (P, k, t, swing) => { for (const L of ['L', 'R']) { if (!rig.has('arm' + L)) continue; P.rx[I('arm' + L)] += C.arm[0] * k + swing * wave(t, L === 'L' ? 0 : 0.5); P.rx[I('fore' + L)] += C.arm[1] * k; P.rx[I('hand' + L)] += C.arm[2] * k; if (C.armOut) P.rz[I('arm' + L)] += (L === 'L' ? -1 : 1) * C.armOut * k; } };
  const body = (P, t, a) => {
    P.root[1] += a.bob * Math.cos(TAU * (2 * t - 0.3)) - a.sink;
    P.rx[I('pelvis')] += a.pitch + a.pitchBob * wave(t, 0.1, 2);
    P.rz[I('pelvis')] += a.roll * wave(t, 0.25);
    P.ry[I('pelvis')] += a.yaw * wave(t, 0);
    chainWave(P, rig, tail, 'ry', a.tail, t, 0.09, 1, 0.25);
    chainWave(P, rig, tail, 'rx', a.tailUp, t, 0.12, 2, 0.1);
    P.rx[I('chest')] += -a.pitch * 0.5;
    P.rx[I('neck1')] += a.neck - a.pitch * 0.4 + a.neckBob * wave(t, 0.35, 2);
    P.rx[I('head')] += -a.neckBob * 0.8 * wave(t, 0.35, 2) + (a.head || 0);
    P.ry[I('neck1')] += -a.yaw * 0.6 * wave(t, 0);
    P.rx[I('jaw')] += a.jaw;
    arms(P, 1, t, a.arm);
  };
  const loco = (name, o, a) => ({ name, frames: o.frames, loop: true, dur: o.dur, speed: o.stride / (o.duty * o.dur), stride: o.stride, pose(t, P) { body(P, t, a); bipedLegs(rig, P, t, o, legs); } });
  const idlePose = (P, t, k = 1) => {
    P.root[1] += C.breath * wave(t, 0, 2) - C.crouch;
    P.rx[I('chest')] += 0.015 * wave(t, 0.2, 2);
    P.ry[I('neck1')] += 0.12 * wave(t, 0) * k; P.ry[I('neck2')] += 0.08 * wave(t, 0.1) * k; P.ry[I('head')] += 0.14 * wave(t, 0.15) * k;
    P.rx[I('neck1')] += 0.04 * wave(t, 0.3, 1) * k; P.rx[I('head')] += 0.05 * wave(t, 0.4, 2) * k;
    P.rx[I('jaw')] += 0.03 + 0.02 * wave(t, 0, 2);
    chainWave(P, rig, tail, 'ry', 0.035, t, 0.08, 1, 0.3);
    arms(P, 1, t, 0);
    stand(rig, P, legs, false);
  };
  const lie = (P, k = 1) => {
    P.root[1] -= C.lieDrop * k;
    P.rx[I('neck1')] += 0.25 * k; P.rx[I('head')] += 0.15 * k; P.rx[I('jaw')] += 0.1 * k;
    for (const L of ['L', 'R']) { P.rx[I('thigh' + L)] = -1.1 * k; P.rx[I('shin' + L)] = 1.9 * k; P.rx[I('meta' + L)] = -1.6 * k; P.rx[I('toe' + L)] = 0.6 * k; }
    arms(P, 1 + 0.5 * k, 0, 0);
    tail.forEach((n, i) => { P.rx[I(n)] += (0.06 + i * 0.01) * k; P.ry[I(n)] += 0.08 * k; });
  };
  const list = [
    { name: 'idle', frames: 48, loop: true, dur: 6, speed: 0, pose(t, P) { idlePose(P, t); } },
    loco('walk', C.walk, C.walkBody),
    loco('run', C.run, C.runBody),
    { name: 'roar', frames: 56, loop: false, dur: C.roarDur || 2.6, speed: 0, pose(t, P) {
      idlePose(P, t, 0.2);
      const up = smooth(t / 0.22) * (1 - smooth((t - 0.22) / 0.2)), out = smooth((t - 0.25) / 0.15) * (1 - smooth((t - 0.78) / 0.2));
      P.rx[I('neck1')] += -0.35 * up + 0.22 * out; P.rx[I('neck2')] += -0.15 * up + 0.12 * out; P.rx[I('head')] += -0.25 * up - 0.12 * out;
      P.rx[I('jaw')] += 0.12 * up + C.roarJaw * out;
      P.ry[I('head')] += 0.08 * out * Math.sin(t * 40); P.rz[I('head')] += 0.06 * out * Math.sin(t * 33);
      P.rx[I('pelvis')] += 0.06 * out; P.root[1] -= C.lieDrop * 0.035 * out; P.root[2] += C.lieDrop * 0.1 * out;
      stand(rig, P, legs, false);
    } },
    { name: 'bite', frames: 32, loop: false, dur: C.biteDur || 1.1, speed: 0, pose(t, P) {
      idlePose(P, t, 0.1);
      const lunge = t < 0.7 ? Math.sin(Math.PI * smooth(t / 0.7)) : 0, open = smooth(t / 0.3) * (1 - smooth((t - 0.45) / 0.1));
      P.rx[I('pelvis')] += 0.16 * lunge; P.rx[I('neck1')] += 0.25 * lunge; P.rx[I('head')] += 0.1 * lunge;
      P.root[2] += C.lieDrop * 0.38 * lunge; P.root[1] -= C.lieDrop * 0.1 * lunge;
      P.rx[I('jaw')] += C.roarJaw * open;
      stand(rig, P, legs, false);
    } },
    { name: 'lie', frames: 2, loop: true, dur: 1, speed: 0, pose(t, P) { lie(P, 1); } },
    { name: 'getup', frames: 40, loop: false, dur: C.getupDur || 2.2, speed: 0, pose(t, P) {
      const k = smooth(t);
      P.root[1] -= C.lieDrop * (1 - k);
      P.rx[I('neck1')] += 0.25 * (1 - k) - 0.2 * Math.sin(Math.PI * k);
      arms(P, 1 + 0.5 * (1 - k), 0, 0);
      for (const L of legs) { const h = rig.joint(L.names[0]); rig.leg(P, L.names, [h[0], L.y0, L.z0 + C.lieDrop * 0.17 * (1 - k)], { bend: 1, foot: lerp(L.metaRest - 1.0, L.metaRest, k), toeAngle: L.toeRest, toeEnd: L.toeEnd }); }
    } },
  ];
  if (C.extra) for (const c of C.extra({ idlePose, body, legs, stand: (P) => stand(rig, P, legs, false), arms })) list.push(c);
  return list;
}

const OFFS = { walk: [0, 0.5, 0.25, 0.75], amble: [0, 0.5, 0.2, 0.7], trot: [0, 0.5, 0.5, 0], pace: [0, 0.5, 0, 0.5], gallop: [0, 0.1, 0.55, 0.45], bound: [0, 0.05, 0.5, 0.55] };

export function quadClips(rig, S) {
  const legs = (offs) => [
    quadSetup(rig, S.hind.map((n) => n && n + 'L'), offs[0], false, { toeEnd: S.hindEnd && S.hindEnd(1), toe: S.hindToe && S.hindToe(1), bend: S.hindBend }),
    quadSetup(rig, S.hind.map((n) => n && n + 'R'), offs[1], false, { toeEnd: S.hindEnd && S.hindEnd(-1), toe: S.hindToe && S.hindToe(-1), bend: S.hindBend }),
    quadSetup(rig, S.front.map((n) => n && n + 'L'), offs[2], true, { toeEnd: S.frontEnd && S.frontEnd(1), toe: S.frontToe && S.frontToe(1), bend: S.frontBend }),
    quadSetup(rig, S.front.map((n) => n && n + 'R'), offs[3], true, { toeEnd: S.frontEnd && S.frontEnd(-1), toe: S.frontToe && S.frontToe(-1), bend: S.frontBend }),
  ];
  const I = (n) => (n && rig.has(n) ? rig.i(n) : -1);
  const add = (P, ax, n, v) => { const i = I(n); if (i >= 0) P[ax][i] += v; };
  const neckAll = (P, ax, v) => { const ns = S.neck || []; ns.forEach((n, i) => add(P, ax, n, v * (S.neckW ? S.neckW[i] : 1 / ns.length))); };
  const tailWag = (P, t, amp, up, k = 1) => { if (S.tail) { chainWave(P, rig, S.tail, 'ry', amp, t, 0.1, k, 0.3); chainWave(P, rig, S.tail, 'rx', up, t, 0.12, 2 * k, 0.1); } };
  const base = (P) => { if (S.base) S.base(P, rig); };
  const standLegs = (P, L) => stand(rig, P, L, true);
  const out = [];
  const loco = (name, g) => {
    const L = legs(OFFS[g.type || 'walk']);
    out.push({ name, frames: g.frames || 36, loop: true, dur: g.dur, speed: g.stride / (g.duty * g.dur), stride: g.stride, pose(t, P) {
      base(P);
      const b = g.body || {};
      const nb = g.type === 'gallop' || g.type === 'bound' ? 1 : 2;
      P.root[1] += (b.bob || 0) * Math.cos(TAU * (nb * t - (b.bobPh || 0))) - (b.sink || 0);
      add(P, 'rx', S.root, (b.pitch || 0) + (b.rock || 0) * wave(t, b.rockPh || 0));
      add(P, 'rz', S.root, (b.roll || 0) * wave(t, 0.25));
      add(P, 'ry', S.root, (b.yaw || 0) * wave(t, 0));
      if (S.spine) S.spine.forEach((n, i) => add(P, 'rx', n, (b.flex || 0) * wave(t, (b.flexPh || 0) + i * 0.05) - (i === S.spine.length - 1 ? (b.pitch || 0) * 0.6 : 0)));
      neckAll(P, 'rx', (b.neck || 0) + (b.nod || 0) * wave(t, b.nodPh || 0, nb));
      add(P, 'rx', S.head, (b.head || 0) - (b.nod || 0) * 0.5 * wave(t, b.nodPh || 0, nb));
      add(P, 'rx', S.jaw, b.jaw || 0);
      tailWag(P, t, b.tail || 0, b.tailUp || 0);
      if (S.extra) S.extra(P, rig, t, name);
      for (const l of L) quadLeg(rig, P, t, g, l);
    } });
  };
  for (const k of ['walk', 'run', 'trot', 'gallop']) if (S[k]) loco(k, S[k]);
  const L0 = legs(OFFS.walk);
  const idle = (name, dur, f) => out.push({ name, frames: 48, loop: true, dur, speed: 0, pose(t, P) { base(P); P.root[1] += (S.breath || 0.01) * wave(t, 0, 2); f(P, t); tailWag(P, t, S.idleTail || 0.04, 0.01, 1); if (S.extra) S.extra(P, rig, t, name); standLegs(P, L0); } });
  idle('idle', S.idleDur || 6, (P, t) => { neckAll(P, 'ry', 0.35 * wave(t, 0)); neckAll(P, 'rx', (S.idleNeck || 0) + 0.06 * wave(t, 0.3)); add(P, 'ry', S.head, 0.2 * wave(t, 0.1)); add(P, 'rx', S.head, 0.05 * wave(t, 0.2, 2)); });
  if (S.graze) idle('graze', 5, (P, t) => { const g = S.graze; neckAll(P, 'rx', g.neck + 0.05 * wave(t, 0, 1)); neckAll(P, 'ry', 0.12 * wave(t, 0.2)); add(P, 'rx', S.head, g.head + 0.08 * wave(t, 0, 2)); add(P, 'rx', S.jaw, 0.08 + 0.08 * Math.abs(wave(t, 0, 6))); P.root[1] -= g.drop || 0; add(P, 'rx', S.root, g.pitch || 0); });
  idle('alert', 3, (P, t) => { neckAll(P, 'rx', -(S.alertNeck || 0.3)); add(P, 'rx', S.head, S.alertHead || 0.15); add(P, 'ry', S.head, 0.15 * wave(t, 0)); });
  if (S.lie) out.push({ name: 'lie', frames: 2, loop: true, dur: 1, speed: 0, pose(t, P) { base(P); S.lie(P, rig); } });
  out.push({ name: 'getup', frames: 36, loop: false, dur: S.getupDur || 1.8, speed: 0, pose(t, P) {
    base(P);
    const k = smooth(t), hk = smooth(clamp(t * 1.6, 0, 1)), fk = smooth(clamp(t * 1.6 - 0.6, 0, 1));
    P.root[1] -= (S.lieDrop || 0.8) * (1 - k);
    add(P, 'rx', S.root, (S.getupPitch || 0.2) * Math.sin(Math.PI * k));
    for (const l of L0) {
      const kk = l.front ? fk : hk, hip = rig.joint(l.names[0]);
      rig.leg(P, l.names, [hip[0], l.y0, l.z0 + (l.front ? 0.3 : -0.2) * (1 - kk)], { bend: l.bend, foot: l.metaRest + (1 - kk) * 0.6, toeAngle: l.toeEnd ? l.toeRest : undefined, toeEnd: l.toeEnd, toe: l.toe });
    }
    neckAll(P, 'rx', 0.2 * (1 - k));
  } });
  if (S.clips) for (const c of S.clips(L0, { add, neckAll, tailWag, base, standLegs })) out.push(c);
  return out;
}

export { TAU, clamp, lerp, smooth, foot, wave, aim, pitchOf };
