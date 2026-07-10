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
create or replace function public.enforce_operating_hours_on_booking()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  local_start timestamp;
  local_end timestamp;
  dow integer;
  hours public.operating_hours%rowtype;
  start_minutes integer;
  end_minutes integer;
  open_minutes integer;
  close_minutes integer;
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    local_start := new.start_time at time zone 'Asia/Beirut';
    local_end := new.end_time at time zone 'Asia/Beirut';
    dow := extract(dow from local_start)::integer;

    select * into hours
    from public.operating_hours
    where day_of_week = dow;

    if not found or hours.is_closed then
      raise exception 'The court is closed on this day.'
        using errcode = 'check_violation';
    end if;

    start_minutes := extract(hour from local_start)::integer * 60 + extract(minute from local_start)::integer;
    end_minutes := extract(hour from local_end)::integer * 60 + extract(minute from local_end)::integer;
    if local_end::date > local_start::date then
      end_minutes := end_minutes + 1440;
    end if;
    open_minutes := extract(hour from hours.open_time)::integer * 60 + extract(minute from hours.open_time)::integer;
    close_minutes := extract(hour from hours.close_time)::integer * 60 + extract(minute from hours.close_time)::integer;

    if start_minutes < open_minutes or end_minutes > close_minutes then
      raise exception 'This booking is outside operating hours.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_operating_hours_on_booking on public.bookings;
create trigger trg_enforce_operating_hours_on_booking
  before insert on public.bookings
  for each row
  execute function public.enforce_operating_hours_on_booking();

select public.mark_schema_migration('business-controls.sql', 'Business controls');
