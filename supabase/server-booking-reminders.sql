-- ============================================================================
-- RizeON - server-driven booking reminders
-- Run after push-readiness.sql and post-lockdown-integrity.sql. Idempotent.
--
-- The mobile app used to schedule one-hour reminders on the customer's device.
-- An admin cancellation happens on another device, so that local alarm could
-- not be revoked reliably. This ledger lets a scheduled Edge Function send the
-- reminder only after re-checking the authoritative booking state.
-- ============================================================================

alter table public.push_tokens
  add column if not exists booking_reminders_enabled boolean not null default true;

create table if not exists public.booking_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_start_time timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'no_tokens', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  claimed_until timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, booking_start_time)
);

create index if not exists idx_booking_reminder_deliveries_due
  on public.booking_reminder_deliveries (next_attempt_at, claimed_until)
  where status in ('pending', 'processing', 'failed');

alter table public.booking_reminder_deliveries enable row level security;
revoke all on public.booking_reminder_deliveries from anon, authenticated;

create or replace function public.cleanup_stale_booking_reminders()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  delete from public.booking_reminder_deliveries
  where booking_id=new.id and status<>'sent'
    and (new.status<>'confirmed' or new.no_show or booking_start_time<>new.start_time);
  return new;
end; $$;
drop trigger if exists trg_cleanup_stale_booking_reminders on public.bookings;
create trigger trg_cleanup_stale_booking_reminders
  after update of start_time,status,no_show on public.bookings for each row
  execute function public.cleanup_stale_booking_reminders();

create or replace function public.claim_due_booking_reminders(p_limit integer default 100)
returns table (
  delivery_id uuid,
  booking_id uuid,
  user_id uuid,
  booking_type public.booking_type,
  sport_type public.sport_type,
  start_time timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED: Service role required.' using errcode = 'insufficient_privilege';
  end if;
  if p_limit < 1 or p_limit > 500 then
    raise exception 'INVALID_PAYLOAD: Invalid reminder claim limit.' using errcode = '22023';
  end if;

  -- A five-minute cron run first sees a booking between 55 and 60 minutes
  -- before start. The wider lower bound tolerates a temporarily delayed job.
  insert into public.booking_reminder_deliveries (booking_id, booking_start_time)
  select b.id, b.start_time
  from public.bookings b
  where b.status = 'confirmed'
    and b.no_show = false
    and b.start_time > now() + interval '45 minutes'
    and b.start_time <= now() + interval '60 minutes'
  on conflict on constraint booking_reminder_deliveries_booking_id_booking_start_time_key
  do nothing;

  return query
  with picked as (
    select d.id
    from public.booking_reminder_deliveries d
    join public.bookings b
      on b.id = d.booking_id
     and b.start_time = d.booking_start_time
    where d.status in ('pending', 'failed', 'processing')
      and d.attempts < 3
      and d.next_attempt_at <= now()
      and (
        d.status <> 'processing'
        or d.claimed_until is null
        or d.claimed_until <= now()
      )
      and b.status = 'confirmed'
      and b.no_show = false
      and b.start_time > now()
    order by b.start_time, d.created_at
    for update of d skip locked
    limit p_limit
  ), claimed as (
    update public.booking_reminder_deliveries d
    set status = 'processing',
        attempts = d.attempts + 1,
        claimed_until = now() + interval '5 minutes',
        updated_at = now()
    from picked
    where d.id = picked.id
    returning d.id, d.booking_id
  )
  select c.id, b.id, b.user_id, b.booking_type, b.sport_type, b.start_time
  from claimed c
  join public.bookings b on b.id = c.booking_id
  where b.status = 'confirmed' and b.no_show = false and b.start_time > now();
end;
$$;

create or replace function public.complete_booking_reminder(
  p_delivery_id uuid,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED: Service role required.' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('sent', 'no_tokens', 'failed') then
    raise exception 'INVALID_PAYLOAD: Invalid reminder result.' using errcode = '22023';
  end if;

  update public.booking_reminder_deliveries
  set status = p_status,
      sent_at = case when p_status = 'sent' then now() else sent_at end,
      last_error = left(p_error, 1000),
      claimed_until = null,
      next_attempt_at = case when p_status = 'failed' then now() + interval '2 minutes' else next_attempt_at end,
      updated_at = now()
  where id = p_delivery_id and status = 'processing';
end;
$$;

revoke all on function public.claim_due_booking_reminders(integer) from public, anon, authenticated;
revoke all on function public.complete_booking_reminder(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_due_booking_reminders(integer) to service_role;
grant execute on function public.complete_booking_reminder(uuid, text, text) to service_role;

-- Remove obsolete device-local reminder identifiers. New reminders are tracked
-- by booking/start time in booking_reminder_deliveries instead.
update public.bookings set notification_id = null where notification_id is not null;

select public.mark_schema_migration('server-booking-reminders.sql', 'Server booking reminders');
