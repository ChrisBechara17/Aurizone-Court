-- ============================================================================
-- CourtHub — server-side double-booking guard
-- Run once in the Supabase SQL editor (after schema.sql / policies.sql).
--
-- This makes overlapping bookings IMPOSSIBLE at the database level, even if two
-- people tap "Confirm" at the exact same millisecond. The app's client-side
-- check is now just a fast, friendly first line of defense — this is the
-- authoritative one.
-- ============================================================================

-- Needed so a GiST index can combine an equality column (court_id) with a
-- range-overlap column (the time range).
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- 1) Booking-vs-booking overlap  (the concurrency-critical case)
--
-- An EXCLUSION CONSTRAINT is enforced atomically by Postgres: it rejects any
-- second confirmed booking on the same court whose [start, end) time range
-- overlaps an existing confirmed one. No race condition is possible.
-- Cancelled bookings are excluded by the WHERE clause, so cancelling frees the
-- slot immediately.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add constraint no_main_court_overlap
  exclude using gist (
    court_id with =,
    tstzrange(start_time, end_time) with &&
  )
  where (uses_main_court = true and status = 'confirmed');

-- ---------------------------------------------------------------------------
-- 2) Coach-vs-coach overlap
--
-- Coach sessions also need an authoritative DB guard. The app checks this on
-- the client, but two admins can still submit at nearly the same time, or a
-- caller can bypass the app and write through the API. This rejects any second
-- confirmed booking for the same coach whose [start, end) range overlaps an
-- existing confirmed booking. Cancelled/completed rows do not block the coach.
--
-- If this fails when first added, clean up existing overlapping confirmed coach
-- bookings, then re-run this file.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'no_coach_overlap'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint no_coach_overlap
      exclude using gist (
        coach_id with =,
        tstzrange(start_time, end_time, '[)') with &&
      )
      where (status = 'confirmed' and coach_id is not null);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Booking-vs-block overlap
--
-- The exclusion constraint only compares bookings to each other. This trigger
-- also rejects a booking that overlaps an admin-created court block.
-- ---------------------------------------------------------------------------
create or replace function public.reject_booking_on_block()
returns trigger
language plpgsql
as $$
begin
  if new.uses_main_court and new.status = 'confirmed' then
    if exists (
      select 1
      from public.court_blocks cb
      where cb.court_id = new.court_id
        and tstzrange(cb.start_time, cb.end_time) && tstzrange(new.start_time, new.end_time)
    ) then
      raise exception 'The court is blocked during this time.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reject_booking_on_block on public.bookings;
create trigger trg_reject_booking_on_block
  before insert on public.bookings
  for each row
  execute function public.reject_booking_on_block();
