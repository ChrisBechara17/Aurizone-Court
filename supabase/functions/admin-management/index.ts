import { z } from 'npm:zod@4';
import { limit, parse, rpcError, run, uuid } from '../_shared/security.ts';

const sport = z.enum(['basketball', 'tennis']);
const openingTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm.');
const closingTime = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Use HH:mm or 24:00.');
const body = z.discriminatedUnion('action', [
  z.object({ requestId: uuid, action: z.literal('coach_create'), name: z.string().trim().min(1).max(100), supportedSports: z.array(sport).min(1), bio: z.string().max(1000), pricePerHour: z.number().nonnegative(), phone: z.string().trim().min(1).max(50) }).strict(),
  z.object({ requestId: uuid, action: z.literal('coach_update'), id: uuid, name: z.string().trim().min(1).max(100), supportedSports: z.array(sport).min(1), bio: z.string().max(1000), pricePerHour: z.number().nonnegative(), phone: z.string().trim().min(1).max(50) }).strict(),
  z.object({ requestId: uuid, action: z.literal('coach_remove'), id: uuid }).strict(),
  z.object({ requestId: uuid, action: z.literal('support_phone'), value: z.string().trim().min(1).max(50) }).strict(),
  z.object({ requestId: uuid, action: z.literal('rule_create'), title: z.string().trim().min(1).max(150), content: z.string().trim().min(1).max(2000), sortOrder: z.number().int().nonnegative() }).strict(),
  z.object({ requestId: uuid, action: z.literal('rule_update'), id: uuid, title: z.string().trim().min(1).max(150).optional(), content: z.string().trim().min(1).max(2000).optional(), sortOrder: z.number().int().nonnegative().optional() }).strict(),
  z.object({ requestId: uuid, action: z.literal('rule_remove'), id: uuid }).strict(),
  z.object({ requestId: uuid, action: z.literal('operating_hours'), rows: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), openTime: openingTime, closeTime: closingTime, isClosed: z.boolean() }).strict()).length(7) }).strict(),
  z.object({ requestId: uuid, action: z.literal('pricing'), basketball: z.number().nonnegative(), basketballPeak: z.number().nonnegative(), basketballHalf: z.number().nonnegative(), basketballHalfPeak: z.number().nonnegative(), tennis: z.number().nonnegative(), tennisPeak: z.number().nonnegative(), ballMachineRate: z.number().nonnegative() }).strict(),
  z.object({ requestId: uuid, action: z.literal('config_values'), values: z.record(z.string().min(1).max(100), z.union([z.string().max(3000), z.number().nonnegative()])) }).strict(),
]).refine((v) => v.action !== 'rule_update' || v.title !== undefined || v.content !== undefined || v.sortOrder !== undefined, 'No rule changes supplied.');

Deno.serve((req) => run(req, true, async (ctx) => {
  await limit(ctx, 'admin-management', 120, 600);
  const input = await parse(req, body);
  if (input.action === 'config_values') {
    const allowed = new Set([
      'tier_perks_bronze','tier_perks_silver','tier_perks_gold','tier_perks_platinum',
      'loyalty_first_booking_bonus','loyalty_points_per_booking','loyalty_completion_bonus','loyalty_no_show_penalty',
    ]);
    if (Object.keys(input.values).some((key) => !allowed.has(key))) {
      throw Object.assign(new Error('Unsupported configuration key.'), { status: 400, code: 'INVALID_PAYLOAD' });
    }
  }
  const payload: Record<string, unknown> = 'id' in input ? { id: input.id } : {};
  if ('name' in input) Object.assign(payload, { name: input.name, supported_sports: input.supportedSports, bio: input.bio, price_per_hour: input.pricePerHour, phone: input.phone });
  if (input.action === 'support_phone') payload.value = input.value;
  if (input.action.startsWith('rule_')) Object.assign(payload, { ...('title' in input ? { title: input.title } : {}), ...('content' in input ? { content: input.content } : {}), ...('sortOrder' in input ? { sort_order: input.sortOrder } : {}) });
  if (input.action === 'operating_hours') payload.rows = input.rows.map((r) => ({ day_of_week: r.dayOfWeek, open_time: r.openTime === '24:00' ? '00:00' : r.openTime, close_time: r.closeTime, is_closed: r.isClosed }));
  if (input.action === 'pricing') Object.assign(payload, { basketball: input.basketball, basketball_peak: input.basketballPeak, basketball_half: input.basketballHalf, basketball_half_peak: input.basketballHalfPeak, tennis: input.tennis, tennis_peak: input.tennisPeak, ball_machine_rate: input.ballMachineRate });
  if (input.action === 'config_values') payload.values = input.values;
  const { data: result, error } = await ctx.admin.rpc('secure_admin_management_action', { p_actor_user_id: ctx.user.id, p_request_id: input.requestId, p_action: input.action, p_payload: payload });
  if (error) rpcError(error);
  if (input.action === 'coach_create' && result?.id) { const q = await ctx.admin.from('coaches').select('*').eq('id', result.id).single(); if (q.error) rpcError(q.error); return q.data; }
  if (input.action === 'rule_create' && result?.id) { const q = await ctx.admin.from('court_rules').select('*').eq('id', result.id).single(); if (q.error) rpcError(q.error); return q.data; }
  return result;
}));
