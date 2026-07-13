// ---------------------------------------------------------------------------
// Domain models for the CourtHub demo.
// These mirror the future PostgreSQL schema so the storage layer can later be
// swapped for a NestJS + Postgres backend without touching the UI.
// ---------------------------------------------------------------------------

export type SportType = 'basketball' | 'tennis';

export type BookingType = 'court' | 'coach';

/** Which part of the court a booking occupies. Basketball can book a half
 *  ('a' = left, 'b' = right); tennis and everything else use 'full'. */
export type CourtHalf = 'full' | 'a' | 'b';

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed';

export interface User {
  id: string;
  name: string;
  phoneOrEmail: string;
  isAdmin: boolean;
}

export interface Court {
  id: string;
  name: string; // "Main Court"
  supportedSports: SportType[];
  isActive: boolean;
}

export interface SportPrice {
  sportType: SportType;
  pricePerHour: number;
}

/**
 * Admin-configurable pricing, loaded from Supabase (sport_prices + app_settings).
 * Court rates have an off-peak and a peak value; peak applies to bookings that
 * START at or after 4 PM (see PEAK_START_HOUR / isPeakStart). The ball-machine
 * add-on is a single flat rate.
 */
export interface Pricing {
  /** Full-court basketball, off-peak ($/hr). */
  basketball: number;
  /** Full-court basketball, peak ($/hr). */
  basketballPeak: number;
  /** Half-court basketball, off-peak ($/hr). */
  basketballHalf: number;
  /** Half-court basketball, peak ($/hr). */
  basketballHalfPeak: number;
  /** Tennis, off-peak ($/hr). */
  tennis: number;
  /** Tennis, peak ($/hr). */
  tennisPeak: number;
  /** Tennis ball-machine add-on ($/hr), flat regardless of peak. */
  ballMachineRate: number;
}

export interface OperatingHour {
  dayOfWeek: number; // 0 Sunday ... 6 Saturday
  openTime: string; // "HH:mm"
  closeTime: string; // "HH:mm"; "24:00" is midnight
  isClosed: boolean;
}

export interface LoyaltySettings {
  /** One-time base points for the user's first non-cancelled, non-no-show booking. */
  firstBookingBonus: number;
  /** Base points for each later non-cancelled, non-no-show booking. */
  pointsPerBooking: number;
  /** Extra points once a booking is successfully completed. */
  completionBonus: number;
  /** Points subtracted for each non-cancelled booking marked no-show. */
  noShowPenalty: number;
}

export type LoyaltyTierKey = 'bronze' | 'silver' | 'gold' | 'platinum';
export type LoyaltyTierPerks = Record<LoyaltyTierKey, string[]>;

export interface Coach {
  id: string;
  name: string;
  supportedSports: SportType[];
  bio: string;
  pricePerHour: number;
  phone: string;
  isActive: boolean;
  rating: number;
}

export interface Booking {
  id: string;
  userId: string;
  bookingType: BookingType;
  sportType: SportType;
  courtId: string | null;
  coachId: string | null;
  usesMainCourt: boolean;
  /** 'full' (default), or 'a'/'b' for a half-court basketball booking. */
  courtHalf?: CourtHalf;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  durationMinutes: number;
  totalPrice: number;
  status: BookingStatus;
  isRecurring: boolean;
  recurrenceGroupId: string | null;
  createdAt: string; // ISO 8601
  cancelledAt: string | null;
  cancelReason?: string | null;
  noShowReason?: string | null;
  completedAt?: string | null;
  /** Local reminder notification id (client-only; backend ignores this). */
  notificationId?: string | null;
  /** True when this booking was paid for with a loyalty free-session reward. */
  isFreeReward?: boolean;
  /** Admin-flagged: the user didn't show up (earns a strike / black dot). */
  noShow?: boolean;
  /** Tennis add-on: ball machine (ball launcher) was included. */
  ballMachine?: boolean;
}

export interface AdminAuditLog {
  id: string;
  adminUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface UserNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface LoyaltyTransaction {
  id: string;
  userId: string;
  bookingId: string | null;
  type: string;
  points: number;
  description: string;
  createdByAdminId: string | null;
  createdAt: string;
}

export interface SchemaMigration {
  key: string;
  label: string;
  appliedAt: string;
}

export interface SecurityEvent {
  id: string;
  actorUserId: string | null;
  action: string;
  outcome: 'denied' | 'rate_limited' | 'invalid_payload' | 'authorization_failed';
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PushToken {
  id: string;
  userId: string;
  token: string;
  platform: string | null;
  deviceId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CourtBlock {
  id: string;
  courtId: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  reason: string;
}

export interface CourtRule {
  id: string;
  title: string;
  content: string;
  /** Display order (ascending). Lower shows first. */
  sortOrder?: number;
}

export interface MembershipPackage {
  id: string;
  name: string;
  description: string;
  sportType: SportType | 'all';
  isComingSoon: boolean;
}
