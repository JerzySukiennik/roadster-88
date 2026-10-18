// Roadster 88 story lines: every spoken line of the chapters with a stable id (the voice file is assets/voice/<id>.mp3), who says it, and the voice settings per character for the Kokoro bake in web/tools/voice-bake.py.
export const WHO = { IDA: 'IDA GZOWSKA', KES: 'ELIAS KESSLER', MARTA: 'MARTA, GUIDE', RADIO: 'IDA · RADIO', YOU: 'YOU', PLAQUE: 'PLAQUE', NOVA: 'NOVA', NRADIO: 'NOVA · RADIO', AD: 'KESSLER AEROSPACE · 2080' };

export const VOICES = {
  ida: { voice: 'af_bella', speed: 1.04, pitch: 1.0, gain: 0, gemini: 'Zephyr', style: 'Say this as Ida, an excited, fast-talking young inventor who has not slept in three days, words tumbling out' },
  marta: { voice: 'af_heart', speed: 1.0, pitch: 1.02, gain: 0, gemini: 'Aoede', style: 'Say this as Marta, a cheerful, friendly small-town tour guide, warm and welcoming' },
  kessler: { voice: 'am_michael', speed: 0.9, pitch: 0.92, gain: 1, gemini: 'Algenib', style: 'Say this slowly and warmly as Elias Kessler, an older blacksmith from the 1880s American frontier, with a gentle western drawl' },
  you: { voice: 'am_puck', speed: 1.06, pitch: 1.05, gain: 0, gemini: 'Puck', style: 'Say this as a 14-year-old boy, light, young and upbeat, quick and curious' },
  nova: { voice: 'af_nova', speed: 1.06, pitch: 1.03, gain: 0, gemini: 'Leda', style: 'Say this as Nova, a quick, confident teenage hacker from 2080, a little cheeky, talking fast and low as if someone might be listening' },
  ad: { voice: 'bm_george', speed: 0.98, pitch: 0.98, gain: 0, gemini: 'Charon', style: 'Say this as a smooth, slick corporate radio announcer reading a glossy advert' },
  thought: { voice: 'am_puck', speed: 0.98, pitch: 1.05, gain: -2, gemini: 'Puck', style: 'Say this as the quiet inner thought of a 14-year-old boy, close to the microphone, soft and almost under his breath, like Peter Parker thinking to himself' },
};

export const SPEAKER = { [WHO.IDA]: 'ida', [WHO.RADIO]: 'ida', [WHO.MARTA]: 'marta', [WHO.KES]: 'kessler', [WHO.YOU]: 'you', [WHO.PLAQUE]: 'thought', [WHO.NOVA]: 'nova', [WHO.NRADIO]: 'nova', [WHO.AD]: 'ad' };

const T = (who, text, o = {}) => ({ who, text, ...o });
const { IDA, KES, MARTA, RADIO, YOU, PLAQUE, NOVA, NRADIO, AD } = WHO;

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

Object.assign(LINES, {
  c2_ida_1: T(IDA, 'Okay, Kessler Street was weird. But listen to this. The radio keeps catching an advert from the year 2080.', { dir: 'uneasy, then curious' }),
  c2_ad_1: T(AD, 'Kessler Aerospace. Drawing fire carriages since 1885. Kessler drones keep Gzowo City safe, every second of every day.', { radio: true, say: 'Kessler Aerospace. Drawing fire carriages since 1885. Kessler drones keep [Gzowo](/ɡzˈɔvO/) City safe, every second of every day.' }),
  c2_ida_2: T(IDA, 'Fire carriages since 1885? That is your Roadster! Kessler must have seen you vanish. Go to 2080 and find out what he started.', { dir: 'alarmed and fast' }),
  c2_city_t: T(YOU, 'Whoa. Drones everywhere. And that is my car on every billboard. Drawn by hand.', { thought: true, dir: 'amazed, a bit scared' }),
  c2_nova_1: T(NOVA, 'Hey. Over here, under the trees. You are the one from the sketches. The fire carriage.', { dir: 'whispering urgently' }),
  c2_nova_2: T(NOVA, 'Kessler Corp runs this city with those drones. They built all of it from one sketchbook. Elias Kessler\'s. It is locked in the vault on top of their tower.', { say: 'Kessler Corp runs this city with those drones. They built all of it from one sketchbook. [Elias](/ɪlˈIəs/) Kessler\'s. It is locked in the vault on top of their tower.' }),
  c2_nova_c1: T(YOU, 'How do I get in?'),
  c2_nova_c1r: T(NOVA, 'The terminal at the foot of the tower opens the roof. Hold it until the hack is done, and stay out of the drones\' light.'),
  c2_nova_c2: T(YOU, 'Why do you need the sketchbook?'),
  c2_nova_c2r: T(NOVA, 'Proof. Kessler says he invented all of it. The book shows he copied a stranger\'s car. Yours.'),
  c2_nova_3: T(NOVA, 'Take a decoy from the crate by the terminal. Throw it and the drones chase the noise for a while. Good luck, fire carriage.', { dir: 'grinning' }),
  c2_hack_r1: T(NRADIO, 'You are in! The roof is open. Fly up to the landing pad, eight hundred meters up.', { radio: true, dir: 'excited' }),
  c2_spot_r1: T(NRADIO, 'They saw you! Get out of the light and try again.', { radio: true, dir: 'alarmed' }),
  c2_vault_t: T(YOU, 'Elias Kessler\'s sketchbook. And that is my Roadster on the very first page.', { thought: true, dir: 'awed, quiet', say: '[Elias](/ɪlˈIəs/) Kessler\'s sketchbook. And that is my Roadster on the very first page.' }),
  c2_escape_r1: T(NRADIO, 'The whole swarm is after you! Lose them, get far away from the tower!', { radio: true, dir: 'shouting' }),
  c2_caught_r1: T(NRADIO, 'They took the book back to the vault! Go up and grab it again.', { radio: true, dir: 'frustrated' }),
  c2_lost_r1: T(NRADIO, 'You lost them! Bring me the book. I am in the park.', { radio: true, dir: 'relieved' }),
  c2_nova_4: T(NOVA, 'This is it. Every page is your car. I am putting all of it online. The whole city will see.', { dir: 'determined' }),
  c2_nova_5: T(NOVA, 'Look up! The drones are shutting down. The Kessler logo is going dark!', { dir: 'overjoyed' }),
  c2_page_t: T(YOU, 'Wait. The last page. Two fire carriages raced past my forge the night the star fell.', { thought: true, dir: 'slowly, realising something' }),
  c2_ida_r1: T(RADIO, 'Two? On the night of your first jump? Then someone else was there. Come back. We need to talk.', { radio: true, dir: 'serious and worried' }),
  c2_caught_t: T(YOU, 'They got the book. Fine. Back up to the roof.', { thought: true }),
});

export const L = (id, o = {}) => ({ ...LINES[id], v: id, ...o });

export function voiceOf(line) { return line.thought ? 'thought' : SPEAKER[line.who] || 'you'; }
