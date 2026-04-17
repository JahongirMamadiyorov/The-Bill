import React, { useState, useEffect, useCallback } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../utils/theme';
import { notificationsAPI } from '../api/client';

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
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnread = useCallback(async () => {
    try {
      const res   = await notificationsAPI.getAll();
      const count = (res.data || []).filter(n => !n.is_read).length;
      setUnreadCount(count);
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    loadUnread();
    const iv = setInterval(loadUnread, 30000);
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
      <Tab.Screen name="Tables"        component={WaitressTables}        options={{ title: 'Tables' }} />
      <Tab.Screen name="Orders"        component={WaitressActiveOrders}  options={{ title: 'My Orders' }} />
      <Tab.Screen name="Menu"          component={WaitressMenu}          options={{ title: 'Menu' }} />
      <Tab.Screen
        name="Notifications"
        component={WaitressNotifications}
        options={{
          title: 'Alerts',
          tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
          tabBarBadgeStyle: { fontSize: 10, minWidth: 16, height: 16, lineHeight: 16 },
        }}
      />
      <Tab.Screen name="Profile"       component={WaitressProfile}       options={{ title: 'Profile' }} />
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
