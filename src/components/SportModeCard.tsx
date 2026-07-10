import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { SportIcon } from '@/components/icons/SportIcon';
import { SportType } from '@/models';
import { COLORS, sportAccent } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';

interface Props {
  sport: SportType;
  selected: boolean;
  onPress: () => void;
}

/** Full-width row for choosing Basketball / Tennis. */
export function SportModeCard({ sport, selected, onPress }: Props) {
  const accent = sportAccent(sport);
  const title = sport === 'basketball' ? 'Basketball' : 'Tennis';
  const mode = sport === 'basketball' ? 'Basketball Mode' : 'Tennis Mode';
  // S2: use the live admin-set rate from the store, not a hardcoded constant,
  // so the card can't disagree with the price summary after a pricing edit.
  const pricing = useAppStore((s) => s.pricing);
  const offPeak = sport === 'basketball' ? pricing.basketball : pricing.tennis;
  const peak = sport === 'basketball' ? pricing.basketballPeak : pricing.tennisPeak;
  // Show a range when peak differs (peak = bookings starting from 4 PM).
  const priceText = peak > offPeak ? `$${offPeak}–${peak}/hr` : `$${offPeak}/hr`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: '100%',
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 22,
          padding: 16,
          backgroundColor: selected ? `${accent}1f` : COLORS.card,
          borderWidth: 1.5,
          borderColor: selected ? accent : COLORS.cardBorder,
          minHeight: 84,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${accent}26`,
            }}
          >
            <SportIcon sport={sport} size={24} color={accent} />
          </View>
          <View style={{ minWidth: 0 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: COLORS.text, fontWeight: '800', fontSize: 17 }}>
              {title}
            </Text>
            {/* U7: cap to one line so the price never clips on Android. */}
            <Text numberOfLines={1} style={{ color: accent, fontWeight: '700', fontSize: 13 }}>{priceText}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: COLORS.textMuted, fontSize: 11 }}>
              {mode}
            </Text>
          </View>
        </View>
        <ChevronRight size={22} color={selected ? accent : COLORS.textMuted} />
      </View>
    </Pressable>
  );
}
