import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { usersAPI, reportsAPI, shiftsAPI, staffPaymentsAPI } from '../../api/client';
import { OwnerPeriodBar, OwnerCalendarPicker, TODAY_STR } from '../../components/OwnerPeriodPicker';
import OwnerStaffDetail from './OwnerStaffDetail';
import OwnerPageHeader from '../../components/OwnerPageHeader';

const P  = '#7C3AED';
const PL = '#F5F3FF';

const money = v => {
  const n = Math.round(Number(v) || 0);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
};

const _now = new Date();
const DEFAULT_PERIOD = {
  from: `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-01`,
  to: TODAY_STR,
};

const ROLE_COLORS = {
  owner:    { bg: '#F5F3FF', text: '#7C3AED' },
  admin:    { bg: '#EFF6FF', text: '#2563EB' },
  manager:  { bg: '#F5F3FF', text: '#7C3AED' },
  waitress: { bg: '#DCFCE7', text: '#16A34A' },
  kitchen:  { bg: '#FFF7ED', text: '#EA580C' },
  cashier:  { bg: '#ECFEFF', text: '#0891B2' },
  cleaner:  { bg: '#F1F5F9', text: '#475569' },
};
const roleColor = r => ROLE_COLORS[(r || '').toLowerCase()] || { bg: '#F3F4F6', text: '#6B7280' };

// Nav bar role tabs — owner first
const NAV_ROLES = [
  { key: 'all',      label: 'All',      icon: 'people'               },
  { key: 'owner',    label: 'Owner',    icon: 'star'                 },
  { key: 'waitress', label: 'Waitress', icon: 'room-service'         },
  { key: 'kitchen',  label: 'Kitchen',  icon: 'soup-kitchen'         },
  { key: 'cashier',  label: 'Cashier',  icon: 'point-of-sale'        },
  { key: 'admin',    label: 'Admin',    icon: 'admin-panel-settings' },
  { key: 'manager',  label: 'Manager',  icon: 'manage-accounts'      },
  { key: 'cleaner',  label: 'Cleaner',  icon: 'cleaning-services'    },
];

