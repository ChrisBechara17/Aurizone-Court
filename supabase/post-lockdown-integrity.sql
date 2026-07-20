-- ============================================================================
-- RizeON - post-lockdown integrity and transactional mutations
-- Run after security-lockdown.sql. Idempotent and safe to rerun.
-- ============================================================================

create table if not exists public.security_mutation_receipts (
  actor_user_id uuid not null references public.users(id) on delete cascade,
  operation text not null,
  request_id uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, operation, request_id)
);

alter table public.security_mutation_receipts enable row level security;
revoke all on public.security_mutation_receipts from public, anon, authenticated;

-- Re-declare the canonical time assertion here so this final integrity release
-- upgrades databases that previously ran the minute-based business guard.
create or replace function public.assert_booking_time_contract(
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_duration_minutes integer,
  p_enforce_operating_hours boolean default true
)
returns void language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_local_date date;
  v_hours public.operating_hours%rowtype;
  v_open_at timestamptz;
  v_close_at timestamptz;
begin
  if p_start_time is null or p_end_time is null or p_duration_minutes is null
     or p_duration_minutes < 30 or p_duration_minutes > 180
     or date_trunc('minute', p_start_time) <> p_start_time
     or date_trunc('minute', p_end_time) <> p_end_time
     or p_end_time <= p_start_time
     or extract(epoch from (p_end_time - p_start_time)) <> p_duration_minutes * 60 then
    raise exception 'INVALID_DURATION: Booking times must be whole minutes and match a 30 to 180 minute duration.' using errcode='check_violation';
  end if;
  if not p_enforce_operating_hours then return; end if;

  v_local_date := (p_start_time at time zone 'Asia/Beirut')::date;
  select * into v_hours from public.operating_hours
    where day_of_week=extract(dow from v_local_date)::integer;
  if not found or v_hours.is_closed then
    raise exception 'COURT_CLOSED: The court is closed on this day.' using errcode='check_violation';
  end if;
  v_open_at := (v_local_date + v_hours.open_time) at time zone 'Asia/Beirut';
  v_close_at := case
    when v_hours.close_time=time '24:00' then ((v_local_date + 1)::timestamp) at time zone 'Asia/Beirut'
    else (v_local_date + v_hours.close_time) at time zone 'Asia/Beirut'
  end;
  if p_start_time < v_open_at or p_end_time > v_close_at then
    raise exception 'OUTSIDE_OPERATING_HOURS: This booking is outside operating hours.' using errcode='check_violation';
  end if;
end; $$;

revoke all on function public.assert_booking_time_contract(timestamptz,timestamptz,integer,boolean)
  from public, anon, authenticated;

create or replace function public.assert_court_block_contract(p_start_time timestamptz,p_end_time timestamptz)
returns void language plpgsql immutable set search_path=pg_catalog,public as $$
begin
  if p_start_time is null or p_end_time is null
     or date_trunc('minute',p_start_time)<>p_start_time
     or date_trunc('minute',p_end_time)<>p_end_time
     or p_end_time<=p_start_time
     or p_end_time-p_start_time<interval '30 minutes'
     or p_end_time-p_start_time>interval '24 hours' then
    raise exception 'INVALID_DURATION: Court blocks must be between 30 minutes and 24 hours.' using errcode='check_violation';
  end if;
end; $$;
revoke all on function public.assert_court_block_contract(timestamptz,timestamptz) from public,anon,authenticated;

-- Availability remains PII-free while retaining completed occupancy for the
-- current Beirut day so today's schedule does not shrink after completion.
create or replace view public.court_occupancy with (security_invoker = off) as
  select b.id,b.court_id,b.sport_type,b.booking_type,b.start_time,b.end_time,b.court_half
  from public.bookings b
  where b.uses_main_court=true
    and (
      b.status='confirmed'
      or (b.status='completed' and (b.end_time at time zone 'Asia/Beirut')::date=(now() at time zone 'Asia/Beirut')::date)
    );
grant select on public.court_occupancy to authenticated;
revoke select on public.court_occupancy from anon;

-- Ten completed PAID sessions earn one reward. Existing free bookings remain
-- redemptions, but never generate progress toward another reward.
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
            and status = 'completed'
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

