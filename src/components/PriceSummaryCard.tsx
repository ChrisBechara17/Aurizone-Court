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

/**
 * Booking summary card.
 *
 * Layout note: each row is two *flexible* columns (label + value), NOT a
 * content-sized label next to a flex value. On Android a <Text> sized to its
 * exact measured width gets its last glyph clipped ("Sport" -> "Spor"), so we
 * give the label column real width (flex) — its box is always wider than the
 * text, which eliminates the trailing-glyph clip entirely.
 */
export function PriceSummaryCard({ rows, total, accent = COLORS.neon }: Props) {
  return (
    <GlassCard accent={accent}>
      <Text
        style={{
          color: COLORS.textMuted,
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 14,
        }}
      >
        Booking Summary
      </Text>

      <View style={{ gap: 12 }}>
        {rows.map((r) => (
          <View
            key={r.label}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            {/* Label column — flexible & left-aligned so the box is always
                wider than the text (prevents Android trailing-glyph clip). */}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                flex: 1,
                color: COLORS.textMuted,
                fontSize: 13,
                paddingRight: 12,
              }}
            >
              {r.label}
            </Text>

            {/* Value column — flexible & right-aligned. */}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                flex: 1,
                color: r.highlight ? accent : COLORS.text,
                fontSize: 14,
                fontWeight: '700',
                textAlign: 'right',
              }}
            >
              {r.value}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={{
          height: 1,
          backgroundColor: COLORS.cardBorder,
          marginVertical: 16,
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '700', paddingRight: 12 }}
        >
          Total (display only)
        </Text>
        <Text
          numberOfLines={1}
          style={{ flex: 1, color: accent, fontSize: 22, fontWeight: '900', textAlign: 'right' }}
        >
          {total}
        </Text>
      </View>
    </GlassCard>
  );
}
