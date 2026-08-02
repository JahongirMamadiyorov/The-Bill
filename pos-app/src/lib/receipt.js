// ─────────────────────────────────────────────────────────────────────────────
// Shared customer-receipt assembler. Added 2026-08-02.
//
// Every place that can print a receipt (Menu cart, payment flow, Orders,
// Tables, History reprint, Admin Collect Payment, and the per-item cheque)
// builds its data HERE, so all of them produce an identical receipt. The
// alternative — each screen assembling its own object — is how the website
// ended up with near-duplicate receipt code in PayModal.jsx and
// CashierMenu.jsx that can silently drift apart.
//
// Ported from website/src/components/PayModal.jsx's receipt block. The output
// shape is exactly what printEngine.js's buildReceipt() expects: every money
// value is an ALREADY-FORMATTED STRING, because the ESC/POS builder does
// column alignment on string length and must not do currency formatting itself.
//
// ── A deliberate quirk, replicated not "fixed" ──────────────────────────────
// Tax and service charge are DISPLAYED on the receipt but NOT added to the
// total. The website computes `totalToPay = orderTotal - discount`, with tax
// and service shown as informational lines only — and pos-app's own MenuScreen
// agrees, labelling the service charge row "not charged". Changing that here
// would make pos-app receipts disagree with both the website and the amount
// actually charged to the customer. If it should change, it has to change in
// the payment logic first, not in the receipt.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtMoney } from '../pages/pos/tokens.js';
import { t } from './i18n.js';

// The receipt is a physical document handed to a customer, so every word on it
// must be in the restaurant's language — not just the app UI. printEngine.js
// runs in the main process and has no access to the i18n dictionary, so the
// labels are translated HERE and passed along with the data.
//
// `lang` falls back to localStorage when a call site doesn't pass it: the POS
// shell stores 'pos.lang' ('UZ'/'EN') and the Admin panel stores 'lang'
// ('uz'/'en'), so both are checked. This keeps the Admin call site working
// without threading a lang prop through a screen that uses a different i18n
// system entirely (LanguageContext).
function resolveLang(lang) {
  if (lang) return lang;
  try {
    if (localStorage.getItem('pos.lang') === 'UZ') return 'UZ';
    if ((localStorage.getItem('lang') || '').toLowerCase() === 'uz') return 'UZ';
  } catch { /* localStorage unavailable — fall through to English */ }
  return 'EN';
}

function buildLabels(lang) {
  return {
    subtotal: t('Subtotal', lang),
    tax:      t('Tax', lang),
    service:  t('Service', lang),
    discount: t('Discount', lang),
    total:    t('Total', lang).toUpperCase(),
    method:   t('Method', lang),
    change:   t('Change', lang),
  };
}

// "#42" from daily_number, else last 4 of the uuid — verbatim from PayModal.jsx.
export function fmtOrderNum(o) {
  if (o?.dailyNumber) return `#${o.dailyNumber}`;
  const id = String(o?.id || '');
  return id.length >= 4 ? `#${id.slice(-4)}` : `#${id}`;
}

