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
  if (error) throw error;
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
    return response({ ok: false, error: e.message || 'Request failed.', code: e.code ?? 'SERVER_ERROR', retryAfter: e.retryAfter }, e.status ?? 500);
  }
}

export const uuid = z.string().uuid();
export const isoDate = z.string().datetime({ offset: true });
