import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, ScrollView, FlatList, Pressable,
  StyleSheet, RefreshControl, ActivityIndicator, Dimensions,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { reportsAPI, accountingAPI } from '../../api/client';
import { OwnerPeriodBar, OwnerCalendarPicker, TODAY_STR } from '../../components/OwnerPeriodPicker';
import OwnerPageHeader from '../../components/OwnerPageHeader';

const P  = '#7C3AED';
const PL = '#F5F3FF';

const money = (v) => {
  const n = Math.round(Number(v) || 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
};

const _now = new Date();
const DEFAULT_PERIOD = {
  from: `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-01`,
  to: TODAY_STR,
};

const ORDER_TYPE_LABELS = { dine_in: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery' };
const ORDER_TYPE_COLORS = { dine_in: '#7C3AED', takeaway: '#F59E0B', delivery: '#10B981' };
const ORDER_TYPE_ICONS  = { dine_in: 'restaurant', takeaway: 'shopping-bag', delivery: 'local-shipping' };

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export default function OwnerSales() {
  const [period, setPeriod]         = useState(DEFAULT_PERIOD);
  const [showPicker, setShowPicker] = useState(false);
  const [sales, setSales]           = useState(null);
  const [bestSellers, setBestSellers] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);

  /* All analytics come from the single /sales endpoint (via res.data) */
  const totalRevenue  = sales?.total_revenue  || 0;
  const totalOrders   = sales?.total_orders   || 0;
  const avgOrder      = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const cashRevenue   = sales?.cash_revenue   || 0;
  const cardRevenue   = sales?.card_revenue   || 0;
  const onlineRevenue = sales?.online_revenue || 0;
  const totalPayments = cashRevenue + cardRevenue + onlineRevenue;

  const dailyTrend  = useMemo(() => sales?.daily_trend || [], [sales]);
  const hourlyData  = useMemo(() => sales?.hourly      || [], [sales]);
  const orderTypes  = useMemo(() => sales?.by_type     || [], [sales]);
  const comparison  = useMemo(() => sales?.comparison   || null, [sales]);
  const changes     = comparison?.changes;

  const maxRevenue = useMemo(
    () => bestSellers.length > 0 ? Math.max(...bestSellers.map(i => i.total_revenue || 0)) : 0,
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

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setError(null);
      const params = { from: period.from, to: period.to };
      const [sRes, bRes] = await Promise.all([
        accountingAPI.getSales(params),
        reportsAPI.getBestSellers(params),
      ]);
      setSales(sRes.data);
      const sellers = bRes.data;
      setBestSellers(
        Array.isArray(sellers?.items) ? sellers.items.slice(0, 10)
        : Array.isArray(sellers) ? sellers.slice(0, 10)
        : []
      );
      if (!silent) setError(null);
    } catch (err) {
      if (!silent) setError(err.message || 'Failed to load sales data');
    } finally {
      if (!silent) { setLoading(false); setRefreshing(false); }
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(() => fetchData(true), 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={P} /></View>;
  }
  if (error) {
    return (
      <View style={s.center}>
        <MaterialIcons name="error-outline" size={48} color={P} />
        <Text style={s.errorText}>{error}</Text>
        <Pressable style={[s.retryBtn, { backgroundColor: P }]} onPress={fetchData}>
          <Text style={s.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <OwnerPageHeader icon="bar-chart" title="Sales Analytics" subtitle="Revenue & performance" />
      <OwnerPeriodBar period={period} onOpen={() => setShowPicker(true)} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── KPI Cards ── */}
        <KPICard title="Total Revenue" value={money(totalRevenue)} change={changes?.revenue_pct} color={P} icon="trending-up" />
        <View style={s.kpiRow}>
          <KPICardSmall title="Total Orders" value={String(totalOrders)} change={changes?.orders_pct} color="#2563EB" icon="receipt" />
          <KPICardSmall title="Avg Order" value={money(avgOrder)} change={changes?.avg_order_pct} color="#10B981" icon="equalizer" />
        </View>
        {comparison?.previous && (
          <Text style={s.prevLabel}>vs {formatShortDate(comparison.previous.period?.from)} - {formatShortDate(comparison.previous.period?.to)}</Text>
        )}

        {/* ── Daily Sales Trend ── */}
        {dailyTrend.length > 1 && (
          <View style={s.card}>
            <SecHeader icon="show-chart" title="Daily Sales Trend" />
            <View style={s.barsH}>
              {dailyTrend.map((d, i) => {
                const rev = parseFloat(d.revenue || 0);
                const pct = maxDailyRevenue > 0 ? (rev / maxDailyRevenue) * 100 : 0;
                const isMax = rev === maxDailyRevenue && rev > 0;
                return (
                  <View key={d.date || i} style={{ flex: 1, alignItems: 'center' }}>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { height: `${Math.max(pct, 2)}%`, backgroundColor: isMax ? P : '#C4B5FD' }]} />
                    </View>
                    {dailyTrend.length <= 15 && <Text style={s.barLbl}>{new Date(d.date).getDate()}</Text>}
                  </View>
                );
              })}
            </View>
            <View style={s.barFooter}>
              <Text style={s.footTxt}>{formatShortDate(dailyTrend[0]?.date)}</Text>
              <Text style={s.footTxt}>Peak: {money(maxDailyRevenue)}</Text>
              <Text style={s.footTxt}>{formatShortDate(dailyTrend[dailyTrend.length - 1]?.date)}</Text>
            </View>
          </View>
        )}

        {/* ── Hourly Breakdown ── */}
        {maxHourlyRevenue > 0 && (
          <View style={s.card}>
            <SecHeader icon="schedule" title="Hourly Sales" badge="Peak Times" />
            <View style={s.barsSm}>
              {hourlyData.map((h, i) => {
                const rev = parseFloat(h.revenue || 0);
                const pct = maxHourlyRevenue > 0 ? (rev / maxHourlyRevenue) * 100 : 0;
                const isPeak = pct > 70 && rev > 0;
                return (
                  <View key={h.hour ?? i} style={{ flex: 1, alignItems: 'center' }}>
                    <View style={s.barTrackSm}>
                      <View style={[s.barFill, { height: `${Math.max(pct, 2)}%`, backgroundColor: isPeak ? P : '#C4B5FD' }]} />
                    </View>
                    {(h.hour ?? i) % 4 === 0 && <Text style={s.barLbl}>{h.label || `${h.hour}:00`}</Text>}
                  </View>
                );
              })}
            </View>
            <Text style={s.peakTxt}>Peak: {money(maxHourlyRevenue)}</Text>
          </View>
        )}

        {/* ── Order Type Breakdown ── */}
        {totalOrderTypeRevenue > 0 && (
          <View style={s.card}>
            <SecHeader icon="pie-chart" title="Order Types" />
            <View style={s.otContent}>
              <View style={s.donutWrap}>
                <DonutChart data={orderTypes} total={totalOrderTypeRevenue} />
              </View>
              <View style={s.legendWrap}>
                {orderTypes.map((t) => {
                  const type = t.order_type || 'dine_in';
                  const rev = parseFloat(t.revenue || 0);
                  const pct = totalOrderTypeRevenue > 0 ? (rev / totalOrderTypeRevenue * 100).toFixed(0) : 0;
                  const color = ORDER_TYPE_COLORS[type] || '#9CA3AF';
                  return (
                    <View key={type} style={s.legendRow}>
                      <View style={[s.legendDot, { backgroundColor: color }]} />
                      <MaterialIcons name={ORDER_TYPE_ICONS[type] || 'shopping-bag'} size={16} color={color} />
                      <Text style={s.legendLabel}>{ORDER_TYPE_LABELS[type] || type}</Text>
                      <Text style={s.legendPct}>{pct}%</Text>
                      <Text style={s.legendOrders}>{t.orders || 0}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* ── Payment Methods ── */}
        <View style={s.card}>
          <SecHeader icon="account-balance-wallet" title="Payment Methods" />
          <PMRow method="Cash"   value={cashRevenue}   total={totalPayments} />
          <PMRow method="Card"   value={cardRevenue}   total={totalPayments} />
          <PMRow method="Online" value={onlineRevenue} total={totalPayments} />
        </View>

        {/* ── Best Sellers ── */}
        <View style={s.sectionWrap}>
          <SecHeader icon="emoji-events" title="Best Sellers" />
          {bestSellers.length === 0 ? (
            <View style={s.emptyCard}>
              <MaterialIcons name="bar-chart" size={40} color="#E5E7EB" />
              <Text style={s.emptyText}>No sales data</Text>
            </View>
          ) : (
            bestSellers.map((item, idx) => (
              <BSRow key={item.name || idx} item={item} idx={idx} maxRevenue={maxRevenue} />
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <OwnerCalendarPicker visible={showPicker} onClose={() => setShowPicker(false)} period={period} onChange={setPeriod} />
    </View>
  );
}

/* ═══════════════ Sub-components ═══════════════ */

const SecHeader = memo(({ icon, title, badge }) => (
  <View style={s.secHdr}>
    <View style={s.secIcon}><MaterialIcons name={icon} size={16} color={P} /></View>
    <Text style={s.secTitle}>{title}</Text>
    {badge && <View style={s.badge}><Text style={s.badgeTxt}>{badge}</Text></View>}
  </View>
));

const KPICard = memo(({ title, value, change, color, icon }) => {
  const pos = (change || 0) >= 0;
  return (
    <View style={s.kpi}>
      <View style={s.kpiHdr}>
        <Text style={s.kpiLabel}>{title}</Text>
        <View style={[s.kpiIconBg, { backgroundColor: color + '15' }]}>
          <MaterialIcons name={icon} size={18} color={color} />
        </View>
      </View>
      <Text style={[s.kpiVal, { color }]}>{value}</Text>
      {change != null && (
        <View style={s.chgRow}>
          <MaterialIcons name={pos ? 'arrow-upward' : 'arrow-downward'} size={14} color={pos ? '#16A34A' : '#EF4444'} />
          <Text style={[s.chgTxt, { color: pos ? '#16A34A' : '#EF4444' }]}>{pos ? '+' : ''}{typeof change === 'number' ? change.toFixed(1) : change}%</Text>
          <Text style={s.chgSub}>vs prev</Text>
        </View>
      )}
    </View>
  );
});

const KPICardSmall = memo(({ title, value, change, color, icon }) => {
  const pos = (change || 0) >= 0;
  return (
    <View style={s.kpiSm}>
      <View style={s.kpiHdr}>
        <Text style={s.kpiLabel}>{title}</Text>
        <View style={[s.kpiIconBgSm, { backgroundColor: color + '15' }]}>
          <MaterialIcons name={icon} size={14} color={color} />
        </View>
      </View>
      <Text style={[s.kpiSmVal, { color }]}>{value}</Text>
      {change != null && (
        <View style={s.chgRow}>
          <MaterialIcons name={pos ? 'arrow-upward' : 'arrow-downward'} size={12} color={pos ? '#16A34A' : '#EF4444'} />
          <Text style={[s.chgTxtSm, { color: pos ? '#16A34A' : '#EF4444' }]}>{pos ? '+' : ''}{typeof change === 'number' ? change.toFixed(1) : change}%</Text>
        </View>
      )}
    </View>
  );
});

const PMRow = memo(({ method, value, total }) => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <View style={s.pmRow}>
      <Text style={s.pmLabel}>{method}</Text>
      <Text style={s.pmValue}>{money(value)}</Text>
      <View style={s.pmPctBg}><Text style={s.pmPctTxt}>{pct > 0 ? pct.toFixed(0) : 0}%</Text></View>
      <View style={s.pmBarBg}><View style={[s.pmBarFill, { width: `${pct}%` }]} /></View>
    </View>
  );
});

const BSRow = memo(({ item, idx, maxRevenue }) => {
  const rev = item.total_revenue || 0;
  return (
    <View style={s.bsRow}>
      <View style={[s.bsRank, { backgroundColor: idx < 3 ? P : PL }]}>
        <Text style={[s.bsRankTxt, { color: idx < 3 ? '#fff' : P }]}>{idx + 1}</Text>
      </View>
      <View style={s.bsInfo}>
        <Text style={s.bsName}>{item.name}</Text>
        <View style={s.bsChip}><Text style={s.bsChipTxt}>{item.total_sold} sold</Text></View>
      </View>
      <View style={s.bsRight}>
        <Text style={s.bsRev}>{money(rev)}</Text>
        <View style={[s.bsBar, { width: maxRevenue > 0 ? `${(rev / maxRevenue) * 100}%` : '0%' }]} />
      </View>
    </View>
  );
});

const DonutChart = memo(({ data, total }) => {
  const sz = 120, sw = 20, r = (sz - sw) / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  const totalOrds = data.reduce((s, t) => s + (parseInt(t.orders) || 0), 0);
  return (
    <Svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
      <Circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={sw} />
      {data.map(t => {
        const type = t.order_type || 'dine_in';
        const pct = total > 0 ? parseFloat(t.revenue || 0) / total : 0;
        const dash = pct * circ;
        const off = -acc * circ + circ * 0.25;
        acc += pct;
        return <Circle key={type} cx={sz/2} cy={sz/2} r={r} fill="none" stroke={ORDER_TYPE_COLORS[type] || '#9CA3AF'} strokeWidth={sw} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={off} strokeLinecap="round" />;
      })}
      <SvgText x={sz/2} y={sz/2 - 4} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontWeight="600">Total</SvgText>
      <SvgText x={sz/2} y={sz/2 + 12} textAnchor="middle" fill="#1F2937" fontSize={16} fontWeight="bold">{totalOrds}</SvgText>
    </Svg>
  );
});

/* ═══════════════ Styles ═══════════════ */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  scroll:    { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },

  errorText:   { fontSize: 16, color: '#1F2937', marginTop: 16, marginBottom: 16 },
  retryBtn:    { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryBtnText:{ color: '#fff', fontWeight: '600', fontSize: 14 },

  // KPI
  kpi:        { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 10, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },
  kpiHdr:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  kpiLabel:   { color: '#9CA3AF', fontSize: 12, fontWeight: '600' },
  kpiIconBg:  { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  kpiIconBgSm:{ width: 26, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  kpiVal:     { fontSize: 28, fontWeight: 'bold', marginBottom: 6 },
  kpiSmVal:   { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  kpiRow:     { flexDirection: 'row', gap: 10, marginBottom: 4 },
  kpiSm:      { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 3 },
  chgRow:     { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chgTxt:     { fontSize: 13, fontWeight: 'bold' },
  chgTxtSm:   { fontSize: 11, fontWeight: 'bold' },
  chgSub:     { fontSize: 10, color: '#9CA3AF', marginLeft: 4 },
  prevLabel:  { fontSize: 10, color: '#9CA3AF', marginBottom: 12, marginLeft: 4 },

  // Section header
  secHdr:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  secIcon:  { width: 28, height: 28, borderRadius: 8, backgroundColor: PL, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  secTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937', flex: 1 },
  badge:    { backgroundColor: P, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeTxt: { color: '#fff', fontSize: 9, fontWeight: '700' },
  sectionWrap: { marginBottom: 12 },

  // Card
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },

  // Bar charts
  barsH:       { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 1 },
  barsSm:      { flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 1 },
  barTrack:    { width: '100%', height: 110, backgroundColor: '#F3F4F6', borderRadius: 2, overflow: 'hidden', justifyContent: 'flex-end' },
  barTrackSm:  { width: '100%', height: 80, backgroundColor: '#F3F4F6', borderRadius: 2, overflow: 'hidden', justifyContent: 'flex-end' },
  barFill:     { width: '100%', borderRadius: 2 },
  barLbl:      { fontSize: 7, color: '#9CA3AF', fontWeight: '500', marginTop: 3 },
  barFooter:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  footTxt:     { fontSize: 9, color: '#9CA3AF' },
  peakTxt:     { fontSize: 9, color: '#9CA3AF', textAlign: 'right', marginTop: 4 },

  // Order type
  otContent:   { alignItems: 'center' },
  donutWrap:   { marginBottom: 16 },
  legendWrap:  { width: '100%' },
  legendRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  legendDot:   { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' },
  legendPct:   { fontSize: 13, fontWeight: 'bold', color: '#1F2937' },
  legendOrders:{ fontSize: 11, color: '#9CA3AF', minWidth: 24, textAlign: 'right' },

  // Payment
  pmRow:     { marginBottom: 14 },
  pmLabel:   { color: '#1F2937', fontSize: 14, fontWeight: '600', marginBottom: 6 },
  pmValue:   { color: '#1F2937', fontSize: 14, fontWeight: 'bold', marginBottom: 6 },
  pmPctBg:   { backgroundColor: PL, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 6 },
  pmPctTxt:  { color: P, fontSize: 12, fontWeight: '600' },
  pmBarBg:   { height: 6, backgroundColor: PL, borderRadius: 3, overflow: 'hidden' },
  pmBarFill: { height: 6, backgroundColor: P, borderRadius: 3 },

  // Best sellers
  emptyCard: { backgroundColor: '#fff', borderRadius: 14, padding: 40, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },
  emptyText: { color: '#9CA3AF', fontSize: 14, marginTop: 12 },
  bsRow:     { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  bsRank:    { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  bsRankTxt: { fontSize: 14, fontWeight: 'bold' },
  bsInfo:    { flex: 1 },
  bsName:    { fontSize: 14, fontWeight: 'bold', color: '#1F2937', marginBottom: 4 },
  bsChip:    { backgroundColor: PL, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  bsChipTxt: { color: P, fontSize: 11, fontWeight: '500' },
  bsRight:   { alignItems: 'flex-end' },
  bsRev:     { fontSize: 14, fontWeight: 'bold', color: P, marginBottom: 4 },
  bsBar:     { height: 4, backgroundColor: P, borderRadius: 2, minWidth: 30 },
});
