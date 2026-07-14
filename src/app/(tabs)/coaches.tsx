import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Info, Users } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { CoachCard } from '@/components/CoachCard';
import { EmptyState } from '@/components/EmptyState';
import { COLORS, sportAccent } from '@/constants/colors';
import { SportType } from '@/models';
import { useAppStore, useThemeName } from '@/store/useAppStore';
import { useBottomNavigationMetrics } from '@/hooks/useBottomNavigationMetrics';

type Filter = 'all' | SportType;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'tennis', label: 'Tennis' },
  { key: 'basketball', label: 'Basketball' },
];

export default function CoachesScreen() {
  useThemeName();
  const { contentBottomPadding } = useBottomNavigationMetrics();
  const coaches = useAppStore((s) => s.coaches);
  const [filter, setFilter] = useState<Filter>('all');

  const active = coaches.filter((c) => c.isActive);
  const list = filter === 'all' ? active : active.filter((c) => c.supportedSports.includes(filter));

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: contentBottomPadding, gap: 18 }} showsVerticalScrollIndicator={false}>
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
            borderRadius: 18,
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
            backgroundColor: COLORS.chip,
            borderRadius: 16,
            padding: 5,
            gap: 5,
            borderWidth: 1,
            borderColor: COLORS.cardBorder,
          }}
        >
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            const accent = f.key === 'all' ? COLORS.coach : sportAccent(f.key);
            return (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} style={{ flex: 1 }}>
                <View
                  style={{
                    paddingVertical: 10,
                    borderRadius: 14,
                    alignItems: 'center',
                    backgroundColor: isActive ? `${accent}26` : 'transparent',
                    borderWidth: 1.5,
                    borderColor: isActive ? `${accent}99` : 'transparent',
                  }}
                >
                  <Text style={{ color: isActive ? accent : COLORS.textMuted, fontWeight: isActive ? '800' : '700', fontSize: 13 }}>
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
              <CoachCard coach={c} highlightSport={filter === 'all' ? undefined : filter} />
            </Animated.View>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
