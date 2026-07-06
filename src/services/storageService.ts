import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Device-local preferences only. All shared data (users, bookings, coaches,
// court blocks) lives in Supabase — see supabaseService.ts. These two settings
// are per-device UI prefs, not shared data, so they stay on the device.
// (The Supabase auth session is also persisted in AsyncStorage by the client.)
// ---------------------------------------------------------------------------

const KEYS = {
  onboarded: 'ch_onboarded',
  remindersEnabled: 'ch_reminders_enabled',
  theme: 'ch_theme',
} as const;

export type StoredTheme = 'dark' | 'light';

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
  getOnboarded: () => readJSON<boolean>(KEYS.onboarded, false),
  setOnboarded: (v: boolean) => writeJSON(KEYS.onboarded, v),

  getRemindersEnabled: () => readJSON<boolean>(KEYS.remindersEnabled, true),
  setRemindersEnabled: (v: boolean) => writeJSON(KEYS.remindersEnabled, v),

  getTheme: () => readJSON<StoredTheme>(KEYS.theme, 'dark'),
  setTheme: (v: StoredTheme) => writeJSON(KEYS.theme, v),
};
