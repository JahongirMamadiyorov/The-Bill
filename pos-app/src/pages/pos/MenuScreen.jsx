import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Minus, X, Printer, Flame,
  UtensilsCrossed, ShoppingBag, Truck, Settings2, ArrowLeftRight,
  DollarSign, Tag, Wine, Pizza, Fish, Coffee, ChefHat, Users,
  ImageOff, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { camelizeRows } from '../../lib/case.js';
import { T, card, pill, statusPill, uppercaseLabel, initials, fmtMoney } from './tokens.js';
import PaymentModal from './PaymentModal.jsx';

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

// ── Weighed items (kg/l/g/ml) — type-an-amount instead of stepper ─────────────
const isWeighedItem = (item) => {
  const u = String(item?.unit || 'piece').toLowerCase();
  return u === 'kg' || u === 'l' || u === 'g' || u === 'ml';
};
const unitSuffix = (item) => {
  const u = String(item?.unit || 'piece').toLowerCase();
  return u === 'piece' ? '' : u;
};
const formatQty = (item, qty) => {
  if (isWeighedItem(item)) {
    const n = Number(qty || 0);
    const trimmed = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '');
    return `${trimmed} ${unitSuffix(item)}`;
  }
  return `×${qty}`;
};

const CART_KEY = 'pos.cart.v1';

