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

/** Admin-configurable pricing, loaded from Supabase (sport_prices + app_settings). */
export interface Pricing {
  basketball: number;
  /** Half-court basketball rate ($/hr). */
  basketballHalf: number;
  tennis: number;
  ballMachineRate: number;
}

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
  /** Local reminder notification id (client-only; backend ignores this). */
  notificationId?: string | null;
  /** True when this booking was paid for with a loyalty free-session reward. */
  isFreeReward?: boolean;
  /** Admin-flagged: the user didn't show up (earns a strike / black dot). */
  noShow?: boolean;
  /** Tennis add-on: ball machine (ball launcher) was included. */
  ballMachine?: boolean;
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
}

export interface MembershipPackage {
  id: string;
  name: string;
  description: string;
  sportType: SportType | 'all';
  isComingSoon: boolean;
}
