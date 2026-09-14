import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../types/navigation';
import HomeScreen from '../screens/HomeScreen';
import TournamentsScreen from '../screens/TournamentsScreen';
import HubsScreen from '../screens/HubsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SocialScreen from '../screens/SocialScreen';

import { ModernTabBar } from '../components/navigation/ModernTabBar';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Hoisted out of the render: an inline arrow here is a new component type on every
// render of the navigator, which remounts the whole tab bar instead of updating it.
const renderTabBar = (props: React.ComponentProps<typeof ModernTabBar>) => <ModernTabBar {...props} />;

export function MainTabNavigator() {
    return (
        <Tab.Navigator
            tabBar={renderTabBar}
            screenOptions={{
                headerShown: false,
                // Tabs stay mounted once visited, so Home's countdown timers and card
                // subscriptions kept re-rendering it while the user was three tabs away.
                // freezeOnBlur suspends rendering of a blurred tab until it is focused
                // again; state still updates, it just isn't painted off-screen.
                freezeOnBlur: true,
            }}
        >
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Tournaments" component={TournamentsScreen} />
            <Tab.Screen name="Hubs" component={HubsScreen} />
            <Tab.Screen name="Social" component={SocialScreen} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    );
}
