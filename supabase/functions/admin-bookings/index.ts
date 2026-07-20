import { z } from 'npm:zod@4';
import { isoDate, limit, parse, rpcError, run, uuid } from '../_shared/security.ts';

const body = z.discriminatedUnion('action', [
  z.object({ requestId: uuid, action: z.literal('cancel'), bookingId: uuid, reason: z.string().trim().min(1).max(500) }).strict(),
  z.object({ requestId: uuid, action: z.literal('complete'), bookingId: uuid }).strict(),
  z.object({ requestId: uuid, action: z.literal('no_show'), bookingId: uuid, reason: z.string().trim().min(1).max(500) }).strict(),
  z.object({ requestId: uuid, action: z.literal('reschedule'), bookingId: uuid, startTime: isoDate, endTime: isoDate, durationMinutes: z.number().int().min(30).max(180), overrideOperatingHours: z.boolean().default(false) }).strict(),
  z.object({ requestId: uuid, action: z.literal('block_create'), courtId: uuid, startTime: isoDate, endTime: isoDate, reason: z.string().trim().min(1).max(500) }).strict(),
  z.object({ requestId: uuid, action: z.literal('block_remove'), blockId: uuid }).strict(),
  z.object({ requestId: uuid, action: z.literal('coach_create'), bookings: z.array(z.object({
    id: uuid, userId: uuid, sportType: z.enum(['basketball', 'tennis']), courtId: uuid.nullable().optional(), coachId: uuid,
    usesMainCourt: z.boolean(), startTime: isoDate, endTime: isoDate, durationMinutes: z.number().int().min(30).max(180),
    isRecurring: z.boolean(), recurrenceGroupId: uuid.nullable(), totalPrice: z.number().nonnegative(),
  }).strict()).min(1).max(6) }).strict(),
]);

async function sendNotificationPush(ctx: any, notificationId?: string | null) {
  if (!notificationId) return;
  const { data: notification } = await ctx.admin.from('user_notifications').select('user_id,title,message,type').eq('id', notificationId).maybeSingle();
  if (!notification) return;
  const { data: tokens } = await ctx.admin.from('push_tokens').select('token').eq('user_id', notification.user_id).eq('is_active', true);
  const values = [...new Set((tokens ?? []).map((row: any) => row.token))];
  for (let i = 0; i < values.length; i += 100) {
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values.slice(i, i + 100).map((to) => ({ to, title: notification.title, body: notification.message, sound: 'default', data: { type: notification.type } }))),
      });
    } catch {
      // In-app notification is committed and remains authoritative.
    }
  }
}

Deno.serve((req) => run(req, true, async (ctx) => {
  await limit(ctx, 'admin-bookings', 120, 600);
  const input = await parse(req, body);

  const scheduleAction = input.action === 'block_create' || input.action === 'block_remove' || input.action === 'coach_create';
  const payload = input.action === 'coach_create'
    ? { bookings: input.bookings.map((b) => ({ ...b, user_id: b.userId, sport_type: b.sportType, coach_id: b.coachId, uses_main_court: b.usesMainCourt, start_time: b.startTime, end_time: b.endTime, duration_minutes: b.durationMinutes, total_price: b.totalPrice, is_recurring: b.isRecurring, recurrence_group_id: b.recurrenceGroupId })) }
    : input.action === 'block_create'
      ? { court_id: input.courtId, start_time: input.startTime, end_time: input.endTime, reason: input.reason }
      : input.action === 'block_remove'
        ? { block_id: input.blockId }
        : { booking_id: input.bookingId, ...('reason' in input ? { reason: input.reason } : {}), ...('startTime' in input ? { start_time: input.startTime, end_time: input.endTime, duration_minutes: input.durationMinutes, override_operating_hours: input.overrideOperatingHours } : {}) };
  const { data, error } = await ctx.admin.rpc(scheduleAction ? 'secure_admin_schedule_action' : 'secure_admin_booking_action', scheduleAction ? {
    p_actor_user_id: ctx.user.id, p_request_id: input.requestId, p_action: input.action, p_payload: payload,
  } : {
    p_actor_user_id: ctx.user.id, p_request_id: input.requestId, p_action: input.action, p_payload: payload,
  });
  if (error) rpcError(error);
  // Skip the push when the RPC replayed a cached receipt (idempotent retry):
  // the DB row already existed, so re-sending would double-notify the user.
  if (!data?.replayed) await sendNotificationPush(ctx, data?.notification_id);
  if (input.action === 'block_create') return data.block;
  if (input.action === 'block_remove') return null;
  if (input.action === 'coach_create') return data.bookings ?? [];
  return data.booking ?? null;
}));
