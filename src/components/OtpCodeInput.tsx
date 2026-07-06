import { useEffect, useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { COLORS } from '@/constants/colors';

interface Props {
  value: string;
  onChange: (code: string) => void;
  /** Fired once the code reaches `length` digits — handy for auto-submit. */
  onComplete?: (code: string) => void;
  length?: number;
  autoFocus?: boolean;
  accent?: string;
  editable?: boolean;
}

/**
 * Segmented 6-digit code entry. A single hidden TextInput holds the real value
 * (so OS one-time-code autofill and the number pad work); the visible boxes are
 * just a display of that value. Tapping anywhere focuses the hidden input.
 */
export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  autoFocus = true,
  accent = COLORS.neon,
  editable = true,
}: Props) {
  const ref = useRef<TextInput>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => ref.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [autoFocus]);

  const handleChange = (text: string) => {
    const clean = text.replace(/[^0-9]/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  return (
    <Pressable
      onPress={() => editable && ref.current?.focus()}
      style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}
    >
      {Array.from({ length }).map((_, i) => {
        const filled = i < value.length;
        const active = editable && i === value.length;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              aspectRatio: 0.82,
              maxWidth: 56,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.chip,
              borderWidth: 1.5,
              borderColor: active ? accent : filled ? `${accent}66` : COLORS.cardBorder,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '800' }}>
              {value[i] ?? ''}
            </Text>
          </View>
        );
      })}

      <TextInput
        ref={ref}
        value={value}
        onChangeText={handleChange}
        editable={editable}
        keyboardType="number-pad"
        maxLength={length}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        caretHidden
        style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0 }}
      />
    </Pressable>
  );
}
