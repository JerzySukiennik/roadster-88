# Roadster 88 voice bake: speaks every story line with Gemini TTS (prebuilt voice and acting direction per character) or, as a fallback, Kokoro (Apache-2.0), trims silence, normalises loudness and writes assets/voice/<id>.mp3 plus manifest.json; each line is cached by a hash of engine, model, voice and prompt, so a re-run only redoes changed or fallback lines.
# usage: Niepotrzebne/tts/.venv/bin/python web/tools/voice-bake.py [--engine=scenes|gemini|kokoro] [--model=gemini-2.5-flash-preview-tts] [--rpm=8] [--force] [--only=id,id]
# --engine=scenes (default) records a whole scene per Gemini request (two speakers at most) and cuts it into lines with Whisper word timestamps, so the free tier (10 requests a day) covers a chapter.
import base64, hashlib, json, os, re, subprocess, sys, tempfile, time, urllib.error, urllib.request
import numpy as np, soundfile as sf

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(here, '..', '..'))
out = os.path.join(root, 'assets', 'voice')
os.makedirs(out, exist_ok=True)
args = sys.argv[1:]
opt = lambda k, d: next((a.split('=', 1)[1] for a in args if a.startswith(f'--{k}=')), d)
force = '--force' in args
only = opt('only', None); only = only.split(',') if only else None
engine = opt('engine', 'scenes'); model = opt('model', 'gemini-2.5-flash-preview-tts'); rpm = float(opt('rpm', '8'))
data = json.loads(subprocess.check_output(['node', os.path.join(here, 'voice-lines.mjs')]))
mpath = os.path.join(out, 'manifest.json')
manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
FF, FP = '/usr/local/bin/ffmpeg', '/usr/local/bin/ffprobe'
URL = 'https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent'


def api_key():
    for line in open(os.path.join(root, '.env')):
        if line.strip().startswith('GEMINI_API_KEY='):
            return line.split('=', 1)[1].strip().strip('"\'')
    raise SystemExit('GEMINI_API_KEY missing in .env')


KEY = api_key() if engine in ('gemini', 'scenes') else None
last_call = [0.0]
gemini_dead = [False]


