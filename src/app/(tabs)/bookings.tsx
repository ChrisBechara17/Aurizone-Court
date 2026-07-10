import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CalendarX2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { BookingCard } from '@/components/BookingCard';
import { EmptyState } from '@/components/EmptyState';
import { COLORS } from '@/constants/colors';
import { useAppStore, useThemeName } from '@/store/useAppStore';
import { parseISO } from 'date-fns';

type Filter = 'upcoming' | 'past' | 'cancelled';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function BookingsScreen() {
  useThemeName();
  const user = useAppStore((s) => s.user);
  const router = useRouter();
  const allBookings = useAppStore((s) => s.bookings);
  const supportPhone = useAppStore((s) => s.supportPhone);
  const [filter, setFilter] = useState<Filter>('upcoming');

  const list = useMemo(() => {
    const bookings = allBookings.filter((b) => b.userId === (user?.id ?? 'demo-user'));
    const sorted = [...bookings].sort(
      (a, b) => parseISO(b.startTime).getTime() - parseISO(a.startTime).getTime(),
    );
    if (filter === 'upcoming')
      return sorted
        .filter((b) => b.status === 'confirmed')
        .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());
    if (filter === 'past') return sorted.filter((b) => b.status === 'completed');
    return sorted.filter((b) => b.status === 'cancelled');
  }, [allBookings, user, filter]);

  return (
    <ScreenContainer>
      <View style={{ flex: 1 }}>
        <View style={{ padding: 20, paddingBottom: 8, gap: 16 }}>
          <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900' }}>My Bookings</Text>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: COLORS.chip,
              borderRadius: 18,
              padding: 5,
              gap: 5,
              borderWidth: 1,
              borderColor: COLORS.cardBorder,
            }}
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <Pressable key={f.key} onPress={() => setFilter(f.key)} style={{ flex: 1 }}>
                  <View
                    style={{
                      paddingVertical: 10,
                      borderRadius: 14,
                      alignItems: 'center',
                      backgroundColor: active ? `${COLORS.neon}22` : 'transparent',
                      borderWidth: 1.5,
                      borderColor: active ? `${COLORS.neon}99` : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        color: active ? COLORS.neon : COLORS.textMuted,
                        fontWeight: active ? '800' : '600',
                        fontSize: 13,
                      }}
                    >
                      {f.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 120, gap: 14 }} showsVerticalScrollIndicator={false}>
          {list.length === 0 ? (
            <EmptyState
              icon={<CalendarX2 size={28} color={COLORS.neon} />}
              title={`No ${filter} bookings`}
              subtitle={
                filter === 'upcoming'
                  ? 'Book the Main Court or a coach to get started.'
                  : 'Your history will appear here.'
              }
            />
          ) : (
            list.map((b, i) => (
              <Animated.View key={b.id} entering={FadeInDown.delay(i * 50).duration(300)}>
                {/* Users can't self-cancel — only an admin can. Upcoming bookings
                    show a "Call to cancel" action pointing at the front desk. */}
                <BookingCard
                  booking={b}
                  cancelContactPhone={filter === 'upcoming' ? supportPhone : undefined}
                  onPress={() => router.push(`/booking-detail?id=${b.id}`)}
                />
              </Animated.View>
            ))
          )}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
