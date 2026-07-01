import { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { PrimaryGradientButton } from './PrimaryGradientButton';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  children?: ReactNode;
  confirmLabel?: string;
  onClose: () => void;
  accent?: string;
}

/** Polished success / confirmation modal. */
export function ConfirmationModal({
  visible,
  title,
  message,
  children,
  confirmLabel = 'Done',
  onClose,
  accent = COLORS.success,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: COLORS.bg700,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: `${accent}55`,
            padding: 24,
            gap: 14,
          }}
        >
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${accent}22`,
                borderWidth: 1,
                borderColor: `${accent}55`,
              }}
            >
              <CheckCircle2 size={34} color={accent} />
            </View>
            <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
            {message ? (
              <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>{message}</Text>
            ) : null}
          </View>

          {children}

          <PrimaryGradientButton label={confirmLabel} onPress={onClose} colors={[accent, accent]} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
