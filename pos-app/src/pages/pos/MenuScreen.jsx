import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Minus, X, Printer, Flame,
  UtensilsCrossed, ShoppingBag, Truck, Settings2, ArrowLeftRight,
  DollarSign, Tag, Wine, Pizza, Fish, Coffee, ChefHat, Users,
  ImageOff, Loader2, CheckCircle2, AlertCircle,
  User, Phone, MapPin,
} from 'lucide-react';
import { camelizeRows } from '../../lib/case.js';
import { T, card, pill, statusPill, uppercaseLabel, initials, fmtMoney } from './tokens.js';
import { TableIcon } from './icons.jsx';
import PaymentModal from './PaymentModal.jsx';
import AmountPickerModal from './AmountPickerModal.jsx';
import { isWeighedItem, unitSuffix, formatQty } from '../../lib/weighed.js';
import { localPhotoSrc } from '../../lib/localPhoto.js';
import { t, tt, tableFallbackLabel } from '../../lib/i18n.js';
import { buildReceiptData, buildSingleItemReceiptData } from '../../lib/receipt.js';

// ─────────────────────────────────────────────────────────────────────────────
// Menu screen — order building. Design handoff screen 1 (+ floor-plan picker
// from screen 5 for table selection, since dine-in requires a table here).
//
// Data: local PowerSync reads (works offline). Writes go through
// window.electronAPI.ordersCreate / ordersPay — online-required (Option A,
// see main.js submitOrderWrite).
//
// Money math mirrors the backend EXACTLY: total = subtotal + tax − discount.
// Service charge is NOT added to the total because POST /api/orders does not
// include it in total_amount (display/receipt-only in the legacy apps too) —
// flagged to the project owner; if they decide it should be charged, fix the
// backend first, then this screen just re-reads the stored totals.
// ─────────────────────────────────────────────────────────────────────────────

// ── Order types (design pills; keys match orders.order_type CHECK) ────────────
const ORDER_TYPES = [
  { key: 'dine_in',  Icon: UtensilsCrossed, label: 'Dine In'  },
  { key: 'to_go',    Icon: ShoppingBag,     label: 'Takeout'  },
  { key: 'delivery', Icon: Truck,           label: 'Delivery' },
];

// ── Category icon guesser (ported from Cashier.jsx) ───────────────────────────
const catIcon = (name = '') => {
  const n = name.toLowerCase();
  if (n.includes('bar') || n.includes('wine') || n.includes('drink') || n.includes('alcohol') || n.includes('ichimlik')) return Wine;
  if (n.includes('pizza')) return Pizza;
  if (n.includes('fish') || n.includes('seafood') || n.includes('baliq')) return Fish;
  if (n.includes('coffee') || n.includes('tea') || n.includes('kafe') || n.includes('choy')) return Coffee;
  if (n.includes('special') || n.includes('chef')) return ChefHat;
  if (n.includes('promo') || n.includes('combo') || n.includes('set')) return Tag;
  if (n.includes('group') || n.includes('family') || n.includes('party')) return Users;
  return UtensilsCrossed;
};

const CART_KEY = 'pos.cart.v1';
const ACTIVE_STATUSES = "('pending','sent_to_kitchen','preparing','ready','served','bill_requested')";

