'use strict';

// ── Electron runtime guard ─────────────────────────────────────────────────────
// If ELECTRON_RUN_AS_NODE is set, require('electron') returns the binary path
// (a string), not the Electron API — causing every API call to crash.
// Catch this early with a clear message instead of a confusing TypeError.
if (process.env.ELECTRON_RUN_AS_NODE) {
  process.stderr.write(
    '\n[The Bill] ERROR: ELECTRON_RUN_AS_NODE is set in your environment.\n' +
    'This prevents Electron from loading its native API.\n' +
    'Fix: run  unset ELECTRON_RUN_AS_NODE  in your terminal, then try again.\n\n'
  );
  process.exit(1);
}

const _electron = require('electron');

// Verify we got the real Electron API (not the npm shim string)
if (!_electron || typeof _electron !== 'object' || !_electron.app) {
  process.stderr.write(
    '\n[The Bill] ERROR: require("electron") did not return the Electron API.\n' +
    `Got type: ${typeof _electron}\n` +
    'This usually means ELECTRON_RUN_AS_NODE=1 is set, or the electron binary\n' +
    'is corrupted. Try: rm -rf node_modules && npm install\n\n'
  );
  process.exit(1);
}

const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Notification,
} = _electron;
const path       = require('path');
const Store      = require('electron-store');
const { createTray, updateTrayStatus } = require('./tray');
const printer    = require('./printer');

// ── Constants ──────────────────────────────────────────────────────────────────
const VERCEL_URL  = 'https://the-bill-website.vercel.app';
const PRELOAD     = path.join(__dirname, 'preload.js');
const SETUP_HTML  = path.join(__dirname, 'setup.html');
const ICON_PATH   = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// ── Electron Store ─────────────────────────────────────────────────────────────
const store = new Store({
  encryptionKey: 'thebill-2026-secure-local-key',
});

// ── Globals ────────────────────────────────────────────────────────────────────
let mainWindow  = null;
let setupWindow = null;
let tray        = null;
let isQuitting  = false;

// ── Single Instance Lock ───────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ── Auto-updater ───────────────────────────────────────────────────────────────
let autoUpdater = null;
function initAutoUpdater() {
  try {
    autoUpdater = require('electron-updater').autoUpdater;

    autoUpdater.autoDownload            = true;
    autoUpdater.autoInstallOnAppQuit    = true;
    autoUpdater.allowDowngrade          = false;

    autoUpdater.on('update-available', (info) => {
      console.log('[updater] Update available:', info.version);
      if (mainWindow) {
        mainWindow.webContents.send('update-available', { version: info.version });
      }
      if (Notification.isSupported()) {
        new Notification({
          title: 'The Bill — Update Available',
          body:  `Version ${info.version} is downloading in the background.`,
          icon:  ICON_PATH,
        }).show();
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[updater] Update downloaded:', info.version);
      if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', { version: info.version });
      }
      if (Notification.isSupported()) {
        new Notification({
          title: 'The Bill — Ready to Update',
          body:  `Version ${info.version} will be installed when you quit.`,
          icon:  ICON_PATH,
        }).show();
      }
    });

    autoUpdater.on('error', (err) => {
      console.warn('[updater] Error:', err.message);
    });

    // Check for updates after a short delay so the window is visible first
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 8_000);

  } catch (err) {
    console.warn('[updater] electron-updater not available:', err.message);
  }
}

// ── Setup Window ───────────────────────────────────────────────────────────────
function openSetupWindow() {
  if (setupWindow) { setupWindow.focus(); return; }

  setupWindow = new BrowserWindow({
    width:           600,
    height:          440,
    resizable:       false,
    frame:           false,
    center:          true,
    show:            false,
    backgroundColor: '#0f172a',
    icon:            ICON_PATH,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload:          PRELOAD,
    },
  });

  setupWindow.loadFile(SETUP_HTML);

  setupWindow.once('ready-to-show', () => setupWindow.show());

  setupWindow.on('closed', () => {
    setupWindow = null;
  });
}

