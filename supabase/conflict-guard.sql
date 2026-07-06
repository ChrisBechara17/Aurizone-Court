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
-- 2) Booking-vs-block overlap
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
