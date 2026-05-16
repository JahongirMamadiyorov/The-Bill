'use strict';

/**
 * printer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Built-in kitchen print agent for The Bill Electron app.
 * Runs entirely in the Electron main process — no renderer access needed.
 *
 * Replaces the standalone print-agent/index.js.
 * Reads credentials from electron-store (set during setup).
 *
 * Exports:
 *   start(credentials)  → Promise<void>
 *   stop()              → void
 *   getStatus()         → 'connected' | 'disconnected'
 *   onStatusChange(cb)  → void
 */

const net       = require('net');
const https     = require('https');
const http      = require('http');
const WebSocket = require('ws');

// ── ESC/POS constants ──────────────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;

// ── Config ─────────────────────────────────────────────────────────────────────
const BACKEND_BASE    = 'https://the-bill-backend.onrender.com';
const WS_URL_BASE     = 'wss://the-bill-backend.onrender.com';
const PRINTER_CACHE_MS = 5 * 60 * 1_000; // 5 minutes
const RECONNECT_DELAY  = 5_000;
const PING_INTERVAL    = 25_000;

// ── State ──────────────────────────────────────────────────────────────────────
let _status         = 'disconnected';
let _statusCb       = null;
let _logCb          = null;
let _ws             = null;
let _token          = null;
let _credentials    = null;
let _printerCache   = null;
let _cacheTimestamp = 0;
let _reconnectTimer = null;
let _pingTimer      = null;
let _stopped        = false;

// ── Logger ─────────────────────────────────────────────────────────────────────
// All printer output goes through log() so it can be forwarded to DevTools.
function log(level, msg) {
  console[level](msg);
  if (_logCb) {
    try { _logCb(level, msg); } catch (_) {}
  }
}

