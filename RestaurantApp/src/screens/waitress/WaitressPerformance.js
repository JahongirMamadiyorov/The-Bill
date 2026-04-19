// ════════════════════════════════════════════════════════════════════════════
// WaitressPerformance — full performance + attendance view with date range
// ════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
  Modal, StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { ordersAPI, shiftsAPI, staffPaymentsAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { colors, spacing, radius, shadow, topInset } from '../../utils/theme';

// ── Date helpers ──────────────────────────────────────────────────────────────
const today = new Date();

const fmtDate = (d) => {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};
const TODAY_STR = fmtDate(today);

const getMonday = (d) => {
  const date = new Date(d);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date;
};

const fmtMoney = (n) => Math.round(n || 0).toLocaleString('uz-UZ') + ' so\'m';

const fmtDuration = (mins) => {
  if (!mins || mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

// Localised display date — pulls weekday/month names from i18n. tFn is the
// useTranslation t() function. Falls back to English if no tFn is provided.
const displayDate = (dateStr, tFn) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (!tFn) {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const daysArr   = tFn('datePicker.days',        ['Mo','Tu','We','Th','Fr','Sa','Su']);
  const monthsArr = tFn('datePicker.monthsShort', ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']);
  // JS getDay() is Sun=0..Sat=6 — map to our Mon-first array
  const dayIdx = (d.getDay() + 6) % 7;
  const wd = Array.isArray(daysArr)   ? daysArr[dayIdx]      : '';
  const mn = Array.isArray(monthsArr) ? monthsArr[d.getMonth()] : '';
  return `${wd}, ${mn} ${d.getDate()}`;
};

const STATUS_KEYS = {
  pending:         { k: 'waitress.performance.statusPending',       fb: 'Pending' },
  preparing:       { k: 'waitress.performance.statusPreparing',     fb: 'Preparing' },
  ready:           { k: 'waitress.performance.statusReady',         fb: 'Ready' },
  served:          { k: 'waitress.performance.statusServed',        fb: 'Served' },
  bill_requested:  { k: 'waitress.performance.statusBillRequested', fb: 'Bill Requested' },
  paid:            { k: 'waitress.performance.statusPaid',          fb: 'Paid' },
  cancelled:       { k: 'waitress.performance.statusCancelled',     fb: 'Cancelled' },
};
const labelForStatus = (st, tFn) => {
  const meta = STATUS_KEYS[st];
  if (!meta) return st;
  return tFn ? tFn(meta.k, meta.fb) : meta.fb;
};

// ── Calendar Picker ───────────────────────────────────────────────────────────
function CalendarPicker({ visible, onClose, period, onChange }) {
  const { t } = useTranslation();
  const MONTH_NAMES = t('datePicker.months', [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ]);
  const DAY_HDRS = t('datePicker.days', ['Mo','Tu','We','Th','Fr','Sa','Su']);

  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [tempFrom, setTempFrom]   = useState(period.from);
  const [tempTo, setTempTo]       = useState(period.to);
  const [step, setStep]           = useState('from');

  useEffect(() => {
    if (visible) {
      setTempFrom(period.from);
      setTempTo(period.to);
      setStep('from');
      const d = new Date(period.from);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); }
    else setViewMonth(m => m-1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); }
    else setViewMonth(m => m+1);
  };

  const handleDay = (ds) => {
    if (step === 'from') { setTempFrom(ds); setTempTo(ds); setStep('to'); }
    else {
      if (ds < tempFrom) { setTempTo(tempFrom); setTempFrom(ds); }
      else setTempTo(ds);
      setStep('from');
    }
  };

  const setPreset = (from, to) => {
    setTempFrom(from); setTempTo(to); setStep('from');
    const d = new Date(from);
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  };

  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMon = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) cells.push(fmtDate(new Date(viewYear, viewMonth, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  const presets = [
    { label: t('datePicker.today',                    'Today'),      from: TODAY_STR, to: TODAY_STR },
    { label: t('waitress.performance.thisWeek',       'This Week'),  from: fmtDate(getMonday(today)), to: TODAY_STR },
    { label: t('waitress.performance.thisMonth',      'This Month'), from: fmtDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: TODAY_STR },
    { label: t('waitress.performance.lastMonth',      'Last Month'), from: fmtDate(new Date(today.getFullYear(), today.getMonth()-1, 1)), to: fmtDate(new Date(today.getFullYear(), today.getMonth(), 0)) },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={cal.overlay}>
        <View style={cal.sheet}>
          {/* Header */}
          <View style={cal.header}>
            <MaterialIcons name="calendar-today" size={20} color={colors.primary} />
            <Text style={cal.headerTitle}>{t('waitress.performance.selectPeriod', 'Select Period')}</Text>
            <TouchableOpacity onPress={onClose} style={{ marginLeft: 'auto' }}>
              <MaterialIcons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* FROM / TO pills */}
            <View style={{ flexDirection:'row', marginBottom:12 }}>
              <TouchableOpacity
                onPress={() => setStep('from')}
                style={[cal.pill, step === 'from' && cal.pillActive]}
              >
                <Text style={cal.pillLbl}>{t('waitress.performance.from', 'FROM')}</Text>
                <Text style={cal.pillVal}>{tempFrom}</Text>
              </TouchableOpacity>
              <View style={{ width:24, alignItems:'center', justifyContent:'center' }}>
                <Text style={{ color:colors.textMuted, fontSize:18 }}>→</Text>
              </View>
              <TouchableOpacity
                onPress={() => setStep('to')}
                style={[cal.pill, step === 'to' && cal.pillActive]}
              >
                <Text style={cal.pillLbl}>{t('waitress.performance.to', 'TO')}</Text>
                <Text style={cal.pillVal}>{tempTo}</Text>
              </TouchableOpacity>
            </View>

            {/* Hint */}
            <Text style={cal.hint}>
              {step === 'from'
                ? t('waitress.performance.tapDateToSetStart', 'Tap a date to set start')
                : t('waitress.performance.tapDateToSetEnd',   'Tap a date to set end')}
            </Text>

            {/* Month nav */}
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <TouchableOpacity onPress={prevMonth} style={cal.arrowBtn}>
                <Text style={cal.arrowTxt}>‹</Text>
              </TouchableOpacity>
              <Text style={cal.monthTitle}>{(Array.isArray(MONTH_NAMES) ? MONTH_NAMES[viewMonth] : '')} {viewYear}</Text>
              <TouchableOpacity onPress={nextMonth} style={cal.arrowBtn}>
                <Text style={cal.arrowTxt}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Day headers */}
            <View style={{ flexDirection:'row', marginBottom:4 }}>
              {(Array.isArray(DAY_HDRS) ? DAY_HDRS : ['Mo','Tu','We','Th','Fr','Sa','Su']).map((dh, i) => (
                <View key={`${i}-${dh}`} style={{ flex:1, alignItems:'center', paddingVertical:4 }}>
                  <Text style={cal.dayHdr}>{dh}</Text>
                </View>
              ))}
            </View>

            {/* Calendar grid */}
            {weeks.map((week, wi) => (
              <View key={wi} style={{ flexDirection:'row' }}>
                {week.map((ds, di) => {
                  if (!ds) return <View key={`e${di}`} style={{ flex:1, aspectRatio:1 }} />;
                  const isFrom = ds === tempFrom;
                  const isTo   = ds === tempTo && tempFrom !== tempTo;
                  const inRange = ds > tempFrom && ds < tempTo;
                  const isTodayDs = ds === TODAY_STR;
                  const bg = (isFrom || isTo) ? colors.primary : inRange ? colors.primaryLight : 'transparent';
                  const txCol = (isFrom || isTo) ? '#fff' : inRange ? colors.primary : isTodayDs ? colors.primary : colors.textDark;
                  const fw = (isFrom || isTo || isTodayDs) ? '800' : '400';
                  const roundLeft  = isFrom || (inRange && di === 0);
                  const roundRight = isTo   || (inRange && di === 6);
                  const br = (isFrom || isTo) ? 9 : inRange ? (roundLeft || roundRight ? 9 : 0) : 0;
                  return (
                    <TouchableOpacity
                      key={ds}
                      style={{ flex:1, aspectRatio:1, alignItems:'center', justifyContent:'center', backgroundColor:bg, borderRadius:br }}
                      onPress={() => handleDay(ds)} activeOpacity={0.7}
                    >
                      <Text style={{ fontSize:13, fontWeight:fw, color:txCol }}>
                        {parseInt(ds.split('-')[2], 10)}
                      </Text>
                      {isTodayDs && !isFrom && !isTo && (
                        <View style={{ width:4, height:4, borderRadius:2, backgroundColor:colors.primary, marginTop:1 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {/* Presets */}
            <View style={cal.presets}>
              {presets.map(p => (
                <TouchableOpacity key={p.label} style={cal.presetBtn} onPress={() => setPreset(p.from, p.to)}>
                  <Text style={cal.presetTxt}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Apply */}
            <TouchableOpacity
              style={cal.applyBtn}
              onPress={() => { onChange({ from: tempFrom, to: tempTo }); onClose(); }}
            >
              <Text style={cal.applyTxt}>
                {t('waitress.performance.applyDate', 'Apply: {value}').replace(
                  '{value}',
                  tempFrom === tempTo ? tempFrom : `${tempFrom} → ${tempTo}`
                )}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color = colors.primary, bg = colors.primaryLight, sub }) {
  return (
    <View style={[s.statCard, { borderLeftColor: color }]}>
      <View style={[s.statIcon, { backgroundColor: bg }]}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.statLabel}>{label}</Text>
        <Text style={[s.statVal, { color }]}>{value}</Text>
        {sub ? <Text style={s.statSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, icon }) {
  return (
    <View style={s.sectionHdr}>
      <MaterialIcons name={icon} size={16} color={colors.primary} style={{ marginRight: 6 }} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ════════════════════════════════════════════════════════════════════════════
export default function WaitressPerformance({ navigation }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [period, setPeriod] = useState({
    from: fmtDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: TODAY_STR,
  });
  const [calOpen, setCalOpen] = useState(false);
  const [orders,    setOrders]    = useState([]);
  const [shifts,    setShifts]    = useState([]);
  const [payments,  setPayments]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ordRes, shiftRes, payRes] = await Promise.all([
        ordersAPI.getAll({ from: period.from, to: period.to }),
        shiftsAPI.getAll({ from: period.from, to: period.to }),
        staffPaymentsAPI.getMine({ from: period.from, to: period.to }),
      ]);
      setOrders(Array.isArray(ordRes.data) ? ordRes.data : []);
      setShifts(Array.isArray(shiftRes.data) ? shiftRes.data : []);
      setPayments(Array.isArray(payRes.data) ? payRes.data : []);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [period]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // ── Computed performance stats ────────────────────────────────────────────
  const stats = useMemo(() => {
    // Orders in range (server already filtered, but guard client-side too)
    const fromD = new Date(period.from + 'T00:00:00');
    const toD   = new Date(period.to   + 'T23:59:59');
    const inRange = orders.filter(o => {
      const d = new Date(o.created_at);
      return d >= fromD && d <= toD;
    });

    const paid      = inRange.filter(o => o.status === 'paid');
    const cancelled = inRange.filter(o => o.status === 'cancelled');
    const active    = inRange.filter(o => !['paid','cancelled'].includes(o.status));

    const totalRevenue  = paid.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const tablesServed  = new Set(paid.map(o => o.table_id)).size;
    const totalItems    = paid.reduce((s, o) => s + parseInt(o.item_count || 0, 10), 0);
    // Avg orders per day (over days in range that had at least 1 completed order)
    const daysWithOrders = new Set(paid.map(o => o.created_at?.split('T')[0])).size;
    const avgOrdersPerDay = daysWithOrders > 0 ? (paid.length / daysWithOrders) : 0;

    // Busiest day (by completed orders)
    const byDay = {};
    paid.forEach(o => {
      const day = o.created_at ? o.created_at.split('T')[0] : null;
      if (day) byDay[day] = (byDay[day] || 0) + 1;
    });
    const busiestDay = Object.entries(byDay).sort((a,b) => b[1]-a[1])[0];

    // Status breakdown
    const statusBreakdown = {};
    inRange.forEach(o => {
      statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
    });

    // Per-day list (all days in range that have orders)
    const perDay = Object.entries(byDay)
      .sort(([a],[b]) => b.localeCompare(a))
      .map(([date, cnt]) => {
        const dayOrders = paid.filter(o => o.created_at?.startsWith(date));
        const dayRevenue = dayOrders.reduce((s,o) => s + parseFloat(o.total_amount || 0), 0);
        return { date, cnt, revenue: dayRevenue };
      });

    return { inRange, paid, cancelled, active, totalRevenue, tablesServed, totalItems, avgOrdersPerDay, busiestDay, statusBreakdown, perDay };
  }, [orders, period]);

  // ── Attendance stats ──────────────────────────────────────────────────────
  const attStats = useMemo(() => {
    const fromD = new Date(period.from + 'T00:00:00');
    const toD   = new Date(period.to   + 'T23:59:59');
    const inRange = shifts.filter(s => {
      const d = new Date(s.clock_in || s.shift_date || s.created_at);
      return d >= fromD && d <= toD;
    });

    let totalMins = 0;
    let present = 0, absent = 0, late = 0;

    inRange.forEach(s => {
      const status = (s.status || '').toLowerCase();
      if (status === 'absent') { absent++; return; }
      present++;
      if (status === 'late') late++;
      if (s.clock_in && s.clock_out) {
        const diff = (new Date(s.clock_out) - new Date(s.clock_in)) / 60000;
        if (diff > 0) totalMins += diff;
      } else if (s.hours_worked) {
        totalMins += parseFloat(s.hours_worked) * 60;
      }
    });

    const totalDays  = present + absent;
    const rate       = totalDays ? Math.round((present / totalDays) * 100) : 0;
    const totalHours = Math.round(totalMins / 6) / 10; // 1 decimal
    return { present, absent, late, totalHours, rate, totalDays };
  }, [shifts, period]);

  // Total salary paid by admin in the selected period
  const totalEarned = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  const periodLabel = period.from === period.to
    ? displayDate(period.from, t)
    : `${displayDate(period.from, t)} – ${displayDate(period.to, t)}`;

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>
          {t('waitress.performance.loadingPerformance', 'Loading performance…')}
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ScrollView
        style={s.container}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={s.headerTitle}>{t('waitress.performance.title', 'Performance')}</Text>
            <Text style={s.headerSub}>{user?.name || t('waitress.performance.staff', 'Staff')}</Text>
          </View>
        </View>

        {/* ── Date range picker bar ────────────────────────────────────────── */}
        <TouchableOpacity style={s.periodBar} onPress={() => setCalOpen(true)} activeOpacity={0.85}>
          <MaterialIcons name="calendar-today" size={18} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={s.periodTxt} numberOfLines={1}>{periodLabel}</Text>
          <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.primary} />
        </TouchableOpacity>

        {/* ── Performance stats ────────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionHeader icon="bar-chart" title={t('waitress.performance.sectionPerformanceStats', 'Performance Stats')} />

          {stats.paid.length === 0 ? (
            <View style={s.empty}>
              <MaterialIcons name="assignment" size={40} color={colors.border} />
              <Text style={s.emptyTxt}>{t('waitress.performance.noCompletedOrders', 'No completed orders in this period')}</Text>
            </View>
          ) : (
            <>
              <View style={s.summaryGrid}>
                <SummaryTile label={t('waitress.performance.tablesServed',   'Tables Served')}     value={stats.tablesServed}     color="#D97706"        icon="table-restaurant" />
                <SummaryTile label={t('waitress.performance.ordersCompleted','Orders Completed')}  value={stats.paid.length}      color="#16A34A"        icon="check-circle" />
                <SummaryTile label={t('waitress.performance.itemsServed',    'Items Served')}      value={stats.totalItems}       color={colors.primary} icon="restaurant-menu" />
                <SummaryTile label={t('waitress.performance.cancelled',      'Cancelled')}         value={stats.cancelled.length} color="#DC2626"        icon="cancel" />
              </View>

              <StatCard
                icon="payments"
                label={t('waitress.performance.totalEarned', 'Total Earned')}
                value={fmtMoney(totalEarned)}
                color="#16A34A" bg="#DCFCE7"
                sub={t('waitress.performance.salaryPaidSub', 'Salary paid by admin in period')}
              />
              <StatCard
                icon="show-chart"
                label={t('waitress.performance.avgOrdersPerDay', 'Avg Orders / Day')}
                value={stats.avgOrdersPerDay.toFixed(1)}
                color={colors.primary} bg={colors.primaryLight}
                sub={t('waitress.performance.overActiveDays', 'Over {count} active day(s)').replace(
                  '{count}',
                  String(new Set(stats.paid.map(o => o.created_at?.split('T')[0])).size)
                )}
              />
              {stats.busiestDay && (
                <StatCard
                  icon="trending-up"
                  label={t('waitress.performance.busiestDay', 'Busiest Day')}
                  value={displayDate(stats.busiestDay[0], t)}
                  color="#7C3AED" bg="#F5F3FF"
                  sub={
                    stats.busiestDay[1] === 1
                      ? t('waitress.performance.completedOrderOne', '1 completed order')
                      : t('waitress.performance.completedOrdersCount', '{count} completed orders').replace('{count}', String(stats.busiestDay[1]))
                  }
                />
              )}
            </>
          )}
        </View>

        {/* ── Status breakdown ─────────────────────────────────────────────── */}
        {Object.keys(stats.statusBreakdown).length > 0 && (
          <View style={s.section}>
            <SectionHeader icon="pie-chart" title={t('waitress.performance.sectionBreakdownByStatus', 'Breakdown by Status')} />
            <View style={s.card}>
              {Object.entries(stats.statusBreakdown).map(([st, cnt], i, arr) => (
                <View key={st} style={[s.statusRow, i === arr.length-1 && { borderBottomWidth: 0 }]}>
                  <Text style={s.statusLbl}>{labelForStatus(st, t)}</Text>
                  <View style={s.statusRight}>
                    <View style={[s.statusBar, { width: Math.max(4, (cnt / stats.inRange.length) * 120) }]} />
                    <Text style={s.statusCnt}>{cnt}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Attendance summary ────────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionHeader icon="schedule" title={t('waitress.performance.sectionAttendance', 'Attendance')} />
          {attStats.totalDays === 0 ? (
            <View style={s.empty}>
              <MaterialIcons name="event-busy" size={40} color={colors.border} />
              <Text style={s.emptyTxt}>{t('waitress.performance.noAttendanceRecords', 'No attendance records in this period')}</Text>
            </View>
          ) : (
            <>
              <View style={s.summaryGrid}>
                <SummaryTile label={t('waitress.performance.daysPresent',  'Days Present')}  value={attStats.present}            color="#16A34A"        icon="event-available" />
                <SummaryTile label={t('waitress.performance.daysAbsent',   'Days Absent')}   value={attStats.absent}             color="#DC2626"        icon="event-busy" />
                <SummaryTile label={t('waitress.performance.lateArrivals', 'Late Arrivals')} value={attStats.late}               color="#D97706"        icon="alarm" />
                <SummaryTile label={t('waitress.performance.totalHours',   'Total Hours')}   value={`${attStats.totalHours}h`}   color={colors.primary} icon="access-time" />
              </View>

              <StatCard
                icon="check-circle"
                label={t('waitress.performance.attendanceRate', 'Attendance Rate')}
                value={`${attStats.rate}%`}
                color={attStats.rate >= 85 ? '#16A34A' : attStats.rate >= 70 ? '#D97706' : '#DC2626'}
                bg={attStats.rate >= 85 ? '#DCFCE7' : attStats.rate >= 70 ? '#FEF3C7' : '#FEE2E2'}
                sub={t('waitress.performance.workingDaysSub', '{present} of {total} working days')
                  .replace('{present}', String(attStats.present))
                  .replace('{total}',   String(attStats.totalDays))}
              />
            </>
          )}
        </View>

        {/* ── Per-day breakdown ─────────────────────────────────────────────── */}
        {stats.perDay.length > 0 && (
          <View style={s.section}>
            <SectionHeader icon="view-list" title={t('waitress.performance.sectionDailyBreakdown', 'Daily Breakdown')} />
            <View style={s.card}>
              {stats.perDay.map((day, i) => (
                <View key={day.date} style={[s.dayRow, i === stats.perDay.length-1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.dayDate}>{displayDate(day.date, t)}</Text>
                    <Text style={s.dayOrders}>
                      {day.cnt === 1
                        ? t('waitress.performance.oneOrderCompletedDay', '1 order completed')
                        : t('waitress.performance.ordersCompletedDay', '{count} orders completed').replace('{count}', String(day.cnt))}
                    </Text>
                  </View>
                  <Text style={s.dayRevenue}>{fmtMoney(day.revenue)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <CalendarPicker
        visible={calOpen}
        onClose={() => setCalOpen(false)}
        period={period}
        onChange={(p) => { setPeriod(p); setCalOpen(false); }}
      />
    </>
  );
}

// ── Summary tile ──────────────────────────────────────────────────────────────
function SummaryTile({ icon, label, value, color }) {
  return (
    <View style={[s.sumTile]}>
      <MaterialIcons name={icon} size={20} color={color} style={{ marginBottom: 6 }} />
      <Text style={[s.sumVal, { color }]}>{value}</Text>
      <Text style={s.sumLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:    { backgroundColor: colors.primary, paddingTop: topInset + 8, paddingBottom: 20, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center' },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.white },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  periodBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: radius.lg, padding: spacing.md, paddingHorizontal: spacing.lg, ...shadow.card, borderWidth: 1.5, borderColor: colors.primary + '40' },
  periodTxt: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textDark },

  section:    { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionHdr: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md, gap: spacing.sm },
  sumTile:     { flex: 1, minWidth: '45%', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', ...shadow.card },
  sumVal:      { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  sumLabel:    { fontSize: 11, color: colors.textMuted, fontWeight: '600', textAlign: 'center' },

  statCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadow.card, borderLeftWidth: 4 },
  statIcon:   { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  statLabel:  { fontSize: 12, color: colors.textMuted, fontWeight: '600', marginBottom: 2 },
  statVal:    { fontSize: 16, fontWeight: '800' },
  statSub:    { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, ...shadow.card, overflow: 'hidden' },

  statusRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  statusLbl:   { fontSize: 13, fontWeight: '600', color: colors.textDark, flex: 1 },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBar:   { height: 6, borderRadius: 3, backgroundColor: colors.primary + '60' },
  statusCnt:   { fontSize: 14, fontWeight: '800', color: colors.textDark, minWidth: 24, textAlign: 'right' },

  dayRow:     { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayDate:    { fontSize: 14, fontWeight: '700', color: colors.textDark },
  dayOrders:  { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  dayRevenue: { fontSize: 14, fontWeight: '800', color: '#16A34A' },

  empty:    { alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xxl, ...shadow.card },
  emptyTxt: { fontSize: 14, color: colors.textMuted, fontWeight: '600', marginTop: spacing.md, textAlign: 'center' },
});

// ── Calendar styles ───────────────────────────────────────────────────────────
const cal = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  header:      { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.textDark, marginLeft: 8 },
  pill:        { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, borderWidth: 2, borderColor: colors.border },
  pillActive:  { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  pillLbl:     { fontSize: 10, color: colors.textMuted, fontWeight: '700', marginBottom: 2 },
  pillVal:     { fontSize: 14, fontWeight: '800', color: colors.textDark },
  hint:        { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginBottom: 14 },
  arrowBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  arrowTxt:    { fontSize: 24, color: colors.primary, fontWeight: '700', lineHeight: 28 },
  monthTitle:  { fontSize: 17, fontWeight: '800', color: colors.textDark },
  dayHdr:      { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  presets:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.lg, marginBottom: spacing.md },
  presetBtn:   { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.primary },
  presetTxt:   { color: colors.primary, fontWeight: '700', fontSize: 13 },
  applyBtn:    { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm },
  applyTxt:    { color: colors.white, fontWeight: '700', fontSize: 15 },
});
