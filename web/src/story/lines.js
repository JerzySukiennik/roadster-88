// Roadster 88 story lines: every spoken line of the chapters with a stable id (the voice file is assets/voice/<id>.mp3), who says it, and the voice settings per character for the Kokoro bake in web/tools/voice-bake.py.
export const WHO = { IDA: 'IDA GZOWSKA', KES: 'ELIAS KESSLER', MARTA: 'MARTA, GUIDE', RADIO: 'IDA · RADIO', YOU: 'YOU', PLAQUE: 'PLAQUE' };

export const VOICES = {
  ida: { voice: 'af_bella', speed: 1.04, pitch: 1.0, gain: 0, gemini: 'Zephyr', style: 'Say this as Ida, an excited, fast-talking young inventor who has not slept in three days, words tumbling out' },
  marta: { voice: 'af_heart', speed: 1.0, pitch: 1.02, gain: 0, gemini: 'Aoede', style: 'Say this as Marta, a cheerful, friendly small-town tour guide, warm and welcoming' },
  kessler: { voice: 'am_michael', speed: 0.9, pitch: 0.92, gain: 1, gemini: 'Algenib', style: 'Say this slowly and warmly as Elias Kessler, an older blacksmith from the 1880s American frontier, with a gentle western drawl' },
  you: { voice: 'am_puck', speed: 1.06, pitch: 1.05, gain: 0, gemini: 'Puck', style: 'Say this as a 14-year-old boy, light, young and upbeat, quick and curious' },
  thought: { voice: 'am_puck', speed: 0.98, pitch: 1.05, gain: -2, gemini: 'Puck', style: 'Say this as the quiet inner thought of a 14-year-old boy, close to the microphone, soft and almost under his breath, like Peter Parker thinking to himself' },
};

export const SPEAKER = { [WHO.IDA]: 'ida', [WHO.RADIO]: 'ida', [WHO.MARTA]: 'marta', [WHO.KES]: 'kessler', [WHO.YOU]: 'you', [WHO.PLAQUE]: 'thought' };

const T = (who, text, o = {}) => ({ who, text, ...o });
const { IDA, KES, MARTA, RADIO, YOU, PLAQUE } = WHO;

