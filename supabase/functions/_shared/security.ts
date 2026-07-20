import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4';

export type ApiResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string; code: string; retryAfter?: number };
export type RequestContext = {
  admin: SupabaseClient;
  user: User;
  profile: { id: string; is_admin: boolean };
  aal: string;
  networkHash: string;
};

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export function response(body: ApiResult, status = body.ok ? 200 : 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

export async function authorize(req: Request, requireAdmin = false): Promise<RequestContext> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Authentication required.'), { status: 401, code: 'AUTH_REQUIRED' });

  const url = env('SUPABASE_URL');
  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) throw Object.assign(new Error('Invalid or expired session.'), { status: 401, code: 'INVALID_JWT' });

  const { data: profile, error: profileError } = await admin
    .from('users').select('id,is_admin').eq('id', authData.user.id).single();
  if (profileError || !profile) throw Object.assign(new Error('User profile not found.'), { status: 403, code: 'PROFILE_REQUIRED' });

  const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
  const aal = String(payload.aal ?? 'aal1');
  if (requireAdmin && !profile.is_admin) throw Object.assign(new Error('Admin access required.'), { status: 403, code: 'ADMIN_REQUIRED' });
  if (requireAdmin && aal !== 'aal2') throw Object.assign(new Error('Admin MFA verification required.'), { status: 403, code: 'MFA_REQUIRED' });

  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  return { admin, user: authData.user, profile, aal, networkHash: await sha256(forwarded + env('SECURITY_HASH_SALT')) };
}

export async function limit(ctx: RequestContext, action: string, count: number, seconds: number): Promise<void> {
  const { data, error } = await ctx.admin.rpc('consume_security_rate_limit', {
    p_actor_user_id: ctx.user.id,
    p_action: action,
    p_network_hash: ctx.networkHash,
    p_limit: count,
    p_window_seconds: seconds,
  });
  if (error) rpcError(error);
  const result = data?.[0];
  if (!result?.allowed) {
    await securityEvent(ctx, action, 'rate_limited', { retryAfter: result?.retry_after_seconds });
    throw Object.assign(new Error('Too many attempts. Please try again later.'), {
      status: 429, code: 'RATE_LIMITED', retryAfter: result?.retry_after_seconds ?? seconds,
    });
  }
}

export async function securityEvent(
  ctx: RequestContext,
  action: string,
  outcome: 'denied' | 'rate_limited' | 'invalid_payload' | 'authorization_failed',
  metadata: Record<string, unknown> = {},
) {
  await ctx.admin.from('security_events').insert({
    actor_user_id: ctx.user.id,
    action,
    outcome,
    metadata,
    network_hash: ctx.networkHash,
  });
}

