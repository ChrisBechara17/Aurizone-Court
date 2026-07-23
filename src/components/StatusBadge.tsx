import { Text, View } from 'react-native';
import { COLORS } from '@/constants/colors';
import { BookingDisplayState } from '@/utils/bookingLifecycle';

// U1: build the label/color map at render time. Capturing COLORS at module load
// froze the dark-theme values, so badges kept dark colors after a theme switch.
const LABELS: Record<BookingDisplayState, string> = {
  confirmed: 'Confirmed',
  awaiting_review: 'Awaiting review',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No-show',
};

export function StatusBadge({ status }: { status: BookingDisplayState }) {
  const colorFor: Record<BookingDisplayState, string> = {
    confirmed: COLORS.success,
    awaiting_review: COLORS.warning,
    cancelled: COLORS.danger,
    completed: COLORS.neon,
    no_show: COLORS.danger,
  };
  const label = LABELS[status];
  const color = colorFor[status];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: `${color}22`,
        borderWidth: 1,
        borderColor: `${color}55`,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: color }} />
      <Text style={{ color, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </View>
  );
}
