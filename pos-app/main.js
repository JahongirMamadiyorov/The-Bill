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

const { app, BrowserWindow, ipcMain, Menu } = _electron;
const path   = require('path');
const https  = require('https');
const http   = require('http');
const Store  = require('electron-store');

const { buildSchema } = require('./powersync/schema');
const { Connector }   = require('./powersync/connector');
// @powersync/node is a pure ESM package (no CommonJS support) — it can't be `require()`d from
// this file. Node allows dynamic `import()` from CommonJS code though, so it's loaded lazily
// the first time it's actually needed (see getPowerSync() below), not at the top of the file.

// ── Config ─────────────────────────────────────────────────────────────────────
const BACKEND_BASE = 'https://the-bill-backend-pego.onrender.com';
const IS_DEV        = process.env.NODE_ENV === 'development';
const DEV_SERVER_URL = 'http://localhost:5173';
const PRELOAD        = path.join(__dirname, 'preload.js');
const ICON_PATH      = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

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

app.whenReady().then(async () => {
  createWindow();
  // If a session was already saved from a previous run, start syncing immediately —
  // don't make the user log in again just to resume offline-first data access.
  if (store.get('session')) {
    connectPowerSync();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── HTTP helper (main process talks to the backend, not the renderer) ─────────
function request(method, path_, body, authToken) {
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
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
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
  const res = await request('POST', '/api/auth/login', { identifier, password });
  if (res.status !== 200) {
    return { ok: false, error: res.body?.error || `Login failed (${res.status})`, code: res.body?.code };
  }
  store.set('session', { token: res.body.token, user: res.body.user, restaurant: res.body.restaurant || null });
  connectPowerSync(); // don't await — let sync start in the background
  return { ok: true, user: res.body.user, restaurant: res.body.restaurant || null };
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

ipcMain.handle('orders:create', async (_event, payload) =>
  submitOrderWrite('POST', '/api/orders', payload));

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
  submitOrderWrite('POST', `/api/orders/${id}/items`, data));

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
      return { ok: false, error: res.body?.error || `Request failed (${res.status})` };
    }
    return { ok: true, data: res.body };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error — is the backend reachable?' };
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
