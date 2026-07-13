import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Phone } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { BookingCard } from '@/components/BookingCard';
import { COLORS, sportLabel } from '@/constants/colors';
import { useAppStore, useThemeName } from '@/store/useAppStore';
import { fmtDateLong, fmtTime, formatDuration } from '@/utils/dateUtils';

export default function BookingDetailScreen() {
  useThemeName();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const user = useAppStore((s) => s.user);
  const bookings = useAppStore((s) => s.bookings);
  const coaches = useAppStore((s) => s.coaches);
  const supportPhone = useAppStore((s) => s.supportPhone);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = setInterval(updateNow, 60_000);
    return () => clearInterval(timer);
  }, []);

  const booking = bookings.find((b) => b.id === id && b.userId === user?.id);
  if (!user) return <Redirect href="/auth" />;
  if (!booking) return <Redirect href="/(tabs)/bookings" />;

  const coach = coaches.find((c) => c.id === booking.coachId);
  const active = now !== null
    && booking.status === 'confirmed'
    && !booking.noShow
    && new Date(booking.startTime).getTime() > now;
  const fullyFree = booking.isFreeReward && booking.totalPrice === 0;
  const total = fullyFree ? 'Free reward' : `$${booking.totalPrice}`;
  const phoneDigits = supportPhone.replace(/[^\d+]/g, '');

  const rows = [
    { label: 'Booking ID', value: booking.id },
    { label: 'Type', value: booking.bookingType === 'coach' ? 'Coaching session' : 'Court booking' },
    { label: 'Sport', value: sportLabel(booking.sportType) },
    { label: 'Date', value: fmtDateLong(booking.startTime) },
    { label: 'Time', value: `${fmtTime(booking.startTime)} - ${fmtTime(booking.endTime)}` },
    { label: 'Duration', value: formatDuration(booking.durationMinutes / 60) },
    { label: 'Court', value: booking.usesMainCourt ? (booking.courtHalf && booking.courtHalf !== 'full' ? 'Main Court half' : 'Main Court') : 'No court' },
    ...(booking.bookingType === 'coach' ? [{ label: 'Coach', value: coach?.name ?? 'Coach' }] : []),
    ...(booking.ballMachine ? [{ label: 'Ball machine', value: 'Included' }] : []),
    ...(booking.isFreeReward ? [{ label: 'Reward', value: 'Free session used' }] : []),
    { label: 'Status', value: booking.noShow ? 'No-show' : booking.status },
    ...(booking.cancelReason ? [{ label: 'Cancellation reason', value: booking.cancelReason }] : []),
    ...(booking.noShowReason ? [{ label: 'No-show reason', value: booking.noShowReason }] : []),
  ];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/bookings'))} hitSlop={12}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.cardBorder,
              }}
            >
              <ArrowLeft size={20} color={COLORS.text} />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '900' }}>Booking Receipt</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>Your court record</Text>
          </View>
        </View>

        <BookingCard booking={booking} cancelContactPhone={active ? supportPhone : undefined} />

        <GlassCard>
          <View style={{ gap: 13 }}>
            {rows.map((row) => (
              <View key={row.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <Text style={{ flex: 0.8, color: COLORS.textMuted, fontSize: 13 }}>{row.label}</Text>
                <Text selectable style={{ flex: 1.2, color: COLORS.text, fontWeight: '800', fontSize: 14, textAlign: 'right' }}>
                  {row.value}
                </Text>
              </View>
            ))}
            <View style={{ height: 1, backgroundColor: COLORS.cardBorder, marginVertical: 2 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, color: COLORS.text, fontSize: 16, fontWeight: '900' }}>Total</Text>
              <Text style={{ color: fullyFree ? COLORS.success : COLORS.neon, fontSize: 22, fontWeight: '900' }}>{total}</Text>
            </View>
          </View>
        </GlassCard>

        {active ? (
          <Pressable
            onPress={() => void Linking.openURL(`tel:${phoneDigits}`)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              borderRadius: 16,
              backgroundColor: `${COLORS.neon}1f`,
              borderWidth: 1,
              borderColor: `${COLORS.neon}66`,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            })}
          >
            <Phone size={18} color={COLORS.neon} />
            <Text style={{ color: COLORS.neon, fontWeight: '900', fontSize: 15 }}>Call front desk: {supportPhone}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
