import { createCourtBooking } from '@/services/bookingService';
import { computeLoyalty } from '@/utils/loyalty';
import { venueCalendarDate } from '@/utils/dateUtils';
import { Booking, Pricing } from '@/models';
import { bookingDisplayState } from '@/utils/bookingLifecycle';
import { computeStanding } from '@/utils/accountStanding';

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

test('a finished booking earns free progress without admin review', () => {
  const pastConfirmed = booking({ status: 'confirmed', completedAt: null });
  // status stays authoritative; only the reward rule stopped requiring review.
  expect(pastConfirmed.status).toBe('confirmed');
  expect(bookingDisplayState(pastConfirmed, new Date('2026-01-02T00:00:00Z').getTime())).toBe('awaiting_review');
  expect(computeLoyalty([pastConfirmed]).goodBookings).toBe(1);
});

test('ten finished bookings earn a free session with no admin action', () => {
  const rows = Array.from({ length: 10 }, (_, index) =>
    booking({ id: String(index), status: 'confirmed', completedAt: null }),
  );
  expect(computeLoyalty(rows).goodBookings).toBe(10);
  expect(computeLoyalty(rows).availableFree).toBe(1);
});

test('bookings that have not finished yet earn no free progress', () => {
  const rows = Array.from({ length: 10 }, (_, index) =>
    booking({
      id: String(index),
      status: 'confirmed',
      completedAt: null,
      startTime: '2030-01-01T10:00:00Z',
      endTime: '2030-01-01T11:00:00Z',
    }),
  );
  expect(computeLoyalty(rows).goodBookings).toBe(0);
  expect(computeLoyalty(rows).availableFree).toBe(0);
});

test('admin no-show and cancellation still remove free progress', () => {
  const rows = Array.from({ length: 10 }, (_, index) =>
    booking({ id: String(index), status: 'confirmed', completedAt: null }),
  );
  rows[0] = booking({ id: 'no-show', status: 'confirmed', completedAt: null, noShow: true });
  rows[1] = booking({ id: 'cancelled', status: 'cancelled', completedAt: null });
  expect(computeLoyalty(rows).goodBookings).toBe(8);
  expect(computeLoyalty(rows).availableFree).toBe(0);
});

test('redeemed free sessions never earn progress toward another reward', () => {
  const paid = Array.from({ length: 10 }, (_, index) =>
    booking({ id: String(index), status: 'confirmed', completedAt: null }),
  );
  const redeemed = booking({ id: 'free', status: 'confirmed', completedAt: null, isFreeReward: true });
  const state = computeLoyalty([...paid, redeemed]);
  expect(state.goodBookings).toBe(10); // the free session itself does not count
  expect(state.earnedFree).toBe(1);
  expect(state.redeemedFree).toBe(1);
  expect(state.availableFree).toBe(0);
});

test('completed sessions accrue progress and no-shows accrue strikes', () => {
  const completed = booking({ id: 'completed' });
  const noShow = booking({ id: 'no-show', status: 'confirmed', completedAt: null, noShow: true });
  expect(computeLoyalty([completed, noShow]).goodBookings).toBe(1);
  expect(computeStanding([completed, noShow]).strikes).toBe(1);
});
