import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, X, Check, CreditCard, Calendar, DollarSign, CheckCircle2, AlertCircle,
  Banknote, QrCode, Bell,
} from 'lucide-react';
import { T, card, pill, uppercaseLabel, initials, fmtMoney } from './tokens.js';
import { loadCached, saveCached, timeAgo } from '../../lib/staleCache.js';
import { t, tt } from '../../lib/i18n.js';

// ─────────────────────────────────────────────────────────────────────────────
// Receivables screen — customer loans/debts. Design handoff screens 11–13.
//
// Data: backend GET /api/loans + GET /api/loans/stats via apiGet (same
// reasoning as History — needs joined data, low write frequency, no offline
// requirement). Writes: PATCH /api/loans/:id/pay via loansPay (existing
// endpoint, confirmed in loans.js — no backend change needed here).
//
// Status classification (design: "Active = current + due-soon"):
//   paid loan            → 'paid'
//   active, past due_date → 'overdue'
//   active, due within 3 days → 'due_soon' (counts as Active tab)
//   active, otherwise      → 'current'    (counts as Active tab)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_KEY = 'pos.receivables.cache.v1';
const FILTERS = ['All', 'Active', 'Paid', 'Overdue'];
const METHODS = [
  { id: 'cash', Icon: Banknote,   label: 'Cash' },
  { id: 'card', Icon: CreditCard, label: 'Card' },
  { id: 'qr_code', Icon: QrCode,  label: 'QR'   },
];

function classify(loan) {
  if (loan.status === 'paid') return 'paid';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(loan.due_date);
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return 'overdue';
  if (days <= 3) return 'due_soon';
  return 'current';
}

// `lang` optional — omitted, returns the English label.
function statusStyle(status, lang) {
  const STYLE = {
    paid:     { label: 'Paid',     color: T.greenDark, bg: T.greenTint },
    overdue:  { label: 'Overdue',  color: T.coral,      bg: T.coralBg   },
    due_soon: { label: 'Due Soon', color: T.amber,       bg: T.amberBg  },
    current:  { label: 'Current',  color: T.blue,        bg: T.blueBg   },
  };
  const s = STYLE[status] || STYLE.current;
  return { ...s, label: t(s.label, lang) };
}

