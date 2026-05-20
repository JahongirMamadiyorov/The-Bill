import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutGrid, ClipboardList, Clock, Receipt, LogOut,
  Search, ChevronLeft, ChevronRight, Plus, Minus, Trash2,
  X, Check, Banknote, CreditCard, QrCode, Wallet, Printer,
  Flame, UtensilsCrossed, ShoppingBag, Truck, User, AlertCircle,
  Loader2, RefreshCw, Wine, Pizza, Fish, Coffee, Tag, ChefHat,
  CheckCircle2, Percent, Hash, Users, Grid3X3, ChevronDown,
} from 'lucide-react';
import { menuAPI, tablesAPI, ordersAPI } from '../../api/client';
import { withCache, invalidate } from '../../utils/apiCache';
import { useAuth } from '../../context/AuthContext';

// ─── Cache TTLs ───────────────────────────────────────────────────────────────
const MENU_TTL   = 15 * 60 * 1000;
const TABLES_TTL = 30 * 1000;

// ─── Design tokens ────────────────────────────────────────────────────────────
const C   = '#0891B2';   // Cashier cyan — primary actions
const CL  = '#E0F2FE';   // Cyan light   — hover / selected BG
const CD  = '#0E7490';   // Cyan dark    — pressed
const BG  = '#F0F9FF';   // Page background (very light cyan)
const WH  = '#FFFFFF';
const BD  = '#E5E7EB';   // Border
const TXT = '#111827';   // Dark text
const MUT = '#6B7280';   // Muted text
const GR  = '#16A34A';   // Success green
const RD  = '#DC2626';   // Danger red
const AMB = '#D97706';   // Amber (fire)

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'menu',    Icon: LayoutGrid,   label: 'Menu'    },
  { key: 'orders',  Icon: ClipboardList,label: 'Orders'  },
  { key: 'history', Icon: Clock,        label: 'History' },
  { key: 'bills',   Icon: Receipt,      label: 'Bills'   },
];

// ─── Payment methods ──────────────────────────────────────────────────────────
const PAY_METHODS = [
  { id: 'Cash',    Icon: Banknote,   label: 'Cash'    },
  { id: 'Card',    Icon: CreditCard, label: 'Card'    },
  { id: 'QR Code', Icon: QrCode,     label: 'QR Code' },
  { id: 'Loan',    Icon: Wallet,     label: 'Loan'    },
];

// ─── Order types ──────────────────────────────────────────────────────────────
const ORDER_TYPES = [
  { key: 'dine_in',  Icon: UtensilsCrossed, label: 'Dine In'  },
  { key: 'to_go',    Icon: ShoppingBag,     label: 'To Go'    },
  { key: 'delivery', Icon: Truck,           label: 'Delivery' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const money = (n) => Number(n || 0).toLocaleString('uz-UZ') + " so'm";

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const nowDateLabel = () =>
  new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  }).toUpperCase();

