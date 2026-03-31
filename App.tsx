import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import './global.css';

import { AuthProvider } from './src/context/AuthContext';
import { RootStackParamList } from './src/types/navigation';

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
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NavigationContainer linking={linking}>
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
        <StatusBar style="light" />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
