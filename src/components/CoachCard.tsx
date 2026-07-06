import { Linking, Pressable, Text, View } from 'react-native';
import { Pencil, Phone, Star } from 'lucide-react-native';
import { Coach } from '@/models';
import { COLORS, sportAccent, sportLabel } from '@/constants/colors';

interface Props {
  coach: Coach;
  /** Admin remove handler — shows admin controls instead of "Call". */
  onRemove?: (id: string) => void;
  /** Admin edit handler — shows an "Edit" button. */
  onEdit?: (id: string) => void;
}

export function CoachCard({ coach, onRemove, onEdit }: Props) {
  const sportsText = coach.supportedSports.map(sportLabel).join(' & ');
  const primaryAccent = sportAccent(coach.supportedSports[0]);
  const initials = coach.name.replace('Coach ', '').slice(0, 1);

  const call = () => {
    const digits = coach.phone.replace(/[^\d+]/g, '');
    void Linking.openURL(`tel:${digits}`);
  };

  return (
    <View
      style={{
        borderRadius: 22,
        padding: 16,
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${COLORS.coach}33`,
          }}
        >
          <Text style={{ color: COLORS.coach, fontWeight: '800', fontSize: 20 }}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 16 }}>{coach.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Text style={{ color: primaryAccent, fontSize: 12, fontWeight: '700' }}>{sportsText}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Star size={12} color={COLORS.warning} fill={COLORS.warning} />
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{coach.rating.toFixed(1)}</Text>
            </View>
          </View>
        </View>
        <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 15 }}>
          ${coach.pricePerHour}
          <Text style={{ color: COLORS.textMuted, fontWeight: '500', fontSize: 12 }}>/hr</Text>
        </Text>
      </View>

      <Text style={{ color: COLORS.textMuted, fontSize: 13, lineHeight: 18 }}>{coach.bio}</Text>

      {/* Contact */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: COLORS.cardBorder,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Phone size={15} color={COLORS.coach} />
          <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '600' }}>{coach.phone}</Text>
        </View>

        {onRemove || onEdit ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {onEdit ? (
              <Pressable
                onPress={() => onEdit(coach.id)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 12,
                  overflow: 'hidden',
                  backgroundColor: pressed ? `${COLORS.coach}3d` : `${COLORS.coach}24`,
                })}
              >
                <Pencil size={13} color={COLORS.coach} />
                <Text style={{ color: COLORS.coach, fontWeight: '700', fontSize: 13 }}>Edit</Text>
              </Pressable>
            ) : null}
            {onRemove ? (
              <Pressable
                onPress={() => onRemove(coach.id)}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 12,
                  overflow: 'hidden',
                  backgroundColor: pressed ? `${COLORS.danger}3d` : `${COLORS.danger}24`,
                })}
              >
                <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 13 }}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Pressable
            onPress={call}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 16,
              paddingVertical: 9,
              borderRadius: 12,
              overflow: 'hidden',
              backgroundColor: pressed ? `${COLORS.coach}45` : `${COLORS.coach}2e`,
            })}
          >
            <Phone size={14} color={COLORS.coach} />
            <Text style={{ color: COLORS.coach, fontWeight: '800', fontSize: 13 }}>Call</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
