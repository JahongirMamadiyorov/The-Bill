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

// ── Layout constants (80 mm paper = 48 chars) ──────────────────────────────────
const LINE_WIDTH   = 48;
const SEP          = '='.repeat(LINE_WIDTH);
const ALIGN_LEFT   = Buffer.from([ESC, 0x61, 0x00]);
const ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);

// ── Config ─────────────────────────────────────────────────────────────────────
const BACKEND_BASE    = 'https://the-bill-backend.onrender.com';
const WS_URL_BASE     = 'wss://the-bill-backend.onrender.com';
const PRINTER_CACHE_MS = 5 * 60 * 1_000; // 5 minutes
const RECONNECT_DELAY  = 5_000;
const PING_INTERVAL    = 25_000;

// ── State ──────────────────────────────────────────────────────────────────────
let _status          = 'disconnected';
let _statusCb        = null;
let _logCb           = null;
let _ws              = null;
let _token           = null;
let _credentials     = null;
let _settingsCache   = null;   // full /api/settings response
let _cacheTimestamp  = 0;
let _reconnectTimer  = null;
let _pingTimer       = null;
let _stopped         = false;

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

// ── Settings (printers + show flags) ──────────────────────────────────────────
async function fetchSettings(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _settingsCache && (now - _cacheTimestamp) < PRINTER_CACHE_MS) {
    return _settingsCache;
  }

  const res = await request('GET', '/api/settings', null, _token);
  if (res.status === 401) {
    log('warn', '[printer] Token expired, re-logging in…');
    _token = await login(_credentials);
    const res2 = await request('GET', '/api/settings', null, _token);
    if (res2.status !== 200) throw new Error('Failed to fetch settings');
    _settingsCache  = res2.body;
    _cacheTimestamp = Date.now();
    log('log', `[printer] Settings fetched — ${(_settingsCache.kitchen_printers || []).length} printer(s)`);
    return _settingsCache;
  }
  if (res.status !== 200) throw new Error(`Settings fetch failed: ${res.status}`);

  _settingsCache  = res.body;
  _cacheTimestamp = Date.now();
  log('log', `[printer] Settings fetched — ${(_settingsCache.kitchen_printers || []).length} printer(s)`);
  return _settingsCache;
}

/** Extract kitchen_show_* flags from the settings object, defaulting all to true. */
function parseShowFlags(settings) {
  const b = (v, def = true) => (v === undefined || v === null ? def : Boolean(v));
  return {
    tableName:    b(settings.kitchen_show_table_name),
    orderNumber:  b(settings.kitchen_show_order_number),
    customerName: b(settings.kitchen_show_customer_name),
    notes:        b(settings.kitchen_show_notes),
    timestamp:    b(settings.kitchen_show_timestamp),
    orderType:    b(settings.kitchen_show_order_type),
    itemPrice:    b(settings.kitchen_show_item_price, false),
    qtyUnit:      b(settings.kitchen_show_qty_unit),
  };
}

// ── ESC/POS builder ───────────────────────────────────────────────────────────
function encode(str) {
  return Buffer.from(str, 'utf8');
}

function concat(...parts) {
  return Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
}

// Right-align amount with space padding: "Osh Kabob           2 dona"
function spaceFill(name, amountStr) {
  const spaces = Math.max(2, LINE_WIDTH - name.length - amountStr.length);
  return name + ' '.repeat(spaces) + amountStr;
}

/**
 * Build an ESC/POS kitchen ticket.
 *
 * ESC ! bitmask reference:
 *   0x08 = bold
 *   0x10 = double-height
 *   0x18 = double-height + bold
 *   0x20 = double-width  (halves chars per line — only for station header)
 *   0x38 = double-height + double-width + bold  (station header)
 *
 * @param {object} params.order       – order row
 * @param {Array}  params.items       – order items
 * @param {string} params.stationLabel
 * @param {object} [params.showFlags] – kitchen_show_* toggles from settings
 */
