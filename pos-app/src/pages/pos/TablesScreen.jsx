import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, Printer, CheckCircle2, AlertCircle, Minus, Plus, X, ArrowLeftRight,
} from 'lucide-react';
import { camelizeRows } from '../../lib/case.js';
import { T, card, pill, statusPill, uppercaseLabel, initials, fmtMoney } from './tokens.js';
import { TableIcon } from './icons.jsx';
import PaymentModal from './PaymentModal.jsx';
import AmountPickerModal from './AmountPickerModal.jsx';
import { isWeighedItem, unitSuffix, formatQty } from '../../lib/weighed.js';
import { t, tt, tableFallbackLabel } from '../../lib/i18n.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tables screen — floor plan overview. Design handoff screen 6.
// Zone pills come from the real table_sections (synced? no — sections live in
// restaurant_tables.section locally); status legend; 4-col table cards with
// the active order's waiter · elapsed · total on occupied tables.
// Tap a table with an active order → right panel shows that order — same
// detail panel as Orders per the design ("Right panel = same order-detail
// panel as Orders"): Print/Edit + Charge. Charge opens the payment modal
// right here, same as Orders does for an existing order.
//
// Edit is fully IN-PLACE on this screen (explicit user requirement — do not
// jump to the Orders screen): tapping Edit swaps the main column to an
// add-items menu (mirrors Orders' edit mode) while the right panel gains
// steppers/remove + Discard/Done, all without leaving Tables. Table/order
// type are fixed to the table you tapped — no floor-plan re-picker here.
//
// All reads local PowerSync, polls every 4s (paused while editing, same as
// Orders, so in-progress edits don't get clobbered by a refresh).
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = "('pending','sent_to_kitchen','preparing','ready','served','bill_requested')";

const elapsed = (iso, lang) => {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 60 ? tt(lang, '{m} min', '{m} daq', { m: mins }) : tt(lang, '{h}h {m}m', '{h}s {m}daq', { h: Math.floor(mins / 60), m: mins % 60 });
};

