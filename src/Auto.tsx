// Generic doodle-storyboard video driven entirely by a job JSON (built by autovid/autovid.py).
// Each image is a grid of objects; the camera visits them in order with an ink reveal,
// narration plays underneath, and effects come from [tags] written in the SRT.
import React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, interpolate, Easing, CalculateMetadataFunction} from 'remotion';
import {SubscribeOverlay, EndCard} from './Subscribe';

const FPS = 30;
const EIO = Easing.bezier(0.45, 0, 0.55, 1);
const EOUT = Easing.out(Easing.cubic);
const tw = (t: number, t0: number, t1: number, a = 0, b = 1, e = EIO) =>
  interpolate(t, [t0, t1], [a, b], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: e});
const rnd = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export type Fx = {t: number; type: string; arg?: string; dur?: number};
// one spoken sentence; wt = start of each word, in seconds after `at`
export type Line = {text: string; at: number; dur: number; wt?: number[]};
export type Panel = {src: string; starts: number[]; boxes: number[][]};
export type Job = {
  dir: string;
  audio: string;
  end: number;
  panels: Panel[];
  fx: Fx[];
  voice: Line[];
  captions: boolean;
  // 'words' (default): show a few words at a time and highlight the one being spoken
  captionStyle?: 'words' | 'line';
  // replay a dramatic line first (its audio is already at the start of voice.wav), then the story
  hook?: {at: number; dur: number; panel: number; obj: number; voice: Line} | null;
  sounds?: {t: number; file: string; kind: string}[];
  endCard?: {text: string; sub?: string} | null;
  subscribeAt?: number | null;
  // 'storyboard' (default): camera travels across the whole page; 'focus': each object alone, centred
  mode?: 'storyboard' | 'focus';
  // look of a project without images: 'light' (black words on white) or 'dark' (kinetic type on black)
  theme?: 'light' | 'dark';
  // words to colour red in the dark look (numbers and colour names are coloured automatically)
  emphasis?: string[];
  // full-screen photos switching at their times, with slow zoom/pan (Ken Burns); used when there are no grid images
  bg?: {t: number; src: string}[];
};

const AMP: Record<string, number> = {small: 8, normal: 18, big: 34};
const FLASH: Record<string, string> = {white: '#ffffff', red: '#ff3b3b', orange: '#ffb347', yellow: '#ffd59a', blue: '#9fd3ff'};

const active = (fx: Fx[], type: string, t: number, dur: number) => fx.filter((f) => f.type === type && t >= f.t && t < f.t + (f.dur ?? dur));

const shakeAt = (t: number, fx: Fx[]) => {
  let x = 0;
  let y = 0;
  for (const f of fx) {
    if ((f.type !== 'shake' && f.type !== 'boom' && f.type !== 'knock') || t < f.t) continue;
    const amp = f.type === 'boom' ? AMP.big * 1.3 : f.type === 'knock' ? AMP.normal : AMP[f.arg || 'normal'] ?? AMP.normal;
    const d = t - f.t;
    if (d > 2) continue;
    const e = amp * Math.exp(-d * 7);
    x += e * Math.sin(d * 53);
    y += e * 0.8 * Math.sin(d * 71);
  }
  return [x, y];
};

const frame = (b: number[]) => {
  const [x, y, w, h] = b;
  const z = Math.max(1.15, Math.min(2.5, 1920 / (w * 1.4), 1080 / (h * 1.4)));
  return {z, cx: x + w / 2, cy: y + h / 2};
};
const clampCam = (z: number, cx: number, cy: number) => ({
  z,
  cx: Math.min(Math.max(cx, 960 / z), 1920 - 960 / z),
  cy: Math.min(Math.max(cy, 540 / z), 1080 - 540 / z),
});

