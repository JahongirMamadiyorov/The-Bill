import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import WaitressTables        from '../screens/waitress/WaitressTables';
import WaitressActiveOrders  from '../screens/waitress/WaitressActiveOrders';
import WaitressNotifications from '../screens/waitress/WaitressNotifications';
import WaitressProfile       from '../screens/waitress/WaitressProfile';

const Tab = createBottomTabNavigator();

export default function WaitressNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Tables:        'table-chair',
            Orders:        'clipboard-list',
            Notifications: 'bell',
            Profile:       'account',
          };
          return <Icon name={icons[route.name]} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#27AE60',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Tables"        component={WaitressTables} />
      <Tab.Screen name="Orders"        component={WaitressActiveOrders} />
      <Tab.Screen name="Notifications" component={WaitressNotifications} />
      <Tab.Screen name="Profile"       component={WaitressProfile} />
    </Tab.Navigator>
  );
}
