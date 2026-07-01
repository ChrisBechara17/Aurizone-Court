import { Booking } from '@/models';

// ---------------------------------------------------------------------------
// CourtHub Rewards — a lightweight loyalty system derived from booking history.
// Demo only: points are computed from local bookings, no real redemption.
// When the backend lands, this logic moves server-side and points become a
// stored balance on the User.
// ---------------------------------------------------------------------------

export interface LoyaltyTier {
  key: 'bronze' | 'silver' | 'gold' | 'platinum';
  name: string;
  min: number; // points needed to reach this tier
  color: string;
  perks: string[];
}

export const TIERS: LoyaltyTier[] = [
  {
    key: 'bronze',
    name: 'Bronze',
    min: 0,
    color: '#cd7f32',
    perks: ['Earn points on every booking', 'Birthday surprise session'],
  },
  {
    key: 'silver',
    name: 'Silver',
    min: 200,
    color: '#c8d0e0',
    perks: ['Everything in Bronze', '5% off display prices', 'Early access to new slots'],
  },
  {
    key: 'gold',
    name: 'Gold',
    min: 500,
    color: '#ffd24a',
    perks: ['Everything in Silver', '1 free coaching add-on / month', 'Priority Main Court booking'],
  },
  {
    key: 'platinum',
    name: 'Platinum',
    min: 1000,
    color: '#7ad7ff',
    perks: ['Everything in Gold', 'Free monthly court hour', 'Dedicated concierge booking'],
  },
];

/** Points earned per hour of confirmed/completed court time. */
export const POINTS_PER_HOUR = 50;

/** Complete this many "good" (completed, non-cancelled) bookings to earn a free session. */
export const GOOD_BOOKINGS_PER_FREE = 10;

export interface LoyaltyState {
  points: number;
  sessions: number;
  tier: LoyaltyTier;
  nextTier: LoyaltyTier | null;
  pointsToNext: number;
  progress: number; // 0..1 within the current tier band

  // Free-session rewards ("every 10 good bookings = 1 free").
  goodBookings: number; // completed sessions
  earnedFree: number; // total free sessions earned
  redeemedFree: number; // free sessions already used (non-cancelled)
  availableFree: number; // ready to redeem now
  toNextFree: number; // good bookings still needed for the next free
  freeProgress: number; // 0..1 toward the next free session
}

export function computeLoyalty(bookings: Booking[]): LoyaltyState {
  const active = bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed');
  const points = active.reduce(
    (sum, b) => sum + Math.round((b.durationMinutes / 60) * POINTS_PER_HOUR),
    0,
  );

  // Highest tier whose threshold we've reached.
  let tier = TIERS[0];
  for (const t of TIERS) if (points >= t.min) tier = t;

  const idx = TIERS.findIndex((t) => t.key === tier.key);
  const nextTier = idx < TIERS.length - 1 ? TIERS[idx + 1] : null;

  const pointsToNext = nextTier ? Math.max(0, nextTier.min - points) : 0;
  const progress = nextTier
    ? Math.min(1, (points - tier.min) / (nextTier.min - tier.min))
    : 1;

  // --- Free-session rewards --------------------------------------------
  // No-shows don't count as "good" bookings.
  const goodBookings = bookings.filter((b) => b.status === 'completed' && !b.noShow).length;
  const earnedFree = Math.floor(goodBookings / GOOD_BOOKINGS_PER_FREE);
  // Redemption is derived from bookings flagged as free (cancelled ones refund automatically).
  const redeemedFree = bookings.filter((b) => b.isFreeReward && b.status !== 'cancelled').length;
  const availableFree = Math.max(0, earnedFree - redeemedFree);
  const towardNext = goodBookings % GOOD_BOOKINGS_PER_FREE;
  const toNextFree = GOOD_BOOKINGS_PER_FREE - towardNext;
  const freeProgress = towardNext / GOOD_BOOKINGS_PER_FREE;

  return {
    points,
    sessions: active.length,
    tier,
    nextTier,
    pointsToNext,
    progress,
    goodBookings,
    earnedFree,
    redeemedFree,
    availableFree,
    toNextFree,
    freeProgress,
  };
}
