// Roadster 88 story chapters, "The Butterfly Effect": chapter 0 (the first test jump to 1885 loses a thruster nozzle and the present turns into Kessler's world) and chapter 1 (find out who Elias Kessler was, beat him to the fallen part in 1885 or trade for it, and bring the present back), as steps for the story director.
import { L } from './lines.js';
const arrived = (S, ev, year) => ev.some((e) => e.type === 'arrive' && e.data === S.period(year));
const ws = (S) => { const s = S.props.sets.get(S.flags.timeline === 'kessler' ? 'ws_kessler' : 'ws_normal'); return s ? s.spots.door : null; };
const HWY = (S) => ({ x: -900, z: (S.st.anchors.workshop ? S.st.anchors.workshop.z : 0) - 250 });

const chapter0 = {
  title: 'Chapter 0', name: 'First Jump',
  steps: [
    {
      id: '0.drive',
      enter(S) { S.flags.timeline = 'normal'; S.applyWorld(); S.objective('Drive to Gzowska Labs in Gzowo Springs', () => ws(S)); },
      update(S) { return S.near(ws(S), 22); },
    },
    {
      id: '0.meet',
      enter(S) {
        S.objective(S.g.walker.active ? 'Talk to Ida in the workshop' : 'Get out (F) and talk to Ida', () => S.npc.pos('ida'));
        S.talk('ida', 'Talk to Ida', [
          L('c0_meet_1'),
          { ...L('c0_meet_2'), choices: [
            { ...L('c0_meet_c1'), then: [L('c0_meet_c1r')] },
            { ...L('c0_meet_c2'), then: [L('c0_meet_c2r')] },
          ] },
          L('c0_meet_3'),
        ], () => { S.flags.met = true; });
      },
      update(S) {
        if (!S.flags.met) { S.objective(S.g.walker.active ? 'Talk to Ida in the workshop' : 'Get out (F) and talk to Ida', () => S.npc.pos('ida')); return false; }
        return true;
      },
    },
    {
      id: '0.canister',
      enter(S) {
        if (!S.st.frunk.includes('canister')) { const b = S.props.sets.get('ws_normal').spots.bench; S.can = S.item('canister', { x: b.x, y: b.y + 0.3, z: b.z }); }
        S.objective('Pick up the flux canister (E) and put it in the Roadster\'s frunk', () => (S.heldItem() ? S.frontOfCar() : S.can ? S.can.body.translation() : null));
      },
      update(S) { return S.st.frunk.includes('canister'); },
    },
    {
      id: '0.jump',
      enter(S) {
        S.radio(L('c0_jump_r1'));
        S.objective('Set 1885 (Y), arm the circuits (T), reach 88 mph', () => HWY(S));
      },
      update(S, dt, ev) { return arrived(S, ev, 1885) || (S.inYear(1885) && !S.g.tc.busy && S.g.tc.jumps > 0 && S.flags.inPast); },
      exit(S) { S.flags.inPast = true; },
    },
    {
      id: '0.lost',
      enter(S) {
        S.lostT = 0;
        S.radio(L('c0_lost_r1'), 3.4);
        S.objective('You made it to 1885');
      },
      update(S, dt, ev) {
        S.lostT += dt;
        if (S.lostT > 3.8 && !S.flags.clang) {
          S.flags.clang = true;
          if (S.g.audio) { S.g.audio.play('impact_light', { inside: true, gain: 1 }); S.g.audio.play('tc_crackle', { inside: true, gain: 0.6 }); }
          if (S.g.rig) S.g.rig.addImpact(0.7);
          S.radio(L('c0_lost_r2'), 4);
          S.radio(L('c0_lost_r3'), 3.4);
          S.g.tc.setDestination({ ...S.g.tc.destination, year: 2026 });
        }
        if (S.flags.clang) S.objective('Jump back to 2026 now: arm (T) and reach 88 mph', () => HWY(S));
        return S.flags.clang && arrived(S, ev, 2026);
      },
    },
    {
      id: '0.changed',
      enter(S) {
        S.flags.timeline = 'kessler'; S.applyWorld();
        S.title('Something is wrong', 'The present has changed', 4.5);
        S.objective('Drive back to Gzowska Labs', () => ws(S));
      },
      update(S) { return S.near(ws(S), 26); },
    },
    {
      id: '0.gone',
      enter(S) {
        S.say([
          L('c0_gone_1'),
          L('c0_gone_2'),
        ]).then(() => { S.flags.goneRead = true; });
      },
      update(S) { return !!S.flags.goneRead; },
    },
  ],
};

