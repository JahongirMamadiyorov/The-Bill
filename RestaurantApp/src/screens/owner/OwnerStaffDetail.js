import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Modal, ActivityIndicator, Platform, StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { reportsAPI, shiftsAPI, staffPaymentsAPI, ordersAPI } from '../../api/client';
import { OwnerPeriodBar, OwnerCalendarPicker, TODAY_STR } from '../../components/OwnerPeriodPicker';
import { useTranslation } from '../../context/LanguageContext';

// ─── constants ────────────────────────────────────────────────────────────────
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

const ROLE_META = {
  admin:    { bg: '#EFF6FF', text: '#2563EB', icon: 'admin-panel-settings', label: 'Admin'    },
  waitress: { bg: '#DCFCE7', text: '#16A34A', icon: 'room-service',         label: 'Waitress' },
  kitchen:  { bg: '#FFF7ED', text: '#EA580C', icon: 'soup-kitchen',         label: 'Kitchen'  },
  cashier:  { bg: '#ECFEFF', text: '#0891B2', icon: 'point-of-sale',        label: 'Cashier'  },
  manager:  { bg: '#F5F3FF', text: '#7C3AED', icon: 'manage-accounts',      label: 'Manager'  },
  cleaner:  { bg: '#F1F5F9', text: '#475569', icon: 'cleaning-services',    label: 'Cleaner'  },
  owner:    { bg: '#F5F3FF', text: '#7C3AED', icon: 'star',                 label: 'Owner'    },
};
const roleMeta = r => ROLE_META[(r || '').toLowerCase()] || { bg: '#F3F4F6', text: '#6B7280', icon: 'person', label: r };

const topPad = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;

const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('uz-UZ') : '—';
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : '—';

