import { useState, useEffect, useMemo } from 'react';
import {
  Minus, Plus, X, Printer, Loader2, CheckCircle2, AlertCircle, Eye,
} from 'lucide-react';
import { camelizeRows } from '../../lib/case.js';
import { T, card, pill, statusPill, uppercaseLabel, initials, fmtMoney } from './tokens.js';
import PaymentModal from './PaymentModal.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Orders screen — live order cards + right detail panel + edit mode.
// Design handoff screens 3 (list), 4 (edit / add-items) and 5 (floor plan).
//
// Reads: local PowerSync (orders, order_items, menu_items, users,
// restaurant_tables) — all synced tables, works offline, polls every 4s.
// Writes: PUT /orders/:id via ordersUpdate (send the FULL items list — the
// backend diffs old vs new and adjusts ingredient stock), PUT /orders/:id/pay
// via the shared PaymentModal.
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_FILTERS = [
  { key: null,       label: 'All Orders' },
  { key: 'dine_in',  label: 'Dine In'   },
  { key: 'to_go',    label: 'Takeout'   },
  { key: 'delivery', label: 'Delivery'  },
];

const ACTIVE_STATUSES = "('pending','sent_to_kitchen','preparing','ready','served','bill_requested')";

const timeAgo = (iso) => {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
};

