import { z } from 'npm:zod@4';
import { limit, parse, rpcError, run } from '../_shared/security.ts';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register'), token: z.string().min(20).max(512), platform: z.string().max(30).nullable(), deviceId: z.string().max(200).nullable(), bookingRemindersEnabled: z.boolean().optional().default(true) }).strict(),
  z.object({ action: z.literal('deactivate'), token: z.string().min(20).max(512) }).strict(),
]);

Deno.serve((req) => run(req, false, async (ctx) => {
  await limit(ctx, 'device-token', 10, 86400);
  const input = await parse(req, body);
  if (input.action === 'deactivate') {
    const { error } = await ctx.admin.rpc('secure_deactivate_push_token', {
      p_actor_user_id: ctx.user.id, p_token: input.token,
    });
    if (error) rpcError(error);
    return null;
  }
  const { data, error } = await ctx.admin.rpc('secure_register_push_token', {
    p_actor_user_id: ctx.user.id, p_token: input.token, p_platform: input.platform,
    p_device_id: input.deviceId, p_booking_reminders_enabled: input.bookingRemindersEnabled,
  });
  if (error) rpcError(error);
  return data;
}));
