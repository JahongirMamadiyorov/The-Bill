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
// Returns ONE JOB PER STATION, not one per printer (changed 2026-08-02).
//
// Previously this emitted a single job per printer, so a printer assigned five
// stations produced ONE combined ticket headed "Salad / Hot / Tandir / ..." with
// every dish on it. The kitchen needs a separate slip per station even when they
// all come off the same physical printer — the salad station shouldn't have to
// read past the grill's items to find its own. Each job is a self-contained
// ESC/POS document ending in a cut, so one job = one piece of paper.
//
// Items with no kitchenStation set are grouped together under the printer's own
// name, matching the previous catch-all behaviour rather than dropping them.
function buildPrintJobs(printers, items) {
  const jobs = [];

  for (const printer of printers.filter((p) => p && p.ip)) {
    const assignedStations = Array.isArray(printer.stations) ? printer.stations : [];
    const catchAll = assignedStations.length === 0;

    const printerItems = items.filter((item) => {
      if (catchAll) return true;
      const station = (item.kitchenStation || '').trim();
      if (!station) return true;
      return assignedStations.some((st) => st.toLowerCase() === station.toLowerCase());
    });
    if (printerItems.length === 0) continue;

    // Group this printer's items by station, preserving first-seen order so the
    // slips come out in a stable sequence. Keyed case-insensitively (station
    // names are free text and "Hot"/"hot" must not become two slips), but the
    // ORIGINAL casing is kept for the printed label.
    const groups = new Map();
    for (const item of printerItems) {
      const station = (item.kitchenStation || '').trim();
      const key = station.toLowerCase();
      if (!groups.has(key)) groups.set(key, { station, items: [] });
      groups.get(key).items.push(item);
    }

    for (const { station, items: stationItems } of groups.values()) {
      jobs.push({
        printer,
        printerItems: stationItems,
        stationLabel: station || printer.name || 'KITCHEN',
      });
    }
  }

  return jobs;
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

  // Jobs are grouped by PRINTER and each printer's slips sent STRICTLY IN
  // SEQUENCE. A station split means one printer can now receive several
  // documents for a single order; firing those concurrently at the same socket
  // interleaves the byte streams and produces garbled slips. Different printers
  // still run in parallel, since they're independent devices.
  const byPrinter = new Map();
  for (const job of jobs) {
    const key = `${job.printer.ip}:${job.printer.port || 9100}`;
    if (!byPrinter.has(key)) byPrinter.set(key, []);
    byPrinter.get(key).push(job);
  }

  await Promise.allSettled([...byPrinter.values()].map(async (printerJobs) => {
    for (const { printer, printerItems, stationLabel } of printerJobs) {
      const ticket = buildKitchenTicket({ order, items: printerItems, stationLabel, show });
      const label  = `${printer.name || 'Printer'} (${printer.ip}) — ${stationLabel}`;

      try {
        await sendToPrinter(printer.ip, printer.port || 9100, ticket);
        printed.push(label);
      } catch (err) {
        failed.push({
          printer: printer.name || printer.ip,
          ip: printer.ip,
          station: stationLabel,
          error: err.message,
        });
        // Keep going: one station's slip failing shouldn't cost the others.
      }
    }
  }));

  return { ok: true, printed, failed };
}

// ═════════════════════════════════════════════════════════════════════════════
// CUSTOMER RECEIPT (cheque) — added 2026-08-02
//
// Deliberate port of restaurant-app/backend/src/routes/print.js's buildEscPos(),
// NOT a redesign, for the same reason the kitchen ticket above ports
// kitchenPrint.js: a receipt printed by pos-app must look identical to one
// printed by the website. If you change the layout here, change it there too.
//
// The one intentional difference is WHERE it runs. The website posts receipt
// data to `POST /api/print/receipt` and the BACKEND opens the socket — meaning
// every receipt round-trips through Render before reaching a printer sitting a
// few metres from the till. Here the terminal formats and sends it itself over
// the LAN, same as the kitchen ticket, per RULES.md §4. The backend route is
// left untouched and still serves the website.
// ═════════════════════════════════════════════════════════════════════════════

