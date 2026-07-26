import { useState, useEffect } from 'react';
import {
  Phone, Mail, CalendarDays, LogOut as ClockOutIcon, LogIn as ClockInIcon,
  Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { T, card, pill, uppercaseLabel, initials, fmtMoney } from './tokens.js';

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

export default function ProfileScreen({ user, settings }) {
  const symbol = settings.currencySymbol;
  const money  = (n) => fmtMoney(n, symbol);

  const [shift,   setShift]   = useState(undefined); // undefined = loading, null = not clocked in
  const [stats,   setStats]   = useState({ orders: 0, sales: 0, avgServeMin: null });
  const [busy,    setBusy]    = useState(false);
  const [toast,   setToast]   = useState(null);
  const [, forceTick] = useState(0); // re-render every 30s so "Shift Length" ticks live
  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const loadShift = async () => {
    try {
      const res = await window.electronAPI.apiGet('/api/shifts/active');
      if (res?.ok) setShift(res.data?.active ? res.data : null);
      else setShift(null);
    } catch { setShift(null); }
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
      if (!res.ok) { showToast(res.error || 'Failed to clock in', false); return; }
      showToast('Clocked in');
      loadShift();
    } finally { setBusy(false); }
  };
  const clockOut = async () => {
    setBusy(true);
    try {
      const res = await window.electronAPI.shiftsClockOut();
      if (!res.ok) { showToast(res.error || 'Failed to clock out', false); return; }
      showToast('Clocked out');
      loadShift();
    } finally { setBusy(false); }
  };

  const roleLabel = user.role === 'new_cashier' ? 'Cashier' : (user.role || '').replace(/_/g, ' ');

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
            <span style={{ fontSize: 18, fontWeight: 800 }}>{user.name || 'Staff'}</span>
            <span style={pill(shift ? { color: T.greenDark, bg: T.greenTint } : { color: T.gray, bg: T.grayBg })}>
              {shift ? 'On Shift' : 'Off Shift'}
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
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>Shift Info</div>
          {shift === undefined ? (
            <Loader2 size={20} color={T.green} style={{ animation: 'posspin 1s linear infinite' }} />
          ) : shift ? (
            <>
              <InfoRow label="Clocked In" value={new Date(shift.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} />
              <InfoRow label="Shift Length" value={elapsedLabel(shift.clock_in)} />
              <InfoRow label="Break" value="—" />
              <button onClick={clockOut} disabled={busy} style={{
                marginTop: 14, width: '100%', padding: '11px 0', borderRadius: T.rBtn,
                border: `1.5px solid ${T.coral}`, background: T.surface, color: T.coral,
                fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                {busy ? <Loader2 size={14} style={{ animation: 'posspin 1s linear infinite' }} /> : <ClockOutIcon size={15} strokeWidth={1.8} />}
                Clock Out
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>Not clocked in yet today.</div>
              <button onClick={clockIn} disabled={busy} style={{
                width: '100%', padding: '11px 0', borderRadius: T.rBtn, border: 'none',
                background: T.green, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: T.font,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                {busy ? <Loader2 size={14} style={{ animation: 'posspin 1s linear infinite' }} /> : <ClockInIcon size={15} strokeWidth={1.8} />}
                Clock In
              </button>
            </>
          )}
        </div>

        {/* Personal Details card */}
        <div style={{ ...card, padding: 20, flex: '1 1 280px' }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>Personal Details</div>
          <IconRow Icon={Phone} label="Phone" value={user.phone || '—'} />
          <IconRow Icon={Mail} label="Email" value={user.email || '—'} />
          <IconRow Icon={CalendarDays} label="Hire Date" value={user.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <StatCard label="Orders Handled Today" value={stats.orders} />
        <StatCard label="Sales Today" value={money(stats.sales)} />
        <StatCard label="Avg Serve Time" value={stats.avgServeMin != null ? `${Math.round(stats.avgServeMin)}m` : '—'} />
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