create or replace function public.secure_create_court_bookings(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_bookings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cached jsonb;
  v_item jsonb;
  v_created jsonb := '[]'::jsonb;
  v_row public.bookings%rowtype;
  v_count integer;
  v_free_count integer := 0;
  v_strikes integer;
  v_duration integer;
  v_start timestamptz;
  v_end timestamptz;
  v_main_court_id uuid;
begin
  if p_actor_user_id is null or p_request_id is null then
    raise exception 'INVALID_PAYLOAD: Missing actor or request.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text || ':booking:' || p_request_id::text, 0));
  select response into v_cached from public.security_mutation_receipts
    where actor_user_id = p_actor_user_id and operation = 'booking.create' and request_id = p_request_id;
  if found then return v_cached; end if;

  if jsonb_typeof(p_bookings) <> 'array' then
    raise exception 'INVALID_PAYLOAD: Bookings must be an array.' using errcode = '22023';
  end if;

  -- Resolve the main court server-side rather than trusting the client court_id.
  -- The no_main_court_overlap exclusion constraint partitions by court_id, so if a
  -- second court is ever added a client could pass a different court_id and slip
  -- past the overlap guard for the same physical slot. Pinning every main-court
  -- booking to one id keeps them all in the same overlap partition.
  select value::uuid into v_main_court_id from public.app_config where key='main_court_id';
  if v_main_court_id is null then
    select id into v_main_court_id from public.courts where is_active=true limit 1;
  end if;
  if v_main_court_id is null then
    raise exception 'INVALID_PAYLOAD: No active court is configured.' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_bookings);
  if v_count < 1 or v_count > 6 then
    raise exception 'INVALID_PAYLOAD: Booking batch must contain 1 to 6 rows.' using errcode = '22023';
  end if;

  perform 1 from public.users where id = p_actor_user_id for update;
  if not found then raise exception 'PROFILE_REQUIRED: User profile not found.' using errcode = 'foreign_key_violation'; end if;

  select count(*) into v_strikes from public.bookings
    where user_id = p_actor_user_id and no_show = true and status <> 'cancelled';
  if v_strikes >= 3 then
    raise exception 'ACCOUNT_DISABLED: Your account is disabled after 3 no-shows.' using errcode = 'insufficient_privilege';
  end if;

  for v_item in select value from jsonb_array_elements(p_bookings) loop
    if jsonb_typeof(v_item) <> 'object'
       or not (v_item ? 'id' and v_item ? 'user_id' and v_item ? 'booking_type'
         and v_item ? 'sport_type' and v_item ? 'status' and v_item ? 'start_time'
         and v_item ? 'end_time' and v_item ? 'duration_minutes')
       or jsonb_typeof(v_item -> 'id') <> 'string'
       or jsonb_typeof(v_item -> 'user_id') <> 'string'
       or jsonb_typeof(v_item -> 'booking_type') <> 'string'
       or jsonb_typeof(v_item -> 'sport_type') <> 'string'
       or jsonb_typeof(v_item -> 'status') <> 'string'
       or jsonb_typeof(v_item -> 'start_time') <> 'string'
       or jsonb_typeof(v_item -> 'end_time') <> 'string'
       or jsonb_typeof(v_item -> 'duration_minutes') <> 'number'
       or (v_item ->> 'duration_minutes') !~ '^[0-9]+$'
       or (v_item ? 'court_half' and jsonb_typeof(v_item -> 'court_half') <> 'string')
       or (v_item ? 'is_recurring' and jsonb_typeof(v_item -> 'is_recurring') <> 'boolean')
       or (v_item ? 'is_free_reward' and jsonb_typeof(v_item -> 'is_free_reward') <> 'boolean')
       or (v_item ? 'ball_machine' and jsonb_typeof(v_item -> 'ball_machine') <> 'boolean')
       or (v_item ? 'recurrence_group_id'
         and jsonb_typeof(v_item -> 'recurrence_group_id') not in ('string', 'null')) then
      raise exception 'INVALID_PAYLOAD: Booking fields are missing or malformed.' using errcode = '22023';
    end if;

    begin
      perform (v_item ->> 'id')::uuid;
      perform (v_item ->> 'sport_type')::public.sport_type;
      perform nullif(v_item ->> 'recurrence_group_id', '')::uuid;
      if (v_item ->> 'user_id')::uuid is distinct from p_actor_user_id
       or v_item ->> 'booking_type' <> 'court'
       or v_item ->> 'status' <> 'confirmed' then
        raise exception 'OWNERSHIP_MISMATCH: Invalid booking owner or lifecycle.' using errcode = 'insufficient_privilege';
      end if;

      v_start := (v_item ->> 'start_time')::timestamptz;
      v_end := (v_item ->> 'end_time')::timestamptz;
      v_duration := (v_item ->> 'duration_minutes')::integer;
      if coalesce((v_item ->> 'is_free_reward')::boolean, false) then
        v_free_count := v_free_count + 1;
      end if;
    exception when data_exception then
      raise exception 'INVALID_PAYLOAD: Booking fields are malformed.' using errcode = '22023';
    end;

    if v_free_count > 1 or (v_free_count = 1 and v_count > 1) then
      raise exception 'REWARD_BATCH_INVALID: A free reward can only be used on one non-recurring booking.' using errcode = 'check_violation';
    end if;

    if v_start <= now() then raise exception 'PAST_START: Bookings must start in the future.' using errcode = 'check_violation'; end if;
    perform public.assert_booking_time_contract(v_start, v_end, v_duration, true);
    if v_item ->> 'sport_type' = 'tennis' and coalesce(v_item ->> 'court_half', 'full') <> 'full' then
      raise exception 'INVALID_COURT_HALF: Tennis requires the full court.' using errcode = 'check_violation';
    end if;
    if coalesce((v_item ->> 'is_free_reward')::boolean, false)
       and (coalesce((v_item ->> 'is_recurring')::boolean, false) or public.free_reward_balance(p_actor_user_id) < 1) then
      raise exception 'REWARD_UNAVAILABLE: No free reward is available.' using errcode = 'check_violation';
    end if;

    insert into public.bookings (
      id, user_id, booking_type, sport_type, court_id, coach_id, uses_main_court,
      court_half, start_time, end_time, duration_minutes, total_price, status,
      is_recurring, recurrence_group_id, is_free_reward, ball_machine, no_show
    ) values (
      (v_item ->> 'id')::uuid, p_actor_user_id, 'court', (v_item ->> 'sport_type')::public.sport_type,
      v_main_court_id, null, true, coalesce(v_item ->> 'court_half', 'full'),
      v_start, v_end, v_duration, 0, 'confirmed',
      coalesce((v_item ->> 'is_recurring')::boolean, false), nullif(v_item ->> 'recurrence_group_id', '')::uuid,
      coalesce((v_item ->> 'is_free_reward')::boolean, false), coalesce((v_item ->> 'ball_machine')::boolean, false), false
    ) returning * into v_row;
    v_created := v_created || jsonb_build_array(to_jsonb(v_row));
  end loop;

  v_cached := jsonb_build_object('bookings', v_created);
  insert into public.security_mutation_receipts(actor_user_id, operation, request_id, response)
    values (p_actor_user_id, 'booking.create', p_request_id, v_cached);
  return v_cached;