export default function ReceivablesScreen({ user, settings, search, lang }) {
  const symbol = settings.currencySymbol;
  const money  = (n) => fmtMoney(n, symbol);

  const cached = useMemo(() => loadCached(CACHE_KEY), []); // read once on mount
  const [loans,   setLoans]   = useState(cached?.data || []);
  const [loading, setLoading] = useState(!cached); // skip spinner if we already have something to show
  const [lastUpdated, setLastUpdated] = useState(cached?.savedAt || null);
  const [stale,   setStale]   = useState(false);
  const [filter,  setFilter]  = useState('All');
  const [selected, setSelected] = useState(null); // loan row
  const [orderDetail, setOrderDetail] = useState(null);
  const [showCollect, setShowCollect] = useState(false);
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const res = await window.electronAPI.apiGet('/api/loans');
      if (res?.ok) {
        const data = Array.isArray(res.data) ? res.data : [];
        setLoans(data);
        setStale(false);
        setLastUpdated(Date.now());
        saveCached(CACHE_KEY, data);
      } else {
        showToast(res?.error || t('Failed to load receivables — is the backend reachable?', lang), false);
        setStale(true);
      }
    } catch {
      showToast(t('Failed to load receivables', lang), false);
      setStale(true);
    }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const withStatus = useMemo(() => loans.map(l => ({ ...l, _status: classify(l) })), [loans]);

  const stats = useMemo(() => {
    const active = withStatus.filter(l => l.status === 'active');
    const overdue = active.filter(l => l._status === 'overdue');
    const customers = new Set(active.map(l => l.customer_name));
    return {
      outstanding: active.reduce((s, l) => s + Number(l.amount || 0), 0),
      overdueTotal: overdue.reduce((s, l) => s + Number(l.amount || 0), 0),
      customerCount: customers.size,
    };
  }, [withStatus]);

  const filtered = useMemo(() => {
    let list = withStatus;
    if (filter === 'Active')   list = list.filter(l => l._status === 'current' || l._status === 'due_soon');
    if (filter === 'Paid')     list = list.filter(l => l._status === 'paid');
    if (filter === 'Overdue')  list = list.filter(l => l._status === 'overdue');
    if (search?.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => (l.customer_name || '').toLowerCase().includes(q) || (l.customer_phone || '').includes(q));
    }
    return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [withStatus, filter, search]);

  const openDetail = async (loan) => {
    setSelected(loan);
    setOrderDetail(null);
    if (loan.order_id) {
      try {
        const res = await window.electronAPI.apiGet(`/api/orders/${loan.order_id}`);
        if (res?.ok) setOrderDetail(res.data);
      } catch {}
    }
  };

  const collect = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await window.electronAPI.loansPay(selected.id, { payment_method: method });
      if (!res.ok) { showToast(res.error || t('Failed to record payment', lang), false); return; }
      showToast(t('Payment recorded — loan marked paid', lang));
      setShowCollect(false);
      setSelected(null);
      load();
    } finally { setBusy(false); }
  };

  // Notifies ALL overdue loans for the restaurant at once (that's what the
  // backend endpoint does — there's no single-loan reminder route), so this
  // button's real effect is broader than just "this row".
  const remind = async () => {
    try {
      const res = await window.electronAPI.loansRemind();
      showToast(res?.ok ? t('Overdue reminders sent to admins/owners', lang) : (res?.error || t('Failed to send reminders', lang)), !!res?.ok);
    } catch { showToast(t('Failed to send reminder', lang), false); }
  };

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={34} color={T.green} style={{ animation: 'posspin 1s linear infinite' }} />
      <style>{`@keyframes posspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <StatCard label={t('Total Outstanding', lang)} value={money(stats.outstanding)} />
        <StatCard label={t('Overdue', lang)} value={money(stats.overdueTotal)} accent={T.coral} />
        <StatCard label={t('Customers with Balance', lang)} value={stats.customerCount} />
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '8px 16px', borderRadius: T.rPill, border: 'none', cursor: 'pointer', fontFamily: T.font,
            background: filter === f ? T.green : T.surface, color: filter === f ? '#fff' : T.muted,
            fontSize: 12, fontWeight: 800, boxShadow: filter === f ? 'none' : T.cardShadow,
          }}>
            {t(f, lang)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ ...card, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {filtered.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 14 }}>
            {t('No receivables in this filter', lang)}
          </div>
        ) : (
          <div style={{ overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.font }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.line}` }}>
                  {['Customer', 'Phone', 'Owed', 'Last Charge', 'Due', 'Status', ''].map(h => (
                    <th key={h} style={{ ...uppercaseLabel, textAlign: 'left', padding: '12px 18px' }}>{t(h, lang)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const sp = statusStyle(l._status, lang);
                  return (
                    <tr key={l.id} style={{ borderBottom: `1px solid ${T.line2}` }}
                      onMouseEnter={e => e.currentTarget.style.background = T.rowHover}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td onClick={() => openDetail(l)} style={{ padding: '11px 18px', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 26, height: 26, borderRadius: 8, background: T.greenTint, color: T.greenDark,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0,
                          }}>
                            {initials(l.customer_name)}
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 800 }}>{l.customer_name}</span>
                        </div>
                      </td>
                      <td onClick={() => openDetail(l)} style={{ padding: '11px 18px', fontSize: 12.5, color: T.muted, cursor: 'pointer' }}>{l.customer_phone || '—'}</td>
                      <td onClick={() => openDetail(l)} style={{ padding: '11px 18px', fontSize: 13, fontWeight: 800, color: l.status === 'paid' ? T.muted : T.coral, cursor: 'pointer' }}>{money(l.amount)}</td>
                      <td onClick={() => openDetail(l)} style={{ padding: '11px 18px', fontSize: 12, color: T.muted, cursor: 'pointer' }}>{fmtDate(l.created_at, lang)}</td>
                      <td onClick={() => openDetail(l)} style={{ padding: '11px 18px', fontSize: 12, color: T.muted, cursor: 'pointer' }}>{fmtDate(l.due_date, lang)}</td>
                      <td onClick={() => openDetail(l)} style={{ padding: '11px 18px', cursor: 'pointer' }}>
                        <span style={pill(sp)}>{sp.label}</span>
                      </td>
                      <td style={{ padding: '11px 18px' }}>
                        {l.status === 'active' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => { setSelected(l); setShowCollect(true); }} style={{
                              padding: '6px 12px', borderRadius: T.rBtn, border: `1.5px solid ${T.green}`,
                              background: T.surface, color: T.greenDark, fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                            }}>
                              {t('Record Payment', lang)}
                            </button>
                            <button onClick={remind} title={t('Remind all overdue', lang)} style={{
                              width: 30, height: 30, borderRadius: T.rBtn, border: `1px solid ${T.line}`,
                              background: T.surface, color: T.muted, cursor: 'pointer', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Bell size={13} strokeWidth={1.8} />
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══ Loan Details modal ══ */}
      {selected && !showCollect && (
        <div onClick={() => setSelected(null)} style={{
          position: 'fixed', inset: 0, background: T.backdrop, zIndex: 80,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            ...card, borderRadius: T.rCardLg, boxShadow: T.modalShadow, fontFamily: T.font,
            width: 'min(520px, 94vw)', maxHeight: '90vh', overflowY: 'auto', padding: 22,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 800 }}>{t('Loan Details', lang)}</div>
                <div style={{ fontSize: 11.5, color: T.muted }}>{selected.customer_name}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{
                width: 30, height: 30, borderRadius: '50%', border: 'none', background: T.chipBg,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted,
              }}>
                <X size={15} />
              </button>
            </div>

            {/* Status banner */}
            {(() => {
              const sp = statusStyle(selected._status, lang);
              return (
                <div style={{ background: sp.bg, borderRadius: 14, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <div style={{ ...uppercaseLabel, color: sp.color }}>{sp.label.toUpperCase()}</div>
                    <div style={{ fontSize: 21, fontWeight: 800, color: sp.color, marginTop: 2 }}>{money(selected.amount)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...uppercaseLabel, color: sp.color }}>{t(selected.status === 'paid' ? 'Paid On' : 'Due Date', lang)}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: sp.color, marginTop: 2 }}>
                      {fmtDate(selected.status === 'paid' ? selected.paid_at : selected.due_date, lang)}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <Tile label={t('Customer', lang)} value={selected.customer_name} />
              <Tile label={t('Phone', lang)} value={selected.customer_phone || '—'} />
              <Tile label={t('Order #', lang)} value={selected.daily_number ? `#${selected.daily_number}` : '—'} />
              <Tile label={t('Table', lang)} value={selected.table_name || selected.order_type || '—'} />
              <Tile label={t('Taken On', lang)} value={fmtDate(selected.created_at, lang)} />
              <Tile label={t(selected.status === 'paid' ? 'Paid On' : 'Due', lang)} value={fmtDate(selected.status === 'paid' ? selected.paid_at : selected.due_date, lang)} />
            </div>

            {/* Order items */}
            {orderDetail && (
              <>
                <div style={{ ...uppercaseLabel, marginBottom: 8 }}>{tt(lang, 'Order Items · {n} items', 'Buyurtma mahsulotlari · {n} ta', { n: (orderDetail.items || []).length })}</div>
                {(orderDetail.items || []).map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${T.line2}` }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                      {it.name || it.item_name}
                      <span style={{ color: T.faint, fontWeight: 600 }}> × {it.quantity} {money(it.unit_price)}</span>
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 800 }}>{money(Number(it.unit_price || 0) * Number(it.quantity || 1))}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, fontSize: 13, fontWeight: 800 }}>
                  <span>{t('Subtotal', lang)}</span>
                  <span>{money(selected.amount)}</span>
                </div>
              </>
            )}

            {selected.status === 'paid' && selected.payment_method && (
              <div style={{ background: T.greenTint, color: T.greenDark, borderRadius: T.rBtn, padding: '9px 12px', fontSize: 12, fontWeight: 700, marginTop: 12 }}>
                {tt(lang, 'Paid via {method}', '{method} orqali to’landi', { method: selected.payment_method })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={() => setSelected(null)} style={{
                flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
                background: T.surface, color: T.muted, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
              }}>
                {t('Close', lang)}
              </button>
              {selected.status === 'active' && (
                <button onClick={() => setShowCollect(true)} style={{
                  flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: 'none',
                  background: T.green, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Check size={14} strokeWidth={2.5} /> {t('Mark Paid', lang)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Collect Loan Payment modal ══ */}
      {selected && showCollect && (
        <div onClick={() => setShowCollect(false)} style={{
          position: 'fixed', inset: 0, background: T.backdrop, zIndex: 90,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            ...card, borderRadius: T.rCardLg, boxShadow: T.modalShadow, fontFamily: T.font,
            width: 'min(440px, 94vw)', padding: 22,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800 }}>{t('Collect Loan Payment', lang)}</div>
              <button onClick={() => setShowCollect(false)} style={{
                width: 30, height: 30, borderRadius: '50%', border: 'none', background: T.chipBg,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted,
              }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <Tile label={t('Customer', lang)} value={selected.customer_name} />
              <Tile label={t('Order #', lang)} value={selected.daily_number ? `#${selected.daily_number}` : '—'} />
            </div>

            <div style={{ ...uppercaseLabel, marginBottom: 8 }}>{t('Payment method', lang)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {METHODS.map(({ id, Icon, label }) => {
                const active = method === id;
                return (
                  <button key={id} onClick={() => setMethod(id)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 0',
                    borderRadius: 12, cursor: 'pointer', fontFamily: T.font,
                    border: active ? `2px solid ${T.green}` : `1.5px solid ${T.line}`,
                    background: active ? T.greenTint : T.surface, color: active ? T.greenDark : T.muted,
                    fontSize: 11.5, fontWeight: 800, position: 'relative',
                  }}>
                    {active && (
                      <span style={{
                        position: 'absolute', top: 6, right: 6, width: 15, height: 15, borderRadius: '50%',
                        background: T.green, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check size={9} strokeWidth={3} color="#fff" />
                      </span>
                    )}
                    <Icon size={18} strokeWidth={1.8} />
                    {t(label, lang)}
                  </button>
                );
              })}
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: T.chipBg, borderRadius: T.rBtn, padding: '12px 16px', marginBottom: 16,
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted }}>{t('Total to collect', lang)}</span>
              <span style={{ fontSize: 17, fontWeight: 800 }}>{money(selected.amount)}</span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowCollect(false)} style={{
                flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
                background: T.surface, color: T.muted, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
              }}>
                {t('Cancel', lang)}
              </button>
              <button onClick={collect} disabled={busy} style={{
                flex: 1, padding: '11px 0', borderRadius: T.rBtn, border: 'none',
                background: T.green, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: busy ? 0.7 : 1,
              }}>
                {busy ? <Loader2 size={14} style={{ animation: 'posspin 1s linear infinite' }} /> : <DollarSign size={14} strokeWidth={2.5} />}
                {t('Confirm Payment', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────────

function fmtDate(iso, lang) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(lang === 'UZ' ? 'uz-UZ' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

function StatCard({ label, value, accent }) {
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={uppercaseLabel}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, marginTop: 6, color: accent || T.ink }}>{value}</div>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div style={{ background: T.chipBg, borderRadius: T.rBtn, padding: '9px 12px' }}>
      <div style={uppercaseLabel}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}
