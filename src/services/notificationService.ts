import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Booking } from '@/models';
import { sportLabel } from '@/constants/colors';
import { fmtTime } from '@/utils/dateUtils';
import { COACHES } from '@/data/seedData';

// ---------------------------------------------------------------------------
// Local booking reminders.
//
// IMPORTANT: expo-notifications throws *on import* inside Expo Go (push support
// was removed from Expo Go in SDK 53). So we load it lazily and only when NOT
// running in Expo Go. In Expo Go these functions safely no-op; in a development
// build they schedule real local notifications. The store/UI call sites are
// identical either way.
// ---------------------------------------------------------------------------

export const REMINDER_LEAD_MINUTES = 60; // remind 1 hour before start

const isExpoGo = Constants.appOwnership === 'expo';

type NotificationsModule = typeof import('expo-notifications');
let Notifications: NotificationsModule | null = null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications') as NotificationsModule;
  } catch {
    Notifications = null;
  }
}

/** True when reminders can actually be scheduled on this runtime. */
export const remindersSupported = !!Notifications;
export const pushSupported = !!Notifications && !isExpoGo;

let configured = false;

/** Set the foreground handler + Android channel. Safe to call repeatedly. */
export function configureNotifications() {
  if (!Notifications || configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('reminders', {
      name: 'Booking reminders',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#3ad7ff',
    });
  }
}

/** Ask for permission. Returns true if granted. */
export async function ensurePermissions(): Promise<boolean> {
  if (!Notifications) return false;
  const settings = await Notifications.getPermissionsAsync();
  if (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

export function getPushSupportStatus(): { supported: boolean; reason: string } {
  if (isExpoGo) return { supported: false, reason: 'Expo Go fallback' };
  if (!Notifications) return { supported: false, reason: 'expo-notifications unavailable' };
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return { supported: false, reason: 'Missing EAS project id' };
  return { supported: true, reason: 'Ready' };
}

export async function registerForPushToken(): Promise<{ token: string | null; reason: string }> {
  const status = getPushSupportStatus();
  if (!status.supported || !Notifications) return { token: null, reason: status.reason };
  const granted = await ensurePermissions();
  if (!granted) return { token: null, reason: 'Permission denied' };
  try {
    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: token.data, reason: 'Registered' };
  } catch (e: any) {
    return { token: null, reason: e?.message ?? 'Could not register push token' };
  }
}

export async function sendExpoPush(tokens: string[], title: string, body: string, data: Record<string, unknown> = {}) {
  if (tokens.length === 0) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokens.map((to) => ({ to, title, body, data }))),
    });
  } catch {
    // Push is best-effort; in-app notifications remain the source of truth.
  }
}

const coachName = (id: string | null) => COACHES.find((c) => c.id === id)?.name ?? 'your coach';

function reminderBody(booking: Booking): { title: string; body: string } {
  const when = fmtTime(booking.startTime);
  if (booking.bookingType === 'coach') {
    return {
      title: 'Upcoming coaching session 🏟️',
      body: `${sportLabel(booking.sportType)} with ${coachName(booking.coachId)} at ${when}. See you on court!`,
    };
  }
  return {
    title: 'Your court is booked 🏀🎾',
    body: `${sportLabel(booking.sportType)} on the Main Court at ${when}. Arrive 10 min early!`,
  };
}

/**
 * Schedule a reminder `REMINDER_LEAD_MINUTES` before the booking start.
 * Returns the scheduled notification id, or null if it couldn't be scheduled
 * (Expo Go, no permission, or the reminder time is already in the past).
 */
export async function scheduleBookingReminder(booking: Booking): Promise<string | null> {
  if (!Notifications) return null;

  const start = new Date(booking.startTime).getTime();
  const remindAt = new Date(start - REMINDER_LEAD_MINUTES * 60_000);

  // Too soon (or past) to schedule a useful reminder.
  if (remindAt.getTime() <= Date.now()) return null;

  const granted = await ensurePermissions();
  if (!granted) return null;

  const { title, body } = reminderBody(booking);
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { bookingId: booking.id } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: remindAt,
        channelId: 'reminders',
      },
    });
  } catch {
    return null;
  }
}

export async function cancelReminder(notificationId: string | null | undefined) {
  if (!Notifications || !notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // already fired or removed — ignore
  }
}

export async function cancelAllReminders() {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}
