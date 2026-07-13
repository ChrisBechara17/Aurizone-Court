import '../global.css';

import { useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppStore, useThemeName } from '@/store/useAppStore';
import { COLORS } from '@/constants/colors';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
Sentry.init({
  dsn: sentryDsn,
  enabled: !!sentryDsn,
  debug: __DEV__,
  // Development clients can outlive native dependency/config changes. Use the
  // JS transport there for deterministic testing; release builds retain native
  // crash capture for Android/iOS failures.
  enableNative: !__DEV__,
  environment: __DEV__ ? 'development' : 'production',
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});

function RootLayout() {
  const hydrate = useAppStore((s) => s.hydrate);
  const userId = useAppStore((s) => s.user?.id ?? null);
  useThemeName(); // re-render chrome (status bar / background) on theme change
  useRealtimeSync();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    Sentry.setUser(userId ? { id: userId } : null);
  }, [userId]);

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
          <Stack.Screen name="notifications" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="booking-detail" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="availability" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="admin" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="admin-mfa" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="admin-users" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="admin-user" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="admin-booking" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
