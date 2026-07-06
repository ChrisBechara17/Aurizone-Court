import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';

interface Props {
  value: boolean;
  onValueChange: (v: boolean) => void;
  /** Track color when on. */
  activeColor?: string;
  disabled?: boolean;
}

const TRACK_W = 48;
const TRACK_H = 28;
const THUMB = 22;
const PAD = 3;

/**
 * Smooth iOS-style switch. Built on Pressable (not RN's Switch) specifically so
 * there's NO Android ripple halo around it — the thumb just slides.
 */
export function Toggle({ value, onValueChange, activeColor = COLORS.neon, disabled }: Props) {
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(value ? TRACK_W - THUMB - PAD * 2 : 0, { duration: 160 }) }],
  }));

  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      hitSlop={8}
      style={{
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: 999,
        padding: PAD,
        justifyContent: 'center',
        backgroundColor: value ? activeColor : COLORS.cardBorder,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Animated.View
        style={[
          thumbStyle,
          {
            width: THUMB,
            height: THUMB,
            borderRadius: 999,
            backgroundColor: '#fff',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          },
        ]}
      />
    </Pressable>
  );
}