export function fmtReceiptDate(d) {
  const dt = d ? new Date(d) : new Date();
  if (isNaN(dt)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

// Payment method values arrive in two different shapes depending on the screen:
// the POS PaymentModal emits Title Case ('Cash', 'QR Code', 'Split'), while the
// Admin panel and the DB use snake_case ('cash', 'bank_transfer'). Both are
// normalised to the Title Case form first — which is also the exact key the i18n
// dictionary uses — then translated. An unknown method still title-cases
// sensibly rather than printing a raw database value at the customer.
export function paymentMethodLabel(method, lang) {
  const titled = String(method || 'cash')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return t(titled, resolveLang(lang));
}

// Normalises the two different item shapes this app deals with:
//   cart entries      { item: <menu_items row>, qty }
//   order item rows   { name|menuItemName, quantity|qty, unitPrice|price, unit }
// into the single shape buildReceipt() wants.
function normaliseItems(items = [], money) {
  return items.map((raw) => {
    const src   = raw?.item ? raw.item : raw;
    const qty   = parseFloat(raw?.qty ?? raw?.quantity ?? src?.quantity ?? 1) || 1;
    const price = Number(src?.unitPrice ?? src?.price ?? src?.customPrice ?? 0) || 0;
    return {
      name:  src?.name || src?.menuItemName || '—',
      qty,
      unit:  String(src?.unit || 'piece').toLowerCase(),
      total: money(price * qty),
      _lineTotal: price * qty,
    };
  });
}

// Maps useSettings()'s camelised receipt flags onto buildReceipt()'s `show`.
function showFlags(settings = {}) {
  const s = settings.receiptShow || {};
  return {
    logo:          s.logo          !== false,
    orderNumber:   s.orderNumber   !== false,
    tableName:     s.tableName     !== false,
    tax:           s.tax           !== false,
    serviceCharge: s.serviceCharge !== false,
    footer:        s.footer        !== false,
  };
}

/**
 * buildReceiptData — full-order receipt.
 *
 * @param {object}  order     camelised order row (dailyNumber, id, tableName, createdAt…)
 * @param {Array}   items     cart entries or order_items rows (see normaliseItems)
 * @param {object}  settings  useSettings() output
 * @param {object}  payment   { method, discountAmount, discountReason, amountReceived }
 *                            — omit entirely for an unpaid "pre-bill" print.
 */
export function buildReceiptData({ order = {}, items = [], settings = {}, payment = {}, lang }) {
  const symbol = settings.currencySymbol || "so'm";
  const money  = (n) => fmtMoney(n, symbol);
  const lng    = resolveLang(lang);

  const lines    = normaliseItems(items, money);
  const subtotal = lines.reduce((sum, l) => sum + l._lineTotal, 0);

  const taxRate = Number(settings.taxRate || 0);
  const svcRate = Number(settings.serviceChargeRate || 0);
  const taxAmt  = settings.taxEnabled           ? Math.round(subtotal * taxRate / 100) : 0;
  const svcAmt  = settings.serviceChargeEnabled ? Math.round(subtotal * svcRate / 100) : 0;

  const discountAmt = Math.min(subtotal, Number(payment.discountAmount || 0));
  // See the header note: tax/service are shown but deliberately not added.
  const total       = Math.max(0, subtotal - discountAmt);
  const received    = Number(payment.amountReceived || 0);
  const change      = received > total ? received - total : 0;

  return {
    restaurantName: settings.restaurantName || 'The Bill',
    headerText:     settings.receiptHeader  || '',
    orderNum:       fmtOrderNum(order),
    tableName:      order.tableName || '',
    dateTime:       fmtReceiptDate(order.createdAt),
    items: lines.map(({ name, qty, unit, total: t }) => ({ name, qty, unit, total: t })),
    // Only sent when it differs from the total, matching the backend's own
    // `r.subtotal !== r.total` suppression.
    subtotal:       money(subtotal),
    taxRate:        taxRate || undefined,
    tax:            taxAmt > 0 ? money(taxAmt) : undefined,
    serviceRate:    svcRate || undefined,
    service:        svcAmt > 0 ? money(svcAmt) : undefined,
    discountReason: payment.discountReason || undefined,
    discount:       discountAmt > 0 ? `-${money(discountAmt)}` : undefined,
    total:          money(total),
    method:         payment.method ? paymentMethodLabel(payment.method, lng) : '',
    change:         change > 0 ? money(change) : undefined,
    footer:         settings.receiptFooter || 'Rahmat!',
    show:           showFlags(settings),
    labels:         buildLabels(lng),
  };
}

/**
 * buildSingleItemReceiptData — a cheque for ONE item.
 *
 * Requested 2026-08-02: some Uzbek restaurants keep a printed cheque per sold
 * item in the till. Same layout as a normal receipt so the printer output and
 * the ESC/POS builder stay identical — it is simply a receipt whose item list
 * has one entry, with no payment/discount block.
 */
export function buildSingleItemReceiptData({ item, qty, order = {}, settings = {} }) {
  return buildReceiptData({
    order,
    items: [{ item: item?.item ? item.item : item, qty: qty ?? item?.qty ?? 1 }],
    settings,
    payment: {},
  });
}
