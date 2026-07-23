import { ActivityIndicator, Text, View } from 'react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { COLORS } from '@/constants/colors';

export function AdminMfaGateLoading() {
  return (
    <ScreenContainer>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={COLORS.neon} />
        <Text style={{ color: COLORS.textMuted, fontWeight: '700' }}>
          Verifying admin access…
        </Text>
      </View>
    </ScreenContainer>
  );
}
