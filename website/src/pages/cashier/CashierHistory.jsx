import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  History, Calendar, TrendingUp, AlertCircle, X, Loader2,
  Receipt, CreditCard, Wallet, QrCode, Filter, ChevronDown,
  RefreshCcw, User, TableProperties, Check, Clock, Hash,
  Banknote, Percent, StickyNote,
} from 'lucide-react';
import { ordersAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { money } from '../../hooks/useApi';
import { useTranslation } from '../../context/LanguageContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
// MONTH_NAMES and DAY_HDRS loaded from i18n

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const fmtDateStr = (d) => {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const getMonday = (d) => {
  const date = new Date(d);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date;
};

const dateTimeStr = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}  ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const fmtOrderNum = (order) => {
  if (order?.dailyNumber) return `#${order.dailyNumber}`;
  const id = String(order?.id || '');
  return id.length >= 4 ? `#${id.slice(-4)}` : `#${id}`;
};

const METHOD_ICONS = {
  cash: <Wallet className="w-4 h-4" />,
  card: <CreditCard className="w-4 h-4" />,
  'qr code': <QrCode className="w-4 h-4" />,
  qr: <QrCode className="w-4 h-4" />,
};

// REFUND_REASONS loaded from i18n: t('cashier.history.refundReasons')

const TODAY = todayStr();
const getPresets = (t) => [
  { label: t('periods.today'),      from: TODAY, to: TODAY },
  { label: t('periods.thisWeek'),  from: fmtDateStr(getMonday(new Date())), to: TODAY },
  { label: t('periods.thisMonth'), from: fmtDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: TODAY },
  { label: t('periods.lastMonth'), from: fmtDateStr(new Date(new Date().getFullYear(), new Date().getMonth()-1, 1)), to: fmtDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 0)) },
];

