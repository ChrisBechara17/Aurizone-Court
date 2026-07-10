-- ============================================================================
-- RizeON — server-side booking integrity hardening
-- Run in the Supabase SQL editor LAST, after schema.sql / policies.sql /
-- conflict-guard.sql / pricing.sql / half-court.sql. Idempotent.
--
-- Closes four REST-exploitable booking bugs found in the bug hunt. Every rule
-- here is enforced in Postgres, so it holds even when a signed-in user calls
-- the REST/PostgREST API directly and bypasses all client code.
--
--   Q1  A client set uses_main_court=false to slip past the overlap exclusion
--       constraint AND the court-block trigger (both gated on uses_main_court),
--       double-booking the one physical court. -> force it true for court rows.
--   Q4  Tennis could be inserted as a half-court booking (court_half a/b) and
--       coexist with a basketball booking on the other half of the same court,
--       which is physically impossible and also mispriced. -> half is basketball
--       only.
--   Q3  Price is derived from the real start/end span (see pricing.sql /
--       half-court.sql), but nothing stopped a client from occupying 3h while
--       sending duration_minutes=1, or booking an unbounded span. -> require
--       duration_minutes to match the span and cap the span at 3 hours.
-- ============================================================================

-- ---- Q1) force court bookings onto the main court --------------------------
-- All court bookings use the single physical Main Court, so uses_main_court must
-- be true for them. A BEFORE trigger forces it (so a legitimate client can never
-- fail), and a CHECK constraint is the declarative backstop. This must run before
-- trg_reject_booking_on_block (which reads uses_main_court); trigger firing order
-- is alphabetical and 'enforce' < 'reject', so it does.
create or replace function public.enforce_booking_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.booking_type = 'court' then
    new.uses_main_court := true;
  end if;

  -- B1: reject brand-new bookings whose start is already in the past. A past
  -- booking is instantly "completed", so it bypasses the one-active-booking
  -- limit and farms loyalty rewards. Only guard INSERTs so cancels/updates of
  -- historical rows still work.
  if tg_op = 'INSERT' and new.status = 'confirmed' and new.start_time <= now() then
    raise exception 'Bookings must start in the future.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_booking_integrity on public.bookings;
create trigger trg_enforce_booking_integrity
  before insert or update on public.bookings
  for each row
  execute function public.enforce_booking_integrity();

alter table public.bookings drop constraint if exists chk_court_uses_main_court;
alter table public.bookings
  add constraint chk_court_uses_main_court
  check (booking_type <> 'court' or uses_main_court = true);

-- ---- Q4) half-court is basketball-only ------------------------------------
-- court_half 'a'/'b' occupy only one side of the court; that only makes sense for
-- basketball. Tennis (and anything else) must take the full court.
alter table public.bookings drop constraint if exists chk_half_court_basketball_only;
alter table public.bookings
  add constraint chk_half_court_basketball_only
  check (court_half = 'full' or sport_type = 'basketball');

-- ---- Q3) duration must match the span, capped at 3 hours ------------------
-- Pricing already derives hours from (end_time - start_time); these constraints
-- stop a client from (a) claiming a shorter duration_minutes than it actually
-- occupies, or (b) booking a span longer than the 3h house rule.
alter table public.bookings drop constraint if exists chk_duration_matches_span;
alter table public.bookings
  add constraint chk_duration_matches_span
  check (duration_minutes = round(extract(epoch from (end_time - start_time)) / 60.0));

alter table public.bookings drop constraint if exists chk_max_duration_3h;
alter table public.bookings
  add constraint chk_max_duration_3h
  check (end_time - start_time <= interval '3 hours');
