import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, Users, Clock, BarChart3, AlertCircle,
  Flame, Armchair, UtensilsCrossed, CreditCard, Banknote,
  Smartphone, Package, ShoppingBag, Truck, RefreshCw,
  ChefHat, ConciergeBell, UserCheck,
} from 'lucide-react';
import { reportsAPI, shiftsAPI } from '../../api/client';
import { money } from '../../hooks/useApi';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';

const P = '#7C3AED';

const ROLE_COLORS = {
  waitress: { bg: 'bg-green-100', text: 'text-green-600' },
  kitchen:  { bg: 'bg-orange-100', text: 'text-orange-600' },
  cashier:  { bg: 'bg-blue-100', text: 'text-blue-600' },
  admin:    { bg: 'bg-purple-100', text: 'text-purple-600' },
  owner:    { bg: 'bg-purple-100', text: 'text-purple-600' },
};

export default function OwnerHome() {
  const { t } = useTranslation();
  const { restaurant } = useAuth();
  const [summary, setSummary] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getGreeting = useCallback(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('greeting.morning');
    if (hour < 17) return t('greeting.afternoon');
    return t('greeting.evening');
  }, [t]);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [sumData, staffData, dashData] = await Promise.all([
        reportsAPI.getAdminDailySummary(),
        shiftsAPI.getStaffStatus(),
        reportsAPI.getDashboard(),
      ]);
      setSummary(sumData?.data || sumData);
      setStaffList(
        Array.isArray(staffData?.data) ? staffData.data :
        Array.isArray(staffData) ? staffData : []
      );
      setDash(dashData?.data || dashData);
      setError(null);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(() => fetchData(true), 1000);
    return () => clearInterval(t);
  }, [fetchData]);

  // -- derived data --
  const inflow = useMemo(() => {
    const rows = summary?.financialFlow?.inflow || [];
    let cash = 0, card = 0, online = 0;
    rows.forEach(r => {
      const m = (r.paymentMethod || r.payment_method || 'cash').toLowerCase();
      const a = parseFloat(r.amount || 0);
      if (m === 'cash') cash += a;
      else if (m === 'card') card += a;
      else online += a;
    });
    const total = cash + card + online;
    return { cash, card, online, total };
  }, [summary]);

  const outflow = summary?.financialFlow?.outflow || 0;
  const totalSales = summary?.salesOverview || 0;
  const netProfit = totalSales - outflow;

  const activeOrders = summary?.currentOrders || [];
  const totalActive = summary?.totalActiveOrders || dash?.activeOrders || dash?.active_orders || 0;
  const freeTables = dash?.freeTables || dash?.free_tables || 0;
  const totalTables = dash?.totalTables || dash?.total_tables || 0;
  const openTables = dash?.openTables || dash?.open_tables || 0;

  const todaySold = (summary?.goodsSold || []).slice(0, 5);
  const trendHours = summary?.charts?.dailySalesTrend || [];
  const maxTrend = useMemo(
    () => Math.max(...trendHours.map(h => parseFloat(h.sales || 0)), 1),
    [trendHours]
  );

  const staffOnDuty = staffList.filter(s => (s.clockIn || s.clock_in) && !(s.clockOut || s.clock_out));

  const warehouse = summary?.warehouse || {};

  const fmtTime = (iso) => {
    if (!iso) return '--';
    return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  };

  // -- loading / error --
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg m-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-700">Error: {error}</p>
        </div>
        <button
          onClick={() => fetchData()}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const todayOrders = dash?.todayOrders || dash?.today_orders || 0;

  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* ── Purple Header ── */}
      <div className="relative overflow-hidden" style={{ backgroundColor: P }}>
        {/* Decorative circles */}
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
        <div className="absolute bottom-0 -left-8 w-32 h-32 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />

        <div className="relative z-10 px-8 pt-8 pb-20">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-white/60 text-sm mb-1">{getGreeting()}</p>
                <h1 className="text-white text-3xl font-extrabold">{restaurant?.name || 'The Bill'}</h1>
                <p className="text-white/50 text-sm mt-1">
                  {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <button
                onClick={() => fetchData()}
                className="p-2 rounded-full hover:bg-white/10 transition"
                title={t('common.refresh')}
              >
                <RefreshCw className="w-5 h-5 text-white/70" />
              </button>
            </div>

            {/* Revenue Card */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <p className="text-white/60 text-xs font-semibold mb-2">{t('owner.home.todaysRevenue')}</p>
              <p className="text-white text-4xl font-extrabold mb-4">{money(totalSales)}</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white/80" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
                  <ShoppingBag className="w-3 h-3" />
                  {todayOrders} {t('common.items')}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white/80" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
                  <TrendingUp className="w-3 h-3" />
                  {netProfit >= 0 ? '+' : ''}{money(netProfit)} {t('common.net')}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white/80" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
                  <Banknote className="w-3 h-3" />
                  {money(outflow)} {t('admin.dashboard.outflow')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-8 -mt-14 relative z-10 pb-8">
        {/* Snapshot Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SnapshotCard
            icon={<Flame className="w-5 h-5 text-orange-500" />}
            value={totalActive}
            label={t('common.active').toUpperCase()}
            borderColor="#F97316"
          />
          <SnapshotCard
            icon={<Armchair className="w-5 h-5 text-green-600" />}
            value={`${freeTables}/${totalTables}`}
            label={t('statuses.free').toUpperCase() + ' ' + t('nav.tables').toUpperCase()}
            borderColor="#16A34A"
          />
          <SnapshotCard
            icon={<UtensilsCrossed className="w-5 h-5 text-blue-600" />}
            value={openTables}
            label={t('statuses.occupied').toUpperCase()}
            borderColor="#2563EB"
          />
          <SnapshotCard
            icon={<Users className="w-5 h-5" style={{ color: P }} />}
            value={staffOnDuty.length}
            label={t('owner.staff.onShift').toUpperCase()}
            borderColor={P}
          />
        </div>

        {/* Payment Breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <SectionHeader icon={<CreditCard className="w-4 h-4" style={{ color: P }} />} title={t('owner.home.paymentBreakdown')} badge={t('common.today')} />
          <div className="space-y-4">
            <PaymentRow label={t('paymentMethods.cash')} icon={<Banknote className="w-4 h-4 text-emerald-500" />} color="#10B981" value={inflow.cash} total={inflow.total} />
            <PaymentRow label={t('paymentMethods.card')} icon={<CreditCard className="w-4 h-4 text-blue-600" />} color="#2563EB" value={inflow.card} total={inflow.total} />
            <PaymentRow label={t('paymentMethods.online')} icon={<Smartphone className="w-4 h-4" style={{ color: P }} />} color={P} value={inflow.online} total={inflow.total} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Active Orders by Type */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <SectionHeader icon={<ShoppingBag className="w-4 h-4" style={{ color: P }} />} title={t('owner.home.activeOrdersByType')} />
            {activeOrders.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {activeOrders.map(o => {
                  const iconMap = {
                    dine_in: <ConciergeBell className="w-6 h-6" />,
                    dineIn: <ConciergeBell className="w-6 h-6" />,
                    takeaway: <ShoppingBag className="w-6 h-6" />,
                    delivery: <Truck className="w-6 h-6" />,
                  };
                  const orderIcon = iconMap[o.id] || <ShoppingBag className="w-6 h-6" />;
                  return (
                    <div key={o.id} className="bg-gray-50 rounded-xl py-4 flex flex-col items-center gap-2">
                      <span className={o.count > 0 ? 'text-purple-600' : 'text-gray-300'}>
                        {orderIcon}
                      </span>
                      <span className={`text-2xl font-extrabold ${o.count > 0 ? 'text-purple-600' : 'text-gray-400'}`}>
                        {o.count}
                      </span>
                      <span className="text-xs text-gray-500 font-semibold text-center">{o.name}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400">
                <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">{t('admin.orders.noOrdersFound')}</p>
              </div>
            )}
          </div>

          {/* Today's Top Items */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <SectionHeader icon={<ChefHat className="w-4 h-4" style={{ color: P }} />} title={t('owner.home.todayTopItems')} badge={t('common.today')} />
            {todaySold.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">{t('owner.sales.noSalesData')}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {todaySold.map((item, i) => (
                  <div key={item.name} className="flex items-center gap-3 py-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-extrabold"
                      style={{
                        backgroundColor: i < 3 ? P : '#F5F3FF',
                        color: i < 3 ? '#fff' : P,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                      {item.category && (
                        <p className="text-xs text-gray-400">{item.category}</p>
                      )}
                    </div>
                    <span
                      className="text-sm font-extrabold px-3 py-1 rounded-lg"
                      style={{ backgroundColor: '#F5F3FF', color: P }}
                    >
                      x{item.quantity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sales Trend */}
        {trendHours.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <SectionHeader icon={<BarChart3 className="w-4 h-4" style={{ color: P }} />} title={t('owner.home.salesTrend')} badge={t('common.today')} />
            <div className="flex items-end gap-1 h-24 mb-2">
              {trendHours.map((h, i) => {
                const pct = (parseFloat(h.sales || 0) / maxTrend) * 100;
                const active = pct > 60;
                return (
                  <div key={h.time || i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-gray-100 rounded-sm overflow-hidden relative" style={{ height: '80px' }}>
                      <div
                        className="absolute bottom-0 w-full rounded-sm transition-all"
                        style={{
                          height: `${Math.max(pct, 4)}%`,
                          backgroundColor: active ? P : '#C4B5FD',
                        }}
                      />
                    </div>
                    <span className="text-[8px] text-gray-400 font-medium">
                      {(h.time || '').replace(':00', '')}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 text-right">Peak: {money(maxTrend)}</p>
          </div>
        )}

        {/* Warehouse Today */}
        {(warehouse.goodsConsumed > 0 || warehouse.goodsArrived > 0) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <SectionHeader icon={<Package className="w-4 h-4" style={{ color: P }} />} title={t('owner.home.warehouseToday')} />
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-amber-500 rotate-180" />
                </div>
                <p className="text-sm font-extrabold text-gray-900">{money(warehouse.goodsConsumed)}</p>
                <p className="text-[10px] text-gray-400 font-semibold uppercase">{t('admin.dashboard.goodsConsumed')}</p>
              </div>
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </div>
                <p className="text-sm font-extrabold text-gray-900">{money(warehouse.goodsArrived)}</p>
                <p className="text-[10px] text-gray-400 font-semibold uppercase">{t('admin.dashboard.goodsArrived')}</p>
              </div>
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center">
                  <Package className="w-4 h-4 text-purple-600" />
                </div>
                <p className="text-sm font-extrabold text-gray-900">{money(warehouse.currentStatus?.totalValue || 0)}</p>
                <p className="text-[10px] text-gray-400 font-semibold uppercase">{t('admin.dashboard.totalStockValue')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Staff Status */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <SectionHeader
            icon={<UserCheck className="w-4 h-4" style={{ color: P }} />}
            title={t('owner.home.staffStatus')}
            badge={`${staffOnDuty.length} ${t('owner.staff.onShift').toLowerCase()}`}
          />
          {staffList.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">{t('admin.dashboard.noStaffOnShift')}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {staffList.map((s) => {
                const role = (s.role || '').toLowerCase();
                const rc = ROLE_COLORS[role] || { bg: 'bg-gray-100', text: 'text-gray-600' };
                const isOn = !!(s.clockIn || s.clock_in) && !(s.clockOut || s.clock_out);
                const hoursWorked = parseFloat(s.hoursWorked || s.hours_worked || 0).toFixed(1);
                const clockInTime = fmtTime(s.clockIn || s.clock_in);

                return (
                  <div key={String(s.userId || s.user_id || s.id)} className="flex items-center gap-3 py-3">
                    <div className={`w-10 h-10 rounded-full ${rc.bg} flex items-center justify-center flex-shrink-0`}>
                      <span className={`font-extrabold text-sm ${rc.text}`}>
                        {(s.name || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{s.role}</p>
                    </div>
                    {isOn ? (
                      <div className="flex items-center gap-1.5 bg-green-50 px-3 py-1.5 rounded-xl">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs text-green-600 font-semibold">
                          {hoursWorked}h · since {clockInTime}
                        </span>
                      </div>
                    ) : (
                      <div className="bg-gray-100 px-3 py-1.5 rounded-xl">
                        <span className="text-xs text-gray-400 font-semibold">{t('superAdmin.filterInactive')}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Navigation */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <SectionHeader icon={<BarChart3 className="w-4 h-4" style={{ color: P }} />} title={t('owner.home.quickMenu')} />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <QuickLink to="/owner/sales" icon={<BarChart3 className="w-5 h-5" />} label={t('owner.home.salesAnalytics')} />
            <QuickLink to="/owner/staff" icon={<Users className="w-5 h-5" />} label={t('owner.home.staffManagement')} />
            <QuickLink to="/owner/inventory" icon={<Package className="w-5 h-5" />} label={t('owner.home.inventoryLink')} />
            <QuickLink to="/owner/finance" icon={<DollarSignIcon className="w-5 h-5" />} label={t('owner.home.financeLink')} />
            <QuickLink to="/owner/profile" icon={<Clock className="w-5 h-5" />} label={t('common.settings')} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function SectionHeader({ icon, title, badge }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#F5F3FF' }}>
        {icon}
      </div>
      <h2 className="text-sm font-extrabold text-gray-900 flex-1">{title}</h2>
      {badge && (
        <span
          className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white"
          style={{ backgroundColor: P }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function SnapshotCard({ icon, value, label, borderColor }) {
  return (
    <div
      className="bg-white rounded-xl shadow-sm p-4 flex flex-col items-center gap-1"
      style={{ borderTop: `3px solid ${borderColor}` }}
    >
      {icon}
      <span className="text-xl font-extrabold text-gray-900 mt-1">{value}</span>
      <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{label}</span>
    </div>
  );
}

function PaymentRow({ label, icon, color, value, total }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color + '18' }}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm font-semibold text-gray-700 flex-1">{label}</span>
          <span className="text-sm font-bold text-gray-900">{money(value)}</span>
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-md"
            style={{ backgroundColor: '#F5F3FF', color: P }}
          >
            {pct > 0 ? pct.toFixed(0) : 0}%
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

function QuickLink({ to, icon, label }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-purple-50 transition text-gray-600 hover:text-purple-600"
    >
      {icon}
      <span className="text-xs font-semibold text-center">{label}</span>
    </Link>
  );
}

function DollarSignIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
