import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import OwnerHome from '../screens/owner/OwnerHome';
import OwnerSales from '../screens/owner/OwnerSales';
import OwnerStaff from '../screens/owner/OwnerStaff';
import OwnerInventory from '../screens/owner/OwnerInventory';
import OwnerFinance from '../screens/owner/OwnerFinance';
import OwnerProfile from '../screens/owner/OwnerProfile';

const Tab = createBottomTabNavigator();

const OwnerNavigator = () => {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      lazy={true}
      sceneContainerStyle={{ backgroundColor: '#7C3AED' }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#7C3AED',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#E5E7EB',
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIconStyle: {
          marginBottom: 2,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={OwnerHome}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Sales"
        component={OwnerSales}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="bar-chart" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Staff"
        component={OwnerStaff}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Inventory"
        component={OwnerInventory}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="inventory" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Finance"
        component={OwnerFinance}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="account-balance" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={OwnerProfile}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

export default OwnerNavigator;
