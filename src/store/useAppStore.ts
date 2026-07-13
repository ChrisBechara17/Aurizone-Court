import { create } from 'zustand';
import {
  AdminAuditLog,
  Booking,
  Coach,
  Court,
  CourtBlock,
  CourtRule,
  LoyaltySettings,
  LoyaltyTierPerks,
  LoyaltyTransaction,
  OperatingHour,
  Pricing,
  SchemaMigration,
  SecurityEvent,
  SportType,
  User,
  UserNotification,
} from '@/models';
import { COURT_RULES } from '@/data/seedData';
import { storageService } from '@/services/storageService';
import { applyThemePalette, ThemeName } from '@/constants/colors';
import { authService } from '@/services/authService';
import { supabaseService } from '@/services/supabaseService';
import { CourtBookingInput, createCourtBooking, CreateResult, uuidv4 } from '@/services/bookingService';
import {
  cancelAllReminders,
  cancelReminder,
  configureNotifications,
  getPushSupportStatus,
  registerForPushToken,
  scheduleBookingReminder,
  sendExpoPush,
} from '@/services/notificationService';
import { calculateEndTime, combineDateAndTime, DEFAULT_OPERATING_HOURS, fitsWithinOperatingHours, generateWeeklyOccurrences, isPeakStart, operatingHoursForDate } from '@/utils/dateUtils';
import { hasCoachConflict, hasCourtConflict, intervalsOverlap } from '@/utils/conflictUtils';
import { CANCEL_CUTOFF_HOURS, canUserCancel } from '@/utils/accountStanding';
import { courtRate, DEFAULT_PRICING, MAX_DURATION_HOURS } from '@/constants/prices';
import { SUPPORT_PHONE } from '@/constants/admin';
import { DEFAULT_LOYALTY_SETTINGS, DEFAULT_TIER_PERKS } from '@/utils/loyalty';
import { secureWritesEnabled } from '@/services/secureFunctionService';

const PLACEHOLDER_COURT: Court = {
  id: '',
  name: 'Main Court',
  supportedSports: ['basketball', 'tennis'],
  isActive: true,
};

