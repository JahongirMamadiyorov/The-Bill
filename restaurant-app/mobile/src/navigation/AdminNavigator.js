import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import AdminDashboard   from '../screens/admin/AdminDashboard';
import AdminMenu        from '../screens/admin/AdminMenu';
import AdminInventory   from '../screens/admin/AdminInventory';
import AdminStaff       from '../screens/admin/AdminStaff';
import AdminOrders      from '../screens/admin/AdminOrders';

const Tab = createBottomTabNavigator();

export default function AdminNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Dashboard: 'view-dashboard',
            Menu:      'food',
            Inventory: 'package-variant',
            Staff:     'account-group',
            Orders:    'clipboard-list',
          };
          return <Icon name={icons[route.name]} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2980B9',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={AdminDashboard} />
      <Tab.Screen name="Menu"      component={AdminMenu} />
      <Tab.Screen name="Inventory" component={AdminInventory} />
      <Tab.Screen name="Staff"     component={AdminStaff} />
      <Tab.Screen name="Orders"    component={AdminOrders} />
    </Tab.Navigator>
  );
}
