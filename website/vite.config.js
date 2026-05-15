import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import net from 'net'

// ── Local TCP printer middleware ───────────────────────────────────────────────
// Runs inside Vite's Node.js process — on the restaurant LAN.
// The browser (cashier panel) POSTs here; we open a raw TCP socket to the
// thermal printer at port 9100 and write the ESC/POS bytes.
//
// POST /print-tcp
//   Body: { ip: "192.168.1.x", port: 9100, data: "<base64 ESC/POS>" }
//   Response: { ok: true } | { error: "..." }
//
// This never goes to Render — it's a pure local endpoint.
function localTcpPrintPlugin() {
  return {
    name: 'local-tcp-print',
    configureServer(server) {
      server.middlewares.use('/print-tcp', (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          let ip, port, data;
          try {
            ({ ip, port = 9100, data } = JSON.parse(body));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            return;
          }

          if (!ip || !data) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'ip and data are required' }));
            return;
          }

          const buf    = Buffer.from(data, 'base64');
          const socket = new net.Socket();
          const TIMEOUT = 6_000; // 6 s — ESC/POS is tiny, should be instant on LAN

          socket.setTimeout(TIMEOUT);

          socket.connect(Number(port), ip, () => {
            socket.write(buf, () => {
              socket.destroy();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            });
          });

          socket.on('error', (err) => {
            socket.destroy();
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });

          socket.on('timeout', () => {
            socket.destroy();
            res.writeHead(504, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'TCP connection timed out' }));
          });
        });
      });
    },
  };
}

// ── Vite config ───────────────────────────────────────────────────────────────
// The Vite dev server proxies /api and /uploads to a backend target.
// Default target = production Render backend, so `npm run dev` on the website
// "just works" without running a local backend.
//
// To proxy to a local backend instead, create website/.env.local with:
//   VITE_DEV_PROXY=http://localhost:3000
// and restart vite.
export default defineConfig(({ mode }) => {
  const env    = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_DEV_PROXY || 'https://the-bill-backend.onrender.com'
  // WebSocket target: same host but ws(s):// protocol
  const wsTarget = target.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')

  return {
    plugins: [react(), tailwindcss(), localTcpPrintPlugin()],
    server: {
      host: true,   // listen on 0.0.0.0 so LAN devices can connect
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
        // WebSocket proxy — browser connects to ws://localhost:5173/ws
        // Vite upgrades and forwards to wss://the-bill-backend.onrender.com/ws
        '/ws': {
          target:      wsTarget,
          ws:          true,
          changeOrigin: true,
          secure:      true,
        },
      },
    },
  }
})
