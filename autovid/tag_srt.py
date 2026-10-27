"""One-off helper for the 60 Days bunker series: writes autovid [tags] into the
existing Part_XX SRTs and lays out stories/partXX/ folders ready for autovid.

    python autovid/tag_srt.py            # all parts
    python autovid/tag_srt.py 3 4        # some parts

Object tags [n.k] come from the image prompts' timing; effect tags come from
keywords in the narration and in the object descriptions. Edit the tagged SRTs
by hand afterwards if a beat lands wrong.
"""
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from autovid import parse_srt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
prompts = json.load(open(ROOT / 'art/all_prompts.json', encoding='utf8'))['items']

# Part 1 was timed by hand
P1_STARTS = [[0, 11.6, 14.6, 19.9, 25.6, 28.6], [31.9, 38.5, 44.0, 49.5, 54.8, 58.6], [63.1, 68.4, 73.7, 79.0, 82.8, 88.7],
             [98.45, 103.0, 106.2, 110.3, 113.8, 119.4], [124.2, 128.0, 133.8, 137.8, 147.8, 150.6], [153.5, 158.9, 166.0, 170.4, 172.2, 174.7],
             [180.06, 184.1, 188.3, 193.4, 197.85, 201.9], [211.2, 218.5, 220.8, 226.5, 231.9, 238.3], [241.1, 245.6, 249.9, 256.5, 261.5, 266.6],
             [276.1, 280.6, 287.6, 292.3, 296.4, 298.9]]
P1_FX = [(11.61, 'boom'), (31.9, 'rewind'), (33.0, 'label: 10 days earlier'), (98.45, 'label: Day 1'), (110.35, 'boom'), (110.4, 'red:3'),
         (121.0, 'shake'), (125.2, 'shake:big'), (131.3, 'flash'), (166.3, 'boom'), (179.3, 'shake'), (193.5, 'shake'), (226.5, 'label: Day 2'),
         (252.0, 'shake:small'), (255.0, 'shake:small'), (258.0, 'shake:small'), (276.1, 'dark'), (287.8, 'knock:3'), (296.5, 'shake'), (296.6, 'heartbeat:3')]

NUM = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12,
       'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
       'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60}
SENT_FX = [
    (re.compile(r'explo|blast|detonat', re.I), 'boom'),
    (re.compile(r'gunshot|gunfire|shot rang|fired|shots|pistol cracked|rifle crack', re.I), 'flash'),
    (re.compile(r'\bknock', re.I), 'knock'),
    (re.compile(r'slam|struck|strikes|smash|crash|shove|punch|kicked|rammed|threw|thrown|collaps|tremb|shook|shudder', re.I), 'shake'),
    (re.compile(r'alarm|siren|warning light|red light', re.I), 'red:3'),
    (re.compile(r'heart pound|heartbeat|held (your|her|his) breath|froze|frozen', re.I), 'heartbeat:3'),
    (re.compile(r'static|glitch|signal broke|crackl', re.I), 'glitch'),
]
OBJ_FX = re.compile(r'impact|burst|blast|slam|gunfire|gunshot|fires|firing|knock|shov|strik|crash|bang|explo|blows|shudder', re.I)


def day_number(words):
    total = 0
    for w in re.split(r'[-\s]', words.lower()):
        w = re.sub(r'[^a-z0-9]', '', w)
        if w.isdigit():
            return int(w)
        if w in NUM:
            total += NUM[w]
        elif total:
            break
    return total or None


STOP = set(('a an the and or of to in on with by at for from into onto over under is are was were be been it its his her their '
             'your you we our they them he she him this that these those as while then than so but not no one two three four '
             'small big tiny little drawn draw drawing show showing like very just has have had who what when where').split())


def stem(w):
    w = re.sub(r'[^a-z]', '', w.lower())
    for suf in ('ing', 'ed', 'es', 's'):
        if len(w) > 4 and w.endswith(suf):
            return w[:-len(suf)]
    return w


def bag(text):
    return {s for s in (stem(w) for w in text.split()) if len(s) > 2 and s not in STOP}


def align(objs, words):
    """Pin every object to the narration sentence that best matches its description.

    Monotonic dynamic programming over (object, sentence): word overlap scores the match,
    a small pull toward the object's evenly spaced position keeps unmatched objects sensible.
    Returns the word index where each object's tag goes."""
    sents, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        # clauses, not just sentences, so a drawing never switches in the middle of a phrase
        if re.search(r'[.!?]["”]?$', w['w']) or i == len(words) - 1 or (len(cur) >= 3 and re.search(r'[,;:—]["”]?$', w['w'])):
            sents.append(cur)
            cur = []
    sb = [bag(' '.join(words[i]['w'] for i in s)) for s in sents]
    st = [words[s[0]]['t'] for s in sents]
    total = words[-1]['t'] or 1
    N, M = len(objs), len(sents)

    def score(i, j):
        ob = bag(objs[i][2])
        return len(ob & sb[j]) / (len(ob) ** 0.5 + 1) * 3 - 0.015 * abs(st[j] - total * i / N)

    S = [[score(i, j) for j in range(M)] for i in range(N)]
    NEG = -1e9
    dp = [[NEG] * M for _ in range(N)]
    bk = [[0] * M for _ in range(N)]
    for j in range(M):
        dp[0][j] = S[0][j] - (0 if j == 0 else 2)
    for i in range(1, N):
        best, bj = NEG, 0
        for j in range(M):
            if j > 0 and dp[i - 1][j - 1] > best:
                best, bj = dp[i - 1][j - 1], j - 1
            cand, cj = best, bj
            if dp[i - 1][j] - 1.5 > cand:  # two objects on one sentence: allowed, discouraged
                cand, cj = dp[i - 1][j] - 1.5, j
            dp[i][j] = cand + S[i][j]
            bk[i][j] = cj
    j = max(range(M), key=lambda x: dp[N - 1][x])
    path = [0] * N
    for i in range(N - 1, -1, -1):
        path[i] = j
        j = bk[i][j]
    out = []
    for i, j in enumerate(path):
        same = [x for x in range(N) if path[x] == j]
        s = sents[j]
        out.append(s[int(len(s) * same.index(i) / len(same))])
    return out


