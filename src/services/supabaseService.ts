import { supabase } from './supabaseClient';
import {
  AdminAuditLog,
  Booking,
  Coach,
  Court,
  CourtBlock,
  CourtRule,
  LoyaltySettings,
  LoyaltyTierKey,
  LoyaltyTierPerks,
  LoyaltyTransaction,
  OperatingHour,
  Pricing,
  PushToken,
  SchemaMigration,
  SecurityEvent,
  SportType,
  User,
  UserNotification,
  VenueLocation,
} from '@/models';
import { DEFAULT_PRICING } from '@/constants/prices';
import { DEFAULT_LOYALTY_SETTINGS, DEFAULT_TIER_PERKS } from '@/utils/loyalty';
import { invokeSecure, secureWritesEnabled } from './secureFunctionService';
import { DEFAULT_VENUE_LOCATION } from '@/constants/venue';

const BALL_MACHINE_RATE_KEY = 'ball_machine_rate';
const BASKETBALL_HALF_RATE_KEY = 'basketball_half_rate';
const BASKETBALL_HALF_RATE_PEAK_KEY = 'basketball_half_rate_peak';
const LOYALTY_FIRST_BOOKING_BONUS_KEY = 'loyalty_first_booking_bonus';
const LOYALTY_POINTS_PER_BOOKING_KEY = 'loyalty_points_per_booking';
const LOYALTY_COMPLETION_BONUS_KEY = 'loyalty_completion_bonus';
const LOYALTY_NO_SHOW_PENALTY_KEY = 'loyalty_no_show_penalty';
const TIER_PERK_KEYS: Record<LoyaltyTierKey, string> = {
  bronze: 'tier_perks_bronze',
  silver: 'tier_perks_silver',
  gold: 'tier_perks_gold',
  platinum: 'tier_perks_platinum',
};

const UPGRADE_HINTS: { needle: string; file: string }[] = [
  { needle: 'admin_audit_logs', file: 'operations-upgrades.sql' },
  { needle: 'user_notifications', file: 'operations-upgrades.sql' },
  { needle: 'loyalty_transactions', file: 'operations-upgrades.sql' },
  { needle: 'operating_hours', file: 'business-controls.sql' },
  { needle: 'push_tokens', file: 'push-readiness.sql' },
  { needle: 'schema_migrations', file: 'schema-migrations.sql' },
  { needle: 'cancel_reason', file: 'operations-upgrades.sql' },
  { needle: 'no_show_reason', file: 'operations-upgrades.sql' },
  { needle: 'completed_at', file: 'operations-upgrades.sql' },
];

function warnMissingUpgrade(error: any, fallbackFile?: string) {
  const msg = String(error?.message ?? error ?? '').toLowerCase();
  const code = String(error?.code ?? '');
  const hint = UPGRADE_HINTS.find((h) => msg.includes(h.needle));
  if (hint || code === '42P01' || code === '42703' || msg.includes('does not exist')) {
    const file = hint?.file ?? fallbackFile;
    if (file) console.warn(`Database upgrade missing: ${file}`);
  }
}

// PostgREST caps a single response at ~1000 rows, so an unbounded select on a
// growing table silently truncates. Page through with .range() until a short
// page comes back, so admin lists (bookings, ledger, occupancy) stay complete.
const PAGE_SIZE = 1000;
async function fetchAllRows<T extends { id: string }>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const all: T[] = [];
  const seen = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        all.push(row);
      }
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Data access layer for Supabase. Maps snake_case DB rows <-> camelCase models.
// Replaces the old AsyncStorage-backed storageService for shared data.
// ---------------------------------------------------------------------------

// ---- Mappers --------------------------------------------------------------

