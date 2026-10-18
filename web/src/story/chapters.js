// Roadster 88 story chapters, "The Butterfly Effect": chapter 0 (the first test jump to 1885 loses a thruster nozzle and the present turns into Kessler's world) and chapter 1 (find out who Elias Kessler was, beat him to the fallen part in 1885 or trade for it, and bring the present back), as steps for the story director.
import { L } from './lines.js';
import { pointInPoly } from '../world/valley.js';
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
          S.loseNozzle();
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
        const A = S.st.anchors, at = S.flags.lostAt || { x: A.wash.x + 18, z: A.wash.z - 12 }, f = S.props.sets.get('forge');
        const spot = S.props.findSpot(at.x, at.z, 0.4, 0.4, 0, 60);
        S.partAt = { x: spot.x, y: spot.y, z: spot.z };
        if (!S.part || !S.g.interact.items.includes(S.part)) S.part = S.item('part', { x: spot.x, y: spot.y + 0.4, z: spot.z });
        S.hintAt = { x: spot.x + 22, z: spot.z - 16 };
        const start = () => S.npc.walkTo('kessler', spot.x, spot.z, 1.45, () => { S.flags.kesslerThere = true; });
        if (S.flags.helped) setTimeout(start, 25000); else start();
        void f;
        S.objective('Find your nozzle where you arrived in 1885, before Kessler does', () => S.hintAt, 'Scanner');
      },
      update(S, dt) {
        const I = S.g.interact, held = S.heldItem();
        if (S.holding('part')) return true;
        if (S.st.frunk.includes('part')) return true;
        if (S.part && I.items.includes(S.part)) {
          const t = S.part.body.translation(), d = S.dist(t);
          const k = Math.max(0, Math.min(5, Math.round(5 - d / 40)));
          S.meta = 'Scanner ' + '▮'.repeat(k) + '▯'.repeat(5 - k);
          if (d < 40) S.target = () => S.part.body.translation();
          const kp = S.npc.pos('kessler');
          if (kp && Math.hypot(kp.x - t.x, kp.z - t.z) < 2.2 && !held && !S.holding('part')) {
            S.removeItem(S.part); S.part = null; S.flags.kesslerHas = true;
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
          s.holding('canister')
            ? { ...L('c1_trade_2'), choices: [
              { ...L('c1_trade_c1'), do: (x) => { x.takeHeld('canister'); x.flags.traded = true; } },
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
        if (!S.flags.traded) S.objective(S.holding('canister') ? 'Give Kessler the flux canister' : 'Take the flux canister from the frunk and bring it to Kessler', () => (S.holding('canister') ? S.npc.pos('kessler') : S.frontOfCar()));
        return S.flags.traded && S.holding('part');
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
        S.spot({ radius: 2.2, holding: true, label: 'Put the nozzle on the bench', pos: () => b, enabled: () => S.holding('part'), onUse: () => {
          S.takeHeld('part');
          S.benchPart = S.item('part', { x: b.x, y: b.y + 0.17, z: b.z }); S.benchPart.body.setBodyType(S.g.R.RigidBodyType.Fixed, true); S.flags.benched = true; S.repairNozzle();
        } });
        S.objective('Take the nozzle from the frunk and put it on Ida\'s bench', () => (S.holding('part') ? b : S.frontOfCar()));
      },
      update(S) {
        const b = S.props.sets.get('ws_normal').spots.bench;
        S.target = S.holding('part') ? b : S.frontOfCar();
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
        ]).then(() => { S.title('Chapter 1 complete', 'To be continued', 5); S.flags.ch1 = true; S.endT = 0; });
        S.objective('Listen to Ida');
      },
      update(S, dt) { if (S.flags.ch1) S.endT = (S.endT || 0) + dt; return !!S.flags.ch1 && S.endT > 5.5; },
    },
  ],
};

const tower = (S) => S.props.sets.get('k_tower');
const inCity = (S, p) => { const V = S.g.valley, R = V && ['city', 'park'].map((id) => V.region(id)).filter(Boolean); return !R || !R.length || R.some((r) => pointInPoly(p.x, p.z, r.poly)); };
const hackerOf = (S, r) => (r ? { uid: r.uid } : { uid: (S.g.online && S.g.online.uid) || 'me' });

