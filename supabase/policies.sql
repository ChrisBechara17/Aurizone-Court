-- ============================================================================
-- CourtHub — Row Level Security policies
-- Run after schema.sql. Assumes Supabase Auth (auth.uid()).
-- ============================================================================

alter table public.users enable row level security;
alter table public.courts enable row level security;
alter table public.sport_prices enable row level security;
alter table public.coaches enable row level security;
alter table public.bookings enable row level security;
alter table public.court_blocks enable row level security;
alter table public.court_rules enable row level security;
alter table public.membership_packages enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce((select is_admin from public.users where id = auth.uid()), false);
$$;

-- ---- users ------------------------------------------------------------
create policy "users read own profile" on public.users
  for select using (id = auth.uid());

create policy "admins read all users" on public.users
  for select using (public.is_admin());

create policy "users insert own profile" on public.users
  for insert with check (id = auth.uid());

create policy "users update own profile" on public.users
  for update using (id = auth.uid());

-- ---- courts / sport_prices / court_rules / membership_packages --------
-- Public reference data: anyone signed in can read; only admins write.
create policy "read courts" on public.courts for select using (true);
create policy "admin write courts" on public.courts for all using (public.is_admin());

create policy "read sport_prices" on public.sport_prices for select using (true);
create policy "admin write sport_prices" on public.sport_prices for all using (public.is_admin());

create policy "read court_rules" on public.court_rules for select using (true);
create policy "admin write court_rules" on public.court_rules for all using (public.is_admin());

create policy "read membership_packages" on public.membership_packages for select using (true);
create policy "admin write membership_packages" on public.membership_packages for all using (public.is_admin());

-- ---- coaches ------------------------------------------------------------
-- Directory is public to read; only admins add/edit/remove.
create policy "read coaches" on public.coaches for select using (true);
create policy "admin write coaches" on public.coaches for insert with check (public.is_admin());
create policy "admin update coaches" on public.coaches for update using (public.is_admin());
create policy "admin delete coaches" on public.coaches for delete using (public.is_admin());

-- ---- bookings -------------------------------------------------------------
-- Users see/manage their own bookings; admins see/manage everyone's.
-- NOTE: the shared-court conflict check itself should run server-side
-- (a Postgres function or your NestJS API), not rely on RLS alone.
-- Any signed-in user can READ all bookings — required so the shared-court
-- conflict check and the availability timeline can see every booked slot.
-- (For stricter privacy, expose a times-only view instead.)
create policy "authenticated read all bookings" on public.bookings
  for select to authenticated using (true);

create policy "users create own bookings" on public.bookings
  for insert with check (user_id = auth.uid());

create policy "users cancel own bookings" on public.bookings
  for update using (user_id = auth.uid());

create policy "admins manage all bookings" on public.bookings
  for all using (public.is_admin());

-- ---- court_blocks -----------------------------------------------------
create policy "read court_blocks" on public.court_blocks for select using (true);
create policy "admin write court_blocks" on public.court_blocks for all using (public.is_admin());
