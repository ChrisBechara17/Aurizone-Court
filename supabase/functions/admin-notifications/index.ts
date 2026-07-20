import { z } from 'npm:zod@4';
import { limit, parse, rpcError, run, uuid } from '../_shared/security.ts';

const body = z.object({ requestId: uuid, userId: uuid, title: z.string().trim().min(1).max(120), message: z.string().trim().min(1).max(1000) }).strict();

async function sendPush(tokens: string[], title: string, body: string) {
  for (let i = 0; i < tokens.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(tokens.slice(i, i + 100).map((to) => ({ to, title, body, sound: 'default' }))),
    });
  }
}

Deno.serve((req) => run(req, true, async (ctx) => {
  await limit(ctx, 'admin-notifications', 20, 600);
  const input = await parse(req, body);
  const { data: result, error } = await ctx.admin.rpc('secure_admin_notification', {
    p_actor_user_id: ctx.user.id, p_request_id: input.requestId, p_user_id: input.userId,
    p_title: input.title, p_message: input.message,
  });
  if (error) rpcError(error);
  // Don't re-push on an idempotent replay (see admin-bookings for rationale).
  if (!result?.replayed) {
    const { data: tokens } = await ctx.admin.from('push_tokens').select('token').eq('user_id', input.userId).eq('is_active', true);
    if (tokens?.length) sendPush(tokens.map((row) => row.token), input.title, input.message).catch(() => undefined);
  }
  return result.notification;
}));
