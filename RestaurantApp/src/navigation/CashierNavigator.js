import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../utils/theme';
import { useTranslation } from '../context/LanguageContext';

import CashierOrders   from '../screens/cashier/CashierOrders';
import CashierTables   from '../screens/cashier/CashierTables';
import CashierHistory  from '../screens/cashier/CashierHistory';
import LoansScreen     from '../screens/cashier/LoansScreen';
import CashierProfile  from '../screens/cashier/CashierProfile';
import CashierWalkin   from '../screens/cashier/CashierWalkin';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = {
  Orders:  { active: 'receipt-long',            inactive: 'receipt-long'            },
  Tables:  { active: 'table-restaurant',        inactive: 'table-restaurant'        },
  History: { active: 'history',                 inactive: 'history'                 },
  Loans:   { active: 'account-balance-wallet',  inactive: 'account-balance-wallet'  },
  Profile: { active: 'person',                  inactive: 'person-outline'          },
};

// ── Tab navigator ─────────────────────────────────────────────────────────────
function CashierTabs() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      sceneContainerStyle={{ backgroundColor: '#ffffff' }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.neutralMid,
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
    >
      <Tab.Screen name="Orders"  component={CashierOrders}  options={{ title: t('nav.orders', 'Orders')   }} />
      <Tab.Screen name="Tables"  component={CashierTables}  options={{ title: t('nav.tables', 'Tables')   }} />
      <Tab.Screen name="History" component={CashierHistory} options={{ title: t('nav.history', 'History') }} />
      <Tab.Screen name="Loans"   component={LoansScreen}    options={{ title: t('nav.loans', 'Loans')     }} />
      <Tab.Screen name="Profile" component={CashierProfile} options={{ title: t('nav.profile', 'Profile') }} />
    </Tab.Navigator>
  );
}

// ── Root stack  ───────────────────────────────────────────────────────────────
export default function CashierNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="CashierTabs"   component={CashierTabs}   />
      <Stack.Screen name="CashierWalkin" component={CashierWalkin} options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  );
}
