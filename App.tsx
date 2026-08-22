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

// Dispatches the deep link for a notification payload and returns the top-level stack
// route it navigated to (`null` when the payload carries nothing routable). The caller
// uses that name to confirm the navigation actually took — see NotificationRouter.
function routeFromNotification(
  nav: NavigationContainerRef<RootStackParamList>,
  rawData: unknown,
): string | null {
  if (!rawData || typeof rawData !== 'object') return null;
  const data = rawData as Record<string, any>;

  const go = (name: string, params?: object): string => {
    // The union of every screen's params is too wide for navigate()'s overloads to narrow
    // behind this indirection; each call site below still mirrors the shape
    // RootStackParamList declares for the screen it targets.
    (nav.navigate as (screen: string, params?: object) => void)(name, params);
    return name;
  };

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
        return go('DirectChat', { chatId });
      }
      break;
    case 'friend_request':
      return go('MainTabs' as any, {
        screen: 'Social',
        params: { initialTab: 'requests' },
      });
    case 'friend_accepted':
      if (userId) {
        return go('PlayerProfile', { id: userId });
      }
      break;
    // A player requested admin help in their match — drop the admin into the
    // tournament and pop the help-requests inbox so every pending request is one
    // tap away (and the requesting match's chat from there).
    case 'adminhelp':
      if (tournamentId) {
        return go('TournamentDetails', { id: tournamentId, openAdminHelp: true });
      }
      break;
    // A new match-chat message — open the tournament and jump straight into that
    // match's chat tab.
    case 'matchmessage':
      if (tournamentId && matchId) {
        return go('TournamentDetails', {
          id: tournamentId,
          focusMatchId: matchId,
          focusTeamMatchId: teamMatchId,
          focusMatchTab: 'chat',
        });
      }
      break;
    // A result was reported and is waiting for this user to confirm/dispute it.
    case 'resultproposed':
      return go('MyMatches' as any);
    // A team tie ended level — this captain must pick a tie-break representative.
    // focusTeamMatchId (without focusMatchId) opens the team-match modal, where the
    // "Choose Representative" picker lives.
    case 'teamtiebreak':
      if (tournamentId && teamMatchId) {
        return go('TournamentDetails', {
          id: tournamentId,
          focusTeamMatchId: teamMatchId,
        });
      }
      break;
    // Tournament finished — open it so the winner / final standings are visible.
    case 'tournamentwon':
      if (tournamentId) {
        return go('TournamentDetails', { id: tournamentId });
      }
      break;
    // Admin promo blast ("this tournament is open, come register") — open the tournament so the
    // register button is one tap away.
    case 'promo':
      if (tournamentId) {
        return go('TournamentDetails', { id: tournamentId });
      }
      break;
    // Registration closing soon — open the tournament so the user can still register.
    case 'registrationdeadline':
      if (tournamentId) {
        return go('TournamentDetails', { id: tournamentId });
      }
      break;
    // A match's deadline is approaching — open the tournament and land straight on the
    // match modal's 'match' tab, where the result is reported.
    case 'rounddeadline':
      if (tournamentId && matchId) {
        return go('TournamentDetails', {
          id: tournamentId,
          focusMatchId: matchId,
          focusTeamMatchId: teamMatchId,
          focusMatchTab: 'match',
        });
      }
      break;
    // The organizer handed someone's spot to another member — open the tournament so the
    // incoming player sees their fixtures and the outgoing one sees they're no longer in it.
    case 'participantswappedin':
    case 'participantswappedout':
      if (tournamentId) {
        return go('TournamentDetails', { id: tournamentId });
      }
      break;
    // Team join / lineup lifecycle — open the tournament where the roster is managed. A lineup
    // change means the player either picked up the outgoing starter's fixtures or lost their own.
    case 'teamjoinrequest':
    case 'teamjoinapproved':
    case 'teamjoinrejected':
    case 'teamlineupin':
    case 'teamlineupout':
      if (tournamentId) {
        return go('TournamentDetails', { id: tournamentId });
      }
      break;
    // Hub join lifecycle — open the hub (managers review requests there).
    case 'hubjoinrequest':
    case 'hubjoinapproved':
    case 'hubjoinrejected':
      if (hubId) {
        return go('HubProfile', { id: hubId });
      }
      break;
  }

  // Fallback by id field (backend tournament/match pushes omit `type`)
  if (chatId) {
    return go('DirectChat', { chatId });
  }
  if (matchId) {
    return go('MyMatches' as any);
  }
  if (tournamentId) {
    return go('TournamentDetails', { id: tournamentId });
  }
  if (hubId) {
    return go('HubProfile', { id: hubId });
  }

  return null;
}

