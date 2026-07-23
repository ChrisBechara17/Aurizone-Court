import { useEffect, useMemo, useState } from 'react';
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
import { useBottomNavigationMetrics } from '@/hooks/useBottomNavigationMetrics';
import { bookingDisplayState } from '@/utils/bookingLifecycle';

type Filter = 'upcoming' | 'past' | 'cancelled';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function BookingsScreen() {
  useThemeName();
  const { contentBottomPadding } = useBottomNavigationMetrics();
  const user = useAppStore((s) => s.user);
  const router = useRouter();
  const allBookings = useAppStore((s) => s.bookings);
  const supportPhone = useAppStore((s) => s.supportPhone);
  const [filter, setFilter] = useState<Filter>('upcoming');
  // Seed with the real clock so the first frame classifies bookings correctly;
  // starting at 0 briefly showed every confirmed booking (even started/past ones)
  // as "Upcoming" until the effect ran.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = setInterval(updateNow, 60_000);
    return () => clearInterval(timer);
  }, []);

  const list = useMemo(() => {
    if (!user) return [];
    const bookings = allBookings.filter((b) => b.userId === user.id);
    const sorted = [...bookings].sort(
      (a, b) => parseISO(b.startTime).getTime() - parseISO(a.startTime).getTime(),
    );
    if (filter === 'upcoming')
      return sorted
        .filter((b) => b.status === 'confirmed' && !b.noShow && parseISO(b.startTime).getTime() > now)
        .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());
    if (filter === 'past') {
      return sorted.filter(
        (b) => ['awaiting_review', 'completed', 'no_show'].includes(bookingDisplayState(b, now)),
      );
    }
    return sorted.filter((b) => b.status === 'cancelled');
  }, [allBookings, user, filter, now]);

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

        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: contentBottomPadding, gap: 14 }} showsVerticalScrollIndicator={false}>
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
