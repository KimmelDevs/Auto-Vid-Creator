// Story Maker Studio: a local web app around autovid.
//   npm run dev  ->  http://localhost:5173
// One Express server serves the API, the story files, the rendered videos and (through
// Vite in middleware mode) the React app.
import express from 'express';
import multer from 'multer';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer as createVite} from 'vite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const STORIES = path.join(ROOT, 'stories');
const OUT = path.join(ROOT, 'out', 'studio');
const NOTES = path.join(HERE, 'notes.md');
const PORT = Number(process.env.PORT || 5173);
// sound library: same rule as autovid (the repo's sfx/ once it has sounds, else ../sfx)
const hasSounds = (d) => fs.existsSync(d) && fs.readdirSync(d, {withFileTypes: true}).some((e) =>
  e.isDirectory() && fs.readdirSync(path.join(d, e.name)).some((f) => f.endsWith('.mp3')));
const SFX = hasSounds(path.join(ROOT, 'sfx')) || !fs.existsSync(path.join(ROOT, '..', 'sfx')) ? path.join(ROOT, 'sfx') : path.join(ROOT, '..', 'sfx');
fs.mkdirSync(STORIES, {recursive: true});
fs.mkdirSync(OUT, {recursive: true});

const IMG_EXT = ['.png', '.jpg', '.jpeg', '.webp'];
const slug = (s) => String(s).trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
const dirOf = (id) => {
  const d = path.join(STORIES, slug(id));
  if (!d.startsWith(STORIES) || !fs.existsSync(d)) throw Object.assign(new Error('no such project'), {status: 404});
  return d;
};
const srtFile = (d) => fs.readdirSync(d).filter((f) => f.toLowerCase().endsWith('.srt')).sort()[0];
// the user's script; once effects are edited in the studio, the SRT autovid reads is regenerated from it
const sourceFile = (d) => path.join(d, 'source.srt.txt');
const readSource = (d) => {
  if (fs.existsSync(sourceFile(d))) return fs.readFileSync(sourceFile(d), 'utf8');
  const s = srtFile(d);
  return s ? fs.readFileSync(path.join(d, s), 'utf8').replace(/^﻿/, '') : '';
};
const images = (d) => {
  const dir = path.join(d, 'images');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => IMG_EXT.includes(path.extname(f).toLowerCase()) && /^\d+$/.test(path.parse(f).name))
    .map((f) => ({n: Number(path.parse(f).name), file: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs}))
    .sort((a, b) => a.n - b.n);
};
const readJson = (f, dflt) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return dflt;
  }
};

// ---- SRT tag handling: "[1.2][shake:big]word" -> object 1.2 with effect shake:big
const OBJ = /^(\d+)[.-](\d+)$/;
function parseObjects(text) {
  const objs = {};
  const re = /((?:\[[^\]]+\]\s*)+)/g;
  let m;
  while ((m = re.exec(text))) {
    const tags = [...m[1].matchAll(/\[([^\]]+)\]/g)].flatMap((t) =>
      t[1].trim().toLowerCase().startsWith('label') ? [t[1].trim()] : t[1].split(',').map((x) => x.trim()).filter(Boolean));
    let cur = null;
    for (const t of tags) {
      const o = t.match(OBJ);
      if (o) {
        cur = `${Number(o[1])}.${Number(o[2])}`;
        let after = text.slice(re.lastIndex).replace(/\d+\s*\n[\d:,]+ --> [\d:,]+\s*\n/g, ' ');
        const next = after.search(/\[\s*\d+[.-]\d+/);
        if (next >= 0) after = after.slice(0, next);
        objs[cur] = {key: cur, n: Number(o[1]), k: Number(o[2]), fx: [], text: after.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 110)};
      } else if (cur) objs[cur].fx.push(t);
    }
  }
  return Object.values(objs).sort((a, b) => a.n - b.n || a.k - b.k);
}

