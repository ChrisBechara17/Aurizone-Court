import { Booking } from '@/models';

// ---------------------------------------------------------------------------
// Account standing & booking policy (the "anti-loyalty" / fairness layer).
//
//  • No-shows earn a "black dot"; MAX_STRIKES dots disables the account.
//  • Bookings can't be cancelled within CANCEL_CUTOFF_HOURS of the start time.
//
// All of this is derived from the bookings list so it stays consistent with the
// rest of the app and ports cleanly to the backend (where it becomes per-user).
// ---------------------------------------------------------------------------

export const MAX_STRIKES = 3;
export const CANCEL_CUTOFF_HOURS = 3;

export interface AccountStanding {
  strikes: number;
  maxStrikes: number;
  disabled: boolean;
}

/** Black dots = no-show bookings that weren't cancelled. 3 = disabled. */
export function computeStanding(bookings: Booking[]): AccountStanding {
  const strikes = bookings.filter((b) => b.noShow && b.status !== 'cancelled').length;
  return { strikes, maxStrikes: MAX_STRIKES, disabled: strikes >= MAX_STRIKES };
}

/** Whether a booking is still cancellable by the user (outside the cutoff window). */
export function canUserCancel(booking: Booking): boolean {
  if (booking.status !== 'confirmed') return false;
  const msUntilStart = new Date(booking.startTime).getTime() - Date.now();
  return msUntilStart > CANCEL_CUTOFF_HOURS * 3_600_000;
}

/** True once a booking's start time has passed (eligible to be marked a no-show). */
export function hasStarted(booking: Booking): boolean {
  return new Date(booking.startTime).getTime() <= Date.now();
}
