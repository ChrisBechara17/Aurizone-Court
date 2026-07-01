import AsyncStorage from '@react-native-async-storage/async-storage';
import { Booking, Coach, CourtBlock, User } from '@/models';

// ---------------------------------------------------------------------------
// Storage abstraction. Today this is backed by AsyncStorage. Tomorrow each of
// these methods becomes an API call to the NestJS backend (Postgres + Redis
// time-slot locking) — the rest of the app never needs to change.
// ---------------------------------------------------------------------------

const KEYS = {
  user: 'ch_user',
  bookings: 'ch_bookings',
  courtBlocks: 'ch_court_blocks',
  coaches: 'ch_coaches',
  onboarded: 'ch_onboarded',
  remindersEnabled: 'ch_reminders_enabled',
} as const;

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJSON<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const storageService = {
  // User -------------------------------------------------------------------
  getUser: () => readJSON<User | null>(KEYS.user, null),
  saveUser: (user: User) => writeJSON(KEYS.user, user),
  clearUser: () => AsyncStorage.removeItem(KEYS.user),

  // Bookings ---------------------------------------------------------------
  getBookings: () => readJSON<Booking[]>(KEYS.bookings, []),
  saveBookings: (bookings: Booking[]) => writeJSON(KEYS.bookings, bookings),

  // Court blocks -----------------------------------------------------------
  getCourtBlocks: () => readJSON<CourtBlock[]>(KEYS.courtBlocks, []),
  saveCourtBlocks: (blocks: CourtBlock[]) => writeJSON(KEYS.courtBlocks, blocks),

  // Coaches (admin-managed) ------------------------------------------------
  getCoaches: () => readJSON<Coach[] | null>(KEYS.coaches, null),
  saveCoaches: (coaches: Coach[]) => writeJSON(KEYS.coaches, coaches),

  // Onboarding -------------------------------------------------------------
  getOnboarded: () => readJSON<boolean>(KEYS.onboarded, false),
  setOnboarded: (v: boolean) => writeJSON(KEYS.onboarded, v),

  // Settings ---------------------------------------------------------------
  getRemindersEnabled: () => readJSON<boolean>(KEYS.remindersEnabled, true),
  setRemindersEnabled: (v: boolean) => writeJSON(KEYS.remindersEnabled, v),

  // Demo reset -------------------------------------------------------------
  async clearAll() {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};
