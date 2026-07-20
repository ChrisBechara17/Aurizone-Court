-- ============================================================================
-- CourtHub — Row Level Security policies
-- Run after schema.sql. Assumes Supabase Auth (auth.uid()).
-- Idempotent: every policy is dropped-if-exists before being (re)created, so
-- this whole file is safe to re-run.
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
-- SECURITY (Q5): pin search_path so a SECURITY DEFINER function can't be tricked
-- into resolving `users` / `auth.uid` against an attacker-controlled schema.
set search_path = pg_catalog, public
as $$
  select coalesce((select is_admin from public.users where id = auth.uid()), false);
$$;

-- ---- users ------------------------------------------------------------
drop policy if exists "users read own profile" on public.users;
create policy "users read own profile" on public.users
  for select using (id = auth.uid());

drop policy if exists "admins read all users" on public.users;
create policy "admins read all users" on public.users
  for select using (public.is_admin());

drop policy if exists "users insert own profile" on public.users;
create policy "users insert own profile" on public.users
  for insert with check (id = auth.uid());

drop policy if exists "users update own profile" on public.users;
create policy "users update own profile" on public.users
  for update using (id = auth.uid());

-- Self-service account deletion. The client cannot use the Supabase admin API
-- directly, so expose a SECURITY DEFINER RPC that deletes only the caller's
-- auth.users row. Cascades remove public.users, and public.users cascades remove
-- that user's bookings.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED: Not signed in.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- ---- courts / sport_prices / court_rules / membership_packages --------
-- Public reference data: anyone signed in can read; only admins write.
drop policy if exists "read courts" on public.courts;
create policy "read courts" on public.courts for select using (true);
drop policy if exists "admin write courts" on public.courts;
create policy "admin write courts" on public.courts for all using (public.is_admin());

drop policy if exists "read sport_prices" on public.sport_prices;
create policy "read sport_prices" on public.sport_prices for select using (true);
drop policy if exists "admin write sport_prices" on public.sport_prices;
create policy "admin write sport_prices" on public.sport_prices for all using (public.is_admin());

drop policy if exists "read court_rules" on public.court_rules;
create policy "read court_rules" on public.court_rules for select using (true);
drop policy if exists "admin write court_rules" on public.court_rules;
create policy "admin write court_rules" on public.court_rules for all using (public.is_admin());

drop policy if exists "read membership_packages" on public.membership_packages;
create policy "read membership_packages" on public.membership_packages for select using (true);
drop policy if exists "admin write membership_packages" on public.membership_packages;
create policy "admin write membership_packages" on public.membership_packages for all using (public.is_admin());

-- ---- coaches ------------------------------------------------------------
-- Directory is public to read; only admins add/edit/remove.
drop policy if exists "read coaches" on public.coaches;
create policy "read coaches" on public.coaches for select using (true);
drop policy if exists "admin write coaches" on public.coaches;
create policy "admin write coaches" on public.coaches for insert with check (public.is_admin());
drop policy if exists "admin update coaches" on public.coaches;
create policy "admin update coaches" on public.coaches for update using (public.is_admin());
drop policy if exists "admin delete coaches" on public.coaches;
create policy "admin delete coaches" on public.coaches for delete using (public.is_admin());

-- ---- bookings -------------------------------------------------------------
-- Users see/manage their own bookings; admins see/manage everyone's.
-- NOTE: the shared-court conflict check itself should run server-side
-- (a Postgres function or your NestJS API), not rely on RLS alone.
-- Any signed-in user can READ all bookings — required so the shared-court
-- conflict check and the availability timeline can see every booked slot.
-- (For stricter privacy, expose a times-only view instead.)
drop policy if exists "authenticated read all bookings" on public.bookings;
create policy "authenticated read all bookings" on public.bookings
  for select to authenticated using (true);

drop policy if exists "users create own bookings" on public.bookings;
create policy "users create own bookings" on public.bookings
  for insert with check (user_id = auth.uid());

-- Users may update their own booking rows (e.g. notification_id wiring). They
-- can NOT cancel: the enforce_booking_update_policy trigger (harden-security.sql)
-- rejects any status / cancelled_at / no_show change by a non-admin.
drop policy if exists "users cancel own bookings" on public.bookings;
drop policy if exists "users update own bookings" on public.bookings;
create policy "users update own bookings" on public.bookings
  for update using (user_id = auth.uid());

drop policy if exists "admins manage all bookings" on public.bookings;
create policy "admins manage all bookings" on public.bookings
  for all using (public.is_admin());

-- ---- court_blocks -----------------------------------------------------
drop policy if exists "read court_blocks" on public.court_blocks;
create policy "read court_blocks" on public.court_blocks for select using (true);
drop policy if exists "admin write court_blocks" on public.court_blocks;
create policy "admin write court_blocks" on public.court_blocks for all using (public.is_admin());
