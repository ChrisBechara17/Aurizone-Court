import { Booking, CourtBlock, CourtHalf } from '@/models';
import { parseISO } from 'date-fns';

/** A lightweight shape for a not-yet-created booking we want to validate. */
export interface ProposedBooking {
  startTime: string; // ISO
  endTime: string; // ISO
  usesMainCourt: boolean;
  /** 'full' occupies both halves; 'a'/'b' occupy one. Defaults to 'full'. */
  courtHalf?: CourtHalf;
  coachId?: string | null;
}

/** Numeric span a half occupies: full [0,2), a [0,1), b [1,2). */
const halfSpan = (h: CourtHalf = 'full'): [number, number] =>
  h === 'a' ? [0, 1] : h === 'b' ? [1, 2] : [0, 2];

/** Do two court halves share any physical space? (full overlaps everything.) */
export const halvesOverlap = (a: CourtHalf = 'full', b: CourtHalf = 'full'): boolean => {
  const [aLo, aHi] = halfSpan(a);
  const [bLo, bHi] = halfSpan(b);
  return aLo < bHi && bLo < aHi;
};

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

  // Conflicts only with bookings that overlap in time AND share the same half
  // (a full booking — incl. any tennis — shares both halves with everything).
  const bookingConflict = existingBookings.some(
    (b) =>
      b.status === 'confirmed' &&
      b.usesMainCourt &&
      intervalsOverlap(proposed.startTime, proposed.endTime, b.startTime, b.endTime) &&
      halvesOverlap(proposed.courtHalf, b.courtHalf),
  );
  if (bookingConflict) return true;

  // Admin blocks take the whole court, so they collide with any half.
  return courtBlocks.some((blk) =>
    intervalsOverlap(proposed.startTime, proposed.endTime, blk.startTime, blk.endTime),
  );
}

/**
 * For a half-court basketball booking, pick which side is free in [start,end).
 * Returns 'a'/'b', or null if no half is available (a full/tennis booking or a
 * block overlaps, or both halves are already taken).
 */
export function availableHalfSide(
  startTime: string,
  endTime: string,
  existingBookings: Booking[],
  courtBlocks: CourtBlock[],
): CourtHalf | null {
  const blocked = courtBlocks.some((blk) =>
    intervalsOverlap(startTime, endTime, blk.startTime, blk.endTime),
  );
  if (blocked) return null;

  const overlapping = existingBookings.filter(
    (b) =>
      b.status === 'confirmed' &&
      b.usesMainCourt &&
      intervalsOverlap(startTime, endTime, b.startTime, b.endTime),
  );
  if (overlapping.some((b) => (b.courtHalf ?? 'full') === 'full')) return null; // whole court taken
  const aTaken = overlapping.some((b) => b.courtHalf === 'a');
  const bTaken = overlapping.some((b) => b.courtHalf === 'b');
  if (aTaken && bTaken) return null;
  if (aTaken) return 'b';
  if (bTaken) return 'a';
  return 'a'; // both free — default to side A
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
