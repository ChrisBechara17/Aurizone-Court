import { Pressable, Text, View } from 'react-native';
import { SportIcon } from '@/components/icons/SportIcon';
import { SportType } from '@/models';
import { COLORS, sportAccent } from '@/constants/colors';
import { getSportPrice } from '@/constants/prices';

interface Props {
  sport: SportType;
  selected: boolean;
  onPress: () => void;
}

/** Toggle card for choosing Basketball / Tennis. Meant to sit in a flex row. */
export function SportModeCard({ sport, selected, onPress }: Props) {
  const accent = sportAccent(sport);
  const title = sport === 'basketball' ? 'Basketball' : 'Tennis';
  const mode = sport === 'basketball' ? 'Basketball Mode' : 'Tennis Mode';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 22,
          padding: 16,
          backgroundColor: selected ? `${accent}1f` : COLORS.card,
          borderWidth: 1.5,
          borderColor: selected ? accent : COLORS.cardBorder,
          gap: 10,
        }}
      >
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
        <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 17 }}>{title}</Text>
        <Text style={{ color: accent, fontWeight: '700', fontSize: 13 }}>${getSportPrice(sport)}/hr</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>{mode}</Text>
      </View>
    </Pressable>
  );
}
