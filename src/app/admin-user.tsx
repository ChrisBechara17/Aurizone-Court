import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Bell, Mail } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { LoyaltyCard } from '@/components/LoyaltyCard';
import { BookingCard } from '@/components/BookingCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';
import { computeLoyalty, computeLoyaltyFromTransactions } from '@/utils/loyalty';
import { computeStanding } from '@/utils/accountStanding';
import { bookingsFor } from '@/utils/adminUsers';
import { parseISO } from 'date-fns';

export default function AdminUserScreen() {
  const ADMIN = COLORS.warning; // read live so it follows the active theme
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const user = useAppStore((s) => s.user);
  const users = useAppStore((s) => s.users);
  const bookings = useAppStore((s) => s.bookings);
  const loyaltySettings = useAppStore((s) => s.loyaltySettings);
  const loyaltyTransactions = useAppStore((s) => s.loyaltyTransactions);
  const adminSendNotification = useAppStore((s) => s.adminSendNotification);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteMessage, setNoteMessage] = useState('');
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [noteOk, setNoteOk] = useState<string | null>(null);

  const target = users.find((u) => u.id === id);

  const userBookings = useMemo(
    () =>
      bookingsFor(bookings, id ?? '').sort((a, b) => {
        const rank = (s: string) => (s === 'confirmed' ? 0 : s === 'completed' ? 1 : 2);
        const r = rank(a.status) - rank(b.status);
        return r !== 0 ? r : parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime();
      }),
    [bookings, id],
  );

  if (!user?.isAdmin) return <Redirect href="/(tabs)/profile" />;
  if (!target) return <Redirect href="/admin-users" />;

  const userTransactions = loyaltyTransactions.filter((tx) => tx.userId === target.id);
  const loyalty = userTransactions.length > 0
    ? computeLoyaltyFromTransactions(userTransactions, userBookings)
    : computeLoyalty(userBookings, loyaltySettings);
  const standing = computeStanding(userBookings);
  const initials = target.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const onSendNotification = async () => {
    setNoteErr(null);
    setNoteOk(null);
    const res = await adminSendNotification({ userId: target.id, title: noteTitle, message: noteMessage });
    if (!res.ok) return setNoteErr(res.error ?? 'Could not send notification.');
    setNoteTitle('');
    setNoteMessage('');
    setNoteOk('Notification sent.');
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin-users'))} hitSlop={12}>
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
          <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: '900' }}>User Profile</Text>
        </View>

        {/* Identity */}
        <Animated.View entering={FadeInDown.duration(350)}>
          <GlassCard accent={standing.disabled ? COLORS.danger : loyalty.tier.color}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: `${loyalty.tier.color}33`,
                }}
              >
                <Text style={{ color: loyalty.tier.color, fontWeight: '900', fontSize: 22 }}>{initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 19 }}>{target.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Mail size={13} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{target.phoneOrEmail}</Text>
                </View>
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        {/* Standing */}
        <Animated.View entering={FadeInDown.delay(60).duration(350)} style={{ gap: 10 }}>
          <SectionTitle text="Account Standing" />
          <GlassCard accent={standing.disabled ? COLORS.danger : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: standing.disabled ? COLORS.danger : COLORS.text, fontWeight: '800', fontSize: 15 }}>
                  {standing.disabled ? 'Disabled' : standing.strikes === 0 ? 'Good standing' : 'Warnings active'}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  {standing.strikes} of {standing.maxStrikes} no-show strikes
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {Array.from({ length: standing.maxStrikes }, (_, k) => {
                  const filled = k < standing.strikes;
                  return (
                    <View
                      key={k}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        backgroundColor: filled ? '#000' : 'transparent',
                        borderWidth: 1.5,
                        borderColor: filled ? COLORS.text : COLORS.cardBorder,
                      }}
                    />
                  );
                })}
              </View>
            </View>
            {standing.disabled ? (
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 10 }}>
                Undo a no-show on one of their bookings below to restore access.
              </Text>
            ) : null}
          </GlassCard>
        </Animated.View>

        {/* Loyalty */}
        <Animated.View entering={FadeInDown.delay(120).duration(350)} style={{ gap: 10 }}>
          <SectionTitle text="Loyalty" />
          <LoyaltyCard loyalty={loyalty} />
          <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
            {loyalty.goodBookings} completed · {loyalty.availableFree} free session
            {loyalty.availableFree === 1 ? '' : 's'} available
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(350)} style={{ gap: 10 }}>
          <SectionTitle text="Send Notification" />
          <GlassCard accent={ADMIN}>
            <View style={{ gap: 10 }}>
              <TextInput
                value={noteTitle}
                onChangeText={setNoteTitle}
                placeholder="Title"
                placeholderTextColor={COLORS.textFaint}
                style={inputStyle()}
              />
              <TextInput
                value={noteMessage}
                onChangeText={setNoteMessage}
                placeholder="Message"
                placeholderTextColor={COLORS.textFaint}
                multiline
                style={[inputStyle(), { minHeight: 86, textAlignVertical: 'top' }]}
              />
              <ErrorBanner message={noteErr} />
              {noteOk ? <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: '700' }}>{noteOk}</Text> : null}
              <Pressable
                onPress={onSendNotification}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.75 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: `${ADMIN}22`,
                  borderWidth: 1,
                  borderColor: `${ADMIN}66`,
                })}
              >
                <Bell size={16} color={ADMIN} />
                <Text style={{ color: ADMIN, fontWeight: '900', fontSize: 14 }}>Send Notification</Text>
              </Pressable>
            </View>
          </GlassCard>
        </Animated.View>

        {/* Bookings */}
        <Animated.View entering={FadeInDown.delay(180).duration(350)} style={{ gap: 12 }}>
          <SectionTitle text={`Bookings (${userBookings.length})`} />
          {userBookings.length === 0 ? (
            <EmptyState title="No bookings" subtitle="This user hasn't booked yet." />
          ) : (
            userBookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                onPress={() => router.push(`/admin-booking?id=${b.id}`)}
              />
            ))
          )}
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

function inputStyle() {
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
