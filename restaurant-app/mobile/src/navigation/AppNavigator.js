import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import OwnerNavigator from './OwnerNavigator';
import AdminNavigator from './AdminNavigator';
import WaitressNavigator from './WaitressNavigator';
import KitchenNavigator from './KitchenNavigator';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#E74C3C" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : user.role === 'owner' ? (
          <Stack.Screen name="Owner" component={OwnerNavigator} />
        ) : user.role === 'admin' ? (
          <Stack.Screen name="Admin" component={AdminNavigator} />
        ) : user.role === 'kitchen' ? (
          <Stack.Screen name="Kitchen" component={KitchenNavigator} />
        ) : (
          <Stack.Screen name="Waitress" component={WaitressNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
