-- ============================================================================
-- RizeON — app_config (admin-editable text settings)
-- Run in the Supabase SQL editor after policies.sql. Idempotent.
--
-- app_settings holds NUMERIC values (prices); this table holds TEXT values.
-- First use: the customer-support / front-desk phone number that the app shows
-- to users who want to cancel a booking (users can't self-cancel).
-- ============================================================================

create table if not exists public.app_config (
  key text primary key,
  value text not null default ''
);

insert into public.app_config (key, value)
  values ('support_phone', '+961 00 000 000')
  on conflict (key) do nothing;

insert into public.app_config (key, value)
  values
    ('tier_perks_bronze', 'Earn points on every booking
Birthday surprise session'),
    ('tier_perks_silver', 'Everything in Bronze
5% off display prices
Early access to new slots'),
    ('tier_perks_gold', 'Everything in Silver
1 free coaching add-on / month
Priority Main Court booking'),
    ('tier_perks_platinum', 'Everything in Gold
Free monthly court hour
Dedicated concierge booking')
  on conflict (key) do nothing;

alter table public.app_config enable row level security;

-- Anyone signed in can read (users need the number to call); only admins write.
drop policy if exists "read app_config" on public.app_config;
create policy "read app_config" on public.app_config for select using (true);

drop policy if exists "admin write app_config" on public.app_config;
create policy "admin write app_config" on public.app_config
  for all using (public.is_admin()) with check (public.is_admin());
