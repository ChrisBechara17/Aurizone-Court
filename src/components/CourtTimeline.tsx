import { Text, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import { Booking, CourtBlock } from '@/models';
import { COLORS, sportAccent, sportLabel } from '@/constants/colors';
import { OPEN_HOUR, CLOSE_HOUR, fmtTime, isSameDay } from '@/utils/dateUtils';
import { COACHES } from '@/data/seedData';

const HOUR_HEIGHT = 64;
const GUTTER = 56;
const TOTAL_HOURS = CLOSE_HOUR - OPEN_HOUR;

const hourLabel = (h: number) => format(new Date(2000, 0, 1, h % 24), 'h a');
const coachName = (id: string | null) => COACHES.find((c) => c.id === id)?.name ?? 'Coach';

interface Props {
  date: Date;
  bookings: Booking[];
  courtBlocks: CourtBlock[];
}

/** Vertical day timeline of Main Court occupancy (the one shared court). */
export function CourtTimeline({ date, bookings, courtBlocks }: Props) {
  // Confirmed/completed court-occupying bookings on this calendar day.
  const occupants = bookings.filter(
    (b) =>
      b.usesMainCourt &&
      (b.status === 'confirmed' || b.status === 'completed') &&
      isSameDay(parseISO(b.startTime), date),
  );

  const blocks = courtBlocks.filter((blk) => isSameDay(parseISO(blk.startTime), date));

  const minutesFromOpen = (iso: string) => {
    const d = parseISO(iso);
    return d.getHours() * 60 + d.getMinutes() - OPEN_HOUR * 60;
  };

  const now = new Date();
  const showNow = isSameDay(now, date);
  const nowTop = (now.getHours() * 60 + now.getMinutes() - OPEN_HOUR * 60) / 60 * HOUR_HEIGHT;

  return (
    <View style={{ flexDirection: 'row', height: TOTAL_HOURS * HOUR_HEIGHT }}>
      {/* Hour gutter + grid */}
      <View style={{ width: GUTTER }}>
        {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
          <Text
            key={i}
            style={{
              position: 'absolute',
              top: i * HOUR_HEIGHT - 7,
              right: 8,
              color: COLORS.textFaint,
              fontSize: 11,
              fontWeight: '600',
            }}
          >
            {hourLabel(OPEN_HOUR + i)}
          </Text>
        ))}
      </View>

      {/* Track */}
      <View style={{ flex: 1, position: 'relative' }}>
        {/* Grid lines */}
        {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              top: i * HOUR_HEIGHT,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: COLORS.chip,
            }}
          />
        ))}

        {/* Blocked slots (maintenance/admin) */}
        {blocks.map((blk) => {
          const top = (minutesFromOpen(blk.startTime) / 60) * HOUR_HEIGHT;
          const dur = (parseISO(blk.endTime).getTime() - parseISO(blk.startTime).getTime()) / 60000;
          const height = (dur / 60) * HOUR_HEIGHT;
          return (
            <View
              key={blk.id}
              style={{
                position: 'absolute',
                top,
                left: 6,
                right: 6,
                height: Math.max(height - 4, 22),
                borderRadius: 12,
                backgroundColor: COLORS.chip,
                borderWidth: 1,
                borderColor: COLORS.cardBorder,
                borderStyle: 'dashed',
                justifyContent: 'center',
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: '700' }}>
                Blocked · {blk.reason}
              </Text>
            </View>
          );
        })}

        {/* Booking blocks */}
        {occupants.map((b) => {
          const accent = sportAccent(b.sportType);
          const top = (minutesFromOpen(b.startTime) / 60) * HOUR_HEIGHT;
          const height = (b.durationMinutes / 60) * HOUR_HEIGHT;
          const isCoach = b.bookingType === 'coach';
          // Half-court bookings only occupy their side so two can sit side by side.
          const isHalf = b.courtHalf === 'a' || b.courtHalf === 'b';
          const left = b.courtHalf === 'b' ? '50%' : 6;
          const right = b.courtHalf === 'a' ? '50%' : 6;
          return (
            <View
              key={b.id}
              style={{
                position: 'absolute',
                top: top + 2,
                left,
                right,
                height: Math.max(height - 4, 26),
                borderRadius: 14,
                backgroundColor: `${accent}24`,
                borderWidth: 1.5,
                borderColor: `${accent}aa`,
                borderLeftWidth: 4,
                borderLeftColor: isCoach ? COLORS.coach : accent,
                paddingHorizontal: 12,
                paddingVertical: 6,
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: accent }} />
                <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 13 }} numberOfLines={1}>
                  {sportLabel(b.sportType)}
                  {isHalf ? ' ½' : ''}
                  {isCoach ? ` · ${coachName(b.coachId)}` : ''}
                </Text>
                {isCoach ? (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: `${COLORS.coach}33` }}>
                    <Text style={{ color: COLORS.coach, fontSize: 9, fontWeight: '800' }}>COACH</Text>
                  </View>
                ) : null}
              </View>
              {height > 40 ? (
                <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                  {fmtTime(b.startTime)} – {fmtTime(b.endTime)}
                </Text>
              ) : null}
            </View>
          );
        })}

        {/* Now indicator */}
        {showNow && nowTop >= 0 && nowTop <= TOTAL_HOURS * HOUR_HEIGHT ? (
          <View style={{ position: 'absolute', top: nowTop, left: 0, right: 0, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: COLORS.neon }} />
            <View style={{ flex: 1, height: 2, backgroundColor: COLORS.neon }} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
