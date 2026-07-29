'use strict';

// ── Electron runtime guard ─────────────────────────────────────────────────────
// Same guard as electron-app/main.js — ELECTRON_RUN_AS_NODE breaks require('electron').
if (process.env.ELECTRON_RUN_AS_NODE) {
  process.stderr.write(
    '\n[The Bill POS] ERROR: ELECTRON_RUN_AS_NODE is set in your environment.\n' +
    'Fix: run  unset ELECTRON_RUN_AS_NODE  in your terminal, then try again.\n\n'
  );
  process.exit(1);
}

const _electron = require('electron');
if (!_electron || typeof _electron !== 'object' || !_electron.app) {
  process.stderr.write(
    '\n[The Bill POS] ERROR: require("electron") did not return the Electron API.\n' +
    `Got type: ${typeof _electron}\n\n`
  );
  process.exit(1);
}

const { app, BrowserWindow, ipcMain, Menu, protocol } = _electron;
const path   = require('path');
const fs     = require('fs');
const https  = require('https');
const http   = require('http');
const Store  = require('electron-store');

const { buildSchema }       = require('./powersync/schema');
const { Connector }         = require('./powersync/connector');
const { printKitchenTicket } = require('./printEngine');
// @powersync/node is a pure ESM package (no CommonJS support) — it can't be `require()`d from
// this file. Node allows dynamic `import()` from CommonJS code though, so it's loaded lazily
// the first time it's actually needed (see getPowerSync() below), not at the top of the file.

// ── Config ─────────────────────────────────────────────────────────────────────
const BACKEND_BASE = 'https://the-bill-backend-pego.onrender.com';
const IS_DEV        = process.env.NODE_ENV === 'development';
const DEV_SERVER_URL = 'http://localhost:5173';
const PRELOAD        = path.join(__dirname, 'preload.js');
const ICON_PATH      = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// ── Local photo cache — custom `app-photo://` scheme ───────────────────────────
// Menu-item photos live on the Render backend (`/uploads/menu/<filename>`, see
// restaurant-app/backend/src/routes/menu.js) — every screen load used to
// re-fetch them over the internet (mitigated but not eliminated by the 7-day
// Cache-Control header added server-side). This registers a custom scheme so
// the renderer can request `app-photo://<filename>` instead of the real URL;
// the handler below (registered in app.whenReady()) serves it from a local
// disk cache, downloading once on first request. Upload filenames are
// `${Date.now()}-${random}${ext}` (see menu.js) — globally unique and never
// reused, so a cached file can NEVER go stale; there is no invalidation logic
// needed, only "have we already fetched this filename or not."
// Must be called before app is ready — Electron requirement, not a style choice.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-photo', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// ── Electron Store (encrypted local storage for the session token) ────────────
const store = new Store({
  encryptionKey: 'thebill-pos-2026-secure-local-key',
});

// ── No default application menu anywhere in this app ───────────────────────────
Menu.setApplicationMenu(null);

