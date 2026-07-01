import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { format, parse } from 'date-fns';
import { Moon, Sun, Sunrise } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { timeSlots } from '@/utils/dateUtils';

interface Props {
  value: string; // "HH:mm"
  onChange: (t: string) => void;
  accent?: string;
  /** times that should appear disabled (already booked / past closing). "HH:mm" */
  unavailable?: string[];
}

type PeriodKey = 'morning' | 'afternoon' | 'evening';

const PERIODS: { key: PeriodKey; label: string; icon: typeof Sun }[] = [
  { key: 'morning', label: 'Morning', icon: Sunrise },
  { key: 'afternoon', label: 'Afternoon', icon: Sun },
  { key: 'evening', label: 'Evening', icon: Moon },
];

const periodOf = (t: string): PeriodKey => {
  const h = Number(t.split(':')[0]);
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
};

const pretty = (t: string) => format(parse(t, 'HH:mm', new Date()), 'h:mm a');

export function TimeSlotPicker({ value, onChange, accent = COLORS.neon, unavailable = [] }: Props) {
  const allSlots = useMemo(() => timeSlots(), []);
  const [period, setPeriod] = useState<PeriodKey>(periodOf(value));

  // Follow the selected value into its period (e.g. when parent resets time).
  useEffect(() => {
    setPeriod(periodOf(value));
  }, [value]);

  const slots = allSlots.filter((t) => periodOf(t) === period);

  // Free-slot count per period for the little badges.
  const freeCount = (p: PeriodKey) =>
    allSlots.filter((t) => periodOf(t) === p && !unavailable.includes(t)).length;

  return (
    <View style={{ gap: 14 }}>
      {/* Period segmented control */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderRadius: 20,
          borderWidth: 1,
          borderColor: COLORS.cardBorder,
          padding: 6,
          gap: 8,
        }}
      >
        {PERIODS.map((p) => {
          const active = period === p.key;
          const Icon = p.icon;
          const free = freeCount(p.key);
          return (
            <Pressable key={p.key} onPress={() => setPeriod(p.key)} style={{ flex: 1 }}>
              <View
                style={{
                  paddingVertical: 12,
                  borderRadius: 16,
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: active ? `${accent}2e` : 'transparent',
                  borderWidth: 1.5,
                  borderColor: active ? accent : 'transparent',
                  shadowColor: active ? accent : 'transparent',
                  shadowOpacity: active ? 0.45 : 0,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                }}
              >
                <Icon size={18} color={active ? accent : COLORS.textMuted} />
                <Text style={{ color: active ? accent : COLORS.textMuted, fontWeight: '800', fontSize: 12 }}>
                  {p.label}
                </Text>
                <Text style={{ color: active ? accent : COLORS.textFaint, fontSize: 10, fontWeight: '600' }}>
                  {free > 0 ? `${free} free` : 'full'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Slots for the active period */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {slots.map((t) => {
          const active = t === value;
          const disabled = unavailable.includes(t);
          return (
            <Pressable
              key={t}
              onPress={() => !disabled && onChange(t)}
              disabled={disabled}
              style={{ flexGrow: 1, flexBasis: '28%' }}
            >
              <View
                style={{
                  paddingVertical: 12,
                  borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: active ? `${accent}26` : COLORS.card,
                  borderWidth: 1.5,
                  borderColor: active ? accent : COLORS.cardBorder,
                  opacity: disabled ? 0.3 : 1,
                }}
              >
                <Text
                  style={{
                    color: active ? accent : COLORS.text,
                    fontWeight: active ? '800' : '600',
                    fontSize: 13,
                    textDecorationLine: disabled ? 'line-through' : 'none',
                  }}
                >
                  {pretty(t)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
