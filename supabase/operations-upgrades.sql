-- ============================================================================
-- RizeON — operations upgrades
-- Run after schema.sql / policies.sql / pricing.sql / app-config.sql.
-- Adds admin audit logs, in-app notifications, booking lifecycle reasons, and
-- loyalty transaction history. Idempotent — safe to re-run.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---- 1) Booking lifecycle metadata ----------------------------------------
alter table public.bookings add column if not exists cancel_reason text;
alter table public.bookings add column if not exists no_show_reason text;
alter table public.bookings add column if not exists completed_at timestamptz;

-- ---- 2) Admin audit log ----------------------------------------------------
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "admins read audit logs" on public.admin_audit_logs;
create policy "admins read audit logs" on public.admin_audit_logs
  for select using (public.is_admin());

drop policy if exists "admins insert audit logs" on public.admin_audit_logs;
create policy "admins insert audit logs" on public.admin_audit_logs
  for insert with check (public.is_admin());

create index if not exists idx_admin_audit_logs_created_at
  on public.admin_audit_logs (created_at desc);

-- ---- 3) In-app notifications ----------------------------------------------
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'general',
  related_entity_type text,
  related_entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.user_notifications enable row level security;

drop policy if exists "users read own notifications" on public.user_notifications;
create policy "users read own notifications" on public.user_notifications
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "users mark own notifications read" on public.user_notifications;
create policy "users mark own notifications read" on public.user_notifications
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "admins create notifications" on public.user_notifications;
create policy "admins create notifications" on public.user_notifications
  for insert with check (public.is_admin());

create index if not exists idx_user_notifications_user_created
  on public.user_notifications (user_id, created_at desc);

-- ---- 4) Loyalty transaction ledger ----------------------------------------
create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  type text not null,
  points integer not null,
  description text not null,
  created_by_admin_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.loyalty_transactions enable row level security;

drop policy if exists "users read own loyalty transactions" on public.loyalty_transactions;
create policy "users read own loyalty transactions" on public.loyalty_transactions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "admins insert loyalty transactions" on public.loyalty_transactions;
create policy "admins insert loyalty transactions" on public.loyalty_transactions
  for insert with check (public.is_admin());

drop policy if exists "users insert own booking loyalty transactions" on public.loyalty_transactions;

create unique index if not exists idx_loyalty_transactions_once_per_type
  on public.loyalty_transactions (booking_id, type)
  where booking_id is not null;

create index if not exists idx_loyalty_transactions_user_created
  on public.loyalty_transactions (user_id, created_at desc);

create or replace function public.app_setting_number(setting_key text, fallback integer)
returns integer
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select coalesce((select value::integer from public.app_settings where key = setting_key), fallback);
$$;

create or replace function public.create_booking_loyalty_transactions()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  prior_good integer;
  base_points integer;
begin
  if new.status <> 'cancelled' and coalesce(new.no_show, false) = false then
    select count(*) into prior_good
    from public.bookings b
    where b.user_id = new.user_id
      and b.id <> new.id
      and b.status <> 'cancelled'
      and coalesce(b.no_show, false) = false;

    base_points := case
      when prior_good = 0 then public.app_setting_number('loyalty_first_booking_bonus', 50)
      else public.app_setting_number('loyalty_points_per_booking', 10)
    end;

    insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
    values (
      new.user_id,
      new.id,
      'booking_base',
      base_points,
      case when prior_good = 0 then 'First booking bonus' else 'Booking points' end
    )
    on conflict do nothing;
  end if;

  if new.status = 'completed' and coalesce(new.no_show, false) = false then
    insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
    values (
      new.user_id,
      new.id,
      'completion_bonus',
      public.app_setting_number('loyalty_completion_bonus', 5),
      'Completed booking bonus'
    )
    on conflict do nothing;
  end if;

  if new.status <> 'cancelled' and coalesce(new.no_show, false) = true then
    insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
    values (
      new.user_id,
      new.id,
      'no_show_penalty',
      -public.app_setting_number('loyalty_no_show_penalty', 20),
      'No-show penalty'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_create_booking_loyalty_transactions on public.bookings;
create trigger trg_create_booking_loyalty_transactions
  after insert on public.bookings
  for each row
  execute function public.create_booking_loyalty_transactions();

-- Backfill explainable point history from current bookings. Existing rows are
-- ignored by the unique index, so this is safe to re-run.
with ranked as (
  select
    b.*,
    row_number() over (partition by b.user_id order by b.start_time, b.created_at, b.id) as booking_rank
  from public.bookings b
  where b.status <> 'cancelled'
    and coalesce(b.no_show, false) = false
),
base_points as (
  insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
  select
    user_id,
    id,
    'booking_base',
    case when booking_rank = 1 then 50 else 10 end,
    case when booking_rank = 1 then 'First booking bonus' else 'Booking points' end
  from ranked
  on conflict do nothing
  returning id
),
completion_points as (
  insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
  select user_id, id, 'completion_bonus', 5, 'Completed booking bonus'
  from public.bookings
  where status = 'completed'
    and coalesce(no_show, false) = false
  on conflict do nothing
  returning id
)
insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
select user_id, id, 'no_show_penalty', -20, 'No-show penalty'
from public.bookings
where status <> 'cancelled'
  and coalesce(no_show, false) = true
on conflict do nothing;

select public.mark_schema_migration('operations-upgrades.sql', 'Operations upgrades');
