// This file is bundled by Vite for the renderer (ES modules), unlike main.js
// which is CommonJS — do not add `require`/`module.exports` here.
//
// Local PowerSync SQLite rows come back with the exact Postgres column names
// (snake_case) and booleans stored as 0/1 integers — there is no camelCase
// translation layer for local reads the way the website's axios interceptor
// (website/src/api/client.js) does it for REST responses. See RULES.md rule 3
// (check for camelCase/snake_case mismatches) — this file is that translation
// layer for pos-app's local PowerSync queries. Any screen reading from
// `window.electronAPI.psGetAll` / `psGet` should camelize the result before
// using it, so component code can stay identical in style to the website's.

const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

// Columns that are booleans in Postgres but arrive as 0/1 integers locally.
// Listed explicitly rather than guessed — 0/1 !== false in JS, so any boolean
// field NOT listed here will silently misbehave in strict-equality checks
// (e.g. `item.isAvailable !== false` would wrongly include unavailable items).
// Cross-check pos-app/powersync/schema.js if a new boolean column is added.
const BOOL_FIELDS = new Set([
  'isActive', 'isAvailable', 'isRead', 'isFree', 'itemReady',
  'taxEnabled', 'serviceChargeEnabled',
  'canCreateOrders', 'canModifyOrders', 'canCancelOrders', 'canDeleteOrderItems',
  'canAddFreeItems', 'canApplyDiscounts', 'canSetCustomPrice', 'canProcessPayments',
  'canSplitBills', 'canIssueRefunds', 'canOpenCloseTable', 'canTransferTable',
  'canMergeTables', 'canSeeOtherTables', 'canSeeSalesNumbers', 'canSeeCustomerHistory',
]);

function camelizeRow(row) {
  if (!row) return row;
  const out = {};
  for (const key of Object.keys(row)) {
    const camelKey = toCamel(key);
    out[camelKey] = BOOL_FIELDS.has(camelKey) ? !!row[key] : row[key];
  }
  return out;
}

function camelizeRows(rows) {
  return Array.isArray(rows) ? rows.map(camelizeRow) : [];
}

export { camelizeRow, camelizeRows };