def gemini(prompt, voice):
    speech = {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}} if isinstance(voice, str) else {'multiSpeakerVoiceConfig': {'speakerVoiceConfigs': [{'speaker': n, 'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': v}}} for n, v in voice]}}
    body = json.dumps({'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': speech}}).encode()
    for attempt in range(7):
        gap = 60.0 / rpm - (time.time() - last_call[0])
        if gap > 0: time.sleep(gap)
        last_call[0] = time.time()
        req = urllib.request.Request(URL.format(model), data=body, headers={'x-goog-api-key': KEY, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=180) as r: j = json.load(r)
            part = j['candidates'][0]['content']['parts'][0]['inlineData']
            return base64.b64decode(part['data'])
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')
            if e.code == 429 and 'PerDay' in msg:
                gemini_dead[0] = True; print('  gemini daily quota reached, falling back to Kokoro'); return None
            if e.code in (429, 500, 502, 503, 504):
                m = re.search(r'"retryDelay":\s*"(\d+)', msg)
                wait = int(m.group(1)) + 2 if m else min(90, 6 * 2 ** attempt)
                print(f'  gemini {e.code}, retry in {wait}s'); time.sleep(wait); continue
            print(f'  gemini {e.code}: {msg[:200]}'); return None
        except (urllib.error.URLError, TimeoutError, KeyError, IndexError) as e:
            wait = min(90, 6 * 2 ** attempt); print(f'  gemini error {type(e).__name__}, retry in {wait}s'); time.sleep(wait)
    return None


kokoro = [None]


def kokoro_say(text, v):
    if kokoro[0] is None:
        from kokoro import KPipeline
        kokoro[0] = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
    chunks = [a.numpy() if hasattr(a, 'numpy') else np.asarray(a) for _, _, a in kokoro[0](text, voice=v['voice'], speed=v['speed'])]
    return np.concatenate(chunks).astype(np.float32)


def finish(src_args, dst, v, pitch):
    filt = []
    if abs(pitch - 1) > 1e-3: filt += [f'asetrate={int(24000 * pitch)}', 'aresample=24000', f'atempo={1 / pitch:.5f}']
    filt += ['silenceremove=start_periods=1:start_threshold=-62dB:start_silence=0.07',
             'areverse', 'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.08', 'areverse',
             'highpass=f=70', f'loudnorm=I={-17 + v.get("gain", 0)}:TP=-1.5:LRA=9', 'aresample=24000', 'apad=pad_dur=0.06']
    subprocess.run([FF, '-loglevel', 'error', '-y', *src_args, '-af', ','.join(filt), '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '64k', dst], check=True)


SCENES = [
    ['c0_meet_1', 'c0_meet_2', 'c0_meet_c1', 'c0_meet_c1r', 'c0_meet_c2', 'c0_meet_c2r', 'c0_meet_3'],
    ['c0_jump_r1', 'c0_lost_r1', 'c0_lost_r2', 'c0_lost_r3'],
    ['c0_gone_1', 'c0_gone_2', 'c1_plaque_1', 'c1_plaque_2', 'c1_guide_3', 'c1_race_r1', 'c1_home_r1'],
    ['c1_guide_1', 'c1_guide_2', 'c1_guide_c1', 'c1_guide_c1r', 'c1_guide_c2', 'c1_guide_c2r'],
    ['c1_forge_1', 'c1_forge_2', 'c1_forge_c1', 'c1_forge_c1r', 'c1_forge_c2', 'c1_forge_c2r'],
    ['c1_trade_1', 'c1_trade_2', 'c1_trade_c1', 'c1_trade_c2', 'c1_trade_3', 'c1_trade_4'],
    ['c1_ida_1', 'c1_ida_c1', 'c1_ida_c1r', 'c1_ida_c2', 'c1_ida_c2r', 'c1_ida_2', 'c1_end_1', 'c1_end_2'],
    ['c2_ida_1', 'c2_ad_1', 'c2_ida_2', 'c2_ida_r1'],
    ['c2_city_t', 'c2_nova_1', 'c2_nova_2', 'c2_nova_c1', 'c2_nova_c1r', 'c2_nova_c2', 'c2_nova_c2r', 'c2_nova_3'],
    ['c2_hack_r1', 'c2_spot_r1', 'c2_vault_t', 'c2_escape_r1', 'c2_caught_r1', 'c2_lost_r1', 'c2_caught_t'],
    ['c2_nova_4', 'c2_nova_5', 'c2_page_t'],
]
NAME = {'ida': 'Ida', 'marta': 'Marta', 'kessler': 'Kessler', 'nova': 'Nova', 'ad': 'Announcer', 'you': 'Jurek', 'thought': 'Jurek'}
norm = lambda t: re.sub(r'[^a-z0-9 ]', ' ', t.lower().replace('-', ' ')).split()
asr = [None]


def stats(dst):
    dur = float(subprocess.check_output([FP, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst]).decode().strip())
    st = subprocess.run([FF, '-hide_banner', '-i', dst, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    mean = next((float(l.split(':')[1].split()[0]) for l in st.splitlines() if 'mean_volume' in l), 0.0)
    peak = next((float(l.split(':')[1].split()[0]) for l in st.splitlines() if 'max_volume' in l), 0.0)
    return dur, mean, peak


def scene(ids):
    from difflib import SequenceMatcher
    by = {L['id']: L for L in data['lines']}
    Ls = [by[i] for i in ids if i in by]
    names = []
    for L in Ls:
        n = NAME[L['voice']]
        if n not in names: names.append(n)
    if len(names) > 2: print('  scene has more than two speakers, skipped:', ids); return 0
    voices = {NAME[L['voice']]: data['voices'][L['voice']] for L in Ls}
    hint = []
    for w, h in [('Gzowska', 'Gzowska as GZOF-skah'), ('Gzowo', 'Gzowo as GZOH-voh'), ('Elias', 'Elias as ih-LIE-us')]:
        if any(w in L['plain'] for L in Ls): hint.append(h)
    who = ' '.join(f"{n}: {voices[n]['style'].replace('Say this as ', '').replace('Say this ', '')}." for n in names) if len(names) > 1 else ''
    dirs = ' '.join(f"Line {k + 1}: {L['dir']}." for k, L in enumerate(Ls) if L['dir'])
    if len(names) > 1:
        body = '\n'.join(f"{NAME[L['voice']]}: {L['plain']}" for L in Ls)
        voice = [(n, voices[n]['gemini']) for n in names]
        head = f"Voice actors read this scene line by line. {who}"
    else:
        body = '\n\n'.join(L['plain'] for L in Ls)
        voice = voices[names[0]]['gemini']
        head = voices[names[0]]['style'].rstrip('.') + ', reading these separate lines one after another.'
    prompt = f"{head} {dirs} {('Pronounce ' + ', '.join(hint) + '.') if hint else ''} Leave a pause of about one and a half seconds between lines.\n\n{body}"
    key = hashlib.sha1(json.dumps(['scene', model, voice, prompt]).encode()).hexdigest()[:12]
    if not force and all(manifest.get(L['id'], {}).get('key') == key and os.path.exists(os.path.join(out, L['id'] + '.mp3')) for L in Ls): return 0
    sim = '--simulate' in args
    if gemini_dead[0] and not sim: return 0
    if sim:
        parts = []
        for L in Ls:
            a = subprocess.run([FF, '-loglevel', 'error', '-i', os.path.join(out, L['id'] + '.mp3'), '-f', 's16le', '-ar', '24000', '-ac', '1', '-'], capture_output=True, check=True).stdout
            parts.append(a + b'\x00\x00' * int(24000 * (1.2 + 0.6 * (len(parts) % 2))))
        pcm = b''.join(parts)
    else:
        cache = os.path.join(root, 'Niepotrzebne', 'tts', 'scenes', key + '.pcm')
        if os.path.exists(cache): pcm = open(cache, 'rb').read(); print(f'  scene {ids[0]}: reusing the cached Gemini take')
        else:
            pcm = gemini(prompt, voice)
            if pcm: os.makedirs(os.path.dirname(cache), exist_ok=True); open(cache, 'wb').write(pcm)
    if not pcm: return 0
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, 'scene.wav')
        subprocess.run([FF, '-loglevel', 'error', '-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', '-', wav], input=pcm, check=True)
        if asr[0] is None:
            import whisper
            asr[0] = whisper.load_model('base.en')
        res = asr[0].transcribe(wav, language='en', word_timestamps=True, fp16=False)
        words = [(w['word'], w['start'], w['end']) for sg in res['segments'] for w in sg.get('words', [])]
        got, gt = [], []
        for w, a, b in words:
            for t in norm(w): got.append(t); gt.append((a, b))
        exp, owner = [], []
        for k, L in enumerate(Ls):
            for t in norm(L['plain']): exp.append(t); owner.append(k)
        mapping = {}
        for blk in SequenceMatcher(None, exp, got, autojunk=False).get_matching_blocks():
            for q in range(blk.size): mapping[blk.a + q] = blk.b + q
        span = []
        for k in range(len(Ls)):
            idx = [mapping[e] for e in range(len(exp)) if owner[e] == k and e in mapping]
            span.append((gt[min(idx)][0], gt[max(idx)][1]) if idx else None)
        total = len(pcm) / 2 / 24000
        sd = subprocess.run([FF, '-hide_banner', '-i', wav, '-af', 'silencedetect=noise=-42dB:d=0.3', '-f', 'null', '-'], capture_output=True, text=True).stderr
        st_ = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', sd)]; en_ = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', sd)]
        sil = [(a, b) for a, b in zip(st_, en_) if a > 0.05 and b < total - 0.05]
        cuts = None
        if all(span):
            cuts = [0.0]
            for k in range(len(Ls) - 1):
                lo, hi = span[k][1] - 0.15, span[k + 1][0] + 0.15
                cand = [g for g in sil if g[0] >= lo and g[1] <= hi]
                cuts.append((max(cand, key=lambda g: g[1] - g[0])[0] + max(cand, key=lambda g: g[1] - g[0])[1]) / 2 if cand else (span[k][1] + span[k + 1][0]) / 2)
            cuts.append(total)
        elif len(sil) >= len(Ls) - 1:
            top = sorted(sorted(sil, key=lambda g: g[1] - g[0], reverse=True)[:len(Ls) - 1])
            cuts = [0.0] + [(a + b) / 2 for a, b in top] + [total]
            for k, L in enumerate(Ls):
                c = len(L['plain']) / max(0.1, cuts[k + 1] - cuts[k])
                if c < 4 or c > 32: print(f'  silence cut for {L["id"]} looks wrong ({c:.1f} ch/s), scene kept on Kokoro'); return 0
            print('  (cut by silences: Whisper missed', [Ls[k]['id'] for k in range(len(Ls)) if not span[k]], ')')
        if not cuts or any(cuts[k + 1] <= cuts[k] for k in range(len(cuts) - 1)): print('  could not cut the scene into lines, scene kept on Kokoro'); return 0
        n = 0
        for k, L in enumerate(Ls):
            v = data['voices'][L['voice']]
            seg = os.path.join(td, f'{k}.wav')
            subprocess.run([FF, '-loglevel', 'error', '-y', '-i', wav, '-ss', f'{cuts[k]:.3f}', '-to', f'{cuts[k + 1]:.3f}', seg], check=True)
            dst = os.path.join(out if not sim else os.path.join(root, 'Niepotrzebne', 'tts', 'sim'), L['id'] + '.mp3')
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            finish(['-i', seg], dst, v, 1.0)
            dur, mean, peak = stats(dst)
            cps = len(L['plain']) / max(0.1, dur)
            if sim:
                ref = manifest.get(L['id'], {}).get('dur', 0)
                print(f"{L['id']:14s} sim cut {dur:5.2f}s vs original {ref:5.2f}s  {'OK' if abs(dur - ref) < 0.6 else 'MISMATCH'}"); n += 1; continue
            manifest[L['id']] = {'key': key, 'engine': 'gemini', 'dur': round(dur, 3), 'voice': L['voice'], 'mean': mean, 'peak': peak, 'cps': round(cps, 1)}
            flag = '  <-- check pace' if cps < 7 or cps > 24 else ''
            print(f"{L['id']:14s} gemini  {L['voice']:8s} {dur:5.2f}s  {cps:4.1f} ch/s  mean {mean:5.1f} dB  peak {peak:5.1f} dB{flag}", flush=True)
            n += 1
        if not sim: json.dump(manifest, open(mpath, 'w'), indent=0, sort_keys=True)
        return n


done = 0
if engine == 'scenes':
    listed = {i for sc in SCENES for i in sc}
    for sc in SCENES + [[L['id']] for L in data['lines'] if L['id'] not in listed]:
        if only and not any(i in only for i in sc): continue
        done += scene(sc)
for L in ([] if engine == 'scenes' else data['lines']):
    if only and L['id'] not in only: continue
    v = data['voices'][L['voice']]
    use_g = engine == 'gemini' and not gemini_dead[0]
    say = []
    if 'Gzowska' in L['plain']: say.append('pronounce Gzowska as GZOF-skah')
    if 'Gzowo' in L['plain']: say.append('pronounce Gzowo as GZOH-voh')
    prompt = f"{v['style']}{(', ' + L['dir']) if L['dir'] else ''}{(' (' + '; '.join(say) + ')') if say else ''}: {L['plain']}"
    key = hashlib.sha1(json.dumps(['gemini', model, v['gemini'], prompt] if use_g else ['kokoro', L['text'], v['voice'], v['speed'], v['pitch'], v.get('gain', 0)]).encode()).hexdigest()[:12]
    dst = os.path.join(out, L['id'] + '.mp3')
    if not force and manifest.get(L['id'], {}).get('key') == key and os.path.exists(dst): continue
    used = None
    with tempfile.TemporaryDirectory() as td:
        if use_g:
            pcm = gemini(prompt, v['gemini'])
            if pcm:
                raw = os.path.join(td, 'raw.pcm'); open(raw, 'wb').write(pcm)
                finish(['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', raw], dst, v, 1.0); used = 'gemini'
        if not used:
            raw = os.path.join(td, 'raw.wav'); sf.write(raw, kokoro_say(L['text'], v), 24000)
            finish(['-i', raw], dst, v, v.get('pitch', 1.0)); used = 'kokoro'
            if use_g: key = 'fallback'
        dur = float(subprocess.check_output([FP, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst]).decode().strip())
        stats = subprocess.run([FF, '-hide_banner', '-i', dst, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
        mean = next((float(l.split(':')[1].split()[0]) for l in stats.splitlines() if 'mean_volume' in l), 0.0)
        peak = next((float(l.split(':')[1].split()[0]) for l in stats.splitlines() if 'max_volume' in l), 0.0)
    cps = len(L['plain']) / max(0.1, dur)
    manifest[L['id']] = {'key': key, 'engine': used, 'dur': round(dur, 3), 'voice': L['voice'], 'mean': mean, 'peak': peak, 'cps': round(cps, 1)}
    json.dump(manifest, open(mpath, 'w'), indent=0, sort_keys=True)
    done += 1
    flag = '  <-- check pace' if cps < 8 or cps > 22 else ''
    print(f"{L['id']:14s} {used:7s} {L['voice']:8s} {dur:5.2f}s  {cps:4.1f} ch/s  mean {mean:5.1f} dB  peak {peak:5.1f} dB{flag}", flush=True)
size = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out) if f.endswith('.mp3'))
engines = {}
for m in manifest.values(): engines[m.get('engine', 'kokoro')] = engines.get(m.get('engine', 'kokoro'), 0) + 1
print(f'baked {done}, total {len(manifest)} lines {engines}, {size / 1024:.0f} KB')
