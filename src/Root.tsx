import React from 'react';
import {Composition} from 'remotion';
import {Auto, AutoShort, autoMetadata, shortMetadata, Job} from './Auto';

// Rendered by autovid/autovid.py with --props=public/jobs/<name>/props.json
const EMPTY: Job = {dir: '', audio: '', end: 1, panels: [], fx: [], voice: [], captions: false, endCard: null, subscribeAt: null};

export const Root: React.FC = () => (
  <>
    <Composition id="Auto" component={Auto} calculateMetadata={autoMetadata} durationInFrames={30} fps={30} width={1920} height={1080} defaultProps={{job: EMPTY}} />
    <Composition id="AutoShort" component={AutoShort} calculateMetadata={shortMetadata} durationInFrames={30} fps={30} width={1080} height={1920} defaultProps={{job: EMPTY, short: {start: 0, dur: 1, title: ''}}} />
  </>
);
