import { useCallback } from 'react';
import { BackHandler, ColorValue, Platform, Pressable, Text, View } from 'react-native';
import { Tabs, useFocusEffect, usePathname, useRouter } from 'expo-router';
import { CalendarDays, Home, LucideIcon, Trophy, User, Megaphone } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { useThemeName } from '@/store/useAppStore';
import { useBottomNavigationMetrics } from '@/hooks/useBottomNavigationMetrics';

export default function TabsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  useThemeName(); // recolor the tab bar when the theme changes
  const { barHeight, bottomPadding } = useBottomNavigationMetrics();

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (pathname === '/home') {
          BackHandler.exitApp();
        } else {
          router.replace('/(tabs)/home');
        }
        return true;
      });

      return () => subscription.remove();
    }, [pathname, router]),
  );

  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.neon,
        tabBarInactiveTintColor: COLORS.textFaint,
        // Kill the default filled highlight/ripple behind the focused tab — the
        // active state is conveyed by the accent pill + tint instead.
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveBackgroundColor: 'transparent',
        tabBarButton: (props) => (
          <Pressable
            onPress={props.onPress}
            onLongPress={props.onLongPress}
            accessibilityState={props.accessibilityState}
            accessibilityRole={props.accessibilityRole}
            accessibilityLabel={props.accessibilityLabel}
            testID={props.testID}
            android_ripple={{ color: 'transparent' }}
            style={[props.style, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}
          >
            {props.children}
          </Pressable>
        ),
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: COLORS.tabBar,
          borderTopColor: COLORS.cardBorder,
          borderTopWidth: 1,
          height: barHeight,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          // Soft lift so the bar reads as a distinct surface in both themes.
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -3 },
          elevation: 16,
        },
        tabBarItemStyle: { paddingTop: 0 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarLabel: ({ color }) => <TabLabel label="Home" color={color} />, tabBarIcon: ({ focused, color }) => <TabIcon Icon={Home} focused={focused} color={color} /> }}
      />
      <Tabs.Screen
        name="book"
        options={{ title: 'Book', tabBarLabel: ({ color }) => <TabLabel label="Book" color={color} />, tabBarIcon: ({ focused, color }) => <TabIcon Icon={CalendarDays} focused={focused} color={color} /> }}
      />
      <Tabs.Screen
        name="coaches"
        options={{ title: 'Coaches', tabBarLabel: ({ color }) => <TabLabel label="Coaches" color={color} />, tabBarIcon: ({ focused, color }) => <TabIcon Icon={Megaphone} focused={focused} color={color} /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: 'My Bookings', tabBarLabel: ({ color }) => <TabLabel label="My Bookings" color={color} />, tabBarIcon: ({ focused, color }) => <TabIcon Icon={Trophy} focused={focused} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarLabel: ({ color }) => <TabLabel label="Profile" color={color} />, tabBarIcon: ({ focused, color }) => <TabIcon Icon={User} focused={focused} color={color} /> }}
      />
    </Tabs>
  );
}

function TabLabel({ label, color }: { label: string; color: ColorValue }) {
  return (
    <Text
      numberOfLines={2}
      style={{ color, fontSize: 11, lineHeight: 12, fontWeight: '700', marginTop: 2, textAlign: 'center' }}
    >
      {label}
    </Text>
  );
}

/** Tab icon with a subtle accent pill behind it when the tab is active. */
function TabIcon({ Icon, focused, color }: { Icon: LucideIcon; focused: boolean; color: ColorValue }) {
  return (
    <View
      style={{
        width: 52,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? `${COLORS.neon}1f` : 'transparent',
      }}
    >
      <Icon size={21} color={color as string} />
    </View>
  );
}