const PanelView: React.FC<{p: Panel; t: number; end: number; job: Job; id: string}> = ({p, t, end, job, id}) => {
  const bx = p.boxes;
  const idx = Math.max(0, p.starts.filter((s) => t >= s).length - 1);
  const cur = frame(bx[idx]);
  const prev = idx > 0 ? frame(bx[idx - 1]) : {z: 1, cx: 960, cy: 540};
  const s0 = p.starts[idx];
  const k = tw(t, s0, s0 + 0.9);
  const slotEnd = idx < p.starts.length - 1 ? p.starts[idx + 1] : end;
  const push = 1 + 0.06 * tw(t, s0, slotEnd, 0, 1, (x) => x);
  let z = (prev.z + (cur.z - prev.z) * k) * push;
  let cx = prev.cx + (cur.cx - prev.cx) * k;
  let cy = prev.cy + (cur.cy - prev.cy) * k;
  // pull back to the whole page: automatically before the next image, or on a [whole] tag
  const wholeTag = job.fx.find((f) => f.type === 'whole' && f.t >= s0 && f.t < slotEnd && t >= f.t);
  let back = 0;
  if (wholeTag) back = tw(t, wholeTag.t, wholeTag.t + 1.2);
  else if (idx === p.starts.length - 1 && end - s0 > 3.5) back = tw(t, end - 1.6, end - 0.2);
  z = z + (1 - z) * back;
  cx = cx + (960 - cx) * back;
  cy = cy + (540 - cy) * back;
  // [zoom] punch-in and [heartbeat] pulse
  for (const f of active(job.fx, 'zoom', t, 0.9)) z *= 1 + 0.18 * Math.sin(Math.PI * Math.min(1, (t - f.t) / 0.9));
  for (const f of active(job.fx, 'boom', t, 0.6)) z *= 1 + 0.12 * (1 - (t - f.t) / 0.6);
  for (const f of active(job.fx, 'heartbeat', t, 3)) z *= 1 + 0.03 * Math.max(0, Math.sin((t - f.t) * 2 * Math.PI * 1.2)) ** 6;
  const c = clampCam(z, cx, cy);
  const [sx, sy] = shakeAt(t, job.fx);
  const step = Math.floor(t * 8);
  const jr = (rnd(step) - 0.5) * 0.35;
  const jx = (rnd(step + 99) - 0.5) * 2.5;
  const maskId = `m-${id}`;
  return (
    <svg viewBox="0 0 1920 1080" width={1920} height={1080} style={{position: 'absolute'}}>
      <defs>
        <mask id={maskId}>
          {bx.map((b, i) => {
            const st = p.starts[i];
            if (st === undefined || t < st) return null;
            const r = tw(t, st, st + 1.1, 0, 1, EOUT);
            const [x, y, w, h] = b;
            return <circle key={i} cx={x + w / 2} cy={y + h / 2} r={(Math.hypot(w, h) / 2 + 24) * r} fill="#fff" />;
          })}
        </mask>
      </defs>
      <rect width={1920} height={1080} fill="#fff" />
      <g transform={`translate(${960 + sx + jx} ${540 + sy}) rotate(${jr}) scale(${c.z}) translate(${-c.cx} ${-c.cy})`}>
        <image href={staticFile(`${job.dir}/${p.src}`)} x={0} y={0} width={1920} height={1080} mask={`url(#${maskId})`} preserveAspectRatio="none" />
      </g>
    </svg>
  );
};

// "focus" mode: every object is cut out of its storyboard and shown alone, centred on white.
// The previous object slides away while the next one is inked in.
type Shot = {src: string; box: number[]; start: number; pi: number};
const shotsOf = (job: Job): Shot[] =>
  job.panels.flatMap((p, pi) => p.boxes.map((box, i) => ({src: p.src, box, start: p.starts[i] ?? Infinity, pi}))).filter((s) => s.start !== Infinity);

