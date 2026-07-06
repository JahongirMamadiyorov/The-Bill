import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // IMPORTANT: relative base — the built app is loaded via file:// inside Electron
  // in production, not from a web server. An absolute base ('/') breaks every
  // asset path once packaged, even though it works fine in `vite dev`.
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
});
