import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, shadow } from '../utils/theme';

import LoginScreen    from '../screens/LoginScreen';
import AdminNavigator from './AdminNavigator';
import OwnerNavigator from './OwnerNavigator';
import WaitressNavigator from './WaitressNavigator';
import KitchenNavigator  from './KitchenNavigator';
import CashierNavigator  from './CashierNavigator';

const Stack = createNativeStackNavigator();

// ─── Placeholder screens for roles not yet fully built ───────
function PlaceholderScreen({ role, logout }) {
  return (
    <View style={ph.container}>
      <View style={ph.card}>
        <Text style={ph.icon}>
          {role === 'owner'    ? '👑' :
           role === 'cashier'  ? '💳' :
           role === 'cleaner'  ? '🧹' : '👤'}
        </Text>
        <Text style={ph.title}>
          {role === 'owner'    ? 'Owner Panel' :
           role === 'cashier'  ? 'Cashier View' :
           role === 'cleaner'  ? 'Check-In' : role}
        </Text>
        <Text style={ph.sub}>
          {role === 'cleaner'
            ? 'Tap the button below to record your check-in for today.'
            : 'This panel is coming soon.'}
        </Text>
        {role === 'cleaner' && (
          <TouchableOpacity style={ph.checkInBtn}>
            <Text style={ph.checkInTxt}>✓  Record Check-In</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={ph.logoutBtn} onPress={logout}>
          <Text style={ph.logoutTxt}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CleanerScreen() { const { logout } = useAuth(); return <PlaceholderScreen role="cleaner" logout={logout} />; }

// ─── Root navigator ───────────────────────────────────────────
export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.admin} />
      </View>
    );
  }

  // Normalise role to lowercase for comparison
  const role = (user?.role || '').toLowerCase();

  return (
    <NavigationContainer>
      {/* ── Global: draw app under status bar on Android so every header
          background extends to pixel 0. Each screen sets its own barStyle. ── */}
      {Platform.OS === 'android' && (
        <StatusBar translucent backgroundColor="transparent" />
      )}
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : role === 'owner' ? (
          <Stack.Screen name="Owner"   component={OwnerNavigator} />
        ) : role === 'admin' ? (
          <Stack.Screen name="Admin"    component={AdminNavigator} />
        ) : role === 'kitchen' ? (
          <Stack.Screen name="Kitchen"  component={KitchenNavigator} />
        ) : role === 'waitress' ? (
          <Stack.Screen name="Waitress" component={WaitressNavigator} />
        ) : role === 'cashier' ? (
          <Stack.Screen name="Cashier"  component={CashierNavigator} />
        ) : role === 'cleaner' ? (
          <Stack.Screen name="Cleaner"  component={CleanerScreen} />
        ) : (
          // Fallback: unknown role → waitress view
          <Stack.Screen name="Waitress" component={WaitressNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
});

const ph = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.xl },
  card:        { backgroundColor: '#fff', borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center', ...shadow.lg },
  icon:        { fontSize: 52, marginBottom: spacing.md },
  title:       { fontSize: 22, fontWeight: '800', color: colors.textDark, marginBottom: spacing.sm },
  sub:         { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
  checkInBtn:  { backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl, marginBottom: spacing.md },
  checkInTxt:  { color: '#fff', fontWeight: '800', fontSize: 16 },
  logoutBtn:   { paddingVertical: spacing.md, paddingHorizontal: spacing.xxl },
  logoutTxt:   { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
});
