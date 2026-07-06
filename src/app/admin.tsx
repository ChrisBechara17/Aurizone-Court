import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Ban, CalendarRange, DollarSign, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { BookingCard } from '@/components/BookingCard';
import { CoachCard } from '@/components/CoachCard';
import { DateSelector } from '@/components/DateSelector';
import { TimeSlotPicker } from '@/components/TimeSlotPicker';
import { DurationSelector } from '@/components/DurationSelector';
import { PrimaryGradientButton } from '@/components/PrimaryGradientButton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import { COLORS, sportLabel } from '@/constants/colors';
import { SportType } from '@/models';
import { useAppStore } from '@/store/useAppStore';
import {
  calculateEndTime,
  combineDateAndTime,
  fitsWithinHours,
  fmtDate,
  fmtTime,
  isSameDay,
  startOfDay,
  timeSlots,
} from '@/utils/dateUtils';
import { hasCourtConflict } from '@/utils/conflictUtils';
import { parseISO } from 'date-fns';

// Admin gold accent + input style are read live from the palette (inside the
// component bodies) so the console follows the active light/dark theme.
const inputStyleFor = () =>
  ({
    backgroundColor: COLORS.chip,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.text,
    fontSize: 15,
  }) as const;

export default function AdminScreen() {
  const ADMIN = COLORS.warning;
  const inputStyle = inputStyleFor();
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const bookings = useAppStore((s) => s.bookings);
  const occupancy = useAppStore((s) => s.occupancy);
  const courtBlocks = useAppStore((s) => s.courtBlocks);
  const cancelBooking = useAppStore((s) => s.cancelBooking);
  const toggleNoShow = useAppStore((s) => s.toggleNoShow);
  const addCourtBlock = useAppStore((s) => s.addCourtBlock);
  const removeCourtBlock = useAppStore((s) => s.removeCourtBlock);
  const coaches = useAppStore((s) => s.coaches);
  const addCoach = useAppStore((s) => s.addCoach);
  const updateCoach = useAppStore((s) => s.updateCoach);
  const removeCoach = useAppStore((s) => s.removeCoach);
  const users = useAppStore((s) => s.users);
  const pricing = useAppStore((s) => s.pricing);
  const updatePricing = useAppStore((s) => s.updatePricing);

  const [date, setDate] = useState<Date>(startOfDay(new Date()));
  const [time, setTime] = useState('12:00');
  const [duration, setDuration] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Bookings day filter
  const [bookingsDay, setBookingsDay] = useState<Date>(startOfDay(new Date()));

  // Coach form (add / edit)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cName, setCName] = useState('');
  const [cSports, setCSports] = useState<SportType[]>(['basketball']);
  const [cBio, setCBio] = useState('');
  const [cPrice, setCPrice] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachOk, setCoachOk] = useState<string | null>(null);

  // Pricing form — seeded from the loaded rates, re-seeded when they change.
  const [pBasket, setPBasket] = useState(String(pricing.basketball));
  const [pHalf, setPHalf] = useState(String(pricing.basketballHalf));
  const [pTennis, setPTennis] = useState(String(pricing.tennis));
  const [pMachine, setPMachine] = useState(String(pricing.ballMachineRate));
  const [priceErr, setPriceErr] = useState<string | null>(null);
  const [priceOk, setPriceOk] = useState<string | null>(null);

  useEffect(() => {
    setPBasket(String(pricing.basketball));
    setPHalf(String(pricing.basketballHalf));
    setPTennis(String(pricing.tennis));
    setPMachine(String(pricing.ballMachineRate));
  }, [pricing.basketball, pricing.basketballHalf, pricing.tennis, pricing.ballMachineRate]);

  const onSavePricing = async () => {
    setPriceErr(null);
    setPriceOk(null);
    const res = await updatePricing({
      basketball: Number(pBasket) || 0,
      basketballHalf: Number(pHalf) || 0,
      tennis: Number(pTennis) || 0,
      ballMachineRate: Number(pMachine) || 0,
    });
    if (!res.ok) return setPriceErr(res.error ?? 'Could not update pricing.');
    setPriceOk('Pricing updated. New bookings use these rates.');
  };

  const toggleSport = (s: SportType) =>
    setCSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const resetCoachForm = () => {
    setEditingId(null);
    setCName('');
    setCBio('');
    setCPrice('');
    setCPhone('');
    setCSports(['basketball']);
  };

  const startEditCoach = (id: string) => {
    const coach = coaches.find((c) => c.id === id);
    if (!coach) return;
    setEditingId(coach.id);
    setCName(coach.name);
    setCSports(coach.supportedSports);
    setCBio(coach.bio);
    setCPrice(String(coach.pricePerHour));
    setCPhone(coach.phone);
    setCoachError(null);
    setCoachOk(null);
  };

  const onSaveCoach = async () => {
    setCoachError(null);
    setCoachOk(null);
    const payload = {
      name: cName,
      supportedSports: cSports,
      bio: cBio,
      pricePerHour: Number(cPrice) || 0,
      phone: cPhone,
    };
    const res = editingId ? await updateCoach(editingId, payload) : await addCoach(payload);
    if (!res.ok) {
      setCoachError(res.error ?? 'Could not save coach.');
      return;
    }
    setCoachOk(editingId ? `${cName.trim()} updated.` : `${cName.trim()} added.`);
    resetCoachForm();
  };

  // Admin-only screen.
  if (!user?.isAdmin) return <Redirect href="/(tabs)/profile" />;

  const unavailable = useMemo(
    () =>
      timeSlots().filter((slot) => {
        if (!fitsWithinHours(slot, duration)) return true;
        const start = combineDateAndTime(date, slot);
        const end = calculateEndTime(start, duration);
        return hasCourtConflict(
          { startTime: start.toISOString(), endTime: end.toISOString(), usesMainCourt: true },
          occupancy,
          courtBlocks,
        );
      }),
    [date, duration, occupancy, courtBlocks],
  );

  // Bookings for the selected day, sorted by start time.
  const dayBookings = useMemo(
    () =>
      bookings
        .filter((b) => isSameDay(parseISO(b.startTime), bookingsDay))
        .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime()),
    [bookings, bookingsDay],
  );

  const upcomingCount = bookings.filter(
    (b) => b.status === 'confirmed' && parseISO(b.endTime).getTime() > Date.now(),
  ).length;
  const userCount = users.length;

  const onBlock = async () => {
    setError(null);
    setOkMsg(null);
    if (!fitsWithinHours(time, duration)) {
      setError('That block would run past closing time (12:00 AM).');
      return;
    }
    const res = await addCourtBlock({ date, startTime: time, durationHours: duration, reason });
    if (!res.ok) {
      setError(res.error ?? 'Could not block this time.');
      return;
    }
    setReason('');
    setOkMsg(`Blocked ${fmtDate(combineDateAndTime(date, time))} at ${fmtTime(combineDateAndTime(date, time))}.`);
  };

  return (
    <ScreenContainer>
      {/* Amber console glow */}
      <LinearGradient
        colors={[`${ADMIN}33`, 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 260 }}
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 18 }} showsVerticalScrollIndicator={false}>
        {/* Console banner */}
        <Animated.View entering={FadeInDown.duration(350)}>
          <LinearGradient
            colors={[ADMIN, '#ff9d2f']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 24,
              padding: 18,
              shadowColor: ADMIN,
              shadowOpacity: 0.5,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
                hitSlop={12}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.18)',
                  }}
                >
                  <ArrowLeft size={20} color="#1b1405" />
                </View>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#1b1405', fontSize: 22, fontWeight: '900' }}>Admin Console</Text>
                <Text style={{ color: 'rgba(27,20,5,0.7)', fontSize: 12, fontWeight: '600' }}>
                  Main Court control panel
                </Text>
              </View>
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(0,0,0,0.18)',
                }}
              >
                <ShieldCheck size={24} color="#1b1405" />
              </View>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 16,
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: 'rgba(27,20,5,0.18)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#1b7a3a' }} />
                <Text style={{ color: '#1b1405', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>
                  ADMIN MODE ACTIVE
                </Text>
              </View>
              <Text style={{ color: 'rgba(27,20,5,0.8)', fontSize: 12, fontWeight: '600' }}>
                {user.name}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Overview */}
        <Animated.View entering={FadeInDown.delay(60).duration(350)} style={{ gap: 10 }}>
          <SectionTitle text="Overview" />
          <GlassCard accent={ADMIN}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Stat value={String(bookings.length)} label="Total" />
              <Stat value={String(upcomingCount)} label="Upcoming" />
              <Stat value={String(courtBlocks.length)} label="Blocks" />
              <Stat value={String(userCount)} label="Users" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => router.push('/admin-users')}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: `${ADMIN}66`,
                  backgroundColor: `${ADMIN}1f`,
                  overflow: 'hidden',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Users size={16} color={ADMIN} />
                <Text style={{ color: ADMIN, fontWeight: '800', fontSize: 13 }}>Manage Users</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/availability')}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: COLORS.cardBorder,
                  backgroundColor: COLORS.chip,
                  overflow: 'hidden',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <CalendarRange size={16} color={COLORS.neon} />
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 13 }}>Schedule</Text>
              </Pressable>
            </View>
          </GlassCard>
        </Animated.View>

        {/* Pricing */}
        <Animated.View entering={FadeInDown.delay(50).duration(350)} style={{ gap: 12 }}>
          <SectionTitle text="Pricing" />
          <SubLabel text="Hourly rates ($/hr) — applied to all new bookings" />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 8 }}>
              <SubLabel text="Basketball" />
              <TextInput
                value={pBasket}
                onChangeText={setPBasket}
                placeholder="30"
                keyboardType="number-pad"
                placeholderTextColor={COLORS.textFaint}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <SubLabel text="Tennis" />
              <TextInput
                value={pTennis}
                onChangeText={setPTennis}
                placeholder="20"
                keyboardType="number-pad"
                placeholderTextColor={COLORS.textFaint}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <SubLabel text="Ball machine" />
              <TextInput
                value={pMachine}
                onChangeText={setPMachine}
                placeholder="15"
                keyboardType="number-pad"
                placeholderTextColor={COLORS.textFaint}
                style={inputStyle}
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 8 }}>
              <SubLabel text="Basketball — half court" />
              <TextInput
                value={pHalf}
                onChangeText={setPHalf}
                placeholder="18"
                keyboardType="number-pad"
                placeholderTextColor={COLORS.textFaint}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1 }} />
          </View>
          <ErrorBanner message={priceErr} />
          {priceOk ? (
            <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: '600' }}>{priceOk}</Text>
          ) : null}
          <PrimaryGradientButton
            label="Save Pricing"
            icon={<DollarSign size={18} color="#05060f" />}
            colors={[ADMIN, '#ffb020']}
            onPress={onSavePricing}
          />
        </Animated.View>

        {/* Block court time */}
        <Animated.View entering={FadeInDown.delay(60).duration(350)} style={{ gap: 12 }}>
          <SectionTitle text="Block Court Time" />
          <SubLabel text="Date" />
          <DateSelector value={date} onChange={setDate} accent={ADMIN} />
          <SubLabel text="Start" />
          <TimeSlotPicker value={time} onChange={setTime} accent={ADMIN} unavailable={unavailable} />
          <SubLabel text="Duration" />
          <DurationSelector value={duration} onChange={setDuration} accent={ADMIN} />
          <SubLabel text="Reason" />
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Maintenance, private event"
            placeholderTextColor={COLORS.textFaint}
            style={{
              backgroundColor: COLORS.chip,
              borderWidth: 1,
              borderColor: COLORS.cardBorder,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              color: COLORS.text,
              fontSize: 15,
            }}
          />
          <ErrorBanner message={error} />
          {okMsg ? (
            <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: '600' }}>{okMsg}</Text>
          ) : null}
          <PrimaryGradientButton
            label="Block This Slot"
            icon={<Ban size={18} color="#05060f" />}
            colors={[ADMIN, '#ffb020']}
            onPress={onBlock}
          />
        </Animated.View>

        {/* Existing blocks */}
        {courtBlocks.length > 0 ? (
          <View style={{ gap: 12 }}>
            <SectionTitle text="Active Blocks" />
            {courtBlocks
              .slice()
              .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime())
              .map((blk) => (
                <GlassCard key={blk.id} accent={ADMIN}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 15 }}>{blk.reason}</Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>
                        {fmtDate(blk.startTime)} · {fmtTime(blk.startTime)} – {fmtTime(blk.endTime)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => removeCourtBlock(blk.id)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: `${COLORS.danger}66`,
                        backgroundColor: `${COLORS.danger}1a`,
                        overflow: 'hidden',
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Trash2 size={14} color={COLORS.danger} />
                      <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 13 }}>Remove</Text>
                    </Pressable>
                  </View>
                </GlassCard>
              ))}
          </View>
        ) : null}

        {/* Manage coaches */}
        <Animated.View entering={FadeInDown.delay(90).duration(350)} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionTitle text={editingId ? 'Edit Coach' : 'Add a Coach'} />
            {editingId ? (
              <Pressable onPress={resetCoachForm} hitSlop={8}>
                <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '700' }}>Cancel edit</Text>
              </Pressable>
            ) : null}
          </View>
          <SubLabel text="Name" />
          <TextInput
            value={cName}
            onChangeText={setCName}
            placeholder="e.g. Coach Sara"
            placeholderTextColor={COLORS.textFaint}
            style={inputStyle}
          />
          <SubLabel text="Sports" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(['basketball', 'tennis'] as SportType[]).map((s) => {
              const on = cSports.includes(s);
              return (
                <Pressable key={s} onPress={() => toggleSport(s)} style={{ flex: 1 }}>
                  <View
                    style={{
                      paddingVertical: 12,
                      borderRadius: 14,
                      alignItems: 'center',
                      backgroundColor: on ? `${ADMIN}26` : COLORS.card,
                      borderWidth: 1.5,
                      borderColor: on ? ADMIN : COLORS.cardBorder,
                    }}
                  >
                    <Text style={{ color: on ? ADMIN : COLORS.text, fontWeight: '800' }}>{sportLabel(s)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <SubLabel text="Short bio" />
          <TextInput
            value={cBio}
            onChangeText={setCBio}
            placeholder="e.g. Footwork & conditioning specialist"
            placeholderTextColor={COLORS.textFaint}
            style={inputStyle}
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 8 }}>
              <SubLabel text="Rate ($/hr)" />
              <TextInput
                value={cPrice}
                onChangeText={setCPrice}
                placeholder="30"
                keyboardType="number-pad"
                placeholderTextColor={COLORS.textFaint}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1.4, gap: 8 }}>
              <SubLabel text="Phone" />
              <TextInput
                value={cPhone}
                onChangeText={setCPhone}
                placeholder="+1 (555) 000-0000"
                keyboardType="phone-pad"
                placeholderTextColor={COLORS.textFaint}
                style={inputStyle}
              />
            </View>
          </View>
          <ErrorBanner message={coachError} />
          {coachOk ? (
            <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: '600' }}>{coachOk}</Text>
          ) : null}
          <PrimaryGradientButton
            label={editingId ? 'Save Changes' : 'Add Coach'}
            icon={<UserPlus size={18} color="#05060f" />}
            colors={[ADMIN, '#ffb020']}
            onPress={onSaveCoach}
          />
        </Animated.View>

        {/* Existing coaches */}
        <View style={{ gap: 12 }}>
          <SectionTitle text={`Coaches (${coaches.length})`} />
          {coaches.length === 0 ? (
            <EmptyState title="No coaches" subtitle="Add a coach above to list them for users." />
          ) : (
            coaches.map((c) => (
              <CoachCard key={c.id} coach={c} onEdit={startEditCoach} onRemove={removeCoach} />
            ))
          )}
        </View>

        {/* Manage all bookings — by day */}
        <View style={{ gap: 12 }}>
          <SectionTitle text="Bookings by Day" />
          <DateSelector value={bookingsDay} onChange={setBookingsDay} accent={ADMIN} startOffsetDays={-2} days={21} />
          <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '600' }}>
            {fmtDate(bookingsDay)} · {dayBookings.length} booking{dayBookings.length === 1 ? '' : 's'}
          </Text>
          {dayBookings.length === 0 ? (
            <EmptyState title="No bookings this day" subtitle="Pick another day above." />
          ) : (
            dayBookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                onCancel={b.status === 'confirmed' ? (id) => cancelBooking(id, true) : undefined}
                onToggleNoShow={toggleNoShow}
              />
            ))
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const ADMIN = COLORS.warning;
  return (
    <View style={{ alignItems: 'center', flex: 1, paddingHorizontal: 2 }}>
      <Text numberOfLines={1} style={{ color: ADMIN, fontSize: 22, fontWeight: '900' }}>{value}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: COLORS.textMuted, fontSize: 11, textAlign: 'center' }}
      >
        {label}
      </Text>
    </View>
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
function SubLabel({ text }: { text: string }) {
  return <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '700' }}>{text}</Text>;
}
