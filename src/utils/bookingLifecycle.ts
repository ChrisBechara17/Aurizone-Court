import { Booking } from '@/models';

export type BookingDisplayState =
  | 'confirmed'
  | 'awaiting_review'
  | 'completed'
  | 'cancelled'
  | 'no_show';

/** Presentation-only lifecycle state. Booking.status always remains the
 * authoritative value persisted in Postgres. */
export function bookingDisplayState(
  booking: Booking,
  now = Date.now(),
): BookingDisplayState {
  if (booking.status === 'cancelled') return 'cancelled';
  if (booking.noShow) return 'no_show';
  if (booking.status === 'completed') return 'completed';
  if (new Date(booking.endTime).getTime() <= now) return 'awaiting_review';
  return 'confirmed';
}

export function bookingHasStarted(booking: Booking, now = Date.now()): boolean {
  return new Date(booking.startTime).getTime() <= now;
}
