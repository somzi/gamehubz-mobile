import 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer, LinkingOptions, NavigationContainerRef } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import './global.css';

import { AuthProvider } from './src/context/AuthContext';
import { RootStackParamList } from './src/types/navigation';
import * as Notifications from 'expo-notifications';

// Show notifications even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const queryClient = new QueryClient();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['gamehubz://'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Home: 'home',
          Tournaments: 'tournaments',
          Hubs: 'hubs',
          Profile: 'profile',
        },
      },
      TournamentDetails: 'tournament/:id',
      HubProfile: 'hub/:id',
      PlayerProfile: 'player/:id',
      Login: 'login',
    },
  },
};

export default function App() {
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  // Handle notification taps (background / killed state)
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      if (!data?.type) return;

      const nav = navigationRef.current;
      if (!nav?.isReady()) return;

      switch (data.type) {
        case 'CHAT':
          if (data.matchId) {
            nav.navigate('MyMatches' as any);
          }
          break;
        case 'TOURNAMENT_STATUS':
        case 'NEW_TOURNAMENT':
          if (data.tournamentId) {
            nav.navigate('TournamentDetails', { id: data.tournamentId });
          }
          break;
      }
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NavigationContainer ref={navigationRef} linking={linking}>
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
        <StatusBar style="light" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
