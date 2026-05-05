import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TableProperties, Plus, X, Loader2, Receipt, Wallet,
  Users, Clock, CalendarClock, Phone, User,
  Utensils, Activity, Zap,
} from 'lucide-react';
import { tablesAPI, ordersAPI, accountingAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { money } from '../../hooks/useApi';
import { useTranslation } from '../../context/LanguageContext';
import PayModal from '../../components/PayModal';

// ── Helpers ───────────────────────────────────────────────────────────────────
const elapsed = (iso, t) => {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return t('time.justNow');
  if (m < 60) return t('time.minAgo', { count: m });
  return t('time.hoursAgo', { h: Math.floor(m / 60), m: m % 60 });
};

const fmtOrderNum = (order) => {
  if (!order) return '';
  if (order.dailyNumber) return `#${order.dailyNumber}`;
  const id = String(order.id || '');
  return id.length >= 4 ? `#${id.slice(-4)}` : `#${id}`;
};

const fmtDateTime = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}  ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

// ── Table status config ────────────────────────────────────────────────────────
const TABLE_STATUS = {
  free:     { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', tKey: 'statuses.free'     },
  occupied: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', tKey: 'statuses.occupied' },
  reserved: { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', tKey: 'statuses.reserved' },
  cleaning: { color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', tKey: 'statuses.cleaning' },
  closed:   { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', tKey: 'statuses.cancelled'   },
};

// ── LoanDatePicker (mini calendar for due date) ──────────────────────────────
function LoanDatePicker({ value, onChange, onClose }) {
  const { t } = useTranslation();
  const todayD = new Date();
  const [viewYear, setViewYear] = useState(todayD.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayD.getMonth());
  const todayStr = `${todayD.getFullYear()}-${String(todayD.getMonth()+1).padStart(2,'0')}-${String(todayD.getDate()).padStart(2,'0')}`;

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

  const prevMonth = () => { if (viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); };
  const nextMonth = () => { if (viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); };

  return (
    <div className="absolute z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-72" style={{ bottom: '100%', marginBottom: 8 }}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded text-gray-600 font-bold">‹</button>
        <span className="text-sm font-semibold text-gray-800">{t('datePicker.months')[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded text-gray-600 font-bold">›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {t('datePicker.days').map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-0.5">
          {week.map((ds, di) => {
            if (!ds) return <div key={`e${di}`} />;
            const isPast = ds < todayStr;
            const isSel = ds === value;
            const isToday = ds === todayStr;
            return (
              <button
                key={ds}
                onClick={() => { if (!isPast) { onChange(ds); onClose(); } }}
                disabled={isPast}
                className={`text-center text-xs py-1.5 rounded transition font-medium
                  ${isSel ? 'text-white' : isPast ? 'text-gray-300 cursor-not-allowed' : isToday ? 'font-bold' : 'hover:bg-gray-100 text-gray-700'}
                `}
                style={isSel ? { backgroundColor: '#0891B2' } : isToday && !isSel ? { color: '#0891B2' } : {}}
              >
                {parseInt(ds.split('-')[2], 10)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── TableDetailPanel ─────────────────────────────────────────────────────────
function TableDetailPanel({ table, order, taxSettings, restSettings, onClose, onPaid }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [cancelling, setCancelling] = useState(false);
  // Full-screen centered PayModal (same as CashierOrders) — overlays the whole page
  const [showPayModal, setShowPayModal] = useState(false);

  // Fetch full order with items — the list endpoint doesn't include them
  const [fullOrder, setFullOrder] = useState(null);
  useEffect(() => {
    if (!order?.id) { setFullOrder(null); return; }
    let cancelled = false;
    ordersAPI.getById(order.id)
      .then(d => { if (!cancelled) setFullOrder(d); })
      .catch(() => { if (!cancelled) setFullOrder(null); });
    return () => { cancelled = true; };
  }, [order?.id]);

  // Close the Pay modal if the selected table/order changes out from under us
  useEffect(() => { setShowPayModal(false); }, [table?.id, order?.id]);

  if (!table) return null;

  const cfg = TABLE_STATUS[table.status] || TABLE_STATUS.free;
  const hasOrder = !!order;
  const isReserved = table.status === 'reserved';
  const billRequested = order?.status === 'bill_requested';
  const items = fullOrder?.items || fullOrder?.orderItems || order?.items || [];
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.unitPrice || 0) * (Number(i.quantity) || 1)), 0) || parseFloat(order?.totalAmount || 0);

  const handleCancelReservation = async () => {
    setCancelling(true);
    try {
      await tablesAPI.update(table.id, {
        status: 'free',
        reservationGuest: null,
        reservationPhone: null,
        reservationTime: null,
      });
      onPaid(); // reloads tables
    } catch {
      setCancelling(false);
    }
  };

  return (
    <>
    <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">{table.name || `Table ${table.tableNumber}`}</h2>
            <p className="text-sm" style={{ color: cfg.color }}>{t(cfg.tKey)}{table.capacity ? ` · ${table.capacity} ${t('admin.tables.seats')}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {hasOrder ? (
              <div className="space-y-4">
                {/* Bill requested banner */}
                {billRequested && (
                  <div className="flex items-center gap-2 p-3 rounded-xl border" style={{ backgroundColor: '#FDF4FF', borderColor: '#E9D5FF' }}>
                    <Receipt className="w-4 h-4" style={{ color: '#7C3AED' }} />
                    <p className="text-sm font-semibold" style={{ color: '#7C3AED' }}>{t('statuses.billRequested')}</p>
                  </div>
                )}

                {/* Order meta */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: t('common.order'), value: fmtOrderNum(order) },
                    { label: t('admin.tables.time'), value: elapsed(order.createdAt, t) || '—' },
                    { label: t('admin.newOrder.guests'), value: order.guestCount ? `${order.guestCount} ${t('admin.tables.people')}` : '—' },
                    { label: t('roles.waitress'), value: order.waitressName || t('roles.cashier') },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-0.5">{label}</p>
                      <p className="font-semibold text-gray-900 text-sm">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Items */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('cashier.orders.orderItems')}</p>
                  <div className="space-y-2">
                    {items.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">{t('common.noResults')}</p>
                    ) : items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.name || item.menuItemName || '—'}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                          <span className="text-sm text-gray-500">×{item.quantity}</span>
                          <span className="text-sm font-semibold" style={{ color: '#0891B2' }}>
                            {money((parseFloat(item.unitPrice || 0)) * (Number(item.quantity) || 1))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total */}
                <div className="flex items-center justify-between py-3 border-t-2 border-gray-200">
                  <span className="font-bold text-gray-900">{t('common.total')}</span>
                  <span className="font-bold text-xl" style={{ color: '#0891B2' }}>{money(parseFloat(order.totalAmount || subtotal))}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => navigate('/cashier/new-order', { state: { existingOrderId: order.id, existingOrder: order, table } })}
                    className="flex-1 py-3 rounded-xl border-2 font-semibold text-sm flex items-center justify-center gap-2 transition"
                    style={{ borderColor: '#0891B2', color: '#0891B2' }}
                  >
                    <Plus className="w-4 h-4" />
                    {t('cashier.orders.addItems')}
                  </button>
                  <button
                    onClick={() => setShowPayModal(true)}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition"
                    style={{ backgroundColor: '#0891B2' }}
                  >
                    <Wallet className="w-4 h-4" />
                    {t('cashier.orders.processPayment')}
                  </button>
                </div>
              </div>
            ) : isReserved ? (
              /* ── Reservation Details ── */
              <div className="space-y-4">

                {/* Reservation header banner */}
                <div className="rounded-xl border-2 p-4 flex items-center gap-3"
                  style={{ backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#7C3AED' }}>
                    <CalendarClock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-base font-extrabold" style={{ color: '#7C3AED' }}>{t('statuses.reserved')}</p>
                    <p className="text-xs" style={{ color: '#7C3AED', opacity: 0.75 }}>{t('admin.tables.reserveTable')}</p>
                  </div>
                </div>

                {/* Reservation info cards */}
                {(() => {
                  const guest = table.reservationGuest || null;
                  const phone = table.reservationPhone || null;
                  // reservationTime is stored as a datetime-local string e.g. "2026-03-05T14:07"
                  const timeRaw = table.reservationTime || null;
                  const timeDisplay = (() => {
                    if (!timeRaw) return '—';
                    const dt = new Date(timeRaw);
                    if (isNaN(dt.getTime())) return timeRaw; // show raw if unparseable
                    return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()}  ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
                  })();
                  const seats = table.capacity || table.guestCount;
                  const rows = [
                    { icon: <User className="w-4 h-4" />,          label: t('admin.tables.guestName'),  value: guest || '—', faded: !guest },
                    { icon: <Users className="w-4 h-4" />,          label: t('admin.tables.numberOfSeats'),  value: seats ? `${seats} ${t('admin.tables.seats')}` : '—', faded: !seats },
                    { icon: <CalendarClock className="w-4 h-4" />,  label: t('admin.tables.reservationTime'), value: timeDisplay, faded: !timeRaw },
                    ...(phone ? [{ icon: <Phone className="w-4 h-4" />, label: t('common.phone'), value: phone, faded: false }] : []),
                  ];
                  return (
                    <div className="space-y-2.5">
                      {rows.map(({ icon, label, value, faded }) => (
                        <div key={label} className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: '#EDE9FE', color: '#7C3AED' }}>
                            {icon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{label}</p>
                            <p className={`text-sm font-bold truncate ${faded ? 'text-gray-400 italic' : 'text-gray-900'}`}>{value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Notes */}
                {(table.notes || table.reservationNotes) && (
                  <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-100 rounded-xl">
                    <Receipt className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">{t('common.notes')}</p>
                      <p className="text-sm text-amber-900">{table.notes || table.reservationNotes}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2">
                  <button
                    onClick={() => navigate('/cashier/new-order', { state: { table } })}
                    className="w-full py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition"
                    style={{ backgroundColor: '#0891B2' }}
                  >
                    <Plus className="w-4 h-4" />
                    {t('admin.orders.newOrder')}
                  </button>
                </div>
              </div>
            ) : (
              /* ── No active order (free table) ── */
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <TableProperties className="w-8 h-8 text-gray-400" />
                </div>
                <p className="font-semibold text-gray-700 mb-1">{t('admin.tables.noActiveOrderFound')}</p>
                <p className="text-sm text-gray-500 mb-6">{t('admin.orders.newOrder')}</p>
                <button
                  onClick={() => navigate('/cashier/new-order', { state: { table } })}
                  className="px-6 py-3 rounded-xl text-white font-semibold flex items-center gap-2 transition"
                  style={{ backgroundColor: '#0891B2' }}
                >
                  <Plus className="w-4 h-4" />
                  {t('admin.orders.newOrder')}
                </button>
              </div>
            )}
        </div>
    </div>

    {/* Full-screen centered Pay Modal — same design as CashierOrders */}
    <PayModal
      isOpen={showPayModal && hasOrder}
      order={fullOrder || order}
      taxSettings={taxSettings}
      restSettings={restSettings}
      onClose={() => setShowPayModal(false)}
      onPaid={() => { setShowPayModal(false); onPaid && onPaid(); }}
    />
    </>
  );
}

// ── Main CashierTables ────────────────────────────────────────────────────────
export default function CashierTables() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selTable, setSelTable] = useState(null);
  const [taxSettings, setTaxSettings] = useState(null);
  const [restSettings, setRestSettings] = useState(null);
  const intervalRef = useRef(null);

  const fetchAll = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [tableList, orderList] = await Promise.all([
        tablesAPI.getAll(),
        ordersAPI.getAll({ status: 'pending,sent_to_kitchen,preparing,ready,served,bill_requested' }),
      ]);
      const tList = Array.isArray(tableList) ? tableList : [];
      const oList = Array.isArray(orderList) ? orderList : [];
      setTables(tList);
      setActiveOrders(oList);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const [tax, rest] = await Promise.all([
        accountingAPI.getTaxSettings(),
        accountingAPI.getRestaurantSettings(),
      ]);
      setTaxSettings(tax);
      setRestSettings(rest);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchSettings();
    intervalRef.current = setInterval(() => fetchAll(true), 5000);
    return () => clearInterval(intervalRef.current);
  }, [fetchAll, fetchSettings]);

  // Attach most recent active order to each table
  const enrichedTables = tables.map(t => ({
    ...t,
    order: activeOrders
      .filter(o => o.tableId === t.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null,
  }));

  const occupied = enrichedTables.filter(t => t.status === 'occupied').length;
  const free = enrichedTables.filter(t => t.status === 'free').length;
  const billReqCount = enrichedTables.filter(t => t.order?.status === 'bill_requested').length;

  const selectedEnriched = selTable ? enrichedTables.find(t => t.id === selTable.id) || null : null;

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

  // Group tables by section
  const sections = [...new Set(enrichedTables.map(t => t.section || t('cashier.tables.mainFloor')))];
  const reserved = enrichedTables.filter(t => t.status === 'reserved').length;
  const totalTables = enrichedTables.length;

  return (
    <div className="flex flex-col overflow-hidden h-full" style={{ backgroundColor: '#F8FAFC' }}>
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4"
        style={{ background: 'linear-gradient(135deg, #F0F9FF 0%, #ffffff 60%)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm"
              style={{ backgroundColor: '#0891B2' }}>
              <Utensils className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-gray-900">{t('cashier.tables.title')}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <p className="text-xs text-gray-500">{totalTables} {t('cashier.tables.liveUpdates')}</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/cashier/new-order')}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-white font-bold text-sm shadow-sm transition hover:opacity-90"
            style={{ backgroundColor: '#0891B2' }}
          >
            <Plus className="w-4 h-4" />
            {t('cashier.orders.walkIn')}
          </button>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: table grid ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: t('admin.tables.totalTables'), val: totalTables,   icon: <TableProperties className="w-5 h-5" />, color: '#0891B2', bg: '#F0F9FF', border: '#BAE6FD' },
              { label: t('statuses.occupied'),     val: occupied,       icon: <Activity className="w-5 h-5" />,       color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
              { label: t('statuses.free'),         val: free,           icon: <Zap className="w-5 h-5" />,            color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
              { label: t('statuses.reserved'),     val: reserved,       icon: <CalendarClock className="w-5 h-5" />,  color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
            ].map(s => (
              <div key={s.label}
                className="flex items-center gap-3 px-4 py-4 rounded-2xl border-2 shadow-sm"
                style={{ backgroundColor: s.bg, borderColor: s.border }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: s.color, color: '#fff' }}>
                  {s.icon}
                </div>
                <div>
                  <p className="text-2xl font-extrabold leading-none" style={{ color: s.color }}>{s.val}</p>
                  <p className="text-xs font-medium mt-0.5" style={{ color: s.color, opacity: 0.75 }}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Bill requested alert */}
          {billReqCount > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-purple-200 bg-purple-50">
              <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center flex-shrink-0">
                <Receipt className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-purple-800">
                  {billReqCount} {t('cashier.orders.awaitingPayment')}
                </p>
                <p className="text-xs text-purple-600">{t('cashier.orders.processPayment')}</p>
              </div>
              <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse flex-shrink-0" />
            </div>
          )}

          {/* Tables by section */}
          {enrichedTables.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-24 h-24 rounded-3xl bg-gray-100 flex items-center justify-center mb-5">
                <TableProperties className="w-12 h-12 text-gray-300" />
              </div>
              <p className="text-lg font-bold text-gray-400">{t('admin.tables.noTablesYet')}</p>
              <p className="text-sm text-gray-300 mt-1">{t('admin.tables.createFirstTable')}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {sections.map(section => {
                const sectionTables = enrichedTables.filter(t => (t.section || t('cashier.tables.mainFloor')) === section);
                return (
                  <div key={section}>
                    {/* Section header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-px flex-1 bg-gray-200" />
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-bold text-xs uppercase tracking-widest"
                        style={{ backgroundColor: '#EFF6FF', borderColor: '#BAE6FD', color: '#0891B2' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                        </svg>
                        {section}
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: '#0891B2', color: '#fff', fontSize: '10px' }}>
                          {sectionTables.length}
                        </span>
                      </div>
                      <div className="h-px flex-1 bg-gray-200" />
                    </div>

                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))' }}>
                      {sectionTables.map(table => {
                        const cfg = TABLE_STATUS[table.status] || TABLE_STATUS.free;
                        const hasOrder = !!table.order;
                        const billReq = table.order?.status === 'bill_requested';
                        const isReservedTable = table.status === 'reserved';
                        const isSelected = selTable?.id === table.id;
                        const seats = table.capacity || 4;

                        return (
                          <button
                            key={table.id}
                            onClick={() => setSelTable(isSelected ? null : table)}
                            className="rounded-2xl text-left cursor-pointer transition-all shadow-sm overflow-hidden flex flex-col relative group"
                            style={{
                              border: isSelected
                                ? '2px solid #0891B2'
                                : `2px solid ${cfg.border}`,
                              backgroundColor: isSelected ? '#F0F9FF' : cfg.bg,
                              minHeight: 175,
                              boxShadow: isSelected
                                ? '0 0 0 3px rgba(8,145,178,0.15), 0 4px 16px rgba(8,145,178,0.15)'
                                : '0 1px 4px rgba(0,0,0,0.06)',
                              transform: isSelected ? 'scale(1.02)' : undefined,
                            }}
                          >
                            {/* Bill requested pulse ring */}
                            {billReq && (
                              <div className="absolute inset-0 rounded-2xl pointer-events-none"
                                style={{ boxShadow: '0 0 0 3px rgba(124,58,237,0.25)', animation: 'pulse 2s infinite' }} />
                            )}

                            {/* Status dot top-right */}
                            <div className="absolute top-3 right-3">
                              <div className={`w-2.5 h-2.5 rounded-full ${billReq ? 'animate-pulse' : ''}`}
                                style={{ backgroundColor: billReq ? '#7C3AED' : cfg.color }} />
                            </div>

                            {/* Top: section label + name */}
                            <div className="px-4 pt-4 pb-1 flex-shrink-0">
                              <p className="text-xs uppercase tracking-wider font-semibold mb-0.5"
                                style={{ color: cfg.color, opacity: 0.65 }}>
                                {table.section || t('cashier.tables.indoor')}
                              </p>
                              <p className="text-xl font-extrabold leading-tight" style={{ color: cfg.color }}>
                                {table.name || `Table ${table.tableNumber}`}
                              </p>
                            </div>

                            {/* Middle: dining table SVG icon */}
                            <div className="flex items-center justify-center py-3 flex-1">
                              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                                style={{
                                  backgroundColor: `${cfg.color}15`,
                                  border: `2px solid ${cfg.color}30`,
                                }}>
                                <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  {/* Tabletop */}
                                  <rect x="2" y="8" width="26" height="5" rx="2" fill={cfg.color} opacity="0.9"/>
                                  {/* Left leg */}
                                  <rect x="5" y="13" width="3" height="10" rx="1.5" fill={cfg.color} opacity="0.7"/>
                                  {/* Right leg */}
                                  <rect x="22" y="13" width="3" height="10" rx="1.5" fill={cfg.color} opacity="0.7"/>
                                  {/* Left foot */}
                                  <rect x="3" y="22" width="7" height="2.5" rx="1.25" fill={cfg.color} opacity="0.5"/>
                                  {/* Right foot */}
                                  <rect x="20" y="22" width="7" height="2.5" rx="1.25" fill={cfg.color} opacity="0.5"/>
                                </svg>
                              </div>
                            </div>

                            {/* Bottom: info row */}
                            <div className="px-4 pb-4 flex-shrink-0">
                              {hasOrder ? (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium flex items-center gap-1"
                                      style={{ color: cfg.color, opacity: 0.75 }}>
                                      <Clock className="w-3 h-3" />
                                      {elapsed(table.order.createdAt, t)}
                                    </span>
                                    <span className="text-xs font-extrabold" style={{ color: cfg.color }}>
                                      {money(parseFloat(table.order.totalAmount || 0))}
                                    </span>
                                  </div>
                                  <div className="px-2 py-1 rounded-lg text-center"
                                    style={{ backgroundColor: cfg.color }}>
                                    <p className="text-xs font-bold text-white">
                                      {billReq ? t('statuses.billRequested') : t(cfg.tKey)}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {isReservedTable && table.reservationGuest ? (
                                    <div className="flex items-center gap-1 min-w-0"
                                      style={{ color: cfg.color, opacity: 0.85 }}>
                                      <User className="w-3 h-3 flex-shrink-0" />
                                      <span className="text-xs font-semibold truncate">{table.reservationGuest}</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1"
                                      style={{ color: cfg.color, opacity: 0.7 }}>
                                      <Users className="w-3 h-3" />
                                      <span className="text-xs font-medium">{seats} {t('admin.tables.seats')}</span>
                                    </div>
                                  )}
                                  <div className="px-2 py-1 rounded-lg border text-center"
                                    style={{ borderColor: cfg.border, backgroundColor: 'transparent' }}>
                                    <p className="text-xs font-bold" style={{ color: cfg.color }}>{t(cfg.tKey)}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: detail drawer ── */}
        {selectedEnriched && (
          <div className="w-[400px] flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
            <TableDetailPanel
              table={selectedEnriched}
              order={selectedEnriched.order}
              taxSettings={taxSettings}
              restSettings={restSettings}
              onClose={() => setSelTable(null)}
              onPaid={() => { setSelTable(null); fetchAll(true); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
