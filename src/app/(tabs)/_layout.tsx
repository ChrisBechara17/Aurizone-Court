import { Tabs } from 'expo-router';
import { CalendarDays, Home, Trophy, User, Megaphone } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.neon,
        tabBarInactiveTintColor: COLORS.textFaint,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'rgba(8,10,22,0.92)',
          borderTopColor: COLORS.cardBorder,
          borderTopWidth: 1,
          height: 78,
          paddingTop: 8,
          paddingBottom: 18,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="book"
        options={{ title: 'Book', tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="coaches"
        options={{ title: 'Coaches', tabBarIcon: ({ color, size }) => <Megaphone color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: 'My Bookings', tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
    </Tabs>
  );
}
