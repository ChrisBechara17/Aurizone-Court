import { create } from 'zustand';
import { Booking, Coach, Court, CourtBlock, SportType, User } from '@/models';
import { storageService } from '@/services/storageService';
import {
  cancelBooking as svcCancel,
  CoachBookingInput,
  CourtBookingInput,
  createCoachBooking,
  createCourtBooking,
  CreateResult,
  reconcileStatuses,
} from '@/services/bookingService';
import {
  cancelAllReminders,
  cancelReminder,
  configureNotifications,
  scheduleBookingReminder,
} from '@/services/notificationService';
import {
  COACHES,
  MAIN_COURT,
  MAIN_COURT_ID,
  SEED_USERS,
  seedBookings,
  seedCourtBlocks,
} from '@/data/seedData';
import { isAdminContact } from '@/constants/admin';
import { calculateEndTime, combineDateAndTime } from '@/utils/dateUtils';
import { intervalsOverlap } from '@/utils/conflictUtils';
import { CANCEL_CUTOFF_HOURS, canUserCancel } from '@/utils/accountStanding';

interface AppState {
  hydrated: boolean;
  onboarded: boolean;
  user: User | null;
  court: Court;
  coaches: Coach[];
  bookings: Booking[];
  courtBlocks: CourtBlock[];
  users: User[]; // customer roster (admin view)
  remindersEnabled: boolean;

  hydrate: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  login: (name: string, phoneOrEmail: string) => Promise<void>;
  logout: () => Promise<void>;

  bookCourt: (input: Omit<CourtBookingInput, 'userId'>) => CreateResult;
  bookCoach: (input: Omit<CoachBookingInput, 'userId'>) => CreateResult;
  cancelBooking: (id: string, force?: boolean) => { ok: boolean; error?: string };
  toggleNoShow: (id: string) => void;
  setRemindersEnabled: (enabled: boolean) => Promise<void>;

  // Admin (phone-gated)
  addCourtBlock: (input: { date: Date; startTime: string; durationHours: number; reason: string }) =>
    { ok: boolean; error?: string };
  removeCourtBlock: (id: string) => void;
  addCoach: (input: {
    name: string;
    supportedSports: SportType[];
    bio: string;
    pricePerHour: number;
    phone: string;
  }) => { ok: boolean; error?: string };
  updateCoach: (
    id: string,
    input: { name: string; supportedSports: SportType[]; bio: string; pricePerHour: number; phone: string },
  ) => { ok: boolean; error?: string };
  removeCoach: (id: string) => void;

