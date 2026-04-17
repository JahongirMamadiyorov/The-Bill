import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import KitchenScreen from '../screens/kitchen/KitchenScreen';

const Stack = createStackNavigator();

export default function KitchenNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="KitchenDashboard" component={KitchenScreen} />
        </Stack.Navigator>
    );
}
