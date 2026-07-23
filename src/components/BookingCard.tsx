import { Linking, Pressable, Text, View } from 'react-native';
import { Calendar, Clock, MapPin, Phone, Repeat, Rocket, User as UserIcon, UserX, X } from 'lucide-react-native';
import { Booking } from '@/models';
import { COLORS, sportAccent, sportLabel } from '@/constants/colors';
import { fmtDate, fmtTime, formatDuration } from '@/utils/dateUtils';
import { hasStarted } from '@/utils/accountStanding';
import { GlassCard } from './GlassCard';
import { StatusBadge } from './StatusBadge';
import { useAppStore } from '@/store/useAppStore';
import { bookingDisplayState } from '@/utils/bookingLifecycle';

interface Props {
  booking: Booking;
  onCancel?: (id: string) => void;
  /** Muted note shown instead of the cancel button (e.g. within cutoff). */
  cancelNote?: string;
  /** Admin: toggle the no-show flag on a started booking. */
  onToggleNoShow?: (id: string) => void;
  /** User view: phone to call to cancel (users can't self-cancel; admins do). */
  cancelContactPhone?: string;
  /** Admin view: name of the user who made this booking. */
  bookedByName?: string;
  /** Make the whole card tappable (e.g. admin → booking detail). */
  onPress?: () => void;
}

export function BookingCard({ booking, onCancel, cancelNote, onToggleNoShow, cancelContactPhone, bookedByName, onPress }: Props) {
  // U6: resolve coach names from the live store, not the static seed data, so
  // renamed/added coaches show correctly.
  const coaches = useAppStore((s) => s.coaches);
  const coachName = (id: string | null) => coaches.find((c) => c.id === id)?.name ?? 'Coach';
  const accent = sportAccent(booking.sportType);
  const isCoach = booking.bookingType === 'coach';
  const displayState = bookingDisplayState(booking);
  const canCancel = booking.status === 'confirmed' && !!onCancel;
  const showNoShowToggle = !!onToggleNoShow && booking.status !== 'cancelled' && hasStarted(booking);
  const durH = booking.durationMinutes / 60;

  const card = (
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
            // U5: theme-aware danger pill — the old black-on-near-black was
            // invisible in light theme.
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: `${COLORS.danger}22`,
                borderWidth: 1,
                borderColor: `${COLORS.danger}55`,
              }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: COLORS.danger }} />
              <Text style={{ color: COLORS.danger, fontWeight: '800', fontSize: 11 }}>No-show</Text>
            </View>
          ) : null}
          <StatusBadge status={displayState} />
        </View>
      </View>

      <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 17, marginTop: 10 }}>
        {isCoach ? coachName(booking.coachId) : 'Main Court'}
      </Text>

      {/* Admin view: who booked this slot. */}
      {bookedByName ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <UserIcon size={13} color={COLORS.textMuted} />
          <Text style={{ color: COLORS.textMuted, fontSize: 13, flex: 1 }}>
            Booked by <Text style={{ color: COLORS.text, fontWeight: '700' }}>{bookedByName}</Text>
          </Text>
        </View>
      ) : null}

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
        {booking.isFreeReward && booking.totalPrice === 0 ? (
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
                paddingVertical: 9,
                borderRadius: 12,
                overflow: 'hidden',
                // U5: theme-aware — a hardcoded black button hid its dark text in
                // light theme. Danger tint to mark, neutral chip to undo.
                backgroundColor: booking.noShow
                  ? (pressed ? COLORS.cardStrong : COLORS.chip)
                  : (pressed ? `${COLORS.danger}3d` : `${COLORS.danger}24`),
              })}
            >
              <UserX size={14} color={booking.noShow ? COLORS.text : COLORS.danger} />
              <Text style={{ color: booking.noShow ? COLORS.text : COLORS.danger, fontWeight: '700', fontSize: 13 }}>
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
                paddingVertical: 9,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: pressed ? `${COLORS.danger}3d` : `${COLORS.danger}24`,
              })}
            >
              <X size={14} color={COLORS.danger} />
              <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
            </Pressable>
          ) : booking.status === 'confirmed' && cancelContactPhone ? (
            // Users can't self-cancel — direct them to call the front desk.
            <Pressable
              onPress={() => void Linking.openURL(`tel:${cancelContactPhone.replace(/[^\d+]/g, '')}`)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: pressed ? `${COLORS.neon}3d` : `${COLORS.neon}1f`,
              })}
            >
              <Phone size={14} color={COLORS.neon} />
              <Text style={{ color: COLORS.neon, fontWeight: '700', fontSize: 13 }}>Call to cancel</Text>
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

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
        {card}
      </Pressable>
    );
  }
  return card;
}

function Row({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {icon}
      {/* U2: flex + shrink so the date/time string wraps instead of clipping on Android. */}
      <Text style={{ color: COLORS.textMuted, fontSize: 13, flex: 1, flexShrink: 1 }}>{text}</Text>
    </View>
  );
}