end;
$$;

create or replace function public.secure_admin_booking_action(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_action text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cached jsonb;
  v_booking public.bookings%rowtype;
  v_notification_id uuid;
  v_reason text;
  v_total integer;
  v_adjustment integer;
  v_penalty integer;
  v_response jsonb;
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_new_duration integer;
  v_coach_rate numeric(10,2);
  v_new_total numeric(10,2);
begin
  if not exists(select 1 from public.users where id = p_actor_user_id and is_admin) then
    raise exception 'ADMIN_REQUIRED: Admin access required.' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text || ':admin-booking:' || p_request_id::text, 0));
  select response into v_cached from public.security_mutation_receipts
    where actor_user_id = p_actor_user_id and operation = 'admin.booking.' || p_action and request_id = p_request_id;
  -- Flag replays so the edge function skips re-sending the push notification.
  if found then return v_cached || jsonb_build_object('replayed', true); end if;

  if jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_payload -> 'booking_id') <> 'string' then
    raise exception 'INVALID_PAYLOAD: Missing or malformed booking id.' using errcode = '22023';
  end if;
  begin
    select * into v_booking from public.bookings
    where id = (p_payload ->> 'booking_id')::uuid
    for update;
  exception when data_exception then
    raise exception 'INVALID_PAYLOAD: Malformed booking id.' using errcode = '22023';
  end;
  if not found then raise exception 'NOT_FOUND: Booking not found.' using errcode = 'no_data_found'; end if;

  if p_action = 'cancel' then
    v_reason := btrim(p_payload ->> 'reason');
    if v_booking.status = 'cancelled' or v_reason = '' then raise exception 'INVALID_STATE: Booking cannot be cancelled.' using errcode = 'check_violation'; end if;
    update public.bookings set status='cancelled', cancelled_at=now(), cancel_reason=v_reason where id=v_booking.id returning * into v_booking;
    select coalesce(sum(points),0)::integer into v_total from public.loyalty_transactions where booking_id=v_booking.id;
    if v_total <> 0 then
      insert into public.loyalty_transactions(user_id,booking_id,type,points,description,created_by_admin_id)
        values(v_booking.user_id,v_booking.id,'booking_cancelled',-v_total,'Booking cancelled',p_actor_user_id) on conflict do nothing;
    end if;
    insert into public.user_notifications(user_id,title,message,type,related_entity_type,related_entity_id)
      values(v_booking.user_id,'Booking cancelled','Your booking was cancelled: '||v_reason,'booking_cancelled','booking',v_booking.id)
      returning id into v_notification_id;
  elsif p_action = 'complete' then
    if v_booking.status in ('cancelled','completed') then raise exception 'INVALID_STATE: Booking cannot be completed.' using errcode = 'check_violation'; end if;
    if v_booking.no_show then
      select coalesce(sum(points),0)::integer into v_adjustment from public.loyalty_transactions where booking_id=v_booking.id and type='no_show_adjustment';
      select coalesce(sum(points),0)::integer into v_penalty from public.loyalty_transactions where booking_id=v_booking.id and type='no_show_penalty';
      if v_adjustment <> 0 then insert into public.loyalty_transactions(user_id,booking_id,type,points,description,created_by_admin_id)
        values(v_booking.user_id,v_booking.id,'no_show_adjustment_reversal',-v_adjustment,'No-show adjustment corrected',p_actor_user_id) on conflict do nothing; end if;
      if v_penalty <> 0 then insert into public.loyalty_transactions(user_id,booking_id,type,points,description,created_by_admin_id)
        values(v_booking.user_id,v_booking.id,'no_show_penalty_reversal',-v_penalty,'No-show penalty corrected',p_actor_user_id) on conflict do nothing; end if;
    end if;
    update public.bookings set status='completed',completed_at=now(),no_show=false,no_show_reason=null where id=v_booking.id returning * into v_booking;
    insert into public.loyalty_transactions(user_id,booking_id,type,points,description,created_by_admin_id)
      values(v_booking.user_id,v_booking.id,'completion_bonus',public.app_setting_number('loyalty_completion_bonus',5),'Completed booking bonus',p_actor_user_id) on conflict do nothing;
    insert into public.user_notifications(user_id,title,message,type,related_entity_type,related_entity_id)
      values(v_booking.user_id,'Booking completed','Your booking was marked completed.','booking_completed','booking',v_booking.id)
      returning id into v_notification_id;
  elsif p_action = 'no_show' then
    v_reason := btrim(p_payload ->> 'reason');
    if v_booking.status <> 'confirmed' or v_booking.no_show or v_reason = '' then raise exception 'INVALID_STATE: Booking cannot be marked no-show.' using errcode = 'check_violation'; end if;
    select coalesce(sum(points),0)::integer into v_total from public.loyalty_transactions where booking_id=v_booking.id;
    update public.bookings set no_show=true,no_show_reason=v_reason where id=v_booking.id returning * into v_booking;
    if v_total <> 0 then insert into public.loyalty_transactions(user_id,booking_id,type,points,description,created_by_admin_id)
      values(v_booking.user_id,v_booking.id,'no_show_adjustment',-v_total,'Booking no-show adjustment',p_actor_user_id) on conflict do nothing; end if;
    insert into public.loyalty_transactions(user_id,booking_id,type,points,description,created_by_admin_id)
      values(v_booking.user_id,v_booking.id,'no_show_penalty',-public.app_setting_number('loyalty_no_show_penalty',20),'No-show penalty',p_actor_user_id) on conflict do nothing;
    insert into public.user_notifications(user_id,title,message,type,related_entity_type,related_entity_id)
      values(v_booking.user_id,'No-show recorded','A no-show was recorded: '||v_reason,'booking_no_show','booking',v_booking.id)
      returning id into v_notification_id;
  elsif p_action = 'reschedule' then
    if v_booking.status <> 'confirmed' then raise exception 'INVALID_STATE: Only confirmed bookings can be rescheduled.' using errcode = 'check_violation'; end if;
    if jsonb_typeof(p_payload) <> 'object'
       or not (p_payload ? 'start_time' and p_payload ? 'end_time' and p_payload ? 'duration_minutes')
       or jsonb_typeof(p_payload -> 'start_time') <> 'string'
       or jsonb_typeof(p_payload -> 'end_time') <> 'string'
       or jsonb_typeof(p_payload -> 'duration_minutes') <> 'number'
       or (p_payload ? 'override_operating_hours'
         and jsonb_typeof(p_payload -> 'override_operating_hours') <> 'boolean')
       or (p_payload ->> 'duration_minutes') !~ '^[0-9]+$' then
      raise exception 'INVALID_PAYLOAD: Reschedule fields are missing or malformed.' using errcode = '22023';
    end if;
    begin
      v_new_start := (p_payload->>'start_time')::timestamptz;
      v_new_end := (p_payload->>'end_time')::timestamptz;
      v_new_duration := (p_payload->>'duration_minutes')::integer;
    exception when data_exception then
      raise exception 'INVALID_PAYLOAD: Reschedule fields are malformed.' using errcode = '22023';
    end;
    -- Integrity: the span must be a valid 30-180 minute block and duration_minutes
    -- must match it, so a tampered/incomplete payload can't corrupt the row.
    perform public.assert_booking_time_contract(
      v_new_start,
      v_new_end,
      v_new_duration,
      not coalesce((p_payload ->> 'override_operating_hours')::boolean, false)
    );
    -- R1: only reject a start moved into the past; duration-only edits of an
    -- already-started booking stay allowed.
    if v_new_start is distinct from v_booking.start_time and v_new_start <= now() then
      raise exception 'PAST_START: Rescheduled start must be in the future.' using errcode = 'check_violation';
    end if;
    -- The pricing trigger reprices court bookings from the new span automatically,
    -- but it ignores coach bookings, so recompute the coach total here (rate x hours).
    if v_booking.booking_type = 'coach' then
      select price_per_hour into v_coach_rate from public.coaches where id = v_booking.coach_id;
      v_new_total := round(coalesce(v_coach_rate, 0) * (extract(epoch from (v_new_end - v_new_start)) / 3600.0), 2);
    else
      v_new_total := v_booking.total_price; -- overwritten by compute_booking_price for court bookings
    end if;
    update public.bookings set
      start_time=v_new_start,
      end_time=v_new_end,
      duration_minutes=v_new_duration,
      total_price=v_new_total
      where id=v_booking.id returning * into v_booking;
    insert into public.user_notifications(user_id,title,message,type,related_entity_type,related_entity_id)
      values(
        v_booking.user_id,
        'Booking rescheduled',
        'Your booking was moved to ' ||
          to_char(v_booking.start_time at time zone 'Asia/Beirut', 'DD Mon YYYY "at" HH24:MI'),
        'booking_rescheduled',
        'booking',
        v_booking.id
      )
      returning id into v_notification_id;
  else
    raise exception 'INVALID_ACTION: Unsupported booking action.' using errcode = '22023';
  end if;

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,summary,metadata)
    values(p_actor_user_id,'booking.'||p_action,'booking',v_booking.id,'Admin booking action: '||p_action,p_payload);
  v_response := jsonb_build_object('booking',to_jsonb(v_booking),'notification_id',v_notification_id);
  insert into public.security_mutation_receipts(actor_user_id,operation,request_id,response)
    values(p_actor_user_id,'admin.booking.'||p_action,p_request_id,v_response);
  return v_response || jsonb_build_object('replayed', false);
