import React, { useState, useEffect, useCallback } from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../utils/theme';
import { useAuth } from '../context/AuthContext';
import { shiftsAPI } from '../api/client';

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

// ── Shift Gate ────────────────────────────────────────────────────────────────
function ShiftGate({ children }) {
  const [shiftActive, setShiftActive] = useState(null); // null = loading
  const [starting, setStarting]       = useState(false);
  const { user } = useAuth();

  const checkShift = useCallback(async () => {
    try {
      const res = await shiftsAPI.getActive();
      const mine = (res.data || []).find(s => s.user_id === user?.id);
      setShiftActive(!!mine);
    } catch {
      setShiftActive(true); // fail-open so app isn't broken
    }
  }, [user]);

  useEffect(() => { checkShift(); }, [checkShift]);

  const startShift = async () => {
    setStarting(true);
    try {
      await shiftsAPI.clockIn({ user_id: user?.id });
      setShiftActive(true);
    } catch {
      // If endpoint doesn't accept user_id try without it
      try { await shiftsAPI.clockIn({}); setShiftActive(true); } catch {}
    } finally { setStarting(false); }
  };

  if (shiftActive === null) {
    // Loading — show nothing / spinner handled by parent
    return null;
  }

  if (!shiftActive) {
    const { View: V, Text: T, TouchableOpacity: TO, StyleSheet: SS, ActivityIndicator: AI } = require('react-native');
    const S = SS.create({
      wrap:  { flex:1, backgroundColor:'#F9FAFB', justifyContent:'center', alignItems:'center', padding:32 },
      card:  { backgroundColor:'#fff', borderRadius:20, padding:32, alignItems:'center', width:'100%', shadowColor:'#000', shadowOpacity:0.08, shadowRadius:12, elevation:4 },
      icon:  { width:64, height:64, borderRadius:32, backgroundColor:'#EFF6FF', alignItems:'center', justifyContent:'center', marginBottom:16 },
      title: { fontSize:20, fontWeight:'800', color:'#111827', marginBottom:6 },
      sub:   { fontSize:13, color:'#6B7280', textAlign:'center', marginBottom:24 },
      btn:   { backgroundColor:'#2563EB', borderRadius:12, paddingVertical:14, paddingHorizontal:36, alignItems:'center', width:'100%' },
      btnT:  { color:'#fff', fontWeight:'800', fontSize:15 },
    });
    return (
      <V style={S.wrap}>
        <V style={S.card}>
          <V style={S.icon}><MaterialIcons name="timer" size={28} color="#2563EB"/></V>
          <T style={S.title}>Start Your Shift</T>
          <T style={S.sub}>Welcome, {user?.name || 'Cashier'}. Clock in to begin your shift.</T>
          <TO style={S.btn} onPress={startShift} disabled={starting}>
            {starting ? <AI color="#fff"/> : <T style={S.btnT}>Start Shift</T>}
          </TO>
        </V>
      </V>
    );
  }

  return children;
}

// ── Tab navigator ─────────────────────────────────────────────────────────────
function CashierTabs() {
  const insets = useSafeAreaInsets();
  return (
    <ShiftGate>
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
        <Tab.Screen name="Orders"  component={CashierOrders}  options={{ title: 'Orders'  }} />
        <Tab.Screen name="Tables"  component={CashierTables}  options={{ title: 'Tables'  }} />
        <Tab.Screen name="History" component={CashierHistory} options={{ title: 'History' }} />
        <Tab.Screen name="Loans"    component={LoansScreen}     options={{ title: 'Loans'    }} />
        <Tab.Screen name="Profile"  component={CashierProfile}  options={{ title: 'Profile'  }} />
      </Tab.Navigator>
    </ShiftGate>
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
