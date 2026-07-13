-- occupancy view (times only, no user_id / price)
create or replace view public.court_occupancy
with (security_invoker = off) as
  select b.id, b.court_id, b.sport_type, b.booking_type, b.start_time, b.end_time, b.court_half
  from public.bookings b
  where b.uses_main_court = true
    and (
      b.status = 'confirmed'
      or (
        b.status = 'completed'
        and (b.end_time at time zone 'Asia/Beirut')::date = (now() at time zone 'Asia/Beirut')::date
      )
    );

grant select on public.court_occupancy to authenticated;
revoke select on public.court_occupancy from anon;

-- reset booking read policies (safe to re-run)
drop policy if exists "authenticated read all bookings" on public.bookings;
drop policy if exists "users read own bookings" on public.bookings;
drop policy if exists "admins read all bookings" on public.bookings;

create policy "users read own bookings" on public.bookings
  for select using (user_id = auth.uid());

create policy "admins read all bookings" on public.bookings
  for select using (public.is_admin());