// ── Calendar Date Range Picker ────────────────────────────────────────────────
function CalendarPicker({ visible, onClose, period, onChange }) {
  const { t } = useTranslation();
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [tempFrom, setTempFrom] = useState(period.from);
  const [tempTo, setTempTo] = useState(period.to);
  const [step, setStep] = useState('from');

  useEffect(() => {
    if (visible) {
      setTempFrom(period.from);
      setTempTo(period.to);
      setStep('from');
      const d = new Date(period.from);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible, period.from, period.to]);

  const prevMonth = () => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); };
  const nextMonth = () => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); };

  const handleDay = (ds) => {
    if (step === 'from') { setTempFrom(ds); setTempTo(ds); setStep('to'); }
    else {
      if (ds < tempFrom) { setTempTo(tempFrom); setTempFrom(ds); }
      else setTempTo(ds);
      setStep('from');
    }
  };

  const setPreset = (from, to) => {
    setTempFrom(from); setTempTo(to); setStep('from');
    const d = new Date(from);
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  };

  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMon = new Date(viewYear, viewMonth + 1, 0).getDate();
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
      <div className="absolute right-6 top-[72px] bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5" style={{ color: '#0891B2' }} />
            <span className="font-bold text-gray-900">{t('datePicker.pickADate')}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* From / To pills */}
          <div className="flex gap-3 items-center">
            <button
              onClick={() => setStep('from')}
              className="flex-1 rounded-xl border-2 p-2.5 text-center transition"
              style={step==='from' ? { borderColor:'#0891B2',backgroundColor:'#F0F9FF' } : { borderColor:'#E5E7EB' }}
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('common.from')}</p>
              <p className="font-bold text-sm" style={{ color: step==='from' ? '#0891B2' : '#111827' }}>{tempFrom}</p>
            </button>
            <ChevronDown className="w-4 h-4 text-gray-400 rotate-[-90deg] flex-shrink-0" />
            <button
              onClick={() => setStep('to')}
              className="flex-1 rounded-xl border-2 p-2.5 text-center transition"
              style={step==='to' ? { borderColor:'#0891B2',backgroundColor:'#F0F9FF' } : { borderColor:'#E5E7EB' }}
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('common.to')}</p>
              <p className="font-bold text-sm" style={{ color: step==='to' ? '#0891B2' : '#111827' }}>{tempTo}</p>
            </button>
          </div>
          <p className="text-xs text-center text-gray-400">{step==='from' ? 'Tap a date to set start' : 'Tap a date to set end'}</p>

          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 font-bold text-lg">‹</button>
            <span className="text-sm font-semibold text-gray-800">{t('datePicker.months')[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 font-bold text-lg">›</button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7">
            {t('datePicker.days').map(d => (
              <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((ds, di) => {
                if (!ds) return <div key={`e${di}`} />;
                const isFrom = ds === tempFrom;
                const isTo = ds === tempTo && tempFrom !== tempTo;
                const inRange = ds > tempFrom && ds < tempTo;
                const isToday = ds === TODAY;
                return (
                  <button
                    key={ds}
                    onClick={() => handleDay(ds)}
                    className="text-center text-xs py-2 rounded-lg font-medium transition"
                    style={{
                      backgroundColor: (isFrom || isTo) ? '#0891B2' : inRange ? '#E0F2FE' : 'transparent',
                      color: (isFrom || isTo) ? '#fff' : inRange ? '#0891B2' : isToday ? '#0891B2' : '#374151',
                      fontWeight: (isFrom || isTo || isToday) ? '700' : '400',
                    }}
                  >
                    {parseInt(ds.split('-')[2], 10)}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {getPresets(t).map(p => (
              <button
                key={p.label}
                onClick={() => setPreset(p.from, p.to)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition"
                style={{
                  borderColor: tempFrom===p.from && tempTo===p.to ? '#0891B2' : '#E5E7EB',
                  color: tempFrom===p.from && tempTo===p.to ? '#0891B2' : '#374151',
                  backgroundColor: tempFrom===p.from && tempTo===p.to ? '#F0F9FF' : '#fff',
                }}
              >{p.label}</button>
            ))}
          </div>

          {/* Apply */}
          <button
            onClick={() => { onChange({ from: tempFrom, to: tempTo }); onClose(); }}
            className="w-full py-3 rounded-xl text-white font-bold text-sm transition"
            style={{ backgroundColor: '#0891B2' }}
          >
            {t('common.apply')}: {tempFrom === tempTo ? tempFrom : `${tempFrom} → ${tempTo}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Filter Panel ──────────────────────────────────────────────────────────────
function FilterPanel({ visible, onClose, filters, onChange, waitressOptions, tableOptions }) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(filters);

  useEffect(() => {
    if (visible) setLocal(filters);
  }, [visible, filters]);

  const toggle = (key, val) => setLocal(prev => ({ ...prev, [key]: prev[key] === val ? '' : val }));
  const clearAll = () => setLocal({ waitress: '', table: '', method: '', status: '' });
  const activeCount = Object.values(local).filter(Boolean).length;

  const METHODS = [
    { id: 'cash',    label: 'Cash',    icon: <Wallet className="w-3.5 h-3.5" /> },
    { id: 'card',    label: 'Card',    icon: <CreditCard className="w-3.5 h-3.5" /> },
    { id: 'qr',      label: 'QR',      icon: <QrCode className="w-3.5 h-3.5" /> },
    { id: 'loan',    label: 'Loan',    icon: <Receipt className="w-3.5 h-3.5" /> },
  ];

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute right-6 top-[72px] bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <span className="font-bold text-gray-900">{t('common.search')}</span>
          <div className="flex items-center gap-3">
            {activeCount > 0 && (
              <button onClick={clearAll} className="text-sm font-medium" style={{ color: '#0891B2' }}>
                {t('common.clear')}
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Payment Method */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('cashier.orders.paymentMethod')}</p>
            <div className="flex flex-wrap gap-2">
              {METHODS.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggle('method', m.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition"
                  style={local.method === m.id
                    ? { backgroundColor: '#0891B2', color: '#fff', borderColor: '#0891B2' }
                    : { backgroundColor: '#fff', color: '#374151', borderColor: '#E5E7EB' }
                  }
                >
                  {m.icon}{m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('common.status')}</p>
            <div className="flex flex-wrap gap-2">
              {['paid', 'refunded'].map(s => (
                <button
                  key={s}
                  onClick={() => toggle('status', s)}
                  className="px-3 py-2 rounded-xl text-sm font-semibold border transition"
                  style={local.status === s
                    ? { backgroundColor: '#0891B2', color: '#fff', borderColor: '#0891B2' }
                    : { backgroundColor: '#fff', color: '#374151', borderColor: '#E5E7EB' }
                  }
                >{t(`cashier.history.${s}`)}</button>
              ))}
            </div>
          </div>

          {/* Waitress */}
          {waitressOptions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('roles.waitress')}</p>
              <div className="flex flex-wrap gap-2">
                {waitressOptions.map(name => (
                  <button
                    key={name}
                    onClick={() => toggle('waitress', name)}
                    className="px-3 py-2 rounded-xl text-sm font-semibold border transition"
                    style={local.waitress === name
                      ? { backgroundColor: '#0891B2', color: '#fff', borderColor: '#0891B2' }
                      : { backgroundColor: '#fff', color: '#374151', borderColor: '#E5E7EB' }
                    }
                  >{name}</button>
                ))}
              </div>
            </div>
          )}

          {/* Table */}
          {tableOptions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('nav.tables')}</p>
              <div className="flex flex-wrap gap-2">
                {tableOptions.map(name => (
                  <button
                    key={name}
                    onClick={() => toggle('table', name)}
                    className="px-3 py-2 rounded-xl text-sm font-semibold border transition"
                    style={local.table === name
                      ? { backgroundColor: '#0891B2', color: '#fff', borderColor: '#0891B2' }
                      : { backgroundColor: '#fff', color: '#374151', borderColor: '#E5E7EB' }
                    }
                  >{name}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={() => { onChange(local); onClose(); }}
            className="w-full py-3 rounded-xl text-white font-bold text-sm transition"
            style={{ backgroundColor: '#0891B2' }}
          >
            {activeCount > 0 ? `${t('common.apply')} (${activeCount})` : t('common.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Order Detail Modal ────────────────────────────────────────────────────────
function OrderDetailModal({ order, onClose, onRefund }) {
  const { t } = useTranslation();
  const [fullOrder, setFullOrder] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  useEffect(() => {
    if (!order) return;
    setLoadingDetail(true);
    setFullOrder(null);
    ordersAPI.getById(order.id)
      .then(d => setFullOrder(d))
      .catch(() => setFullOrder(order))
      .finally(() => setLoadingDetail(false));
  }, [order?.id]);

  if (!order) return null;

  const data = fullOrder || order;
  const items = data.items || data.orderItems || [];
  const itemCount = items.reduce((s, x) => s + (x.quantity || 1), 0);
  const subtotal  = items.reduce((s, x) => s + (parseFloat(x.unitPrice || x.price || 0) * (x.quantity || 1)), 0);
  const tax  = parseFloat(data.taxAmount) || 0;
  const disc = parseFloat(data.discountAmount ?? data.discount) || 0;
  const total = parseFloat(data.totalAmount) || 0;

  const isRefunded = data.status === 'cancelled' || data.status === 'refunded';
  const methodKey  = (data.paymentMethod || 'cash').toLowerCase();
  const isSplit    = methodKey === 'split';

  const methodMeta = {
    cash:     { icon: <Banknote className="w-5 h-5" />,    label: t('paymentMethods.cash'),     color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
    card:     { icon: <CreditCard className="w-5 h-5" />,  label: t('paymentMethods.card'),     color: '#0891B2', bg: '#F0F9FF', border: '#BAE6FD' },
    qr_code:  { icon: <QrCode className="w-5 h-5" />,      label: t('paymentMethods.qrCode'),   color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
    'qr code':{ icon: <QrCode className="w-5 h-5" />,      label: t('paymentMethods.qrCode'),   color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
    loan:     { icon: <Wallet className="w-5 h-5" />,       label: t('paymentMethods.loan'),     color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
    split:    { icon: <Receipt className="w-5 h-5" />,      label: t('cashier.orders.split'),    color: '#0891B2', bg: '#F0F9FF', border: '#BAE6FD' },
  };
  const mMeta = methodMeta[methodKey] || { icon: <Wallet className="w-5 h-5" />, label: data.paymentMethod || t('paymentMethods.cash'), color: '#0891B2', bg: '#F0F9FF', border: '#BAE6FD' };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden"
        style={{ maxWidth: '900px', height: '82vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-7 py-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #F0F9FF 0%, #ffffff 60%)' }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#0891B2' }}>
              <Receipt className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <p className="text-2xl font-extrabold text-gray-900">{fmtOrderNum(data)}</p>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${isRefunded ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                  {isRefunded ? t('statuses.cancelled') : t('statuses.paid')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-sm text-gray-500">{dateTimeStr(data.paidAt || data.updatedAt)}</p>
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* ── Two-Column Body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── LEFT COLUMN: Order details + items ── */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-100">

            {/* Meta strip */}
            <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 flex-shrink-0">
              {[
                { icon: <TableProperties className="w-4 h-4" />, label: t('nav.tables'),   value: data.tableName || t('cashier.orders.walkIn') },
                { icon: <User className="w-4 h-4" />,            label: t('roles.waitress'),  value: data.waitressName || '—' },
                { icon: <Clock className="w-4 h-4" />,           label: t('common.date'),    value: dateTimeStr(data.paidAt || data.updatedAt).split('  ')[0] },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 px-5 py-4">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#F0F9FF', color: '#0891B2' }}>
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{label}</p>
                    <p className="text-sm font-bold text-gray-900 truncate">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{t('cashier.orders.orderItems')}</h3>
                {!loadingDetail && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: '#E0F2FE', color: '#0891B2' }}>
                    {itemCount} item{itemCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {loadingDetail ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#0891B2' }} />
                  <p className="text-sm text-gray-400">{t('common.loading')}</p>
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <Hash className="w-10 h-10 text-gray-200" />
                  <p className="text-sm text-gray-400">{t('common.noResults')}</p>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="grid px-4 py-2.5 bg-gray-50 border-b border-gray-100" style={{ gridTemplateColumns: '1fr 56px 110px' }}>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('common.name')}</span>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">#</span>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">{t('common.amount')}</span>
                  </div>
                  {items.map((item, i) => {
                    const price = parseFloat(item.unitPrice || item.price || 0);
                    const qty   = item.quantity || 1;
                    const name  = item.name || item.menuItemName || '—';
                    return (
                      <div key={i} className={`grid items-center px-4 py-3 hover:bg-gray-50 transition ${i < items.length - 1 ? 'border-b border-gray-50' : ''}`} style={{ gridTemplateColumns: '1fr 56px 110px' }}>
                        <span className="text-sm font-medium text-gray-900 truncate">{name}</span>
                        <span className="text-sm font-semibold text-gray-400 text-center">{qty}</span>
                        <span className="text-sm font-bold text-right" style={{ color: '#0891B2' }}>{money(price * qty)}</span>
                      </div>
                    );
                  })}
                  <div className="grid items-center px-4 py-3 border-t border-gray-100 bg-gray-50" style={{ gridTemplateColumns: '1fr 56px 110px' }}>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t('common.subtotal')}</span>
                    <span />
                    <span className="text-sm font-bold text-right text-gray-900">{money(subtotal)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT COLUMN: Payment + Summary + Actions ── */}
          <div className="flex flex-col overflow-hidden bg-gray-50" style={{ width: '300px', borderLeft: '1px solid #F3F4F6' }}>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Payment Method */}
              <div className="rounded-xl border p-4 flex items-center gap-3"
                style={{ backgroundColor: mMeta.bg, borderColor: mMeta.border || '#E5E7EB' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
                  style={{ backgroundColor: mMeta.color }}>
                  {mMeta.icon}
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('cashier.orders.paymentMethod')}</p>
                  <p className="text-base font-bold" style={{ color: mMeta.color }}>{mMeta.label}</p>
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-gray-400" />
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t('common.summary')}</p>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('common.subtotal')}</span>
                    <span className="font-semibold text-gray-800">{money(subtotal || total)}</span>
                  </div>
                  {tax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Tax</span>
                      <span className="font-semibold text-gray-800">{money(tax)}</span>
                    </div>
                  )}
                  {disc > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-1 text-green-600">
                        <Percent className="w-3.5 h-3.5" />{t('common.discount')}
                      </span>
                      <span className="font-semibold text-green-600">-{money(disc)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                    <span className="text-sm font-extrabold text-gray-900">{t('cashier.orders.totalToPay')}</span>
                    <span className="text-lg font-extrabold" style={{ color: '#0891B2' }}>{money(total)}</span>
                  </div>
                </div>
              </div>

              {/* Split breakdown */}
              {isSplit && Array.isArray(data.splitPayments) && data.splitPayments.length > 0 && (
                <div className="rounded-xl border border-cyan-200 bg-white overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-cyan-100 bg-cyan-50">
                    <p className="text-xs font-bold text-cyan-700 uppercase tracking-wide">Split Breakdown</p>
                  </div>
                  <div className="p-4 space-y-2.5">
                    {data.splitPayments.map((sp, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">Part {i + 1} <span className="text-xs text-gray-400">({sp.method || 'cash'})</span></span>
                        <span className="font-semibold" style={{ color: '#0891B2' }}>{money(sp.amount || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer */}
              {data.customerName && (
                <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200">
                  <User className="w-4 h-4 flex-shrink-0" style={{ color: '#0891B2' }} />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">{t('admin.newOrder.customer')}</p>
                    <p className="text-sm font-semibold text-gray-900">{data.customerName}</p>
                  </div>
                </div>
              )}

              {/* Notes */}
              {data.notes && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
                  <StickyNote className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">{t('common.notes')}</p>
                    <p className="text-sm text-amber-900">{data.notes}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="p-5 space-y-2.5 flex-shrink-0" style={{ borderTop: '1px solid #E5E7EB' }}>
              {!isRefunded && (
                <button
                  onClick={() => { onClose(); onRefund(data); }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-bold transition-all hover:bg-red-50"
                  style={{ borderColor: '#FCA5A5', color: '#DC2626' }}
                >
                  <RefreshCcw className="w-4 h-4" />
                  {t('cashier.history.refundProcessed')}
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-white border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-100 transition"
              >
                {t('common.close')}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Refund Modal ──────────────────────────────────────────────────────────────
function RefundModal({ order, onClose, onConfirm, loading }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState(t('cashier.history.refundReasons')[0]);

  if (!order) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <RefreshCcw className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="font-bold text-gray-900">{t('cashier.history.refundProcessed')}</p>
            <p className="text-sm text-gray-500">{fmtOrderNum(order)} · {money(parseFloat(order.totalAmount || 0))}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('admin.orders.selectReason')}</p>
          <div className="space-y-2">
            {t('cashier.history.refundReasons').map(r => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition"
                style={reason === r
                  ? { borderColor: '#DC2626', backgroundColor: '#FEF2F2' }
                  : { borderColor: '#E5E7EB', backgroundColor: '#fff' }
                }
              >
                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={reason === r ? { borderColor: '#DC2626', backgroundColor: '#DC2626' } : { borderColor: '#D1D5DB' }}>
                  {reason === r && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <span className="text-sm font-medium text-gray-700">{r}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm transition hover:bg-gray-50"
          >{t('common.cancel')}</button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
            style={{ backgroundColor: '#DC2626' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {loading ? t('common.processing') : t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CashierHistory ────────────────────────────────────────────────────────────
export default function CashierHistory() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calOpen, setCalOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [period, setPeriod] = useState({ from: todayStr(), to: todayStr() });
  const [filters, setFilters] = useState({ waitress: '', table: '', method: '', status: '' });
  const [detailOrder, setDetailOrder] = useState(null);
  const [refundTarget, setRefundTarget] = useState(null);
  const [refunding, setRefunding] = useState(false);
  const [toast, setToast] = useState(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ordersAPI.getAll({ status: 'paid,cancelled', from: period.from, to: period.to });
      setAllOrders(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Unique filter options
  const waitressOptions = useMemo(() => {
    const names = [...new Set(allOrders.map(o => o.waitressName).filter(Boolean))];
    return names.sort();
  }, [allOrders]);

  const tableOptions = useMemo(() => {
    const names = [...new Set(allOrders.map(o => o.tableName).filter(Boolean))];
    return names.sort();
  }, [allOrders]);

  // Apply filters
  const filtered = useMemo(() => {
    return allOrders.filter(o => {
      if (filters.waitress && o.waitressName !== filters.waitress) return false;
      if (filters.table && o.tableName !== filters.table) return false;
      if (filters.method) {
        const m = (o.paymentMethod || '').toLowerCase();
        if (filters.method === 'cash' && m !== 'cash') return false;
        if (filters.method === 'card' && m !== 'card') return false;
        if (filters.method === 'qr' && !['qr', 'qr code'].includes(m)) return false;
        if (filters.method === 'loan' && m !== 'loan') return false;
      }
      if (filters.status) {
        const isRef = o.status === 'cancelled' || o.status === 'refunded';
        if (filters.status === 'paid' && isRef) return false;
        if (filters.status === 'refunded' && !isRef) return false;
      }
      return true;
    });
  }, [allOrders, filters]);

  const notRefunded = filtered.filter(o => o.status !== 'cancelled' && o.status !== 'refunded');
  const totalRev = notRefunded.reduce((s, o) => s + (parseFloat(o.totalAmount) || 0), 0);
  const byCash = notRefunded.filter(o => (o.paymentMethod||'').toLowerCase() === 'cash').reduce((s,o)=>s+(parseFloat(o.totalAmount)||0),0);
  const byCard = notRefunded.filter(o => (o.paymentMethod||'').toLowerCase() === 'card').reduce((s,o)=>s+(parseFloat(o.totalAmount)||0),0);
  const byQr = notRefunded.filter(o => ['qr code','qr'].includes((o.paymentMethod||'').toLowerCase())).reduce((s,o)=>s+(parseFloat(o.totalAmount)||0),0);
  const byLoan = notRefunded.filter(o => (o.paymentMethod||'').toLowerCase() === 'loan').reduce((s,o)=>s+(parseFloat(o.totalAmount)||0),0);
  const totalDisc = notRefunded.reduce((s, o) => s + (parseFloat(o.discountAmount ?? o.discount) || 0), 0);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const periodLabel = period.from === period.to ? period.from : `${period.from} → ${period.to}`;

  const confirmRefund = async (reason) => {
    setRefunding(true);
    try {
      await ordersAPI.updateStatus(refundTarget.id, 'cancelled');
      setToast({ type: 'success', msg: 'Refund processed. Admin has been notified.' });
      setRefundTarget(null);
      loadOrders();
    } catch (e) {
      setToast({ type: 'error', msg: e?.error || t('alerts.refundFailed', 'Refund failed') });
    } finally {
      setRefunding(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const FILTER_LABELS = {
    waitress: v => v,
    table: v => `Table: ${v}`,
    method: v => v === 'qr' ? 'QR Code' : v.charAt(0).toUpperCase() + v.slice(1),
    status: v => v.charAt(0).toUpperCase() + v.slice(1),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-100 mb-4">
            <Loader2 className="w-8 h-8 text-cyan-600 animate-spin" />
          </div>
          <p className="text-gray-600 font-medium">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2"
          style={{ backgroundColor: toast.type === 'success' ? '#F0FDF4' : '#FEF2F2', color: toast.type === 'success' ? '#166534' : '#DC2626', border: `1px solid ${toast.type === 'success' ? '#BBF7D0' : '#FECACA'}` }}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl" style={{ backgroundColor: '#0891B2' }}>
              <History className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">{t('cashier.history.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Period selector */}
            <button
              onClick={() => setCalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <Calendar className="w-4 h-4" style={{ color: '#0891B2' }} />
              <span>{periodLabel}</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {/* Filter button */}
            <button
              onClick={() => setFilterOpen(true)}
              className="relative flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-medium transition"
              style={activeFilterCount > 0
                ? { borderColor: '#0891B2', color: '#0891B2', backgroundColor: '#F0F9FF' }
                : { borderColor: '#E5E7EB', color: '#374151', backgroundColor: '#fff' }
              }
            >
              <Filter className="w-4 h-4" />
              {activeFilterCount > 0 ? `${t('common.search')} (${activeFilterCount})` : t('common.search')}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            {Object.entries(filters).filter(([,v]) => v).map(([key, val]) => (
              <button
                key={key}
                onClick={() => setFilters(prev => ({ ...prev, [key]: '' }))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition"
                style={{ borderColor: '#0891B2', color: '#0891B2', backgroundColor: '#F0F9FF' }}
              >
                {FILTER_LABELS[key]?.(val) ?? val}
                <X className="w-3 h-3" />
              </button>
            ))}
            <button
              onClick={() => setFilters({ waitress: '', table: '', method: '', status: '' })}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              {t('common.clear')}
            </button>
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('nav.history'), value: notRefunded.length, color: '#0891B2', bg: '#F0F9FF', icon: <Receipt className="w-5 h-5" /> },
            { label: t('owner.sales.totalRevenue'), value: money(totalRev), color: '#16A34A', bg: '#F0FDF4', icon: <TrendingUp className="w-5 h-5" /> },
            { label: t('common.discount'), value: money(totalDisc), color: '#D97706', bg: '#FFFBEB', icon: <TrendingUp className="w-5 h-5" /> },
            { label: t('cashier.history.refundProcessed'), value: filtered.filter(o=>o.status==='cancelled'||o.status==='refunded').length, color: '#DC2626', bg: '#FEF2F2', icon: <RefreshCcw className="w-5 h-5" /> },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{s.label}</p>
                <div className="p-2 rounded-xl" style={{ backgroundColor: s.bg, color: s.color }}>
                  {s.icon}
                </div>
              </div>
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Revenue by method */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">{t('cashier.orders.paymentMethod')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: t('paymentMethods.cash'),    value: byCash,  icon: <Wallet className="w-4 h-4" />,     color: '#16A34A', bg: '#F0FDF4'  },
              { label: t('paymentMethods.card'),    value: byCard,  icon: <CreditCard className="w-4 h-4" />,  color: '#0891B2', bg: '#F0F9FF'  },
              { label: t('paymentMethods.qrCode'), value: byQr,    icon: <QrCode className="w-4 h-4" />,      color: '#7C3AED', bg: '#F5F3FF'  },
              { label: t('paymentMethods.loan'),    value: byLoan,  icon: <Receipt className="w-4 h-4" />,     color: '#D97706', bg: '#FFFBEB'  },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: m.bg }}>
                <div className="p-2 rounded-lg" style={{ backgroundColor: m.color + '22', color: m.color }}>
                  {m.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium" style={{ color: m.color }}>{m.label}</p>
                  <p className="text-sm font-bold truncate" style={{ color: m.color }}>{money(m.value)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Orders table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.date')}</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.order')}</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('nav.tables')}</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('cashier.orders.paymentMethod')}</th>
                  <th className="px-5 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.status')}</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.total')}</th>
                  <th className="px-5 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('common.details')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-5 py-16 text-center">
                      <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">{t('admin.orders.noOrdersFound')}</p>
                      <p className="text-gray-400 text-sm mt-1">{t('common.noResults')}</p>
                    </td>
                  </tr>
                ) : filtered.map(order => {
                  const isRef = order.status === 'cancelled' || order.status === 'refunded';
                  const methodKey = (order.paymentMethod || '').toLowerCase();
                  const icon = METHOD_ICONS[methodKey] || <Wallet className="w-3.5 h-3.5" />;
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-4 text-sm text-gray-600">{dateTimeStr(order.paidAt || order.updatedAt)}</td>
                      <td className="px-5 py-4 font-bold text-gray-900">{fmtOrderNum(order)}</td>
                      <td className="px-5 py-4 text-sm text-gray-700">{order.tableName || t('cashier.orders.walkIn')}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-gray-700">
                          <span className="text-gray-400">{icon}</span>
                          <span className="capitalize">{order.paymentMethod || '—'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${isRef ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                          {isRef ? t('statuses.cancelled') : t('statuses.paid')}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-bold" style={{ color: '#0891B2' }}>
                        {money(parseFloat(order.totalAmount || 0))}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <button
                          onClick={() => setDetailOrder(order)}
                          className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition"
                        >
                          {t('common.details')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Calendar Picker */}
      <CalendarPicker
        visible={calOpen}
        onClose={() => setCalOpen(false)}
        period={period}
        onChange={setPeriod}
      />

      {/* Filter Panel */}
      <FilterPanel
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        waitressOptions={waitressOptions}
        tableOptions={tableOptions}
      />

      {/* Order Detail Modal */}
      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onRefund={(order) => { setDetailOrder(null); setRefundTarget(order); }}
        />
      )}

      {/* Refund Modal */}
      {refundTarget && (
        <RefundModal
          order={refundTarget}
          onClose={() => setRefundTarget(null)}
          onConfirm={confirmRefund}
          loading={refunding}
        />
      )}
    </div>
  );
}
