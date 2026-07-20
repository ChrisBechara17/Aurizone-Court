import { z } from 'npm:zod@4';
import { isoDate, limit, parse, rpcError, run, uuid } from '../_shared/security.ts';

const booking = z.object({
  id: uuid,
  userId: uuid,
  bookingType: z.literal('court'),
  sportType: z.enum(['basketball', 'tennis']),
  courtId: uuid,
  coachId: z.null(),
  usesMainCourt: z.literal(true),
  courtHalf: z.enum(['full', 'a', 'b']),
  startTime: isoDate,
  endTime: isoDate,
  durationMinutes: z.number().int().min(30).max(180),
  totalPrice: z.number().nonnegative(),
  status: z.literal('confirmed'),
  isRecurring: z.boolean(),
  recurrenceGroupId: uuid.nullable(),
  isFreeReward: z.boolean().optional().default(false),
  ballMachine: z.boolean().optional().default(false),
  noShow: z.boolean().optional().default(false),
  createdAt: isoDate,
  cancelledAt: z.null(),
}).strict();
const body = z.object({ requestId: uuid, bookings: z.array(booking).min(1).max(6) }).strict();

Deno.serve((req) => run(req, false, async (ctx) => {
  await limit(ctx, 'booking-create', 10, 600);
  const input = await parse(req, body);
  if (input.bookings.some((b) => b.userId !== ctx.user.id)) {
    throw Object.assign(new Error('You can only create your own bookings.'), { status: 403, code: 'OWNERSHIP_MISMATCH' });
  }

  const rows = input.bookings.map((b) => ({
    id: b.id, user_id: ctx.user.id, booking_type: 'court', sport_type: b.sportType,
    court_id: b.courtId, coach_id: null, uses_main_court: true, court_half: b.courtHalf,
    start_time: b.startTime, end_time: b.endTime, duration_minutes: b.durationMinutes,
    total_price: 0, status: 'confirmed', is_recurring: b.isRecurring,
    recurrence_group_id: b.recurrenceGroupId, is_free_reward: b.isFreeReward,
    ball_machine: b.ballMachine, no_show: false,
  }));
  const { data, error } = await ctx.admin.rpc('secure_create_court_bookings', {
    p_actor_user_id: ctx.user.id,
    p_request_id: input.requestId,
    p_bookings: rows,
  });
  if (error) rpcError(error);
  // The authoritative AFTER INSERT trigger in operations-upgrades.sql creates
  // booking_base loyalty exactly once. Do not duplicate that transaction here.
  return data?.bookings ?? [];
}));