end;
$$;

create or replace function public.secure_admin_schedule_action(
  p_actor_user_id uuid, p_request_id uuid, p_action text, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_cached jsonb; v_response jsonb; v_item jsonb; v_row public.bookings%rowtype;
  v_block public.court_blocks%rowtype; v_created jsonb:='[]'::jsonb; v_skipped jsonb:='[]'::jsonb;
  v_user_id uuid; v_notification_id uuid; v_start timestamptz; v_end timestamptz; v_duration integer;
  v_main_court_id uuid; v_error_message text;
begin
  if not exists(select 1 from public.users where id=p_actor_user_id and is_admin) then raise exception 'ADMIN_REQUIRED: Admin access required.' using errcode='insufficient_privilege'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text||':schedule:'||p_request_id::text,0));
  select response into v_cached from public.security_mutation_receipts where actor_user_id=p_actor_user_id and operation='admin.schedule.'||p_action and request_id=p_request_id;
  if found then return v_cached || jsonb_build_object('replayed', true); end if;
  if p_action='block_create' then
    select value::uuid into v_main_court_id from public.app_config where key='main_court_id';
    if v_main_court_id is null then raise exception 'INVALID_REFERENCE: Main court is not configured.' using errcode='foreign_key_violation'; end if;
    begin
      v_start := (p_payload->>'start_time')::timestamptz;
      v_end := (p_payload->>'end_time')::timestamptz;
      v_duration := extract(epoch from (v_end - v_start))::integer / 60;
    exception when others then
      raise exception 'INVALID_PAYLOAD: Block fields are missing or malformed.' using errcode='22023';
    end;
    perform public.assert_court_block_contract(v_start,v_end);
    insert into public.court_blocks(court_id,start_time,end_time,reason) values(v_main_court_id,v_start,v_end,btrim(p_payload->>'reason')) returning * into v_block;
    v_response:=jsonb_build_object('block',to_jsonb(v_block));
    insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,summary,metadata) values(p_actor_user_id,'court_block.create','court_block',v_block.id,'Created court block',p_payload);
  elsif p_action='block_remove' then
    delete from public.court_blocks where id=(p_payload->>'block_id')::uuid returning * into v_block;
    if not found then raise exception 'NOT_FOUND: Court block not found.' using errcode='no_data_found'; end if;
    v_response:=jsonb_build_object('removed_id',v_block.id);
    insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,summary,metadata) values(p_actor_user_id,'court_block.remove','court_block',v_block.id,'Removed court block','{}');
  elsif p_action='coach_create' then
    select value::uuid into v_main_court_id from public.app_config where key='main_court_id';
    if v_main_court_id is null or not exists(select 1 from public.courts where id=v_main_court_id and is_active) then
      raise exception 'INVALID_REFERENCE: Main court is not configured.' using errcode='foreign_key_violation';
    end if;
    for v_item in select value from jsonb_array_elements(p_payload->'bookings') loop
      v_user_id:=coalesce(v_user_id,(v_item->>'user_id')::uuid);
      if v_user_id is distinct from (v_item->>'user_id')::uuid then raise exception 'INVALID_PAYLOAD: Coaching batch owners must match.' using errcode='22023'; end if;
      begin
        v_start := (v_item->>'start_time')::timestamptz;
        v_end := (v_item->>'end_time')::timestamptz;
        v_duration := (v_item->>'duration_minutes')::integer;
      exception when others then
        raise exception 'INVALID_PAYLOAD: Coaching fields are malformed.' using errcode='22023';
      end;
      if v_start<=now() then raise exception 'PAST_START: Coaching sessions must start in the future.' using errcode='check_violation'; end if;
      perform public.assert_booking_time_contract(v_start,v_end,v_duration,true);
      begin
        insert into public.bookings(id,user_id,booking_type,sport_type,court_id,coach_id,uses_main_court,court_half,start_time,end_time,duration_minutes,total_price,status,is_recurring,recurrence_group_id,is_free_reward,ball_machine,no_show)
        values((v_item->>'id')::uuid,v_user_id,'coach',(v_item->>'sport_type')::public.sport_type,
          case when coalesce((v_item->>'uses_main_court')::boolean,true) then v_main_court_id else null end,
          (v_item->>'coach_id')::uuid,coalesce((v_item->>'uses_main_court')::boolean,true),'full',v_start,v_end,v_duration,coalesce((v_item->>'total_price')::numeric,0),'confirmed',coalesce((v_item->>'is_recurring')::boolean,false),nullif(v_item->>'recurrence_group_id','')::uuid,false,false,false) returning * into v_row;
        v_created:=v_created||jsonb_build_array(to_jsonb(v_row));
      exception when exclusion_violation or unique_violation then
        v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object(
          'id',v_item->>'id',
          'code',case when sqlstate='23P01' then 'BOOKING_CONFLICT' else 'INVALID_OCCURRENCE' end,
          'reason',case when sqlstate='23P01' then 'That occurrence conflicts with an existing booking.' else 'That occurrence could not be created.' end
        ));
      when check_violation then
        get stacked diagnostics v_error_message=message_text;
        if v_error_message like 'COURT_BLOCKED:%' then
          v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('id',v_item->>'id','code','COURT_BLOCKED','reason','The court is blocked during this occurrence.'));
        else
          raise;
        end if;
      end;
    end loop;
    if jsonb_array_length(v_created)=0 then
      if v_skipped->0->>'code'='COURT_BLOCKED' then
        raise exception 'COURT_BLOCKED: All coaching occurrences are blocked.' using errcode='check_violation';
      end if;
      raise exception 'BOOKING_CONFLICT: No coaching occurrences were available.' using errcode='check_violation';
    end if;
    insert into public.user_notifications(user_id,title,message,type,related_entity_type,related_entity_id)
      values(v_user_id,'Coaching session booked',jsonb_array_length(v_created)||' coaching session(s) booked.','booking_coach_created','booking',(v_created->0->>'id')::uuid) returning id into v_notification_id;
    insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,summary,metadata)
      values(p_actor_user_id,'booking.coach.create','booking',(v_created->0->>'id')::uuid,'Created coaching session batch',jsonb_build_object('created',jsonb_array_length(v_created),'skipped',jsonb_array_length(v_skipped)));
    v_response:=jsonb_build_object('bookings',v_created,'skipped',v_skipped,'notification_id',v_notification_id);
  else raise exception 'INVALID_ACTION: Unsupported schedule action.' using errcode='22023'; end if;
  insert into public.security_mutation_receipts(actor_user_id,operation,request_id,response) values(p_actor_user_id,'admin.schedule.'||p_action,p_request_id,v_response);
  return v_response || jsonb_build_object('replayed', false);
