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
import { NotificationsProvider, useNotifications } from './src/context/NotificationsContext';
import i18n from './src/i18n';
import { I18nGate } from './src/i18n/I18nGate';
import { I18nextProvider } from 'react-i18next';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { useOtaUpdates } from './src/hooks/useOtaUpdates';
// Shared with the notification inbox, so a row opens exactly the screen its push tap would.
import { externalLinkFromNotification, routeFromNotification } from './src/lib/notificationRouting';
import { RootStackParamList } from './src/types/navigation';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Linking } from 'react-native';

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
      Notifications: 'notifications',
      Login: 'login',
    },
  },
  // Share links use /user/:id for player profiles; the in-app route is player/:id.
  getStateFromPath: (path, options) =>
    getStateFromPath(path.replace(/^\/*user\//, 'player/'), options),
};

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
  const { markRead } = useNotifications();
  const lastResponse = Notifications.useLastNotificationResponse();
  // NOT a plain `null` start value: on Android the identifier can itself BE null, and the
  // old `useRef<string | null>(null)` made the very first dedupe check `null === null` —
  // true — so the tap was discarded as "already handled" before anything was routed. A
  // sentinel no identifier can equal is the only safe initial value here.
  const handledRef = useRef<string | typeof NOT_HANDLED>(NOT_HANDLED);
  // The inbox row the tapped push belongs to — marked read once, however many times the
  // routing effect below re-runs before the navigation lands.
  const markedReadRef = useRef<string | null>(null);

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

    // Opening the push is reading it: the server puts the id of the push's inbox row in the
    // payload, so the row stops showing as unread whichever screen the tap leads to.
    const notificationId = (data as Record<string, unknown> | undefined)?.notificationId;
    if (typeof notificationId === 'string' && markedReadRef.current !== notificationId) {
      markedReadRef.current = notificationId;
      markRead(notificationId);
    }

    // A link announcement ("grab the Discord role") has no in-app destination — hand it to the
    // OS once and mark it handled, before the navigation retry loop below ever sees it.
    const externalUrl = externalLinkFromNotification(data);
    if (externalUrl) {
      handledRef.current = reqId;
      Linking.openURL(externalUrl).catch((err) =>
        console.warn('[NotificationRouter] could not open link', externalUrl, err),
      );
      return;
    }

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
  }, [lastResponse, isAuthenticated, navReady, navigationRef, markRead]);

  return null;
}

// Applies OTA updates when restarting the app is free — see useOtaUpdates for the reasoning.
// Kept a component rather than a hook call in App() so it sits under AuthProvider and can
// tell the hook whether there's a session to authenticate the emergency-launch report with.
function OtaUpdater() {
  const { isAuthenticated } = useAuth();
  useOtaUpdates(isAuthenticated);
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
          {/* i18n sits above AuthProvider because the auth screens are translated too.
              I18nGate holds render until the persisted language is applied; StatusBar
              is left outside it so the bar is styled from the very first frame. */}
          <I18nextProvider i18n={i18n}>
            <I18nGate>
              <AuthProvider>
                <BadgesProvider>
                  <NotificationsProvider>
                    <NavigationContainer
                      ref={navigationRef}
                      linking={linking}
                      onReady={() => setNavReady(true)}
                    >
                      <RootNavigator />
                    </NavigationContainer>
                    <NotificationRouter navigationRef={navigationRef} navReady={navReady} />
                    <OtaUpdater />
                  </NotificationsProvider>
                </BadgesProvider>
              </AuthProvider>
            </I18nGate>
          </I18nextProvider>
          <StatusBar style="light" />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
