import {
  addMinutes,
  addWeeks,
  format,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
} from 'date-fns';

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

const toTimeStr = (totalMinutes: number) => {
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

/** Whether a booking starting at `time` for `durationHours` finishes by close (midnight). */
export function fitsWithinHours(time: string, durationHours: number): boolean {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m + durationHours * 60 <= CLOSE_HOUR * 60;
}

export const isPast = (iso: string) => isBefore(parseISO(iso), new Date());

export { isSameDay, parseISO, startOfDay };