end; $$;

create or replace function public.secure_admin_management_action(
  p_actor_user_id uuid, p_request_id uuid, p_action text, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_cached jsonb; v_response jsonb:='{}'::jsonb; v_id uuid; v_item record;
begin
  if not exists(select 1 from public.users where id=p_actor_user_id and is_admin) then raise exception 'ADMIN_REQUIRED: Admin access required.' using errcode='insufficient_privilege'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text||':management:'||p_request_id::text,0));
  select response into v_cached from public.security_mutation_receipts where actor_user_id=p_actor_user_id and operation='admin.management.'||p_action and request_id=p_request_id;
  if found then return v_cached; end if;
  if p_action='coach_create' then
    insert into public.coaches(name,supported_sports,bio,price_per_hour,phone,is_active,rating) values(p_payload->>'name',array(select value::public.sport_type from jsonb_array_elements_text(p_payload->'supported_sports') value),p_payload->>'bio',(p_payload->>'price_per_hour')::numeric,p_payload->>'phone',true,5) returning id into v_id;
  elsif p_action='coach_update' then
    v_id:=(p_payload->>'id')::uuid; update public.coaches set name=p_payload->>'name',supported_sports=array(select value::public.sport_type from jsonb_array_elements_text(p_payload->'supported_sports') value),bio=p_payload->>'bio',price_per_hour=(p_payload->>'price_per_hour')::numeric,phone=p_payload->>'phone' where id=v_id;
    if not found then raise exception 'NOT_FOUND: Coach not found.' using errcode='no_data_found'; end if;
  elsif p_action='coach_remove' then v_id:=(p_payload->>'id')::uuid; delete from public.coaches where id=v_id; if not found then raise exception 'NOT_FOUND: Coach not found.' using errcode='no_data_found'; end if;
  elsif p_action='support_phone' then insert into public.app_config(key,value) values('support_phone',p_payload->>'value') on conflict(key) do update set value=excluded.value;
  elsif p_action='rule_create' then insert into public.court_rules(title,content,sort_order) values(p_payload->>'title',p_payload->>'content',(p_payload->>'sort_order')::integer) returning id into v_id;
  elsif p_action='rule_update' then v_id:=(p_payload->>'id')::uuid; update public.court_rules set title=coalesce(p_payload->>'title',title),content=coalesce(p_payload->>'content',content),sort_order=coalesce((p_payload->>'sort_order')::integer,sort_order) where id=v_id; if not found then raise exception 'NOT_FOUND: Court rule not found.' using errcode='no_data_found'; end if;
  elsif p_action='rule_remove' then v_id:=(p_payload->>'id')::uuid; delete from public.court_rules where id=v_id; if not found then raise exception 'NOT_FOUND: Court rule not found.' using errcode='no_data_found'; end if;
  elsif p_action='operating_hours' then
    insert into public.operating_hours(day_of_week,open_time,close_time,is_closed,updated_at)
      select (x->>'day_of_week')::integer,(x->>'open_time')::time,(x->>'close_time')::time,(x->>'is_closed')::boolean,now() from jsonb_array_elements(p_payload->'rows') x
      on conflict(day_of_week) do update set open_time=excluded.open_time,close_time=excluded.close_time,is_closed=excluded.is_closed,updated_at=now();
  elsif p_action='pricing' then
    insert into public.sport_prices(sport_type,price_per_hour,peak_price_per_hour) values
      ('basketball',(p_payload->>'basketball')::numeric,(p_payload->>'basketball_peak')::numeric),
      ('tennis',(p_payload->>'tennis')::numeric,(p_payload->>'tennis_peak')::numeric)
      on conflict(sport_type) do update set price_per_hour=excluded.price_per_hour,peak_price_per_hour=excluded.peak_price_per_hour;
    insert into public.app_settings(key,value) values
      ('ball_machine_rate',(p_payload->>'ball_machine_rate')::numeric),('basketball_half_rate',(p_payload->>'basketball_half')::numeric),('basketball_half_rate_peak',(p_payload->>'basketball_half_peak')::numeric)
      on conflict(key) do update set value=excluded.value;
  elsif p_action='config_values' then
    for v_item in select key,value from jsonb_each(p_payload->'values') loop
      if v_item.key='main_court_id' then raise exception 'INVALID_PAYLOAD: Main court configuration is server-managed.' using errcode='22023'; end if;
      if jsonb_typeof(v_item.value)='number' then insert into public.app_settings(key,value) values(v_item.key,(v_item.value#>>'{}')::numeric) on conflict(key) do update set value=excluded.value;
      else insert into public.app_config(key,value) values(v_item.key,v_item.value#>>'{}') on conflict(key) do update set value=excluded.value; end if;
    end loop;
  else raise exception 'INVALID_ACTION: Unsupported management action.' using errcode='22023'; end if;
  v_response:=jsonb_build_object('id',v_id);
  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,summary,metadata) values(p_actor_user_id,replace(p_action,'_','.'),split_part(p_action,'_',1),v_id,'Admin action: '||p_action,p_payload);
  insert into public.security_mutation_receipts(actor_user_id,operation,request_id,response) values(p_actor_user_id,'admin.management.'||p_action,p_request_id,v_response);
  return v_response;
end; $$;

create or replace function public.secure_admin_notification(
  p_actor_user_id uuid,p_request_id uuid,p_user_id uuid,p_title text,p_message text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_cached jsonb; v_row public.user_notifications%rowtype; v_response jsonb;
begin
  if not exists(select 1 from public.users where id=p_actor_user_id and is_admin) then raise exception 'ADMIN_REQUIRED: Admin access required.' using errcode='insufficient_privilege'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text||':notification:'||p_request_id::text,0));
  select response into v_cached from public.security_mutation_receipts where actor_user_id=p_actor_user_id and operation='admin.notification' and request_id=p_request_id;
  if found then return v_cached || jsonb_build_object('replayed', true); end if;
  insert into public.user_notifications(user_id,title,message,type,related_entity_type,related_entity_id) values(p_user_id,p_title,p_message,'admin_message','user',p_user_id) returning * into v_row;
  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,summary,metadata) values(p_actor_user_id,'notification.create','notification',v_row.id,'Sent notification: '||p_title,jsonb_build_object('userId',p_user_id));
  v_response:=jsonb_build_object('notification',to_jsonb(v_row));
  insert into public.security_mutation_receipts(actor_user_id,operation,request_id,response) values(p_actor_user_id,'admin.notification',p_request_id,v_response);
  return v_response || jsonb_build_object('replayed', false);
