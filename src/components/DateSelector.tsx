import { Pressable, ScrollView, Text, View } from 'react-native';
import { addDays } from 'date-fns';
import { COLORS } from '@/constants/colors';
import { fmtDayName, fmtDayNum, fmtMonth, isSameDay, startOfDay } from '@/utils/dateUtils';

interface Props {
  value: Date;
  onChange: (d: Date) => void;
  accent?: string;
  days?: number;
  /** Offset (in days) of the first day shown, relative to today. e.g. -2 shows 2 past days. */
  startOffsetDays?: number;
}

export function DateSelector({
  value,
  onChange,
  accent = COLORS.neon,
  days = 14,
  startOffsetDays = 0,
}: Props) {
  const today = startOfDay(new Date());
  const start = addDays(today, startOffsetDays);
  const list = Array.from({ length: days }, (_, i) => addDays(start, i));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
      {list.map((d, i) => {
        const active = isSameDay(d, value);
        const isToday = isSameDay(d, today);
        return (
          <Pressable key={i} onPress={() => onChange(d)}>
            <View
              style={{
                width: 62,
                paddingVertical: 12,
                borderRadius: 18,
                alignItems: 'center',
                gap: 3,
                backgroundColor: active ? `${accent}26` : COLORS.card,
                borderWidth: 1.5,
                borderColor: active ? accent : COLORS.cardBorder,
              }}
            >
              <Text style={{ color: active ? accent : COLORS.textMuted, fontSize: 11, fontWeight: '700' }}>
                {isToday ? 'Today' : fmtDayName(d)}
              </Text>
              <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '800' }}>{fmtDayNum(d)}</Text>
              <Text style={{ color: COLORS.textFaint, fontSize: 10 }}>{fmtMonth(d)}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
