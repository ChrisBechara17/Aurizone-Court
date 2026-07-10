import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, ChevronRight, UserX, X } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { BookingCard } from '@/components/BookingCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { DateSelector } from '@/components/DateSelector';
import { DurationSelector } from '@/components/DurationSelector';
import { TimeSlotPicker } from '@/components/TimeSlotPicker';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';
import { fmtDateLong, fmtTime, formatDuration, isPeakStart, parseISO } from '@/utils/dateUtils';

/**
 * Admin booking detail. Shows the full booking, who made it (tap through to the
 * user), and every field at a glance. More info can be layered on here later.
 */
export default function AdminBookingScreen() {
  const ADMIN = COLORS.warning;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const user = useAppStore((s) => s.user);
  const users = useAppStore((s) => s.users);
  const bookings = useAppStore((s) => s.bookings);
  const cancelBooking = useAppStore((s) => s.cancelBooking);
  const markBookingCompleted = useAppStore((s) => s.markBookingCompleted);
  const markBookingNoShow = useAppStore((s) => s.markBookingNoShow);
  const rescheduleBooking = useAppStore((s) => s.rescheduleBooking);
  const [cancelReason, setCancelReason] = useState('');
  const [noShowReason, setNoShowReason] = useState('');
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(new Date());
  const [rescheduleTime, setRescheduleTime] = useState('12:00');
  const [rescheduleDuration, setRescheduleDuration] = useState(1);
  const [overrideHours, setOverrideHours] = useState(false);

  const booking = bookings.find((b) => b.id === id);

  useEffect(() => {
    if (!booking) return;
    const startDate = parseISO(booking.startTime);
    setRescheduleDate(startDate);
    setRescheduleTime(toHHmm(startDate));
    setRescheduleDuration(booking.durationMinutes / 60);
  }, [booking?.id]);

  if (!user?.isAdmin) return <Redirect href="/(tabs)/profile" />;
  if (!booking) return <Redirect href="/admin" />;

  const bookedBy = users.find((u) => u.id === booking.userId);
  const start = parseISO(booking.startTime);
  const peak = booking.bookingType === 'court' ? isPeakStart(start) : false;
  const hasStarted = start.getTime() <= Date.now();

  const onCancel = async () => {
    setActionErr(null);
    const reason = cancelReason.trim();
    if (!reason) return setActionErr('A cancellation reason is required.');
    const res = await cancelBooking(booking.id, true, reason);
    if (!res.ok) setActionErr(res.error ?? 'Could not cancel booking.');
  };

  const onComplete = async () => {
    setActionErr(null);
    const res = await markBookingCompleted(booking.id);
    if (!res.ok) setActionErr(res.error ?? 'Could not complete booking.');
  };

  const onNoShow = async () => {
    setActionErr(null);
    const reason = noShowReason.trim();
    if (!reason) return setActionErr('A no-show reason is required.');
    const res = await markBookingNoShow(booking.id, reason);
    if (!res.ok) setActionErr(res.error ?? 'Could not mark no-show.');
  };

  const onReschedule = async () => {
    setActionErr(null);
    const res = await rescheduleBooking(booking.id, {
      date: rescheduleDate,
      startTime: rescheduleTime,
      durationHours: rescheduleDuration,
      overrideOperatingHours: overrideHours,
    });
    if (!res.ok) setActionErr(res.error ?? 'Could not reschedule booking.');
  };

  const rows: { label: string; value: string }[] = [
    { label: 'Type', value: booking.bookingType === 'court' ? 'Court' : 'Coach' },
    { label: 'Sport', value: booking.sportType === 'basketball' ? 'Basketball' : 'Tennis' },
    ...(booking.bookingType === 'court'
      ? [{ label: 'Court', value: booking.courtHalf && booking.courtHalf !== 'full' ? 'Half court (shared)' : 'Main Court' }]
      : []),
    { label: 'Date', value: fmtDateLong(booking.startTime) },
    { label: 'Time', value: `${fmtTime(booking.startTime)} – ${fmtTime(booking.endTime)}` },
    { label: 'Duration', value: formatDuration(booking.durationMinutes / 60) },
    ...(booking.bookingType === 'court' ? [{ label: 'Rate', value: peak ? 'Peak (from 4 PM)' : 'Off-peak' }] : []),
    { label: 'Ball machine', value: booking.ballMachine ? 'Yes' : 'No' },
    { label: 'Free reward', value: booking.isFreeReward ? 'Yes 🎁' : 'No' },
    { label: 'No-show', value: booking.noShow ? 'Yes' : 'No' },
    { label: 'Booked on', value: booking.createdAt ? fmtDateLong(booking.createdAt) : '—' },
  ];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} hitSlop={12}>
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
          <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: '900' }}>Booking Detail</Text>
        </View>

        {/* The booking itself, with admin actions. */}
        <Animated.View entering={FadeInDown.duration(350)}>
          <BookingCard
            booking={booking}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(40).duration(350)} style={{ gap: 10 }}>
          <SectionTitle text="Admin Actions" />
          <GlassCard accent={ADMIN}>
            <View style={{ gap: 12 }}>
              <ErrorBanner message={actionErr} />
              {booking.status === 'cancelled' ? (
                <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
                  This booking is cancelled{booking.cancelReason ? `: ${booking.cancelReason}` : '.'}
                </Text>
              ) : (
                <>
                  <TextInput
                    value={cancelReason}
                    onChangeText={setCancelReason}
                    placeholder="Cancellation reason"
                    placeholderTextColor={COLORS.textFaint}
                    style={actionInputStyle()}
                  />
                  <ActionButton
                    label="Cancel Booking"
                    color={COLORS.danger}
                    icon={<X size={16} color={COLORS.danger} />}
                    disabled={booking.status !== 'confirmed'}
                    onPress={onCancel}
                  />

                  <View style={{ height: 1, backgroundColor: COLORS.cardBorder, marginVertical: 4 }} />
                  <SectionTitle text="Reschedule" />
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                    Move the booking without cancelling it. Conflicts are checked before saving.
                  </Text>
                  <DateSelector value={rescheduleDate} onChange={setRescheduleDate} accent={ADMIN} days={21} />
                  <TimeSlotPicker value={rescheduleTime} onChange={setRescheduleTime} accent={ADMIN} />
                  <DurationSelector value={rescheduleDuration} onChange={setRescheduleDuration} accent={ADMIN} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 14 }}>Override Hours</Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Use only for special admin cases.</Text>
                    </View>
                    <Switch
                      value={overrideHours}
                      onValueChange={setOverrideHours}
                      trackColor={{ false: COLORS.cardBorder, true: `${ADMIN}88` }}
                      thumbColor={overrideHours ? ADMIN : COLORS.textMuted}
                    />
                  </View>
                  <ActionButton
                    label="Reschedule Booking"
                    color={ADMIN}
                    icon={<ChevronRight size={16} color={ADMIN} />}
                    onPress={onReschedule}
                  />

                  {hasStarted ? (
                    <>
                      <ActionButton
                        label="Mark Completed"
                        color={COLORS.success}
                        icon={<CheckCircle2 size={16} color={COLORS.success} />}
                        disabled={booking.status === 'completed'}
                        onPress={onComplete}
                      />
                      <TextInput
                        value={noShowReason}
                        onChangeText={setNoShowReason}
                        placeholder="No-show reason"
                        placeholderTextColor={COLORS.textFaint}
                        style={actionInputStyle()}
                      />
                      <ActionButton
                        label="Mark No-show"
                        color={COLORS.danger}
                        icon={<UserX size={16} color={COLORS.danger} />}
                        disabled={!!booking.noShow}
                        onPress={onNoShow}
                      />
                    </>
                  ) : (
                    <Text style={{ color: COLORS.textFaint, fontSize: 12 }}>Completion and no-show actions unlock after the start time.</Text>
                  )}
                </>
              )}
            </View>
          </GlassCard>
        </Animated.View>

        {/* Who booked it → tap through to their profile. */}
        <Animated.View entering={FadeInDown.delay(60).duration(350)} style={{ gap: 10 }}>
          <SectionTitle text="Customer" />
          <Pressable
            onPress={() => bookedBy && router.push(`/admin-user?id=${bookedBy.id}`)}
            disabled={!bookedBy}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.99 : 1 }] })}
          >
            <GlassCard accent={ADMIN}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: '800', fontSize: 16 }}>
                    {bookedBy?.name ?? 'Unknown user'}
                  </Text>
                  <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 13 }}>
                    {bookedBy?.phoneOrEmail ?? '—'}
                  </Text>
                </View>
                {bookedBy ? <ChevronRight size={20} color={COLORS.textMuted} /> : null}
              </View>
            </GlassCard>
          </Pressable>
        </Animated.View>

        {/* Full details. */}
        <Animated.View entering={FadeInDown.delay(120).duration(350)} style={{ gap: 10 }}>
          <SectionTitle text="Details" />
          <GlassCard>
            <View style={{ gap: 12 }}>
              {rows.map((r) => (
                <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, color: COLORS.textMuted, fontSize: 13, paddingRight: 12 }}>{r.label}</Text>
                  <Text style={{ flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '700', textAlign: 'right' }}>
                    {r.value}
                  </Text>
                </View>
              ))}
              <View style={{ height: 1, backgroundColor: COLORS.cardBorder, marginVertical: 4 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '800' }}>Total</Text>
                <Text style={{ flex: 1, color: ADMIN, fontSize: 20, fontWeight: '900', textAlign: 'right' }}>
                  {booking.isFreeReward && booking.totalPrice === 0 ? 'FREE 🎁' : `$${booking.totalPrice}`}
                </Text>
              </View>
            </View>
          </GlassCard>
        </Animated.View>
      </ScrollView>
    </ScreenContainer>
  );
}

function SectionTitle({ text }: { text: string }) {
  const ADMIN = COLORS.warning;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: ADMIN }} />
      <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>
        {text}
      </Text>
    </View>
  );
}

function actionInputStyle() {
  return {
    backgroundColor: COLORS.chip,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 14,
  } as const;
}

function toHHmm(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function ActionButton({
  label,
  color,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  color: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${color}66`,
        backgroundColor: `${color}18`,
      })}
    >
      {icon}
      <Text style={{ color, fontWeight: '900', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
