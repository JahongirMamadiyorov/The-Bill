'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Notification,
} = require('electron');
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
    backgroundColor: '#0f172a',
    icon:            ICON_PATH,
    webPreferences: {
      nodeIntegration:         false,
      contextIsolation:        true,
      preload:                 PRELOAD,
      webviewTag:              false,
      allowRunningInsecureContent: false,
    },
  });

  // Loading screen while Vercel loads
  mainWindow.webContents.on('did-start-loading', () => {
    if (!mainWindow) return;
    mainWindow.webContents.executeJavaScript(`
      if (!document.getElementById('__tb_loader__')) {
        const el = document.createElement('div');
        el.id = '__tb_loader__';
        el.style.cssText = 'position:fixed;inset:0;background:#0f172a;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:system-ui,sans-serif;';
        el.innerHTML = '<div style="text-align:center;color:#e2e8f0"><div style="font-size:2rem;font-weight:700;letter-spacing:.05em;color:#0891b2">THE BILL</div><div style="margin-top:12px;font-size:.85rem;opacity:.6">Loading...</div></div>';
        document.documentElement.appendChild(el);
      }
    `).catch(() => {});
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) return;
    mainWindow.webContents.executeJavaScript(`
      const el = document.getElementById('__tb_loader__');
      if (el) el.remove();
    `).catch(() => {});
  });

  mainWindow.loadURL(VERCEL_URL);

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) {
      mainWindow.show();
    }
  });

  // F11 — fullscreen toggle
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
    if (input.type === 'keyDown' && input.key === 'F12') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  // Ctrl+Q to actually quit
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'q' && input.control) {
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
