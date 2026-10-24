# Auto-Vid-Creator

SRT + images → narrated doodle video, rendered with [Remotion](https://www.remotion.dev/).

One command turns a subtitle file and a set of numbered storyboard images into a
finished 1920×1080 video. It adds a male narrator voice, moves the camera across each
image, reveals the drawings in ink, burns in captions, adds a subscribe pop-up and an
end card, and fires effects that you write directly in the SRT.

You only make the images (ChatGPT). Everything else is automatic.

## 1. Make a story folder

```
my_story/
  my_story.srt        ← your narration, with [tags] (see below)
  images/
    1.png             ← image 1: a grid of objects 1.1 … 1.6
    2.png             ← image 2: objects 2.1 … 2.6
    …
  config.json         ← optional settings
```

- **Images** are numbered `1.png, 2.png, 3.png …` (jpg/webp work too). Each image is a
  grid: by default **2 rows × 3 columns = 6 objects**, read like a book:

  ```
  n.1  n.2  n.3
  n.4  n.5  n.6
  ```

  Use a white background and leave empty space between objects. The tool finds each
  object inside its grid cell automatically.
- **One SRT** per folder. Its timing sets the pace of the voice.

## 2. Run it

```bash
python autovid/autovid.py my_story --render
```

This writes `my_story/my_story.mp4`. Run it from this project folder. Without `--render` it
only builds the job, which is useful for checking the printed summary before a long render.

The first run makes the voice clips, and later runs reuse them from `my_story/.cache/`.
Edit tags and re-run, and only changed sentences are spoken again.

## 3. Write the SRT

Write the SRT normally. Then put **tags in square brackets** right before the word where
the thing should happen. Tags are removed from the voice and the captions.

```
3
00:00:11,614 --> 00:00:14,590
[1.2][boom]Something heavy strikes the bunker door. Inside,

4
00:00:14,590 --> 00:00:19,875
[1.3]Lena sits on the only decent bed, refusing to look at you.
```

Several tags can sit together, `[1.2][boom]`, or share brackets, `[1.2, boom]`.
Tags are timed to the **word right after them** as the narrator says it. So
`then [shake]the door burst open` shakes on "the".

### Object tags: when each drawing appears

| Tag | Meaning |
|---|---|
| `[1.1]` … `[1.6]` | Show object 6 of image 1, etc. The camera moves to it and it is inked in. |
| `[3]` | Same as `[3.1]`: image 3 starts here, the page slides in. |

You don't have to tag every object. Tagged ones are fixed, and untagged ones are spread
evenly between them and nudged onto sentence starts. With **no object tags at all**,
images and objects are spread evenly over the whole video.

### Effect tags

| Tag | What you see | Options |
|---|---|---|
| `[shake]` | Camera shake | `[shake:small]` `[shake:big]` |
| `[boom]` | Big shake + yellow flash + zoom punch (explosions, hits on a door) | |
| `[flash]` | White flash (gunshot, lightning) | `[flash:red]` `[flash:orange]` `[flash:yellow]` `[flash:blue]` |
| `[knock]` | One knock-shake | `[knock:3]` = three knocks, 1.1 s apart |
| `[zoom]` | Quick punch-in and back on the current object | |
| `[heartbeat]` | Pulsing zoom, tense moment (3 s) | `[heartbeat:5]` = seconds |
| `[red]` | Red alarm glow pulsing at the edges (3 s) | `[red:3]` = seconds |
| `[glitch]` | Colour-split jitter (radio static, signal loss) | |
| `[rewind]` | VHS rewind lines + ◀◀ (flashbacks) | |
| `[fade]` | Dip to black and back (time skip) | |
| `[dark]` | Night tint stays on… | |
| `[light]` | …until this turns it off | |
| `[whole]` | Pull back to show the whole page now | |
| `[label: Day 2]` | Hand-drawn sticker top-left for 5 s | any text |
| `[subscribe]` | Subscribe button pop-up with a click and the bell | |
| `[pause:1.5]` | Silence before the next sentence (seconds). Pushes later lines back | |

Unknown tags are skipped with a warning, so a typo never breaks a render.

## 4. config.json (optional)

```json
{
  "voice": "en-US-AndrewMultilingualNeural",
  "rate": "+6%",
  "pitch": "-2Hz",
  "grid": [2, 3],
  "captions": true,
  "subscribe_at": 20,
  "end_card": {"text": "Part 2 coming next...", "sub": "Subscribe so you don't miss it!"},
  "auto_effects": false
}
```

| Key | Meaning |
|---|---|
| `voice` | Any edge-tts voice. Other male options: `en-US-GuyNeural`, `en-US-ChristopherNeural`, `en-US-BrianNeural`, `en-US-EricNeural`. List them all with `python -m edge_tts --list-voices` |
| `rate`, `pitch` | Speech speed and pitch, e.g. `"+10%"`, `"-3Hz"` |
| `grid` | `[rows, cols]` of objects per image, e.g. `[1, 3]` for 3 objects side by side |
| `captions` | `false` to hide the caption box |
| `subscribe_at` | Seconds into the video for the subscribe pop-up. `null` = off. A `[subscribe]` tag replaces it |
| `end_card` | 5 s end screen after the story. `null` = none |
| `auto_effects` | `true` adds shakes and flashes on words like *explosion, gunshot, slam, knock*, but only when the SRT has no effect tags |

## 5. Prompt template for the images

Paste this into ChatGPT with your six objects (one image per message):

> Generate an image. Minimalist hand-drawn sketch illustration, pure black ink pen sketch style.
> Pure clean white background, crisp black ink lines, small flat touches of red, orange and blue.
> 16:9 landscape. No text, letters or numbers anywhere. Layout: 6 separate objects in two rows
> of three, with wide empty space between every object so none overlap or touch. Draw in reading
> order: 1. … 2. … 3. … 4. … 5. … 6. …

Save the results as `1.png, 2.png, …` in `images/`.

## Setup on a new computer

```bash
npm install
python -m pip install edge-tts imageio-ffmpeg pillow numpy
npx remotion browser ensure
```

If the render fails with `chrome-headless-shell.exe ENOENT`, the project path is too long for
Windows. Copy `node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64`
to a short folder and set the `REMOTION_BROWSER` environment variable (or `"browser"` in
`config.json`) to the `.exe` inside it.

## Files

- `autovid/autovid.py`: the pipeline (voice, timing, tags, job file, render)
- `src/Auto.tsx`: the Remotion video (camera, ink reveal, effects, captions)
- `src/Subscribe.tsx`: the subscribe pop-up and end card
- `scripts/stills.mjs`: render a few still frames of a job to check timing (`PROPS=public/jobs/<name>/props.json node scripts/stills.mjs 12 30.5`)