const ShotView: React.FC<{s: Shot; t: number; job: Job; id: string; whole: number; zoom: number}> = ({s, t, job, id, whole, zoom}) => {
  // a whole-page pull-back blends the crop rectangle out to the full image
  const [bx, by, bw, bh] = s.box.map((v, i) => v + ([0, 0, 1920, 1080][i] - v) * whole);
  const fit = Math.min(1600 / bw, (job.captions ? 800 : 940) / bh) * zoom;
  const w = bw * fit;
  const h = bh * fit;
  const top = job.captions ? 470 : 540;
  const r = tw(t, s.start, s.start + 1.1, 0, 1, EOUT);
  const step = Math.floor(t * 8);
  const jr = (rnd(step) - 0.5) * 0.35;
  return (
    <svg viewBox="0 0 1920 1080" width={1920} height={1080} style={{position: 'absolute'}}>
      <defs>
        <mask id={id}>
          <circle cx={bx + bw / 2} cy={by + bh / 2} r={(Math.hypot(bw, bh) / 2 + 30) * r} fill="#fff" />
        </mask>
      </defs>
      <g transform={`rotate(${jr} 960 ${top})`}>
        <svg x={960 - w / 2} y={top - h / 2} width={w} height={h} viewBox={`${bx} ${by} ${bw} ${bh}`} preserveAspectRatio="xMidYMid meet">
          <image href={staticFile(`${job.dir}/${s.src}`)} x={0} y={0} width={1920} height={1080} mask={`url(#${id})`} preserveAspectRatio="none" />
        </svg>
      </g>
    </svg>
  );
};

const FocusView: React.FC<{t: number; job: Job}> = ({t, job}) => {
  const shots = shotsOf(job);
  const i = shots.reduce((acc, s, k) => (t >= s.start ? k : acc), 0);
  const cur = shots[i];
  const next = shots[i + 1]?.start ?? job.end;
  const prev = i > 0 ? shots[i - 1] : null;
  const out = prev ? tw(t, cur.start, cur.start + 0.55) : 1;
  const wholeTag = job.fx.find((f) => f.type === 'whole' && f.t >= cur.start && f.t < next && t >= f.t);
  const whole = wholeTag ? tw(t, wholeTag.t, wholeTag.t + 1.2) : 0;
  let zoom = 1 + 0.05 * tw(t, cur.start, next, 0, 1, (x) => x);
  for (const f of active(job.fx, 'zoom', t, 0.9)) zoom *= 1 + 0.18 * Math.sin(Math.PI * Math.min(1, (t - f.t) / 0.9));
  for (const f of active(job.fx, 'boom', t, 0.6)) zoom *= 1 + 0.12 * (1 - (t - f.t) / 0.6);
  for (const f of active(job.fx, 'heartbeat', t, 3)) zoom *= 1 + 0.03 * Math.max(0, Math.sin((t - f.t) * 2 * Math.PI * 1.2)) ** 6;
  const [sx, sy] = shakeAt(t, job.fx);
  const jx = (rnd(Math.floor(t * 8) + 99) - 0.5) * 2.5;
  // keep the current and next image decoded, so a new image never starts before it has loaded
  const preload = [...new Set([cur.src, shots[i + 1]?.src].filter(Boolean))] as string[];
  return (
    <AbsoluteFill style={{background: '#fff', transform: `translate(${sx + jx}px, ${sy}px)`}}>
      {preload.map((src) => (
        <Img key={src} src={staticFile(`${job.dir}/${src}`)} style={{position: 'absolute', width: 1, height: 1, opacity: 0}} />
      ))}
      {prev && out < 1 ? (
        <AbsoluteFill style={{transform: `translateX(${-out * 520}px) scale(${1 - 0.08 * out})`, opacity: 1 - out}}>
          <ShotView key={`p${i - 1}`} s={{...prev, start: -10}} t={t} job={job} id={`f${i - 1}`} whole={0} zoom={1.05} />
        </AbsoluteFill>
      ) : null}
      {/* keyed per object: reusing the element when the image file changes briefly showed the old image in the new crop */}
      <ShotView key={`c${i}`} s={cur} t={t} job={job} id={`f${i}`} whole={whole} zoom={zoom} />
    </AbsoluteFill>
  );
};