export default function OrdersScreen({ user, settings, search }) {
  const symbol = settings.currencySymbol;
  const money  = (n) => fmtMoney(n, symbol);

  // ── Data ──────────────────────────────────────────────────────────────────
  const [orders,     setOrders]     = useState([]);
  const [itemsByOrd, setItemsByOrd] = useState({});
  const [menuItems,  setMenuItems]  = useState([]);
  const [categories, setCategories] = useState([]);
  const [tables,     setTables]     = useState([]);
  const [staff,      setStaff]      = useState({});
  const [loading,    setLoading]    = useState(true);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [typeFilter, setTypeFilter]   = useState(null);
  const [selectedId, setSelectedId]   = useState(null);
  const [editing,    setEditing]      = useState(false);
  const [editItems,  setEditItems]    = useState([]);   // [{ menuItemId, name, unit, price, qty }]
  const [editType,   setEditType]     = useState('dine_in');
  const [editTable,  setEditTable]    = useState(null); // table object or null
  const [snapshot,   setSnapshot]     = useState(null);
  const [pickTable,  setPickTable]    = useState(false);
  const [editCat,    setEditCat]      = useState(null);
  const [busy,       setBusy]         = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [toast,      setToast]        = useState(null);
  const [error,      setError]        = useState('');

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  // ── Load + poll ───────────────────────────────────────────────────────────
  const load = async (first = false) => {
    try {
      const [ords, mi, cats, tbls, users] = await Promise.all([
        window.electronAPI.psGetAll(`SELECT * FROM orders WHERE status IN ${ACTIVE_STATUSES} ORDER BY created_at DESC`),
        window.electronAPI.psGetAll('SELECT * FROM menu_items ORDER BY sort_order'),
        window.electronAPI.psGetAll('SELECT * FROM categories ORDER BY sort_order'),
        window.electronAPI.psGetAll('SELECT * FROM restaurant_tables ORDER BY table_number'),
        window.electronAPI.psGetAll('SELECT id, name FROM users'),
      ]);
      const orderRows = camelizeRows(ords);
      setOrders(orderRows);
      setMenuItems(camelizeRows(mi));
      setCategories(camelizeRows(cats));
      setTables(camelizeRows(tbls));
      setStaff(Object.fromEntries(camelizeRows(users).map(u => [u.id, u.name])));

      if (orderRows.length) {
        const ids = orderRows.map(o => `'${o.id}'`).join(',');
        const items = await window.electronAPI.psGetAll(
          `SELECT * FROM order_items WHERE order_id IN (${ids})`
        );
        const map = {};
        for (const it of camelizeRows(items)) (map[it.orderId] = map[it.orderId] || []).push(it);
        setItemsByOrd(map);
      } else {
        setItemsByOrd({});
      }
    } catch {
      if (first) showToast('Failed to load orders', false);
    } finally { if (first) setLoading(false); }
  };

  useEffect(() => {
    load(true);
    const t = setInterval(() => { if (!editing) load(); }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const menuById  = useMemo(() => Object.fromEntries(menuItems.map(m => [m.id, m])), [menuItems]);
  const tableById = useMemo(() => Object.fromEntries(tables.map(t => [t.id, t])), [tables]);

  const tableLabelOf = (tid) => {
    const tb = tableById[tid];
    return tb ? (tb.name || `Table ${tb.tableNumber}`) : null;
  };

  const filtered = useMemo(() => {
    let list = orders;
    if (typeFilter) list = list.filter(o => o.orderType === typeFilter);
    if (search?.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        String(o.dailyNumber || '').includes(q) ||
        (tableLabelOf(o.tableId) || '').toLowerCase().includes(q) ||
        (staff[o.waitressId] || '').toLowerCase().includes(q));
    }
    return list;
  }, [orders, typeFilter, search, staff, tableById]);

  const selected = orders.find(o => o.id === selectedId) || null;
  const selItems = selected ? (itemsByOrd[selected.id] || []) : [];

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
  const panelTotal    = editing ? panelSubtotal + panelTax : Number(selected?.totalAmount || 0);

  // ── Edit mode ─────────────────────────────────────────────────────────────
  // No parameter here on purpose — this is wired directly as a button
  // onClick, and onClick always passes the DOM event as the first argument.
  // A `(ord = selected) =>` signature would silently receive that event
  // instead of falling back to `selected` (the event is truthy, so the
  // default never kicks in), and `event.id`/`event.tableId` are undefined —
  // exactly what caused items/table to blank out when Edit was clicked.
  const startEdit = () => {
    if (!selected) return;
    const items = (itemsByOrd[selected.id] || []).map(it => ({
      menuItemId: it.menuItemId,
      name:  menuById[it.menuItemId]?.name || 'Item',
      price: Number(it.unitPrice || menuById[it.menuItemId]?.price || 0),
      qty:   Number(it.quantity || 1),
    }));
    setEditItems(items);
    setEditType(selected.orderType || 'dine_in');
    setEditTable(tableById[selected.tableId] || null);
    setSnapshot({ items: JSON.parse(JSON.stringify(items)), type: selected.orderType, tableId: selected.tableId });
    setEditing(true);
    setPickTable(false);
    setEditCat(null);
    setError('');
  };

  const discardEdit = () => {
    setEditing(false); setPickTable(false); setSnapshot(null); setError('');
  };

  const editAdd = (menuItem) => {
    setEditItems(items => {
      const i = items.findIndex(x => x.menuItemId === menuItem.id);
      if (i >= 0) return items.map((x, idx) => idx === i ? { ...x, qty: x.qty + 1 } : x);
      return [...items, { menuItemId: menuItem.id, name: menuItem.name, price: Number(menuItem.price || 0), qty: 1 }];
    });
  };
  const editDec = (menuItemId) => {
    setEditItems(items => items
      .map(x => x.menuItemId === menuItemId ? { ...x, qty: x.qty - 1 } : x)
      .filter(x => x.qty > 0));
  };
  const editRemove = (menuItemId) => setEditItems(items => items.filter(x => x.menuItemId !== menuItemId));

  const saveEdit = async () => {
    if (!selected || busy) return;
    if (!editItems.length) { setError('An order needs at least one item'); return; }
    if (editType === 'dine_in' && !editTable) { setError('Dine-in orders need a table'); setPickTable(true); return; }
    setBusy(true);
    setError('');
    try {
      const res = await window.electronAPI.ordersUpdate(selected.id, {
        order_type: editType,
        table_id:   editType === 'dine_in' ? (editTable?.id || null) : null,
        items:      editItems.map(it => ({ menu_item_id: it.menuItemId, quantity: it.qty })),
      });
      if (!res.ok) { setError(res.error || 'Failed to save changes'); return; }
      showToast('Order updated');
      setEditing(false); setPickTable(false); setSnapshot(null);
      load();
    } finally { setBusy(false); }
  };

  // ── Charge (existing order) ───────────────────────────────────────────────
  const submitPay = async (payPayload) => {
    const res = await window.electronAPI.ordersPay(selected.id, payPayload);
    if (!res.ok) return { ok: false, error: res.error || 'Payment failed' };
    return { ok: true };
  };

  // Entries shape for PaymentModal (read-only steppers on existing orders)
  const payEntries = panelItems.map(it => ({
    item: { id: it.menuItemId, name: it.name, price: it.price, unit: 'piece' },
    qty:  it.qty,
  }));

  // ── Render ────────────────────────────────────────────────────────────────
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

        {/* Filter pills + count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {TYPE_FILTERS.map(f => {
            const active = typeFilter === f.key;
            return (
              <button key={String(f.key)} onClick={() => setTypeFilter(f.key)} style={{
                padding: '8px 16px', borderRadius: T.rPill, border: 'none', cursor: 'pointer', fontFamily: T.font,
                background: active ? T.green : T.surface, color: active ? '#fff' : T.muted,
                fontSize: 12, fontWeight: 800, boxShadow: active ? 'none' : T.cardShadow,
                transition: 'background .15s, color .15s',
              }}>
                {f.label}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>{filtered.length} active orders</span>
        </div>

        {editing && pickTable ? (
          /* ── Floor plan picker (edit mode) ── */
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 800 }}>Choose a table for Order #{selected?.dailyNumber}</span>
                <span style={{ fontSize: 12, color: T.muted, marginLeft: 10 }}>tap a table to assign it</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {[['Available', T.green], ['Occupied', T.coral], ['Reserved', T.amber], ['Needs Bill', T.blue]].map(([lbl, clr]) => (
                  <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: T.muted }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: clr }} />{lbl}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 14 }}>
              {tables.map(tb => {
                const sp = statusPill(tb.status || 'free');
                const isSel = editTable?.id === tb.id;
                return (
                  <button key={tb.id} onClick={() => { setEditTable(tb); setPickTable(false); }} style={{
                    ...card, textAlign: 'left', padding: 16, cursor: 'pointer', fontFamily: T.font,
                    border: isSel ? `2px solid ${T.green}` : '2px solid transparent',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 800 }}>{tb.name || `Table ${tb.tableNumber}`}</span>
                      <span style={pill(sp)}>{sp.label}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.muted }}>{tb.capacity ? `${tb.capacity} seats` : ' '}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : editing ? (
          /* ── Add-items menu (edit mode) ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 800 }}>Add items to Order #{selected?.dailyNumber}</span>
              <span style={{ fontSize: 11.5, color: T.muted, marginLeft: 8 }}>tap ADD to put an item on the order</span>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              <FilterPill label="All" active={!editCat} onClick={() => setEditCat(null)} />
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
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: T.greenDark, marginTop: 2 }}>{money(m.price)}</div>
                      </div>
                      <button onClick={() => editAdd(m)} style={{
                        border: 'none', borderRadius: T.rBtn, background: T.green, color: '#fff',
                        padding: '9px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                        <Plus size={14} strokeWidth={2.5} /> ADD
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Order cards grid ── */
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: T.muted, fontSize: 14 }}>No active orders</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
                {filtered.map(o => {
                  const sp = statusPill(o.status);
                  const isSel = selectedId === o.id;
                  const waiter = staff[o.waitressId] || '—';
                  const count = (itemsByOrd[o.id] || []).length;
                  const place = o.orderType === 'dine_in'
                    ? (tableLabelOf(o.tableId) || 'Dine In')
                    : (o.orderType === 'to_go' ? 'Takeout' : 'Delivery');
                  return (
                    <button key={o.id} onClick={() => { setSelectedId(o.id); setEditing(false); }} style={{
                      ...card, textAlign: 'left', padding: 16, cursor: 'pointer', fontFamily: T.font,
                      border: isSel ? `2px solid ${T.green}` : '2px solid transparent',
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 800 }}>#{o.dailyNumber || o.id.slice(-4)}</span>
                        <span style={{ flexShrink: 0, ...pill(sp) }}>{sp.label}</span>
                      </div>
                      <div style={{ fontSize: 11.5, display: 'flex', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box', gap: 8 }}>
                        <span style={{ color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{place}</span>
                        <span style={{ color: T.faint, flexShrink: 0 }}>{timeAgo(o.createdAt)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <span style={{
                            width: 26, height: 26, borderRadius: 8, background: T.greenTint, color: T.greenDark,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0,
                          }}>
                            {initials(waiter)}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {waiter}
                          </span>
                        </span>
                        <span style={{ fontSize: 11, color: T.faint, fontWeight: 700, flexShrink: 0 }}>{count} items</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box', alignItems: 'center' }}>
                        <span style={{ fontSize: 15.5, fontWeight: 800 }}>{money(o.totalAmount)}</span>
                        <span style={{
                          width: 30, height: 30, borderRadius: 10, background: T.chipBg, color: T.muted,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <Eye size={15} strokeWidth={1.8} />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ Right panel — selected order detail ══ */}
      <div style={{
        ...card, borderRadius: T.rCardLg, width: T.rightPanelW, flexShrink: 0,
        display: 'flex', flexDirection: 'column', padding: 18, overflow: 'hidden',
      }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: T.faint, gap: 8 }}>
            <Eye size={34} strokeWidth={1.5} />
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.muted }}>Select an order</div>
            <div style={{ fontSize: 11.5 }}>Tap an order card to see its details</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 17, fontWeight: 800 }}>Order #{selected.dailyNumber || selected.id.slice(-4)}</span>
              <span style={pill(statusPill(selected.status))}>{statusPill(selected.status).label}</span>
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>
              {(() => {
                const type = editing ? editType : selected.orderType;
                const typeLabel = type === 'dine_in' ? 'Dine In' : type === 'to_go' ? 'Takeout' : 'Delivery';
                if (type !== 'dine_in') return typeLabel;
                const tableName = editing
                  ? (editTable ? (editTable.name || `Table ${editTable.tableNumber}`) : 'No table')
                  : (tableLabelOf(selected.tableId) || 'No table');
                return `${tableName} · ${typeLabel}`;
              })()}
              {' · '}{timeAgo(selected.createdAt)}
            </div>

            {/* Edit-mode: order type + table controls */}
            {editing && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...uppercaseLabel, marginBottom: 6 }}>Order type</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {[['dine_in', 'Dine In'], ['to_go', 'Takeout'], ['delivery', 'Delivery']].map(([k, lbl]) => (
                    <button key={k} onClick={() => setEditType(k)} style={{
                      flex: 1, padding: '7px 0', borderRadius: T.rPill, border: 'none', cursor: 'pointer', fontFamily: T.font,
                      background: editType === k ? T.green : T.chipBg, color: editType === k ? '#fff' : T.muted,
                      fontSize: 11.5, fontWeight: 800,
                    }}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {editType === 'dine_in' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, background: T.chipBg, borderRadius: T.rBtn, padding: '9px 12px', fontSize: 12.5, fontWeight: 800 }}>
                      {editTable ? (editTable.name || `Table ${editTable.tableNumber}`) : 'No table'}
                    </div>
                    <button onClick={() => setPickTable(v => !v)} style={{
                      border: 'none', background: 'transparent', color: T.greenDark, fontSize: 11.5,
                      fontWeight: 800, cursor: 'pointer', fontFamily: T.font, whiteSpace: 'nowrap',
                    }}>
                      Change on floor plan
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Waiter row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: `1px solid ${T.line}`, marginBottom: 10 }}>
              <span style={{
                width: 30, height: 30, borderRadius: 9, background: T.greenTint, color: T.greenDark,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800,
              }}>
                {initials(staff[selected.waitressId] || '—')}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{staff[selected.waitressId] || '—'}</div>
                <div style={{ fontSize: 10, color: T.faint }}>Waiter</div>
              </div>
              <span style={{ fontSize: 11, color: T.faint, fontWeight: 700 }}>{panelItems.length} items</span>
            </div>

            {/* Items */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, marginBottom: 10 }}>
              {panelItems.map(it => (
                <div key={it.menuItemId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.name} <span style={{ color: T.faint, fontWeight: 600 }}>×{it.qty}</span>
                    </div>
                  </div>
                  {editing && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <StepBtn onClick={() => editDec(it.menuItemId)}><Minus size={12} strokeWidth={2.5} /></StepBtn>
                      <StepBtn primary onClick={() => editAdd({ id: it.menuItemId, name: it.name, price: it.price })}><Plus size={12} strokeWidth={2.5} /></StepBtn>
                      <button onClick={() => editRemove(it.menuItemId)} title="Remove" style={{
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

            {/* Totals */}
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 10, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 600 }}>Sub Total</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted }}>{money(panelSubtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 600 }}>Tax & Fees</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted }}>
                  {money(editing ? panelTax : Number(selected.taxAmount || 0))}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>Total</span>
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

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {editing ? (
                <>
                  <button onClick={discardEdit} style={{
                    flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1.5px solid ${T.coral}`,
                    background: T.surface, color: T.coral, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                  }}>
                    Discard
                  </button>
                  <button onClick={saveEdit} disabled={busy} style={{
                    flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
                    background: T.surface, color: T.ink, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    {busy && <Loader2 size={14} style={{ animation: 'posspin 1s linear infinite' }} />}
                    Done
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => showToast('Receipt printing comes with the History step', false)} style={{
                    flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
                    background: T.surface, color: T.ink, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    <Printer size={15} strokeWidth={1.8} /> Print
                  </button>
                  <button onClick={startEdit} style={{
                    flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
                    background: T.surface, color: T.ink, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                  }}>
                    Edit
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
              Charge {money(panelTotal)}
            </button>
          </>
        )}
      </div>

      {/* ══ Payment modal (existing order) ══ */}
      {showPayment && selected && (
        <PaymentModal
          entries={payEntries}
          subtotal={panelSubtotal}
          taxAmt={Number(selected.taxAmount || 0)}
          total={Number(selected.totalAmount || 0)}
          settings={settings}
          formatQty={(_it, q) => `×${q}`}
          onQtyChange={() => {}} /* qty edits on existing orders go through Edit mode */
          onClose={() => setShowPayment(false)}
          onSubmit={submitPay}
          onDone={() => { setShowPayment(false); setSelectedId(null); showToast('Payment complete'); load(); }}
        />
      )}
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────────

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
