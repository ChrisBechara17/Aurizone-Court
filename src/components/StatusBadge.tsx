import { Text, View } from 'react-native';
import { BookingStatus } from '@/models';
import { COLORS } from '@/constants/colors';

const MAP: Record<BookingStatus, { label: string; color: string }> = {
  confirmed: { label: 'Confirmed', color: COLORS.success },
  cancelled: { label: 'Cancelled', color: COLORS.danger },
  completed: { label: 'Completed', color: COLORS.neon },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, color } = MAP[status];
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
