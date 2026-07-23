import {
  fitsVenueOperatingWindow,
  intervalOverlapsVenueDate,
  tryCombineDateAndTime,
  venueCalendarDate,
  venueCalendarDateFromParam,
  venueDateKey,
  venueDateKeyForInstant,
  venueOperatingWindow,
  venueTimeForInstant,
  venueToday,
  venueWallTimeToInstant,
} from '@/utils/dateUtils';
import { OperatingHour } from '@/models';

const openAllDay: OperatingHour = { dayOfWeek: 6, openTime: '08:00', closeTime: '24:00', isClosed: false };

describe('Beirut operating windows', () => {
  test.each(['2026-03-28', '2027-03-27'])('resolves 24:00 across spring DST for %s', (key) => {
    const date = venueCalendarDate(key);
    const window = venueOperatingWindow(date, openAllDay);
    expect(window).not.toBeNull();
    expect(venueDateKeyForInstant(window!.close)).toBe(
      key === '2026-03-28' ? '2026-03-29' : '2027-03-28',
    );
    // Beirut skips local midnight on these transitions. A 24:00 close is the
    // elapsed instant 60 minutes after the valid 23:00 wall time: 01:00 local.
    expect(venueTimeForInstant(window!.close)).toBe('01:00');
    expect(fitsVenueOperatingWindow(date, '23:00', 1, openAllDay)).toBe(true);
  });

  test('resolves the autumn transition close exactly', () => {
    const window = venueOperatingWindow(venueCalendarDate('2026-10-24'), openAllDay);
    expect(window).not.toBeNull();
    expect(venueDateKeyForInstant(window!.close)).toBe('2026-10-25');
    expect(venueTimeForInstant(window!.close)).toBe('00:00');
    expect(fitsVenueOperatingWindow(venueCalendarDate('2026-10-24'), '23:00', 1, openAllDay)).toBe(true);
  });

  test('still rejects a nonexistent selected wall time', () => {
    expect(() => venueWallTimeToInstant('2026-03-29', '00:00')).toThrow(/does not exist/);
    expect(tryCombineDateAndTime(venueCalendarDate('2026-03-29'), '00:00')).toBeNull();
  });

  test('overnight intervals appear on every venue day they overlap', () => {
    const start = venueWallTimeToInstant('2026-07-20', '23:00');
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    expect(intervalOverlapsVenueDate(start, end, venueCalendarDate('2026-07-20'))).toBe(true);
    expect(intervalOverlapsVenueDate(start, end, venueCalendarDate('2026-07-21'))).toBe(true);
    expect(intervalOverlapsVenueDate(start, end, venueCalendarDate('2026-07-22'))).toBe(false);
  });
});

describe('availability date parameters', () => {
  test('accepts date keys and ISO timestamps', () => {
    expect(venueCalendarDateFromParam('2026-07-20').getDate()).toBe(20);
    expect(venueCalendarDateFromParam('2026-07-20T10:00:00Z').getDate()).toBe(20);
  });

  test('falls back safely for malformed values', () => {
    const today = venueDateKey(venueToday());
    expect(venueDateKey(venueCalendarDateFromParam('not-a-date'))).toBe(today);
    expect(venueDateKey(venueCalendarDateFromParam(['2026-07-20']))).toBe(today);
    expect(venueDateKey(venueCalendarDateFromParam('2026-13-45'))).toBe(today);
  });
});
