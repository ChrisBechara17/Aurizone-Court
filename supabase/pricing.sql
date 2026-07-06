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

alter table public.app_settings enable row level security;

drop policy if exists "read app_settings" on public.app_settings;
create policy "read app_settings" on public.app_settings
  for select using (true);

drop policy if exists "admin write app_settings" on public.app_settings;
create policy "admin write app_settings" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- server-authoritative booking price ------------------------------------
-- Mirrors the app's pricing rule (src/app/(tabs)/book.tsx):
--   court free-reward → only the ball-machine add-on is charged;
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
    hours        := new.duration_minutes / 60.0;
    machine_cost := case when new.ball_machine then machine_rate * hours else 0 end;

    new.total_price := case
      when new.is_free_reward then machine_cost
      else sport_rate * hours + machine_cost
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_compute_booking_price on public.bookings;
create trigger trg_compute_booking_price
  before insert on public.bookings
  for each row
  execute function public.compute_booking_price();
