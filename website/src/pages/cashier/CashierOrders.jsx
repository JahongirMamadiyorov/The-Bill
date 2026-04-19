import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingBag, DollarSign, CheckCircle2, TrendingUp, X, Loader2,
  Clock, User, AlertCircle, ChevronDown, Check, CreditCard, QrCode,
  Banknote, ArrowLeft, Bell, Printer, Plus, Wallet, ChevronLeft,
  ChevronRight, RefreshCw, Info, Flame, Grid3X3, AlertTriangle,
} from 'lucide-react';
import { ordersAPI, accountingAPI } from '../../api/client';
import { usePrinter } from '../../hooks/usePrinter';
import { useAuth } from '../../context/AuthContext';
import DatePicker from '../../components/DatePicker';
import PhoneInput from '../../components/PhoneInput';
import { useTranslation } from '../../context/LanguageContext';

// ─── Constants ────────────────────────────────────────────────────────────────
const C = '#0891B2';          // Cashier cyan
const SUCCESS = '#16A34A';
// DISC_REASONS loaded from i18n: t('cashier.orders.discountReasons')
const TAB_KEYS = ['allActive', 'restaurantOrders', 'requested', 'toGo', 'delivery'];
const METHODS = [
  { id: 'Cash',    icon: Banknote,  tKey: 'paymentMethods.cash'    },
  { id: 'Card',    icon: CreditCard,tKey: 'paymentMethods.card'    },
  { id: 'QR Code', icon: QrCode,    tKey: 'paymentMethods.qrCode' },
  { id: 'Loan',    icon: Wallet,    tKey: 'paymentMethods.loan'    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const money = (n) => Number(n || 0).toLocaleString('uz-UZ') + " so'm";

const elapsed = (iso, t) => {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diff < 1)  return t('time.justNow');
  if (diff < 60) return t('time.minAgo', { count: diff });
  return t('time.hoursAgo', { h: Math.floor(diff / 60), m: diff % 60 });
};

const fmtOrderNum = (o) => {
  if (o?.dailyNumber) return `#${o.dailyNumber}`;
  const id = String(o?.id || '');
  return id.length >= 4 ? `#${id.slice(-4)}` : `#${id}`;
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
};

const STATUS_MAP = {
  pending:         { tKey: 'statuses.pending',       bg: '#F3F4F6', color: '#4B5563', dot: '#9CA3AF' },
  sent_to_kitchen: { tKey: 'statuses.sentToKitchen', bg: '#EFF6FF', color: '#2563EB', dot: '#3B82F6' },
  preparing:       { tKey: 'statuses.preparing',     bg: '#FFFBEB', color: '#D97706', dot: '#F59E0B' },
  ready:           { tKey: 'statuses.ready',         bg: '#F0FDF4', color: '#16A34A', dot: '#22C55E' },
  served:          { tKey: 'statuses.served',        bg: '#EDE9FE', color: '#7C3AED', dot: '#8B5CF6' },
  bill_requested:  { tKey: 'statuses.billRequested', bg: '#FFF7ED', color: '#EA580C', dot: '#F97316' },
};

// ─── Small UI pieces ──────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const { t } = useTranslation();
  const s = STATUS_MAP[status] || { tKey: null, bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF' };
  const label = s.tKey ? t(s.tKey) : status;
  const isBill = status === 'bill_requested';
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.dot }} />
      {label}{isBill && ' 🔔'}
    </span>
  );
}

function BillToast({ msg, visible }) {
  return (
    <div className="fixed top-4 left-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-white text-sm font-semibold pointer-events-none transition-all duration-300"
      style={{ transform: `translateX(-50%) translateY(${visible ? 0 : -80}px)`, opacity: visible ? 1 : 0, backgroundColor: C }}>
      <Bell className="w-4 h-4 flex-shrink-0" />{msg}
    </div>
  );
}

function StatCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-gray-100 flex-1 min-w-0 overflow-hidden flex items-center gap-3"
      style={{ borderLeft: `3px solid ${color}` }}>
      {Icon && (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color + '1A' }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-tight truncate">{label}</p>
        <div className="flex items-baseline gap-1">
          <p className="text-lg font-extrabold leading-none" style={{ color }}>{value}</p>
          {sub && <p className="text-[10px] text-gray-400 leading-none">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Loan Date Picker ─────────────────────────────────────────────────────────
function LoanDatePicker({ value, onChange, onClose }) {
  const { t } = useTranslation();
  const now = new Date();
  const [yr,  setYr]  = useState(now.getFullYear());
  const [mo,  setMo]  = useState(now.getMonth());

  const fmtDs = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = fmtDs(now);

  const prevMo = () => mo === 0  ? (setMo(11), setYr(y => y-1)) : setMo(m => m-1);
  const nextMo = () => mo === 11 ? (setMo(0),  setYr(y => y+1)) : setMo(m => m+1);

  const firstDow = (new Date(yr, mo, 1).getDay() + 6) % 7;
  const daysInMo = new Date(yr, mo+1, 0).getDate();
  const cells = [...Array(firstDow).fill(null),
    ...Array.from({length: daysInMo}, (_,i) => fmtDs(new Date(yr, mo, i+1)))];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMo} className="p-1 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <span className="text-sm font-bold text-gray-800">{t('datePicker.months')[mo]} {yr}</span>
        <button onClick={nextMo} className="p-1 hover:bg-gray-100 rounded-lg">
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {t('datePicker.days').map(d => <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((ds, i) => {
          if (!ds) return <div key={i} />;
          const isSel   = ds === value;
          const isPast  = ds < today;
          const isToday = ds === today;
          return (
            <button key={ds} disabled={isPast} onClick={() => { onChange(ds); onClose(); }}
              className="aspect-square flex items-center justify-center text-xs rounded-full transition"
              style={{
                backgroundColor: isSel ? C : 'transparent',
                color: isSel ? '#fff' : isPast ? '#D1D5DB' : isToday ? C : '#374151',
                fontWeight: isSel || isToday ? '700' : '400',
                cursor: isPast ? 'not-allowed' : 'pointer',
              }}>
              {parseInt(ds.split('-')[2], 10)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Receipt Modal ────────────────────────────────────────────────────────────
function ReceiptModal({ order, payment, restSettings, taxSettings, user, onClose }) {
  const { t } = useTranslation();
  if (!order || !payment) return null;
  const items = order.items || order.orderItems || [];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">{t('cashier.orders.receiptPreview')}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Header */}
          <div className="text-center mb-4 pb-4 border-b border-dashed border-gray-200">
            <p className="font-extrabold text-gray-900 text-base">
              {restSettings?.restaurantName || t('common.brandRestaurant', 'The Bill Restaurant')}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              {fmtOrderNum(order)} · {order.tableName || order.customerName || t('cashier.orders.walkIn')}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{fmtDate(new Date())}</p>
          </div>

          {/* Items */}
          <div className="space-y-1.5 mb-4">
            {items.map((it, i) => {
              const p = it.unitPrice || it.price || 0;
              const q = it.quantity  || it.qty  || 1;
              return (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700 flex-1 mr-2">{it.name || it.menuItemName || '—'} × {q}</span>
                  <span className="font-medium text-gray-900 whitespace-nowrap">{money(p * q)}</span>
                </div>
              );
            })}
          </div>

          {/* Totals */}
          <div className="border-t border-dashed border-gray-200 pt-3 space-y-1">
            <div className="flex justify-between text-sm text-gray-500">
              <span>{t('common.subtotal')}</span><span>{money(payment.subtotal)}</span>
            </div>
            {payment.tax > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>{t('cashier.orders.tax')} ({taxSettings?.taxRate ?? 0}%)</span>
                <span>{money(payment.tax)}</span>
              </div>
            )}
            {payment.svc > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>{t('cashier.orders.service')} ({restSettings?.serviceChargeRate ?? 0}%)</span>
                <span>{money(payment.svc)}</span>
              </div>
            )}
            {payment.discount > 0 && (
              <div className="flex justify-between text-sm" style={{ color: SUCCESS }}>
                <span>{t('common.discount')}{payment.discReason ? ` (${payment.discReason})` : ''}</span>
                <span>−{money(payment.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-base pt-2 border-t border-gray-200">
              <span>{t('common.total')}</span>
              <span style={{ color: C }}>{money(payment.total)}</span>
            </div>
          </div>

          {/* Payment info */}
          <div className="border-t border-dashed border-gray-200 mt-3 pt-3 space-y-1">
            {payment.change > 0 && (
              <div className="flex justify-between text-sm" style={{ color: C }}>
                <span>{t('cashier.orders.change')}</span><span>{money(payment.change)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-500">
              <span>{t('cashier.orders.paymentMethod')}</span><span className="font-medium text-gray-800">{payment.method}</span>
            </div>
            {payment.method === 'Split' && Array.isArray(payment.splitPayments) && (
              <div className="mt-1 space-y-0.5">
                {payment.splitPayments.map((sp, i) => (
                  <div key={i} className="flex justify-between text-xs text-gray-400 pl-4">
                    <span>{t('cashier.orders.part')} {i+1} ({sp.method})</span>
                    <span>{money(sp.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-500">
              <span>{t('roles.cashier')}</span><span className="font-medium text-gray-800">{user?.name || t('roles.cashier')}</span>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-4 italic">
            {restSettings?.receiptHeader || t('cashier.orders.thankYou')}
          </p>
        </div>

        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition">
            {t('cashier.orders.skip')}
          </button>
          <button onClick={onClose}
            className="flex-[2] py-2.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition"
            style={{ backgroundColor: C }}>
            <Printer className="w-4 h-4" />{t('cashier.orders.printReceipt')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Order Details + Payment Panel ───────────────────────────────────────────
function OrderPanel({ order, taxSettings, restSettings, user, onBack, onPaid }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Full order data
  const [full,       setFull]       = useState(null);
  const [loading,    setLoading]    = useState(true);

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
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
  const [splitParts, setSplitParts] = useState([]);
  const [paying,     setPaying]     = useState(false);
  const [err,        setErr]        = useState('');

  // ── Printer ───────────────────────────────────────────────────────────────
  const { printReceipt, printing: isPrinting, printerIp, setPrinterIp } = usePrinter();
  const [showPrinterCfg,  setShowPrinterCfg]  = useState(false);
  const [printerIpDraft,  setPrinterIpDraft]  = useState('');

  // ── Load full order ──────────────────────────────────────────────────────
  useEffect(() => {
    ordersAPI.getById(order.id)
      .then(d => setFull(d))
      .catch(() => setErr(t('cashier.orders.couldNotLoadOrder')))
      .finally(() => setLoading(false));
  }, [order.id]);

  // ── Order items ───────────────────────────────────────────────────────────
  const items = full?.items || full?.orderItems || [];
  const orderTotal = order.totalAmount || items.reduce((s, x) => s + (x.unitPrice || x.price || 0) * (x.quantity || x.qty || 1), 0);

  // ── Payment helpers ───────────────────────────────────────────────────────
  const getDiscountAmt = (pf) => {
    if (!pf.discount || pf.discount <= 0) return 0;
    return pf.discountType === 'percentage'
      ? Math.min(orderTotal, (orderTotal * pf.discount) / 100)
      : Math.min(orderTotal, pf.discount);
  };
  const getTotalToPay = (pf) => Math.max(0, orderTotal - getDiscountAmt(pf));
  const getChange = (pf) => Math.max(0, (parseFloat(pf.amountReceived) || 0) - getTotalToPay(pf));

  // ── Split re-init ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!payForm.splitWays) { setSplitParts([]); return; }
    const total = getTotalToPay(payForm);
    const n = payForm.splitWays;
    const base = Math.floor(total / n);
    const rem = total - base * n;
    setSplitParts(Array.from({ length: n }, (_, i) => ({
      amount: String(i === n - 1 ? base + rem : base),
      method: 'cash', confirmed: false,
      loanName: '', loanPhone: '', loanDueDate: '',
    })));
  }, [payForm.splitWays]); // eslint-disable-line

  // ── Auto-fill amount received when modal opens ────────────────────────────
  useEffect(() => {
    if (showPayModal) {
      setPayForm(pf => ({ ...pf, amountReceived: getTotalToPay(pf) }));
    }
  }, [showPayModal]); // eslint-disable-line

  // ── Confirm payment ───────────────────────────────────────────────────────
  const confirmPay = async () => {
    setPaying(true);
    setErr('');
    try {
      const discAmt = getDiscountAmt(payForm);
      const payload = { discountAmount: discAmt, notes: payForm.notes || null };

      if (payForm.splitWays && splitParts.length > 0) {
        payload.paymentMethod = 'split';
        payload.splitPayments = splitParts.map(p => ({
          method: p.method, amount: parseFloat(p.amount) || 0,
          ...(p.method === 'loan' ? { loanCustomerName: p.loanName, loanCustomerPhone: p.loanPhone, loanDueDate: p.loanDueDate } : {}),
        }));
      } else if (payForm.paymentMethod === 'loan') {
        payload.paymentMethod = 'loan';
        payload.loanCustomerName  = payForm.loanName;
        payload.loanCustomerPhone = payForm.loanPhone;
        payload.loanDueDate       = payForm.loanDueDate || null;
      } else {
        payload.paymentMethod = payForm.paymentMethod;
        payload.amount = getTotalToPay(payForm);
      }

      await ordersAPI.pay(order.id, payload);
      setShowPayModal(false);
      onPaid({ order: { ...(full || order) }, payment: { method: payForm.paymentMethod, total: getTotalToPay(payForm), discount: discAmt } });
    } catch (e) {
      setErr(e?.error || e?.message || t('cashier.orders.paymentFailed'));
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: C }} />
      </div>
    );
  }

  const isToGo  = (full?.orderType || order.orderType) === 'to_go' || (full?.orderType || order.orderType) === 'takeaway';
  const isDeli  = (full?.orderType || order.orderType) === 'delivery';
  const dname   = isToGo || isDeli
    ? (full?.customerName || order.customerName || t('cashier.orders.walkIn'))
    : (full?.tableName    || order.tableName    || t('cashier.orders.walkIn'));

  // Partial-ready
  const readyCount = items.filter(i => i.itemReady).length;
  const isPartial  = readyCount > 0 && readyCount < items.length && order.status !== 'ready';

  const pf = payForm;
  const discAmt   = getDiscountAmt(pf);
  const totalToPay = getTotalToPay(pf);
  const change     = getChange(pf);

  // ── Print handler ─────────────────────────────────────────────────────────
  const handlePrintCheck = () => {
    const restaurantName = restSettings?.restaurantName || t('common.brandRestaurant', 'The Bill Restaurant');
    const receiptInner = `
      <div class="center">
        <div class="rest-name">${restaurantName}</div>
        <div class="gray">${fmtOrderNum(order)} &nbsp;·&nbsp; ${dname}</div>
        <div class="gray">${fmtDate(new Date())}</div>
      </div>
      <div class="dashed"></div>
      ${items.map(it => {
        const p = it.unitPrice || it.price || 0;
        const q = it.quantity || it.qty || 1;
        return `<div class="row"><span class="row-label">${it.name || it.menuItemName || '—'} × ${q}</span><span>${money(p * q)}</span></div>`;
      }).join('')}
      <div class="dashed"></div>
      <div class="row"><span>${t('common.subtotal')}</span><span>${money(orderTotal)}</span></div>
      ${discAmt > 0 ? `<div class="row green"><span>${t('common.discount')}${pf.discReason ? ` (${pf.discReason})` : ''}</span><span>−${money(discAmt)}</span></div>` : ''}
      <div class="dashed"></div>
      <div class="row total-row"><span>${t('cashier.orders.receiptTotal')}</span><span>${money(totalToPay)}</span></div>
      <div class="dashed"></div>
      <div class="row"><span>${t('cashier.orders.method')}</span><span>${(pf.paymentMethod || 'cash').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</span></div>
      ${pf.paymentMethod === 'cash' && change > 0 ? `<div class="row"><span>${t('cashier.orders.change')}</span><span>${money(change)}</span></div>` : ''}
      <div class="dashed"></div>
      <div class="center footer">${restSettings?.receiptHeader || t('cashier.orders.thankYou')}</div>`;
    printReceipt({
      restaurantName,
      orderNum: fmtOrderNum(order),
      tableName: dname,
      dateTime: fmtDate(new Date()),
      items: items.map(it => ({
        name: it.name || it.menuItemName || '—',
        qty: it.quantity || it.qty || 1,
        total: money((it.unitPrice || it.price || 0) * (it.quantity || it.qty || 1)),
      })),
      subtotal: money(orderTotal),
      discountReason: pf.discReason || undefined,
      discount: discAmt > 0 ? `-${money(discAmt)}` : undefined,
      total: money(totalToPay),
      method: (pf.paymentMethod || 'cash').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
      change: change > 0 ? money(change) : undefined,
      footer: restSettings?.receiptHeader || t('cashier.orders.thankYou'),
      browserHtml: receiptInner,
    });
  };

  const PAY_METHODS = [
    { key: 'cash',    label: t('paymentMethods.cash'),    Icon: Banknote   },
    { key: 'card',    label: t('paymentMethods.card'),    Icon: CreditCard },
    { key: 'qr_code', label: t('paymentMethods.qrCode'), Icon: Grid3X3    },
    { key: 'loan',    label: t('paymentMethods.loan'),    Icon: User       },
  ];

  return (
    <>
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* ── Sticky Header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-100 transition flex-shrink-0">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 font-medium">{t('cashier.orders.orderDetails')}</p>
          <p className="text-base font-bold text-gray-900 truncate">{dname} — {fmtOrderNum(order)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── ORDER DETAILS VIEW ──────────────────────────────────────────── */}
        <>
            {/* Partial-ready banner */}
            {isPartial && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-orange-200 bg-orange-50">
                <Flame className="w-4 h-4 text-orange-600 flex-shrink-0" />
                <p className="text-sm font-semibold text-orange-700">
                  {t('statuses.preparing')} — {readyCount}/{items.length} {t('common.items')}
                </p>
              </div>
            )}

            {/* Items */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">{t('cashier.orders.orderItems')}</p>
              {items.length === 0
                ? <p className="text-sm text-gray-400">{t('common.noResults')}</p>
                : items.map((it, i) => {
                    const p     = it.unitPrice || it.price || 0;
                    const q     = it.quantity  || it.qty  || 1;
                    const ready = !!it.itemReady;
                    return (
                      <div key={i} className={`flex items-center py-2 gap-2 text-sm border-b last:border-0 border-gray-50 ${ready ? 'bg-green-50 rounded-lg px-2 -mx-2 mb-1' : ''}`}>
                        <span className={`flex-1 ${ready ? 'text-green-700 font-semibold' : 'text-gray-800'}`}>
                          {it.name || it.menuItemName}
                        </span>
                        <span className="text-gray-400 text-xs">× {q}</span>
                        {ready && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                        <span className="font-semibold text-gray-900 whitespace-nowrap">{money(p * q)}</span>
                      </div>
                    );
                  })
              }

              {/* Totals */}
              <div className="mt-4 pt-4 border-t border-dashed border-gray-200 space-y-1">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{t('common.subtotal')}</span><span>{money(orderTotal)}</span>
                </div>
                <div className="flex justify-between font-extrabold text-base pt-2 border-t border-gray-200">
                  <span className="text-gray-900">{t('common.total')}</span>
                  <span style={{ color: C }}>{money(orderTotal)}</span>
                </div>
              </div>
            </div>

            {/* Order meta */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{t('cashier.orders.orderDetails')}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-400">{t('admin.menu.itemType')}: </span><span className="font-medium text-gray-800">{isDeli ? t('orderTypes.delivery') : isToGo ? t('orderTypes.toGo') : t('orderTypes.dineIn')}</span></div>
                <div><span className="text-gray-400">{t('common.date')}: </span><span className="font-medium text-gray-800">{elapsed(full?.createdAt || order.createdAt, t)}</span></div>
                {full?.waitressName && <div><span className="text-gray-400">{t('roles.waitress')}: </span><span className="font-medium text-gray-800">{full.waitressName}</span></div>}
                {full?.guestCount > 0 && <div><span className="text-gray-400">{t('admin.newOrder.guests')}: </span><span className="font-medium text-gray-800">{full.guestCount}</span></div>}
                {(isToGo || isDeli) && full?.customerPhone && <div className="col-span-2"><span className="text-gray-400">{t('common.phone')}: </span><span className="font-medium text-gray-800">{full.customerPhone}</span></div>}
                {isDeli && full?.deliveryAddress && <div className="col-span-2"><span className="text-gray-400">{t('admin.newOrder.deliveryAddress')}: </span><span className="font-medium text-gray-800">{full.deliveryAddress}</span></div>}
              </div>
            </div>
          </>

      </div>

      {/* ── Footer ── */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4 flex gap-3">
        <Link
          to="/cashier/new-order"
          state={{ existingOrderId: order.id, existingOrder: order }}
          className="flex items-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition flex-shrink-0">
          <Plus className="w-4 h-4" />{t('cashier.orders.addItems')}
        </Link>
        <button
          onClick={() => setShowPayModal(true)}
          className="flex-1 py-3 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition"
          style={{ backgroundColor: C }}>
          <DollarSign className="w-4 h-4" />{t('cashier.orders.proceedToPayment')}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>

    {/* ── Collect Payment Modal ── */}
    {showPayModal && (() => {
      const pf          = payForm;
      const discountAmt = getDiscountAmt(pf);
      const totalToPay  = getTotalToPay(pf);
      const chg         = getChange(pf);
      const orderItems  = items;

      const PMETHODS = [
        { key: 'cash',    label: t('paymentMethods.cash'),    Icon: Banknote   },
        { key: 'card',    label: t('paymentMethods.card'),    Icon: CreditCard },
        { key: 'qr_code', label: t('paymentMethods.qrCode'), Icon: Grid3X3    },
        { key: 'loan',    label: t('paymentMethods.loan'),    Icon: User       },
      ];

      return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPayModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden"
            style={{ height: '85vh' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: C + '1A' }}>
                  <CreditCard className="w-5 h-5" style={{ color: C }} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{t('cashier.orders.processPayment')}</h2>
                  <p className="text-sm text-gray-500">{fmtOrderNum(order)} · {dname}</p>
                </div>
              </div>
              <button onClick={() => setShowPayModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Two-column body */}
            <div className="flex flex-1 overflow-hidden">

              {/* LEFT — Payment inputs */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {/* Payment Method */}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t('cashier.orders.paymentMethod')}</p>
                  <div className="grid grid-cols-4 gap-3">
                    {PMETHODS.map(({ key, label, Icon }) => (
                      <button
                        key={key}
                        onClick={() => setPayForm({ ...pf, paymentMethod: key })}
                        className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${
                          pf.paymentMethod === key
                            ? 'border-cyan-600 bg-cyan-50 text-cyan-700 shadow-sm'
                            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-6 h-6" />
                        <span className="text-sm font-semibold">{label}</span>
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
                    <div className={`mt-2 rounded-xl px-4 py-3 flex items-center justify-between ${chg > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                      <span className={`text-sm font-medium ${chg > 0 ? 'text-green-600' : 'text-gray-400'}`}>{t('cashier.orders.changeToGive')}</span>
                      <span className={`text-xl font-bold ${chg > 0 ? 'text-green-600' : 'text-gray-500'}`}>{money(chg)}</span>
                    </div>
                  </div>
                )}

                {/* Discount & Split */}
                <div className="grid grid-cols-2 gap-5">
                  {/* Discount */}
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.applyDiscount')}</p>
                    <div className="flex gap-2 mb-2">
                      {['percentage', 'fixed'].map(t => (
                        <button key={t}
                          onClick={() => setPayForm({ ...pf, discountType: t, discount: 0 })}
                          className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
                          style={{
                            backgroundColor: pf.discountType === t ? C : '#F3F4F6',
                            color: pf.discountType === t ? '#fff' : '#6B7280',
                          }}
                        >
                          {t === 'percentage' ? '%' : "So'm"}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <input
                        type="number" min="0"
                        max={pf.discountType === 'percentage' ? 100 : orderTotal}
                        step={pf.discountType === 'percentage' ? 1 : 1000}
                        value={pf.discount || ''}
                        onChange={e => setPayForm({ ...pf, discount: parseFloat(e.target.value) || 0 })}
                        placeholder={pf.discountType === 'percentage' ? '0 — 100' : '0'}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">
                        {pf.discountType === 'percentage' ? '%' : "so'm"}
                      </span>
                    </div>
                    {discountAmt > 0 && (
                      <div className="mt-1.5 space-y-1.5">
                        <p className="text-xs text-green-600 font-semibold">-{money(discountAmt)}</p>
                        <select
                          value={pf.discReason || ''}
                          onChange={e => setPayForm({ ...pf, discReason: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 text-gray-700"
                        >
                          <option value="">{t('cashier.orders.selectReason')}</option>
                          {t('cashier.orders.discountReasons').map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
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
                </div>

                {/* Split Parts */}
                {pf.splitWays && splitParts.length > 0 && (
                  <div>
                    <div className="grid grid-cols-2 gap-3">
                      {splitParts.map((part, idx) => (
                        <div key={idx}
                          className={`rounded-xl border-2 p-3 transition-all ${part.confirmed ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-gray-700">{t('cashier.orders.part')} {idx + 1}</span>
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input type="checkbox" checked={part.confirmed}
                                onChange={e => {
                                  const u = [...splitParts];
                                  u[idx] = { ...u[idx], confirmed: e.target.checked };
                                  setSplitParts(u);
                                }}
                                className="w-4 h-4 accent-green-500"
                              />
                              <span className={`text-xs font-semibold ${part.confirmed ? 'text-green-600' : 'text-gray-400'}`}>{t('common.paid')}</span>
                            </label>
                          </div>
                          <div className="relative mb-2">
                            <input type="number" min="0" step="1000"
                              value={part.amount}
                              onChange={e => {
                                const u = [...splitParts];
                                u[idx] = { ...u[idx], amount: e.target.value };
                                setSplitParts(u);
                              }}
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:outline-none pr-14"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">so'm</span>
                          </div>
                          <div className="flex gap-1.5">
                            {[
                              { key: 'cash', label: 'Cash' },
                              { key: 'card', label: 'Card' },
                              { key: 'qr_code', label: 'QR' },
                              { key: 'loan', label: 'Loan' },
                            ].map(({ key, label }) => (
                              <button key={key}
                                onClick={() => {
                                  const u = [...splitParts];
                                  u[idx] = { ...u[idx], method: key };
                                  setSplitParts(u);
                                }}
                                className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                                style={{
                                  backgroundColor: part.method === key ? C : '#fff',
                                  color: part.method === key ? '#fff' : '#6B7280',
                                  borderColor: part.method === key ? C : '#E5E7EB',
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          {part.method === 'loan' && (
                            <div className="mt-2 space-y-2 pt-2 border-t border-amber-200">
                              <input type="text"
                                value={part.loanName}
                                onChange={e => { const u=[...splitParts]; u[idx]={...u[idx],loanName:e.target.value}; setSplitParts(u); }}
                                placeholder={t('cashier.orders.customerName')}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none"
                              />
                              <PhoneInput
                                value={part.loanPhone}
                                onChange={v => { const u=[...splitParts]; u[idx]={...u[idx],loanPhone:v}; setSplitParts(u); }}
                                size="sm"
                              />
                              <DatePicker
                                value={part.loanDueDate}
                                onChange={v => { const u=[...splitParts]; u[idx]={...u[idx],loanDueDate:v}; setSplitParts(u); }}
                                size="sm"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const splitTotal = splitParts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
                      const isValid = Math.abs(splitTotal - totalToPay) < 1;
                      return (
                        <div className="flex items-center justify-between mt-3 px-1">
                          <span className="text-xs font-bold text-gray-400 uppercase">{t('cashier.orders.splitBill')} {t('common.total')}</span>
                          <span className={`text-sm font-bold ${isValid ? 'text-green-600' : 'text-red-500'}`}>
                            {money(splitTotal)} / {money(totalToPay)}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Loan Fields */}
                {pf.paymentMethod === 'loan' && !pf.splitWays && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-700 font-medium">{t('cashier.orders.loanNotice')}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.customerName')}</p>
                        <input type="text" value={pf.loanName}
                          onChange={e => setPayForm({ ...pf, loanName: e.target.value })}
                          placeholder={t('cashier.orders.namePlaceholder')}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('common.phone')}</p>
                        <PhoneInput value={pf.loanPhone} onChange={v => setPayForm({ ...pf, loanPhone: v })} size="md" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('cashier.orders.expectedReturn')}</p>
                        <DatePicker value={pf.loanDueDate} onChange={v => setPayForm({ ...pf, loanDueDate: v })} size="sm" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('common.notes')}</p>
                  <textarea
                    value={pf.notes}
                    onChange={e => setPayForm({ ...pf, notes: e.target.value })}
                    placeholder={t('cashier.orders.addPaymentNotes')}
                    rows={2}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none resize-none"
                  />
                </div>

                {err && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />{err}
                  </div>
                )}
              </div>

              {/* RIGHT — Order Summary & Actions */}
              <div className="w-[300px] flex flex-col bg-gray-50 flex-shrink-0 border-l border-gray-200">
                <div className="flex-1 overflow-y-auto p-5 space-y-4">

                  {/* Order Items */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('cashier.orders.orderItems')}</p>
                      <span className="text-xs font-semibold" style={{ color: C }}>
                        {orderItems.reduce((s, i) => s + (i.quantity || i.qty || 1), 0)} {t('common.items')}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {orderItems.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">{t('common.noResults')}</p>
                      ) : orderItems.map((item, idx) => (
                        <div key={idx} className="px-4 py-2.5 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{item.name || item.menuItemName || t('cashier.orders.item')}</p>
                            <p className="text-xs text-gray-400">{money(item.unitPrice || item.price || 0)} × {item.quantity || item.qty || 1}</p>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 ml-3">
                            {money((item.unitPrice || item.price || 0) * (item.quantity || item.qty || 1))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">{t('common.subtotal')}</span>
                      <span className="text-sm font-semibold text-gray-900">{money(orderTotal)}</span>
                    </div>
                    {discountAmt > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-600">
                          {t('common.discount')}{pf.discReason ? ` · ${pf.discReason}` : ''}
                        </span>
                        <span className="text-sm font-semibold text-green-600">-{money(discountAmt)}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                      <span className="text-base font-bold text-gray-900">{t('common.total')}</span>
                      <span className="text-2xl font-bold" style={{ color: C }}>{money(totalToPay)}</span>
                    </div>
                  </div>

                  {/* Method indicator */}
                  <div className="bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-3">
                    {(() => {
                      const m = PMETHODS.find(m => m.key === pf.paymentMethod);
                      return m ? <m.Icon className="w-5 h-5" style={{ color: C }} /> : null;
                    })()}
                    <div className="flex-1">
                      <span className="text-sm font-bold text-gray-900 capitalize">
                        {pf.paymentMethod?.replace('_', ' ') || t('payment.cash', 'Cash')}
                      </span>
                      {pf.splitWays && <span className="text-xs text-gray-400 ml-2">· {pf.splitWays} {t('cashier.orders.ways')}</span>}
                    </div>
                  </div>

                  {/* Cash change */}
                  {pf.paymentMethod === 'cash' && chg > 0 && (
                    <div className="bg-green-50 rounded-xl p-4 border border-green-200 flex items-center justify-between">
                      <span className="text-sm font-medium text-green-700">{t('cashier.orders.change')}</span>
                      <span className="text-xl font-bold text-green-700">{money(chg)}</span>
                    </div>
                  )}
                </div>

                {/* Actions footer */}
                <div className="p-4 border-t border-gray-200 space-y-2 flex-shrink-0 bg-white">
                  {/* Print Check */}
                  <button
                    onClick={handlePrintCheck}
                    disabled={isPrinting}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition border-2 disabled:opacity-50"
                    style={{ borderColor: '#E5E7EB', color: '#374151', backgroundColor: '#F9FAFB' }}
                  >
                    {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                    {isPrinting ? t('common.processing') : t('cashier.orders.printReceipt')}
                  </button>

                  {/* Printer IP config */}
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs flex items-center gap-1.5" style={{ color: '#9CA3AF' }}>
                      <Printer className="w-3 h-3" />
                      {printerIp
                        ? <span style={{ color: '#374151', fontWeight: 500 }}>{printerIp}</span>
                        : <span>{t('cashier.orders.noPrinterIp')}</span>}
                    </span>
                    <button
                      onClick={() => { setShowPrinterCfg(v => !v); setPrinterIpDraft(printerIp); }}
                      className="text-xs font-semibold hover:underline"
                      style={{ color: C }}
                    >
                      {showPrinterCfg ? t('common.cancel') : (printerIp ? t('common.edit') : t('common.settings'))}
                    </button>
                  </div>
                  {showPrinterCfg && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={printerIpDraft}
                        onChange={e => setPrinterIpDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { setPrinterIp(printerIpDraft.trim()); setShowPrinterCfg(false); } }}
                        placeholder={t('placeholders.ipAddress', '192.168.1.100')}
                        className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': C }}
                        autoFocus
                      />
                      <button
                        onClick={() => { setPrinterIp(printerIpDraft.trim()); setShowPrinterCfg(false); }}
                        className="px-4 py-2 text-xs font-bold text-white rounded-lg"
                        style={{ backgroundColor: C }}
                      >
                        {t('common.save')}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={confirmPay}
                    disabled={paying}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3.5 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50"
                    style={{ backgroundColor: '#1F2937' }}
                  >
                    {paying
                      ? <Loader2 className="w-5 h-5 animate-spin" />
                      : <Check className="w-4 h-4 text-green-400" />}
                    {' '}{t('cashier.orders.confirmPayment')} · {money(totalToPay)}
                  </button>
                  <button
                    onClick={() => setShowPayModal(false)}
                    className="w-full py-2 text-gray-400 font-medium text-sm hover:text-gray-600 transition-colors"
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
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CashierOrders() {
  const { t } = useTranslation();
  const { user, restaurant } = useAuth();

  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [activeTab, setActiveTab] = useState('restaurantOrders');
  const [selected,  setSelected]  = useState(null);  // order being viewed/paid

  // Stats
  const [stats, setStats] = useState({ pending: 0, doneToday: 0, revenue: 0 });

  // Settings
  const [taxSettings,  setTaxSettings]  = useState({ taxRate: 0, taxEnabled: false });
  const [restSettings, setRestSettings] = useState({
    restaurantName:       restaurant?.name || t('common.brandRestaurant', 'The Bill Restaurant'),
    receiptHeader:        'Thank you for dining with us!',
    serviceChargeRate:    0,
    serviceChargeEnabled: false,
  });

  // Receipt
  const [receipt, setReceipt] = useState(null);  // { order, payment }

  // Bill toast
  const [toast,     setToast]     = useState('');
  const [toastVis,  setToastVis]  = useState(false);
  const prevBillIds = useRef(new Set());
  const toastTimer  = useRef(null);

  // ── Settings load (once) ──────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      accountingAPI.getTaxSettings().catch(() => null),
      accountingAPI.getRestaurantSettings().catch(() => null),
    ]).then(([tax, rest]) => {
      if (tax)  setTaxSettings(tax);
      if (rest) setRestSettings(rest);
    });
  }, []);

  // ── Orders ────────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await ordersAPI.getAll({
        status: 'pending,sent_to_kitchen,preparing,ready,served,bill_requested',
      });
      const list = Array.isArray(data) ? data : [];
      setOrders(list);
      setError('');

      // Bill request toast
      const requested = list.filter(o => o.status === 'bill_requested');
      const newOnes   = requested.filter(o => !prevBillIds.current.has(o.id));
      if (newOnes.length > 0 && prevBillIds.current.size > 0) {
        const o = newOnes[0];
        const label = o.tableName || o.customerName || fmtOrderNum(o);
        const extra = newOnes.length > 1 ? ` (+${newOnes.length - 1} more)` : '';
        setToast(`${label} requested the bill!${extra}`);
        setToastVis(true);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastVis(false), 4500);
      }
      prevBillIds.current = new Set(requested.map(o => o.id));
    } catch (e) {
      if (!silent) setError(e?.error || e?.message || t('alerts.failedLoadOrders', 'Failed to load orders'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const pending = orders.length;
      // Get today's paid orders for Done Today / Revenue
      const paid = await ordersAPI.getAll({ status: 'paid' });
      const list  = Array.isArray(paid) ? paid : [];
      const today = new Date().toDateString();
      const todayPaid = list.filter(o =>
        new Date(o.paidAt || o.updatedAt || o.createdAt).toDateString() === today
      );
      const rev = todayPaid.reduce((s, o) => s + (parseFloat(o.totalAmount) || 0), 0);
      setStats({ pending, doneToday: todayPaid.length, revenue: rev });
    } catch { /* silent */ }
  }, [orders.length]);

  useEffect(() => {
    fetchOrders();
    const iv = setInterval(() => fetchOrders(true), 5000);
    return () => clearInterval(iv);
  }, [fetchOrders]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ── After payment ─────────────────────────────────────────────────────────
  const handlePaid = useCallback(async ({ order, payment }) => {
    setSelected(null);
    setReceipt({ order, payment });
    await fetchOrders(true);
    fetchStats();
  }, [fetchOrders, fetchStats]);

  // ── If order selected → show panel ───────────────────────────────────────
  if (selected) {
    return (
      <>
        <OrderPanel
          order={selected}
          taxSettings={taxSettings}
          restSettings={restSettings}
          user={user}
          onBack={() => setSelected(null)}
          onPaid={handlePaid}
        />
        {receipt && (
          <ReceiptModal
            order={receipt.order}
            payment={receipt.payment}
            restSettings={restSettings}
            taxSettings={taxSettings}
            user={user}
            onClose={() => setReceipt(null)}
          />
        )}
      </>
    );
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const requestedCount = orders.filter(o => o.status === 'bill_requested').length;

  const filtered = orders.filter(o => {
    if (activeTab === 'restaurantOrders') return o.orderType === 'dine_in' || !o.orderType;
    if (activeTab === 'requested')        return o.status === 'bill_requested';
    if (activeTab === 'toGo')             return o.orderType === 'to_go' || o.orderType === 'takeaway';
    if (activeTab === 'delivery')         return o.orderType === 'delivery';
    return true; // allActive
  });

  // ── Render list ───────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-auto bg-gradient-to-b from-gray-50 to-gray-100">
      <BillToast msg={toast} visible={toastVis} />

      <div className="max-w-7xl mx-auto p-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl shadow-sm" style={{ backgroundColor: C }}>
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900">{t('cashier.orders.title')}</h1>
              <p className="text-sm text-gray-500">{t('cashier.orders.activeOrderCount', { count: orders.length })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchOrders()}
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-xl border border-gray-200 hover:border-gray-300 font-medium text-sm transition shadow-sm">
              <RefreshCw className="w-4 h-4" />{t('common.refresh')}
            </button>
            <Link to="/cashier/new-order"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-semibold text-sm shadow-sm transition"
              style={{ backgroundColor: C }}>
              <Plus className="w-4 h-4" />{t('nav.newOrder')}
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-3 mb-4">
          <StatCard label={t('cashier.orders.pendingCount')}    value={stats.pending}    color="#D97706" icon={ShoppingBag} />
          <StatCard label={t('cashier.orders.doneToday')} value={stats.doneToday}  color={SUCCESS}  icon={CheckCircle2} />
          <StatCard label={t('cashier.orders.revenue')}    value={`${Math.round(stats.revenue / 1000)}K`} sub={t('common.currency')} color={C} icon={TrendingUp} />
        </div>

        {/* Tabs */}
        <div
          className="flex items-center gap-2.5 mb-5 overflow-x-auto pb-1 scrollbar-hide"
          style={{ overscrollBehaviorX: 'contain' }}
          onWheel={(e) => {
            if (e.deltaY !== 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              e.currentTarget.scrollLeft += e.deltaY;
            }
          }}
        >
          {TAB_KEYS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold whitespace-nowrap transition flex-shrink-0 shadow-sm"
              style={{ backgroundColor: activeTab === tab ? C : '#FFFFFF', color: activeTab === tab ? '#fff' : '#374151', border: activeTab === tab ? 'none' : '1px solid #E5E7EB' }}>
              {t(`cashier.orders.${tab}`)}
              {tab === 'requested' && requestedCount > 0 && (
                <span className="min-w-[20px] h-[20px] px-1.5 rounded-full text-xs font-bold text-white text-center leading-none flex items-center justify-center"
                  style={{ backgroundColor: activeTab === tab ? 'rgba(255,255,255,0.3)' : '#EF4444' }}>
                  {requestedCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        {/* Orders grid */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: C }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400">
            <ShoppingBag className="w-14 h-14 mb-3 opacity-30" />
            <p className="text-base font-semibold">
              {t('admin.orders.noOrdersFound')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(order => {
              const grand   = parseFloat(order.totalAmount) || 0;
              const count   = parseInt(order.itemCount) || (order.items?.length ?? 0);
              const isToGo  = order.orderType === 'to_go' || order.orderType === 'takeaway';
              const isDeli  = order.orderType === 'delivery';
              const typeLabel = isDeli ? t('orderTypes.delivery') : isToGo ? t('orderTypes.toGo') : t('orderTypes.dineIn');
              const typeColor = isDeli ? '#8B5CF6' : isToGo ? '#10B981' : '#6B7280';
              const dname   = (isToGo || isDeli)
                ? (order.customerName || t('cashier.orders.walkIn'))
                : (order.tableName || t('cashier.orders.walkIn'));

              const cardItems   = order.items || [];
              const cardReady   = cardItems.filter(i => i.itemReady).length;
              const isPartial   = cardReady > 0 && cardReady < cardItems.length && order.status !== 'ready';
              const isActionable = ['bill_requested','served','ready'].includes(order.status);

              return (
                <div key={order.id}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                  style={{
                    border: `1px solid ${isPartial ? '#F97316' : '#E5E7EB'}`,
                    borderLeft: isPartial ? '4px solid #F97316' : undefined,
                  }}>
                  <div className="p-5">
                    {/* Top */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0 flex-1 mr-3">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-lg font-extrabold text-gray-900">{fmtOrderNum(order)}</span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ backgroundColor: typeColor + '1A', color: typeColor }}>
                            {typeLabel}
                          </span>
                          {isPartial && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700">
                              <Flame className="w-3 h-3" />{cardReady}/{cardItems.length}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-gray-500 truncate">{dname}</p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>

                    {/* Meta */}
                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mb-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <ShoppingBag className="w-3.5 h-3.5" />{count} item{count !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {(isToGo || isDeli) ? (order.customerPhone || t('cashier.orders.noPhone')) : (order.waitressName || t('cashier.orders.counter'))}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />{elapsed(order.createdAt, t)}
                      </span>
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t('common.total')}</span>
                      <span className="text-xl font-extrabold" style={{ color: C }}>{money(grand)}</span>
                    </div>
                  </div>

                  {/* Action footer */}
                  <div className="flex border-t border-gray-100">
                    <button onClick={() => setSelected(order)}
                      className="flex-1 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                      {t('common.details')}
                    </button>
                    {isActionable && (
                      <>
                        <div className="w-px bg-gray-100" />
                        <button onClick={() => setSelected(order)}
                          className="flex-1 py-3 text-sm font-bold text-white flex items-center justify-center gap-1.5 transition"
                          style={{ backgroundColor: C }}>
                          <DollarSign className="w-3.5 h-3.5" />{t('cashier.orders.processPayment')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Receipt shown after returning from payment */}
      {receipt && !selected && (
        <ReceiptModal
          order={receipt.order}
          payment={receipt.payment}
          restSettings={restSettings}
          taxSettings={taxSettings}
          user={user}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}
