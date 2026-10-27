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
        <div className="row">
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
  const [y, setY] = useState({...YT_DEFAULT, ...(proj.config.youtube || {})});
  const n = Number(proj.id.match(/(\d+)\D*$/)?.[1] || 1);
  const fill = (t: string) => t.replaceAll('{n}', String(n)).replaceAll('{series}', y.series || proj.id.replace(/[_\d]+$/, '').replace(/_/g, ' '));
  const set = (k: string, v: string) => setY((s: any) => ({...s, [k]: v}));
  const save = async () => {
    await api(`/api/projects/${proj.id}/config`, {method: 'PUT', body: {youtube: y}});
    say('Saved. Duplicate this project for the next part and these come along.');
    reload();
  };
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => say('Copied'));
  // thumbnail
  const [img, setImg] = useState(proj.images[0]?.n || 1);
  const [obj, setObj] = useState(0);  // 0 = whole image
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [badge, setBadge] = useState(`Part ${n}`);
  const cv = useRef<HTMLCanvasElement>(null);
  const [rows, cols] = proj.config.grid || [2, 3];
  useEffect(() => {
    const c = cv.current;
    const src = proj.images.find((i) => i.n === img)?.url;
    if (!c || !src) return;
    const g = c.getContext('2d')!;
    const im = new Image();
    im.onload = () => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 1280, 720);
      let sx = 0, sy = 0, sw = im.width, sh = im.height;
      if (obj > 0) {
        sw = im.width / cols;
        sh = im.height / rows;
        sx = ((obj - 1) % cols) * sw;
        sy = Math.floor((obj - 1) / cols) * sh;
      }
      const sc = Math.min(1280 / sw, 720 / sh);
      g.drawImage(im, sx, sy, sw, sh, (1280 - sw * sc) / 2, (720 - sh * sc) / 2, sw * sc, sh * sc);
      const text = (t: string, yy: number, size: number, fill: string) => {
        if (!t) return;
        // shrink until it fits the 1280 px width
        g.font = `900 ${size}px "Segoe UI", Arial, sans-serif`;
        while (size > 30 && g.measureText(t.toUpperCase()).width > 1180) g.font = `900 ${(size -= 4)}px "Segoe UI", Arial, sans-serif`;
        g.textAlign = 'center';
        g.lineJoin = 'round';
        g.lineWidth = size * 0.22;
        g.strokeStyle = '#111';
        g.strokeText(t.toUpperCase(), 640, yy);
        g.fillStyle = fill;
        g.fillText(t.toUpperCase(), 640, yy);
      };
      text(line1, 120, 84, '#fff');
      text(line2, 670, 84, '#ffd23f');
      if (badge.trim()) {
        // red badge top-right, as wide as its text
        g.font = '900 46px "Segoe UI", Arial, sans-serif';
        const w = g.measureText(badge.toUpperCase()).width + 48;
        g.fillStyle = '#d6402f';
        g.beginPath();
        (g as any).roundRect?.(1256 - w, 24, w, 74, 14);
        g.fill();
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.fillText(badge.toUpperCase(), 1256 - w / 2, 78);
      }
    };
    im.src = src;
  }, [img, obj, line1, line2, badge, proj.images, rows, cols]);
  const download = () => {
    const a = document.createElement('a');
    a.href = cv.current!.toDataURL('image/png');
    a.download = `thumb_${proj.id}.png`;
    a.click();
  };
  return (
    <div className="cols">
      <div className="form grow">
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
          <label>Image <select value={img} onChange={(e) => setImg(Number(e.target.value))}>{proj.images.map((i) => <option key={i.n} value={i.n}>{i.n}</option>)}</select></label>
          <label>Object <select value={obj} onChange={(e) => setObj(Number(e.target.value))}><option value={0}>whole</option>{Array.from({length: rows * cols}, (_, i) => <option key={i} value={i + 1}>{img}.{i + 1}</option>)}</select></label>
        </div>
        <input placeholder="Top text (e.g. DIED IN A FLOOD…)" value={line1} onChange={(e) => setLine1(e.target.value)} style={{width: '100%', marginBottom: 6}} />
        <input placeholder="Bottom text (e.g. WOKE UP IN PANGAEA)" value={line2} onChange={(e) => setLine2(e.target.value)} style={{width: '100%', marginBottom: 6}} />
        <input placeholder="Badge (top right), empty = no badge" value={badge} onChange={(e) => setBadge(e.target.value)} style={{width: '100%', marginBottom: 6}} />
        <canvas ref={cv} width={1280} height={720} style={{width: '100%', border: '1px solid var(--line)', borderRadius: 6}} />
        <button className="primary" onClick={download} disabled={!proj.images.length}>Download thumbnail</button>
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
