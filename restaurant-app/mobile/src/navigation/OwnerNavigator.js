import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import OwnerDashboard   from '../screens/owner/OwnerDashboard';
import OwnerReports     from '../screens/owner/OwnerReports';
import OwnerStaff       from '../screens/owner/OwnerStaff';
import OwnerAccounting  from '../screens/owner/OwnerAccounting';
import OwnerSettings    from '../screens/owner/OwnerSettings';

const Tab = createBottomTabNavigator();

export default function OwnerNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Dashboard:  'view-dashboard',
            Reports:    'chart-bar',
            Staff:      'account-group',
            Accounting: 'currency-usd',
            Settings:   'cog',
          };
          return <Icon name={icons[route.name]} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#E74C3C',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard"  component={OwnerDashboard} />
      <Tab.Screen name="Reports"    component={OwnerReports} />
      <Tab.Screen name="Staff"      component={OwnerStaff} />
      <Tab.Screen name="Accounting" component={OwnerAccounting} />
      <Tab.Screen name="Settings"   component={OwnerSettings} />
    </Tab.Navigator>
  );
}
