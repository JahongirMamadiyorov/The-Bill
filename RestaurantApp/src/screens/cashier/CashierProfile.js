import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, StatusBar,
} from 'react-native';
import ConfirmDialog from '../../components/ConfirmDialog';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../../context/AuthContext';
import { shiftsAPI, ordersAPI } from '../../api/client';
import { colors, spacing, radius, shadow, topInset } from '../../utils/theme';

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n) => Number(parseFloat(n) || 0).toLocaleString('uz-UZ') + " so'm";

const timeStr = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
};

const dateLbl = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
};

const shiftDuration = (start, end) => {
  if (!start) return '—';
  const diff = Math.floor((end ? new Date(end) : Date.now()) - new Date(start)) / 60000;
  const h = Math.floor(diff / 60);
  const m = Math.round(diff % 60);
  return `${h}h ${m}m`;
};

const hoursWorked = (h) => {
  const n = parseFloat(h) || 0;
  const hh = Math.floor(n);
  const mm = Math.round((n - hh) * 60);
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
};

// ── Sub-components ─────────────────────────────────────────────────────────────
function InfoRow({ label, value, valueColor }) {
  return (
    <View style={S.infoRow}>
      <Text style={S.infoLbl}>{label}</Text>
      <Text style={[S.infoVal, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function SectionHead({ title, icon }) {
  return (
    <View style={S.sectionHeadRow}>
      {icon && <MaterialIcons name={icon} size={14} color={colors.neutralMid} />}
      <Text style={S.sectionHead}>{title}</Text>
    </View>
  );
}

// ── CashierProfile ─────────────────────────────────────────────────────────────
export default function CashierProfile() {
  const { user, logout } = useAuth();

  const [shift,        setShift]        = useState(null);
  const [todayStats,   setTodayStats]   = useState({ count: 0, revenue: 0, avg: 0 });
  const [weekStats,    setWeekStats]    = useState({ count: 0, revenue: 0, hours: 0 });
  const [shiftHistory, setShiftHistory] = useState([]);
  const [pageLoading,  setPageLoading]  = useState(true);

  const [endShiftOpen,    setEndShiftOpen]    = useState(false);
  const [startShiftLoad,  setStartShiftLoad]  = useState(false);
  const [endShiftLoad,    setEndShiftLoad]    = useState(false);
  const [dialog,          setDialog]          = useState(null);

  // Live clock — re-renders every minute while shift is active
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!shift) return;
    const iv = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(iv);
  }, [shift]);

  const loadData = useCallback(async () => {
    try {
      const [activeRes, ordersRes, historyRes] = await Promise.all([
        shiftsAPI.getActive(),
        ordersAPI.getAll({ status: 'paid' }),
        shiftsAPI.getMyShifts(),
      ]);

      // getActive returns { active: true/false, ...shiftRow }
      const activeShift = activeRes.data?.active ? activeRes.data : null;
      setShift(activeShift);

      // Today's orders
      const todayStr = new Date().toDateString();
      const paid = (ordersRes.data || []).filter(o =>
        new Date(o.paid_at || o.updated_at).toDateString() === todayStr
      );
      const rev = paid.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
      setTodayStats({
        count: paid.length,
        revenue: rev,
        avg: paid.length ? Math.round(rev / paid.length) : 0,
      });

      // This week's orders
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekPaid = (ordersRes.data || []).filter(o =>
        new Date(o.paid_at || o.updated_at) >= weekStart
      );
      const weekRev = weekPaid.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);

      // This week's shift hours
      const allShifts = historyRes.data || [];
      const weekHours = allShifts
        .filter(s => s.clock_out && new Date(s.clock_in) >= weekStart)
        .reduce((s, sh) => s + (parseFloat(sh.hours_worked) || 0), 0);
      setWeekStats({ count: weekPaid.length, revenue: weekRev, hours: Math.round(weekHours * 10) / 10 });

      // Last 5 completed shifts
      const done = allShifts.filter(s => s.clock_out).slice(0, 5);
      setShiftHistory(done);
    } catch { /* silent */ }
    finally { setPageLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const startShift = async () => {
    setStartShiftLoad(true);
    try {
      await shiftsAPI.clockIn({ user_id: user?.id });
      await loadData();
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Could not start shift', type: 'error' });
    } finally { setStartShiftLoad(false); }
  };

  const endShift = async () => {
    setEndShiftLoad(true);
    try {
      await shiftsAPI.clockOut();
      setShift(null);
      setEndShiftOpen(false);
      await loadData();
    } catch (e) {
      setDialog({ title: 'Error', message: e?.response?.data?.error || 'Could not end shift', type: 'error' });
    } finally { setEndShiftLoad(false); }
  };

  if (pageLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={S.page}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: topInset + spacing.sm, paddingBottom: 40, gap: spacing.md }}
    >
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── Identity card ──────────────────────────────────────────────────── */}
      <View style={S.identityCard}>
        <View style={S.avatar}>
          <MaterialIcons name="person" size={32} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.userName}>{user?.name || 'Cashier'}</Text>
          <View style={S.roleBadge}>
            <Text style={S.roleTxt}>Cashier</Text>
          </View>
          {user?.phone ? (
            <View style={S.metaRow}>
              <MaterialIcons name="phone" size={13} color={colors.neutralMid} />
              <Text style={S.metaTxt}>{user.phone}</Text>
            </View>
          ) : null}
        </View>
        {/* Shift status dot */}
        <View style={[S.shiftDot, shift ? S.shiftDotOn : S.shiftDotOff]}>
          <Text style={S.shiftDotTxt}>{shift ? 'On Shift' : 'Off Shift'}</Text>
        </View>
      </View>

      {/* ── Active shift card ──────────────────────────────────────────────── */}
      {shift ? (
        <View style={S.activeShiftCard}>
          <View style={S.activeShiftTop}>
            <View style={S.activeShiftLeft}>
              <View style={S.shiftIndicator} />
              <View>
                <Text style={S.activeShiftTitle}>Shift in progress</Text>
                <Text style={S.activeShiftSub}>Started at {timeStr(shift.clock_in)}</Text>
              </View>
            </View>
            <Text style={S.activeShiftDur}>{shiftDuration(shift.clock_in, null)}</Text>
          </View>
          <View style={S.activeShiftRow}>
            <View style={S.activeShiftStat}>
              <Text style={S.activeShiftStatLbl}>Date</Text>
              <Text style={S.activeShiftStatVal}>{dateLbl(shift.clock_in)}</Text>
            </View>
            <View style={S.activeShiftStat}>
              <Text style={S.activeShiftStatLbl}>Orders today</Text>
              <Text style={S.activeShiftStatVal}>{todayStats.count}</Text>
            </View>
            <View style={S.activeShiftStat}>
              <Text style={S.activeShiftStatLbl}>Revenue today</Text>
              <Text style={[S.activeShiftStatVal, { color: colors.primary }]}>
                {Math.round(todayStats.revenue / 1000)}K
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={S.endShiftBtn}
            onPress={() => setEndShiftOpen(true)}
            activeOpacity={0.85}
          >
            <MaterialIcons name="timer-off" size={17} color={colors.warning} />
            <Text style={S.endShiftBtnTxt}>End Shift</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={S.noShiftCard}>
          <MaterialIcons name="timer" size={28} color={colors.neutralMid} />
          <View style={{ flex: 1 }}>
            <Text style={S.noShiftTitle}>No active shift</Text>
            <Text style={S.noShiftSub}>Start a shift to begin processing orders</Text>
          </View>
          <TouchableOpacity
            style={[S.startShiftBtn, startShiftLoad && { opacity: 0.6 }]}
            onPress={startShift}
            disabled={startShiftLoad}
            activeOpacity={0.85}
          >
            {startShiftLoad
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={S.startShiftBtnTxt}>Start</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* ── Today's stats ──────────────────────────────────────────────────── */}
      <SectionHead title="Today's Stats" icon="today" />
      <View style={S.statsGrid}>
        <View style={S.statCard}>
          <Text style={S.statLbl}>Orders</Text>
          <Text style={[S.statVal, { color: colors.primary }]}>{todayStats.count}</Text>
        </View>
        <View style={S.statCard}>
          <Text style={S.statLbl}>Revenue</Text>
          <Text style={[S.statVal, { color: colors.success }]}>{Math.round(todayStats.revenue / 1000)}K</Text>
          <Text style={S.statSub}>so'm</Text>
        </View>
        <View style={S.statCard}>
          <Text style={S.statLbl}>Avg Order</Text>
          <Text style={S.statVal}>{Math.round(todayStats.avg / 1000)}K</Text>
          <Text style={S.statSub}>so'm</Text>
        </View>
      </View>

      {/* ── This week's stats ──────────────────────────────────────────────── */}
      <SectionHead title="This Week" icon="date-range" />
      <View style={S.weekCard}>
        <View style={S.weekItem}>
          <MaterialIcons name="receipt-long" size={18} color={colors.primary} />
          <Text style={S.weekLbl}>Orders</Text>
          <Text style={S.weekVal}>{weekStats.count}</Text>
        </View>
        <View style={S.weekDivider} />
        <View style={S.weekItem}>
          <MaterialIcons name="payments" size={18} color={colors.success} />
          <Text style={S.weekLbl}>Revenue</Text>
          <Text style={[S.weekVal, { color: colors.success }]}>
            {Math.round(weekStats.revenue / 1000)}K
          </Text>
        </View>
        <View style={S.weekDivider} />
        <View style={S.weekItem}>
          <MaterialIcons name="schedule" size={18} color={colors.neutralMid} />
          <Text style={S.weekLbl}>Hours</Text>
          <Text style={S.weekVal}>{weekStats.hours}h</Text>
        </View>
      </View>

      {/* ── Recent shift history ───────────────────────────────────────────── */}
      {shiftHistory.length > 0 && (
        <>
          <SectionHead title="Recent Shifts" icon="history" />
          <View style={S.historyCard}>
            {shiftHistory.map((s, i) => (
              <View
                key={s.id}
                style={[S.historyRow, i < shiftHistory.length - 1 && S.historyRowBorder]}
              >
                <View style={S.historyLeft}>
                  <Text style={S.historyDate}>{dateLbl(s.clock_in)}</Text>
                  <Text style={S.historyTime}>
                    {timeStr(s.clock_in)} — {timeStr(s.clock_out)}
                  </Text>
                </View>
                <View style={S.historyRight}>
                  <Text style={S.historyDur}>{hoursWorked(s.hours_worked)}</Text>
                  <View style={[S.historyBadge, s.status === 'present' ? S.badgePresent : S.badgeLate]}>
                    <Text style={[S.historyBadgeTxt, s.status === 'present' ? { color: '#16A34A' } : { color: '#D97706' }]}>
                      {s.status === 'present' ? 'On time' : 'Late'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Sign out ───────────────────────────────────────────────────────── */}
      <TouchableOpacity style={S.signOut} onPress={logout} activeOpacity={0.85}>
        <MaterialIcons name="logout" size={18} color={colors.danger} />
        <Text style={S.signOutTxt}>Sign Out</Text>
      </TouchableOpacity>

      {/* ── End Shift confirmation sheet ───────────────────────────────────── */}
      <Modal
        visible={endShiftOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEndShiftOpen(false)}
      >
        <TouchableOpacity style={S.mask} onPress={() => setEndShiftOpen(false)} />
        <View style={S.sheet}>
          <Text style={S.sheetTitle}>End Shift Summary</Text>
          <View style={S.infoBox}>
            <InfoRow label="Date"              value={dateLbl(shift?.clock_in)} />
            <InfoRow label="Started"           value={timeStr(shift?.clock_in)} />
            <InfoRow label="Duration"          value={shiftDuration(shift?.clock_in, null)} valueColor={colors.primary} />
            <InfoRow label="Orders processed"  value={String(todayStats.count)} />
            <InfoRow label="Total revenue"     value={fmt(todayStats.revenue)} />
            <InfoRow label="Average order"     value={fmt(todayStats.avg)} />
          </View>
          <TouchableOpacity
            style={[S.warnBtn, endShiftLoad && { opacity: 0.6 }]}
            onPress={endShift}
            disabled={endShiftLoad}
            activeOpacity={0.85}
          >
            {endShiftLoad
              ? <ActivityIndicator color="#fff" />
              : <Text style={S.warnBtnTxt}>Confirm End Shift</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={S.cancelBtn}
            onPress={() => setEndShiftOpen(false)}
          >
            <Text style={S.cancelBtnTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:               { flex: 1, backgroundColor: colors.background },

  // Identity
  identityCard:       { backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, ...shadow.card },
  avatar:             { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primaryLight || '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  userName:           { fontSize: 17, fontWeight: '800', color: colors.textDark },
  roleBadge:          { backgroundColor: colors.primaryLight || '#EEF2FF', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, marginTop: 4 },
  roleTxt:            { fontSize: 11, fontWeight: '700', color: colors.primary },
  metaRow:            { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaTxt:            { fontSize: 12, color: colors.neutralMid },
  shiftDot:           { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
  shiftDotOn:         { backgroundColor: '#F0FDF4' },
  shiftDotOff:        { backgroundColor: colors.neutralLight },
  shiftDotTxt:        { fontSize: 10, fontWeight: '700', color: colors.neutralMid },

  // Active shift
  activeShiftCard:    { backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.lg, ...shadow.card, borderLeftWidth: 3, borderLeftColor: colors.primary },
  activeShiftTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  activeShiftLeft:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  shiftIndicator:     { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  activeShiftTitle:   { fontSize: 14, fontWeight: '800', color: colors.textDark },
  activeShiftSub:     { fontSize: 11, color: colors.neutralMid, marginTop: 1 },
  activeShiftDur:     { fontSize: 18, fontWeight: '800', color: colors.primary },
  activeShiftRow:     { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  activeShiftStat:    {},
  activeShiftStatLbl: { fontSize: 10, color: colors.neutralMid, fontWeight: '600', marginBottom: 2 },
  activeShiftStatVal: { fontSize: 14, fontWeight: '800', color: colors.textDark },
  endShiftBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.warning, backgroundColor: '#FFFBEB' },
  endShiftBtnTxt:     { fontSize: 13, fontWeight: '700', color: colors.warning },

  // No shift
  noShiftCard:        { backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadow.card },
  noShiftTitle:       { fontSize: 14, fontWeight: '700', color: colors.textDark },
  noShiftSub:         { fontSize: 11, color: colors.neutralMid, marginTop: 2 },
  startShiftBtn:      { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.btn },
  startShiftBtnTxt:   { color: '#fff', fontWeight: '800', fontSize: 13 },

  // Section header
  sectionHeadRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sectionHead:        { fontSize: 11, fontWeight: '700', color: colors.neutralMid, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Today stats
  statsGrid:          { flexDirection: 'row', gap: spacing.sm },
  statCard:           { flex: 1, backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.md, alignItems: 'center', ...shadow.card },
  statLbl:            { fontSize: 10, color: colors.neutralMid, fontWeight: '600', marginBottom: 2 },
  statVal:            { fontSize: 20, fontWeight: '800', color: colors.textDark },
  statSub:            { fontSize: 9, color: colors.neutralMid },

  // Week stats
  weekCard:           { backgroundColor: colors.white, borderRadius: radius.card, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', ...shadow.card },
  weekItem:           { flex: 1, alignItems: 'center', gap: 3 },
  weekLbl:            { fontSize: 10, color: colors.neutralMid, fontWeight: '600', textAlign: 'center' },
  weekVal:            { fontSize: 16, fontWeight: '800', color: colors.textDark },
  weekDivider:        { width: 1, height: 36, backgroundColor: colors.border },

  // Shift history
  historyCard:        { backgroundColor: colors.white, borderRadius: radius.card, ...shadow.card, overflow: 'hidden' },
  historyRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  historyRowBorder:   { borderBottomWidth: 1, borderBottomColor: colors.border },
  historyLeft:        {},
  historyDate:        { fontSize: 13, fontWeight: '700', color: colors.textDark },
  historyTime:        { fontSize: 11, color: colors.neutralMid, marginTop: 1 },
  historyRight:       { alignItems: 'flex-end', gap: 3 },
  historyDur:         { fontSize: 14, fontWeight: '800', color: colors.primary },
  historyBadge:       { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  badgePresent:       { backgroundColor: '#F0FDF4' },
  badgeLate:          { backgroundColor: '#FFFBEB' },
  historyBadgeTxt:    { fontSize: 9, fontWeight: '700' },

  // Sign out
  signOut:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 2, borderColor: colors.danger, borderRadius: radius.btn, paddingVertical: 14 },
  signOutTxt:         { fontSize: 15, fontWeight: '800', color: colors.danger },

  // Bottom sheet
  mask:               { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:              { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl },
  sheetTitle:         { fontSize: 16, fontWeight: '700', color: colors.textDark, marginBottom: spacing.lg },
  infoBox:            { backgroundColor: colors.neutralLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  infoRow:            { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  infoLbl:            { fontSize: 13, color: colors.neutralMid },
  infoVal:            { fontSize: 13, fontWeight: '700', color: colors.textDark },
  warnBtn:            { backgroundColor: colors.warning, borderRadius: radius.btn, paddingVertical: 15, alignItems: 'center', marginBottom: spacing.sm },
  warnBtnTxt:         { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancelBtn:          { paddingVertical: 13, alignItems: 'center' },
  cancelBtnTxt:       { fontSize: 14, fontWeight: '600', color: colors.neutralMid },
});