export default function MenuScreen({ user, settings, search }) {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState([]);
  const [items,      setItems]      = useState([]);
  const [tables,     setTables]     = useState([]);
  const [loading,    setLoading]    = useState(true);

  // ── Order state ───────────────────────────────────────────────────────────
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; }
  });
  const [orderType, setOrderType]   = useState('dine_in');
  const [selTable,  setSelTable]    = useState(null);
  const [custName,  setCustName]    = useState('');
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
      const [cats, menuItems, tbls] = await Promise.all([
        window.electronAPI.psGetAll('SELECT * FROM categories ORDER BY sort_order'),
        window.electronAPI.psGetAll('SELECT * FROM menu_items ORDER BY sort_order'),
        window.electronAPI.psGetAll('SELECT * FROM restaurant_tables ORDER BY table_number'),
      ]);
      setCategories(camelizeRows(cats));
      setItems(camelizeRows(menuItems).filter(i => i.isAvailable !== false));
      setTables(camelizeRows(tbls));
    } catch {
      showToast('Failed to load menu data', false);
    } finally { setLoading(false); }
  };

  // Poll tables while the picker is open so statuses stay live.
  useEffect(() => {
    if (!showTablePicker) return;
    const t = setInterval(async () => {
      try {
        const rows = await window.electronAPI.psGetAll('SELECT * FROM restaurant_tables ORDER BY table_number');
        setTables(camelizeRows(rows));
      } catch {}
    }, 4000);
    return () => clearInterval(t);
  }, [showTablePicker]);

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

  const cartEntries = useMemo(() => Object.values(cart), [cart]);
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

  // ── Cart actions ──────────────────────────────────────────────────────────
  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const openAmountPicker = (item) => {
    const current   = cart[item.id]?.qty || '';
    const unitPrice = Number(item.price || 0);
    setAmountPicker({
      item,
      draft:      current ? String(current) : '',
      priceDraft: current ? String(Math.round(Number(current) * unitPrice)) : '',
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
    if (isWeighedItem(item)) { openAmountPicker(item); return; }
    setCart(p => ({ ...p, [item.id]: { item, qty: (p[item.id]?.qty || 0) + 1 } }));
  };
  const decItem = (id) => {
    const entry = cart[id];
    if (!entry) return;
    if (isWeighedItem(entry.item)) { openAmountPicker(entry.item); return; }
    setCart(p => {
      if (!p[id]) return p;
      if (p[id].qty <= 1) { const n = { ...p }; delete n[id]; return n; }
      return { ...p, [id]: { ...p[id], qty: p[id].qty - 1 } };
    });
  };
  const delItem = (id) => setCart(p => { const n = { ...p }; delete n[id]; return n; });
  const clearOrder = () => {
    setCart({}); setSelTable(null); setOrderType('dine_in');
    setCustName(''); setCustAddr(''); setError(''); setShowTablePicker(false);
  };

  // ── Order submit ──────────────────────────────────────────────────────────
  const buildOrderPayload = () => ({
    table_id:   selTable?.id || null,
    order_type: orderType,
    items:      cartEntries.map(e => ({ menu_item_id: e.item.id, quantity: e.qty })),
    ...(custName && { customer_name: custName }),
    ...(custAddr && { delivery_address: custAddr }),
  });

  const validateOrder = () => {
    if (orderType === 'dine_in' && !selTable) {
      setError('Please select a table for this dine-in order');
      setShowTablePicker(true);
      return false;
    }
    return true;
  };

  const handleFire = async () => {
    if (!cartEntries.length || submitting) return;
    setError('');
    if (!validateOrder()) return;
    setSubmitting(true);
    try {
      const res = await window.electronAPI.ordersCreate(buildOrderPayload());
      if (!res.ok) { setError(res.error || 'Failed to send order'); return; }
      showToast('Order sent to kitchen');
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
    ? (selTable.name || `Table ${selTable.tableNumber}`)
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
                <span style={{ fontSize: 16, fontWeight: 800 }}>Choose a table</span>
                <span style={{ fontSize: 12, color: T.muted, marginLeft: 10 }}>tap a table to assign it</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {[['Available', T.green], ['Occupied', T.coral], ['Reserved', T.amber], ['Needs Bill', T.blue]].map(([lbl, clr]) => (
                  <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: T.muted }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: clr }} />{lbl}
                  </span>
                ))}
                <button onClick={() => setShowTablePicker(false)} style={{
                  border: 'none', background: T.surface, boxShadow: T.cardShadow, borderRadius: T.rBtn,
                  padding: '8px 14px', fontSize: 12.5, fontWeight: 700, color: T.muted, cursor: 'pointer', fontFamily: T.font,
                }}>
                  Back to menu
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 14 }}>
              {tables.map(tb => {
                const sp = statusPill(tb.status || 'free');
                const isSel = selTable?.id === tb.id;
                return (
                  <button key={tb.id} onClick={() => { setSelTable(tb); setShowTablePicker(false); setError(''); }} style={{
                    ...card, textAlign: 'left', padding: 16, cursor: 'pointer', fontFamily: T.font,
                    border: isSel ? `2px solid ${T.green}` : '2px solid transparent',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>
                        {tb.name || `Table ${tb.tableNumber}`}
                      </span>
                      <span style={pill(sp)}>{sp.label}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.muted }}>
                      {tb.capacity ? `${tb.capacity} seats` : ' '}
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
                  label="All" Icon={UtensilsCrossed}
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
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Menu</div>
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
                          ? <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                          <Plus size={14} strokeWidth={2.5} /> ADD
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
                <div style={{ padding: 60, textAlign: 'center', color: T.muted, fontSize: 14 }}>No items found</div>
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
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>Order Details</div>

        {/* Staff / date block */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>{user.name || 'Cashier'}</div>
            <div style={{ fontSize: 10.5, color: T.muted }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
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
              <button key={key} onClick={() => { setOrderType(key); if (key !== 'dine_in') { setSelTable(null); setShowTablePicker(false); } }} style={{
                flex: 1, padding: '8px 0', borderRadius: T.rPill, cursor: 'pointer', fontFamily: T.font,
                border: 'none', fontSize: 12, fontWeight: 800, transition: 'background .15s, color .15s',
                background: active ? T.green : T.chipBg, color: active ? '#fff' : T.muted,
              }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* Order / Table / Server strip */}
        <div style={{
          display: 'flex', alignItems: 'stretch', borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}`,
          padding: '10px 0', marginBottom: 10, gap: 8,
        }}>
          <div style={{ flex: 1 }}>
            <div style={uppercaseLabel}>Order</div>
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>New</div>
          </div>
          {orderType === 'dine_in' ? (
            <button onClick={() => setShowTablePicker(v => !v)} style={{
              flex: 1, textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: T.font, padding: 0,
            }}>
              <div style={uppercaseLabel}>Table</div>
              <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2, color: tableLabel ? T.ink : T.coral }}>
                {tableLabel || 'Select…'}
              </div>
            </button>
          ) : (
            <div style={{ flex: 1.4 }}>
              <div style={uppercaseLabel}>Customer</div>
              <input
                value={custName} onChange={e => setCustName(e.target.value)} placeholder="Name…"
                style={{
                  border: 'none', outline: 'none', background: 'transparent', fontFamily: T.font,
                  fontSize: 13, fontWeight: 700, color: T.ink, width: '100%', padding: 0, marginTop: 2,
                }}
              />
            </div>
          )}
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={uppercaseLabel}>Server</div>
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{(user.name || '').split(' ')[0] || '—'}</div>
          </div>
        </div>

        {orderType === 'delivery' && (
          <input
            value={custAddr} onChange={e => setCustAddr(e.target.value)} placeholder="Delivery address…"
            style={{
              border: `1px solid ${T.line}`, borderRadius: T.rBtn, padding: '9px 12px', fontSize: 12.5,
              fontFamily: T.font, color: T.ink, outline: 'none', marginBottom: 10,
            }}
          />
        )}

        {/* Cart — grouped by category */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, marginBottom: 10 }}>
          {cartEntries.length === 0 ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', color: T.faint, gap: 8,
            }}>
              <ShoppingBag size={34} strokeWidth={1.5} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.muted }}>Cart is empty</div>
              <div style={{ fontSize: 11.5 }}>Add items from the menu</div>
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
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <StepBtn onClick={() => decItem(e.item.id)}><Minus size={12} strokeWidth={2.5} /></StepBtn>
                      <StepBtn primary onClick={() => addItem(e.item)}><Plus size={12} strokeWidth={2.5} /></StepBtn>
                      <button onClick={() => delItem(e.item.id)} title="Remove" style={{
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

        {/* Totals */}
        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 10, marginBottom: 12 }}>
          <TotalRow label="Sub Total" value={money(subtotal)} />
          {settings.taxEnabled && <TotalRow label={`Tax (${settings.taxRate}%)`} value={money(taxAmt)} />}
          {settings.serviceChargeEnabled && svcAmt > 0 && (
            <TotalRow label={`Service Charge (${settings.serviceChargeRate}%)`} value={money(svcAmt)} note="not charged" />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Total</span>
            <span style={{ fontSize: 19, fontWeight: 800 }}>{money(total)}</span>
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
          <button onClick={() => showToast('Receipt printing comes with the History step', false)} style={{
            flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
            background: T.surface, color: T.ink, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Printer size={15} strokeWidth={1.8} /> Print
          </button>
          <button onClick={handleFire} disabled={submitting || !cartEntries.length} style={{
            flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: 'none',
            background: T.fire, color: '#fff', fontSize: 13, fontWeight: 800,
            cursor: cartEntries.length ? 'pointer' : 'default', fontFamily: T.font,
            opacity: cartEntries.length ? 1 : 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {submitting ? <Loader2 size={15} style={{ animation: 'posspin 1s linear infinite' }} /> : <Flame size={15} strokeWidth={1.8} />}
            Fire
          </button>
        </div>
        <button onClick={handleChargeClick} disabled={!cartEntries.length} style={{
          padding: '13px 0', borderRadius: T.rBtn, border: 'none',
          background: T.green, color: '#fff', fontSize: 14.5, fontWeight: 800,
          cursor: cartEntries.length ? 'pointer' : 'default', fontFamily: T.font,
          opacity: cartEntries.length ? 1 : 0.5, transition: 'background .15s',
        }}
          onMouseEnter={e => { if (cartEntries.length) e.currentTarget.style.background = T.greenDark; }}
          onMouseLeave={e => e.currentTarget.style.background = T.green}
        >
          Charge {money(total)}
        </button>
      </div>

      {/* ══ Amount picker modal (weighed items) ══ */}
      {amountPicker && (
        <div
          style={{
            position: 'fixed', inset: 0, background: T.backdrop, zIndex: 70,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => setAmountPicker(null)}
        >
          <div
            style={{ ...card, borderRadius: T.rCardLg, width: '100%', maxWidth: 360, overflow: 'hidden', boxShadow: T.modalShadow }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ background: T.greenTint, padding: '16px 20px 14px' }}>
              <div style={{ ...uppercaseLabel, color: T.greenDark }}>Enter amount</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{amountPicker.item.name}</div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
                {money(amountPicker.item.price)} per {unitSuffix(amountPicker.item)}
              </div>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={uppercaseLabel}>Amount ({unitSuffix(amountPicker.item)})</span>
                <input
                  autoFocus value={amountPicker.draft}
                  onChange={e => onAmountQtyChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmAmountPicker()}
                  inputMode="decimal" placeholder="0"
                  style={{
                    border: `1.5px solid ${T.line}`, borderRadius: T.rBtn, padding: '11px 12px',
                    fontSize: 16, fontWeight: 800, fontFamily: T.font, color: T.ink, outline: 'none',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={uppercaseLabel}>Or price ({symbol})</span>
                <input
                  value={amountPicker.priceDraft}
                  onChange={e => onAmountPriceChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmAmountPicker()}
                  inputMode="numeric" placeholder="0"
                  style={{
                    border: `1.5px solid ${T.line}`, borderRadius: T.rBtn, padding: '11px 12px',
                    fontSize: 16, fontWeight: 800, fontFamily: T.font, color: T.ink, outline: 'none',
                  }}
                />
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setAmountPicker(null)} style={{
                  flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
                  background: T.surface, color: T.muted, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                }}>
                  Cancel
                </button>
                <button onClick={confirmAmountPicker} style={{
                  flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: 'none',
                  background: T.green, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                }}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Process Payment modal ══ */}
      {showPayment && (
        <PaymentModal
          entries={cartEntries}
          subtotal={subtotal}
          taxAmt={taxAmt}
          total={total}
          settings={settings}
          formatQty={formatQty}
          onQtyChange={(item, delta) => (delta > 0 ? addItem(item) : decItem(item.id))}
          onClose={() => setShowPayment(false)}
          onSubmit={submitCharge}
          onDone={() => { setShowPayment(false); clearOrder(); showToast('Payment complete'); }}
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
