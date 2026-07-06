import { create } from 'zustand';
import { Booking, Coach, Court, CourtBlock, Pricing, SportType, User } from '@/models';
import { storageService } from '@/services/storageService';
import { applyThemePalette, ThemeName } from '@/constants/colors';
import { authService } from '@/services/authService';
import { supabaseService } from '@/services/supabaseService';
import { CourtBookingInput, createCourtBooking, CreateResult } from '@/services/bookingService';
import {
  cancelAllReminders,
  cancelReminder,
  configureNotifications,
  scheduleBookingReminder,
} from '@/services/notificationService';
import { calculateEndTime, combineDateAndTime } from '@/utils/dateUtils';
import { intervalsOverlap } from '@/utils/conflictUtils';
import { CANCEL_CUTOFF_HOURS, canUserCancel } from '@/utils/accountStanding';

const PLACEHOLDER_COURT: Court = {
  id: '',
  name: 'Main Court',
  supportedSports: ['basketball', 'tennis'],
  isActive: true,
};

type ActionResult = { ok: boolean; error?: string };
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
  users: User[]; // customer roster (admin view)
  pricing: Pricing; // admin-configurable rates (loaded from Supabase)
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

  bookCourt: (input: Omit<CourtBookingInput, 'userId' | 'courtId'>) => Promise<CreateResult>;
  cancelBooking: (id: string, force?: boolean) => Promise<ActionResult>;
  toggleNoShow: (id: string) => Promise<void>;
  setRemindersEnabled: (enabled: boolean) => Promise<void>;
  setTheme: (theme: ThemeName) => Promise<void>;

  // Admin
  addCourtBlock: (input: { date: Date; startTime: string; durationHours: number; reason: string }) => Promise<ActionResult>;
  removeCourtBlock: (id: string) => Promise<void>;
  updatePricing: (input: Pricing) => Promise<ActionResult>;
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

  return {
    hydrated: false,
    onboarded: false,
    user: null,
    court: PLACEHOLDER_COURT,
    coaches: [],
    bookings: [],
    occupancy: [],
    courtBlocks: [],
    users: [],
    pricing: { basketball: 30, basketballHalf: 18, tennis: 20, ballMachineRate: 15 },
    remindersEnabled: true,
    theme: 'dark',

    hydrate: async () => {
      configureNotifications();
      const [user, onboarded, remindersEnabled, theme] = await Promise.all([
        authService.getCurrentUser(),
        storageService.getOnboarded(),
        storageService.getRemindersEnabled(),
        storageService.getTheme(),
      ]);
      applyThemePalette(theme);
      set({ user, onboarded, remindersEnabled, theme });
      await get().refresh();
      set({ hydrated: true });
    },

    /** Load all shared data from Supabase. Resilient: one failing query does not
     *  discard the others (e.g. a missing view won't wipe the loaded court). */
    refresh: async () => {
      const isAdmin = !!get().user?.isAdmin;
      const [courtR, coachesR, blocksR, bookingsR, occR, usersR, pricingR] = await Promise.allSettled([
        supabaseService.getMainCourt(),
        supabaseService.listCoaches(),
        supabaseService.listCourtBlocks(),
        supabaseService.listBookings(),
        supabaseService.listOccupancy(),
        isAdmin ? supabaseService.listUsers() : Promise.resolve([] as User[]),
        supabaseService.getPricing(),
      ]);

      const patch: Partial<AppState> = {};
      if (courtR.status === 'fulfilled' && courtR.value) patch.court = courtR.value;
      if (coachesR.status === 'fulfilled') patch.coaches = coachesR.value;
      if (blocksR.status === 'fulfilled') patch.courtBlocks = blocksR.value;
      if (bookingsR.status === 'fulfilled') patch.bookings = bookingsR.value;
      if (occR.status === 'fulfilled') patch.occupancy = occR.value;
      if (usersR.status === 'fulfilled') patch.users = usersR.value;
      if (pricingR.status === 'fulfilled') patch.pricing = pricingR.value;
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
      await get().refresh();
      return { ok: true };
    },

    login: async (email, password) => {
      const res = await authService.signIn(email, password);
      if (!res.ok) return res;
      const user = await authService.getCurrentUser();
      set({ user });
      await get().refresh();
      return { ok: true };
    },

    resetPassword: async (email) => authService.resetPassword(email),

    logout: async () => {
      await authService.signOut();
      set({ user: null, bookings: [], users: [] });
    },

    bookCourt: async (input) => {
      const { user, bookings, occupancy, courtBlocks, court } = get();
      if (!user) return { ok: false, created: [], blocked: [], error: 'Please sign in first.' };
      if (!court.id) {
        return { ok: false, created: [], blocked: [], error: 'Court is still loading — please try again in a moment.' };
      }

      // Standing/limit use the user's own bookings; court conflicts use everyone's
      // occupancy (occupancy rows have no userId, so they don't affect the limit).
      const existing = [...bookings, ...occupancy];
      const result = createCourtBooking(
        { ...input, userId: user.id, courtId: court.id },
        existing,
        courtBlocks,
      );
      if (result.created.length === 0) return result;

      let saved: Booking[];
      try {
        // Server sets the authoritative total_price (see supabase/pricing.sql).
        saved = await supabaseService.insertBookings(result.created);
      } catch (e: any) {
        return { ok: false, created: [], blocked: result.blocked, error: e?.message ?? 'Could not save booking.' };
      }

      const withIds = await attachReminders(saved);
      set({
        bookings: [...get().bookings, ...withIds],
        occupancy: [...get().occupancy, ...withIds],
      });
      return { ...result, created: withIds };
    },

    cancelBooking: async (id, force = false) => {
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
        await supabaseService.updateBooking(id, { status: 'cancelled', cancelledAt });
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not cancel booking.' };
      }
      void cancelReminder(target.notificationId);
      set({
        bookings: get().bookings.map((b) =>
          b.id === id ? { ...b, status: 'cancelled', cancelledAt } : b,
        ),
        occupancy: get().occupancy.filter((o) => o.id !== id), // free the slot
      });
      return { ok: true };
    },

    toggleNoShow: async (id) => {
      const target = get().bookings.find((b) => b.id === id);
      if (!target) return;
      const next = !target.noShow;
      try {
        await supabaseService.updateBooking(id, { noShow: next });
      } catch {
        return;
      }
      set({ bookings: get().bookings.map((b) => (b.id === id ? { ...b, noShow: next } : b)) });
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
      const clean: Pricing = {
        basketball: Math.max(0, Math.round(input.basketball)) || 0,
        basketballHalf: Math.max(0, Math.round(input.basketballHalf)) || 0,
        tennis: Math.max(0, Math.round(input.tennis)) || 0,
        ballMachineRate: Math.max(0, Math.round(input.ballMachineRate)) || 0,
      };
      try {
        await supabaseService.updatePricing(clean);
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Could not update pricing.' };
      }
      set({ pricing: clean });
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