// the words on screen right now: the whole line, or (words style) the chunk of up to 7 words being spoken
export const captionAt = (t: number, voice: Line[], style: Job['captionStyle']) => {
  const c = voice.find((q) => t >= q.at - 0.05 && t < q.at + q.dur + 0.25);
  if (!c) return null;
  const words = c.text.split(' ');
  if (style === 'line' || !c.wt || c.wt.length !== words.length) return {words, active: -1};
  const cur = Math.max(0, c.wt.reduce((acc, w, i) => (t >= c.at + w - 0.03 ? i : acc), 0));
  const per = words.length <= 9 ? words.length : Math.ceil(words.length / Math.ceil(words.length / 7));
  const from = Math.floor(cur / per) * per;
  return {words: words.slice(from, from + per), active: cur - from, starts: c.wt.slice(from, from + per).map((w) => c.at + w)};
};

export const CaptionWords: React.FC<{words: string[]; active: number; size: number}> = ({words, active, size}) => (
  <>
    {words.map((w, i) => (
      <span key={i} style={{
        display: 'inline-block', margin: `0 ${size * 0.12}px`, padding: `0 ${size * 0.12}px`, borderRadius: size * 0.2,
        background: i === active ? '#ffd23f' : 'transparent', color: active < 0 || i <= active ? '#111' : '#555',
        transform: i === active ? 'scale(1.06)' : undefined,
      }}>
        {w}
      </span>
    ))}
  </>
);

const Captions: React.FC<{t: number; voice: Line[]; style: Job['captionStyle']}> = ({t, voice, style}) => {
  const c = captionAt(t, voice, style);
  if (!c) return null;
  const big = style !== 'line';
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 56, display: 'flex', justifyContent: 'center'}}>
      <div style={{
        maxWidth: 1400, textAlign: 'center', fontFamily: '"Segoe UI", Arial, sans-serif', fontWeight: big ? 800 : 700, fontSize: big ? 48 : 40, lineHeight: 1.3,
        color: '#111', background: 'rgba(255,255,255,0.92)', border: '4px solid #111', borderRadius: 16, padding: '10px 26px',
      }}>
        <CaptionWords words={c.words} active={c.active} size={big ? 48 : 40} />
      </div>
    </div>
  );
};

// the hook: one object close up with its line, darkened, ending in a VHS rewind back to the start
const HookView: React.FC<{job: Job}> = ({job}) => {
  const t = useCurrentFrame() / FPS;
  const h = job.hook!;
  const p = job.panels[h.panel] ?? job.panels[0];
  const shot: Shot = {src: p.src, box: p.boxes[h.obj] ?? p.boxes[0], start: 0, pi: h.panel};
  const zoom = 1 + 0.12 * tw(t, 0, h.dur, 0, 1, (x) => x);
  const fx: Fx[] = [{t: Math.max(0, h.dur - 0.9), type: 'rewind'}, {t: 0.1, type: 'shake', arg: 'small'}];
  return (
    <AbsoluteFill style={{background: '#fff'}}>
      <ShotView s={shot} t={t + 1.2} job={job} id="hook" whole={0} zoom={zoom} />
      <AbsoluteFill style={{boxShadow: 'inset 0 0 260px rgba(0,0,0,0.55)'}} />
      <Overlays t={t} job={{...job, fx}} />
      {job.captions ? <Captions t={t} voice={[h.voice]} style={job.captionStyle} /> : null}
    </AbsoluteFill>
  );
};

