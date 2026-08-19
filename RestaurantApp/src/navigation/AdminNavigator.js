import React from 'react';
import { StatusBar, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../utils/theme';
import { useTranslation } from '../context/LanguageContext';

import AdminDashboard       from '../screens/admin/AdminDashboard';
import AdminTables          from '../screens/admin/AdminTables';
import AdminMenu            from '../screens/admin/AdminMenu';
import WarehouseScreen      from '../screens/admin/WarehouseScreen';
import AdminOrders          from '../screens/admin/AdminOrders';
import AdminStaff           from '../screens/admin/AdminStaff';
import AdminProfile         from '../screens/admin/AdminProfile';
import InventoryAuditScreen from '../screens/admin/InventoryAuditScreen';
import CashierWalkin        from '../screens/cashier/CashierWalkin';

// ── Status bar per screen ───────────────────────────────────────────────────────
// Every admin screen used to mount its own declarative <StatusBar .../>. Since the bottom tab
// navigator keeps every tab's screen mounted (switching tabs never unmounts them), ALL of those
// StatusBar components stay live simultaneously — whichever one last re-rendered "won", not
// whichever tab was actually on screen. In practice this meant Profile's light-content (white
// icons, correct for its own colored header) could end up governing a white-background tab like
// Menu, making the clock/battery/signal icons invisible (white-on-white). Fix: no screen declares
// its own <StatusBar> anymore; this single listener sets it imperatively on FOCUS, so it always
// reflects whichever screen is actually visible.
const BAR_STYLE_BY_ROUTE = {
  Dashboard: 'dark-content',
  Tables:    'dark-content',
  Menu:      'dark-content',
  Inventory: 'dark-content',
  Orders:    'dark-content',
  Staff:     'dark-content',
  Profile:   'light-content',
  InventoryAudit: 'dark-content',
  CashierWalkin:  'dark-content',
};

function applyStatusBar(routeName) {
  StatusBar.setBarStyle(BAR_STYLE_BY_ROUTE[routeName] || 'dark-content', true);
  if (Platform.OS === 'android') {
    StatusBar.setTranslucent(true);
    StatusBar.setBackgroundColor('transparent', true);
  }
}

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// MaterialIcons name for each tab
const TAB_CONFIG = {
  Dashboard: { icon: 'dashboard'        },
  Tables:    { icon: 'table-bar'        },
  Menu:      { icon: 'restaurant-menu'  },
  Inventory: { icon: 'inventory-2'      },
  Orders:    { icon: 'receipt-long'     },
  Staff:     { icon: 'group'            },
  Profile:   { icon: 'manage-accounts'  },
};

function AdminTabs() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const TAB_LABELS = {
    Dashboard: t('nav.home', 'Home'),
    Tables:    t('nav.tables', 'Tables'),
    Menu:      t('nav.menu', 'Menu'),
    Inventory: t('nav.inventory', 'Inventory'),
    Orders:    t('nav.orders', 'Orders'),
    Staff:     t('nav.staff', 'Staff'),
    Profile:   t('nav.profile', 'Profile'),
  };
  return (
    <Tab.Navigator
      sceneContainerStyle={{ backgroundColor: '#ffffff' }}
      screenListeners={({ route }) => ({
        focus: () => applyStatusBar(route.name),
      })}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   colors.admin,
        tabBarInactiveTintColor: colors.neutralMid || '#6B7280',
        tabBarStyle: {
          backgroundColor: colors.card || '#FFFFFF',
          borderTopColor:  colors.border,
          borderTopWidth:  1,
          height:          60 + insets.bottom,
          paddingBottom:   insets.bottom + 4,
          paddingTop:      4,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarIcon: ({ color }) => (
          <MaterialIcons
            name={TAB_CONFIG[route.name]?.icon || 'circle'}
            size={22}
            color={color}
          />
        ),
        tabBarLabel: TAB_LABELS[route.name] || route.name,
      })}
    >
      <Tab.Screen name="Dashboard" component={AdminDashboard} />
      <Tab.Screen name="Tables"    component={AdminTables}    />
      <Tab.Screen name="Menu"      component={AdminMenu}      />
      <Tab.Screen name="Inventory" component={WarehouseScreen}/>
      <Tab.Screen name="Orders"    component={AdminOrders}    />
      <Tab.Screen name="Staff"     component={AdminStaff}     />
      <Tab.Screen name="Profile"   component={AdminProfile}   />
    </Tab.Navigator>
  );
}

// Wrap tabs in a Stack so InventoryAudit + CashierWalkin can be pushed as full-screen
export default function AdminNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
      screenListeners={({ route }) => ({
        focus: () => applyStatusBar(route.name),
      })}
    >
      <Stack.Screen name="AdminTabs"     component={AdminTabs} />
      <Stack.Screen
        name="InventoryAudit"
        component={InventoryAuditScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="CashierWalkin"
        component={CashierWalkin}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