// Receipt uses double-HEIGHT only (ESC ! 0x10), unlike the kitchen ticket's
// DBL_ON which is double height AND width (0x30). Keeping them separate is
// deliberate — matching each source format exactly.
const R_DOUBLE_ON = ESC + '!\x10';

const rDashes = () => '-'.repeat(WIDTH) + '\n';

// Left-align within `len`, truncating anything longer.
const pad = (str, len) => {
  const s = String(str || '').substring(0, len);
  return s + ' '.repeat(Math.max(0, len - s.length));
};

// Right-align within `len`.
const rpad = (str, len) => {
  const s = String(str || '').substring(0, len);
  return ' '.repeat(Math.max(0, len - s.length)) + s;
};

/**
 * buildReceipt — ESC/POS customer receipt.
 *
 * `r` shape (all money values are ALREADY FORMATTED STRINGS — the caller does
 * currency formatting so every call site produces identical output; see
 * src/lib/receipt.js):
 *   { restaurantName, headerText, orderNum, tableName, dateTime,
 *     items: [{ name, qty, unit, total }],
 *     subtotal, taxRate, tax, serviceRate, service,
 *     discountReason, discount, total, method, change, footer,
 *     show: { logo, orderNumber, tableName, tax, serviceCharge, footer } }
 *
 * Every `show` flag defaults to TRUE when absent — same as the backend, so a
 * missing settings row prints a full receipt rather than an empty one.
 */
function buildReceipt(r) {
  const show = {
    logo:          r.show?.logo          !== false,
    orderNumber:   r.show?.orderNumber   !== false,
    tableName:     r.show?.tableName     !== false,
    tax:           r.show?.tax           !== false,
    serviceCharge: r.show?.serviceCharge !== false,
    footer:        r.show?.footer        !== false,
  };

  let d = CMD.INIT;

  // Restaurant name — large, bold, centered.
  if (show.logo) {
    d += CMD.CENTER + CMD.BOLD_ON + R_DOUBLE_ON;
    d += (r.restaurantName || 'Restaurant') + '\n';
    d += CMD.NORMAL + CMD.BOLD_OFF;
  }

  // Optional tagline (restaurant_settings.receipt_header).
  if (r.headerText) d += CMD.CENTER + r.headerText + '\n';

  // Order number / table / timestamp.
  d += CMD.CENTER + CMD.BOLD_ON;
  const metaLine = [
    show.orderNumber && r.orderNum  ? r.orderNum  : '',
    show.tableName   && r.tableName ? r.tableName : '',
  ].filter(Boolean).join('  ');
  if (metaLine) d += metaLine + '\n';
  d += (r.dateTime || '') + '\n';
  d += CMD.BOLD_OFF + CMD.LEFT + rDashes();

  // Items. Weighed units (kg/l/g/ml) print as "2.5 kg"; everything else "x3".
  // Long names wrap to their own line with the qty/price right-aligned below.
  if (Array.isArray(r.items)) {
    r.items.forEach((item) => {
      const name    = String(item.name || '—');
      const rawQty  = parseFloat(item.qty ?? item.quantity) || 1;
      const u       = String(item.unit || 'piece').toLowerCase();
      const weighed = u === 'kg' || u === 'l' || u === 'g' || u === 'ml';
      const qtyStr  = Number.isInteger(rawQty) ? String(rawQty) : parseFloat(rawQty.toFixed(3)).toString();
      const qty     = weighed ? `${qtyStr} ${u}` : `x${qtyStr}`;
      const price   = String(item.total || item.price || '');

      if (name.length <= WIDTH - qty.length - price.length - 2) {
        d += pad(name, WIDTH - qty.length - price.length - 1) + qty + ' ' + rpad(price, price.length) + '\n';
      } else {
        d += name.substring(0, WIDTH) + '\n';
        d += pad('', WIDTH - qty.length - price.length - 1) + qty + ' ' + rpad(price, price.length) + '\n';
      }
    });
  }

  d += rDashes();

  // Labels come from the renderer already translated (src/lib/receipt.js
  // buildLabels) — this process has no i18n dictionary. English defaults keep
  // an older/partial payload printing sensibly rather than blank.
  const L = r.labels || {};

  // Subtotal only shown when it differs from the total (i.e. something was added).
  if (r.subtotal && r.subtotal !== r.total) {
    d += pad(L.subtotal || 'Subtotal', WIDTH - String(r.subtotal).length) + r.subtotal + '\n';
  }
  if (show.tax && r.tax) {
    d += pad(`${L.tax || 'Tax'} (${r.taxRate || ''}%)`, WIDTH - String(r.tax).length) + r.tax + '\n';
  }
  if (show.serviceCharge && r.service) {
    d += pad(`${L.service || 'Service'} (${r.serviceRate || ''}%)`, WIDTH - String(r.service).length) + r.service + '\n';
  }
  if (r.discount) {
    d += pad(`${L.discount || 'Discount'}${r.discountReason ? ' (' + r.discountReason + ')' : ''}`,
             WIDTH - String(r.discount).length) + r.discount + '\n';
  }

  // TOTAL — bold, double height.
  d += rDashes() + CMD.BOLD_ON + R_DOUBLE_ON;
  d += pad(L.total || 'TOTAL', WIDTH - String(r.total || '').length) + (r.total || '') + '\n';
  d += CMD.NORMAL + CMD.BOLD_OFF + rDashes();

  // Payment method and change.
  d += CMD.BOLD_ON;
  d += pad(L.method || 'Method', WIDTH - String(r.method || '').length) + (r.method || '') + '\n';
  if (r.change && r.change !== '0') {
    d += pad(L.change || 'Change', WIDTH - String(r.change).length) + r.change + '\n';
  }
  d += CMD.BOLD_OFF;

  if (show.footer) {
    d += rDashes() + CMD.CENTER + CMD.BOLD_ON;
    d += (r.footer || 'Thank you for dining with us!') + '\n';
    d += CMD.BOLD_OFF;
  }

  return d + CMD.FEED(4) + CMD.CUT;
}