// A cold start (app killed, user taps the push) is the hard case for a notification deep
// link: the tap is delivered before the stored session has been read back off disk, so at
// that moment the root stack still holds the logged-out screen set. React Navigation swaps
// the screen set — and resets to the home tab — as `isAuthenticated` flips, and a navigate()
// that races that swap is silently dropped, which is how an admin-help tap ended up on Home.
// So we don't fire and forget: we wait for the authenticated stack to actually be mounted,
// dispatch, then confirm the focused route is the one the payload asked for and re-dispatch
// if it isn't. The response is only marked handled once it lands, so a dropped action gets
// another chance instead of being lost for the rest of the session.
const DEEP_LINK_RETRY_INTERVAL = 150;
const DEEP_LINK_RETRY_TIMEOUT = 5_000;
const NOT_HANDLED = Symbol('notification/not-handled');

function NotificationRouter({
  navigationRef,
  navReady,
}: {
  navigationRef: React.RefObject<NavigationContainerRef<RootStackParamList> | null>;
  navReady: boolean;
}) {
  const { isAuthenticated } = useAuth();
  const lastResponse = Notifications.useLastNotificationResponse();
  // NOT a plain `null` start value: on Android the identifier can itself BE null, and the
  // old `useRef<string | null>(null)` made the very first dedupe check `null === null` —
  // true — so the tap was discarded as "already handled" before anything was routed. A
  // sentinel no identifier can equal is the only safe initial value here.
  const handledRef = useRef<string | typeof NOT_HANDLED>(NOT_HANDLED);

  useEffect(() => {
    if (!lastResponse) return;
    if (!isAuthenticated) return;
    if (!navReady) return;

    // Android taps that arrive through the launch/`onNewIntent` extras (expo-notifications'
    // `toResponseBundleFromExtras`) take the identifier from the FCM `google.message_id`
    // extra, which is absent for notifications the system didn't stamp — iOS always has a
    // real UNNotificationRequest identifier, which is why this only ever bit Android. Fall
    // back to the notification's own date so dedupe still has something stable to compare.
    const reqId = lastResponse.notification.request.identifier
      ?? `date:${lastResponse.notification.date}`;
    if (handledRef.current !== NOT_HANDLED && handledRef.current === reqId) return;

    const data = lastResponse.notification.request.content.data;
    const startedAt = Date.now();

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const attempt = () => {
      if (cancelled) return;

      const nav = navigationRef.current;
      const rootState = nav?.isReady() ? nav.getRootState() : undefined;

      // `routeNames` only lists MainTabs once the logged-in screen set is mounted — until
      // then every deep-link target is an unknown route and the action would be discarded.
      if (rootState?.routeNames?.includes('MainTabs')) {
        const target = routeFromNotification(nav!, data);

        // Nothing routable in the payload — treat it as handled so we stop retrying. Worth a
        // warn: on Android expo-notifications can synthesise a response out of raw launch
        // intent extras, and that payload carries none of our fields. If taps still land on
        // Home, this line in logcat is the proof.
        if (target === null) {
          console.warn('[NotificationRouter] notification had nothing to route', reqId, data);
          handledRef.current = reqId;
          return;
        }

        // navigate() commits synchronously, so the new top-level route is readable right
        // away. Anything else means the action was swallowed mid screen-set swap.
        const state = nav!.getRootState();
        if (state?.routes?.[state.index]?.name === target) {
          handledRef.current = reqId;
          return;
        }
      }

      if (Date.now() - startedAt > DEEP_LINK_RETRY_TIMEOUT) {
        console.warn('[NotificationRouter] could not route notification', reqId, data);
        return;
      }

      timer = setTimeout(attempt, DEEP_LINK_RETRY_INTERVAL);
    };

    attempt();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
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
