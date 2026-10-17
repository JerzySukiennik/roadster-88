// Roadster 88 voice line export: prints every story line with its voice settings and acting direction as JSON for web/tools/voice-bake.py.
import { LINES, VOICES, voiceOf } from '../src/story/lines.js';

const plain = (s) => s.replace(/\[([^\]]+)\]\(\/[^)]*\/\)/g, '$1');
const lines = Object.entries(LINES).map(([id, l]) => ({ id, text: l.say || l.text, plain: plain(l.say || l.text), voice: voiceOf(l), radio: !!l.radio, dir: l.dir || '' }));
process.stdout.write(JSON.stringify({ voices: VOICES, lines }));
