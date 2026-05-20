import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, ChevronLeft, ChevronRight, Plus, Minus, Trash2,
  X, Check, Banknote, CreditCard, QrCode, Wallet, Printer,
  Flame, UtensilsCrossed, ShoppingBag, Truck, AlertCircle,
  Loader2, Wine, Pizza, Fish, Coffee, Tag, ChefHat,
  Percent, Hash, Grid3X3, ChevronDown, CheckCircle2, ArrowLeft,
  TableProperties, Users, User, Phone, CreditCard as CardIcon,
  SendHorizonal, BadgeDollarSign, AlertTriangle,
} from 'lucide-react';
import { menuAPI, tablesAPI, ordersAPI, accountingAPI } from '../../api/client';
import { withCache, invalidate } from '../../utils/apiCache';
import { usePrinter } from '../../hooks/usePrinter';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import PhoneInput from '../../components/PhoneInput';
import DatePicker from '../../components/DatePicker';

// ─── Cache TTLs ───────────────────────────────────────────────────────────────
const MENU_TTL   = 15 * 60 * 1000; // 15 min — menu rarely changes during a shift
const TABLES_TTL = 30 * 1000;      // 30 sec  — just prevents burst re-fetches

// ─── Design tokens ────────────────────────────────────────────────────────────
const C   = '#0891B2';   // Cashier cyan
const CL  = '#E0F2FE';
const CD  = '#0E7490';
const WH  = '#FFFFFF';
const BG  = '#F0F9FF';
const BD  = '#E5E7EB';
const TXT = '#111827';
const MUT = '#6B7280';
const GR  = '#16A34A';
const RD  = '#DC2626';
const AMB = '#D97706';

