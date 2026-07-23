-- Read-only diagnostics to run before remediation-2026-07.sql.
-- Review every result set before applying the transactional migration.

select id,name,is_active from public.courts order by name,id;
select day_of_week,open_time,close_time,is_closed from public.operating_hours order by day_of_week;

-- Confirm which row the migration will select. A configured Main Court wins;
-- otherwise the lowest Main Court UUID is selected deterministically.
select c.id as selected_main_court_id,c.name,c.is_active
from public.courts c
where c.name='Main Court'
order by
  (c.id::text=coalesce((select value from public.app_config where key='main_court_id'),'')) desc,
  c.id
limit 1;

-- These rows would collide after all Main Court occupancy is repointed.
select
  a.id as booking_a,a.court_id as court_a,
  b.id as booking_b,b.court_id as court_b,
  greatest(a.start_time,b.start_time) as overlap_start,
  least(a.end_time,b.end_time) as overlap_end
from public.bookings a
join public.bookings b on a.id<b.id
  and a.court_id is distinct from b.court_id
  and a.status='confirmed' and b.status='confirmed'
  and a.uses_main_court and b.uses_main_court
  and tstzrange(a.start_time,a.end_time,'[)') && tstzrange(b.start_time,b.end_time,'[)')
order by overlap_start;

-- These block/booking pairs would collide after canonical repointing.
select
  cb.id as block_id,cb.court_id as block_court,
  b.id as booking_id,b.court_id as booking_court,
  greatest(cb.start_time,b.start_time) as overlap_start,
  least(cb.end_time,b.end_time) as overlap_end
from public.court_blocks cb
join public.bookings b
  on cb.court_id is distinct from b.court_id
 and b.status='confirmed'
 and b.uses_main_court
 and tstzrange(cb.start_time,cb.end_time,'[)') && tstzrange(b.start_time,b.end_time,'[)')
order by overlap_start;

do $$
begin
  if not exists(select 1 from public.courts where name='Main Court') then
    raise exception 'INVALID_STATE: Remediation requires a court named Main Court.' using errcode='check_violation';
  end if;
  if exists(select 1 from public.operating_hours where not is_closed and close_time<=open_time) then
    raise exception 'INVALID_STATE: Correct inverted operating hours before remediation.' using errcode='check_violation';
  end if;
  if to_regclass('public.push_tokens') is null then
    raise exception 'INVALID_STATE: Apply push-readiness.sql before remediation.' using errcode='check_violation';
  end if;
  if to_regclass('public.booking_reminder_deliveries') is null then
    raise exception 'INVALID_STATE: Apply server-booking-reminders.sql before remediation.' using errcode='check_violation';
  end if;
  if exists(
    select 1 from public.bookings a join public.bookings b
      on a.id<b.id and a.court_id is distinct from b.court_id
     and a.status='confirmed' and b.status='confirmed'
     and a.uses_main_court and b.uses_main_court
     and tstzrange(a.start_time,a.end_time,'[)') && tstzrange(b.start_time,b.end_time,'[)')
  ) or exists(
    select 1 from public.court_blocks cb join public.bookings b
      on cb.court_id is distinct from b.court_id
     and b.status='confirmed' and b.uses_main_court
     and tstzrange(cb.start_time,cb.end_time,'[)') && tstzrange(b.start_time,b.end_time,'[)')
  ) then
    raise exception 'BOOKING_CONFLICT: Resolve the cross-court preflight rows before remediation.' using errcode='exclusion_violation';
  end if;
end $$;
