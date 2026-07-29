'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// pos-app kitchen print engine — Electron MAIN process only (needs raw `net`
// sockets, not available in the sandboxed renderer). Required by main.js and
// exposed to the renderer via the `print:kitchenTicket` IPC handler.
//
// This is the "LAN terminal → LAN printer" half of the printing architecture
// (see RULES.md §4 and STATUS.md/SESSIONS.md for the full plan): when a
// pos-app terminal (Cashier or Admin) creates an order, adds items, or saves
// an edit, IT prints the kitchen ticket itself, directly, over the local
// network — no cloud relay involved. The website and the phone app
// (RestaurantApp) still use the OLD path (backend WebSocket broadcast →
// print-agent), which is deliberately untouched — see orders.js's
// `client_prints_locally` flag, which is what tells the backend to skip its
// own broadcast/print-attempt for pos-app's own requests so tickets don't
// print twice.
//
// Ticket format and station-routing logic are a deliberate port of
// restaurant-app/backend/src/utils/kitchenPrint.js — NOT a redesign — so a
// ticket printed by pos-app looks identical to one printed by the old system.
// Do not "improve" the format here without also updating kitchenPrint.js, or
// the two will drift apart.
//
// Unlike the backend's version, which is pure fire-and-forget (logs a
// console.warn and moves on — acceptable there since it was always just a
// backup attempt), THIS is now the primary print path for pos-app orders, so
// failures are surfaced back to the caller instead of being silently
// swallowed — see the `failed` array in printKitchenTicket()'s return value.
// Callers (the screens wiring this in) should show a visible warning if any
// entry appears there, so kitchen staff don't silently miss a ticket.
// ─────────────────────────────────────────────────────────────────────────────

const net = require('net');

// ── ESC/POS byte constants (identical to kitchenPrint.js) ────────────────────
const ESC = '\x1b';
const GS  = '\x1d';
const CMD = {
  INIT:     ESC + '@',
  CENTER:   ESC + 'a\x01',
  LEFT:     ESC + 'a\x00',
  BOLD_ON:  ESC + 'E\x01',
  BOLD_OFF: ESC + 'E\x00',
  DBL_ON:   ESC + '!\x30',   // double height + double width
  NORMAL:   ESC + '!\x00',
  FEED: (n) => ESC + 'd' + String.fromCharCode(n),
  CUT:      GS  + 'V\x41\x05',
};
const WIDTH = 48; // 80mm paper = 48 chars

const sep = () => '='.repeat(WIDTH) + '\n';

// Right-align amount with spaces: "Osh Kabob           2 dona"
function spaceFill(name, amountStr) {
  const spaces = Math.max(2, WIDTH - name.length - amountStr.length);
  return name + ' '.repeat(spaces) + amountStr;
}

// ── Build ESC/POS kitchen ticket — port of kitchenPrint.js's buildKitchenTicket ──
// `order`/`items` here are already camelCase (renderer convention, see
// lib/case.js) — this differs from the backend's snake_case version, since
// there's no REST/PowerSync boundary translation needed for data that never
// left the renderer's own already-camelized state.
function buildKitchenTicket({ order, items, stationLabel, show }) {
  const s = {
    tableName:    show?.tableName    !== false,
    orderNumber:  show?.orderNumber  !== false,
    customerName: show?.customerName !== false,
    orderType:    show?.orderType    !== false,
  };

  const isToGo = order.orderType === 'to_go' || order.orderType === 'takeaway';
  const isDeli = order.orderType === 'delivery';

  let d = '';
  d += CMD.INIT;

  // 1. Station header — double-height + double-width + bold, centered
  d += CMD.CENTER;
  d += CMD.DBL_ON;
  d += CMD.BOLD_ON;
  d += (stationLabel || 'KITCHEN') + '\n';
  d += CMD.NORMAL;
  d += CMD.BOLD_OFF;

  // 2. Table name — bold, centered (dine-in only)
  if (s.tableName && !isToGo && !isDeli && order.tableName) {
    d += CMD.CENTER;
    d += CMD.BOLD_ON;
    d += order.tableName + '\n';
    d += CMD.BOLD_OFF;
  }

  // 3. Order number + date + time
  const now  = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh   = String(now.getHours()).padStart(2, '0');
  const min  = String(now.getMinutes()).padStart(2, '0');
  const datetimeStr = `${dd}.${mm}.${yyyy}  ${hh}:${min}`;

  d += CMD.CENTER;
  if (s.orderNumber && order.dailyNumber) d += `#${order.dailyNumber}   `;
  d += datetimeStr + '\n';

  // 4. Separator
  d += CMD.LEFT;
  d += sep();

  // 5. Items — double-height + bold, space-padded amount
  for (const item of items) {
    const qty       = item.quantity || 1;
    const name      = String(item.name || '—');
    const unit      = item.unit || 'piece';
    const amountStr = `${qty} ${unit}`;

    const maxNameLen = WIDTH - amountStr.length - 2;
    const safeName   = name.length > maxNameLen ? name.slice(0, maxNameLen) : name;

    d += CMD.BOLD_ON;
    d += ESC + '!\x18'; // double-height + bold
    d += spaceFill(safeName, amountStr) + '\n';
    d += CMD.NORMAL;
    d += CMD.BOLD_OFF;

    if (item.notes) d += `  * ${item.notes}\n`;
  }

  // 6. Separator
  d += sep();

  // 7. Order type — double-height + bold, centered
  if (s.orderType) {
    const typeLabel = isDeli ? 'DELIVERY' : isToGo ? 'TO GO' : 'DINE IN';
    d += CMD.CENTER;
    d += ESC + '!\x18';
    d += typeLabel + '\n';
    d += CMD.NORMAL;
  }

  // 8. Delivery details
  if (isDeli) {
    d += CMD.LEFT;
    if (s.customerName && order.customerName) {
      d += CMD.BOLD_ON + order.customerName + '\n' + CMD.BOLD_OFF;
    }
    if (order.customerPhone) {
      d += ESC + '!\x10'; // double-height
      d += order.customerPhone + '\n';
      d += CMD.NORMAL;
    }
    if (order.deliveryAddress) d += order.deliveryAddress + '\n';
  }

  d += CMD.FEED(4);
  d += CMD.CUT;
  return d;
}

