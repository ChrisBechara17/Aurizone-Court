import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, CalendarCheck, Check, Gift, Lock, Star, Zap } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { LoyaltyCard } from '@/components/LoyaltyCard';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';
import { computeLoyalty, computeLoyaltyFromTransactions, GOOD_BOOKINGS_PER_FREE, TIERS } from '@/utils/loyalty';

export default function LoyaltyScreen() {
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const bookings = useAppStore((s) => s.bookings);
  const loyaltyTransactions = useAppStore((s) => s.loyaltyTransactions);
  const loyaltySettings = useAppStore((s) => s.loyaltySettings);
  const tierPerks = useAppStore((s) => s.tierPerks);
  // S3: the store holds every user's bookings when the current user is an admin.
  // Loyalty is personal, so compute it from only this user's bookings.
  const myBookings = bookings.filter((b) => b.userId === user?.id);
  const myTransactions = loyaltyTransactions.filter((tx) => tx.userId === user?.id);
  const loyalty = myTransactions.length > 0
    ? computeLoyaltyFromTransactions(myTransactions, myBookings)
    : computeLoyalty(myBookings, loyaltySettings);

  const earnRules = [
    { icon: <CalendarCheck size={18} color={COLORS.neon} />, text: `Your first booking starts with ${loyaltySettings.firstBookingBonus} points.` },
    { icon: <Zap size={18} color={COLORS.basketball} />, text: `After that, earn ${loyaltySettings.pointsPerBooking} points per booking plus ${loyaltySettings.completionBonus} when you show up and complete it.` },
    { icon: <Gift size={18} color={COLORS.success} />, text: `Complete ${GOOD_BOOKINGS_PER_FREE} sessions and your next court booking is free.` },
    { icon: <Star size={18} color={COLORS.warning} />, text: `No-shows subtract ${loyaltySettings.noShowPenalty} points. Climb tiers to unlock perks and rewards.` },
  ];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
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
          <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900' }}>Rewards</Text>
        </View>

        <Animated.View entering={FadeInDown.duration(400)}>
          <LoyaltyCard loyalty={loyalty} />
        </Animated.View>

        {/* Stats */}
        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={{ flexDirection: 'row', gap: 12 }}>
          <Stat label="Total points" value={String(loyalty.points)} accent={loyalty.tier.color} />
          <Stat label="Sessions" value={String(loyalty.sessions)} accent={COLORS.neon} />
          <Stat label="Tier" value={loyalty.tier.name} accent={loyalty.tier.color} />
        </Animated.View>

        {/* Free sessions reward */}
        <Animated.View entering={FadeInDown.delay(110).duration(400)} style={{ gap: 10 }}>
          <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '800' }}>Free Sessions</Text>
          <GlassCard accent={loyalty.availableFree > 0 ? COLORS.success : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: `${COLORS.success}26`,
                  }}
                >
                  <Gift size={24} color={COLORS.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 16 }}>
                    {loyalty.availableFree > 0
                      ? `${loyalty.availableFree} free session${loyalty.availableFree > 1 ? 's' : ''} ready 🎉`
                      : 'Earn a free booking'}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                    Every {GOOD_BOOKINGS_PER_FREE} completed sessions = 1 free court booking
                  </Text>
                </View>
              </View>
            </View>

            {/* Progress toward next free */}
            <View style={{ gap: 6, marginTop: 14 }}>
              <View style={{ height: 10, borderRadius: 999, backgroundColor: COLORS.chip, overflow: 'hidden', flexDirection: 'row' }}>
                <View style={{ width: `${Math.round(loyalty.freeProgress * 100)}%`, height: '100%', backgroundColor: COLORS.success, borderRadius: 999 }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  {loyalty.goodBookings % GOOD_BOOKINGS_PER_FREE} / {GOOD_BOOKINGS_PER_FREE} completed
                </Text>
                <Text style={{ color: COLORS.success, fontSize: 12, fontWeight: '700' }}>
                  {loyalty.toNextFree} to next free
                </Text>
              </View>
            </View>

            {loyalty.availableFree > 0 ? (
              <Pressable
                onPress={() => router.push('/(tabs)/book')}
                style={({ pressed }) => ({
                  marginTop: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: `${COLORS.success}1f`,
                  borderWidth: 1,
                  borderColor: `${COLORS.success}66`,
                  overflow: 'hidden',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Gift size={16} color={COLORS.success} />
                <Text style={{ color: COLORS.success, fontWeight: '800', fontSize: 14 }}>Redeem on a booking</Text>
              </Pressable>
            ) : null}
          </GlassCard>
        </Animated.View>

        {/* How to earn */}
        <Animated.View entering={FadeInDown.delay(140).duration(400)} style={{ gap: 10 }}>
          <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '800' }}>How you earn</Text>
          <GlassCard>
            <View style={{ gap: 14 }}>
              {earnRules.map((r, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {r.icon}
                  <Text style={{ color: COLORS.textMuted, fontSize: 13, flex: 1, lineHeight: 19 }}>{r.text}</Text>
                </View>
              ))}
            </View>
          </GlassCard>
        </Animated.View>

        {/* Points history */}
        <Animated.View entering={FadeInDown.delay(170).duration(400)} style={{ gap: 10 }}>
          <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '800' }}>Points History</Text>
          <GlassCard>
            {myTransactions.length === 0 ? (
              <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
                Point transactions will appear here after the loyalty ledger upgrade is run.
              </Text>
            ) : (
              <View style={{ gap: 12 }}>
                {myTransactions.slice(0, 20).map((tx) => (
                  <View key={tx.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 13 }}>{tx.description}</Text>
                      <Text style={{ color: COLORS.textFaint, fontSize: 11 }}>
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={{ color: tx.points >= 0 ? COLORS.success : COLORS.danger, fontWeight: '900', fontSize: 14 }}>
                      {tx.points >= 0 ? '+' : ''}{tx.points}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </GlassCard>
        </Animated.View>

        {/* Tier ladder */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={{ gap: 10 }}>
          <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '800' }}>Membership Tiers</Text>
          {TIERS.map((t, i) => {
            const reached = loyalty.points >= t.min;
            const current = loyalty.tier.key === t.key;
            return (
              <Animated.View key={t.key} entering={FadeInDown.delay(220 + i * 60).duration(350)}>
                <View
                  style={{
                    borderRadius: 22,
                    padding: 16,
                    backgroundColor: current ? `${t.color}1f` : COLORS.card,
                    borderWidth: current ? 1.5 : 1,
                    borderColor: current ? t.color : `${t.color}44`,
                    gap: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: `${t.color}33`,
                        }}
                      >
                        {reached ? <Gift size={20} color={t.color} /> : <Lock size={18} color={COLORS.textMuted} />}
                      </View>
                      <View>
                        <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 16 }}>{t.name}</Text>
                        <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{t.min}+ points</Text>
                      </View>
                    </View>
                    {current ? (
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 999,
                          backgroundColor: `${t.color}26`,
                          borderWidth: 1,
                          borderColor: `${t.color}66`,
                        }}
                      >
                        <Text style={{ color: t.color, fontWeight: '700', fontSize: 11 }}>Current</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ gap: 7 }}>
                    {tierPerks[t.key].map((p) => (
                      <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Check size={14} color={reached ? t.color : COLORS.textFaint} />
                        <Text style={{ color: reached ? COLORS.textMuted : COLORS.textFaint, fontSize: 13 }}>{p}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Animated.View>
            );
          })}
        </Animated.View>

        <Text style={{ color: COLORS.textFaint, fontSize: 12, textAlign: 'center' }}>
          Rewards are a demo preview — redemption opens with memberships.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 18,
        padding: 14,
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        gap: 4,
      }}
    >
      <Text style={{ color: accent, fontWeight: '900', fontSize: 18 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>{label}</Text>
    </View>
  );
}
