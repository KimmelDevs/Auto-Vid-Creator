import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Player, PlayerRef} from '@remotion/player';
import {Auto, Job, totalFrames} from '../../src/Auto';

// ---------- api ----------
const api = async (url: string, opts: {method?: string; body?: any; form?: FormData} = {}) => {
  const r = await fetch(url, {
    method: opts.method || (opts.body || opts.form ? 'POST' : 'GET'),
    headers: opts.body ? {'Content-Type': 'application/json'} : undefined,
    body: opts.form || (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};

type Obj = {key: string; n: number; k: number; fx: string[]; text: string};
type Project = {id: string; script: string; objects: Obj[]; images: {n: number; url: string}[]; config: any; hasPreview: boolean; video: string | null; short: string | null};
type Problem = {level: 'error' | 'warn' | 'info' | 'ok'; msg: string; line?: number};

// every effect autovid understands, in plain words
const EFFECTS: {v: string; label: string}[] = [
  {v: 'shake', label: 'Shake'},
  {v: 'shake:small', label: 'Shake (small)'},
  {v: 'shake:big', label: 'Shake (big)'},
  {v: 'boom', label: 'Boom (huge hit)'},
  {v: 'knock', label: 'Knock'},
  {v: 'knock:3', label: 'Knock x3'},
  {v: 'flash', label: 'Flash (white)'},
  {v: 'flash:red', label: 'Flash (red)'},
  {v: 'flash:orange', label: 'Flash (orange)'},
  {v: 'zoom', label: 'Zoom punch'},
  {v: 'heartbeat:3', label: 'Heartbeat (3s)'},
  {v: 'red:3', label: 'Red alarm (3s)'},
  {v: 'glitch', label: 'Glitch'},
  {v: 'rewind', label: 'Rewind (flashback)'},
  {v: 'fade', label: 'Fade to black'},
  {v: 'dark', label: 'Night tint ON'},
  {v: 'light', label: 'Night tint OFF'},
  {v: 'whole', label: 'Show whole image'},
  {v: 'pause:1', label: 'Pause 1 second'},
  {v: 'pause:2', label: 'Pause 2 seconds'},
  {v: 'subscribe', label: 'Subscribe pop-up'},
  {v: 'label', label: 'Text label...'},
];
type Sound = {file: string; folder: string; name: string};
// "sfx:fight/sword_slash.mp3 vol=40 x3" -> {kind, file, opts}
const soundTag = (v: string) => {
  const m = v.match(/^(sfx|amb|amb-stop)\s*:\s*(\S+)(.*)$/i);
  return m ? {kind: m[1].toLowerCase(), file: m[2], opts: m[3].trim()} : null;
};
const soundName = (file: string) => file.split('/').pop()!.replace(/\.mp3$/, '').replace(/_/g, ' ');
const fxLabel = (v: string) => {
  const st = soundTag(v);
  if (st) {
    const vol = st.opts.match(/vol=(\d+)/)?.[1];
    const rep = st.opts.match(/\bx(\d+)/)?.[1];
    if (st.kind === 'amb-stop') return `⏹ stop ${soundName(st.file)}`;
    return `${st.kind === 'amb' ? '🌲' : '🔊'} ${soundName(st.file)}${rep ? ` x${rep}` : ''}${vol ? ` ${vol}%` : ''}`;
  }
  if (v.toLowerCase().startsWith('label')) return `Label: "${v.split(':').slice(1).join(':').trim()}"`;
  return EFFECTS.find((e) => e.v === v)?.label || v;
};

const VOICES = [
  ['en-US-AndrewMultilingualNeural', 'Andrew (deep, warm male) - default'],
  ['en-US-GuyNeural', 'Guy (male)'],
  ['en-US-ChristopherNeural', 'Christopher (male, calm)'],
  ['en-US-EricNeural', 'Eric (male)'],
  ['en-US-BrianMultilingualNeural', 'Brian (male, young)'],
  ['en-US-JennyNeural', 'Jenny (female)'],
  ['en-US-AriaNeural', 'Aria (female)'],
  ['en-US-AvaMultilingualNeural', 'Ava (female, warm)'],
];

const TABS = [
  ['script', '1. Script'],
  ['images', '2. Images & Effects'],
  ['edit', 'Edit image'],
  ['play', '3. Play'],
  ['render', '4. Make video'],
  ['youtube', 'YouTube'],
  ['settings', 'Settings'],
] as const;

export const App: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  // ?p=<project>&tab=<tab> opens a project directly (handy for bookmarks)
  const url = new URLSearchParams(location.search);
  const [current, setCurrent] = useState<string | null>(() => url.get('p') || localStorage.getItem('sm.project'));
  const [tab, setTab] = useState<string>(() => url.get('tab') || localStorage.getItem('sm.tab') || 'images');
  const [proj, setProj] = useState<Project | null>(null);
  const [toast, setToast] = useState('');
  const [newName, setNewName] = useState('');

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 3500);
  };
  const loadList = useCallback(() => api('/api/projects').then(setProjects).catch((e) => say(e.message)), []);
  const loadProj = useCallback(() => {
    if (!current || current === '__notes') return setProj(null);
    // the editor works with \n line ends only (a textarea drops \r anyway)
    api(`/api/projects/${current}`).then((p) => setProj({...p, script: p.script.replace(/\r/g, '')})).catch((e) => {
      say(e.message);
      setProj(null);
    });
  }, [current]);
  useEffect(() => void loadList(), [loadList]);
  useEffect(() => {
    loadProj();
    if (current) localStorage.setItem('sm.project', current);
  }, [current, loadProj]);
  useEffect(() => localStorage.setItem('sm.tab', tab), [tab]);

  const create = async () => {
    try {
      const {id} = await api('/api/projects', {body: {name: newName}});
      setNewName('');
      await loadList();
      setCurrent(id);
      setTab('script');
    } catch (e: any) {
      say(e.message);
    }
  };

  return (
    <div className="app">
      <aside>
        <h1>Story Maker</h1>
        <div className="new">
          <input placeholder="New project name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <button onClick={create} disabled={!newName.trim()}>+ Create</button>
        </div>
        <button className={'navitem notes' + (current === '__notes' ? ' on' : '')} onClick={() => setCurrent('__notes')}>
          📝 Notes & prompts
        </button>
        <div className="list">
          {projects.map((p) => (
            <button key={p.id} className={'navitem' + (p.id === current ? ' on' : '')} onClick={() => setCurrent(p.id)}>
              <span className="pname">{p.id}</span>
              <span className="meta">
                {p.images} img{p.hasScript ? '' : ' · no script'}{p.hasVideo ? ' · 🎬' : ''}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <main>
        {current === '__notes' ? (
          <Notes say={say} />
        ) : !proj ? (
          <div className="empty">
            <h2>Pick a project on the left, or create a new one.</h2>
            <p>Each project is one video: a script (SRT), numbered images, and effects.</p>
          </div>
        ) : (
          <>
            <header>
              <h2>{proj.id}</h2>
              <button className="small" title="Make the next part with the same settings" onClick={async () => {
                const m = proj.id.match(/^(.*?)(\d+)$/);
                const guess = m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}` : `${proj.id}_2`;
                const name = prompt('Name for the copy (same settings, music, end card):', guess);
                if (!name) return;
                const script = confirm('Also copy the script? (OK = yes, Cancel = start with an empty script)');
                try {
                  const {id} = await api(`/api/projects/${proj.id}/duplicate`, {body: {name, script}});
                  await loadList();
                  setCurrent(id);
                  say(`Made ${id}`);
                } catch (e: any) {
                  say(e.message);
                }
              }}>Duplicate</button>
              <nav>
                {TABS.map(([k, l]) => (
                  <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                    {l}
                  </button>
                ))}
              </nav>
            </header>
            <section>
              {tab === 'script' && <Script proj={proj} reload={loadProj} say={say} />}
              {tab === 'images' && <Images proj={proj} reload={loadProj} say={say} goScript={() => setTab('script')} />}
              {tab === 'edit' && <ImageEditor proj={proj} reload={loadProj} say={say} />}
              {tab === 'play' && <Play proj={proj} reload={loadProj} say={say} />}
              {tab === 'render' && <Render proj={proj} reload={() => (loadProj(), loadList())} say={say} />}
              {tab === 'youtube' && <YouTube proj={proj} reload={loadProj} say={say} />}
              {tab === 'settings' && <Settings proj={proj} reload={loadProj} say={say} />}
            </section>
          </>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

// ---------- 1. script ----------
const Script: React.FC<{proj: Project; reload: () => void; say: (m: string) => void}> = ({proj, reload, say}) => {
  const [text, setText] = useState(proj.script);
  // undo/redo: past and future snapshots; typing within 700 ms counts as one step
  const hist = useRef<{past: string[]; future: string[]; last: number}>({past: [], future: [], last: 0});
  const [, bump] = useState(0);
  const [versions, setVersions] = useState<{name: string; time: number; text: string}[]>([]);
  const loadVersions = useCallback(() => api(`/api/projects/${proj.id}/history`).then(setVersions).catch(() => setVersions([])), [proj.id]);
  useEffect(() => void loadVersions(), [loadVersions]);
  useEffect(() => setText((cur) => (cur === proj.script ? cur : proj.script)), [proj.script]);
  useEffect(() => {
    hist.current = {past: [], future: [], last: 0};
    bump((n) => n + 1);
  }, [proj.id]);
  const edit = (t: string, group = true) => {
    const h = hist.current;
    const now = Date.now();
    if (t === text) return;
    if (!group || now - h.last > 700 || !h.past.length) h.past.push(text);
    if (h.past.length > 200) h.past.shift();
    h.future = [];
    h.last = group ? now : 0;
    setText(t);
    bump((n) => n + 1);
  };
  const undo = () => {
    const h = hist.current;
    if (!h.past.length) return;
    h.future.push(text);
    h.last = 0;
    setText(h.past.pop()!);
    bump((n) => n + 1);
  };
  const redo = () => {
    const h = hist.current;
    if (!h.future.length) return;
    h.past.push(text);
    h.last = 0;
    setText(h.future.pop()!);
    bump((n) => n + 1);
  };
  const keys = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!(e.ctrlKey || e.metaKey)) return;
    if (k === 'z' && !e.shiftKey) (e.preventDefault(), undo());
    else if (k === 'y' || (k === 'z' && e.shiftKey)) (e.preventDefault(), redo());
    else if (k === 's') (e.preventDefault(), save());
  };
  const save = async (t = text) => {
    await api(`/api/projects/${proj.id}/script`, {method: 'PUT', body: {text: t}});
    say('Script saved');
    setBase(null);
    reload();
    loadVersions();
  };
  const upload = (f?: File) => f && f.text().then((t) => (edit(t, false), save(t)));
  const restore = (name: string) => {
    const v = versions.find((x) => x.name === name);
    if (v) (edit(v.text, false), say('Older save loaded. Press Save script to keep it, or Undo to go back.'));
  };
  const cues = (text.match(/-->/g) || []).length;
  const objs = (text.match(/\[\d+[.-]\d+\]/g) || []).length;
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const check = async () => {
    if (text !== proj.script) await save();
    setProblems(await api(`/api/projects/${proj.id}/check`));
  };
  const suggest = async () => {
    const r = await api(`/api/projects/${proj.id}/suggest-sounds`, {body: {text}});
    if (!r.added) return say('No new sound spots found.');
    if (base === null) setBase(text);
    edit(r.text, false);
    say(`Added ${r.added} sounds, shown in green. Look them over, then Save (Undo removes them all).`);
  };
  // text before "Suggest sounds", until the next save: sound tags not in it are new and shown in green
  const [base, setBase] = useState<string | null>(null);
  const marks = useMemo(() => {
    if (base === null) return [];
    const left: Record<string, number> = {};
    for (const m of base.matchAll(/\[(?:sfx|amb):[^\]]*\]/g)) left[m[0]] = (left[m[0]] || 0) + 1;
    const out: [number, number][] = [];
    for (const m of text.matchAll(/\[(?:sfx|amb):[^\]]*\]/g)) {
      if (left[m[0]]) left[m[0]]--;
      else out.push([m.index!, m.index! + m[0].length]);
    }
    return out;
  }, [base, text]);
  const back = useRef<HTMLDivElement>(null);
  const syncScroll = () => {
    if (back.current && ta.current) back.current.scrollTop = ta.current.scrollTop;
  };
  const nextMark = () => {
    if (!ta.current || !marks.length) return;
    const pos = ta.current.selectionEnd;
    const [a, b] = marks.find(([x]) => x > pos) || marks[0];
    ta.current.focus();
    ta.current.setSelectionRange(a, b);
    ta.current.scrollTop = Math.max(0, (text.slice(0, a).split('\n').length - 6) * 19.5);
    syncScroll();
  };
  const ta = useRef<HTMLTextAreaElement>(null);
  const goLine = (line?: number) => {
    if (!line || !ta.current) return;
    const at = text.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
    ta.current.focus();
    ta.current.setSelectionRange(at, at + (text.split('\n')[line - 1] || '').length);
    ta.current.scrollTop = Math.max(0, (line - 5) * 19.5);
  };
  return (
    <div className="cols">
      <div className="grow">
        {text !== proj.script && (
          <button className="primary floatsave" onClick={() => save()} title="Ctrl+S">💾 Save script</button>
        )}
        <div className="row sticky">
          <label className="btn">
            Upload .srt file
            <input type="file" accept=".srt,.txt" hidden onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          <button onClick={undo} disabled={!hist.current.past.length} title="Ctrl+Z">↶ Undo</button>
          <button onClick={redo} disabled={!hist.current.future.length} title="Ctrl+Y">↷ Redo</button>
          <button className="primary" onClick={() => save()} disabled={text === proj.script} title="Ctrl+S">Save script</button>
          <select value="" onChange={(e) => restore(e.target.value)} disabled={!versions.length}>
            <option value="">{versions.length ? `Older saves (${versions.length})` : 'No older saves yet'}</option>
            {versions.map((v) => (
              <option key={v.name} value={v.name}>{new Date(v.time).toLocaleString()}</option>
            ))}
          </select>
          <button onClick={check} title="Find problems before building">Check script</button>
          <button onClick={suggest} title="Add sounds before words like roar, scream, door, rain">Suggest sounds</button>
          <span className="muted">{cues} subtitle lines · {objs} picture tags</span>
        </div>
        {problems && (
          <div className="problems">
            {problems.map((p, i) => (
              <div key={i} className={'prob ' + p.level} onClick={() => goLine(p.line)}>
                <b>{{error: '✖', warn: '⚠', info: 'ℹ', ok: '✔'}[p.level]}</b> {p.msg} {p.line ? <span className="muted">line {p.line}</span> : null}
              </div>
            ))}
            <button className="small ghost" onClick={() => setProblems(null)}>Hide</button>
          </div>
        )}
        {marks.length > 0 && (
          <div className="row">
            <span className="newsnd">{marks.length} new sound{marks.length > 1 ? 's' : ''} in green</span>
            <button className="small" onClick={nextMark}>Next new sound ↓</button>
            <span className="muted">Delete any you don't want, then Save. Green goes away after saving.</span>
          </div>
        )}
        <div className="editor">
          <div className="backdrop script" ref={back} aria-hidden>
            {marks.length
              ? marks.reduce<React.ReactNode[]>((acc, [a, b], i) => {
                  const from = i ? marks[i - 1][1] : 0;
                  acc.push(text.slice(from, a), <mark key={i}>{text.slice(a, b)}</mark>);
                  if (i === marks.length - 1) acc.push(text.slice(b) + '\n');
                  return acc;
                }, [])
              : null}
          </div>
          <textarea ref={ta} className="script" value={text} onChange={(e) => edit(e.target.value)} onKeyDown={keys} onScroll={syncScroll} spellCheck={false} placeholder="Paste or upload your SRT here" />
        </div>
      </div>
      <div className="help">
        <h3>How the script works</h3>
        <p>The script is a normal SRT subtitle file. The narrator reads it out loud.</p>
        <p>
          Put a <b>picture tag</b> like <code>[1.1]</code> right before the word where a drawing should appear. <code>[1.1]</code> is image 1, object 1;{' '}
          <code>[2.4]</code> is image 2, object 4.
        </p>
        <p>Each image is a 2 × 3 grid, read like a book:</p>
        <pre>{'n.1  n.2  n.3\nn.4  n.5  n.6'}</pre>
        <p>
          You can also type effects like <code>[shake]</code> here, but it is easier to pick them in <b>2. Images &amp; Effects</b>.
        </p>
        <p>
          Made a mistake? <b>Ctrl+Z</b> undoes, <b>Ctrl+Y</b> redoes, <b>Ctrl+S</b> saves. Every save also keeps the old script, so you can bring it back from <b>Older saves</b>.
        </p>
      </div>
    </div>
  );
};

// ---------- 2. images & effects ----------
const Images: React.FC<{proj: Project; reload: () => void; say: (m: string) => void; goScript: () => void}> = ({proj, reload, say, goScript}) => {
  const [fx, setFx] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [soundFor, setSoundFor] = useState<string | null>(null);  // object key the sound picker is open for
  useEffect(() => void api('/api/sfx').then(setSounds).catch(() => setSounds([])), []);
  // background loops already used, so the picker can offer to stop them
  const loops = useMemo(() => {
    const all = [proj.script, ...Object.values(fx).flat()].join(' ');
    return [...new Set([...all.matchAll(/amb:\s*(\S+\.mp3)/gi)].map((m) => m[1]))];
  }, [proj.script, fx]);
  useEffect(() => {
    setFx(Object.fromEntries(proj.objects.map((o) => [o.key, o.fx])));
    setDirty(false);
  }, [proj.objects]);
  const objMap = useMemo(() => Object.fromEntries(proj.objects.map((o) => [o.key, o])), [proj.objects]);
  const imgMap = useMemo(() => Object.fromEntries(proj.images.map((i) => [i.n, i.url])), [proj.images]);
  const [rows, cols] = proj.config.grid || [2, 3];
  const K = rows * cols;
  const maxN = Math.max(0, ...proj.objects.map((o) => o.n), ...proj.images.map((i) => i.n));
  const slots = Array.from({length: maxN + 1}, (_, i) => i + 1);

  const uploadImg = async (n: number, f?: File) => {
    if (!f) return;
    const form = new FormData();
    form.append('file', f);
    try {
      await api(`/api/projects/${proj.id}/images/${n}`, {form});
      say(`Image ${n} uploaded`);
      reload();
    } catch (e: any) {
      say(e.message);
    }
  };
  const uploadMany = async (files: FileList | null) => {
    if (!files) return;
    // "3.png" goes to slot 3; files without a number fill the next empty slots
    let next = maxN + 1;
    for (const f of Array.from(files)) {
      const m = f.name.match(/(\d+)\.\w+$/);
      await uploadImg(m ? Number(m[1]) : next++, f);
    }
  };
  const del = async (n: number) => {
    if (!confirm(`Remove image ${n}?`)) return;
    await api(`/api/projects/${proj.id}/images/${n}`, {method: 'DELETE'});
    reload();
  };
  const setObjFx = (key: string, list: string[]) => {
    setFx((s) => ({...s, [key]: list}));
    setDirty(true);
  };
  const save = async () => {
    try {
      await api(`/api/projects/${proj.id}/effects`, {method: 'PUT', body: {effects: fx}});
      say('Effects saved. Open 3. Play and press "Build preview" to see them.');
      setDirty(false);
      reload();
    } catch (e: any) {
      say(e.message);
    }
  };

  return (
    <div>
      <div className="row sticky">
        <label className="btn">
          Upload images
          <input type="file" accept="image/*" multiple hidden onChange={(e) => uploadMany(e.target.files)} />
        </label>
        <span className="muted">Name files 1.png, 2.png… and they go to the right slot. Or drop an image on a slot.</span>
        <span className="spacer" />
        <button className="primary" onClick={save} disabled={!dirty}>{dirty ? 'Save effects' : 'Effects saved'}</button>
      </div>
      {soundFor && (
        <SoundPicker
          target={soundFor}
          sounds={sounds}
          loops={loops}
          onClose={() => setSoundFor(null)}
          onAdd={(tag) => {
            setObjFx(soundFor, [...(fx[soundFor] || []), tag]);
            say(`Sound added to ${soundFor}. Press Save effects.`);
          }}
        />
      )}
      {!proj.objects.length && (
        <div className="note">
          No picture tags in the script yet, so effects can't be attached. <a onClick={goScript}>Add a script first</a>.
        </div>
      )}
      {slots.map((n) => (
        <div className="slot" key={n}>
          <div
            className={'imgbox' + (imgMap[n] ? '' : ' missing')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              uploadImg(n, e.dataTransfer.files[0]);
            }}
          >
            <div className="slothead">
              <b>Image {n}</b>
              <label className="btn small">
                {imgMap[n] ? 'Replace' : 'Upload'}
                <input type="file" accept="image/*" hidden onChange={(e) => uploadImg(n, e.target.files?.[0])} />
              </label>
              {imgMap[n] && (
                <a className="btn small" href={imgMap[n]} download={`${proj.id}_image${n}${(imgMap[n].match(/\.\w+(?=\?|$)/) || ['.png'])[0]}`} title="Save a copy of this image to your Downloads">
                  Download
                </a>
              )}
              {imgMap[n] && <button className="small ghost" onClick={() => del(n)}>Remove</button>}
            </div>
            {imgMap[n] ? <img src={imgMap[n]} /> : <div className="drop">Drop image {n} here</div>}
          </div>
          <div className="objs" style={{gridTemplateColumns: `repeat(${cols}, 1fr)`}}>
            {Array.from({length: K}, (_, i) => {
              const key = `${n}.${i + 1}`;
              const o = objMap[key];
              const r = Math.floor(i / cols);
              const c = i % cols;
              return (
                <div className={'obj' + (o ? '' : ' off')} key={key}>
                  <div
                    className="crop"
                    style={imgMap[n] ? {backgroundImage: `url(${imgMap[n]})`, backgroundSize: `${cols * 100}% ${rows * 100}%`, backgroundPosition: `${cols > 1 ? (c / (cols - 1)) * 100 : 0}% ${rows > 1 ? (r / (rows - 1)) * 100 : 0}%`} : undefined}
                  />
                  <div className="okey">{key}</div>
                  <div className="otext" title={o?.text}>{o ? o.text || '…' : 'not in script'}</div>
                  {o && <FxPicker list={fx[key] || []} onChange={(l) => setObjFx(key, l)} onSound={() => setSoundFor(key)} />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// ---------- image editor ----------
// Draw on a storyboard image, cover things with white, or swap one object for a new picture.
type Tool = 'pen' | 'white' | 'box' | 'whitebox' | 'swap' | 'clear';
const TOOLS: [Tool, string, string][] = [
  ['pen', '✏️ Pen', 'Draw lines'],
  ['white', '🧽 White brush', 'Paint white over anything'],
  ['box', '▭ Box', 'Drag to draw a box outline'],
  ['whitebox', '⬜ White box', 'Drag to cover an area with white'],
  ['swap', '🖼️ New picture', 'Click an object, then pick a file (or press Ctrl+V first to paste one)'],
  ['clear', '🗑️ Empty object', 'Click an object to make it blank white'],
];
const COLORS = ['#111111', '#d6402f', '#f08a24', '#2f6fd1', '#ffffff'];

const ImageEditor: React.FC<{proj: Project; reload: () => void; say: (m: string) => void}> = ({proj, reload, say}) => {
  const [n, setN] = useState<number | null>(proj.images[0]?.n ?? null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(6);
  const [dirty, setDirty] = useState(false);
  const [pasted, setPasted] = useState<HTMLImageElement | null>(null);  // picture waiting to be placed
  const [hover, setHover] = useState<number | null>(null);  // object cell under the mouse
  const main = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const undo = useRef<ImageData[]>([]);
  const drag = useRef<{x: number; y: number} | null>(null);
  const swapCell = useRef<number | null>(null);
  const [rows, cols] = proj.config.grid || [2, 3];
  const url = proj.images.find((i) => i.n === n)?.url;

  useEffect(() => {
    if (!url || !main.current) return;
    const img = new Image();
    img.onload = () => {
      for (const c of [main.current!, over.current!]) {
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
      }
      main.current!.getContext('2d')!.drawImage(img, 0, 0);
      undo.current = [];
      setDirty(false);
    };
    img.src = url;
  }, [url]);

  // Ctrl+V a picture (e.g. copied from ChatGPT), then click the object it should replace
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        setPasted(img);
        setTool('swap');
        say('Picture pasted. Now click the object it should replace.');
      };
      img.src = URL.createObjectURL(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [say]);

  const ctx = () => main.current!.getContext('2d')!;
  const remember = () => {
    const c = main.current!;
    undo.current = [...undo.current.slice(-19), ctx().getImageData(0, 0, c.width, c.height)];
    setDirty(true);
  };
  const back = () => {
    const last = undo.current.pop();
    if (last) ctx().putImageData(last, 0, 0);
    setDirty(undo.current.length > 0);
  };
  const pos = (e: React.PointerEvent) => {
    const r = main.current!.getBoundingClientRect();
    return {x: ((e.clientX - r.left) / r.width) * main.current!.width, y: ((e.clientY - r.top) / r.height) * main.current!.height};
  };
  const cellAt = (p: {x: number; y: number}) => {
    const c = main.current!;
    return Math.min(rows - 1, Math.floor((p.y / c.height) * rows)) * cols + Math.min(cols - 1, Math.floor((p.x / c.width) * cols));
  };
  const cellRect = (i: number) => {
    const c = main.current!;
    const w = c.width / cols;
    const h = c.height / rows;
    return [(i % cols) * w, Math.floor(i / cols) * h, w, h];
  };
  // draw the grid / box preview on the top canvas
  const drawOver = (box?: number[]) => {
    const c = over.current!;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    if (tool === 'swap' || tool === 'clear') {
      g.setLineDash([12, 8]);
      g.lineWidth = 3;
      for (let i = 0; i < rows * cols; i++) {
        const [x, y, w, h] = cellRect(i);
        g.strokeStyle = i === hover ? '#d6402f' : '#2f6fd188';
        g.fillStyle = i === hover ? '#d6402f22' : 'transparent';
        g.fillRect(x, y, w, h);
        g.strokeRect(x + 2, y + 2, w - 4, h - 4);
        g.fillStyle = '#2f6fd1';
        g.font = 'bold 28px sans-serif';
        g.fillText(`${n}.${i + 1}`, x + 12, y + 36);
      }
      g.setLineDash([]);
    }
    if (box) {
      const [x0, y0, x1, y1] = box;
      g.lineWidth = tool === 'box' ? size : 2;
      g.strokeStyle = tool === 'box' ? color : '#2f6fd1';
      g.fillStyle = tool === 'whitebox' ? '#ffffffcc' : 'transparent';
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
  };
  useEffect(() => {
    if (over.current?.width) drawOver();
  });

  // fit a picture inside an object cell on a white background
  const place = (img: HTMLImageElement, i: number) => {
    remember();
    const [x, y, w, h] = cellRect(i);
    const pad = Math.min(w, h) * 0.04;
    const s = Math.min((w - 2 * pad) / img.naturalWidth, (h - 2 * pad) / img.naturalHeight);
    const g = ctx();
    g.fillStyle = '#fff';
    g.fillRect(x, y, w, h);
    g.drawImage(img, x + (w - img.naturalWidth * s) / 2, y + (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  };
  const pickFile = (f?: File) => {
    const i = swapCell.current;
    if (!f || i == null) return;
    const img = new Image();
    img.onload = () => place(img, i);
    img.src = URL.createObjectURL(f);
  };

  const down = (e: React.PointerEvent) => {
    const p = pos(e);
    if (tool === 'swap' || tool === 'clear') {
      const i = cellAt(p);
      if (tool === 'clear') {
        remember();
        const [x, y, w, h] = cellRect(i);
        ctx().fillStyle = '#fff';
        ctx().fillRect(x, y, w, h);
      } else if (pasted) {
        place(pasted, i);
        setPasted(null);
      } else {
        swapCell.current = i;
        file.current?.click();
      }
      return;
    }
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);  // keep drawing if the mouse leaves the image
    } catch {}
    drag.current = p;
    if (tool === 'pen' || tool === 'white') {
      remember();
      const g = ctx();
      g.strokeStyle = tool === 'white' ? '#fff' : color;
      g.lineWidth = tool === 'white' ? size * 4 : size;
      g.lineCap = g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + 0.1, p.y);
      g.stroke();
    }
  };
  const move = (e: React.PointerEvent) => {
    const p = pos(e);
    if (tool === 'swap' || tool === 'clear') {
      const i = cellAt(p);
      if (i !== hover) setHover(i);
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (tool === 'pen' || tool === 'white') {
      const g = ctx();
      g.lineTo(p.x, p.y);
      g.stroke();
    } else {
      drawOver([d.x, d.y, p.x, p.y]);
    }
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || (tool !== 'box' && tool !== 'whitebox')) return;
    const p = pos(e);
    drawOver();
    if (Math.abs(p.x - d.x) < 3 || Math.abs(p.y - d.y) < 3) return;
    remember();
    const g = ctx();
    if (tool === 'whitebox') {
      g.fillStyle = '#fff';
      g.fillRect(d.x, d.y, p.x - d.x, p.y - d.y);
    } else {
      g.strokeStyle = color;
      g.lineWidth = size;
      g.strokeRect(d.x, d.y, p.x - d.x, p.y - d.y);
    }
  };

  const save = () =>
    main.current!.toBlob(async (b) => {
      if (!b || n == null) return;
      const form = new FormData();
      form.append('file', b, `${n}.png`);
      try {
        await api(`/api/projects/${proj.id}/images/${n}?keep=1`, {form});
        setDirty(false);
        say(`Image ${n} saved (the original is kept in images_backup). Build the preview again to see it.`);
        reload();
      } catch (err: any) {
        say(err.message);
      }
    }, 'image/png');
  const restore = async () => {
    if (n == null || !confirm(`Put back the original image ${n}? Your edits to it will be lost.`)) return;
    try {
      await api(`/api/projects/${proj.id}/images/${n}/restore`, {method: 'POST'});
      say(`Original image ${n} is back`);
      reload();
    } catch (err: any) {
      say(err.message);
    }
  };
  const choose = (k: number) => {
    if (dirty && !confirm('You have unsaved changes. Leave this image anyway?')) return;
    setN(k);
  };

  if (!proj.images.length) return <p className="muted">No images yet. Upload some in "2. Images & Effects" first.</p>;
  return (
    <div className="editor">
      <div className="row">
        <b>Image:</b>
        {proj.images.map((i) => (
          <button key={i.n} className={i.n === n ? 'primary small' : 'small'} onClick={() => choose(i.n)}>{i.n}</button>
        ))}
      </div>
      <div className="row sticky ed-tools">
        {TOOLS.map(([k, label, tip]) => (
          <button key={k} className={tool === k ? 'on' : ''} title={tip} onClick={() => setTool(k)}>{label}</button>
        ))}
        <span className="ed-sep" />
        {COLORS.map((c) => (
          <button key={c} className={`ed-color${color === c ? ' on' : ''}`} style={{background: c}} title="Colour" onClick={() => setColor(c)} />
        ))}
        <span className="ed-sep" />
        {[3, 6, 12].map((s, i) => (
          <button key={s} className={size === s ? 'on small' : 'small'} onClick={() => setSize(s)}>{['Thin', 'Medium', 'Thick'][i]}</button>
        ))}
        <span className="ed-sep" />
        <button onClick={back} disabled={!undo.current.length}>↶ Undo</button>
        <button className="primary" onClick={save} disabled={!dirty}>💾 Save</button>
        <button className="small ghost" onClick={restore}>Restore original</button>
      </div>
      <p className="muted">
        {TOOLS.find((t) => t[0] === tool)![2]}.{pasted ? ' A pasted picture is waiting: click an object.' : ''} Tip: copy a picture anywhere (e.g. ChatGPT), press Ctrl+V here, then click the object.
      </p>
      <div className="ed-stage">
        <canvas ref={main} />
        <canvas ref={over} className={`ed-over ed-${tool}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => setHover(null)} />
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => (pickFile(e.target.files?.[0]), (e.target.value = ''))} />
    </div>
  );
};

const FxPicker: React.FC<{list: string[]; onChange: (l: string[]) => void; onSound: () => void}> = ({list, onChange, onSound}) => (
  <div className="fx">
    {list.map((v, i) => (
      <span className={'chip' + (soundTag(v) ? ' snd' : '')} key={i} title={v}>
        {soundTag(v) && soundTag(v)!.kind !== 'amb-stop' && (
          <button title="Preview" onClick={() => playSound(soundTag(v)!.file, Number(v.match(/vol=(\d+)/)?.[1] || 100))}>▶</button>
        )}
        {fxLabel(v)}
        <button onClick={() => onChange(list.filter((_, j) => j !== i))}>×</button>
      </span>
    ))}
    <select
      value=""
      onChange={(e) => {
        let v = e.target.value;
        if (!v) return;
        if (v === 'label') {
          const t = prompt('Text to show on screen (for example: Six years later)');
          if (!t) return;
          v = `label: ${t}`;
        }
        onChange([...list, v]);
      }}
    >
      <option value="">+ add effect</option>
      {EFFECTS.map((e) => (
        <option key={e.v} value={e.v}>
          {e.label}
        </option>
      ))}
    </select>
    <button className="small" onClick={onSound}>+ sound</button>
  </div>
);

// one shared player, so starting a preview stops the last one
const preview: HTMLAudioElement | null = typeof Audio !== 'undefined' ? new Audio() : null;
const playSound = (file: string, vol = 100) => {
  if (!preview) return;
  if (!preview.paused && preview.dataset.file === file) return void preview.pause();
  preview.src = `/sfx/${file.split('/').map(encodeURIComponent).join('/')}`;
  preview.dataset.file = file;
  preview.volume = Math.min(1, Math.max(0.05, vol / 100));
  preview.play().catch(() => {});
};

const SoundPicker: React.FC<{target: string; sounds: Sound[]; loops: string[]; onAdd: (tag: string) => void; onClose: () => void}> = ({target, sounds, loops, onAdd, onClose}) => {
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');
  const [kind, setKind] = useState<'sfx' | 'amb' | 'stop'>('sfx');
  const [vol, setVol] = useState(40);
  const [fadeIn, setFadeIn] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [times, setTimes] = useState(1);
  const folders = useMemo(() => [...new Set(sounds.map((s) => s.folder))], [sounds]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = sounds.filter((s) => (!folder || s.folder === folder) && words.every((w) => s.file.toLowerCase().includes(w)));
  useEffect(() => setVol(kind === 'amb' ? 15 : 40), [kind]);
  useEffect(() => () => preview?.pause(), []);
  const tagFor = (file: string) => {
    if (kind === 'stop') return `amb-stop:${file.split('/').pop()!.replace(/\.mp3$/, '')}`;
    const opts = [`vol=${vol}`, kind === 'amb' && 'loop', (fadeIn || kind === 'amb') && 'fade-in', fadeOut && 'fade-out', times > 1 && `x${times}`];
    return `${kind}:${file} ${opts.filter(Boolean).join(' ')}`;
  };
  const add = (file: string) => {
    onAdd(tagFor(file));
    onClose();
  };
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 style={{margin: 0}}>Add a sound to {target}</h3>
          <span className="spacer" />
          <button className="small" onClick={onClose}>Close</button>
        </div>
        <div className="row">
          <div className="seg">
            <button className={kind === 'sfx' ? 'on' : ''} onClick={() => setKind('sfx')}>Play once</button>
            <button className={kind === 'amb' ? 'on' : ''} onClick={() => setKind('amb')}>Background loop</button>
            <button className={kind === 'stop' ? 'on' : ''} onClick={() => setKind('stop')}>Stop a loop</button>
          </div>
        </div>
        {kind === 'stop' ? (
          <div className="slist">
            {!loops.length && <p className="muted" style={{padding: 10}}>No background loops in this script yet.</p>}
            {loops.map((f) => (
              <div className="srow" key={f}>
                <span className="grow">{soundName(f)}</span>
                <button className="small primary" onClick={() => add(f)}>Stop here</button>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="row">
              <input autoFocus placeholder="Search: roar, rain, door, scream…" value={q} onChange={(e) => setQ(e.target.value)} style={{flex: 1, minWidth: 180}} />
              <select value={folder} onChange={(e) => setFolder(e.target.value)}>
                <option value="">All folders</option>
                {folders.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="row">
              <label>Volume <input type="range" min={5} max={100} value={vol} onChange={(e) => setVol(Number(e.target.value))} /> {vol}%</label>
              {kind === 'sfx' && (
                <>
                  <label><input type="checkbox" checked={fadeIn} onChange={(e) => setFadeIn(e.target.checked)} /> fade in</label>
                  <label><input type="checkbox" checked={fadeOut} onChange={(e) => setFadeOut(e.target.checked)} /> fade out</label>
                  <label>Repeat <select value={times} onChange={(e) => setTimes(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 1 ? 'once' : `x${n}`}</option>)}</select></label>
                </>
              )}
              {kind === 'amb' && <span className="muted">Loops until a later "Stop a loop", or the end of the video.</span>}
            </div>
            <div className="muted">{shown.length} sounds{shown.length > 300 ? ', showing the first 300. Search to narrow it down.' : ''}</div>
            <div className="slist">
              {!sounds.length && <p className="muted" style={{padding: 10}}>No sound library found. Run <code>python sfx/download.py</code> in the project folder.</p>}
              {shown.slice(0, 300).map((s) => (
                <div className="srow" key={s.file}>
                  <button className="small" title="Preview" onClick={() => playSound(s.file, vol)}>▶</button>
                  <span className="grow">{s.name}</span>
                  <span className="muted">{s.folder}</span>
                  <button className="small primary" onClick={() => add(s.file)}>Add</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ---------- 3. play ----------
const useJob = (id: string) => {
  const [st, setSt] = useState<any>({state: 'idle'});
  const timer = useRef<any>();
  const poll = useCallback(() => {
    clearTimeout(timer.current);
    api(`/api/projects/${id}/status`).then((s) => {
      setSt(s);
      if (s.state === 'running') timer.current = setTimeout(poll, 1500);
    });
  }, [id]);
  useEffect(() => {
    poll();
    return () => clearTimeout(timer.current);
  }, [poll]);
  return [st, poll] as const;
};

const Play: React.FC<{proj: Project; reload: () => void; say: (m: string) => void}> = ({proj, reload, say}) => {
  const [st, poll] = useJob(proj.id);
  const [job, setJob] = useState<Job | null>(null);
  const [stamp, setStamp] = useState(0);
  const loadJob = useCallback(() => {
    api(`/api/projects/${proj.id}/preview`).then((p) => {
      setJob(p.job);
      setStamp(Date.now());
    }).catch(() => setJob(null));
  }, [proj.id]);
  useEffect(() => void loadJob(), [loadJob]);
  const prev = useRef(st.state);
  useEffect(() => {
    if (prev.current === 'running' && st.state === 'done' && st.kind === 'build') {
      loadJob();
      reload();
      say('Preview ready');
    }
    if (prev.current === 'running' && st.state === 'error') say('Something went wrong, see the log below');
    prev.current = st.state;
  }, [st, loadJob, reload, say]);
  const build = async () => {
    try {
      resumeAt.current = player.current?.getCurrentFrame() ?? resumeAt.current;
      await api(`/api/projects/${proj.id}/build`, {body: {}});
      poll();
    } catch (e: any) {
      say(e.message);
    }
  };
  const busy = st.state === 'running';
  const frames = job ? totalFrames(job) : 1;
  const player = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  // after a rebuild, carry on from the same spot
  const resumeAt = useRef(Number(new URLSearchParams(location.search).get('t') || 0) * 30);
  useEffect(() => {
    const pl = player.current;
    if (!pl) return;
    const on = (e: any) => setFrame(e.detail.frame);
    pl.addEventListener('frameupdate', on);
    return () => pl.removeEventListener('frameupdate', on);
  }, [stamp]);
  // the look switches live in the preview and is saved for the final video
  const [mode, setMode] = useState<string>(proj.config.mode || 'storyboard');
  const pickMode = (m: string) => {
    setMode(m);
    api(`/api/projects/${proj.id}/config`, {method: 'PUT', body: {mode: m}}).then(() => say(m === 'focus' ? 'Look: one object at a time, centred' : 'Look: whole storyboard'));
  };
  return (
    <div>
      <div className="row">
        <button className="primary" onClick={build} disabled={busy}>
          {busy && st.kind === 'build' ? 'Building…' : job ? 'Rebuild preview' : 'Build preview'}
        </button>
        {job && (
          <a className="btn" href={`/${job.dir}/${job.audio}?v=${stamp}`} download={`${proj.id}.wav`} title="The narration with sounds and music, to listen anywhere">
            🎧 Download audio
          </a>
        )}
        {!proj.images.length && <span className="note" style={{margin: 0, padding: '4px 10px'}}>No images yet: the preview shows big captions so you can listen.</span>}
        <span className="muted">
          Press this after changing the script, images or effects. The first time takes a minute (it records the voice); after that it's quick.
        </span>
      </div>
      <div className="row">
        <b>Look:</b>
        <div className="seg">
          <button className={mode !== 'focus' ? 'on' : ''} onClick={() => pickMode('storyboard')}>Whole storyboard (camera moves)</button>
          <button className={mode === 'focus' ? 'on' : ''} onClick={() => pickMode('focus')}>One object at a time (cropped, centred)</button>
        </div>
      </div>
      {busy && (
        <div className="row">
          <button onClick={() => cancel(proj.id, say, poll)}>✖ Cancel {st.kind === 'build' ? 'build' : st.kind === 'short' ? 'Short' : 'video'}</button>
        </div>
      )}
      {busy && <pre className="log">{st.log.split('\n').slice(-6).join('\n')}</pre>}
      {st.state === 'error' && <pre className="log err">{st.log}</pre>}
      {job ? (
        <div className="player">
          <Player ref={player} key={stamp} component={Auto} inputProps={{job: {...job, mode: mode as Job['mode']}}} durationInFrames={frames} fps={30} compositionWidth={1920} compositionHeight={1080} controls style={{width: '100%'}}
            initialFrame={Math.min(frames - 1, Math.max(0, Math.round(resumeAt.current)))} />
          <Timeline job={job} frame={frame} frames={frames} seek={(f) => player.current?.seekTo(f)} />
        </div>
      ) : (
        !busy && <div className="note">No preview yet. Press "Build preview".</div>
      )}
    </div>
  );
};

// ---------- 4. render ----------
const Render: React.FC<{proj: Project; reload: () => void; say: (m: string) => void}> = ({proj, reload, say}) => {
  const [st, poll] = useJob(proj.id);
  const prev = useRef(st.state);
  const [q, setQ] = useState<{running: {id: string; kind: string; progress: number}[]; waiting: {id: string; kind: string}[]}>({running: [], waiting: []});
  const loadQ = useCallback(() => api('/api/queue').then(setQ).catch(() => {}), []);
  useEffect(() => {
    loadQ();
    const iv = setInterval(() => (loadQ(), poll()), 3000);
    return () => clearInterval(iv);
  }, [loadQ, poll]);
  useEffect(() => {
    if (prev.current === 'running' && st.state === 'done' && st.kind !== 'build') {
      reload();
      say(st.kind === 'short' ? 'Short finished!' : 'Video finished!');
    }
    prev.current = st.state;
  }, [st, reload, say]);
  const go = async (short = false) => {
    try {
      const r = await api(`/api/projects/${proj.id}/render`, {body: {short}});
      say(r.position ? `Added to the queue (#${r.position}). It starts when the current video is done.` : short ? 'Making the Short…' : 'Making the video…');
      poll();
      loadQ();
    } catch (e: any) {
      say(e.message);
    }
  };
  const busy = st.state === 'running' && st.kind !== 'build';
  const label = (k: string) => (k === 'short' ? 'Short' : 'Video');
  return (
    <div>
      <div className="row">
        <button className="primary" onClick={() => go(false)} disabled={busy}>
          {busy && st.kind === 'render' ? 'Making video…' : 'Make the final video'}
        </button>
        <button onClick={() => go(true)} disabled={busy} title="Vertical 9:16 clip around the most dramatic line, for Shorts / TikTok">
          {busy && st.kind === 'short' ? 'Making Short…' : 'Make a Short (9:16)'}
        </button>
        <button onClick={() => api('/api/open', {body: {what: 'videos'}})}>Open videos folder</button>
        <span className="muted">A 5 minute video takes about 20–25 minutes. If another video is rendering, this one waits in the queue, so you can line up several parts and leave it overnight.</span>
      </div>
      {busy && (
        <>
          <div className="bar">
            <div style={{width: `${st.progress}%`}} />
          </div>
          <div className="row">
            <span className="muted">{label(st.kind)}: {st.progress}%</span>
            <button className="small" onClick={() => cancel(proj.id, say, poll)}>✖ Cancel</button>
          </div>
        </>
      )}
      {(q.running.length > 0 || q.waiting.length > 0) && (
        <div className="queue">
          <b>Render queue</b>
          {q.running.map((r) => (
            <div key={r.id + r.kind}>▶ {r.id} ({label(r.kind)}) {r.progress}%</div>
          ))}
          {q.waiting.map((w, i) => (
            <div key={w.id + w.kind}>
              {i + 1}. {w.id} ({label(w.kind)}) <button className="small ghost" onClick={() => api(`/api/queue/${i}`, {method: 'DELETE'}).then(loadQ)}>remove</button>
            </div>
          ))}
        </div>
      )}
      {st.state === 'error' && st.kind !== 'build' && <pre className="log err">{st.log}</pre>}
      <div className="cols">
        {proj.video && (
          <div className="player grow">
            <h3>Finished video</h3>
            <video src={proj.video} controls style={{width: '100%'}} />
          </div>
        )}
        {proj.short && (
          <div className="player" style={{width: 300}}>
            <h3>Short</h3>
            <video src={proj.short} controls style={{width: '100%'}} />
          </div>
        )}
      </div>
    </div>
  );
};

const cancel = async (id: string, say: (m: string) => void, poll: () => void) => {
  if (!confirm('Stop it? Progress so far is thrown away.')) return;
  await api(`/api/projects/${id}/cancel`, {body: {}});
  say('Cancelled');
  setTimeout(poll, 1500);
};

// ---------- timeline under the preview: images, objects, effects, sounds; click to jump ----------
const Timeline: React.FC<{job: Job; frame: number; frames: number; seek: (f: number) => void}> = ({job, frame, frames, seek}) => {
  const total = frames / 30;
  const off = job.hook?.dur ?? 0;
  const pct = (t: number) => `${((t + off) / total) * 100}%`;
  const bar = useRef<HTMLDivElement>(null);
  const click = (e: React.MouseEvent) => {
    const r = bar.current!.getBoundingClientRect();
    seek(Math.round(((e.clientX - r.left) / r.width) * frames));
  };
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  return (
    <div className="timeline" ref={bar} onClick={click}>
      {off > 0 && <div className="tl-hook" style={{left: 0, width: `${(off / total) * 100}%`}} title="Hook intro">hook</div>}
      <div className="tl-row">
        {job.panels.map((p, i) => {
          const a = p.starts[0];
          const b = job.panels[i + 1]?.starts[0] ?? job.end;
          return (
            <div key={i} className={'tl-img' + (i % 2 ? ' alt' : '')} style={{left: pct(a), width: `${((b - a) / total) * 100}%`}} title={`Image ${i + 1} at ${mmss(a + off)}`}>
              {i + 1}
            </div>
          );
        })}
      </div>
      <div className="tl-row thin">
        {job.panels.flatMap((p, i) => p.starts.map((s, k) => <i key={`${i}.${k}`} className="tl-obj" style={{left: pct(s)}} title={`${i + 1}.${k + 1} at ${mmss(s + off)}`} />))}
      </div>
      <div className="tl-row thin">
        {job.fx.map((f, i) => <i key={i} className="tl-fx" style={{left: pct(f.t)}} title={`${f.type}${f.arg ? ':' + f.arg : ''} at ${mmss(f.t + off)}`} />)}
      </div>
      <div className="tl-row thin">
        {(job.sounds || []).map((s, i) => (
          <i key={i} className={'tl-snd' + (s.kind === 'amb' ? ' loop' : s.kind === 'amb-stop' ? ' stop' : '')} style={{left: pct(s.t)}} title={`${s.kind} ${s.file} at ${mmss(s.t + off)}`} />
        ))}
      </div>
      <div className="tl-head" style={{left: `${(frame / frames) * 100}%`}} />
      <div className="tl-legend">
        <span>pictures</span><span className="o">objects</span><span className="f">effects</span><span className="s">sounds</span>
        <span className="muted">click anywhere to jump · {mmss(frame / 30)} / {mmss(total)}</span>
      </div>
    </div>
  );
};

// ---------- YouTube: title, description, tags and a thumbnail per part ----------
const YT_DEFAULT = {
  title: '{series} (Part {n})',
  description: '{series} – Part {n}\n\nWrite a spoiler-free hook for the whole series here.\n\nNew part every day.\n\nSubscribe so you don\'t miss the next part.\n\n#storytime #animation #survivalstory #doodleanimation',
  tags: 'storytime, animated story, doodle animation, survival story',
  series: '',
};
const YouTube: React.FC<{proj: Project; reload: () => void; say: (m: string) => void}> = ({proj, reload, say}) => {
  const end = proj.config.end_card || {};
  const [y, setY] = useState({
    ...YT_DEFAULT,
    endText: (end.text || 'Part {next} coming next...').replace(/^Part \d+ coming next/, 'Part {next} coming next'),
    endSub: end.sub || "Subscribe so you don't miss it!",
    ...(proj.config.youtube || {}),
  });
  const n = Number(proj.id.match(/(\d+)\D*$/)?.[1] || 1);
  const fillWith = (v: any) => (t: string) =>
    (t || '').replaceAll('{n}', String(n)).replace(/Part #/g, `Part ${n}`).replaceAll('{next}', String(n + 1)).replaceAll('{series}', v.series || proj.id.replace(/[_\d]+$/, '').replace(/_/g, ' '));
  const fill = fillWith(y);
  const set = (k: string, v: string) => setY((s: any) => ({...s, [k]: v}));
  // the end card ("Part 7 coming next... / Subscribe") is written into the project too
  const saveWith = async (v: any, msg = 'Saved. Duplicate this project for the next part and these come along.') => {
    const f = fillWith(v);
    await api(`/api/projects/${proj.id}/config`, {method: 'PUT', body: {youtube: v, end_card: {text: f(v.endText), sub: f(v.endSub)}}});
    say(msg);
    reload();
  };
  const save = () => saveWith(y);
  // templates: one click fills title, description, tags, end card and thumbnail text
  const [templates, setTemplates] = useState<any[]>([]);
  const [tpl, setTpl] = useState('');
  // preselect the template this project already uses (same series), without applying it
  useEffect(() => void api('/api/templates').then((l) => (setTemplates(l), setTpl((t) => t || l.find((x: any) => x.series && x.series === y.series)?.name || ''))).catch(() => {}), []);
  // picking a template in the dropdown applies it straight away
  const useTemplate = async (name: string) => {
    setTpl(name);
    const t = templates.find((x) => x.name === name);
    if (!t) return;
    const v = {...y, series: t.series, title: t.title, description: t.description, tags: t.tags, endText: t.endText, endSub: t.endSub};
    setY(v);
    setLine1(t.thumbTop || '');
    setLine2(t.thumbBottom || '');
    if (t.thumbStyle) tset(t.thumbStyle);
    setExtra(t.thumbExtra || []);
    await saveWith(v, `"${t.name}" template used for Part ${n}`);
  };
  // asNew asks for a name; otherwise the selected template is updated in place
  const saveTemplate = async (asNew = true) => {
    const name = asNew ? prompt('Template name:', tpl || y.series || 'My series')?.trim() : tpl;
    if (!name) return;
    const t = {
      name, series: y.series, title: y.title, description: y.description, tags: y.tags, endText: y.endText, endSub: y.endSub,
      thumbTop: line1, thumbBottom: line2, thumbStyle: {...th, zoom: 1, px: 0, py: 0}, thumbExtra: extra,
    };
    const list = await api('/api/templates', {method: 'PUT', body: [...templates.filter((x) => x.name !== name), t]});
    setTemplates(list);
    setTpl(name);
    say(`Template "${name}" saved`);
  };
  // new blank template for a new series: loads into the page so it can be filled in, then "Save as template"
  const createTemplate = async () => {
    const name = prompt('New template name (e.g. Zombie school):')?.trim();
    if (!name) return;
    const series = prompt('Series title (used in the video title):', name)?.trim() || name;
    const t = {
      name, series, title: YT_DEFAULT.title, description: YT_DEFAULT.description, tags: YT_DEFAULT.tags,
      endText: 'Part {next} coming next...', endSub: "Subscribe so you don't miss it!", thumbTop: series, thumbBottom: '',
    };
    const list = await api('/api/templates', {method: 'PUT', body: [...templates.filter((x) => x.name !== name), t]});
    setTemplates(list);
    setTpl(name);
    setY((s: any) => ({...s, series, title: t.title, description: t.description, tags: t.tags, endText: t.endText, endSub: t.endSub}));
    setLine1(t.thumbTop);
    setLine2('');
    say(`Template "${name}" created. Edit the description and tags below, then press "💾 Save template".`);
  };
  const deleteTemplate = async () => {
    if (!tpl || !confirm(`Delete the "${tpl}" template?`)) return;
    const list = await api('/api/templates', {method: 'PUT', body: templates.filter((x) => x.name !== tpl)});
    setTemplates(list);
    setTpl(list[0]?.name || '');
  };
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => say('Copied'));
  // thumbnail
  const [img, setImg] = useState(proj.images[0]?.n || 1);
  const [obj, setObj] = useState(0);  // 0 = whole image
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [badge, setBadge] = useState(`Part ${n}`);
  const [th, setTh] = useState({
    zoom: 1, px: 0, py: 0,                      // picture zoom and pan (canvas px)
    size1: 84, size2: 84, color1: '#ffffff', color2: '#ffd23f',
    x1: 640, y1: 120, x2: 640, y2: 670,         // text positions (drag them on the picture)
    badgeColor: '#d6402f', badgeLeft: false,
    bg: '#ffffff', fade: 0,                     // background colour, dark fade at top and bottom
  });
  const tset = (p: Partial<typeof th>) => setTh((s) => ({...s, ...p}));
  const [stickers, setStickers] = useState<{kind: 'circle' | 'arrow'; x: number; y: number; s: number; rot: number}[]>([]);
  const [pick, setPick] = useState<number | null>(null);  // selected sticker
  // extra text boxes beyond the top and bottom lines
  type Txt = {text: string; x: number; y: number; size: number; color: string};
  const [extra, setExtra] = useState<Txt[]>([]);
  const setTxt = (i: number, p: Partial<Txt>) => setExtra((l) => l.map((t, k) => (k === i ? {...t, ...p} : t)));
  const [custom, setCustom] = useState<HTMLImageElement | null>(null);  // uploaded or pasted picture
  const [pic, setPic] = useState<HTMLImageElement | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const boxes = useRef<Record<string, number[]>>({});
  const grab = useRef<{what: string; dx: number; dy: number} | null>(null);
  const [rows, cols] = proj.config.grid || [2, 3];
  useEffect(() => {
    if (custom) return setPic(custom);
    const src = proj.images.find((i) => i.n === img)?.url;
    if (!src) return;
    const im = new Image();
    im.onload = () => setPic(im);
    im.src = src;
  }, [img, proj.images, custom]);
  // Ctrl+V a picture while on this tab to use it for the thumbnail
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
      if (!f || (e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) return;
      const im = new Image();
      im.onload = () => (setCustom(im), tset({zoom: 1, px: 0, py: 0}), say('Pasted picture is now the thumbnail background'));
      im.src = URL.createObjectURL(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [say]);
  useEffect(() => {
    const c = cv.current;
    if (!c || !pic) return;
    const g = c.getContext('2d')!;
    g.fillStyle = th.bg;
    g.fillRect(0, 0, 1280, 720);
    let sx = 0, sy = 0, sw = pic.width, sh = pic.height;
    if (obj > 0 && !custom) {
      sw = pic.width / cols;
      sh = pic.height / rows;
      sx = ((obj - 1) % cols) * sw;
      sy = Math.floor((obj - 1) / cols) * sh;
    }
    const sc = Math.min(1280 / sw, 720 / sh) * th.zoom;
    g.drawImage(pic, sx, sy, sw, sh, (1280 - sw * sc) / 2 + th.px, (720 - sh * sc) / 2 + th.py, sw * sc, sh * sc);
    if (th.fade > 0) {
      for (const [y0, y1] of [[0, 260], [720, 460]]) {
        const gr = g.createLinearGradient(0, y0, 0, y1);
        gr.addColorStop(0, `rgba(0,0,0,${th.fade})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(0, Math.min(y0, y1), 1280, 260);
      }
    }
    for (const [i, st] of stickers.entries()) {
      g.save();
      g.translate(st.x, st.y);
      g.rotate((st.rot * Math.PI) / 180);
      g.strokeStyle = '#ff2a1a';
      g.fillStyle = '#ff2a1a';
      g.lineWidth = st.s * 0.12;
      g.lineCap = g.lineJoin = 'round';
      if (st.kind === 'circle') {
        g.beginPath();
        g.ellipse(0, 0, st.s, st.s * 0.8, 0, 0, Math.PI * 2);
        g.stroke();
      } else {
        // arrow pointing right; rotate it with the Turn button
        g.beginPath();
        g.moveTo(-st.s, 0);
        g.lineTo(st.s * 0.45, 0);
        g.stroke();
        g.beginPath();
        g.moveTo(st.s, 0);
        g.lineTo(st.s * 0.3, -st.s * 0.45);
        g.lineTo(st.s * 0.3, st.s * 0.45);
        g.closePath();
        g.fill();
      }
      if (i === pick) {
        g.setLineDash([8, 6]);
        g.lineWidth = 2;
        g.strokeStyle = '#2f6fd1';
        g.strokeRect(-st.s * 1.15, -st.s * 1.15, st.s * 2.3, st.s * 2.3);
      }
      g.restore();
    }
    const text = (key: string, t: string, x: number, yy: number, size: number, fill: string) => {
      if (!t) return void delete boxes.current[key];
      // shrink until it fits the 1280 px width
      const T = t.toUpperCase();
      g.font = `900 ${size}px "Segoe UI", Arial, sans-serif`;
      while (size > 30 && g.measureText(T).width > 1180) g.font = `900 ${(size -= 4)}px "Segoe UI", Arial, sans-serif`;
      g.textAlign = 'center';
      g.lineJoin = 'round';
      g.lineWidth = size * 0.22;
      g.strokeStyle = '#111';
      g.strokeText(T, x, yy);
      g.fillStyle = fill;
      g.fillText(T, x, yy);
      const w = g.measureText(T).width;
      boxes.current[key] = [x - w / 2, yy - size, x + w / 2, yy + size * 0.25];
    };
    text('t1', line1, th.x1, th.y1, th.size1, th.color1);
    text('t2', line2, th.x2, th.y2, th.size2, th.color2);
    for (const k of Object.keys(boxes.current)) if (k.startsWith('e')) delete boxes.current[k];
    extra.forEach((t, i) => text(`e${i}`, t.text, t.x, t.y, t.size, t.color));
    if (badge.trim()) {
      // badge in a top corner, as wide as its text
      g.font = '900 46px "Segoe UI", Arial, sans-serif';
      const w = g.measureText(badge.toUpperCase()).width + 48;
      const x = th.badgeLeft ? 24 : 1256 - w;
      g.fillStyle = th.badgeColor;
      g.beginPath();
      (g as any).roundRect?.(x, 24, w, 74, 14);
      g.fill();
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.fillText(badge.toUpperCase(), x + w / 2, 78);
    }
  }, [pic, obj, custom, line1, line2, badge, th, stickers, pick, extra, rows, cols]);
  const at = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 1280, ((e.clientY - r.top) / r.height) * 720];
  };
  // drag a sticker, a text line, or (anywhere else) the picture
  const tDown = (e: React.PointerEvent) => {
    const [x, y] = at(e);
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    const si = stickers.findIndex((s) => Math.hypot(s.x - x, s.y - y) < s.s * 1.2);
    if (si >= 0) {
      setPick(si);
      grab.current = {what: `s${si}`, dx: x - stickers[si].x, dy: y - stickers[si].y};
      return;
    }
    setPick(null);
    for (const k of [...extra.map((_, i) => `e${i}`).reverse(), 't2', 't1']) {
      const b = boxes.current[k];
      if (b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) {
        const [ox, oy] = k[0] === 'e' ? [extra[Number(k.slice(1))].x, extra[Number(k.slice(1))].y] : [(th as any)[`x${k[1]}`], (th as any)[`y${k[1]}`]];
        grab.current = {what: k, dx: x - ox, dy: y - oy};
        return;
      }
    }
    grab.current = {what: 'pic', dx: x - th.px, dy: y - th.py};
  };
  const tMove = (e: React.PointerEvent) => {
    const gr = grab.current;
    if (!gr) return;
    const [x, y] = at(e);
    if (gr.what === 'pic') tset({px: x - gr.dx, py: y - gr.dy});
    else if (gr.what === 't1') tset({x1: x - gr.dx, y1: y - gr.dy});
    else if (gr.what === 't2') tset({x2: x - gr.dx, y2: y - gr.dy});
    else if (gr.what[0] === 'e') setTxt(Number(gr.what.slice(1)), {x: x - gr.dx, y: y - gr.dy});
    else {
      const i = Number(gr.what.slice(1));
      setStickers((l) => l.map((s, k) => (k === i ? {...s, x: x - gr.dx, y: y - gr.dy} : s)));
    }
  };
  const addSticker = (kind: 'circle' | 'arrow') => {
    setStickers((l) => [...l, {kind, x: 640, y: 380, s: kind === 'circle' ? 110 : 90, rot: kind === 'arrow' ? 135 : 0}]);
    setPick(stickers.length);
  };
  const editSticker = (f: (s: (typeof stickers)[0]) => (typeof stickers)[0] | null) =>
    pick != null && setStickers((l) => l.flatMap((s, k) => (k === pick ? [f(s)].filter(Boolean) as any : [s])));
  const resetThumb = () => {
    tset({zoom: 1, px: 0, py: 0, size1: 84, size2: 84, x1: 640, y1: 120, x2: 640, y2: 670, fade: 0, bg: '#ffffff'});
    setStickers([]);
    setExtra([]);
    setPick(null);
    setCustom(null);
  };
  // undo / redo: every settled change to the thumbnail is remembered (a drag counts once, when it ends)
  const [dragEnd, setDragEnd] = useState(0);
  const hist = useRef<{past: any[]; future: any[]; cur: any}>({past: [], future: [], cur: null});
  const [, bump] = useState(0);
  useEffect(() => {
    if (grab.current) return;
    const id = setTimeout(() => {
      const now = {th, stickers, line1, line2, badge, extra};
      const h = hist.current;
      if (h.cur && JSON.stringify(h.cur) === JSON.stringify(now)) return;
      if (h.cur) h.past = [...h.past.slice(-49), h.cur];
      h.cur = now;
      h.future = [];
      bump((x) => x + 1);
    }, 350);
    return () => clearTimeout(id);
  }, [th, stickers, line1, line2, badge, extra, dragEnd]);
  const restoreSnap = (s: any) => {
    setTh(s.th);
    setStickers(s.stickers);
    setLine1(s.line1);
    setLine2(s.line2);
    setBadge(s.badge);
    setExtra(s.extra || []);
    setPick(null);
    bump((x) => x + 1);
  };
  const undoThumb = () => {
    const h = hist.current;
    if (!h.past.length) return;
    h.future = [h.cur, ...h.future];
    h.cur = h.past.pop();
    restoreSnap(h.cur);
  };
  const redoThumb = () => {
    const h = hist.current;
    if (!h.future.length) return;
    h.past = [...h.past, h.cur];
    h.cur = h.future.shift();
    restoreSnap(h.cur);
  };
  // Ctrl+Z / Ctrl+Y (text boxes keep their own undo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) (e.preventDefault(), undoThumb());
      else if (k === 'y' || (k === 'z' && e.shiftKey)) (e.preventDefault(), redoThumb());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const SWATCH = ['#ffffff', '#ffd23f', '#ff3b2f', '#4cd964', '#3fa9ff', '#111111'];
  const download = () => {
    const a = document.createElement('a');
    a.href = cv.current!.toDataURL('image/png');
    a.download = `thumb_${proj.id}.png`;
    a.click();
  };
  return (
    <div className="cols">
      <div className="form grow">
        <div className="row note">
          <b>Template</b>
          <select value={tpl} onChange={(e) => useTemplate(e.target.value)}>
            <option value="" disabled>Choose a template…</option>
            {templates.map((t) => <option key={t.name}>{t.name}</option>)}
          </select>
          <button className="small" onClick={createTemplate} title="Start a new template for a new series">+ Create template</button>
          <button className="small" onClick={() => saveTemplate(false)} disabled={!tpl} title="Save the changes on this page into the selected template">💾 Save template</button>
          <button className="small" onClick={() => saveTemplate(true)} title="Save what is on this page as a new template">Save as new</button>
          <button className="small ghost" onClick={deleteTemplate} disabled={!tpl}>Delete</button>
        </div>
        <label>
          Series name <input value={y.series} placeholder="I Died in a Flood and Woke Up in Pangaea" onChange={(e) => set('series', e.target.value)} />
        </label>
        <label>
          Title template <input value={y.title} onChange={(e) => set('title', e.target.value)} /> <span className="muted">{'{series}'} and {'{n}'} (part number) are filled in</span>
        </label>
        <label>
          Description template <textarea rows={9} value={y.description} onChange={(e) => set('description', e.target.value)} />
        </label>
        <label>
          Tags <input value={y.tags} onChange={(e) => set('tags', e.target.value)} />
        </label>
        <label>
          End card text <input value={y.endText} onChange={(e) => set('endText', e.target.value)} /> <span className="muted">{'{next}'} = next part number. Shows as: {fill(y.endText)}</span>
        </label>
        <label>
          End card small text <input value={y.endSub} onChange={(e) => set('endSub', e.target.value)} />
        </label>
        <div className="row">
          <button className="primary" onClick={save}>Save</button>
        </div>
        <h3>Ready to paste (Part {n})</h3>
        <div className="ytout"><button className="small" onClick={() => copy(fill(y.title))}>Copy</button><b>{fill(y.title)}</b></div>
        <div className="ytout"><button className="small" onClick={() => copy(fill(y.description))}>Copy</button><pre>{fill(y.description)}</pre></div>
        <div className="ytout"><button className="small" onClick={() => copy(fill(y.tags))}>Copy</button><span>{fill(y.tags)}</span></div>
      </div>
      <div className="help" style={{width: 440}}>
        <h3>Thumbnail</h3>
        <div className="row">
          <label>Image <select value={img} onChange={(e) => (setImg(Number(e.target.value)), setCustom(null))}>{proj.images.map((i) => <option key={i.n} value={i.n}>{i.n}</option>)}</select></label>
          <label>Object <select value={obj} onChange={(e) => (setObj(Number(e.target.value)), setCustom(null), tset({zoom: 1, px: 0, py: 0}))}><option value={0}>whole</option>{Array.from({length: rows * cols}, (_, i) => <option key={i} value={i + 1}>{img}.{i + 1}</option>)}</select></label>
          <label className="btn small">
            Own picture
            <input type="file" accept="image/*" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const im = new Image();
              im.onload = () => (setCustom(im), tset({zoom: 1, px: 0, py: 0}));
              im.src = URL.createObjectURL(f);
            }} />
          </label>
        </div>
        <canvas ref={cv} width={1280} height={720} className="th-canvas" onPointerDown={tDown} onPointerMove={tMove} onPointerUp={() => ((grab.current = null), setDragEnd((x) => x + 1))} />
        <p className="muted">Drag the picture, the text or a sticker to move it. Ctrl+V pastes a picture.</p>
        <div className="th-grid">
          <span>Zoom</span>
          <input type="range" min={0.5} max={4} step={0.05} value={th.zoom} onChange={(e) => tset({zoom: Number(e.target.value)})} />
          <span>Dark fade</span>
          <input type="range" min={0} max={0.9} step={0.05} value={th.fade} onChange={(e) => tset({fade: Number(e.target.value)})} />
          <span>Background</span>
          <div className="row tight">
            {['#ffffff', '#111111', '#d6402f', '#ffd23f'].map((c) => <button key={c} className={`ed-color${th.bg === c ? ' on' : ''}`} style={{background: c}} onClick={() => tset({bg: c})} />)}
          </div>
        </div>
        {([1, 2] as const).map((i) => (
          <div key={i} className="th-line">
            <input placeholder={i === 1 ? 'Top text (e.g. DIED IN A FLOOD…)' : 'Bottom text (e.g. WOKE UP IN PANGAEA)'} value={i === 1 ? line1 : line2} onChange={(e) => (i === 1 ? setLine1 : setLine2)(e.target.value)} />
            <div className="row tight">
              {SWATCH.map((c) => <button key={c} className={`ed-color${(th as any)[`color${i}`] === c ? ' on' : ''}`} style={{background: c}} onClick={() => tset({[`color${i}`]: c} as any)} />)}
              <input type="range" min={40} max={160} value={(th as any)[`size${i}`]} title="Text size" onChange={(e) => tset({[`size${i}`]: Number(e.target.value)} as any)} />
            </div>
          </div>
        ))}
        {extra.map((t, i) => (
          <div key={i} className="th-line">
            <div className="row tight">
              <input style={{flex: 1}} placeholder={`Text ${i + 3}`} value={t.text} onChange={(e) => setTxt(i, {text: e.target.value})} />
              <button className="small ghost" onClick={() => setExtra((l) => l.filter((_, k) => k !== i))}>Remove</button>
            </div>
            <div className="row tight">
              {SWATCH.map((c) => <button key={c} className={`ed-color${t.color === c ? ' on' : ''}`} style={{background: c}} onClick={() => setTxt(i, {color: c})} />)}
              <input type="range" min={30} max={160} value={t.size} title="Text size" onChange={(e) => setTxt(i, {size: Number(e.target.value)})} />
            </div>
          </div>
        ))}
        <div className="row tight">
          <button className="small" onClick={() => setExtra((l) => [...l, {text: 'NEW TEXT', x: 640, y: 380 + (l.length % 3) * 70, size: 64, color: '#ffffff'}])}>+ Add text</button>
        </div>
        <div className="th-line">
          <input placeholder="Badge, empty = no badge" value={badge} onChange={(e) => setBadge(e.target.value)} />
          <div className="row tight">
            {['#d6402f', '#111111', '#2f6fd1', '#1f9d55', '#f08a24'].map((c) => <button key={c} className={`ed-color${th.badgeColor === c ? ' on' : ''}`} style={{background: c}} onClick={() => tset({badgeColor: c})} />)}
            <button className="small" onClick={() => tset({badgeLeft: !th.badgeLeft})}>{th.badgeLeft ? 'Move right' : 'Move left'}</button>
          </div>
        </div>
        <div className="row tight">
          <button className="small" onClick={() => addSticker('circle')}>⭕ Red circle</button>
          <button className="small" onClick={() => addSticker('arrow')}>➡️ Red arrow</button>
          {pick != null && (
            <>
              <button className="small" onClick={() => editSticker((s) => ({...s, s: s.s * 1.2}))}>Bigger</button>
              <button className="small" onClick={() => editSticker((s) => ({...s, s: s.s / 1.2}))}>Smaller</button>
              <button className="small" onClick={() => editSticker((s) => ({...s, rot: s.rot + 45}))}>Turn</button>
              <button className="small ghost" onClick={() => (editSticker(() => null), setPick(null))}>Remove</button>
            </>
          )}
        </div>
        <div className="row">
          <button className="primary" onClick={download} disabled={!pic}>Download thumbnail</button>
          <button className="small" onClick={undoThumb} disabled={!hist.current.past.length} title="Ctrl+Z">↶ Undo</button>
          <button className="small" onClick={redoThumb} disabled={!hist.current.future.length} title="Ctrl+Y">↷ Redo</button>
          <button className="small ghost" onClick={resetThumb}>Reset</button>
        </div>
      </div>
    </div>
  );
};

// ---------- settings ----------
const Settings: React.FC<{proj: Project; reload: () => void; say: (m: string) => void}> = ({proj, reload, say}) => {
  const c = proj.config;
  const [v, setV] = useState({
    mode: c.mode || 'storyboard',
    voice: c.voice || VOICES[0][0],
    rate: c.rate || '+6%',
    pitch: c.pitch || '-2Hz',
    captions: c.captions ?? true,
    subscribe_at: c.subscribe_at ?? 20,
    caption_style: c.caption_style || 'words',
    theme: c.theme || 'light',
    music: c.music || '',
    music_vol: c.music_vol ?? 15,
    hook: !!c.hook,
    endText: c.end_card?.text ?? 'To be continued...',
    endSub: c.end_card?.sub ?? "Subscribe so you don't miss it!",
  });
  const set = (k: string, val: any) => setV((s) => ({...s, [k]: val}));
  const save = async () => {
    await api(`/api/projects/${proj.id}/config`, {
      method: 'PUT',
      body: {
        mode: v.mode,
        voice: v.voice,
        rate: v.rate,
        pitch: v.pitch,
        captions: v.captions,
        caption_style: v.caption_style,
        theme: v.theme,
        music: v.music || null,
        music_vol: Number(v.music_vol) || 15,
        hook: v.hook,
        subscribe_at: v.subscribe_at === '' ? null : Number(v.subscribe_at),
        end_card: v.endText ? {text: v.endText, sub: v.endSub} : null,
      },
    });
    say('Settings saved. Rebuild the preview to hear them.');
    reload();
  };
  return (
    <div className="form">
      <label>
        Look
        <select value={v.mode} onChange={(e) => set('mode', e.target.value)}>
          <option value="storyboard">Whole storyboard (camera moves across the page)</option>
          <option value="focus">One object at a time (cropped, centred)</option>
        </select>
      </label>
      <label>
        Narrator voice
        <select value={v.voice} onChange={(e) => set('voice', e.target.value)}>
          {VOICES.map(([id, l]) => (
            <option key={id} value={id}>{l}</option>
          ))}
        </select>
      </label>
      <label>
        Speed <input value={v.rate} onChange={(e) => set('rate', e.target.value)} /> <span className="muted">e.g. +6% faster, -10% slower</span>
      </label>
      <label>
        Pitch <input value={v.pitch} onChange={(e) => set('pitch', e.target.value)} /> <span className="muted">e.g. -2Hz deeper, +3Hz higher</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={v.captions} onChange={(e) => set('captions', e.target.checked)} /> Show captions
      </label>
      <label>
        Caption style
        <select value={v.caption_style} onChange={(e) => set('caption_style', e.target.value)}>
          <option value="words">Word by word (highlights each word as it's spoken)</option>
          <option value="line">Whole line</option>
        </select>
      </label>
      <label>
        Look when there are no images
        <select value={v.theme} onChange={(e) => set('theme', e.target.value)}>
          <option value="light">Black captions on white</option>
          <option value="dark">Dark kinetic text (words punch in, key words coloured)</option>
        </select>
      </label>
      <MusicPick value={v.music} vol={Number(v.music_vol)} onChange={(m) => set('music', m)} onVol={(n) => set('music_vol', n)} />
      <label className="check">
        <input type="checkbox" checked={v.hook} onChange={(e) => set('hook', e.target.checked)} /> Hook intro
        <span className="muted">opens with the most dramatic line (or the one with a [hook] tag), then rewinds to the start</span>
      </label>
      <label>
        Subscribe pop-up at (seconds) <input value={v.subscribe_at ?? ''} onChange={(e) => set('subscribe_at', e.target.value)} />{' '}
        <span className="muted">leave empty for none</span>
      </label>
      <label>
        End card title <input value={v.endText} onChange={(e) => set('endText', e.target.value)} /> <span className="muted">empty = no end card</span>
      </label>
      <label>
        End card subtitle <input value={v.endSub} onChange={(e) => set('endSub', e.target.value)} />
      </label>
      <div className="row">
        <button className="primary" onClick={save}>Save settings</button>
        <button onClick={() => api('/api/open', {body: {what: 'project', id: proj.id}})}>Open project folder</button>
      </div>
    </div>
  );
};

const MusicPick: React.FC<{value: string; vol: number; onChange: (f: string) => void; onVol: (n: number) => void}> = ({value, vol, onChange, onVol}) => {
  const [list, setList] = useState<{file: string; mood: string; name: string}[]>([]);
  useEffect(() => void api('/api/music').then(setList).catch(() => setList([])), []);
  const moods = [...new Set(list.map((m) => m.mood))];
  return (
    <label>
      Background music
      <div className="row" style={{marginBottom: 0}}>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{flex: 1}}>
          <option value="">None</option>
          {moods.map((m) => (
            <optgroup key={m} label={m}>
              {list.filter((x) => x.mood === m).map((x) => <option key={x.file} value={x.file}>{x.name}</option>)}
            </optgroup>
          ))}
        </select>
        <button className="small" disabled={!value} onClick={(e) => (e.preventDefault(), playSound(value, vol))}>▶ / ■</button>
      </div>
      <span className="row" style={{marginBottom: 0}}>
        Volume <input type="range" min={5} max={40} value={vol} onChange={(e) => onVol(Number(e.target.value))} /> {vol}%
        <span className="muted">It gets quieter by itself while the narrator talks.</span>
      </span>
    </label>
  );
};

// ---------- notes ----------
const Notes: React.FC<{say: (m: string) => void}> = ({say}) => {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const t = useRef<any>();
  useEffect(() => void api('/api/notes').then((n) => setText(n.text)), []);
  const change = (s: string) => {
    setText(s);
    setSaved(false);
    clearTimeout(t.current);
    t.current = setTimeout(() => api('/api/notes', {method: 'PUT', body: {text: s}}).then(() => setSaved(true)), 700);
  };
  const copySection = (title: string) => {
    const m = (text || '').split(/^## /m).find((s) => s.startsWith(title));
    if (m) navigator.clipboard.writeText(m.split('\n').slice(1).join('\n').trim()).then(() => say('Copied'));
  };
  const sections = (text || '').match(/^## .+$/gm) || [];
  return (
    <div className="notes">
      <header>
        <h2>Notes & prompts</h2>
        <span className="muted">{saved ? 'saved' : 'saving…'}</span>
      </header>
      <div className="row wrap">
        {sections.map((s) => (
          <button key={s} className="small" onClick={() => copySection(s.slice(3))}>
            Copy: {s.slice(3)}
          </button>
        ))}
      </div>
      <textarea value={text ?? ''} onChange={(e) => change(e.target.value)} spellCheck={false} />
      <p className="muted">Start a line with "## " to make a section with its own copy button.</p>
    </div>
  );
};