const chapter2 = {
  title: 'Chapter 2', name: 'City of the Future',
  steps: [
    {
      id: '2.start',
      enter(S) {
        S.flags.k2080 = true; S.applyWorld();
        S.objective('Listen to Ida', () => S.npc.pos('ida'));
        S.say([L('c2_ida_1')]).then(() => { S.radio(L('c2_ad_1'), 6); S.adT = 0; });
      },
      update(S, dt) {
        if (S.adT === undefined) return false;
        S.adT += dt;
        if (S.adT > 7.5 && !S.flags.c2told) { S.flags.c2told = true; S.say([L('c2_ida_2')]).then(() => { S.flags.c2go = true; }); }
        return !!S.flags.c2go;
      },
    },
    {
      id: '2.jump',
      enter(S) { S.objective('Jump to 2080 (Y: 2080, T, 88 mph)', () => HWY(S)); },
      update(S, dt, ev) { return arrived(S, ev, 2080) || (S.inYear(2080) && !S.g.tc.busy); },
    },
    {
      id: '2.city',
      enter(S) {
        S.applyWorld();
        if (!S.flags.c2seen && !S.flags.c2heard) { S.flags.c2heard = true; setTimeout(() => { S.radio(L('c2_arrive_r1'), 5); S.radio(L('c2_nova_r0'), 6); }, 1500); }
      },
      update(S) {
        const k = S.st.anchors.ktower, nova = () => S.npc.pos('nova') || S.st.anchors.nova;
        if (!S.flags.c2seen && k && S.anyNear(k, 650, (p) => inCity(S, p))) { S.flags.c2seen = true; S.radio(L('c2_city_t'), 4); }
        if (!S.flags.c2seen) { S.objective('Drive downtown to Gzowo City, where Kessler Tower stands', () => S.st.anchors.ktower); return false; }
        S.objective('Find Nova in Central Park', nova);
        return S.anyNear(nova(), 30);
      },
    },
    {
      id: '2.nova',
      enter(S) {
        S.objective(S.g.walker.active ? 'Talk to Nova' : 'Get out (F) and talk to Nova', () => S.npc.pos('nova'));
        S.talk('nova', 'Talk to Nova', [
          L('c2_nova_1'),
          { ...L('c2_nova_2'), choices: [{ ...L('c2_nova_c1'), then: [L('c2_nova_c1r')] }, { ...L('c2_nova_c2'), then: [L('c2_nova_c2r')] }] },
          L('c2_nova_3'),
        ], () => { S.flags.novaMet = true; });
      },
      update(S) { if (!S.flags.novaMet) S.objective(S.g.walker.active ? 'Talk to Nova' : 'Get out (F) and talk to Nova', () => S.npc.pos('nova')); return !!S.flags.novaMet; },
    },
    {
      id: '2.hack',
      enter(S) {
        const T = tower(S);
        S.hack = S.flags.hack || 0; S.spotT = -99;
        S.spot({ radius: 2.4, label: 'Take a decoy', pos: () => T.spots.crate, onUse: (pl, def, r) => S.giveItem('decoy', T.spots.crate, r) });
        S.spot({ radius: 2.2, hold: true, label: 'Hold E to hack the terminal', pos: () => T.spots.terminal, onHold: (sec, r) => {
          S.hacker = hackerOf(S, r); S.hackAt = performance.now();
          if (performance.now() - S.spotT < 1500) return;
          S.hack = Math.min(1, S.hack + sec / 12);
        } });
        S.objective('Hack the terminal at the foot of Kessler Tower (hold E). Stay out of the drones\' light', () => T.spots.terminal);
      },
      update(S, dt) {
        const T = tower(S), hacking = S.hacker && performance.now() - (S.hackAt || 0) < 600;
        const r = S.drones.update(dt, { hacker: hacking ? S.hacker : null }), me = (S.g.online && S.g.online.uid) || 'me';
        if (r.watching && (r.watching.local || r.watching.uid === me) && performance.now() - (S.beepT || 0) > 380) { S.beepT = performance.now(); if (S.g.audio) S.g.audio.play('ui_tap', { inside: true, gain: 0.55 }); }
        if (r.spotted && hacking && r.spotted.uid === S.hacker.uid) {
          if (performance.now() - S.spotT > 6000) S.radio(L('c2_spot_r1'), 3);
          S.spotT = performance.now(); S.hack = Math.max(0, S.hack - 0.25); S.hackSpots = (S.hackSpots || 0) + 1;
        }
        S.flags.hack = Math.round(S.hack * 100) / 100;
        S.meta = `Hack ${Math.round(S.hack * 100)}%`;
        S.net = { dr: S.drones.netState() };
        S.decoys();
        void T;
        return S.hack >= 1;
      },
      exit(S) { S.flags.hacked = true; },
    },
    {
      id: '2.roof',
      enter(S) {
        const T = tower(S);
        if (!S.flags.roofSaid) { S.flags.roofSaid = true; S.radio(L('c2_hack_r1'), 4); }
        S.spot({ radius: 3, label: 'Open the vault', pos: () => T.spots.vault, enabled: () => !S.holding('book') && !S.bookOut, onUse: (pl, def, r) => { S.bookOut = true; S.giveItem('book', T.spots.vault, r); } });
        S.objective('Fly the Roadster up to the landing pad on top of Kessler Tower and open the vault', () => (S.near(T.spots.pad, 40) && S.player().y > T.top - 10 ? T.spots.vault : T.spots.pad));
      },
      update(S, dt) {
        S.drones.update(dt, {}); S.net = { dr: S.drones.netState() }; S.decoys();
        if (S.holding('book')) { S.radio(L('c2_vault_t'), 4); return true; }
        return false;
      },
    },
    {
      id: '2.escape',
      enter(S) { S.radio(L('c2_escape_r1'), 3.5); S.clearT = 0; S.objective('Escape the drone swarm: get far away from Kessler Tower'); },
      update(S, dt) {
        const carrier = S.carrierOf('book');
        const r = S.drones.update(dt, { carrier, swarm: true }); S.net = { dr: S.drones.netState() };
        if (!carrier) { S.bookOut = false; S.jump('2.roof'); return false; }
        const P = S.drones.players().find((p) => p.uid === carrier.uid) || S.player();
        let near = 1e9; for (const d of S.drones.list) near = Math.min(near, Math.hypot(d.pos.x - P.x, d.pos.z - P.z));
        S.meta = near > 900 ? '' : `Nearest drone ${Math.round(near)} m`;
        if (r.caught && r.caught.uid === carrier.uid) {
          S.takeHeld('book'); S.bookOut = false; S.radio(L('c2_caught_r1'), 3.5); S.radio(L('c2_caught_t'), 3);
          for (const d of S.drones.list) { d.mode = 'patrol'; d.target = null; }
          S.jump('2.roof'); return false;
        }
        S.clearT = near > 260 ? S.clearT + dt : 0;
        return S.clearT > 3;
      },
      exit(S) { for (const d of S.drones.list) { d.mode = 'patrol'; d.target = null; } },
    },
    {
      id: '2.upload',
      enter(S) {
        S.radio(L('c2_lost_r1'), 3.5);
        S.objective('Bring the sketchbook to Nova in Central Park', () => S.npc.pos('nova'));
        S.talk('nova', 'Give Nova the sketchbook', [L('c2_nova_4')], () => {
          if (!S.holding('book')) return;
          S.takeHeld('book'); S.flags.free2080 = true; S.applyWorld(); S.drones.powerDown();
          S.say([L('c2_nova_5')]).then(() => { S.flags.uploaded = true; });
        });
      },
      update(S, dt) {
        S.drones.update(dt, {}); S.net = { dr: S.drones.netState() };
        if (!S.holding('book') && !S.flags.free2080) S.objective('Bring the sketchbook to Nova in Central Park (pick it up again)', () => S.itemPos('book') || S.npc.pos('nova'));
        return !!S.flags.uploaded;
      },
    },
    {
      id: '2.page',
      enter(S) {
        S.title('Gzowo City is free', 'The drones are down', 4);
        setTimeout(() => S.radio(L('c2_page_t'), 5), 2500);
        setTimeout(() => S.radio(L('c2_ida_r1'), 6), 2600);
        S.pageT = 0; S.objective('Read the last page');
      },
      update(S, dt) {
        S.pageT += dt;
        if (S.pageT > 14 && !S.flags.ch2) { S.flags.ch2 = true; S.title('Chapter 2 complete', 'Next: The Race', 6); }
        return !!S.flags.ch2;
      },
    },
  ],
};

export const CHAPTERS = [chapter0, chapter1, chapter2];
