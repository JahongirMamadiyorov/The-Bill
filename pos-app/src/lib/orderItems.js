// ─────────────────────────────────────────────────────────────────────────────
// Order-item line merging. Added 2026-08-09.
//
// WHY THIS EXISTS — from real customer video evidence:
// Restaurants reported that an order showed the same product several times.
// Order #2 / Karvat 17 rendered as EIGHT lines on the cashier panel
// (`Choy ×1`, `Choy ×1`, `Qiyma Shashlik ×1`, `Choy ×2`, `Choy ×1`, `Choy ×1`,
// `Qaynatma Sho'rva 0.5 ×8`, `Zog'ara baliq kilo 2.027 kg`) and SIX on the
// printed receipt — with `Choy` repeated on both.
//
// The cause is not corruption: `order_items` genuinely holds one ROW per add
// action. A waiter adding tea four separate times creates four rows, and
// `POST /orders/:id/items` appends rather than merging. Every read then renders
// those rows verbatim, so one drink spreads across several lines.
//
// Merging is done at DISPLAY time, deliberately, rather than by rewriting rows:
// the separate rows carry real history (each has its own created_at, and the
// kitchen was fired per add), so collapsing them in the database would destroy
// information the kitchen-print delta logic depends on.
//
// WHAT IS NOT MERGED — rows are only combined when they are genuinely the same
// sale line. Differing notes ("no onion"), a custom price, or a free item must
// stay on their own line, or the cashier loses the distinction and the customer
// gets a receipt that doesn't match what was agreed.
// ─────────────────────────────────────────────────────────────────────────────

// Rows sharing this signature represent the same thing sold at the same price
// under the same conditions, and can safely appear as one line.
//
// ── CRITICAL: this must handle BOTH shapes the app uses ─────────────────────
// A cart entry is `{ item: <menu_items row>, qty }` — the id and price live on
// the NESTED `item`, not on the wrapper. Reading them off the wrapper returns
// undefined for every entry, which gives every line an identical key and merges
// the ENTIRE CART into one line: three different dishes printed as "Osh x6".
// That shipped on 2026-08-09 and put wrong items on customers' receipts.
// Unwrap first, exactly as normaliseItems() in receipt.js does.
function lineKey(row) {
  const src = row?.item ? row.item : row;
  const id  = src?.menuItemId ?? src?.menu_item_id ?? src?.id ?? null;

  // No identifiable product => never merge. Returning a unique key keeps such a
  // row on its own line, which is always safe; a shared fallback key is what
  // caused the bug above.
  if (id == null || id === '') return `__nomerge__${Math.random()}`;

  return [
    id,
    Number(src?.unitPrice ?? src?.unit_price ?? src?.price ?? 0),
    (src?.notes ?? row?.notes ?? '').trim(),
    (src?.isFree ?? src?.is_free) ? '1' : '0',
    src?.customPrice ?? src?.custom_price ?? '',
  ].join('|');
}

/**
 * mergeOrderItems — collapses repeated rows into one line with a summed
 * quantity, preserving first-seen order (which is stable now that every read
 * sorts by created_at — see the 2026-08-02 ordering fix).
 *
 * Accepts either camelCase local/PowerSync rows or snake_case REST rows, and
 * returns objects of the SAME shape it was given, with only the quantity
 * changed — so call sites can drop it in without touching their own field
 * access.
 */
export function mergeOrderItems(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return Array.isArray(rows) ? rows : [];

  const byKey = new Map();
  const out   = [];

  for (const row of rows) {
    const key = lineKey(row);
    const hit = byKey.get(key);
    const qty = Number(row.quantity ?? row.qty ?? 1) || 1;

    if (!hit) {
      // Clone so the caller's source array (often React state) is never mutated.
      const copy = { ...row };
      byKey.set(key, copy);
      out.push(copy);
    } else if ('quantity' in hit) {
      hit.quantity = (Number(hit.quantity) || 0) + qty;
    } else {
      hit.qty = (Number(hit.qty) || 0) + qty;
    }
  }

  return out;
}
