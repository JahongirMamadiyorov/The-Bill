import React, { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Dimensions, Modal, FlatList, StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../../context/AuthContext';
import { reportsAPI, ordersAPI, tablesAPI, warehouseAPI, notificationsAPI, staffPaymentsAPI, shiftsAPI, loansAPI, procurementAPI } from '../../api/client';
import { colors, shadow, topInset } from '../../utils/theme';

const { width: SW } = Dimensions.get('window');

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════
const C = {
  primary:      '#2563EB',
  primaryLight: '#EFF6FF',
  success:      '#16A34A',
  successLight: '#F0FDF4',
  warning:      '#D97706',
  warningLight: '#FFFBEB',
  danger:       '#DC2626',
  dangerLight:  '#FEF2F2',
  neutralDark:  '#111827',
  neutralMid:   '#6B7280',
  neutralLight: '#F9FAFB',
  card:         '#FFFFFF',
  border:       '#E5E7EB',
  textDark:     '#0F172A',
  textMid:      '#475569',
  textMuted:    '#94A3B8',
  bg:           '#F0F2F5',
  white:        '#FFFFFF',
  purple:       '#7C3AED',
};

const TABLE_STATUS_STYLE = {
  free:        { bg: '#DCFCE7', text: '#166534', dot: '#16A34A' },
  occupied:    { bg: '#FEE2E2', text: '#991B1B', dot: '#DC2626' },
  reserved:    { bg: '#FEF9C3', text: '#854D0E', dot: '#D97706' },
  cleaning:    { bg: '#DBEAFE', text: '#1E40AF', dot: '#2563EB' },
  unavailable: { bg: '#F1F5F9', text: '#64748B', dot: '#94A3B8' },
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
const fmtMoney = (n) => {
  const num = Number(n);
  if (isNaN(num)) return "0 so'm";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M so'm`;
  if (num >= 1_000)     return `${(num / 1_000).toFixed(0)}K so'm`;
  return `${Math.round(num).toLocaleString('ru-RU')} so'm`;
};

const fmtMoneyFull = (n) =>
  isNaN(Number(n)) ? "0 so'm" : `${Math.round(Number(n)).toLocaleString('ru-RU')} so'm`;

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const fmtTime = () =>
  new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

const fmtDateLong = () =>
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

const fmtNotifTime = (iso) => {
  try {
    const d       = new Date(iso);
    const diffMs  = Date.now() - d.getTime();
    const mins    = Math.floor(diffMs / 60000);
    if (mins < 1)   return 'Just now';
    if (mins < 60)  return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24)  return `${hrs}h ago`;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch (_) { return '—'; }
};

const NOTIF_COLORS = {
  new_order:   '#2563EB',
  order_ready: '#16A34A',
  low_stock:   '#D97706',
  alert:       '#DC2626',
  default:     '#2563EB',
};
const getNotifColor = (type) => NOTIF_COLORS[type] || NOTIF_COLORS.default;

// ══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function SectionHead({ title, right }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle}>{title}</Text>
      {right && <Text style={s.sectionRight}>{right}</Text>}
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: C.border }} />;
}