function toBooking(r: any): Booking {
  // Derive "completed" for confirmed bookings whose time has passed.
  let status: Booking['status'] = r.status;
  if (status === 'confirmed' && new Date(r.end_time).getTime() < Date.now()) {
    status = 'completed';
  }
  return {
    id: r.id,
    userId: r.user_id,
    bookingType: r.booking_type,
    sportType: r.sport_type,
    courtId: r.court_id,
    coachId: r.coach_id,
    usesMainCourt: r.uses_main_court,
    courtHalf: r.court_half ?? 'full',
    startTime: r.start_time,
    endTime: r.end_time,
    durationMinutes: r.duration_minutes,
    totalPrice: Number(r.total_price),
    status,
    isRecurring: r.is_recurring,
    recurrenceGroupId: r.recurrence_group_id,
    isFreeReward: r.is_free_reward,
    ballMachine: r.ball_machine,
    noShow: r.no_show,
    notificationId: r.notification_id,
    createdAt: r.created_at,
    cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason ?? null,
    noShowReason: r.no_show_reason ?? null,
    completedAt: r.completed_at ?? null,
  };
}

function bookingToRow(b: Booking) {
  return {
    id: b.id,
    user_id: b.userId,
    booking_type: b.bookingType,
    sport_type: b.sportType,
    court_id: b.courtId,
    coach_id: b.coachId,
    uses_main_court: b.usesMainCourt,
    court_half: b.courtHalf ?? 'full',
    start_time: b.startTime,
    end_time: b.endTime,
    duration_minutes: b.durationMinutes,
    total_price: b.totalPrice,
    status: b.status,
    is_recurring: b.isRecurring,
    recurrence_group_id: b.recurrenceGroupId,
    is_free_reward: b.isFreeReward ?? false,
    ball_machine: b.ballMachine ?? false,
    no_show: b.noShow ?? false,
    notification_id: b.notificationId ?? null,
    created_at: b.createdAt,
    cancelled_at: b.cancelledAt,
  };
}

