-- ============================================================================
-- RizeON — half-court booking (basketball only)
-- Run in the Supabase SQL editor AFTER schema.sql / policies.sql /
-- conflict-guard.sql / privacy-view.sql / pricing.sql. Idempotent.
--
-- A basketball booking can take HALF the court, leaving the other half free for
-- someone else at the same time (e.g. 3v3 on one side, 1v1 on the other).
-- Tennis always uses the FULL court. This is enforced atomically by extending
-- the double-booking exclusion constraint with a "side" dimension:
--   court_half = 'full' occupies both halves, 'a' the left, 'b' the right.
--   side_range: a -> [0,1), b -> [1,2), full -> [0,2).
-- Two confirmed bookings on the same court now collide only when their times
-- AND their side_ranges overlap — so 'a' + 'b' can coexist, but 'full' (or
-- tennis) collides with everything, and a half booking blocks tennis.
-- ============================================================================

-- ---- 1) court_half column + generated side range --------------------------
alter table public.bookings
  add column if not exists court_half text not null default 'full'
  check (court_half in ('full', 'a', 'b'));

alter table public.bookings
  add column if not exists side_range int4range
  generated always as (
    case court_half
      when 'a' then int4range(0, 1)
      when 'b' then int4range(1, 2)
      else int4range(0, 2)
    end
  ) stored;

-- ---- 2) side-aware exclusion constraint -----------------------------------
-- Replaces conflict-guard.sql's no_main_court_overlap. btree_gist is already
-- installed there (needed for the court_id equality element).
alter table public.bookings drop constraint if exists no_main_court_overlap;
alter table public.bookings
  add constraint no_main_court_overlap
  exclude using gist (
    court_id with =,
    tstzrange(start_time, end_time) with &&,
    side_range with &&
  )
  where (uses_main_court = true and status = 'confirmed');

-- ---- 3) expose court_half in the occupancy view ---------------------------
-- (Recreates privacy-view.sql's court_occupancy with the extra column so the
--  app can compute which half of a slot is still free. Still no user_id/price.)
create or replace view public.court_occupancy
with (security_invoker = off) as
  select b.id, b.court_id, b.sport_type, b.booking_type, b.start_time, b.end_time, b.court_half
  from public.bookings b
  where b.status = 'confirmed' and b.uses_main_court = true;

grant select on public.court_occupancy to authenticated;

-- ---- 4) admin-set half-court rate -----------------------------------------
insert into public.app_settings (key, value)
  values ('basketball_half_rate', 18)
  on conflict (key) do nothing;

-- ---- 5) server-authoritative price handles the half rate ------------------
-- Half bookings (court_half a/b) are basketball-only and priced at the
-- admin-set basketball_half_rate; everything else keeps the full sport rate.
-- The server also validates free-reward redemptions against the derived reward
-- ledger (see public.free_reward_balance) so a client can't book for $0.
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
begin
  if new.booking_type = 'court' then
    if new.court_half in ('a', 'b') then
      select value into sport_rate from public.app_settings where key = 'basketball_half_rate';
    else
      select price_per_hour into sport_rate
        from public.sport_prices where sport_type = new.sport_type;
    end if;
    select value into machine_rate
      from public.app_settings where key = 'ball_machine_rate';

    sport_rate   := coalesce(sport_rate, 0);
    machine_rate := coalesce(machine_rate, 0);
    -- SECURITY (Q3): price from the actual booked span, not the client-supplied
    -- duration_minutes (which a tampered client can shrink to underpay).
    hours        := extract(epoch from (new.end_time - new.start_time)) / 3600.0;
    machine_cost := case when new.ball_machine then machine_rate * hours else 0 end;

    -- SECURITY (TOCTOU): serialize concurrent free-reward redemptions for this
    -- user by locking their row, so two parallel free bookings can't both pass
    -- the balance check below and double-spend one earned free session.
    if new.is_free_reward and not new.is_recurring then
      perform 1 from public.users where id = new.user_id for update;
    end if;

    -- SECURITY (Q2): only honor is_free_reward when the reward ledger confirms an
    -- unredeemed free session for this user; otherwise force it false and charge
    -- the full price. Recurring bookings can never be free.
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
      new.total_price := machine_cost;                    -- court free, add-ons still billed
    else
      new.is_free_reward := false;
      new.total_price := sport_rate * hours + machine_cost;
    end if;
  end if;
  return new;
end;
$$;

-- trigger from pricing.sql already points at this function; nothing else to do.
