import { useState, useEffect } from 'react';
import {
  Phone, Mail, CalendarDays, LogOut as ClockOutIcon, LogIn as ClockInIcon,
  Loader2, CheckCircle2, AlertCircle, RefreshCw,
} from 'lucide-react';
import { T, card, pill, uppercaseLabel, initials, fmtMoney } from './tokens.js';
import { t } from '../../lib/i18n.js';

// ─────────────────────────────────────────────────────────────────────────────
// Profile screen — design handoff screen 14.
//
// Honesty note vs. the design mock: the design shows "Break" and "Employee ID"
// fields and Edit Profile / Change Password buttons. The `shifts` table has no
// break-tracking column and `users` has no employee-ID or address/emergency-
// contact fields (checked schema.sql, not guessed), and there's no
// change-password/edit-profile endpoint yet. Rather than fabricate fields with
// no real data behind them, this screen omits them — add them for real if/when
// the project owner wants that feature, don't fake it client-side.
//
// Data: apiGet('/api/shifts/active') + apiGet('/api/shifts/mine') for shift
// state, apiGet('/api/orders?...') scoped to this user + today for stats.
// Writes: shiftsClockIn / shiftsClockOut (new IPC, Step 8).
// ─────────────────────────────────────────────────────────────────────────────

function isoDate(d) { return d.toISOString().slice(0, 10); }
function elapsedLabel(fromIso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(fromIso).getTime()) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h ${m}m`;
}

export default function ProfileScreen({ user, settings, lang }) {
  const symbol = settings.currencySymbol;
  const money  = (n) => fmtMoney(n, symbol);

  const [shift,   setShift]   = useState(undefined); // undefined = never loaded yet, null = confirmed not clocked in, object = active shift
  // Separate from `shift` on purpose: a failed/timed-out request used to be
  // treated identically to "not clocked in" (setShift(null) on both), which
  // silently lied to the cashier — a network hiccup and a genuine off-shift
  // state looked exactly the same. Now a failure only ever sets this flag;
  // it never invents a `shift` value the backend didn't actually confirm.
  const [shiftError, setShiftError] = useState(false);
  const [stats,   setStats]   = useState({ orders: 0, sales: 0, avgServeMin: null });
  const [busy,    setBusy]    = useState(false);
  // Per-terminal kitchen auto-print switch (electron-store, not the DB — see the
  // card near the bottom of the render for why it must be per-machine).
  const [autoPrint, setAutoPrint] = useState(true);
  useEffect(() => {
    (async () => {
      try { setAutoPrint(await window.electronAPI.kitchenAutoPrintGet()); }
      catch { /* older main process — leave the optimistic default */ }
    })();
  }, []);
  const [toast,   setToast]   = useState(null);
  const [, forceTick] = useState(0); // re-render every 30s so "Shift Length" ticks live
  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const loadShift = async () => {
    try {
      const res = await window.electronAPI.apiGet('/api/shifts/active');
      if (res?.ok) { setShiftError(false); setShift(res.data?.active ? res.data : null); }
      else setShiftError(true);
    } catch { setShiftError(true); }
  };

  const loadStats = async () => {
    try {
      const today = isoDate(new Date());
      const qs = new URLSearchParams({ waitress_id: user.id, status: 'paid', from: today, to: today, limit: '500' });
      const res = await window.electronAPI.apiGet(`/api/orders?${qs.toString()}`);
      if (!res?.ok) return;
      const rows = Array.isArray(res.data) ? res.data : [];
      const sales = rows.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const serveTimes = rows
        .filter(o => o.created_at && o.paid_at)
        .map(o => (new Date(o.paid_at) - new Date(o.created_at)) / 60000);
      const avgServeMin = serveTimes.length ? serveTimes.reduce((a, b) => a + b, 0) / serveTimes.length : null;
      setStats({ orders: rows.length, sales, avgServeMin });
    } catch {}
  };

  useEffect(() => {
    loadShift();
    loadStats();
    const t1 = setInterval(loadShift, 15000);
    const t2 = setInterval(() => forceTick(n => n + 1), 30000);
    return () => { clearInterval(t1); clearInterval(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clockIn = async () => {
    setBusy(true);
    try {
      const res = await window.electronAPI.shiftsClockIn();
      if (!res.ok) { showToast(res.error || t('Failed to clock in', lang), false); return; }
      showToast(t('Clocked in', lang));
      loadShift();
    } finally { setBusy(false); }
  };
  const clockOut = async () => {
    setBusy(true);
    try {
      const res = await window.electronAPI.shiftsClockOut();
      if (!res.ok) { showToast(res.error || t('Failed to clock out', lang), false); return; }
      showToast(t('Clocked out', lang));
      loadShift();
    } finally { setBusy(false); }
  };

  const roleLabel = user.role === 'new_cashier' ? t('Cashier', lang) : (user.role || '').replace(/_/g, ' ');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto', minWidth: 0 }}>
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

      {/* Header card */}
      <div style={{ ...card, padding: 22, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{
          width: 66, height: 66, borderRadius: 18, background: T.greenTint, color: T.greenDark,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0,
        }}>
          {initials(user.name) || 'ST'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{user.name || t('Staff', lang)}</span>
            <span style={pill(shift ? { color: T.greenDark, bg: T.greenTint } : { color: T.gray, bg: T.grayBg })}>
              {t(shift ? 'On Shift' : 'Off Shift', lang)}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, textTransform: 'capitalize' }}>
            {roleLabel}{user.kitchen_station ? ` · ${user.kitchen_station}` : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {/* Shift Info card */}
        <div style={{ ...card, padding: 20, flex: '1 1 280px' }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>{t('Shift Info', lang)}</div>
          {shift === undefined && shiftError ? (
            // Never successfully loaded AND the attempt just failed — say so
            // honestly instead of guessing "not clocked in" or spinning forever.
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.coral, fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>
                <AlertCircle size={15} />
                {t("Can't reach server — shift status unknown", lang)}
              </div>
              <button onClick={loadShift} style={{
                width: '100%', padding: '10px 0', borderRadius: T.rBtn, border: `1px solid ${T.line}`,
                background: T.surface, color: T.ink, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <RefreshCw size={14} strokeWidth={1.8} />
                {t('Retry', lang)}
              </button>
            </>
          ) : shift === undefined ? (
            <Loader2 size={20} color={T.green} style={{ animation: 'posspin 1s linear infinite' }} />
          ) : shift ? (
            <>
              <InfoRow label={t('Clocked In', lang)} value={new Date(shift.clock_in).toLocaleTimeString(lang === 'UZ' ? 'uz-UZ' : 'en-US', { hour: '2-digit', minute: '2-digit' })} />
              <InfoRow label={t('Shift Length', lang)} value={elapsedLabel(shift.clock_in)} />
              <InfoRow label={t('Break', lang)} value="—" />
              {shiftError && (
                <div style={{ fontSize: 11, color: T.coral, marginTop: 8 }}>
                  {t("Couldn't refresh — showing last known status", lang)}
                </div>
              )}
              <button onClick={clockOut} disabled={busy} style={{
                marginTop: 14, width: '100%', padding: '11px 0', borderRadius: T.rBtn,
                border: `1.5px solid ${T.coral}`, background: T.surface, color: T.coral,
                fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                {busy ? <Loader2 size={14} style={{ animation: 'posspin 1s linear infinite' }} /> : <ClockOutIcon size={15} strokeWidth={1.8} />}
                {t('Clock Out', lang)}
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>{t('Not clocked in yet today.', lang)}</div>
              {shiftError && (
                <div style={{ fontSize: 11, color: T.coral, marginBottom: 10 }}>
                  {t("Couldn't refresh — showing last known status", lang)}
                </div>
              )}
              <button onClick={clockIn} disabled={busy} style={{
                width: '100%', padding: '11px 0', borderRadius: T.rBtn, border: 'none',
                background: T.green, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                {busy ? <Loader2 size={14} style={{ animation: 'posspin 1s linear infinite' }} /> : <ClockInIcon size={15} strokeWidth={1.8} />}
                {t('Clock In', lang)}
              </button>
            </>
          )}
        </div>

        {/* Personal Details card */}
        <div style={{ ...card, padding: 20, flex: '1 1 280px' }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>{t('Personal Details', lang)}</div>
          <IconRow Icon={Phone} label={t('Phone', lang)} value={user.phone || '—'} />
          <IconRow Icon={Mail} label={t('Email', lang)} value={user.email || '—'} />
          <IconRow Icon={CalendarDays} label={t('Hire Date', lang)} value={user.created_at ? new Date(user.created_at).toLocaleDateString(lang === 'UZ' ? 'uz-UZ' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <StatCard label={t('Orders Handled Today', lang)} value={stats.orders} />
        <StatCard label={t('Sales Today', lang)} value={money(stats.sales)} />
        <StatCard label={t('Avg Serve Time', lang)} value={stats.avgServeMin != null ? `${Math.round(stats.avgServeMin)}m` : '—'} />
      </div>

      {/* ── This terminal (per-machine settings, NOT restaurant-wide) ──
          Deliberately here and not in Admin → Settings: this is a property of
          THIS computer. Admin settings are shared by every terminal, so putting
          it there would switch all of them at once — and if two terminals both
          watched for incoming orders the kitchen would get two copies of every
          phone order. Exactly one terminal in a venue should have this on. */}
      <div style={{ ...card, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{t('This terminal', lang)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>
              {t('Print kitchen tickets for orders from phones', lang)}
            </div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>
              {t('Turn this on for ONE terminal only. Waitress phones cannot reach the kitchen printer directly, so this computer prints their orders.', lang)}
            </div>
          </div>
          <button
            onClick={async () => {
              const next = !autoPrint;
              setAutoPrint(next);
              try { await window.electronAPI.kitchenAutoPrintSet(next); }
              catch { setAutoPrint(!next); } // revert if the main process refused
            }}
            style={{
              width: 52, height: 30, borderRadius: T.rPill, border: 'none', flexShrink: 0,
              background: autoPrint ? T.green : T.chipBg, cursor: 'pointer',
              display: 'flex', alignItems: 'center', padding: 3,
              justifyContent: autoPrint ? 'flex-end' : 'flex-start',
              transition: 'background .15s',
            }}
          >
            <span style={{
              width: 24, height: 24, borderRadius: '50%', background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,.2)',
            }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────────

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.line2}` }}>
      <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function IconRow({ Icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9, background: T.chipBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={14} strokeWidth={1.8} color={T.muted} />
      </div>
      <div>
        <div style={uppercaseLabel}>{label}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 1 }}>{value}</div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={uppercaseLabel}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}
