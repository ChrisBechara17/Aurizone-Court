import {
  addMinutes,
  addWeeks,
  format,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
} from 'date-fns';
import { OperatingHour } from '@/models';

/** Combine a calendar date with an "HH:mm" time string into a Date. */
export function combineDateAndTime(date: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m ?? 0, 0, 0);
  return d;
}

/** End time = start + duration (hours). Returns a Date. */
export function calculateEndTime(startTime: Date, durationHours: number): Date {
  return addMinutes(startTime, durationHours * 60);
}

/** Human label for a fractional-hour duration: 0.5 -> "30 min", 1.5 -> "1h 30m". */
export function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Generate N weekly occurrences (Date objects) starting from startDate. */
export function generateWeeklyOccurrences(startDate: Date, repeatCount: number): Date[] {
  return Array.from({ length: repeatCount }, (_, i) => addWeeks(startDate, i));
}

// ---- Formatting helpers ---------------------------------------------------

export const fmtTime = (iso: string | Date) =>
  format(typeof iso === 'string' ? parseISO(iso) : iso, 'h:mm a');

export const fmtDate = (iso: string | Date) =>
  format(typeof iso === 'string' ? parseISO(iso) : iso, 'EEE, MMM d');

export const fmtDateLong = (iso: string | Date) =>
  format(typeof iso === 'string' ? parseISO(iso) : iso, 'EEEE, MMMM d, yyyy');

export const fmtDayNum = (d: Date) => format(d, 'd');
export const fmtDayName = (d: Date) => format(d, 'EEE');
export const fmtMonth = (d: Date) => format(d, 'MMM');

/** Build the next `count` selectable days starting today. */
export function upcomingDays(count: number): Date[] {
  const today = startOfDay(new Date());
  return Array.from({ length: count }, (_, i) => addMinutes(today, i * 24 * 60));
}

// Court operating hours.
export const OPEN_HOUR = 8; // 8:00 AM — first selectable start
export const LAST_START_HOUR = 23; // 11:00 PM — latest selectable start (11 PM–12 AM booking)
export const CLOSE_HOUR = 24; // midnight — sessions must finish by here
export const SLOT_STEP_MINUTES = 30; // booking grid granularity

export const DEFAULT_OPERATING_HOURS: OperatingHour[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  openTime: '08:00',
  closeTime: '24:00',
  isClosed: false,
}));

// Peak pricing: bookings that START at or after this hour are peak-priced.
// A booking starting before 4 PM stays off-peak even if it runs past 4 PM —
// the START time alone decides. The server re-checks this authoritatively in
// the Beirut timezone (see supabase/peak-pricing.sql); on the client we read the
// device-local hour, which matches for anyone booking at the venue.
export const PEAK_START_HOUR = 16; // 4:00 PM

/** Whether a booking starting at this time is peak-priced (start ≥ 4 PM). */
export function isPeakStart(start: Date): boolean {
  return start.getHours() >= PEAK_START_HOUR;
}

/** Peak/off-peak label for a start time. */
export const peakLabel = (start: Date): 'Peak' | 'Off-peak' =>
  isPeakStart(start) ? 'Peak' : 'Off-peak';

export const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m ?? 0);
};

export const toTimeStr = (totalMinutes: number) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Selectable start times on a 30-minute grid, from open through the latest
 * allowed start (inclusive). e.g. 08:00, 08:30, 09:00 … 21:30, 22:00.
 */
export function timeSlots(
  startHour = OPEN_HOUR,
  lastStartHour = LAST_START_HOUR,
  stepMinutes = SLOT_STEP_MINUTES,
): string[] {
  const slots: string[] = [];
  for (let t = startHour * 60; t <= lastStartHour * 60; t += stepMinutes) {
    slots.push(toTimeStr(t));
  }
  return slots;
}

export function timeSlotsForOperatingHours(hours: OperatingHour, stepMinutes = SLOT_STEP_MINUTES): string[] {
  if (hours.isClosed) return [];
  const open = timeToMinutes(hours.openTime);
  const close = timeToMinutes(hours.closeTime);
  const lastStart = close - stepMinutes;
  const slots: string[] = [];
  for (let t = open; t <= lastStart; t += stepMinutes) slots.push(toTimeStr(t));
  return slots;
}

export function operatingHoursForDate(hours: OperatingHour[], date: Date): OperatingHour {
  return hours.find((h) => h.dayOfWeek === date.getDay()) ?? DEFAULT_OPERATING_HOURS[date.getDay()];
}

/** Whether a booking starting at `time` for `durationHours` finishes by close (midnight). */
export function fitsWithinHours(time: string, durationHours: number): boolean {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m + durationHours * 60 <= CLOSE_HOUR * 60;
}

export function fitsWithinOperatingHours(time: string, durationHours: number, hours: OperatingHour): boolean {
  if (hours.isClosed) return false;
  const start = timeToMinutes(time);
  return start >= timeToMinutes(hours.openTime) && start + durationHours * 60 <= timeToMinutes(hours.closeTime);
}

export const isPast = (iso: string) => isBefore(parseISO(iso), new Date());

export { isSameDay, parseISO, startOfDay };
