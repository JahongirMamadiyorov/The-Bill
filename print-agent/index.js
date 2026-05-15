/**
 * The Bill — Kitchen Print Agent
 * ─────────────────────────────────────────────────────────────────────────────
 * Run this on any computer that is ON THE SAME NETWORK as your thermal printer.
 *
 * Setup:
 *   1. Install Node.js (https://nodejs.org) if not already installed
 *   2. Fill in config.json with your login credentials ONLY
 *      (printer settings are fetched automatically from your restaurant settings)
 *   3. Run:  npm install
 *   4. Run:  npm start
 *
 * Printer config (IP, port, stations) is always read from the database.
 * To change a printer IP or add a new station, just update it in
 * Settings → Printers on the website — no need to touch this PC.
 */

'use strict';

const net       = require('net');
const https     = require('https');
const http      = require('http');
const WebSocket = require('ws');

// ── Config (login credentials only) ──────────────────────────────────────────
let config;
try {
  config = require('./config.json');
} catch {
  console.error('[print-agent] config.json not found.');
  process.exit(1);
}

const { backendUrl, identifier, password } = config;

if (!backendUrl || !identifier || !password) {
  console.error('[print-agent] config.json must have: backendUrl, identifier, password');
  process.exit(1);
}

// ── State ─────────────────────────────────────────────────────────────────────
let authToken       = null;  // JWT — refreshed on reconnect
let printerCache    = [];    // fetched from DB, refreshed every 5 minutes
let lastFetchedAt   = 0;
const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutes

