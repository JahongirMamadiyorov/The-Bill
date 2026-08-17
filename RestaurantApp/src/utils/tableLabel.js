// ─────────────────────────────────────────────────────────────────────────────
// tableLabel — what a table is CALLED, everywhere.
//
// WHY THIS EXISTS (2026-08-17)
// Sixteen places across the waitress and cashier screens wrote some variant of:
//
//     `Table ${table.table_number || table.name}`
//
// which prefers the NUMBER and only falls back to the name. Restaurants name
// their tables — "Xoli 1", "Karavat 3", "VIP" — and that name is what the staff
// say to each other and what the owner set up in Admin. The waiter would tap
// "Xoli 1" and every sheet, modal, toast and notification afterwards called it
// "Table 1" / "Stol 1", which is a different thing entirely to someone working
// the floor.
//
// The table CARD already had this right (its own `displayName`); nothing else
// did. One helper now, so a seventeenth call site cannot get it wrong.
//
// Order is deliberate: real name first, number only as a fallback for tables
// that were created without one, and an em dash rather than an empty string so
// a missing table never renders as a blank gap in a sentence.
// ─────────────────────────────────────────────────────────────────────────────

export function tableLabel(table, t) {
  if (!table) return '—';

  // Accept every shape these screens deal with: local PowerSync rows
  // (snake_case), REST responses (camelCase), and order rows that carry the
  // table's name inline as `table_name`.
  const name = String(
    table.name ?? table.table_name ?? table.tableName ?? ''
  ).trim();
  if (name) return name;

  const num = table.table_number ?? table.tableNumber;
  if (num !== null && num !== undefined && String(num).trim() !== '') {
    const prefix = t ? t('common.table', 'Table') : 'Table';
    return `${prefix} ${num}`;
  }

  return '—';
}

export default tableLabel;
