"""autovid: SRT + numbered grid images -> narrated, animated doodle video.

    python autovid/autovid.py <story_folder> [--render] [--out video.mp4]

The story folder holds one .srt, an images/ folder (1.png, 2.png, ...) and an
optional config.json. See README.md for the folder layout and every SRT tag.
"""
import argparse
import asyncio
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import edge_tts
import imageio_ffmpeg
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent  # the Remotion project
FF = imageio_ffmpeg.get_ffmpeg_exe()
DEFAULTS = {
    'voice': 'en-US-AndrewMultilingualNeural',
    'rate': '+6%',
    'pitch': '-2Hz',
    'grid': [2, 3],              # rows, cols of objects in every image
    'mode': 'storyboard',        # 'storyboard': camera travels the whole page; 'focus': each object alone, centred
    'captions': True,
    'subscribe_at': 20,          # seconds; null to disable (a [subscribe] tag also works)
    'end_card': {'text': 'To be continued...', 'sub': "Subscribe so you don't miss it!"},
    'auto_effects': False,       # add shakes/flashes from keywords when the SRT has no effect tags
    'caption_style': 'words',    # 'words': highlight each word as it's spoken; 'line': plain line
    'music': None,               # background music, path inside sfx_dir (e.g. "bgm/dark/xyz.mp3"); ducks under the voice
    'music_vol': 15,             # percent
    'hook': False,               # open with a dramatic line from later in the video, then rewind to the start
    'short_len': 55,             # seconds, for --short (vertical 9:16 clip)
    'browser': os.environ.get('REMOTION_BROWSER', 'C:/Users/Admin/AppData/Local/Temp/rhs/chrome-headless-shell.exe'),  # used only if it exists
    # [sfx:...] / [amb:...] paths are relative to this: the repo's sfx/ once downloaded, else ../sfx
    'sfx_dir': str(ROOT / 'sfx' if any((ROOT / 'sfx').glob('*/*.mp3')) or not (ROOT.parent / 'sfx').exists() else ROOT.parent / 'sfx'),
}
EFFECTS = {'shake', 'flash', 'boom', 'zoom', 'heartbeat', 'red', 'glitch', 'rewind', 'fade', 'dark', 'light',
           'whole', 'subscribe', 'knock', 'label', 'pause', 'hook'}
TAG = re.compile(r'\[([^\]]+)\]')
OBJ = re.compile(r'^(\d+)(?:[.\-](\d+))?$')


def natural_key(p):
    return [int(s) if s.isdigit() else s for s in re.split(r'(\d+)', p.stem)]


def to_sec(x):
    h, m, rest = x.strip().split(':')
    sec, ms = rest.replace('.', ',').split(',')
    return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000


def parse_srt(path):
    raw = path.read_text(encoding='utf-8-sig').replace('\r', '')
    cues = []
    for b in re.split(r'\n{2,}', raw.strip()):
        lines = b.split('\n')
        i = next(k for k, l in enumerate(lines) if '-->' in l)
        a, z = lines[i].split('-->')
        cues.append({'a': to_sec(a), 'b': to_sec(z), 'text': ' '.join(lines[i + 1:])})
    return cues


def parse_tag(body):
    """'1.2, shake:big' -> [('obj', (1, 2)), ('shake', 'big')]"""
    body = body.strip()
    m = re.match(r'(sfx|amb|amb-stop)\s*:\s*(.+)$', body, re.I | re.S)
    if m:
        # [sfx:fight/punch.mp3 vol=40 fade-in fade-out loop x3]  [amb:...]  [amb-stop:name]
        kind, rest = m[1].lower(), m[2].split()
        if kind == 'amb-stop':
            # [amb-stop:a,b] stops several loops at once
            return [('sound', {'kind': kind, 'file': f.strip(), 'loop': False}) for f in ' '.join(rest).split(',') if f.strip()]
        snd = {'kind': kind, 'file': rest[0], 'vol': 100, 'fade_in': False, 'fade_out': False, 'loop': kind == 'amb', 'times': 1}
        for opt in rest[1:]:
            k, _, v = opt.lower().partition('=')
            if k == 'vol':
                snd['vol'] = float(v or 100)
            elif k in ('fade-in', 'fade_in', 'fadein'):
                snd['fade_in'] = True
            elif k in ('fade-out', 'fade_out', 'fadeout'):
                snd['fade_out'] = True
            elif k == 'loop':
                snd['loop'] = True
            elif re.fullmatch(r'x\d+', k):
                snd['times'] = max(1, int(k[1:]))
            else:
                print(f'  ! unknown sound option "{opt}" in [{body}] ignored')
        return [('sound', snd)]
    if body.lower().startswith('label'):
        return [('label', body.split(':', 1)[1].strip() if ':' in body else '')]
    out = []
    for tok in re.split(r'[,\s]+', body):
        if not tok:
            continue
        m = OBJ.match(tok)
        if m:
            out.append(('obj', (int(m[1]), int(m[2] or 1))))
            continue
        name, _, arg = tok.partition(':')
        name = name.lower()
        if name not in EFFECTS:
            print(f'  ! unknown tag [{tok}] ignored')
            continue
        out.append((name, arg or None))
    return out