function applyEffects(text, effects) {
  // strip the effect tags that sit right after each object tag, then write the chosen ones back
  return text.replace(/((?:\[[^\]]+\]\s*)+)/g, (block) => {
    const tags = [...block.matchAll(/\[([^\]]+)\]/g)].map((t) => t[1].trim());
    const out = [];
    let cur = null;
    for (const t of tags) {
      const parts = t.toLowerCase().startsWith('label') ? [t] : t.split(',').map((x) => x.trim()).filter(Boolean);
      for (const p of parts) {
        const o = p.match(OBJ);
        if (o) {
          cur = `${Number(o[1])}.${Number(o[2])}`;
          out.push(`[${cur}]`);
          if (effects[cur]) out.push(...effects[cur].filter(Boolean).map((e) => `[${e}]`));
        } else if (!cur || !effects[cur]) out.push(`[${p}]`);
      }
    }
    return out.join('') + (/\s$/.test(block) ? ' ' : '');
  });
}

// every save keeps the previous script in <project>/.history (last 50), so a bad save can be undone
const historyDir = (d) => path.join(d, '.history');
function backupScript(d) {
  const old = readSource(d);
  if (!old.trim()) return;
  const dir = historyDir(d);
  fs.mkdirSync(dir, {recursive: true});
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
  if (files.length && fs.readFileSync(path.join(dir, files.at(-1)), 'utf8') === old) return;
  fs.writeFileSync(path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.txt`), old);
  for (const f of files.slice(0, Math.max(0, files.length + 1 - 50))) fs.unlinkSync(path.join(dir, f));
}

function writeScript(d, text) {
  backupScript(d);
  fs.writeFileSync(sourceFile(d), text);
  const name = srtFile(d) || `${path.basename(d)}.srt`;
  for (const f of fs.readdirSync(d)) if (f.toLowerCase().endsWith('.srt') && f !== name) fs.renameSync(path.join(d, f), path.join(d, f + '.old'));
  fs.writeFileSync(path.join(d, name), text);
}

// ---- background jobs (build / render / short), one per project; renders also go through a queue
const jobs = {};
const queue = [];  // [{id, kind: 'render' | 'short'}], run one at a time
const videoName = (id, kind) => (kind === 'short' ? `${id}_short.mp4` : `${id}.mp4`);
const rendering = () => Object.values(jobs).some((j) => j.state === 'running' && j.kind !== 'build');
function startRender(id, kind) {
  const d = dirOf(id);
  const tmp = path.join(OUT, `tmp_${videoName(id, kind)}`);
  run(id, kind, [path.relative(ROOT, d), kind === 'short' ? '--short' : '--render', '--out', tmp]);
}
function nextInQueue() {
  if (rendering() || !queue.length) return;
  const q = queue.shift();
  try {
    startRender(q.id, q.kind);
  } catch {
    nextInQueue();
  }
}
const procs = {};  // id -> running child process, so a job can be cancelled
function run(id, kind, args) {
  const j = (jobs[id] = {kind, state: 'running', log: '', progress: 0, started: Date.now()});
  const p = (procs[id] = spawn('python', ['autovid/autovid.py', ...args], {cwd: ROOT, env: {...process.env, PYTHONUTF8: '1'}, shell: false}));
  const take = (b) => {
    const s = b.toString();
    j.log = (j.log + s).slice(-6000);
    const m = [...s.matchAll(/(Rendered|Stitched) (\d+)\/(\d+)/g)].pop();
    if (m) j.progress = Math.round((Number(m[2]) / Number(m[3])) * (m[1] === 'Rendered' ? 90 : 100));
  };
  p.stdout.on('data', take);
  p.stderr.on('data', take);
  p.on('close', (code) => {
    delete procs[id];
    if (j.cancelled) {
      j.state = 'cancelled';
      const tmp = path.join(OUT, `tmp_${videoName(id, kind)}`);
      if (kind !== 'build' && fs.existsSync(tmp)) fs.rmSync(tmp, {force: true});
      if (kind !== 'build') nextInQueue();
      return;
    }
    j.state = code === 0 ? 'done' : 'error';
    j.progress = code === 0 ? 100 : j.progress;
    if (kind !== 'build' && code === 0) {
      const tmp = path.join(OUT, `tmp_${videoName(id, kind)}`);
      if (fs.existsSync(tmp)) fs.renameSync(tmp, path.join(OUT, videoName(id, kind)));
    }
    if (kind !== 'build') nextInQueue();
  });
}

const app = express();
app.use(express.json({limit: '10mb'}));
app.use('/stories', express.static(STORIES));
app.use('/jobs', express.static(path.join(ROOT, 'public', 'jobs'), {etag: false, maxAge: 0}));
app.use('/videos', express.static(OUT));
app.use('/sfx', express.static(SFX));
const wrap = (fn) => (req, res) => {
  try {
    const r = fn(req, res);
    if (r !== undefined) res.json(r);
  } catch (e) {
    res.status(e.status || 500).json({error: e.message});
  }
};

app.get('/api/projects', wrap(() =>
  fs.readdirSync(STORIES, {withFileTypes: true}).filter((e) => e.isDirectory()).map((e) => {
    const d = path.join(STORIES, e.name);
    return {
      id: e.name,
      images: images(d).length,
      hasScript: !!srtFile(d) || fs.existsSync(sourceFile(d)),
      hasVideo: fs.existsSync(path.join(OUT, `${e.name}.mp4`)),
      mtime: fs.statSync(d).mtimeMs,
    };
  }).sort((a, b) => b.mtime - a.mtime)));

// every sound in the library: [{file: 'fight/sword_slash.mp3', folder, name}]
app.get('/api/sfx', wrap(() => {
  if (!fs.existsSync(SFX)) return [];
  return fs.readdirSync(SFX, {withFileTypes: true}).filter((e) => e.isDirectory()).flatMap((e) =>
    fs.readdirSync(path.join(SFX, e.name)).filter((f) => f.endsWith('.mp3')).sort().map((f) => ({
      file: `${e.name}/${f}`, folder: e.name, name: f.slice(0, -4).replace(/_/g, ' '),
    })));
}));

app.post('/api/projects', wrap((req) => {
  const id = slug(req.body.name);
  if (!id) throw Object.assign(new Error('give the project a name'), {status: 400});
  const d = path.join(STORIES, id);
  if (fs.existsSync(d)) throw Object.assign(new Error('a project with that name already exists'), {status: 400});
  fs.mkdirSync(path.join(d, 'images'), {recursive: true});
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify({end_card: {text: 'To be continued...', sub: "Subscribe so you don't miss it!"}}, null, 1));
  return {id};
}));

app.get('/api/projects/:id', wrap((req) => {
  const d = dirOf(req.params.id);
  const text = readSource(d);
  return {
    id: path.basename(d),
    script: text,
    objects: parseObjects(text),
    images: images(d).map((i) => ({n: i.n, url: `/stories/${path.basename(d)}/images/${i.file}?v=${Math.round(i.mtime)}`})),
    config: readJson(path.join(d, 'config.json'), {}),
    hasPreview: fs.existsSync(path.join(ROOT, 'public', 'jobs', path.basename(d), 'props.json')),
    video: fs.existsSync(path.join(OUT, `${path.basename(d)}.mp4`)) ? `/videos/${path.basename(d)}.mp4?v=${Math.round(fs.statSync(path.join(OUT, `${path.basename(d)}.mp4`)).mtimeMs)}` : null,
    short: fs.existsSync(path.join(OUT, `${path.basename(d)}_short.mp4`)) ? `/videos/${path.basename(d)}_short.mp4?v=${Math.round(fs.statSync(path.join(OUT, `${path.basename(d)}_short.mp4`)).mtimeMs)}` : null,
  };
}));

app.put('/api/projects/:id/script', wrap((req) => {
  writeScript(dirOf(req.params.id), String(req.body.text || '').replace(/\r/g, ''));
  return {ok: true};
}));

app.get('/api/projects/:id/history', wrap((req) => {
  const dir = historyDir(dirOf(req.params.id));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort().reverse().map((f) => ({
    name: f, time: fs.statSync(path.join(dir, f)).mtimeMs, text: fs.readFileSync(path.join(dir, f), 'utf8'),
  }));
}));

app.put('/api/projects/:id/effects', wrap((req) => {
  const d = dirOf(req.params.id);
  writeScript(d, applyEffects(readSource(d), req.body.effects || {}));
  return {ok: true, objects: parseObjects(readSource(d))};
}));

app.put('/api/projects/:id/config', wrap((req) => {
  const d = dirOf(req.params.id);
  const cfg = {...readJson(path.join(d, 'config.json'), {}), ...req.body};
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify(cfg, null, 1));
  return cfg;
}));

const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 40 * 1024 * 1024}});
app.post('/api/projects/:id/images/:n', upload.single('file'), wrap((req) => {
  const d = dirOf(req.params.id);
  const n = Number(req.params.n);
  const ext = path.extname(req.file?.originalname || '').toLowerCase();
  if (!req.file || !IMG_EXT.includes(ext) || !(n >= 1)) throw Object.assign(new Error('upload a png, jpg or webp image'), {status: 400});
  const dir = path.join(d, 'images');
  fs.mkdirSync(dir, {recursive: true});
  // ?keep=1 (image editor): copy the untouched original to images_backup the first time it is edited
  if (req.query.keep) {
    const bak = path.join(d, 'images_backup');
    const old = IMG_EXT.map((e) => `${n}${e}`).find((f) => fs.existsSync(path.join(dir, f)));
    if (old && !IMG_EXT.some((e) => fs.existsSync(path.join(bak, `${n}${e}`)))) {
      fs.mkdirSync(bak, {recursive: true});
      fs.copyFileSync(path.join(dir, old), path.join(bak, old));
    }
  }
  for (const e of IMG_EXT) fs.rmSync(path.join(dir, `${n}${e}`), {force: true});
  fs.writeFileSync(path.join(dir, `${n}${ext}`), req.file.buffer);
  return {ok: true};
}));

// put back the original saved by the image editor
app.post('/api/projects/:id/images/:n/restore', wrap((req) => {
  const d = dirOf(req.params.id);
  const n = Number(req.params.n);
  const old = IMG_EXT.map((e) => `${n}${e}`).find((f) => fs.existsSync(path.join(d, 'images_backup', f)));
  if (!old) throw Object.assign(new Error('no original saved for this image'), {status: 404});
  for (const e of IMG_EXT) fs.rmSync(path.join(d, 'images', `${n}${e}`), {force: true});
  fs.copyFileSync(path.join(d, 'images_backup', old), path.join(d, 'images', old));
  return {ok: true};
}));

app.delete('/api/projects/:id/images/:n', wrap((req) => {
  const dir = path.join(dirOf(req.params.id), 'images');
  for (const e of IMG_EXT) fs.rmSync(path.join(dir, `${Number(req.params.n)}${e}`), {force: true});
  return {ok: true};
}));

app.post('/api/projects/:id/build', wrap((req) => {
  const d = dirOf(req.params.id);
  if (jobs[path.basename(d)]?.state === 'running') throw Object.assign(new Error('already working on this project'), {status: 409});
  run(path.basename(d), 'build', [path.relative(ROOT, d)]);
  return {ok: true};
}));

// body {short: true} makes the 9:16 Short instead; if another video is rendering, it waits in the queue
app.post('/api/projects/:id/render', wrap((req) => {
  const id = path.basename(dirOf(req.params.id));
  const kind = req.body.short ? 'short' : 'render';
  if (jobs[id]?.state === 'running') throw Object.assign(new Error('already working on this project'), {status: 409});
  if (queue.some((q) => q.id === id && q.kind === kind)) return {queued: true};
  queue.push({id, kind});
  nextInQueue();
  return {queued: !(jobs[id]?.state === 'running'), position: queue.findIndex((q) => q.id === id && q.kind === kind) + 1};
}));

// stop a running build / render / short (the whole process tree: python -> npx -> remotion -> chrome)
app.post('/api/projects/:id/cancel', wrap((req) => {
  const id = slug(req.params.id);
  const p = procs[id];
  if (!p || jobs[id]?.state !== 'running') return {ok: false};
  jobs[id].cancelled = true;
  spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], {shell: false});
  return {ok: true};
}));

app.get('/api/queue', wrap(() => ({
  running: Object.entries(jobs).filter(([, j]) => j.state === 'running' && j.kind !== 'build').map(([id, j]) => ({id, kind: j.kind, progress: j.progress})),
  waiting: queue,
})));
app.delete('/api/queue/:i', wrap((req) => {
  queue.splice(Number(req.params.i), 1);
  return {ok: true};
}));

app.post('/api/projects/:id/duplicate', wrap((req) => {
  const src = dirOf(req.params.id);
  const id = slug(req.body.name);
  if (!id) throw Object.assign(new Error('give the new project a name'), {status: 400});
  const d = path.join(STORIES, id);
  if (fs.existsSync(d)) throw Object.assign(new Error('a project with that name already exists'), {status: 400});
  fs.mkdirSync(path.join(d, 'images'), {recursive: true});
  const cfg = readJson(path.join(src, 'config.json'), {});
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify(cfg, null, 1));
  if (req.body.script) writeScript(d, readSource(src));
  return {id};
}));

// ---- music: sfx/bgm/<mood>/<track>.mp3
app.get('/api/music', wrap(() => {
  const dir = path.join(SFX, 'bgm');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().flatMap((mood) => fs.statSync(path.join(dir, mood)).isDirectory()
    ? fs.readdirSync(path.join(dir, mood)).filter((f) => f.endsWith('.mp3')).sort().map((f) => ({file: `bgm/${mood}/${f}`, mood, name: f.slice(0, -4).replace(/_/g, ' ')}))
    : []);
}));

// ---- script checker: everything that would silently go wrong in a build
const KNOWN_FX = new Set(['shake', 'flash', 'boom', 'zoom', 'heartbeat', 'red', 'glitch', 'rewind', 'fade', 'dark', 'light', 'whole', 'subscribe', 'knock', 'label', 'pause', 'hook', 'bg']);
function checkScript(d) {
  const text = readSource(d);
  const out = [];
  const add = (level, msg, line) => out.push({level, msg, line});
  const lineOf = (i) => text.slice(0, i).split('\n').length;
  // srt timing
  const times = [...text.matchAll(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/g)].map((m) => ({
    a: +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, b: +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000, i: m.index}));
  if (!times.length) add('error', 'No subtitle time lines found (00:00:00,000 --> 00:00:04,000).');
  times.forEach((c, k) => {
    if (c.b <= c.a) add('error', 'Subtitle ends before it starts.', lineOf(c.i));
    else if (k && c.a < times[k - 1].b - 0.05) add('warn', 'Subtitle overlaps the one before it.', lineOf(c.i));
  });
  // tags
  const objs = [];
  const loops = {};  // name -> line of its last [amb]
  let dark = null;
  for (const m of text.matchAll(/\[([^\]]+)\]/g)) {
    const body = m[1].trim();
    const ln = lineOf(m.index);
    const snd = body.match(/^(sfx|amb|amb-stop)\s*:\s*(\S+)(.*)$/i);
    if (snd) {
      const kind = snd[1].toLowerCase();
      const name = path.basename(snd[2], '.mp3').toLowerCase();
      if (kind === 'amb-stop') {
        for (const one of (snd[2] + snd[3]).split(',').map((x) => path.basename(x.trim(), '.mp3').toLowerCase()).filter(Boolean)) {
          if (!loops[one]) add('warn', `[amb-stop:${one}] stops a loop that isn't playing.`, ln);
          delete loops[one];
        }
        continue;
      }
      if (!fs.existsSync(path.join(SFX, snd[2]))) add('error', `Sound not found: ${snd[2]} (it will be skipped).`, ln);
      for (const o of snd[3].trim().split(/\s+/).filter(Boolean))
        if (!/^(vol=\d+(\.\d+)?|fade-?in|fade-?out|fade_in|fade_out|loop|x\d+)$/i.test(o)) add('warn', `Unknown sound option "${o}".`, ln);
      if (kind === 'amb' || /\bloop\b/i.test(snd[3])) loops[name] = ln;
      continue;
    }
    if (body.toLowerCase().startsWith('label')) continue;
    for (const tok of body.split(/[,\s]+/).filter(Boolean)) {
      const o = tok.match(/^(\d+)(?:[.-](\d+))?$/);
      if (o) {
        objs.push({n: +o[1], k: +(o[2] || 1), ln});
        continue;
      }
      const name = tok.split(':')[0].toLowerCase();
      if (!KNOWN_FX.has(name)) add('warn', `Unknown tag [${tok}] (it will be ignored).`, ln);
      if (name === 'dark') dark = ln;
      if (name === 'light') dark = null;
    }
  }
  if (dark) add('warn', '[dark] is never turned off with a later [light], so the video stays dark to the end.', dark);
  for (const [name, ln] of Object.entries(loops)) add('warn', `Loop "${name}" never gets an [amb-stop:${name}], so it plays to the end.`, ln);
  // picture tags
  const [rows, cols] = readJson(path.join(d, 'config.json'), {}).grid || [2, 3];
  const K = rows * cols;
  const seen = new Set();
  let last = 0;
  for (const o of objs) {
    const g = (o.n - 1) * K + o.k;
    if (o.k > K) add('error', `[${o.n}.${o.k}] doesn't exist: each image only has ${K} objects.`, o.ln);
    if (seen.has(g)) add('warn', `[${o.n}.${o.k}] is used twice.`, o.ln);
    else if (g < last) add('warn', `[${o.n}.${o.k}] comes after a later object; pictures will jump back.`, o.ln);
    seen.add(g);
    last = Math.max(last, g);
  }
  const imgs = new Set(images(d).map((i) => i.n));
  const maxN = Math.max(0, ...objs.map((o) => o.n));
  const skipped = [];
  for (let n = 1; n <= maxN; n++) for (let k = 1; k <= K; k++) if (!seen.has((n - 1) * K + k)) skipped.push(`${n}.${k}`);
  if (skipped.length) add('info', `No tag for ${skipped.length} object(s): ${skipped.slice(0, 12).join(', ')}${skipped.length > 12 ? '…' : ''}. They'll be timed automatically.`);
  const missing = [...new Set(objs.map((o) => o.n))].filter((n) => !imgs.has(n));
  if (missing.length) add('error', `Script uses image(s) ${missing.join(', ')} but they aren't uploaded yet.`);
  const unused = [...imgs].filter((n) => n > maxN);
  if (objs.length && unused.length) add('info', `Image(s) ${unused.join(', ')} are uploaded but the script never tags them.`);
  if (!out.some((o) => o.level !== 'info')) add('ok', `Looks good: ${times.length} subtitles, ${objs.length} picture tags.`);
  return out;
}
app.get('/api/projects/:id/check', wrap((req) => checkScript(dirOf(req.params.id))));