// ── Main Window ────────────────────────────────────────────────────────────────
function openMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const startHidden = process.argv.includes('--hidden');

  mainWindow = new BrowserWindow({
    width:           1280,
    height:          800,
    minWidth:        1024,
    minHeight:       600,
    show:            false,
    // Dark background shown while the page loads — no JS overlay needed
    backgroundColor: '#0f172a',
    icon:            ICON_PATH,
    webPreferences: {
      nodeIntegration:             false,
      contextIsolation:            true,
      preload:                     PRELOAD,
      webviewTag:                  false,
      allowRunningInsecureContent: false,
      // Named persistent partition — keeps cookies/localStorage/session
      // across restarts so the user stays logged in to the Vercel app
      partition: 'persist:thebill',
    },
  });

  // Load Vercel directly — no JS injection, no loading overlay
  mainWindow.loadURL(VERCEL_URL);

  // Show only when the first frame is painted (avoids white/blank flash)
  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow.show();
  });

  // Keyboard shortcuts — single handler
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;

    // F11 — fullscreen toggle
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }

    // F12 — detached DevTools
    if (input.key === 'F12') {
      mainWindow.webContents.isDevToolsOpened()
        ? mainWindow.webContents.closeDevTools()
        : mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // Ctrl+Q — actually quit (not just hide)
    if (input.key === 'q' && input.control) {
      isQuitting = true;
      app.quit();
    }
  });

  // Closing hides to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in the system browser, not a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(VERCEL_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// ── IPC Handlers ───────────────────────────────────────────────────────────────

// setup.html → save credentials and open main window
ipcMain.handle('save-credentials', (_event, credentials) => {
  store.set('credentials', credentials);
  store.set('setupDone', true);

  if (setupWindow) {
    setupWindow.close();
    setupWindow = null;
  }

  openMainWindow();

  // Start the print agent with the saved credentials
  startPrintAgent(credentials);

  return { ok: true };
});

// Renderer can request version
ipcMain.handle('get-version', () => app.getVersion());

// Tray/renderer: trigger update check
ipcMain.handle('check-for-updates', () => {
  if (autoUpdater) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }
});

// ── Print Agent ────────────────────────────────────────────────────────────────
function startPrintAgent(credentials) {
  // Forward all printer logs to browser DevTools so they're visible alongside
  // the website's own console output (open F12 to see [printer] prefixed lines)
  printer.onLog((level, msg) => {
    if (!mainWindow) return;
    const safeMsg = msg.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    mainWindow.webContents.executeJavaScript(
      `console.${level === 'log' ? 'log' : level === 'warn' ? 'warn' : 'error'}(\`${safeMsg}\`)`
    ).catch(() => {});
  });

  printer.onStatusChange((status) => {
    updateTrayStatus(status);
  });

  printer.start(credentials).catch((err) => {
    console.warn('[main] Print agent start error:', err.message);
  });
}

// ── App startup ────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Windows: start on boot, hidden to tray
  app.setLoginItemSettings({
    openAtLogin:  true,
    openAsHidden: true,
  });

  // Create system tray
  tray = createTray({
    iconPath:   ICON_PATH,
    onOpen:     () => {
      if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      else openMainWindow();
    },
    onQuit: () => {
      isQuitting = true;
      app.quit();
    },
    onCheckUpdate: () => {
      if (autoUpdater) autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    },
  });

  const setupDone   = store.get('setupDone', false);
  const credentials = store.get('credentials', null);

  if (setupDone && credentials) {
    openMainWindow();
    startPrintAgent(credentials);
  } else {
    openSetupWindow();
  }

  initAutoUpdater();
});

// macOS: re-open when dock icon is clicked and no windows are open
app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    const setupDone   = store.get('setupDone', false);
    const credentials = store.get('credentials', null);
    if (setupDone && credentials) openMainWindow();
    else openSetupWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  printer.stop();
  if (tray) { tray.destroy(); tray = null; }
});

// Prevent the app from quitting when all windows are closed (hide to tray).
// Just subscribing to this event without calling app.quit() overrides the
// default quit-on-close behaviour on Windows/Linux.
app.on('window-all-closed', () => {
  // App lives in the system tray — do not quit here.
  // Actual quit happens via Ctrl+Q or the tray menu "Quit" option.
});
