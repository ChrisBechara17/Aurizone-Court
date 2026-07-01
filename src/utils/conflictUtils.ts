import { Booking, CourtBlock } from '@/models';
import { parseISO } from 'date-fns';

/** A lightweight shape for a not-yet-created booking we want to validate. */
export interface ProposedBooking {
  startTime: string; // ISO
  endTime: string; // ISO
  usesMainCourt: boolean;
  coachId?: string | null;
}

/** True when two [start,end) intervals overlap. */
export function intervalsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const as = parseISO(aStart).getTime();
  const ae = parseISO(aEnd).getTime();
  const bs = parseISO(bStart).getTime();
  const be = parseISO(bEnd).getTime();
  // new_start < existing_end AND new_end > existing_start
  return as < be && ae > bs;
}

/**
 * Court conflict: the single shared Main Court is already reserved.
 * Applies ACROSS sports — a basketball booking blocks tennis and vice-versa.
 * Also conflicts with any CourtBlock interval.
 */
export function hasCourtConflict(
  proposed: ProposedBooking,
  existingBookings: Booking[],
  courtBlocks: CourtBlock[],
): boolean {
  if (!proposed.usesMainCourt) return false;

  const bookingConflict = existingBookings.some(
    (b) =>
      b.status === 'confirmed' &&
      b.usesMainCourt &&
      intervalsOverlap(proposed.startTime, proposed.endTime, b.startTime, b.endTime),
  );
  if (bookingConflict) return true;

  return courtBlocks.some((blk) =>
    intervalsOverlap(proposed.startTime, proposed.endTime, blk.startTime, blk.endTime),
  );
}

/**
 * Coach conflict: same coach already has a confirmed overlapping booking.
 */
export function hasCoachConflict(
  proposed: ProposedBooking,
  existingBookings: Booking[],
): boolean {
  if (!proposed.coachId) return false;
  return existingBookings.some(
    (b) =>
      b.status === 'confirmed' &&
      b.coachId === proposed.coachId &&
      intervalsOverlap(proposed.startTime, proposed.endTime, b.startTime, b.endTime),
  );
}
