import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Player} from '@remotion/player';
import {Auto, Job} from '../../src/Auto';

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
type Project = {id: string; script: string; objects: Obj[]; images: {n: number; url: string}[]; config: any; hasPreview: boolean; video: string | null};

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
const fxLabel = (v: string) => {
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
    api(`/api/projects/${current}`).then(setProj).catch((e) => {
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
  useEffect(() => setText(proj.script), [proj.script]);
  const save = async (t = text) => {
    await api(`/api/projects/${proj.id}/script`, {method: 'PUT', body: {text: t}});
    say('Script saved');
    reload();
  };
  const upload = (f?: File) => f && f.text().then((t) => (setText(t), save(t)));
  const cues = (text.match(/-->/g) || []).length;
  const objs = (text.match(/\[\d+[.-]\d+\]/g) || []).length;
  return (
    <div className="cols">
      <div className="grow">
        <div className="row">
          <label className="btn">
            Upload .srt file
            <input type="file" accept=".srt,.txt" hidden onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          <button className="primary" onClick={() => save()} disabled={text === proj.script}>Save script</button>
          <span className="muted">{cues} subtitle lines · {objs} picture tags</span>
        </div>
        <textarea className="script" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder="Paste or upload your SRT here" />
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
      </div>
    </div>
  );
};

// ---------- 2. images & effects ----------
const Images: React.FC<{proj: Project; reload: () => void; say: (m: string) => void; goScript: () => void}> = ({proj, reload, say, goScript}) => {
  const [fx, setFx] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);
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
                  {o && <FxPicker list={fx[key] || []} onChange={(l) => setObjFx(key, l)} />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

const FxPicker: React.FC<{list: string[]; onChange: (l: string[]) => void}> = ({list, onChange}) => (
  <div className="fx">
    {list.map((v, i) => (
      <span className="chip" key={i}>
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
  </div>
);

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
      await api(`/api/projects/${proj.id}/build`, {body: {}});
      poll();
    } catch (e: any) {
      say(e.message);
    }
  };
  const busy = st.state === 'running';
  const frames = job ? Math.ceil((job.end + (job.endCard ? 5 : 0)) * 30) : 1;
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
      {busy && <pre className="log">{st.log.split('\n').slice(-6).join('\n')}</pre>}
      {st.state === 'error' && <pre className="log err">{st.log}</pre>}
      {job ? (
        <div className="player">
          <Player key={stamp} component={Auto} inputProps={{job: {...job, mode: mode as Job['mode']}}} durationInFrames={frames} fps={30} compositionWidth={1920} compositionHeight={1080} controls style={{width: '100%'}}
            initialFrame={Math.min(frames - 1, Number(new URLSearchParams(location.search).get('t') || 0) * 30)} />
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
  useEffect(() => {
    if (prev.current === 'running' && st.state === 'done' && st.kind === 'render') {
      reload();
      say('Video finished!');
    }
    prev.current = st.state;
  }, [st, reload, say]);
  const go = async () => {
    try {
      await api(`/api/projects/${proj.id}/render`, {body: {}});
      poll();
    } catch (e: any) {
      say(e.message);
    }
  };
  const busy = st.state === 'running' && st.kind === 'render';
  return (
    <div>
      <div className="row">
        <button className="primary" onClick={go} disabled={st.state === 'running'}>
          {busy ? 'Making video…' : 'Make the final video'}
        </button>
        <button onClick={() => api('/api/open', {body: {what: 'videos'}})}>Open videos folder</button>
        <span className="muted">A 5 minute video takes about 20–25 minutes. You can keep using the app meanwhile.</span>
      </div>
      {busy && (
        <>
          <div className="bar">
            <div style={{width: `${st.progress}%`}} />
          </div>
          <div className="muted">{st.progress}%</div>
        </>
      )}
      {st.state === 'error' && st.kind === 'render' && <pre className="log err">{st.log}</pre>}
      {proj.video && (
        <div className="player">
          <h3>Finished video</h3>
          <video src={proj.video} controls style={{width: '100%'}} />
        </div>
      )}
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