export async function parse<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await req.json().catch(() => null);
  const result = schema.safeParse(raw);
  if (!result.success) throw Object.assign(new Error('Invalid request payload.'), {
    status: 400, code: 'INVALID_PAYLOAD', details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
  return result.data;
}

// Stable application error codes raised by secure RPCs. Public text comes only
// from this allowlist; SQL text and unexpected database errors stay server-side.
const PUBLIC_RPC_ERRORS: Record<string, { status: number; message: string }> = {
  ACCOUNT_DISABLED: { status: 403, message: 'This account is disabled.' },
  ADMIN_REQUIRED: { status: 403, message: 'Admin access is required.' },
  AUTH_REQUIRED: { status: 401, message: 'Authentication is required.' },
  BOOKING_CONFLICT: { status: 409, message: 'That time was just booked. Please choose another available slot.' },
  BOOKING_IMMUTABLE: { status: 403, message: 'Booking details can only be changed through supported booking actions.' },
  CANCELLATION_CUTOFF: { status: 409, message: 'Bookings cannot be cancelled within 3 hours of the start time.' },
  COURT_BLOCKED: { status: 409, message: 'The court is blocked during this time.' },
  COURT_CLOSED: { status: 400, message: 'The court is closed on the selected day.' },
  DUPLICATE: { status: 409, message: 'This action was already applied.' },
  INVALID_ACTION: { status: 400, message: 'That action is not supported.' },
  INVALID_COURT_HALF: { status: 400, message: 'The selected court half is invalid.' },
  INVALID_DURATION: { status: 400, message: 'Duration must be between 30 minutes and 3 hours and match the selected times.' },
  INVALID_PAYLOAD: { status: 400, message: 'The request was invalid.' },
  INVALID_REFERENCE: { status: 400, message: 'The request referenced something that no longer exists.' },
  INVALID_STATE: { status: 409, message: 'This item changed and the action can no longer be applied.' },
  NOT_FOUND: { status: 404, message: 'The requested item was not found.' },
  NOTIFICATION_OWNERSHIP: { status: 403, message: 'You cannot modify another user\'s notification.' },
  OUTSIDE_OPERATING_HOURS: { status: 400, message: 'That time is outside operating hours.' },
  OWNERSHIP_MISMATCH: { status: 403, message: 'You cannot modify another user\'s booking.' },
  PAST_START: { status: 400, message: 'Bookings must start in the future.' },
  PROFILE_REQUIRED: { status: 403, message: 'A user profile is required.' },
  REWARD_BATCH_INVALID: { status: 400, message: 'Free rewards cannot be combined with recurring bookings.' },
  REWARD_UNAVAILABLE: { status: 409, message: 'A free reward is not currently available.' },
  SERVICE_ROLE_REQUIRED: { status: 403, message: 'This operation is restricted to the trusted server.' },
  TOKEN_OWNERSHIP: { status: 409, message: 'This device token is active for another account. Sign out there before registering it here.' },
  USER_FIELD_IMMUTABLE: { status: 403, message: 'Protected account fields cannot be changed directly.' },
};

// Translate a Supabase/Postgres RPC error into a safe client-facing throw.
// Never forwards raw Postgres text (constraint names, columns, internal RAISE)
// for unexpected faults, and never mislabels a 500 as a 409.
export function rpcError(error: { message?: string; code?: string } | null): never {
  const sqlstate = error?.code ?? '';
  if (sqlstate === '23P01') {
    throw Object.assign(new Error('That time was just booked. Please choose another available slot.'), { status: 409, code: 'BOOKING_CONFLICT' });
  }
  if (sqlstate === '23505') {
    const duplicate = PUBLIC_RPC_ERRORS.DUPLICATE;
    throw Object.assign(new Error(duplicate.message), { status: duplicate.status, code: 'DUPLICATE' });
  }
  const raw = error?.message ?? '';
  const tag = /^([A-Z][A-Z0-9_]+):(?:\s|$)/.exec(raw)?.[1];
  const publicError = tag ? PUBLIC_RPC_ERRORS[tag] : undefined;
  if (tag && publicError) {
    // SQL supplies a stable code; public wording is owned by this allowlist.
    throw Object.assign(new Error(publicError.message), { status: publicError.status, code: tag });
  }
  console.error('Suppressed unmapped RPC error', { code: sqlstate, message: raw });
  throw Object.assign(new Error('Something went wrong. Please try again.'), { status: 500, code: 'SERVER_ERROR' });
}

export async function run(req: Request, requireAdmin: boolean, handler: (ctx: RequestContext) => Promise<unknown>) {
  const early = preflight(req);
  if (early) return early;
  let ctx: RequestContext | null = null;
  try {
    ctx = await authorize(req, requireAdmin);
    const data = await handler(ctx);
    return response({ ok: true, data });
  } catch (error) {
    const e = error as Error & { status?: number; code?: string; retryAfter?: number; details?: unknown };
    if (ctx && e.code === 'INVALID_PAYLOAD') await securityEvent(ctx, 'request', 'invalid_payload', { details: e.details });
    if (e.code && e.status) {
      return response({ ok: false, error: e.message || 'Request failed.', code: e.code, retryAfter: e.retryAfter }, e.status);
    }
    console.error('Suppressed untyped Edge Function error', error);
    return response({ ok: false, error: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' }, 500);
  }
}

export const uuid = z.string().uuid();
export const isoDate = z.string().datetime({ offset: true });
