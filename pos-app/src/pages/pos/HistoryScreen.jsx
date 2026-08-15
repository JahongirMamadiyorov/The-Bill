import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, Receipt, X, RotateCcw, CalendarDays, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, Printer,
} from 'lucide-react';
import { T, card, pill, statusPill, uppercaseLabel, fmtMoney } from './tokens.js';
import { loadCached, saveCached, timeAgo } from '../../lib/staleCache.js';
import { t, tt } from '../../lib/i18n.js';
import { buildReceiptData } from '../../lib/receipt.js';

// ─────────────────────────────────────────────────────────────────────────────
// History screen — closed orders + refunds. Design handoff screens 7–10.
//
// Data source: backend GET /api/orders (apiGet, NOT local PowerSync) — history
// needs full-restaurant paid/cancelled order data with joins (table/waiter
// names, item counts, loan info) that only the backend query produces, and
// this is read-only/low-frequency, unlike Menu/Orders/Tables which need
// offline-capable live polling. Same reasoning as Receivables/Profile.
//
// Refund: POST /api/orders/:id/refund (new backend endpoint, Step 6). Only
// enabled for status='paid' && !refunded_at. Whole-order refund only (no
// partial/line-item refunds yet).
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_KEY = 'pos.history.cache.v1';
const DATE_CHIPS = ['Today', 'Yesterday', 'This Week', 'Custom'];
const REFUND_REASONS = ['Customer Complaint', 'Wrong Order', 'Duplicate Payment', 'Other'];

function isoDate(d) { return d.toISOString().slice(0, 10); }
function rangeFor(chip) {
  const now = new Date();
  if (chip === 'Today') return { from: isoDate(now), to: isoDate(now) };
  if (chip === 'Yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { from: isoDate(y), to: isoDate(y) };
  }
  if (chip === 'This Week') {
    const start = new Date(now); start.setDate(start.getDate() - start.getDay());
    return { from: isoDate(start), to: isoDate(now) };
  }
  return { from: isoDate(now), to: isoDate(now) };
}

