import { Pricing, SportPrice, SportType } from '@/models';

// Displayed prices only — payment processing is not enabled.
export const SPORT_PRICES: SportPrice[] = [
  { sportType: 'basketball', pricePerHour: 30 },
  { sportType: 'tennis', pricePerHour: 20 },
];

export const getSportPrice = (sport: SportType): number =>
  SPORT_PRICES.find((p) => p.sportType === sport)?.pricePerHour ?? 0;

// Tennis-only add-on: automatic ball machine (ball launcher), charged per hour.
export const BALL_MACHINE_RATE = 15;

// Basketball half-court rate ($/hr). Fallback only — the live value is admin-set
// (app_settings.basketball_half_rate) and the server recomputes total_price.
export const BASKETBALL_HALF_RATE = 18;

// Fallback pricing (used before the live admin-set values load from Supabase).
// Peak rates apply to bookings starting at/after 4 PM; ball machine is flat.
export const DEFAULT_PRICING: Pricing = {
  basketball: 30,
  basketballPeak: 40,
  basketballHalf: 18,
  basketballHalfPeak: 24,
  tennis: 20,
  tennisPeak: 28,
  ballMachineRate: 15,
};

/** Per-hour court rate for a sport, honoring half-court and peak/off-peak. */
export function courtRate(
  pricing: Pricing,
  sport: SportType,
  half: boolean,
  peak: boolean,
): number {
  if (sport === 'basketball') {
    if (half) return peak ? pricing.basketballHalfPeak : pricing.basketballHalf;
    return peak ? pricing.basketballPeak : pricing.basketball;
  }
  return peak ? pricing.tennisPeak : pricing.tennis;
}

// Business constraints.
// Bookings longer than 3h are not allowed; ≤3h auto-confirm.
export const MAX_DURATION_HOURS = 3;
// Selectable durations (in hours): 30 min through the 3-hour business limit.
export const ALLOWED_DURATIONS = [0.5, 1, 1.5, 2, 3] as const;
export const REPEAT_OPTIONS = [2, 4, 8] as const; // weeks
export const AUTO_CONFIRM_MAX_MINUTES = MAX_DURATION_HOURS * 60;
