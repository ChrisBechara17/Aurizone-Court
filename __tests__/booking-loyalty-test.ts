import { createCourtBooking } from '@/services/bookingService';
import { computeLoyalty } from '@/utils/loyalty';
import { venueCalendarDate } from '@/utils/dateUtils';
import { Booking, Pricing } from '@/models';

const pricing: Pricing = {
  basketball: 11, basketballPeak: 22, basketballHalf: 7, basketballHalfPeak: 14,
  tennis: 9, tennisPeak: 18, ballMachineRate: 5,
};

const booking = (overrides: Partial<Booking>): Booking => ({
  id: 'id', userId: 'user', bookingType: 'court', sportType: 'basketball',
  courtId: 'court', coachId: null, usesMainCourt: true, courtHalf: 'full',
  startTime: '2026-01-01T10:00:00Z', endTime: '2026-01-01T11:00:00Z', durationMinutes: 60,
  totalPrice: 0, status: 'completed', isRecurring: false, recurrenceGroupId: null,
  createdAt: '2025-12-01T00:00:00Z', cancelledAt: null, completedAt: '2026-01-01T11:00:00Z',
  ...overrides,
});

test('court booking uses live peak and add-on pricing', () => {
  const result = createCourtBooking({
    userId: 'user', courtId: 'court', sportType: 'tennis', date: venueCalendarDate('2030-07-20'),
    startTime: '18:00', durationHours: 1, repeatWeekly: false, repeatCount: 1, ballMachine: true,
  }, [], [], pricing);
  expect(result.created[0].totalPrice).toBe(23);
});

test('cancelled-after-completed bookings do not earn free progress', () => {
  const rows = Array.from({ length: 10 }, (_, index) => booking({ id: String(index) }));
  rows[0] = booking({ id: 'cancelled', status: 'cancelled' });
  expect(computeLoyalty(rows).goodBookings).toBe(9);
  expect(computeLoyalty(rows).availableFree).toBe(0);
});