export default function HistoryScreen({ user, settings, search, lang }) {
  const symbol = settings.currencySymbol;
  const money  = (n) => fmtMoney(n, symbol);

  const cached = useMemo(() => loadCached(CACHE_KEY), []); // read once on mount
  const [orders,  setOrders]  = useState(cached?.data || []);
  const [loading, setLoading] = useState(!cached); // skip spinner if we already have something to show
  const [lastUpdated, setLastUpdated] = useState(cached?.savedAt || null);
  const [stale,   setStale]   = useState(false);
  const [chip,    setChip]    = useState('Today');
  const [range,   setRange]   = useState(rangeFor('Today'));
  const [showCal, setShowCal] = useState(false);
  const [customLabel, setCustomLabel] = useState('');

  const [detail,      setDetail]      = useState(null); // full order (with items) or null
  const [detailLoading, setDetailLoading] = useState(false);
  const [showRefund,  setShowRefund]  = useState(false);
  const [refundReason, setRefundReason] = useState(REFUND_REASONS[0]);
  const [busy,         setBusy]         = useState(false);
  const [toast,        setToast]        = useState(null);
  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        status: 'paid,cancelled', from: range.from, to: range.to, limit: '200',
      });
      const res = await window.electronAPI.apiGet(`/api/orders?${qs.toString()}`);
      if (res?.ok) {
        const data = Array.isArray(res.data) ? res.data : [];
        setOrders(data);
        setStale(false);
        setLastUpdated(Date.now());
        saveCached(CACHE_KEY, data);
      } else {
        showToast(res?.error || t('Failed to load history — is the backend reachable?', lang), false);
        setStale(true);
      }
    } catch {
      showToast(t('Failed to load history', lang), false);
      setStale(true);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range]);

  const filtered = useMemo(() => {
    if (!search?.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(o =>
      String(o.daily_number || '').includes(q) ||
      (o.table_name || '').toLowerCase().includes(q) ||
      (o.waitress_name || '').toLowerCase().includes(q));
  }, [orders, search]);

  // ── Stat cards (computed from the loaded range) ───────────────────────────
  const stats = useMemo(() => {
    const paid = orders.filter(o => o.status === 'paid');
    const sales = paid.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const refunds = paid.filter(o => o.refunded_at);
    const refundTotal = refunds.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    return {
      sales, completed: paid.length,
      avgTicket: paid.length ? sales / paid.length : 0,
      refundCount: refunds.length, refundTotal,
    };
  }, [orders]);

  // ── Row click → detail modal ───────────────────────────────────────────────
  const openDetail = async (o) => {
    setDetailLoading(true);
    setDetail({ ...o, items: [] });
    try {
      const res = await window.electronAPI.apiGet(`/api/orders/${o.id}`);
      if (res?.ok) setDetail(res.data);
    } finally { setDetailLoading(false); }
  };

  // Reprint the receipt for a closed order (2026-08-02). NOTE the field names:
  // this screen's `detail` comes from REST (`GET /api/orders/:id`) and is raw
  // snake_case — unlike Orders/Tables, which read camelised local PowerSync
  // rows. See this file's own header for why history stays on REST.
  const reprintReceipt = async () => {
    if (!detail) return;
    try {
      const receipt = buildReceiptData({
        order: {
          dailyNumber: detail.daily_number,
          id:          detail.id,
          tableName:   detail.table_name || '',
          createdAt:   detail.created_at,
        },
        items: (detail.items || []).map((it) => ({
          name:      it.name || it.item_name || 'Item',
          quantity:  Number(it.quantity || 1),
          unitPrice: Number(it.unit_price || 0),
          unit:      it.unit,
        })),
        settings,
        payment: {
          method:         detail.payment_method,
          discountAmount: detail.discount_amount,
        },
      });
      const res = await window.electronAPI.printReceipt({
        receipt, printers: settings.receiptPrinters,
      });
      if (res?.failed?.length > 0) showToast(t('Receipt printer did not respond', lang), false);
      else if (res?.ok === false) showToast(t('No receipt printer set up yet — add one in Settings → Printers', lang), false);
      else if (res?.printed?.length > 0) showToast(t('Receipt sent to printer', lang));
    } catch { /* best-effort */ }
  };

  const doRefund = async () => {
    if (!detail || busy) return;
    setBusy(true);
    try {
      const res = await window.electronAPI.ordersRefund(detail.id, { reason: refundReason });
      if (!res.ok) { showToast(res.error || t('Refund failed', lang), false); return; }
      showToast(t('Order refunded', lang));
      setShowRefund(false);
      setDetail(d => d ? { ...d, refunded_at: new Date().toISOString(), refund_reason: refundReason } : d);
      load();
    } finally { setBusy(false); }
  };

  const statusLabel = (o) => o.refunded_at ? 'refunded' : (o.status === 'cancelled' ? 'cancelled' : 'completed');

  // Payment methods are stored snake_case ('qr_code') — map to the same
  // display words used elsewhere (Cash/Card/QR Code/Loan) before translating.
  const paymentLabel = (pm) => {
    const map = { cash: 'Cash', card: 'Card', qr_code: 'QR Code', loan: 'Loan' };
    return pm ? t(map[pm] || pm, lang) : '—';
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden', minWidth: 0 }}>
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

      {lastUpdated && <StaleBadge stale={stale} lastUpdated={lastUpdated} lang={lang} />}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <StatCard label={t("Today's Sales", lang)} value={money(stats.sales)} />
        <StatCard label={t('Orders Completed', lang)} value={stats.completed} />
        <StatCard label={t('Avg Ticket', lang)} value={money(Math.round(stats.avgTicket))} />
        <StatCard label={t('Refunds', lang)} value={stats.refundCount} sub={stats.refundTotal ? money(stats.refundTotal) : null} accent={T.coral} />
      </div>

      {/* Date chips */}
      <div style={{ display: 'flex', gap: 8 }}>
        {DATE_CHIPS.map(c => (
          <button key={c} onClick={() => {
            setChip(c);
            if (c === 'Custom') setShowCal(true);
            else setRange(rangeFor(c));
          }} style={{
            padding: '8px 16px', borderRadius: T.rPill, border: 'none', cursor: 'pointer', fontFamily: T.font,
            background: chip === c ? T.green : T.surface, color: chip === c ? '#fff' : T.muted,
            fontSize: 12, fontWeight: 800, boxShadow: chip === c ? 'none' : T.cardShadow,
          }}>
            {c === 'Custom' && customLabel ? customLabel : t(c, lang)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ ...card, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={30} color={T.green} style={{ animation: 'posspin 1s linear infinite' }} />
            <style>{`@keyframes posspin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 14 }}>
            {t('No orders in this range', lang)}
          </div>
        ) : (
          <div style={{ overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.font }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.line}` }}>
                  {['Date & Time', 'Order', 'Table', 'Waiter', 'Items', 'Total', 'Payment', 'Status'].map(h => (
                    <th key={h} style={{ ...uppercaseLabel, textAlign: 'left', padding: '12px 18px' }}>{t(h, lang)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const sp = statusPill(statusLabel(o), lang);
                  return (
                    <tr key={o.id} onClick={() => openDetail(o)} style={{ borderBottom: `1px solid ${T.line2}`, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = T.rowHover}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '11px 18px', fontSize: 12.5, color: T.muted, whiteSpace: 'nowrap' }}>
                        {new Date(o.created_at).toLocaleString(lang === 'UZ' ? 'uz-UZ' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '11px 18px', fontSize: 12.5, fontWeight: 800 }}>#{o.daily_number || o.id.slice(-4)}</td>
                      <td style={{ padding: '11px 18px', fontSize: 12.5 }}>{o.table_name || (o.order_type === 'to_go' ? t('Takeout', lang) : o.order_type === 'delivery' ? t('Delivery', lang) : '—')}</td>
                      <td style={{ padding: '11px 18px', fontSize: 12.5 }}>{o.waitress_name || '—'}</td>
                      <td style={{ padding: '11px 18px', fontSize: 12.5, color: T.muted }}>{tt(lang, '{n} items', '{n} ta', { n: o.item_count })}</td>
                      <td style={{ padding: '11px 18px', fontSize: 13, fontWeight: 800 }}>{money(o.total_amount)}</td>
                      <td style={{ padding: '11px 18px', fontSize: 12.5, color: T.muted }}>{paymentLabel(o.payment_method)}</td>
                      <td style={{ padding: '11px 18px' }}><span style={pill(sp)}>{sp.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══ Custom date-range calendar modal ══ */}
      {showCal && (
        <CalendarModal
          lang={lang}
          onClose={() => setShowCal(false)}
          onApply={(from, to, label) => {
            setRange({ from, to }); setCustomLabel(label); setShowCal(false);
          }}
        />
      )}

      {/* ══ Order detail modal ══ */}
      {detail && (
        <div onClick={() => { setDetail(null); setShowRefund(false); }} style={{
          position: 'fixed', inset: 0, background: T.backdrop, zIndex: 80,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            ...card, borderRadius: T.rCardLg, boxShadow: T.modalShadow, fontFamily: T.font,
            width: 'min(760px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, background: T.greenTint,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Receipt size={18} color={T.greenDark} strokeWidth={1.8} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>
                    {tt(lang, 'Order #{n}', '#{n}-buyurtma', { n: detail.daily_number || detail.id.slice(-4) })}
                    <span style={{ marginLeft: 8 }}>
                      <BadgeInline sp={statusPill(statusLabel(detail), lang)} />
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: T.muted }}>
                    {new Date(detail.created_at).toLocaleString(lang === 'UZ' ? 'uz-UZ' : 'en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              <button onClick={() => { setDetail(null); setShowRefund(false); }} style={{
                width: 32, height: 32, borderRadius: '50%', border: 'none', background: T.chipBg,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted,
              }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ borderTop: `1px solid ${T.line}`, display: 'flex', flex: 1, minHeight: 0 }}>
              {/* Left: items */}
              <div style={{ flex: 1, padding: '16px 22px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <Tile label={t('Table', lang)} value={detail.table_name || detail.order_type || '—'} />
                  <Tile label={t('Waiter', lang)} value={detail.waitress_name || '—'} />
                </div>
                {detailLoading ? (
                  <div style={{ padding: 30, textAlign: 'center' }}><Loader2 size={22} color={T.green} style={{ animation: 'posspin 1s linear infinite' }} /></div>
                ) : (
                  <>
                    <div style={{ ...uppercaseLabel, marginBottom: 8 }}>{t('Items', lang)}</div>
                    {(detail.items || []).map((it, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.line2}` }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{it.name || it.item_name} <span style={{ color: T.faint, fontWeight: 600 }}>×{it.quantity}</span></span>
                        <span style={{ fontSize: 12.5, fontWeight: 800 }}>{money(Number(it.unit_price || 0) * Number(it.quantity || 1))}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, fontWeight: 800, fontSize: 13.5 }}>
                      <span>{t('Subtotal', lang)}</span>
                      <span>{money(Number(detail.total_amount || 0) - Number(detail.tax_amount || 0))}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Right: payment + summary + actions */}
              <div style={{ width: 260, flexShrink: 0, borderLeft: `1px solid ${T.line}`, padding: '16px 22px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ ...uppercaseLabel, marginBottom: 8 }}>{t('Payment Method', lang)}</div>
                <div style={{ background: T.chipBg, borderRadius: T.rBtn, padding: '10px 12px', fontSize: 13, fontWeight: 800, marginBottom: 16 }}>
                  {paymentLabel(detail.payment_method)}
                </div>

                <div style={{ ...uppercaseLabel, marginBottom: 8 }}>{t('Summary', lang)}</div>
                <Row label={t('Subtotal', lang)} value={money(Number(detail.total_amount || 0) - Number(detail.tax_amount || 0))} />
                <Row label={t('Service & Tax', lang)} value={money(detail.tax_amount)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800 }}>{t('Total Paid', lang)}</span>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{money(detail.total_amount)}</span>
                </div>

                {/* Reprint — available for ANY closed order including refunded
                    ones, since a customer or the till may need the copy
                    regardless of how the order ended. */}
                <button onClick={reprintReceipt} style={{
                  width: '100%', padding: '10px 0', marginBottom: 10, borderRadius: T.rBtn,
                  border: `1px solid ${T.line}`, background: T.surface, color: T.ink,
                  fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Printer size={14} strokeWidth={1.8} /> {t('Print Receipt', lang)}
                </button>

                {detail.refunded_at ? (
                  <div style={{ background: T.coralBg, color: T.coral, borderRadius: T.rBtn, padding: '10px 12px', fontSize: 11.5, fontWeight: 700 }}>
                    {tt(lang, 'Refunded — {reason}', 'Qaytarildi — {reason}', { reason: t(detail.refund_reason, lang) })}
                  </div>
                ) : detail.status === 'paid' ? (
                  showRefund ? (
                    <RefundDialog
                      reason={refundReason} setReason={setRefundReason} lang={lang}
                      busy={busy} onConfirm={doRefund} onCancel={() => setShowRefund(false)}
                    />
                  ) : (
                    <button onClick={() => setShowRefund(true)} style={{
                      marginTop: 'auto', padding: '11px 0', borderRadius: T.rBtn, border: `1.5px solid ${T.coral}`,
                      background: T.surface, color: T.coral, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                      <RotateCcw size={14} strokeWidth={2} /> {t('Process Refund', lang)}
                    </button>
                  )
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ ...uppercaseLabel }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, marginTop: 6, color: accent || T.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.coral, fontWeight: 700, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div style={{ flex: 1, background: T.chipBg, borderRadius: T.rBtn, padding: '9px 12px' }}>
      <div style={uppercaseLabel}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function BadgeInline({ sp }) {
  return <span style={pill(sp)}>{sp.label}</span>;
}

// Shows "Updated Xm ago" normally, or an offline warning if the last refresh
// attempt failed and we're showing cached data (see staleCache.js / load()).
function StaleBadge({ stale, lastUpdated, lang }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700,
      color: stale ? T.coral : T.faint,
    }}>
      {stale && <AlertCircle size={13} strokeWidth={2} />}
      {stale
        ? tt(lang, 'Offline — showing data from {time}', 'Oflayn — {time} ma’lumot ko’rsatilmoqda', { time: timeAgo(lastUpdated, lang) })
        : tt(lang, 'Updated {time}', '{time} yangilandi', { time: timeAgo(lastUpdated, lang) })}
    </div>
  );
}

function RefundDialog({ reason, setReason, busy, onConfirm, onCancel, lang }) {
  return (
    <div style={{ marginTop: 'auto', border: `1.5px solid ${T.coral}`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: T.coral, marginBottom: 10 }}>{t('Refund reason', lang)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {REFUND_REASONS.map(r => (
          <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <input type="radio" name="refundReason" checked={reason === r} onChange={() => setReason(r)} />
            {t(r, lang)}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: '9px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
          background: T.surface, color: T.muted, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
        }}>
          {t('Cancel', lang)}
        </button>
        <button onClick={onConfirm} disabled={busy} style={{
          flex: 1, padding: '9px 0', borderRadius: T.rBtn, border: 'none',
          background: T.coral, color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: busy ? 0.7 : 1,
        }}>
          {busy && <Loader2 size={13} style={{ animation: 'posspin 1s linear infinite' }} />}
          {t('Confirm', lang)}
        </button>
      </div>
    </div>
  );
}

// ── Custom date-range calendar modal ───────────────────────────────────────────
function CalendarModal({ onClose, onApply, lang }) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year,  setYear]  = useState(today.getFullYear());
  const [from,  setFrom]  = useState('');
  const [to,    setTo]    = useState('');
  const [picking, setPicking] = useState('from');

  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const total = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    return cells;
  }, [year, month]);

  const fmt = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const pickDay = (d) => {
    if (!d) return;
    const val = fmt(year, month, d);
    if (picking === 'from' || (from && to)) { setFrom(val); setTo(''); setPicking('to'); }
    else { if (val < from) { setTo(from); setFrom(val); } else setTo(val); setPicking('from'); }
  };

  const inRange = (d) => {
    if (!d || !from) return false;
    const val = fmt(year, month, d);
    if (!to) return val === from;
    return val >= from && val <= to;
  };

  const quickRange = (label) => {
    const now = new Date();
    if (label === 'Today') { const v = isoDate(now); setFrom(v); setTo(v); }
    if (label === 'This Week') { const s = new Date(now); s.setDate(s.getDate() - s.getDay()); setFrom(isoDate(s)); setTo(isoDate(now)); }
    if (label === 'This Month') { setFrom(isoDate(new Date(now.getFullYear(), now.getMonth(), 1))); setTo(isoDate(now)); }
    if (label === 'Last Month') {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      setFrom(isoDate(s)); setTo(isoDate(e));
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: T.backdrop, zIndex: 90,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        ...card, borderRadius: T.rCardLg, boxShadow: T.modalShadow, width: 380, padding: 20, fontFamily: T.font,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarDays size={17} strokeWidth={1.8} /> {t('Custom Range', lang)}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: T.muted }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, background: T.chipBg, borderRadius: T.rBtn, padding: '8px 10px' }}>
            <div style={uppercaseLabel}>{t('From', lang)}</div>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>{from || '—'}</div>
          </div>
          <div style={{ flex: 1, background: T.chipBg, borderRadius: T.rBtn, padding: '8px 10px' }}>
            <div style={uppercaseLabel}>{t('To', lang)}</div>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>{to || '—'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button onClick={() => setMonth(m => { if (m === 0) { setYear(y => y - 1); return 11; } return m - 1; })} style={{ border: 'none', background: T.chipBg, borderRadius: 8, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 12.5, fontWeight: 800 }}>
            {new Date(year, month, 1).toLocaleDateString(lang === 'UZ' ? 'uz-UZ' : 'en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => setMonth(m => { if (m === 11) { setYear(y => y + 1); return 0; } return m + 1; })} style={{ border: 'none', background: T.chipBg, borderRadius: 8, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 12 }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: T.faint, padding: '4px 0' }}>{d}</div>
          ))}
          {days.map((d, i) => (
            <button key={i} onClick={() => pickDay(d)} disabled={!d} style={{
              height: 28, borderRadius: 8, border: 'none', cursor: d ? 'pointer' : 'default',
              background: inRange(d) ? T.green : 'transparent', color: inRange(d) ? '#fff' : (d ? T.ink : 'transparent'),
              fontSize: 11.5, fontWeight: 700, fontFamily: T.font,
            }}>
              {d || ''}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {['Today', 'This Week', 'This Month', 'Last Month'].map(l => (
            <button key={l} onClick={() => quickRange(l)} style={{
              padding: '6px 10px', borderRadius: T.rPill, border: `1px solid ${T.line}`, background: T.surface,
              color: T.muted, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: T.font,
            }}>
              {t(l, lang)}
            </button>
          ))}
        </div>

        <button
          disabled={!from}
          onClick={() => onApply(from, to || from, `${from} → ${to || from}`)}
          style={{
            width: '100%', padding: '11px 0', borderRadius: T.rBtn, border: 'none',
            background: T.green, color: '#fff', fontSize: 13, fontWeight: 800, cursor: from ? 'pointer' : 'default',
            fontFamily: T.font, opacity: from ? 1 : 0.5,
          }}
        >
          {t('Apply', lang)}
        </button>
      </div>
    </div>
  );
}