// Quick stat card in the 3-column row
function StatCard({ iconName, label, value, sub, accentColor }) {
  return (
    <View style={[s.statCard, { borderTopColor: accentColor, borderTopWidth: 3 }]}>
      <MaterialIcons name={iconName} size={22} color={accentColor} />
      <Text style={[s.statValue, { color: accentColor }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

// Single bar row for order type breakdown
function OrderBar({ iconName, label, count, total }) {
  const barW = SW - 32 - 24 - 60 - 32; // available bar width
  const filled = total > 0 ? Math.round((count / total) * barW) : 0;
  const colors_ = { 'Dine-in':'#2563EB', 'To-Go':'#D97706', 'Delivery':'#16A34A' };
  const col = colors_[label] || C.primary;
  return (
    <View style={s.orderBarRow}>
      <MaterialIcons name={iconName} size={18} color={col} />
      <Text style={s.orderBarLabel}>{label}</Text>
      <View style={s.orderBarTrack}>
        {filled > 0 && (
          <View style={[s.orderBarFill, { width: filled, backgroundColor: col }]} />
        )}
      </View>
      <Text style={[s.orderBarCount, { color: col }]}>{count}</Text>
    </View>
  );
}

// Single table cell in the grid
function TableCell({ table }) {
  const st = TABLE_STATUS_STYLE[table.status] || TABLE_STATUS_STYLE.unavailable;
  return (
    <View style={[s.tableCell, { backgroundColor: st.bg }]}>
      <View style={[s.tableDot, { backgroundColor: st.dot }]} />
      <Text style={[s.tableCellNum, { color: st.text }]}>{table.table_number}</Text>
      {table.order_total > 0 && (
        <Text style={[s.tableCellAmt, { color: st.text }]}>{fmtMoney(table.order_total)}</Text>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function AdminDashboard({ navigation }) {
  const { user } = useAuth();
  const [summary,   setSummary]   = useState(null);
  const [dash,      setDash]      = useState(null);
  const [tables,    setTables]    = useState([]);
  const [lowStock,  setLowStock]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [lastUpdate,setLastUpdate]= useState('');
  const [stockOpen, setStockOpen] = useState(false);
  const [goodsOpen, setGoodsOpen] = useState(false);
  const [sellersOpen,setSellersOpen] = useState(false);

  // Direct-fetch state (bypasses unreliable aggregation endpoint)
  const [directOrders,    setDirectOrders]    = useState([]);
  const [directMovements, setDirectMovements] = useState([]);
  const [directSalaries,  setDirectSalaries]  = useState([]);   // staff_payments this month
  const [payrollData,     setPayrollData]     = useState([]);   // shifts payroll this month
  const [loanStats,       setLoanStats]       = useState(null); // active loans summary
  const [supplierDebt,    setSupplierDebt]    = useState(0);    // unpaid supplier deliveries

  // ── Notifications state ───────────────────────────────────────────────────
  const [notifications,    setNotifications]    = useState([]);
  const [unreadCount,      setUnreadCount]      = useState(0);
  const [showNotifPanel,   setShowNotifPanel]   = useState(false);
  const notifInterval = useRef(null);

  const loadNotifications = useCallback(async () => {
    try {
      const res  = await notificationsAPI.getAll();
      const list = res.data || [];
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.is_read).length);
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadNotifications();
    notifInterval.current = setInterval(loadNotifications, 10000);
    return () => clearInterval(notifInterval.current);
  }, [loadNotifications]);

  const handleMarkRead = useCallback(async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (_) {}
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (_) {}
  }, []);

  const load = useCallback(async () => {
    try {
      // Date helpers
      const now       = new Date();
      const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
      const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const fromStr      = fmt(yesterday);                                   // yesterday (movements bound)
      const monthStart   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const todayDateStr = fmt(now);

      const [summaryRes, dashRes, tablesRes, lowStockRes, ordersRes, movRes,
             salariesRes, payrollRes, loansRes] =
        await Promise.allSettled([
          reportsAPI.getAdminDailySummary(),
          reportsAPI.getDashboard(),
          tablesAPI.getAll(),
          warehouseAPI.getLowStock(),
          ordersAPI.getAll({ status: 'paid' }),                              // direct paid-order fetch
          warehouseAPI.getMovements({ from: fromStr }),                      // direct movement fetch
          staffPaymentsAPI.getAll({ from: monthStart, to: todayDateStr }),   // this month's salaries
          shiftsAPI.getPayroll({ from: monthStart, to: todayDateStr }),      // this month's gross pay
          loansAPI.getStats(),                                               // active loans
        ]);

      if (summaryRes.status  === 'fulfilled') setSummary(summaryRes.value.data);
      if (dashRes.status     === 'fulfilled') setDash(dashRes.value.data);
      if (tablesRes.status   === 'fulfilled') setTables(tablesRes.value.data || []);
      if (lowStockRes.status === 'fulfilled') setLowStock(lowStockRes.value.data || []);
      if (ordersRes.status   === 'fulfilled') setDirectOrders(ordersRes.value.data || []);
      if (movRes.status      === 'fulfilled') setDirectMovements(movRes.value.data || []);
      if (salariesRes.status === 'fulfilled') setDirectSalaries(salariesRes.value.data || []);
      if (payrollRes.status  === 'fulfilled') setPayrollData(payrollRes.value.data || []);
      if (loansRes.status    === 'fulfilled') setLoanStats(loansRes.value.data || null);

      // Supplier debt: always sync AsyncStorage → DB so website stays in sync,
      // then use DB total. Fall back to local calculation if DB unreachable.
      try {
        // Step 1: Always push AsyncStorage data to DB (idempotent via ON CONFLICT)
        const raw = await AsyncStorage.getItem('@the_bill_delivery_history');
        const localDeliveries = raw ? JSON.parse(raw) : [];
        if (localDeliveries.length > 0) {
          await procurementAPI.bulkSyncDeliveries(localDeliveries).catch(() => {});
        }

        // Step 2: Now read the authoritative total from DB
        const debtRes = await procurementAPI.getDeliveriesDebt().catch(() => null);
        const dbTotal = parseFloat(debtRes?.data?.total_debt) || 0;
        const dbCount = debtRes?.data?.count ?? 0;

        if (dbCount > 0) {
          setSupplierDebt(dbTotal);
        } else {
          // DB unreachable or truly empty — compute locally
          const debt = localDeliveries
            .filter(d => d.paymentStatus !== 'paid' && ['Delivered', 'Partial'].includes(d.status))
            .reduce((s, d) => s + (Number(d.total) || 0), 0);
          setSupplierDebt(debt);
        }
      } catch (_) {}
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
    setLastUpdate(fmtTime());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={{ color: C.textMuted, marginTop: 14, fontSize: 14 }}>Loading dashboard…</Text>
      </View>
    );
  }

  // ── Derived values (all with safe fallbacks) ────────────────────────────
  const todayStr      = new Date().toDateString();          // e.g. "Mon Mar 16 2026"

  // General stats (these still use summary/dash as they were reliable)
  const activeOrders  = summary?.totalActiveOrders  ?? dash?.active_orders    ?? 0;
  const orderTypes    = summary?.currentOrders      ?? [];

  const occupiedTables = tables.filter(t => t.status === 'occupied').length;
  const freeTables     = tables.filter(t => t.status === 'free').length;
  const reservedTables = tables.filter(t => t.status === 'reserved').length;
  const totalTables    = tables.length || dash?.total_tables || 0;

  const staffOnShift  = summary?.staffPerformance?.length ?? 0;
  const staffList     = summary?.staffPerformance         ?? [];

  // ── FINANCIAL FLOW — computed directly from paid orders (local timezone) ──
  const todayPaidOrders = directOrders.filter(o => {
    const d = new Date(o.paid_at || o.updated_at || o.created_at);
    return d.toDateString() === todayStr;
  });
  const directInflow = todayPaidOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);

  // Fallback chain: direct → summary salesOverview → dashboard today_revenue
  const summaryRevenue = summary?.salesOverview ?? dash?.today_revenue ?? 0;
  const totalInflow    = directInflow > 0 ? directInflow : summaryRevenue;

  // Revenue hero also uses direct count
  const revenue     = totalInflow;
  const todayOrders = directInflow > 0 ? todayPaidOrders.length : (dash?.today_orders ?? 0);

  // Payment-method breakdown for display
  const inflowByMethod = {};
  todayPaidOrders.forEach(o => {
    const method = (o.payment_method || 'cash').toLowerCase().trim() || 'cash';
    inflowByMethod[method] = (inflowByMethod[method] || 0) + parseFloat(o.total_amount || 0);
  });
  const inflowBreakdown = Object.entries(inflowByMethod).map(([m, amt]) => ({ payment_method: m, amount: amt }));

  // Outflow: expenses + staff payments + delivery payments — from summary breakdown
  const outflow      = summary?.financialFlow?.outflow ?? 0;
  const outflowBreak = summary?.financialFlow?.outflowBreakdown;

  // ── SALARIES — computed directly from staff_payments (local timezone) ──
  const todaySalaries = directSalaries.filter(p => {
    // payment_date is a DATE string like "2026-03-16" — parse as local midnight
    const raw = p.payment_date || p.created_at;
    const d   = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)
                ? new Date(raw + 'T00:00:00')
                : new Date(raw);
    return d.toDateString() === todayStr;
  });
  const salariesToday = todaySalaries.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  // Delivery payments from summary breakdown
  const deliveryPaymentsToday = outflowBreak?.deliveryPayments ?? 0;
  // Expenses-only = outflow total minus salaries minus delivery payments
  const expensesOnlyToday = Math.max(0, outflow - salariesToday - deliveryPaymentsToday);

  // ── DEBTS / PAYABLES ──────────────────────────────────────────────────────
  // Employee payroll owed this month: earned (from shifts) minus paid (from staff_payments)
  const monthGrossPay    = payrollData.reduce((s, r) => s + parseFloat(r.gross_pay || 0), 0);
  const monthSalariesPaid = directSalaries.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const payrollOwed      = Math.max(0, monthGrossPay - monthSalariesPaid);
  // Customer active loans (money customers owe the restaurant)
  const activeLoanTotal  = parseFloat(loanStats?.active_total  || 0);
  const activeLoanCount  = parseInt(loanStats?.active_count    || 0, 10);
  const overdueLoanTotal = parseFloat(loanStats?.overdue_total || 0);
  const overdueLoanCount = parseInt(loanStats?.overdue_count   || 0, 10);

  // ── WAREHOUSE TODAY — computed directly from movements (local timezone) ──
  const todayMovements = directMovements.filter(m => {
    const d = new Date(m.created_at);
    return d.toDateString() === todayStr;
  });
  // Only count ORDER-based consumption (reason starts with 'Auto:').
  // This prevents old test / manual entries from inflating the figure and
  // matches exactly what the Kitchen Usage Summary shows in the Inventory tab.
  const orderMovements = todayMovements.filter(m =>
    typeof m.reason === 'string' && m.reason.startsWith('Auto:')
  );
  const goodsConsumed = orderMovements
    .filter(m => m.type === 'OUT' || m.type === 'WASTE')
    .reduce((s, m) => s + parseFloat(m.quantity || 0) * parseFloat(m.cost_per_unit || 0), 0);
  const goodsArrived = todayMovements
    .filter(m => m.type === 'IN')
    .reduce((s, m) => s + parseFloat(m.quantity || 0) * parseFloat(m.cost_per_unit || 0), 0);

  // Fall back to summary if no movements fetched yet
  const goodsConsumedFinal = goodsConsumed > 0 ? goodsConsumed : (summary?.warehouse?.goodsConsumed ?? 0);
  const goodsArrivedFinal  = goodsArrived  > 0 ? goodsArrived  : (summary?.warehouse?.goodsArrived  ?? 0);

  const stockCount    = summary?.warehouse?.currentStatus?.itemCount ?? 0;
  const stockValue    = summary?.warehouse?.currentStatus?.totalValue ?? 0;

  // Total outflow = direct components (avoids relying on summary.outflow which can be 0 when summary fails)
  // expensesOnlyToday already excludes salaries & delivery payments; add them directly + inventory
  const totalOutflow  = expensesOnlyToday + salariesToday + deliveryPaymentsToday + goodsConsumedFinal;
  const netFlow       = totalInflow - totalOutflow;

  const topSellers    = summary?.charts?.productPerformance ?? dash?.best_sellers ?? [];
  const maxSold       = topSellers.length > 0 ? Math.max(...topSellers.map(i => Number(i.total_sold))) : 1;
  const goodsSold     = summary?.goodsSold ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* White header → dark status-bar icons */}
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={C.primary}
          />
        }
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>{getGreeting()},</Text>
            <Text style={s.name}>{user?.name || 'Admin'}</Text>
            <Text style={s.date}>{fmtDateLong()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {/* Bell icon with unread badge */}
            <TouchableOpacity
              style={s.bellBtn}
              onPress={() => setShowNotifPanel(true)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="notifications" size={22} color={C.primary} />
              {unreadCount > 0 && (
                <View style={s.bellBadge}>
                  <Text style={s.bellBadgeTxt}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={[s.adminBadge, { marginTop: 8 }]}>
              <Text style={s.adminBadgeTxt}>ADMIN</Text>
            </View>
            {lastUpdate ? (
              <Text style={s.lastUpdate}>Updated {lastUpdate}</Text>
            ) : null}
          </View>
        </View>

        {/* ── REVENUE HERO ───────────────────────────────────────────────── */}
        <View style={s.heroCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroLabel}>Today's Revenue</Text>
            <Text style={s.heroValue}>{fmtMoneyFull(revenue)}</Text>
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <View style={s.heroPill}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="check-circle" size={12} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={s.heroPillTxt}>{todayOrders} orders paid</Text>
                </View>
              </View>
              <View style={[s.heroPill, { backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="hourglass-empty" size={12} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={s.heroPillTxt}>{activeOrders} active</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={s.heroRight}>
            <MaterialIcons name="attach-money" size={40} color={C.primary} />
          </View>
        </View>

        {/* ── QUICK STATS ROW ─────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 }}>
          <StatCard
            iconName="shopping-cart"
            label="Active Orders"
            value={String(activeOrders)}
            sub={activeOrders === 1 ? 'in progress' : 'in progress'}
            accentColor={C.primary}
          />
          <StatCard
            iconName="chair"
            label="Tables"
            value={`${occupiedTables}/${totalTables}`}
            sub={`${freeTables} free`}
            accentColor={C.success}
          />
          <StatCard
            iconName="group"
            label="On Shift"
            value={String(staffOnShift)}
            sub="working today"
            accentColor={C.warning}
          />
        </View>

        {/* ── LOW STOCK ALERT (if any) ────────────────────────────────────── */}
        {lowStock.length > 0 && (
          <TouchableOpacity
            style={s.alertBanner}
            onPress={() => setStockOpen(o => !o)}
            activeOpacity={0.85}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="warning" size={18} color={C.warning} style={{ marginRight: 8 }} />
              <View>
                <Text style={s.alertTitle}>{lowStock.length} Low Stock Item{lowStock.length > 1 ? 's' : ''}</Text>
                <Text style={s.alertSub}>Tap to see items that need restocking</Text>
              </View>
            </View>
            <Text style={{ color: '#92400E', fontWeight: '700' }}>{stockOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
        )}
        {stockOpen && lowStock.length > 0 && (
          <View style={s.alertExpanded}>
            {lowStock.map((item, i) => (
              <View key={item.id || i} style={[s.alertItem, i < lowStock.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: C.textDark, fontSize: 13 }}>{item.name}</Text>
                  <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>
                    Min: {item.min_stock_level} {item.unit}
                  </Text>
                </View>
                <View style={s.stockBadge}>
                  <Text style={s.stockBadgeTxt}>{item.quantity_in_stock} {item.unit}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── ACTIVE ORDERS BREAKDOWN ─────────────────────────────────────── */}
        <View style={s.section}>
          <SectionHead title="Active Orders Breakdown" right={`${activeOrders} total`} />
          {orderTypes.length === 0 && activeOrders === 0 ? (
            <Text style={s.emptyTxt}>No active orders right now</Text>
          ) : (
            <>
              {orderTypes.filter(t => t.id !== 'total').map(t => {
                const iconNames = { dine_in: 'restaurant', takeaway: 'takeout-dining', delivery: 'delivery-dining' };
                const lbls  = { dine_in: 'Dine-in', takeaway: 'To-Go', delivery: 'Delivery' };
                return (
                  <OrderBar
                    key={t.id}
                    iconName={iconNames[t.id] || 'inventory-2'}
                    label={lbls[t.id] || t.name}
                    count={t.count || 0}
                    total={activeOrders}
                  />
                );
              })}
              {orderTypes.length === 0 && activeOrders > 0 && (
                <View style={s.orderBarRow}>
                  <MaterialIcons name="restaurant" size={18} color={C.primary} />
                  <Text style={s.orderBarLabel}>All types</Text>
                  <View style={s.orderBarTrack}>
                    <View style={[s.orderBarFill, { width: SW - 32 - 24 - 60 - 32, backgroundColor: C.primary }]} />
                  </View>
                  <Text style={[s.orderBarCount, { color: C.primary }]}>{activeOrders}</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* ── TABLE STATUS GRID ───────────────────────────────────────────── */}
        {tables.length > 0 && (
          <View style={s.section}>
            <SectionHead title="Table Status" right={`${occupiedTables} busy · ${freeTables} free · ${reservedTables} reserved`} />

            {/* Legend */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
              {[
                { label: 'Free',     col: '#16A34A' },
                { label: 'Occupied', col: '#DC2626' },
                { label: 'Reserved', col: '#D97706' },
                { label: 'Cleaning', col: '#2563EB' },
              ].map(l => (
                <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: l.col, marginRight: 4 }} />
                  <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: '600' }}>{l.label}</Text>
                </View>
              ))}
            </View>

            {/* Grid */}
            <View style={s.tableGrid}>
              {tables
                .slice()
                .sort((a, b) => Number(a.table_number) - Number(b.table_number))
                .map(t => <TableCell key={t.id} table={t} />)
              }
            </View>

            {/* Occupied table detail */}
            {tables.filter(t => t.status === 'occupied' && t.order_total > 0).length > 0 && (
              <>
                <Divider />
                <View style={{ marginTop: 10 }}>
                  <Text style={[s.sectionTitle, { marginBottom: 8, fontSize: 12 }]}>Occupied Table Details</Text>
                  {tables
                    .filter(t => t.status === 'occupied')
                    .sort((a, b) => Number(a.table_number) - Number(b.table_number))
                    .map(t => (
                      <View key={t.id} style={s.tableDetailRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '700', color: C.textDark, fontSize: 13 }}>
                            Table {t.table_number}
                            {t.name && t.name !== `Table ${t.table_number}` ? ` · ${t.name}` : ''}
                          </Text>
                          {t.waitress_name ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                              <MaterialIcons name="person" size={11} color={C.textMuted} style={{ marginRight: 4 }} />
                              <Text style={{ color: C.textMuted, fontSize: 11 }}>{t.waitress_name}</Text>
                            </View>
                          ) : null}
                        </View>
                        {t.order_total > 0 && (
                          <Text style={{ fontWeight: '800', color: C.primary, fontSize: 14 }}>
                            {fmtMoneyFull(t.order_total)}
                          </Text>
                        )}
                      </View>
                    ))
                  }
                </View>
              </>
            )}
          </View>
        )}

        {/* ── FINANCIAL FLOW ──────────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionHead
            title="Financial Flow · Today"
            right={netFlow >= 0 ? `+${fmtMoney(netFlow)} net` : fmtMoney(netFlow)}
          />
          <View style={{ flexDirection: 'row' }}>
            {/* Inflow */}
            <View style={[s.financeCard, { borderLeftColor: C.success }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <MaterialIcons name="payments" size={14} color={C.success} style={{ marginRight: 6 }} />
                <Text style={s.financeCardHead}>Cash Inflow</Text>
              </View>
              <Text style={s.financeTotalAmt}>{fmtMoney(totalInflow)}</Text>
              {totalInflow === 0 && (
                <Text style={s.emptyTxt}>No payments yet</Text>
              )}
              {inflowBreakdown.length > 0
                ? inflowBreakdown.map((item, i) => (
                    <View key={i} style={s.financeRow}>
                      <Text style={s.financeMethod} numberOfLines={1}>
                        {String(item.payment_method || 'Cash').charAt(0).toUpperCase() +
                         String(item.payment_method || 'Cash').slice(1)}
                      </Text>
                      <Text style={s.financeAmt}>{fmtMoney(item.amount)}</Text>
                    </View>
                  ))
                : totalInflow > 0 && (
                    <View style={s.financeRow}>
                      <Text style={s.financeMethod}>Sales</Text>
                      <Text style={s.financeAmt}>{fmtMoney(totalInflow)}</Text>
                    </View>
                  )
              }
            </View>

            {/* Outflow */}
            <View style={[s.financeCard, { borderLeftColor: C.danger }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <MaterialIcons name="trending-down" size={14} color={C.danger} style={{ marginRight: 6 }} />
                <Text style={s.financeCardHead}>Outflow</Text>
              </View>
              <Text style={[s.financeTotalAmt, { color: C.danger }]}>{fmtMoney(totalOutflow)}</Text>
              {expensesOnlyToday > 0 && (
                <View style={s.financeRow}>
                  <Text style={s.financeMethod}>Expenses</Text>
                  <Text style={[s.financeAmt, { color: C.danger }]}>{fmtMoney(expensesOnlyToday)}</Text>
                </View>
              )}
              {salariesToday > 0 && (
                <View style={s.financeRow}>
                  <Text style={s.financeMethod}>Salaries</Text>
                  <Text style={[s.financeAmt, { color: C.danger }]}>{fmtMoney(salariesToday)}</Text>
                </View>
              )}
              {deliveryPaymentsToday > 0 && (
                <View style={s.financeRow}>
                  <Text style={s.financeMethod}>Supplier Payments</Text>
                  <Text style={[s.financeAmt, { color: C.danger }]}>{fmtMoney(deliveryPaymentsToday)}</Text>
                </View>
              )}
              {goodsConsumedFinal > 0 && (
                <View style={s.financeRow}>
                  <Text style={s.financeMethod}>Inventory</Text>
                  <Text style={[s.financeAmt, { color: C.danger }]}>{fmtMoney(goodsConsumedFinal)}</Text>
                </View>
              )}
              {totalOutflow === 0 && (
                <Text style={[s.emptyTxt, { textAlign: 'left', paddingVertical: 4 }]}>No outflow yet</Text>
              )}
              <Divider />
              <View style={[s.financeRow, { marginTop: 6 }]}>
                <Text style={[s.financeMethod, { fontWeight: '700' }]}>Net</Text>
                <Text style={[s.financeAmt, { color: netFlow >= 0 ? C.success : C.danger, fontWeight: '800' }]}>
                  {netFlow >= 0 ? '+' : ''}{fmtMoney(netFlow)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── DEBTS & PAYABLES ────────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionHead title="Debts & Payables" right="This month" />

          {/* ── Row 1: Employee payroll owed ─────────────────────────── */}
          <View style={s.debtRow}>
            <View style={[s.debtIconBox, { backgroundColor: '#F5F3FF' }]}>
              <MaterialIcons name="badge" size={20} color={C.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.debtLabel}>Employee Payroll Owed</Text>
              <Text style={s.debtSub}>
                Earned {fmtMoney(monthGrossPay)} · Paid {fmtMoney(monthSalariesPaid)}
              </Text>
            </View>
            <Text style={[s.debtAmt, { color: payrollOwed > 0 ? C.danger : C.success }]}>
              {payrollOwed > 0 ? fmtMoney(payrollOwed) : 'Settled'}
            </Text>
          </View>

          {/* ── Row 2: Supplier debt ─────────────────────────────────── */}
          <Divider />
          <View style={[s.debtRow, { marginTop: 10 }]}>
            <View style={[s.debtIconBox, { backgroundColor: '#FEF2F2' }]}>
              <MaterialIcons name="local-shipping" size={20} color={C.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.debtLabel}>Supplier Debt</Text>
              <Text style={s.debtSub}>Unpaid delivered goods</Text>
            </View>
            <Text style={[s.debtAmt, { color: supplierDebt > 0 ? C.danger : C.success }]}>
              {supplierDebt > 0 ? fmtMoney(supplierDebt) : 'None'}
            </Text>
          </View>

          {/* ── Row 3: Customer loans (receivables) ──────────────────── */}
          <Divider />
          <View style={[s.debtRow, { marginTop: 10 }]}>
            <View style={[s.debtIconBox, { backgroundColor: '#FFF7ED' }]}>
              <MaterialIcons name="account-balance-wallet" size={20} color={C.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.debtLabel}>Customer Outstanding Loans</Text>
              <Text style={s.debtSub}>
                {activeLoanCount} active loan{activeLoanCount !== 1 ? 's' : ''}
                {overdueLoanCount > 0 ? ` · ${overdueLoanCount} overdue` : ''}
              </Text>
            </View>
            <Text style={[s.debtAmt, { color: overdueLoanCount > 0 ? C.danger : C.warning }]}>
              {activeLoanTotal > 0 ? fmtMoney(activeLoanTotal) : 'None'}
            </Text>
          </View>

          {/* ── Row 3: Salaries paid today (summary) ─────────────────── */}
          {salariesToday > 0 && (
            <>
              <Divider />
              <View style={[s.debtRow, { marginTop: 10 }]}>
                <View style={[s.debtIconBox, { backgroundColor: '#F0FDF4' }]}>
                  <MaterialIcons name="payments" size={20} color={C.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.debtLabel}>Salaries Paid Today</Text>
                  <Text style={s.debtSub}>{todaySalaries.length} payment{todaySalaries.length !== 1 ? 's' : ''} recorded</Text>
                </View>
                <Text style={[s.debtAmt, { color: C.success }]}>{fmtMoney(salariesToday)}</Text>
              </View>
            </>
          )}
        </View>

        {/* ── TOP SELLERS (7-day) ─────────────────────────────────────────── */}
        {topSellers.length > 0 && (
          <View style={s.section}>
            <SectionHead title="Top Sellers · 7 Days" right={`${topSellers.length} items`} />
            {topSellers.map((item, i) => {
              const barPct = maxSold > 0 ? Number(item.total_sold) / maxSold : 0;
              const barW   = Math.round(barPct * (SW - 120));
              const rankColors = ['#F59E0B', '#94A3B8', '#CD7C2F', C.textMuted, C.textMuted];
              return (
                <View key={i} style={s.sellerRow}>
                  <Text style={[s.sellerRank, { color: rankColors[i] || C.textMuted }]}>
                    #{i + 1}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sellerName} numberOfLines={1}>{item.name}</Text>
                    <View style={s.sellerBarTrack}>
                      <View style={[s.sellerBarFill, {
                        width: barW,
                        backgroundColor: i === 0 ? C.warning : i === 1 ? C.textMuted : C.primary,
                      }]} />
                    </View>
                  </View>
                  <Text style={s.sellerQty}>×{item.total_sold}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── GOODS SOLD TODAY ────────────────────────────────────────────── */}
        {goodsSold.length > 0 && (
          <View style={s.section}>
            <TouchableOpacity onPress={() => setGoodsOpen(o => !o)}>
              <SectionHead
                title="Goods Sold · Today"
                right={goodsOpen ? '▲ Hide' : `${goodsSold.length} items ▼`}
              />
            </TouchableOpacity>
            {goodsOpen && goodsSold.map((g, i) => (
              <View key={i} style={[s.goodsRow, i < goodsSold.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: C.textDark, fontSize: 13 }}>{g.name}</Text>
                  {g.category && (
                    <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 1 }}>{g.category}</Text>
                  )}
                </View>
                <View style={s.qtBadge}>
                  <Text style={s.qtBadgeTxt}>×{g.quantity}</Text>
                </View>
              </View>
            ))}
            {!goodsOpen && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {goodsSold.slice(0, 5).map((g, i) => (
                  <View key={i} style={s.goodsChip}>
                    <Text style={s.goodsChipTxt}>{g.name} ×{g.quantity}</Text>
                  </View>
                ))}
                {goodsSold.length > 5 && (
                  <TouchableOpacity style={[s.goodsChip, { backgroundColor: '#EFF6FF', borderColor: C.primary }]} onPress={() => setGoodsOpen(true)}>
                    <Text style={[s.goodsChipTxt, { color: C.primary }]}>+{goodsSold.length - 5} more</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── WAREHOUSE SNAPSHOT ──────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionHead title="Warehouse · Today" right={`${stockCount} items in stock`} />
          <View style={{ flexDirection: 'row' }}>
            <View style={[s.warehouseCard, { backgroundColor: '#F0FDF4' }]}>
              <MaterialIcons name="inventory-2" size={22} color={C.success} />
              <Text style={[s.whValue, { color: C.success }]}>{fmtMoney(goodsArrivedFinal)}</Text>
              <Text style={s.whLabel}>Goods Arrived</Text>
            </View>
            <View style={[s.warehouseCard, { backgroundColor: '#FFF7ED' }]}>
              <MaterialIcons name="whatshot" size={22} color={C.warning} />
              <Text style={[s.whValue, { color: C.warning }]}>{fmtMoney(goodsConsumedFinal)}</Text>
              <Text style={s.whLabel}>Goods Consumed</Text>
            </View>
          </View>
          <View style={s.stockValueRow}>
            <Text style={s.stockValueLabel}>Total stock value</Text>
            <Text style={s.stockValueAmt}>{fmtMoneyFull(stockValue)}</Text>
          </View>
        </View>

        {/* ── STAFF ON SHIFT ──────────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionHead
            title="Staff on Shift · Today"
            right={staffOnShift > 0 ? `${staffOnShift} working` : undefined}
          />
          {staffList.length === 0 ? (
            <Text style={s.emptyTxt}>No waitress shifts recorded yet today</Text>
          ) : (
            staffList.map((st, i) => (
              <View
                key={i}
                style={[s.staffRow, i < staffList.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}
              >
                {/* Avatar */}
                <View style={[s.staffAvatar, { backgroundColor: ['#DBEAFE','#DCFCE7','#FEF9C3','#F3E8FF','#FFEDD5'][i % 5] }]}>
                  <Text style={{ fontWeight: '800', fontSize: 16, color: C.textMid }}>
                    {st.name.charAt(0)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.staffName}>{st.name}</Text>
                  <Text style={s.staffSub}>{st.hours}h worked</Text>
                </View>
                {/* Orders badge */}
                <View style={s.staffOrdersBadge}>
                  <Text style={s.staffOrdersNum}>{st.orders}</Text>
                  <Text style={s.staffOrdersLabel}>orders</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── QUICK ACTIONS ───────────────────────────────────────────────── */}
        <View style={[s.section, { paddingBottom: 4 }]}>
          <SectionHead title="Quick Actions" />
          <View style={s.qaGrid}>
            {[
              { iconName: 'shopping-cart', label: 'View Orders',   sub: 'Browse & manage orders',    iconBg: '#2563EB', softBg: '#EFF6FF', tab: 'Orders'    },
              { iconName: 'chair', label: 'Manage Tables',  sub: 'Floor map & status',        iconBg: '#16A34A', softBg: '#F0FDF4', tab: 'Tables'    },
              { iconName: 'inventory-2', label: 'Check Stock',    sub: 'Inventory & warehouse',     iconBg: '#D97706', softBg: '#FFF7ED', tab: 'Inventory' },
              { iconName: 'group', label: 'Staff & Pay',    sub: 'Attendance & payroll',      iconBg: '#7C3AED', softBg: '#F5F3FF', tab: 'Staff'     },
            ].map((a, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.75}
                onPress={() => navigation.navigate(a.tab)}
                style={s.qaCard}
              >
                {/* Icon box */}
                <View style={[s.qaIconBox, { backgroundColor: a.softBg }]}>
                  <MaterialIcons name={a.iconName} size={24} color={a.iconBg} />
                </View>
                {/* Text */}
                <Text style={s.qaCardLabel}>{a.label}</Text>
                <Text style={s.qaCardSub}>{a.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

      </ScrollView>

      {/* ── NOTIFICATION PANEL ──────────────────────────────────────────── */}
      <Modal
        visible={showNotifPanel}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotifPanel(false)}
        statusBarTranslucent
      >
        <View style={{ flex: 1 }}>
          {/* Backdrop — tap outside to close */}
          <TouchableOpacity
            style={s.notifBackdrop}
            activeOpacity={1}
            onPress={() => setShowNotifPanel(false)}
          />
          {/* Panel */}
          <View style={s.notifPanel}>
            {/* Panel header */}
            <View style={s.notifPanelHandle} />
            <View style={s.notifPanelHeader}>
              <View>
                <Text style={s.notifPanelTitle}>Notifications</Text>
                {unreadCount > 0 && (
                  <Text style={s.notifPanelSub}>{unreadCount} unread</Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {unreadCount > 0 && (
                  <TouchableOpacity onPress={handleMarkAllRead} style={s.markAllBtn} activeOpacity={0.7}>
                    <Text style={s.markAllTxt}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={s.notifCloseBtn}
                  onPress={() => setShowNotifPanel(false)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="close" size={14} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Notification list */}
            {notifications.length === 0 ? (
              <View style={s.notifEmpty}>
                <MaterialIcons name="notifications" size={36} color={C.primary} style={{ marginBottom: 12 }} />
                <Text style={s.notifEmptyTitle}>No notifications</Text>
                <Text style={s.notifEmptyHint}>You're all caught up!</Text>
              </View>
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={item => String(item.id)}
                contentContainerStyle={{ paddingBottom: 24 }}
                renderItem={({ item: n }) => (
                  <TouchableOpacity
                    style={[s.notifItem, !n.is_read && s.notifItemUnread]}
                    onPress={() => handleMarkRead(n.id)}
                    activeOpacity={0.75}
                  >
                    {/* Type colour bar */}
                    <View style={[s.notifTypeDot, { backgroundColor: getNotifColor(n.type) }]} />
                    {/* Content */}
                    <View style={{ flex: 1 }}>
                      <Text style={[s.notifTitle, !n.is_read && { fontWeight: '800', color: C.textDark }]}>
                        {n.title}
                      </Text>
                      {n.body ? (
                        <Text style={s.notifBody} numberOfLines={2}>{n.body}</Text>
                      ) : null}
                      <Text style={s.notifTime}>{fmtNotifTime(n.created_at)}</Text>
                    </View>
                    {/* Unread indicator dot */}
                    {!n.is_read && <View style={s.notifUnreadDot} />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  // Header — paddingTop ensures content clears the transparent status bar
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingTop: topInset + 10, paddingBottom: 16,
    backgroundColor: C.white,
    borderBottomWidth: 1, borderBottomColor: C.border,
    marginBottom: 10,
  },
  greeting:    { fontSize: 13, color: C.textMuted, fontWeight: '500' },
  name:        { fontSize: 22, fontWeight: '800', color: C.textDark, marginTop: 2 },
  date:        { fontSize: 12, color: C.textMuted, marginTop: 3 },
  adminBadge:  { backgroundColor: C.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start' },
  adminBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  lastUpdate:  { fontSize: 10, color: C.textMuted, textAlign: 'right', marginTop: 5 },

  // Hero card
  heroCard: {
    marginHorizontal: 12, marginBottom: 10,
    backgroundColor: C.primary,
    borderRadius: 18, padding: 20,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: C.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  heroLabel:   { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
  heroValue:   { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 4, marginBottom: 8 },
  heroPill:    { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  heroPillTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroRight:   { marginLeft: 12 },

  // Stat cards
  statCard: {
    flex: 1, backgroundColor: C.white, borderRadius: 14,
    padding: 12, alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    marginBottom: 10,
  },
  statValue: { fontSize: 22, fontWeight: '800', marginTop: 6, marginBottom: 2 },
  statLabel: { fontSize: 11, color: C.textMuted, fontWeight: '600', textAlign: 'center' },
  statSub:   { fontSize: 10, color: C.textMuted, marginTop: 2, textAlign: 'center' },

  // Section
  section: {
    backgroundColor: C.white, borderRadius: 16, marginHorizontal: 12,
    marginBottom: 10, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  sectionHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: C.textDark },
  sectionRight: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  emptyTxt:     { color: C.textMuted, textAlign: 'center', paddingVertical: 12, fontSize: 13 },

  // Alert banner
  alertBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEF9C3', borderRadius: 12, marginHorizontal: 12,
    marginBottom: 10, padding: 14,
    borderLeftWidth: 4, borderLeftColor: C.warning,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  alertTitle:   { fontSize: 14, fontWeight: '800', color: '#854D0E' },
  alertSub:     { fontSize: 12, color: '#92400E', marginTop: 2 },
  alertExpanded:{ backgroundColor: '#FFFBEB', borderRadius: 12, marginHorizontal: 12, marginTop: -6, marginBottom: 10, paddingHorizontal: 14, paddingBottom: 8 },
  alertItem:    { paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  stockBadge:   { backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  stockBadgeTxt:{ color: C.danger, fontWeight: '800', fontSize: 12 },

  // Order bars
  orderBarRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  orderBarIcon:  { fontSize: 16, width: 24 },
  orderBarLabel: { fontSize: 13, color: C.textMid, fontWeight: '600', width: 60 },
  orderBarTrack: { flex: 1, height: 10, backgroundColor: '#F1F5F9', borderRadius: 5, marginHorizontal: 8, overflow: 'hidden' },
  orderBarFill:  { height: '100%', borderRadius: 5 },
  orderBarCount: { width: 28, fontSize: 14, fontWeight: '800', textAlign: 'right' },

  // Table grid
  tableGrid:      { flexDirection: 'row', flexWrap: 'wrap' },
  tableCell: {
    width: (SW - 24 - 48) / 6,
    aspectRatio: 1, margin: 4,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 4,
  },
  tableDot:     { width: 6, height: 6, borderRadius: 3, marginBottom: 3 },
  tableCellNum: { fontSize: 12, fontWeight: '800' },
  tableCellAmt: { fontSize: 8, fontWeight: '600', marginTop: 1 },
  tableDetailRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: C.border,
  },

  // Finance
  financeCard: {
    flex: 1, backgroundColor: '#FAFAFA', borderRadius: 12,
    padding: 12, borderLeftWidth: 4, marginRight: 8,
  },
  financeCardHead: { fontSize: 12, fontWeight: '800', color: C.textMid, marginBottom: 6 },
  financeTotalAmt: { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 8 },
  financeRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  financeMethod:   { fontSize: 12, color: C.textMid, flex: 1 },
  financeAmt:      { fontSize: 12, fontWeight: '700', color: C.textDark },

  // Sellers
  sellerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sellerRank: { fontSize: 14, fontWeight: '800', width: 28 },
  sellerName: { fontSize: 13, fontWeight: '700', color: C.textDark, marginBottom: 4 },
  sellerBarTrack: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  sellerBarFill:  { height: '100%', borderRadius: 3 },
  sellerQty:      { fontSize: 14, fontWeight: '800', color: C.textMid, width: 40, textAlign: 'right' },

  // Goods sold
  goodsRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  goodsChip:   { backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  goodsChipTxt:{ fontSize: 12, color: C.textMid, fontWeight: '600' },
  qtBadge:     { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  qtBadgeTxt:  { color: C.primary, fontWeight: '800', fontSize: 13 },

  // Debts & Payables card
  debtRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  debtIconBox: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  debtLabel:   { fontSize: 13, fontWeight: '700', color: C.textDark },
  debtSub:     { fontSize: 11, color: C.textMuted, marginTop: 2, fontWeight: '500' },
  debtAmt:     { fontSize: 14, fontWeight: '800', textAlign: 'right' },

  // Warehouse
  warehouseCard: {
    flex: 1, borderRadius: 12, padding: 14, alignItems: 'center',
    marginRight: 8, marginBottom: 10,
  },
  whValue: { fontSize: 18, fontWeight: '800', marginTop: 6, marginBottom: 4 },
  whLabel: { fontSize: 12, color: C.textMid, fontWeight: '600' },
  stockValueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10 },
  stockValueLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  stockValueAmt:   { fontSize: 14, fontWeight: '800', color: C.textDark },

  // Staff
  staffRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  staffAvatar:     { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  staffName:       { fontSize: 14, fontWeight: '800', color: C.textDark },
  staffSub:        { fontSize: 12, color: C.textMuted, marginTop: 2 },
  staffOrdersBadge:{ backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  staffOrdersNum:  { fontSize: 16, fontWeight: '800', color: C.primary },
  staffOrdersLabel:{ fontSize: 10, color: C.textMuted, fontWeight: '600' },

  // Quick actions — 2-column grid
  qaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  qaCard: {
    width: (SW - 24 - 32 - 10) / 2,   // (screen - section padding - grid margins) / 2 cols
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    margin: 5,
    ...shadow.sm,
  },
  qaIconBox: {
    width: 44, height: 44,
    borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  qaIconEmoji:  { fontSize: 22 },
  qaCardLabel:  { fontSize: 14, fontWeight: '700', color: C.textDark, marginBottom: 4 },
  qaCardSub:    { fontSize: 11, color: C.textMuted, fontWeight: '500', lineHeight: 15 },

  // ── Bell button
  bellBtn: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: C.danger,
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2, borderColor: C.white,
  },
  bellBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },

  // ── Notification panel (Modal bottom sheet)
  notifBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
  },
  notifPanel: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '72%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 16,
  },
  notifPanelHandle: {
    width: 40, height: 4, borderRadius: 99,
    backgroundColor: C.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  notifPanelHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  notifPanelTitle: { fontSize: 17, fontWeight: '800', color: C.textDark },
  notifPanelSub:   { fontSize: 12, color: C.textMuted, fontWeight: '600', marginTop: 2 },
  markAllBtn: {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, marginRight: 10,
  },
  markAllTxt: { color: C.primary, fontSize: 12, fontWeight: '700' },
  notifCloseBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  notifCloseTxt: { fontSize: 12, color: '#64748b', fontWeight: '700' },

  // ── Notification items
  notifItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  notifItemUnread: { backgroundColor: '#FAFBFF' },
  notifTypeDot: {
    width: 4, borderRadius: 2, alignSelf: 'stretch',
    marginRight: 12, minHeight: 40,
  },
  notifTitle: { fontSize: 14, fontWeight: '600', color: C.textMid, marginBottom: 3 },
  notifBody:  { fontSize: 12, color: C.textMuted, lineHeight: 17, marginBottom: 4 },
  notifTime:  { fontSize: 11, color: C.textMuted, fontWeight: '500' },
  notifUnreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.primary, marginLeft: 10, marginTop: 4, flexShrink: 0,
  },

  // ── Empty state
  notifEmpty: {
    alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32,
  },
  notifEmptyTitle: { fontSize: 16, fontWeight: '800', color: C.textDark, marginBottom: 6 },
  notifEmptyHint:  { fontSize: 13, color: C.textMuted, textAlign: 'center' },
});
