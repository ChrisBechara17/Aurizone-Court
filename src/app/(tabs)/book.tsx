import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarCheck, CalendarRange, Gift, Repeat, Rocket } from 'lucide-react-native';
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
import { COLORS, sportAccent } from '@/constants/colors';
import { BALL_MACHINE_RATE, getSportPrice, REPEAT_OPTIONS } from '@/constants/prices';
import { SportType } from '@/models';
import { useAppStore } from '@/store/useAppStore';
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
import { hasCourtConflict } from '@/utils/conflictUtils';
import { computeLoyalty } from '@/utils/loyalty';
import { computeStanding, hasReachedBookingLimit } from '@/utils/accountStanding';

export default function BookScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sport?: string }>();
  const bookCourt = useAppStore((s) => s.bookCourt);
  const user = useAppStore((s) => s.user);
  const bookings = useAppStore((s) => s.bookings); // all bookings — for court conflicts
  const myBookings = bookings.filter((b) => b.userId === (user?.id ?? 'demo-user'));
  const courtBlocks = useAppStore((s) => s.courtBlocks);

  const initialSport: SportType = params.sport === 'tennis' ? 'tennis' : 'basketball';
  const [sport, setSport] = useState<SportType>(initialSport);
  const [date, setDate] = useState<Date>(startOfDay(new Date()));
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState(1);
  const [repeat, setRepeat] = useState(false);
  const [repeatCount, setRepeatCount] = useState<number>(4);
  const [useFree, setUseFree] = useState(false);
  const [ballMachine, setBallMachine] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);

  // Ball machine is a tennis-only paid add-on.
  const machineActive = sport === 'tennis' && ballMachine;

  const loyalty = computeLoyalty(myBookings);
  // A free reward applies to a single booking, so it's unavailable while repeating.
  const freeRedeemable = loyalty.availableFree > 0 && !repeat;
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
  const price = getSportPrice(sport);

  // Compute unavailable start times for the chosen date + duration.
  // A slot is unavailable if it conflicts OR the session would run past closing.
  const unavailable = useMemo(() => {
    return timeSlots().filter((slot) => {
      if (!fitsWithinHours(slot, duration)) return true;
      const start = combineDateAndTime(date, slot);
      const end = calculateEndTime(start, duration);
      return hasCourtConflict(
        { startTime: start.toISOString(), endTime: end.toISOString(), usesMainCourt: true },
        bookings,
        courtBlocks,
      );
    });
  }, [date, duration, bookings, courtBlocks]);

  const start = combineDateAndTime(date, time);
  const end = calculateEndTime(start, duration);
  const machineCost = machineActive ? BALL_MACHINE_RATE * duration : 0;
  // Free reward covers the court; the ball-machine add-on is still charged.
  const total = isFree ? machineCost : price * duration + machineCost;

  const onConfirm = () => {
    setError(null);
    if (!fitsWithinHours(time, duration)) {
      setError('This session would run past closing time (12:00 AM). Pick an earlier start or shorter duration.');
      return;
    }
    const res = bookCourt({
      sportType: sport,
      date,
      startTime: time,
      durationHours: duration,
      repeatWeekly: repeat,
      repeatCount: repeat ? repeatCount : 1,
      useFreeSession: isFree,
      ballMachine: machineActive,
    });
    if (!res.ok && res.created.length === 0) {
      setError(res.error ?? 'This slot is unavailable.');
      return;
    }
    setResult(res);
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 18 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900' }}>Book the Court</Text>

        {/* Sport selection */}
        <View style={{ gap: 10 }}>
          <Label text="Select Sport" />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <SportModeCard sport="basketball" selected={sport === 'basketball'} onPress={() => setSport('basketball')} />
            <SportModeCard sport="tennis" selected={sport === 'tennis'} onPress={() => setSport('tennis')} />
          </View>
        </View>

        {/* Court */}
        <View style={{ gap: 10 }}>
          <Label text="Court" />
          <MainCourtCard activeSport={sport} />
        </View>

        {/* Date */}
        <View style={{ gap: 10 }}>
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
        <View style={{ gap: 10 }}>
          <Label text="Start Time" />
          <TimeSlotPicker value={time} onChange={setTime} accent={accent} unavailable={unavailable} />
          {unavailable.includes(time) ? (
            <ErrorBanner message="This slot is unavailable because basketball and tennis share the same court." />
          ) : null}
        </View>

        {/* Duration */}
        <View style={{ gap: 10 }}>
          <Label text="Duration" />
          <DurationSelector value={duration} onChange={setDuration} accent={accent} />
        </View>

        {/* Ball machine — tennis only */}
        {sport === 'tennis' ? (
          <GlassCard accent={machineActive ? COLORS.tennis : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Rocket size={20} color={COLORS.tennis} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>Ball Machine 🎾</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                    Automatic ball launcher · +${BALL_MACHINE_RATE}/hr
                  </Text>
                </View>
              </View>
              <Switch
                value={ballMachine}
                onValueChange={setBallMachine}
                trackColor={{ false: COLORS.cardBorder, true: `${COLORS.tennis}88` }}
                thumbColor={ballMachine ? COLORS.tennis : '#888'}
              />
            </View>
          </GlassCard>
        ) : null}

        {/* Repeat weekly */}
        <GlassCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Repeat size={20} color={COLORS.neon} />
              <View>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>Repeat Weekly</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Same slot, every week</Text>
              </View>
            </View>
            <Switch
              value={repeat}
              onValueChange={(v) => {
                setRepeat(v);
                if (v) setUseFree(false); // free reward applies to single bookings only
              }}
              trackColor={{ false: COLORS.cardBorder, true: `${COLORS.neon}88` }}
              thumbColor={repeat ? COLORS.neon : '#888'}
            />
          </View>
          {repeat ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              {REPEAT_OPTIONS.map((w) => {
                const active = repeatCount === w;
                return (
                  <Pressable key={w} onPress={() => setRepeatCount(w)} style={{ flex: 1 }}>
                    <View
                      style={{
                        paddingVertical: 12,
                        borderRadius: 14,
                        alignItems: 'center',
                        backgroundColor: active ? `${COLORS.neon}26` : 'rgba(255,255,255,0.04)',
                        borderWidth: 1.5,
                        borderColor: active ? COLORS.neon : COLORS.cardBorder,
                      }}
                    >
                      <Text style={{ color: active ? COLORS.neon : COLORS.text, fontWeight: '800' }}>{w} wks</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </GlassCard>

        {/* Redeem a free session (loyalty reward) */}
        {loyalty.availableFree > 0 ? (
          <GlassCard accent={isFree ? COLORS.success : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Gift size={20} color={COLORS.success} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 15 }}>Use a free session 🎁</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                    {loyalty.availableFree} reward{loyalty.availableFree > 1 ? 's' : ''} available
                    {repeat ? ' · not available with weekly repeat' : ''}
                  </Text>
                </View>
              </View>
              <Switch
                value={isFree}
                onValueChange={setUseFree}
                disabled={!freeRedeemable}
                trackColor={{ false: COLORS.cardBorder, true: `${COLORS.success}88` }}
                thumbColor={isFree ? COLORS.success : '#888'}
              />
            </View>
          </GlassCard>
        ) : null}

        {/* Summary */}
        <PriceSummaryCard
          accent={isFree ? COLORS.success : accent}
          rows={[
            { label: 'Sport', value: sport === 'basketball' ? 'Basketball' : 'Tennis', highlight: true },
            { label: 'Court', value: 'Main Court' },
            { label: 'Date', value: fmtDate(start) },
            { label: 'Start time', value: fmtTime(start) },
            { label: 'End time', value: fmtTime(end) },
            { label: 'Duration', value: formatDuration(duration) },
            { label: 'Price per hour', value: `$${price}` },
            ...(machineActive
              ? [{ label: 'Ball machine', value: `+$${BALL_MACHINE_RATE}/hr`, highlight: true }]
              : []),
            { label: 'Repeat weekly', value: repeat ? `Yes · ${repeatCount} weeks` : 'No' },
            ...(isFree ? [{ label: 'Reward applied', value: 'Free court 🎁', highlight: true }] : []),
          ]}
          total={
            isFree && total === 0
              ? 'FREE 🎁'
              : repeat
                ? `$${total} / session`
                : `$${total}`
          }
        />

        <ErrorBanner message={blockReason ?? error} />

        <PrimaryGradientButton
          label="Confirm Booking"
          icon={<CalendarCheck size={18} color="#05060f" />}
          colors={[accent, accent]}
          onPress={onConfirm}
          disabled={!!blockReason}
        />
      </ScrollView>

      {/* Success modal */}
      <ConfirmationModal
        visible={!!result}
        accent={accent}
        title="Booking Confirmed!"
        message={
          result && result.created.length > 1
            ? `${result.created.length} weekly sessions booked on the Main Court.`
            : 'Your Main Court slot is locked in. See you on court!'
        }
        confirmLabel="View My Bookings"
        onClose={() => {
          setResult(null);
          router.push('/(tabs)/bookings');
        }}
      >
        {result && result.blocked.length > 0 ? (
          <View
            style={{
              backgroundColor: `${COLORS.warning}14`,
              borderColor: `${COLORS.warning}55`,
              borderWidth: 1,
              borderRadius: 14,
              padding: 12,
              gap: 4,
            }}
          >
            <Text style={{ color: COLORS.warning, fontWeight: '700', fontSize: 13 }}>
              {result.blocked.length} date(s) were unavailable and skipped:
            </Text>
            {result.blocked.map((b, i) => (
              <Text key={i} style={{ color: COLORS.textMuted, fontSize: 12 }}>
                • {fmtDate(b.startTime)} at {fmtTime(b.startTime)}
              </Text>
            ))}
          </View>
        ) : null}
      </ConfirmationModal>
    </ScreenContainer>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '800' }}>{text}</Text>;
}
