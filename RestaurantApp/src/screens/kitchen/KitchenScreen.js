/**
 * KitchenScreen.js — Kitchen Display System (KDS)
 * Light theme matching admin/cashier panels.
 *
 * Features:
 *  • Per-item ready tick buttons (order auto-advances to ready when all ticked)
 *  • Order shows "Prep in progress" if even one item is not ready
 *  • Light theme (white cards, #F9FAFB background)
 *  • Station badge — shows current user's assigned station
 *  • Vibration alarm when new orders arrive
 *  • Live per-order timers (green → amber → red)
 *  • History tab with Mine/All toggle + date period picker
 *  • Stats bar: Active · Done Today · Avg Cook Time
 *  • Queue tab + History tab
 *  • Profile button → KitchenProfile screen
 *  • Pull-to-refresh + 8 s polling
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, StatusBar, Animated,
  Platform, Vibration, Modal, ScrollView,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import api, { notificationsAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { topInset } from '../../utils/theme';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:           '#F9FAFB',
  card:         '#FFFFFF',
  cardBorder:   '#E5E7EB',
  header:       '#FFFFFF',
  headerBorder: '#E5E7EB',
  primary:      '#2563EB',
  primaryLight: '#EFF6FF',
  success:      '#16A34A',
  successLight: '#F0FDF4',
  warning:      '#D97706',
  warningLight: '#FFFBEB',
  danger:       '#DC2626',
  dangerLight:  '#FEF2F2',
  purple:       '#7C3AED',
  purpleLight:  '#F5F3FF',
  textDark:     '#111827',
  textMid:      '#374151',
  textMuted:    '#6B7280',
  border:       '#E5E7EB',
  white:        '#FFFFFF',
};

const STATION_COLORS = {
  salad:    { bg: '#F0FDF4', text: '#16A34A', icon: 'eco' },
  grill:    { bg: '#FFF7ED', text: '#EA580C', icon: 'outdoor-grill' },
  bar:      { bg: '#EFF6FF', text: '#2563EB', icon: 'local-bar' },
  pastry:   { bg: '#FDF4FF', text: '#A21CAF', icon: 'cake' },
  cold:     { bg: '#ECFEFF', text: '#0891B2', icon: 'ac-unit' },
  hot:      { bg: '#FEF2F2', text: '#DC2626', icon: 'local-fire-department' },
  default:  { bg: '#F3F4F6', text: '#6B7280', icon: 'restaurant' },
};

function stationStyle(station) {
  if (!station) return null;
  const key = station.toLowerCase();
  return STATION_COLORS[key] || STATION_COLORS.default;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMinSec(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function timerColor(mins) {
  if (mins < 10) return C.success;
  if (mins < 20) return C.warning;
  return C.danger;
}

// Derive display status from item-level readiness
function deriveDisplayStatus(order) {
  const items = order.items || [];
  if (items.length === 0) return order.status;
  const readyCount = items.filter(i => i.item_ready).length;
  if (order.status === 'ready') return 'ready';
  if (readyCount === 0) {
    if (order.status === 'preparing') return 'preparing';
    return order.status; // pending / sent_to_kitchen
  }
  // Some items done but not all → "prep in progress"
  return 'partial';
}

function statusLabel(s) {
  switch (s) {
    case 'pending':         return 'New Order';
    case 'sent_to_kitchen': return 'New Order';
    case 'preparing':       return 'Cooking';
    case 'partial':         return 'Prep in Progress';
    case 'ready':           return 'Ready';
    case 'served':          return 'Served';
    case 'paid':            return 'Done';
    default:                return s;
  }
}
function statusStyle(s) {
  if (s === 'pending' || s === 'sent_to_kitchen') return { bg: C.warningLight, text: C.warning };
  if (s === 'preparing') return { bg: C.primaryLight, text: C.primary };
  if (s === 'partial')   return { bg: '#FFF7ED', text: '#C2410C' };
  if (s === 'ready')     return { bg: C.successLight, text: C.success };
  if (s === 'served')    return { bg: C.purpleLight,  text: C.purple  };
  return { bg: '#F3F4F6', text: C.textMuted };
}
function nextStatus(s) {
  if (s === 'pending' || s === 'sent_to_kitchen') return 'preparing';
  return null; // "Mark Ready" is now done per-item
}
function nextStatusLabel(s) {
  if (s === 'pending' || s === 'sent_to_kitchen') return 'Start Cooking';
  return null;
}

// ─── Live timer hook ──────────────────────────────────────────────────────────
function useTimer(createdAt) {
  const [secs, setSecs] = useState(
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  );
  useEffect(() => {
    const id = setInterval(
      () => setSecs(Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [createdAt]);
  return secs;
}

// ─── Pulsing urgency indicator for overdue orders ────────────────────────────
function UrgentPulse({ active }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { anim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active]);
  if (!active) return null;
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <Animated.View style={[st.urgentBar, { opacity }]} />
  );
}

// ─── New-order flash banner ───────────────────────────────────────────────────
function NewOrderBanner({ visible, onDismiss }) {
  const slide = useRef(new Animated.Value(-80)).current;
  useEffect(() => {
    if (visible) {
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 20 }).start();
    } else {
      Animated.timing(slide, { toValue: -80, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <Animated.View style={[st.newOrderBanner, { transform: [{ translateY: slide }] }]}>
      <MaterialIcons name="notifications-active" size={22} color={C.white} />
      <Text style={st.newOrderBannerTxt}>New order arrived!</Text>
      <TouchableOpacity onPress={onDismiss} style={st.bannerDismiss}>
        <MaterialIcons name="close" size={18} color={C.white} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Order card with per-item ready ticks ─────────────────────────────────────
function OrderCard({ order, onAdvance, advancing, onItemReady, itemAdvancing }) {
  const secs    = useTimer(order.created_at);
  const mins    = Math.floor(secs / 60);
  const urgent  = mins >= 20;
  const tColor  = timerColor(mins);
  const dispSt  = deriveDisplayStatus(order);
  const ss      = statusStyle(dispSt);
  const next    = nextStatus(order.status);
  const nextLbl = nextStatusLabel(order.status);

  const items = order.items || [];
  const readyCount = items.filter(i => i.item_ready).length;
  const totalCount = items.length;
  const allReady   = totalCount > 0 && readyCount === totalCount;

  return (
    <View style={[st.card, urgent && st.cardUrgent]}>
      <UrgentPulse active={urgent} />

      {/* Header row */}
      <View style={st.cardHeader}>
        <View style={st.cardHeaderLeft}>
          <View style={[st.tableBadge, { backgroundColor: ss.bg, borderColor: ss.text + '40' }]}>
            <MaterialIcons name="table-restaurant" size={14} color={ss.text} />
            <Text style={[st.tableTxt, { color: ss.text }]}>
              {order.table_number ? `Table ${order.table_number}` : 'Walk-in'}
            </Text>
          </View>
          {urgent && (
            <View style={st.urgentBadge}>
              <MaterialIcons name="priority-high" size={11} color={C.white} />
              <Text style={st.urgentBadgeTxt}>URGENT</Text>
            </View>
          )}
        </View>

        {/* Timer */}
        <View style={[st.timerBox, { backgroundColor: tColor + '15', borderColor: tColor + '40' }]}>
          <MaterialIcons name="timer" size={14} color={tColor} />
          <Text style={[st.timerTxt, { color: tColor }]}>{fmtMinSec(secs)}</Text>
        </View>
      </View>

      {/* Meta row */}
      <View style={st.metaRow}>
        <MaterialIcons name="person-outline" size={13} color={C.textMuted} />
        <Text style={st.metaTxt}>{order.waitress_name || 'Walk-in'}</Text>
        {order.daily_number && (
          <>
            <Text style={[st.metaTxt, { marginHorizontal: 4, color: C.border }]}>·</Text>
            <Text style={[st.metaTxt, { fontWeight: '600', color: C.primary }]}>
              #{order.daily_number}
            </Text>
          </>
        )}
      </View>

      {/* Status pill + progress */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <View style={[st.statusPill, { backgroundColor: ss.bg, marginBottom: 0 }]}>
          <View style={[st.statusDot, { backgroundColor: ss.text }]} />
          <Text style={[st.statusTxt, { color: ss.text }]}>{statusLabel(dispSt)}</Text>
        </View>
        {totalCount > 0 && (
          <View style={st.progressPill}>
            <MaterialIcons name="check-circle" size={12} color={allReady ? C.success : C.textMuted} />
            <Text style={[st.progressTxt, allReady && { color: C.success }]}>
              {readyCount}/{totalCount} ready
            </Text>
          </View>
        )}
      </View>

      {/* Divider */}
      <View style={st.divider} />

      {/* Items with per-item tick buttons */}
      <View style={st.itemsList}>
        {items.map((item, i) => {
          const isDone     = !!item.item_ready;
          const isAdvancing= !!(itemAdvancing && itemAdvancing[item.id]);
          return (
            <View key={item.id || i} style={[st.itemRow, isDone && st.itemRowDone]}>
              <View style={st.qtyBox}>
                <Text style={st.qtyTxt}>{item.quantity}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.itemName, isDone && st.itemNameDone]}>
                  {item.item_name || item.name}
                </Text>
                {item.notes ? (
                  <View style={st.itemNoteRow}>
                    <MaterialIcons name="notes" size={11} color={C.warning} />
                    <Text style={st.itemNote}>{item.notes}</Text>
                  </View>
                ) : null}
                {item.kitchen_station ? (
                  <View style={st.stationTag}>
                    <Text style={[st.stationTagTxt, { color: stationStyle(item.kitchen_station)?.text || C.textMuted }]}>
                      {item.kitchen_station}
                    </Text>
                  </View>
                ) : null}
              </View>
              {/* Per-item ready tick */}
              <TouchableOpacity
                style={[st.itemTick, isDone && st.itemTickDone]}
                onPress={() => !isDone && !isAdvancing && onItemReady(order.id, item.id)}
                disabled={isDone || isAdvancing}
                activeOpacity={0.75}
              >
                {isAdvancing ? (
                  <ActivityIndicator size="small" color={isDone ? C.white : C.success} />
                ) : (
                  <MaterialIcons
                    name={isDone ? 'check-circle' : 'radio-button-unchecked'}
                    size={22}
                    color={isDone ? C.white : C.success}
                  />
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* Order notes */}
      {order.notes ? (
        <View style={st.orderNote}>
          <MaterialIcons name="info-outline" size={15} color={C.warning} />
          <Text style={st.orderNoteTxt}>{order.notes}</Text>
        </View>
      ) : null}

      {/* "Start Cooking" button — only shown when order is still new/pending */}
      {next && (
        <TouchableOpacity
          style={[
            st.actionBtn,
            st.actionBtnPrepare,
            advancing && st.actionBtnDisabled,
          ]}
          onPress={() => !advancing && onAdvance(order.id, next)}
          activeOpacity={0.85}
        >
          {advancing ? (
            <ActivityIndicator size="small" color={C.white} />
          ) : (
            <>
              <MaterialIcons name="local-fire-department" size={18} color={C.white} />
              <Text style={st.actionBtnTxt}>{nextLbl}</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── History card ─────────────────────────────────────────────────────────────
function HistoryCard({ order }) {
  const ss = statusStyle(order.status);
  const completedAt = order.updated_at ? new Date(order.updated_at) : null;
  const timeStr = completedAt
    ? completedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';
  return (
    <View style={st.histCard}>
      <View style={[st.histStripe, { backgroundColor: ss.text }]} />
      <View style={{ flex: 1, paddingVertical: 12, paddingRight: 12 }}>
        <View style={st.histTop}>
          <Text style={st.histTable}>
            {order.table_number ? `Table ${order.table_number}` : 'Walk-in'}
          </Text>
          <View style={[st.statusPill, { backgroundColor: ss.bg, paddingVertical: 3, marginBottom: 0 }]}>
            <View style={[st.statusDot, { backgroundColor: ss.text }]} />
            <Text style={[st.statusTxt, { color: ss.text, fontSize: 10 }]}>
              {statusLabel(order.status)}
            </Text>
          </View>
          <Text style={st.histTime}>{timeStr}</Text>
        </View>
        <Text style={st.histItems} numberOfLines={2}>
          {(order.items || []).map(i => `${i.quantity}× ${i.item_name || i.name}`).join('  ·  ')}
        </Text>
      </View>
    </View>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────
function StatsBar({ stats, loading }) {
  const items = [
    { icon: 'receipt-long',  label: 'ACTIVE',     value: loading ? '–' : String(stats?.active    ?? '–'), color: C.warning  },
    { icon: 'check-circle',  label: 'DONE TODAY', value: loading ? '–' : String(stats?.completed ?? '–'), color: C.success  },
    { icon: 'timer',         label: 'AVG COOK',   value: loading ? '–' : (stats?.avg_cook_minutes != null ? `${stats.avg_cook_minutes}m` : '–'), color: C.primary },
  ];
  return (
    <View style={st.statsBar}>
      {items.map((s, i) => (
        <View key={i} style={[st.statItem, i < items.length - 1 && st.statItemBorder]}>
          <MaterialIcons name={s.icon} size={18} color={s.color} />
          <Text style={[st.statValue, { color: s.color }]}>{s.value}</Text>
          <Text style={st.statLabel}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Date period picker ───────────────────────────────────────────────────────
const PERIOD_OPTS = [
  { id: 'today',     label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week',      label: 'This Week' },
  { id: 'month',     label: 'This Month' },
];

function periodToRange(id) {
  const now  = new Date();
  const from = new Date();
  if (id === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (id === 'yesterday') {
    from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() - 1);   now.setHours(23, 59, 59, 999);
  } else if (id === 'week') {
    from.setDate(from.getDate() - from.getDay()); from.setHours(0, 0, 0, 0);
  } else if (id === 'month') {
    from.setDate(1); from.setHours(0, 0, 0, 0);
  }
  return { from: from.toISOString(), to: now.toISOString() };
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function KitchenScreen({ navigation }) {
  const { user, logout } = useAuth();
  const station = user?.kitchen_station || null;
  const ss      = stationStyle(station);

  const [tab,        setTab]        = useState('queue');
  const [queue,      setQueue]      = useState([]);
  const [history,    setHistory]    = useState([]);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsLoad,  setStatsLoad]  = useState(true);
  const [advancing,  setAdvancing]  = useState({});
  const [itemAdvancing, setItemAdvancing] = useState({});
  const [unread,     setUnread]     = useState(0);
  const [newOrderAlert, setNewOrderAlert] = useState(false);

  // History filters
  const [histMine,    setHistMine]    = useState(false);
  const [histPeriod,  setHistPeriod]  = useState('today');
  const [histLoading, setHistLoading] = useState(false);

  const intervalRef   = useRef(null);
  const prevQueueLen  = useRef(-1);

  // ── Fetch queue ──
  const fetchQueue = useCallback(async (silent = false) => {
    try {
      const res  = await api.get('/orders/kitchen');
      const data = res.data || [];
      setQueue(data);

      if (prevQueueLen.current >= 0 && data.length > prevQueueLen.current) {
        setNewOrderAlert(true);
        Vibration.vibrate([0, 300, 100, 300, 100, 500]);
        setTimeout(() => setNewOrderAlert(false), 5000);
      }
      prevQueueLen.current = data.length;
    } catch (e) {
      console.error('KDS queue fetch error', e);
    } finally {
      if (!silent) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  const fetchHistory = useCallback(async (period = histPeriod, mine = histMine, showLoad = false) => {
    if (showLoad) setHistLoading(true);
    try {
      const { from, to } = periodToRange(period);
      const mineParam = mine && station ? '&mine=1' : '';
      const res = await api.get(`/orders/kitchen/completed?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${mineParam}`);
      setHistory(res.data || []);
    } catch (_) {}
    finally { setHistLoading(false); }
  }, [histPeriod, histMine, station]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/orders/kitchen/stats');
      setStats(res.data);
    } catch (_) {}
    finally { setStatsLoad(false); }
  }, []);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await notificationsAPI.getAll();
      setUnread((res.data || []).filter(n => !n.is_read).length);
    } catch (_) {}
  }, []);

  const loadAll = useCallback(async (silent = false) => {
    await Promise.all([fetchQueue(silent), fetchHistory(histPeriod, histMine, false), fetchStats(), fetchNotifs()]);
  }, [fetchQueue, fetchHistory, fetchStats, fetchNotifs, histPeriod, histMine]);

  useEffect(() => {
    loadAll(false);
    intervalRef.current = setInterval(() => loadAll(true), 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  // Re-fetch history when filters change
  useEffect(() => {
    fetchHistory(histPeriod, histMine, true);
  }, [histPeriod, histMine]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll(false);
  }, [loadAll]);

  // Order-level advance (Start Cooking only)
  const handleAdvance = useCallback(async (orderId, newSt) => {
    setAdvancing(p => ({ ...p, [orderId]: true }));
    try {
      await api.put(`/orders/${orderId}/status`, { status: newSt });
      setQueue(prev => prev.map(o => o.id === orderId ? { ...o, status: newSt } : o));
      await loadAll(true);
    } catch (e) {
      console.error('KDS advance error', e);
    } finally {
      setAdvancing(p => { const n = { ...p }; delete n[orderId]; return n; });
    }
  }, [loadAll]);

  // Per-item ready tick
  const handleItemReady = useCallback(async (orderId, itemId) => {
    setItemAdvancing(p => ({ ...p, [itemId]: true }));
    try {
      const res = await api.put(`/orders/${orderId}/items/${itemId}/ready`, { ready: true });
      const { all_ready, order_status } = res.data;

      // Optimistically mark item as done in queue
      setQueue(prev => prev.map(order => {
        if (order.id !== orderId) return order;
        const updatedItems = order.items.map(i =>
          String(i.id) === String(itemId) ? { ...i, item_ready: true } : i
        );
        return { ...order, items: updatedItems, status: order_status || order.status };
      }));

      // If all items ready, remove from queue after short delay
      if (all_ready) {
        setTimeout(() => {
          setQueue(prev => prev.filter(o => o.id !== orderId));
          prevQueueLen.current = Math.max(0, prevQueueLen.current - 1);
          fetchHistory(histPeriod, histMine, false);
          fetchStats();
        }, 600);
      }
    } catch (e) {
      console.error('KDS item ready error', e);
    } finally {
      setItemAdvancing(p => { const n = { ...p }; delete n[itemId]; return n; });
    }
  }, [fetchHistory, fetchStats, histPeriod, histMine]);

  if (loading && !refreshing) {
    return (
      <View style={st.loadWrap}>
        <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={st.loadTxt}>Loading Kitchen Display…</Text>
      </View>
    );
  }

  const queueCount   = queue.length;
  const historyCount = history.length;

  return (
    <View style={st.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── New order banner ── */}
      <NewOrderBanner
        visible={newOrderAlert}
        onDismiss={() => setNewOrderAlert(false)}
      />

      {/* ══ HEADER ══ */}
      <View style={st.header}>
        <View style={st.headerLeft}>
          <View style={st.kitchenIcon}>
            <MaterialIcons name="restaurant" size={20} color={C.primary} />
          </View>
          <View>
            <Text style={st.headerTitle}>Kitchen Display</Text>
            {station ? (
              <View style={[st.stationBadge, { backgroundColor: ss?.bg || '#F3F4F6' }]}>
                <MaterialIcons name={ss?.icon || 'restaurant'} size={10} color={ss?.text || C.textMuted} />
                <Text style={[st.stationBadgeTxt, { color: ss?.text || C.textMuted }]}>
                  {station.charAt(0).toUpperCase() + station.slice(1)} Station
                </Text>
              </View>
            ) : (
              <Text style={st.headerSub}>All Stations</Text>
            )}
          </View>
        </View>

        <View style={st.headerRight}>
          <TouchableOpacity
            style={st.iconBtn}
            onPress={() => navigation.navigate('KitchenNotifications')}
          >
            <MaterialIcons name="notifications-none" size={22} color={C.textMuted} />
            {unread > 0 && (
              <View style={st.notifBadge}>
                <Text style={st.notifBadgeTxt}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={st.iconBtn}
            onPress={() => navigation.navigate('KitchenProfile')}
          >
            <MaterialIcons name="account-circle" size={22} color={C.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={st.logoutBtn} onPress={logout}>
            <MaterialIcons name="logout" size={16} color={C.danger} />
            <Text style={st.logoutTxt}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ══ STATS BAR ══ */}
      <StatsBar stats={stats} loading={statsLoad} />

      {/* ══ TAB BAR ══ */}
      <View style={st.tabBar}>
        {[
          { id: 'queue',   label: 'Queue',   icon: 'restaurant',  count: queueCount   },
          { id: 'history', label: 'History', icon: 'history',     count: historyCount },
        ].map(t => (
          <TouchableOpacity
            key={t.id}
            style={[st.tabBtn, tab === t.id && st.tabBtnActive]}
            onPress={() => setTab(t.id)}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name={t.icon}
              size={16}
              color={tab === t.id ? C.primary : C.textMuted}
            />
            <Text style={[st.tabTxt, tab === t.id && st.tabTxtActive]}>{t.label}</Text>
            {t.count > 0 && (
              <View style={[st.tabCount, tab === t.id && st.tabCountActive]}>
                <Text style={[st.tabCountTxt, tab === t.id && st.tabCountTxtActive]}>
                  {t.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ══ QUEUE TAB ══ */}
      {tab === 'queue' && (
        <FlatList
          data={queue}
          keyExtractor={o => o.id}
          contentContainerStyle={st.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.primary}
              colors={[C.primary]}
            />
          }
          ListHeaderComponent={
            queue.length > 0 ? (
              <View style={st.listHeader}>
                <MaterialIcons name="receipt-long" size={14} color={C.textMuted} />
                <Text style={st.listHeaderTxt}>
                  {queueCount} order{queueCount !== 1 ? 's' : ''} in queue
                  {station ? ` · ${station}` : ''}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={st.emptyWrap}>
              <View style={st.emptyIconWrap}>
                <MaterialIcons name="check-circle-outline" size={52} color={C.success} />
              </View>
              <Text style={st.emptyTitle}>All clear!</Text>
              <Text style={st.emptyTxt}>
                {station ? `No active orders for ${station} station` : 'No active orders in the queue'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onAdvance={handleAdvance}
              advancing={!!advancing[item.id]}
              onItemReady={handleItemReady}
              itemAdvancing={itemAdvancing}
            />
          )}
        />
      )}

      {/* ══ HISTORY TAB ══ */}
      {tab === 'history' && (
        <View style={{ flex: 1 }}>
          {/* ── History filter bar ── */}
          <View style={st.histFilterBar}>
            {/* Mine / All toggle — only shown when user has a station */}
            {station && (
              <View style={st.mineToggleWrap}>
                <TouchableOpacity
                  style={[st.mineToggleBtn, !histMine && st.mineToggleBtnActive]}
                  onPress={() => setHistMine(false)}
                >
                  <MaterialIcons name="restaurant" size={13} color={!histMine ? C.primary : C.textMuted} />
                  <Text style={[st.mineToggleTxt, !histMine && st.mineToggleTxtActive]}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.mineToggleBtn, histMine && st.mineToggleBtnActive]}
                  onPress={() => setHistMine(true)}
                >
                  <MaterialIcons name="person" size={13} color={histMine ? C.primary : C.textMuted} />
                  <Text style={[st.mineToggleTxt, histMine && st.mineToggleTxtActive]}>Mine</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Period chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 4 }}>
                {PERIOD_OPTS.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[st.periodChip, histPeriod === p.id && st.periodChipActive]}
                    onPress={() => setHistPeriod(p.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[st.periodChipTxt, histPeriod === p.id && st.periodChipTxtActive]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {histLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={C.primary} />
            </View>
          ) : (
            <FlatList
              data={history}
              keyExtractor={o => o.id}
              contentContainerStyle={st.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={C.primary}
                  colors={[C.primary]}
                />
              }
              ListHeaderComponent={
                history.length > 0 ? (
                  <View style={st.listHeader}>
                    <MaterialIcons name="history" size={14} color={C.textMuted} />
                    <Text style={st.listHeaderTxt}>
                      {historyCount} order{historyCount !== 1 ? 's' : ''}
                      {histMine && station ? ` · ${station} station` : ''}
                      {' · '}{PERIOD_OPTS.find(p => p.id === histPeriod)?.label}
                    </Text>
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={st.emptyWrap}>
                  <View style={st.emptyIconWrap}>
                    <MaterialIcons name="history" size={52} color={C.textMuted} />
                  </View>
                  <Text style={st.emptyTitle}>No history yet</Text>
                  <Text style={st.emptyTxt}>
                    {histMine && station
                      ? `No orders completed by ${station} station`
                      : 'Completed orders will appear here'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => <HistoryCard order={item} />}
            />
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container:     { flex: 1, backgroundColor: C.bg },
  loadWrap:      { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  loadTxt:       { marginTop: 12, fontSize: 14, color: C.textMuted },

  // New order banner
  newOrderBanner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 99,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.danger, paddingVertical: 14, paddingHorizontal: 16,
    paddingTop: topInset,
  },
  newOrderBannerTxt: { flex: 1, fontSize: 15, fontWeight: '700', color: C.white },
  bannerDismiss: { padding: 4 },

  // Header
  header:        {
    paddingTop: topInset + 12,
    paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: C.header, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: C.headerBorder,
  },
  headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kitchenIcon:   {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  headerTitle:   { fontSize: 18, fontWeight: '800', color: C.textDark },
  headerSub:     { fontSize: 12, color: C.textMuted, marginTop: 1 },
  stationBadge:  {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginTop: 2,
  },
  stationBadgeTxt:{ fontSize: 11, fontWeight: '700' },
  headerRight:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn:       {
    width: 38, height: 38, borderRadius: 10, backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  notifBadge:    {
    position: 'absolute', top: -3, right: -3, backgroundColor: C.danger,
    borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: C.white,
  },
  notifBadgeTxt: { fontSize: 9, fontWeight: '800', color: C.white },
  logoutBtn:     {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: C.dangerLight, borderRadius: 10,
    borderWidth: 1, borderColor: C.danger + '40',
  },
  logoutTxt:     { fontSize: 13, fontWeight: '700', color: C.danger },

  // Stats bar
  statsBar:       {
    flexDirection: 'row', backgroundColor: C.card,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  statItem:       { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 2 },
  statItemBorder: { borderRightWidth: 1, borderRightColor: C.border },
  statValue:      { fontSize: 22, fontWeight: '800' },
  statLabel:      {
    fontSize: 10, color: C.textMuted, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Tabs
  tabBar:         {
    flexDirection: 'row', backgroundColor: C.card,
    borderBottomWidth: 1, borderBottomColor: C.border,
    paddingHorizontal: 16, gap: 4,
  },
  tabBtn:         {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent', gap: 6,
  },
  tabBtnActive:   { borderBottomColor: C.primary },
  tabTxt:         { fontSize: 13, fontWeight: '600', color: C.textMuted },
  tabTxtActive:   { color: C.primary },
  tabCount:       {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: C.border, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 5,
  },
  tabCountActive: { backgroundColor: C.primaryLight },
  tabCountTxt:    { fontSize: 10, fontWeight: '800', color: C.textMuted },
  tabCountTxtActive:{ color: C.primary },

  // List
  listContent:    { padding: 12, paddingBottom: 40 },
  listHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  listHeaderTxt:  {
    fontSize: 12, fontWeight: '600', color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Order card
  card:           {
    backgroundColor: C.card, borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: C.cardBorder,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardUrgent:     { borderColor: C.danger + '60', borderWidth: 1.5 },
  urgentBar:      {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
    backgroundColor: C.danger,
  },
  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tableBadge:     {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1,
  },
  tableTxt:       { fontSize: 14, fontWeight: '800' },
  urgentBadge:    {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.danger, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6,
  },
  urgentBadgeTxt: { fontSize: 9, fontWeight: '800', color: C.white, letterSpacing: 0.5 },
  timerBox:       {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
  },
  timerTxt:       { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },

  metaRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  metaTxt:        { fontSize: 12, color: C.textMuted },

  statusPill:     {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 100, marginBottom: 10,
  },
  statusDot:      { width: 6, height: 6, borderRadius: 3 },
  statusTxt:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  progressPill:   {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F3F4F6', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  progressTxt:    { fontSize: 11, fontWeight: '600', color: C.textMuted },

  divider:        { height: 1, backgroundColor: C.border, marginBottom: 12 },

  itemsList:      { gap: 6, marginBottom: 12 },
  itemRow:        {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6, paddingHorizontal: 8,
    borderRadius: 10, backgroundColor: '#FAFAFA',
    borderWidth: 1, borderColor: C.border,
  },
  itemRowDone:    { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  qtyBox:         {
    minWidth: 28, height: 28, borderRadius: 8,
    backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: C.primary + '40',
  },
  qtyTxt:         { fontSize: 14, fontWeight: '800', color: C.primary },
  itemName:       { fontSize: 14, fontWeight: '600', color: C.textDark, lineHeight: 20 },
  itemNameDone:   { color: C.success, textDecorationLine: 'line-through' },
  itemNoteRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  itemNote:       { fontSize: 12, color: C.warning, fontStyle: 'italic', flex: 1 },
  stationTag:     { marginTop: 3 },
  stationTagTxt:  { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Per-item tick button
  itemTick:       {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.successLight, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: C.success + '60',
  },
  itemTickDone:   { backgroundColor: C.success, borderColor: C.success },

  orderNote:      {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: C.warningLight, borderRadius: 10, padding: 10,
    marginBottom: 12, borderWidth: 1, borderColor: C.warning + '40',
  },
  orderNoteTxt:   { fontSize: 13, color: C.warning, flex: 1, lineHeight: 18 },

  actionBtn:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12,
  },
  actionBtnPrepare:{ backgroundColor: C.warning },
  actionBtnDisabled:{ opacity: 0.6 },
  actionBtnTxt:    { fontSize: 15, fontWeight: '800', color: C.white },

  // History filter bar
  histFilterBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  mineToggleWrap: {
    flexDirection: 'row', backgroundColor: C.bg,
    borderRadius: 10, borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  mineToggleBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  mineToggleBtnActive: { backgroundColor: C.primaryLight },
  mineToggleTxt:     { fontSize: 12, fontWeight: '600', color: C.textMuted },
  mineToggleTxtActive:{ color: C.primary },

  periodChip:        {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
  },
  periodChipActive:  { backgroundColor: C.primaryLight, borderColor: C.primary },
  periodChipTxt:     { fontSize: 12, fontWeight: '600', color: C.textMuted },
  periodChipTxtActive:{ color: C.primary },

  // History card
  histCard:       {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: C.card, borderRadius: 12, marginBottom: 8,
    borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  histStripe:     { width: 4 },
  histTop:        {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 4, paddingLeft: 12,
  },
  histTable:      { fontSize: 14, fontWeight: '700', color: C.textDark, flex: 1 },
  histTime:       { fontSize: 12, color: C.textMuted },
  histItems:      { fontSize: 12, color: C.textMuted, paddingHorizontal: 12, paddingBottom: 4 },

  // Empty state
  emptyWrap:      { alignItems: 'center', paddingTop: 80 },
  emptyIconWrap:  {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: C.card, justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  emptyTitle:     { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 6 },
  emptyTxt:       { fontSize: 14, color: C.textMuted },
});
