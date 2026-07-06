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

app.whenReady().then(createWindow);

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
  return { ok: true, user: res.body.user, restaurant: res.body.restaurant || null };
});

ipcMain.handle('auth:get-session', () => {
  return store.get('session', null);
});

ipcMain.handle('auth:logout', () => {
  store.delete('session');
  return { ok: true };
});

ipcMain.handle('get-version', () => app.getVersion());
