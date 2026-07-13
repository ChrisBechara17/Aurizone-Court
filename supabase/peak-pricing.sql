-- ============================================================================
-- RizeON — peak / off-peak pricing
-- Run in the Supabase SQL editor LAST (after pricing.sql / half-court.sql /
-- harden-booking-integrity.sql). Idempotent.
--
-- Court rates now have an OFF-PEAK and a PEAK value. Peak applies to any booking
-- that STARTS at or after 4:00 PM venue-local time (Asia/Beirut); a booking that
-- starts before 4 PM stays off-peak even if it runs past 4 PM. The ball-machine
-- add-on stays a single flat rate.
--
-- This file redefines compute_booking_price() as the single authoritative
-- version (it supersedes the copies in pricing.sql and half-court.sql), folding
-- in: peak selection, the half-court rate, the Q3 span-based hours, and the Q2
-- reward-ledger validation.
-- ============================================================================

-- ---- 1) peak columns / settings -------------------------------------------
alter table public.sport_prices
  add column if not exists peak_price_per_hour numeric(10,2);

-- Seed peak rates for existing rows where not yet set (admin can edit later).
update public.sport_prices set peak_price_per_hour = 40 where sport_type = 'basketball' and peak_price_per_hour is null;
update public.sport_prices set peak_price_per_hour = 28 where sport_type = 'tennis'     and peak_price_per_hour is null;
-- Backstop for any other sport: default peak to the off-peak rate.
update public.sport_prices set peak_price_per_hour = price_per_hour where peak_price_per_hour is null;

alter table public.sport_prices
  alter column peak_price_per_hour set not null;

insert into public.app_settings (key, value)
  values ('basketball_half_rate_peak', 24)
  on conflict (key) do nothing;

-- ---- 2) peak helper --------------------------------------------------------
-- True when a booking starting at ts falls in the 4 PM–midnight peak window,
-- evaluated in the venue's timezone.
create or replace function public.is_peak_start(ts timestamptz)
returns boolean
language sql
-- STABLE, not IMMUTABLE: the result depends on the Asia/Beirut tz/DST rules in
-- the timezone database, which can change — so it isn't immutable. (Harmless in
-- a trigger today, but IMMUTABLE would cache wrong values if it ever backed a
-- generated column or index.)
stable
set search_path = pg_catalog, public
as $$
  select extract(hour from (ts at time zone 'Asia/Beirut')) >= 16;
$$;

-- ---- 3) authoritative price ------------------------------------------------
create or replace function public.compute_booking_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sport_rate   numeric(10,2);
  machine_rate numeric(10,2);
  hours        numeric;
  machine_cost numeric(10,2);
  peak         boolean;
begin
  if new.booking_type = 'court' then
    peak := public.is_peak_start(new.start_time);

    if new.court_half in ('a', 'b') then
      -- Half-court is basketball-only (enforced in harden-booking-integrity.sql).
      select value into sport_rate from public.app_settings
        where key = case when peak then 'basketball_half_rate_peak' else 'basketball_half_rate' end;
    else
      select case when peak then peak_price_per_hour else price_per_hour end
        into sport_rate
        from public.sport_prices where sport_type = new.sport_type;
    end if;
    select value into machine_rate
      from public.app_settings where key = 'ball_machine_rate';

    sport_rate   := coalesce(sport_rate, 0);
    machine_rate := coalesce(machine_rate, 0);
    -- SECURITY (Q3): price from the real booked span, not client duration_minutes.
    hours        := extract(epoch from (new.end_time - new.start_time)) / 3600.0;
    machine_cost := case when new.ball_machine then machine_rate * hours else 0 end;

    -- SECURITY (TOCTOU): serialize concurrent free-reward redemptions for this
    -- user by locking their row, so two parallel free bookings can't both pass
    -- the balance check below and double-spend one earned free session.
    if new.is_free_reward and not new.is_recurring then
      perform 1 from public.users where id = new.user_id for update;
    end if;

    -- SECURITY (Q2): only honor is_free_reward when the reward ledger confirms an
    -- unredeemed free session; otherwise force it false and charge full price.
    if new.is_free_reward
       and not new.is_recurring
       and (
         -- An already-redeemed reward being edited/rescheduled counts ITSELF in
         -- its own redemption tally, so free_reward_balance() reads one short and
         -- would wrongly revoke it (flip is_free_reward off and charge full
         -- price). Keep an existing free booking free; only validate the balance
         -- when the reward is being newly claimed.
         (tg_op = 'UPDATE' and old.is_free_reward)
         or public.free_reward_balance(new.user_id) >= 1
       ) then
      new.total_price := machine_cost;
    else
      new.is_free_reward := false;
      new.total_price := sport_rate * hours + machine_cost;
    end if;
  end if;
  return new;
end;
$$;

-- trigger (trg_compute_booking_price) from pricing.sql already points here.
