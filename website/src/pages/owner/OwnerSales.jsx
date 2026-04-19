import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Award, AlertCircle, BarChart3,
  ShoppingBag, Truck, ConciergeBell, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { reportsAPI, accountingAPI } from '../../api/client';
import { money, todayStr } from '../../hooks/useApi';
import DatePicker from '../../components/DatePicker';
import { useTranslation } from '../../context/LanguageContext';

const P = '#7C3AED';
const PL = '#F5F3FF';

const now = new Date();
const DEFAULT_FROM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

const ORDER_TYPE_LABELS = {
  dine_in: 'Dine-in', dineIn: 'Dine-in',
  takeaway: 'Takeaway', take_away: 'Takeaway',
  delivery: 'Delivery',
};
const ORDER_TYPE_COLORS = {
  dine_in: '#7C3AED', dineIn: '#7C3AED',
  takeaway: '#F59E0B', take_away: '#F59E0B',
  delivery: '#10B981',
};
const ORDER_TYPE_ICONS = {
  dine_in: ConciergeBell, dineIn: ConciergeBell,
  takeaway: ShoppingBag, take_away: ShoppingBag,
  delivery: Truck,
};

export default function OwnerSales() {
  const { t } = useTranslation();
  const [fromDate, setFromDate] = useState(DEFAULT_FROM);
  const [toDate, setToDate] = useState(todayStr());
  const [sales, setSales] = useState(null);
  const [bestSellers, setBestSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* All analytics now come from the single /sales endpoint */
  const totalRevenue  = sales?.totalRevenue  || sales?.total_revenue  || 0;
  const totalOrders   = sales?.totalOrders   || sales?.total_orders   || 0;
  const avgOrder      = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const cashRevenue   = sales?.cashRevenue   || sales?.cash_revenue   || 0;
  const cardRevenue   = sales?.cardRevenue   || sales?.card_revenue   || 0;
  const onlineRevenue = sales?.onlineRevenue || sales?.online_revenue || 0;
  const totalPayments = cashRevenue + cardRevenue + onlineRevenue;

  const dailyTrend  = useMemo(() => sales?.dailyTrend  || sales?.daily_trend  || [], [sales]);
  const hourlyData  = useMemo(() => sales?.hourly  || [], [sales]);
  const orderTypes  = useMemo(() => sales?.byType  || sales?.by_type  || [], [sales]);
  const comparison  = useMemo(() => sales?.comparison || null, [sales]);

  const maxRevenue = useMemo(
    () => bestSellers.length > 0
      ? Math.max(...bestSellers.map(i => i.totalRevenue || i.total_revenue || i.revenue || 0))
      : 0,
    [bestSellers]
  );

  const maxDailyRevenue = useMemo(
    () => dailyTrend.length > 0 ? Math.max(...dailyTrend.map(d => parseFloat(d.revenue || 0))) : 0,
    [dailyTrend]
  );

  const maxHourlyRevenue = useMemo(
    () => hourlyData.length > 0 ? Math.max(...hourlyData.map(h => parseFloat(h.revenue || 0))) : 0,
    [hourlyData]
  );

  const totalOrderTypeRevenue = useMemo(
    () => orderTypes.reduce((sum, t) => sum + parseFloat(t.revenue || 0), 0),
    [orderTypes]
  );

  const fetchSalesData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const params = { from: fromDate, to: toDate };
      const [salesData, sellers] = await Promise.all([
        accountingAPI.getSales(params),
        reportsAPI.getBestSellers(params),
      ]);
      setSales(salesData);
      const sellerList = Array.isArray(sellers?.items) ? sellers.items : Array.isArray(sellers) ? sellers : [];
      setBestSellers(sellerList.slice(0, 10));
      setError(null);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchSalesData();
    const t = setInterval(() => fetchSalesData(true), 5000);
    return () => clearInterval(t);
  }, [fetchSalesData]);

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
        <button onClick={() => fetchSalesData()} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">{t('common.retry')}</button>
      </div>
    );
  }

  const changes = comparison?.changes;

  return (
    <div className="h-full overflow-auto bg-gray-50">
      {/* Purple Header */}
      <div className="relative overflow-hidden" style={{ backgroundColor: P }}>
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
        <div className="absolute bottom-0 -left-8 w-32 h-32 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
        <div className="relative z-10 px-8 pt-8 pb-6">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white text-2xl font-extrabold">{t('owner.home.salesAnalytics')}</h1>
              <p className="text-white/50 text-sm">{t('owner.sales.title')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-6">
        {/* Date Range */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 mb-6">
          <div className="flex gap-4 items-end flex-wrap">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">{t('common.from')}</label>
              <DatePicker value={fromDate} onChange={setFromDate} placeholder={t('common.from')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">{t('common.to')}</label>
              <DatePicker value={toDate} onChange={setToDate} placeholder={t('common.to')} />
            </div>
            <button
              onClick={() => { setFromDate(todayStr()); setToDate(todayStr()); }}
              className="px-4 py-2 text-sm font-bold text-white rounded-lg transition" style={{ backgroundColor: P }}
            >
              {t('common.today')}
            </button>
          </div>
        </div>

        {/* ── Comparison KPI Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <ComparisonCard title={t('owner.sales.totalRevenue')} value={money(totalRevenue)} change={changes?.revenuePct || changes?.revenue_pct} color={P} />
          <ComparisonCard title={t('owner.sales.totalOrders')} value={totalOrders} change={changes?.ordersPct || changes?.orders_pct} color="#2563EB" />
          <ComparisonCard title={t('owner.sales.avgOrderValue')} value={money(avgOrder)} change={changes?.avgOrderPct || changes?.avg_order_pct} color="#10B981" />
        </div>

        {/* Previous period label */}
        {comparison?.previous && (
          <p className="text-xs text-gray-400 mb-6 -mt-3">
            {t('owner.sales.vsPrev')} {comparison.previous.period?.from} -- {comparison.previous.period?.to}
          </p>
        )}

        {/* ── Daily Sales Trend ── */}
        {dailyTrend.length > 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <SectionHeader icon={<TrendingUp className="w-4 h-4" style={{ color: P }} />} title={t('owner.sales.dailySalesTrend')} />
            <div className="flex items-end gap-[2px] h-40">
              {dailyTrend.map((d, i) => {
                const rev = parseFloat(d.revenue || 0);
                const pct = maxDailyRevenue > 0 ? (rev / maxDailyRevenue) * 100 : 0;
                const isMax = rev === maxDailyRevenue && rev > 0;
                return (
                  <div key={d.date || i} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                      <div className="bg-gray-800 text-white text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap">
                        {formatShortDate(d.date)}: {money(rev)} ({d.orders || 0} orders)
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-sm overflow-hidden relative" style={{ height: '140px' }}>
                      <div
                        className="absolute bottom-0 w-full rounded-sm transition-all"
                        style={{ height: `${Math.max(pct, 2)}%`, backgroundColor: isMax ? P : '#C4B5FD' }}
                      />
                    </div>
                    {dailyTrend.length <= 15 && (
                      <span className="text-[8px] text-gray-400 font-medium">{formatDayLabel(d.date)}</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-gray-400">{formatShortDate(dailyTrend[0]?.date)}</span>
              <span className="text-[10px] text-gray-400">Peak: {money(maxDailyRevenue)}</span>
              <span className="text-[10px] text-gray-400">{formatShortDate(dailyTrend[dailyTrend.length - 1]?.date)}</span>
            </div>
          </div>
        )}

        {/* ── Hourly Breakdown + Order Type ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Hourly Breakdown */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <SectionHeader icon={<BarChart3 className="w-4 h-4" style={{ color: P }} />} title={t('owner.sales.hourlySales')} badge={t('owner.sales.peakTimes')} />
            {maxHourlyRevenue > 0 ? (
              <>
                <div className="flex items-end gap-[2px] h-32">
                  {hourlyData.map((h, i) => {
                    const rev = parseFloat(h.revenue || 0);
                    const pct = maxHourlyRevenue > 0 ? (rev / maxHourlyRevenue) * 100 : 0;
                    const isPeak = pct > 70 && rev > 0;
                    return (
                      <div key={h.hour ?? i} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                          <div className="bg-gray-800 text-white text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap">
                            {h.label}: {money(rev)} ({h.orders} orders)
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-sm overflow-hidden relative" style={{ height: '110px' }}>
                          <div
                            className="absolute bottom-0 w-full rounded-sm transition-all"
                            style={{ height: `${Math.max(pct, 2)}%`, backgroundColor: isPeak ? P : '#C4B5FD' }}
                          />
                        </div>
                        {(h.hour ?? i) % 3 === 0 && (
                          <span className="text-[8px] text-gray-400 font-medium">{h.label || `${h.hour}:00`}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 text-right mt-2">Peak: {money(maxHourlyRevenue)}</p>
              </>
            ) : (
              <div className="text-center py-12 text-gray-400 text-sm">{t('common.noResults')}</div>
            )}
          </div>

          {/* Order Type Donut */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <SectionHeader icon={<ShoppingBag className="w-4 h-4" style={{ color: P }} />} title={t('owner.sales.orderTypes')} />
            {orderTypes.length === 0 || totalOrderTypeRevenue === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">{t('common.noResults')}</div>
            ) : (
              <>
                <div className="flex justify-center mb-4">
                  <DonutChart data={orderTypes} total={totalOrderTypeRevenue} />
                </div>
                <div className="space-y-3">
                  {orderTypes.map((t) => {
                    const type = t.orderType || t.order_type || 'dine_in';
                    const rev = parseFloat(t.revenue || 0);
                    const pct = totalOrderTypeRevenue > 0 ? (rev / totalOrderTypeRevenue * 100).toFixed(0) : 0;
                    const color = ORDER_TYPE_COLORS[type] || '#9CA3AF';
                    const IconComp = ORDER_TYPE_ICONS[type] || ShoppingBag;
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <IconComp className="w-4 h-4 flex-shrink-0" style={{ color }} />
                        <span className="text-sm font-semibold text-gray-700 flex-1">{ORDER_TYPE_LABELS[type] || type}</span>
                        <span className="text-sm font-bold text-gray-900">{pct}%</span>
                        <span className="text-xs text-gray-400">{t.orders || 0}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Payment Methods + Best Sellers ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('cashier.orders.paymentMethod')}</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-5">
              <PaymentMethodRow label={t('paymentMethods.cash')} value={cashRevenue} total={totalPayments} />
              <PaymentMethodRow label={t('paymentMethods.card')} value={cardRevenue} total={totalPayments} />
              <PaymentMethodRow label={t('paymentMethods.online')} value={onlineRevenue} total={totalPayments} />
            </div>
          </div>

          <div className="lg:col-span-2">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('owner.sales.bestSellers')}</h2>
            {bestSellers.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                <p className="text-gray-400 text-sm">{t('owner.sales.noSalesData')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bestSellers.map((item, idx) => {
                  const itemRevenue = item.totalRevenue || item.total_revenue || item.revenue || 0;
                  const itemSold = item.totalSold || item.total_sold || item.qtySold || item.qty_sold || 0;
                  const barWidth = maxRevenue > 0 ? (itemRevenue / maxRevenue) * 100 : 0;
                  return (
                    <div key={item.name || idx} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-3 hover:shadow-md transition">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                        style={{ backgroundColor: idx < 3 ? P : PL, color: idx < 3 ? '#fff' : P }}
                      >
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{item.itemName || item.name}</p>
                        <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded mt-1" style={{ backgroundColor: PL, color: P }}>
                          {itemSold} {t('common.items')}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold mb-1" style={{ color: P }}>{money(itemRevenue)}</p>
                        <div className="w-24 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-1 rounded-full" style={{ backgroundColor: P, width: `${Math.max(barWidth, 3)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: PL }}>
        {icon}
      </div>
      <h2 className="text-sm font-extrabold text-gray-900 flex-1">{title}</h2>
      {badge && (
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: P }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function ComparisonCard({ title, value, change, color }) {
  const { t } = useTranslation();
  const isPositive = (change || 0) >= 0;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition">
      <p className="text-xs font-semibold text-gray-400 mb-2">{title}</p>
      <p className="text-3xl font-extrabold mb-2" style={{ color }}>{value}</p>
      {change !== undefined && change !== null && (
        <div className={`flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
          {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
          <span className="text-sm font-bold">{isPositive ? '+' : ''}{change}%</span>
          <span className="text-xs text-gray-400 ml-1">{t('owner.sales.vsPrev')}</span>
        </div>
      )}
    </div>
  );
}

function PaymentMethodRow({ label, value, total }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
      <p className="text-sm font-bold text-gray-900 mb-1">{money(value)}</p>
      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-md mb-2" style={{ backgroundColor: PL, color: P }}>
        {pct > 0 ? pct.toFixed(0) : 0}%
      </span>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: PL }}>
        <div className="h-1.5 rounded-full transition-all" style={{ backgroundColor: P, width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DonutChart({ data, total }) {
  const { t } = useTranslation();
  const size = 140;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#F3F4F6" strokeWidth={strokeWidth} />
      {data.map((t) => {
        const type = t.orderType || t.order_type || 'dine_in';
        const rev = parseFloat(t.revenue || 0);
        const pct = total > 0 ? rev / total : 0;
        const dashLength = pct * circumference;
        const offset = -accumulated * circumference + circumference * 0.25;
        accumulated += pct;
        const color = ORDER_TYPE_COLORS[type] || '#9CA3AF';
        return (
          <circle key={type} cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={`${dashLength} ${circumference - dashLength}`}
            strokeDashoffset={offset} strokeLinecap="round"
          />
        );
      })}
      <text x={size / 2} y={size / 2 - 6} textAnchor="middle" className="text-xs font-bold fill-gray-400">{t('common.total')}</text>
      <text x={size / 2} y={size / 2 + 10} textAnchor="middle" className="text-sm font-extrabold fill-gray-900">
        {data.reduce((s, t) => s + (parseInt(t.orders) || 0), 0)}
      </text>
    </svg>
  );
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatDayLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.getDate();
}
