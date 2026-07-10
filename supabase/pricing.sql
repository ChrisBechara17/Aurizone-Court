-- ============================================================================
-- CourtHub — admin-adjustable pricing + server-authoritative booking price
-- Run in the Supabase SQL editor AFTER schema.sql / policies.sql. Idempotent.
--
--  • sport_prices already holds the per-sport hourly rate (basketball/tennis)
--    and already has RLS "read all / admin write" from policies.sql.
--  • app_settings (below) holds the tennis ball-machine add-on rate — it isn't
--    a sport, so it can't live in sport_prices.
--  • compute_booking_price recomputes total_price on every booking INSERT from
--    those admin-set values, so the amount is authoritative on the server and a
--    tampered client can no longer book for $0.
-- ============================================================================

-- ---- app_settings: general numeric settings (currently the ball-machine rate)
create table if not exists public.app_settings (
  key text primary key,
  value numeric(10,2) not null
);

insert into public.app_settings (key, value)
  values ('ball_machine_rate', 15)
  on conflict (key) do nothing;

insert into public.app_settings (key, value)
  values
    ('loyalty_first_booking_bonus', 50),
    ('loyalty_points_per_booking', 10),
    ('loyalty_completion_bonus', 5),
    ('loyalty_no_show_penalty', 20)
  on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "read app_settings" on public.app_settings;
create policy "read app_settings" on public.app_settings
  for select using (true);

drop policy if exists "admin write app_settings" on public.app_settings;
create policy "admin write app_settings" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- reward ledger --------------------------------------------------------
-- Server-authoritative free-session balance for a user, derived from booking
-- history (mirrors src/utils/loyalty.ts): every GOOD_BOOKINGS_PER_FREE (10)
-- completed, non-no-show, non-cancelled bookings earns one free session; each
-- prior free booking is a redemption. balance = earned − redeemed (never < 0).
-- SECURITY DEFINER so the count is complete regardless of the caller's RLS.
create or replace function public.free_reward_balance(uid uuid)
returns integer
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select greatest(
    0,
    floor(
      (
        select count(*) from public.bookings
        where user_id = uid
          and status in ('confirmed', 'completed')
          and no_show = false
          and end_time < now()
      ) / 10.0
    )::int
    - (
        select count(*) from public.bookings
        where user_id = uid
          and is_free_reward = true
          and status <> 'cancelled'
      )::int
  );
$$;

-- ---- server-authoritative booking price ------------------------------------
-- Mirrors the app's pricing rule (src/app/(tabs)/book.tsx):
--   court free-reward → only the ball-machine add-on is charged (and only when
--                       the reward ledger confirms an unredeemed free session);
--   otherwise         → sport rate × hours + (ball machine ? rate × hours : 0).
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
    select price_per_hour into sport_rate
      from public.sport_prices where sport_type = new.sport_type;
    select value into machine_rate
      from public.app_settings where key = 'ball_machine_rate';

    sport_rate   := coalesce(sport_rate, 0);
    machine_rate := coalesce(machine_rate, 0);
    -- SECURITY (Q3): price from the real booked span, not client duration_minutes.
    hours        := extract(epoch from (new.end_time - new.start_time)) / 3600.0;
    machine_cost := case when new.ball_machine then machine_rate * hours else 0 end;

    -- SECURITY (Q2): validate the free-reward claim against the ledger; force it
    -- false and charge full price when the user has no free session available.
    if new.is_free_reward
       and not new.is_recurring
       and public.free_reward_balance(new.user_id) >= 1 then
      new.total_price := machine_cost;
    else
      new.is_free_reward := false;
      new.total_price := sport_rate * hours + machine_cost;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_compute_booking_price on public.bookings;
create trigger trg_compute_booking_price
  before insert or update of sport_type, duration_minutes, start_time, is_free_reward, ball_machine, court_half on public.bookings
  for each row
  execute function public.compute_booking_price();

select public.mark_schema_migration('pricing.sql', 'Pricing');
