import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard, AlertCircle, Check, Loader2, Search, X,
  Wallet, QrCode, Receipt, Clock, User, TableProperties,
  Calendar, ChevronDown, Banknote, TrendingUp,
  Phone, FileText, ShoppingBag, CalendarDays, Hash, Info,
} from 'lucide-react';
import { loansAPI, ordersAPI } from '../../api/client';
import { money } from '../../hooks/useApi';
import { useTranslation } from '../../context/LanguageContext';

// ── Admin theme constants ─────────────────────────────────────────────────────
const A       = '#2563EB'; // admin blue-600
const A_BG    = '#EFF6FF'; // blue-50
const A_BORDER = '#BFDBFE'; // blue-200

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const fmtDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const getMonday = (d) => {
  const date = new Date(d);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date;
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
};

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const formatLoanQty = (item) => {
  const u = String(item.unit || 'piece').toLowerCase();
  const q = Number(item.quantity || item.qty) || 0;
  if (u === 'kg' || u === 'l') return `${q} ${u}`;
  return `${q}`;
};

const TODAY = todayStr();

const dueDateLabel = (dueDateStr, status, t) => {
  if (!dueDateStr) return { label: '—', color: '#6B7280' };
  const dateStr = typeof dueDateStr === 'string' ? dueDateStr.slice(0, 10) : fmtDateStr(new Date(dueDateStr));
  if (status === 'paid') return { label: fmtDate(dueDateStr), color: '#6B7280' };
  if (dateStr < TODAY) {
    const days = Math.round((new Date(TODAY) - new Date(dateStr)) / 86400000);
    return { label: t('cashier.loans.overdueLabel', { days }), color: '#DC2626' };
  }
  if (dateStr === TODAY) return { label: t('cashier.loans.dueToday'), color: '#D97706' };
  const days = Math.round((new Date(dateStr) - new Date(TODAY)) / 86400000);
  if (days <= 3) return { label: t('cashier.loans.daysLeft', { days }), color: '#D97706' };
  return { label: fmtDate(dueDateStr), color: '#6B7280' };
};

const isOverdue = (loan) =>
  loan.status === 'active' && loan.dueDate && loan.dueDate.slice(0, 10) < TODAY;

// ── Presets ───────────────────────────────────────────────────────────────────
const getPresets = (t) => [
  { label: t('periods.allTime'),   from: '2020-01-01', to: TODAY },
  { label: t('periods.today'),     from: TODAY, to: TODAY },
  { label: t('periods.thisWeek'),  from: fmtDateStr(getMonday(new Date())), to: TODAY },
  { label: t('periods.thisMonth'), from: fmtDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: TODAY },
];

