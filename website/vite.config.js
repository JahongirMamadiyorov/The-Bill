import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The Vite dev server proxies /api and /uploads to a backend target.
// Default target = production Render backend, so `npm run dev` on the website
// "just works" without running a local backend.
//
// To proxy to a local backend instead, create website/.env.local with:
//   VITE_DEV_PROXY=http://localhost:3000
// and restart vite.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_DEV_PROXY || 'https://the-bill-backend.onrender.com'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
        },
        // Proxy uploaded images so they display correctly through the dev server
        '/uploads': {
          target,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
