-- ============================================================================
-- RizeON — business controls
-- Run after schema.sql / policies.sql. Idempotent.
-- Adds weekly operating hours controlled by admins.
-- ============================================================================

create table if not exists public.operating_hours (
  day_of_week integer primary key check (day_of_week between 0 and 6),
  open_time time not null default '08:00',
  close_time time not null default '24:00',
  is_closed boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint chk_operating_hours_order check (is_closed = true or close_time > open_time)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.operating_hours'::regclass and conname='chk_operating_hours_order') then
    alter table public.operating_hours add constraint chk_operating_hours_order
      check (is_closed=true or close_time>open_time) not valid;
  end if;
end $$;
alter table public.operating_hours validate constraint chk_operating_hours_order;

insert into public.operating_hours (day_of_week, open_time, close_time, is_closed)
select d, '08:00'::time, '24:00'::time, false
from generate_series(0, 6) as d
on conflict (day_of_week) do nothing;

alter table public.operating_hours enable row level security;

drop policy if exists "read operating_hours" on public.operating_hours;
create policy "read operating_hours" on public.operating_hours
  for select using (true);

drop policy if exists "admin write operating_hours" on public.operating_hours;
create policy "admin write operating_hours" on public.operating_hours
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- Booking guard: normal users must stay inside operating hours ----------
-- Admins/service-role callers can override for special events. The app also
-- checks this client-side, but this trigger is the authoritative server guard.
create or replace function public.assert_booking_time_contract(
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_duration_minutes integer,
  p_enforce_operating_hours boolean default true
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_local_date date;
  v_hours public.operating_hours%rowtype;
  v_open_at timestamptz;
  v_close_at timestamptz;
begin
  if p_start_time is null or p_end_time is null or p_duration_minutes is null
     or p_duration_minutes < 30 or p_duration_minutes > 180
     or date_trunc('minute', p_start_time) <> p_start_time
     or date_trunc('minute', p_end_time) <> p_end_time
     or p_end_time <= p_start_time
     or extract(epoch from (p_end_time - p_start_time)) <> p_duration_minutes * 60 then
    raise exception 'INVALID_DURATION: Booking times must be whole minutes and match a 30 to 180 minute duration.'
      using errcode = 'check_violation';
  end if;

  if not p_enforce_operating_hours then
    return;
  end if;

  v_local_date := (p_start_time at time zone 'Asia/Beirut')::date;
  select * into v_hours
  from public.operating_hours
  where day_of_week = extract(dow from v_local_date)::integer;

  if not found or v_hours.is_closed then
    raise exception 'COURT_CLOSED: The court is closed on this day.'
      using errcode = 'check_violation';
  end if;

  v_open_at := (v_local_date + v_hours.open_time) at time zone 'Asia/Beirut';
  v_close_at := case
    when v_hours.close_time = time '24:00'
      then ((v_local_date + 1)::timestamp) at time zone 'Asia/Beirut'
    else (v_local_date + v_hours.close_time) at time zone 'Asia/Beirut'
  end;

  if p_start_time < v_open_at or p_end_time > v_close_at then
    raise exception 'OUTSIDE_OPERATING_HOURS: This booking is outside operating hours.'
      using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function public.assert_booking_time_contract(timestamptz, timestamptz, integer, boolean)
  from public, anon, authenticated;

create or replace function public.enforce_operating_hours_on_booking()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    perform public.assert_booking_time_contract(
      new.start_time,
      new.end_time,
      new.duration_minutes,
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_operating_hours_on_booking on public.bookings;
create trigger trg_enforce_operating_hours_on_booking
  before insert or update of start_time, end_time, duration_minutes on public.bookings
  for each row
  execute function public.enforce_operating_hours_on_booking();

select public.mark_schema_migration('business-controls.sql', 'Business controls');
