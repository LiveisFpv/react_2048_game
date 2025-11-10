import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Drawer } from 'expo-router/drawer';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { GameProvider } from '@/context/game-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  const tint = Colors[colorScheme ?? 'light'].tint;

  return (
    <ThemeProvider value={theme}>
      <GameProvider>
        <Drawer
          screenOptions={{
            headerTintColor: tint,
            drawerActiveTintColor: tint,
            drawerType: 'front',
          }}>
          <Drawer.Screen
            name="index"
            options={{
              title: 'Play 2048',
              drawerIcon: ({ color }) => (
                <IconSymbol name="gamecontroller.fill" size={22} color={color} />
              ),
            }}
          />
          <Drawer.Screen
            name="leaderboard"
            options={{
              title: 'Leaderboard',
              drawerIcon: ({ color }) => (
                <IconSymbol name="trophy.fill" size={22} color={color} />
              ),
            }}
          />
          <Drawer.Screen
            name="motion-control"
            options={{
              title: 'Motion Control',
              drawerIcon: ({ color }) => (
                <IconSymbol name="waveform.path.ecg" size={22} color={color} />
              ),
            }}
          />
          <Drawer.Screen
            name="recent-runs"
            options={{
              title: 'Recent Runs',
              drawerIcon: ({ color }) => <IconSymbol name="clock.fill" size={22} color={color} />,
            }}
          />
          <Drawer.Screen
            name="strategy-center"
            options={{
              title: 'Strategy Center',
              drawerIcon: ({ color }) => (
                <IconSymbol name="lightbulb.fill" size={22} color={color} />
              ),
            }}
          />
        </Drawer>
      </GameProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
