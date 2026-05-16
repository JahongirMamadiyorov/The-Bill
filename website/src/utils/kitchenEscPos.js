/**
 * kitchenEscPos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser-safe ESC/POS kitchen ticket builder.
 * Returns a Uint8Array that you can base64-encode and POST to /print-tcp.
 *
 * Usage:
 *   import { buildKitchenTicket, groupItemsByStation } from '../utils/kitchenEscPos';
 *   const ticket = buildKitchenTicket({ order, items, stationLabel: 'Grill' });
 *   const base64 = uint8ToBase64(ticket);
 */

// ── ESC/POS control constants ─────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a; // eslint-disable-line no-unused-vars

// ── Layout (80 mm paper = 48 chars) ──────────────────────────────────────────
const LINE_WIDTH   = 48;
const SEP          = '='.repeat(LINE_WIDTH);
const ALIGN_LEFT   = new Uint8Array([ESC, 0x61, 0x00]);
const ALIGN_CENTER = new Uint8Array([ESC, 0x61, 0x01]);

// ── Helpers ───────────────────────────────────────────────────────────────────
function encode(str) {
  return new TextEncoder().encode(str);
}

function concat(...arrays) {
  const total  = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let offset   = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/** Convert Uint8Array → base64 string (safe for large arrays — no spread). */
export function uint8ToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── Ticket builder ────────────────────────────────────────────────────────────

/**
 * Build an ESC/POS kitchen ticket.
 *
 * @param {object} params
 * @param {object} params.order        - { daily_number, table_number, order_type, notes, customer_name }
 * @param {Array}  params.items        - [{ name, item_name, quantity, notes, kitchen_station }]
 * @param {string} [params.stationLabel] - Station name shown at top (e.g. 'GRILL'). Defaults to 'KITCHEN'.
 * @returns {Uint8Array}
 */
function dashFill(name, amountStr) {
  const dashes = Math.max(2, LINE_WIDTH - name.length - amountStr.length);
  return name + '-'.repeat(dashes) + amountStr;
}

export function buildKitchenTicket({ order, items, stationLabel }) {
  const station = stationLabel ? stationLabel.toUpperCase() : 'KITCHEN';
  const isToGo  = order.order_type === 'to_go'   || order.order_type === 'takeaway';
  const isDeli  = order.order_type === 'delivery';

  const parts = [];

  // Init + code page
  parts.push(new Uint8Array([ESC, 0x40]));
  parts.push(new Uint8Array([ESC, 0x74, 0x00]));

  // ── 1. Kitchen station — big, centered ───────────────────────────────────
  parts.push(ALIGN_CENTER);
  parts.push(new Uint8Array([ESC, 0x21, 0x38])); // double-height + double-width + bold
  parts.push(encode(`${station}\n`));
  parts.push(new Uint8Array([ESC, 0x21, 0x00]));

  // ── 2. Table name — centered (dine-in only) ───────────────────────────────
  if (!isToGo && !isDeli) {
    const tableLabel = order.table_name || (order.table_number ? `Table ${order.table_number}` : 'Walk-in');
    parts.push(ALIGN_CENTER);
    parts.push(new Uint8Array([ESC, 0x21, 0x08])); // bold
    parts.push(encode(`${tableLabel}\n`));
    parts.push(new Uint8Array([ESC, 0x21, 0x00]));
  }

  // ── 3. Order number + time — centered ─────────────────────────────────────
  const time     = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const orderNum = order.daily_number ? `#${order.daily_number}` : '';
  parts.push(ALIGN_CENTER);
  parts.push(encode(`${orderNum}  ${time}\n`));

  // ── 4. Separator ──────────────────────────────────────────────────────────
  parts.push(ALIGN_LEFT);
  parts.push(encode(`${SEP}\n`));

  // ── 5. Items: Name-----------qty unit ─────────────────────────────────────
  for (const item of items) {
    const name      = item.name || item.item_name || 'Item';
    const qty       = item.quantity || 1;
    const unit      = item.unit || 'piece';
    const amountStr = `${qty} ${unit}`;

    const maxNameLen = LINE_WIDTH - amountStr.length - 2;
    const safeName   = name.length > maxNameLen ? name.slice(0, maxNameLen) : name;

    parts.push(new Uint8Array([ESC, 0x21, 0x08])); // bold
    parts.push(encode(dashFill(safeName, amountStr) + '\n'));
    parts.push(new Uint8Array([ESC, 0x21, 0x00]));

    if (item.notes) {
      parts.push(encode(`  * ${item.notes}\n`));
    }
  }

  // ── 6. Separator ──────────────────────────────────────────────────────────
  parts.push(encode(`${SEP}\n`));

  // ── 7. Order type ─────────────────────────────────────────────────────────
  const typeLabel = isDeli ? 'Delivery' : isToGo ? 'To Go' : 'Dine In';
  parts.push(new Uint8Array([ESC, 0x21, 0x08])); // bold
  parts.push(encode(`${typeLabel}\n`));
  parts.push(new Uint8Array([ESC, 0x21, 0x00]));

  // ── 8. Delivery details ───────────────────────────────────────────────────
  if (isDeli) {
    if (order.customer_name)    parts.push(encode(`${order.customer_name}\n`));
    if (order.customer_phone)   parts.push(encode(`${order.customer_phone}\n`));
    if (order.delivery_address) parts.push(encode(`${order.delivery_address}\n`));
  }

  // ── 9. Notes / comment ────────────────────────────────────────────────────
  if (order.notes) {
    parts.push(encode(`* ${order.notes}\n`));
  }

  // Feed + cut
  parts.push(encode('\n\n\n'));
  parts.push(new Uint8Array([GS, 0x56, 0x42, 0x00]));

  return concat(...parts);
}

// ── Station grouping ──────────────────────────────────────────────────────────

/**
 * Group an items array by kitchen_station.
 * Items with no station go into the 'default' bucket.
 *
 * @param {Array} items
 * @returns {Object} { [stationName]: items[] }
 */
export function groupItemsByStation(items) {
  const groups = {};
  for (const item of items) {
    const key = (item.kitchen_station || item.kitchenStation || 'default');
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}
