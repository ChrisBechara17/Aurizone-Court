-- Free-session rewards accrue without admin review.
--
-- Previously a booking only counted toward a reward once an admin explicitly
-- marked it 'completed', so rewards stalled whenever the front desk did not
-- review finished sessions. A session now counts as soon as it is past its end
-- time; only an explicit admin action removes it (a cancellation, or a no-show
-- flag).
--
-- Ten finished PAID sessions still earn one reward. Free bookings remain
-- redemptions and never generate progress toward another reward.
--
-- Booking.status stays authoritative and is never rewritten by this change, so
-- admins keep the ability to cancel, reschedule, or flag a no-show afterwards.
--
-- Must run AFTER post-lockdown-integrity.sql, which installs the previous
-- authoritative version of this function. Mirrors countsTowardFreeSession()
-- in src/utils/loyalty.ts — keep the two in sync.
create or replace function public.free_reward_balance(uid uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when uid = auth.uid() or auth.role() = 'service_role' or public.is_admin() then
      greatest(
        0,
        floor((
          select count(*)
          from public.bookings
          where user_id = uid
            and status in ('confirmed', 'completed')
            and coalesce(no_show, false) = false
            and coalesce(is_free_reward, false) = false
            and end_time < now()
        ) / 10.0)::integer
        - (
          select count(*)::integer
          from public.bookings
          where user_id = uid
            and coalesce(is_free_reward, false) = true
            and status <> 'cancelled'
        )
      )
    else 0
  end;
$$;

revoke all on function public.free_reward_balance(uuid) from public, anon;
grant execute on function public.free_reward_balance(uuid) to authenticated;

select public.mark_schema_migration('auto-complete-rewards.sql', 'Reward accrual without admin review');
