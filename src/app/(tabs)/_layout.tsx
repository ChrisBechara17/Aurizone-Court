import { ColorValue, Pressable, View } from 'react-native';
import { Tabs } from 'expo-router';
import { CalendarDays, Home, LucideIcon, Trophy, User, Megaphone } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { useThemeName } from '@/store/useAppStore';

export default function TabsLayout() {
  useThemeName(); // recolor the tab bar when the theme changes
  return (
    <Tabs
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
          height: 82,
          paddingTop: 10,
          paddingBottom: 20,
          // Soft lift so the bar reads as a distinct surface in both themes.
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -3 },
          elevation: 16,
        },
        tabBarItemStyle: { paddingTop: 0 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ focused, color }) => <TabIcon Icon={Home} focused={focused} color={color} /> }}
      />
      <Tabs.Screen
        name="book"
        options={{ title: 'Book', tabBarIcon: ({ focused, color }) => <TabIcon Icon={CalendarDays} focused={focused} color={color} /> }}
      />
      <Tabs.Screen
        name="coaches"
        options={{ title: 'Coaches', tabBarIcon: ({ focused, color }) => <TabIcon Icon={Megaphone} focused={focused} color={color} /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: 'My Bookings', tabBarIcon: ({ focused, color }) => <TabIcon Icon={Trophy} focused={focused} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ focused, color }) => <TabIcon Icon={User} focused={focused} color={color} /> }}
      />
    </Tabs>
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