// ─── shared sub-components ────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }) {
  return (
    <View style={st.statCard}>
      <MaterialIcons name={icon} size={24} color={color || P} />
      <Text style={st.statValue}>{value ?? '—'}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

function SectionCard({ icon, title, children }) {
  const rm = ROLE_META[icon] ? null : icon; // icon is a MaterialIcons name
  return (
    <View style={st.card}>
      <View style={st.cardHeader}>
        <View style={st.cardIconBox}>
          <MaterialIcons name={icon} size={14} color={P} />
        </View>
        <Text style={st.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoRow({ label, value, valueStyle, highlight }) {
  return (
    <View style={[st.infoRow, highlight && st.infoRowHighlight]}>
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={[st.infoValue, valueStyle]}>{value ?? '—'}</Text>
    </View>
  );
}

function EmptyState({ icon, text }) {
  return (
    <View style={st.emptyBox}>
      <MaterialIcons name={icon} size={32} color="#E5E7EB" />
      <Text style={st.emptyText}>{text}</Text>
    </View>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function OwnerStaffDetail({ visible, onClose, member }) {
  const { t } = useTranslation();
  const [period,     setPeriod]     = useState(DEFAULT_PERIOD);
  const [showPicker, setShowPicker] = useState(false);

  // data states
  const [performance,  setPerformance]  = useState(null);  // waitress sales
  const [payroll,      setPayroll]      = useState(null);  // hours × rate
  const [payments,     setPayments]     = useState([]);    // salary payments
  const [shifts,       setShifts]       = useState([]);    // shift log
  const [staffOrders,  setStaffOrders]  = useState([]);    // orders by this member
  const [loading,      setLoading]      = useState(true);

  const role = (member?.role || '').toLowerCase();

  // reset when new member opens
  useEffect(() => {
    if (visible && member) setPeriod(DEFAULT_PERIOD);
  }, [visible, member?.id]);

  const fetchAll = useCallback(async () => {
    if (!member) return;
    setLoading(true);
    try {
      // Always fetch: payroll summary, shift log, staff payments
      const always = [
        shiftsAPI.getPayroll({ from: period.from, to: period.to }),
        shiftsAPI.getAll({ user_id: member.id, from: period.from, to: period.to }),
        staffPaymentsAPI.getAll(),
      ];

      // Role-specific fetch
      const roleSpecific = [];
      if (role === 'waitress' || role === 'admin' || role === 'manager') {
        roleSpecific.push(
          reportsAPI.getWaitressPerformance({ from: period.from, to: period.to })
        );
      } else {
        roleSpecific.push(Promise.resolve({ data: [] }));
      }

      // Cashier: get orders they processed (paid_by)
      // Waitress: get orders they served (waitress_id)
      if (role === 'cashier') {
        roleSpecific.push(
          ordersAPI.getAll({ paid_by: member.id, status: 'paid', from: period.from, to: period.to })
        );
      } else if (role === 'waitress') {
        roleSpecific.push(
          ordersAPI.getAll({ waitress_id: member.id, status: 'paid', from: period.from, to: period.to })
        );
      } else {
        roleSpecific.push(Promise.resolve({ data: [] }));
      }

      const [payrollRes, shiftsRes, paymentsRes, perfRes, ordersRes] = await Promise.all([
        ...always,
        ...roleSpecific,
      ]);

      // payroll — find this member by id first, fallback to name
      const payrollArr = Array.isArray(payrollRes.data) ? payrollRes.data : [];
      setPayroll(
        payrollArr.find(p => p.id === member.id) ||
        payrollArr.find(p => p.name === member.name) ||
        null
      );

      // shifts
      const allShifts = Array.isArray(shiftsRes.data) ? shiftsRes.data : [];
      setShifts(allShifts.sort((a, b) => new Date(b.clock_in || 0) - new Date(a.clock_in || 0)));

      // payments
      const allPay = Array.isArray(paymentsRes.data) ? paymentsRes.data : [];
      setPayments(
        allPay
          .filter(p => p.staff_name === member.name || p.user_id === member.id)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 10)
      );

      // performance (waitress/admin)
      const perfArr = Array.isArray(perfRes.data) ? perfRes.data : [];
      setPerformance(
        perfArr.find(p => p.name === member.name) || null
      );

      // orders (cashier or waitress)
      const ordersArr = Array.isArray(ordersRes.data) ? ordersRes.data : [];
      setStaffOrders(ordersArr);

    } catch (_) {
      // show partial data
    } finally {
      setLoading(false);
    }
  }, [member, period, role]);

  useEffect(() => {
    if (visible && member) fetchAll();
  }, [visible, fetchAll]);

  // ── derived ──────────────────────────────────────────────────────────────────
  const rm = member ? roleMeta(member.role) : { bg: '#F3F4F6', text: '#6B7280', icon: 'person', label: '' };

  const salaryType     = (member?.salary_type || 'monthly').toLowerCase();
  const salaryRate     = parseFloat(member?.salary || 0);
  const commissionRate = parseFloat(member?.commission_rate || 0);

  const totalHours = useMemo(
    () => shifts.reduce((sum, s) => sum + parseFloat(s.hours_worked || 0), 0),
    [shifts]
  );
  const completedShifts = shifts.filter(s => s.clock_in && s.clock_out).length;

  // days_worked: all distinct calendar days where staff clocked in (matches admin panel + backend logic)
  const daysWorked = useMemo(() => {
    const days = new Set(
      shifts.filter(s => s.clock_in).map(s => new Date(s.clock_in).toDateString())
    );
    return days.size;
  }, [shifts]);

  const fullWeeks = Math.floor(daysWorked / 5);

  // gross_pay — backend already computes this correctly; keep as fallback calc
  const grossPay = payroll
    ? parseFloat(payroll.gross_pay || 0)
    : (() => {
        if (salaryType === 'monthly') return salaryRate;
        if (salaryType === 'hourly')  return totalHours * salaryRate;
        if (salaryType === 'daily')   return daysWorked * salaryRate;
        if (salaryType === 'weekly')  return fullWeeks  * salaryRate;
        return salaryRate;
      })();

  // commission earned (waitress + dine_in only) — from payroll response OR live calc
  const commissionEarned = payroll
    ? parseFloat(payroll.commission_earned || 0)
    : (role === 'waitress' && commissionRate > 0
        ? commissionRate / 100 * parseFloat(performance?.total_sales_dinein || 0)
        : 0);

  const totalEarned = grossPay + commissionEarned;

  const totalPaid  = useMemo(() => payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0), [payments]);
  const balance    = totalEarned - totalPaid;
  const avgShift   = completedShifts > 0 ? (totalHours / completedShifts).toFixed(1) : null;
  const shiftCount = payroll?.shift_count ?? completedShifts;

  // performance
  const totalSales  = parseFloat(performance?.total_sales  || 0);
  const totalOrders = parseInt(performance?.total_orders   || 0, 10);
  const avgOrder    = totalOrders > 0 ? totalSales / totalOrders : 0;

  // cashier / waitress orders
  const ordersRevenue = useMemo(
    () => staffOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0),
    [staffOrders]
  );

  if (!member) return null;
  const isActive = member.is_active !== false;

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
        <View style={st.root}>

          {/* ── Hero header (top bar + profile merged, no gap) ── */}
          <View style={st.heroHeader}>
          <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            {/* decorative circles */}
            <View style={st.decCircle1} />
            <View style={st.decCircle2} />

            {/* back button row */}
            <View style={[st.topBar, { paddingTop: topPad }]}>
              <Pressable onPress={onClose} style={({ pressed }) => [st.backBtn, pressed && { opacity: 0.6 }]}>
                <MaterialIcons name="arrow-back" size={22} color="#fff" />
              </Pressable>
              <Text style={st.topBarTitle}>{t('owner.staffDetail.staffProfile')}</Text>
              <View style={{ width: 44 }} />
            </View>

            {/* avatar + name */}
            <View style={st.heroBody}>
              <View style={st.heroAvatar}>
                <Text style={st.heroAvatarLetter}>{(member.name || '?')[0].toUpperCase()}</Text>
              </View>
              <Text style={st.heroName}>{member.name}</Text>

              {/* role + status badges */}
              <View style={st.heroBadges}>
                <View style={[st.badge, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                  <MaterialIcons name={rm.icon} size={12} color="#fff" />
                  <Text style={[st.badgeText, { color: '#fff' }]}>{member.role}</Text>
                </View>
                <View style={[st.badge, { backgroundColor: isActive ? 'rgba(16,185,129,0.25)' : 'rgba(220,38,38,0.25)' }]}>
                  <View style={[st.dot, { backgroundColor: isActive ? '#34D399' : '#F87171' }]} />
                  <Text style={[st.badgeText, { color: isActive ? '#34D399' : '#F87171' }]}>
                    {isActive ? 'Active' : 'Inactive'}
                  </Text>
                </View>
              </View>

              {/* contact info chips */}
              <View style={st.heroContacts}>
                {member.phone ? (
                  <View style={st.heroContactRow}>
                    <MaterialIcons name="phone" size={12} color="rgba(255,255,255,0.7)" />
                    <Text style={st.heroContactText}>{member.phone}</Text>
                  </View>
                ) : null}
                {member.username ? (
                  <View style={st.heroContactRow}>
                    <MaterialIcons name="alternate-email" size={12} color="rgba(255,255,255,0.7)" />
                    <Text style={st.heroContactText}>{member.username}</Text>
                  </View>
                ) : null}
                {role === 'kitchen' && member.kitchen_station ? (
                  <View style={st.heroContactRow}>
                    <MaterialIcons name="kitchen" size={12} color="rgba(255,255,255,0.7)" />
                    <Text style={st.heroContactText}>Station: {member.kitchen_station}</Text>
                  </View>
                ) : null}
                {member.shift_start && member.shift_end ? (
                  <View style={st.heroContactRow}>
                    <MaterialIcons name="schedule" size={12} color="rgba(255,255,255,0.7)" />
                    <Text style={st.heroContactText}>{member.shift_start} – {member.shift_end}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {/* ── Period bar ── */}
          <OwnerPeriodBar period={period} onOpen={() => setShowPicker(true)} />

          {loading ? (
            <View style={st.loader}>
              <ActivityIndicator size="large" color={P} />
              <Text style={st.loaderText}>Loading…</Text>
            </View>
          ) : (
            <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>

              {/* ── Quick stats ── */}
              <View style={st.statsRow}>
                {/* Hours — all roles */}
                <StatCard icon="schedule" label="Hours"
                  value={totalHours > 0 ? `${totalHours.toFixed(1)}h` : '—'} color="#F59E0B" />

                {/* Shifts — all roles */}
                <StatCard icon="today" label="Shifts" value={shiftCount || '—'} color={P} />

                {/* 3rd card — role-specific */}
                {(role === 'waitress') && (
                  <StatCard icon="receipt-long" label="Orders" value={totalOrders || staffOrders.length || '—'} color="#10B981" />
                )}
                {(role === 'cashier') && (
                  <StatCard icon="point-of-sale" label="Transactions" value={staffOrders.length || '—'} color="#0891B2" />
                )}
                {(role === 'kitchen') && (
                  <StatCard icon="kitchen" label="Station"
                    value={member.kitchen_station || '—'} color="#EA580C" />
                )}
                {(role === 'admin' || role === 'manager' || role === 'owner') && (
                  <StatCard icon="manage-accounts" label="Role" value={rm.label} color={P} />
                )}
                {(role === 'cleaner') && (
                  <StatCard icon="cleaning-services" label="Role" value={rm.label} color="#475569" />
                )}
              </View>

              {/* ── WAITRESS: Sales Performance ── */}
              {role === 'waitress' && (
                <SectionCard icon="trending-up" title={t('owner.staffDetail.salesPerformance')}>
                  {performance ? (
                    <>
                      <InfoRow label="Total Sales" value={money(totalSales)}
                        valueStyle={{ color: '#10B981', fontWeight: '800', fontSize: 15 }} />
                      <InfoRow label="Total Orders" value={String(totalOrders)} />
                      <InfoRow label="Avg Order Value" value={avgOrder > 0 ? money(avgOrder) : '—'} />
                    </>
                  ) : (
                    <EmptyState icon="bar-chart" text="No sales data this period" />
                  )}
                </SectionCard>
              )}

              {/* ── CASHIER: Transaction Performance ── */}
              {role === 'cashier' && (
                <SectionCard icon="point-of-sale" title={t('owner.staffDetail.cashierPerformance')}>
                  {staffOrders.length > 0 ? (
                    <>
                      <InfoRow label="Transactions Processed" value={String(staffOrders.length)} />
                      <InfoRow label="Total Revenue Collected" value={money(ordersRevenue)}
                        valueStyle={{ color: '#10B981', fontWeight: '800', fontSize: 15 }} />
                      <InfoRow label="Avg Transaction" value={staffOrders.length > 0 ? money(ordersRevenue / staffOrders.length) : '—'} />
                      {/* payment method breakdown */}
                      {(() => {
                        let cash = 0, card = 0, online = 0;
                        staffOrders.forEach(o => {
                          const m = (o.payment_method || 'cash').toLowerCase();
                          const a = parseFloat(o.total_amount || 0);
                          if (m === 'cash') cash += a;
                          else if (m === 'card') card += a;
                          else online += a;
                        });
                        return (
                          <>
                            {cash   > 0 && <InfoRow label="  Cash Collected"   value={money(cash)}   />}
                            {card   > 0 && <InfoRow label="  Card Collected"   value={money(card)}   />}
                            {online > 0 && <InfoRow label="  Online Collected" value={money(online)} />}
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <EmptyState icon="point-of-sale" text="No transactions this period" />
                  )}
                </SectionCard>
              )}

              {/* ── KITCHEN: Activity ── */}
              {role === 'kitchen' && (
                <SectionCard icon="soup-kitchen" title={t('owner.staffDetail.kitchenActivity')}>
                  <InfoRow label="Kitchen Station" value={member.kitchen_station || 'Not assigned'} />
                  {member.shift_start && member.shift_end ? (
                    <InfoRow label="Scheduled Shift" value={`${member.shift_start} – ${member.shift_end}`} />
                  ) : null}
                  {member.salary ? (
                    <InfoRow
                      label={`${member.salary_type === 'hourly' ? 'Hourly Rate' : 'Monthly Salary'}`}
                      value={money(member.salary)}
                    />
                  ) : null}
                  <InfoRow label="Total Hours This Period" value={totalHours > 0 ? `${totalHours.toFixed(1)}h` : '—'} />
                  {/* Use daysWorked — counts all clock-ins, including active open shifts */}
                  <InfoRow label="Days Present" value={String(daysWorked)} />
                  <InfoRow label="Completed Shifts" value={String(completedShifts)} />
                  {/* Show live "On Duty" badge when clocked in but not yet out */}
                  {shifts.some(s => s.clock_in && !s.clock_out) && (
                    <InfoRow
                      label="Current Status"
                      value="● On Duty"
                      valueStyle={{ color: '#10B981', fontWeight: '700' }}
                    />
                  )}
                  {avgShift ? <InfoRow label="Avg Shift Length" value={`${avgShift}h`} /> : null}
                </SectionCard>
              )}

              {/* ── ADMIN/MANAGER/OWNER: Work summary ── */}
              {(role === 'admin' || role === 'manager' || role === 'owner') && (
                <SectionCard icon="manage-accounts" title={t('owner.staffDetail.workSummary')}>
                  {totalHours > 0 || daysWorked > 0 || shiftCount > 0 ? (
                    <>
                      <InfoRow label="Total Hours This Period" value={totalHours > 0 ? `${totalHours.toFixed(1)}h` : '—'} />
                      <InfoRow label="Days Present" value={String(daysWorked)} />
                      {shifts.some(s => s.clock_in && !s.clock_out) && (
                        <InfoRow label="Current Status" value="● On Duty"
                          valueStyle={{ color: '#10B981', fontWeight: '700' }} />
                      )}
                      {avgShift ? <InfoRow label="Avg Shift Length" value={`${avgShift}h`} /> : null}
                      {member.salary ? (
                        <InfoRow
                          label={member.salary_type === 'hourly' ? 'Hourly Rate' : 'Monthly Salary'}
                          value={money(member.salary)}
                        />
                      ) : null}
                    </>
                  ) : (
                    <EmptyState icon="event-busy" text="No shift records this period" />
                  )}
                </SectionCard>
              )}

              {/* ── CLEANER: Work summary ── */}
              {role === 'cleaner' && (
                <SectionCard icon="cleaning-services" title={t('owner.staffDetail.workSummary')}>
                  {totalHours > 0 || daysWorked > 0 || shiftCount > 0 ? (
                    <>
                      <InfoRow label="Total Hours" value={totalHours > 0 ? `${totalHours.toFixed(1)}h` : '—'} />
                      <InfoRow label="Days Present" value={String(daysWorked)} />
                      {shifts.some(s => s.clock_in && !s.clock_out) && (
                        <InfoRow label="Current Status" value="● On Duty"
                          valueStyle={{ color: '#10B981', fontWeight: '700' }} />
                      )}
                      {avgShift ? <InfoRow label="Avg Shift Length" value={`${avgShift}h`} /> : null}
                    </>
                  ) : (
                    <EmptyState icon="event-busy" text="No shift records this period" />
                  )}
                </SectionCard>
              )}

              {/* ── WAITRESS: order log ── */}
              {role === 'waitress' && staffOrders.length > 0 && (
                <SectionCard icon="receipt" title={`Order History  ·  ${staffOrders.length} orders`}>
                  {staffOrders.slice(0, 8).map((o, i) => (
                    <View key={String(o.id)} style={[st.orderRow, i > 0 && st.borderTop]}>
                      <View style={{ flex: 1 }}>
                        <Text style={st.orderNum}>#{o.daily_number ?? o.id?.slice(0, 6)}</Text>
                        <Text style={st.orderMeta}>{fmtDate(o.created_at)}  ·  {o.order_type || 'dine_in'}</Text>
                      </View>
                      <Text style={st.orderAmt}>{money(o.total_amount)}</Text>
                    </View>
                  ))}
                </SectionCard>
              )}

              {/* ── Attendance card — all roles ── */}
              <SectionCard icon="access-time" title={t('owner.staffDetail.attendance')}>
                {daysWorked > 0 || shiftCount > 0 || totalHours > 0 ? (
                  <>
                    {/* Show live "On Duty" status when currently clocked in */}
                    {shifts.some(s => s.clock_in && !s.clock_out) && (
                      <InfoRow label="Today" value="● On Duty"
                        valueStyle={{ color: '#10B981', fontWeight: '700' }} />
                    )}
                    <InfoRow label="Days Present" value={String(daysWorked)} />
                    <InfoRow label="Completed Shifts" value={String(completedShifts)} />
                    <InfoRow label="Total Hours" value={totalHours > 0 ? `${totalHours.toFixed(1)}h` : '—'} />
                    {avgShift ? <InfoRow label="Avg Shift Length" value={`${avgShift}h`} /> : null}
                    {shifts.length > 0 && shifts[0].clock_in ? (
                      <InfoRow label="Last Clock-In" value={fmtDate(shifts[0].clock_in)} />
                    ) : null}
                  </>
                ) : (
                  <EmptyState icon="event-busy" text="No attendance records this period" />
                )}
              </SectionCard>

              {/* ── Payroll — all roles ── */}
              <SectionCard icon="payments" title={t('owner.staffDetail.payrollSection')}>
                {payroll || grossPay > 0 ? (
                  <>
                    {/* ── Rate row (base rate) ── */}
                    {salaryRate > 0 && (
                      <InfoRow
                        label={
                          salaryType === 'hourly' ? 'Hourly Rate' :
                          salaryType === 'daily'  ? 'Daily Rate'  :
                          salaryType === 'weekly' ? 'Weekly Rate' :
                                                    'Monthly Salary'
                        }
                        value={money(salaryRate)}
                      />
                    )}

                    {/* ── Worked metric row ── */}
                    {salaryType === 'hourly' && (
                      <InfoRow label="Hours Worked"
                        value={`${(payroll ? parseFloat(payroll.total_hours || 0) : totalHours).toFixed(1)}h`} />
                    )}
                    {salaryType === 'daily' && (
                      <InfoRow label="Days Worked"
                        value={`${payroll ? parseInt(payroll.days_worked || 0) : daysWorked} days`} />
                    )}
                    {salaryType === 'weekly' && (
                      <>
                        <InfoRow label="Days Worked"
                          value={`${payroll ? parseInt(payroll.days_worked || 0) : daysWorked} days`} />
                        <InfoRow label="Full Weeks"
                          value={`${payroll ? Math.floor(parseInt(payroll.days_worked || 0) / 5) : fullWeeks} weeks`} />
                      </>
                    )}
                    {salaryType === 'monthly' && (
                      <InfoRow label="Shifts This Period" value={String(shiftCount)} />
                    )}

                    {/* ── Base gross ── */}
                    <InfoRow
                      label={salaryType === 'monthly' ? 'Base Salary' : 'Base Earnings'}
                      value={money(grossPay)}
                      valueStyle={{ fontWeight: '800' }}
                    />

                    {/* ── Commission (waitress only) ── */}
                    {role === 'waitress' && commissionRate > 0 && (
                      <InfoRow
                        label={`Commission (${commissionRate}% dine-in)`}
                        value={money(commissionEarned)}
                        valueStyle={{ color: '#10B981', fontWeight: '700' }}
                      />
                    )}

                    {/* ── Total earned ── */}
                    {(role === 'waitress' && commissionRate > 0) && (
                      <InfoRow
                        label="Total Earned"
                        value={money(totalEarned)}
                        valueStyle={{ fontWeight: '800', fontSize: 15, color: P }}
                      />
                    )}

                    <InfoRow label="Total Paid Out" value={money(totalPaid)} valueStyle={{ color: '#10B981' }} />
                    <View style={st.divider} />
                    <View style={st.balanceRow}>
                      <Text style={st.balanceLabel}>
                        {balance > 0 ? 'Still Owed' : balance < 0 ? 'Overpaid' : '✓ Settled'}
                      </Text>
                      <View style={[st.balanceBadge, {
                        backgroundColor: balance > 0 ? '#FEF3C7' : balance < 0 ? '#FEE2E2' : '#DCFCE7',
                      }]}>
                        <Text style={[st.balanceAmt, {
                          color: balance > 0 ? '#D97706' : balance < 0 ? '#DC2626' : '#16A34A',
                        }]}>
                          {balance === 0 ? money(0) : money(Math.abs(balance))}
                        </Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <EmptyState icon="money-off" text="No payroll data this period" />
                )}
              </SectionCard>

              {/* ── Payment history — all roles ── */}
              {payments.length > 0 && (
                <SectionCard icon="account-balance-wallet" title={`${t('owner.staffDetail.paymentHistory')}  ·  ${payments.length}`}>
                  {payments.map((p, i) => (
                    <View key={String(p.id)} style={[st.payRow, i > 0 && st.borderTop]}>
                      <View style={{ flex: 1 }}>
                        <Text style={st.payAmt}>{money(p.amount)}</Text>
                        <Text style={st.payMeta}>
                          {fmtDate(p.payment_date || p.created_at)}
                          {p.note ? `  ·  ${p.note}` : ''}
                        </Text>
                      </View>
                      <View style={[st.payMethod, { backgroundColor: '#DCFCE7' }]}>
                        <Text style={[st.payMethodText, { color: '#16A34A' }]}>
                          {p.payment_method || 'cash'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </SectionCard>
              )}

              {/* ── Shift log — all roles ── */}
              {shifts.length > 0 && (
                <SectionCard icon="list-alt" title={`${t('owner.staffDetail.shiftLog')}  ·  ${Math.min(shifts.length, 7)}`}>
                  {shifts.slice(0, 7).map((s, i) => {
                    const hrs = parseFloat(s.hours_worked || 0);
                    const earn = parseFloat(s.earnings || 0);
                    const isOpen = s.clock_in && !s.clock_out;
                    return (
                      <View key={String(s.id)} style={[st.shiftRow, i > 0 && st.borderTop]}>
                        <View style={[st.shiftDot, { backgroundColor: isOpen ? '#16A34A' : P }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={st.shiftDate}>{fmtDate(s.clock_in || s.shift_date)}</Text>
                          {s.clock_in ? (
                            <Text style={st.shiftTimes}>
                              {fmtTime(s.clock_in)} → {s.clock_out ? fmtTime(s.clock_out) : '(on duty)'}
                            </Text>
                          ) : (
                            <Text style={[st.shiftTimes, { color: '#DC2626' }]}>{s.status || 'absent'}</Text>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          {hrs > 0 ? (
                            <View style={st.shiftHrsBadge}>
                              <Text style={st.shiftHrsText}>{hrs.toFixed(1)}h</Text>
                            </View>
                          ) : null}
                          {earn > 0 ? <Text style={st.shiftEarn}>{money(earn)}</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                </SectionCard>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Calendar rendered outside Modal to avoid nested Modal on Android Fabric */}
      <OwnerCalendarPicker
        visible={showPicker}
        period={period}
        onClose={() => setShowPicker(false)}
        onChange={p => { setPeriod(p); setShowPicker(false); }}
      />
    </>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#F8FAFC' },
  loader:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loaderText:{ fontSize: 14, color: '#9CA3AF' },
  scroll:    { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 40 },

  // hero header (merged top bar + profile, no white gap)
  heroHeader: {
    backgroundColor: P,
    overflow: 'hidden',
  },
  // decorative circles
  decCircle1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -50, right: -40,
  },
  decCircle2: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: 10, left: -30,
  },

  // top bar (back btn row — no extra top padding, handled by paddingTop: topPad inline)
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 4,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  topBarTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#fff' },

  // hero body (avatar, name, badges)
  heroBody: {
    alignItems: 'center', paddingTop: 6, paddingBottom: 26, paddingHorizontal: 20,
  },
  heroAvatar: {
    width: 86, height: 86, borderRadius: 43,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.40)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
  },
  heroAvatarLetter: { fontSize: 34, fontWeight: '800', color: '#fff' },
  heroName:  { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 10, letterSpacing: 0.3 },
  heroBadges:{ flexDirection: 'row', gap: 8, marginBottom: 12 },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  dot:       { width: 7, height: 7, borderRadius: 4 },
  heroContacts: { gap: 5, alignItems: 'center' },
  heroContactRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroContactText: { fontSize: 12, color: 'rgba(255,255,255,0.78)', fontWeight: '500' },

  // stat cards
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14,
    padding: 14, alignItems: 'center', gap: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  statValue: { fontSize: 16, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },

  // section card
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 8 },
  cardIconBox: { width: 26, height: 26, borderRadius: 7, backgroundColor: PL, alignItems: 'center', justifyContent: 'center' },
  cardTitle:   { fontSize: 14, fontWeight: '800', color: '#111827' },

  // info row
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  infoRowHighlight: { backgroundColor: '#F9FAFB', borderRadius: 8, paddingHorizontal: 8 },
  infoLabel: { fontSize: 13, color: '#6B7280', flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#111827' },

  // divider + balance
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 8 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  balanceLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },
  balanceBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  balanceAmt:   { fontSize: 14, fontWeight: '800' },

  // payment list
  payRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  payAmt:    { fontSize: 14, fontWeight: '700', color: '#10B981' },
  payMeta:   { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  payMethod: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  payMethodText: { fontSize: 11, fontWeight: '700' },

  // order row
  orderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  orderNum:  { fontSize: 13, fontWeight: '700', color: '#111827' },
  orderMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  orderAmt:  { fontSize: 13, fontWeight: '700', color: P },

  // shift log
  shiftRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  shiftDot:      { width: 8, height: 8, borderRadius: 4, marginTop: 2 },
  shiftDate:     { fontSize: 13, fontWeight: '700', color: '#111827' },
  shiftTimes:    { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  shiftHrsBadge: { backgroundColor: PL, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  shiftHrsText:  { fontSize: 12, fontWeight: '800', color: P },
  shiftEarn:     { fontSize: 11, color: '#10B981', fontWeight: '600' },

  borderTop: { borderTopWidth: 1, borderTopColor: '#F3F4F6' },

  emptyBox: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText: { fontSize: 13, color: '#9CA3AF' },
});
