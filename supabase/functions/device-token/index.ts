import { limit, parse, rpcError, run } from '../_shared/security.ts';
import { deviceTokenBody } from '../_shared/contracts.ts';

Deno.serve((req) => run(req, false, async (ctx) => {
  const input = await parse(req, deviceTokenBody);
  if (input.action === 'deactivate') {
    const { error } = await ctx.admin.rpc('secure_deactivate_push_token', {
      p_actor_user_id: ctx.user.id, p_token: input.token, p_installation_id: input.installationId,
    });
    if (error) rpcError(error);
    return null;
  }
  await limit(ctx, 'device-token-register', 30, 86400);
  const { data, error } = await ctx.admin.rpc('secure_register_push_token', {
    p_actor_user_id: ctx.user.id, p_token: input.token, p_platform: input.platform,
    p_device_id: input.deviceId, p_installation_id: input.installationId,
    p_booking_reminders_enabled: input.bookingRemindersEnabled,
  });
  if (error) rpcError(error);
  return data;
}));
