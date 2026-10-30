# Story Maker Studio — installer

Two small Windows programs, written in Rust:

- **setup.exe** — what you hand to other people. Shows the licence, then downloads
  the app, a portable Node.js and the sound library, and makes a desktop shortcut.
- **StoryMaker.exe** — the launcher. Starts the local server and opens the browser.
  It is bundled inside the app zip, not handed out on its own.

Your own projects, templates, notes, character reference pictures and rendered
videos are **never** put in the package.

## One-time build

1. Build the app package and the launcher:
   ```bash
   cd installer
   cargo build --release          # makes setup.exe and StoryMaker.exe
   cd ..
   node scripts/package.mjs --sounds
   ```
   This writes `dist-package/StoryMaker-app.zip` and `dist-package/StoryMaker-sounds.zip`.

2. Upload both zips somewhere public (GitHub Releases is free). Copy their links.

3. Put the links in `installer/src/bin/setup.rs`:
   ```rust
   const APP_URL: &str = "https://.../StoryMaker-app.zip";
   const SOUNDS_URL: &str = "https://.../StoryMaker-sounds.zip";
   ```

4. Rebuild so `setup.exe` has the links:
   ```bash
   cd installer && cargo build --release
   ```

5. Hand out `installer/target/release/setup.exe`.

## What protection this gives

- The studio app ships **minified and bundled** (`studio/dist`), and the server
  is minified too — no readable UI source.
- Your series data (templates, characters, outfits, places, notes, reference
  pictures) is **not** in the package at all.
- The licence forbids redistribution and decompiling.

What it cannot do: the render engine (`src` Remotion files and `autovid.py`) must
ship as source because Node and Python read them at run time. A determined person
can still read those. True copy-proofing of a local app is not possible.
