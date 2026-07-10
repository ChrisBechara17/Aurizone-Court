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
  SportType,
  User,
  UserNotification,
} from '@/models';
import { DEFAULT_PRICING } from '@/constants/prices';
import { DEFAULT_LOYALTY_SETTINGS, DEFAULT_TIER_PERKS } from '@/utils/loyalty';

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
    const { error } = await supabase.from('court_blocks').delete().eq('id', id);
    if (error) throw error;
  },

  // Bookings ----------------------------------------------------------------
  async listBookings(): Promise<Booking[]> {
    // RLS: regular users get their own rows; admins get all rows.
    const { data, error } = await supabase.from('bookings').select('*').order('start_time');
    if (error) throw error;
    return (data ?? []).map(toBooking);
  },

  /** All confirmed court occupancy (times only, no user info) — for conflicts + timeline. */
  async listOccupancy(): Promise<Booking[]> {
    const { data, error } = await supabase.from('court_occupancy').select('*').order('start_time');
    if (error) throw error;
    return (data ?? []).map(toOccupancy);
  },

  /** Insert bookings and return the stored rows — total_price is set server-side
   *  (see supabase/pricing.sql), so the returned rows carry the authoritative price. */
  async insertBookings(bookings: Booking[]): Promise<Booking[]> {
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
    }>,
  ): Promise<void> {
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
    const { data, error } = await supabase
      .from('loyalty_transactions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      warnMissingUpgrade(error, 'operations-upgrades.sql');
      throw error;
    }
    return (data ?? []).map(toLoyaltyTransaction);
  },

  async insertLoyaltyTransaction(input: {
    userId: string;
    bookingId?: string | null;
    type: string;
    points: number;
    description: string;
    createdByAdminId?: string | null;
  }): Promise<LoyaltyTransaction> {
    const { data, error } = await supabase
      .from('loyalty_transactions')
      .insert({
        user_id: input.userId,
        booking_id: input.bookingId ?? null,
        type: input.type,
        points: Math.round(input.points),
        description: input.description,
        created_by_admin_id: input.createdByAdminId ?? null,
      })
      .select()
      .single();
    if (error) {
      warnMissingUpgrade(error, 'operations-upgrades.sql');
      throw error;
    }
    return toLoyaltyTransaction(data);
  },

  // Push readiness ----------------------------------------------------------
  async upsertPushToken(input: {
    userId: string;
    token: string;
    platform?: string | null;
    deviceId?: string | null;
  }): Promise<PushToken | null> {
    const { data, error } = await supabase
      .from('push_tokens')
      .upsert({
        user_id: input.userId,
        token: input.token,
        platform: input.platform ?? null,
        device_id: input.deviceId ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'token' })
      .select()
      .maybeSingle();
    if (error) {
      warnMissingUpgrade(error, 'push-readiness.sql');
      throw error;
    }
    return data ? toPushToken(data) : null;
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

  // Court rules -------------------------------------------------------------
  async listCourtRules(): Promise<CourtRule[]> {
    const { data, error } = await supabase.from('court_rules').select('*').order('sort_order');
    if (error) throw error;
    return (data ?? []).map(toCourtRule);
  },

  async insertCourtRule(input: { title: string; content: string; sortOrder: number }): Promise<CourtRule> {
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
    const row: Record<string, unknown> = {};
    if ('title' in patch) row.title = patch.title;
    if ('content' in patch) row.content = patch.content;
    if ('sortOrder' in patch) row.sort_order = patch.sortOrder;
    const { error } = await supabase.from('court_rules').update(row).eq('id', id);
    if (error) throw error;
  },

  async deleteCourtRule(id: string): Promise<void> {
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
    const { error } = await supabase.from('app_config').upsert({ key: 'support_phone', value });
    if (error) throw error;
  },

  async setTierPerks(input: LoyaltyTierPerks): Promise<void> {
    const rows = (Object.keys(TIER_PERK_KEYS) as LoyaltyTierKey[]).map((tier) => ({
      key: TIER_PERK_KEYS[tier],
      value: input[tier].map((line) => line.trim()).filter(Boolean).join('\n'),
    }));
    const { error } = await supabase.from('app_config').upsert(rows);
    if (error) throw error;
  },

  async updatePricing(input: Pricing): Promise<void> {
    const results = await Promise.all([
      supabase.from('sport_prices')
        .update({ price_per_hour: input.basketball, peak_price_per_hour: input.basketballPeak })
        .eq('sport_type', 'basketball'),
      supabase.from('sport_prices')
        .update({ price_per_hour: input.tennis, peak_price_per_hour: input.tennisPeak })
        .eq('sport_type', 'tennis'),
      supabase.from('app_settings').update({ value: input.ballMachineRate }).eq('key', BALL_MACHINE_RATE_KEY),
      supabase.from('app_settings').update({ value: input.basketballHalf }).eq('key', BASKETBALL_HALF_RATE_KEY),
      supabase.from('app_settings').update({ value: input.basketballHalfPeak }).eq('key', BASKETBALL_HALF_RATE_PEAK_KEY),
    ]);
    const err = results.find((r) => r.error)?.error;
    if (err) throw err;
  },

  async updateLoyaltySettings(input: LoyaltySettings): Promise<void> {
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
