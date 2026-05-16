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

// Right-align amount with spaces: "Osh Kabob           2 dona"
function spaceFill(name, amountStr) {
  const spaces = Math.max(2, LINE_WIDTH - name.length - amountStr.length);
  return name + ' '.repeat(spaces) + amountStr;
}

/**
 * Build an ESC/POS kitchen ticket.
 *
 * ESC ! bitmask reference:
 *   0x08 = bold
 *   0x10 = double-height  (character width stays the same — still 48 chars/line)
 *   0x18 = double-height + bold
 *   0x38 = double-height + double-width + bold  (station header only)
 *
 * @param {object} params
 * @param {object} params.order        - { daily_number, table_number, table_name, order_type, notes, customer_name, customer_phone, delivery_address }
 * @param {Array}  params.items        - [{ name, item_name, quantity, unit, notes, kitchen_station }]
 * @param {string} [params.stationLabel] - Station name shown at top (e.g. 'GRILL'). Defaults to 'KITCHEN'.
 * @returns {Uint8Array}
 */
export function buildKitchenTicket({ order, items, stationLabel }) {
  const station = stationLabel ? stationLabel.toUpperCase() : 'KITCHEN';
  const isToGo  = order.order_type === 'to_go'   || order.order_type === 'takeaway';
  const isDeli  = order.order_type === 'delivery';

  const parts = [];

  // Init + code page
  parts.push(new Uint8Array([ESC, 0x40]));
  parts.push(new Uint8Array([ESC, 0x74, 0x00]));

  // ── 1. Station header — double-height + double-width + bold, centered ────
  parts.push(ALIGN_CENTER);
  parts.push(new Uint8Array([ESC, 0x21, 0x38]));
  parts.push(encode(`${station}\n`));
  parts.push(new Uint8Array([ESC, 0x21, 0x00]));

  // ── 2. Table name — bold, centered (dine-in only) ─────────────────────────
  if (!isToGo && !isDeli) {
    const tableLabel = order.table_name || (order.table_number ? `Table ${order.table_number}` : 'Walk-in');
    parts.push(ALIGN_CENTER);
    parts.push(new Uint8Array([ESC, 0x21, 0x08]));
    parts.push(encode(`${tableLabel}\n`));
    parts.push(new Uint8Array([ESC, 0x21, 0x00]));
  }

  // ── 3. Order number + date + time — centered ──────────────────────────────
  const now  = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh   = String(now.getHours()).padStart(2, '0');
  const min  = String(now.getMinutes()).padStart(2, '0');

  const orderNum    = order.daily_number ? `#${order.daily_number}` : '';
  const datetimeStr = `${dd}.${mm}.${yyyy}  ${hh}:${min}`;
  parts.push(ALIGN_CENTER);
  parts.push(encode(`${orderNum}   ${datetimeStr}\n`));

  // ── 4. Separator ──────────────────────────────────────────────────────────
  parts.push(ALIGN_LEFT);
  parts.push(encode(`${SEP}\n`));

  // ── 5. Items — double-height + bold, space-padded amount ──────────────────
  for (const item of items) {
    const name      = item.name || item.item_name || 'Item';
    const qty       = item.quantity || 1;
    const unit      = item.unit || 'piece';
    const amountStr = `${qty} ${unit}`;

    const maxNameLen = LINE_WIDTH - amountStr.length - 2;
    const safeName   = name.length > maxNameLen ? name.slice(0, maxNameLen) : name;

    parts.push(new Uint8Array([ESC, 0x21, 0x18])); // double-height + bold
    parts.push(encode(spaceFill(safeName, amountStr) + '\n'));
    parts.push(new Uint8Array([ESC, 0x21, 0x00]));

    if (item.notes) {
      parts.push(encode(`  * ${item.notes}\n`));
    }
  }

  // ── 6. Separator ──────────────────────────────────────────────────────────
  parts.push(encode(`${SEP}\n`));

  // ── 7. Order type — double-height + bold, centered ────────────────────────
  const typeLabel = isDeli ? 'DELIVERY' : isToGo ? 'TO GO' : 'DINE IN';
  parts.push(ALIGN_CENTER);
  parts.push(new Uint8Array([ESC, 0x21, 0x18])); // double-height + bold
  parts.push(encode(`${typeLabel}\n`));
  parts.push(new Uint8Array([ESC, 0x21, 0x00]));

  // ── 8. Delivery details ───────────────────────────────────────────────────
  if (isDeli) {
    if (order.customer_name) {
      parts.push(new Uint8Array([ESC, 0x21, 0x08])); // bold
      parts.push(encode(`${order.customer_name}\n`));
      parts.push(new Uint8Array([ESC, 0x21, 0x00]));
    }
    if (order.customer_phone) {
      parts.push(new Uint8Array([ESC, 0x21, 0x10])); // double-height
      parts.push(encode(`${order.customer_phone}\n`));
      parts.push(new Uint8Array([ESC, 0x21, 0x00]));
    }
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