/**
 * printReceipt — sends a receipt to the FIRST configured receipt printer.
 *
 * Only the first, by explicit decision (2026-08-02): a till has one receipt
 * printer, unlike kitchen printers which fan out by station. If multi-printer
 * receipts are ever wanted, this is the single place to change.
 *
 * Never throws — mirrors printKitchenTicket's contract exactly so call sites
 * can treat both the same way:
 *   { ok: true,  printed: ['Kassa (192.168.1.60)'], failed: [] }
 *   { ok: true,  printed: [], failed: [{ printer, ip, error }] }
 *   { ok: false, error: 'No receipt printers configured' }  — nothing to do
 *
 * The `ok: false` case is deliberately NOT a failure: callers stay silent for
 * it (nothing is configured, so nothing is expected) and warn only when
 * `failed` is non-empty, i.e. a real printer was configured and didn't answer.
 */
async function printReceipt({ receipt, printers }) {
  if (!receipt) return { ok: false, error: 'No receipt data' };

  const configured = (Array.isArray(printers) ? printers : []).filter((p) => p && p.ip);
  if (configured.length === 0) return { ok: false, error: 'No receipt printers configured' };

  const printer = configured[0];
  const label   = `${printer.name || 'Printer'} (${printer.ip})`;

  try {
    await sendToPrinter(printer.ip, printer.port || 9100, buildReceipt(receipt));
    return { ok: true, printed: [label], failed: [] };
  } catch (err) {
    return {
      ok: true,
      printed: [],
      failed: [{ printer: printer.name || printer.ip, ip: printer.ip, error: err.message }],
    };
  }
}

module.exports = {
  printKitchenTicket, buildKitchenTicket, buildPrintJobs,
  printReceipt, buildReceipt,
};