end; $$;

-- Compatibility-mode lifecycle updates run as authenticated callers. Keep all
-- loyalty changes in the same database transaction as the booking update so a
-- ledger failure cannot leave the booking and reward balance out of sync.
create or replace function public.apply_compat_booking_lifecycle_loyalty()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_total integer;
  v_adjustment integer;
  v_penalty integer;
  v_admin_id uuid;
begin
  if auth.role() <> 'authenticated' then
    return new;
  end if;
  v_admin_id := case when public.is_admin() then auth.uid() else null end;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    select coalesce(sum(points), 0)::integer into v_total
    from public.loyalty_transactions
    where booking_id = new.id;

    if v_total <> 0 then
      insert into public.loyalty_transactions
        (user_id, booking_id, type, points, description, created_by_admin_id)
      values
        (new.user_id, new.id, 'booking_cancelled', -v_total, 'Booking cancelled', v_admin_id)
      on conflict do nothing;
    end if;
  elsif new.status = 'completed'
      and old.status <> 'completed'
      and coalesce(new.no_show, false) = false then
    if coalesce(old.no_show, false) then
      select coalesce(sum(points), 0)::integer into v_adjustment
      from public.loyalty_transactions
      where booking_id = new.id and type = 'no_show_adjustment';

      select coalesce(sum(points), 0)::integer into v_penalty
      from public.loyalty_transactions
      where booking_id = new.id and type = 'no_show_penalty';

      if v_adjustment <> 0 then
        insert into public.loyalty_transactions
          (user_id, booking_id, type, points, description, created_by_admin_id)
        values
          (new.user_id, new.id, 'no_show_adjustment_reversal', -v_adjustment, 'No-show adjustment corrected', v_admin_id)
        on conflict do nothing;
      end if;
      if v_penalty <> 0 then
        insert into public.loyalty_transactions
          (user_id, booking_id, type, points, description, created_by_admin_id)
        values
          (new.user_id, new.id, 'no_show_penalty_reversal', -v_penalty, 'No-show penalty corrected', v_admin_id)
        on conflict do nothing;
      end if;
    end if;

    insert into public.loyalty_transactions
      (user_id, booking_id, type, points, description, created_by_admin_id)
    values
      (new.user_id, new.id, 'completion_bonus', public.app_setting_number('loyalty_completion_bonus', 5), 'Completed booking bonus', v_admin_id)
    on conflict do nothing;
  elsif coalesce(new.no_show, false)
      and coalesce(old.no_show, false) = false
      and new.status <> 'cancelled' then
    select coalesce(sum(points), 0)::integer into v_total
    from public.loyalty_transactions
    where booking_id = new.id;

    if v_total <> 0 then
      insert into public.loyalty_transactions
        (user_id, booking_id, type, points, description, created_by_admin_id)
      values
        (new.user_id, new.id, 'no_show_adjustment', -v_total, 'Booking no-show adjustment', v_admin_id)
      on conflict do nothing;
    end if;

    insert into public.loyalty_transactions
      (user_id, booking_id, type, points, description, created_by_admin_id)
    values
      (new.user_id, new.id, 'no_show_penalty', -public.app_setting_number('loyalty_no_show_penalty', 20), 'No-show penalty', v_admin_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_compat_booking_lifecycle_loyalty on public.bookings;
create trigger trg_apply_compat_booking_lifecycle_loyalty
  after update on public.bookings
  for each row execute function public.apply_compat_booking_lifecycle_loyalty();

revoke all on function public.apply_compat_booking_lifecycle_loyalty() from public,anon,authenticated;

revoke all on function public.secure_create_court_bookings(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.secure_admin_booking_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.secure_admin_schedule_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.secure_admin_management_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.secure_admin_notification(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.secure_create_court_bookings(uuid,uuid,jsonb) to service_role;
grant execute on function public.secure_admin_booking_action(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.secure_admin_schedule_action(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.secure_admin_management_action(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.secure_admin_notification(uuid,uuid,uuid,text,text) to service_role;

select public.mark_schema_migration('post-lockdown-integrity.sql','Transactional integrity hotfixes');
