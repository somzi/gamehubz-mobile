import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { MainTabNavigator } from './MainTabNavigator';
import TournamentDetailsScreen from '../screens/TournamentDetailsScreen';
import HubProfileScreen from '../screens/HubProfileScreen';
import PlayerProfileScreen from '../screens/PlayerProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import NotFoundScreen from '../screens/NotFoundScreen';
import MyMatchesScreen from '../screens/MyMatchesScreen';

const Stack = createStackNavigator<RootStackParamList>();

import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import UpdateProfileScreen from '../screens/UpdateProfileScreen';
import ManageHubScreen from '../screens/ManageHubScreen';
import HubMembersScreen from '../screens/HubMembersScreen';
import ManageHubSocialsScreen from '../screens/ManageHubSocialsScreen';
import ManageTournamentScreen from '../screens/ManageTournamentScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import { HelpCenterScreen, AboutUsScreen, ContactUsScreen } from '../screens/SupportScreens';
import { View, ActivityIndicator } from 'react-native';

export function RootNavigator() {
    const { isAuthenticated, isLoading, user } = useAuth();

    React.useEffect(() => {
        console.log("[RootNavigator] Mounted");
        return () => console.log("[RootNavigator] Unmounted");
    }, []);

    console.log(`[RootNavigator] Render - Auth: ${isAuthenticated}, Loading: ${isLoading}, User: ${user?.username}`);

    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false, // We use our own PageHeader
            }}
        >
            {!isAuthenticated ? (
                <>
                    <Stack.Screen name="Login" component={LoginScreen} />
                    <Stack.Screen name="Register" component={RegisterScreen} />
                    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                    <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
                </>
            ) : (
                <>
                    <Stack.Screen
                        name="MainTabs"
                        component={MainTabNavigator}
                    />
                    <Stack.Screen
                        name="TournamentDetails"
                        component={TournamentDetailsScreen}
                    />
                    <Stack.Screen
                        name="HubProfile"
                        component={HubProfileScreen}
                    />
                    <Stack.Screen
                        name="PlayerProfile"
                        component={PlayerProfileScreen}
                    />
                    <Stack.Screen
                        name="Notifications"
                        component={NotificationsScreen}
                    />
                    <Stack.Screen
                        name="EditProfile"
                        component={EditProfileScreen}
                    />
                    <Stack.Screen
                        name="NotFound"
                        component={NotFoundScreen}
                    />
                    <Stack.Screen
                        name="ChangePassword"
                        component={ChangePasswordScreen}
                    />
                    <Stack.Screen
                        name="HelpCenter"
                        component={HelpCenterScreen}
                    />
                    <Stack.Screen
                        name="AboutUs"
                        component={AboutUsScreen}
                    />
                    <Stack.Screen
                        name="ContactUs"
                        component={ContactUsScreen}
                    />
                    <Stack.Screen
                        name="UpdateProfile"
                        component={UpdateProfileScreen}
                    />
                    <Stack.Screen
                        name="ManageHub"
                        component={ManageHubScreen}
                    />
                    <Stack.Screen
                        name="HubMembers"
                        component={HubMembersScreen}
                    />
                    <Stack.Screen
                        name="ManageHubSocials"
                        component={ManageHubSocialsScreen}
                    />
                    <Stack.Screen
                        name="ManageTournament"
                        component={ManageTournamentScreen}
                    />
                    <Stack.Screen
                        name="MyMatches"
                        component={MyMatchesScreen}
                    />
                </>
            )}
        </Stack.Navigator>
    );
}
