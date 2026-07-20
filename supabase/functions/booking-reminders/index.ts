import { createClient } from 'npm:@supabase/supabase-js@2';

type Reminder = {
  delivery_id: string;
  booking_id: string;
  user_id: string;
  booking_type: 'court' | 'coach';
  sport_type: 'basketball' | 'tennis';
  start_time: string;
};

type PushToken = { user_id: string; token: string };

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

function secureEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

function reminderCopy(reminder: Reminder) {
  const sport = reminder.sport_type === 'basketball' ? 'Basketball' : 'Tennis';
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Beirut',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(reminder.start_time));
  return {
    title: 'Booking reminder',
    body: `Your ${sport} ${reminder.booking_type === 'coach' ? 'coaching session' : 'booking'} starts at ${time}.`,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  const suppliedSecret = req.headers.get('x-job-secret') ?? '';
  if (!secureEqual(suppliedSecret, env('REMINDER_JOB_SECRET'))) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc('claim_due_booking_reminders', { p_limit: 100 });
  if (error) {
    console.error('Failed to claim booking reminders', error);
    return Response.json({ error: 'The reminder job could not be completed.' }, { status: 500 });
  }

  const reminders = (data ?? []) as Reminder[];
  const userIds = [...new Set(reminders.map((item) => item.user_id))];
  let tokens: PushToken[] = [];
  if (userIds.length > 0) {
    const result = await admin
      .from('push_tokens')
      .select('user_id,token')
      .in('user_id', userIds)
      .eq('is_active', true)
      .eq('booking_reminders_enabled', true);
    if (result.error) {
      console.error('Failed to load reminder push tokens', result.error);
      return Response.json({ error: 'The reminder job could not be completed.' }, { status: 500 });
    }
    tokens = (result.data ?? []) as PushToken[];
  }

  const counts = { claimed: reminders.length, sent: 0, noTokens: 0, failed: 0 };
  for (const reminder of reminders) {
    const userTokens = [...new Set(tokens.filter((row) => row.user_id === reminder.user_id).map((row) => row.token))];
    if (userTokens.length === 0) {
      await admin.rpc('complete_booking_reminder', {
        p_delivery_id: reminder.delivery_id,
        p_status: 'no_tokens',
        p_error: 'No active reminder-enabled push tokens.',
      });
      counts.noTokens += 1;
      continue;
    }

    // Re-check immediately before delivery so a cancellation committed after
    // the claim cannot normally produce a stale reminder.
    const current = await admin
      .from('bookings')
      .select('status,no_show,start_time')
      .eq('id', reminder.booking_id)
      .maybeSingle();
    if (
      current.error ||
      !current.data ||
      current.data.status !== 'confirmed' ||
      current.data.no_show ||
      current.data.start_time !== reminder.start_time
    ) {
      await admin.rpc('complete_booking_reminder', {
        p_delivery_id: reminder.delivery_id,
        p_status: 'no_tokens',
        p_error: 'Booking is no longer eligible for a reminder.',
      });
      counts.noTokens += 1;
      continue;
    }

    try {
      const copy = reminderCopy(reminder);
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(userTokens.map((to) => ({
          to,
          title: copy.title,
          body: copy.body,
          sound: 'default',
          data: { type: 'booking_reminder', bookingId: reminder.booking_id },
        }))),
      });
      const payload = await response.json().catch(() => null);
      const tickets = Array.isArray(payload?.data) ? payload.data : [];
      const accepted = response.ok && tickets.some((ticket: any) => ticket?.status === 'ok');
      const failure = accepted
        ? null
        : JSON.stringify(payload ?? { status: response.status }).slice(0, 1000);
      await admin.rpc('complete_booking_reminder', {
        p_delivery_id: reminder.delivery_id,
        p_status: accepted ? 'sent' : 'failed',
        p_error: failure,
      });
      if (accepted) counts.sent += 1;
      else counts.failed += 1;
    } catch (error) {
      await admin.rpc('complete_booking_reminder', {
        p_delivery_id: reminder.delivery_id,
        p_status: 'failed',
        p_error: error instanceof Error ? error.message : 'Push request failed.',
      });
      counts.failed += 1;
    }
  }

  return Response.json(counts);
});
