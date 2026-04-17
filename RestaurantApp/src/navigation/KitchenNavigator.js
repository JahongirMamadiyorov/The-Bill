import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import KitchenScreen from '../screens/kitchen/KitchenScreen';
import KitchenNotifications from '../screens/kitchen/KitchenNotifications';
import KitchenProfile from '../screens/kitchen/KitchenProfile';

const Stack = createNativeStackNavigator();

export default function KitchenNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="KitchenDashboard" component={KitchenScreen} />
            <Stack.Screen name="KitchenNotifications" component={KitchenNotifications} />
            <Stack.Screen name="KitchenProfile" component={KitchenProfile} />
        </Stack.Navigator>
    );
}