// ── Single Instance Lock ───────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 800,
    // Kiosk-friendly: no native menu/frame chrome. Full kiosk mode (true fullscreen,
    // no taskbar/alt-tab) can be turned on per-terminal later via a settings toggle —
    // starting windowed+frameless so back-office PCs can still resize/move it.
    frame: false,
    resizable: true,
    autoHideMenuBar: true,
    icon: ICON_PATH,
    webPreferences: {
      preload:          PRELOAD,
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  if (IS_DEV) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // frame:false means there's no OS-drawn title bar to drag or minimize/
  // maximize/close from — src/TitleBar.jsx renders custom buttons for all
  // three and relies on this event to keep its maximize/restore icon in
  // sync with the real window state (e.g. after a double-click on the bar,
  // or a Windows snap gesture, not just a button click).
  mainWindow.on('maximize',   () => mainWindow?.webContents.send('window:maximized-changed', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized-changed', false));

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── PowerSync (local-first data layer) ─────────────────────────────────────────
// Lives in the main process, not the renderer — it needs native SQLite (better-sqlite3)
// and Node APIs that the sandboxed renderer deliberately doesn't have access to.
let psDb = null;

async function getPowerSync() {
  if (!psDb) {
    const { PowerSyncDatabase, column, Schema, Table } = await import('@powersync/node');
    const schema = buildSchema({ column, Schema, Table });
    psDb = new PowerSyncDatabase({
      schema,
      database: {
        dbFilename: 'the-bill-pos.db',
        dbLocation: app.getPath('userData'),
      },
    });
  }
  return psDb;
}

async function connectPowerSync() {
  const db = await getPowerSync();
  const connector = new Connector(() => store.get('session')?.token || null);
  try {
    await db.connect(connector);
  } catch (err) {
    console.error('[powersync] connect failed:', err.message);
  }
}

// ── Photo cache: fetch-once-then-serve-from-disk ───────────────────────────────
const PHOTO_CACHE_DIR = path.join(app.getPath('userData'), 'photo-cache');
const photoDownloads  = new Map(); // filename -> in-flight Promise<Buffer>, avoids duplicate downloads

function mimeForExt(ext) {
  switch (ext.toLowerCase()) {
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.png':  return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif':  return 'image/gif';
    case '.heic': return 'image/heic';
    default:      return 'application/octet-stream';
  }
}

// Plain binary GET — the existing request() helper above assumes a JSON body,
// which doesn't fit a raw image download.
function fetchBinary(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`Photo fetch failed (${res.statusCode})`)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

app.whenReady().then(async () => {
  createWindow();
  // If a session was already saved from a previous run, start syncing immediately —
  // don't make the user log in again just to resume offline-first data access.
  if (store.get('session')) {
    connectPowerSync();
  }

  // `app-photo://<encoded-filename>` — the renderer never sees the real backend
  // URL for a cached photo. Filename is taken from the URL's host component
  // (custom schemes put everything before the next `/` there); rejects
  // anything that looks like a path-traversal attempt since it's user-supplied
  // data flowing back from a URL, however unlikely that is here.
  protocol.handle('app-photo', async (request) => {
    let filename;
    try { filename = decodeURIComponent(new URL(request.url).hostname); }
    catch { return new Response('Bad photo URL', { status: 400 }); }
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return new Response('Invalid filename', { status: 400 });
    }

    const localPath = path.join(PHOTO_CACHE_DIR, filename);
    try {
      if (fs.existsSync(localPath)) {
        const buf = await fs.promises.readFile(localPath);
        return new Response(buf, { headers: { 'Content-Type': mimeForExt(path.extname(filename)) } });
      }

      // Not cached yet — download once, save, then serve. Coalesced so a menu
      // grid rendering the same photo in multiple places (or a fast double
      // render) can't trigger two simultaneous downloads of the same file.
      let pending = photoDownloads.get(filename);
      if (!pending) {
        pending = fetchBinary(`${BACKEND_BASE}/uploads/menu/${filename}`)
          .then(async (buf) => {
            await fs.promises.mkdir(PHOTO_CACHE_DIR, { recursive: true });
            await fs.promises.writeFile(localPath, buf);
            return buf;
          })
          .finally(() => photoDownloads.delete(filename));
        photoDownloads.set(filename, pending);
      }
      const buf = await pending;
      return new Response(buf, { headers: { 'Content-Type': mimeForExt(path.extname(filename)) } });
    } catch (err) {
      console.warn('[photo-cache] failed for', filename, '-', err.message);
      return new Response('Not found', { status: 404 });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── HTTP helper (main process talks to the backend, not the renderer) ─────────
// `timeoutMs` guards against a hung/slow backend: without it, a stalled
// Render response (cold start, dropped connection, dead route) left every
// caller — History/Receivables/Profile's Shift Info, all of which go through
// api:get below — spinning forever with no error and no way to fall back to
// the stale-data badge those screens already have. 15s default is generous
// enough for a real slow response but still bounded; the health check below
// uses a much shorter one since it's just a reachability probe.
function request(method, path_, body, authToken, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const url     = new URL(BACKEND_BASE + path_);
    const isHttps = url.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const req = lib.request({
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(payload   ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    // Node's `timeout` socket option doesn't abort the request by itself —
    // it just emits 'timeout'; destroying with an Error turns that into a
    // normal 'error' event below, so callers get one clean rejection either way.
    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs / 1000}s — is the backend reachable?`));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── IPC: Auth ──────────────────────────────────────────────────────────────────
// Renderer never sees the raw token fetch — it goes through main, same trust
// boundary pattern as electron-app/printer.js already uses.

ipcMain.handle('auth:login', async (_event, { identifier, password }) => {
  // Previously unguarded: if request() rejected (network drop, TLS handshake
  // failure, DNS issue, etc.) that exception propagated straight out of an
  // ipcMain.handle() callback, which Electron surfaces to the renderer as a
  // raw "Error invoking remote method 'auth:login': Error: ..." — an ugly
  // devtools-only error with no on-screen message, easy to mistake for the
  // whole app being broken instead of "the network hiccuped, try again."
  // Every other handler in this file (submitOrderWrite, api:get, the Admin
  // write passthrough) already wraps its request() call in try/catch for
  // exactly this reason — this one was the one gap. Now returns the same
  // { ok: false, error } shape Login.jsx already knows how to show.
  try {
    const res = await request('POST', '/api/auth/login', { identifier, password });
    if (res.status !== 200) {
      return { ok: false, error: res.body?.error || `Login failed (${res.status})`, code: res.body?.code };
    }
    store.set('session', { token: res.body.token, user: res.body.user, restaurant: res.body.restaurant || null });
    connectPowerSync(); // don't await — let sync start in the background
    return { ok: true, user: res.body.user, restaurant: res.body.restaurant || null };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error — is the backend reachable?' };
  }
});

ipcMain.handle('auth:get-session', () => {
  return store.get('session', null);
});

ipcMain.handle('auth:logout', async () => {
  store.delete('session');
  if (psDb) {
    try { await psDb.disconnect(); } catch (err) { console.warn('[powersync] disconnect error:', err.message); }
  }
  return { ok: true };
});

ipcMain.handle('get-version', () => app.getVersion());

// ── IPC: Window controls ────────────────────────────────────────────────────────
// frame:false (see createWindow) removes the OS-drawn title bar entirely — no
// minimize/maximize/close buttons and no draggable region — so src/TitleBar.jsx
// draws its own and calls these instead of anything native.
ipcMain.handle('window:minimize', () => { mainWindow?.minimize(); });
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => { mainWindow?.close(); });
ipcMain.handle('window:isMaximized', () => !!mainWindow?.isMaximized());

// ── IPC: Order writes (Phase 1 — Cashier) ──────────────────────────────────────
// Reads (menu, tables, active orders) come from the local PowerSync database —
// see powersync:getAll/get below. Writes that create or change money/kitchen
// state (creating an order, taking a payment) do NOT go through PowerSync's
// write queue. They go straight to the existing Express API over HTTPS, same
// trust boundary as auth:login above — because order creation/payment on the
// backend does real business logic (tax calc, daily order numbering, stock
// deduction, kitchen notifications/printing) that must stay centralized, not
// be duplicated client-side.
//
// Per the project owner's decision (2026-07-07): Phase 1 requires the backend
// to be reachable for these two actions ("Option A"), but is deliberately
// structured to leave room for offline queuing later ("Option B").
// submitOrderWrite() is the single funnel every order write goes through —
// when offline queuing is built, it slots in right here: check connectivity,
// and if offline, append the { method, path, body } to a local outbox (a
// plain table, separate from the PowerSync-managed schema) instead of calling
// request() directly, then replay the outbox in order once back online. Do
// not scatter direct request() calls for order writes anywhere else — always
// go through this function so that future change is a one-place edit.
async function submitOrderWrite(method, path_, body) {
  const token = store.get('session')?.token;
  if (!token) return { ok: false, error: 'Not logged in' };
  try {
    const res = await request(method, path_, body, token);
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: res.body?.error || `Request failed (${res.status})` };
    }
    return { ok: true, data: res.body };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error — is the backend reachable?' };
  }
}

// `client_prints_locally: true` tells the backend NOT to also broadcast/attempt
// a kitchen print for this order — pos-app prints it itself right after this
// call succeeds (see the `print:kitchenTicket` IPC handler below and each
// screen's post-write print call). See orders.js for the backend-side half.
ipcMain.handle('orders:create', async (_event, payload) =>
  submitOrderWrite('POST', '/api/orders', { ...payload, client_prints_locally: true }));

ipcMain.handle('orders:pay', async (_event, { id, data }) =>
  submitOrderWrite('PUT', `/api/orders/${id}/pay`, data));

// Order edit (items/table/type replacement) — backend PUT /orders/:id diffs old
// vs new item quantities and adjusts ingredient stock accordingly (see
// orders.js stock_diff_items SAVEPOINT) — POS must always send the FULL items
// list, not a delta.
ipcMain.handle('orders:update', async (_event, { id, data }) =>
  submitOrderWrite('PUT', `/api/orders/${id}`, data));

ipcMain.handle('orders:refund', async (_event, { id, data }) =>
  submitOrderWrite('POST', `/api/orders/${id}/refund`, data));

// Add items to an already-existing order (Menu screen: cashier picks an
// occupied table while building a cart → items get appended to that table's
// live order instead of creating a second order on the same table). Backend
// recalculates subtotal/tax/total from ALL items and reopens the order for
// the kitchen (see orders.js POST /:id/items) — send only the NEW items here,
// not the full list (unlike orders:update, which replaces the whole list).
ipcMain.handle('orders:addItems', async (_event, { id, data }) =>
  submitOrderWrite('POST', `/api/orders/${id}/items`, { ...data, client_prints_locally: true }));

// ── IPC: Kitchen ticket printing (direct LAN, see printEngine.js) ──────────────
// Called by each screen AFTER an order write above has already succeeded —
// this never blocks or risks the order itself, it only affects whether/how
// well the kitchen finds out about it. The renderer already has printers/show
// flags loaded (via useSettings.js, which reads restaurant_settings once on
// mount) and passes them straight through here — this handler does NOT fetch
// settings itself, so printing has zero extra network round-trip on top of
// the actual LAN TCP send to the printer(s).
ipcMain.handle('print:kitchenTicket', async (_event, { order, items, printers, show }) => {
  try {
    return await printKitchenTicket({ order, items, printers, show });
  } catch (err) {
    // printKitchenTicket() is designed to never throw — this catch only
    // guards against a truly unexpected bug so a print attempt can never
    // crash the app or the IPC bridge.
    return { ok: false, error: err.message || 'Unexpected print error' };
  }
});

// Receivables — collect a loan payment. PATCH /api/loans/:id/pay is a
// pre-existing backend endpoint (loans.js), unrelated to order writes, but
// still goes through submitOrderWrite() since it's the same "write needs the
// backend reachable" rule — no separate funnel needed for one more write.
ipcMain.handle('loans:pay', async (_event, { id, data }) =>
  submitOrderWrite('PATCH', `/api/loans/${id}/pay`, data));

ipcMain.handle('loans:remind', async () =>
  submitOrderWrite('POST', '/api/loans/notify-overdue', {}));

// Self clock-in/out (Profile screen). Backend defaults to the calling user
// when no user_id is given in the body — see shifts.js.
ipcMain.handle('shifts:clockIn', async () =>
  submitOrderWrite('POST', '/api/shifts/clock-in', {}));
ipcMain.handle('shifts:clockOut', async () =>
  submitOrderWrite('POST', '/api/shifts/clock-out', {}));

// ── IPC: Generic read-only backend GET ─────────────────────────────────────────
// For data that is NOT in the local PowerSync database (restaurant settings,
// shifts/clock-in state, loans, order history with joins). READ-ONLY by design:
// only GET goes through here. Any write that changes money/kitchen/stock state
// must go through submitOrderWrite() (or its own deliberate handler) — never
// through a generic passthrough — so the offline-queuing insertion point stays
// a single place.
ipcMain.handle('api:get', async (_event, path_) => {
  const token = store.get('session')?.token;
  if (!token) return { ok: false, error: 'Not logged in' };
  if (typeof path_ !== 'string' || !path_.startsWith('/api/')) {
    return { ok: false, error: 'Invalid API path' };
  }
  try {
    const res = await request('GET', path_, null, token);
    if (res.status < 200 || res.status >= 300) {
      // `status` included so callers (Admin's client.js) can special-case 401
      // into an auto-logout, matching the website's axios interceptor —
      // the message alone isn't a reliable way to detect "session expired".
      return { ok: false, error: res.body?.error || `Request failed (${res.status})`, status: res.status };
    }
    return { ok: true, data: res.body };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error — is the backend reachable?' };
  }
});

// ── IPC: Generic authenticated write passthrough (Admin panel) ─────────────────
// The comment above on api:get says writes should get their own dedicated
// handler (submitOrderWrite), not a generic passthrough — that rule is about
// the CASHIER's order/payment writes specifically, where a single funnel
// matters because Option B (offline queuing for Fire/Charge) needs one choke
// point to hook into later. The Admin panel is a different situation: it's a
// faithful port of the website's admin pages (same ~20 API groups, dozens of
// create/update/delete endpoints — staff, menu, inventory, settings, etc.),
// none of which have the same offline-queuing requirement, and writing a
// dedicated IPC handler for every single one would be pure repetition. This
// passthrough is deliberately scoped to Admin's needs only — it does not
// replace or get called instead of submitOrderWrite() for anything
// order/payment-related, which still goes through its own path unchanged.
function makeWriteHandler(method) {
  return async (_event, { path: path_, data } = {}) => {
    const token = store.get('session')?.token;
    if (!token) return { ok: false, error: 'Not logged in' };
    if (typeof path_ !== 'string' || !path_.startsWith('/api/')) {
      return { ok: false, error: 'Invalid API path' };
    }
    try {
      const res = await request(method, path_, data ?? {}, token);
      if (res.status < 200 || res.status >= 300) {
        return { ok: false, error: res.body?.error || `Request failed (${res.status})`, status: res.status };
      }
      return { ok: true, data: res.body };
    } catch (err) {
      return { ok: false, error: err.message || 'Network error — is the backend reachable?' };
    }
  };
}
ipcMain.handle('api:post',   makeWriteHandler('POST'));
ipcMain.handle('api:put',    makeWriteHandler('PUT'));
ipcMain.handle('api:patch',  makeWriteHandler('PATCH'));
ipcMain.handle('api:delete', makeWriteHandler('DELETE'));

// ── IPC: Backend reachability probe ─────────────────────────────────────────────
// Separate from api:get on purpose: `/health` (server.js) needs no auth token and
// no `/api/` prefix, and this is checked constantly by the topbar's sync badge so
// it uses a short timeout (a slow-but-alive backend shouldn't make the badge sit
// "checking" for 15s). The topbar badge previously only reflected psStatus()
// (PowerSync's own sync stream) — that meant it could say "Online" while the
// Express backend History/Receivables/Profile actually depend on was unreachable,
// which is exactly the mismatch reported against a live screenshot: History
// showed its own "Offline" stale badge while the topbar still said Online.
ipcMain.handle('backend:health', async () => {
  try {
    const res = await request('GET', '/health', null, null, 6000);
    return { ok: res.status >= 200 && res.status < 300 };
  } catch (err) {
    return { ok: false, error: err.message || 'Unreachable' };
  }
});

// ── IPC: PowerSync queries ──────────────────────────────────────────────────────
// Thin, generic pass-through — the renderer sends a SQL string + params, main runs it
// against the local SQLite database. Renderer never touches the database file directly.
ipcMain.handle('powersync:getAll', async (_event, { sql, params }) => {
  const db = await getPowerSync();
  return db.getAll(sql, params || []);
});

ipcMain.handle('powersync:get', async (_event, { sql, params }) => {
  const db = await getPowerSync();
  return db.get(sql, params || []);
});

ipcMain.handle('powersync:status', async () => {
  if (!psDb) return { connected: false, hasSynced: false };
  const status = psDb.currentStatus;
  return { connected: !!status?.connected, hasSynced: !!status?.hasSynced };
});