// ── HTTP helper (works for both http:// and https://) ─────────────────────────
function request(method, urlStr, body, token) {
  return new Promise((resolve, reject) => {
    const url     = new URL(urlStr);
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
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
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

// ── Auth ──────────────────────────────────────────────────────────────────────
async function login() {
  console.log(`[print-agent] Logging in as ${identifier}...`);
  const res = await request('POST', `${backendUrl}/api/auth/login`, { identifier, password });
  if (!res.body.token) throw new Error(res.body.error || 'Login failed');
  authToken = res.body.token;
  console.log('[print-agent] Login successful.');
  return authToken;
}

// ── Fetch printer config from DB ──────────────────────────────────────────────
// Called on every print event if cache is stale (older than 5 min).
// This means printer changes on the website take effect within 5 minutes
// without restarting the agent.
async function fetchPrinters(force = false) {
  const now = Date.now();
  if (!force && printerCache.length > 0 && (now - lastFetchedAt) < CACHE_TTL_MS) {
    return printerCache; // fresh enough
  }

  try {
    const res = await request('GET', `${backendUrl}/api/settings`, null, authToken);
    if (res.status === 401) {
      // Token expired — re-login and retry
      console.log('[print-agent] Token expired, re-logging in...');
      await login();
      return fetchPrinters(true);
    }

    // API returns snake_case — kitchen_printers is the JSONB column
    const raw = res.body.kitchen_printers || res.body.kitchenPrinters || [];
    printerCache  = raw;
    lastFetchedAt = now;

    if (raw.length > 0) {
      console.log(`[print-agent] Printer config loaded: ${raw.map(p => `${p.name} (${p.ip})`).join(', ')}`);
    } else {
      console.warn('[print-agent] No kitchen printers configured. Add them in Settings -> Printers on the website.');
    }

    return printerCache;
  } catch (err) {
    console.warn('[print-agent] Could not fetch printer config:', err.message, '— using cached config.');
    return printerCache;
  }
}

// ── ESC/POS builder ───────────────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;

function encode(str) { return Buffer.from(str, 'latin1'); }

function buildKitchenTicket({ order, items, stationLabel }) {
  const station = stationLabel ? stationLabel.toUpperCase() : 'KITCHEN';
  const parts   = [];

  parts.push(Buffer.from([ESC, 0x40]));
  parts.push(Buffer.from([ESC, 0x74, 0x00]));

  parts.push(Buffer.from([ESC, 0x21, 0x38]));
  parts.push(encode(station + '\n'));
  parts.push(Buffer.from([ESC, 0x21, 0x00]));

  parts.push(encode('================================\n'));

  const time       = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const orderNum   = order.daily_number ? `#${order.daily_number}` : '';
  const tableLabel =
    order.order_type === 'to_go'      ? `To Go${order.customer_name ? ' - ' + order.customer_name : ''}`
    : order.order_type === 'delivery' ? `Delivery${order.customer_name ? ' - ' + order.customer_name : ''}`
    : order.table_number              ? `Table ${order.table_number}`
    : 'Walk-in';

  parts.push(Buffer.from([ESC, 0x21, 0x08]));
  parts.push(encode(`${tableLabel}  ${orderNum}  ${time}\n`));
  parts.push(Buffer.from([ESC, 0x21, 0x00]));
  parts.push(encode('--------------------------------\n'));

  for (const item of items) {
    const qty  = String(item.quantity || 1).padStart(3, ' ');
    const name = item.name || item.item_name || 'Item';
    parts.push(Buffer.from([ESC, 0x21, 0x08]));
    parts.push(encode(`${qty}x `));
    parts.push(Buffer.from([ESC, 0x21, 0x00]));
    parts.push(encode(`${name}\n`));
    if (item.notes) parts.push(encode(`       * ${item.notes}\n`));
  }

  if (order.notes) {
    parts.push(encode('--------------------------------\n'));
    parts.push(Buffer.from([ESC, 0x21, 0x08]));
    parts.push(encode('Note: '));
    parts.push(Buffer.from([ESC, 0x21, 0x00]));
    parts.push(encode(`${order.notes}\n`));
  }

  parts.push(encode('\n\n\n'));
  parts.push(Buffer.from([GS, 0x56, 0x42, 0x00]));
  return Buffer.concat(parts);
}

// ── Station grouping ──────────────────────────────────────────────────────────
function groupItemsByStation(items) {
  const groups = {};
  for (const item of items) {
    const key = item.kitchen_station || item.kitchenStation || 'default';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

// ── TCP print ─────────────────────────────────────────────────────────────────
function sendTcp(ip, port, data) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(6000);
    socket.connect(Number(port), ip, () => {
      socket.write(data, () => { socket.destroy(); resolve(); });
    });
    socket.on('error',   err => { socket.destroy(); reject(err); });
    socket.on('timeout', ()  => { socket.destroy(); reject(new Error('TCP timeout')); });
  });
}

// ── Print handler ─────────────────────────────────────────────────────────────
async function handlePrintEvent({ order, items }) {
  if (!Array.isArray(items) || items.length === 0) return;

  // Always check for updated config (cached for 5 min)
  const printers = await fetchPrinters();
  if (!printers || printers.length === 0) {
    console.warn('[print-agent] No printers configured — skipping print job.');
    return;
  }

  const groups = groupItemsByStation(items);

  for (const [station, stationItems] of Object.entries(groups)) {
    const printer =
      printers.find(p =>
        Array.isArray(p.stations) &&
        p.stations.some(s => s.toLowerCase() === station.toLowerCase())
      ) ||
      (station === 'default'
        ? printers.find(p => !p.stations || p.stations.length === 0) || printers[0]
        : null);

    if (!printer || !printer.ip) {
      console.log(`[print-agent] No printer assigned to station "${station}" — skipping.`);
      continue;
    }

    try {
      const ticket = buildKitchenTicket({
        order,
        items:        stationItems,
        stationLabel: station !== 'default' ? station : (printer.name || 'Kitchen'),
      });
      await sendTcp(printer.ip, printer.port || 9100, ticket);
      console.log(`[print-agent] Printed ${stationItems.length} item(s) → ${printer.name} (${printer.ip}) [${station}]`);
    } catch (err) {
      console.error(`[print-agent] Print failed → ${printer.ip}:`, err.message);
    }
  }
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
let reconnectTimer = null;

function connect() {
  const wsUrl = `${backendUrl.replace(/^https/, 'wss').replace(/^http/, 'ws')}/ws?token=${authToken}`;
  console.log('[print-agent] Connecting to WebSocket...');

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('[print-agent] Connected — waiting for orders...');
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    // Pre-fetch printer config right after connect so first order is instant
    fetchPrinters(true).catch(() => {});
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'kitchen_print') {
        const num = msg.order?.daily_number || '?';
        console.log(`[print-agent] Order #${num} received — ${msg.items?.length || 0} item(s)`);
        handlePrintEvent(msg).catch(err => console.error('[print-agent] Error:', err.message));
      }
    } catch (_) {}
  });

  ws.on('close', (code) => {
    if (code === 4001) {
      console.error('[print-agent] Auth rejected. Check your login credentials in config.json.');
      return;
    }
    console.log(`[print-agent] Disconnected (${code}). Reconnecting in 5s...`);
    reconnectTimer = setTimeout(connect, 5000);
  });

  ws.on('error', err => console.error('[print-agent] WS error:', err.message));

  // Keep-alive ping every 25s
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 25_000);
  ws.on('close', () => clearInterval(ping));
}

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  console.log('');
  console.log('  The Bill — Kitchen Print Agent');
  console.log('  ================================');
  console.log(`  Backend : ${backendUrl}`);
  console.log('  Printers: loaded from restaurant settings (Settings -> Printers)');
  console.log('');

  try {
    await login();
    await fetchPrinters(true);
    connect();
  } catch (err) {
    console.error('[print-agent] Startup failed:', err.message);
    process.exit(1);
  }
}

start();
