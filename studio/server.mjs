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

function writeScript(d, text) {
  fs.writeFileSync(sourceFile(d), text);
  const name = srtFile(d) || `${path.basename(d)}.srt`;
  for (const f of fs.readdirSync(d)) if (f.toLowerCase().endsWith('.srt') && f !== name) fs.renameSync(path.join(d, f), path.join(d, f + '.old'));
  fs.writeFileSync(path.join(d, name), text);
}

// ---- background jobs (build / render), one per project
const jobs = {};
function run(id, kind, args) {
  const j = (jobs[id] = {kind, state: 'running', log: '', progress: 0, started: Date.now()});
  const p = spawn('python', ['autovid/autovid.py', ...args], {cwd: ROOT, env: {...process.env, PYTHONUTF8: '1'}, shell: false});
  const take = (b) => {
    const s = b.toString();
    j.log = (j.log + s).slice(-6000);
    const m = [...s.matchAll(/(Rendered|Stitched) (\d+)\/(\d+)/g)].pop();
    if (m) j.progress = Math.round((Number(m[2]) / Number(m[3])) * (m[1] === 'Rendered' ? 90 : 100));
  };
  p.stdout.on('data', take);
  p.stderr.on('data', take);
  p.on('close', (code) => {
    j.state = code === 0 ? 'done' : 'error';
    j.progress = code === 0 ? 100 : j.progress;
    if (kind === 'render' && code === 0) {
      const tmp = path.join(OUT, `tmp_${id}.mp4`);
      if (fs.existsSync(tmp)) fs.renameSync(tmp, path.join(OUT, `${id}.mp4`));
    }
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
  };
}));

app.put('/api/projects/:id/script', wrap((req) => {
  writeScript(dirOf(req.params.id), String(req.body.text || '').replace(/\r/g, ''));
  return {ok: true};
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
  for (const e of IMG_EXT) fs.rmSync(path.join(dir, `${n}${e}`), {force: true});
  fs.writeFileSync(path.join(dir, `${n}${ext}`), req.file.buffer);
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

app.post('/api/projects/:id/render', wrap((req) => {
  const d = dirOf(req.params.id);
  const id = path.basename(d);
  if (jobs[id]?.state === 'running') throw Object.assign(new Error('already working on this project'), {status: 409});
  run(id, 'render', [path.relative(ROOT, d), '--render', '--out', path.join(OUT, `tmp_${id}.mp4`)]);
  return {ok: true};
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
