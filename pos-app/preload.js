'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  getVersion: () => ipcRenderer.invoke('get-version'),

  // Window controls — the window is frameless (main.js createWindow), so
  // TitleBar.jsx's custom buttons call these instead of any native chrome.
  windowMinimize:    () => ipcRenderer.invoke('window:minimize'),
  windowMaximize:    () => ipcRenderer.invoke('window:maximize'),
  windowClose:       () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximizedChange: (cb) => {
    const handler = (_event, isMax) => cb(isMax);
    ipcRenderer.on('window:maximized-changed', handler);
    return () => ipcRenderer.removeListener('window:maximized-changed', handler);
  },

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
  ordersUpdate: (id, payload) => ipcRenderer.invoke('orders:update', { id, data: payload }),
  ordersRefund: (id, payload) => ipcRenderer.invoke('orders:refund', { id, data: payload }),
  ordersAddItems: (id, payload) => ipcRenderer.invoke('orders:addItems', { id, data: payload }),
  loansPay:     (id, payload) => ipcRenderer.invoke('loans:pay', { id, data: payload }),
  loansRemind:  ()            => ipcRenderer.invoke('loans:remind'),
  shiftsClockIn:  () => ipcRenderer.invoke('shifts:clockIn'),
  shiftsClockOut: () => ipcRenderer.invoke('shifts:clockOut'),

  // Read-only backend GET for data not in PowerSync (settings, shifts, loans,
  // history). Writes must NOT use this — see main.js api:get comment.
  apiGet: (path) => ipcRenderer.invoke('api:get', path),

  // Generic authenticated write passthrough — Admin panel only (see main.js
  // api:post comment for why this is separate from the cashier's dedicated
  // per-action write handlers like ordersCreate/ordersPay above).
  apiPost:   (path, data) => ipcRenderer.invoke('api:post',   { path, data }),
  apiPut:    (path, data) => ipcRenderer.invoke('api:put',    { path, data }),
  apiPatch:  (path, data) => ipcRenderer.invoke('api:patch',  { path, data }),
  apiDelete: (path, data) => ipcRenderer.invoke('api:delete', { path, data }),

  // Lightweight backend-reachability probe (GET /health, short timeout, no auth) —
  // separate from apiGet since it's polled by the topbar sync badge alongside
  // psStatus(). See main.js backend:health comment for why this exists.
  backendHealth: () => ipcRenderer.invoke('backend:health'),
});
