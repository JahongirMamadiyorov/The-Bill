'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  getVersion: () => ipcRenderer.invoke('get-version'),

  // Auth — main process owns the token, renderer only ever gets user/restaurant info back.
  login:      (identifier, password) => ipcRenderer.invoke('auth:login', { identifier, password }),
  getSession: ()                     => ipcRenderer.invoke('auth:get-session'),
  logout:     ()                     => ipcRenderer.invoke('auth:logout'),

  // PowerSync — local-first data. Renderer never touches the SQLite file directly, just
  // sends SQL + params through here, same trust boundary as everything else in this app.
  psGetAll: (sql, params) => ipcRenderer.invoke('powersync:getAll', { sql, params }),
  psGet:    (sql, params) => ipcRenderer.invoke('powersync:get', { sql, params }),
  psStatus: ()            => ipcRenderer.invoke('powersync:status'),

  // Order writes — go straight to the backend (see main.js submitOrderWrite comment).
  // Phase 1 is online-required for these two; payload keys are snake_case to match
  // exactly what the Express API expects (no camelCase translation on the way out).
  ordersCreate: (payload)     => ipcRenderer.invoke('orders:create', payload),
  ordersPay:    (id, payload) => ipcRenderer.invoke('orders:pay', { id, data: payload }),
});
