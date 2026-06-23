import 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer, LinkingOptions, NavigationContainerRef, getStateFromPath } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import './global.css';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { BadgesProvider } from './src/context/BadgesContext';
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
  prefixes: ['gamehubz://', 'https://share.codespheresolutions.dev'],
  config: {
    // When a deep/share link cold-starts the app straight into a detail screen
    // (TournamentDetails / HubProfile / PlayerProfile / DirectChat), React
    // Navigation places MainTabs beneath it in the stack so the back arrow and
    // the Android hardware back land on the home tabs instead of doing nothing.
    // On a warm app the link resolves to a plain navigate, so the existing stack
    // is preserved.
    initialRouteName: 'MainTabs',
    screens: {
      MainTabs: {
        screens: {
          Home: 'home',
          Tournaments: 'tournaments',
          Hubs: 'hubs',
          Social: 'social',
          Profile: 'profile',
        },
      },
      TournamentDetails: 'tournament/:id',
      HubProfile: 'hub/:id',
      PlayerProfile: 'player/:id',
      DirectChat: 'chat/:chatId',
      Login: 'login',
    },
  },
  // Share links use /user/:id for player profiles; the in-app route is player/:id.
  getStateFromPath: (path, options) =>
    getStateFromPath(path.replace(/^\/*user\//, 'player/'), options),
};

function routeFromNotification(
  nav: NavigationContainerRef<RootStackParamList>,
  rawData: unknown,
) {
  if (!rawData || typeof rawData !== 'object') return;
  const data = rawData as Record<string, any>;

  const type = typeof data.type === 'string' ? data.type.toLowerCase() : undefined;
  const chatId = data.chatId ? String(data.chatId) : undefined;
  const tournamentId = data.tournamentId ? String(data.tournamentId) : undefined;
  const matchId = data.matchId ? String(data.matchId) : undefined;
  const userId = data.userId ? String(data.userId) : undefined;

  // Explicit type wins
  switch (type) {
    case 'direct_message':
      if (chatId) {
        nav.navigate('DirectChat', { chatId });
        return;
      }
      break;
    case 'friend_request':
      nav.navigate('MainTabs' as any, {
        screen: 'Social',
        params: { initialTab: 'requests' },
      });
      return;
    case 'friend_accepted':
      if (userId) {
        nav.navigate('PlayerProfile', { id: userId });
        return;
      }
      break;
  }

  // Fallback by id field (backend tournament/match pushes omit `type`)
  if (chatId) {
    nav.navigate('DirectChat', { chatId });
    return;
  }
  if (matchId) {
    nav.navigate('MyMatches' as any);
    return;
  }
  if (tournamentId) {
    nav.navigate('TournamentDetails', { id: tournamentId });
    return;
  }
}

function NotificationRouter({
  navigationRef,
  navReady,
}: {
  navigationRef: React.RefObject<NavigationContainerRef<RootStackParamList> | null>;
  navReady: boolean;
}) {
  const { isAuthenticated } = useAuth();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastResponse) return;
    if (!isAuthenticated) return;
    if (!navReady) return;

    const nav = navigationRef.current;
    if (!nav?.isReady()) return;

    const reqId = lastResponse.notification.request.identifier;
    if (handledRef.current === reqId) return;
    handledRef.current = reqId;

    routeFromNotification(nav, lastResponse.notification.request.content.data);
  }, [lastResponse, isAuthenticated, navReady, navigationRef]);

  return null;
}

export default function App() {
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList> | null>(null);
  const [navReady, setNavReady] = useState(false);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BadgesProvider>
            <NavigationContainer
              ref={navigationRef}
              linking={linking}
              onReady={() => setNavReady(true)}
            >
              <RootNavigator />
            </NavigationContainer>
            <NotificationRouter navigationRef={navigationRef} navReady={navReady} />
          </BadgesProvider>
        </AuthProvider>
        <StatusBar style="light" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
