import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import NewCashierPOS from '../screens/new-cashier/NewCashierPOS';

const Stack = createNativeStackNavigator();

/**
 * NewCashierNavigator
 * Full-screen POS — no bottom tabs.
 * Single screen: the split-screen POS (landscape) / tab-switch (portrait).
 */
export default function NewCashierNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="NewCashierPOS" component={NewCashierPOS} />
    </Stack.Navigator>
  );
}
