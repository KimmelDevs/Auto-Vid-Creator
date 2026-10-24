import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
const comp = process.env.COMP || 'Auto';
const inputProps = process.env.PROPS ? JSON.parse(fs.readFileSync(process.env.PROPS, 'utf8')) : {captions: true};
const secs = process.argv.slice(2).map(Number);
const browserExecutable = process.env.REMOTION_BROWSER || null;
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const composition = await selectComposition({serveUrl, browserExecutable, id: comp, inputProps});
for (const s of secs) {
  const frame = Math.round(s * 30);
  await renderStill({composition, browserExecutable, serveUrl, frame, output: `out/stills/t${String(s).replace('.', '_')}.jpg`, imageFormat: 'jpeg', jpegQuality: 70, inputProps, scale: 0.5});
  console.log('ok', s);
}
