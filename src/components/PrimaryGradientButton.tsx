import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/constants/colors';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  colors?: readonly [string, string, ...string[]];
}

export function PrimaryGradientButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  colors = [COLORS.neon, '#4f7bff'],
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        opacity: disabled ? 0.45 : pressed ? 0.88 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 18,
          paddingVertical: 16,
          paddingHorizontal: 20,
          shadowColor: colors[0],
          shadowOpacity: 0.5,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {loading ? (
            <ActivityIndicator color="#05060f" />
          ) : (
            <>
              {icon}
              <Text style={{ color: '#05060f', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 }}>
                {label}
              </Text>
            </>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}
