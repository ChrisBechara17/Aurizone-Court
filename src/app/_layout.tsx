import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppStore, useThemeName } from '@/store/useAppStore';
import { COLORS } from '@/constants/colors';

export default function RootLayout() {
  const hydrate = useAppStore((s) => s.hydrate);
  useThemeName(); // re-render chrome (status bar / background) on theme change

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.navBg }}>
      <SafeAreaProvider>
        <StatusBar style={COLORS.statusBar} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.navBg },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="verify-otp" />
          <Stack.Screen name="reset-password" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="rules" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="memberships" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="loyalty" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="availability" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="admin" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="admin-users" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="admin-user" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
