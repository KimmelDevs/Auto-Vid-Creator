import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [react()],
  // story files and jobs are served by server.mjs, not from a public folder
  publicDir: false,
});
