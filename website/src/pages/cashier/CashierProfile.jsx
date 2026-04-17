import { useState, useEffect, useCallback } from 'react';
import { User, Clock, TrendingUp, AlertCircle, Loader2, ShoppingBag, Calendar, CheckCircle } from 'lucide-react';
import { shiftsAPI, reportsAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { money } from '../../hooks/useApi';

const PRIMARY       = '#0891B2';
const PRIMARY_DARK  = '#0E7490';
const PRIMARY_LIGHT = '#E0F2FE';

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
};

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

const fmtDuration = (clockIn, clockOut) => {
  const diffM = Math.floor(((clockOut ? new Date(clockOut) : Date.now()) - new Date(clockIn)) / 60000);
  const h = Math.floor(diffM / 60), m = diffM % 60;
  return `${h}h ${m}m`;
};

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color = PRIMARY, bg = PRIMARY_LIGHT }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const CashierProfile = () => {
  const { user } = useAuth();
  const [shiftStatus, setShiftStatus]   = useState(null);
  const [shiftHistory, setShiftHistory] = useState([]);
  const [todayStats, setTodayStats]     = useState({ orders: 0, revenue: 0 });
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [now, setNow]                   = useState(Date.now());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [historyData, activeShift] = await Promise.all([
        shiftsAPI.getMyShifts({ limit: 10 }),
        shiftsAPI.getActive().catch(() => null),
      ]);
      setShiftHistory(Array.isArray(historyData) ? historyData : []);
      setShiftStatus(activeShift || null);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const reports = await reportsAPI.getCashierStats({ from: today, to: today });
        if (Array.isArray(reports) && reports[0]) {
          setTodayStats({ orders: reports[0].ordersProcessed || 0, revenue: reports[0].totalRevenue || 0 });
        }
      } catch { /* ignore */ }
      setError(null);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(t);
  }, [fetchData]);

  const isActive = !!shiftStatus?.active;

  // Live shift duration
  const liveDuration = isActive && shiftStatus?.clockIn
    ? (() => {
        const diffM = Math.floor((now - new Date(shiftStatus.clockIn)) / 60000);
        const h = Math.floor(diffM / 60), m = diffM % 60;
        return `${h}h ${m}m`;
      })()
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: PRIMARY_LIGHT }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: PRIMARY }} />
          </div>
          <p className="text-gray-500 font-medium">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50">

      {/* ── Hero Banner ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_DARK} 100%)` }}>
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-10" style={{ backgroundColor: '#fff' }} />
        <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full opacity-10" style={{ backgroundColor: '#fff' }} />

        <div className="relative max-w-5xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center md:items-end gap-6">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-bold shadow-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: '3px solid rgba(255,255,255,0.4)' }}
            >
              {getInitials(user?.name)}
            </div>
            {/* Online dot */}
            <div
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white"
              style={{ backgroundColor: isActive ? '#22C55E' : '#94A3B8' }}
            />
          </div>

          {/* Name / role */}
          <div className="text-center md:text-left flex-1">
            <h1 className="text-2xl font-bold text-white">{user?.name || 'Cashier'}</h1>
            <p className="text-sm text-white/70 mt-0.5">{user?.email || ''}</p>
            <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }}>
              <User className="w-3 h-3" />
              Cashier
            </div>
          </div>

          {/* Live shift duration badge */}
          {isActive && liveDuration && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <Clock className="w-4 h-4 text-white/80" />
              <span className="text-white font-bold text-lg tabular-nums">{liveDuration}</span>
              <span className="text-white/60 text-xs">on shift</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Stats Row ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Shift Status"
            value={isActive ? 'Clocked In' : 'Clocked Out'}
            icon={<Clock className="w-5 h-5" />}
            color={isActive ? '#16A34A' : '#6B7280'}
            bg={isActive ? '#F0FDF4' : '#F3F4F6'}
          />
          <StatCard
            label="Orders Today"
            value={todayStats.orders}
            icon={<ShoppingBag className="w-5 h-5" />}
            color={PRIMARY}
            bg={PRIMARY_LIGHT}
          />
          <StatCard
            label="Revenue Today"
            value={money(todayStats.revenue)}
            icon={<TrendingUp className="w-5 h-5" />}
            color="#16A34A"
            bg="#F0FDF4"
          />
        </div>

        {/* ── Detail Cards Row ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* User Info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100"
              style={{ backgroundColor: PRIMARY_LIGHT }}>
              <User className="w-4 h-4" style={{ color: PRIMARY }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: PRIMARY }}>User Information</span>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                { label: 'Name',  value: user?.name  || 'N/A' },
                { label: 'Email', value: user?.email || 'N/A' },
                { label: 'Phone', value: user?.phone || 'N/A' },
                { label: 'Role',  value: 'Cashier'            },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between px-6 py-4">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-20 flex-shrink-0">{label}</span>
                  <span className="text-sm font-semibold text-gray-900 text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Shift Details */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100"
              style={{ backgroundColor: PRIMARY_LIGHT }}>
              <Clock className="w-4 h-4" style={{ color: PRIMARY }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: PRIMARY }}>Current Shift</span>
            </div>

            {isActive && shiftStatus?.clockIn ? (
              <div className="divide-y divide-gray-50">
                <div className="flex items-center justify-between px-6 py-4">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</span>
                  <span className="flex items-center gap-1.5 text-sm font-bold text-green-600">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Clocked In
                  </span>
                </div>
                <div className="flex items-center justify-between px-6 py-4">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Clock-in Time</span>
                  <span className="text-sm font-semibold text-gray-900">{fmtTime(shiftStatus.clockIn)}</span>
                </div>
                <div className="flex items-center justify-between px-6 py-4">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Date</span>
                  <span className="text-sm font-semibold text-gray-900">{fmtDate(shiftStatus.clockIn)}</span>
                </div>
                <div className="flex items-center justify-between px-6 py-4">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Duration</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: PRIMARY }}>{liveDuration}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <Clock className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-sm font-semibold text-gray-500">No active shift</p>
                <p className="text-xs text-gray-400 mt-1">Click Clock In to start your shift</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Shift History ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100"
            style={{ backgroundColor: PRIMARY_LIGHT }}>
            <Calendar className="w-4 h-4" style={{ color: PRIMARY }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: PRIMARY }}>Shift History</span>
            <span className="ml-auto text-xs text-gray-400">Last {shiftHistory.length} shifts</span>
          </div>

          {shiftHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-400">No shift history yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">Clock In</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">Clock Out</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {shiftHistory.map(shift => {
                    const clockOut = shift.clockOut ? new Date(shift.clockOut) : null;
                    const isOngoing = !clockOut;
                    return (
                      <tr key={shift.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          {fmtDate(shift.clockIn)}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {fmtTime(shift.clockIn)}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {clockOut ? fmtTime(shift.clockOut) : (
                            <span className="flex items-center gap-1.5 text-green-600 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                              Now
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          {isOngoing ? (
                            <span style={{ color: PRIMARY }}>{fmtDuration(shift.clockIn, null)}</span>
                          ) : (
                            fmtDuration(shift.clockIn, shift.clockOut)
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {isOngoing ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                              <CheckCircle className="w-3 h-3" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                              {shift.status || 'Completed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default CashierProfile;
