import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../utils/theme';
import { notificationsAPI } from '../api/client';
import { useTranslation } from '../context/LanguageContext';
import { playDingDing } from '../utils/sounds';

import WaitressTables       from '../screens/waitress/WaitressTables';
import WaitressActiveOrders from '../screens/waitress/WaitressActiveOrders';
import WaitressMenu         from '../screens/waitress/WaitressMenu';
import WaitressProfile      from '../screens/waitress/WaitressProfile';
import WaitressPerformance  from '../screens/waitress/WaitressPerformance';
import WaitressNotifications from '../screens/waitress/WaitressNotifications';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = {
  Tables:        { active: 'table-restaurant',  inactive: 'table-restaurant'   },
  Orders:        { active: 'receipt-long',       inactive: 'receipt-long'       },
  Menu:          { active: 'menu-book',          inactive: 'menu-book'          },
  Notifications: { active: 'notifications',      inactive: 'notifications-none' },
  Profile:       { active: 'person',             inactive: 'person-outline'     },
};

// ── Bottom tab navigator ──────────────────────────────────────────────────────
function WaitressTabs() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [unreadCount, setUnreadCount] = useState(0);

  // Track the highest notification ID we've ever seen so we can tell whether a
  // poll surfaced a genuinely new notification (→ play ding) vs. just the same
  // unread set we already had. `null` = first-ever load (silent baseline).
  const lastSeenIdRef = useRef(null);

  const loadUnread = useCallback(async () => {
    try {
      const res   = await notificationsAPI.getAll();
      const list  = res.data || [];
      const count = list.filter(n => !n.is_read).length;
      setUnreadCount(count);

      // Highest id in the returned set (works whether ids are numeric or string)
      let maxId = 0;
      for (const n of list) {
        const id = Number(n.id);
        if (Number.isFinite(id) && id > maxId) maxId = id;
      }

      if (lastSeenIdRef.current === null) {
        // First load after mount — establish baseline, don't play.
        lastSeenIdRef.current = maxId;
      } else if (maxId > lastSeenIdRef.current) {
        // A notification with a higher id than anything we've seen appeared
        // → new event. Play the ding-ding chime.
        lastSeenIdRef.current = maxId;
        playDingDing();
      }
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    loadUnread();
    // 10s keeps the chime feeling responsive without hammering the backend.
    const iv = setInterval(loadUnread, 10000);
    return () => clearInterval(iv);
  }, [loadUnread]);

  return (
    <Tab.Navigator
      sceneContainerStyle={{ backgroundColor: colors.primary }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor:  colors.border,
          borderTopWidth:  1,
          height:          62 + insets.bottom,
          paddingBottom:   insets.bottom + 6,
          paddingTop:      6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, focused }) => {
          const name = focused
            ? TAB_ICONS[route.name]?.active
            : TAB_ICONS[route.name]?.inactive;
          return <MaterialIcons name={name || 'circle'} size={22} color={color} />;
        },
      })}
      screenListeners={{ focus: () => loadUnread() }}
    >
      <Tab.Screen name="Tables"        component={WaitressTables}        options={{ title: t('nav.tables', 'Tables') }} />
      <Tab.Screen name="Orders"        component={WaitressActiveOrders}  options={{ title: t('nav.orders', 'My Orders') }} />
      <Tab.Screen name="Menu"          component={WaitressMenu}          options={{ title: t('nav.menu', 'Menu') }} />
      <Tab.Screen
        name="Notifications"
        component={WaitressNotifications}
        options={{
          title: t('nav.notifications', 'Alerts'),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
          tabBarBadgeStyle: { fontSize: 10, minWidth: 16, height: 16, lineHeight: 16 },
        }}
      />
      <Tab.Screen name="Profile"       component={WaitressProfile}       options={{ title: t('nav.profile', 'Profile') }} />
    </Tab.Navigator>
  );
}

// ── Root stack — tabs + full-screen sub-pages ─────────────────────────────────
export default function WaitressNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="WaitressTabs"   component={WaitressTabs} />
      <Stack.Screen name="Performance"    component={WaitressPerformance} />
    </Stack.Navigator>
  );
}
