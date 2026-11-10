import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Studio builds against the engine's source, so changes show up without a package build.
  resolve: {
    alias: { skytone: fileURLToPath(new URL('../../packages/skytone/src/index.ts', import.meta.url)) },
  },
  server: { port: 5173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('mediabunny') ? 'video' : undefined),
      },
    },
  },
});
