import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Info, Users } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { CoachCard } from '@/components/CoachCard';
import { EmptyState } from '@/components/EmptyState';
import { COLORS } from '@/constants/colors';
import { SportType } from '@/models';
import { useAppStore } from '@/store/useAppStore';

type Filter = 'all' | SportType;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'basketball', label: 'Basketball' },
  { key: 'tennis', label: 'Tennis' },
];

export default function CoachesScreen() {
  const coaches = useAppStore((s) => s.coaches);
  const [filter, setFilter] = useState<Filter>('all');

  const active = coaches.filter((c) => c.isActive);
  const list = filter === 'all' ? active : active.filter((c) => c.supportedSports.includes(filter));

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 18 }} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: '900' }}>Our Coaches</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>
            Private coaching at the Main Court
          </Text>
        </View>

        {/* Info note */}
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            alignItems: 'flex-start',
            backgroundColor: `${COLORS.coach}14`,
            borderColor: `${COLORS.coach}44`,
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
          }}
        >
          <Info size={18} color={COLORS.coach} />
          <Text style={{ color: COLORS.text, flex: 1, fontSize: 13, lineHeight: 19 }}>
            Contact a coach directly by phone to arrange a private session. Booking is handled
            between you and the coach.
          </Text>
        </View>

        {/* Sport filter */}
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
            const isActive = filter === f.key;
            return (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} style={{ flex: 1 }}>
                <View
                  style={{
                    paddingVertical: 10,
                    borderRadius: 12,
                    alignItems: 'center',
                    backgroundColor: isActive ? `${COLORS.coach}26` : 'transparent',
                  }}
                >
                  <Text style={{ color: isActive ? COLORS.coach : COLORS.textMuted, fontWeight: '700', fontSize: 13 }}>
                    {f.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Coach list */}
        {list.length === 0 ? (
          <EmptyState
            icon={<Users size={28} color={COLORS.coach} />}
            title="No coaches yet"
            subtitle="Check back soon — our team is adding coaches."
          />
        ) : (
          list.map((c, i) => (
            <Animated.View key={c.id} entering={FadeInDown.delay(i * 60).duration(350)}>
              <CoachCard coach={c} />
            </Animated.View>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