def words_and_tags(cues):
    """Words with SRT-estimated times, plus tags attached to the index of the word that follows them."""
    words, tags = [], []
    for c in cues:
        parts = TAG.split(c['text'])
        clean = [w for i, p in enumerate(parts) if i % 2 == 0 for w in p.split()]
        total = sum(len(w) + 1 for w in clean) or 1
        acc = 0
        for i, p in enumerate(parts):
            if i % 2 == 1:
                for tg in parse_tag(p):
                    tags.append((len(words), tg, c['a'] + (c['b'] - c['a']) * acc / total))
                continue
            for w in p.split():
                words.append({'w': w, 'srt': c['a'] + (c['b'] - c['a']) * acc / total})
                acc += len(w) + 1
    return words, tags


def sentences(words):
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        if re.search(r'[.!?]["\u201d\')]?$', w['w']):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def duration(path):
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', subprocess.run([FF, '-i', str(path)], capture_output=True, text=True).stderr)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])


async def tts_all(items, cfg, cache):
    sem = asyncio.Semaphore(6)

    async def one(it):
        if it['mp3'].exists() and it['mp3'].stat().st_size > 0:
            return
        async with sem:
            await edge_tts.Communicate(it['text'], cfg['voice'], rate=cfg['rate'], pitch=cfg['pitch']).save(str(it['mp3']))

    await asyncio.gather(*(one(it) for it in items))


