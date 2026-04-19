import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, StatusBar, Platform,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { notificationsAPI } from '../../api/client';
import { topInset } from '../../utils/theme';
import { useTranslation } from '../../context/LanguageContext';

// Light theme matching admin/cashier
const C = {
  bg:          '#F9FAFB',
  card:        '#FFFFFF',
  border:      '#E5E7EB',
  primary:     '#2563EB',
  primaryLight:'#EFF6FF',
  danger:      '#DC2626',
  dangerLight: '#FEF2F2',
  warning:     '#D97706',
  warningLight:'#FFFBEB',
  success:     '#16A34A',
  successLight:'#F0FDF4',
  textDark:    '#111827',
  textMid:     '#374151',
  textMuted:   '#6B7280',
  white:       '#FFFFFF',
};

const TYPE_CFG_BASE = {
  new_order: { color: C.danger,   bg: C.dangerLight,  icon: 'receipt-long',   labelKey: 'kitchen.notifications.typeNewOrder' },
  alert:     { color: C.warning,  bg: C.warningLight, icon: 'warning',         labelKey: 'kitchen.notifications.typeAlert'     },
  order_ready:{ color: C.success, bg: C.successLight, icon: 'check-circle',    labelKey: 'kitchen.notifications.typeReady'     },
  default:   { color: C.primary,  bg: C.primaryLight, icon: 'notifications',   labelKey: 'kitchen.notifications.typeNotice'    },
};

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function KitchenNotifications({ navigation }) {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await notificationsAPI.getAll();
      setNotifications(res.data || []);
    } catch (_) {}
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const markRead = async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (_) {}
  };

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (_) {}
  };

  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={20} color={C.textDark} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{t('kitchen.notifications.kitchenAlerts')}</Text>
          {unread > 0 && (
            <Text style={s.headerSub}>{unread} {t('kitchen.notifications.unread')}</Text>
          )}
        </View>
        {unread > 0 && (
          <TouchableOpacity style={s.markAllBtn} onPress={markAllRead}>
            <MaterialIcons name="done-all" size={14} color={C.primary} />
            <Text style={s.markAllTxt}>{t('kitchen.notifications.markAllRead')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={n => String(n.id)}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
        renderItem={({ item }) => {
          const cfg = TYPE_CFG_BASE[item.type] || TYPE_CFG_BASE.default;
          return (
            <TouchableOpacity
              style={[s.card, !item.is_read && s.cardUnread]}
              onPress={() => markRead(item.id)}
              activeOpacity={0.8}
            >
              <View style={[s.typeStripe, { backgroundColor: cfg.color }]} />
              <View style={[s.iconWrap, { backgroundColor: cfg.bg }]}>
                <MaterialIcons name={cfg.icon} size={20} color={cfg.color} />
              </View>
              <View style={s.cardBody}>
                <View style={s.cardTop}>
                  <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                  {!item.is_read && <View style={[s.unreadDot, { backgroundColor: cfg.color }]} />}
                </View>
                {item.body ? <Text style={s.cardMsg} numberOfLines={2}>{item.body}</Text> : null}
                <Text style={s.cardTime}>{timeAgo(item.created_at)}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <MaterialIcons name="notifications-none" size={44} color={C.textMuted} />
            </View>
            <Text style={s.emptyTitle}>{t('kitchen.notifications.allQuiet')}</Text>
            <Text style={s.emptyTxt}>{t('kitchen.notifications.noKitchenAlertsYet')}</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  header:      {
    paddingTop: topInset + 12, paddingBottom: 14,
    paddingHorizontal: 16, backgroundColor: C.card,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn:     {
    width: 38, height: 38, borderRadius: 10, backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.textDark },
  headerSub:   { fontSize: 12, color: C.warning, marginTop: 1 },
  markAllBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1, borderColor: C.primary + '40',
    backgroundColor: C.primaryLight,
  },
  markAllTxt:  { fontSize: 12, fontWeight: '700', color: C.primary },

  list:        { padding: 12, gap: 8 },
  card:        {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  cardUnread:  { borderColor: C.primary + '50' },
  typeStripe:  { width: 4, alignSelf: 'stretch' },
  iconWrap:    {
    width: 40, height: 40, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginLeft: 4,
  },
  cardBody:    { flex: 1, paddingVertical: 12, paddingRight: 14 },
  cardTop:     {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 4,
  },
  cardTitle:   { fontSize: 14, fontWeight: '700', color: C.textDark, flex: 1 },
  unreadDot:   { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  cardMsg:     { fontSize: 12, color: C.textMid, marginBottom: 5, lineHeight: 17 },
  cardTime:    { fontSize: 11, color: C.textMuted },

  empty:       { alignItems: 'center', paddingTop: 80 },
  emptyIcon:   {
    width: 80, height: 80, borderRadius: 40, backgroundColor: C.card,
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
    borderWidth: 1, borderColor: C.border,
  },
  emptyTitle:  { fontSize: 18, fontWeight: '800', color: C.textDark, marginBottom: 6 },
  emptyTxt:    { fontSize: 13, color: C.textMuted },
});
