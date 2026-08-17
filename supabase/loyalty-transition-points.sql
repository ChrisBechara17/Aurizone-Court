-- Loyalty ledger rows for booking lifecycle transitions.
--
-- public.create_booking_loyalty_transactions() is an AFTER INSERT trigger, so it
-- only ever awards the base/first-booking points: a booking is inserted as
-- 'confirmed' with no_show = false, so its completion and no-show branches can
-- never fire. Every later transition (complete, no-show, cancel) is an UPDATE,
-- and no trigger listened for those.
--
-- With EXPO_PUBLIC_SECURE_WRITES=true the client routes those mutations through
-- secure_admin_booking_action (post-lockdown-integrity.sql), which writes the
-- ledger rows itself with admin attribution, so the ledger is correct there.
-- With direct writes the same mutations are plain UPDATEs and the ledger silently
-- lost the completion bonus, the no-show penalty, and the cancellation reversal.
--
-- This adds the matching AFTER UPDATE trigger. It mirrors the RPC's semantics
-- exactly and defers to it when the mutation arrives as service_role, so the
-- secure path keeps writing its own attributed rows and is never double-written.
-- The unique index idx_loyalty_transactions_once_per_type (booking_id, type)
-- plus ON CONFLICT DO NOTHING keeps every branch idempotent regardless.
--
-- Must run AFTER operations-upgrades.sql (ledger table, unique index,
-- app_setting_number) and post-lockdown-integrity.sql (the secure RPC).
create or replace function public.sync_booking_loyalty_transactions()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_total      integer;
  v_adjustment integer;
  v_penalty    integer;
begin
  -- Trusted Edge Function mutations write their own attributed ledger rows.
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Cancellation reverses everything the booking earned.
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select coalesce(sum(points), 0)::integer into v_total
      from public.loyalty_transactions where booking_id = new.id;
    if v_total <> 0 then
      insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
      values (new.user_id, new.id, 'booking_cancelled', -v_total, 'Booking cancelled')
      on conflict do nothing;
    end if;
    return new;
  end if;

  -- No-show: reverse the booking's points, then apply the penalty.
  if coalesce(new.no_show, false)
     and not coalesce(old.no_show, false)
     and new.status <> 'cancelled' then
    select coalesce(sum(points), 0)::integer into v_total
      from public.loyalty_transactions where booking_id = new.id;
    if v_total <> 0 then
      insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
      values (new.user_id, new.id, 'no_show_adjustment', -v_total, 'Booking no-show adjustment')
      on conflict do nothing;
    end if;
    insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
    values (
      new.user_id, new.id, 'no_show_penalty',
      -public.app_setting_number('loyalty_no_show_penalty', 20), 'No-show penalty'
    )
    on conflict do nothing;
  end if;

  -- Completion bonus. Completing a booking that was flagged no-show also
  -- reverses the earlier no-show rows, matching secure_admin_booking_action.
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and not coalesce(new.no_show, false) then
    if coalesce(old.no_show, false) then
      select coalesce(sum(points), 0)::integer into v_adjustment
        from public.loyalty_transactions
        where booking_id = new.id and type = 'no_show_adjustment';
      select coalesce(sum(points), 0)::integer into v_penalty
        from public.loyalty_transactions
        where booking_id = new.id and type = 'no_show_penalty';
      if v_adjustment <> 0 then
        insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
        values (new.user_id, new.id, 'no_show_adjustment_reversal', -v_adjustment, 'No-show adjustment corrected')
        on conflict do nothing;
      end if;
      if v_penalty <> 0 then
        insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
        values (new.user_id, new.id, 'no_show_penalty_reversal', -v_penalty, 'No-show penalty corrected')
        on conflict do nothing;
      end if;
    end if;

    insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
    values (
      new.user_id, new.id, 'completion_bonus',
      public.app_setting_number('loyalty_completion_bonus', 5), 'Completed booking bonus'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_booking_loyalty_transactions on public.bookings;
create trigger trg_sync_booking_loyalty_transactions
  after update of status, no_show on public.bookings
  for each row
  when (old.status is distinct from new.status or old.no_show is distinct from new.no_show)
  execute function public.sync_booking_loyalty_transactions();

-- Backfill the rows the missing trigger never wrote. Mirrors the original
-- backfill in operations-upgrades.sql and is safe to re-run: the unique index
-- on (booking_id, type) makes every insert a no-op once it exists. Cancellation
-- and no-show reversals are relative to a booking's ledger at the moment of the
-- transition, so they are applied going forward only and are not backfilled.
with completion_points as (
  insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
  select user_id, id, 'completion_bonus',
         public.app_setting_number('loyalty_completion_bonus', 5), 'Completed booking bonus'
  from public.bookings
  where status = 'completed'
    and coalesce(no_show, false) = false
  on conflict do nothing
  returning id
)
insert into public.loyalty_transactions (user_id, booking_id, type, points, description)
select user_id, id, 'no_show_penalty',
       -public.app_setting_number('loyalty_no_show_penalty', 20), 'No-show penalty'
from public.bookings
where status <> 'cancelled'
  and coalesce(no_show, false) = true
on conflict do nothing;

select public.mark_schema_migration('loyalty-transition-points.sql', 'Loyalty points on booking transitions');
