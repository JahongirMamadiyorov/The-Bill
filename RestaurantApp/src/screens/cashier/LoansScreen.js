import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Modal, ScrollView, StatusBar,
} from 'react-native';
import ConfirmDialog from '../../components/ConfirmDialog';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { loansAPI } from '../../api/client';
import { colors, spacing, radius, shadow, topInset } from '../../utils/theme';
import { useTranslation } from '../../context/LanguageContext';

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n) => Number(parseFloat(n) || 0).toLocaleString('uz-UZ') + " so'm";

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
};

const fmtDateStr = (d) => {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const today      = new Date();
const TODAY_STR  = fmtDateStr(today);

const getMonday = (d) => {
  const date = new Date(d);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date;
};

const isOverdue = (loan) =>
  loan.status === 'active' && loan.due_date && loan.due_date.slice(0, 10) < TODAY_STR;

const dueDateLabel = (dueDateStr, status, t) => {
  if (!dueDateStr) return { label: '—', color: colors.neutralMid };
  if (status === 'paid') return { label: fmtDate(dueDateStr), color: colors.neutralMid };
  const due  = dueDateStr.slice(0, 10);
  if (due < TODAY_STR) {
    const days = Math.round((today - new Date(due)) / 86400000);
    return { label: t('cashier.loans.overdueLabel', { days }), color: '#DC2626' };
  }
  const days = Math.round((new Date(due) - today) / 86400000);
  if (days === 0) return { label: t('cashier.loans.dueToday', 'Due today'), color: '#D97706' };
  if (days <= 3)  return { label: t('cashier.loans.daysLeft', { days }), color: '#D97706' };
  return { label: fmtDate(dueDateStr), color: colors.neutralMid };
};

// ── Calendar Picker ─────────────────────────────────────────────────────────────
function CalendarPicker({ visible, onClose, period, onChange }) {
  const { t } = useTranslation();
  const MONTH_NAMES = t('datePicker.months');
  const DAY_HDRS    = t('datePicker.days');
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [tempFrom,  setTempFrom]  = useState(period.from);
  const [tempTo,    setTempTo]    = useState(period.to);
  const [step,      setStep]      = useState('from');

  useEffect(() => {
    if (visible) {
      setTempFrom(period.from); setTempTo(period.to); setStep('from');
      const d = new Date(period.from);
      setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
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

  const firstDow  = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMon = new Date(viewYear, viewMonth+1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMon; d++) cells.push(fmtDateStr(new Date(viewYear, viewMonth, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i+7));

  const presets = [
    { label: t('cashier.loans.today', 'Today'),          from: TODAY_STR, to: TODAY_STR },
    { label: t('cashier.loans.thisWeek', 'This Week'),   from: fmtDateStr(getMonday(today)), to: TODAY_STR },
    { label: t('cashier.loans.thisMonth', 'This Month'), from: fmtDateStr(new Date(today.getFullYear(), today.getMonth(), 1)), to: TODAY_STR },
    { label: t('cashier.loans.lastMonth', 'Last Month'), from: fmtDateStr(new Date(today.getFullYear(), today.getMonth()-1, 1)), to: fmtDateStr(new Date(today.getFullYear(), today.getMonth(), 0)) },
    { label: t('cashier.loans.allTime', 'All Time'),     from: '2020-01-01', to: TODAY_STR },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={CP.overlay}>
        <View style={CP.sheet}>
          <View style={CP.header}>
            <MaterialIcons name="calendar-today" size={20} color={colors.primary} />
            <Text style={CP.headerTitle}>{t('cashier.loans.selectPeriod', 'Select Period')}</Text>
            <TouchableOpacity onPress={onClose} style={{ marginLeft: 'auto' }}>
              <MaterialIcons name="close" size={22} color={colors.neutralMid} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              <TouchableOpacity onPress={() => setStep('from')} style={[CP.pill, step === 'from' && CP.pillActive]}>
                <Text style={CP.pillLbl}>{t('cashier.loans.from', 'FROM')}</Text>
                <Text style={CP.pillVal}>{tempFrom}</Text>
              </TouchableOpacity>
              <View style={{ width: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.neutralMid, fontSize: 18 }}>→</Text>
              </View>
              <TouchableOpacity onPress={() => setStep('to')} style={[CP.pill, step === 'to' && CP.pillActive]}>
                <Text style={CP.pillLbl}>{t('cashier.loans.to', 'TO')}</Text>
                <Text style={CP.pillVal}>{tempTo}</Text>
              </TouchableOpacity>
            </View>
            <Text style={CP.hint}>{step === 'from' ? t('cashier.loans.tapDateStart', 'Tap a date to set start') : t('cashier.loans.tapDateEnd', 'Tap a date to set end')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <TouchableOpacity onPress={prevMonth} style={CP.arrowBtn}><Text style={CP.arrowTxt}>‹</Text></TouchableOpacity>
              <Text style={CP.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
              <TouchableOpacity onPress={nextMonth} style={CP.arrowBtn}><Text style={CP.arrowTxt}>›</Text></TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              {DAY_HDRS.map((dh, idx) => (
                <View key={`${dh}-${idx}`} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={CP.dayHdr}>{dh}</Text>
                </View>
              ))}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} style={{ flexDirection: 'row' }}>
                {week.map((ds, di) => {
                  if (!ds) return <View key={`e${di}`} style={{ flex: 1, aspectRatio: 1 }} />;
                  const isFrom  = ds === tempFrom;
                  const isTo    = ds === tempTo && tempFrom !== tempTo;
                  const inRange = ds > tempFrom && ds < tempTo;
                  const isTodayDs = ds === TODAY_STR;
                  const bg = (isFrom || isTo) ? colors.primary : inRange ? (colors.primaryLight || '#EEF2FF') : 'transparent';
                  const txCol = (isFrom || isTo) ? '#fff' : inRange ? colors.primary : isTodayDs ? colors.primary : colors.textDark;
                  const fw = (isFrom || isTo || isTodayDs) ? '800' : '400';
                  return (
                    <TouchableOpacity
                      key={ds}
                      style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderRadius: (isFrom || isTo) ? 9 : 0 }}
                      onPress={() => handleDay(ds)} activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 13, fontWeight: fw, color: txCol }}>
                        {parseInt(ds.split('-')[2], 10)}
                      </Text>
                      {isTodayDs && !isFrom && !isTo && (
                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: 1 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <View style={CP.presets}>
              {presets.map(p => (
                <TouchableOpacity key={p.label} style={CP.presetBtn} onPress={() => setPreset(p.from, p.to)}>
                  <Text style={CP.presetTxt}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={CP.applyBtn}
              onPress={() => { onChange({ from: tempFrom, to: tempTo }); onClose(); }}
            >
              <Text style={CP.applyTxt}>
                {t('cashier.loans.apply', 'Apply')}: {tempFrom === tempTo ? tempFrom : `${tempFrom} → ${tempTo}`}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Loan Payment Method Picker ─────────────────────────────────────────────────
const LOAN_PAY_METHOD_KEYS = [
  { key: 'cash',    labelKey: 'paymentMethods.cash',    fallback: 'Cash',    icon: 'payments'     },
  { key: 'card',    labelKey: 'paymentMethods.card',    fallback: 'Card',    icon: 'credit-card'  },
  { key: 'qr_code', labelKey: 'paymentMethods.qrCode',  fallback: 'QR Code', icon: 'qr-code-2'   },
];

function LoanPayModal({ visible, loan, onClose, onConfirm }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState('cash');
  if (!loan) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={LP.mask} activeOpacity={1} onPress={onClose} />
      <View style={LP.sheet}>
        <View style={LP.handle} />
        <Text style={LP.title}>{t('cashier.loans.collectLoanPayment', 'Collect Loan Payment')}</Text>
        <Text style={LP.sub}>{loan.customer_name} — {fmt(loan.amount)}</Text>

        <Text style={LP.sectionLbl}>{t('cashier.tables.paymentMethod', 'PAYMENT METHOD')}</Text>
        <View style={LP.methodRow}>
          {LOAN_PAY_METHOD_KEYS.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[LP.methodBtn, method === m.key && LP.methodBtnActive]}
              onPress={() => setMethod(m.key)}
            >
              <MaterialIcons name={m.icon} size={22} color={method === m.key ? '#fff' : colors.neutralMid} />
              <Text style={[LP.methodLbl, method === m.key && { color: '#fff' }]}>{t(m.labelKey, m.fallback)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={LP.confirmBtn} onPress={() => onConfirm(method)}>
          <MaterialIcons name="check-circle" size={20} color="#fff" />
          <Text style={LP.confirmTxt}>{t('cashier.loans.confirmPaymentReceived', 'Confirm Payment Received')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Loan Card ──────────────────────────────────────────────────────────────────
function LoanCard({ loan, onMarkPaid, setDialog }) {
  const { t } = useTranslation();
  const [paying,    setPaying]    = useState(false);
  const [showModal, setShowModal] = useState(false);
  const isActive  = loan.status === 'active';
  const over      = isOverdue(loan);
  const dueInfo   = dueDateLabel(loan.due_date, loan.status, t);
  const orderNum  = loan.daily_number ? `#${loan.daily_number}` : null;

  const handlePay = () => setShowModal(true);

  const handleConfirmPay = async (method) => {
    setShowModal(false);
    setPaying(true);
    try {
      await loansAPI.markPaid(loan.id, { payment_method: method });
      onMarkPaid();
    } catch (e) {
      setDialog({ title: t('alerts.error', 'Error'), message: e?.response?.data?.error || t('cashier.loans.couldNotUpdateLoan', 'Could not update loan'), type: 'error' });
    } finally { setPaying(false); }
  };

  return (
    <View style={[S.card, over && S.cardOverdue]}>
      <View style={S.cardTop}>
        <View style={S.avatarWrap}>
          <MaterialIcons name="person" size={20} color={colors.neutralMid} />
        </View>
        <View style={S.cardInfo}>
          <Text style={S.customerName}>{loan.customer_name}</Text>
          {loan.customer_phone ? <Text style={S.customerPhone}>{loan.customer_phone}</Text> : null}
        </View>
        <View style={S.amtWrap}>
          <Text style={[S.amtText, isActive ? { color: over ? '#DC2626' : colors.primary } : { color: colors.success }]}>
            {fmt(loan.amount)}
          </Text>
          <View style={[S.statusBadge, isActive ? (over ? S.badgeOverdue : S.badgeActive) : S.badgePaid]}>
            <Text style={[S.statusBadgeTxt, isActive ? (over ? { color: '#DC2626' } : { color: '#D97706' }) : { color: '#16A34A' }]}>
              {isActive ? (over ? t('cashier.loans.overdue', 'Overdue') : t('common.active', 'Active')) : t('cashier.loans.paid', 'Paid')}
            </Text>
          </View>
        </View>
      </View>

      <View style={S.metaRow}>
        {orderNum ? (
          <View style={S.metaPill}>
            <MaterialIcons name="receipt" size={12} color={colors.neutralMid} />
            <Text style={S.metaTxt}>{t('common.order', 'Order')} {orderNum}</Text>
          </View>
        ) : null}
        {loan.table_name ? (
          <View style={S.metaPill}>
            <MaterialIcons name="table-restaurant" size={12} color={colors.neutralMid} />
            <Text style={S.metaTxt}>{loan.table_name}</Text>
          </View>
        ) : null}
        <View style={[S.metaPill, over && { backgroundColor: '#FEF2F2' }]}>
          <MaterialIcons name="schedule" size={12} color={dueInfo.color} />
          <Text style={[S.metaTxt, { color: dueInfo.color }]}>
            {isActive ? `${t('cashier.loans.due', 'Due')} ${dueInfo.label}` : `${t('cashier.loans.paid', 'Paid')} ${fmtDate(loan.paid_at)}`}
          </Text>
        </View>
        <View style={S.metaPill}>
          <MaterialIcons name="calendar-today" size={12} color={colors.neutralMid} />
          <Text style={S.metaTxt}>{t('cashier.loans.issued', 'Issued')} {fmtDate(loan.created_at)}</Text>
        </View>
      </View>

      {isActive && (
        <TouchableOpacity
          style={[S.payBtn, paying && { opacity: 0.6 }]}
          onPress={handlePay}
          disabled={paying}
          activeOpacity={0.85}
        >
          {paying
            ? <ActivityIndicator color={colors.success} size="small" />
            : <>
                <MaterialIcons name="check-circle-outline" size={17} color={colors.success} />
                <Text style={S.payBtnTxt}>{t('cashier.loans.collectPayment', 'Collect Payment')}</Text>
              </>
          }
        </TouchableOpacity>
      )}

      <LoanPayModal
        visible={showModal}
        loan={loan}
        onClose={() => setShowModal(false)}
        onConfirm={handleConfirmPay}
      />
    </View>
  );
}

// ── LoansScreen ────────────────────────────────────────────────────────────────
const defaultPeriod = {
  from: fmtDateStr(new Date(today.getFullYear(), today.getMonth(), 1)),
  to:   TODAY_STR,
};

export default function LoansScreen() {
  const { t } = useTranslation();
  const [period,       setPeriod]       = useState(defaultPeriod);
  const [calOpen,      setCalOpen]      = useState(false);
  const [filter,       setFilter]       = useState('outstanding');
  const [allLoans,     setAllLoans]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [notifying,    setNotifying]    = useState(false);
  const [dialog,       setDialog]       = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await loansAPI.getAll({ from: period.from, to: period.to });
      setAllLoans(res.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // ── Derived filtered lists ─────────────────────────────────────────────────
  const outstanding = useMemo(() =>
    allLoans.filter(l => l.status === 'active' && !isOverdue(l)),
  [allLoans]);

  const overdue = useMemo(() =>
    allLoans.filter(l => isOverdue(l)),
  [allLoans]);

  const recovered = useMemo(() =>
    allLoans.filter(l => l.status === 'paid'),
  [allLoans]);

  const displayedLoans = filter === 'outstanding' ? outstanding
    : filter === 'overdue'  ? overdue
    : recovered;

  // ── Stats from loaded data ─────────────────────────────────────────────────
  const outstandingTotal = outstanding.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const overdueTotal     = overdue.reduce((s, l)     => s + (parseFloat(l.amount) || 0), 0);
  const recoveredTotal   = recovered.reduce((s, l)   => s + (parseFloat(l.amount) || 0), 0);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleNotifyAdmin = async () => {
    if (overdue.length === 0) return;
    setNotifying(true);
    try {
      const res = await loansAPI.notifyOverdue();
      const { notified, overdueCount } = res.data;
      setDialog({
        title: t('cashier.loans.adminNotified', 'Admin Notified'),
        message: t('cashier.loans.adminNotifiedMessage', { notified, count: overdueCount }),
        type: 'success'
      });
    } catch (e) {
      setDialog({ title: t('alerts.error', 'Error'), message: e?.response?.data?.error || t('cashier.loans.couldNotSendNotification', 'Could not send notification'), type: 'error' });
    } finally { setNotifying(false); }
  };

  const periodLabel = period.from === period.to
    ? period.from
    : `${period.from} → ${period.to}`;

  return (
    <View style={S.page}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <View style={S.pageHeader}>
        <MaterialIcons name="account-balance-wallet" size={22} color={colors.primary} />
        <Text style={S.pageTitle}>{t('cashier.loans.title', 'Loans')}</Text>
      </View>

      {/* ── Period bar ────────────────────────────────────────────────────── */}
      <TouchableOpacity style={S.periodBar} onPress={() => setCalOpen(true)} activeOpacity={0.85}>
        <MaterialIcons name="calendar-today" size={16} color={colors.primary} style={{ marginRight: 6 }} />
        <Text style={S.periodTxt} numberOfLines={1}>{periodLabel}</Text>
        <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.primary} />
      </TouchableOpacity>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <View style={S.statsRow}>
        <TouchableOpacity
          style={[S.statCard, filter === 'outstanding' && S.statCardActive]}
          onPress={() => setFilter('outstanding')}
          activeOpacity={0.85}
        >
          <View style={[S.statIcon, { backgroundColor: (colors.primary || '#2563EB') + '1A' }]}>
            <MaterialIcons name="pending-actions" size={18} color={colors.primary} />
          </View>
          <Text style={S.statLabel}>{t('cashier.loans.outstanding', 'Outstanding')}</Text>
          <Text style={[S.statValue, { color: colors.primary }]}>{fmt(outstandingTotal)}</Text>
          <Text style={S.statCount}>{outstanding.length} {outstanding.length !== 1 ? t('cashier.loans.loans', 'loans') : t('cashier.loans.loan', 'loan')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[S.statCard, filter === 'overdue' && S.statCardActive, filter === 'overdue' && { borderColor: '#DC2626' }]}
          onPress={() => setFilter('overdue')}
          activeOpacity={0.85}
        >
          <View style={[S.statIcon, { backgroundColor: '#FEF2F2' }]}>
            <MaterialIcons name="warning-amber" size={18} color="#DC2626" />
          </View>
          <Text style={S.statLabel}>{t('cashier.loans.overdue', 'Overdue')}</Text>
          <Text style={[S.statValue, { color: '#DC2626' }]}>{fmt(overdueTotal)}</Text>
          <Text style={S.statCount}>{overdue.length} {overdue.length !== 1 ? t('cashier.loans.loans', 'loans') : t('cashier.loans.loan', 'loan')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[S.statCard, filter === 'recovered' && S.statCardActive, filter === 'recovered' && { borderColor: '#16A34A' }]}
          onPress={() => setFilter('recovered')}
          activeOpacity={0.85}
        >
          <View style={[S.statIcon, { backgroundColor: '#F0FDF4' }]}>
            <MaterialIcons name="check-circle-outline" size={18} color="#16A34A" />
          </View>
          <Text style={S.statLabel}>{t('cashier.loans.recovered', 'Recovered')}</Text>
          <Text style={[S.statValue, { color: '#16A34A' }]}>{fmt(recoveredTotal)}</Text>
          <Text style={S.statCount}>{recovered.length} {recovered.length !== 1 ? t('cashier.loans.loans', 'loans') : t('cashier.loans.loan', 'loan')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Overdue notify banner ─────────────────────────────────────────── */}
      {overdue.length > 0 && (
        <TouchableOpacity
          style={[S.notifyBanner, notifying && { opacity: 0.7 }]}
          onPress={handleNotifyAdmin}
          disabled={notifying}
          activeOpacity={0.85}
        >
          {notifying
            ? <ActivityIndicator size="small" color="#92400E" />
            : <MaterialIcons name="notifications-active" size={16} color="#92400E" />
          }
          <Text style={S.notifyBannerTxt}>
            {t('cashier.loans.overdueNotify', { count: overdue.length })}
          </Text>
          <MaterialIcons name="chevron-right" size={16} color="#92400E" />
        </TouchableOpacity>
      )}

      {/* ── List ─────────────────────────────────────────────────────────── */}
      {loading
        ? <ActivityIndicator style={{ flex: 1, marginTop: 40 }} size="large" color={colors.primary} />
        : (
          <FlatList
            data={displayedLoans}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            renderItem={({ item }) => (
              <LoanCard loan={item} onMarkPaid={() => load(true)} setDialog={setDialog} />
            )}
            ListHeaderComponent={
              displayedLoans.length > 0 ? (
                <Text style={S.listHeader}>
                  {filter === 'outstanding' ? t('cashier.loans.outstandingLoans', 'Outstanding Loans')
                  : filter === 'overdue'    ? t('cashier.loans.overdueLoans', 'Overdue Loans')
                  : t('cashier.loans.recoveredLoans', 'Recovered Loans')}
                  {'  '}
                  <Text style={{ color: colors.neutralMid, fontWeight: '500' }}>({displayedLoans.length})</Text>
                </Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={S.empty}>
                <MaterialIcons name="account-balance-wallet" size={44} color={colors.border} />
                <Text style={S.emptyTitle}>
                  {filter === 'outstanding' ? t('cashier.loans.noOutstandingLoans', 'No outstanding loans')
                  : filter === 'overdue'    ? t('cashier.loans.noOverdueLoans', 'No overdue loans')
                  : t('cashier.loans.noRecoveredLoans', 'No recovered loans')}
                </Text>
                <Text style={S.emptySubtitle}>
                  {filter === 'outstanding' ? t('cashier.loans.outstandingDescription', 'Active loans not yet past due date will appear here')
                  : filter === 'overdue'    ? t('cashier.loans.overdueDescription', 'Loans past their due date will appear here')
                  : t('cashier.loans.recoveredDescription', 'Loans marked as paid will appear here')}
                </Text>
              </View>
            }
          />
        )
      }

      {/* ── Calendar picker ──────────────────────────────────────────────── */}
      <CalendarPicker
        visible={calOpen}
        onClose={() => setCalOpen(false)}
        period={period}
        onChange={(p) => { setPeriod(p); setCalOpen(false); }}
      />
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:           { flex: 1, backgroundColor: colors.background },
  pageHeader:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: topInset + spacing.sm, paddingBottom: spacing.sm },
  pageTitle:      { fontSize: 20, fontWeight: '800', color: colors.textDark },
  periodBar:      { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, ...shadow.card, borderWidth: 1.5, borderColor: (colors.primary || '#2563EB') + '40' },
  periodTxt:      { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textDark },
  // Stats cards (tappable filter buttons)
  statsRow:       { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  statCard:       { flex: 1, backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.sm, ...shadow.card, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  statCardActive: { borderColor: colors.primary },
  statIcon:       { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  statLabel:      { fontSize: 9, color: colors.neutralMid, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center', marginBottom: 1 },
  statValue:      { fontSize: 11, fontWeight: '800', textAlign: 'center' },
  statCount:      { fontSize: 9, color: colors.neutralMid, textAlign: 'center', marginTop: 1 },
  // Overdue notify banner
  notifyBanner:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: '#FFFBEB', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: '#FDE68A' },
  notifyBannerTxt:{ flex: 1, fontSize: 12, color: '#92400E', fontWeight: '600' },
  // List header
  listHeader:     { fontSize: 11, fontWeight: '800', color: colors.neutralMid, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.xs },
  // Loan card
  card:           { backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.lg, ...shadow.card },
  cardOverdue:    { borderLeftWidth: 3, borderLeftColor: '#DC2626' },
  cardTop:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  avatarWrap:     { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.neutralLight, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  cardInfo:       { flex: 1 },
  customerName:   { fontSize: 15, fontWeight: '800', color: colors.textDark },
  customerPhone:  { fontSize: 12, color: colors.neutralMid, marginTop: 1 },
  amtWrap:        { alignItems: 'flex-end' },
  amtText:        { fontSize: 15, fontWeight: '800' },
  statusBadge:    { marginTop: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  badgeActive:    { backgroundColor: '#FFFBEB' },
  badgeOverdue:   { backgroundColor: '#FEF2F2' },
  badgePaid:      { backgroundColor: '#F0FDF4' },
  statusBadgeTxt: { fontSize: 10, fontWeight: '700' },
  metaRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  metaPill:       { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.neutralLight, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full },
  metaTxt:        { fontSize: 11, color: colors.neutralMid, fontWeight: '500' },
  payBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.success, backgroundColor: '#F0FDF4' },
  payBtnTxt:      { fontSize: 13, fontWeight: '700', color: colors.success },
  empty:          { alignItems: 'center', paddingTop: 48, paddingHorizontal: spacing.xl },
  emptyTitle:     { fontSize: 16, fontWeight: '700', color: colors.textDark, marginTop: spacing.md },
  emptySubtitle:  { fontSize: 13, color: colors.neutralMid, textAlign: 'center', marginTop: spacing.xs, lineHeight: 20 },
});

// ── Calendar Picker Styles ──────────────────────────────────────────────────────
const CP = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  header:      { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.textDark, marginLeft: 8 },
  pill:        { flex: 1, backgroundColor: colors.background || '#F9FAFB', borderRadius: radius.md, padding: spacing.md, borderWidth: 2, borderColor: colors.border },
  pillActive:  { borderColor: colors.primary, backgroundColor: (colors.primaryLight || '#EEF2FF') },
  pillLbl:     { fontSize: 10, color: colors.neutralMid, fontWeight: '700', marginBottom: 2 },
  pillVal:     { fontSize: 14, fontWeight: '800', color: colors.textDark },
  hint:        { textAlign: 'center', color: colors.neutralMid, fontSize: 12, marginBottom: 14 },
  arrowBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  arrowTxt:    { fontSize: 24, color: colors.primary, fontWeight: '700', lineHeight: 28 },
  monthTitle:  { fontSize: 17, fontWeight: '800', color: colors.textDark },
  dayHdr:      { fontSize: 12, fontWeight: '700', color: colors.neutralMid },
  presets:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.lg, marginBottom: spacing.md },
  presetBtn:   { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.primary },
  presetTxt:   { color: colors.primary, fontWeight: '700', fontSize: 13 },
  applyBtn:    { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm },
  applyTxt:    { color: colors.white, fontWeight: '700', fontSize: 15 },
});

// ── Loan Pay Modal Styles ───────────────────────────────────────────────────────
const LP = StyleSheet.create({
  mask:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:        { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  handle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 },
  title:        { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 4 },
  sub:          { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  sectionLbl:   { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5, marginBottom: 10 },
  methodRow:    { flexDirection: 'row', gap: 10, marginBottom: 24 },
  methodBtn:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', gap: 6 },
  methodBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodLbl:    { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  confirmBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.success || '#16A34A', borderRadius: 14, paddingVertical: 15 },
  confirmTxt:   { color: '#fff', fontWeight: '800', fontSize: 15 },
});
