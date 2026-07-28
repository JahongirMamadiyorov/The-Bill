import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // tailwindcss() only affects files that actually @import "tailwindcss/..."
  // (currently just src/admin.css, loaded solely by the Admin panel — see its
  // own header comment) — it doesn't change anything for the cashier POS
  // screens, which use plain inline styles and never reference Tailwind.
  plugins: [react(), tailwindcss()],
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
