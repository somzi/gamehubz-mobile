import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { MainTabParamList } from '../types/navigation';
import HomeScreen from '../screens/HomeScreen';
import TournamentsScreen from '../screens/TournamentsScreen';
import HubsScreen from '../screens/HubsScreen';
import ProfileScreen from '../screens/ProfileScreen';

import { ModernTabBar } from '../components/navigation/ModernTabBar';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
    const insets = useSafeAreaInsets();
    return (
        <Tab.Navigator
            tabBar={(props) => <ModernTabBar {...props} />}
            screenOptions={{
                headerShown: false,
            }}
        >
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Tournaments" component={TournamentsScreen} />
            <Tab.Screen name="Hubs" component={HubsScreen} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    );
}
