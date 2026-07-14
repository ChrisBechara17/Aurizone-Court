import { z } from 'npm:zod@4';
import { limit, parse, run } from '../_shared/security.ts';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register'), token: z.string().min(20).max(512), platform: z.string().max(30).nullable(), deviceId: z.string().max(200).nullable(), bookingRemindersEnabled: z.boolean().optional().default(true) }).strict(),
  z.object({ action: z.literal('deactivate'), token: z.string().min(20).max(512) }).strict(),
]);

Deno.serve((req) => run(req, false, async (ctx) => {
  await limit(ctx, 'device-token', 10, 86400);
  const input = await parse(req, body);
  if (input.action === 'deactivate') {
    const { error } = await ctx.admin.from('push_tokens').update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('token', input.token).eq('user_id', ctx.user.id);
    if (error) throw error;
    return null;
  }
  const { data, error } = await ctx.admin.from('push_tokens').upsert({
    user_id: ctx.user.id, token: input.token, platform: input.platform,
    device_id: input.deviceId, is_active: true,
    booking_reminders_enabled: input.bookingRemindersEnabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'token' }).select().single();
  if (error) throw error;
  return data;
}));
