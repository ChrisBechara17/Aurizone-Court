import { Booking, BookingStatus, CourtBlock, CourtHalf, SportType } from '@/models';
import { BALL_MACHINE_RATE, BASKETBALL_HALF_RATE, getSportPrice, MAX_DURATION_HOURS } from '@/constants/prices';
import {
  calculateEndTime,
  combineDateAndTime,
  generateWeeklyOccurrences,
} from '@/utils/dateUtils';
import { availableHalfSide, hasCourtConflict } from '@/utils/conflictUtils';
import { computeStanding } from '@/utils/accountStanding';

// ---------------------------------------------------------------------------
// Pure booking logic (conflict checks, pricing, occurrence generation). Builds
// Booking objects; persistence is handled by the store via supabaseService.
// ---------------------------------------------------------------------------

/** RFC-4122 v4 UUID — matches the Postgres uuid PK columns. */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
  courtId: string;
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
  /** Basketball only: book half the court (leaves the other half free for others). */
  halfCourt?: boolean;
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

  if (input.durationHours > MAX_DURATION_HOURS) {
    return { ok: false, created: [], blocked: [], error: 'Bookings longer than 3 hours are not allowed.' };
  }

  const weeks = input.repeatWeekly ? Math.max(1, input.repeatCount) : 1;
  const firstStart = combineDateAndTime(input.date, input.startTime);
  const occurrences = generateWeeklyOccurrences(firstStart, weeks);
  const recurrenceGroupId = weeks > 1 ? uuidv4() : null;
  // A free-session reward only applies to a single (non-recurring) booking.
  const useFree = !!input.useFreeSession && weeks === 1;
  // Ball machine is a tennis-only paid add-on.
  const ballMachine = !!input.ballMachine && input.sportType === 'tennis';
  const machineCost = ballMachine ? BALL_MACHINE_RATE * input.durationHours : 0;
  // Half court is a basketball-only option; picks whichever side is free.
  const half = !!input.halfCourt && input.sportType === 'basketball';

  const created: Booking[] = [];
  const blocked: OccurrenceResult[] = [];
  const now = Date.now();
  // Validate against existing bookings PLUS the ones we create in this batch.
  const runningExisting = [...existing];

  for (const occStart of occurrences) {
    const occEnd = calculateEndTime(occStart, input.durationHours);
    const startISO = occStart.toISOString();
    const endISO = occEnd.toISOString();

    // B1: reject occurrences whose start is in the past. Otherwise they'd be
    // instantly "completed", bypass the one-active-booking limit, and farm
    // loyalty rewards. (The DB trigger enforces this authoritatively too.)
    if (occStart.getTime() <= now) {
      blocked.push({
        date: occStart,
        startTime: startISO,
        endTime: endISO,
        available: false,
        reason: 'That start time is in the past.',
      });
      continue;
    }

    // Determine which half (if any) this occurrence can take.
    let courtHalf: CourtHalf = 'full';
    if (half) {
      const side = availableHalfSide(startISO, endISO, runningExisting, courtBlocks);
      if (!side) {
        blocked.push({
          date: occStart,
          startTime: startISO,
          endTime: endISO,
          available: false,
          reason: 'Both halves of the Main Court are booked at this time.',
        });
        continue;
      }
      courtHalf = side;
    } else if (
      hasCourtConflict({ startTime: startISO, endTime: endISO, usesMainCourt: true, courtHalf: 'full' }, runningExisting, courtBlocks)
    ) {
      blocked.push({
        date: occStart,
        startTime: startISO,
        endTime: endISO,
        available: false,
        reason: 'Main Court is already booked at this time.',
      });
      continue;
    }

    // Free reward covers the court; ball-machine add-on (tennis) is still charged.
    const fullCost = useFree ? machineCost : calculateTotalPrice(input.sportType, input.durationHours) + machineCost;
    const halfCost = useFree ? 0 : BASKETBALL_HALF_RATE * input.durationHours;

    const booking: Booking = {
      id: uuidv4(),
      userId: input.userId,
      bookingType: 'court',
      sportType: input.sportType,
      courtId: input.courtId,
      coachId: null,
      usesMainCourt: true,
      courtHalf,
      startTime: startISO,
      endTime: endISO,
      durationMinutes: input.durationHours * 60,
      totalPrice: half ? halfCost : fullCost,
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
    // Surface the actual reason when it isn't a court clash (e.g. past time).
    const allPast = blocked.length > 0 && blocked.every((b) => b.reason === 'That start time is in the past.');
    return {
      ok: false,
      created,
      blocked,
      error: allPast
        ? 'That start time is in the past. Pick a future slot.'
        : 'This slot is unavailable because basketball and tennis share the same court.',
    };
  }

  return { ok: true, created, blocked };
}
