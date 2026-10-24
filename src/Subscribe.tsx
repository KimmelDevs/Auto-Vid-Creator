// Subscribe animation adapted from the 1080x1920 version for 1920x1080 frames.
// SubscribeOverlay: red SUBSCRIBE button pops in, a cursor clicks it, it turns grey "SUBSCRIBED" with a check, a bell rings.
// EndCard: white end screen with a headline + the same subscribe animation.
import React from 'react';
import {AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

const BG = '#FFFFFF';
const INK = '#1a1a1a';
const ORANGE = '#e8731a';
const CL = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const SubscribeOverlay: React.FC<{top?: number}> = ({top = 700}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const click = 70; // frame the cursor clicks
  const pop = spring({frame, fps, config: {damping: 11, stiffness: 120}});
  const pulse = frame < 44 ? 1 + 0.03 * Math.sin(frame / 3) : 1;
  const press = interpolate(frame, [click - 3, click, click + 6], [1, 0.9, 1], CL);
  const done = frame >= click + 4;
  const cx = interpolate(frame, [44, click], [260, 30], {...CL, easing: Easing.out(Easing.cubic)});
  const cy = interpolate(frame, [44, click], [190, 30], {...CL, easing: Easing.out(Easing.cubic)});
  const cursorOpacity = interpolate(frame, [44, 52, click + 14, click + 22], [0, 1, 1, 0], CL);
  const bf = frame - (click + 8);
  const bellScale = bf < 0 ? 0 : spring({frame: bf, fps, config: {damping: 9, stiffness: 140}});
  const bellRot = bf < 0 ? 0 : Math.sin(bf / 2.2) * 24 * Math.exp(-bf / 32);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: 0, width, top, height: 150, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
        <div style={{position: 'relative', width: 650, height: 130}}>
          <div
            style={{
              position: 'absolute', left: 0, top: 9, width: 520, height: 112, borderRadius: 56,
              backgroundColor: done ? '#606060' : '#E62117',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
              boxShadow: '0 6px 0 rgba(0,0,0,0.18)',
              transform: `scale(${pop * pulse * press})`,
              fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 800, fontSize: 50, color: '#fff', letterSpacing: 2,
            }}
          >
            {done && (
              <svg width="46" height="46" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            )}
            {done ? 'SUBSCRIBED' : 'SUBSCRIBE'}
          </div>
          <div style={{position: 'absolute', left: 548, top: 24, width: 80, height: 80, transform: `scale(${bellScale}) rotate(${bellRot}deg)`, transformOrigin: '50% 12%'}}>
            <svg width="80" height="80" viewBox="0 0 24 24">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" fill={INK} />
            </svg>
          </div>
          <svg width="70" height="70" viewBox="0 0 28 34" style={{position: 'absolute', left: 260 + cx, top: 65 + cy, opacity: cursorOpacity}}>
            <path d="M3 2 L3 26 L9 20 L14 31 L18 29 L13 18 L21 18 Z" fill="#fff" stroke="#111" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const EndCard: React.FC<{text: string; sub?: string}> = ({text, sub = "Subscribe so you don't miss it!"}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const pop = spring({frame, fps, config: {damping: 12, stiffness: 110}});
  const fadeIn = interpolate(frame, [0, 8], [0, 1], CL);
  const subIn = interpolate(frame, [10, 22], [0, 1], CL);
  return (
    <AbsoluteFill style={{backgroundColor: BG, opacity: fadeIn}}>
      <div style={{position: 'absolute', top: 230, width, textAlign: 'center', fontFamily: "Georgia, 'Times New Roman', serif", color: INK}}>
        <div style={{fontSize: 96, fontWeight: 800, lineHeight: 1.15, padding: '0 70px', transform: `scale(${pop})`}}>{text}</div>
        <div style={{marginTop: 40, fontSize: 56, fontWeight: 700, color: ORANGE, opacity: subIn}}>{sub}</div>
      </div>
      <Sequence from={12}>
        <SubscribeOverlay top={640} />
      </Sequence>
    </AbsoluteFill>
  );
};