const Overlays: React.FC<{t: number; job: Job}> = ({t, job}) => {
  const out: React.ReactNode[] = [];
  // flashes
  for (const f of job.fx) {
    if ((f.type === 'flash' || f.type === 'boom') && t >= f.t && t < f.t + 0.35) {
      const col = f.type === 'boom' ? FLASH.yellow : FLASH[f.arg || 'white'] ?? f.arg ?? '#fff';
      out.push(<AbsoluteFill key={`fl${f.t}`} style={{background: col, opacity: 0.85 * (1 - (t - f.t) / 0.35)}} />);
    }
  }
  // [dark] ... [light] night tint
  const darks = job.fx.filter((f) => f.type === 'dark' || f.type === 'light').sort((a, b) => a.t - b.t);
  let dark = 0;
  for (const f of darks) if (t >= f.t) dark = f.type === 'dark' ? tw(t, f.t, f.t + 1) : 1 - tw(t, f.t, f.t + 1);
  if (dark > 0) out.push(<AbsoluteFill key="dark" style={{background: '#0a1028', opacity: 0.38 * dark, mixBlendMode: 'multiply'}} />);
  // [red] alert pulse
  for (const f of active(job.fx, 'red', t, f2(job, 'red'))) {
    const pulse = 0.5 + 0.5 * Math.sin((t - f.t) * 8);
    out.push(<AbsoluteFill key={`red${f.t}`} style={{boxShadow: `inset 0 0 ${180 + 80 * pulse}px rgba(230,30,30,${0.55 * pulse})`}} />);
  }
  // [glitch] colour split
  for (const f of active(job.fx, 'glitch', t, 0.6)) {
    const j = (rnd(Math.floor(t * 30)) - 0.5) * 30;
    out.push(<AbsoluteFill key={`gl${f.t}`} style={{background: `linear-gradient(90deg, rgba(255,0,60,0.18), rgba(0,200,255,0.18))`, transform: `translateX(${j}px)`, mixBlendMode: 'multiply'}} />);
  }
  // [rewind] VHS lines
  for (const f of active(job.fx, 'rewind', t, 1.4)) {
    out.push(
      <AbsoluteFill key={`rw${f.t}`}>
        {Array.from({length: 8}).map((_, i) => (
          <div key={i} style={{position: 'absolute', left: 0, right: 0, top: ((rnd(i) * 1080 + t * 900 * (1 + i * 0.2)) % 1200) - 60, height: 8 + rnd(i * 3) * 30, background: 'rgba(0,0,0,0.12)'}} />
        ))}
        <div style={{position: 'absolute', left: 70, top: 50, fontFamily: 'Arial', fontWeight: 900, fontSize: 80, color: '#111'}}>◀◀</div>
      </AbsoluteFill>,
    );
  }
  // [fade] dip to black
  for (const f of active(job.fx, 'fade', t, 1.2)) {
    const d = (t - f.t) / 1.2;
    out.push(<AbsoluteFill key={`fd${f.t}`} style={{background: '#000', opacity: Math.sin(Math.PI * d)}} />);
  }
  // [label:...] sticker
  for (const f of active(job.fx, 'label', t, 5)) {
    out.push(
      <div key={`lb${f.t}`} style={{
        position: 'absolute', left: 60, top: 46, fontFamily: '"Segoe Print", "Comic Sans MS", cursive', fontWeight: 700, fontSize: 54, color: '#111',
        background: '#fff', padding: '4px 22px', border: '5px solid #111', borderRadius: 14,
        transform: `rotate(-3deg) scale(${tw(t, f.t, f.t + 0.35, 0.6, 1, EOUT)})`,
        opacity: Math.min(tw(t, f.t, f.t + 0.25), 1 - tw(t, f.t + (f.dur ?? 5) - 0.4, f.t + (f.dur ?? 5))),
      }}>
        {f.arg}
      </div>,
    );
  }
  return <>{out}</>;
};
const f2 = (job: Job, type: string) => (type === 'red' ? 3 : 1);

