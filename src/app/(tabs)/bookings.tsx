import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CalendarX2 } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { BookingCard } from '@/components/BookingCard';
import { EmptyState } from '@/components/EmptyState';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';
import { CANCEL_CUTOFF_HOURS, canUserCancel } from '@/utils/accountStanding';
import { parseISO } from 'date-fns';

type Filter = 'upcoming' | 'past' | 'cancelled';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function BookingsScreen() {
  const user = useAppStore((s) => s.user);
  const allBookings = useAppStore((s) => s.bookings);
  const cancel = useAppStore((s) => s.cancelBooking);
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
              backgroundColor: COLORS.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: COLORS.cardBorder,
              padding: 4,
            }}
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <Pressable key={f.key} onPress={() => setFilter(f.key)} style={{ flex: 1 }}>
                  <View
                    style={{
                      paddingVertical: 10,
                      borderRadius: 12,
                      alignItems: 'center',
                      backgroundColor: active ? `${COLORS.neon}26` : 'transparent',
                    }}
                  >
                    <Text style={{ color: active ? COLORS.neon : COLORS.textMuted, fontWeight: '700', fontSize: 13 }}>
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
            list.map((b, i) => {
              const cancellable = filter === 'upcoming' && canUserCancel(b);
              return (
                <Animated.View key={b.id} entering={FadeInDown.delay(i * 50).duration(300)}>
                  <BookingCard
                    booking={b}
                    onCancel={cancellable ? (id) => cancel(id) : undefined}
                    cancelNote={
                      filter === 'upcoming' && !cancellable
                        ? `Can't cancel within ${CANCEL_CUTOFF_HOURS}h of start`
                        : undefined
                    }
                  />
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