// ── Role-specific right-side card content ─────────────────────────────────────
function CardRight({ role, perf, pr, cashierEntry, kitchenEntry }) {
  if (role === 'waitress') {
    if (perf && parseInt(perf.total_orders || 0) > 0) {
      return (
        <>
          <Text style={st.cardRightTop}>Orders: {perf.total_orders}</Text>
          <Text style={st.cardRightBot}>{money(perf.total_sales)}</Text>
        </>
      );
    }
    return <Text style={st.noData}>No orders yet</Text>;
  }

  if (role === 'kitchen') {
    // kitchenEntry has station-specific orders + avg cook time
    if (kitchenEntry) {
      const avgMin = parseFloat(kitchenEntry.avg_minutes || 0);
      return (
        <>
          <Text style={st.cardRightTop}>{kitchenEntry.orders_count} orders</Text>
          <Text style={st.cardRightBot}>
            {avgMin > 0 ? `~${avgMin.toFixed(0)} min/dish` : 'No cook time data'}
          </Text>
        </>
      );
    }
    // fallback: show shift data
    if (pr && parseInt(pr.shift_count || 0) > 0) {
      return (
        <>
          <Text style={st.cardRightTop}>{pr.shift_count} shifts</Text>
          <Text style={st.cardRightBot}>{parseFloat(pr.total_hours || 0).toFixed(1)}h</Text>
        </>
      );
    }
    return <Text style={st.noData}>No data yet</Text>;
  }

  if (role === 'cashier') {
    const orders = cashierEntry ? parseInt(cashierEntry.orders_count || 0) : 0;
    const days   = pr ? parseInt(pr.shift_count || 0) : 0;
    if (orders > 0 || days > 0) {
      return (
        <>
          {orders > 0 && <Text style={st.cardRightTop}>{orders} orders</Text>}
          {days   > 0 && <Text style={st.cardRightBot}>{days} day{days !== 1 ? 's' : ''} worked</Text>}
          {orders === 0 && days === 0 && <Text style={st.noData}>No data yet</Text>}
        </>
      );
    }
    return <Text style={st.noData}>No data yet</Text>;
  }

  if (role === 'admin' || role === 'manager') {
    if (pr && (parseInt(pr.shift_count || 0) > 0 || parseFloat(pr.total_hours || 0) > 0)) {
      return (
        <>
          <Text style={st.cardRightTop}>{pr.shift_count} days worked</Text>
          <Text style={st.cardRightBot}>{parseFloat(pr.total_hours || 0).toFixed(1)}h total</Text>
        </>
      );
    }
    return <Text style={st.noData}>No records yet</Text>;
  }

  if (role === 'cleaner') {
    if (pr && (parseInt(pr.shift_count || 0) > 0 || parseFloat(pr.total_hours || 0) > 0)) {
      return (
        <>
          <Text style={st.cardRightTop}>{pr.shift_count} shifts</Text>
          <Text style={st.cardRightBot}>{parseFloat(pr.total_hours || 0).toFixed(1)}h</Text>
        </>
      );
    }
    return <Text style={st.noData}>No shifts yet</Text>;
  }

  // owner — nothing meaningful
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function OwnerStaff() {
  const [activeTab,        setActiveTab]        = useState('Performance');
  const [activeRole,       setActiveRole]        = useState('all');   // nav bar filter

  const [staff,            setStaff]            = useState([]);
  const [performance,      setPerformance]       = useState([]);  // waitress perf
  const [perfPayroll,      setPerfPayroll]       = useState([]);  // all-role payroll for Perf tab
  const [cashierStats,     setCashierStats]      = useState([]);
  const [kitchenStats,     setKitchenStats]      = useState([]);  // [{station, orders_count, avg_minutes}]
  const [perfPeriod,       setPerfPeriod]        = useState(DEFAULT_PERIOD);
  const [showPerfPicker,   setShowPerfPicker]    = useState(false);

  const [payroll,          setPayroll]           = useState([]);
  const [payments,         setPayments]          = useState([]);
  const [payrollPeriod,    setPayrollPeriod]     = useState(DEFAULT_PERIOD);
  const [showPayrollPicker,setShowPayrollPicker] = useState(false);

  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [error,          setError]          = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [attendanceMap,  setAttendanceMap]  = useState({});  // user_id → shift status row

  useEffect(() => { fetchStaff(); }, []);

  useEffect(() => {
    if (activeTab === 'Performance') fetchPerformance();
  }, [perfPeriod, activeTab]);

  useEffect(() => {
    if (activeTab === 'Payroll') {
      fetchPayroll();
      fetchPayments();
    }
  }, [payrollPeriod, activeTab]);

  // ── Lightweight attendance-only refresh ──────────────────────────────────────
  // Separate from fetchStaff so we can poll attendance every 30s without
  // reloading the full user list each time.
  const fetchAttendance = useCallback(async () => {
    try {
      const attRes = await shiftsAPI.getStaffStatus();
      const attArr = Array.isArray(attRes.data) ? attRes.data : [];
      const map = {};
      attArr.forEach(a => { map[a.user_id] = a; });
      setAttendanceMap(map);
    } catch {
      // silently ignore — stale data is better than crashing
    }
  }, []);

  // Refresh attendance every time this tab gains focus (e.g. owner switches
  // back from Home, or admin just clocked someone in).
  useFocusEffect(
    useCallback(() => {
      fetchAttendance();
      // Also set up a 30-second live-refresh interval while the screen is visible
      const interval = setInterval(fetchAttendance, 10000);
      return () => clearInterval(interval); // clean up when screen loses focus
    }, [fetchAttendance])
  );

  // ── fetchers ────────────────────────────────────────────────────────────────
  const fetchStaff = useCallback(async () => {
    try {
      setError('');
      const [usersRes, attRes] = await Promise.all([
        usersAPI.getAll(),
        shiftsAPI.getStaffStatus().catch(() => ({ data: [] })),
      ]);
      setStaff(Array.isArray(usersRes.data) ? usersRes.data.filter(u => u.is_active !== false) : []);
      // Build map: user_id → attendance row
      const attArr = Array.isArray(attRes.data) ? attRes.data : [];
      const map = {};
      attArr.forEach(a => { map[a.user_id] = a; });
      setAttendanceMap(map);
    } catch {
      setError('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPerformance = useCallback(async () => {
    try {
      setError('');
      const params = { from: perfPeriod.from, to: perfPeriod.to };
      const [perfRes, prRes, cashRes, kitRes] = await Promise.all([
        reportsAPI.getWaitressPerformance(params),
        shiftsAPI.getPayroll(params),
        reportsAPI.getCashierStats(params),
        reportsAPI.getKitchenStats(params),
      ]);
      setPerformance(Array.isArray(perfRes.data)    ? perfRes.data    : []);
      setPerfPayroll(Array.isArray(prRes.data)       ? prRes.data      : []);
      setCashierStats(Array.isArray(cashRes.data)   ? cashRes.data    : []);
      setKitchenStats(Array.isArray(kitRes.data)    ? kitRes.data     : []);
    } catch {
      setError('Failed to load performance data');
    }
  }, [perfPeriod]);

  const fetchPayroll = useCallback(async () => {
    try {
      setError('');
      const res = await shiftsAPI.getPayroll({ from: payrollPeriod.from, to: payrollPeriod.to });
      setPayroll(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError('Failed to load payroll data');
    }
  }, [payrollPeriod]);

  const fetchPayments = useCallback(async () => {
    try {
      const res = await staffPaymentsAPI.getAll();
      setPayments(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError('Failed to load payments');
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // fetchStaff also refreshes attendance map
      await fetchStaff();
      if (activeTab === 'Performance') await fetchPerformance();
      if (activeTab === 'Payroll') await Promise.all([fetchPayroll(), fetchPayments()]);
    } finally {
      setRefreshing(false);
    }
  }, [activeTab, fetchStaff, fetchPerformance, fetchPayroll, fetchPayments]);

  // ── derived lists ────────────────────────────────────────────────────────────
  // owner always first, then alphabetical within each role
  const sortedStaff = useMemo(() =>
    [...staff].sort((a, b) => {
      const roleOrder = { owner: 0, admin: 1, manager: 2, waitress: 3, kitchen: 4, cashier: 5, cleaner: 6 };
      const ra = roleOrder[(a.role || '').toLowerCase()] ?? 99;
      const rb = roleOrder[(b.role || '').toLowerCase()] ?? 99;
      if (ra !== rb) return ra - rb;
      return (a.name || '').localeCompare(b.name || '');
    }),
    [staff]
  );

  const filteredStaff = useMemo(() =>
    activeRole === 'all'
      ? sortedStaff
      : sortedStaff.filter(s => (s.role || '').toLowerCase() === activeRole),
    [sortedStaff, activeRole]
  );

  // available role tabs (only roles that have at least one staff member)
  const availableRoles = useMemo(() => {
    const existingRoles = new Set(staff.map(s => (s.role || '').toLowerCase()));
    return NAV_ROLES.filter(r => r.key === 'all' || existingRoles.has(r.key));
  }, [staff]);

  // payroll with debts for Payroll tab
  const payrollWithDebts = useMemo(() =>
    payroll.map(entry => {
      const paid  = payments
        .filter(p => p.user_id === entry.id || p.staff_name === entry.name)
        .reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      return { ...entry, totalPaid: paid, debt: parseFloat(entry.gross_pay || 0) - paid };
    }),
    [payroll, payments]
  );

  // ── Performance tab ─────────────────────────────────────────────────────────
  const renderPerformanceTab = () => (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P} />}
      style={st.scrollView}
      showsVerticalScrollIndicator={false}
    >
      {/* Active staff summary */}
      <View style={st.summaryCard}>
        <MaterialIcons name="people" size={20} color={P} />
        <Text style={st.summaryText}>
          {filteredStaff.length} {activeRole === 'all' ? 'Active Staff' : `${activeRole.charAt(0).toUpperCase() + activeRole.slice(1)} Staff`}
        </Text>
      </View>

      {/* Staff list */}
      {filteredStaff.map(member => {
        const role  = (member.role || '').toLowerCase();
        const rc    = roleColor(role);
        const perf  = performance.find(p => p.name === member.name);
        const pr    = perfPayroll.find(p => p.id === member.id || p.name === member.name);
        const cashierEntry = cashierStats.find(c => c.id === member.id || c.name === member.name);
        const kitchenEntry = kitchenStats.find(k =>
          k.station === member.kitchen_station ||
          (!member.kitchen_station && k.station === 'general')
        );
        const att = attendanceMap[member.id];
        const attStatus = att
          // Active clock-in (no clock-out yet)
          ? (att.clock_in && !att.clock_out
              ? (att.status === 'late' ? 'late' : 'on_duty')
            // Completed shift (clocked out)
            : att.clock_in && att.clock_out
              ? 'done'
            // Explicit absence record (backend sends status:'absent' when shift_id exists but no clock_in)
            : att.status === 'absent'
              ? 'absent'
            // 'off' from backend = no record yet, staff hasn't started
            : 'off')
          : 'off';
        const attDot = { on_duty: '#10B981', late: '#F59E0B', done: '#3B82F6', absent: '#EF4444', off: '#D1D5DB' }[attStatus];
        const attLabel = { on_duty: 'On Duty', late: 'Late', done: 'Done', absent: 'Absent', off: 'Off' }[attStatus];

        return (
          <Pressable
            key={String(member.id)}
            style={({ pressed }) => [st.staffCard, pressed && { opacity: 0.75 }]}
            onPress={() => setSelectedMember(member)}
          >
            <View style={[st.avatar, { backgroundColor: rc.bg }]}>
              <Text style={[st.avatarText, { color: rc.text }]}>
                {(member.name || '')[0]?.toUpperCase()}
              </Text>
            </View>
            <View style={st.staffCenter}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={st.staffName}>{member.name}</Text>
                <View style={[st.attBadge, { backgroundColor: attDot + '22', borderColor: attDot + '66' }]}>
                  <View style={[st.attDot, { backgroundColor: attDot }]} />
                  <Text style={[st.attLabel, { color: attDot }]}>{attLabel}</Text>
                </View>
              </View>
              <View style={[st.rolePill, { backgroundColor: rc.bg }]}>
                <Text style={[st.rolePillText, { color: rc.text }]}>{member.role}</Text>
              </View>
              {role === 'kitchen' && member.kitchen_station ? (
                <Text style={st.staffSub}>{member.kitchen_station}</Text>
              ) : null}
            </View>
            <View style={st.staffRight}>
              <CardRight
                role={role}
                perf={perf}
                pr={pr}
                cashierEntry={cashierEntry}
                kitchenEntry={kitchenEntry}
              />
              <MaterialIcons name="chevron-right" size={18} color="#D1D5DB" style={{ marginTop: 4 }} />
            </View>
          </Pressable>
        );
      })}

      {filteredStaff.length === 0 && (
        <View style={st.emptyState}>
          <MaterialIcons name="people-outline" size={52} color="#D1D5DB" />
          <Text style={st.emptyText}>No staff in this category</Text>
        </View>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>
  );

  // ── Payroll tab ─────────────────────────────────────────────────────────────
  const renderPayrollTab = () => (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P} />}
      style={st.scrollView}
      showsVerticalScrollIndicator={false}
    >
      {payrollWithDebts.length === 0 ? (
        <View style={st.emptyState}>
          <MaterialIcons name="work-history" size={52} color="#D1D5DB" />
          <Text style={st.emptyText}>No payroll data for this period</Text>
        </View>
      ) : (
        payrollWithDebts.map((entry, idx) => {
          const rc = roleColor(entry.role);
          const matchedMember = staff.find(s => s.id === entry.id || s.name === entry.name);
          return (
            <Pressable
              key={entry.id ? String(entry.id) : String(idx)}
              style={({ pressed }) => [st.payrollCard, pressed && { opacity: 0.75 }]}
              onPress={() => matchedMember && setSelectedMember(matchedMember)}
            >
              <View style={st.payrollHeader}>
                <View style={[st.avatar, { backgroundColor: rc.bg }]}>
                  <Text style={[st.avatarText, { color: rc.text }]}>
                    {(entry.name || '')[0]?.toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={st.payrollName}>{entry.name}</Text>
                  <View style={[st.rolePill, { backgroundColor: rc.bg }]}>
                    <Text style={[st.rolePillText, { color: rc.text }]}>{entry.role}</Text>
                  </View>
                </View>
              </View>
              <View style={st.payrollInfoRow}>
                <Text style={st.payrollInfo}>{entry.shift_count} shifts</Text>
                <Text style={st.payrollInfo}>{parseFloat(entry.total_hours || 0).toFixed(1)}h</Text>
                <Text style={st.payrollInfo}>
                  {entry.salary_type === 'monthly' ? 'Monthly' : 'Earned'}: {money(entry.gross_pay)}
                </Text>
              </View>
              <View style={st.divider} />
              <View style={st.payrollFinanceRow}>
                <Text style={st.payrollFinance}>Paid: {money(entry.totalPaid)}</Text>
                {entry.debt > 0 ? (
                  <Text style={[st.payrollFinance, { color: '#D97706' }]}>Owes: {money(entry.debt)}</Text>
                ) : entry.debt < 0 ? (
                  <Text style={[st.payrollFinance, { color: '#DC2626' }]}>Overpaid: {money(Math.abs(entry.debt))}</Text>
                ) : (
                  <Text style={[st.payrollFinance, { color: '#16A34A' }]}>✓ Settled</Text>
                )}
                <MaterialIcons name="chevron-right" size={16} color="#D1D5DB" />
              </View>
            </Pressable>
          );
        })
      )}
      <View style={{ height: 20 }} />
    </ScrollView>
  );

  // ── loading state ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={st.container}>
        <OwnerPageHeader icon="people" title="Staff" subtitle="Team overview & payroll" />
        <View style={st.loadingContainer}>
          <ActivityIndicator size="large" color={P} />
        </View>
      </View>
    );
  }

  return (
    <View style={st.container}>
      {/* ── Header ── */}
      <OwnerPageHeader icon="people" title="Staff" subtitle="Team overview & payroll">
        <View style={st.tabSwitcher}>
          <Pressable
            style={[st.tabBtn, activeTab === 'Performance' && st.tabBtnActive]}
            onPress={() => setActiveTab('Performance')}
          >
            <Text style={[st.tabText, activeTab === 'Performance' && st.tabTextActive]}>Performance</Text>
          </Pressable>
          <Pressable
            style={[st.tabBtn, activeTab === 'Payroll' && st.tabBtnActive]}
            onPress={() => setActiveTab('Payroll')}
          >
            <Text style={[st.tabText, activeTab === 'Payroll' && st.tabTextActive]}>Payroll</Text>
          </Pressable>
        </View>
      </OwnerPageHeader>

      {/* ── Period bar ── */}
      {activeTab === 'Performance' && (
        <OwnerPeriodBar period={perfPeriod} onOpen={() => setShowPerfPicker(true)} />
      )}
      {activeTab === 'Payroll' && (
        <OwnerPeriodBar period={payrollPeriod} onOpen={() => setShowPayrollPicker(true)} />
      )}

      {/* ── Role nav bar (Performance tab only) ── */}
      {activeTab === 'Performance' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={st.roleNav}
          contentContainerStyle={st.roleNavContent}
        >
          {availableRoles.map(r => {
            const isActive = activeRole === r.key;
            const rc = r.key === 'all' ? { bg: PL, text: P } : roleColor(r.key);
            return (
              <Pressable
                key={r.key}
                onPress={() => setActiveRole(r.key)}
                style={[
                  st.roleChip,
                  isActive && { backgroundColor: rc.bg, borderColor: rc.text },
                  !isActive && { backgroundColor: '#F8FAFC', borderColor: '#E5E7EB' },
                ]}
              >
                <MaterialIcons
                  name={r.icon}
                  size={13}
                  color={isActive ? rc.text : '#9CA3AF'}
                />
                <Text style={[st.roleChipText, { color: isActive ? rc.text : '#6B7280' }]}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {error ? (
        <View style={st.errorBanner}>
          <MaterialIcons name="error-outline" size={20} color="#DC2626" />
          <Text style={st.errorText}>{error}</Text>
        </View>
      ) : null}

      {activeTab === 'Performance' && renderPerformanceTab()}
      {activeTab === 'Payroll'     && renderPayrollTab()}

      <OwnerCalendarPicker
        visible={showPerfPicker}
        onClose={() => setShowPerfPicker(false)}
        period={perfPeriod}
        onChange={p => { setPerfPeriod(p); setShowPerfPicker(false); }}
      />
      <OwnerCalendarPicker
        visible={showPayrollPicker}
        onClose={() => setShowPayrollPicker(false)}
        period={payrollPeriod}
        onChange={p => { setPayrollPeriod(p); setShowPayrollPicker(false); }}
      />

      <OwnerStaffDetail
        visible={!!selectedMember}
        onClose={() => setSelectedMember(null)}
        member={selectedMember}
      />
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F8FAFC' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // header
  tabSwitcher: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', marginHorizontal: 16 },
  tabBtn:        { flex: 1, paddingBottom: 12, alignItems: 'center' },
  tabBtnActive:  { borderBottomWidth: 2, borderBottomColor: '#FFF' },
  tabText:       { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  tabTextActive: { color: '#FFF', fontWeight: '700' },

  // role nav bar
  roleNav:        { maxHeight: 50, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  roleNavContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  roleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  roleChipText: { fontSize: 12, fontWeight: '700' },

  // content scroll
  scrollView: { flex: 1, paddingHorizontal: 14, paddingTop: 12 },

  // summary chip
  summaryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: PL,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10, marginBottom: 14,
  },
  summaryText: { fontSize: 14, fontWeight: '600', color: P, marginLeft: 8 },

  // staff card
  staffCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 14,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 3, elevation: 2,
  },
  avatar:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText:  { fontSize: 17, fontWeight: '800' },
  staffCenter: { flex: 1 },
  staffName:   { fontSize: 15, fontWeight: '700', color: '#111827' },
  staffSub:    { fontSize: 11, color: '#9CA3AF', marginTop: 1, fontWeight: '500' },
  attBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  attDot:      { width: 5, height: 5, borderRadius: 3 },
  attLabel:    { fontSize: 10, fontWeight: '700' },
  rolePill:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginTop: 3 },
  rolePillText:{ fontSize: 11, fontWeight: '600' },
  staffRight:  { alignItems: 'flex-end', justifyContent: 'center', marginLeft: 8 },
  cardRightTop:{ fontSize: 12, fontWeight: '700', color: P, marginBottom: 2 },
  cardRightBot:{ fontSize: 12, fontWeight: '700', color: '#111827' },
  noData:      { fontSize: 12, color: '#9CA3AF' },

  // payroll card
  payrollCard:   {
    backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2,
  },
  payrollHeader:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  payrollName:      { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  payrollInfoRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  payrollInfo:      { fontSize: 12, color: '#6B7280' },
  divider:          { height: 1, backgroundColor: '#F3F4F6', marginBottom: 10 },
  payrollFinanceRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payrollFinance:   { fontSize: 13, fontWeight: '600', color: '#111827' },

  // empty / error
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText:  { fontSize: 14, color: '#9CA3AF', marginTop: 12 },
  errorBanner: {
    flexDirection: 'row', backgroundColor: '#FEF2F2',
    borderLeftWidth: 4, borderLeftColor: '#DC2626',
    paddingHorizontal: 12, paddingVertical: 10,
    marginHorizontal: 14, marginTop: 10, borderRadius: 6, alignItems: 'center',
  },
  errorText: { fontSize: 13, color: '#DC2626', marginLeft: 10, flex: 1 },
});