/** court_occupancy view row -> a light Booking (times + sport only, no PII). */
function toOccupancy(r: any): Booking {
  const durationMinutes = Math.round(
    (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / 60000,
  );
  return {
    id: r.id,
    userId: '',
    bookingType: r.booking_type,
    sportType: r.sport_type,
    courtId: r.court_id,
    coachId: null,
    usesMainCourt: true,
    courtHalf: r.court_half ?? 'full',
    startTime: r.start_time,
    endTime: r.end_time,
    durationMinutes,
    totalPrice: 0,
    status: 'confirmed',
    isRecurring: false,
    recurrenceGroupId: null,
    createdAt: '',
    cancelledAt: null,
  };
}

function toCoach(r: any): Coach {
  return {
    id: r.id,
    name: r.name,
    supportedSports: r.supported_sports as SportType[],
    bio: r.bio,
    pricePerHour: Number(r.price_per_hour),
    phone: r.phone,
    isActive: r.is_active,
    rating: Number(r.rating),
  };
}

function toCourtBlock(r: any): CourtBlock {
  return {
    id: r.id,
    courtId: r.court_id,
    startTime: r.start_time,
    endTime: r.end_time,
    reason: r.reason,
  };
}

function toCourtRule(r: any): CourtRule {
  return { id: r.id, title: r.title, content: r.content, sortOrder: r.sort_order };
}

function toCourt(r: any): Court {
  return {
    id: r.id,
    name: r.name,
    supportedSports: r.supported_sports as SportType[],
    isActive: r.is_active,
  };
}

function toUser(r: any): User {
  return { id: r.id, name: r.name, phoneOrEmail: r.phone_or_email, isAdmin: !!r.is_admin };
}

function toOperatingHour(r: any): OperatingHour {
  return {
    dayOfWeek: Number(r.day_of_week),
    openTime: String(r.open_time).slice(0, 5),
    closeTime: String(r.close_time).slice(0, 5) === '00:00' ? '24:00' : String(r.close_time).slice(0, 5),
    isClosed: !!r.is_closed,
  };
}

function toAuditLog(r: any): AdminAuditLog {
  return {
    id: r.id,
    adminUserId: r.admin_user_id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    summary: r.summary,
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
  };
}

function toNotification(r: any): UserNotification {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    message: r.message,
    type: r.type,
    relatedEntityType: r.related_entity_type,
    relatedEntityId: r.related_entity_id,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

function toLoyaltyTransaction(r: any): LoyaltyTransaction {
  return {
    id: r.id,
    userId: r.user_id,
    bookingId: r.booking_id,
    type: r.type,
    points: Number(r.points),
    description: r.description,
    createdByAdminId: r.created_by_admin_id,
    createdAt: r.created_at,
  };
}

function toSchemaMigration(r: any): SchemaMigration {
  return {
    key: r.key,
    label: r.label,
    appliedAt: r.applied_at,
  };
}

function toPushToken(r: any): PushToken {
  return {
    id: r.id,
    userId: r.user_id,
    token: r.token,
    platform: r.platform,
    deviceId: r.device_id,
    isActive: !!r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toSecurityEvent(r: any): SecurityEvent {
  return { id: r.id, actorUserId: r.actor_user_id, action: r.action, outcome: r.outcome, metadata: r.metadata ?? {}, createdAt: r.created_at };
}

// ---- Service --------------------------------------------------------------

export const supabaseService = {
  async getMainCourt(): Promise<Court | null> {
    const { data } = await supabase.from('courts').select('*').limit(1).maybeSingle();
    return data ? toCourt(data) : null;
  },

  // Coaches -----------------------------------------------------------------
  async listCoaches(): Promise<Coach[]> {
    const { data, error } = await supabase.from('coaches').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(toCoach);
  },

  async insertCoach(input: {
    name: string;
    supportedSports: SportType[];
    bio: string;
    pricePerHour: number;
    phone: string;
  }): Promise<Coach> {
    if (secureWritesEnabled) return toCoach(await invokeSecure<any>('admin-management', { action: 'coach_create', ...input }));
    const { data, error } = await supabase
      .from('coaches')
      .insert({
        name: input.name,
        supported_sports: input.supportedSports,
        bio: input.bio,
        price_per_hour: input.pricePerHour,
        phone: input.phone,
        is_active: true,
        rating: 5,
      })
      .select()
      .single();
    if (error) throw error;
    return toCoach(data);
  },

  async updateCoach(
    id: string,
    input: { name: string; supportedSports: SportType[]; bio: string; pricePerHour: number; phone: string },
  ): Promise<void> {
    if (secureWritesEnabled) {
      await invokeSecure('admin-management', { action: 'coach_update', id, ...input });
      return;
    }
    const { error } = await supabase
      .from('coaches')
      .update({
        name: input.name,
        supported_sports: input.supportedSports,
        bio: input.bio,
        price_per_hour: input.pricePerHour,
        phone: input.phone,
      })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteCoach(id: string): Promise<void> {
    if (secureWritesEnabled) {
      await invokeSecure('admin-management', { action: 'coach_remove', id });
      return;
    }
    const { error } = await supabase.from('coaches').delete().eq('id', id);
    if (error) throw error;
  },

  // Court blocks ------------------------------------------------------------
  async listCourtBlocks(): Promise<CourtBlock[]> {
    const { data, error } = await supabase.from('court_blocks').select('*');
    if (error) throw error;
    return (data ?? []).map(toCourtBlock);
  },

  async insertCourtBlock(input: {
    courtId: string;
    startTime: string;
    endTime: string;
    reason: string;
  }): Promise<CourtBlock> {
    if (secureWritesEnabled) return toCourtBlock(await invokeSecure<any>('admin-bookings', {
      action: 'block_create', courtId: input.courtId, startTime: input.startTime, endTime: input.endTime, reason: input.reason,
    }));
    const { data, error } = await supabase
      .from('court_blocks')
      .insert({
        court_id: input.courtId,
        start_time: input.startTime,
        end_time: input.endTime,
        reason: input.reason,
      })
      .select()
      .single();
    if (error) throw error;
    return toCourtBlock(data);
  },

  async deleteCourtBlock(id: string): Promise<void> {
    if (secureWritesEnabled) {
      await invokeSecure('admin-bookings', { action: 'block_remove', blockId: id });
      return;
    }
    const { error } = await supabase.from('court_blocks').delete().eq('id', id);
    if (error) throw error;
  },

  // Bookings ----------------------------------------------------------------
  async listBookings(): Promise<Booking[]> {
    // RLS: regular users get their own rows; admins get all rows.
    const rows = await fetchAllRows<any>((from, to) =>
      supabase.from('bookings').select('*').order('start_time').order('id').range(from, to),
    );
    return rows.map(toBooking);
  },

  /** All confirmed court occupancy (times only, no user info) — for conflicts + timeline. */
  async listOccupancy(): Promise<Booking[]> {
    const rows = await fetchAllRows<any>((from, to) =>
      supabase.from('court_occupancy').select('*').order('start_time').order('id').range(from, to),
    );
    return rows.map(toOccupancy);
  },

  /** Insert bookings and return the stored rows — total_price is set server-side
   *  (see supabase/pricing.sql), so the returned rows carry the authoritative price. */
  async insertBookings(bookings: Booking[]): Promise<Booking[]> {
    if (secureWritesEnabled) {
      if (bookings.every((b) => b.bookingType === 'court')) {
        const rows = await invokeSecure<any[]>('booking-create', { bookings });
        return (rows ?? []).map(toBooking);
      }
      const rows = await invokeSecure<any[]>('admin-bookings', {
        action: 'coach_create',
        bookings: bookings.map((b) => ({
            id: b.id,
            userId: b.userId,
            sportType: b.sportType,
            courtId: b.courtId,
            coachId: b.coachId,
            usesMainCourt: b.usesMainCourt,
            startTime: b.startTime,
            endTime: b.endTime,
            durationMinutes: b.durationMinutes,
            isRecurring: b.isRecurring,
            recurrenceGroupId: b.recurrenceGroupId,
            totalPrice: b.totalPrice,
        })),
      });
      return (rows ?? []).map(toBooking);
    }
    const { data, error } = await supabase
      .from('bookings')
      .insert(bookings.map(bookingToRow))
      .select();
    if (error) {
      // Translate the DB guard's errors into friendly messages, but preserve the
      // Postgres error code so callers can react (e.g. retry a half-court race).
      const wrap = (message: string, code?: string) => {
        const e = new Error(message) as Error & { code?: string };
        if (code) e.code = code;
        return e;
      };
      if (error.code === '23P01') {
        // exclusion_violation — another confirmed booking overlaps this slot.
        throw wrap('That time was just booked by someone else. Please pick another slot.', '23P01');
      }
      if (error.message?.toLowerCase().includes('blocked')) {
        throw wrap('The court is blocked during this time.', error.code);
      }
      throw wrap(error.message || 'Could not save booking.', error.code);
    }
    return (data ?? []).map(toBooking);
  },

  async updateBooking(
    id: string,
    patch: Partial<{
      status: Booking['status'];
      cancelledAt: string | null;
      noShow: boolean;
      notificationId: string | null;
      cancelReason: string | null;
      noShowReason: string | null;
      completedAt: string | null;
      startTime: string;
      endTime: string;
      durationMinutes: number;
      totalPrice: number;
      overrideOperatingHours: boolean;
    }>,
  ): Promise<void> {
    if (secureWritesEnabled && ('status' in patch || 'noShow' in patch || 'startTime' in patch)) {
      if (patch.status === 'cancelled') await invokeSecure('admin-bookings', { action: 'cancel', bookingId: id, reason: patch.cancelReason || 'Cancelled by admin' });
      else if (patch.status === 'completed') await invokeSecure('admin-bookings', { action: 'complete', bookingId: id });
      else if (patch.noShow) await invokeSecure('admin-bookings', { action: 'no_show', bookingId: id, reason: patch.noShowReason || 'No-show' });
      else if (patch.startTime && patch.endTime && patch.durationMinutes) await invokeSecure('admin-bookings', { action: 'reschedule', bookingId: id, startTime: patch.startTime, endTime: patch.endTime, durationMinutes: patch.durationMinutes, overrideOperatingHours: patch.overrideOperatingHours ?? false });
      return;
    }
    if (secureWritesEnabled && 'notificationId' in patch) {
      const { error } = await supabase.rpc('set_own_booking_reminder', { p_booking_id: id, p_notification_id: patch.notificationId });
      if (error) throw error;
      return;
    }
    const row: Record<string, unknown> = {};
    if ('status' in patch) row.status = patch.status;
    if ('cancelledAt' in patch) row.cancelled_at = patch.cancelledAt;
    if ('noShow' in patch) row.no_show = patch.noShow;
    if ('notificationId' in patch) row.notification_id = patch.notificationId;
    if ('cancelReason' in patch) row.cancel_reason = patch.cancelReason;
    if ('noShowReason' in patch) row.no_show_reason = patch.noShowReason;
    if ('completedAt' in patch) row.completed_at = patch.completedAt;
    if ('startTime' in patch) row.start_time = patch.startTime;
    if ('endTime' in patch) row.end_time = patch.endTime;
    if ('durationMinutes' in patch) row.duration_minutes = patch.durationMinutes;
    if ('totalPrice' in patch) row.total_price = patch.totalPrice;
    const { error } = await supabase.from('bookings').update(row).eq('id', id);
    if (error) {
      warnMissingUpgrade(error, 'operations-upgrades.sql');
      throw error;
    }
  },

  // Audit logs ---------------------------------------------------------------
  async listAuditLogs(): Promise<AdminAuditLog[]> {
    const { data, error } = await supabase
      .from('admin_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(150);
    if (error) {
      warnMissingUpgrade(error, 'operations-upgrades.sql');
      throw error;
    }
    return (data ?? []).map(toAuditLog);
  },

  async insertAuditLog(input: {
    adminUserId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
  }): Promise<AdminAuditLog> {
    const { data, error } = await supabase
      .from('admin_audit_logs')
      .insert({
        admin_user_id: input.adminUserId,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        summary: input.summary,
        metadata: input.metadata ?? {},
      })
      .select()
      .single();
    if (error) {
      warnMissingUpgrade(error, 'operations-upgrades.sql');
      throw error;
    }
    return toAuditLog(data);
  },

  // In-app notifications -----------------------------------------------------
  async listNotifications(userId?: string): Promise<UserNotification[]> {
    let query = supabase
      .from('user_notifications')
      .select('*')
      .order('created_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) {
      warnMissingUpgrade(error, 'operations-upgrades.sql');
      throw error;
    }
    return (data ?? []).map(toNotification);
  },

  async insertNotification(input: {
    userId: string;
    title: string;
    message: string;
    type: string;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
  }): Promise<UserNotification> {
    if (secureWritesEnabled) return toNotification(await invokeSecure<any>('admin-notifications', {
      userId: input.userId, title: input.title, message: input.message,
    }));
    const { data, error } = await supabase
      .from('user_notifications')
      .insert({
        user_id: input.userId,
        title: input.title,
        message: input.message,
        type: input.type,
        related_entity_type: input.relatedEntityType ?? null,
        related_entity_id: input.relatedEntityId ?? null,
      })
      .select()
      .single();
    if (error) {
      warnMissingUpgrade(error, 'operations-upgrades.sql');
      throw error;
    }
    return toNotification(data);
  },

  async markNotificationRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      warnMissingUpgrade(error, 'operations-upgrades.sql');
      throw error;
    }
  },

  async markAllNotificationsRead(userId?: string): Promise<void> {
    let query = supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null);
    if (userId) query = query.eq('user_id', userId);
    const { error } = await query;
    if (error) {
      warnMissingUpgrade(error, 'operations-upgrades.sql');
      throw error;
    }
  },

  // Loyalty ledger -----------------------------------------------------------
  async listLoyaltyTransactions(): Promise<LoyaltyTransaction[]> {
    try {
      const rows = await fetchAllRows<any>((from, to) =>
        supabase
          .from('loyalty_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      );
      return rows.map(toLoyaltyTransaction);
    } catch (error) {
      warnMissingUpgrade(error, 'operations-upgrades.sql');
      throw error;
    }
  },

  // Push readiness ----------------------------------------------------------
  async upsertPushToken(input: {
    userId: string;
    token: string;
    platform?: string | null;
    deviceId?: string | null;
    bookingRemindersEnabled?: boolean;
  }): Promise<PushToken | null> {
    if (secureWritesEnabled) {
      const row = await invokeSecure<any>('device-token', {
        action: 'register',
        token: input.token,
        platform: input.platform ?? null,
        deviceId: input.deviceId ?? null,
        bookingRemindersEnabled: input.bookingRemindersEnabled ?? true,
      });
      return row ? toPushToken(row) : null;
    }
    const { data, error } = await supabase.rpc('register_push_token', {
      push_token: input.token,
      push_platform: input.platform ?? null,
      push_device_id: input.deviceId ?? null,
    });
    if (error) {
      warnMissingUpgrade(error, 'push-readiness.sql');
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return row ? toPushToken(row) : null;
  },

  async deactivatePushToken(token: string): Promise<void> {
    if (secureWritesEnabled) {
      await invokeSecure('device-token', { action: 'deactivate', token });
      return;
    }
    const { error } = await supabase.rpc('deactivate_push_token', { push_token: token });
    if (error) {
      warnMissingUpgrade(error, 'push-readiness.sql');
      throw error;
    }
  },

  async listPushTokens(userId?: string): Promise<PushToken[]> {
    let query = supabase.from('push_tokens').select('*').eq('is_active', true);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) {
      warnMissingUpgrade(error, 'push-readiness.sql');
      throw error;
    }
    return (data ?? []).map(toPushToken);
  },

  // Schema migrations -------------------------------------------------------
  async listSchemaMigrations(): Promise<SchemaMigration[]> {
    const { data, error } = await supabase.from('schema_migrations').select('*').order('key');
    if (error) {
      warnMissingUpgrade(error, 'schema-migrations.sql');
      throw error;
    }
    return (data ?? []).map(toSchemaMigration);
  },

  async listSecurityEvents(): Promise<SecurityEvent[]> {
    const { data, error } = await supabase.from('security_events').select('id,actor_user_id,action,outcome,metadata,created_at').order('created_at', { ascending: false }).limit(50);
    if (error) {
      warnMissingUpgrade(error, 'security-boundary.sql');
      throw error;
    }
    return (data ?? []).map(toSecurityEvent);
  },

  // Court rules -------------------------------------------------------------
  async listCourtRules(): Promise<CourtRule[]> {
    const { data, error } = await supabase.from('court_rules').select('*').order('sort_order');
    if (error) throw error;
    return (data ?? []).map(toCourtRule);
  },

  async insertCourtRule(input: { title: string; content: string; sortOrder: number }): Promise<CourtRule> {
    if (secureWritesEnabled) return toCourtRule(await invokeSecure<any>('admin-management', { action: 'rule_create', ...input }));
    const { data, error } = await supabase
      .from('court_rules')
      .insert({ title: input.title, content: input.content, sort_order: input.sortOrder })
      .select()
      .single();
    if (error) throw error;
    return toCourtRule(data);
  },

  async updateCourtRule(
    id: string,
    patch: Partial<{ title: string; content: string; sortOrder: number }>,
  ): Promise<void> {
    if (secureWritesEnabled) {
      await invokeSecure('admin-management', { action: 'rule_update', id, ...patch });
      return;
    }
    const row: Record<string, unknown> = {};
    if ('title' in patch) row.title = patch.title;
    if ('content' in patch) row.content = patch.content;
    if ('sortOrder' in patch) row.sort_order = patch.sortOrder;
    const { error } = await supabase.from('court_rules').update(row).eq('id', id);
    if (error) throw error;
  },

  async deleteCourtRule(id: string): Promise<void> {
    if (secureWritesEnabled) {
      await invokeSecure('admin-management', { action: 'rule_remove', id });
      return;
    }
    const { error } = await supabase.from('court_rules').delete().eq('id', id);
    if (error) throw error;
  },

  // Users (admin roster) ----------------------------------------------------
  async listUsers(): Promise<User[]> {
    const { data, error } = await supabase.from('users').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(toUser);
  },

  // Pricing (admin-configurable) --------------------------------------------
  async listOperatingHours(): Promise<OperatingHour[]> {
    const { data, error } = await supabase.from('operating_hours').select('*').order('day_of_week');
    if (error) {
      warnMissingUpgrade(error, 'business-controls.sql');
      throw error;
    }
    return (data ?? []).map(toOperatingHour);
  },

  async updateOperatingHours(input: OperatingHour[]): Promise<void> {
    if (secureWritesEnabled) {
      await invokeSecure('admin-management', { action: 'operating_hours', rows: input });
      return;
    }
    const rows = input.map((h) => ({
      day_of_week: h.dayOfWeek,
      open_time: h.openTime === '24:00' ? '00:00' : h.openTime,
      close_time: h.closeTime === '24:00' ? '24:00' : h.closeTime,
      is_closed: h.isClosed,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('operating_hours').upsert(rows);
    if (error) throw error;
  },

  async getPricing(): Promise<Pricing> {
    const [pricesR, settingsR] = await Promise.all([
      supabase.from('sport_prices').select('sport_type, price_per_hour, peak_price_per_hour'),
      supabase.from('app_settings').select('key, value'),
    ]);
    const rows = pricesR.data ?? [];
    const settings = settingsR.data ?? [];
    const rate = (s: SportType, fallback: number) =>
      Number(rows.find((r) => r.sport_type === s)?.price_per_hour ?? fallback);
    const peakRate = (s: SportType, fallback: number) => {
      const row = rows.find((r) => r.sport_type === s);
      return Number(row?.peak_price_per_hour ?? row?.price_per_hour ?? fallback);
    };
    const setting = (key: string, fallback: number) =>
      Number(settings.find((s) => s.key === key)?.value ?? fallback);
    return {
      basketball: rate('basketball', DEFAULT_PRICING.basketball),
      basketballPeak: peakRate('basketball', DEFAULT_PRICING.basketballPeak),
      basketballHalf: setting(BASKETBALL_HALF_RATE_KEY, DEFAULT_PRICING.basketballHalf),
      basketballHalfPeak: setting(BASKETBALL_HALF_RATE_PEAK_KEY, DEFAULT_PRICING.basketballHalfPeak),
      tennis: rate('tennis', DEFAULT_PRICING.tennis),
      tennisPeak: peakRate('tennis', DEFAULT_PRICING.tennisPeak),
      ballMachineRate: setting(BALL_MACHINE_RATE_KEY, DEFAULT_PRICING.ballMachineRate),
    };
  },

  async getLoyaltySettings(): Promise<LoyaltySettings> {
    const { data } = await supabase.from('app_settings').select('key, value');
    const rows = data ?? [];
    const setting = (key: string, fallback: number) =>
      Number(rows.find((s) => s.key === key)?.value ?? fallback);
    return {
      firstBookingBonus: setting(LOYALTY_FIRST_BOOKING_BONUS_KEY, DEFAULT_LOYALTY_SETTINGS.firstBookingBonus),
      pointsPerBooking: setting(LOYALTY_POINTS_PER_BOOKING_KEY, DEFAULT_LOYALTY_SETTINGS.pointsPerBooking),
      completionBonus: setting(LOYALTY_COMPLETION_BONUS_KEY, DEFAULT_LOYALTY_SETTINGS.completionBonus),
      noShowPenalty: setting(LOYALTY_NO_SHOW_PENALTY_KEY, DEFAULT_LOYALTY_SETTINGS.noShowPenalty),
    };
  },

  // App config (admin-editable text settings) -----------------------------
  async getSupportPhone(): Promise<string | null> {
    const { data } = await supabase.from('app_config').select('value').eq('key', 'support_phone').maybeSingle();
    return data?.value ?? null;
  },

  async getVenueLocation(): Promise<VenueLocation | null> {
    const keys = ['venue_name', 'venue_short_location', 'venue_maps_url'];
    const { data, error } = await supabase.from('app_config').select('key, value').in('key', keys);
    if (error) throw error;
    if (!data?.length) return null;
    const value = (key: string, fallback: string) =>
      data.find((row) => row.key === key)?.value?.trim() || fallback;
    return {
      name: value('venue_name', DEFAULT_VENUE_LOCATION.name),
      shortLocation: value('venue_short_location', DEFAULT_VENUE_LOCATION.shortLocation),
      mapsUrl: value('venue_maps_url', DEFAULT_VENUE_LOCATION.mapsUrl),
    };
  },

  async getTierPerks(): Promise<LoyaltyTierPerks> {
    const { data } = await supabase.from('app_config').select('key, value').in('key', Object.values(TIER_PERK_KEYS));
    const rows = data ?? [];
    const read = (tier: LoyaltyTierKey) => {
      const raw = rows.find((r) => r.key === TIER_PERK_KEYS[tier])?.value;
      const lines = typeof raw === 'string'
        ? raw.split('\n').map((line) => line.trim()).filter(Boolean)
        : [];
      return lines.length > 0 ? lines : DEFAULT_TIER_PERKS[tier];
    };
    return {
      bronze: read('bronze'),
      silver: read('silver'),
      gold: read('gold'),
      platinum: read('platinum'),
    };
  },

  async setSupportPhone(value: string): Promise<void> {
    if (secureWritesEnabled) {
      await invokeSecure('admin-management', { action: 'support_phone', value });
      return;
    }
    const { error } = await supabase.from('app_config').upsert({ key: 'support_phone', value });
    if (error) throw error;
  },

  async setTierPerks(input: LoyaltyTierPerks): Promise<void> {
    if (secureWritesEnabled) {
      await invokeSecure('admin-management', { action: 'config_values', values: Object.fromEntries(Object.entries(input).map(([tier, lines]) => [TIER_PERK_KEYS[tier as LoyaltyTierKey], lines.map((line) => line.trim()).filter(Boolean).join('\n')])) });
      return;
    }
    const rows = (Object.keys(TIER_PERK_KEYS) as LoyaltyTierKey[]).map((tier) => ({
      key: TIER_PERK_KEYS[tier],
      value: input[tier].map((line) => line.trim()).filter(Boolean).join('\n'),
    }));
    const { error } = await supabase.from('app_config').upsert(rows);
    if (error) throw error;
  },

  async updatePricing(input: Pricing): Promise<void> {
    if (secureWritesEnabled) {
      await invokeSecure('admin-management', { action: 'pricing', ...input });
      return;
    }
    const results = await Promise.all([
      supabase.from('sport_prices')
        .update({ price_per_hour: input.basketball, peak_price_per_hour: input.basketballPeak })
        .eq('sport_type', 'basketball'),
      supabase.from('sport_prices')
        .update({ price_per_hour: input.tennis, peak_price_per_hour: input.tennisPeak })
        .eq('sport_type', 'tennis'),
      // upsert (not update().eq()): an UPDATE that matches zero rows returns no
      // error, so a missing settings key would silently no-op while the UI reports
      // success. upsert seeds the row instead. Mirrors updateLoyaltySettings below.
      supabase.from('app_settings').upsert({ key: BALL_MACHINE_RATE_KEY, value: input.ballMachineRate }),
      supabase.from('app_settings').upsert({ key: BASKETBALL_HALF_RATE_KEY, value: input.basketballHalf }),
      supabase.from('app_settings').upsert({ key: BASKETBALL_HALF_RATE_PEAK_KEY, value: input.basketballHalfPeak }),
    ]);
    const err = results.find((r) => r.error)?.error;
    if (err) throw err;
  },

  async updateLoyaltySettings(input: LoyaltySettings): Promise<void> {
    if (secureWritesEnabled) {
      await invokeSecure('admin-management', { action: 'config_values', values: {
        [LOYALTY_FIRST_BOOKING_BONUS_KEY]: input.firstBookingBonus,
        [LOYALTY_POINTS_PER_BOOKING_KEY]: input.pointsPerBooking,
        [LOYALTY_COMPLETION_BONUS_KEY]: input.completionBonus,
        [LOYALTY_NO_SHOW_PENALTY_KEY]: input.noShowPenalty,
      } });
      return;
    }
    const results = await Promise.all([
      supabase.from('app_settings').upsert({ key: LOYALTY_FIRST_BOOKING_BONUS_KEY, value: input.firstBookingBonus }),
      supabase.from('app_settings').upsert({ key: LOYALTY_POINTS_PER_BOOKING_KEY, value: input.pointsPerBooking }),
      supabase.from('app_settings').upsert({ key: LOYALTY_COMPLETION_BONUS_KEY, value: input.completionBonus }),
      supabase.from('app_settings').upsert({ key: LOYALTY_NO_SHOW_PENALTY_KEY, value: input.noShowPenalty }),
    ]);
    const err = results.find((r) => r.error)?.error;
    if (err) throw err;
  },
};
