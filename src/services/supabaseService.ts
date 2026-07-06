import { supabase } from './supabaseClient';
import { Booking, Coach, Court, CourtBlock, Pricing, SportType, User } from '@/models';

const BALL_MACHINE_RATE_KEY = 'ball_machine_rate';
const BASKETBALL_HALF_RATE_KEY = 'basketball_half_rate';

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
      // Translate the DB guard's errors into friendly messages.
      if (error.code === '23P01') {
        // exclusion_violation — another confirmed booking overlaps this slot.
        throw new Error('That time was just booked by someone else. Please pick another slot.');
      }
      if (error.message?.toLowerCase().includes('blocked')) {
        throw new Error('The court is blocked during this time.');
      }
      throw new Error(error.message || 'Could not save booking.');
    }
    return (data ?? []).map(toBooking);
  },

  async updateBooking(
    id: string,
    patch: Partial<{ status: Booking['status']; cancelledAt: string | null; noShow: boolean; notificationId: string | null }>,
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if ('status' in patch) row.status = patch.status;
    if ('cancelledAt' in patch) row.cancelled_at = patch.cancelledAt;
    if ('noShow' in patch) row.no_show = patch.noShow;
    if ('notificationId' in patch) row.notification_id = patch.notificationId;
    const { error } = await supabase.from('bookings').update(row).eq('id', id);
    if (error) throw error;
  },

  // Users (admin roster) ----------------------------------------------------
  async listUsers(): Promise<User[]> {
    const { data, error } = await supabase.from('users').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(toUser);
  },

  // Pricing (admin-configurable) --------------------------------------------
  async getPricing(): Promise<Pricing> {
    const [pricesR, settingsR] = await Promise.all([
      supabase.from('sport_prices').select('sport_type, price_per_hour'),
      supabase.from('app_settings').select('key, value'),
    ]);
    const rows = pricesR.data ?? [];
    const settings = settingsR.data ?? [];
    const rate = (s: SportType, fallback: number) =>
      Number(rows.find((r) => r.sport_type === s)?.price_per_hour ?? fallback);
    const setting = (key: string, fallback: number) =>
      Number(settings.find((s) => s.key === key)?.value ?? fallback);
    return {
      basketball: rate('basketball', 30),
      basketballHalf: setting(BASKETBALL_HALF_RATE_KEY, 18),
      tennis: rate('tennis', 20),
      ballMachineRate: setting(BALL_MACHINE_RATE_KEY, 15),
    };
  },

  async updatePricing(input: Pricing): Promise<void> {
    const [a, b, c, d] = await Promise.all([
      supabase.from('sport_prices').update({ price_per_hour: input.basketball }).eq('sport_type', 'basketball'),
      supabase.from('sport_prices').update({ price_per_hour: input.tennis }).eq('sport_type', 'tennis'),
      supabase.from('app_settings').update({ value: input.ballMachineRate }).eq('key', BALL_MACHINE_RATE_KEY),
      supabase.from('app_settings').update({ value: input.basketballHalf }).eq('key', BASKETBALL_HALF_RATE_KEY),
    ]);
    const err = a.error ?? b.error ?? c.error ?? d.error;
    if (err) throw err;
  },
};
