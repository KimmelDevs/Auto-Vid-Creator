"""autovid: SRT + numbered grid images -> narrated, animated doodle video.

    python autovid/autovid.py <story_folder> [--render] [--out video.mp4]

The story folder holds one .srt, an images/ folder (1.png, 2.png, ...) and an
optional config.json. See README.md for the folder layout and every SRT tag.
"""
import argparse
import asyncio
import os
import hashlib
import json
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
    'captions': True,
    'subscribe_at': 20,          # seconds; null to disable (a [subscribe] tag also works)
    'end_card': {'text': 'To be continued...', 'sub': "Subscribe so you don't miss it!"},
    'auto_effects': False,       # add shakes/flashes from keywords when the SRT has no effect tags
    'browser': os.environ.get('REMOTION_BROWSER'),  # optional path to chrome-headless-shell
}
EFFECTS = {'shake', 'flash', 'boom', 'zoom', 'heartbeat', 'red', 'glitch', 'rewind', 'fade', 'dark', 'light',
           'whole', 'subscribe', 'knock', 'label', 'pause'}
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


def build(folder, name=None, render=False, out=None):
    folder = Path(folder).resolve()
    cfg = dict(DEFAULTS)
    if (folder / 'config.json').exists():
        cfg.update(json.loads((folder / 'config.json').read_text(encoding='utf8')))
    srt = sorted(folder.glob('*.srt'))
    if not srt:
        sys.exit(f'no .srt in {folder}')
    imgs = sorted([p for p in (folder / 'images').glob('*') if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')], key=natural_key)
    if not imgs:
        sys.exit(f'no images in {folder / "images"}')
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
    subprocess.run([FF, '-y', *inputs, '-filter_complex_script', str(fc), '-map', '[out]', '-ar', '44100', '-ac', '2', str(dest / 'voice.wav')],
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
        if kind in ('obj', 'pause'):
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

    has_sub_tag = any(f['type'] == 'subscribe' for f in fx)
    job = {
        'dir': f'jobs/{name}',
        'audio': 'voice.wav',
        'end': end,
        'panels': panels,
        'fx': sorted(fx, key=lambda f: f['t']),
        'voice': [{'text': it['text'], 'at': round(it['at'], 2), 'dur': round(it['dur'], 2)} for it in items],
        'captions': bool(cfg['captions']),
        'endCard': cfg['end_card'],
        'subscribeAt': None if has_sub_tag else cfg['subscribe_at'],
    }
    props = dest / 'props.json'
    props.write_text(json.dumps({'job': job}))
    late = max(it['at'] - it['start'] for it in items)
    print(f'  voice {len(items)} sentences, ends {end:.1f}s (max drift {late:.1f}s); {len(known)} tagged objects; {len(fx)} effects')

    if render:
        out = Path(out or (folder / f'{name}.mp4')).resolve()
        cmd = ['npx', 'remotion', 'render', 'src/index.ts', 'Auto', str(out), f'--props={props}', '--concurrency=3', '--log=error']
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
    a = ap.parse_args()
    build(a.folder, a.name, a.render, a.out)
