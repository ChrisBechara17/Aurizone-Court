import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarCheck, CalendarRange, Gift, Rocket, Users } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { SportModeCard } from '@/components/SportModeCard';
import { MainCourtCard } from '@/components/MainCourtCard';
import { DateSelector } from '@/components/DateSelector';
import { TimeSlotPicker } from '@/components/TimeSlotPicker';
import { DurationSelector } from '@/components/DurationSelector';
import { PriceSummaryCard } from '@/components/PriceSummaryCard';
import { PrimaryGradientButton } from '@/components/PrimaryGradientButton';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Toggle } from '@/components/Toggle';
import { COLORS, sportAccent } from '@/constants/colors';
import { SportType } from '@/models';
import { useAppStore, useThemeName } from '@/store/useAppStore';
import { CreateResult } from '@/services/bookingService';
import {
  calculateEndTime,
  combineDateAndTime,
  fitsWithinHours,
  fmtDate,
  fmtTime,
  formatDuration,
  startOfDay,
  timeSlots,
} from '@/utils/dateUtils';
import { availableHalfSide, hasCourtConflict } from '@/utils/conflictUtils';
import { computeLoyalty } from '@/utils/loyalty';
import { computeStanding, hasReachedBookingLimit } from '@/utils/accountStanding';

export default function BookScreen() {
  useThemeName();
  const router = useRouter();
  const params = useLocalSearchParams<{ sport?: string }>();
  const bookCourt = useAppStore((s) => s.bookCourt);
  const user = useAppStore((s) => s.user);
  const bookings = useAppStore((s) => s.bookings); // the user's own bookings
  const occupancy = useAppStore((s) => s.occupancy); // everyone's busy slots (times only)
  const myBookings = bookings.filter((b) => b.userId === user?.id);
  const courtBlocks = useAppStore((s) => s.courtBlocks);
  const pricing = useAppStore((s) => s.pricing); // admin-set rates

  // Primary sport is tennis; basketball only when explicitly requested.
  const initialSport: SportType = params.sport === 'basketball' ? 'basketball' : 'tennis';
  const [sport, setSport] = useState<SportType>(initialSport);
  const [date, setDate] = useState<Date>(startOfDay(new Date()));
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState(1);
  const [useFree, setUseFree] = useState(false);
  const [ballMachine, setBallMachine] = useState(false);
  const [halfCourt, setHalfCourt] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);

  // Ball machine is a tennis-only paid add-on.
  const machineActive = sport === 'tennis' && ballMachine;
  // Half court is a basketball-only option (leaves the other half free for others).
  const half = sport === 'basketball' && halfCourt;

  const loyalty = computeLoyalty(myBookings);
  const freeRedeemable = loyalty.availableFree > 0;
  const isFree = useFree && freeRedeemable;

  // Booking policy: disabled accounts and the one-active-booking limit (per user).
  const standing = computeStanding(myBookings);
  const atLimit = hasReachedBookingLimit(myBookings);
  const blockReason = standing.disabled
    ? 'Your account is disabled after 3 no-shows. Please contact the front desk.'
    : atLimit
      ? 'You already have an upcoming booking. Cancel it before booking another slot.'
      : null;

  const accent = sportAccent(sport);
  const price = half ? pricing.basketballHalf : sport === 'basketball' ? pricing.basketball : pricing.tennis;

  // Compute unavailable start times for the chosen date + duration.
  // Full/tennis needs the whole court free; a half booking just needs one side.
  const unavailable = useMemo(() => {
    return timeSlots().filter((slot) => {
      if (!fitsWithinHours(slot, duration)) return true;
      const start = combineDateAndTime(date, slot).toISOString();
      const end = calculateEndTime(combineDateAndTime(date, slot), duration).toISOString();
      if (half) {
        return availableHalfSide(start, end, occupancy, courtBlocks) === null;
      }
      return hasCourtConflict(
        { startTime: start, endTime: end, usesMainCourt: true, courtHalf: 'full' },
        occupancy,
        courtBlocks,
      );
    });
  }, [date, duration, occupancy, courtBlocks, half]);

  const start = combineDateAndTime(date, time);
  const end = calculateEndTime(start, duration);
  const machineCost = machineActive ? pricing.ballMachineRate * duration : 0;
  // Free reward covers the court; the ball-machine add-on is still charged.
  const total = isFree ? machineCost : price * duration + machineCost;

  const [submitting, setSubmitting] = useState(false);

  const onConfirm = async () => {
    setError(null);
    // Policy checks only surface when the user actually tries to book.
    if (blockReason) {
      setError(blockReason);
      return;
    }
    if (!fitsWithinHours(time, duration)) {
      setError('This session would run past closing time (12:00 AM). Pick an earlier start or shorter duration.');
      return;
    }
    setSubmitting(true);
    const res = await bookCourt({
      sportType: sport,
      date,
      startTime: time,
      durationHours: duration,
      repeatWeekly: false,
      repeatCount: 1,
      useFreeSession: isFree,
      ballMachine: machineActive,
      halfCourt: half,
    });
    setSubmitting(false);
    if (!res.ok && res.created.length === 0) {
      setError(res.error ?? 'This slot is unavailable.');
      return;
    }
    setResult(res);
  };

  return (
    <ScreenContainer>
      {/* No horizontal padding — each section adds its own 20px so the sport cards
          can go edge-to-edge (a negative margin would be clipped on Android). */}
      <ScrollView contentContainerStyle={{ paddingTop: 20, paddingBottom: 120, gap: 18 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900', paddingHorizontal: 20 }}>Book the Court</Text>

        {/* Sport selection — full-bleed so the two cards reach the screen edges,
            splitting 50/50 at the center. */}
        <View style={{ gap: 10, paddingHorizontal: 20 }}>
          <Label text="Select Sport" />
          <View style={{ gap: 12 }}>
            <SportModeCard sport="tennis" selected={sport === 'tennis'} onPress={() => setSport('tennis')} />
            <SportModeCard sport="basketball" selected={sport === 'basketball'} onPress={() => setSport('basketball')} />
          </View>
        </View>

        {/* Court */}
        <View style={{ gap: 10, paddingHorizontal: 20 }}>
          <Label text="Court" />
          <MainCourtCard activeSport={sport} />
        </View>

        {/* Date */}
        <View style={{ gap: 10, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label text="Select Date" />
            <Pressable
              onPress={() => router.push('/availability')}
              hitSlop={8}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}
            >
              <CalendarRange size={15} color={accent} />
              <Text style={{ color: accent, fontSize: 13, fontWeight: '700' }}>View schedule</Text>
            </Pressable>
          </View>
          <DateSelector value={date} onChange={setDate} accent={accent} />
        </View>

        {/* Time */}
        <View style={{ gap: 10, paddingHorizontal: 20 }}>
          <Label text="Start Time" />
          <TimeSlotPicker value={time} onChange={setTime} accent={accent} unavailable={unavailable} />
          {unavailable.includes(time) ? (
            <ErrorBanner
              message={
                half
                  ? 'Both halves of the court are booked at this time.'
                  : 'This slot is unavailable because basketball and tennis share the same court.'
              }
            />
          ) : null}
        </View>

        {/* Duration */}
        <View style={{ gap: 10, paddingHorizontal: 20 }}>
          <Label text="Duration" />
          <DurationSelector value={duration} onChange={setDuration} accent={accent} />
        </View>

        {/* Half court — basketball only (share the court with another group) */}
        {sport === 'basketball' ? (
          <GlassCard accent={half ? COLORS.basketball : undefined} style={{ marginHorizontal: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Users size={20} color={COLORS.basketball} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>Half court 🏀</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                    Share the court — another group can book the other half · ${pricing.basketballHalf}/hr
                  </Text>
                </View>
              </View>
              <Toggle value={halfCourt} onValueChange={setHalfCourt} activeColor={COLORS.basketball} />
            </View>
          </GlassCard>
        ) : null}

        {/* Ball machine — tennis only */}
        {sport === 'tennis' ? (
          <GlassCard accent={machineActive ? COLORS.tennis : undefined} style={{ marginHorizontal: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Rocket size={20} color={COLORS.tennis} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>Ball Machine 🎾</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                    Automatic ball launcher · +${pricing.ballMachineRate}/hr
                  </Text>
                </View>
              </View>
              <Toggle value={ballMachine} onValueChange={setBallMachine} activeColor={COLORS.tennis} />
            </View>
          </GlassCard>
        ) : null}

        {/* Redeem a free session (loyalty reward) */}
        {loyalty.availableFree > 0 ? (
          <GlassCard accent={isFree ? COLORS.success : undefined} style={{ marginHorizontal: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Gift size={20} color={COLORS.success} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>Use a free session 🎁</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                    {loyalty.availableFree} reward{loyalty.availableFree > 1 ? 's' : ''} available
                  </Text>
                </View>
              </View>
              <Toggle
                value={isFree}
                onValueChange={setUseFree}
                disabled={!freeRedeemable}
                activeColor={COLORS.success}
              />
            </View>
          </GlassCard>
        ) : null}

        {/* Summary */}
        <View style={{ paddingHorizontal: 20, gap: 18 }}>
        <PriceSummaryCard
          accent={isFree ? COLORS.success : accent}
          rows={[
            { label: 'Sport', value: sport === 'basketball' ? 'Basketball' : 'Tennis', highlight: true },
            { label: 'Court', value: half ? 'Half court (shared)' : 'Main Court', highlight: half },
            { label: 'Date', value: fmtDate(start) },
            { label: 'Start time', value: fmtTime(start) },
            { label: 'End time', value: fmtTime(end) },
            { label: 'Duration', value: formatDuration(duration) },
            { label: 'Price per hour', value: `$${price}` },
            ...(machineActive
              ? [{ label: 'Ball machine', value: `+$${pricing.ballMachineRate}/hr`, highlight: true }]
              : []),
            ...(isFree ? [{ label: 'Reward applied', value: 'Free court 🎁', highlight: true }] : []),
          ]}
          total={isFree && total === 0 ? 'FREE 🎁' : `$${total}`}
        />

        <ErrorBanner message={error} />

        <PrimaryGradientButton
          label="Confirm Booking"
          icon={<CalendarCheck size={18} color="#05060f" />}
          colors={[accent, accent]}
          onPress={onConfirm}
          loading={submitting}
        />
        </View>
      </ScrollView>

      {/* Success modal */}
      <ConfirmationModal
        visible={!!result}
        accent={accent}
        title="Booking Confirmed!"
        message="Your Main Court slot is locked in. See you on court!"
        confirmLabel="View My Bookings"
        onClose={() => {
          setResult(null);
          router.push('/(tabs)/bookings');
        }}
      />
    </ScreenContainer>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '800' }}>{text}</Text>;
}