// ── Calendar Picker (blue-themed) ─────────────────────────────────────────────
function CalendarPicker({ visible, onClose, period, onChange, t }) {
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [tempFrom, setTempFrom] = useState(period.from);
  const [tempTo, setTempTo] = useState(period.to);
  const [step, setStep] = useState('from');

  useEffect(() => {
    if (visible) {
      setTempFrom(period.from); setTempTo(period.to); setStep('from');
      const d = new Date(period.from);
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
    }
  }, [visible, period.from, period.to]);

  const prevMonth = () => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); };
  const nextMonth = () => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); };

  const handleDay = (ds) => {
    if (step==='from') { setTempFrom(ds); setTempTo(ds); setStep('to'); }
    else {
      if (ds < tempFrom) { setTempTo(tempFrom); setTempFrom(ds); }
      else setTempTo(ds);
      setStep('from');
    }
  };

  const setPreset = (from, to) => {
    setTempFrom(from); setTempTo(to); setStep('from');
    const d = new Date(from === '2020-01-01' ? TODAY : from);
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  };

  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMon = new Date(viewYear, viewMonth+1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) {
    cells.push(`${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute right-6 top-[72px] bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5" style={{ color: A }} />
            <span className="font-bold text-gray-900">{t('cashier.loans.selectPeriod')}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-3 items-center">
            <button onClick={() => setStep('from')} className="flex-1 rounded-xl border-2 p-2.5 text-center transition"
              style={step==='from' ? { borderColor: A, backgroundColor: A_BG } : { borderColor:'#E5E7EB' }}>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('common.from')}</p>
              <p className="font-bold text-sm" style={{ color: step==='from' ? A : '#111827' }}>{tempFrom}</p>
            </button>
            <ChevronDown className="w-4 h-4 text-gray-400 rotate-[-90deg] flex-shrink-0" />
            <button onClick={() => setStep('to')} className="flex-1 rounded-xl border-2 p-2.5 text-center transition"
              style={step==='to' ? { borderColor: A, backgroundColor: A_BG } : { borderColor:'#E5E7EB' }}>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('common.to')}</p>
              <p className="font-bold text-sm" style={{ color: step==='to' ? A : '#111827' }}>{tempTo}</p>
            </button>
          </div>
          <p className="text-xs text-center text-gray-400">{t('cashier.loans.tapDateHint')}</p>
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 font-bold text-lg">‹</button>
            <span className="text-sm font-semibold text-gray-800">{t('datePicker.months')[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 font-bold text-lg">›</button>
          </div>
          <div className="grid grid-cols-7">
            {t('datePicker.days').map(d => <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>)}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((ds, di) => {
                if (!ds) return <div key={`e${di}`} />;
                const isFrom = ds===tempFrom, isTo = ds===tempTo && tempFrom!==tempTo;
                const inRange = ds>tempFrom && ds<tempTo, isToday = ds===TODAY;
                return (
                  <button key={ds} onClick={() => handleDay(ds)}
                    className="text-center text-xs py-2 rounded-lg font-medium transition"
                    style={{
                      backgroundColor: (isFrom||isTo) ? A : inRange ? A_BG : 'transparent',
                      color: (isFrom||isTo) ? '#fff' : inRange ? A : isToday ? A : '#374151',
                      fontWeight: (isFrom||isTo||isToday) ? '700' : '400',
                    }}>
                    {parseInt(ds.split('-')[2], 10)}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {getPresets(t).map(p => (
              <button key={p.label} onClick={() => setPreset(p.from, p.to)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition"
                style={{
                  borderColor: tempFrom===p.from && tempTo===p.to ? A : '#E5E7EB',
                  color: tempFrom===p.from && tempTo===p.to ? A : '#374151',
                  backgroundColor: tempFrom===p.from && tempTo===p.to ? A_BG : '#fff',
                }}>{p.label}</button>
            ))}
          </div>
          <button onClick={() => { onChange({ from: tempFrom, to: tempTo }); onClose(); }}
            className="w-full py-3 rounded-xl text-white font-bold text-sm transition" style={{ backgroundColor: A }}>
            {tempFrom===tempTo ? tempFrom : `${tempFrom} → ${tempTo}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── LoanPayModal (blue-themed) ────────────────────────────────────────────────
const PAY_METHODS = [
  { key: 'Cash',    tKey: 'paymentMethods.cash',   icon: <Banknote className="w-5 h-5" />,    color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  { key: 'Card',    tKey: 'paymentMethods.card',   icon: <CreditCard className="w-5 h-5" />,  color: A,         bg: A_BG,       border: A_BORDER },
  { key: 'QR Code', tKey: 'paymentMethods.qrCode', icon: <QrCode className="w-5 h-5" />,      color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
];

function LoanPayModal({ loan, onClose, onConfirm, loading }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState('Cash');
  if (!loan) return null;

  const amount   = parseFloat(loan.amount || 0);
  const due      = dueDateLabel(loan.dueDate, loan.status, t);
  const overdue  = isOverdue(loan);
  const selected = PAY_METHODS.find(m => m.key === method) || PAY_METHODS[0];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex overflow-hidden"
        style={{ maxWidth: '880px', maxHeight: '88vh', minHeight: '520px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* LEFT: Loan Info */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-7 py-5 border-b border-gray-100 flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${A_BG} 0%, #ffffff 60%)` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: A }}>
                  <Receipt className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xl font-extrabold text-gray-900">{t('cashier.loans.collectPayment')}</p>
                  <p className="text-sm text-gray-500 mt-0.5">Confirm payment method to mark this loan as paid</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-7 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-100 p-4 flex items-center gap-3 bg-gray-50">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: A_BG }}>
                  <User className="w-4 h-4" style={{ color: A }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('cashier.loans.customer')}</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{loan.customerName || '—'}</p>
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 p-4 flex items-center gap-3 bg-gray-50">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: A_BG }}>
                  <TrendingUp className="w-4 h-4" style={{ color: A }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('cashier.loans.loanAmount')}</p>
                  <p className="text-sm font-bold" style={{ color: A }}>{money(amount)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border p-4 flex items-center gap-3"
                style={{ borderColor: overdue ? '#FECACA' : '#E5E7EB', backgroundColor: overdue ? '#FEF2F2' : '#F9FAFB' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: overdue ? '#FEE2E2' : A_BG }}>
                  <Clock className="w-4 h-4" style={{ color: overdue ? '#DC2626' : A }} />
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('cashier.loans.dueDate')}</p>
                  <p className="text-sm font-bold" style={{ color: due.color }}>{due.label}</p>
                </div>
              </div>
              {loan.customerPhone && (
                <div className="rounded-xl border border-gray-100 p-4 flex items-center gap-3 bg-gray-50">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: A_BG }}>
                    <Phone className="w-4 h-4" style={{ color: A }} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('cashier.loans.phone')}</p>
                    <p className="text-sm font-bold text-gray-900">{loan.customerPhone}</p>
                  </div>
                </div>
              )}
            </div>

            {loan.notes && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
                <Receipt className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">{t('cashier.loans.notes')}</p>
                  <p className="text-sm text-amber-900">{loan.notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Payment selection */}
        <div className="flex flex-col bg-gray-50" style={{ width: '320px', borderLeft: '1px solid #F3F4F6', flexShrink: 0 }}>
          <div className="px-6 pt-6 pb-4 border-b border-gray-200 flex-shrink-0">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t('cashier.loans.selectPaymentMethod')}</p>
          </div>

          <div className="flex-1 p-5 space-y-2.5 flex flex-col justify-center">
            {PAY_METHODS.map(m => (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition"
                style={method === m.key
                  ? { backgroundColor: m.bg, borderColor: m.color, color: m.color }
                  : { backgroundColor: '#fff', borderColor: '#E5E7EB', color: '#374151' }
                }
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition"
                  style={method === m.key
                    ? { backgroundColor: m.color, color: '#fff' }
                    : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                  }>
                  {m.icon}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">{t(m.tKey)}</p>
                  {method === m.key && (
                    <p className="text-xs mt-0.5" style={{ color: m.color }}>{t('cashier.loans.selected')}</p>
                  )}
                </div>
                {method === m.key && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: m.color }}>
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="p-5 border-t border-gray-200 space-y-3 flex-shrink-0">
            <div className="flex justify-between items-center px-1">
              <span className="text-sm text-gray-500 font-medium">{t('cashier.loans.totalToCollect')}</span>
              <span className="text-lg font-extrabold" style={{ color: A }}>{money(amount)}</span>
            </div>
            <button
              onClick={() => onConfirm(method)}
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
              style={{ backgroundColor: selected.color }}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {loading ? t('common.processing') : t('cashier.orders.confirmPayment')}
            </button>
            <button
              onClick={onClose}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-white border border-gray-200 text-gray-500 font-semibold text-sm hover:bg-gray-100 transition"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LoanDetailsModal (blue-themed) ────────────────────────────────────────────
function LoanDetailsModal({ loan, onClose, onMarkPaid }) {
  const { t } = useTranslation();
  const [order, setOrder]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [orderError, setOrderError] = useState(null);

  useEffect(() => {
    if (!loan) return;
    let cancel = false;
    const fetchOrder = async () => {
      if (!loan.orderId) { setOrder(null); return; }
      setLoading(true); setOrderError(null);
      try {
        const data = await ordersAPI.getById(loan.orderId);
        if (!cancel) setOrder(data);
      } catch (e) {
        if (!cancel) setOrderError(e?.error || e?.message || t('cashier.loans.couldNotLoadOrder', 'Could not load order'));
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    fetchOrder();
    return () => { cancel = true; };
  }, [loan, t]);

  if (!loan) return null;

  const amount   = parseFloat(loan.amount || 0);
  const isPaid   = loan.status === 'paid';
  const over     = isOverdue(loan);
  const due      = dueDateLabel(loan.dueDate, loan.status, t);
  const items    = order?.items || order?.orderItems || [];
  const subtotal = items.reduce((s, x) => s + (Number(x.unitPrice) || Number(x.price) || 0) * (Number(x.quantity) || Number(x.qty) || 1), 0);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden"
        style={{ maxWidth: '720px', maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-7 py-5 border-b border-gray-100 flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${A_BG} 0%, #ffffff 60%)` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: A }}>
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-extrabold text-gray-900 truncate">
                  {t('cashier.loans.loanDetails', 'Loan Details')}
                </p>
                <p className="text-sm text-gray-500 mt-0.5 truncate">{loan.customerName || '—'}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-7 space-y-5">
          <div className="flex items-center justify-between p-4 rounded-xl border"
            style={{
              borderColor: isPaid ? '#BBF7D0' : over ? '#FECACA' : '#FDE68A',
              backgroundColor: isPaid ? '#F0FDF4' : over ? '#FEF2F2' : '#FFFBEB',
            }}>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-1"
                style={{ color: isPaid ? '#16A34A' : over ? '#DC2626' : '#D97706' }}>
                {isPaid ? t('statuses.paid') : over ? t('cashier.loans.overdue') : t('common.active')}
              </p>
              <p className="text-2xl font-extrabold"
                style={{ color: isPaid ? '#16A34A' : over ? '#DC2626' : A }}>
                {money(amount)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t('cashier.loans.dueDate')}</p>
              <p className="text-sm font-bold" style={{ color: due.color }}>{due.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{fmtDate(loan.dueDate)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-100 p-4 flex items-center gap-3 bg-gray-50">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: A_BG }}>
                <User className="w-4 h-4" style={{ color: A }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('cashier.loans.customer')}</p>
                <p className="text-sm font-bold text-gray-900 truncate">{loan.customerName || '—'}</p>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 p-4 flex items-center gap-3 bg-gray-50">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: A_BG }}>
                <Phone className="w-4 h-4" style={{ color: A }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('cashier.loans.phone')}</p>
                <p className="text-sm font-bold text-gray-900 truncate">{loan.customerPhone || '—'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-100 p-4 flex items-center gap-3 bg-gray-50">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: A_BG }}>
                <Hash className="w-4 h-4" style={{ color: A }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('common.orderNumber', 'Order #')}</p>
                <p className="text-sm font-bold text-gray-900 truncate">
                  {loan.dailyNumber != null ? `#${loan.dailyNumber}` : '—'}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 p-4 flex items-center gap-3 bg-gray-50">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: A_BG }}>
                <TableProperties className="w-4 h-4" style={{ color: A }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('common.table', 'Table')}</p>
                <p className="text-sm font-bold text-gray-900 truncate">{loan.tableName || '—'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-100 p-4 flex items-center gap-3 bg-gray-50">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: A_BG }}>
                <CalendarDays className="w-4 h-4" style={{ color: A }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('cashier.loans.takenOn', 'Taken on')}</p>
                <p className="text-sm font-bold text-gray-900 truncate">{fmtDateTime(loan.createdAt)}</p>
              </div>
            </div>
            {isPaid ? (
              <div className="rounded-xl border border-gray-100 p-4 flex items-center gap-3 bg-gray-50">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#F0FDF4' }}>
                  <Check className="w-4 h-4" style={{ color: '#16A34A' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('cashier.loans.paidOn', 'Paid on')}</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{fmtDateTime(loan.paidAt)}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-100 p-4 flex items-center gap-3 bg-gray-50">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: over ? '#FEE2E2' : A_BG }}>
                  <Clock className="w-4 h-4" style={{ color: over ? '#DC2626' : A }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('cashier.loans.dueDate')}</p>
                  <p className="text-sm font-bold" style={{ color: due.color }}>{fmtDate(loan.dueDate)}</p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" style={{ color: A }} />
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                {t('cashier.loans.orderItems', 'Order Items')}
              </p>
              {items.length > 0 && (
                <span className="ml-auto text-xs font-semibold text-gray-500">
                  {items.length} {items.length === 1 ? t('common.item', 'item') : t('common.items', 'items')}
                </span>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : orderError ? (
                <div className="p-4 flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>{orderError}</span>
                </div>
              ) : !loan.orderId ? (
                <div className="p-4 flex items-center gap-2 text-sm text-gray-500">
                  <Info className="w-4 h-4" />
                  <span>{t('cashier.loans.noOrderLinked', 'No order linked to this loan')}</span>
                </div>
              ) : items.length === 0 ? (
                <div className="p-4 flex items-center gap-2 text-sm text-gray-500">
                  <Info className="w-4 h-4" />
                  <span>{t('cashier.loans.noItems', 'No items on this order')}</span>
                </div>
              ) : (
                items.map((it, i) => {
                  const name  = it.name || it.itemName || it.menuItemName || '—';
                  const unitP = Number(it.unitPrice) || Number(it.price) || 0;
                  const qty   = Number(it.quantity) || Number(it.qty) || 1;
                  const line  = unitP * qty;
                  return (
                    <div key={it.id || i} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{formatLoanQty(it)} × {money(unitP)}</p>
                      </div>
                      <p className="text-sm font-bold text-gray-900 flex-shrink-0">{money(line)}</p>
                    </div>
                  );
                })
              )}
            </div>
            {items.length > 0 && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t('common.subtotal')}</span>
                <span className="text-sm font-bold text-gray-900">{money(subtotal)}</span>
              </div>
            )}
          </div>

          {loan.notes && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
              <FileText className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">{t('cashier.loans.notes')}</p>
                <p className="text-sm text-amber-900 break-words">{loan.notes}</p>
              </div>
            </div>
          )}

          {isPaid && loan.paymentMethod && (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#DCFCE7' }}>
                <Check className="w-4 h-4" style={{ color: '#16A34A' }} />
              </div>
              <div>
                <p className="text-xs font-bold text-green-700 uppercase tracking-wide">{t('cashier.loans.paidVia', 'Paid via')}</p>
                <p className="text-sm font-bold text-green-900">{loan.paymentMethod}</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-7 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-100 transition"
          >
            {t('common.close', 'Close')}
          </button>
          {!isPaid && (
            <button
              onClick={() => onMarkPaid(loan)}
              className="px-5 py-2.5 rounded-xl text-white font-bold text-sm flex items-center gap-2 transition"
              style={{ backgroundColor: A }}
            >
              <Check className="w-4 h-4" />
              {t('cashier.loans.markPaid')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AdminLoans ────────────────────────────────────────────────────────────────
export default function AdminLoans() {
  const { t } = useTranslation();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [calOpen, setCalOpen] = useState(false);
  const [period, setPeriod] = useState({ from: '2020-01-01', to: todayStr() });
  const [payTarget, setPayTarget] = useState(null);
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [paying, setPaying] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchLoans = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await loansAPI.getAll({ from: period.from, to: period.to });
      setLoans(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err?.error || err?.message || t('cashier.loans.failedToLoad'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchLoans();
    const iv = setInterval(() => fetchLoans(true), 10000);
    return () => clearInterval(iv);
  }, [fetchLoans]);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const handleMarkPaid = async (method) => {
    if (!payTarget) return;
    setPaying(true);
    try {
      await loansAPI.markPaid(payTarget.id, { paymentMethod: method });
      setLoans(prev => prev.map(l => l.id === payTarget.id ? { ...l, status: 'paid' } : l));
      setPayTarget(null);
      showToast('success', t('cashier.loans.markedAsPaid'));
    } catch (err) {
      showToast('error', err?.error || t('cashier.loans.couldNotUpdate'));
    } finally {
      setPaying(false);
    }
  };

  const filtered = useMemo(() => {
    return loans.filter(loan => {
      const q = search.toLowerCase();
      const matchSearch = !q || (loan.customerName || '').toLowerCase().includes(q) ||
        (loan.customerPhone || '').includes(q) ||
        (loan.notes || '').toLowerCase().includes(q);

      const over = isOverdue(loan);
      let matchStatus = true;
      if (statusFilter === 'active') matchStatus = loan.status === 'active' && !over;
      else if (statusFilter === 'overdue') matchStatus = over;
      else if (statusFilter === 'paid') matchStatus = loan.status === 'paid';

      return matchSearch && matchStatus;
    });
  }, [loans, search, statusFilter]);

  const totalLoans = loans.length;
  const activeLoans = loans.filter(l => l.status === 'active').length;
  const overdueLoans = loans.filter(l => isOverdue(l)).length;
  const paidLoans = loans.filter(l => l.status === 'paid').length;
  const totalOutstanding = loans.filter(l => l.status === 'active').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: A_BG }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: A }} />
          </div>
          <p className="text-gray-600 font-medium">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-gray-50 to-gray-100">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2"
          style={{ backgroundColor: toast.type==='success'?'#F0FDF4':'#FEF2F2', color: toast.type==='success'?'#166534':'#DC2626', border: `1px solid ${toast.type==='success'?'#BBF7D0':'#FECACA'}` }}>
          {toast.type==='success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl" style={{ backgroundColor: A }}>
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">{t('cashier.loans.title')}</h1>
          </div>
          <button
            onClick={() => setCalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <Calendar className="w-4 h-4" style={{ color: A }} />
            <span>{period.from === '2020-01-01' ? t('periods.allTime') : `${period.from} → ${period.to}`}</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('cashier.loans.title'),          value: totalLoans,                  color: A,         bg: A_BG,       icon: <CreditCard className="w-5 h-5" /> },
            { label: t('common.active'),                value: activeLoans,                 color: '#D97706', bg: '#FFFBEB',  icon: <Clock className="w-5 h-5" /> },
            { label: t('cashier.loans.overdue'),        value: overdueLoans,                color: '#DC2626', bg: '#FEF2F2',  icon: <AlertCircle className="w-5 h-5" /> },
            { label: t('cashier.loans.outstanding'),    value: money(totalOutstanding),     color: '#7C3AED', bg: '#F5F3FF',  icon: <Wallet className="w-5 h-5" /> },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{s.label}</p>
                <div className="p-2 rounded-xl" style={{ backgroundColor: s.bg, color: s.color }}>{s.icon}</div>
              </div>
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Search + Status Filter */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('cashier.loans.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 bg-white"
              style={{ '--tw-ring-color': A }}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'all',     label: `${t('cashier.loans.allStatuses')} (${totalLoans})` },
              { id: 'active',  label: `${t('common.active')} (${activeLoans - overdueLoans})` },
              { id: 'overdue', label: `${t('cashier.loans.overdue')} (${overdueLoans})` },
              { id: 'paid',    label: `${t('statuses.paid')} (${paidLoans})` },
            ].map(s => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold border transition"
                style={statusFilter === s.id
                  ? { backgroundColor: A, color: '#fff', borderColor: A }
                  : { backgroundColor: '#fff', color: '#374151', borderColor: '#E5E7EB' }
                }
              >{s.label}</button>
            ))}
          </div>
        </div>

        {/* Loans list */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm text-center">
            <CreditCard className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">{t('cashier.loans.noLoansFound')}</p>
            <p className="text-gray-400 text-sm mt-1">
              {search ? t('cashier.loans.noLoansFound') : t('cashier.loans.noLoansFound')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(loan => {
              const over = isOverdue(loan);
              const isPaid = loan.status === 'paid';
              const dueInfo = dueDateLabel(loan.dueDate, loan.status, t);

              return (
                <div
                  key={loan.id}
                  onClick={() => setDetailsTarget(loan)}
                  className="bg-white rounded-2xl border shadow-sm p-5 transition cursor-pointer hover:shadow-md hover:border-blue-200"
                  style={{ borderColor: over ? '#FECACA' : '#F3F4F6', borderLeftWidth: 4, borderLeftColor: isPaid ? '#16A34A' : over ? '#DC2626' : '#D97706' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 truncate">{loan.customerName || t('cashier.loans.unknown')}</p>
                        {loan.customerPhone && (
                          <p className="text-sm text-gray-500 mt-0.5">{loan.customerPhone}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {loan.dailyNumber && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600">
                              <Receipt className="w-3 h-3" />
                              #{loan.dailyNumber}
                            </span>
                          )}
                          {loan.tableName && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600">
                              <TableProperties className="w-3 h-3" />
                              {loan.tableName}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: dueInfo.color + '18', color: dueInfo.color }}>
                            <Clock className="w-3 h-3" />
                            {dueInfo.label}
                          </span>
                        </div>
                        {loan.notes && (
                          <p className="text-xs text-gray-400 mt-1.5 italic">{loan.notes}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <p className="text-xl font-bold"
                        style={{ color: isPaid ? '#16A34A' : over ? '#DC2626' : A }}>
                        {money(parseFloat(loan.amount || 0))}
                      </p>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold border"
                        style={isPaid
                          ? { backgroundColor: '#F0FDF4', color: '#16A34A', borderColor: '#BBF7D0' }
                          : over
                          ? { backgroundColor: '#FEF2F2', color: '#DC2626', borderColor: '#FECACA' }
                          : { backgroundColor: '#FFFBEB', color: '#D97706', borderColor: '#FDE68A' }
                        }>
                        {isPaid ? t('statuses.paid') : over ? t('cashier.loans.overdue') : t('common.active')}
                      </span>
                      {!isPaid && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPayTarget(loan); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-semibold transition"
                          style={{ backgroundColor: A }}
                        >
                          <Check className="w-3.5 h-3.5" />
                          {t('cashier.loans.markPaid')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CalendarPicker
        visible={calOpen}
        onClose={() => setCalOpen(false)}
        period={period}
        onChange={setPeriod}
        t={t}
      />

      {payTarget && (
        <LoanPayModal
          loan={payTarget}
          onClose={() => setPayTarget(null)}
          onConfirm={handleMarkPaid}
          loading={paying}
        />
      )}

      {detailsTarget && !payTarget && (
        <LoanDetailsModal
          loan={detailsTarget}
          onClose={() => setDetailsTarget(null)}
          onMarkPaid={(loan) => { setDetailsTarget(null); setPayTarget(loan); }}
        />
      )}
    </div>
  );
}
