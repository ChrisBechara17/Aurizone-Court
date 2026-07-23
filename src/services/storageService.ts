import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

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
  installationId: 'ch_installation_id',
  pushRegistration: 'ch_push_registration',
} as const;

export type StoredTheme = 'dark' | 'light';
export type StoredPushRegistration = {
  userId: string;
  token: string;
  installationId: string;
  remindersEnabled: boolean;
  registeredAt: number;
};

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

  async getInstallationId(): Promise<string> {
    const existing = await readJSON<string | null>(KEYS.installationId, null);
    if (existing) return existing;
    const created = Crypto.randomUUID();
    await writeJSON(KEYS.installationId, created);
    return created;
  },

  getPushRegistration: () =>
    readJSON<StoredPushRegistration | null>(KEYS.pushRegistration, null),
  setPushRegistration: (value: StoredPushRegistration) =>
    writeJSON(KEYS.pushRegistration, value),
  clearPushRegistration: () => AsyncStorage.removeItem(KEYS.pushRegistration),
};