export default function MenuScreen({ user, settings, search, lang }) {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState([]);
  const [items,      setItems]      = useState([]);
  const [tables,     setTables]     = useState([]);
  const [loading,    setLoading]    = useState(true);

  // Active orders + their items — needed only to detect "this table already
  // has a live order" when the cashier taps it in the picker (add-to-existing
  // flow, see below). Not used for anything else on this screen.
  const [activeOrders,   setActiveOrders]   = useState([]);
  const [itemsByOrder,   setItemsByOrder]   = useState({});

  // ── Order state ───────────────────────────────────────────────────────────
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; }
  });
  const [orderType, setOrderType]   = useState('dine_in');
  const [selTable,  setSelTable]    = useState(null);
  // Set the instant an OCCUPIED table is tapped in the picker — the order
  // already on that table. Non-null means "adding to an existing order"
  // mode: Fire appends the cart to this order instead of creating a new one.
  const [existingOrder, setExistingOrder] = useState(null);
  const [custName,  setCustName]    = useState(''); // delivery only now (takeout no longer collects it)
  const [custPhone, setCustPhone]   = useState(''); // delivery only
  const [custAddr,  setCustAddr]    = useState('');
  const [selectedCat, setSelectedCat] = useState(null);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [amountPicker, setAmountPicker] = useState(null);
  const [showPayment, setShowPayment]   = useState(false);
  const [submitting,  setSubmitting]    = useState(false);
  const [error,       setError]         = useState('');
  const [toast,       setToast]         = useState(null);
  const catRef = useRef(null);

  const symbol = settings.currencySymbol;
  const money  = (n) => fmtMoney(n, symbol);

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
  }, [cart]);

  // ── Load (PowerSync local reads) ──────────────────────────────────────────
  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try {
      await loadCore();
      await loadActiveOrders();
    } catch {
      showToast(t('Failed to load menu data', lang), false);
    } finally { setLoading(false); }
  };
  const loadCore = async () => {
    const [cats, menuItems, tbls] = await Promise.all([
      window.electronAPI.psGetAll('SELECT * FROM categories ORDER BY sort_order'),
      window.electronAPI.psGetAll('SELECT * FROM menu_items ORDER BY sort_order'),
      window.electronAPI.psGetAll('SELECT * FROM restaurant_tables ORDER BY table_number'),
    ]);
    setCategories(camelizeRows(cats));
    setItems(camelizeRows(menuItems).filter(i => i.isAvailable !== false));
    setTables(camelizeRows(tbls));
  };
  // Active orders + their items — only so tapping an occupied table can show
  // "adding to Order #X" immediately, per the add-to-existing-order flow.
  const loadActiveOrders = async () => {
    const ords = await window.electronAPI.psGetAll(
      `SELECT * FROM orders WHERE status IN ${ACTIVE_STATUSES} ORDER BY created_at ASC`
    );
    const orderRows = camelizeRows(ords);
    setActiveOrders(orderRows);
    if (orderRows.length) {
      const ids = orderRows.map(o => `'${o.id}'`).join(',');
      const its = await window.electronAPI.psGetAll(`SELECT * FROM order_items WHERE order_id IN (${ids})`);
      const map = {};
      for (const it of camelizeRows(its)) (map[it.orderId] = map[it.orderId] || []).push(it);
      setItemsByOrder(map);
    } else {
      setItemsByOrder({});
    }
  };

  // Poll tables + active orders while the picker is open so statuses (and
  // which tables are occupied) stay live.
  useEffect(() => {
    if (!showTablePicker) return;
    const t = setInterval(async () => {
      try {
        const rows = await window.electronAPI.psGetAll('SELECT * FROM restaurant_tables ORDER BY table_number');
        setTables(camelizeRows(rows));
        await loadActiveOrders();
      } catch {}
    }, 4000);
    return () => clearInterval(t);
  }, [showTablePicker]);

  // Latest active order per table (ASC creation order → last write wins = newest)
  const orderByTable = useMemo(() => {
    const map = {};
    for (const o of activeOrders) if (o.tableId) map[o.tableId] = o;
    return map;
  }, [activeOrders]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let list = items;
    if (selectedCat) list = list.filter(i => i.categoryId === selectedCat);
    if (search?.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => (i.name || '').toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedCat, search]);

  const catName = (id) => categories.find(c => c.id === id)?.name || 'Other';
  const itemsById = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items]);

  const cartEntries = useMemo(() => Object.values(cart), [cart]);
  // Anything worth a "Back" button clearing — used for both the normal
  // new-order flow (cart/table/customer fields started, cashier wants to
  // bail) and add-to-existing-order mode (existingOrder set).
  const hasOrderInProgress = cartEntries.length > 0 || !!selTable || !!existingOrder ||
    !!custName || !!custPhone || !!custAddr || orderType !== 'dine_in';
  const cartByCat = useMemo(() => {
    const groups = {};
    for (const e of cartEntries) {
      const key = catName(e.item.categoryId);
      (groups[key] = groups[key] || []).push(e);
    }
    return groups;
  }, [cartEntries, categories]);

  const subtotal = useMemo(() =>
    cartEntries.reduce((s, e) => s + Number(e.item.price || 0) * e.qty, 0), [cartEntries]);
  const taxAmt = settings.taxEnabled ? Math.round(subtotal * settings.taxRate / 100) : 0;
  const svcAmt = settings.serviceChargeEnabled ? Math.round(subtotal * settings.serviceChargeRate / 100) : 0;
  const total  = subtotal + taxAmt; // mirrors backend: subtotal + tax (discount applied at pay time)

  // ── Add-to-existing-order preview (only when existingOrder is set) ────────
  // The already-fired items on that order, read-only here — for display only.
  const existingItems = useMemo(() => {
    if (!existingOrder) return [];
    return (itemsByOrder[existingOrder.id] || []).map(it => ({
      menuItemId: it.menuItemId,
      name:  itemsById[it.menuItemId]?.name || 'Item',
      price: Number(it.unitPrice || itemsById[it.menuItemId]?.price || 0),
      qty:   Number(it.quantity || 1),
    }));
  }, [existingOrder, itemsByOrder, itemsById]);
  const existingSubtotal = useMemo(() =>
    existingItems.reduce((s, it) => s + it.price * it.qty, 0), [existingItems]);
  // Combined preview — mirrors what the backend recomputes server-side (it
  // sums ALL items on the order, existing + newly added, then reapplies tax).
  const combinedSubtotal = existingOrder ? existingSubtotal + subtotal : subtotal;
  const combinedTax      = existingOrder
    ? (settings.taxEnabled ? Math.round(combinedSubtotal * settings.taxRate / 100) : 0)
    : taxAmt;
  const combinedTotal    = combinedSubtotal + combinedTax;

  // ── Cart actions ──────────────────────────────────────────────────────────
  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  // Per-item "send to kitchen" tracking (added 2026-08-02). Maps menu_item_id →
  // the quantity ALREADY sent to the kitchen individually, so pressing Fire
  // afterwards prints only the remainder instead of re-printing dishes the
  // kitchen is already cooking. Reset by clearOrder(). Only affects PRINTING —
  // the order write itself always sends the full cart.
  const [sentQty, setSentQty] = useState({});

  // `mode: 'add'` (tapping ADD/+ on a weighed item) starts blank and, on
  // confirm, is SUMMED with whatever qty is already in the cart — a cashier
  // adding "1.33 more" to an existing 0.5 must end up at 1.83, not have the
  // 0.5 silently overwritten. `mode: 'set'` (the minus stepper, a correction)
  // keeps the old prefilled/replace behavior.
  const openAmountPicker = (item, mode = 'set') => {
    const current   = cart[item.id]?.qty || 0;
    const unitPrice = Number(item.price || 0);
    const draftBase = mode === 'add' ? '' : (current ? String(current) : '');
    setAmountPicker({
      item, mode, existingQty: current,
      draft: draftBase,
      priceDraft: draftBase ? String(Math.round(Number(draftBase) * unitPrice)) : '',
    });
  };
  const onAmountQtyChange = (v) => {
    const unit = Number(amountPicker?.item?.price || 0);
    const qty  = parseFloat(String(v || '').replace(',', '.')) || 0;
    setAmountPicker(p => p ? { ...p, draft: v, priceDraft: String(Math.round(qty * unit)) } : p);
  };
  const onAmountPriceChange = (v) => {
    const unit  = Number(amountPicker?.item?.price || 0);
    const price = parseFloat(String(v || '').replace(',', '.')) || 0;
    const qty   = unit > 0 ? Math.round((price / unit) * 1000) / 1000 : 0;
    setAmountPicker(p => p ? { ...p, priceDraft: v, draft: qty > 0 ? String(qty) : '' } : p);
  };
  const confirmAmountPicker = () => {
    if (!amountPicker) return;
    const raw  = String(amountPicker.draft || '').replace(',', '.').trim();
    const amt  = parseFloat(raw);
    const item = amountPicker.item;
    if (amountPicker.mode === 'add') {
      if (!isFinite(amt) || amt <= 0) { setAmountPicker(null); return; } // no-op, don't touch what's already there
      const newQty = Math.round((amountPicker.existingQty + amt) * 1000) / 1000;
      setCart(prev => ({ ...prev, [item.id]: { item, qty: newQty } }));
      setAmountPicker(null);
      return;
    }
    if (!isFinite(amt) || amt <= 0) {
      setCart(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      setAmountPicker(null);
      return;
    }
    const rounded = Math.round(amt * 1000) / 1000;
    setCart(prev => ({ ...prev, [item.id]: { item, qty: rounded } }));
    setAmountPicker(null);
  };

  const addItem = (item) => {
    if (isWeighedItem(item)) { openAmountPicker(item, 'add'); return; }
    setCart(p => ({ ...p, [item.id]: { item, qty: (p[item.id]?.qty || 0) + 1 } }));
  };
  const decItem = (id) => {
    const entry = cart[id];
    if (!entry) return;
    if (isWeighedItem(entry.item)) { openAmountPicker(entry.item, 'set'); return; }
    setCart(p => {
      if (!p[id]) return p;
      if (p[id].qty <= 1) { const n = { ...p }; delete n[id]; return n; }
      return { ...p, [id]: { ...p[id], qty: p[id].qty - 1 } };
    });
  };
  const delItem = (id) => setCart(p => { const n = { ...p }; delete n[id]; return n; });
  const clearOrder = () => {
    setCart({}); setSelTable(null); setExistingOrder(null); setOrderType('dine_in');
    setCustName(''); setCustPhone(''); setCustAddr(''); setError(''); setShowTablePicker(false);
    setSentQty({}); // new order — nothing has been sent to the kitchen yet
  };

  // ── Order submit ──────────────────────────────────────────────────────────
  const buildOrderPayload = () => ({
    table_id:   selTable?.id || null,
    order_type: orderType,
    items:      cartEntries.map(e => ({ menu_item_id: e.item.id, quantity: e.qty })),
    ...(custName  && { customer_name:  custName }),
    ...(custPhone && { customer_phone: custPhone }),
    ...(custAddr  && { delivery_address: custAddr }),
  });

  const validateOrder = () => {
    if (orderType === 'dine_in' && !selTable) {
      setError(t('Please select a table for this dine-in order', lang));
      setShowTablePicker(true);
      return false;
    }
    return true;
  };

  // Kitchen ticket print — best-effort, called AFTER the order write's own
  // success is already confirmed. Never throws, never gates/blocks the order
  // flow — only warns (via the existing toast) when a CONFIGURED printer
  // actually failed to respond (printRes.failed), not when there's simply
  // nothing configured yet (printKitchenTicket returns ok:false for that,
  // silently, by design — see printEngine.js).
  const printTicket = async (order, printItems) => {
    try {
      const res = await window.electronAPI.printKitchenTicket({
        order, items: printItems, printers: settings.kitchenPrinters, show: settings.kitchenShow,
      });
      if (res?.failed?.length > 0) {
        showToast(t('Some kitchen printers did not respond — check the ticket manually', lang), false);
      }
    } catch { /* printing is best-effort — never affects the order flow */ }
  };

  // ── Receipt printing (added 2026-08-02) ───────────────────────────────────
  // Same best-effort contract as printTicket above: never throws, never gates
  // the order/payment flow, silent when no receipt printer is configured
  // (printReceipt returns ok:false for that by design), warns only when a
  // CONFIGURED printer actually failed.
  const printReceiptNow = async (receipt) => {
    try {
      const res = await window.electronAPI.printReceipt({
        receipt, printers: settings.receiptPrinters,
      });
      if (res?.failed?.length > 0) {
        showToast(t('Receipt printer did not respond', lang), false);
      }
    } catch { /* best-effort */ }
  };

  // Order metadata shared by every print path on this screen. dailyNumber is
  // null for a cart that hasn't been submitted yet — fmtOrderNum() falls back
  // to the id, and an empty one just prints no order number.
  const currentOrderMeta = () => ({
    dailyNumber: existingOrder?.dailyNumber ?? null,
    id:          existingOrder?.id ?? '',
    tableName:   selTable ? (selTable.name || tableFallbackLabel(selTable.tableNumber, lang)) : null,
    orderType:   existingOrder?.orderType || orderType,
    createdAt:   new Date().toISOString(),
    customerName:  custName || null,
    customerPhone: custPhone || null,
    deliveryAddress: custAddr || null,
  });

  // Kitchen-ticket items for the cart, EXCLUDING anything already sent
  // individually — and sending only the not-yet-sent delta for partially sent
  // items (send 2, bump to 3, Fire → the kitchen gets 1, not 3).
  const unsentTicketItems = () => cartEntries
    .map((e) => ({ e, delta: e.qty - (sentQty[e.item.id] || 0) }))
    .filter((x) => x.delta > 0)
    .map(({ e, delta }) => ({
      name: e.item.name, quantity: delta, unit: e.item.unit,
      notes: e.item.notes || null, kitchenStation: e.item.kitchenStation,
    }));

  // Send ONE dish to the kitchen without firing the whole cart.
  const sendItemToKitchen = async (entry) => {
    const delta = entry.qty - (sentQty[entry.item.id] || 0);
    if (delta <= 0) {
      showToast(t('This item was already sent to the kitchen', lang), false);
      return;
    }
    await printTicket(currentOrderMeta(), [{
      name: entry.item.name, quantity: delta, unit: entry.item.unit,
      notes: entry.item.notes || null, kitchenStation: entry.item.kitchenStation,
    }]);
    setSentQty((p) => ({ ...p, [entry.item.id]: entry.qty }));
    showToast(tt(lang, '{name} sent to the kitchen', '{name} oshxonaga yuborildi', { name: entry.item.name }));
  };

  // Cheque for ONE item — some restaurants keep a per-item receipt in the till.
  const printItemReceipt = (entry) => printReceiptNow(
    buildSingleItemReceiptData({ item: entry.item, qty: entry.qty, order: currentOrderMeta(), settings })
  );

  // Pre-bill for the whole cart (the cart's Print button) — no payment block,
  // since nothing has been paid yet.
  const printCartReceipt = () => {
    if (!cartEntries.length) return;
    return printReceiptNow(buildReceiptData({
      order: currentOrderMeta(), items: cartEntries, settings, payment: {},
    }));
  };

  const handleFire = async () => {
    if (!cartEntries.length || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const tableName = selTable ? (selTable.name || tableFallbackLabel(selTable.tableNumber, lang)) : null;
      if (existingOrder) {
        // Adding to an already-existing order (occupied table picked while
        // building this cart) — append only the NEW items, never the full
        // list (that's orders:update's job, for editing an existing order).
        const res = await window.electronAPI.ordersAddItems(existingOrder.id, {
          items: cartEntries.map(e => ({ menu_item_id: e.item.id, quantity: e.qty })),
        });
        if (!res.ok) { setError(res.error || t('Failed to add items to the order', lang)); return; }
        showToast(tt(lang, 'Added to Order #{n}', '#{n}-buyurtmaga qo’shildi', { n: existingOrder.dailyNumber || existingOrder.id.slice(-4) }));
        // Print ONLY the items just added — the rest of the order already
        // printed when it was originally fired.
        await printTicket({
          dailyNumber: res.data?.daily_number ?? existingOrder.dailyNumber,
          tableName,
          orderType: existingOrder.orderType || orderType,
          customerName: custName || null,
          customerPhone: custPhone || null,
          deliveryAddress: custAddr || null,
        }, unsentTicketItems());
        clearOrder();
        return;
      }
      if (!validateOrder()) return;
      const res = await window.electronAPI.ordersCreate(buildOrderPayload());
      if (!res.ok) { setError(res.error || t('Failed to send order', lang)); return; }
      showToast(t('Order sent to kitchen', lang));
      // Print the cart MINUS anything already sent to the kitchen one-by-one
      // (see unsentTicketItems) — so a dish sent individually isn't cooked twice.
      await printTicket({
        dailyNumber: res.data?.daily_number,
        tableName,
        orderType,
        customerName: custName || null,
        customerPhone: custPhone || null,
        deliveryAddress: custAddr || null,
      }, unsentTicketItems());
      clearOrder();
    } finally { setSubmitting(false); }
  };

  const handleChargeClick = () => {
    if (!cartEntries.length) return;
    setError('');
    if (!validateOrder()) return;
    setShowPayment(true);
  };

  // Called by PaymentModal with { payment_method, discount_amount, split/loan fields... }
  const submitCharge = async (payPayload) => {
    const createRes = await window.electronAPI.ordersCreate(buildOrderPayload());
    if (!createRes.ok) return { ok: false, error: createRes.error || 'Failed to create order' };
    const payRes = await window.electronAPI.ordersPay(createRes.data?.id, payPayload);
    if (!payRes.ok) return { ok: false, error: payRes.error || 'Payment failed — order was created but not paid, check Orders' };

    // Auto-print the customer receipt, gated on the restaurant's own setting
    // (restaurant_settings.receipt_auto_print, default true). Runs only AFTER
    // payment is confirmed, and can never fail the payment — printReceiptNow
    // swallows everything. The cashier can still reprint from Orders/History.
    if (settings.receiptAutoPrint) {
      await printReceiptNow(buildReceiptData({
        order: { ...currentOrderMeta(), dailyNumber: createRes.data?.daily_number, id: createRes.data?.id },
        items: cartEntries,
        settings,
        payment: {
          method:         payPayload?.payment_method,
          discountAmount: payPayload?.discount_amount,
          discountReason: payPayload?.discount_reason,
          amountReceived: payPayload?.amount_received,
        },
      }));
    }
    return { ok: true };
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={34} color={T.green} style={{ animation: 'posspin 1s linear infinite' }} />
      <style>{`@keyframes posspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const tableLabel = selTable
    ? (selTable.name || tableFallbackLabel(selTable.tableNumber, lang))
    : null;

  return (
    <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
      <style>{`@keyframes posspin { to { transform: rotate(360deg); } }`}</style>

      {toast && (
        <div style={{
          position: 'fixed', top: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          background: toast.ok ? T.green : T.coral, color: '#fff', padding: '10px 20px',
          borderRadius: T.rBtn, fontSize: 13.5, fontWeight: 700, fontFamily: T.font,
          display: 'flex', alignItems: 'center', gap: 8, boxShadow: T.modalShadow, pointerEvents: 'none',
        }}>
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* ══ Main column ══ */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>

        {showTablePicker ? (
          /* ── Floor-plan table picker (design screen 5) ── */
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <span style={{ fontSize: 16, fontWeight: 800 }}>{t('Choose a table', lang)}</span>
                <span style={{ fontSize: 12, color: T.muted, marginLeft: 10 }}>{t('tap a table to assign it', lang)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {[['Available', T.green], ['Occupied', T.coral], ['Reserved', T.amber], ['Needs Bill', T.blue]].map(([lbl, clr]) => (
                  <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: T.muted }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: clr }} />{t(lbl, lang)}
                  </span>
                ))}
                <button onClick={() => setShowTablePicker(false)} style={{
                  border: 'none', background: T.surface, boxShadow: T.cardShadow, borderRadius: T.rBtn,
                  padding: '8px 14px', fontSize: 12.5, fontWeight: 700, color: T.muted, cursor: 'pointer', fontFamily: T.font,
                }}>
                  {t('Back to menu', lang)}
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 14 }}>
              {tables.map(tb => {
                const sp = statusPill(tb.status || 'free', lang);
                const isSel = selTable?.id === tb.id;
                return (
                  <button key={tb.id} onClick={() => {
                    setSelTable(tb); setShowTablePicker(false); setError('');
                    // Occupied table already has a live order → switch straight
                    // into "adding to Order #X" mode, no waiting for Fire.
                    setExistingOrder(orderByTable[tb.id] || null);
                  }} style={{
                    ...card, textAlign: 'left', padding: 16, cursor: 'pointer', fontFamily: T.font,
                    border: isSel ? `2px solid ${T.green}` : '2px solid transparent',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>
                        {tb.name || tableFallbackLabel(tb.tableNumber, lang)}
                      </span>
                      <span style={pill(sp)}>{sp.label}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.muted }}>
                      {tb.capacity ? tt(lang, '{n} seats', "{n} o'rin", { n: tb.capacity }) : ' '}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* ── Category row ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 800 }}>Category</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => catRef.current?.scrollBy({ left: -240, behavior: 'smooth' })} style={{
                    width: 30, height: 30, borderRadius: '50%', border: 'none', background: T.surface,
                    boxShadow: T.cardShadow, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ChevronLeft size={15} color={T.muted} />
                  </button>
                  <button onClick={() => catRef.current?.scrollBy({ left: 240, behavior: 'smooth' })} style={{
                    width: 30, height: 30, borderRadius: '50%', border: 'none', background: T.green,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ChevronRight size={15} color="#fff" />
                  </button>
                </div>
              </div>
              <div ref={catRef} style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                {/* "All" card */}
                <CategoryCard
                  label={t('All', lang)} Icon={UtensilsCrossed}
                  active={!selectedCat}
                  onClick={() => setSelectedCat(null)}
                />
                {categories.map(c => (
                  <CategoryCard
                    key={c.id} label={c.name} Icon={catIcon(c.name)}
                    active={selectedCat === c.id}
                    onClick={() => setSelectedCat(selectedCat === c.id ? null : c.id)}
                  />
                ))}
              </div>
            </div>

            {/* ── Product grid ── */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{t('Menu', lang)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
                {filteredItems.map(item => {
                  const inCart = cart[item.id]?.qty;
                  return (
                    <div key={item.id} style={{
                      ...card, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
                      border: inCart ? `2px solid ${T.green}` : '2px solid transparent',
                    }}>
                      <div style={{
                        height: 96, borderRadius: 12, overflow: 'hidden', background: T.chipBg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                      }}>
                        {item.imageUrl
                          ? <img src={localPhotoSrc(item.imageUrl)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <ImageOff size={26} color={T.faint} strokeWidth={1.5} />}
                        {inCart ? (
                          <span style={{
                            position: 'absolute', top: 8, right: 8, minWidth: 22, height: 22, padding: '0 6px',
                            borderRadius: T.rPill, background: T.green, color: '#fff', fontSize: 11, fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {formatQty(item, inCart)}
                          </span>
                        ) : null}
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{
                          fontSize: 13, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: T.greenDark, marginTop: 2 }}>
                          {money(item.price)}{unitSuffix(item) ? ` / ${unitSuffix(item)}` : ''}
                        </div>
                      </div>
                      {(!inCart || isWeighedItem(item)) ? (
                        <button onClick={() => addItem(item)} style={{
                          border: 'none', borderRadius: T.rBtn, background: T.green, color: '#fff',
                          padding: '9px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          transition: 'background .15s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = T.greenDark}
                          onMouseLeave={e => e.currentTarget.style.background = T.green}
                        >
                          <Plus size={14} strokeWidth={2.5} /> {t('ADD', lang)}
                        </button>
                      ) : (
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: T.greenTint, borderRadius: T.rBtn, padding: 4,
                        }}>
                          <StepBtn onClick={() => decItem(item.id)}><Minus size={13} strokeWidth={2.5} /></StepBtn>
                          <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{inCart}</span>
                          <StepBtn primary onClick={() => addItem(item)}><Plus size={13} strokeWidth={2.5} /></StepBtn>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {filteredItems.length === 0 && (
                <div style={{ padding: 60, textAlign: 'center', color: T.muted, fontSize: 14 }}>{t('No items found', lang)}</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ══ Right panel — Order Details (design 372px) ══ */}
      <div style={{
        ...card, borderRadius: T.rCardLg, width: T.rightPanelW, flexShrink: 0,
        display: 'flex', flexDirection: 'column', padding: 18, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{t('Order Details', lang)}</div>
          {hasOrderInProgress && (
            <button onClick={clearOrder} style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              background: T.surface, color: T.coral, borderRadius: T.rPill,
              border: `1.75px solid ${T.coral}`, padding: '8px 16px',
              fontSize: 13.5, fontWeight: 800, fontFamily: T.font, transition: 'background .15s, color .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = T.coral; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.coral; }}
            >
              <ChevronLeft size={17} strokeWidth={3} />
              {t('Back', lang)}
            </button>
          )}
        </div>

        {/* Staff / date block */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>{user.name || t('Cashier', lang)}</div>
            <div style={{ fontSize: 10.5, color: T.muted }}>
              {new Date().toLocaleDateString(lang === 'UZ' ? 'uz-UZ' : 'en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
              {' · '}
              {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: T.chipBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: T.muted,
          }}>
            {initials(user.name) || 'ST'}
          </div>
        </div>

        {/* Icon chips (visual, per design) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[Settings2, ArrowLeftRight, Printer, DollarSign, Tag].map((Ic, i) => (
            <div key={i} style={{
              width: 34, height: 34, borderRadius: 10, background: T.chipBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted,
            }}>
              <Ic size={15} strokeWidth={1.8} />
            </div>
          ))}
        </div>

        {/* Order-type pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {ORDER_TYPES.map(({ key, label }) => {
            const active = orderType === key;
            return (
              <button key={key} onClick={() => { setOrderType(key); if (key !== 'dine_in') { setSelTable(null); setExistingOrder(null); setShowTablePicker(false); } }} style={{
                flex: 1, padding: '8px 0', borderRadius: T.rPill, cursor: 'pointer', fontFamily: T.font,
                border: 'none', fontSize: 12, fontWeight: 800, transition: 'background .15s, color .15s',
                background: active ? T.green : T.chipBg, color: active ? '#fff' : T.muted,
              }}>
                {t(label, lang)}
              </button>
            );
          })}
        </div>

        {/* Table selector — moved out of the Order/Server strip into its own row
            between the order-type pills and the strip, dine-in only */}
        {orderType === 'dine_in' && (
          <button onClick={() => setShowTablePicker(v => !v)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            width: '100%', boxSizing: 'border-box', textAlign: 'left', border: 'none',
            background: T.chipBg, borderRadius: T.rBtn, padding: '10px 12px', marginBottom: 12,
            cursor: 'pointer', fontFamily: T.font,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{
                width: 32, height: 32, borderRadius: 9, background: T.surface, color: T.greenDark,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: T.cardShadow,
              }}>
                <TableIcon size={15} strokeWidth={1.8} />
              </span>
              <div style={uppercaseLabel}>{t('Table', lang)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: tableLabel ? T.ink : T.coral }}>
                {tableLabel || t('Select…', lang)}
              </span>
              <ChevronRight size={15} strokeWidth={2} color={T.faint} />
            </div>
          </button>
        )}

        {/* Adding-to-existing-order notice — appears the instant an occupied
            table is tapped, before Fire, per the explicit requirement that
            this must never look like a silent second order on that table. */}
        {existingOrder && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, background: T.greenTint,
            color: T.greenDark, borderRadius: T.rBtn, padding: '9px 12px', marginBottom: 12,
            fontSize: 12, fontWeight: 800,
          }}>
            <Plus size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            <span>{tt(lang, 'Adding to Order #{n}', '#{n}-buyurtmaga qo’shilmoqda', { n: existingOrder.dailyNumber || existingOrder.id.slice(-4) })}</span>
          </div>
        )}

        {/* Delivery: Customer Name → Phone → Address, stacked, in that order.
            Takeout intentionally has no fields here at all anymore. */}
        {orderType === 'delivery' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            <IconField Icon={User}   value={custName}  onChange={setCustName}  placeholder={t('Customer name…', lang)} />
            <IconField Icon={Phone}  value={custPhone} onChange={setCustPhone} placeholder={t('Phone number…', lang)} />
            <IconField Icon={MapPin} value={custAddr}  onChange={setCustAddr}  placeholder={t('Delivery address…', lang)} />
          </div>
        )}

        {/* Cart — grouped by category */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, marginBottom: 10 }}>
          {/* Already-in-the-order items — read-only, visually muted so it's
              never confused with what's about to be added on Fire. */}
          {existingOrder && existingItems.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...uppercaseLabel, color: T.muted, marginBottom: 6 }}>
                {t('Already In This Order', lang)}
              </div>
              {existingItems.map((e, i) => (
                <div key={`existing-${e.menuItemId}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                  background: T.chipBg, borderRadius: T.rBtn, marginBottom: 6,
                }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.name} <span style={{ color: T.faint, fontWeight: 600 }}>× {e.qty}</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.faint, flexShrink: 0 }}>
                    {money(e.price * e.qty)}
                  </div>
                </div>
              ))}
              <div style={{ ...uppercaseLabel, color: T.green, marginBottom: 6, marginTop: 12 }}>
                {t('Adding Now', lang)}
              </div>
            </div>
          )}
          {cartEntries.length === 0 ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', color: T.faint, gap: 8,
            }}>
              <ShoppingBag size={34} strokeWidth={1.5} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.muted }}>
                {existingOrder ? t('No new items yet', lang) : t('Cart is empty', lang)}
              </div>
              <div style={{ fontSize: 11.5 }}>{t('Add items from the menu', lang)}</div>
            </div>
          ) : (
            Object.entries(cartByCat).map(([cat, entries]) => (
              <div key={cat} style={{ marginBottom: 12 }}>
                <span style={pill({ color: T.greenDark, bg: T.greenTint })}>{cat}</span>
                {entries.map(e => (
                  <div key={e.item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0 0' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {e.item.name} <span style={{ color: T.faint, fontWeight: 600 }}>{formatQty(e.item, e.qty)}</span>
                        {/* Marks a dish already sent to the kitchen individually,
                            so the cashier can see at a glance what Fire will skip. */}
                        {(sentQty[e.item.id] || 0) >= e.qty && (
                          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: T.greenDark }}>
                            {t('sent', lang)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {/* Per-item actions (2026-08-02): send just this dish to the
                          kitchen, or print a cheque for just this item. */}
                      <button onClick={() => sendItemToKitchen(e)} title={t('Send this item to the kitchen', lang)} style={{
                        width: 24, height: 24, borderRadius: 8, border: 'none',
                        background: (sentQty[e.item.id] || 0) >= e.qty ? T.chipBg : T.amberBg,
                        color: (sentQty[e.item.id] || 0) >= e.qty ? T.faint : T.amber,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Flame size={12} strokeWidth={2.5} />
                      </button>
                      <button onClick={() => printItemReceipt(e)} title={t('Print a receipt for this item', lang)} style={{
                        width: 24, height: 24, borderRadius: 8, border: 'none', background: T.chipBg,
                        color: T.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Printer size={12} strokeWidth={2.5} />
                      </button>
                      <StepBtn onClick={() => decItem(e.item.id)}><Minus size={12} strokeWidth={2.5} /></StepBtn>
                      <StepBtn primary onClick={() => addItem(e.item)}><Plus size={12} strokeWidth={2.5} /></StepBtn>
                      <button onClick={() => delItem(e.item.id)} title={t('Remove', lang)} style={{
                        width: 24, height: 24, borderRadius: 8, border: 'none', background: T.coralBg,
                        color: T.coral, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                    <div style={{ width: 88, textAlign: 'right', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                      {money(Number(e.item.price || 0) * e.qty)}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Totals — when adding to an existing order, break it down so the
            cashier can see the existing amount, the new amount, and the
            combined total the order will carry after Fire (matches the
            backend's full-recompute-from-all-items behavior exactly). */}
        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 10, marginBottom: 12 }}>
          {existingOrder ? (
            <>
              <TotalRow label={t('Already In Order', lang)} value={money(existingSubtotal)} />
              <TotalRow label={t('Adding Now', lang)} value={money(subtotal)} />
              {settings.taxEnabled && <TotalRow label={tt(lang, 'Tax ({n}%)', 'Soliq ({n}%)', { n: settings.taxRate })} value={money(combinedTax)} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{t('New Order Total', lang)}</span>
                <span style={{ fontSize: 19, fontWeight: 800 }}>{money(combinedTotal)}</span>
              </div>
            </>
          ) : (
            <>
              <TotalRow label={t('Sub Total', lang)} value={money(subtotal)} />
              {settings.taxEnabled && <TotalRow label={tt(lang, 'Tax ({n}%)', 'Soliq ({n}%)', { n: settings.taxRate })} value={money(taxAmt)} />}
              {settings.serviceChargeEnabled && svcAmt > 0 && (
                <TotalRow label={tt(lang, 'Service Charge ({n}%)', 'Xizmat haqi ({n}%)', { n: settings.serviceChargeRate })} value={money(svcAmt)} note={t('not charged', lang)} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{t('Total', lang)}</span>
                <span style={{ fontSize: 19, fontWeight: 800 }}>{money(total)}</span>
              </div>
            </>
          )}
        </div>

        {error && (
          <div style={{
            background: T.coralBg, color: T.coral, borderRadius: T.rBtn, padding: '8px 12px',
            fontSize: 12, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={printCartReceipt} disabled={!cartEntries.length} style={{
            flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
            background: T.surface, color: T.ink, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Printer size={15} strokeWidth={1.8} /> {t('Print', lang)}
          </button>
          <button onClick={handleFire} disabled={submitting || !cartEntries.length} style={{
            flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: 'none',
            background: T.fire, color: '#fff', fontSize: 13, fontWeight: 800,
            cursor: cartEntries.length ? 'pointer' : 'default', fontFamily: T.font,
            opacity: cartEntries.length ? 1 : 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {submitting ? <Loader2 size={15} style={{ animation: 'posspin 1s linear infinite' }} /> : <Flame size={15} strokeWidth={1.8} />}
            {existingOrder ? t('Add to Order', lang) : t('Fire', lang)}
          </button>
        </div>
        {/* Charge (pay now) is Menu-only for brand-new orders. When adding to
            an existing order, payment happens later from Orders/Tables — only
            Fire is allowed here, so the Charge button is hidden entirely. */}
        {!existingOrder && (
          <button onClick={handleChargeClick} disabled={!cartEntries.length} style={{
            padding: '13px 0', borderRadius: T.rBtn, border: 'none',
            background: T.green, color: '#fff', fontSize: 14.5, fontWeight: 800,
            cursor: cartEntries.length ? 'pointer' : 'default', fontFamily: T.font,
            opacity: cartEntries.length ? 1 : 0.5, transition: 'background .15s',
          }}
            onMouseEnter={e => { if (cartEntries.length) e.currentTarget.style.background = T.greenDark; }}
            onMouseLeave={e => e.currentTarget.style.background = T.green}
          >
            {tt(lang, 'Charge {amount}', "Hisob-kitob {amount}", { amount: money(total) })}
          </button>
        )}
      </div>

      {/* ══ Amount picker modal (weighed items) ══ */}
      <AmountPickerModal
        picker={amountPicker}
        symbol={symbol}
        money={money}
        lang={lang}
        onQtyChange={onAmountQtyChange}
        onPriceChange={onAmountPriceChange}
        onConfirm={confirmAmountPicker}
        onClose={() => setAmountPicker(null)}
      />

      {/* ══ Process Payment modal ══ */}
      {showPayment && (
        <PaymentModal
          entries={cartEntries}
          subtotal={subtotal}
          taxAmt={taxAmt}
          total={total}
          settings={settings}
          lang={lang}
          formatQty={formatQty}
          onQtyChange={(item, delta) => (delta > 0 ? addItem(item) : decItem(item.id))}
          onClose={() => setShowPayment(false)}
          onSubmit={submitCharge}
          onDone={() => { setShowPayment(false); clearOrder(); showToast(t('Payment complete', lang)); }}
        />
      )}
    </div>
  );
}

// ── Small shared bits ─────────────────────────────────────────────────────────

function CategoryCard({ label, Icon, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      ...card, flexShrink: 0, width: 92, padding: '14px 6px 12px', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, fontFamily: T.font,
      border: active ? `2px solid ${T.green}` : '2px solid transparent',
      background: active ? T.greenTint : T.surface,
      transition: 'background .15s, border-color .15s',
    }}>
      <Icon size={20} strokeWidth={1.8} color={active ? T.greenDark : T.muted} />
      <span style={{
        fontSize: 11, fontWeight: 700, color: active ? T.greenDark : T.muted,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
      }}>
        {label}
      </span>
    </button>
  );
}

function IconField({ Icon, value, onChange, placeholder }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${T.line}`,
      borderRadius: T.rBtn, padding: '0 12px', height: 40, boxSizing: 'border-box',
    }}>
      <Icon size={15} strokeWidth={1.8} color={T.faint} style={{ flexShrink: 0 }} />
      <input
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          border: 'none', outline: 'none', background: 'transparent', fontFamily: T.font,
          fontSize: 12.5, color: T.ink, flex: 1, minWidth: 0, padding: 0, height: '100%',
        }}
      />
    </div>
  );
}

function StepBtn({ children, onClick, primary }) {
  return (
    <button onClick={onClick} style={{
      width: 24, height: 24, borderRadius: 8, border: 'none', cursor: 'pointer',
      background: primary ? T.green : T.surface, color: primary ? '#fff' : T.ink,
      boxShadow: primary ? 'none' : `inset 0 0 0 1px ${T.line}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {children}
    </button>
  );
}

function TotalRow({ label, value, note }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
      <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 600 }}>
        {label}{note ? <span style={{ color: T.faint, fontSize: 10.5 }}> · {note}</span> : null}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted }}>{value}</span>
    </div>
  );
}
