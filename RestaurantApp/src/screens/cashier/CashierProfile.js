import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { ordersAPI } from '../../api/client';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { colors, spacing, radius, shadow, topInset } from '../../utils/theme';

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n) => Number(parseFloat(n) || 0).toLocaleString('uz-UZ') + " so'm";

// ── Sub-components ─────────────────────────────────────────────────────────────
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
  const { t } = useTranslation();

  const [todayStats,   setTodayStats]   = useState({ count: 0, revenue: 0, avg: 0 });
  const [weekStats,    setWeekStats]    = useState({ count: 0, revenue: 0 });
  const [pageLoading,  setPageLoading]  = useState(true);

  const loadData = useCallback(async () => {
    try {
      const ordersRes = await ordersAPI.getAll({ status: 'paid' });

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
      setWeekStats({ count: weekPaid.length, revenue: weekRev });
    } catch { /* silent */ }
    finally { setPageLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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
          <Text style={S.userName}>{user?.name || t('roles.cashier')}</Text>
          <View style={S.roleBadge}>
            <Text style={S.roleTxt}>{t('roles.cashier')}</Text>
          </View>
          {user?.phone ? (
            <View style={S.metaRow}>
              <MaterialIcons name="phone" size={13} color={colors.neutralMid} />
              <Text style={S.metaTxt}>{user.phone}</Text>
            </View>
          ) : null}
          {user?.email ? (
            <View style={S.metaRow}>
              <MaterialIcons name="email" size={13} color={colors.neutralMid} />
              <Text style={S.metaTxt}>{user.email}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Today's stats ──────────────────────────────────────────────────── */}
      <SectionHead title={t('cashier.profile.todaysStats')} icon="today" />
      <View style={S.statsGrid}>
        <View style={S.statCard}>
          <Text style={S.statLbl}>{t('cashier.profile.orders')}</Text>
          <Text style={[S.statVal, { color: colors.primary }]}>{todayStats.count}</Text>
        </View>
        <View style={S.statCard}>
          <Text style={S.statLbl}>{t('cashier.profile.revenue')}</Text>
          <Text style={[S.statVal, { color: colors.success }]}>{Math.round(todayStats.revenue / 1000)}K</Text>
          <Text style={S.statSub}>{t('common.currency')}</Text>
        </View>
        <View style={S.statCard}>
          <Text style={S.statLbl}>{t('cashier.profile.avgOrder')}</Text>
          <Text style={S.statVal}>{Math.round(todayStats.avg / 1000)}K</Text>
          <Text style={S.statSub}>{t('common.currency')}</Text>
        </View>
      </View>

      {/* ── This week's stats ──────────────────────────────────────────────── */}
      <SectionHead title={t('cashier.profile.thisWeek')} icon="date-range" />
      <View style={S.weekCard}>
        <View style={S.weekItem}>
          <MaterialIcons name="receipt-long" size={18} color={colors.primary} />
          <Text style={S.weekLbl}>{t('cashier.profile.orders')}</Text>
          <Text style={S.weekVal}>{weekStats.count}</Text>
        </View>
        <View style={S.weekDivider} />
        <View style={S.weekItem}>
          <MaterialIcons name="payments" size={18} color={colors.success} />
          <Text style={S.weekLbl}>{t('cashier.profile.revenue')}</Text>
          <Text style={[S.weekVal, { color: colors.success }]}>
            {Math.round(weekStats.revenue / 1000)}K
          </Text>
        </View>
      </View>

      {/* ── Language ───────────────────────────────────────────────────────── */}
      <SectionHead title={t('language.title')} icon="language" />
      <LanguageSwitcher accentColor={colors.info} style={{ marginHorizontal: 0 }} />

      {/* ── Sign out ───────────────────────────────────────────────────────── */}
      <TouchableOpacity style={S.signOut} onPress={logout} activeOpacity={0.85}>
        <MaterialIcons name="logout" size={18} color={colors.danger} />
        <Text style={S.signOutTxt}>{t('cashier.profile.signOut')}</Text>
      </TouchableOpacity>
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

  // Sign out
  signOut:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 2, borderColor: colors.danger, borderRadius: radius.btn, paddingVertical: 14 },
  signOutTxt:         { fontSize: 15, fontWeight: '800', color: colors.danger },
});
