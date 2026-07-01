import { Booking, BookingStatus, CourtBlock, SportType } from '@/models';
import { BALL_MACHINE_RATE, getSportPrice, MAX_DURATION_HOURS } from '@/constants/prices';
import { MAIN_COURT_ID } from '@/data/seedData';
import {
  calculateEndTime,
  combineDateAndTime,
  generateWeeklyOccurrences,
} from '@/utils/dateUtils';
import {
  hasCoachConflict,
  hasCourtConflict,
  ProposedBooking,
} from '@/utils/conflictUtils';
import { computeStanding, hasReachedBookingLimit } from '@/utils/accountStanding';

// ---------------------------------------------------------------------------
// Booking service — all booking logic lives here (repository pattern) so the
// persistence layer can later be replaced with API calls without UI changes.
// ---------------------------------------------------------------------------

const uid = () =>
  `bk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Price = price/hour for the sport * duration. Display only. */
export function calculateTotalPrice(sportType: SportType, durationHours: number): number {
  return getSportPrice(sportType) * durationHours;
}

/** Bookings auto-confirm when <= 3h; longer is disallowed at the call sites. */
function statusForDuration(durationHours: number): BookingStatus {
  return durationHours <= MAX_DURATION_HOURS ? 'confirmed' : 'cancelled';
}

export interface CourtBookingInput {
  userId: string;
  sportType: SportType;
  date: Date;
  startTime: string; // "HH:mm"
  durationHours: number;
  repeatWeekly: boolean;
  repeatCount: number; // weeks (>=1)
  /** Redeem a loyalty free-session credit (single, non-recurring bookings only). */
  useFreeSession?: boolean;
  /** Tennis-only add-on: include the ball machine (adds to the price). */
  ballMachine?: boolean;
}

export interface CoachBookingInput {
  userId: string;
  coachId: string;
  sportType: SportType;
  date: Date;
  startTime: string; // "HH:mm"
  durationHours: number;
  useMainCourt: boolean;
}

export interface OccurrenceResult {
  date: Date;
  startTime: string;
  endTime: string;
  available: boolean;
  reason?: string;
}

export interface CreateResult {
  ok: boolean;
  created: Booking[];
  blocked: OccurrenceResult[];
  error?: string;
}

// ---- Court bookings -------------------------------------------------------

export function createCourtBooking(
  input: CourtBookingInput,
  existing: Booking[],
  courtBlocks: CourtBlock[],
): CreateResult {
  // Standing & the one-booking limit are per-user; court conflicts span everyone.
  const userBookings = existing.filter((b) => b.userId === input.userId);

  if (computeStanding(userBookings).disabled) {
    return {
      ok: false,
      created: [],
      blocked: [],
      error: 'Your account is disabled after 3 no-shows. Please contact the front desk.',
    };
  }

  if (hasReachedBookingLimit(userBookings)) {
    return {
      ok: false,
      created: [],
      blocked: [],
      error: 'You already have an upcoming booking. Cancel it before booking another slot.',
    };
  }

  if (input.durationHours > MAX_DURATION_HOURS) {
    return { ok: false, created: [], blocked: [], error: 'Bookings longer than 3 hours are not allowed.' };
  }

  const weeks = input.repeatWeekly ? Math.max(1, input.repeatCount) : 1;
  const firstStart = combineDateAndTime(input.date, input.startTime);
  const occurrences = generateWeeklyOccurrences(firstStart, weeks);
  const recurrenceGroupId = weeks > 1 ? uid() : null;
  // A free-session reward only applies to a single (non-recurring) booking.
  const useFree = !!input.useFreeSession && weeks === 1;
  // Ball machine is a tennis-only paid add-on.
  const ballMachine = !!input.ballMachine && input.sportType === 'tennis';
  const machineCost = ballMachine ? BALL_MACHINE_RATE * input.durationHours : 0;

  const created: Booking[] = [];
  const blocked: OccurrenceResult[] = [];
  // Validate against existing bookings PLUS the ones we create in this batch.
  const runningExisting = [...existing];

  for (const occStart of occurrences) {
    const occEnd = calculateEndTime(occStart, input.durationHours);
    const proposed: ProposedBooking = {
      startTime: occStart.toISOString(),
      endTime: occEnd.toISOString(),
      usesMainCourt: true,
    };

    if (hasCourtConflict(proposed, runningExisting, courtBlocks)) {
      blocked.push({
        date: occStart,
        startTime: proposed.startTime,
        endTime: proposed.endTime,
        available: false,
        reason: 'Main Court is already booked at this time.',
      });
      continue;
    }

    const booking: Booking = {
      id: uid(),
      userId: input.userId,
      bookingType: 'court',
      sportType: input.sportType,
      courtId: MAIN_COURT_ID,
      coachId: null,
      usesMainCourt: true,
      startTime: proposed.startTime,
      endTime: proposed.endTime,
      durationMinutes: input.durationHours * 60,
      // Free reward covers the court; the ball-machine add-on is still charged.
      totalPrice: useFree ? machineCost : calculateTotalPrice(input.sportType, input.durationHours) + machineCost,
      status: statusForDuration(input.durationHours),
      isRecurring: weeks > 1,
      recurrenceGroupId,
      createdAt: new Date().toISOString(),
      cancelledAt: null,
      isFreeReward: useFree,
      ballMachine,
    };
    created.push(booking);
    runningExisting.push(booking);
  }

  if (created.length === 0) {
    return {
      ok: false,
      created,
      blocked,
      error: 'This slot is unavailable because basketball and tennis share the same court.',
    };
  }

  return { ok: true, created, blocked };
}

// ---- Coach bookings -------------------------------------------------------

export function createCoachBooking(
  input: CoachBookingInput,
  existing: Booking[],
  courtBlocks: CourtBlock[],
): CreateResult {
  if (input.durationHours > MAX_DURATION_HOURS) {
    return { ok: false, created: [], blocked: [], error: 'Bookings longer than 3 hours are not allowed.' };
  }

  const start = combineDateAndTime(input.date, input.startTime);
  const end = calculateEndTime(start, input.durationHours);
  const proposed: ProposedBooking = {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    usesMainCourt: input.useMainCourt,
    coachId: input.coachId,
  };

  if (hasCoachConflict(proposed, existing)) {
    return { ok: false, created: [], blocked: [], error: 'Coach is already booked at this time.' };
  }

  if (input.useMainCourt && hasCourtConflict(proposed, existing, courtBlocks)) {
    return {
      ok: false,
      created: [],
      blocked: [],
      error: 'This coach session uses the Main Court, but the court is unavailable.',
    };
  }

  const booking: Booking = {
    id: uid(),
    userId: input.userId,
    bookingType: 'coach',
    sportType: input.sportType,
    courtId: input.useMainCourt ? MAIN_COURT_ID : null,
    coachId: input.coachId,
    usesMainCourt: input.useMainCourt,
    startTime: proposed.startTime,
    endTime: proposed.endTime,
    durationMinutes: input.durationHours * 60,
    totalPrice: calculateTotalPrice(input.sportType, input.durationHours),
    status: statusForDuration(input.durationHours),
    isRecurring: false,
    recurrenceGroupId: null,
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  };

  return { ok: true, created: [booking], blocked: [] };
}

// ---- Cancel ---------------------------------------------------------------

export function cancelBooking(bookings: Booking[], id: string): Booking[] {
  return bookings.map((b) =>
    b.id === id ? { ...b, status: 'cancelled', cancelledAt: new Date().toISOString() } : b,
  );
}

/** Mark past confirmed bookings as completed (called on load). */
export function reconcileStatuses(bookings: Booking[]): Booking[] {
  const now = Date.now();
  return bookings.map((b) =>
    b.status === 'confirmed' && new Date(b.endTime).getTime() < now
      ? { ...b, status: 'completed' }
      : b,
  );
}