export default function TablesScreen({ user, settings, search, setNav, lang }) {
  const symbol = settings.currencySymbol;
  const money  = (n) => fmtMoney(n, symbol);

  const [tables,     setTables]     = useState([]);
  const [orders,     setOrders]     = useState([]);
  const [itemsByOrd, setItemsByOrd] = useState({});
  const [menuItems,  setMenuItems]  = useState([]);
  const [categories, setCategories] = useState([]);
  const [staff,      setStaff]      = useState({});
  const [loading,    setLoading]    = useState(true);
  const [zone,       setZone]       = useState(null);
  const [selectedId, setSelectedId] = useState(null); // table id
  const [showPayment, setShowPayment] = useState(false);
  const [toast,      setToast]        = useState(null);

  // ── Edit mode (in-place, mirrors Orders' edit mode exactly — including
  // order type + "Change Table" re-assignment) ────────────────────────────────
  const [editing,   setEditing]   = useState(false);
  const [editItems, setEditItems] = useState([]); // [{ menuItemId, name, price, qty }]
  const [editType,  setEditType]  = useState('dine_in');
  const [editTable, setEditTable] = useState(null); // table object or null
  const [pickTable, setPickTable] = useState(false);
  const [editCat,   setEditCat]   = useState(null);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');
  // Weighed items (kg/l/g/ml) being added/adjusted in edit mode — same
  // type-an-amount flow as Menu's cart, see lib/weighed.js + AmountPickerModal.
  const [amountPicker, setAmountPicker] = useState(null);

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const load = async (first = false) => {
    try {
      const [tbls, ords, users, mi, cats] = await Promise.all([
        window.electronAPI.psGetAll('SELECT * FROM restaurant_tables ORDER BY table_number'),
        window.electronAPI.psGetAll(`SELECT * FROM orders WHERE status IN ${ACTIVE_STATUSES} ORDER BY created_at ASC`),
        window.electronAPI.psGetAll('SELECT id, name FROM users'),
        window.electronAPI.psGetAll('SELECT * FROM menu_items ORDER BY sort_order'),
        window.electronAPI.psGetAll('SELECT * FROM categories ORDER BY sort_order'),
      ]);
      setTables(camelizeRows(tbls));
      const orderRows = camelizeRows(ords);
      setOrders(orderRows);
      setStaff(Object.fromEntries(camelizeRows(users).map(u => [u.id, u.name])));
      setMenuItems(camelizeRows(mi));
      setCategories(camelizeRows(cats));
      if (orderRows.length) {
        const ids = orderRows.map(o => `'${o.id}'`).join(',');
        const items = await window.electronAPI.psGetAll(`SELECT * FROM order_items WHERE order_id IN (${ids})`);
        const map = {};
        for (const it of camelizeRows(items)) (map[it.orderId] = map[it.orderId] || []).push(it);
        setItemsByOrd(map);
      } else setItemsByOrd({});
    } catch { /* keep last data */ }
    finally { if (first) setLoading(false); }
  };

  useEffect(() => {
    load(true);
    const t = setInterval(() => { if (!editing) load(); }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const menuById = useMemo(() => Object.fromEntries(menuItems.map(m => [m.id, m])), [menuItems]);

  // Latest active order per table
  const orderByTable = useMemo(() => {
    const map = {};
    for (const o of orders) if (o.tableId) map[o.tableId] = o; // ASC order → last write wins = newest
    return map;
  }, [orders]);

  const zones = useMemo(() => {
    const set = new Set();
    for (const tb of tables) if (tb.section) set.add(tb.section);
    return [...set];
  }, [tables]);

  const filtered = useMemo(() => {
    let list = tables;
    if (zone) list = list.filter(tb => tb.section === zone);
    if (search?.trim()) {
      const q = search.toLowerCase();
      list = list.filter(tb =>
        (tb.name || `table ${tb.tableNumber}`).toLowerCase().includes(q) ||
        String(tb.tableNumber).includes(q));
    }
    return list;
  }, [tables, zone, search]);

  const selTable = tables.find(tb => tb.id === selectedId) || null;
  const selOrder = selTable ? orderByTable[selTable.id] : null;
  const selItems = selOrder ? (itemsByOrd[selOrder.id] || []) : [];

  // Display list for the right panel: edit state when editing, DB state otherwise
  const panelItems = editing
    ? editItems
    : selItems.map(it => ({
        menuItemId: it.menuItemId,
        name:  menuById[it.menuItemId]?.name || 'Item',
        price: Number(it.unitPrice || menuById[it.menuItemId]?.price || 0),
        qty:   Number(it.quantity || 1),
      }));

  const panelSubtotal = panelItems.reduce((s, it) => s + it.price * it.qty, 0);
  const panelTax      = settings.taxEnabled ? Math.round(panelSubtotal * settings.taxRate / 100) : 0;
  const panelTotal    = editing ? panelSubtotal + panelTax : Number(selOrder?.totalAmount || 0);

  // ── Edit mode handlers ───────────────────────────────────────────────────────
  // No parameter on startEdit — it's wired directly as a button onClick, and
  // onClick always passes the DOM event as the first argument, so a default
  // parameter would silently receive that event instead (see OrdersScreen.jsx
  // for the exact bug this caused there). Read selOrder/selTable directly.
  const startEdit = () => {
    if (!selOrder) return;
    const items = selItems.map(it => ({
      menuItemId: it.menuItemId,
      name:  menuById[it.menuItemId]?.name || 'Item',
      price: Number(it.unitPrice || menuById[it.menuItemId]?.price || 0),
      qty:   Number(it.quantity || 1),
    }));
    setEditItems(items);
    setEditType(selOrder.orderType || 'dine_in');
    setEditTable(selTable);
    setPickTable(false);
    setEditCat(null);
    setError('');
    setEditing(true);
  };

  const discardEdit = () => { setEditing(false); setPickTable(false); setError(''); };

  // Weighed items (kg/l/g/ml) need a typed amount, not a blind +1/-1 — same
  // rule Menu's cart follows. `menuItem` here must be the real menu_items row
  // (has `.unit`), not a partial {id,name,price} — see call sites below.
  //
  // `mode: 'add'` (ADD/+ on a weighed item) starts blank and is SUMMED with
  // whatever qty is already on the order — a cashier topping up an existing
  // 0.5 kg by "1.33 more" must end up at 1.83 kg, not have the 0.5 silently
  // overwritten (this was reported as a real mistake risk — see MEMORY.md).
  // `mode: 'set'` (the minus stepper, a correction) keeps the old
  // prefilled/replace behavior.
  const openAmountPicker = (menuItem, mode = 'set') => {
    const current = editItems.find(x => x.menuItemId === menuItem.id)?.qty || 0;
    const unitPrice = Number(menuItem.price || 0);
    const draftBase = mode === 'add' ? '' : (current ? String(current) : '');
    setAmountPicker({
      item: menuItem, mode, existingQty: current,
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
      setEditItems(items => {
        const i = items.findIndex(x => x.menuItemId === item.id);
        if (i >= 0) return items.map((x, idx) => idx === i ? { ...x, qty: newQty } : x);
        return [...items, { menuItemId: item.id, name: item.name, price: Number(item.price || 0), qty: newQty }];
      });
      setAmountPicker(null);
      return;
    }
    if (!isFinite(amt) || amt <= 0) {
      setEditItems(items => items.filter(x => x.menuItemId !== item.id));
      setAmountPicker(null);
      return;
    }
    const rounded = Math.round(amt * 1000) / 1000;
    setEditItems(items => {
      const i = items.findIndex(x => x.menuItemId === item.id);
      if (i >= 0) return items.map((x, idx) => idx === i ? { ...x, qty: rounded } : x);
      return [...items, { menuItemId: item.id, name: item.name, price: Number(item.price || 0), qty: rounded }];
    });
    setAmountPicker(null);
  };

  const editAdd = (menuItem) => {
    if (isWeighedItem(menuItem)) { openAmountPicker(menuItem, 'add'); return; }
    setEditItems(items => {
      const i = items.findIndex(x => x.menuItemId === menuItem.id);
      if (i >= 0) return items.map((x, idx) => idx === i ? { ...x, qty: x.qty + 1 } : x);
      return [...items, { menuItemId: menuItem.id, name: menuItem.name, price: Number(menuItem.price || 0), qty: 1 }];
    });
  };
  const editDec = (menuItemId) => {
    const menuItem = menuById[menuItemId];
    if (menuItem && isWeighedItem(menuItem)) { openAmountPicker(menuItem, 'set'); return; }
    setEditItems(items => items
      .map(x => x.menuItemId === menuItemId ? { ...x, qty: x.qty - 1 } : x)
      .filter(x => x.qty > 0));
  };
  const editRemove = (menuItemId) => setEditItems(items => items.filter(x => x.menuItemId !== menuItemId));

  const saveEdit = async () => {
    if (!selOrder || busy) return;
    if (!editItems.length) { setError(t('An order needs at least one item', lang)); return; }
    if (editType === 'dine_in' && !editTable) { setError(t('Dine-in orders need a table', lang)); setPickTable(true); return; }
    setBusy(true);
    setError('');
    try {
      // Old (pre-edit) quantities, captured BEFORE the write — itemsByOrd is
      // this screen's own already-existing "original" source (polling is
      // paused while editing, see the `if (!editing) load()` interval below,
      // so it stays frozen at the pre-edit state for the whole edit session;
      // this screen never built a separate `snapshot` state the way
      // OrdersScreen.jsx did, so this is the equivalent existing mechanism,
      // not a new parallel one).
      const oldQtyByItem = Object.fromEntries(
        (itemsByOrd[selOrder.id] || []).map(it => [it.menuItemId, Number(it.quantity || 1)])
      );
      const res = await window.electronAPI.ordersUpdate(selOrder.id, {
        order_type: editType,
        table_id:   editType === 'dine_in' ? (editTable?.id || null) : null,
        items:      editItems.map(it => ({ menu_item_id: it.menuItemId, quantity: it.qty })),
      });
      if (!res.ok) { setError(res.error || t('Failed to save changes', lang)); return; }
      showToast(t('Order updated', lang));
      // ── Kitchen ticket for what's NEW or INCREASED only ──────────────────
      // orders:update (PUT /orders/:id) has no backend print trigger at all
      // (unlike create/addItems) — this is the only print signal an edit-save
      // ever gets. Only a positive delta (brand-new item, or an existing one
      // whose qty went up) gets printed — never reprint something already on
      // the order unchanged or decreased. Best-effort, never blocks/affects
      // the save that already succeeded.
      try {
        const diffItems = editItems
          .map(it => ({ it, delta: it.qty - (oldQtyByItem[it.menuItemId] || 0) }))
          .filter(({ delta }) => delta > 0)
          .map(({ it, delta }) => {
            const mi = menuById[it.menuItemId];
            return { name: it.name, quantity: delta, unit: mi?.unit, notes: null, kitchenStation: mi?.kitchenStation };
          });
        if (diffItems.length > 0) {
          const printRes = await window.electronAPI.printKitchenTicket({
            order: {
              dailyNumber: selOrder.dailyNumber,
              tableName: editType === 'dine_in' ? (editTable ? (editTable.name || tableFallbackLabel(editTable.tableNumber, lang)) : null) : null,
              orderType: editType,
              customerName: selOrder.customerName || null,
              customerPhone: selOrder.customerPhone || null,
              deliveryAddress: selOrder.deliveryAddress || null,
            },
            items: diffItems,
            printers: settings.kitchenPrinters,
            show: settings.kitchenShow,
          });
          if (printRes?.failed?.length > 0) {
            showToast(t('Some kitchen printers did not respond — check the ticket manually', lang), false);
          }
        }
      } catch { /* printing is best-effort — never affects the save that already succeeded */ }
      setEditing(false);
      setPickTable(false);
      // Follow the order to its (possibly new) table, or deselect if it left
      // the floor entirely (switched to takeout/delivery) — this screen is
      // table-centric, so a non-dine-in order has nothing to stay selected on.
      setSelectedId(editType === 'dine_in' ? (editTable?.id || null) : null);
      load();
    } finally { setBusy(false); }
  };

  // Charge (existing order) — same pattern as Orders: PaymentModal wraps a
  // PUT /orders/:id/pay via ordersPay, read-only steppers since qty edits go
  // through Edit mode.
  const payEntries = panelItems.map(it => ({
    item: { id: it.menuItemId, name: it.name, price: it.price, unit: menuById[it.menuItemId]?.unit || 'piece' },
    qty:  it.qty,
  }));
  const submitPay = async (payPayload) => {
    const res = await window.electronAPI.ordersPay(selOrder.id, payPayload);
    if (!res.ok) return { ok: false, error: res.error || 'Payment failed' };
    return { ok: true };
  };

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={34} color={T.green} style={{ animation: 'posspin 1s linear infinite' }} />
      <style>{`@keyframes posspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

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

        {editing && pickTable ? (
          /* ── Floor plan picker (edit mode) ── */
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{tt(lang, 'Choose a table for Order #{n}', '#{n}-buyurtma uchun stol tanlang', { n: selOrder?.dailyNumber })}</span>
                <span style={{ fontSize: 12, color: T.muted, marginLeft: 10 }}>{t('tap a table to assign it', lang)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {[['Available', T.green], ['Occupied', T.coral], ['Reserved', T.amber], ['Needs Bill', T.blue]].map(([lbl, clr]) => (
                  <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: T.muted }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: clr }} />{t(lbl, lang)}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 14 }}>
              {tables.map(tb => {
                const sp = statusPill(tb.status || 'free', lang);
                const isSel = editTable?.id === tb.id;
                return (
                  <button key={tb.id} onClick={() => { setEditTable(tb); setPickTable(false); }} style={{
                    ...card, textAlign: 'left', padding: 16, cursor: 'pointer', fontFamily: T.font,
                    border: isSel ? `2px solid ${T.green}` : '2px solid transparent',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 800 }}>{tb.name || tableFallbackLabel(tb.tableNumber, lang)}</span>
                      <span style={pill(sp)}>{sp.label}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.muted }}>{tb.capacity ? tt(lang, '{n} seats', "{n} o'rin", { n: tb.capacity }) : ' '}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : editing ? (
          /* ── Add-items menu (in-place edit mode) ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{tt(lang, 'Add items to Order #{n}', '#{n}-buyurtmaga mahsulot qo’shish', { n: selOrder?.dailyNumber })}</span>
              <span style={{ fontSize: 11.5, color: T.muted, marginLeft: 8 }}>{t('tap ADD to put an item on the order', lang)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              <FilterPill label={t('All', lang)} active={!editCat} onClick={() => setEditCat(null)} />
              {categories.map(c => (
                <FilterPill key={c.id} label={c.name} active={editCat === c.id} onClick={() => setEditCat(editCat === c.id ? null : c.id)} />
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                {menuItems
                  .filter(m => m.isAvailable !== false)
                  .filter(m => !editCat || m.categoryId === editCat)
                  .map(m => (
                    <div key={m.id} style={{ ...card, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: T.greenDark, marginTop: 2 }}>
                          {money(m.price)}{unitSuffix(m) ? ` / ${unitSuffix(m)}` : ''}
                        </div>
                      </div>
                      <button onClick={() => editAdd(m)} style={{
                        border: 'none', borderRadius: T.rBtn, background: T.green, color: '#fff',
                        padding: '9px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                        <Plus size={14} strokeWidth={2.5} /> {t('ADD', lang)}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Zone pills + legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <ZonePill label={t('All', lang)} active={!zone} onClick={() => setZone(null)} />
              {zones.map(z => (
                <ZonePill key={z} label={z} active={zone === z} onClick={() => setZone(zone === z ? null : z)} />
              ))}
              <div style={{ flex: 1 }} />
              {[['Available', T.green], ['Occupied', T.coral], ['Reserved', T.amber], ['Needs Bill', T.blue]].map(([lbl, clr]) => (
                <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: T.muted }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: clr }} />{t(lbl, lang)}
                </span>
              ))}
            </div>

            {/* Table cards */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: T.muted, fontSize: 14 }}>{t('No tables', lang)}</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(225px, 1fr))', gap: 14 }}>
                  {filtered.map(tb => {
                    const o = orderByTable[tb.id];
                    const status = o && (tb.status === 'free' || !tb.status) ? 'occupied' : (tb.status || 'free');
                    const sp = statusPill(o && status === 'occupied' && o.status === 'bill_requested' ? 'needs_bill' : status, lang);
                    const isSel = selectedId === tb.id;
                    return (
                      <button key={tb.id} onClick={() => setSelectedId(tb.id)} style={{
                        ...card, textAlign: 'left', padding: 16, cursor: 'pointer', fontFamily: T.font,
                        border: isSel ? `2px solid ${T.green}` : '2px solid transparent',
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 14.5, fontWeight: 800 }}>{tb.name || tableFallbackLabel(tb.tableNumber, lang)}</span>
                          <span style={pill(sp)}>{sp.label}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: T.muted }}>{tb.capacity ? tt(lang, '{n} seats', "{n} o'rin", { n: tb.capacity }) : ' '}</div>
                        {o && (
                          <div style={{
                            background: T.chipBg, borderRadius: 10, padding: '7px 10px',
                            fontSize: 11, fontWeight: 700, color: T.muted,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {(staff[o.waitressId] || '—')} · {elapsed(o.createdAt, lang)} · {money(o.totalAmount)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ══ Right panel — table's active order ══ */}
      <div style={{
        ...card, borderRadius: T.rCardLg, width: T.rightPanelW, flexShrink: 0,
        display: 'flex', flexDirection: 'column', padding: 18, overflow: 'hidden',
      }}>
        {!selTable ? (
          <Empty icon={<TableIcon size={34} strokeWidth={1.5} />} title={t('Select a table', lang)} sub={t('Tap a table card to see its order', lang)} />
        ) : !selOrder ? (
          <Empty
            icon={<TableIcon size={34} strokeWidth={1.5} />}
            title={selTable.name || tableFallbackLabel(selTable.tableNumber, lang)}
            sub={tt(lang, 'No active order — status: {status}', 'Faol buyurtma yo’q — holati: {status}', { status: statusPill(selTable.status || 'free', lang).label })}
            action={{ label: t('Start an order on Menu', lang), onClick: () => setNav('menu') }}
          />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 17, fontWeight: 800 }}>{tt(lang, 'Order #{n}', '#{n}-buyurtma', { n: selOrder.dailyNumber || selOrder.id.slice(-4) })}</span>
              <span style={pill(statusPill(selOrder.status, lang))}>{statusPill(selOrder.status, lang).label}</span>
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>
              {(() => {
                const type = editing ? editType : 'dine_in';
                const typeLabel = t(type === 'dine_in' ? 'Dine In' : type === 'to_go' ? 'Takeout' : 'Delivery', lang);
                if (type !== 'dine_in') return typeLabel;
                const tableName = editing
                  ? (editTable ? (editTable.name || tableFallbackLabel(editTable.tableNumber, lang)) : t('No table', lang))
                  : (selTable.name || tableFallbackLabel(selTable.tableNumber, lang));
                return `${tableName} · ${typeLabel}`;
              })()}
              {' · '}{elapsed(selOrder.createdAt, lang)}{lang === 'UZ' ? ' oldin' : ' ago'}
            </div>

            {/* Edit-mode: order type + table controls — identical to Orders' edit mode */}
            {editing && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...uppercaseLabel, marginBottom: 6 }}>{t('Order type', lang)}</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {[['dine_in', 'Dine In'], ['to_go', 'Takeout'], ['delivery', 'Delivery']].map(([k, lbl]) => (
                    <button key={k} onClick={() => setEditType(k)} style={{
                      flex: 1, padding: '7px 0', borderRadius: T.rPill, border: 'none', cursor: 'pointer', fontFamily: T.font,
                      background: editType === k ? T.green : T.chipBg, color: editType === k ? '#fff' : T.muted,
                      fontSize: 11.5, fontWeight: 800,
                    }}>
                      {t(lbl, lang)}
                    </button>
                  ))}
                </div>
                {editType === 'dine_in' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, background: T.chipBg, borderRadius: T.rBtn, padding: '9px 12px', fontSize: 12.5, fontWeight: 800 }}>
                      {editTable ? (editTable.name || tableFallbackLabel(editTable.tableNumber, lang)) : t('No table', lang)}
                    </div>
                    <button onClick={() => setPickTable(v => !v)} style={{
                      display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                      border: `1.5px solid ${T.greenTint}`, background: T.greenTint, color: T.greenDark,
                      borderRadius: T.rBtn, padding: '9px 12px', fontSize: 11.5, fontWeight: 800,
                      cursor: 'pointer', fontFamily: T.font, whiteSpace: 'nowrap', transition: 'background .15s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = '#D7F0E2'}
                      onMouseLeave={e => e.currentTarget.style.background = T.greenTint}
                    >
                      <ArrowLeftRight size={13} strokeWidth={2.5} />
                      {t('Change Table', lang)}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: `1px solid ${T.line}`, marginBottom: 10 }}>
              <span style={{
                width: 30, height: 30, borderRadius: 9, background: T.greenTint, color: T.greenDark,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800,
              }}>
                {initials(staff[selOrder.waitressId] || '—')}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{staff[selOrder.waitressId] || '—'}</div>
                <div style={{ fontSize: 10, color: T.faint }}>{t('Waiter', lang)}</div>
              </div>
              <span style={{ fontSize: 11, color: T.faint, fontWeight: 700 }}>{tt(lang, '{n} items', '{n} ta mahsulot', { n: panelItems.length })}</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, marginBottom: 10 }}>
              {panelItems.map(it => (
                <div key={it.menuItemId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.name} <span style={{ color: T.faint, fontWeight: 600 }}>{formatQty(menuById[it.menuItemId], it.qty)}</span>
                    </div>
                  </div>
                  {editing && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <StepBtn onClick={() => editDec(it.menuItemId)}><Minus size={12} strokeWidth={2.5} /></StepBtn>
                      <StepBtn primary onClick={() => editAdd(menuById[it.menuItemId] || { id: it.menuItemId, name: it.name, price: it.price })}><Plus size={12} strokeWidth={2.5} /></StepBtn>
                      <button onClick={() => editRemove(it.menuItemId)} title={t('Remove', lang)} style={{
                        width: 24, height: 24, borderRadius: 8, border: 'none', background: T.coralBg,
                        color: T.coral, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}
                  <div style={{ width: 86, textAlign: 'right', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                    {money(it.price * it.qty)}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 10, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 600 }}>{t('Sub Total', lang)}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted }}>{money(panelSubtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 600 }}>{t('Tax & Fees', lang)}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted }}>
                  {money(editing ? panelTax : Number(selOrder.taxAmount || 0))}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{t('Total', lang)}</span>
                <span style={{ fontSize: 19, fontWeight: 800 }}>{money(panelTotal)}</span>
              </div>
            </div>

            {error && (
              <div style={{
                background: T.coralBg, color: T.coral, borderRadius: T.rBtn, padding: '8px 12px',
                fontSize: 12, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* Print / Edit — fully in-place, no navigation away from Tables */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {editing ? (
                <>
                  <button onClick={discardEdit} style={{
                    flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1.5px solid ${T.coral}`,
                    background: T.surface, color: T.coral, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                  }}>
                    {t('Discard', lang)}
                  </button>
                  <button onClick={saveEdit} disabled={busy} style={{
                    flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
                    background: T.surface, color: T.ink, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    {busy && <Loader2 size={14} style={{ animation: 'posspin 1s linear infinite' }} />}
                    {t('Done', lang)}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => showToast(t('Receipt printing comes with a future step', lang), false)} style={{
                    flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
                    background: T.surface, color: T.ink, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    <Printer size={15} strokeWidth={1.8} /> {t('Print', lang)}
                  </button>
                  <button onClick={startEdit} style={{
                    flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
                    background: T.surface, color: T.ink, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                  }}>
                    {t('Edit', lang)}
                  </button>
                </>
              )}
            </div>
            <button
              onClick={() => { if (!editing) setShowPayment(true); }}
              disabled={editing}
              style={{
                padding: '13px 0', borderRadius: T.rBtn, border: 'none',
                background: T.green, color: '#fff', fontSize: 14.5, fontWeight: 800,
                cursor: editing ? 'default' : 'pointer', fontFamily: T.font, opacity: editing ? 0.5 : 1,
                transition: 'background .15s',
              }}
              onMouseEnter={e => { if (!editing) e.currentTarget.style.background = T.greenDark; }}
              onMouseLeave={e => e.currentTarget.style.background = T.green}
            >
              {tt(lang, 'Charge {amount}', 'Hisob-kitob {amount}', { amount: money(panelTotal) })}
            </button>
          </>
        )}
      </div>

      {/* ══ Payment modal (existing order) ══ */}
      {showPayment && selOrder && (
        <PaymentModal
          entries={payEntries}
          subtotal={panelSubtotal}
          taxAmt={Number(selOrder.taxAmount || 0)}
          total={Number(selOrder.totalAmount || 0)}
          settings={settings}
          lang={lang}
          formatQty={formatQty}
          onQtyChange={() => {}} /* qty edits on existing orders go through Edit mode */
          onClose={() => setShowPayment(false)}
          onSubmit={submitPay}
          onDone={() => { setShowPayment(false); setSelectedId(null); showToast(t('Payment complete', lang)); load(); }}
        />
      )}

      {/* ══ Amount picker modal (weighed items, edit mode) ══ */}
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
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────────

function ZonePill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', borderRadius: T.rPill, border: 'none', cursor: 'pointer', fontFamily: T.font,
      background: active ? T.green : T.surface, color: active ? '#fff' : T.muted,
      fontSize: 12, fontWeight: 800, boxShadow: active ? 'none' : T.cardShadow,
      transition: 'background .15s, color .15s', flexShrink: 0,
    }}>
      {label}
    </button>
  );
}

function FilterPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: T.rPill, border: 'none', cursor: 'pointer', fontFamily: T.font,
      background: active ? T.green : T.surface, color: active ? '#fff' : T.muted,
      fontSize: 11.5, fontWeight: 800, boxShadow: active ? 'none' : T.cardShadow, flexShrink: 0,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </button>
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

function Empty({ icon, title, sub, action }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: T.faint, gap: 8 }}>
      {icon}
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.muted }}>{title}</div>
      <div style={{ fontSize: 11.5 }}>{sub}</div>
      {action && (
        <button onClick={action.onClick} style={{
          marginTop: 10, padding: '9px 18px', borderRadius: T.rBtn, border: 'none',
          background: T.greenTint, color: T.greenDark, fontSize: 12.5, fontWeight: 800,
          cursor: 'pointer', fontFamily: T.font,
        }}>
          {action.label}
        </button>
      )}
    </div>
  );
}
