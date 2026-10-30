import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // ffmpeg.wasm spawns its worker via `new URL('./worker.js', import.meta.url)`, which pre-bundling breaks.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] },
  // ES workers can code-split, so the export worker loads the WASM AAC encoder only when it needs it.
  worker: { format: 'es' },
});
