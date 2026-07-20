import { Booking, LoyaltySettings, LoyaltyTierPerks, LoyaltyTransaction } from '@/models';

// ---------------------------------------------------------------------------
// RizeON Rewards calculations used to present the server-backed loyalty state.
// Booking-history calculations remain as an offline fallback when the ledger
// has not loaded yet.
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

export const DEFAULT_TIER_PERKS: LoyaltyTierPerks = {
  bronze: TIERS.find((t) => t.key === 'bronze')?.perks ?? [],
  silver: TIERS.find((t) => t.key === 'silver')?.perks ?? [],
  gold: TIERS.find((t) => t.key === 'gold')?.perks ?? [],
  platinum: TIERS.find((t) => t.key === 'platinum')?.perks ?? [],
};

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  firstBookingBonus: 50,
  pointsPerBooking: 10,
  completionBonus: 5,
  noShowPenalty: 20,
};

export const FIRST_BOOKING_BONUS = DEFAULT_LOYALTY_SETTINGS.firstBookingBonus;
export const POINTS_PER_BOOKING = DEFAULT_LOYALTY_SETTINGS.pointsPerBooking;
export const COMPLETION_BONUS = DEFAULT_LOYALTY_SETTINGS.completionBonus;
export const NO_SHOW_POINT_PENALTY = DEFAULT_LOYALTY_SETTINGS.noShowPenalty;

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

export function computeLoyalty(
  bookings: Booking[],
  settings: LoyaltySettings = DEFAULT_LOYALTY_SETTINGS,
): LoyaltyState {
  const active = bookings
    .filter((b) => (b.status === 'confirmed' || b.status === 'completed') && !b.noShow)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const earnedPoints = active.reduce((sum, b, index) => {
    const base = index === 0 ? settings.firstBookingBonus : settings.pointsPerBooking;
    const completion = b.status === 'completed' ? settings.completionBonus : 0;
    return sum + base + completion;
  }, 0);
  const noShowPenalty = bookings.filter((b) => b.noShow && b.status !== 'cancelled').length * settings.noShowPenalty;
  const points = Math.max(0, earnedPoints - noShowPenalty);

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
  // Count only bookings an admin actually marked completed (completedAt set),
  // NOT the client-derived "completed" status that supabaseService applies to any
  // confirmed booking whose time has passed. The server's free_reward_balance()
  // counts real completions only, so deriving from status here would show the
  // "use a free session" toggle for a reward the server rejects/charges.
  const now = Date.now();
  const goodBookings = bookings.filter(
    (b) => b.completedAt != null && !b.noShow && !b.isFreeReward && new Date(b.endTime).getTime() <= now,
  ).length;
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

export function computeLoyaltyFromTransactions(
  transactions: LoyaltyTransaction[],
  bookings: Booking[] = [],
): LoyaltyState {
  const points = Math.max(0, transactions.reduce((sum, tx) => sum + tx.points, 0));

  let tier = TIERS[0];
  for (const t of TIERS) if (points >= t.min) tier = t;

  const idx = TIERS.findIndex((t) => t.key === tier.key);
  const nextTier = idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
  const pointsToNext = nextTier ? Math.max(0, nextTier.min - points) : 0;
  const progress = nextTier
    ? Math.min(1, (points - tier.min) / (nextTier.min - tier.min))
    : 1;

  // Real admin completions only (see computeLoyalty for the rationale).
  const now = Date.now();
  const goodBookings = bookings.filter(
    (b) => b.completedAt != null && !b.noShow && !b.isFreeReward && new Date(b.endTime).getTime() <= now,
  ).length;
  const earnedFree = Math.floor(goodBookings / GOOD_BOOKINGS_PER_FREE);
  const redeemedFree = bookings.filter((b) => b.isFreeReward && b.status !== 'cancelled').length;
  const availableFree = Math.max(0, earnedFree - redeemedFree);
  const towardNext = goodBookings % GOOD_BOOKINGS_PER_FREE;

  return {
    points,
    sessions: bookings.filter((b) => b.status !== 'cancelled' && !b.noShow).length,
    tier,
    nextTier,
    pointsToNext,
    progress,
    goodBookings,
    earnedFree,
    redeemedFree,
    availableFree,
    toNextFree: GOOD_BOOKINGS_PER_FREE - towardNext,
    freeProgress: towardNext / GOOD_BOOKINGS_PER_FREE,
  };
}