// ---- sound suggestions: put a matching sound before keywords (at most one per subtitle)
const SUGGEST = [
  [/^(roar|roared|roars|roaring)$/, 'creatures/roar_beast.mp3', 50], [/^(growl|growled|growling|snarl|snarled)$/, 'creatures/growl_dragon.mp3', 40],
  [/^(howl|howled|howling)$/, 'creatures/wolf_howling.mp3', 40], [/^(scream|screamed|screams|screaming|shriek|shrieked)$/, 'human/scream_in_pain.mp3', 45],
  [/^(gasp|gasped)$/, 'human/female_astonished_gasp.mp3', 40], [/^(panting|breathing|breath)$/, 'human/male_scared_effort_breathing.mp3', 30],
  [/^(gunshot|gunshots|gunfire|gunshot)$/, 'warfare/game_gun_shot.mp3', 50], [/^(explosion|exploded|explode|blast)$/, 'fight/explosion_hit.mp3', 55],
  [/^(thunder)$/, 'weather/thunder_rumble.mp3', 45], [/^(rain|raining|downpour)$/, 'weather/rain_heavy_drops.mp3', 25],
  [/^(knock|knocked|knocking|pounding)$/, 'bunker/door_knock.mp3', 45], [/^(slam|slammed)$/, 'bunker/slamming_a_door.mp3', 50],
  [/^(door|hatch)$/, 'bunker/door_scary_open.mp3', 35], [/^(footsteps|steps)$/, 'human/footsteps_in_the_forest_ground.mp3', 30],
  [/^(sprinted|sprinting|fled|raced)$/, 'human/running_forest.mp3', 35], [/^(heart|heartbeat)$/, 'human/fast_heartbeat.mp3', 35],
  [/^(punch|punched|kicked|kick)$/, 'fight/punches_body.mp3', 45], [/^(sword|blade|slashed|slash)$/, 'fight/sword_slash.mp3', 40],
  [/^(spear|stabbed|stab|pierced)$/, 'fight/sword_cutting_flesh.mp3', 40], [/^(blood|bleeding)$/, 'fight/blood_splash.mp3', 35],
  [/^(bone|bones)$/, 'fight/bone_breaking_with_echo.mp3', 45], [/^(flames|campfire|blaze)$/, 'weather/fire_campfire.mp3', 25],
  [/^(wind)$/, 'weather/wind_blowing.mp3', 20], [/^(splash|splashed|splashing)$/, 'weather/water_splash.mp3', 35],
  [/^(alarm|siren)$/, 'bunker/classic_alarm.mp3', 30], [/^(radio|static)$/, 'bunker/radio_static_fx.mp3', 35],
  [/^(glass|shattered|smashed)$/, 'human/glass_break_with_hammer_thud.mp3', 45], [/^(crash|crashed|collapsed)$/, 'fight/collapsing_structure.mp3', 50],
];
app.post('/api/projects/:id/suggest-sounds', wrap((req) => {
  const text = String(req.body.text ?? readSource(dirOf(req.params.id)));
  const rules = SUGGEST.filter(([, f]) => fs.existsSync(path.join(SFX, f)));
  let added = 0;
  let lastFile = '';
  // one subtitle block at a time; skip blocks that already have a sound
  const blocks = text.split(/(\n\s*\n)/);
  for (let b = 0; b < blocks.length; b += 2) {
    const blk = blocks[b];
    if (/\[(sfx|amb)\s*:/i.test(blk)) continue;
    const lines = blk.split('\n');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    let done = false;
    for (let li = ti + 1; li < lines.length && !done; li++) {
      lines[li] = lines[li].replace(/(\[[^\]]*\]|[A-Za-z']+)/g, (w) => {
        if (done || w.startsWith('[')) return w;
        const rule = rules.find(([re]) => re.test(w.toLowerCase()));
        if (!rule || rule[1] === lastFile) return w;
        done = true;
        lastFile = rule[1];
        added++;
        return `[sfx:${rule[1]} vol=${rule[2]}]${w}`;
      });
    }
    if (!done) lastFile = '';
    blocks[b] = lines.join('\n');
  }
  return {text: blocks.join(''), added};
}));

app.get('/api/projects/:id/status', wrap((req) => jobs[slug(req.params.id)] || {state: 'idle', log: '', progress: 0}));

app.get('/api/projects/:id/preview', wrap((req) => {
  const f = path.join(ROOT, 'public', 'jobs', path.basename(dirOf(req.params.id)), 'props.json');
  if (!fs.existsSync(f)) throw Object.assign(new Error('build the preview first'), {status: 404});
  return readJson(f, {});
}));

app.post('/api/open', wrap((req) => {
  const where = {videos: OUT, project: req.body.id ? dirOf(req.body.id) : STORIES}[req.body.what] || OUT;
  spawn('explorer.exe', [where], {detached: true});
  return {ok: true};
}));

app.get('/api/notes', wrap(() => ({text: fs.existsSync(NOTES) ? fs.readFileSync(NOTES, 'utf8') : ''})));
app.put('/api/notes', wrap((req) => {
  fs.writeFileSync(NOTES, String(req.body.text || ''));
  return {ok: true};
}));

const vite = await createVite({
  root: HERE,
  configFile: path.join(HERE, 'vite.config.mjs'),
  server: {middlewareMode: true, fs: {allow: [ROOT]}},
  appType: 'spa',
});
app.use(vite.middlewares);
app.listen(PORT, () => console.log(`\n  Story Maker Studio -> http://localhost:${PORT}\n`));
