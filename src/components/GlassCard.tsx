import { ReactNode } from 'react';
import { View, ViewProps } from 'react-native';
import { COLORS } from '@/constants/colors';

interface GlassCardProps extends ViewProps {
  children: ReactNode;
  /** Optional accent color for a subtle top border glow. */
  accent?: string;
  padded?: boolean;
}

/** Glassmorphism surface: translucent fill, hairline border, soft shadow. */
export function GlassCard({
  children,
  accent,
  padded = true,
  style,
  ...rest
}: GlassCardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: COLORS.card,
          borderColor: accent ? `${accent}55` : COLORS.cardBorder,
          borderWidth: 1,
          borderRadius: 24,
          padding: padded ? 18 : 0,
          shadowColor: accent ?? '#000',
          shadowOpacity: 0.25,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