// ── Send raw ESC/POS string to a TCP thermal printer ─────────────────────────
function sendToPrinter(ip, port, escposStr) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const buf    = Buffer.from(escposStr, 'binary');
    let done     = false;
    const finish = (err) => { if (!done) { done = true; client.destroy(); err ? reject(err) : resolve(); } };

    client.setTimeout(5000);
    client.connect(Number(port) || 9100, ip, () => {
      client.write(buf, 'binary', (err) => { if (err) return finish(err); finish(null); });
    });
    client.on('timeout', () => finish(new Error('Printer connection timed out')));
    client.on('error',   (err) => finish(err));
  });
}

// ── Station routing — port of kitchenPrint.js's grouping logic ──────────────
// A printer with an empty `stations` array is a catch-all and receives every
// item (and if there are several catch-all printers, each gets a full copy —
// this matches the backend's existing behavior exactly, not a new choice).
// An item whose station matches no assigned printer falls back to any
// catch-all printer, same as today.
function buildPrintJobs(printers, items) {
  return printers
    .filter((p) => p && p.ip)
    .map((printer) => {
      const assignedStations = Array.isArray(printer.stations) ? printer.stations : [];
      const catchAll = assignedStations.length === 0;
      const printerItems = items.filter((item) => {
        if (catchAll) return true;
        const station = (item.kitchenStation || '').trim();
        if (!station) return true;
        return assignedStations.some((st) => st.toLowerCase() === station.toLowerCase());
      });
      return { printer, printerItems };
    })
    .filter((job) => job.printerItems.length > 0);
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * printKitchenTicket
 * @param {object} opts
 * @param {object} opts.order  - { dailyNumber, tableName, orderType, customerName, customerPhone, deliveryAddress }
 * @param {Array}  opts.items  - [{ name, quantity, unit, notes, kitchenStation }]
 * @param {Array}  opts.printers - restaurant_settings.kitchen_printers, camelized (each: { name, ip, port, stations })
 * @param {object} opts.show   - restaurant_settings' kitchen_show_* flags, camelized
 *
 * Never throws. Returns:
 *   { ok: true,  printed: ['Kitchen (192.168.1.50)', ...], failed: [] }
 *   { ok: true,  printed: [], failed: [{ printer: 'Grill', ip, error }] }
 *   { ok: false, error: 'No kitchen printers configured' }  — nothing to do, not a failure
 */
async function printKitchenTicket({ order, items, printers, show }) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'No items to print' };
  }
  if (!Array.isArray(printers) || printers.length === 0) {
    return { ok: false, error: 'No kitchen printers configured' };
  }

  const jobs = buildPrintJobs(printers, items);
  if (jobs.length === 0) {
    return { ok: false, error: 'No printer assigned to any of these items\' stations' };
  }

  const printed = [];
  const failed  = [];

  await Promise.allSettled(jobs.map(async ({ printer, printerItems }) => {
    const stationLabel = Array.isArray(printer.stations) && printer.stations.length > 0
      ? printer.stations.join(' / ')
      : (printer.name || 'KITCHEN');

    const ticket = buildKitchenTicket({ order, items: printerItems, stationLabel, show });
    const label  = `${printer.name || 'Printer'} (${printer.ip})`;

    try {
      await sendToPrinter(printer.ip, printer.port || 9100, ticket);
      printed.push(label);
    } catch (err) {
      failed.push({ printer: printer.name || printer.ip, ip: printer.ip, error: err.message });
    }
  }));

  return { ok: true, printed, failed };
}

module.exports = { printKitchenTicket, buildKitchenTicket, buildPrintJobs };
