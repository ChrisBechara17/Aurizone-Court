import { Pressable, Text, View } from 'react-native';
import { COLORS } from '@/constants/colors';
import { ALLOWED_DURATIONS } from '@/constants/prices';
import { formatDuration } from '@/utils/dateUtils';

interface Props {
  value: number; // hours
  onChange: (h: number) => void;
  accent?: string;
}

export function DurationSelector({ value, onChange, accent = COLORS.neon }: Props) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {ALLOWED_DURATIONS.map((h) => {
        const active = h === value;
        return (
          <Pressable key={h} onPress={() => onChange(h)} style={{ flexGrow: 1, flexBasis: '22%' }}>
            <View
              style={{
                paddingVertical: 14,
                borderRadius: 16,
                alignItems: 'center',
                backgroundColor: active ? `${accent}26` : COLORS.card,
                borderWidth: 1.5,
                borderColor: active ? accent : COLORS.cardBorder,
              }}
            >
              <Text style={{ color: active ? accent : COLORS.text, fontWeight: '800', fontSize: 14 }}>
                {formatDuration(h)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
