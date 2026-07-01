import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Gift, Sparkles } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { LoyaltyState } from '@/utils/loyalty';

interface Props {
  loyalty: LoyaltyState;
  onPress?: () => void;
}

/** Compact CourtHub Rewards summary used on Home and Profile. */
export function LoyaltyCard({ loyalty, onPress }: Props) {
  const { points, tier, nextTier, pointsToNext, progress } = loyalty;
  const accent = tier.color;

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ transform: [{ scale: pressed && onPress ? 0.99 : 1 }] })}>
      <LinearGradient
        colors={[`${accent}2e`, 'rgba(255,255,255,0.04)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 24,
          padding: 18,
          borderWidth: 1,
          borderColor: `${accent}66`,
          gap: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${accent}33`,
              }}
            >
              <Sparkles size={22} color={accent} />
            </View>
            <View>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>CourtHub Rewards</Text>
              <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 17 }}>{tier.name} Member</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: accent, fontWeight: '900', fontSize: 22 }}>{points}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>points</Text>
          </View>
        </View>

        {/* Progress */}
        <View style={{ gap: 6 }}>
          <View style={{ height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: accent, borderRadius: 999 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {nextTier ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Gift size={13} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  {pointsToNext} pts to {nextTier.name}
                </Text>
              </View>
            ) : (
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Top tier unlocked 🎉</Text>
            )}
            {onPress ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>View rewards</Text>
                <ChevronRight size={14} color={accent} />
              </View>
            ) : null}
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
