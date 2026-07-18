import 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, LinkingOptions, NavigationContainerRef, getStateFromPath } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import './global.css';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { BadgesProvider } from './src/context/BadgesContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { RootStackParamList } from './src/types/navigation';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Silence console.log in production builds. The codebase logs a lot of debug info
// (auth state with usernames, navigation events, network payloads) that shouldn't
// leak into release artifacts — both for user privacy and to save the cost of the
// per-call JS→native bridge crossing. warn/error stay on so real problems surface.
if (!__DEV__) {
    // eslint-disable-next-line no-console
    console.log = () => {};
}

// Show notifications even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Treat data as fresh for 30s so re-mounting a screen doesn't immediately refire
      // the network. Keep cached data around for 24h after a screen unmounts so cold
      // starts (see persistQueryClient below) still have entries to restore — the old
      // 5min gcTime was shorter than a typical app session gap and would evict every
      // query before the persister got a chance to serialize it to disk.
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Cold-start cache for every useQuery in the app. The persister mirrors the in-memory
// query cache to AsyncStorage so killing the app and reopening it paints the last
// snapshot instantly while the network fetch runs in parallel — the same cold-start
// win the custom cache.ts helper gave Chats/Hubs, but for every RQ query (Home,
// BadgesContext, and every future migration) at once.
//
// maxAge caps how long a persisted snapshot is treated as usable (24h — after that we
// treat it as miss and skip the paint). Individual queries with a shorter staleTime
// still refetch immediately per query; persistence only affects the FIRST paint.
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'gamehubz-rq-cache',
  // Compact JSON to keep the AsyncStorage row small on large caches.
  throttleTime: 1000,
});

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
      Team: 'team/:teamId',
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
  // Set for team-tournament sub-matches — routes to the team-match modal so the
  // payload isn't lost in the solo modal that can't render a sub-match id.
  const teamMatchId = data.teamMatchId ? String(data.teamMatchId) : undefined;
  const userId = data.userId ? String(data.userId) : undefined;
  const hubId = data.hubId ? String(data.hubId) : undefined;

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
    // A player requested admin help in their match — drop the admin into the
    // tournament and pop the help-requests inbox so every pending request is one
    // tap away (and the requesting match's chat from there).
    case 'adminhelp':
      if (tournamentId) {
        nav.navigate('TournamentDetails', { id: tournamentId, openAdminHelp: true });
        return;
      }
      break;
    // A new match-chat message — open the tournament and jump straight into that
    // match's chat tab.
    case 'matchmessage':
      if (tournamentId && matchId) {
        nav.navigate('TournamentDetails', {
          id: tournamentId,
          focusMatchId: matchId,
          focusTeamMatchId: teamMatchId,
          focusMatchTab: 'chat',
        });
        return;
      }
      break;
    // A result was reported and is waiting for this user to confirm/dispute it.
    case 'resultproposed':
      nav.navigate('MyMatches' as any);
      return;
    // A team tie ended level — this captain must pick a tie-break representative.
    // focusTeamMatchId (without focusMatchId) opens the team-match modal, where the
    // "Choose Representative" picker lives.
    case 'teamtiebreak':
      if (tournamentId && teamMatchId) {
        nav.navigate('TournamentDetails', {
          id: tournamentId,
          focusTeamMatchId: teamMatchId,
        });
        return;
      }
      break;
    // Tournament finished — open it so the winner / final standings are visible.
    case 'tournamentwon':
      if (tournamentId) {
        nav.navigate('TournamentDetails', { id: tournamentId });
        return;
      }
      break;
    // Registration closing soon — open the tournament so the user can still register.
    case 'registrationdeadline':
      if (tournamentId) {
        nav.navigate('TournamentDetails', { id: tournamentId });
        return;
      }
      break;
    // A match's deadline is approaching — open the tournament and land straight on the
    // match modal's 'match' tab, where the result is reported.
    case 'rounddeadline':
      if (tournamentId && matchId) {
        nav.navigate('TournamentDetails', {
          id: tournamentId,
          focusMatchId: matchId,
          focusTeamMatchId: teamMatchId,
          focusMatchTab: 'match',
        });
        return;
      }
      break;
    // Team join lifecycle — open the tournament where teams are managed.
    case 'teamjoinrequest':
    case 'teamjoinapproved':
    case 'teamjoinrejected':
      if (tournamentId) {
        nav.navigate('TournamentDetails', { id: tournamentId });
        return;
      }
      break;
    // Hub join lifecycle — open the hub (managers review requests there).
    case 'hubjoinrequest':
    case 'hubjoinapproved':
    case 'hubjoinrejected':
      if (hubId) {
        nav.navigate('HubProfile', { id: hubId });
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
  if (hubId) {
    nav.navigate('HubProfile', { id: hubId });
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
    // ErrorBoundary at the very top so a render crash inside AuthProvider,
    // NavigationContainer, or any screen surfaces a "Try again" fallback rather
    // than a white screen. Placed OUTSIDE SafeAreaProvider so even a bug in
    // safe-area / query-client setup still shows the fallback.
    <ErrorBoundary>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: asyncStoragePersister,
            // Don't restore entries older than 24h — after that the risk of a
            // deleted/edited item flashing on cold start outweighs the paint win.
            maxAge: 24 * 60 * 60 * 1000,
            // Bust the whole cache when the app version changes so a shipped schema
            // change never renders against a stale-shape snapshot.
            buster: Constants.expoConfig?.version ?? 'dev',
          }}
        >
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
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