// ── Status helpers ─────────────────────────────────────────────────────────────
function setStatus(s) {
  if (_status === s) return;
  _status = s;
  log('log', `[printer] Status: ${s}`);
  if (_statusCb) _statusCb(s);
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
function request(method, path, body, authToken) {
  return new Promise((resolve, reject) => {
    const url     = new URL(BACKEND_BASE + path);
    const isHttps = url.protocol === 'https:';
    const lib     = isHttps ? https : http;

    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(payload   ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Auth ───────────────────────────────────────────────────────────────────────
async function login(credentials) {
  const res = await request('POST', '/api/auth/login', {
    identifier: credentials.identifier,
    password:   credentials.password,
  });
  if (res.status !== 200) {
    throw new Error(`Login failed: ${res.body?.error || res.status}`);
  }
  return res.body.token;
}

// ── Printer config ─────────────────────────────────────────────────────────────
async function fetchPrinters(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _printerCache && (now - _cacheTimestamp) < PRINTER_CACHE_MS) {
    return _printerCache;
  }

  const res = await request('GET', '/api/settings', null, _token);
  if (res.status === 401) {
    // Token expired — re-login
    log('warn', '[printer] Token expired, re-logging in…');
    _token = await login(_credentials);
    const res2 = await request('GET', '/api/settings', null, _token);
    if (res2.status !== 200) throw new Error('Failed to fetch printer settings');
    _printerCache   = res2.body.kitchen_printers || [];
    _cacheTimestamp = Date.now();
    log('log', `[printer] Fetched ${_printerCache.length} printer(s) from settings`);
    return _printerCache;
  }
  if (res.status !== 200) throw new Error(`Settings fetch failed: ${res.status}`);

  _printerCache   = res.body.kitchen_printers || [];
  _cacheTimestamp = Date.now();
  log('log', `[printer] Fetched ${_printerCache.length} printer(s) from settings`);
  return _printerCache;
}

// ── ESC/POS builder (Node.js port of kitchenEscPos.js) ────────────────────────
function encode(str) {
  return Buffer.from(str, 'utf8');
}

function concat(...parts) {
  return Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
}

function buildKitchenTicket({ order, items, stationLabel }) {
  const station = stationLabel ? stationLabel.toUpperCase() : 'KITCHEN';
  const parts   = [];

  // Init + code page
  parts.push(Buffer.from([ESC, 0x40]));
  parts.push(Buffer.from([ESC, 0x74, 0x00]));

  // Station name: bold + double-height + double-width
  parts.push(Buffer.from([ESC, 0x21, 0x38]));
  parts.push(encode(`${station}\n`));
  parts.push(Buffer.from([ESC, 0x21, 0x00]));

  // Separator
  parts.push(encode('================================\n'));

  // Order header
  const now   = new Date();
  const time  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const orderNum  = order.daily_number ? `#${order.daily_number}` : '';
  let tableLabel;
  if (order.order_type === 'to_go') {
    tableLabel = `To Go${order.customer_name ? ' — ' + order.customer_name : ''}`;
  } else if (order.order_type === 'delivery') {
    tableLabel = `Delivery${order.customer_name ? ' — ' + order.customer_name : ''}`;
  } else if (order.table_number) {
    tableLabel = `Table ${order.table_number}`;
  } else {
    tableLabel = 'Walk-in';
  }

  parts.push(Buffer.from([ESC, 0x21, 0x08])); // bold
  parts.push(encode(tableLabel));
  if (orderNum) parts.push(encode(`  ${orderNum}`));
  parts.push(encode(`  ${time}\n`));
  parts.push(Buffer.from([ESC, 0x21, 0x00]));

  parts.push(encode('--------------------------------\n'));

  // Items
  for (const item of items) {
    const qty  = String(item.quantity || 1).padStart(3, ' ');
    const name = item.name || item.item_name || 'Item';

    parts.push(Buffer.from([ESC, 0x21, 0x08])); // qty bold
    parts.push(encode(`${qty}x `));
    parts.push(Buffer.from([ESC, 0x21, 0x00]));
    parts.push(encode(`${name}\n`));

    if (item.notes) {
      parts.push(encode(`       * ${item.notes}\n`));
    }
  }

  // Order notes
  if (order.notes) {
    parts.push(encode('--------------------------------\n'));
    parts.push(Buffer.from([ESC, 0x21, 0x08]));
    parts.push(encode('Note: '));
    parts.push(Buffer.from([ESC, 0x21, 0x00]));
    parts.push(encode(`${order.notes}\n`));
  }

  // Feed + cut
  parts.push(encode('\n\n\n'));
  parts.push(Buffer.from([GS, 0x56, 0x42, 0x00]));

  return concat(...parts);
}

// ── Station grouping ───────────────────────────────────────────────────────────
function groupItemsByStation(items) {
  const groups = {};
  for (const item of items) {
    const key = item.kitchen_station || item.kitchenStation || 'default';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

// ── TCP print ──────────────────────────────────────────────────────────────────
function sendToTcpPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP timeout to ${ip}:${port}`));
    }, 8_000);

    socket.connect(port, ip, () => {
      socket.write(data, () => {
        clearTimeout(timeout);
        socket.end();
        resolve();
      });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ── Print event handler ────────────────────────────────────────────────────────
async function handlePrintEvent({ order, items }) {
  log('log', `[printer] kitchen_print event — order #${order?.daily_number}, ${items?.length} items`);

  let printers;
  try {
    printers = await fetchPrinters();
  } catch (err) {
    log('error', `[printer] Failed to fetch printer config: ${err.message}`);
    return;
  }

  if (!Array.isArray(printers) || printers.length === 0) {
    log('warn', '[printer] No kitchen printers configured — add printers in Admin > Settings');
    return;
  }

  log('log', `[printer] Using ${printers.length} printer(s): ${printers.map((p) => `${p.name}(${p.ip})`).join(', ')}`);

  const groups = groupItemsByStation(items);
  log('log', `[printer] Stations in this order: ${Object.keys(groups).join(', ')}`);

  for (const [station, stationItems] of Object.entries(groups)) {
    // Find matching printer
    let printer = printers.find((p) =>
      Array.isArray(p.stations) &&
      p.stations.some((s) => s.toLowerCase() === station.toLowerCase())
    );

    if (!printer && station === 'default') {
      printer = printers.find((p) => !p.stations || p.stations.length === 0) || printers[0];
    }

    if (!printer || !printer.ip) {
      log('warn', `[printer] No printer found for station: ${station}`);
      continue;
    }

    try {
      const ticket = buildKitchenTicket({
        order,
        items:        stationItems,
        stationLabel: station !== 'default' ? station : (printer.name || 'Kitchen'),
      });

      const port = printer.port || 9100;
      log('log', `[printer] Sending to ${printer.name} at ${printer.ip}:${port} (station: ${station})…`);
      await sendToTcpPrinter(printer.ip, port, ticket);
      log('log', `[printer] Printed successfully to ${printer.name} (${printer.ip}:${port})`);
    } catch (err) {
      log('error', `[printer] TCP error to ${printer.ip}:${printer.port || 9100}: ${err.message}`);
    }
  }
}

// ── WebSocket connection ───────────────────────────────────────────────────────
function clearPing() {
  if (_pingTimer) { clearInterval(_pingTimer); _pingTimer = null; }
}

function clearReconnect() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
}

function scheduleReconnect() {
  clearReconnect();
  if (_stopped) return;
  log('log', `[printer] Reconnecting in ${RECONNECT_DELAY / 1000}s…`);
  _reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
}

function connect() {
  if (_stopped || !_token) return;

  const url = `${WS_URL_BASE}/ws?token=${_token}`;
  log('log', '[printer] Connecting to WS…');

  const ws = new WebSocket(url);
  _ws = ws;

  ws.on('open', () => {
    log('log', '[printer] WebSocket connected');
    setStatus('connected');
    clearPing();
    _pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, PING_INTERVAL);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      log('log', `[printer] WS message type: ${msg.type}`);
      if (msg.type === 'kitchen_print') {
        handlePrintEvent(msg).catch((err) => {
          log('error', `[printer] handlePrintEvent error: ${err.message}`);
        });
      }
    } catch (_) {}
  });

  ws.on('close', (code) => {
    clearPing();
    setStatus('disconnected');
    if (_stopped) return;

    if (code === 4001) {
      // Auth error — re-login then reconnect
      log('warn', '[printer] WS auth error (4001) — re-logging in…');
      login(_credentials)
        .then((token) => { _token = token; scheduleReconnect(); })
        .catch((err) => {
          log('error', `[printer] Re-login failed: ${err.message}`);
          scheduleReconnect();
        });
    } else if (code !== 1000) {
      log('warn', `[printer] WS closed (code ${code}), will reconnect…`);
      scheduleReconnect();
    }
  });

  ws.on('error', (err) => {
    log('warn', `[printer] WS error: ${err.message}`);
    // close event will handle reconnect
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Register a callback for log messages.
 * Receives (level: 'log'|'warn'|'error', message: string).
 * Use this in main.js to forward printer logs to browser DevTools.
 * @param {(level: string, message: string) => void} cb
 */
function onLog(cb) {
  _logCb = cb;
}

/**
 * Register a callback for status changes.
 * @param {(status: 'connected'|'disconnected') => void} cb
 */
function onStatusChange(cb) {
  _statusCb = cb;
}

/**
 * Start the print agent with the given credentials.
 * @param {{ identifier: string, password: string }} credentials
 */
async function start(credentials) {
  _stopped     = false;
  _credentials = credentials;

  log('log', '[printer] Starting print agent…');

  try {
    _token = await login(credentials);
    log('log', '[printer] Logged in, connecting WebSocket…');
    connect();
  } catch (err) {
    log('error', `[printer] Initial login failed: ${err.message}`);
    setStatus('disconnected');
    // Retry after delay — backend may be cold-starting on Render
    scheduleReconnect();
  }
}

/**
 * Stop the print agent and close the WebSocket.
 */
function stop() {
  _stopped = true;
  clearPing();
  clearReconnect();
  if (_ws) {
    try { _ws.close(1000, 'stop'); } catch (_) {}
    _ws = null;
  }
  setStatus('disconnected');
  log('log', '[printer] Print agent stopped');
}

/**
 * Get current connection status.
 * @returns {'connected'|'disconnected'}
 */
function getStatus() {
  return _status;
}

module.exports = { start, stop, getStatus, onStatusChange, onLog };
