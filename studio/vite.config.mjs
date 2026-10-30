import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  // story files and jobs are served by server.mjs, not from a public folder
  publicDir: false,
  // the shipped app: one minified bundle in studio/dist, no readable source, no source maps
  build: {outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 4000},
});
