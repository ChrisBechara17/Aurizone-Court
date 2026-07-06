import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronRight, Users } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';
import { computeLoyalty } from '@/utils/loyalty';
import { computeStanding } from '@/utils/accountStanding';
import { bookingsFor } from '@/utils/adminUsers';
import { parseISO } from 'date-fns';

export default function AdminUsersScreen() {
  const ADMIN = COLORS.warning; // read live so it follows the active theme
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const roster = useAppStore((s) => s.users);
  const bookings = useAppStore((s) => s.bookings);

  if (!user?.isAdmin) return <Redirect href="/(tabs)/profile" />;

  return (
    <ScreenContainer>
      <LinearGradient
        colors={[`${ADMIN}33`, 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }}
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }} showsVerticalScrollIndicator={false}>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Users size={22} color={ADMIN} />
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '900' }}>Users ({roster.length})</Text>
          </View>
        </View>

        {roster.map((u, i) => {
          const ub = bookingsFor(bookings, u.id);
          const loyalty = computeLoyalty(ub);
          const standing = computeStanding(ub);
          const upcoming = ub.filter(
            (b) => b.status === 'confirmed' && parseISO(b.endTime).getTime() > Date.now(),
          ).length;
          const initials = u.name
            .split(' ')
            .map((w) => w[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();

          return (
            <Animated.View key={u.id} entering={FadeInDown.delay(i * 50).duration(300)}>
              <Pressable
                onPress={() => router.push(`/admin-user?id=${u.id}`)}
                style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.99 : 1 }] })}
              >
                <View
                  style={{
                    borderRadius: 20,
                    padding: 16,
                    backgroundColor: COLORS.card,
                    borderWidth: 1,
                    borderColor: standing.disabled ? `${COLORS.danger}66` : COLORS.cardBorder,
                    gap: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: `${loyalty.tier.color}33`,
                      }}
                    >
                      <Text style={{ color: loyalty.tier.color, fontWeight: '800', fontSize: 18 }}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 16 }}>{u.name}</Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{u.phoneOrEmail}</Text>
                    </View>
                    <ChevronRight size={20} color={COLORS.textMuted} />
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: COLORS.cardBorder,
                    }}
                  >
                    {/* Tier + points */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: loyalty.tier.color }} />
                      <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '700' }}>
                        {loyalty.tier.name} · {loyalty.points} pts
                      </Text>
                    </View>

                    {/* Upcoming */}
                    <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{upcoming} upcoming</Text>

                    {/* Black dots */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {Array.from({ length: standing.maxStrikes }, (_, k) => {
                        const filled = k < standing.strikes;
                        return (
                          <View
                            key={k}
                            style={{
                              width: 12,
                              height: 12,
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
                    <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: '700' }}>
                      ⚠ Disabled — 3 no-shows
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}