/** Resolve `p`, or `fallback` if it doesn't settle within `ms`. React Native's
 *  fetch has no timeout, so a black-holing network could otherwise hang forever. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

type ActionResult = { ok: boolean; error?: string; message?: string; createdCount?: number; skippedCount?: number };
type SignUpActionResult = ActionResult & { needsVerification?: boolean };

interface AppState {
  hydrated: boolean;
  onboarded: boolean;
  user: User | null;
  court: Court;
  coaches: Coach[];
  bookings: Booking[]; // the current user's bookings (all bookings if admin)
  occupancy: Booking[]; // times-only busy slots for everyone (conflicts + timeline)
  courtBlocks: CourtBlock[];
  courtRules: CourtRule[]; // admin-editable rules shown on the Rules screen
  users: User[]; // customer roster (admin view)
  pricing: Pricing; // admin-configurable rates (loaded from Supabase)
  loyaltySettings: LoyaltySettings; // admin-configurable rewards rules
  tierPerks: LoyaltyTierPerks; // admin-editable reward text shown per tier
  supportPhone: string; // admin-editable front-desk number shown for cancellations
  operatingHours: OperatingHour[];
  auditLogs: AdminAuditLog[];
  notifications: UserNotification[];
  loyaltyTransactions: LoyaltyTransaction[];
  schemaMigrations: SchemaMigration[];
  securityEvents: SecurityEvent[];
  pushStatus: { supported: boolean; reason: string; token: string | null };
  lastRefreshedAt: string | null;
  refreshError: string | null;
  remindersEnabled: boolean;
  theme: ThemeName;

  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<SignUpActionResult>;
  confirmSignup: (name: string, email: string, code: string) => Promise<ActionResult>;
  login: (email: string, password: string) => Promise<ActionResult>;
  resetPassword: (email: string) => Promise<ActionResult>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<ActionResult>;

  bookCourt: (input: Omit<CourtBookingInput, 'userId' | 'courtId'>) => Promise<CreateResult>;
  /** Admin: create a coach booking at a chosen slot. */
  bookCoachSession: (input: {
    coachId: string;
    userId: string;
    date: Date;
    startTime: string;
    durationHours: number;
    usesMainCourt: boolean;
    repeatCount?: number;
  }) => Promise<ActionResult>;
  cancelBooking: (id: string, force?: boolean, reason?: string) => Promise<ActionResult>;
  markBookingCompleted: (id: string) => Promise<ActionResult>;
  markBookingNoShow: (id: string, reason: string) => Promise<ActionResult>;
  rescheduleBooking: (id: string, input: { date: Date; startTime: string; durationHours: number; overrideOperatingHours?: boolean }) => Promise<ActionResult>;
  registerPushToken: () => Promise<void>;
  receiveRealtimeNotification: (notification: UserNotification) => void;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  adminSendNotification: (input: { userId: string; title: string; message: string }) => Promise<ActionResult>;
  setRemindersEnabled: (enabled: boolean) => Promise<void>;
  setTheme: (theme: ThemeName) => Promise<void>;

  // Admin
  addCourtBlock: (input: { date: Date; startTime: string; durationHours: number; reason: string }) => Promise<ActionResult>;
  removeCourtBlock: (id: string) => Promise<void>;
  updatePricing: (input: Pricing) => Promise<ActionResult>;
  updateOperatingHours: (input: OperatingHour[]) => Promise<ActionResult>;
  updateLoyaltySettings: (input: LoyaltySettings) => Promise<ActionResult>;
  updateTierPerks: (input: LoyaltyTierPerks) => Promise<ActionResult>;
  setSupportPhone: (value: string) => Promise<ActionResult>;
  addCoach: (input: {
    name: string;
    supportedSports: SportType[];
    bio: string;
    pricePerHour: number;
    phone: string;
  }) => Promise<ActionResult>;
  updateCoach: (
    id: string,
    input: { name: string; supportedSports: SportType[]; bio: string; pricePerHour: number; phone: string },
  ) => Promise<ActionResult>;
  removeCoach: (id: string) => Promise<void>;

  addRule: (input: { title: string; content: string }) => Promise<ActionResult>;
  updateRule: (id: string, input: { title: string; content: string }) => Promise<ActionResult>;
  removeRule: (id: string) => Promise<void>;
  reorderRule: (id: string, dir: 'up' | 'down') => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => {
  /** Schedule reminders for new bookings and persist their notification ids. */
  const attachReminders = async (created: Booking[]): Promise<Booking[]> => {
    if (!get().remindersEnabled) return created;
    const out: Booking[] = [];
    for (const b of created) {
      const nid = await scheduleBookingReminder(b);
      if (nid) {
        try {
          await supabaseService.updateBooking(b.id, { notificationId: nid });
        } catch {
          // best-effort
        }
      }
      out.push({ ...b, notificationId: nid });
    }
    return out;
  };

  const validateCoach = (input: { name: string; supportedSports: SportType[]; phone: string }): string | null => {
    if (!input.name.trim()) return 'Coach name is required.';
    if (input.supportedSports.length === 0) return 'Pick at least one sport.';
    if (!input.phone.trim()) return 'A contact phone number is required.';
    return null;
  };

  const audit = async (
    action: string,
    entityType: string,
    entityId: string | null,
    summary: string,
    metadata: Record<string, unknown> = {},
  ) => {
    if (secureWritesEnabled) return;
    const admin = get().user;
    if (!admin?.isAdmin) return;
    try {
      const log = await supabaseService.insertAuditLog({
        adminUserId: admin.id,
        action,
        entityType,
        entityId,
        summary,
        metadata,
      });
      set({ auditLogs: [log, ...get().auditLogs] });
    } catch {
      // Main admin action already succeeded; audit is best-effort in the client.
    }
  };

  const notifyUser = async (
    userId: string,
    title: string,
    message: string,
    type: string,
    relatedEntityType?: string,
    relatedEntityId?: string,
  ) => {
    if (secureWritesEnabled) return;
    try {
      const notification = await supabaseService.insertNotification({
        userId,
        title,
        message,
        type,
        relatedEntityType,
        relatedEntityId,
      });
      if (userId === get().user?.id) {
        set({ notifications: [notification, ...get().notifications] });
      }
      if (get().pushStatus.supported) {
        try {
          const tokens = await supabaseService.listPushTokens(userId);
          await sendExpoPush(tokens.map((t) => t.token), title, message, { type, relatedEntityType, relatedEntityId });
        } catch {
          // Push is best-effort; in-app notification already exists.
        }
      }
      await audit('notification.create', 'notification', notification.id, `Sent notification: ${title}`, { userId, type });
    } catch {
      // Notification failures should not roll back the primary booking action.
    }
  };

  const addLoyaltyTx = async (
    userId: string,
    bookingId: string | null,
    type: string,
    points: number,
    description: string,
    adminId: string | null = null,
  ) => {
    if (secureWritesEnabled) return;
    try {
      const tx = await supabaseService.insertLoyaltyTransaction({
        userId,
        bookingId,
        type,
        points,
        description,
        createdByAdminId: adminId,
      });
      if (userId === get().user?.id || get().user?.isAdmin) {
        set({ loyaltyTransactions: [tx, ...get().loyaltyTransactions] });
      }
    } catch {
      // Unique constraints intentionally make repeated lifecycle taps harmless.
    }
  };

  const reverseBookingLoyalty = async (booking: Booking, reason: string) => {
    if (secureWritesEnabled) return;
    const existing = get().loyaltyTransactions.filter((tx) => tx.bookingId === booking.id);
    const total = existing.reduce((sum, tx) => sum + tx.points, 0);
    if (total !== 0) {
      await addLoyaltyTx(booking.userId, booking.id, reason, -total, reason === 'booking_cancelled' ? 'Booking cancelled' : 'Booking no-show adjustment', get().user?.id ?? null);
    }
  };

  return {
    hydrated: false,
    onboarded: false,
    user: null,
    court: PLACEHOLDER_COURT,
    coaches: [],
    bookings: [],
    occupancy: [],
    courtBlocks: [],
    courtRules: COURT_RULES.map((r, i) => ({ ...r, sortOrder: i })),
    users: [],
    pricing: DEFAULT_PRICING,
    loyaltySettings: DEFAULT_LOYALTY_SETTINGS,
    tierPerks: DEFAULT_TIER_PERKS,
    supportPhone: SUPPORT_PHONE,
    operatingHours: DEFAULT_OPERATING_HOURS,
    auditLogs: [],
    notifications: [],
    loyaltyTransactions: [],
    schemaMigrations: [],
    securityEvents: [],
    pushStatus: { ...getPushSupportStatus(), token: null },
    lastRefreshedAt: null,
    refreshError: null,
    remindersEnabled: true,
    theme: 'dark',

    hydrate: async () => {
      configureNotifications();
      // A5: bound the auth read (a network profile query) and load shared data
      // in the background, so the splash can never hang forever on a black-holing
      // network. Local settings come from AsyncStorage and resolve immediately.
      const [user, onboarded, remindersEnabled, theme] = await Promise.all([
        withTimeout(authService.getCurrentUser(), 8000, null),
        storageService.getOnboarded(),
        storageService.getRemindersEnabled(),
        storageService.getTheme(),
      ]);
      applyThemePalette(theme);
      set({ user, onboarded, remindersEnabled, theme, hydrated: true, pushStatus: { ...getPushSupportStatus(), token: null } });
      if (user) void get().registerPushToken();
      // Fire-and-forget: the UI is already usable; data streams in when it lands.
      void get().refresh();
    },

    /** Load all shared data from Supabase. Resilient: one failing query does not
     *  discard the others (e.g. a missing view won't wipe the loaded court). */
    refresh: async () => {
      const refreshUserId = get().user?.id ?? null;
      const isAdmin = !!get().user?.isAdmin;
      const [courtR, coachesR, blocksR, bookingsR, occR, usersR, pricingR, loyaltyR, tierPerksR, supportR, rulesR, auditR, notificationsR, loyaltyTxR, hoursR, migrationsR, securityR] = await Promise.allSettled([
        supabaseService.getMainCourt(),
        supabaseService.listCoaches(),
        supabaseService.listCourtBlocks(),
        supabaseService.listBookings(),
        supabaseService.listOccupancy(),
        isAdmin ? supabaseService.listUsers() : Promise.resolve([] as User[]),
        supabaseService.getPricing(),
        supabaseService.getLoyaltySettings(),
        supabaseService.getTierPerks(),
        supabaseService.getSupportPhone(),
        supabaseService.listCourtRules(),
        isAdmin ? supabaseService.listAuditLogs() : Promise.resolve([] as AdminAuditLog[]),
        supabaseService.listNotifications(get().user?.id),
        supabaseService.listLoyaltyTransactions(),
        supabaseService.listOperatingHours(),
        isAdmin ? supabaseService.listSchemaMigrations() : Promise.resolve([] as SchemaMigration[]),
        isAdmin ? supabaseService.listSecurityEvents() : Promise.resolve([] as SecurityEvent[]),
      ]);

      const patch: Partial<AppState> = {};
      if (courtR.status === 'fulfilled' && courtR.value) patch.court = courtR.value;
      if (coachesR.status === 'fulfilled') patch.coaches = coachesR.value;
      if (blocksR.status === 'fulfilled') patch.courtBlocks = blocksR.value;
      if (bookingsR.status === 'fulfilled') patch.bookings = bookingsR.value;
      if (occR.status === 'fulfilled') patch.occupancy = occR.value;
      if (usersR.status === 'fulfilled') patch.users = usersR.value;
      if (pricingR.status === 'fulfilled') patch.pricing = pricingR.value;
      if (loyaltyR.status === 'fulfilled') patch.loyaltySettings = loyaltyR.value;
      if (tierPerksR.status === 'fulfilled') patch.tierPerks = tierPerksR.value;
      if (supportR.status === 'fulfilled' && supportR.value) patch.supportPhone = supportR.value;
      // Only replace the seed rules if the DB actually returned some.
      if (rulesR.status === 'fulfilled' && rulesR.value.length > 0) patch.courtRules = rulesR.value;
      if (auditR.status === 'fulfilled') patch.auditLogs = auditR.value;
      if (notificationsR.status === 'fulfilled') patch.notifications = notificationsR.value;
      if (loyaltyTxR.status === 'fulfilled') patch.loyaltyTransactions = loyaltyTxR.value;
      if (hoursR.status === 'fulfilled' && hoursR.value.length === 7) patch.operatingHours = hoursR.value;
      if (migrationsR.status === 'fulfilled') patch.schemaMigrations = migrationsR.value;
      if (securityR.status === 'fulfilled') patch.securityEvents = securityR.value;
      patch.lastRefreshedAt = new Date().toISOString();
      const failed = [courtR, coachesR, blocksR, bookingsR, occR, usersR, pricingR, loyaltyR, tierPerksR, supportR, rulesR, auditR, notificationsR, loyaltyTxR, hoursR, migrationsR, securityR]
        .some((r) => r.status === 'rejected');
      patch.refreshError = failed ? 'Some data could not be refreshed.' : null;
      // A detached refresh may outlive logout/account switching. Never let a
      // previous session repopulate the next account's private state.
      if ((get().user?.id ?? null) !== refreshUserId) return;
      set(patch);
    },

    completeOnboarding: async () => {
      await storageService.setOnboarded(true);
      set({ onboarded: true });
    },

    signUp: async (name, email, password) => {
      const res = await authService.signUp(name, email, password);
      if (!res.ok) return res;
      // Email confirmation on: the caller routes to the OTP screen; the profile
      // and session are established later by confirmSignup.
      if (res.needsVerification) return { ok: true, needsVerification: true };

      const user = await authService.getCurrentUser();
      if (user) {
        set({ user });
        void get().registerPushToken();
        await get().refresh();
      }
      return { ok: true, needsVerification: false };
    },

    confirmSignup: async (name, email, code) => {
      const verified = await authService.verifySignupCode(email, code);
      if (!verified.ok) return verified;
      const profile = await authService.ensureProfile(name, email);
      if (!profile.ok) return profile;
      const user = await authService.getCurrentUser();
      set({ user });
      void get().registerPushToken();
      await get().refresh();
      return { ok: true };
    },

    login: async (email, password) => {
      const res = await authService.signIn(email, password);
      if (!res.ok) return res;
      const user = await authService.getCurrentUser();
      set({ user });
      void get().registerPushToken();
      await get().refresh();
      return { ok: true };
    },

    resetPassword: async (email) => authService.resetPassword(email),

    registerPushToken: async () => {
      const user = get().user;
      const base = getPushSupportStatus();
      if (!user) {
        set({ pushStatus: { ...base, token: null } });
        return;
      }
      const res = await registerForPushToken();
      set({ pushStatus: { supported: base.supported, reason: res.reason, token: res.token } });
      if (!res.token) return;
      try {
        await supabaseService.upsertPushToken({
          userId: user.id,
          token: res.token,
          platform: 'native',
          deviceId: undefined,
        });
      } catch {
        // Optional DB upgrade may not be installed yet; warning is logged in the service.
      }
    },

    receiveRealtimeNotification: (notification) => {
      // Ignore late events from a channel that is being torn down during an
      // account switch, and merge updates without duplicating unread items.
      if (notification.userId !== get().user?.id) return;
      const current = get().notifications;
      const existingIndex = current.findIndex((item) => item.id === notification.id);
      if (existingIndex < 0) {
        set({ notifications: [notification, ...current] });
        return;
      }
      const next = [...current];
      next[existingIndex] = notification;
      set({ notifications: next });
    },

    logout: async () => {
      // S4: cancel this user's scheduled booking reminders so the next person to
      // sign in on this device doesn't receive notifications for someone else's
      // bookings (privacy + correctness).
      await cancelAllReminders();
      const pushToken = get().pushStatus.token;
      if (pushToken) {
        try {
          await supabaseService.deactivatePushToken(pushToken);
        } catch {
          // Push cleanup is best-effort; sign-out must still succeed.
        }
      }
      await authService.signOut();
      set({
        user: null,
        bookings: [],
        occupancy: [],
        users: [],
        notifications: [],
        loyaltyTransactions: [],
        auditLogs: [],
        pushStatus: { ...getPushSupportStatus(), token: null },
      });
    },

    deleteAccount: async () => {
      await cancelAllReminders();
      const res = await authService.deleteAccount();
      if (!res.ok) return res;
      set({
        user: null,
        bookings: [],
        occupancy: [],
        users: [],
        notifications: [],
        loyaltyTransactions: [],
        auditLogs: [],
        pushStatus: { ...getPushSupportStatus(), token: null },
      });
      return { ok: true };
    },

    bookCourt: async (input) => {
      const { user, court } = get();
      if (!user) return { ok: false, created: [], blocked: [], error: 'Please sign in first.' };
      if (!court.id) {
        return { ok: false, created: [], blocked: [], error: 'Court is still loading — please try again in a moment.' };
      }

      const hours = operatingHoursForDate(get().operatingHours, input.date);
      if (!fitsWithinOperatingHours(input.startTime, input.durationHours, hours)) {
        return {
          ok: false,
          created: [],
          blocked: [],
          error: hours.isClosed ? 'The court is closed that day.' : 'This session is outside operating hours.',
        };
      }

      // Standing/limit use the user's own bookings; court conflicts use everyone's
      // occupancy (occupancy rows have no userId, so they don't affect the limit).
      // Built from the latest store state so a retry sees refreshed occupancy.
      const build = () => {
        const { bookings, occupancy, courtBlocks } = get();
        return createCourtBooking(
          { ...input, userId: user.id, courtId: court.id },
          [...bookings, ...occupancy],
          courtBlocks,
        );
      };

      let result = build();
      if (result.created.length === 0) return result;

      let saved: Booking[];
      try {
        // Server sets the authoritative total_price (see supabase/pricing.sql).
        saved = await supabaseService.insertBookings(result.created);
      } catch (e: any) {
        // B4: half-court side race — another booker grabbed our side between the
        // occupancy read and our insert (Postgres 23P01). Refresh occupancy and
        // retry once; createCourtBooking will pick the still-free side.
        const isHalf = !!input.halfCourt && input.sportType === 'basketball' && !input.repeatWeekly;
        if (e?.code === '23P01' && isHalf) {
          await get().refresh();
          const retry = build();
          if (retry.created.length === 0) return retry;
          try {
            saved = await supabaseService.insertBookings(retry.created);
            result = retry;
          } catch (e2: any) {
            return { ok: false, created: [], blocked: retry.blocked, error: e2?.message ?? 'Could not save booking.' };
          }
        } else {
          return { ok: false, created: [], blocked: result.blocked, error: e?.message ?? 'Could not save booking.' };
        }
      }

      const withIds = await attachReminders(saved);
      let goodCount = get().bookings.filter((b) => b.userId === user.id && b.status !== 'cancelled' && !b.noShow).length;
      for (const b of withIds) {
        const points = goodCount === 0 ? get().loyaltySettings.firstBookingBonus : get().loyaltySettings.pointsPerBooking;
        await addLoyaltyTx(user.id, b.id, 'booking_base', points, goodCount === 0 ? 'First booking bonus' : 'Booking points');
        goodCount += 1;
      }
      set({
        bookings: [...get().bookings, ...withIds],
        occupancy: [...get().occupancy, ...withIds],
      });
      return { ...result, created: withIds };
    },

    bookCoachSession: async (input) => {
      const { user, coaches, court } = get();
      if (!user?.isAdmin) return { ok: false, error: 'Admins only.' };

      const coach = coaches.find((c) => c.id === input.coachId);
      if (!coach) return { ok: false, error: 'Please select a coach.' };
      if (!input.userId) return { ok: false, error: 'Missing booking owner.' };
      if (input.durationHours > MAX_DURATION_HOURS) {
        return { ok: false, error: 'Bookings longer than 3 hours are not allowed.' };
      }
      if (input.usesMainCourt && !court.id) {
        return { ok: false, error: 'Court is still loading — please try again in a moment.' };
      }

      const weeks = Math.max(1, input.repeatCount ?? 1);
      const firstStart = combineDateAndTime(input.date, input.startTime);
      const occurrences = generateWeeklyOccurrences(firstStart, weeks);
      const recurrenceGroupId = weeks > 1 ? uuidv4() : null;
      const created: Booking[] = [];
      let skippedCount = 0;

      // Same conflict utils as the rest of the app: the court must be free, and
      // the coach must not already be booked. Validate against existing rows plus
      // earlier occurrences from this batch.
      const { bookings, occupancy, courtBlocks } = get();
      const runningBookings = [...bookings];
      const runningOccupancy = [...bookings, ...occupancy];
      const now = Date.now();

      for (const start of occurrences) {
        const hours = operatingHoursForDate(get().operatingHours, start);
        const end = calculateEndTime(start, input.durationHours);
        const startISO = start.toISOString();
        const endISO = end.toISOString();

        if (start.getTime() <= now) {
          skippedCount += 1;
          continue;
        }
        if (!fitsWithinOperatingHours(input.startTime, input.durationHours, hours)) {
          skippedCount += 1;
          continue;
        }
        if (
          input.usesMainCourt &&
          hasCourtConflict(
            { startTime: startISO, endTime: endISO, usesMainCourt: true, courtHalf: 'full' },
            runningOccupancy,
            courtBlocks,
          )
        ) {
          skippedCount += 1;
          continue;
        }
        if (hasCoachConflict({ startTime: startISO, endTime: endISO, usesMainCourt: input.usesMainCourt, coachId: coach.id }, runningBookings)) {
          skippedCount += 1;
          continue;
        }

        const booking: Booking = {
          id: uuidv4(),
          userId: input.userId,
          bookingType: 'coach',
          sportType: coach.supportedSports[0] ?? 'basketball',
          courtId: input.usesMainCourt ? court.id : null,
          coachId: coach.id,
          usesMainCourt: input.usesMainCourt,
          courtHalf: 'full',
          startTime: startISO,
          endTime: endISO,
          durationMinutes: Math.round(input.durationHours * 60),
          totalPrice: coach.pricePerHour * input.durationHours,
          status: 'confirmed',
          isRecurring: weeks > 1,
          recurrenceGroupId,
          createdAt: new Date().toISOString(),
          cancelledAt: null,
          isFreeReward: false,
          ballMachine: false,
        };
        created.push(booking);
        runningBookings.push(booking);
        runningOccupancy.push(booking);
      }

      if (created.length === 0) {
        return { ok: false, error: weeks > 1 ? 'None of those weekly sessions are available.' : 'That coaching slot is unavailable.' };
      }

      let saved: Booking[];
      try {
        // Same persistence path as court bookings (translates DB guard errors).
        saved = await supabaseService.insertBookings(created);
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not create the coach booking.' };
      }
      // Schedule reminders + persist their notification ids, same as bookCourt.
      const stored = await attachReminders(saved.length > 0 ? saved : created);
      let goodCount = get().bookings.filter((b) => b.userId === input.userId && b.status !== 'cancelled' && !b.noShow).length;
      for (const b of stored) {
        const points = goodCount === 0 ? get().loyaltySettings.firstBookingBonus : get().loyaltySettings.pointsPerBooking;
        await addLoyaltyTx(input.userId, b.id, 'booking_base', points, goodCount === 0 ? 'First booking bonus' : 'Booking points', user.id);
        goodCount += 1;
      }
      set({
        bookings: [...get().bookings, ...stored],
        // A court-using coach session occupies the Main Court, so add it to the
        // occupancy the conflict checks read.
        occupancy: input.usesMainCourt ? [...get().occupancy, ...stored] : get().occupancy,
      });
      await audit('booking.coach.create', 'booking', stored[0]?.id ?? null, `Booked ${stored.length} coaching session${stored.length === 1 ? '' : 's'} with ${coach.name}.`, {
        coachId: coach.id,
        createdCount: stored.length,
        skippedCount,
        repeatCount: weeks,
      });
      await notifyUser(
        input.userId,
        'Coaching session booked',
        `${coach.name} is booked for ${stored.length === 1 ? 'your session' : `${stored.length} sessions`}.`,
        'booking_coach_created',
        'booking',
        stored[0]?.id,
      );
      return {
        ok: true,
        createdCount: stored.length,
        skippedCount,
        message: skippedCount > 0 ? `Booked ${stored.length}; skipped ${skippedCount} unavailable.` : undefined,
      };
    },

    cancelBooking: async (id, force = false, reason = '') => {
      const target = get().bookings.find((b) => b.id === id);
      if (!target) return { ok: false, error: 'Booking not found.' };
      if (!force && !canUserCancel(target)) {
        return {
          ok: false,
          error: `Bookings can't be cancelled within ${CANCEL_CUTOFF_HOURS} hours of the start time.`,
        };
      }
      const cancelledAt = new Date().toISOString();
      try {
        await supabaseService.updateBooking(id, {
          status: 'cancelled',
          cancelledAt,
          cancelReason: reason.trim() || null,
        });
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not cancel booking.' };
      }
      await reverseBookingLoyalty(target, 'booking_cancelled');
      void cancelReminder(target.notificationId);
      set({
        bookings: get().bookings.map((b) =>
          b.id === id ? { ...b, status: 'cancelled', cancelledAt, cancelReason: reason.trim() || null } : b,
        ),
        occupancy: get().occupancy.filter((o) => o.id !== id), // free the slot
      });
      if (force && get().user?.isAdmin) {
        await audit('booking.cancel', 'booking', id, `Cancelled booking${reason ? `: ${reason.trim()}` : ''}`, { reason });
        await notifyUser(
          target.userId,
          'Booking cancelled',
          reason.trim() ? `Your booking was cancelled: ${reason.trim()}` : 'Your booking was cancelled by the front desk.',
          'booking_cancelled',
          'booking',
          id,
        );
      }
      return { ok: true };
    },

    markBookingCompleted: async (id) => {
      const target = get().bookings.find((b) => b.id === id);
      if (!target) return { ok: false, error: 'Booking not found.' };
      if (target.status === 'cancelled') return { ok: false, error: 'Cancelled bookings cannot be completed.' };
      const completedAt = new Date().toISOString();
      try {
        await supabaseService.updateBooking(id, { status: 'completed', completedAt, noShow: false, noShowReason: null });
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not mark booking completed.' };
      }
      await addLoyaltyTx(target.userId, id, 'completion_bonus', get().loyaltySettings.completionBonus, 'Completed booking bonus', get().user?.id ?? null);
      set({
        bookings: get().bookings.map((b) =>
          b.id === id ? { ...b, status: 'completed', completedAt, noShow: false, noShowReason: null } : b,
        ),
        occupancy: get().occupancy.filter((o) => o.id !== id),
      });
      await audit('booking.complete', 'booking', id, 'Marked booking completed.');
      await notifyUser(target.userId, 'Booking completed', 'Your completed booking was added to your rewards.', 'booking_completed', 'booking', id);
      return { ok: true };
    },

    markBookingNoShow: async (id, reason) => {
      const target = get().bookings.find((b) => b.id === id);
      if (!target) return { ok: false, error: 'Booking not found.' };
      const cleanReason = reason.trim();
      if (!cleanReason) return { ok: false, error: 'A no-show reason is required.' };
      if (target.status === 'cancelled') return { ok: false, error: 'Cancelled bookings cannot be marked no-show.' };
      try {
        await supabaseService.updateBooking(id, { noShow: true, noShowReason: cleanReason });
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not mark no-show.' };
      }
      await reverseBookingLoyalty(target, 'no_show_adjustment');
      await addLoyaltyTx(target.userId, id, 'no_show_penalty', -get().loyaltySettings.noShowPenalty, 'No-show penalty', get().user?.id ?? null);
      set({
        bookings: get().bookings.map((b) => (b.id === id ? { ...b, noShow: true, noShowReason: cleanReason } : b)),
      });
      await audit('booking.no_show', 'booking', id, `Marked no-show: ${cleanReason}`, { reason: cleanReason });
      await notifyUser(target.userId, 'No-show recorded', `A no-show was recorded: ${cleanReason}`, 'booking_no_show', 'booking', id);
      return { ok: true };
    },

    rescheduleBooking: async (id, input) => {
      const admin = get().user;
      if (!admin?.isAdmin) return { ok: false, error: 'Only admins can reschedule bookings.' };
      const target = get().bookings.find((b) => b.id === id);
      if (!target) return { ok: false, error: 'Booking not found.' };
      if (target.status === 'cancelled') return { ok: false, error: 'Cancelled bookings cannot be rescheduled.' };
      if (input.durationHours > MAX_DURATION_HOURS) return { ok: false, error: 'Bookings longer than 3 hours are not allowed.' };

      const start = combineDateAndTime(input.date, input.startTime);
      const end = calculateEndTime(start, input.durationHours);
      // Guard the START, not the end: a booking that has already started is
      // instantly "completed" and bypasses limits / farms loyalty. Mirrors the
      // create flow (bookingService.ts) and the server B1 guard.
      const originalStart = new Date(target.startTime).getTime();
      if (start.getTime() <= Date.now() && start.getTime() !== originalStart) {
        return { ok: false, error: 'Pick a future time.' };
      }
      const startTime = start.toISOString();
      const endTime = end.toISOString();
      const existing = get().bookings.filter((b) => b.id !== id);
      const proposed = {
        startTime,
        endTime,
        usesMainCourt: target.usesMainCourt,
        courtHalf: target.courtHalf,
        coachId: target.coachId,
      };

      if (hasCourtConflict(proposed, existing, get().courtBlocks)) {
        return { ok: false, error: 'That time conflicts with an existing court booking or block.' };
      }
      if (hasCoachConflict(proposed, existing)) {
        return { ok: false, error: 'That coach already has a session at this time.' };
      }
      if (!input.overrideOperatingHours) {
        const hours = operatingHoursForDate(get().operatingHours, start);
        if (!fitsWithinOperatingHours(input.startTime, input.durationHours, hours)) {
          return { ok: false, error: 'That time is outside operating hours. Use override if this is intentional.' };
        }
      }

      const durationMinutes = Math.round(input.durationHours * 60);
      const peak = isPeakStart(start);
      let totalPrice = target.totalPrice;
      if (target.bookingType === 'coach') {
        const coach = get().coaches.find((c) => c.id === target.coachId);
        totalPrice = Math.round((coach?.pricePerHour ?? 0) * input.durationHours);
      } else if (target.isFreeReward) {
        totalPrice = target.ballMachine ? Math.round(get().pricing.ballMachineRate * input.durationHours) : 0;
      } else {
        totalPrice = Math.round(
          (courtRate(get().pricing, target.sportType, (target.courtHalf ?? 'full') !== 'full', peak) +
            (target.ballMachine ? get().pricing.ballMachineRate : 0)) * input.durationHours,
        );
      }

      // Persist the reschedule FIRST. Reminder wiring happens only after the DB
      // write succeeds, so a failed write can never cancel the old reminder or
      // leave a new reminder scheduled at a time that was never saved.
      try {
        await supabaseService.updateBooking(id, { startTime, endTime, durationMinutes, totalPrice });
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not reschedule booking.' };
      }

      let notificationId: string | null = null;
      const updated: Booking = { ...target, startTime, endTime, durationMinutes, totalPrice, notificationId: null };
      try {
        notificationId = get().remindersEnabled ? await scheduleBookingReminder(updated) : null;
      } catch {
        notificationId = null;
      }

      // Persist the replacement id before cancelling the old reminder. If this
      // write fails, remove the newly scheduled reminder so it cannot become an
      // orphan. The old reminder is also cancelled because its time is stale.
      try {
        await supabaseService.updateBooking(id, { notificationId });
        await cancelReminder(target.notificationId);
      } catch {
        await cancelReminder(notificationId);
        await cancelReminder(target.notificationId);
        notificationId = null;
      }

      set({
        bookings: get().bookings.map((b) => (b.id === id ? { ...updated, notificationId } : b)),
        occupancy: get().occupancy.map((b) => (b.id === id ? { ...b, startTime, endTime, durationMinutes } : b)),
      });
      await audit('booking.reschedule', 'booking', id, `Rescheduled booking from ${target.startTime} to ${startTime}.`, {
        oldStartTime: target.startTime,
        oldEndTime: target.endTime,
        newStartTime: startTime,
        newEndTime: endTime,
        overrideOperatingHours: !!input.overrideOperatingHours,
      });
      await notifyUser(
        target.userId,
        'Booking rescheduled',
        `Your booking was moved to ${start.toLocaleDateString()} at ${input.startTime}.`,
        'booking_rescheduled',
        'booking',
        id,
      );
      return { ok: true };
    },

    markNotificationRead: async (id) => {
      const notification = get().notifications.find((n) => n.id === id);
      if (!notification || notification.readAt) return;
      try {
        await supabaseService.markNotificationRead(id);
      } catch {
        return;
      }
      const readAt = new Date().toISOString();
      set({ notifications: get().notifications.map((n) => (n.id === id ? { ...n, readAt } : n)) });
    },

    markAllNotificationsRead: async () => {
      try {
        await supabaseService.markAllNotificationsRead(get().user?.id);
      } catch {
        return;
      }
      const readAt = new Date().toISOString();
      set({ notifications: get().notifications.map((n) => (n.readAt ? n : { ...n, readAt })) });
    },

    adminSendNotification: async (input) => {
      const cleanTitle = input.title.trim();
      const cleanMessage = input.message.trim();
      if (!get().user?.isAdmin) return { ok: false, error: 'Admins only.' };
      if (!cleanTitle || !cleanMessage) return { ok: false, error: 'Title and message are required.' };
      try {
        const notification = await supabaseService.insertNotification({
          userId: input.userId,
          title: cleanTitle,
          message: cleanMessage,
          type: 'admin_message',
          relatedEntityType: 'user',
          relatedEntityId: input.userId,
        });
        if (input.userId === get().user?.id) {
          set({ notifications: [notification, ...get().notifications] });
        }
        await audit('notification.create', 'notification', notification.id, `Sent notification: ${cleanTitle}`, { userId: input.userId });
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not send notification.' };
      }
      return { ok: true };
    },

    setRemindersEnabled: async (enabled) => {
      await storageService.setRemindersEnabled(enabled);
      set({ remindersEnabled: enabled });

      if (!enabled) {
        await cancelAllReminders();
        return;
      }
      const userId = get().user?.id;
      const upcoming = get().bookings.filter(
        (b) => b.userId === userId && b.status === 'confirmed' && new Date(b.startTime).getTime() > Date.now(),
      );
      const withIds = await attachReminders(upcoming);
      set({
        bookings: get().bookings.map((b) => withIds.find((w) => w.id === b.id) ?? b),
      });
    },

    setTheme: async (theme) => {
      applyThemePalette(theme); // mutate live palette BEFORE notifying subscribers
      set({ theme });
      await storageService.setTheme(theme);
    },

    updatePricing: async (input) => {
      const n = (v: number) => Math.max(0, Math.round(v)) || 0;
      const clean: Pricing = {
        basketball: n(input.basketball),
        basketballPeak: n(input.basketballPeak),
        basketballHalf: n(input.basketballHalf),
        basketballHalfPeak: n(input.basketballHalfPeak),
        tennis: n(input.tennis),
        tennisPeak: n(input.tennisPeak),
        ballMachineRate: n(input.ballMachineRate),
      };
      try {
        await supabaseService.updatePricing(clean);
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not update pricing.' };
      }
      set({ pricing: clean });
      await audit('pricing.update', 'pricing', null, 'Updated court pricing.', clean as unknown as Record<string, unknown>);
      return { ok: true };
    },

    updateOperatingHours: async (input) => {
      try {
        await supabaseService.updateOperatingHours(input);
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not update operating hours.' };
      }
      set({ operatingHours: input });
      await audit('operating_hours.update', 'operating_hours', null, 'Updated weekly operating hours.');
      return { ok: true };
    },

    updateLoyaltySettings: async (input) => {
      const n = (v: number) => Math.max(0, Math.round(v)) || 0;
      const clean: LoyaltySettings = {
        firstBookingBonus: n(input.firstBookingBonus),
        pointsPerBooking: n(input.pointsPerBooking),
        completionBonus: n(input.completionBonus),
        noShowPenalty: n(input.noShowPenalty),
      };
      try {
        await supabaseService.updateLoyaltySettings(clean);
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not update loyalty settings.' };
      }
      set({ loyaltySettings: clean });
      await audit('loyalty.settings.update', 'loyalty_settings', null, 'Updated loyalty point settings.', clean as unknown as Record<string, unknown>);
      return { ok: true };
    },

    updateTierPerks: async (input) => {
      const clean: LoyaltyTierPerks = {
        bronze: input.bronze.map((line) => line.trim()).filter(Boolean),
        silver: input.silver.map((line) => line.trim()).filter(Boolean),
        gold: input.gold.map((line) => line.trim()).filter(Boolean),
        platinum: input.platinum.map((line) => line.trim()).filter(Boolean),
      };
      try {
        await supabaseService.setTierPerks(clean);
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not update tier rewards.' };
      }
      set({ tierPerks: clean });
      await audit('loyalty.tier_rewards.update', 'tier_rewards', null, 'Updated loyalty tier rewards.', clean as unknown as Record<string, unknown>);
      return { ok: true };
    },

    setSupportPhone: async (value) => {
      const clean = value.trim();
      if (!clean) return { ok: false, error: 'Enter a phone number.' };
      try {
        await supabaseService.setSupportPhone(clean);
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not update the support number.' };
      }
      set({ supportPhone: clean });
      await audit('support_phone.update', 'app_config', null, `Updated support phone to ${clean}.`);
      return { ok: true };
    },

    addCourtBlock: async (input) => {
      const { court, bookings } = get();
      const start = combineDateAndTime(input.date, input.startTime);
      const end = calculateEndTime(start, input.durationHours);
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      const clash = bookings.some(
        (b) =>
          b.status === 'confirmed' &&
          b.usesMainCourt &&
          intervalsOverlap(startIso, endIso, b.startTime, b.endTime),
      );
      if (clash) {
        return { ok: false, error: 'There is already a confirmed booking in that window. Cancel it first.' };
      }

      try {
        const block = await supabaseService.insertCourtBlock({
          courtId: court.id,
          startTime: startIso,
          endTime: endIso,
          reason: input.reason.trim() || 'Maintenance',
        });
        set({ courtBlocks: [...get().courtBlocks, block] });
        await audit('court_block.create', 'court_block', block.id, `Blocked court: ${block.reason}.`, {
          startTime: block.startTime,
          endTime: block.endTime,
        });
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not block this time.' };
      }
    },

    removeCourtBlock: async (id) => {
      try {
        await supabaseService.deleteCourtBlock(id);
      } catch {
        return;
      }
      set({ courtBlocks: get().courtBlocks.filter((b) => b.id !== id) });
      await audit('court_block.remove', 'court_block', id, 'Removed court block.');
    },

    addCoach: async (input) => {
      const err = validateCoach(input);
      if (err) return { ok: false, error: err };
      try {
        const coach = await supabaseService.insertCoach({
          name: input.name.trim(),
          supportedSports: input.supportedSports,
          bio: input.bio.trim() || 'Private coaching',
          pricePerHour: Math.max(0, Math.round(input.pricePerHour)) || 0,
          phone: input.phone.trim(),
        });
        set({ coaches: [...get().coaches, coach] });
        await audit('coach.create', 'coach', coach.id, `Added coach ${coach.name}.`);
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not add coach.' };
      }
    },

    updateCoach: async (id, input) => {
      const err = validateCoach(input);
      if (err) return { ok: false, error: err };
      try {
        await supabaseService.updateCoach(id, {
          name: input.name.trim(),
          supportedSports: input.supportedSports,
          bio: input.bio.trim() || 'Private coaching',
          pricePerHour: Math.max(0, Math.round(input.pricePerHour)) || 0,
          phone: input.phone.trim(),
        });
        set({
          coaches: get().coaches.map((c) =>
            c.id === id
              ? {
                  ...c,
                  name: input.name.trim(),
                  supportedSports: input.supportedSports,
                  bio: input.bio.trim() || 'Private coaching',
                  pricePerHour: Math.max(0, Math.round(input.pricePerHour)) || 0,
                  phone: input.phone.trim(),
                }
              : c,
          ),
        });
        await audit('coach.update', 'coach', id, `Updated coach ${input.name.trim()}.`);
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not update coach.' };
      }
    },

    removeCoach: async (id) => {
      try {
        await supabaseService.deleteCoach(id);
      } catch {
        return;
      }
      set({ coaches: get().coaches.filter((c) => c.id !== id) });
      await audit('coach.remove', 'coach', id, 'Removed coach.');
    },

    // Court rules -------------------------------------------------------------
    addRule: async (input) => {
      const title = input.title.trim();
      const content = input.content.trim();
      if (!title || !content) return { ok: false, error: 'A title and rule text are required.' };
      const nextOrder = get().courtRules.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), -1) + 1;
      try {
        const rule = await supabaseService.insertCourtRule({ title, content, sortOrder: nextOrder });
        set({ courtRules: [...get().courtRules, rule] });
        await audit('rule.create', 'court_rule', rule.id, `Added rule: ${title}.`);
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not add rule.' };
      }
    },

    updateRule: async (id, input) => {
      const title = input.title.trim();
      const content = input.content.trim();
      if (!title || !content) return { ok: false, error: 'A title and rule text are required.' };
      try {
        await supabaseService.updateCourtRule(id, { title, content });
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not update rule.' };
      }
      set({ courtRules: get().courtRules.map((r) => (r.id === id ? { ...r, title, content } : r)) });
      await audit('rule.update', 'court_rule', id, `Updated rule: ${title}.`);
      return { ok: true };
    },

    removeRule: async (id) => {
      try {
        await supabaseService.deleteCourtRule(id);
      } catch {
        return;
      }
      set({ courtRules: get().courtRules.filter((r) => r.id !== id) });
      await audit('rule.remove', 'court_rule', id, 'Removed rule.');
    },

    reorderRule: async (id, dir) => {
      const sorted = [...get().courtRules].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const idx = sorted.findIndex((r) => r.id === id);
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || target < 0 || target >= sorted.length) return;
      const a = sorted[idx];
      const b = sorted[target];
      const ao = a.sortOrder ?? idx;
      const bo = b.sortOrder ?? target;
      try {
        await Promise.all([
          supabaseService.updateCourtRule(a.id, { sortOrder: bo }),
          supabaseService.updateCourtRule(b.id, { sortOrder: ao }),
        ]);
      } catch {
        return;
      }
      set({
        courtRules: get().courtRules.map((r) =>
          r.id === a.id ? { ...r, sortOrder: bo } : r.id === b.id ? { ...r, sortOrder: ao } : r,
        ),
      });
      await audit('rule.reorder', 'court_rule', id, `Moved rule ${dir}.`);
    },
  };
});

/**
 * Subscribe a mounted screen/layout to the active theme so it re-renders (and
 * re-reads the live COLORS palette) when the user toggles light/dark. Call it
 * once near the top of every currently-mounted screen; pushed screens mount
 * fresh with the correct palette and don't need it.
 */
export const useThemeName = (): ThemeName => useAppStore((s) => s.theme);
