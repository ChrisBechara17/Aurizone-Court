import {
  addMinutes,
  format,
  isBefore,
  isSameDay,
  isValid,
  parseISO,
  startOfDay,
} from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { OperatingHour } from '@/models';

export const VENUE_TIME_ZONE = 'Asia/Beirut';

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Stable venue calendar key for a DateSelector date (which is not an instant). */
export function venueDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function venueDateKeyForInstant(instant: Date | string): string {
  return formatInTimeZone(typeof instant === 'string' ? parseISO(instant) : instant, VENUE_TIME_ZONE, 'yyyy-MM-dd');
}

export function venueCalendarDate(dateKey: string): Date {
  const match = DATE_KEY_RE.exec(dateKey);
  if (!match) throw new RangeError('Invalid venue date.');
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

export function venueToday(): Date {
  return venueCalendarDate(formatInTimeZone(new Date(), VENUE_TIME_ZONE, 'yyyy-MM-dd'));
}

export function addVenueDays(dateKey: string, amount: number): string {
  const match = DATE_KEY_RE.exec(dateKey);
  if (!match) throw new RangeError('Invalid venue date.');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Convert a Beirut wall-clock selection into its authoritative UTC instant. */
export function venueWallTimeToInstant(dateKey: string, time: string): Date {
  if (!DATE_KEY_RE.test(dateKey) || !TIME_RE.test(time)) throw new RangeError('Invalid venue date or time.');
  const wall = `${dateKey}T${time}:00.000`;
  const instant = fromZonedTime(wall, VENUE_TIME_ZONE);
  // Spring-forward gaps are normalized by some runtimes. Reject that silent shift.
  if (formatInTimeZone(instant, VENUE_TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS") !== wall) {
    throw new RangeError('That local time does not exist in Beirut.');
  }
  return instant;
}

/** Combine a DateSelector calendar date with an "HH:mm" Beirut time. */
export function combineDateAndTime(date: Date, time: string): Date {
  return venueWallTimeToInstant(venueDateKey(date), time);
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

/** Generate N occurrences at the same Beirut wall time on successive weeks. */
export function generateWeeklyOccurrences(startDate: Date, repeatCount: number): Date[] {
  const firstDate = venueDateKeyForInstant(startDate);
  const time = formatInTimeZone(startDate, VENUE_TIME_ZONE, 'HH:mm');
  return Array.from({ length: repeatCount }, (_, i) => venueWallTimeToInstant(addVenueDays(firstDate, i * 7), time));
}

// ---- Formatting helpers ---------------------------------------------------

export const fmtTime = (iso: string | Date) =>
  formatInTimeZone(typeof iso === 'string' ? parseISO(iso) : iso, VENUE_TIME_ZONE, 'h:mm a');

export const fmtDate = (iso: string | Date) =>
  formatInTimeZone(typeof iso === 'string' ? parseISO(iso) : iso, VENUE_TIME_ZONE, 'EEE, MMM d');

export const fmtDateLong = (iso: string | Date) =>
  formatInTimeZone(typeof iso === 'string' ? parseISO(iso) : iso, VENUE_TIME_ZONE, 'EEEE, MMMM d, yyyy');

/** Format a DateSelector calendar value, which deliberately is not an instant. */
export const fmtCalendarDate = (date: Date) => format(date, 'EEE, MMM d');

export const fmtDayNum = (d: Date) => format(d, 'd');
export const fmtDayName = (d: Date) => format(d, 'EEE');
export const fmtMonth = (d: Date) => format(d, 'MMM');

/** Build the next `count` selectable days starting today. */
export function upcomingDays(count: number): Date[] {
  const todayKey = venueDateKey(venueToday());
  return Array.from({ length: count }, (_, i) => venueCalendarDate(addVenueDays(todayKey, i)));
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
// the Beirut timezone (see supabase/peak-pricing.sql); the client uses that same
// venue timezone regardless of the phone's current location.
export const PEAK_START_HOUR = 16; // 4:00 PM

/** Whether a booking starting at this time is peak-priced (start ≥ 4 PM). */
export function isPeakStart(start: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Beirut',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(start).find((part) => part.type === 'hour')?.value,
  );
  return hour >= PEAK_START_HOUR;
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
  const dayOfWeek = venueCalendarDate(venueDateKey(date)).getDay();
  return hours.find((h) => h.dayOfWeek === dayOfWeek) ?? DEFAULT_OPERATING_HOURS[dayOfWeek];
}

/** Whether a booking starting at `time` for `durationHours` finishes by close (midnight). */
export function fitsWithinHours(time: string, durationHours: number): boolean {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m ?? 0) + durationHours * 60 <= CLOSE_HOUR * 60;
}

export function fitsWithinOperatingHours(time: string, durationHours: number, hours: OperatingHour): boolean {
  if (hours.isClosed) return false;
  const start = timeToMinutes(time);
  return start >= timeToMinutes(hours.openTime) && start + durationHours * 60 <= timeToMinutes(hours.closeTime);
}

/**
 * Day-of-week (0=Sun..6=Sat) and minutes-since-midnight of an instant in the
 * venue timezone (Asia/Beirut). Operating-hours checks must use these: the
 * server validates the day and open/close window in Asia/Beirut, so reading
 * device-local fields would let a non-Beirut device offer slots the server
 * rejects (or accept a Beirut-3AM slot it shouldn't).
 */
export function beirutWallParts(instant: Date): { dayOfWeek: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: VENUE_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const field = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dayOfWeek: days[field('weekday')] ?? instant.getDay(),
    minutes: Number(field('hour')) * 60 + Number(field('minute')),
  };
}

export function sameVenueDate(instant: Date | string, calendarDate: Date): boolean {
  return venueDateKeyForInstant(instant) === venueDateKey(calendarDate);
}

export function venueMinutesForInstant(instant: Date | string): number {
  return beirutWallParts(typeof instant === 'string' ? parseISO(instant) : instant).minutes;
}

export function venueTimeForInstant(instant: Date | string): string {
  return formatInTimeZone(typeof instant === 'string' ? parseISO(instant) : instant, VENUE_TIME_ZONE, 'HH:mm');
}

export function venueOperatingWindow(date: Date, hours: OperatingHour): { open: Date; close: Date } | null {
  if (hours.isClosed) return null;
  const dateKey = venueDateKey(date);
  const open = venueWallTimeToInstant(dateKey, hours.openTime);
  const close = hours.closeTime === '24:00'
    ? addMinutes(venueWallTimeToInstant(dateKey, '23:00'), 60)
    : venueWallTimeToInstant(dateKey, hours.closeTime);
  return { open, close };
}

export function fitsVenueOperatingWindow(
  date: Date,
  time: string,
  durationHours: number,
  hours: OperatingHour,
): boolean {
  try {
    const window = venueOperatingWindow(date, hours);
    if (!window) return false;
    const start = combineDateAndTime(date, time);
    const end = calculateEndTime(start, durationHours);
    return start.getTime() >= window.open.getTime() && end.getTime() <= window.close.getTime();
  } catch {
    return false;
  }
}

/**
 * Operating-hours check for a booking INSTANT, evaluated in Asia/Beirut so it
 * agrees with the server. Returns the matched day's hours and whether the
 * booking fits within them.
 */
export function fitsOperatingHoursAt(
  allHours: OperatingHour[],
  instant: Date,
  durationHours: number,
): { hours: OperatingHour; fits: boolean } {
  const { dayOfWeek } = beirutWallParts(instant);
  const hours = allHours.find((h) => h.dayOfWeek === dayOfWeek) ?? DEFAULT_OPERATING_HOURS[dayOfWeek];
  const date = venueCalendarDate(venueDateKeyForInstant(instant));
  try {
    const window = venueOperatingWindow(date, hours);
    if (!window) return { hours, fits: false };
    const end = calculateEndTime(instant, durationHours);
    return { hours, fits: instant.getTime() >= window.open.getTime() && end.getTime() <= window.close.getTime() };
  } catch {
    return { hours, fits: false };
  }
}

export function venueCalendarDateFromParam(value: string | string[] | undefined): Date {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return venueToday();
  try {
    if (DATE_KEY_RE.test(raw)) return venueCalendarDate(raw);
    const instant = parseISO(raw);
    if (!isValid(instant)) return venueToday();
    return venueCalendarDate(venueDateKeyForInstant(instant));
  } catch {
    return venueToday();
  }
}

export const isPast = (iso: string) => isBefore(parseISO(iso), new Date());

export { isSameDay, parseISO, startOfDay };