const catIcon = (name = '') => {
  const n = name.toLowerCase();
  if (n.includes('bar') || n.includes('wine') || n.includes('drink') || n.includes('alcohol')) return Wine;
  if (n.includes('pizza'))                   return Pizza;
  if (n.includes('fish') || n.includes('seafood')) return Fish;
  if (n.includes('coffee') || n.includes('tea') || n.includes('kafe')) return Coffee;
  if (n.includes('special') || n.includes('chef')) return ChefHat;
  if (n.includes('promo') || n.includes('combo') || n.includes('set')) return Tag;
  if (n.includes('group') || n.includes('family') || n.includes('party')) return Users;
  return UtensilsCrossed;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavSidebar({ view, setView, user, onLogout }) {
  return (
    <aside style={{
      width: 200, flexShrink: 0, background: WH,
      borderRight: `1px solid ${BD}`, display: 'flex', flexDirection: 'column',
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: `1px solid ${BD}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: C,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ChefHat size={20} color={WH} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TXT, lineHeight: 1.2 }}>The Bill</div>
            <div style={{ fontSize: 11, color: MUT }}>POS Terminal</div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(({ key, Icon, label }) => {
          const active = view === key;
          return (
            <button key={key} onClick={() => setView(key)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14,
              fontWeight: active ? 600 : 400, color: active ? C : MUT,
              background: active ? CL : 'transparent', textAlign: 'left', width: '100%',
              transition: 'background 0.12s, color 0.12s',
            }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.color = TXT; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = MUT; } }}
            >
              <Icon size={18} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div style={{ padding: '10px 8px 14px', borderTop: `1px solid ${BD}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 4 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: CL, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={15} color={C} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || 'Cashier'}
            </div>
            <div style={{ fontSize: 11, color: MUT }}>Cashier</div>
          </div>
        </div>
        <button onClick={onLogout} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
          width: '100%', border: 'none', background: 'transparent', cursor: 'pointer',
          color: RD, fontSize: 13, borderRadius: 8, transition: 'background 0.12s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </aside>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NewCashierPOS() {
  const { user, logout } = useAuth();
  const navigate          = useNavigate();

  // ── View ─────────────────────────────────────────────────────────────────────
  const [view, setView] = useState('menu');

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [categories,   setCategories]   = useState([]);
  const [items,        setItems]        = useState([]);
  const [tables,       setTables]       = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  // ── Menu state ────────────────────────────────────────────────────────────────
  const [selectedCat, setSelectedCat] = useState(null);
  const [search,      setSearch]      = useState('');
  const catRef = useRef(null);
  const [clock, setClock] = useState(nowTime());

  // ── Order state ───────────────────────────────────────────────────────────────
  const [cart,       setCart]       = useState({}); // { itemId: { item, qty } }
  const [orderType,  setOrderType]  = useState('dine_in');
  const [selTable,   setSelTable]   = useState(null);
  const [showTables, setShowTables] = useState(false);
  const [discount,   setDiscount]   = useState('');
  const [discPct,    setDiscPct]    = useState(false);
  const [custName,   setCustName]   = useState('');
  const [custAddr,   setCustAddr]   = useState('');

  // ── Payment / submission ──────────────────────────────────────────────────────
  const [payMethod,   setPayMethod]   = useState('Cash');
  const [cashIn,      setCashIn]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [toast,       setToast]       = useState(null); // { msg, ok }

  // ── Clock tick ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setClock(nowTime()), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Load menu data ────────────────────────────────────────────────────────────
  useEffect(() => { loadMenu(); }, []);

  const loadMenu = async (quiet = false) => {
    if (quiet) {
      invalidate('menu:categories');
      invalidate('menu:items');
      invalidate('tables:all');
    }
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const [cats, menuItems, tbls] = await Promise.all([
        withCache('menu:categories', MENU_TTL,   () => menuAPI.getCategories()),
        withCache('menu:items',      MENU_TTL,   () => menuAPI.getItems()),
        withCache('tables:all',      TABLES_TTL, () => tablesAPI.getAll()),
      ]);
      setCategories(Array.isArray(cats) ? cats : []);
      setItems(Array.isArray(menuItems)
        ? menuItems.filter(i => i.isAvailable !== false)
        : []);
      setTables(Array.isArray(tbls) ? tbls : []);
    } catch {
      showToast('Failed to load menu data', false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadOrders = async () => {
    try {
      const data = await ordersAPI.getAll();
      const list = Array.isArray(data) ? data : (data?.orders || []);
      const active = ['pending','sent_to_kitchen','preparing','ready'].includes;
      setActiveOrders(list.filter(o =>
        ['pending','sent_to_kitchen','preparing','ready'].includes(o.status)
      ));
    } catch {}
  };

  useEffect(() => { if (view === 'orders') loadOrders(); }, [view]);

  // ── Computed ──────────────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let list = items;
    if (selectedCat) list = list.filter(i => i.categoryId === selectedCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => (i.name || '').toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedCat, search]);

  const cartEntries = useMemo(() => Object.values(cart), [cart]);

  const subtotal = useMemo(() =>
    cartEntries.reduce((s, e) => s + Number(e.item.price || 0) * e.qty, 0),
    [cartEntries]);

  const discAmt = useMemo(() => {
    const d = parseFloat(discount) || 0;
    if (!d) return 0;
    return discPct ? Math.round(subtotal * d / 100) : Math.min(d, subtotal);
  }, [discount, discPct, subtotal]);

  const total  = Math.max(0, subtotal - discAmt);
  const change = Math.max(0, (parseFloat(cashIn) || 0) - total);

  // ── Cart actions ──────────────────────────────────────────────────────────────
  const addItem  = (item) => setCart(p => ({ ...p, [item.id]: { item, qty: (p[item.id]?.qty || 0) + 1 } }));
  const decItem  = (id)   => setCart(p => {
    if (!p[id]) return p;
    if (p[id].qty <= 1) { const n = { ...p }; delete n[id]; return n; }
    return { ...p, [id]: { ...p[id], qty: p[id].qty - 1 } };
  });
  const delItem  = (id)   => setCart(p => { const n = { ...p }; delete n[id]; return n; });
  const clearCart = () => {
    setCart({}); setDiscount(''); setDiscPct(false);
    setSelTable(null); setOrderType('dine_in');
    setCashIn(''); setCustName(''); setCustAddr(''); setError('');
  };

  // ── Toast ─────────────────────────────────────────────────────────────────────
  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Fire — send to kitchen, no payment ───────────────────────────────────────
  const handleFire = async () => {
    if (!cartEntries.length) return;
    setSubmitting(true); setError('');
    try {
      await ordersAPI.create({
        orderType,
        tableId: selTable?.id || null,
        items:   cartEntries.map(e => ({ menuItemId: e.item.id, quantity: e.qty })),
        ...(custName && { customerName: custName }),
        ...(custAddr && { deliveryAddress: custAddr }),
      });
      showToast('Order sent to kitchen!');
      clearCart();
    } catch (e) {
      setError(e?.message || 'Failed to send order');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Charge — create order + pay immediately ───────────────────────────────────
  const handleCharge = async () => {
    if (!cartEntries.length) return;
    setSubmitting(true); setError('');
    try {
      const res = await ordersAPI.create({
        orderType,
        tableId: selTable?.id || null,
        items:   cartEntries.map(e => ({ menuItemId: e.item.id, quantity: e.qty })),
        ...(custName && { customerName: custName }),
        ...(custAddr && { deliveryAddress: custAddr }),
      });
      const orderId = res?.id || res?.order?.id;
      await ordersAPI.pay(orderId, {
        paymentMethod:  payMethod,
        discountAmount: discAmt,
        totalPaid:      total,
      });
      showToast('Payment complete!');
      clearCart();
    } catch (e) {
      setError(e?.message || 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Category scroll ───────────────────────────────────────────────────────────
  const scrollCats = (dir) => catRef.current?.scrollBy({ left: dir * 220, behavior: 'smooth' });

  // ── Logout ────────────────────────────────────────────────────────────────────
  const handleLogout = () => { logout(); navigate('/login'); };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: BG }}>
      <Loader2 size={36} color={C} style={{ animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden', background: BG,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 99px; }
        * { box-sizing: border-box; }
      `}</style>

      {/* ── TOAST ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: toast.ok ? GR : RD, color: WH,
          padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 8,
          pointerEvents: 'none',
        }}>
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* ── LEFT SIDEBAR ───────────────────────────────────────────────────── */}
      <NavSidebar view={view} setView={setView} user={user} onLogout={handleLogout} />

      {/* ══════════════════════════════════════════════════════════════════════
          MENU VIEW  (center panel + right order panel)
      ══════════════════════════════════════════════════════════════════════ */}
      {view === 'menu' && (
        <>
          {/* ── CENTER: MENU PANEL ─────────────────────────────────────────── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

            {/* Top bar */}
            <div style={{
              background: WH, borderBottom: `1px solid ${BD}`,
              padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
            }}>
              {/* Search */}
              <div style={{ position: 'relative', width: 340 }}>
                <Search size={15} color={MUT} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search menu..."
                  style={{
                    width: '100%', padding: '9px 32px 9px 34px', border: `1px solid ${BD}`,
                    borderRadius: 8, fontSize: 13, color: TXT, outline: 'none', background: '#F9FAFB',
                  }}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
                    <X size={13} color={MUT} />
                  </button>
                )}
              </div>

              <div style={{ flex: 1 }} />

              {/* User info */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TXT }}>{user?.name || 'Cashier'}</div>
                <div style={{ fontSize: 11, color: MUT }}>Clocked in at {clock}</div>
              </div>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', background: CL,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <User size={17} color={C} />
              </div>

              {/* Refresh */}
              <button onClick={() => loadMenu(true)} style={{
                width: 34, height: 34, borderRadius: 8, border: `1px solid ${BD}`,
                background: WH, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {refreshing
                  ? <Loader2 size={15} color={C} style={{ animation: 'spin 1s linear infinite' }} />
                  : <RefreshCw size={15} color={MUT} />}
              </button>
            </div>

            {/* Category row */}
            <div style={{
              background: WH, borderBottom: `1px solid ${BD}`,
              padding: '10px 16px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <button onClick={() => scrollCats(-1)} style={{
                width: 30, height: 30, borderRadius: 7, border: `1px solid ${BD}`,
                background: WH, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <ChevronLeft size={15} color={MUT} />
              </button>

              <div ref={catRef} style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {/* All */}
                <button onClick={() => setSelectedCat(null)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '8px 14px', borderRadius: 10, cursor: 'pointer', flexShrink: 0, minWidth: 70,
                  border: `1.5px solid ${selectedCat === null ? C : BD}`,
                  background: selectedCat === null ? C : WH,
                  transition: 'all 0.12s',
                }}>
                  <Grid3X3 size={18} color={selectedCat === null ? WH : MUT} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: selectedCat === null ? WH : TXT }}>All</span>
                </button>

                {categories.map(cat => {
                  const CatIcon = catIcon(cat.name);
                  const active = selectedCat === cat.id;
                  return (
                    <button key={cat.id} onClick={() => setSelectedCat(active ? null : cat.id)} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '8px 14px', borderRadius: 10, cursor: 'pointer', flexShrink: 0, minWidth: 70,
                      border: `1.5px solid ${active ? C : BD}`,
                      background: active ? C : WH,
                      transition: 'all 0.12s',
                    }}>
                      <CatIcon size={18} color={active ? WH : MUT} />
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: active ? WH : TXT,
                        whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{cat.name}</span>
                    </button>
                  );
                })}
              </div>

              <button onClick={() => scrollCats(1)} style={{
                width: 30, height: 30, borderRadius: 7, border: `1px solid ${BD}`,
                background: WH, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <ChevronRight size={15} color={MUT} />
              </button>
            </div>

            {/* Items grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {/* Section heading */}
              <div style={{ fontSize: 15, fontWeight: 700, color: TXT, marginBottom: 14 }}>
                {search
                  ? `${filteredItems.length} result${filteredItems.length !== 1 ? 's' : ''} for "${search}"`
                  : selectedCat
                    ? (categories.find(c => c.id === selectedCat)?.name || 'Category')
                    : 'All Items'}
              </div>

              {filteredItems.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 240, color: MUT }}>
                  <UtensilsCrossed size={44} style={{ opacity: 0.2, marginBottom: 14 }} />
                  <div style={{ fontSize: 15 }}>No items found</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12 }}>
                  {filteredItems.map(item => {
                    const qty = cart[item.id]?.qty || 0;
                    return (
                      <div key={item.id} style={{
                        background: WH, borderRadius: 12, overflow: 'hidden',
                        border: `1.5px solid ${qty > 0 ? C : BD}`,
                        display: 'flex', flexDirection: 'column',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'box-shadow 0.15s, border-color 0.15s',
                      }}
                        onMouseEnter={e => { if (!qty) e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.1)'; }}
                        onMouseLeave={e => { if (!qty) e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
                      >
                        {/* Image */}
                        <div style={{ height: 108, background: '#F3F4F6', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <UtensilsCrossed size={30} color={BD} />
                            </div>
                          )}
                          {qty > 0 && (
                            <div style={{
                              position: 'absolute', top: 7, right: 7, width: 22, height: 22,
                              borderRadius: '50%', background: C, color: WH,
                              fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>{qty}</div>
                          )}
                        </div>

                        {/* Info */}
                        <div style={{ padding: '9px 10px 11px', flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{
                            fontSize: 12, fontWeight: 600, color: TXT, lineHeight: 1.35,
                            overflow: 'hidden', display: '-webkit-box',
                            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          }}>{item.name}</div>

                          <div style={{ fontSize: 12, fontWeight: 700, color: C, marginTop: 'auto', paddingTop: 3 }}>
                            {money(item.price)}
                          </div>

                          {/* Controls */}
                          {qty === 0 ? (
                            <button onClick={() => addItem(item)} style={{
                              marginTop: 6, padding: '7px', borderRadius: 8,
                              border: `1.5px solid ${C}`, background: C, color: WH,
                              cursor: 'pointer', fontSize: 12, fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}>
                              <Plus size={13} /> ADD
                            </button>
                          ) : (
                            <div style={{
                              marginTop: 6, display: 'flex', alignItems: 'center',
                              justifyContent: 'space-between', background: CL, borderRadius: 8, padding: '3px 4px',
                            }}>
                              <button onClick={() => decItem(item.id)} style={{
                                width: 26, height: 26, borderRadius: 6, border: 'none',
                                background: WH, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <Minus size={13} color={C} />
                              </button>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C }}>{qty}</span>
                              <button onClick={() => addItem(item)} style={{
                                width: 26, height: 26, borderRadius: 6, border: 'none',
                                background: C, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <Plus size={13} color={WH} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT ORDER PANEL ───────────────────────────────────────────── */}
          <div style={{
            width: 340, flexShrink: 0, background: WH,
            borderLeft: `1px solid ${BD}`, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>

            {/* Panel header */}
            <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: TXT }}>Order Details</div>
                {cartEntries.length > 0 && (
                  <button onClick={clearCart} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 12, color: RD, border: 'none', background: 'none', cursor: 'pointer',
                  }}>
                    <X size={12} /> Clear all
                  </button>
                )}
              </div>

              {/* Cashier info row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: CL, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <User size={15} color={C} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TXT }}>{user?.name}</div>
                  <div style={{ fontSize: 11, color: MUT }}>{nowDateLabel()} · {clock}</div>
                </div>
              </div>
            </div>

            {/* Order type + Table */}
            <div style={{ padding: '11px 16px 12px', borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
              {/* Order type pills */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {ORDER_TYPES.map(({ key, Icon: OIcon, label }) => {
                  const active = orderType === key;
                  return (
                    <button key={key} onClick={() => setOrderType(key)} style={{
                      flex: 1, padding: '7px 4px', borderRadius: 8, cursor: 'pointer',
                      border: `1.5px solid ${active ? C : BD}`,
                      background: active ? CL : WH,
                      color: active ? C : MUT,
                      fontSize: 11, fontWeight: active ? 600 : 400,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      transition: 'all 0.12s',
                    }}>
                      <OIcon size={14} />
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Table selector (dine_in) */}
              {orderType === 'dine_in' && (
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowTables(p => !p)} style={{
                    width: '100%', padding: '8px 11px', border: `1px solid ${BD}`, borderRadius: 8,
                    background: '#F9FAFB', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', fontSize: 13,
                  }}>
                    <span style={{ color: selTable ? TXT : MUT }}>
                      {selTable
                        ? `Table ${selTable.tableNumber || selTable.name || selTable.id?.slice(-4)}`
                        : 'Select table (optional)...'}
                    </span>
                    <ChevronDown size={14} color={MUT} />
                  </button>
                  {showTables && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                      background: WH, border: `1px solid ${BD}`, borderRadius: 8,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 190, overflowY: 'auto',
                    }}>
                      <button onClick={() => { setSelTable(null); setShowTables(false); }} style={{
                        width: '100%', padding: '9px 12px', border: 'none', background: 'none',
                        cursor: 'pointer', textAlign: 'left', fontSize: 13, color: MUT,
                        borderBottom: `1px solid ${BD}`,
                      }}>
                        No table (walk-in)
                      </button>
                      {tables.map(t => (
                        <button key={t.id} onClick={() => { setSelTable(t); setShowTables(false); }} style={{
                          width: '100%', padding: '9px 12px', border: 'none',
                          background: selTable?.id === t.id ? CL : 'none',
                          cursor: 'pointer', textAlign: 'left', fontSize: 13,
                          color: selTable?.id === t.id ? C : TXT,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <span>Table {t.tableNumber || t.name || t.id?.slice(-4)}</span>
                          <span style={{ fontSize: 11, color: MUT }}>{t.status || ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Customer name for To Go / Delivery */}
              {orderType !== 'dine_in' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <input value={custName} onChange={e => setCustName(e.target.value)}
                    placeholder="Customer name..."
                    style={{ padding: '8px 10px', border: `1px solid ${BD}`, borderRadius: 8, fontSize: 13, outline: 'none', color: TXT }} />
                  {orderType === 'delivery' && (
                    <input value={custAddr} onChange={e => setCustAddr(e.target.value)}
                      placeholder="Delivery address..."
                      style={{ padding: '8px 10px', border: `1px solid ${BD}`, borderRadius: 8, fontSize: 13, outline: 'none', color: TXT }} />
                  )}
                </div>
              )}
            </div>

            {/* Cart items list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px' }}>
              {cartEntries.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 180, color: MUT }}>
                  <ShoppingBag size={38} style={{ opacity: 0.18, marginBottom: 10 }} />
                  <div style={{ fontSize: 14 }}>Cart is empty</div>
                  <div style={{ fontSize: 12, marginTop: 3 }}>Add items from the menu</div>
                </div>
              ) : (
                cartEntries.map(({ item, qty }) => (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 0', borderBottom: `1px solid #F3F4F6`,
                  }}>
                    {/* Qty stepper */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => decItem(item.id)} style={{
                        width: 24, height: 24, borderRadius: 6, border: `1px solid ${BD}`,
                        background: WH, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Minus size={11} color={MUT} />
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TXT, minWidth: 18, textAlign: 'center' }}>{qty}</span>
                      <button onClick={() => addItem(item)} style={{
                        width: 24, height: 24, borderRadius: 6, border: `1px solid ${C}`,
                        background: C, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Plus size={11} color={WH} />
                      </button>
                    </div>

                    {/* Item name */}
                    <div style={{ flex: 1, fontSize: 13, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>

                    {/* Line total */}
                    <div style={{ fontSize: 13, fontWeight: 600, color: TXT, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {money(item.price * qty)}
                    </div>

                    {/* Remove */}
                    <button onClick={() => delItem(item.id)} style={{
                      width: 22, height: 22, border: 'none', background: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Trash2 size={13} color={RD} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Totals + Actions (only when cart has items) */}
            {cartEntries.length > 0 && (
              <div style={{ flexShrink: 0, borderTop: `1px solid ${BD}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>

                {/* Discount input */}
                <div style={{ display: 'flex', border: `1px solid ${BD}`, borderRadius: 8, overflow: 'hidden' }}>
                  <input
                    type="number" min="0" value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    placeholder="Discount..."
                    style={{ flex: 1, padding: '8px 10px', border: 'none', fontSize: 13, outline: 'none', color: TXT }}
                  />
                  <button onClick={() => setDiscPct(p => !p)} style={{
                    padding: '0 11px', border: 'none', borderLeft: `1px solid ${BD}`,
                    background: '#F9FAFB', cursor: 'pointer',
                    color: discPct ? C : MUT, display: 'flex', alignItems: 'center',
                  }}>
                    {discPct ? <Percent size={13} /> : <Hash size={13} />}
                  </button>
                </div>

                {/* Subtotal */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: MUT }}>
                  <span>Sub Total</span>
                  <span>{money(subtotal)}</span>
                </div>

                {discAmt > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: RD }}>
                    <span>Discount {discPct ? `(${discount}%)` : ''}</span>
                    <span>- {money(discAmt)}</span>
                  </div>
                )}

                {/* Total */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 16, fontWeight: 700, color: TXT,
                  padding: '8px 0 2px', borderTop: `1.5px solid ${BD}`,
                }}>
                  <span>Total</span>
                  <span style={{ color: C }}>{money(total)}</span>
                </div>

                {/* Payment methods */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {PAY_METHODS.map(({ id, Icon: PIcon, label }) => {
                    const active = payMethod === id;
                    return (
                      <button key={id} onClick={() => setPayMethod(id)} style={{
                        padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
                        border: `1.5px solid ${active ? C : BD}`,
                        background: active ? CL : WH,
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 12, fontWeight: active ? 600 : 400,
                        color: active ? C : MUT,
                        transition: 'all 0.12s',
                      }}>
                        <PIcon size={14} />
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Cash received */}
                {payMethod === 'Cash' && (
                  <div>
                    <input
                      type="number" value={cashIn} onChange={e => setCashIn(e.target.value)}
                      placeholder="Cash received..."
                      style={{ width: '100%', padding: '8px 10px', border: `1px solid ${BD}`, borderRadius: 8, fontSize: 13, outline: 'none', color: TXT }}
                    />
                    {parseFloat(cashIn) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: GR, fontWeight: 600, marginTop: 6 }}>
                        <span>Change</span>
                        <span>{money(change)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                    color: RD, background: '#FEF2F2', padding: '8px 10px', borderRadius: 6,
                  }}>
                    <AlertCircle size={13} /> {error}
                  </div>
                )}

                {/* Fire + Print row */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleFire} disabled={submitting} style={{
                    flex: 1, padding: '10px 8px', borderRadius: 10, cursor: submitting ? 'not-allowed' : 'pointer',
                    border: `1.5px solid ${BD}`, background: WH,
                    fontSize: 13, fontWeight: 600, color: AMB,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: submitting ? 0.6 : 1, transition: 'all 0.12s',
                  }}>
                    <Flame size={15} /> Fire
                  </button>
                  <button disabled={submitting} style={{
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${BD}`, background: WH,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: submitting ? 0.6 : 1,
                  }}>
                    <Printer size={15} color={MUT} />
                  </button>
                </div>

                {/* Charge button */}
                <button onClick={handleCharge} disabled={submitting} style={{
                  padding: '13px', borderRadius: 10, border: 'none',
                  background: submitting ? '#9CA3AF' : C,
                  color: WH, fontSize: 15, fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background 0.12s',
                }}
                  onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = CD; }}
                  onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = C; }}
                >
                  {submitting
                    ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Check size={16} />}
                  Charge {money(total)}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ORDERS VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {view === 'orders' && (
        <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: TXT }}>Active Orders</div>
            <button onClick={loadOrders} style={{
              padding: '8px 14px', border: `1px solid ${BD}`, borderRadius: 8,
              background: WH, cursor: 'pointer', fontSize: 13, color: MUT,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {activeOrders.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 320, color: MUT }}>
              <ClipboardList size={52} style={{ opacity: 0.15, marginBottom: 16 }} />
              <div style={{ fontSize: 16 }}>No active orders right now</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {activeOrders.map(order => (
                <div key={order.id} style={{
                  background: WH, borderRadius: 12, border: `1px solid ${BD}`,
                  padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: TXT }}>
                      #{order.dailyNumber || order.id?.slice(-4)}
                    </div>
                    <div style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: CL, color: C, fontWeight: 600 }}>
                      {order.status?.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: MUT, marginBottom: 10 }}>
                    {order.orderType?.replace('_', ' ')}
                    {order.tableName ? ` · ${order.tableName}` : ''}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: TXT }}>{money(order.totalAmount)}</div>
                    <button style={{
                      padding: '6px 12px', borderRadius: 7, border: `1.5px solid ${C}`,
                      background: CL, color: C, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                      Pay
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          HISTORY VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {view === 'history' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: MUT }}>
            <Clock size={52} style={{ opacity: 0.15, marginBottom: 16 }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: TXT }}>Payment History</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Coming soon</div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BILLS VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {view === 'bills' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: MUT }}>
            <Receipt size={52} style={{ opacity: 0.15, marginBottom: 16 }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: TXT }}>Bills</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Coming soon</div>
          </div>
        </div>
      )}
    </div>
  );
}
