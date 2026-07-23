import { z } from 'npm:zod@4';

export type MutationReceipt = { replayed?: boolean };

export function shouldDispatchMutationPush(result: MutationReceipt | null | undefined): boolean {
  return result?.replayed !== true;
}

export type PushTokenBinding = {
  userId: string;
  active: boolean;
  installationHash: string | null;
};

export function mayBindPushToken(
  existing: PushTokenBinding | null,
  actorUserId: string,
  installationHash: string,
): boolean {
  return !existing
    || existing.userId === actorUserId
    || !existing.active
    || existing.installationHash === installationHash;
}

export function reminderMayBeClaimed(status: string, attempts: number): boolean {
  return status === 'pending' && attempts === 0;
}

export function reminderMayDispatch(startTime: string, now = Date.now()): boolean {
  const start = new Date(startTime).getTime();
  return Number.isFinite(start) && start > now + 45 * 60 * 1000;
}

export const deviceTokenBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('register'),
    token: z.string().min(20).max(512),
    platform: z.string().max(30).nullable(),
    deviceId: z.string().max(200).nullable(),
    installationId: z.string().uuid(),
    bookingRemindersEnabled: z.boolean().optional().default(true),
  }).strict(),
  z.object({
    action: z.literal('deactivate'),
    token: z.string().min(20).max(512),
    installationId: z.string().uuid(),
  }).strict(),
]);
