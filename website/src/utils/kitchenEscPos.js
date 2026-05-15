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
export function buildKitchenTicket({ order, items, stationLabel }) {
  const station = stationLabel ? stationLabel.toUpperCase() : 'KITCHEN';

  const parts = [];

  // Initialize printer
  parts.push(new Uint8Array([ESC, 0x40]));       // ESC @ — reset
  parts.push(new Uint8Array([ESC, 0x74, 0x00])); // ESC t 0 — PC437 code page

  // Station name — bold + double height + double width
  parts.push(new Uint8Array([ESC, 0x21, 0x38])); // bold + double-height + double-width
  parts.push(encode(`${station}\n`));

  // Back to normal
  parts.push(new Uint8Array([ESC, 0x21, 0x00]));

  // Separator line
  parts.push(encode('================================\n'));

  // Order header line
  const time       = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const orderNum   = order.daily_number ? `#${order.daily_number}` : '';
  const tableLabel = order.order_type === 'to_go'
    ? `To Go${order.customer_name ? ' — ' + order.customer_name : ''}`
    : order.order_type === 'delivery'
    ? `Delivery${order.customer_name ? ' — ' + order.customer_name : ''}`
    : order.table_number
    ? `Table ${order.table_number}`
    : 'Walk-in';

  // Bold for header
  parts.push(new Uint8Array([ESC, 0x21, 0x08]));
  parts.push(encode(`${tableLabel}`));
  if (orderNum) parts.push(encode(`  ${orderNum}`));
  parts.push(encode(`  ${time}\n`));
  parts.push(new Uint8Array([ESC, 0x21, 0x00]));

  parts.push(encode('--------------------------------\n'));

  // Items — each item on its own line
  for (const item of items) {
    const qty  = String(item.quantity || 1).padStart(3, ' ');
    const name = item.name || item.item_name || 'Item';

    // Quantity bold, name normal
    parts.push(new Uint8Array([ESC, 0x21, 0x08]));
    parts.push(encode(`${qty}x `));
    parts.push(new Uint8Array([ESC, 0x21, 0x00]));
    parts.push(encode(`${name}\n`));

    // Item-level note (indented)
    if (item.notes) {
      parts.push(encode(`       * ${item.notes}\n`));
    }
  }

  // Order-level notes
  if (order.notes) {
    parts.push(encode('--------------------------------\n'));
    parts.push(new Uint8Array([ESC, 0x21, 0x08]));
    parts.push(encode('Note: '));
    parts.push(new Uint8Array([ESC, 0x21, 0x00]));
    parts.push(encode(`${order.notes}\n`));
  }

  // Feed lines + full cut
  parts.push(encode('\n\n\n'));
  parts.push(new Uint8Array([GS, 0x56, 0x42, 0x00])); // GS V B 0 — full cut

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
