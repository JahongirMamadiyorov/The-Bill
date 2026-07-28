// ─────────────────────────────────────────────────────────────────────────────
// Weighed items (kg/l/g/ml) — type-an-amount instead of a unit stepper.
// Shared by Menu/Orders/Tables so every screen that can add/adjust an item
// treats these identically. Originally lived only in MenuScreen.jsx; Orders'
// and Tables' in-place edit modes were built later and never got this, so
// tapping +/ADD on a weighed item there silently added whole units instead
// of opening the amount picker — fixed 2026-07-27 by extracting it here.
// ─────────────────────────────────────────────────────────────────────────────

export const isWeighedItem = (item) => {
  const u = String(item?.unit || 'piece').toLowerCase();
  return u === 'kg' || u === 'l' || u === 'g' || u === 'ml';
};

export const unitSuffix = (item) => {
  const u = String(item?.unit || 'piece').toLowerCase();
  return u === 'piece' ? '' : u;
};

export const formatQty = (item, qty) => {
  if (isWeighedItem(item)) {
    const n = Number(qty || 0);
    const trimmed = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '');
    return `${trimmed} ${unitSuffix(item)}`;
  }
  return `×${qty}`;
};
