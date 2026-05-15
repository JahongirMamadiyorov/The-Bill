'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Flag so the React app knows it's running inside Electron
  isElectron: true,

  // Get app version string
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Called by setup.html after a successful login
  saveCredentials: (credentials) => ipcRenderer.invoke('save-credentials', credentials),

  // Trigger an update check from the renderer
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // Subscribe to update-available event (auto-updater found a new version)
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },

  // Subscribe to update-downloaded event (update ready to install on quit)
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },
});
