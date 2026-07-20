-- ============================================================================
-- RizeON - trusted write boundary foundation
-- Run after all existing migrations, before deploying Edge Functions.
-- This file does NOT revoke legacy writes; apply security-lockdown.sql last.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  outcome text not null check (outcome in ('denied', 'rate_limited', 'invalid_payload', 'authorization_failed')),
  metadata jsonb not null default '{}'::jsonb,
  network_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_events_created_at on public.security_events (created_at desc);
create index if not exists idx_security_events_actor on public.security_events (actor_user_id, created_at desc);

create table if not exists public.security_rate_limits (
  bucket_key text primary key,
  actor_user_id uuid references public.users(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null,
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now()
);

create index if not exists idx_security_rate_limits_updated_at on public.security_rate_limits (updated_at);

alter table public.security_events enable row level security;
alter table public.security_rate_limits enable row level security;

-- Mobile clients never insert security events or access limiter state. Edge
-- Functions use the service role and therefore bypass these policies.
drop policy if exists "aal2 admins read security events" on public.security_events;
create policy "aal2 admins read security events" on public.security_events
  for select using (
    public.is_admin()
    and coalesce((auth.jwt() ->> 'aal'), '') = 'aal2'
  );

revoke all on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;
revoke all on public.security_rate_limits from anon, authenticated;

create or replace function public.consume_security_rate_limit(
  p_actor_user_id uuid,
  p_action text,
  p_network_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_now timestamptz := clock_timestamp();
  v_row public.security_rate_limits%rowtype;
begin
  if p_actor_user_id is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'INVALID_PAYLOAD: Invalid rate-limit input.' using errcode = '22023';
  end if;

  -- Key the bucket on user + action ONLY. This function is always called with an
  -- authenticated actor, so folding the network hash into the key would give one
  -- user a fresh bucket per source IP, letting them reset a per-user throttle by
  -- rotating IPs. p_network_hash is retained in the signature (and security_events)
  -- for audit, but must not weaken the per-user limit.
  v_key := encode(
    extensions.digest(
      p_actor_user_id::text || ':' || p_action,
      'sha256'::text
    ),
    'hex'
  );
  insert into public.security_rate_limits as rl
    (bucket_key, actor_user_id, action, window_started_at, attempts, updated_at)
  values (v_key, p_actor_user_id, p_action, v_now, 1, v_now)
  on conflict (bucket_key) do update set
    attempts = case
      when rl.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
      else rl.attempts + 1
    end,
    window_started_at = case
      when rl.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now
      else rl.window_started_at
    end,
    updated_at = v_now
  returning * into v_row;

  allowed := v_row.attempts <= p_limit;
  retry_after_seconds := greatest(0, ceil(extract(epoch from
    (v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now)))::integer);
  return next;
end;
$$;

create or replace function public.cleanup_security_rate_limits()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_count integer;
begin
  delete from public.security_rate_limits where updated_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.consume_security_rate_limit(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.cleanup_security_rate_limits() from public, anon, authenticated;
grant execute on function public.consume_security_rate_limit(uuid, text, text, integer, integer) to service_role;
grant execute on function public.cleanup_security_rate_limits() to service_role;

-- Users may only inspect their own reward balance. Service-role callers can
-- pass another user for trusted booking workflows.
create or replace function public.free_reward_balance(uid uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when uid = auth.uid() or auth.role() = 'service_role' or public.is_admin()
      then greatest(0,
        floor((select count(*) from public.bookings
         where user_id = uid and status = 'completed' and no_show = false
           and is_free_reward = false and end_time < now()) / 10.0)::integer
        -
        (select count(*)::integer from public.bookings
         where user_id = uid and is_free_reward = true and status <> 'cancelled')
      )
    else 0
  end;
$$;

revoke all on function public.free_reward_balance(uuid) from public, anon;
grant execute on function public.free_reward_balance(uuid) to authenticated;

-- Keep user updates narrowly limited to the local reminder id. Every business
-- field is immutable unless the service role/admin SQL path performs the write.
create or replace function public.enforce_client_booking_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if new.user_id is distinct from old.user_id
      or new.booking_type is distinct from old.booking_type
      or new.sport_type is distinct from old.sport_type
      or new.court_id is distinct from old.court_id
      or new.coach_id is distinct from old.coach_id
      or new.uses_main_court is distinct from old.uses_main_court
      or new.court_half is distinct from old.court_half
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.duration_minutes is distinct from old.duration_minutes
      or new.total_price is distinct from old.total_price
      or new.status is distinct from old.status
      or new.is_recurring is distinct from old.is_recurring
      or new.recurrence_group_id is distinct from old.recurrence_group_id
      or new.is_free_reward is distinct from old.is_free_reward
      or new.ball_machine is distinct from old.ball_machine
      or new.no_show is distinct from old.no_show
      or new.cancelled_at is distinct from old.cancelled_at
      or new.cancel_reason is distinct from old.cancel_reason
      or new.no_show_reason is distinct from old.no_show_reason
      or new.completed_at is distinct from old.completed_at
      or new.created_at is distinct from old.created_at then
      raise exception 'BOOKING_IMMUTABLE: Booking business fields are server-managed.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_client_booking_immutability on public.bookings;
create trigger trg_enforce_client_booking_immutability
  before update on public.bookings
  for each row execute function public.enforce_client_booking_immutability();

revoke all on function public.enforce_client_booking_immutability() from public, anon, authenticated;

create or replace function public.set_own_booking_reminder(p_booking_id uuid, p_notification_id text)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.bookings
  set notification_id = p_notification_id
  where id = p_booking_id and user_id = auth.uid();
$$;

revoke all on function public.set_own_booking_reminder(uuid, text) from public, anon;
grant execute on function public.set_own_booking_reminder(uuid, text) to authenticated;

-- Trigger functions never need direct API execution. Explicit revokes prevent
-- PostgREST callers from treating internal guards as public RPCs.
revoke all on function public.enforce_operating_hours_on_booking() from public, anon, authenticated;
revoke all on function public.reject_booking_on_block() from public, anon, authenticated;
revoke all on function public.prevent_self_admin_promotion() from public, anon, authenticated;
revoke all on function public.force_user_insert_not_admin() from public, anon, authenticated;
revoke all on function public.restrict_user_booking_updates() from public, anon, authenticated;
revoke all on function public.enforce_booking_policy() from public, anon, authenticated;
revoke all on function public.enforce_booking_update_policy() from public, anon, authenticated;
revoke all on function public.enforce_booking_integrity() from public, anon, authenticated;
revoke all on function public.compute_booking_price() from public, anon, authenticated;
revoke all on function public.restrict_user_notification_updates() from public, anon, authenticated;
revoke all on function public.create_booking_loyalty_transactions() from public, anon, authenticated;

-- These are the only client-callable definer helpers retained.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

select public.mark_schema_migration('security-boundary.sql', 'Trusted write security foundation');
