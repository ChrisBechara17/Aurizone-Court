import { SportPrice, SportType } from '@/models';

// Displayed prices only — no payment processing in this demo.
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

// Business constraints.
// Bookings longer than 3h are not allowed; ≤3h auto-confirm.
export const MAX_DURATION_HOURS = 3;
// Selectable durations (in hours): 30 min, 1h, 1h 30m, 2h.
export const ALLOWED_DURATIONS = [0.5, 1, 1.5, 2] as const;
export const REPEAT_OPTIONS = [2, 4, 8] as const; // weeks
export const AUTO_CONFIRM_MAX_MINUTES = MAX_DURATION_HOURS * 60;