const ORDER_TYPES = [
  { key: 'dine_in',  Icon: UtensilsCrossed, labelKey: 'orderTypes.dineIn'   },
  { key: 'to_go',    Icon: ShoppingBag,     labelKey: 'orderTypes.toGo'     },
  { key: 'delivery', Icon: Truck,           labelKey: 'orderTypes.delivery'  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const money = (n) => Number(n || 0).toLocaleString('uz-UZ') + " so'm";

const nowDateLabel = () =>
  new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  }).toUpperCase();

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const catIcon = (name = '') => {
  const n = name.toLowerCase();
  if (n.includes('bar') || n.includes('wine') || n.includes('drink') || n.includes('alcohol')) return Wine;
  if (n.includes('pizza'))                          return Pizza;
  if (n.includes('fish') || n.includes('seafood'))  return Fish;
  if (n.includes('coffee') || n.includes('tea') || n.includes('kafe')) return Coffee;
  if (n.includes('special') || n.includes('chef'))  return ChefHat;
  if (n.includes('promo') || n.includes('combo') || n.includes('set')) return Tag;
  return UtensilsCrossed;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function CashierMenu() {
  const { user } = useAuth();
  const { t }    = useTranslation();
  const navigate  = useNavigate();

  // ── Printer ───────────────────────────────────────────────────────────────
  const { printReceipt } = usePrinter();
  const [restSettings, setRestSettings] = useState({
    restaurantName: t('common.brandRestaurant'),
    receiptHeader:  t('cashier.orders.thankYou'),
  });

  // ── Data ──────────────────────────────────────────────────────────────────
  const [categories,  setCategories]  = useState([]);
  const [items,       setItems]       = useState([]);
  const [tables,      setTables]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  // ── Menu state ────────────────────────────────────────────────────────────
  const [selectedCat, setSelectedCat] = useState(null);
  const [search,      setSearch]      = useState('');
  const [clock,       setClock]       = useState(nowTime());
  const catRef = useRef(null);

  // ── Order state ───────────────────────────────────────────────────────────
  const [cart,            setCart]            = useState({});
  const [orderType,       setOrderType]       = useState('dine_in');
  const [selTable,        setSelTable]        = useState(null);
  const [showTablePicker, setShowTablePicker] = useState(false);
  // showTables kept for compat — replaced by showTablePicker
  const showTables    = false;
  const setShowTables = () => {};
  const [custName,   setCustName]   = useState('');
  const [custAddr,   setCustAddr]   = useState('');

  // ── Payment / submission ──────────────────────────────────────────────────
  const [payForm, setPayForm] = useState({
    paymentMethod: 'cash',
    discount: 0,
    discountType: 'percentage',
    discReason: '',
    amountReceived: 0,
    splitWays: null,
    loanName: '', loanPhone: '', loanDueDate: '',
    notes: '',
  });
  const [splitParts,   setSplitParts]  = useState([]);
  const [submitting,   setSubmitting]  = useState(false);
  const [error,        setError]       = useState('');
  const [toast,        setToast]       = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [custPhone,    setCustPhone]   = useState('');

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setClock(nowTime()), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Load restaurant settings (for receipts) ───────────────────────────────
  useEffect(() => {
    accountingAPI.getRestaurantSettings().then(r => {
      if (r) setRestSettings(r);
    }).catch(() => {/* keep defaults */});
  }, []);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => { loadData(); }, []);

  const loadData = async (quiet = false) => {
    // Manual pull-to-refresh: bust the cache so we get truly fresh data
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
      showToast(t('cashier.menu.failedToLoad'), false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Computed ──────────────────────────────────────────────────────────────
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
    const d = parseFloat(payForm.discount) || 0;
    if (!d) return 0;
    return payForm.discountType === 'percentage'
      ? Math.min(subtotal, Math.round(subtotal * d / 100))
      : Math.min(d, subtotal);
  }, [payForm.discount, payForm.discountType, subtotal]);

  const total  = Math.max(0, subtotal - discAmt);
  const change = Math.max(0, (parseFloat(payForm.amountReceived) || 0) - total);

  // ── Split re-init ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!payForm.splitWays) { setSplitParts([]); return; }
    const n = payForm.splitWays;
    const base = Math.floor(total / n);
    const rem  = total - base * n;
    setSplitParts(Array.from({ length: n }, (_, i) => ({
      amount: String(i === n - 1 ? base + rem : base),
      method: 'cash', confirmed: false,
      loanName: '', loanPhone: '', loanDueDate: '',
    })));
  }, [payForm.splitWays]); // eslint-disable-line

  // ── Auto-fill amountReceived when modal opens ─────────────────────────────
  useEffect(() => {
    if (showPayModal) {
      setPayForm(pf => ({ ...pf, amountReceived: total }));
    }
  }, [showPayModal]); // eslint-disable-line

  // ── Weighed-item helpers ──────────────────────────────────────────────────
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
    return `× ${qty}`;
  };

  // ── Amount picker state (for kg / l items) ────────────────────────────────
  const [amountPicker, setAmountPicker] = useState(null);

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
    const raw = String(amountPicker.draft || '').replace(',', '.').trim();
    const amt = parseFloat(raw);
    const item = amountPicker.item;
    if (!isFinite(amt) || amt <= 0) {
      // Zero or empty = remove from cart
      setCart(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      setAmountPicker(null);
      return;
    }
    const rounded = Math.round(amt * 1000) / 1000;
    setCart(prev => ({ ...prev, [item.id]: { item, qty: rounded } }));
    setAmountPicker(null);
  };

  // ── Cart actions ──────────────────────────────────────────────────────────
  const addItem  = (item) => {
    if (isWeighedItem(item)) { openAmountPicker(item); return; }
    setCart(p => ({ ...p, [item.id]: { item, qty: (p[item.id]?.qty || 0) + 1 } }));
  };
  const decItem  = (id)   => {
    const entry = cart[id];
    if (!entry) return;
    // Weighed items: open the amount picker so user can reduce (or clear) the amount
    if (isWeighedItem(entry.item)) { openAmountPicker(entry.item); return; }
    setCart(p => {
      if (!p[id]) return p;
      if (p[id].qty <= 1) { const n = { ...p }; delete n[id]; return n; }
      return { ...p, [id]: { ...p[id], qty: p[id].qty - 1 } };
    });
  };
  const delItem  = (id)   => setCart(p => { const n = { ...p }; delete n[id]; return n; });
  const clearCart = () => {
    setCart({});
    setPayForm({ paymentMethod: 'cash', discount: 0, discountType: 'percentage', discReason: '', amountReceived: 0, splitWays: null, loanName: '', loanPhone: '', loanDueDate: '', notes: '' });
    setSplitParts([]);
    setSelTable(null); setOrderType('dine_in');
    setCustName(''); setCustAddr(''); setCustPhone('');
    setError(''); setShowTablePicker(false); setShowPayModal(false);
  };

  // ── UZB phone formatter ───────────────────────────────────────────────────
  // Formats input to: +998 XX XXX XX XX
  const formatUzbPhone = (raw) => {
    const digits = raw.replace(/\D/g, '');
    // Strip leading country code if pasted
    const local = digits.startsWith('998') ? digits.slice(3) : digits;
    const d = local.slice(0, 9);
    if (d.length === 0) return '';
    let out = '+998';
    if (d.length > 0) out += ' ' + d.slice(0, 2);
    if (d.length > 2) out += ' ' + d.slice(2, 5);
    if (d.length > 5) out += ' ' + d.slice(5, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    return out;
  };

  // ── Table status helpers ──────────────────────────────────────────────────
    const tableStatusColor = (status) => {
    if (!status || status === 'free')     return { border: '#BBF7D0', bg: '#F0FDF4', badge: '#16A34A', statusKey: 'statuses.free'     };
    if (status === 'occupied')            return { border: '#FDE68A', bg: '#FFFBEB', badge: '#D97706', statusKey: 'statuses.occupied' };
    if (status === 'reserved')            return { border: '#DDD6FE', bg: '#F5F3FF', badge: '#7C3AED', statusKey: 'statuses.reserved' };
    if (status === 'cleaning')            return { border: '#A5F3FC', bg: '#ECFEFF', badge: '#0891B2', statusKey: 'statuses.cleaning'  };
    return { border: BD, bg: WH, badge: MUT, statusKey: null };
  };

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Find existing active order for occupied table ─────────────────────────
  // Returns the order object if found, null if the table is free / walk-in.
  const findActiveOrderForTable = async (tableId) => {
    if (!tableId) return null;
    const table = tables.find(t => t.id === tableId);
    if (!table || table.status !== 'occupied') return null;
    try {
      const orders = await ordersAPI.getAll({
        table_id: tableId,
        status: 'pending,cooking,served,ready,bill_requested',
      });
      const list = Array.isArray(orders) ? orders : (orders?.orders || []);
      return list.length > 0 ? list[0] : null;
    } catch {
      return null;
    }
  };

  // ── Fire — send to kitchen only ──────────────────────────────────────────
  const handleFire = async () => {
    if (!cartEntries.length) return;
    setSubmitting(true); setError('');
    try {
      const cartItems = cartEntries.map(e => ({ menuItemId: e.item.id, quantity: e.qty }));
      const existing  = await findActiveOrderForTable(selTable?.id);

      if (existing) {
        // Table is occupied — append to existing order
        await ordersAPI.addItems(existing.id, cartItems.map(i => ({ menu_item_id: i.menuItemId, quantity: i.quantity })));
        showToast(t('cashier.menu.itemsAddedToOrder', { num: existing.orderNumber || existing.id }));
      } else {
        // Free table or walk-in — create new order
        await ordersAPI.create({
          orderType,
          tableId: selTable?.id || null,
          items:   cartItems,
          ...(custName  && { customerName: custName }),
          ...(custPhone && { customerPhone: custPhone }),
          ...(custAddr  && { deliveryAddress: custAddr }),
        });
        showToast(t('cashier.menu.orderSentToKitchen'));
      }
      clearCart();
    } catch (e) {
      setError(e?.message || t('cashier.menu.failedToSendOrder'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Charge — create + pay (called from Pay Now modal) ────────────────────
  const handleCharge = async () => {
    if (!cartEntries.length) return;
    setSubmitting(true); setError('');
    try {
      const cartItems = cartEntries.map(e => ({ menuItemId: e.item.id, quantity: e.qty }));
      const existing  = await findActiveOrderForTable(selTable?.id);

      let orderId;
      if (existing) {
        // Table is occupied — append items, then pay the existing order
        await ordersAPI.addItems(existing.id, cartItems.map(i => ({ menu_item_id: i.menuItemId, quantity: i.quantity })));
        orderId = existing.id;
      } else {
        // Free table or walk-in — create new order
        const res = await ordersAPI.create({
          orderType,
          tableId: selTable?.id || null,
          items:   cartItems,
          ...(custName  && { customerName: custName }),
          ...(custPhone && { customerPhone: custPhone }),
          ...(custAddr  && { deliveryAddress: custAddr }),
        });
        orderId = res?.id || res?.order?.id;
      }

      const pf = payForm;
      const payload = { discountAmount: discAmt, notes: pf.notes || null };

      if (pf.splitWays && splitParts.length > 0) {
        payload.paymentMethod  = 'split';
        payload.splitPayments  = splitParts.map(p => ({
          method: p.method,
          amount: parseFloat(p.amount) || 0,
          ...(p.method === 'loan'
            ? { loanCustomerName: p.loanName, loanCustomerPhone: p.loanPhone, loanDueDate: p.loanDueDate }
            : {}),
        }));
      } else if (pf.paymentMethod === 'loan') {
        payload.paymentMethod     = 'loan';
        payload.loanCustomerName  = pf.loanName;
        payload.loanCustomerPhone = pf.loanPhone;
        payload.loanDueDate       = pf.loanDueDate || null;
      } else {
        payload.paymentMethod = pf.paymentMethod;
        payload.amount        = total;
      }

      await ordersAPI.pay(orderId, payload);

      // ── Auto-print receipt ────────────────────────────────────────────────
      try {
        const restaurantName = restSettings?.restaurantName || t('common.brandRestaurant');
        const footer         = restSettings?.receiptHeader  || t('cashier.orders.thankYou');
        const orderNum       = orderId ? (String(orderId).length >= 4 ? `#${String(orderId).slice(-4)}` : `#${orderId}`) : '';
        const dt             = new Date();
        const dateTime       = `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        const tableName      = selTable
          ? `Table ${selTable.tableNumber || selTable.name || String(selTable.id).slice(-4)}`
          : (orderType === 'dine_in' ? t('cashier.orders.walkIn') : (custName || t('cashier.orders.walkIn')));
        const methodLabel    = (pf.paymentMethod || 'cash').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

        const receiptInner = `
          <div class="center">
            <div class="rest-name">${restaurantName}</div>
            <div class="gray">${orderNum} &nbsp;·&nbsp; ${tableName}</div>
            <div class="gray">${dateTime}</div>
          </div>
          <div class="dashed"></div>
          ${cartEntries.map(({ item, qty }) => {
            const u       = String(item.unit || 'piece').toLowerCase();
            const weighed = u === 'kg' || u === 'l' || u === 'g' || u === 'ml';
            const qLabel  = weighed ? `${Number.isInteger(qty) ? qty : parseFloat(Number(qty).toFixed(3))} ${u}` : `× ${qty}`;
            return `<div class="row"><span class="row-label">${item.name} ${qLabel}</span><span>${money(Number(item.price) * qty)}</span></div>`;
          }).join('')}
          <div class="dashed"></div>
          <div class="row"><span>${t('common.subtotal')}</span><span>${money(subtotal)}</span></div>
          ${discAmt > 0 ? `<div class="row green"><span>${t('common.discount')}${pf.discReason ? ` (${pf.discReason})` : ''}</span><span>−${money(discAmt)}</span></div>` : ''}
          <div class="dashed"></div>
          <div class="row total-row"><span>${t('cashier.orders.receiptTotal')}</span><span>${money(total)}</span></div>
          <div class="dashed"></div>
          <div class="row"><span>${t('cashier.orders.method')}</span><span>${methodLabel}</span></div>
          ${pf.paymentMethod === 'cash' && change > 0 ? `<div class="row"><span>${t('cashier.orders.change')}</span><span>${money(change)}</span></div>` : ''}
          <div class="dashed"></div>
          <div class="center footer">${footer}</div>`;

        printReceipt({
          restaurantName,
          orderNum,
          tableName,
          dateTime,
          items: cartEntries.map(({ item, qty }) => ({
            name:  item.name,
            qty,
            unit:  String(item.unit || 'piece').toLowerCase(),
            total: money(Number(item.price) * qty),
          })),
          subtotal:       money(subtotal),
          discountReason: pf.discReason || undefined,
          discount:       discAmt > 0 ? `-${money(discAmt)}` : undefined,
          total:          money(total),
          method:         methodLabel,
          change:         change > 0 ? money(change) : undefined,
          footer,
          browserHtml:    receiptInner,
        });
      } catch {
        // Print failure is non-fatal — cart still clears
      }

      showToast(t('cashier.menu.paymentComplete'));
      clearCart();
    } catch (e) {
      setError(e?.message || t('cashier.orders.paymentFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Category scroll ───────────────────────────────────────────────────────
  const scrollCats = (dir) => catRef.current?.scrollBy({ left: dir * 220, behavior: 'smooth' });

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: BG }}>
      <Loader2 size={32} color={C} style={{ animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: BG, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
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
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none',
        }}>
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* ══ CENTER: MENU PANEL or TABLE PICKER ══════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {showTablePicker ? (
          /* ── TABLE PICKER VIEW ────────────────────────────────────────── */
          <>
            {/* Table picker header */}
            <div style={{
              background: WH, borderBottom: `1px solid ${BD}`,
              padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
            }}>
              <button onClick={() => setShowTablePicker(false)} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 13px', borderRadius: 8,
                border: `1px solid ${BD}`, background: WH,
                cursor: 'pointer', fontSize: 13, fontWeight: 600, color: TXT,
              }}>
                <ArrowLeft size={15} color={TXT} /> {t('cashier.menu.backToMenu')}
              </button>
              <div style={{ fontSize: 15, fontWeight: 700, color: TXT }}>{t('cashier.menu.selectATable')}</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 12, color: MUT }}>{t('cashier.menu.tablesAvailable', { count: tables.length })}</div>
            </div>

            {/* Table cards grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
              {/* Walk-in option */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: MUT, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>{t('cashier.menu.noTable')}</div>
                <button onClick={() => { setSelTable(null); setShowTablePicker(false); }} style={{
                  width: '100%', padding: '14px 18px', borderRadius: 12,
                  border: `2px solid ${selTable === null ? C : BD}`,
                  background: selTable === null ? CL : WH,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                  transition: 'all 0.12s', textAlign: 'left',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: selTable === null ? C : '#F3F4F6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <ShoppingBag size={18} color={selTable === null ? WH : MUT} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: selTable === null ? C : TXT }}>{t('cashier.menu.walkInNoTable')}</div>
                    <div style={{ fontSize: 11, color: MUT, marginTop: 1 }}>{t('cashier.menu.takeawayCounter')}</div>
                  </div>
                  {selTable === null && <CheckCircle2 size={18} color={C} style={{ marginLeft: 'auto' }} />}
                </button>
              </div>

              {/* Tables by section */}
              {tables.length > 0 && (() => {
                const sectionNames = [...new Set(tables.map(tbl => tbl.section || t('cashier.tables.mainFloor')))];
                return sectionNames.map(sectionName => {
                  const sectionTables = tables.filter(tbl => (tbl.section || t('cashier.tables.mainFloor')) === sectionName);
                  return (
                    <div key={sectionName} style={{ marginBottom: 18 }}>
                      {/* Section header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: MUT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {sectionName}
                        </div>
                        <div style={{
                          fontSize: 11, fontWeight: 700, color: C,
                          background: CL, borderRadius: 20,
                          padding: '1px 8px', lineHeight: '18px',
                        }}>
                          {sectionTables.length}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                        {sectionTables.map(tbl => {
                          const sc         = tableStatusColor(tbl.status);
                          const isSelected = selTable?.id === tbl.id;
                          const tblName    = tbl.name || `Table ${tbl.tableNumber}`;
                          return (
                            <button key={tbl.id} onClick={() => { setSelTable(tbl); setShowTablePicker(false); }} style={{
                              padding: '14px 12px', borderRadius: 14,
                              border: `2px solid ${isSelected ? C : sc.border}`,
                              background: isSelected ? CL : sc.bg,
                              cursor: 'pointer', textAlign: 'left',
                              display: 'flex', flexDirection: 'column', gap: 6,
                              transition: 'all 0.12s', position: 'relative',
                              boxShadow: isSelected
                                ? `0 0 0 3px ${C}22, 0 4px 16px ${C}18`
                                : '0 1px 3px rgba(0,0,0,0.06)',
                              transform: isSelected ? 'scale(1.02)' : undefined,
                              minHeight: 160,
                            }}>
                              {/* Status dot top-right */}
                              <div style={{ position: 'absolute', top: 10, right: 10 }}>
                                {isSelected
                                  ? <CheckCircle2 size={16} color={C} />
                                  : <div style={{ width: 10, height: 10, borderRadius: '50%', background: sc.badge }} />
                                }
                              </div>
                              {/* Section label + name */}
                              <div style={{ paddingRight: 20 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: sc.badge, opacity: 0.8, marginBottom: 2 }}>
                                  {sectionName}
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: isSelected ? C : sc.badge, lineHeight: 1.2 }}>
                                  {tblName}
                                </div>
                              </div>
                              {/* Dining table SVG icon */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 4, paddingBottom: 4 }}>
                                <div style={{
                                  width: 52, height: 52, borderRadius: 14,
                                  background: `${sc.badge}15`,
                                  border: `2px solid ${sc.badge}30`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <svg width="28" height="28" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="2" y="8" width="26" height="5" rx="2" fill={isSelected ? C : sc.badge} opacity="0.9"/>
                                    <rect x="5" y="13" width="3" height="10" rx="1.5" fill={isSelected ? C : sc.badge} opacity="0.7"/>
                                    <rect x="22" y="13" width="3" height="10" rx="1.5" fill={isSelected ? C : sc.badge} opacity="0.7"/>
                                    <rect x="3" y="22" width="7" height="2.5" rx="1.25" fill={isSelected ? C : sc.badge} opacity="0.5"/>
                                    <rect x="20" y="22" width="7" height="2.5" rx="1.25" fill={isSelected ? C : sc.badge} opacity="0.5"/>
                                  </svg>
                                </div>
                              </div>
                              {/* Bottom: capacity + status */}
                              <div>
                                {tbl.capacity && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                    <Users size={10} color={MUT} />
                                    <span style={{ fontSize: 10, color: MUT }}>{t('cashier.menu.seatsLabel', { count: tbl.capacity })}</span>
                                  </div>
                                )}
                                <div style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '3px 8px', borderRadius: 20,
                                  background: `${sc.badge}18`, alignSelf: 'flex-start',
                                }}>
                                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: sc.badge }} />
                                  <span style={{ fontSize: 10, fontWeight: 600, color: sc.badge }}>
                                    {sc.statusKey ? t(sc.statusKey) : tbl.status}
                                  </span>
                                </div>
                                {tbl.status === 'occupied' && (
                                  <div style={{ fontSize: 9, fontWeight: 600, color: sc.badge, marginTop: 4, lineHeight: 1.3 }}>
                                    {t('cashier.menu.addToExistingHint')}
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </>
        ) : (
          /* ── MENU VIEW ────────────────────────────────────────────────── */
          <>
            {/* Top search bar */}
            <div style={{
              background: WH, borderBottom: `1px solid ${BD}`,
              padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
            }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={15} color={MUT} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('cashier.menu.searchPlaceholder')}
                  style={{
                    width: '100%', padding: '8px 30px 8px 32px',
                    border: `1px solid ${BD}`, borderRadius: 8, fontSize: 13,
                    color: TXT, outline: 'none', background: '#F9FAFB',
                    boxSizing: 'border-box',
                  }}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', display: 'flex' }}>
                    <X size={13} color={MUT} />
                  </button>
                )}
              </div>
            </div>

            {/* Category chips */}
            <div style={{
              background: WH, borderBottom: `1px solid ${BD}`,
              padding: '9px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <button onClick={() => scrollCats(-1)} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${BD}`, background: WH, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ChevronLeft size={14} color={MUT} />
              </button>

              <div ref={catRef} style={{ display: 'flex', gap: 7, overflowX: 'auto', flex: 1, scrollbarWidth: 'none' }}>
                <button onClick={() => setSelectedCat(null)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '7px 13px', borderRadius: 10, cursor: 'pointer', flexShrink: 0, minWidth: 65,
                  border: `1.5px solid ${selectedCat === null ? C : BD}`,
                  background: selectedCat === null ? C : WH, transition: 'all 0.12s',
                }}>
                  <Grid3X3 size={17} color={selectedCat === null ? WH : MUT} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: selectedCat === null ? WH : TXT }}>{t('common.all')}</span>
                </button>

                {categories.map(cat => {
                  const CatIcon = catIcon(cat.name);
                  const active  = selectedCat === cat.id;
                  return (
                    <button key={cat.id} onClick={() => setSelectedCat(active ? null : cat.id)} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      padding: '7px 13px', borderRadius: 10, cursor: 'pointer', flexShrink: 0, minWidth: 65,
                      border: `1.5px solid ${active ? C : BD}`,
                      background: active ? C : WH, transition: 'all 0.12s',
                    }}>
                      <CatIcon size={17} color={active ? WH : MUT} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: active ? WH : TXT, whiteSpace: 'nowrap', maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button onClick={() => scrollCats(1)} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${BD}`, background: WH, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ChevronRight size={14} color={MUT} />
              </button>
            </div>

            {/* Items grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: TXT, marginBottom: 12 }}>
                {search
                  ? t('cashier.menu.resultsFor', { count: filteredItems.length, query: search })
                  : selectedCat
                    ? (categories.find(c => c.id === selectedCat)?.name || t('common.category'))
                    : t('cashier.menu.allItems')}
              </div>

              {filteredItems.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, color: MUT }}>
                  <UtensilsCrossed size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
                  <div style={{ fontSize: 15 }}>{t('cashier.menu.noItemsFound')}</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 11 }}>
                  {filteredItems.map(item => {
                    const qty     = cart[item.id]?.qty || 0;
                    const weighed = isWeighedItem(item);
                    const suffix  = unitSuffix(item);
                    return (
                      <div key={item.id} style={{
                        background: WH, borderRadius: 12, overflow: 'hidden',
                        border: `1.5px solid ${qty > 0 ? C : BD}`,
                        display: 'flex', flexDirection: 'column',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'box-shadow 0.15s, border-color 0.15s',
                      }}
                        onMouseEnter={e => { if (!qty) e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.09)'; }}
                        onMouseLeave={e => { if (!qty) e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
                      >
                        <div style={{ height: 105, background: '#F3F4F6', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <UtensilsCrossed size={28} color={BD} />
                            </div>
                          )}
                          {qty > 0 && (
                            <div style={{
                              position: 'absolute', top: 7, right: 7,
                              minWidth: 22, height: 22, borderRadius: 11,
                              background: C, color: WH, fontSize: 11, fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: weighed ? '0 5px' : 0,
                            }}>
                              {weighed ? formatQty(item, qty) : qty}
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '8px 9px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{
                            fontSize: 12, fontWeight: 600, color: TXT, lineHeight: 1.35,
                            overflow: 'hidden', display: '-webkit-box',
                            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          }}>{item.name}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C, marginTop: 'auto', paddingTop: 2 }}>
                            {money(item.price)}{suffix ? <span style={{ fontWeight: 500, color: MUT }}> / {suffix}</span> : null}
                          </div>
                          {qty === 0 ? (
                            <button onClick={() => addItem(item)} style={{
                              marginTop: 6, padding: '7px', borderRadius: 8,
                              border: `1.5px solid ${C}`, background: C, color: WH,
                              cursor: 'pointer', fontSize: 12, fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}>
                              <Plus size={13} /> {t('common.add')}
                            </button>
                          ) : weighed ? (
                            /* Weighed: tapping the qty chip reopens the picker */
                            <div style={{
                              marginTop: 6, display: 'flex', alignItems: 'center',
                              justifyContent: 'space-between', background: CL, borderRadius: 8, padding: '3px 4px',
                            }}>
                              <button onClick={() => decItem(item.id)} style={{ width: 25, height: 25, borderRadius: 6, border: 'none', background: WH, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Minus size={13} color={C} />
                              </button>
                              <button
                                onClick={() => openAmountPicker(item)}
                                style={{ fontSize: 12, fontWeight: 700, color: C, border: 'none', background: 'none', cursor: 'pointer', padding: '0 2px' }}
                              >
                                {formatQty(item, qty)}
                              </button>
                              <button onClick={() => openAmountPicker(item)} style={{ width: 25, height: 25, borderRadius: 6, border: 'none', background: C, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Plus size={13} color={WH} />
                              </button>
                            </div>
                          ) : (
                            <div style={{
                              marginTop: 6, display: 'flex', alignItems: 'center',
                              justifyContent: 'space-between', background: CL, borderRadius: 8, padding: '3px 4px',
                            }}>
                              <button onClick={() => decItem(item.id)} style={{ width: 25, height: 25, borderRadius: 6, border: 'none', background: WH, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Minus size={13} color={C} />
                              </button>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C }}>{qty}</span>
                              <button onClick={() => addItem(item)} style={{ width: 25, height: 25, borderRadius: 6, border: 'none', background: C, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          </>
        )}
      </div>

      {/* ══ RIGHT ORDER PANEL ════════════════════════════════════════════════ */}
      <div style={{
        width: 330, flexShrink: 0, background: WH,
        borderLeft: `1px solid ${BD}`, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Panel header */}
        <div style={{ padding: '13px 16px 11px', borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TXT }}>{t('cashier.menu.orderDetails')}</div>
            {cartEntries.length > 0 && (
              <button onClick={clearCart} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: RD, border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={12} /> {t('cashier.menu.clearAll')}
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: MUT }}>{nowDateLabel()} · {clock}</div>
        </div>

        {/* Order type */}
        <div style={{ padding: '10px 14px 11px', borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {ORDER_TYPES.map(({ key, Icon: OIcon, labelKey }) => {
              const active = orderType === key;
              return (
                <button key={key} onClick={() => setOrderType(key)} style={{
                  flex: 1, padding: '7px 4px', borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${active ? C : BD}`,
                  background: active ? CL : WH, color: active ? C : MUT,
                  fontSize: 10, fontWeight: active ? 600 : 400,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  transition: 'all 0.12s',
                }}>
                  <OIcon size={14} />
                  {t(labelKey)}
                </button>
              );
            })}
          </div>

          {/* Table card button */}
          {orderType === 'dine_in' && (
            <button onClick={() => setShowTablePicker(true)} style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              border: `2px solid ${selTable ? C : BD}`,
              background: selTable ? CL : '#F9FAFB',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              transition: 'all 0.12s', textAlign: 'left',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                background: selTable ? C : '#E5E7EB',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <TableProperties size={16} color={selTable ? WH : MUT} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: selTable ? C : MUT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selTable
                    ? (selTable.name || `Table ${selTable.tableNumber || selTable.id?.slice(-4)}`)
                    : t('admin.newOrder.selectTable')}
                </div>
                <div style={{ fontSize: 10, color: selTable?.status === 'occupied' ? RD : MUT, marginTop: 1 }}>
                  {selTable?.status === 'occupied'
                    ? t('cashier.menu.occupiedAddToExisting')
                    : selTable
                      ? (() => { const sc2 = tableStatusColor(selTable.status); return sc2.statusKey ? t(sc2.statusKey) : selTable.status; })()
                      : t('cashier.menu.tapToChooseTable')}
                </div>
              </div>
              <ChevronRight size={14} color={selTable ? C : MUT} />
            </button>
          )}

          {/* Customer info — To Go & Delivery */}
          {orderType !== 'dine_in' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 2 }}>
              {/* Name */}
              <input
                value={custName}
                onChange={e => setCustName(e.target.value)}
                placeholder={t('admin.newOrder.customerNameOptional')}
                style={{ padding: '8px 10px', border: `1px solid ${BD}`, borderRadius: 8, fontSize: 13, outline: 'none', color: TXT }}
              />
              {/* Phone — UZB formatted */}
              <div style={{ position: 'relative' }}>
                <Phone size={13} color={MUT} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  value={custPhone}
                  onChange={e => setCustPhone(formatUzbPhone(e.target.value))}
                  placeholder="+998 XX XXX XX XX"
                  maxLength={17}
                  inputMode="tel"
                  style={{ width: '100%', padding: '8px 10px 8px 30px', border: `1px solid ${BD}`, borderRadius: 8, fontSize: 13, outline: 'none', color: TXT, boxSizing: 'border-box' }}
                />
              </div>
              {/* Address — delivery only */}
              {orderType === 'delivery' && (
                <input
                  value={custAddr}
                  onChange={e => setCustAddr(e.target.value)}
                  placeholder={t('admin.newOrder.deliveryAddress')}
                  style={{ padding: '8px 10px', border: `1px solid ${BD}`, borderRadius: 8, fontSize: 13, outline: 'none', color: TXT }}
                />
              )}
            </div>
          )}
        </div>

        {/* Cart */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
          {cartEntries.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, color: MUT }}>
              <ShoppingBag size={36} style={{ opacity: 0.18, marginBottom: 9 }} />
              <div style={{ fontSize: 13 }}>{t('admin.newOrder.cartEmpty')}</div>
              <div style={{ fontSize: 11, marginTop: 3 }}>{t('admin.newOrder.addItemsFromMenu')}</div>
            </div>
          ) : (
            cartEntries.map(({ item, qty }) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 0', borderBottom: `1px solid #F3F4F6` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  <button onClick={() => decItem(item.id)} style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${BD}`, background: WH, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Minus size={11} color={MUT} />
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TXT, minWidth: 16, textAlign: 'center' }}>{qty}</span>
                  <button onClick={() => addItem(item)} style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${C}`, background: C, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={11} color={WH} />
                  </button>
                </div>
                <div style={{ flex: 1, fontSize: 12, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: TXT, whiteSpace: 'nowrap', flexShrink: 0 }}>{money(item.price * qty)}</div>
                <button onClick={() => delItem(item.id)} style={{ width: 20, height: 20, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Trash2 size={12} color={RD} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer — total + action buttons */}
        {cartEntries.length > 0 && (
          <div style={{ flexShrink: 0, borderTop: `1px solid ${BD}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>

            {/* Total row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: MUT }}>{t('common.total')}</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: C }}>{money(subtotal)}</span>
            </div>

            {/* Error (from fire) */}
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: RD, background: '#FEF2F2', padding: '7px 9px', borderRadius: 6 }}>
                <AlertCircle size={13} />{error}
              </div>
            )}

            {/* Send to Kitchen */}
            <button
              onClick={handleFire}
              disabled={submitting}
              style={{
                padding: '11px', borderRadius: 10, cursor: submitting ? 'not-allowed' : 'pointer',
                border: `2px solid ${AMB}`, background: '#FFFBEB',
                fontSize: 14, fontWeight: 700, color: AMB,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                opacity: submitting ? 0.6 : 1, transition: 'all 0.12s',
              }}
              onMouseEnter={e => { if (!submitting) { e.currentTarget.style.background = AMB; e.currentTarget.style.color = WH; } }}
              onMouseLeave={e => { if (!submitting) { e.currentTarget.style.background = '#FFFBEB'; e.currentTarget.style.color = AMB; } }}
            >
              {submitting
                ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                : <SendHorizonal size={15} />}
              {t('cashier.menu.sendToKitchen')}
            </button>

            {/* Pay Now */}
            <button
              onClick={() => { setError(''); setShowPayModal(true); }}
              disabled={submitting}
              style={{
                padding: '12px', borderRadius: 10, border: 'none',
                background: submitting ? '#9CA3AF' : C,
                color: WH, fontSize: 14, fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = CD; }}
              onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = C; }}
            >
              <BadgeDollarSign size={16} />
              {t('cashier.menu.payNow')}
            </button>
          </div>
        )}
      </div>

      {/* ══ PAY NOW MODAL (two-column Orders style) ════════════════════════ */}
      {showPayModal && (() => {
        const pf = payForm;
        const PMETHODS = [
          { key: 'cash',    label: t('paymentMethods.cash'),    Icon: Banknote   },
          { key: 'card',    label: t('paymentMethods.card'),    Icon: CreditCard },
          { key: 'qr_code', label: t('paymentMethods.qrCode'), Icon: QrCode     },
          { key: 'loan',    label: t('paymentMethods.loan'),    Icon: Wallet      },
        ];
        const splitTotal = splitParts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        const splitValid = splitParts.length > 0 && Math.abs(splitTotal - total) < 1;

        return (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={() => setShowPayModal(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden"
              style={{ height: '90vh' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: C + '1A' }}>
                    <CreditCard className="w-5 h-5" style={{ color: C }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{t('cashier.orders.processPayment')}</h2>
                    <p className="text-sm text-gray-500">{nowDateLabel()} · {clock}</p>
                  </div>
                </div>
                <button onClick={() => setShowPayModal(false)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Two-column body */}
              <div className="flex flex-1 overflow-hidden">

                {/* LEFT — Cart items + Totals */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">

                  {/* Cart Items */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('cashier.orders.orderItems')}</p>
                      <span className="text-xs font-semibold" style={{ color: C }}>
                        {cartEntries.reduce((s, e) => s + e.qty, 0)} {t('common.items')}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {cartEntries.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">{t('cashier.menu.noModalItems')}</p>
                      ) : cartEntries.map(({ item, qty }) => (
                        <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                            <p className="text-xs text-gray-400">
                              {money(item.price)}{isWeighedItem(item) ? ` / ${unitSuffix(item)}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button onClick={() => decItem(item.id)} className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition">
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className={`${isWeighedItem(item) ? 'min-w-[3.5rem] px-1' : 'w-8'} text-center text-xs font-bold text-gray-900`}>
                              {isWeighedItem(item) ? formatQty(item, qty) : `× ${qty}`}
                            </span>
                            <button onClick={() => addItem(item)} className="w-7 h-7 rounded-full flex items-center justify-center transition" style={{ backgroundColor: `${C}1A`, color: C }}>
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => delItem(item.id)} className="w-7 h-7 rounded-full bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200 transition ml-1">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 min-w-[5.5rem] text-right">
                            {money(Number(item.price) * qty)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">{t('common.subtotal')}</span>
                      <span className="text-sm font-semibold text-gray-900">{money(subtotal)}</span>
                    </div>
                    {discAmt > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-600">
                          {t('common.discount')}{pf.discReason ? ` · ${pf.discReason}` : ''}
                        </span>
                        <span className="text-sm font-semibold text-green-600">-{money(discAmt)}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                      <span className="text-base font-bold text-gray-900">{t('common.total')}</span>
                      <span className="text-2xl font-bold" style={{ color: C }}>{money(total)}</span>
                    </div>
                  </div>
                </div>

                {/* RIGHT — Payment inputs + Actions */}
                <div className="w-[400px] flex flex-col bg-white flex-shrink-0 border-l border-gray-200">
                  <div className="flex-1 overflow-y-auto p-5 space-y-5">

                    {/* Payment Method */}
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('cashier.orders.paymentMethod')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {PMETHODS.map(({ key, label, Icon }) => (
                          <button
                            key={key}
                            onClick={() => setPayForm({ ...pf, paymentMethod: key })}
                            className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${
                              pf.paymentMethod === key
                                ? 'border-cyan-600 bg-cyan-50 text-cyan-700 shadow-sm'
                                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:border-gray-300'
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                            <span className="text-xs font-semibold">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Amount Received — Cash only */}
                    {pf.paymentMethod === 'cash' && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.amountReceived')}</p>
                        <input
                          type="number" min="0" step="1000"
                          value={pf.amountReceived || ''}
                          onChange={e => setPayForm({ ...pf, amountReceived: parseFloat(e.target.value) || 0 })}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                        <div className={`mt-2 rounded-xl px-4 py-3 flex items-center justify-between ${change > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                          <span className={`text-sm font-medium ${change > 0 ? 'text-green-600' : 'text-gray-400'}`}>{t('cashier.orders.changeToGive')}</span>
                          <span className={`text-xl font-bold ${change > 0 ? 'text-green-600' : 'text-gray-500'}`}>{money(change)}</span>
                        </div>
                      </div>
                    )}

                    {/* Discount */}
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.applyDiscount')}</p>
                      <div className="flex gap-2 mb-2">
                        {['percentage', 'fixed'].map(tp => (
                          <button key={tp}
                            onClick={() => setPayForm({ ...pf, discountType: tp, discount: 0 })}
                            className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
                            style={{ backgroundColor: pf.discountType === tp ? C : '#F3F4F6', color: pf.discountType === tp ? '#fff' : '#6B7280' }}
                          >
                            {tp === 'percentage' ? '%' : "So'm"}
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <input
                          type="number" min="0"
                          max={pf.discountType === 'percentage' ? 100 : subtotal}
                          value={pf.discount || ''}
                          onChange={e => setPayForm({ ...pf, discount: parseFloat(e.target.value) || 0 })}
                          placeholder={pf.discountType === 'percentage' ? '0 — 100' : '0'}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">
                          {pf.discountType === 'percentage' ? '%' : "so'm"}
                        </span>
                      </div>
                      {discAmt > 0 && (
                        <div className="mt-1.5 space-y-1.5">
                          <p className="text-xs text-green-600 font-semibold">-{money(discAmt)}</p>
                          <input
                            type="text"
                            value={pf.discReason || ''}
                            onChange={e => setPayForm({ ...pf, discReason: e.target.value })}
                            placeholder={t('cashier.menu.reasonOptional')}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 text-gray-700"
                          />
                        </div>
                      )}
                    </div>

                    {/* Split Bill */}
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.splitBill')}</p>
                      <div className="flex gap-2">
                        {[2, 3, 4].map(n => (
                          <button key={n}
                            onClick={() => setPayForm({ ...pf, splitWays: pf.splitWays === n ? null : n })}
                            className="flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all"
                            style={{
                              borderColor: pf.splitWays === n ? C : '#E5E7EB',
                              backgroundColor: pf.splitWays === n ? C + '1A' : '#F9FAFB',
                              color: pf.splitWays === n ? C : '#6B7280',
                            }}
                          >
                            {n} {t('cashier.orders.ways')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Split parts */}
                    {pf.splitWays && splitParts.length > 0 && (
                      <div className="space-y-3">
                        {splitParts.map((part, idx) => (
                          <div key={idx} className={`rounded-xl border-2 p-3 transition-all ${part.confirmed ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-gray-700">{t('cashier.orders.part')} {idx + 1}</span>
                              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input type="checkbox" checked={part.confirmed}
                                  onChange={e => { const u=[...splitParts]; u[idx]={...u[idx],confirmed:e.target.checked}; setSplitParts(u); }}
                                  className="w-4 h-4 accent-green-500"
                                />
                                <span className={`text-xs font-semibold ${part.confirmed ? 'text-green-600' : 'text-gray-400'}`}>{t('common.paid')}</span>
                              </label>
                            </div>
                            <div className="relative mb-2">
                              <input type="number" min="0" step="1000"
                                value={part.amount}
                                onChange={e => { const u=[...splitParts]; u[idx]={...u[idx],amount:e.target.value}; setSplitParts(u); }}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:outline-none pr-14"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">so'm</span>
                            </div>
                            <div className="flex gap-1.5">
                              {[{key:'cash',label:t('paymentMethods.cash')},{key:'card',label:t('paymentMethods.card')},{key:'qr_code',label:t('paymentMethods.qrCode')},{key:'loan',label:t('paymentMethods.loan')}].map(({key,label})=>(
                                <button key={key}
                                  onClick={() => { const u=[...splitParts]; u[idx]={...u[idx],method:key}; setSplitParts(u); }}
                                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                                  style={{ backgroundColor: part.method===key?C:'#fff', color: part.method===key?'#fff':'#6B7280', borderColor: part.method===key?C:'#E5E7EB' }}
                                >{label}</button>
                              ))}
                            </div>
                            {part.method === 'loan' && (
                              <div className="mt-2 space-y-2 pt-2 border-t border-amber-200">
                                <input type="text" value={part.loanName}
                                  onChange={e => { const u=[...splitParts]; u[idx]={...u[idx],loanName:e.target.value}; setSplitParts(u); }}
                                  placeholder={t('cashier.orders.customerName')} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none" />
                                <PhoneInput value={part.loanPhone} onChange={v => { const u=[...splitParts]; u[idx]={...u[idx],loanPhone:v}; setSplitParts(u); }} size="sm" />
                                <DatePicker value={part.loanDueDate} onChange={v => { const u=[...splitParts]; u[idx]={...u[idx],loanDueDate:v}; setSplitParts(u); }} size="sm" />
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="flex items-center justify-between px-1">
                          <span className="text-xs font-bold text-gray-400 uppercase">{t('cashier.menu.splitTotal')}</span>
                          <span className={`text-sm font-bold ${splitValid ? 'text-green-600' : 'text-red-500'}`}>
                            {money(splitTotal)} / {money(total)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Loan fields */}
                    {pf.paymentMethod === 'loan' && !pf.splitWays && (
                      <div className="space-y-3">
                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-amber-700 font-medium">{t('cashier.orders.loanNotice')}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.customerName')}</p>
                          <input type="text" value={pf.loanName} onChange={e => setPayForm({...pf,loanName:e.target.value})}
                            placeholder={t('cashier.menu.fullNamePlaceholder')} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('common.phone')}</p>
                          <PhoneInput value={pf.loanPhone} onChange={v => setPayForm({...pf,loanPhone:v})} size="md" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.expectedReturn')}</p>
                          <DatePicker value={pf.loanDueDate} onChange={v => setPayForm({...pf,loanDueDate:v})} size="sm" />
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('common.notes')}</p>
                      <textarea
                        value={pf.notes}
                        onChange={e => setPayForm({...pf,notes:e.target.value})}
                        placeholder={t('cashier.orders.addPaymentNotes')}
                        rows={2}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none resize-none"
                      />
                    </div>

                    {error && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
                      </div>
                    )}
                  </div>

                  {/* Actions footer */}
                  <div className="p-4 border-t border-gray-200 space-y-2 flex-shrink-0 bg-gray-50">
                    <button
                      onClick={handleCharge}
                      disabled={submitting}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm transition text-white disabled:opacity-60"
                      style={{ backgroundColor: submitting ? '#9CA3AF' : C }}
                      onMouseEnter={e => { if (!submitting) e.currentTarget.style.backgroundColor = CD; }}
                      onMouseLeave={e => { if (!submitting) e.currentTarget.style.backgroundColor = C; }}
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {t('cashier.orders.confirmPayment')} · {money(total)}
                    </button>
                    <button
                      onClick={() => setShowPayModal(false)}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 transition"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Amount Picker Modal (kg / l / g / ml items) ── */}
      {amountPicker && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setAmountPicker(null)}
        >
          <div
            style={{ background: WH, borderRadius: 16, width: '100%', maxWidth: 360, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ background: CL, padding: '16px 20px 14px', borderBottom: `1px solid ${BD}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                {t('admin.newOrder.enterAmount')}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: TXT }}>{amountPicker.item.name}</div>
              <div style={{ fontSize: 12, color: MUT, marginTop: 2 }}>
                {Number(amountPicker.item.price || 0).toLocaleString()} so'm / {unitSuffix(amountPicker.item)}
              </div>
            </div>

            <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Quantity input */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 6 }}>
                  {t('cashier.menu.quantityUnit', { unit: unitSuffix(amountPicker.item) })}
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    inputMode="decimal"
                    autoFocus
                    value={amountPicker.draft}
                    onChange={e => onAmountQtyChange(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmAmountPicker(); }}
                    placeholder={`0.000`}
                    style={{
                      width: '100%', padding: '12px 48px 12px 14px', borderRadius: 10,
                      border: `1.5px solid ${BD}`, fontSize: 22, fontWeight: 700, color: TXT,
                      outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.target.style.borderColor = C; }}
                    onBlur={e => { e.target.style.borderColor = BD; }}
                  />
                  <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: MUT, fontWeight: 600, fontSize: 15 }}>
                    {unitSuffix(amountPicker.item)}
                  </span>
                </div>
              </div>

              {/* Price input */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: MUT, marginBottom: 6 }}>
                  {t('cashier.menu.orEnterPrice')}
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={amountPicker.priceDraft || ''}
                    onChange={e => onAmountPriceChange(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmAmountPicker(); }}
                    placeholder="0"
                    style={{
                      width: '100%', padding: '12px 60px 12px 14px', borderRadius: 10,
                      border: `1.5px solid ${BD}`, fontSize: 18, fontWeight: 700, color: TXT,
                      outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.target.style.borderColor = C; }}
                    onBlur={e => { e.target.style.borderColor = BD; }}
                  />
                  <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: MUT, fontWeight: 600, fontSize: 13 }}>
                    so'm
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 9, marginTop: 2 }}>
                <button
                  onClick={() => setAmountPicker(null)}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, border: `1.5px solid ${BD}`, background: WH, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: MUT }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={confirmAmountPicker}
                  style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: C, color: WH, cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onMouseEnter={e => { e.currentTarget.style.background = CD; }}
                  onMouseLeave={e => { e.currentTarget.style.background = C; }}
                >
                  <Check size={16} /> {t('common.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
