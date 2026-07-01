import { Pressable, Text, View } from 'react-native';
import { Calendar, Clock, MapPin, Repeat, Rocket, UserX, X } from 'lucide-react-native';
import { Booking } from '@/models';
import { COLORS, sportAccent, sportLabel } from '@/constants/colors';
import { fmtDate, fmtTime, formatDuration } from '@/utils/dateUtils';
import { hasStarted } from '@/utils/accountStanding';
import { GlassCard } from './GlassCard';
import { StatusBadge } from './StatusBadge';
import { COACHES } from '@/data/seedData';

interface Props {
  booking: Booking;
  onCancel?: (id: string) => void;
  /** Muted note shown instead of the cancel button (e.g. within cutoff). */
  cancelNote?: string;
  /** Admin: toggle the no-show flag on a started booking. */
  onToggleNoShow?: (id: string) => void;
}

const coachName = (id: string | null) => COACHES.find((c) => c.id === id)?.name ?? 'Coach';

export function BookingCard({ booking, onCancel, cancelNote, onToggleNoShow }: Props) {
  const accent = sportAccent(booking.sportType);
  const isCoach = booking.bookingType === 'coach';
  const canCancel = booking.status === 'confirmed' && !!onCancel;
  const showNoShowToggle = !!onToggleNoShow && booking.status !== 'cancelled' && hasStarted(booking);
  const durH = booking.durationMinutes / 60;

  return (
    <GlassCard accent={booking.status === 'cancelled' ? COLORS.danger : accent}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: isCoach ? `${COLORS.coach}26` : `${accent}26`,
            }}
          >
            <Text style={{ color: isCoach ? COLORS.coach : accent, fontWeight: '800', fontSize: 11 }}>
              {isCoach ? 'COACH' : 'COURT'}
            </Text>
          </View>
          <Text style={{ color: accent, fontWeight: '700', fontSize: 13 }}>{sportLabel(booking.sportType)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {booking.noShow ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: '#000',
                borderWidth: 1,
                borderColor: COLORS.textFaint,
              }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#000', borderWidth: 1, borderColor: COLORS.text }} />
              <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 11 }}>No-show</Text>
            </View>
          ) : null}
          <StatusBadge status={booking.status} />
        </View>
      </View>

      <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 17, marginTop: 10 }}>
        {isCoach ? coachName(booking.coachId) : 'Main Court'}
      </Text>

      <View style={{ gap: 8, marginTop: 12 }}>
        <Row icon={<Calendar size={14} color={COLORS.textMuted} />} text={fmtDate(booking.startTime)} />
        <Row
          icon={<Clock size={14} color={COLORS.textMuted} />}
          text={`${fmtTime(booking.startTime)} – ${fmtTime(booking.endTime)} · ${formatDuration(durH)}`}
        />
        {isCoach ? (
          <Row
            icon={<MapPin size={14} color={COLORS.textMuted} />}
            text={booking.usesMainCourt ? 'Uses Main Court' : 'No court'}
          />
        ) : null}
        {booking.ballMachine ? (
          <Row icon={<Rocket size={14} color={COLORS.tennis} />} text="Ball machine included" />
        ) : null}
        {booking.isRecurring ? (
          <Row icon={<Repeat size={14} color={COLORS.neon} />} text="Repeats weekly" />
        ) : null}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 14,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: COLORS.cardBorder,
        }}
      >
        {booking.isFreeReward ? (
          <Text style={{ color: COLORS.success, fontWeight: '800', fontSize: 16 }}>
            Free 🎁
            <Text style={{ color: COLORS.textFaint, fontWeight: '500', fontSize: 12 }}> · reward</Text>
          </Text>
        ) : (
          <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 16 }}>
            ${booking.totalPrice}
            <Text style={{ color: COLORS.textFaint, fontWeight: '500', fontSize: 12 }}> total</Text>
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {showNoShowToggle ? (
            <Pressable
              onPress={() => onToggleNoShow?.(booking.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: booking.noShow ? COLORS.cardBorder : COLORS.textFaint,
                backgroundColor: booking.noShow ? 'rgba(255,255,255,0.06)' : '#000',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <UserX size={14} color={COLORS.text} />
              <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 13 }}>
                {booking.noShow ? 'Undo no-show' : 'Mark no-show'}
              </Text>
            </Pressable>
          ) : null}

          {canCancel ? (
            <Pressable
              onPress={() => onCancel?.(booking.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: `${COLORS.danger}66`,
                backgroundColor: `${COLORS.danger}1a`,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <X size={14} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
            </Pressable>
          ) : booking.status === 'confirmed' && cancelNote ? (
            <Text style={{ color: COLORS.textFaint, fontSize: 12, fontStyle: 'italic', maxWidth: 170, textAlign: 'right' }}>
              {cancelNote}
            </Text>
          ) : null}
        </View>
      </View>
    </GlassCard>
  );
}

function Row({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {icon}
      <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{text}</Text>
    </View>
  );
}
