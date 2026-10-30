import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // ES workers can code-split, so the export worker loads the WASM AAC encoder only when it needs it.
  worker: { format: 'es' },
});