const chapter1 = {
  title: 'Chapter 1', name: 'The Blacksmith of 1885',
  steps: [
    {
      id: '1.statue',
      enter(S) {
        const st = S.props.sets.get('statue');
        S.objective('Find out who Kessler is: check the statue in town', () => st && st.spots.plaque);
        S.spot({ radius: 2.4, label: 'Read the plaque', pos: () => st && st.spots.plaque, onUse: () => S.say([
          L('c1_plaque_1'),
          L('c1_plaque_2'),
        ]).then(() => { S.flags.plaque = true; }) });
      },
      update(S) { return !!S.flags.plaque; },
    },
    {
      id: '1.guide',
      enter(S) {
        S.objective('Talk to the guide next to the statue', () => S.npc.pos('marta'));
        S.talk('marta', 'Talk to Marta', [
          L('c1_guide_1'),
          { ...L('c1_guide_2'), choices: [
            { ...L('c1_guide_c1'), then: [L('c1_guide_c1r')] },
            { ...L('c1_guide_c2'), then: [L('c1_guide_c2r')] },
          ] },
          L('c1_guide_3'),
        ], () => { S.flags.guide = true; });
      },
      update(S) { return !!S.flags.guide; },
    },
    {
      id: '1.back',
      enter(S) { S.objective('Jump to 1885 (Y: 1885, T, 88 mph) and get there before Kessler', () => HWY(S)); },
      update(S, dt, ev) { return arrived(S, ev, 1885); },
    },
    {
      id: '1.forge',
      enter(S) {
        S.flags.kesslerGone = false; S.applyWorld();
        const f = S.props.sets.get('forge');
        S.objective('Find the blacksmith\'s forge in town', () => (f ? f.spots.anvil : S.st.anchors.town));
        S.talk('kessler', 'Talk to the blacksmith', [
          L('c1_forge_1'),
          { ...L('c1_forge_2'), choices: [
            { ...L('c1_forge_c1'), do: (s) => { s.flags.helped = true; }, then: [L('c1_forge_c1r')] },
            { ...L('c1_forge_c2'), then: [L('c1_forge_c2r')] },
          ] },
        ], () => { S.flags.kesslerTalked = true; });
      },
      update(S) { return !!S.flags.kesslerTalked; },
    },
    {
      id: '1.race',
      enter(S) {
        const A = S.st.anchors, w = A.wash, f = S.props.sets.get('forge');
        const spot = S.props.findSpot(w.x + 18, w.z - 12, 0.4, 0.4, 0, 60);
        S.partAt = { x: spot.x, y: spot.y, z: spot.z };
        if (!S.part || !S.g.interact.items.includes(S.part)) S.part = S.item('part', { x: spot.x, y: spot.y + 0.4, z: spot.z });
        S.hintAt = { x: spot.x + 22, z: spot.z - 16 };
        const start = () => S.npc.walkTo('kessler', spot.x, spot.z, 1.45, () => { S.flags.kesslerThere = true; });
        if (S.flags.helped) setTimeout(start, 25000); else start();
        void f;
        S.objective('Find the fallen part in the dry wash before Kessler does', () => S.hintAt, 'Scanner');
      },
      update(S, dt) {
        const I = S.g.interact, held = S.heldItem();
        if (held && held.story === 'part') return true;
        if (S.st.frunk.includes('part')) return true;
        if (S.part && I.items.includes(S.part)) {
          const t = S.part.body.translation(), d = S.dist(t);
          const k = Math.max(0, Math.min(5, Math.round(5 - d / 40)));
          S.meta = 'Scanner ' + '▮'.repeat(k) + '▯'.repeat(5 - k);
          if (d < 40) S.target = () => S.part.body.translation();
          const kp = S.npc.pos('kessler');
          if (kp && Math.hypot(kp.x - t.x, kp.z - t.z) < 2.2 && !held) {
            I.removeItem(S.part); S.part = null; S.flags.kesslerHas = true;
            S.npc.gesture('kessler', 'cheer', 2);
            const f = S.props.sets.get('forge');
            setTimeout(() => S.npc.walkTo('kessler', f.spots.anvil.x, f.spots.anvil.z, 1.45), 2500);
            S.radio(L('c1_race_r1'), 3.5);
            S.jump('1.trade');
          }
        }
        return false;
      },
    },
    {
      id: '1.trade',
      enter(S) {
        if (!S.flags.kesslerHas) { S.next(); return; }
        S.allowTake = true;
        S.objective('Kessler has the part. Offer him a trade', () => S.npc.pos('kessler'));
        S.talk('kessler', 'Talk to Kessler', (s) => [
          L('c1_trade_1'),
          s.heldItem() && s.heldItem().story === 'canister'
            ? { ...L('c1_trade_2'), choices: [
              { ...L('c1_trade_c1'), do: (x) => { const it = x.heldItem(); x.g.interact.held = null; x.g.interact.removeItem(it); x.flags.traded = true; } },
              L('c1_trade_c2'),
            ] }
            : L('c1_trade_3'),
        ], () => {
          if (S.flags.traded) {
            const p = S.npc.pos('kessler');
            S.part = S.item('part', { x: p.x + 0.8, y: p.y + 1.2, z: p.z + 0.8 });
            S.say([L('c1_trade_4')]);
          }
        });
      },
      update(S) {
        if (!S.flags.traded) S.objective(S.heldItem() && S.heldItem().story === 'canister' ? 'Give Kessler the flux canister' : 'Take the flux canister from the frunk and bring it to Kessler', () => (S.heldItem() ? S.npc.pos('kessler') : S.frontOfCar()));
        const held = S.heldItem();
        return S.flags.traded && held && held.story === 'part';
      },
      exit(S) { S.allowTake = false; },
    },
    {
      id: '1.stow',
      enter(S) { S.objective('Put the part in the frunk', () => (S.heldItem() ? S.frontOfCar() : S.part ? S.part.body.translation() : null)); },
      update(S) { return S.st.frunk.includes('part'); },
    },
    {
      id: '1.home',
      enter(S) { S.radio(L('c1_home_r1'), 3); S.objective('Jump back to 2026 (Y: 2026, T, 88 mph)', () => HWY(S)); },
      update(S, dt, ev) { return arrived(S, ev, 2026); },
    },
    {
      id: '1.restored',
      enter(S) {
        S.flags.timeline = 'normal'; S.applyWorld();
        S.title('Timeline restored', 'The present is back', 3.5);
        S.objective('Drive to Gzowska Labs and talk to Ida', () => S.npc.pos('ida') || ws(S));
        S.talk('ida', 'Talk to Ida', [
          { ...L('c1_ida_1'), choices: [
            { ...L('c1_ida_c1'), then: [L('c1_ida_c1r')] },
            { ...L('c1_ida_c2'), then: [L('c1_ida_c2r')] },
          ] },
          L('c1_ida_2'),
        ], () => { S.flags.idaBack = true; });
      },
      update(S) { return !!S.flags.idaBack; },
    },
    {
      id: '1.bench',
      enter(S) {
        S.allowTake = true;
        const b = S.props.sets.get('ws_normal').spots.bench;
        S.spot({ radius: 2.2, holding: true, label: 'Put the nozzle on the bench', pos: () => b, enabled: () => !!(S.heldItem() && S.heldItem().story === 'part'), onUse: () => {
          const it = S.heldItem(); S.g.interact.held = null; S.g.interact.removeItem(it);
          S.benchPart = S.item('part', { x: b.x, y: b.y + 0.17, z: b.z }); S.benchPart.body.setBodyType(S.g.R.RigidBodyType.Fixed, true); S.flags.benched = true;
        } });
        S.objective('Take the nozzle from the frunk and put it on Ida\'s bench', () => (S.heldItem() ? b : S.frontOfCar()));
      },
      update(S) {
        const b = S.props.sets.get('ws_normal').spots.bench;
        S.target = S.heldItem() ? b : S.frontOfCar();
        return !!S.flags.benched;
      },
      exit(S) { S.allowTake = false; },
    },
    {
      id: '1.end',
      enter(S) {
        S.npc.face('ida', S.player().x, S.player().z);
        S.say([
          L('c1_end_1'),
          L('c1_end_2'),
        ]).then(() => { S.title('Chapter 1 complete', 'To be continued', 5); S.flags.ch1 = true; });
        S.objective('Listen to Ida');
      },
      update(S) { return !!S.flags.ch1; },
    },
  ],
};

export const CHAPTERS = [chapter0, chapter1];