export const LINES = {
  c0_meet_1: T(IDA, 'There you are! The time circuits are finally calibrated. I haven\'t slept in three days.'),
  c0_meet_2: T(IDA, 'One test jump. 1885, a few seconds there, then straight back. What could possibly go wrong?'),
  c0_meet_c1: T(YOU, 'Let\'s do it.'),
  c0_meet_c1r: T(IDA, 'That\'s the spirit.'),
  c0_meet_c2: T(YOU, 'Famous last words.'),
  c0_meet_c2r: T(IDA, 'Ha. Very funny. Nothing will go wrong. Probably.', { dir: 'laughing it off nervously' }),
  c0_meet_3: T(IDA, 'First, the flux canister on my bench. Carry it to your Roadster and put it in the frunk. The circuits drink it like coffee.'),
  c0_jump_r1: T(RADIO, 'Perfect. Now type 1885 on the year pad (Y), arm the circuits (T) and hit 88 on Highway 88.', { radio: true, say: 'Perfect. Now type 1885 on the year pad, arm the circuits and hit 88 on Highway 88.' , dir: 'proud and businesslike over the radio' }),
  c0_lost_r1: T(RADIO, 'You did it! You\'re in 1885! The signal is... breaking... up...', { radio: true, dropout: true , dir: 'the radio signal is breaking up, so trail off as you go' }),
  c0_lost_r2: T(RADIO, 'Wait. Telemetry says the arrival surge just RIPPED OFF YOUR FRONT-LEFT NOZZLE?! No time, the return window is closing!', { radio: true, say: 'Wait. Telemetry says the arrival surge just ripped off your front-left nozzle?! No time, the return window is closing!' , dir: 'suddenly panicked' }),
  c0_lost_r3: T(RADIO, 'Set 2026, arm and floor it. Come back NOW!', { radio: true, say: 'Set 2026, arm and floor it. Come back now!' , dir: 'shouting urgently' }),
  c0_gone_1: T(YOU, 'Gzowska Labs is gone. There\'s a Kessler Jet store where the workshop was. And who is Kessler?', { thought: true, say: '[Gzowska](/ɡzˈɔfskə/) Labs is gone. There\'s a Kessler Jet store where the workshop was. And who is Kessler?' }),
  c0_gone_2: T(YOU, 'Ida isn\'t answering the radio. Kessler billboards everywhere. Did that nozzle do all this?', { thought: true }),
  c1_plaque_1: T(PLAQUE, 'ELIAS KESSLER, 1841 to 1919. In 1885 he found a fallen star on the old road and forged the first Kessler Jet from its metal.', { say: '[Elias](/ɪlˈIəs/) Kessler, eighteen forty-one to nineteen nineteen. In 1885 he found a fallen star on the old road and forged the first Kessler Jet from its metal.' }),
  c1_plaque_2: T(PLAQUE, 'Gzowo Springs, birthplace of the jet age, remembers him with gratitude.', { say: '[Gzowo](/ɡzˈɔvO/) Springs, birthplace of the jet age, remembers him with gratitude.' }),
  c1_guide_1: T(MARTA, 'Welcome to Kessler Square! Elias Kessler was a blacksmith right here, back in 1885.', { say: 'Welcome to Kessler Square! [Elias](/ɪlˈIəs/) Kessler was a blacksmith right here, back in 1885.' }),
  c1_guide_2: T(MARTA, 'Legend says he found a piece of a fallen star out on the old road, right where a strange horseless carriage vanished in a ball of fire that same day.', { say: 'Legend says he found a piece of a fallen star out on the old road, right where a strange [horseless](/hˈɔɹsləs/) carriage vanished in a ball of fire that same day.' }),
  c1_guide_c1: T(YOU, 'A horseless carriage, huh?', { say: 'A [horseless](/hˈɔɹsləs/) carriage? Huh.' }),
  c1_guide_c1r: T(MARTA, 'Silly story, I know. Anyway, he forged the star metal into the first jet nozzle. The rest is history.'),
  c1_guide_c2: T(YOU, 'Where did the star fall?'),
  c1_guide_c2r: T(MARTA, 'Right where the carriage vanished, out on the old road. Folks still look for scorch marks there.'),
  c1_guide_3: T(YOU, 'The star was my nozzle. If I grab it before Kessler does, none of this happens.', { thought: true }),
  c1_forge_1: T(KES, 'Afternoon, stranger. Fine carriage you got there. Where are the horses?'),
  c1_forge_2: T(KES, 'Strangest morning of my life. A fiery carriage vanished out on the road, and a star fell right where it was, shiny as a new dollar. Soon as I finish this shoe, I\'m fetching it.'),
  c1_forge_c1: T(YOU, 'Can I help with that horseshoe?'),
  c1_forge_c1r: T(KES, 'Ha! Kind of you. Hold the tongs... steady... there. Well, that took a while. I\'m off.', { dir: 'amused, pausing while working the tongs' }),
  c1_forge_c2: T(YOU, 'Good luck with that.'),
  c1_forge_c2r: T(KES, 'Thank you kindly. Off I go.'),
  c1_race_r1: T(YOU, 'No! Kessler got there first. Maybe he will trade?', { thought: true , dir: 'frustrated, then thinking fast' }),
  c1_trade_1: T(KES, 'Looking for this, stranger? Strange metal. Not for sale.', { dir: 'sly and teasing' }),
  c1_trade_2: T(KES, 'Now that red can you\'re holding... I\'ve never seen anything like it. A trade?'),
  c1_trade_c1: T(YOU, 'Deal. Take the flux canister.'),
  c1_trade_c2: T(YOU, 'Not yet.'),
  c1_trade_3: T(KES, 'Bring me something just as strange and we can talk. That carriage of yours must carry something.'),
  c1_trade_4: T(KES, 'Pleasure doing business. Mind the edges, it\'s sharp.'),
  c1_home_r1: T(YOU, 'Got it. Back to 2026, and let\'s hope this works.', { thought: true }),
  c1_ida_1: T(IDA, 'You\'re back! You were gone for, what, two seconds? Why do you look like you\'ve seen a ghost?', { dir: 'relieved and puzzled' }),
  c1_ida_c1: T(YOU, 'Long story.'),
  c1_ida_c1r: T(IDA, 'They always are with time machines.'),
  c1_ida_c2: T(YOU, 'Your nozzle fell off in 1885.'),
  c1_ida_c2r: T(IDA, 'It WHAT? The arrival surge must have ripped it off. Oh no no no.', { say: 'It what? The arrival surge must have ripped it off. Oh no no no.' , dir: 'shocked, then panicking' }),
  c1_ida_2: T(IDA, 'Bring that nozzle here and put it on my bench. Carefully!'),
  c1_end_1: T(IDA, 'There, it\'s back on and good as new. Thank you. And next time, check the bolts before you break history.'),
  c1_end_2: T(IDA, 'Strange, though. The radio just mentioned Kessler Street. We don\'t have a Kessler Street. Do we?', { dir: 'puzzled and a little worried' }),
};

export const L = (id, o = {}) => ({ ...LINES[id], v: id, ...o });

export function voiceOf(line) { return line.thought ? 'thought' : SPEAKER[line.who] || 'you'; }
