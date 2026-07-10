-- ============================================================================
-- CourtHub — close two RLS privilege-escalation holes
-- Run in the Supabase SQL editor AFTER schema.sql / policies.sql / conflict-guard.sql
-- / privacy-view.sql. Idempotent — safe to re-run.
--
-- Problem: "users update own profile" and "users cancel own bookings" are
-- blanket UPDATE policies gated only on ownership (id = auth.uid() /
-- user_id = auth.uid()), with no column restriction. Any signed-in user can
-- call the REST API directly (bypassing the app UI entirely) and:
--   (a) PATCH their own users row to set is_admin = true, or
--   (b) PATCH their own bookings row to clear no_show strikes, mark a booking
--       'completed' to farm loyalty points, or rewrite its time/price.
--
-- Fix: BEFORE UPDATE triggers that reject those specific column changes when
-- performed by a normal signed-in user (auth.role() = 'authenticated' and not
-- an admin). The Supabase SQL editor runs as a different role entirely, so the
-- documented admin-promotion command
--   update public.users set is_admin = true where phone_or_email = '…';
-- still works unaffected. service_role (a future backend) is also unaffected.
-- ============================================================================

-- ---- 1) users: block self-promotion to admin via UPDATE -------------------
create or replace function public.prevent_self_admin_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.role() = 'authenticated' then
    raise exception 'is_admin cannot be changed by the user.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_admin_promotion on public.users;
create trigger trg_prevent_self_admin_promotion
  before update on public.users
  for each row
  execute function public.prevent_self_admin_promotion();

-- ---- 2) bookings: normal users may only cancel, nothing else --------------
-- Also enforces the 3-hour cancel cutoff server-side (mirrors the app's
-- CANCEL_CUTOFF_HOURS in src/utils/accountStanding.ts — keep the two in sync).
create or replace function public.restrict_user_booking_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins and any non-client caller (service_role, SQL editor) are unrestricted.
  if auth.role() = 'authenticated' and not public.is_admin() then
    if new.status is distinct from old.status
       and not (old.status = 'confirmed' and new.status = 'cancelled') then
      raise exception 'You can only cancel a confirmed booking.';
    end if;

    -- 3-hour cancel cutoff: can't cancel within 3h of the start time.
    if old.status = 'confirmed' and new.status = 'cancelled'
       and old.start_time - now() < interval '3 hours' then
      raise exception 'Bookings can''t be cancelled within 3 hours of the start time.';
    end if;

    if new.no_show is distinct from old.no_show
      or new.total_price is distinct from old.total_price
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.duration_minutes is distinct from old.duration_minutes
      or new.sport_type is distinct from old.sport_type
      or new.court_id is distinct from old.court_id
      or new.coach_id is distinct from old.coach_id
      or new.booking_type is distinct from old.booking_type
      or new.uses_main_court is distinct from old.uses_main_court
      or new.is_free_reward is distinct from old.is_free_reward
      or new.ball_machine is distinct from old.ball_machine
      or new.cancel_reason is distinct from old.cancel_reason
      or new.no_show_reason is distinct from old.no_show_reason
      or new.completed_at is distinct from old.completed_at
      or new.user_id is distinct from old.user_id
      or new.is_recurring is distinct from old.is_recurring
      or new.recurrence_group_id is distinct from old.recurrence_group_id
    then
      raise exception 'You can only cancel your booking, not modify it.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_user_booking_updates on public.bookings;
create trigger trg_restrict_user_booking_updates
  before update on public.bookings
  for each row
  execute function public.restrict_user_booking_updates();

-- ---- 3) bookings: enforce anti-abuse policy on INSERT ---------------------
-- Mirrors src/utils/accountStanding.ts server-side (keep the numbers in sync):
--   • MAX_STRIKES = 3      → 3+ no-shows disables the account.
--   • MAX_ACTIVE_RESERVATIONS = 1 → one upcoming confirmed booking at a time.
-- Admins (and service_role / SQL editor) bypass these limits, matching the
-- admin console which force-cancels and blocks court time.
create or replace function public.enforce_booking_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  strike_count integer;
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    -- Defense in depth: a user may only create their own bookings.
    if new.user_id is distinct from auth.uid() then
      raise exception 'You can only create bookings for yourself.';
    end if;

    -- 3-strike disable: block booking once the account has 3+ no-shows.
    select count(*) into strike_count
    from public.bookings
    where user_id = new.user_id and no_show = true and status <> 'cancelled';
    if strike_count >= 3 then
      raise exception 'Your account is disabled after 3 no-shows. Please contact the front desk.';
    end if;

    -- (The one-active-booking limit was removed: users may hold any number of
    --  upcoming bookings.)
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_booking_policy on public.bookings;
create trigger trg_enforce_booking_policy
  before insert on public.bookings
  for each row
  execute function public.enforce_booking_policy();

-- ---- 3b) cancellation is admin-only ---------------------------------------
-- Users may no longer cancel (or otherwise change the lifecycle of) their own
-- bookings — they must call the front desk and an admin cancels for them. The
-- "users update own bookings" RLS policy is kept so the client can still write
-- notification_id on its own rows; this trigger rejects any attempt by a
-- non-admin to change status / cancelled_at / no_show.
create or replace function public.enforce_booking_update_policy()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if new.status is distinct from old.status
       or new.cancelled_at is distinct from old.cancelled_at
       or new.no_show is distinct from old.no_show
       or new.cancel_reason is distinct from old.cancel_reason
       or new.no_show_reason is distinct from old.no_show_reason
       or new.completed_at is distinct from old.completed_at then
      raise exception 'Bookings can only be cancelled by an admin. Please call the front desk.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_booking_update_policy on public.bookings;
create trigger trg_enforce_booking_update_policy
  before update on public.bookings
  for each row
  execute function public.enforce_booking_update_policy();

-- ---- 4) court_occupancy: stop leaking the schedule to anonymous callers ----
-- Only signed-in users need busy times (conflict check + timeline). Logged-out
-- app cold-starts read it via a Promise.allSettled refresh, so a revoked grant
-- fails harmlessly there.
revoke select on public.court_occupancy from anon;

select public.mark_schema_migration('harden-security.sql', 'Security hardening');
