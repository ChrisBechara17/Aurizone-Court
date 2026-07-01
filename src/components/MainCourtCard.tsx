import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Zap } from 'lucide-react-native';
import { SportType } from '@/models';
import { COLORS, sportAccent } from '@/constants/colors';

interface Props {
  activeSport?: SportType;
}

/** Hero card representing the single shared physical court. */
export function MainCourtCard({ activeSport }: Props) {
  const accent = activeSport ? sportAccent(activeSport) : COLORS.neon;
  return (
    <LinearGradient
      colors={[`${accent}26`, 'rgba(255,255,255,0.04)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 24,
        padding: 18,
        borderWidth: 1,
        borderColor: `${accent}55`,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${accent}33`,
            }}
          >
            <Zap size={22} color={accent} />
          </View>
          <View>
            <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 18 }}>Main Court</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Shared Court · Basketball + Tennis</Text>
          </View>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: `${COLORS.success}22`,
            borderWidth: 1,
            borderColor: `${COLORS.success}55`,
          }}
        >
          <Text style={{ color: COLORS.success, fontWeight: '700', fontSize: 11 }}>Active</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <MapPin size={14} color={COLORS.textMuted} />
        <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>One location · One physical court</Text>
      </View>
    </LinearGradient>
  );
}
