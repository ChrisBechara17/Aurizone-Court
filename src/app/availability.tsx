import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CalendarCheck } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/ScreenContainer';
import { GlassCard } from '@/components/GlassCard';
import { CourtTimeline } from '@/components/CourtTimeline';
import { DateSelector } from '@/components/DateSelector';
import { PrimaryGradientButton } from '@/components/PrimaryGradientButton';
import { COLORS } from '@/constants/colors';
import { startOfDay, isSameDay, operatingHoursForDate, timeToMinutes } from '@/utils/dateUtils';
import { useAppStore } from '@/store/useAppStore';
import { parseISO } from 'date-fns';

export default function AvailabilityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const occupancy = useAppStore((s) => s.occupancy);
  const courtBlocks = useAppStore((s) => s.courtBlocks);
  const operatingHours = useAppStore((s) => s.operatingHours);

  const [date, setDate] = useState<Date>(
    params.date ? startOfDay(new Date(params.date)) : startOfDay(new Date()),
  );

  const dayOccupants = occupancy.filter((b) => isSameDay(parseISO(b.startTime), date));
  const dayHours = operatingHoursForDate(operatingHours, date);
  const totalHours = dayHours.isClosed ? 0 : (timeToMinutes(dayHours.closeTime) - timeToMinutes(dayHours.openTime)) / 60;
  // B3: count physical court-hours, not the sum of every booking's duration.
  // Two concurrent half-court bookings share the same wall-clock hour, so merge
  // overlapping intervals and measure their union instead of double-counting.
  const bookedHours = mergedHours(
    dayOccupants.map((b) => ({
      start: parseISO(b.startTime).getTime(),
      end: parseISO(b.endTime).getTime(),
    })),
  );
  const freeHours = Math.max(0, totalHours - bookedHours);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: COLORS.card,
                borderWidth: 1,
                borderColor: COLORS.cardBorder,
              }}
            >
              <ArrowLeft size={20} color={COLORS.text} />
            </View>
          </Pressable>
          <View>
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: '900' }}>Court Schedule</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Main Court · shared by both sports</Text>
          </View>
        </View>

        <DateSelector value={date} onChange={setDate} />

        {/* Summary + legend */}
        <Animated.View entering={FadeInDown.duration(350)}>
          <GlassCard>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Stat value={`${bookedHours % 1 === 0 ? bookedHours : bookedHours.toFixed(1)}h`} label="Booked" color={COLORS.danger} />
              <Stat value={`${freeHours % 1 === 0 ? freeHours : freeHours.toFixed(1)}h`} label="Free" color={COLORS.success} />
              <Stat value={String(dayOccupants.length)} label="Sessions" color={COLORS.neon} />
            </View>
            <View style={{ height: 1, backgroundColor: COLORS.cardBorder, marginVertical: 14 }} />
            <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
              <Legend color={COLORS.basketball} label="Basketball" />
              <Legend color={COLORS.tennis} label="Tennis" />
              <Legend color={COLORS.coach} label="Coach + court" />
            </View>
          </GlassCard>
        </Animated.View>

        {/* Timeline */}
        <Animated.View entering={FadeInDown.delay(80).duration(350)}>
          <GlassCard>
            {dayHours.isClosed ? (
              <View style={{ paddingVertical: 18 }}>
                <Text style={{ color: COLORS.danger, fontWeight: '900', fontSize: 16 }}>Court is closed this day</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 4 }}>Pick another date to view availability.</Text>
              </View>
            ) : dayOccupants.length === 0 ? (
              <View style={{ paddingVertical: 4 }}>
                <Text style={{ color: COLORS.success, fontWeight: '800', fontSize: 15, marginBottom: 12 }}>
                  Court is wide open ✨
                </Text>
                <CourtTimeline date={date} bookings={occupancy} courtBlocks={courtBlocks} openTime={dayHours.openTime} closeTime={dayHours.closeTime} />
              </View>
            ) : (
              <CourtTimeline date={date} bookings={occupancy} courtBlocks={courtBlocks} openTime={dayHours.openTime} closeTime={dayHours.closeTime} />
            )}
          </GlassCard>
        </Animated.View>

        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            alignItems: 'flex-start',
            backgroundColor: `${COLORS.neon}14`,
            borderColor: `${COLORS.neon}44`,
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
          }}
        >
          <CalendarCheck size={18} color={COLORS.neon} />
          <Text style={{ color: COLORS.text, flex: 1, fontSize: 13, lineHeight: 19 }}>
            Full-width blocks take the whole court (both sports). A half-width ½ block is a
            half-court basketball booking — the other side stays open for another group.
          </Text>
        </View>

        <PrimaryGradientButton label="Book a Slot" onPress={() => router.push('/(tabs)/book')} />
      </ScrollView>
    </ScreenContainer>
  );
}

/** Total hours covered by the union of [start,end) intervals (overlaps counted once). */
function mergedHours(intervals: { start: number; end: number }[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i++) {
    const { start, end } = sorted[i];
    if (start <= curEnd) {
      curEnd = Math.max(curEnd, end);
    } else {
      total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    }
  }
  total += curEnd - curStart;
  return total / 3_600_000;
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1, paddingHorizontal: 2 }}>
      <Text numberOfLines={1} style={{ color, fontSize: 22, fontWeight: '900' }}>{value}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: COLORS.textMuted, fontSize: 12, textAlign: 'center' }}
      >
        {label}
      </Text>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: `${color}33`, borderWidth: 1.5, borderColor: color }} />
      <Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