// the story itself (no audio): its frame 0 is the start of the narration
const Main: React.FC<{job: Job}> = ({job}) => {
  const t = useCurrentFrame() / FPS;
  const P = job.panels;
  if (!P.length) return job.bg?.length ? <BrollView t={t} job={job} /> : <ListenView t={t} job={job} />;
  let pi = P.findIndex((p, i) => t >= p.starts[0] && (i === P.length - 1 || t < P[i + 1].starts[0]));
  if (pi < 0) pi = 0;
  const p = P[pi];
  const end = pi < P.length - 1 ? P[pi + 1].starts[0] : job.end;
  const prevP = pi > 0 ? P[pi - 1] : null;
  const slide = prevP ? tw(t, p.starts[0], p.starts[0] + 0.7) : 1;
  const subs = job.fx.filter((f) => f.type === 'subscribe').map((f) => f.t);
  if (job.subscribeAt != null) subs.push(job.subscribeAt);
  return (
    <AbsoluteFill style={{background: '#fff'}}>
      <div style={{position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0}}>
        {[prevP, p].filter(Boolean).map((q) => <Img key={q!.src} src={staticFile(`${job.dir}/${q!.src}`)} />)}
      </div>
      {job.mode === 'focus' ? (
        <FocusView t={t} job={job} />
      ) : (
        <>
          {prevP && slide < 1 ? (
            <div style={{position: 'absolute', inset: 0, transform: `translateX(${-slide * 1920 * 0.35}px)`, opacity: 1 - slide}}>
              <PanelView p={prevP} t={t} end={p.starts[0]} job={job} id={`a${pi - 1}`} />
            </div>
          ) : null}
          <div style={{position: 'absolute', inset: 0, transform: `translateX(${(1 - slide) * 1920}px)`, boxShadow: slide < 1 ? '-30px 0 60px rgba(0,0,0,0.25)' : undefined, background: '#fff'}}>
            <PanelView p={p} t={t} end={end} job={job} id={`a${pi}`} />
          </div>
        </>
      )}
      <Overlays t={t} job={job} />
      {job.captions ? <Captions t={t} voice={job.voice} style={job.captionStyle} /> : null}
      {subs.map((s) => (
        <Sequence key={s} from={Math.round(s * FPS)} durationInFrames={4 * FPS}><SubscribeOverlay /></Sequence>
      ))}
      {job.endCard ? (
        <Sequence from={Math.round(job.end * FPS)}>
          <EndCard text={job.endCard.text} sub={job.endCard.sub} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

// no images yet: big centred word captions on white, so a script can be listened to (and read along)
const WORD_COLORS: Record<string, string> = {red: '#ff3b3b', green: '#3ddc84', pink: '#ff6ec7', blue: '#4da3ff', yellow: '#ffd23f', orange: '#ff9f43'};

// dark kinetic type: each word punches in as it's spoken; key words are coloured
// one photo with Ken Burns motion: zooms in or out and drifts, direction varies per shot
const KenBurns: React.FC<{src: string; t0: number; t1: number; t: number; i: number}> = ({src, t0, t1, t, i}) => {
  const k = tw(t, t0, t1 + 0.8, 0, 1, (x) => x);
  const zoomIn = i % 3 !== 1;
  const z = zoomIn ? 1.06 + 0.16 * k : 1.22 - 0.16 * k;
  const dir = [[-1, -0.5], [1, 0.4], [0.6, -1], [-0.8, 0.8]][i % 4];
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <Img src={src} style={{width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${z}) translate(${dir[0] * 40 * (k - 0.5)}px, ${dir[1] * 30 * (k - 0.5)}px)`, filter: 'saturate(0.85) contrast(1.08)'}} />
    </AbsoluteFill>
  );
};

const BrollView: React.FC<{t: number; job: Job}> = ({t, job}) => {
  const bg = job.bg!;
  const i = Math.max(0, bg.reduce((acc, b, k) => (t >= b.t ? k : acc), 0));
  const cur = bg[i];
  const next = bg[i + 1]?.t ?? job.end;
  const prev = i > 0 ? bg[i - 1] : null;
  const fade = prev ? tw(t, cur.t, cur.t + 0.6) : 1;
  const url = (s: string) => staticFile(`${job.dir}/${s}`);
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {/* keep the next photo loaded */}
      <div style={{position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0}}>{bg[i + 1] ? <Img src={url(bg[i + 1].src)} /> : null}</div>
      {prev && fade < 1 ? <KenBurns src={url(prev.src)} t0={prev.t} t1={cur.t} t={t} i={i - 1} /> : null}
      <AbsoluteFill style={{opacity: fade}}>
        <KenBurns src={url(cur.src)} t0={cur.t} t1={next} t={t} i={i} />
      </AbsoluteFill>
      {/* darken for readable text */}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.75) 100%)'}} />
      <KineticView t={t} job={job} overlay />
    </AbsoluteFill>
  );
};

const KineticView: React.FC<{t: number; job: Job; overlay?: boolean}> = ({t, job, overlay}) => {
  const c = captionAt(t, job.voice, 'words');
  const [sx, sy] = shakeAt(t, job.fx);
  const emph = new Set((job.emphasis || []).map((w) => w.toLowerCase()));
  let push = 1 + 0.03 * Math.sin(t * 0.25);
  for (const f of active(job.fx, 'zoom', t, 0.9)) push *= 1 + 0.12 * Math.sin(Math.PI * Math.min(1, (t - f.t) / 0.9));
  for (const f of active(job.fx, 'boom', t, 0.6)) push *= 1 + 0.1 * (1 - (t - f.t) / 0.6);
  for (const f of active(job.fx, 'heartbeat', t, 3)) push *= 1 + 0.04 * Math.max(0, Math.sin((t - f.t) * 2 * Math.PI * 1.2)) ** 6;
  const colorOf = (w: string) => {
    const k = w.toLowerCase().replace(/[^a-z0-9%-]/g, '');
    if (WORD_COLORS[k]) return WORD_COLORS[k];
    if (/\d/.test(k)) return '#ffd23f';
    if (emph.has(k)) return '#ff3b3b';
    return '#f4f4f4';
  };
  return (
    <AbsoluteFill style={{background: overlay ? 'transparent' : 'radial-gradient(ellipse at 50% 45%, #1d1e26 0%, #0b0b0e 70%)'}}>
      {/* fine texture; kept still, because grain that changes every frame makes files huge */}
      {overlay ? null : <AbsoluteFill style={{opacity: 0.05, backgroundImage: 'repeating-linear-gradient(37deg, #fff 0 1px, transparent 1px 3px)'}} />}
      <AbsoluteFill style={{alignItems: 'center', justifyContent: overlay ? 'flex-end' : 'center', padding: overlay ? '0 140px 120px' : '0 150px', transform: `translate(${sx}px, ${sy}px) scale(${push})`}}>
        {c ? (
          <div style={{textAlign: 'center', fontFamily: '"Segoe UI Black", "Segoe UI", Arial, sans-serif', fontWeight: 900, fontSize: overlay ? 80 : 104, lineHeight: 1.18, letterSpacing: -1,
            textShadow: overlay ? '0 4px 18px rgba(0,0,0,0.9)' : undefined}}>
            {c.words.map((w, i) => {
              const st = c.starts?.[i] ?? 0;
              const k = tw(t, st - 0.04, st + 0.16, 0, 1, EOUT);
              const col = colorOf(w);
              return (
                <span key={i} style={{
                  display: 'inline-block', margin: '0 14px', color: col, opacity: k,
                  transform: `translateY(${(1 - k) * 40}px) scale(${0.7 + 0.3 * k + (i === c.active ? 0.06 : 0)})`,
                  textShadow: overlay ? '0 4px 16px rgba(0,0,0,0.95), 0 0 2px #000'
                    : i === c.active && col === '#f4f4f4' ? '0 0 30px rgba(255,255,255,0.35)' : col !== '#f4f4f4' ? `0 0 28px ${col}66` : 'none',
                }}>
                  {w}
                </span>
              );
            })}
          </div>
        ) : null}
      </AbsoluteFill>
      <AbsoluteFill style={{boxShadow: overlay ? 'inset 0 0 220px rgba(0,0,0,0.6)' : 'inset 0 0 300px rgba(0,0,0,0.8)'}} />
      <Overlays t={t} job={job} />
      {job.endCard ? (
        <Sequence from={Math.round(job.end * FPS)}>
          <EndCard text={job.endCard.text} sub={job.endCard.sub} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

const ListenView: React.FC<{t: number; job: Job}> = ({t, job}) => {
  if (job.theme === 'dark') return <KineticView t={t} job={job} />;
  const c = captionAt(t, job.voice, job.captionStyle);
  const [sx, sy] = shakeAt(t, job.fx);
  return (
    <AbsoluteFill style={{background: '#fff'}}>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: '0 160px', transform: `translate(${sx}px, ${sy}px)`}}>
        {c ? (
          <div style={{textAlign: 'center', fontFamily: '"Segoe UI", Arial, sans-serif', fontWeight: 900, fontSize: 84, lineHeight: 1.3}}>
            <CaptionWords words={c.words} active={c.active} size={84} />
          </div>
        ) : null}
      </AbsoluteFill>
      <Overlays t={t} job={job} />
      {job.endCard ? (
        <Sequence from={Math.round(job.end * FPS)}>
          <EndCard text={job.endCard.text} sub={job.endCard.sub} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

const hookFrames = (job: Job) => (job.hook ? Math.round(job.hook.dur * FPS) : 0);

export const Auto: React.FC<{job: Job}> = ({job}) => {
  const hf = hookFrames(job);
  return (
    <AbsoluteFill style={{background: '#fff'}}>
      {hf ? (
        <Sequence durationInFrames={hf}>
          <HookView job={job} />
        </Sequence>
      ) : null}
      <Sequence from={hf}>
        <Main job={job} />
      </Sequence>
      {job.audio ? <Audio src={staticFile(`${job.dir}/${job.audio}`)} /> : null}
    </AbsoluteFill>
  );
};

export const totalFrames = (job: Job) => hookFrames(job) + Math.ceil((job.end + (job.endCard ? 5 : 0)) * FPS);

export const autoMetadata: CalculateMetadataFunction<{job: Job}> = ({props}) => ({durationInFrames: totalFrames(props.job)});

// ---- vertical 9:16 Short: title on top, the video in the middle, big word captions below
export type ShortInfo = {start: number; dur: number; title: string};

export const AutoShort: React.FC<{job: Job; short: ShortInfo}> = ({job, short}) => {
  const f = useCurrentFrame();
  const t = short.start + f / FPS;
  // story time (captions are timed without the hook)
  const st = t - (job.hook?.dur ?? 0);
  const c = captionAt(st, job.voice, 'words');
  const inner = {...job, captions: false, endCard: null, subscribeAt: null};
  const scale = 1080 / 1920;
  const fadeOut = 1 - tw(f / FPS, short.dur - 0.6, short.dur);
  return (
    <AbsoluteFill style={{background: '#fff', opacity: fadeOut}}>
      <div style={{position: 'absolute', top: 150, left: 60, right: 60, textAlign: 'center', fontFamily: '"Segoe UI", Arial, sans-serif', fontWeight: 900, fontSize: 74, lineHeight: 1.12, color: '#111'}}>
        {short.title}
      </div>
      <div style={{position: 'absolute', top: 560, left: 0, width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: 'top left', overflow: 'hidden', borderTop: '6px solid #111', borderBottom: '6px solid #111'}}>
        <Sequence from={-Math.round(short.start * FPS)}>
          <Auto job={inner} />
        </Sequence>
      </div>
      {c ? (
        <div style={{position: 'absolute', top: 1260, left: 50, right: 50, textAlign: 'center', fontFamily: '"Segoe UI", Arial, sans-serif', fontWeight: 900, fontSize: 76, lineHeight: 1.25}}>
          <CaptionWords words={c.words} active={c.active} size={76} />
        </div>
      ) : null}
      <div style={{position: 'absolute', bottom: 170, left: 0, right: 0, textAlign: 'center', fontFamily: '"Segoe UI", Arial, sans-serif', fontWeight: 700, fontSize: 44, color: '#d6402f'}}>
        Full story on my channel
      </div>
    </AbsoluteFill>
  );
};

export const shortMetadata: CalculateMetadataFunction<{job: Job; short: ShortInfo}> = ({props}) => ({
  durationInFrames: Math.max(1, Math.round(props.short.dur * FPS)),
});
