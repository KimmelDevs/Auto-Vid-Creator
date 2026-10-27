"""Download the sound effects library listed in manifest.json from Mixkit.

    python sfx/download.py            # into this sfx folder
    python sfx/download.py D:/sounds  # somewhere else

Files that already exist are skipped, so it's safe to run again.
"""
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE
URL = 'https://assets.mixkit.co/active_storage/sfx/{0}/{0}-preview.mp3'


def fetch(item):
    rel, info = item
    dest = OUT / rel
    if dest.exists() and dest.stat().st_size > 0:
        return 'skip'
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(info.get('url') or URL.format(info['id']), headers={'User-Agent': 'Mozilla/5.0'})
        data = urllib.request.urlopen(req, timeout=60).read()
    except Exception as e:
        print(f'  ! {rel}: {e}')
        return 'fail'
    dest.write_bytes(data)
    return 'ok'


def main():
    items = list(json.loads((HERE / 'manifest.json').read_text(encoding='utf8')).items())
    print(f'{len(items)} sounds -> {OUT}')
    done = {'ok': 0, 'skip': 0, 'fail': 0}
    with ThreadPoolExecutor(8) as pool:
        for i, r in enumerate(pool.map(fetch, items), 1):
            done[r] += 1
            if i % 100 == 0 or i == len(items):
                print(f'  {i}/{len(items)}', flush=True)
    print(f"downloaded {done['ok']}, already had {done['skip']}, failed {done['fail']}")


if __name__ == '__main__':
    main()
