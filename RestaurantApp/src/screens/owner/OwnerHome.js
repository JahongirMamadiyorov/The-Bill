import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { reportsAPI, shiftsAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';

// ─── constants ────────────────────────────────────────────────────────────────
const P   = '#7C3AED';
const PL  = '#F5F3FF';
// Use shared topInset so it stays in sync when AppNavigator sets translucent
import { topInset } from '../../utils/theme';
const topPad = topInset;

const money = v => {
  const n = Math.round(Number(v) || 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
};

const greeting = (t) => {
  const h = new Date().getHours();
  if (h < 12) return t ? t('owner.home.goodMorning') : 'Good morning';
  if (h < 17) return t ? t('owner.home.goodAfternoon') : 'Good afternoon';
  return t ? t('owner.home.goodEvening') : 'Good evening';
};

const fmtDay = d =>
  d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

const fmtTime = iso => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
};

const ROLE_COLORS = {
  waitress: { bg: '#DCFCE7', text: '#16A34A', icon: 'restaurant' },
  kitchen:  { bg: '#FFF7ED', text: '#EA580C', icon: 'soup-kitchen' },
};

// ─── small reusable components ────────────────────────────────────────────────
const SectionTitle = memo(function SectionTitle({ icon, title, badge }) {
  return (
    <View style={st.sectionRow}>
      <View style={st.sectionIconBox}>
        <MaterialIcons name={icon} size={14} color={P} />
      </View>
      <Text style={st.sectionTitle}>{title}</Text>
      {badge ? <View style={st.sectionBadge}><Text style={st.sectionBadgeText}>{badge}</Text></View> : null}
    </View>
  );
});

// ─── main screen ──────────────────────────────────────────────────────────────
export default function OwnerHome() {
  const { restaurant } = useAuth();
  const { t } = useTranslation();
  const [summary,    setSummary]    = useState(null);
  const [staffList,  setStaffList]  = useState([]);
  const [dash,       setDash]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [sumRes, staffRes, dashRes] = await Promise.all([
        reportsAPI.getAdminDailySummary(),
        shiftsAPI.getStaffStatus(),
        reportsAPI.getDashboard(),
      ]);
      setSummary(sumRes.data);
      setStaffList(Array.isArray(staffRes.data) ? staffRes.data : []);
      setDash(dashRes.data);
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // auto-sync every 10 s so dashboard stays current with DB
  useEffect(() => {
    const iv = setInterval(fetchData, 10000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  // ── derived ────────────────────────────────────────────────────────
  const inflow = useMemo(() => {
    const rows = summary?.financialFlow?.inflow || [];
    let cash = 0, card = 0, online = 0;
    rows.forEach(r => {
      const m = r.payment_method?.toLowerCase() || 'cash';
      const a = parseFloat(r.amount || 0);
      if (m === 'cash')   cash   += a;
      else if (m === 'card')   card   += a;
      else online += a;
    });
    const total = cash + card + online;
    return { cash, card, online, total };
  }, [summary]);

  const outflow    = summary?.financialFlow?.outflow  || 0;
  const totalSales = summary?.salesOverview            || 0;
  const netProfit  = totalSales - outflow;

  const activeOrders = summary?.currentOrders || [];
  const totalActive  = summary?.totalActiveOrders || dash?.active_orders || 0;
  const freeTables   = dash?.free_tables  || 0;
  const totalTables  = dash?.total_tables || 0;
  const openTables   = dash?.open_tables  || 0;

  const todaySold  = (summary?.goodsSold || []).slice(0, 5);
  const trendHours = summary?.charts?.dailySalesTrend || [];
  const maxTrend   = useMemo(() => Math.max(...trendHours.map(h => parseFloat(h.sales || 0)), 1), [trendHours]);

  const staffOnDuty = staffList.filter(s => s.clock_in && !s.clock_out);
  const staffAbsent = staffList.filter(s => !s.clock_in);

  const warehouse = summary?.warehouse || {};

  // ── loading / error ────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color={P} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={st.center}>
        <MaterialIcons name="error-outline" size={48} color={P} />
        <Text style={st.errorText}>{error}</Text>
        <Pressable style={({ pressed }) => [st.retryBtn, pressed && { opacity: 0.7 }]} onPress={fetchData}>
          <Text style={st.retryText}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={st.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Purple header ── */}
      <View style={st.header}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        {/* decorative circles */}
        <View style={st.decCircle1} />
        <View style={st.decCircle2} />
        <View style={st.headerTop}>
          <View>
            <Text style={st.greeting}>{greeting(t)}</Text>
            <Text style={st.restaurantName}>{restaurant?.name || 'The Bill'}</Text>
            <Text style={st.dateText}>{fmtDay(new Date())}</Text>
          </View>
          <Pressable onPress={onRefresh} style={({ pressed }) => [st.refreshBtn, pressed && { opacity: 0.6 }]}>
            <MaterialIcons name="refresh" size={22} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>

        {/* Big revenue card inside header */}
        <View style={st.revenueCard}>
          <Text style={st.revenueLabel}>{t('owner.home.todaysRevenue')}</Text>
          <Text style={st.revenueValue}>{money(totalSales)}</Text>
          <View style={st.revenueSubRow}>
            <View style={st.revenueChip}>
              <MaterialIcons name="receipt-long" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={st.revenueChipText}>{dash?.today_orders ?? 0} {t('owner.home.orders')}</Text>
            </View>
            <View style={st.revenueChip}>
              <MaterialIcons name="trending-up" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={st.revenueChipText}>
                {netProfit >= 0 ? '+' : ''}{money(netProfit)} {t('owner.home.net')}
              </Text>
            </View>
            <View style={st.revenueChip}>
              <MaterialIcons name="payments" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={st.revenueChipText}>{money(outflow)} {t('owner.home.out')}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Live snapshot cards (overlap header) ── */}
      <View style={st.snapRow}>
        <View style={[st.snapCard, { borderTopColor: '#F97316' }]}>
          <MaterialIcons name="local-fire-department" size={20} color="#F97316" />
          <Text style={st.snapVal}>{totalActive}</Text>
          <Text style={st.snapLbl}>{t('owner.home.active')}</Text>
        </View>
        <View style={[st.snapCard, { borderTopColor: '#16A34A' }]}>
          <MaterialIcons name="event-seat" size={20} color="#16A34A" />
          <Text style={st.snapVal}>{freeTables}/{totalTables}</Text>
          <Text style={st.snapLbl}>{t('owner.home.freeTables')}</Text>
        </View>
        <View style={[st.snapCard, { borderTopColor: '#2563EB' }]}>
          <MaterialIcons name="table-bar" size={20} color="#2563EB" />
          <Text style={st.snapVal}>{openTables}</Text>
          <Text style={st.snapLbl}>{t('owner.home.occupied')}</Text>
        </View>
        <View style={[st.snapCard, { borderTopColor: P }]}>
          <MaterialIcons name="people" size={20} color={P} />
          <Text style={st.snapVal}>{staffOnDuty.length}</Text>
          <Text style={st.snapLbl}>{t('owner.home.onDuty')}</Text>
        </View>
      </View>

      {/* ── Payment breakdown ── */}
      <View style={st.card}>
        <SectionTitle icon="account-balance-wallet" title={t('owner.home.paymentBreakdown')} badge={t('periods.today')} />
        <PaymentRow label={t('paymentMethods.cash')}   icon="payments"      color="#10B981" value={inflow.cash}   total={inflow.total} />
        <PaymentRow label={t('paymentMethods.card')}   icon="credit-card"   color="#2563EB" value={inflow.card}   total={inflow.total} />
        <PaymentRow label={t('paymentMethods.online')} icon="phone-android" color={P}       value={inflow.online} total={inflow.total} />
      </View>

      {/* ── Active orders by type ── */}
      {activeOrders.length > 0 && (
        <View style={st.card}>
          <SectionTitle icon="receipt" title={t('owner.home.activeOrdersByType')} />
          <View style={st.orderTypeRow}>
            {activeOrders.map(o => (
              <View key={o.id} style={st.orderTypeCard}>
                <MaterialIcons
                  name={o.id === 'dine_in' ? 'table-restaurant' : o.id === 'takeaway' ? 'takeout-dining' : 'delivery-dining'}
                  size={22}
                  color={o.count > 0 ? P : '#D1D5DB'}
                />
                <Text style={[st.orderTypeCount, { color: o.count > 0 ? P : '#9CA3AF' }]}>{o.count}</Text>
                <Text style={st.orderTypeName}>{o.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Hourly sales trend ── */}
      {trendHours.length > 0 && (
        <View style={st.card}>
          <SectionTitle icon="show-chart" title={t('owner.home.salesTrend')} badge={t('periods.today')} />
          <View style={st.trendChart}>
            {trendHours.map((h, i) => {
              const pct = (parseFloat(h.sales || 0) / maxTrend) * 100;
              const active = pct > 60;
              return (
                <View key={h.time || i} style={st.trendBar}>
                  <View style={st.trendBarTrack}>
                    <View style={[
                      st.trendBarFill,
                      { height: Math.max(pct, 4) + '%', backgroundColor: active ? P : '#C4B5FD' }
                    ]} />
                  </View>
                  <Text style={st.trendLabel}>{(h.time || '').replace(':00', '')}</Text>
                </View>
              );
            })}
          </View>
          <Text style={st.trendPeak}>
            {t('owner.home.peak')}: {money(maxTrend)}
          </Text>
        </View>
      )}

      {/* ── Today's sold items ── */}
      <View style={st.card}>
        <SectionTitle icon="fastfood" title={t('owner.home.todayTopItems')} badge={t('periods.today')} />
        {todaySold.length === 0 ? (
          <View style={st.emptyBox}>
            <MaterialIcons name="no-food" size={32} color="#E5E7EB" />
            <Text style={st.emptyText}>{t('owner.home.noItemsSoldYet')}</Text>
          </View>
        ) : (
          todaySold.map((item, i) => (
            <View key={item.name} style={[st.soldRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#F3F4F6' }]}>
              <View style={[st.soldRank, { backgroundColor: i < 3 ? P : PL }]}>
                <Text style={[st.soldRankText, { color: i < 3 ? '#fff' : P }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.soldName}>{item.name}</Text>
                {item.category ? <Text style={st.soldCat}>{item.category}</Text> : null}
              </View>
              <View style={st.soldQtyBox}>
                <Text style={st.soldQty}>×{item.quantity}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* ── Warehouse activity today ── */}
      {(warehouse.goodsConsumed > 0 || warehouse.goodsArrived > 0) && (
        <View style={st.card}>
          <SectionTitle icon="inventory-2" title={t('owner.home.warehouseToday')} />
          <View style={st.whRow}>
            <View style={st.whCard}>
              <MaterialIcons name="remove-circle" size={20} color="#F59E0B" />
              <Text style={st.whVal}>{money(warehouse.goodsConsumed)}</Text>
              <Text style={st.whLbl}>{t('owner.home.consumed')}</Text>
            </View>
            <View style={st.whDivider} />
            <View style={st.whCard}>
              <MaterialIcons name="add-circle" size={20} color="#10B981" />
              <Text style={st.whVal}>{money(warehouse.goodsArrived)}</Text>
              <Text style={st.whLbl}>{t('owner.home.received')}</Text>
            </View>
            <View style={st.whDivider} />
            <View style={st.whCard}>
              <MaterialIcons name="store" size={20} color={P} />
              <Text style={[st.whVal, { fontSize: 11 }]}>{money(warehouse.currentStatus?.totalValue || 0)}</Text>
              <Text style={st.whLbl}>{t('owner.home.stockValue')}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Staff on duty ── */}
      <View style={st.card}>
        <SectionTitle
          icon="badge"
          title={t('owner.home.staffStatus')}
          badge={`${staffOnDuty.length} ${t('owner.home.onDutyBadge')}`}
        />
        {staffList.length === 0 ? (
          <View style={st.emptyBox}>
            <MaterialIcons name="people-outline" size={32} color="#E5E7EB" />
            <Text style={st.emptyText}>{t('owner.home.noStaffData')}</Text>
          </View>
        ) : (
          staffList.map((s, i) => {
            const rc = ROLE_COLORS[s.role] || { bg: '#F3F4F6', text: '#6B7280', icon: 'person' };
            const isOn = !!s.clock_in && !s.clock_out;
            return (
              <View key={String(s.user_id)} style={[st.staffRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#F3F4F6' }]}>
                <View style={[st.staffAvatar, { backgroundColor: rc.bg }]}>
                  <Text style={[st.staffAvatarLetter, { color: rc.text }]}>
                    {(s.name || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.staffName}>{s.name}</Text>
                  <Text style={st.staffRole}>{s.role}</Text>
                </View>
                {isOn ? (
                  <View style={st.staffOnBadge}>
                    <View style={st.staffOnDot} />
                    <Text style={st.staffOnText}>
                      {parseFloat(s.hours_worked || 0).toFixed(1)}h · {t('owner.home.since')} {fmtTime(s.clock_in)}
                    </Text>
                  </View>
                ) : (
                  <View style={st.staffOffBadge}>
                    <Text style={st.staffOffText}>{t('owner.home.off')}</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

    </ScrollView>
  );
}

// ─── PaymentRow ────────────────────────────────────────────────────────────────
const PaymentRow = memo(function PaymentRow({ label, icon, color, value, total }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <View style={st.payRow}>
      <View style={[st.payIcon, { backgroundColor: color + '18' }]}>
        <MaterialIcons name={icon} size={15} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={st.payTop}>
          <Text style={st.payLabel}>{label}</Text>
          <Text style={st.payValue}>{money(value)}</Text>
          <View style={st.payPill}>
            <Text style={st.payPct}>{pct > 0 ? pct.toFixed(0) : 0}%</Text>
          </View>
        </View>
        <View style={st.payBarBg}>
          <View style={[st.payBarFill, { width: pct + '%', backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
});

// ─── styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#F8FAFC' },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  errorText:  { fontSize: 15, color: '#374151', marginTop: 12, marginBottom: 8 },
  retryBtn:   { backgroundColor: P, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 8 },
  retryText:  { color: '#fff', fontWeight: '700', fontSize: 14 },

  // header
  header: {
    backgroundColor: P,
    paddingTop: topPad + 10,
    paddingHorizontal: 20,
    paddingBottom: 28,
    overflow: 'hidden',
  },
  decCircle1: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -60, right: -60,
  },
  decCircle2: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: 0, left: -20,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  greeting:       { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 3 },
  restaurantName: { color: '#fff', fontSize: 26, fontWeight: '800' },
  dateText:       { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 },
  refreshBtn: { padding: 6 },

  revenueCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 18,
    padding: 18,
  },
  revenueLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  revenueValue: { color: '#fff', fontSize: 34, fontWeight: '800', marginBottom: 12 },
  revenueSubRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  revenueChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  revenueChipText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },

  // snapshot row
  snapRow: {
    marginTop: -16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  snapCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14,
    padding: 12, alignItems: 'center',
    borderTopWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  snapVal: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 5 },
  snapLbl: { fontSize: 9, color: '#9CA3AF', marginTop: 2, fontWeight: '600', textTransform: 'uppercase' },

  // section card
  card: {
    backgroundColor: '#fff', borderRadius: 18, marginHorizontal: 14,
    marginTop: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
  sectionIconBox: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: PL, alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111827', flex: 1 },
  sectionBadge: { backgroundColor: P, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  sectionBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // payment rows
  payRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  payIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  payTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  payLabel: { fontSize: 13, fontWeight: '600', color: '#374151', flex: 1 },
  payValue: { fontSize: 13, fontWeight: '700', color: '#111827' },
  payPill: { backgroundColor: PL, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  payPct:  { color: P, fontSize: 11, fontWeight: '700' },
  payBarBg:   { height: 5, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  payBarFill: { height: 5, borderRadius: 3 },

  // active orders by type
  orderTypeRow: { flexDirection: 'row', gap: 10 },
  orderTypeCard: {
    flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', gap: 5,
  },
  orderTypeCount: { fontSize: 22, fontWeight: '800' },
  orderTypeName:  { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textAlign: 'center' },

  // trend chart
  trendChart: { flexDirection: 'row', height: 80, alignItems: 'flex-end', gap: 4, marginBottom: 8 },
  trendBar: { flex: 1, alignItems: 'center', gap: 4 },
  trendBarTrack: { flex: 1, width: '100%', justifyContent: 'flex-end', backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  trendBarFill:  { width: '100%', borderRadius: 4 },
  trendLabel: { fontSize: 8, color: '#9CA3AF', fontWeight: '500' },
  trendPeak:  { fontSize: 11, color: '#9CA3AF', textAlign: 'right', fontWeight: '500' },

  // today's sold items
  soldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  soldRank: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  soldRankText: { fontSize: 13, fontWeight: '800' },
  soldName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  soldCat:  { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  soldQtyBox: { backgroundColor: PL, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  soldQty:  { fontSize: 13, fontWeight: '800', color: P },

  // warehouse
  whRow: { flexDirection: 'row', alignItems: 'center' },
  whCard: { flex: 1, alignItems: 'center', gap: 5 },
  whDivider: { width: 1, height: 50, backgroundColor: '#F3F4F6' },
  whVal: { fontSize: 13, fontWeight: '800', color: '#111827', textAlign: 'center' },
  whLbl: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },

  // staff
  staffRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  staffAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  staffAvatarLetter: { fontSize: 16, fontWeight: '800' },
  staffName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  staffRole: { fontSize: 11, color: '#9CA3AF', marginTop: 1, textTransform: 'capitalize' },
  staffOnBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F0FDF4', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  staffOnDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: '#16A34A' },
  staffOnText:  { fontSize: 11, color: '#16A34A', fontWeight: '600' },
  staffOffBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  staffOffText:  { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },

  emptyBox: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText: { fontSize: 13, color: '#9CA3AF' },
});
