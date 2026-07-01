import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { COLORS } from '@/constants/colors';

interface Props {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: Props) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: COLORS.card,
          borderWidth: 1,
          borderColor: COLORS.cardBorder,
        }}
      >
        {icon}
      </View>
      <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 19 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