function buildKitchenTicket({ order, items, stationLabel, showFlags = {} }) {
  const station = stationLabel ? stationLabel.toUpperCase() : 'KITCHEN';
  const isToGo  = order.order_type === 'to_go' || order.order_type === 'takeaway';
  const isDeli  = order.order_type === 'delivery';

  // Default every flag to ON if not explicitly set to false
  const show = {
    tableName:    showFlags.tableName    !== false,
    orderNumber:  showFlags.orderNumber  !== false,
    customerName: showFlags.customerName !== false,
    notes:        showFlags.notes        !== false,
    timestamp:    showFlags.timestamp    !== false,
    orderType:    showFlags.orderType    !== false,
    qtyUnit:      showFlags.qtyUnit      !== false,
  };

  const parts = [];

  // Init + code page
  parts.push(Buffer.from([ESC, 0x40]));
  parts.push(Buffer.from([ESC, 0x74, 0x00]));

  // ── 1. Station header — double-height + double-width + bold, centered ────
  parts.push(ALIGN_CENTER);
  parts.push(Buffer.from([ESC, 0x21, 0x38]));
  parts.push(encode(`${station}\n`));
  parts.push(Buffer.from([ESC, 0x21, 0x00]));

  // ── 2. Table name — bold, centered (dine-in only, if enabled) ────────────
  if (!isToGo && !isDeli && show.tableName) {
    const tableLabel = order.table_name || (order.table_number ? `Table ${order.table_number}` : 'Walk-in');
    parts.push(ALIGN_CENTER);
    parts.push(Buffer.from([ESC, 0x21, 0x08]));
    parts.push(encode(`${tableLabel}\n`));
    parts.push(Buffer.from([ESC, 0x21, 0x00]));
  }

  // ── 3. Order number and/or timestamp — centered ───────────────────────────
  const now  = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh   = String(now.getHours()).padStart(2, '0');
  const min  = String(now.getMinutes()).padStart(2, '0');
  const datestamp = `${dd}.${mm}.${yyyy}`;
  const timestamp  = `${hh}:${min}`;

  const metaParts = [];
  if (show.orderNumber && order.daily_number) metaParts.push(`#${order.daily_number}`);
  if (show.timestamp)                          metaParts.push(`${datestamp}  ${timestamp}`);

  if (metaParts.length > 0) {
    parts.push(ALIGN_CENTER);
    parts.push(encode(metaParts.join('   ') + '\n'));
  }

  // ── 4. Separator ──────────────────────────────────────────────────────────
  parts.push(ALIGN_LEFT);
  parts.push(encode(`${SEP}\n`));

  // ── 5. Items — double-height + bold for name+amount, normal for notes ─────
  for (const item of items) {
    const name = item.name || item.item_name || 'Item';
    const qty  = item.quantity || 1;

    let amountStr;
    if (show.qtyUnit) {
      const unit = item.unit || 'piece';
      amountStr  = `${qty} ${unit}`;
    } else {
      amountStr = `x${qty}`;
    }

    // Double-height + bold: character width stays at LINE_WIDTH (48 chars)
    const maxNameLen = LINE_WIDTH - amountStr.length - 2;
    const safeName   = name.length > maxNameLen ? name.slice(0, maxNameLen) : name;

    parts.push(Buffer.from([ESC, 0x21, 0x18])); // double-height + bold
    parts.push(encode(spaceFill(safeName, amountStr) + '\n'));
    parts.push(Buffer.from([ESC, 0x21, 0x00]));

    if (show.notes && item.notes) {
      parts.push(encode(`  * ${item.notes}\n`));
    }
  }

  // ── 6. Separator ──────────────────────────────────────────────────────────
  parts.push(encode(`${SEP}\n`));

  // ── 7. Order type — double-height + bold (if enabled) ─────────────────────
  if (show.orderType) {
    const typeLabel = isDeli ? 'DELIVERY' : isToGo ? 'TO GO' : 'DINE IN';
    parts.push(ALIGN_CENTER);
    parts.push(Buffer.from([ESC, 0x21, 0x18])); // double-height + bold
    parts.push(encode(`${typeLabel}\n`));
    parts.push(Buffer.from([ESC, 0x21, 0x00]));
  }

  // ── 8. Delivery details ───────────────────────────────────────────────────
  if (isDeli) {
    if (show.customerName && order.customer_name) {
      parts.push(Buffer.from([ESC, 0x21, 0x08])); // bold
      parts.push(encode(`${order.customer_name}\n`));
      parts.push(Buffer.from([ESC, 0x21, 0x00]));
    }
    if (order.customer_phone) {
      parts.push(Buffer.from([ESC, 0x21, 0x10])); // double-height
      parts.push(encode(`${order.customer_phone}\n`));
      parts.push(Buffer.from([ESC, 0x21, 0x00]));
    }
    if (order.delivery_address) {
      parts.push(encode(`${order.delivery_address}\n`));
    }
  }

  // ── 9. Order-level notes ──────────────────────────────────────────────────
  if (show.notes && order.notes) {
    parts.push(encode(`* ${order.notes}\n`));
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

  let settings;
  try {
    settings = await fetchSettings();
  } catch (err) {
    log('error', `[printer] Failed to fetch settings: ${err.message}`);
    return;
  }

  const printers  = settings.kitchen_printers || [];
  const showFlags = parseShowFlags(settings);

  if (!Array.isArray(printers) || printers.length === 0) {
    log('warn', '[printer] No kitchen printers configured — add printers in Admin > Settings');
    return;
  }

  log('log', `[printer] Using ${printers.length} printer(s): ${printers.map((p) => `${p.name}(${p.ip})`).join(', ')}`);
  log('log', `[printer] Show flags: ${JSON.stringify(showFlags)}`);

  const groups = groupItemsByStation(items);
  log('log', `[printer] Stations in this order: ${Object.keys(groups).join(', ')}`);

  for (const [station, stationItems] of Object.entries(groups)) {
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
        showFlags,
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
