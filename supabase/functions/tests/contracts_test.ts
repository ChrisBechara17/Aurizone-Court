import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import {
  deviceTokenBody,
  mayBindPushToken,
  reminderMayBeClaimed,
  reminderMayDispatch,
  shouldDispatchMutationPush,
} from '../_shared/contracts.ts';
import { rpcError } from '../_shared/security.ts';

Deno.test('idempotent RPC replays never dispatch a second push', () => {
  assertEquals(shouldDispatchMutationPush({ replayed: true }), false);
  assertEquals(shouldDispatchMutationPush({ replayed: false }), true);
  assertEquals(shouldDispatchMutationPush(null), true);
});

Deno.test('push handoff requires the same installation while active', () => {
  const active = { userId: 'old', active: true, installationHash: 'install-a' };
  assert(mayBindPushToken(active, 'old', 'other-install'));
  assert(mayBindPushToken(active, 'new', 'install-a'));
  assertEquals(mayBindPushToken(active, 'new', 'install-b'), false);
  assert(mayBindPushToken({ ...active, active: false }, 'new', 'install-b'));
});

Deno.test('reminders are claimed once and never sent inside 45 minutes', () => {
  assert(reminderMayBeClaimed('pending', 0));
  assertEquals(reminderMayBeClaimed('processing', 1), false);
  assertEquals(reminderMayBeClaimed('failed', 1), false);
  const now = Date.parse('2026-07-23T10:00:00Z');
  assert(reminderMayDispatch('2026-07-23T10:46:00Z', now));
  assertEquals(reminderMayDispatch('2026-07-23T10:45:00Z', now), false);
});

Deno.test('device token schema requires an installation UUID', () => {
  const valid = deviceTokenBody.parse({
    action: 'register',
    token: 'ExponentPushToken[1234567890]',
    platform: 'android',
    deviceId: null,
    installationId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
  });
  assertEquals(valid.action, 'register');
  if (valid.action === 'register') assertEquals(valid.bookingRemindersEnabled, true);
  assertThrows(() => deviceTokenBody.parse({
    action: 'deactivate',
    token: 'ExponentPushToken[1234567890]',
    installationId: 'not-a-uuid',
  }));
});

Deno.test('RPC sanitizer exposes mapped codes and suppresses internals', () => {
  const mapped = assertThrows(
    () => rpcError({ code: 'P0001', message: 'TOKEN_OWNERSHIP: internal detail' }),
    Error,
  ) as Error & { code?: string; status?: number };
  assertEquals(mapped.code, 'TOKEN_OWNERSHIP');
  assertEquals(mapped.status, 409);
  assertEquals(mapped.message.includes('internal detail'), false);

  const hidden = assertThrows(
    () => rpcError({ code: 'XX000', message: 'secret table and constraint' }),
    Error,
  ) as Error & { code?: string; status?: number };
  assertEquals(hidden.code, 'SERVER_ERROR');
  assertEquals(hidden.status, 500);
  assertEquals(hidden.message.includes('secret'), false);
});