  resetDemo: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => {
  /** Schedule reminders for freshly created bookings and store their ids. */
  const scheduleReminders = async (created: Booking[]) => {
    if (!get().remindersEnabled || created.length === 0) return;
    const ids: Record<string, string | null> = {};
    for (const b of created) ids[b.id] = await scheduleBookingReminder(b);
    const next = get().bookings.map((b) =>
      b.id in ids ? { ...b, notificationId: ids[b.id] } : b,
    );
    set({ bookings: next });
    void storageService.saveBookings(next);
  };

  return {
    hydrated: false,
    onboarded: false,
    user: null,
    court: MAIN_COURT,
    coaches: COACHES,
    bookings: [],
    courtBlocks: [],
    users: SEED_USERS,
    remindersEnabled: true,

    hydrate: async () => {
      configureNotifications();
      const [user, onboarded, storedBookings, storedBlocks, storedCoaches, remindersEnabled] =
        await Promise.all([
          storageService.getUser(),
          storageService.getOnboarded(),
          storageService.getBookings(),
          storageService.getCourtBlocks(),
          storageService.getCoaches(),
          storageService.getRemindersEnabled(),
        ]);

      // Coaches are admin-managed; seed on first run.
      let coaches = storedCoaches;
      if (!coaches) {
        coaches = COACHES;
        await storageService.saveCoaches(coaches);
      }

      // First run -> seed example data.
      let bookings = storedBookings;
      let courtBlocks = storedBlocks;
      if (storedBookings.length === 0) {
        bookings = seedBookings();
        courtBlocks = seedCourtBlocks;
        await storageService.saveBookings(bookings);
        await storageService.saveCourtBlocks(courtBlocks);
      }

      bookings = reconcileStatuses(bookings);
      await storageService.saveBookings(bookings);

      set({ user, onboarded, bookings, courtBlocks, coaches, remindersEnabled, hydrated: true });
    },

    completeOnboarding: async () => {
      await storageService.setOnboarded(true);
      set({ onboarded: true });
    },

    login: async (name, phoneOrEmail) => {
      const contact = phoneOrEmail.trim();
      const trimmedName = name.trim();
      const user: User = {
        id: 'demo-user',
        name: trimmedName,
        phoneOrEmail: contact,
        // Admin if EITHER field matches an admin contact (forgiving for demos).
        isAdmin: isAdminContact(contact) || isAdminContact(trimmedName),
      };
      await storageService.saveUser(user);
      set({ user });
    },

    logout: async () => {
      await storageService.clearUser();
      set({ user: null });
    },

    bookCourt: (input) => {
      const { user, bookings, courtBlocks } = get();
      const userId = user?.id ?? 'demo-user';
      const result = createCourtBooking({ ...input, userId }, bookings, courtBlocks);
      if (result.created.length > 0) {
        const next = [...bookings, ...result.created];
        set({ bookings: next });
        void storageService.saveBookings(next);
        void scheduleReminders(result.created);
      }
      return result;
    },

    bookCoach: (input) => {
      const { user, bookings, courtBlocks } = get();
      const userId = user?.id ?? 'demo-user';
      const result = createCoachBooking({ ...input, userId }, bookings, courtBlocks);
      if (result.created.length > 0) {
        const next = [...bookings, ...result.created];
        set({ bookings: next });
        void storageService.saveBookings(next);
        void scheduleReminders(result.created);
      }
      return result;
    },

    cancelBooking: (id, force = false) => {
      const target = get().bookings.find((b) => b.id === id);
      if (!target) return { ok: false, error: 'Booking not found.' };
      if (!force && !canUserCancel(target)) {
        return {
          ok: false,
          error: `Bookings can't be cancelled within ${CANCEL_CUTOFF_HOURS} hours of the start time.`,
        };
      }
      void cancelReminder(target.notificationId);
      const next = svcCancel(get().bookings, id);
      set({ bookings: next });
      void storageService.saveBookings(next);
      return { ok: true };
    },

    toggleNoShow: (id) => {
      const next = get().bookings.map((b) =>
        b.id === id ? { ...b, noShow: !b.noShow } : b,
      );
      set({ bookings: next });
      void storageService.saveBookings(next);
    },

    setRemindersEnabled: async (enabled) => {
      await storageService.setRemindersEnabled(enabled);
      set({ remindersEnabled: enabled });

      if (!enabled) {
        await cancelAllReminders();
        const cleared = get().bookings.map((b) => ({ ...b, notificationId: null }));
        set({ bookings: cleared });
        void storageService.saveBookings(cleared);
      } else {
        const upcoming = get().bookings.filter(
          (b) => b.status === 'confirmed' && new Date(b.startTime).getTime() > Date.now(),
        );
        await scheduleReminders(upcoming);
      }
    },

    addCourtBlock: (input) => {
      const start = combineDateAndTime(input.date, input.startTime);
      const end = calculateEndTime(start, input.durationHours);
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      // Don't allow blocking over an existing confirmed booking.
      const clash = get().bookings.some(
        (b) =>
          b.status === 'confirmed' &&
          b.usesMainCourt &&
          intervalsOverlap(startIso, endIso, b.startTime, b.endTime),
      );
      if (clash) {
        return { ok: false, error: 'There is already a confirmed booking in that window. Cancel it first.' };
      }

      const block: CourtBlock = {
        id: `blk_${Date.now().toString(36)}`,
        courtId: MAIN_COURT_ID,
        startTime: startIso,
        endTime: endIso,
        reason: input.reason.trim() || 'Maintenance',
      };
      const next = [...get().courtBlocks, block];
      set({ courtBlocks: next });
      void storageService.saveCourtBlocks(next);
      return { ok: true };
    },

    removeCourtBlock: (id) => {
      const next = get().courtBlocks.filter((b) => b.id !== id);
      set({ courtBlocks: next });
      void storageService.saveCourtBlocks(next);
    },

    addCoach: (input) => {
      const name = input.name.trim();
      if (!name) return { ok: false, error: 'Coach name is required.' };
      if (input.supportedSports.length === 0) return { ok: false, error: 'Pick at least one sport.' };
      if (!input.phone.trim()) return { ok: false, error: 'A contact phone number is required.' };

      const coach: Coach = {
        id: `coach_${Date.now().toString(36)}`,
        name,
        supportedSports: input.supportedSports,
        bio: input.bio.trim() || 'Private coaching',
        pricePerHour: Math.max(0, Math.round(input.pricePerHour)) || 0,
        phone: input.phone.trim(),
        isActive: true,
        rating: 5,
      };
      const next = [...get().coaches, coach];
      set({ coaches: next });
      void storageService.saveCoaches(next);
      return { ok: true };
    },

    updateCoach: (id, input) => {
      const name = input.name.trim();
      if (!name) return { ok: false, error: 'Coach name is required.' };
      if (input.supportedSports.length === 0) return { ok: false, error: 'Pick at least one sport.' };
      if (!input.phone.trim()) return { ok: false, error: 'A contact phone number is required.' };

      const next = get().coaches.map((c) =>
        c.id === id
          ? {
              ...c,
              name,
              supportedSports: input.supportedSports,
              bio: input.bio.trim() || 'Private coaching',
              pricePerHour: Math.max(0, Math.round(input.pricePerHour)) || 0,
              phone: input.phone.trim(),
            }
          : c,
      );
      set({ coaches: next });
      void storageService.saveCoaches(next);
      return { ok: true };
    },

    removeCoach: (id) => {
      const next = get().coaches.filter((c) => c.id !== id);
      set({ coaches: next });
      void storageService.saveCoaches(next);
    },

    resetDemo: async () => {
      await cancelAllReminders();
      await storageService.clearAll();
      const bookings = seedBookings();
      await storageService.saveBookings(bookings);
      await storageService.saveCoaches(COACHES);
      set({
        user: null,
        onboarded: false,
        bookings,
        courtBlocks: seedCourtBlocks,
        coaches: COACHES,
        users: SEED_USERS,
        remindersEnabled: true,
      });
    },
  };
});
