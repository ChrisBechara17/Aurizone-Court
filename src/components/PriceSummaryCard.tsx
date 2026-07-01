import { Text, View } from 'react-native';
import { GlassCard } from './GlassCard';
import { COLORS } from '@/constants/colors';

export interface SummaryRow {
  label: string;
  value: string;
  highlight?: boolean;
}

interface Props {
  rows: SummaryRow[];
  total: string;
  accent?: string;
}

export function PriceSummaryCard({ rows, total, accent = COLORS.neon }: Props) {
  return (
    <GlassCard accent={accent}>
      <Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
        Booking Summary
      </Text>
      <View style={{ gap: 10 }}>
        {rows.map((r) => (
          <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{r.label}</Text>
            <Text style={{ color: r.highlight ? accent : COLORS.text, fontSize: 14, fontWeight: '700', maxWidth: '60%', textAlign: 'right' }}>
              {r.value}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ height: 1, backgroundColor: COLORS.cardBorder, marginVertical: 14 }} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700' }}>Total (display only)</Text>
        <Text style={{ color: accent, fontSize: 22, fontWeight: '900' }}>{total}</Text>
      </View>
    </GlassCard>
  );
}
