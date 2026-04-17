// ════════════════════════════════════════════════════════════════════════════
// WaitressNotifications — New / Read tabs, auto-purge > 5 days
// ════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { notificationsAPI } from '../../api/client';
import { colors, spacing, radius, shadow, topInset } from '../../utils/theme';

// ── Type config (icon + accent colour) ───────────────────────────────────────
const TYPE_CONFIG = {
  order_ready: { icon: 'check-circle',           color: '#16A34A', bg: '#DCFCE7', label: 'Order Ready' },
  low_stock:   { icon: 'warning-amber',          color: '#D97706', bg: '#FEF3C7', label: 'Low Stock'   },
  alert:       { icon: 'notification-important', color: '#DC2626', bg: '#FEE2E2', label: 'Alert'       },
  default:     { icon: 'notifications',          color: '#2563EB', bg: '#DBEAFE', label: 'Notice'      },
};

// ── Smart timestamp ───────────────────────────────────────────────────────────
const fmtTime = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const smartTimestamp = (isoStr) => {
  if (!isoStr) return '';
  const date     = new Date(isoStr);
  const now      = new Date();
  const diffMins = Math.floor((now - date) / 60000);

  if (diffMins < 1)  return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;

  const todayStart     = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(todayStart.getDate() - 1);

  if (date >= todayStart)     return `Today ${fmtTime(date)}`;
  if (date >= yesterdayStart) return `Yesterday ${fmtTime(date)}`;

  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + fmtTime(date);
};

// ── Single notification card ──────────────────────────────────────────────────
function NotifCard({ item, onPress, isNew }) {
  const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.default;

  return (
    <TouchableOpacity
      style={[styles.card, isNew && styles.cardUnread]}
      onPress={() => onPress(item.id)}
      activeOpacity={0.8}
    >
      {/* Left accent bar for unread */}
      {isNew && <View style={styles.unreadBar} />}

      {/* Icon badge */}
      <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
        <MaterialIcons name={cfg.icon} size={22} color={cfg.color} />
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, isNew && styles.cardTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          {isNew && <View style={[styles.unreadDot, { backgroundColor: cfg.color }]} />}
        </View>
        {item.body ? (
          <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
        ) : null}
        <Text style={styles.cardTime}>{smartTimestamp(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Tab pill ──────────────────────────────────────────────────────────────────
function TabPill({ label, count, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.tabPill, active && styles.tabPillActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>
        {label}
      </Text>
      {count > 0 && (
        <View style={[styles.tabBadge, active ? styles.tabBadgeActive : styles.tabBadgeInactive]}>
          <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ tab }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <MaterialIcons
          name={tab === 'new' ? 'notifications-none' : 'done-all'}
          size={44}
          color={colors.primary}
        />
      </View>
      <Text style={styles.emptyTitle}>
        {tab === 'new' ? 'No new notifications' : 'No read notifications'}
      </Text>
      <Text style={styles.emptySubTitle}>
        {tab === 'new'
          ? "You're all caught up! We'll notify you when something needs attention."
          : 'Messages you open will appear here.'}
      </Text>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════
export default function WaitressNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [refreshing,    setRefreshing]    = useState(false);
  const [activeTab,     setActiveTab]     = useState('new'); // 'new' | 'read'

  const load = useCallback(async () => {
    try {
      // Purge notifications older than 5 days first (fire-and-forget)
      notificationsAPI.deleteOld().catch(() => {});

      const res = await notificationsAPI.getAll();
      setNotifications(res.data || []);
    } catch {
      // Silently fail — notifications are not critical
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [load]);

  const markRead = async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch (_) {}
  };

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (_) {}
  };

  const newItems  = notifications.filter(n => !n.is_read);
  const readItems = notifications.filter(n =>  n.is_read);
  const listData  = activeTab === 'new' ? newItems : readItems;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {newItems.length > 0 && activeTab === 'new' && (
            <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
              <MaterialIcons name="done-all" size={15} color={colors.white} style={{ marginRight: 4 }} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Tab row ── */}
        <View style={styles.tabRow}>
          <TabPill
            label="New"
            count={newItems.length}
            active={activeTab === 'new'}
            onPress={() => setActiveTab('new')}
          />
          <TabPill
            label="Read"
            count={readItems.length}
            active={activeTab === 'read'}
            onPress={() => setActiveTab('read')}
          />
        </View>
      </View>

      {/* ── List ── */}
      <FlatList
        data={listData}
        keyExtractor={n => String(n.id)}
        contentContainerStyle={[styles.list, listData.length === 0 && { flex: 1 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <NotifCard
            item={item}
            isNew={!item.is_read}
            onPress={activeTab === 'new' ? markRead : () => {}}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={<EmptyState tab={activeTab} />}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    backgroundColor: colors.primary,
    paddingTop: topInset + 8,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerTitle:  { fontSize: 26, fontWeight: '800', color: colors.white },
  markAllBtn:   {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  markAllText: { color: colors.white, fontSize: 13, fontWeight: '600' },

  // Tab row
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    gap: 6,
  },
  tabPillActive: {
    backgroundColor: colors.white,
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
  tabPillTextActive: {
    color: colors.primary,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeActive:   { backgroundColor: colors.primary },
  tabBadgeInactive: { backgroundColor: 'rgba(255,255,255,0.35)' },
  tabBadgeText:     { fontSize: 11, fontWeight: '800', color: colors.white },
  tabBadgeTextActive: { color: colors.white },

  // List
  list: { padding: spacing.lg, paddingBottom: 40 },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.sm,
  },
  cardUnread: {
    backgroundColor: '#EFF6FF',
    ...shadow.md,
  },
  unreadBar:   { width: 4, alignSelf: 'stretch', backgroundColor: '#2563EB' },
  iconWrap:    { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.md, marginRight: spacing.sm, flexShrink: 0 },
  cardContent: { flex: 1, paddingVertical: spacing.md, paddingRight: spacing.md },
  cardTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  cardTitle:   { fontSize: 14, fontWeight: '600', color: colors.textDark, flex: 1 },
  cardTitleUnread: { fontWeight: '800' },
  unreadDot:   { width: 8, height: 8, borderRadius: 4, marginLeft: spacing.sm, flexShrink: 0 },
  cardBody:    { fontSize: 13, color: colors.textMuted, marginBottom: 5, lineHeight: 18 },
  cardTime:    { fontSize: 11, color: colors.textMuted },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: 60,
  },
  emptyIconWrap:  { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  emptyTitle:     { fontSize: 18, fontWeight: '800', color: colors.textDark, marginBottom: spacing.sm, textAlign: 'center' },
  emptySubTitle:  { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
});
