import { useState, useEffect, useCallback } from 'react';
import { User, TrendingUp, AlertCircle, Loader2, ShoppingBag, Calendar } from 'lucide-react';
import { reportsAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { money } from '../../hooks/useApi';
import { useTranslation } from '../../context/LanguageContext';

const PRIMARY       = '#0891B2';
const PRIMARY_DARK  = '#0E7490';
const PRIMARY_LIGHT = '#E0F2FE';

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
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
  const { t } = useTranslation();
  const { user } = useAuth();
  const [todayStats, setTodayStats]     = useState({ orders: 0, revenue: 0 });
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: PRIMARY_LIGHT }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: PRIMARY }} />
          </div>
          <p className="text-gray-500 font-medium">{t('common.loading')}</p>
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
              style={{ backgroundColor: '#22C55E' }}
            />
          </div>

          {/* Name / role */}
          <div className="text-center md:text-left flex-1">
            <h1 className="text-2xl font-bold text-white">{user?.name || t('roles.cashier', 'Cashier')}</h1>
            <p className="text-sm text-white/70 mt-0.5">{user?.email || ''}</p>
            <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff' }}>
              <User className="w-3 h-3" />
              {t('roles.cashier')}
            </div>
          </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            label={t('cashier.profile.ordersToday')}
            value={todayStats.orders}
            icon={<ShoppingBag className="w-5 h-5" />}
            color={PRIMARY}
            bg={PRIMARY_LIGHT}
          />
          <StatCard
            label={t('cashier.profile.revenueToday')}
            value={money(todayStats.revenue)}
            icon={<TrendingUp className="w-5 h-5" />}
            color="#16A34A"
            bg="#F0FDF4"
          />
        </div>

        {/* ── User Info Card ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100"
            style={{ backgroundColor: PRIMARY_LIGHT }}>
            <User className="w-4 h-4" style={{ color: PRIMARY }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: PRIMARY }}>{t('common.details')}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              { label: t('common.name'),  value: user?.name  || t('common.na', 'N/A') },
              { label: t('common.email'), value: user?.email || t('common.na', 'N/A') },
              { label: t('common.phone'), value: user?.phone || t('common.na', 'N/A') },
              { label: t('common.role'),  value: t('roles.cashier')   },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-6 py-4">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-20 flex-shrink-0">{label}</span>
                <span className="text-sm font-semibold text-gray-900 text-right">{value}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default CashierProfile;
