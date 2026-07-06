'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  getVersion: () => ipcRenderer.invoke('get-version'),

  // Auth — main process owns the token, renderer only ever gets user/restaurant info back.
  login:      (identifier, password) => ipcRenderer.invoke('auth:login', { identifier, password }),
  getSession: ()                     => ipcRenderer.invoke('auth:get-session'),
  logout:     ()                     => ipcRenderer.invoke('auth:logout'),
});
