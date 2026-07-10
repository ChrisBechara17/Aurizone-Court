import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { EmptyState } from '@/components/EmptyState';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';
import { computeLoyalty, computeLoyaltyFromTransactions } from '@/utils/loyalty';
import { computeStanding } from '@/utils/accountStanding';
import { bookingsFor } from '@/utils/adminUsers';
import { parseISO } from 'date-fns';

/**
 * Admin customer roster. Each row summarises a user's tier, points, upcoming
 * count and no-show strikes, and taps through to their full profile (all
 * bookings + loyalty) at /admin-user. Shared by the admin Users tab and the
 * standalone /admin-users screen so both stay in sync.
 */
export function UserRosterList({ search = '' }: { search?: string }) {
  const router = useRouter();
  const roster = useAppStore((s) => s.users);
  const bookings = useAppStore((s) => s.bookings);
  const loyaltySettings = useAppStore((s) => s.loyaltySettings);
  const loyaltyTransactions = useAppStore((s) => s.loyaltyTransactions);
  const q = search.trim().toLowerCase();
  const rows = roster.filter((u) => {
    if (!q) return true;
    const ub = bookingsFor(bookings, u.id);
    const txs = loyaltyTransactions.filter((tx) => tx.userId === u.id);
    const loyalty = txs.length > 0 ? computeLoyaltyFromTransactions(txs, ub) : computeLoyalty(ub, loyaltySettings);
    return `${u.name} ${u.phoneOrEmail} ${loyalty.tier.name}`.toLowerCase().includes(q);
  });

  if (roster.length === 0) {
    return <EmptyState title="No users yet" subtitle="Customers appear here once they sign up." />;
  }
  if (rows.length === 0) {
    return <EmptyState title="No matching users" subtitle="Clear the search or try another name or phone." />;
  }

  return (
    <View style={{ gap: 14 }}>
      {rows.map((u, i) => {
        const ub = bookingsFor(bookings, u.id);
        const txs = loyaltyTransactions.filter((tx) => tx.userId === u.id);
        const loyalty = txs.length > 0 ? computeLoyaltyFromTransactions(txs, ub) : computeLoyalty(ub, loyaltySettings);
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
          <Animated.View key={u.id} entering={FadeInDown.delay(i * 40).duration(300)}>
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
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: '800', fontSize: 16 }}>{u.name}</Text>
                    <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 12 }}>{u.phoneOrEmail}</Text>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: loyalty.tier.color }} />
                    <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: 12, fontWeight: '700' }}>
                      {loyalty.tier.name} · {loyalty.points} pts
                    </Text>
                  </View>

                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{upcoming} upcoming</Text>

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
                            backgroundColor: filled ? COLORS.danger : 'transparent',
                            borderWidth: 1.5,
                            borderColor: filled ? COLORS.danger : COLORS.cardBorder,
                          }}
                        />
                      );
                    })}
                  </View>
                </View>

                {standing.disabled ? (
                  <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: '700' }}>⚠ Disabled — 3 no-shows</Text>
                ) : null}
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}
