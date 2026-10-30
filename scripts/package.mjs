// Build the shippable Story Maker Studio package.
//   node scripts/package.mjs
// Produces dist-package/StoryMaker-app.zip  (the app, no personal data, no node_modules)
// and, with --sounds, dist-package/StoryMaker-sounds.zip (the sfx + bgm library).
// Your own projects, templates, notes, reference pictures and rendered videos are NEVER included.

import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-package');
const STAGE = path.join(OUT, 'app');
const sh = (cmd, cwd = ROOT) => execSync(cmd, {cwd, stdio: 'inherit'});
const ps = (cmd) => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd.replace(/"/g, '\\"')}"`, {stdio: 'inherit'});

// what ships: only the program and the render engine, never personal work
const INCLUDE = ['package.json', 'package-lock.json', 'autovid', 'src', 'studio/dist', 'studio/server.mjs', 'studio/vite.config.mjs', 'studio/index.html'];
const EXCLUDE_IN = {src: ['timelines']};  // trim heavy dev leftovers inside an included folder

fs.rmSync(OUT, {recursive: true, force: true});
fs.mkdirSync(STAGE, {recursive: true});

console.log('1. Building the studio app (minified)...');
sh('npx vite build studio');

console.log('2. Minifying the server...');
fs.mkdirSync(path.join(STAGE, 'studio'), {recursive: true});
sh(`npx esbuild studio/server.mjs --minify --platform=node --format=esm --outfile="${path.join(STAGE, 'studio', 'server.mjs')}"`);

console.log('3. Copying the app files (no projects, templates, notes or videos)...');
for (const rel of INCLUDE) {
  if (rel === 'studio/server.mjs') continue; // already minified above
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) continue;
  const to = path.join(STAGE, rel);
  fs.mkdirSync(path.dirname(to), {recursive: true});
  fs.cpSync(from, to, {recursive: true});
}
for (const [folder, names] of Object.entries(EXCLUDE_IN)) for (const n of names) fs.rmSync(path.join(STAGE, folder, n), {recursive: true, force: true});

// empty places for the user's own work, so the app starts clean
for (const d of ['stories', 'out/studio', 'public/jobs', 'studio/refs']) fs.mkdirSync(path.join(STAGE, d), {recursive: true});
fs.writeFileSync(path.join(STAGE, 'studio', 'notes.md'), '# Story Maker notes\n\nWrite your own prompts and notes here.\n');
fs.writeFileSync(path.join(STAGE, 'studio', 'templates.json'), '[]');
fs.writeFileSync(path.join(STAGE, 'studio', 'folders.json'), '[]');
fs.copyFileSync(path.join(ROOT, 'installer', 'EULA.txt'), path.join(STAGE, 'EULA.txt'));

// the launcher exe, if it has been built
const launcher = path.join(ROOT, 'installer', 'target', 'release', 'StoryMaker.exe');
if (fs.existsSync(launcher)) fs.copyFileSync(launcher, path.join(STAGE, 'StoryMaker.exe'));
else console.log('   (StoryMaker.exe not built yet - run the installer build first, then re-run this)');

console.log('4. Zipping the app...');
const appZip = path.join(OUT, 'StoryMaker-app.zip');
ps(`Compress-Archive -Path '${STAGE}\\*' -DestinationPath '${appZip}' -Force`);
console.log('   -> ' + appZip);

if (process.argv.includes('--sounds')) {
  console.log('5. Zipping the sound library (large, please wait)...');
  // the real library is the folder that actually holds sounds (same rule the server uses):
  // the repo sfx/ if it has <mood>/<track>.mp3, else the parent Story Maker/sfx
  const hasSounds = (d) => {
    try {
      return fs.readdirSync(d, {withFileTypes: true}).some((e) => e.isDirectory() && fs.readdirSync(path.join(d, e.name)).some((f) => f.endsWith('.mp3')));
    } catch {
      return false;
    }
  };
  const repoSfx = path.join(ROOT, 'sfx');
  const sfx = hasSounds(repoSfx) ? repoSfx : path.join(ROOT, '..', 'sfx');
  const n = fs.readdirSync(sfx, {recursive: true}).filter((f) => String(f).endsWith('.mp3')).length;
  console.log(`   source: ${sfx}  (${n} mp3 files)`);
  const soundsZip = path.join(OUT, 'StoryMaker-sounds.zip');
  ps(`Compress-Archive -Path '${sfx}' -DestinationPath '${soundsZip}' -Force`);
  console.log('   -> ' + soundsZip + '  (unzips to a folder named sfx)');
} else {
  console.log('5. Skipped the sound zip. Add --sounds to build it (it is large).');
}

console.log('\nDone. Upload the zip(s) in dist-package to your host (e.g. GitHub Releases),');
console.log('put their links in installer/src/bin/setup.rs (APP_URL and SOUNDS_URL), then rebuild setup.exe.');
