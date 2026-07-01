import { Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        backgroundColor: `${COLORS.danger}1a`,
        borderColor: `${COLORS.danger}55`,
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
      }}
    >
      <AlertTriangle size={18} color={COLORS.danger} />
      <Text style={{ color: COLORS.text, flex: 1, fontSize: 13, lineHeight: 18 }}>{message}</Text>
    </View>
  );
}
