import React from 'react';
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
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
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