def peak_db(f, cache):
    """Loudest point of a sound file in dB, remembered in .cache/sfx_peaks.json."""
    store = cache / 'sfx_peaks.json'
    peaks = json.loads(store.read_text()) if store.exists() else {}
    key = f'{f}|{f.stat().st_mtime_ns}'
    if key not in peaks:
        err = subprocess.run([FF, '-i', str(f), '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
        m = re.search(r'max_volume: ([-\d.]+) dB', err)
        peaks[key] = float(m[1]) if m else 0.0
        store.write_text(json.dumps(peaks))
    return peaks[key]


def mix_sounds(wav, out, sounds, end, sfx_dir, cache, music=None, music_vol=15):
    """Lay [sfx]/[amb] sounds (list of (time, spec)) under the narration in wav, written to out.
    out is overwritten in place, never renamed: the studio player may hold it open."""
    sfx_dir = Path(sfx_dir)
    stops = {}  # amb name -> stop times
    for t, s in sounds:
        if s['kind'] == 'amb-stop':
            stops.setdefault(Path(s['file']).stem.lower(), []).append(t)
    inputs, filters, n = ['-i', str(wav)], [], 0
    for t, s in sounds:
        if s['kind'] == 'amb-stop':
            continue
        f = sfx_dir / s['file']
        if not f.exists():
            print(f'  ! sound not found: {s["file"]}')
            continue
        d = duration(f)
        # Mixkit files differ by up to 40 dB, so bring every file's peak to -1 dB first;
        # then vol=100 is full level for any sound (capped at +30 dB for near-silent files)
        level = min(30.0, -1.0 - peak_db(f, cache))
        # xN repeats a one-shot back to back (e.g. three heartbeats)
        for r in range(1 if s['loop'] else s.get('times', 1)):
            at = t + r * (d + 0.1)
            if s['loop']:
                later = [x for x in stops.get(f.stem.lower(), []) if x > at]
                if not later:
                    print(f'  ! loop {f.stem} at {at:.0f}s has no [amb-stop:{f.stem}] after it, so it plays to the end')
                length = (min(later) if later else end) - at
                fi, fo = 1.5, 1.5
            else:
                length = min(d, end - at)
                fi, fo = 0.3, min(1.0, length / 2)
            if length <= 0.05:
                continue  # before adding the input, so input numbers stay in step with [n:a]
            inputs += (['-stream_loop', '-1'] if s['loop'] else []) + ['-i', str(f)]
            n += 1
            ms = int(at * 1000)
            chain = [f'atrim=0:{length:.3f}', 'asetpts=PTS-STARTPTS', 'aformat=sample_rates=44100:channel_layouts=stereo',
                     f'volume={level:.2f}dB', f'volume={s["vol"] / 100:.3f}']
            if s['fade_in']:
                chain.append(f'afade=t=in:d={min(fi, length / 2):.2f}')
            if s['fade_out'] or s['loop']:
                chain.append(f'afade=t=out:st={max(0, length - fo):.3f}:d={fo:.2f}')
            chain.append(f'adelay={ms}|{ms}')
            filters.append(f'[{n}:a]{",".join(chain)}[s{n}]')
    mus = sfx_dir / music if music else None
    if mus and not mus.exists():
        print(f'  ! music not found: {music}')
        mus = None
    if not n and not mus:
        shutil.copyfile(wav, out)
        return 0
    labels = ''.join(f'[s{i}]' for i in range(1, n + 1))
    if mus:
        # music loops under everything and ducks (sidechain) whenever the narrator speaks
        mi = n + 1
        inputs += ['-stream_loop', '-1', '-i', str(mus), '-i', str(wav)]
        level = min(30.0, -1.0 - peak_db(mus, cache))
        filters.append(f'[{mi}:a]atrim=0:{end:.3f},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo,'
                       f'volume={level:.2f}dB,volume={music_vol / 100:.3f},afade=t=in:d=2,afade=t=out:st={max(0, end - 3):.3f}:d=3[mus]')
        filters.append(f'[{mi + 1}:a]aformat=sample_rates=44100:channel_layouts=stereo[key]')
        filters.append('[mus][key]sidechaincompress=threshold=0.015:ratio=10:attack=40:release=700[duck]')
        labels += '[duck]'
        n_in = n + 2
    else:
        n_in = n + 1
    filters.append(f'[0:a]{labels}amix=inputs={n_in}:normalize=0:duration=first,alimiter=limit=0.9:level=0,atrim=0:{end}[out]')
    fc = cache / 'sfx_filter.txt'
    fc.write_text(';'.join(filters))
    subprocess.run([FF, '-y', *inputs, '-filter_complex_script', str(fc), '-map', '[out]', '-ar', '44100', '-ac', '2', str(out)],
                   check=True, capture_output=True)
    return n


def grid_boxes(path, rows, cols):
    im = np.array(Image.open(path).convert('L').resize((1920, 1080)))
    ink = im < 200
    cw, ch = 1920 // cols, 1080 // rows
    out = []
    for r in range(rows):
        for c in range(cols):
            x0, y0 = c * cw, r * ch
            cell = ink[y0:y0 + ch, x0:x0 + cw]
            xs = np.where(cell.sum(axis=0) > 2)[0]
            ys = np.where(cell.sum(axis=1) > 2)[0]
            if len(xs) == 0 or len(ys) == 0:
                out.append([x0 + 40, y0 + 40, cw - 80, ch - 80])
            else:
                out.append([int(x0 + xs[0]), int(y0 + ys[0]), int(xs[-1] - xs[0]), int(ys[-1] - ys[0])])
    return out


def part_number(name):
    m = re.findall(r'\d+', name)
    return int(m[-1]) if m else 1


HOOK_WORDS = re.compile(r'scream|blood|dead|die|died|kill|gun|shot|roar|attack|bite|teeth|claw|grab|drag|torn|ripped|fire|'
                        r'explo|crash|monster|raider|knife|spear|crush|snap|broke|howl|hunt|jaw|eaten|scream|run', re.I)


def pick_hook(items, tags, words, end):
    """The sentence to open with: the one holding a [hook] tag, else the most dramatic line in the middle of the video."""
    for wi, (kind, _), _ in tags:
        if kind == 'hook':
            for it in items:
                if wi in it['idx'] or (it['idx'] and it['idx'][0] >= wi):
                    return it
    best, score = None, 0.0
    for it in items:
        pos = it['at'] / max(end, 1)
        n = len(it['idx'])
        if not 0.25 <= pos <= 0.92 or not 5 <= n <= 26:
            continue
        sc = 2 * len(HOOK_WORDS.findall(it['text'])) + it['text'].count('!') + 0.5 * ('"' in it['text'])
        if sc > score:
            best, score = it, sc
    return best


def add_hook(mix, out, hs, he, hook_dur, sfx_dir):
    """out = the hook line (hs..he of mix) + a short rewind + the whole mix."""
    seg = he - hs
    inputs = ['-i', str(mix)]
    f = [f'[0:a]atrim={hs:.3f}:{he:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.08,afade=t=out:st={max(0, seg - 0.3):.3f}:d=0.3,'
         f'apad=whole_dur={hook_dur:.3f}[h]', '[0:a]asetpts=PTS-STARTPTS[m]', '[h][m]concat=n=2:v=0:a=1[c]']
    rw = next((p for p in [sfx_dir / 'transitions/tape_rewind_transition.mp3', sfx_dir / 'transitions/fast_tape_rewind_cinematic_transition.mp3'] if p.exists()), None)
    if rw:
        inputs += ['-i', str(rw)]
        ms = int(max(0, hook_dur - 0.9) * 1000)
        f.append(f'[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.5,adelay={ms}|{ms}[r]')
        f.append('[c][r]amix=inputs=2:normalize=0:duration=first[out]')
    else:
        f[-1] = '[h][m]concat=n=2:v=0:a=1[out]'
    subprocess.run([FF, '-y', *inputs, '-filter_complex', ';'.join(f), '-map', '[out]', '-ar', '44100', '-ac', '2', str(out)],
                   check=True, capture_output=True)


def build(folder, name=None, render=False, out=None, short=False):
    folder = Path(folder).resolve()
    cfg = dict(DEFAULTS)
    if (folder / 'config.json').exists():
        cfg.update(json.loads((folder / 'config.json').read_text(encoding='utf8')))
    srt = sorted(folder.glob('*.srt'))
    if not srt:
        sys.exit(f'no .srt in {folder}')
    imgs = sorted([p for p in (folder / 'images').glob('*') if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')], key=natural_key)
    if not imgs:
        # no pictures yet: still build the narration, the video shows big captions only
        print(f'  no images in {folder / "images"}: building a captions-only (listen) version')
    name = name or re.sub(r'[^A-Za-z0-9_-]+', '_', folder.name)
    dest = ROOT / 'public' / 'jobs' / name
    dest.mkdir(parents=True, exist_ok=True)
    cache = folder / '.cache'
    cache.mkdir(exist_ok=True)
    rows, cols = cfg['grid']
    K = rows * cols
    print(f'{name}: {srt[0].name}, {len(imgs)} images x {K} objects')

    cues = parse_srt(srt[0])
    words, tags = words_and_tags(cues)
    total_srt = cues[-1]['b']

    # ---- voice: one TTS clip per sentence, placed at the SRT time the sentence starts
    sents = sentences(words)
    pauses = {}
    for wi, (kind, arg), _ in tags:
        if kind == 'pause':
            pauses[wi] = pauses.get(wi, 0) + float(arg or 1)
    items = []
    for s in sents:
        text = ' '.join(words[i]['w'] for i in s)
        h = hashlib.md5(f"{cfg['voice']}|{cfg['rate']}|{cfg['pitch']}|{text}".encode()).hexdigest()[:16]
        items.append({'idx': s, 'text': text, 'start': words[s[0]]['srt'], 'mp3': cache / f'{h}.mp3',
                      'pause': sum(v for k, v in pauses.items() if k == s[0])})
    asyncio.run(tts_all(items, cfg, cache))
    shift = 0.0
    prev_end = 0.0
    inputs, filters = [], []
    for i, it in enumerate(items):
        shift += it['pause']
        nxt = items[i + 1]['start'] + shift if i + 1 < len(items) else total_srt + shift
        start = it['start'] + shift
        d = duration(it['mp3'])
        tempo = min(1.15, max(1.0, d / max(nxt - start - 0.08, 0.5)))
        it['dur'] = d / tempo
        it['at'] = max(start, prev_end + 0.12 + (it['pause'] if prev_end else 0))
        prev_end = it['at'] + it['dur']
        inputs += ['-i', str(it['mp3'])]
        ms = int(it['at'] * 1000)
        filters.append(f'[{i}:a]atempo={tempo:.3f},adelay={ms}|{ms}[a{i}]')
    end = round(max(prev_end + 0.8, total_srt + shift), 2)
    mix = ''.join(f'[a{i}]' for i in range(len(items)))
    filters.append(f'{mix}amix=inputs={len(items)}:normalize=0,apad=whole_dur={end},atrim=0:{end},loudnorm=I=-16:TP=-1.5[out]')
    fc = cache / 'filter.txt'
    fc.write_text(';'.join(filters))
    subprocess.run([FF, '-y', *inputs, '-filter_complex_script', str(fc), '-map', '[out]', '-ar', '44100', '-ac', '2', str(cache / 'voice_raw.wav')],
                   check=True, capture_output=True)

    # actual time of every word, from where its sentence was placed
    wtime = [0.0] * len(words)
    for it in items:
        lens = [len(words[i]['w']) + 1 for i in it['idx']]
        tot = sum(lens)
        acc = 0
        for i, L in zip(it['idx'], lens):
            wtime[i] = it['at'] + it['dur'] * acc / tot
            acc += L
    tag_time = lambda wi: wtime[wi] if wi < len(words) else end - 0.5  # noqa: E731
    sent_starts = [it['at'] for it in items]

    # ---- sound effects and ambience, mixed under the narration
    sounds = [(round(tag_time(wi), 2), arg) for wi, (kind, arg), _ in tags if kind == 'sound']
    n_snd = mix_sounds(cache / 'voice_raw.wav', cache / 'voice_mix.wav', sounds, end, cfg['sfx_dir'], cache,
                       cfg.get('music'), float(cfg.get('music_vol') or 15))
    for it in items:
        it['wt'] = [round(wtime[i] - it['at'], 2) for i in it['idx']]
    hook_item = pick_hook(items, tags, words, end)

    # ---- object timing: tagged objects are anchors, the rest are spread between anchors and snapped to sentences
    n_obj = len(imgs) * K
    known = {}
    for wi, (kind, arg), _ in tags:
        if kind == 'obj':
            n, k = arg
            if 1 <= n <= len(imgs) and 1 <= k <= K:
                known[(n - 1) * K + (k - 1)] = tag_time(wi)
    known.setdefault(0, 0.0)
    anchors = sorted(known.items())
    times = [0.0] * n_obj
    tail = end - 2.0
    for g in range(n_obj):
        if g in known:
            times[g] = known[g]
            continue
        lo = max((a for a in anchors if a[0] < g), key=lambda a: a[0])
        hi = min((a for a in anchors if a[0] > g), key=lambda a: a[0], default=(n_obj, tail))
        t = lo[1] + (hi[1] - lo[1]) * (g - lo[0]) / (hi[0] - lo[0])
        near = [s for s in sent_starts if abs(s - t) <= 2.0]
        times[g] = min(near, key=lambda s: abs(s - t)) if near else t
    for g in range(1, n_obj):
        if g not in known and times[g] < times[g - 1] + 2.0:
            times[g] = times[g - 1] + 2.0

    # ---- effects
    fx = []
    for wi, (kind, arg), _ in tags:
        if kind in ('obj', 'pause', 'sound', 'hook'):
            continue
        t = round(tag_time(wi), 2)
        if kind == 'knock':
            for j in range(int(arg or 1)):
                fx.append({'t': round(t + j * 1.1, 2), 'type': 'knock'})
        elif kind in ('red', 'heartbeat', 'label') and arg and kind != 'label':
            fx.append({'t': t, 'type': kind, 'dur': float(arg)})
        else:
            fx.append({'t': t, 'type': kind, 'arg': arg})
    if cfg['auto_effects'] and not fx:
        kw = re.compile(r'strike|slam|explo|blast|gunshot|gunfire|shot|crash|bang|knock|punch|shove', re.I)
        for it in items:
            if kw.search(it['text']):
                fx.append({'t': round(it['at'] + 0.3, 2), 'type': 'flash' if re.search(r'explo|blast|shot', it['text'], re.I) else 'shake'})

    # ---- images
    panels = []
    for n, p in enumerate(imgs, 1):
        out_name = f'img{n:02d}{p.suffix.lower()}'
        shutil.copyfile(p, dest / out_name)
        panels.append({'src': out_name, 'starts': [round(times[(n - 1) * K + k], 2) for k in range(K)], 'boxes': grid_boxes(p, rows, cols)})

    # ---- hook intro: replay a dramatic line first, then the story from the start
    hook = None
    if cfg.get('hook') and hook_item and imgs:
        hs, he = max(0.0, hook_item['at'] - 0.15), min(end, hook_item['at'] + hook_item['dur'] + 0.45)
        g = max([g for g in range(n_obj) if times[g] <= hook_item['at'] + 0.2] or [0])
        hook = {'at': round(hs, 2), 'dur': round(he - hs + 0.5, 2), 'panel': g // K, 'obj': g % K,
                'voice': {'text': hook_item['text'], 'at': round(hook_item['at'] - hs, 2), 'dur': round(hook_item['dur'], 2), 'wt': hook_item['wt']}}
        add_hook(cache / 'voice_mix.wav', dest / 'voice.wav', hs, he, hook['dur'], Path(cfg['sfx_dir']))
    else:
        shutil.copyfile(cache / 'voice_mix.wav', dest / 'voice.wav')

    has_sub_tag = any(f['type'] == 'subscribe' for f in fx)
    job = {
        'dir': f'jobs/{name}',
        'audio': 'voice.wav',
        'end': end,
        'panels': panels,
        'fx': sorted(fx, key=lambda f: f['t']),
        'voice': [{'text': it['text'], 'at': round(it['at'], 2), 'dur': round(it['dur'], 2), 'wt': it['wt']} for it in items],
        'captionStyle': cfg.get('caption_style', 'words'),
        'hook': hook,
        # for the studio timeline only
        'sounds': [{'t': t, 'file': snd['file'], 'kind': snd['kind']} for t, snd in sounds],
        'captions': bool(cfg['captions']),
        'endCard': cfg['end_card'],
        'subscribeAt': None if has_sub_tag else cfg['subscribe_at'],
        'mode': cfg['mode'],
    }
    props = dest / 'props.json'
    props.write_text(json.dumps({'job': job}))
    late = max(it['at'] - it['start'] for it in items)
    print(f'  voice {len(items)} sentences, ends {end:.1f}s (max drift {late:.1f}s); {len(known)} tagged objects; {len(fx)} effects; {n_snd} sounds')

    comp = 'Auto'
    if short:
        # 9:16 clip around the most dramatic line, for Shorts/TikTok
        pick = hook_item or items[len(items) // 2]
        length = min(float(cfg.get('short_len') or 55), end)
        want = max(0.0, pick['at'] - length * 0.45)
        start = max([it['at'] - 0.2 for it in items if it['at'] - 0.2 <= want] or [0.0])
        start = max(0.0, min(start, end - length))
        yt = cfg.get('youtube') or {}
        series = yt.get('series') or re.sub(r'[_\d]+$', '', folder.name).replace('_', ' ').strip().title()
        title = (yt.get('title') or '{series} (Part {n})').replace('{n}', str(part_number(folder.name))).replace('{series}', series)
        offset = hook['dur'] if hook else 0.0
        sprops = dest / 'short_props.json'
        sprops.write_text(json.dumps({'job': job, 'short': {'start': round(start + offset, 2), 'dur': round(length, 2), 'title': title}}))
        props, comp = sprops, 'AutoShort'
        print(f'  short: {length:.0f}s from {start:.1f}s')

    if render or short:
        out = Path(out or (folder / f'{name}{"_short" if short else ""}.mp4')).resolve()
        cmd = ['npx', 'remotion', 'render', 'src/index.ts', comp, str(out), f'--props={props}', '--concurrency=3', '--log=error']
        if cfg.get('browser') and Path(cfg['browser']).exists():
            cmd.append(f"--browser-executable={cfg['browser']}")
        print('  rendering ->', out)
        subprocess.run(' '.join(f'"{c}"' if ' ' in c else c for c in cmd), cwd=ROOT, check=True, shell=True)
    return props


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('folder', help='story folder with one .srt and an images/ folder')
    ap.add_argument('--name', help='job name (defaults to the folder name)')
    ap.add_argument('--render', action='store_true', help='render the mp4 after building')
    ap.add_argument('--out', help='output mp4 path (default: <folder>/<name>.mp4)')
    ap.add_argument('--short', action='store_true', help='render a vertical 9:16 Short around the most dramatic line instead')
    a = ap.parse_args()
    build(a.folder, a.name, a.render, a.out, a.short)
