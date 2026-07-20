import {
  fitsVenueOperatingWindow,
  venueCalendarDate,
  venueCalendarDateFromParam,
  venueOperatingWindow,
  venueWallTimeToInstant,
} from '@/utils/dateUtils';
import { OperatingHour } from '@/models';

const openAllDay: OperatingHour = { dayOfWeek: 6, openTime: '08:00', closeTime: '24:00', isClosed: false };

describe('Beirut operating windows', () => {
  test.each(['2026-03-28', '2027-03-27'])('resolves 24:00 across spring DST for %s', (key) => {
    const date = venueCalendarDate(key);
    const window = venueOperatingWindow(date, openAllDay);
    expect(window).not.toBeNull();
    expect(() => fitsVenueOperatingWindow(date, '23:00', 1, openAllDay)).not.toThrow();
    expect(fitsVenueOperatingWindow(date, '23:00', 1, openAllDay)).toBe(true);
  });

  test('keeps autumn midnight valid', () => {
    expect(venueOperatingWindow(venueCalendarDate('2026-10-24'), openAllDay)).not.toBeNull();
  });

  test('still rejects a nonexistent selected wall time', () => {
    expect(() => venueWallTimeToInstant('2026-03-29', '00:00')).toThrow(/does not exist/);
  });
});

describe('availability date parameters', () => {
  test('accepts date keys and ISO timestamps', () => {
    expect(venueCalendarDateFromParam('2026-07-20').getDate()).toBe(20);
    expect(venueCalendarDateFromParam('2026-07-20T10:00:00Z').getDate()).toBe(20);
  });

  test('falls back safely for malformed values', () => {
    expect(() => venueCalendarDateFromParam('not-a-date')).not.toThrow();
    expect(() => venueCalendarDateFromParam(['bad', 'also-bad'])).not.toThrow();
  });
});