def tag_part(part):
    src = sorted((ROOT / 'srt').glob(f'Part_{part:02d}_*.srt'))[0]
    cues = parse_srt(src)
    # word list with SRT-estimated times
    words = []
    for ci, c in enumerate(cues):
        ws = c['text'].split()
        tot = sum(len(w) + 1 for w in ws) or 1
        acc = 0
        for wi, w in enumerate(ws):
            words.append({'cue': ci, 'i': wi, 'w': w, 't': c['a'] + (c['b'] - c['a']) * acc / tot})
            acc += len(w) + 1
    starts = [words[0]['t']] + [words[i + 1]['t'] for i, w in enumerate(words[:-1]) if re.search(r'[.!?]["”]?$', w['w'])]
    inserts = {}  # word index -> [tags]

    def put(t, tag):
        wi = min(range(len(words)), key=lambda i: abs(words[i]['t'] - t))
        inserts.setdefault(wi, []).append(tag)

    # objects
    if part == 1:
        for n in range(1, 11):
            for k, t in enumerate(P1_STARTS[n - 1]):
                put(t, f'{n}.{k + 1}')
    else:
        objs = [(n, k + 1, o) for n in range(1, 11) for k, o in enumerate(prompts[f'{part:02d}-{n:02d}']['list'])]
        for (n, k, o), wi in zip(objs, align(objs, words)):
            inserts.setdefault(wi, []).append(f'{n}.{k}')
            if OBJ_FX.search(o):
                inserts.setdefault(min(wi + 1, len(words) - 1), []).append('shake')
    # effects from the narration
    if part == 1:
        for t, tag in P1_FX:
            put(t, tag)
    else:
        dark = False
        for i, w in enumerate(words):
            if i == 0 or re.search(r'[.!?]["”]?$', words[i - 1]['w']):
                sent = ' '.join(x['w'] for x in words[i:i + 40]).split('. ')[0]
                m = re.match(r'(Days?)\s+([A-Za-z0-9\- ]+?)[.,:]', sent)
                if m and day_number(m[2]):
                    put(w['t'], f'label: Day {day_number(m[2])}')
                    if dark:
                        put(w['t'], 'light')
                        dark = False
                if re.search(r'\bthat night\b|\bat night\b|lights went out|went dark|midnight', sent, re.I) and not dark:
                    put(w['t'], 'dark')
                    dark = True
                if re.search(r'\bmorning\b|\bdawn\b|sunrise', sent, re.I) and dark:
                    put(w['t'], 'light')
                    dark = False
                for rx, tag in SENT_FX:
                    mm = rx.search(sent)
                    if mm:
                        if tag == 'knock':
                            tag = 'knock:3' if re.search(r'three (slow |heavy )?knocks', sent, re.I) else 'knock'
                        # land the effect on the word that triggers it
                        off = len(sent[:mm.start()].split())
                        put(words[min(i + off, len(words) - 1)]['t'], tag)
                        break
        # night only lasts until the next image: lift [dark] at the next n.1 unless [light] comes first
        state, dark_on = False, None
        for wi in sorted(inserts):
            tags = inserts[wi]
            if 'light' in tags:
                state = False
            if 'dark' in tags:
                state, dark_on = True, wi
            elif state and any(re.fullmatch(r'\d+\.1', t) for t in tags) and wi > dark_on:
                tags.insert(0, 'light')
                state = False
    # rebuild SRT text with tags
    per_cue = {}
    for wi, w in enumerate(words):
        per_cue.setdefault(w['cue'], []).append(''.join(f'[{t}]' for t in inserts.get(wi, [])) + w['w'])
    raw = src.read_text(encoding='utf-8-sig').replace('\r', '')
    blocks = re.split(r'\n{2,}', raw.strip())
    out = []
    for ci, b in enumerate(blocks):
        lines = b.split('\n')
        i = next(k for k, l in enumerate(lines) if '-->' in l)
        out.append('\n'.join(lines[:i + 1] + [' '.join(per_cue.get(ci, []))]))
    folder = ROOT / 'stories' / f'part{part:02d}'
    (folder / 'images').mkdir(parents=True, exist_ok=True)
    (folder / f'Part_{part:02d}_tagged.srt').write_text('\n\n'.join(out) + '\n', encoding='utf8')
    for n in range(1, 11):
        img = ROOT / 'public' / f'p{part:02d}' / f'img{n:02d}.png'
        if img.exists():
            shutil.copyfile(img, folder / 'images' / f'{n}.png')
    cfg = {'end_card': {'text': f'Part {part + 1} coming next...', 'sub': "Subscribe so you don't miss it!"} if part < 15
           else {'text': 'The End', 'sub': 'Subscribe for the next story!'}}
    (folder / 'config.json').write_text(json.dumps(cfg, indent=1))
    n_tags = sum(len(v) for v in inserts.values())
    print(f'part {part:02d}: {n_tags} tags, images {len(list((folder / "images").glob("*.png")))}/10')


if __name__ == '__main__':
    for p in [int(a) for a in sys.argv[1:]] or range(1, 16):
        tag_part(p)
