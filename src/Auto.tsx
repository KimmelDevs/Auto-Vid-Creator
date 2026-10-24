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
export type Panel = {src: string; starts: number[]; boxes: number[][]};
export type Job = {
  dir: string;
  audio: string;
  end: number;
  panels: Panel[];
  fx: Fx[];
  voice: {text: string; at: number; dur: number}[];
  captions: boolean;
  endCard?: {text: string; sub?: string} | null;
  subscribeAt?: number | null;
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

const Captions: React.FC<{t: number; voice: Job['voice']}> = ({t, voice}) => {
  const c = voice.find((q) => t >= q.at - 0.05 && t < q.at + q.dur + 0.25);
  if (!c) return null;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 56, display: 'flex', justifyContent: 'center'}}>
      <div style={{
        maxWidth: 1400, textAlign: 'center', fontFamily: '"Segoe UI", Arial, sans-serif', fontWeight: 700, fontSize: 40, lineHeight: 1.3,
        color: '#111', background: 'rgba(255,255,255,0.92)', border: '4px solid #111', borderRadius: 16, padding: '10px 26px',
      }}>
        {c.text}
      </div>
    </div>
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

export const Auto: React.FC<{job: Job}> = ({job}) => {
  const t = useCurrentFrame() / FPS;
  const P = job.panels;
  if (!P.length) return <AbsoluteFill style={{background: '#fff'}} />;
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
      {prevP && slide < 1 ? (
        <div style={{position: 'absolute', inset: 0, transform: `translateX(${-slide * 1920 * 0.35}px)`, opacity: 1 - slide}}>
          <PanelView p={prevP} t={t} end={p.starts[0]} job={job} id={`a${pi - 1}`} />
        </div>
      ) : null}
      <div style={{position: 'absolute', inset: 0, transform: `translateX(${(1 - slide) * 1920}px)`, boxShadow: slide < 1 ? '-30px 0 60px rgba(0,0,0,0.25)' : undefined, background: '#fff'}}>
        <PanelView p={p} t={t} end={end} job={job} id={`a${pi}`} />
      </div>
      <Overlays t={t} job={job} />
      {job.captions ? <Captions t={t} voice={job.voice} /> : null}
      {subs.map((s) => (
        <Sequence key={s} from={Math.round(s * FPS)} durationInFrames={4 * FPS}><SubscribeOverlay /></Sequence>
      ))}
      {job.endCard ? (
        <Sequence from={Math.round(job.end * FPS)}>
          <EndCard text={job.endCard.text} sub={job.endCard.sub} />
        </Sequence>
      ) : null}
      {job.audio ? <Audio src={staticFile(`${job.dir}/${job.audio}`)} /> : null}
    </AbsoluteFill>
  );
};

export const autoMetadata: CalculateMetadataFunction<{job: Job}> = ({props}) => ({
  durationInFrames: Math.ceil((props.job.end + (props.job.endCard ? 5 : 0)) * FPS),
});
