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
  v_free_count integer;
  v_strikes integer;
  v_start timestamptz;
  v_end timestamptz;
  v_local_start timestamp;
  v_local_end timestamp;
  v_hours public.operating_hours%rowtype;
  v_start_minutes integer;
  v_end_minutes integer;
  v_open_minutes integer;
  v_close_minutes integer;
begin
  if p_actor_user_id is null or p_request_id is null or jsonb_typeof(p_bookings) <> 'array' then
    raise exception 'INVALID_PAYLOAD: Missing actor, request, or bookings.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text || ':booking:' || p_request_id::text, 0));
  select response into v_cached from public.security_mutation_receipts
    where actor_user_id = p_actor_user_id and operation = 'booking.create' and request_id = p_request_id;
  if found then return v_cached; end if;

  v_count := jsonb_array_length(p_bookings);
  if v_count < 1 or v_count > 6 then
    raise exception 'INVALID_PAYLOAD: Booking batch must contain 1 to 6 rows.' using errcode = '22023';
  end if;

  select count(*) into v_free_count from jsonb_array_elements(p_bookings) x
    where coalesce((x ->> 'is_free_reward')::boolean, false);
  if v_free_count > 1 or (v_free_count = 1 and v_count > 1) then
    raise exception 'REWARD_BATCH_INVALID: A free reward can only be used on one non-recurring booking.' using errcode = 'check_violation';
  end if;

  perform 1 from public.users where id = p_actor_user_id for update;
  if not found then raise exception 'PROFILE_REQUIRED: User profile not found.' using errcode = 'foreign_key_violation'; end if;

  select count(*) into v_strikes from public.bookings
    where user_id = p_actor_user_id and no_show = true and status <> 'cancelled';
  if v_strikes >= 3 then
    raise exception 'ACCOUNT_DISABLED: Your account is disabled after 3 no-shows.' using errcode = 'insufficient_privilege';
  end if;

  for v_item in select value from jsonb_array_elements(p_bookings) loop
    if (v_item ->> 'user_id')::uuid is distinct from p_actor_user_id
       or v_item ->> 'booking_type' <> 'court'
       or v_item ->> 'status' <> 'confirmed' then
      raise exception 'OWNERSHIP_MISMATCH: Invalid booking owner or lifecycle.' using errcode = 'insufficient_privilege';
    end if;

    v_start := (v_item ->> 'start_time')::timestamptz;
    v_end := (v_item ->> 'end_time')::timestamptz;
    if v_start <= now() then raise exception 'PAST_START: Bookings must start in the future.' using errcode = 'check_violation'; end if;
    if v_end <= v_start or extract(epoch from (v_end - v_start)) / 60 > 180
       or round(extract(epoch from (v_end - v_start)) / 60.0) <> (v_item ->> 'duration_minutes')::integer then
      raise exception 'INVALID_DURATION: Booking duration must match a 30 to 180 minute span.' using errcode = 'check_violation';
    end if;
    if (v_item ->> 'duration_minutes')::integer < 30 then
      raise exception 'INVALID_DURATION: Minimum booking duration is 30 minutes.' using errcode = 'check_violation';
    end if;
    if v_item ->> 'sport_type' = 'tennis' and coalesce(v_item ->> 'court_half', 'full') <> 'full' then
      raise exception 'INVALID_COURT_HALF: Tennis requires the full court.' using errcode = 'check_violation';
    end if;
    if coalesce((v_item ->> 'is_free_reward')::boolean, false)
       and (coalesce((v_item ->> 'is_recurring')::boolean, false) or public.free_reward_balance(p_actor_user_id) < 1) then
      raise exception 'REWARD_UNAVAILABLE: No free reward is available.' using errcode = 'check_violation';
    end if;

    v_local_start := v_start at time zone 'Asia/Beirut';
    v_local_end := v_end at time zone 'Asia/Beirut';
    select * into v_hours from public.operating_hours
      where day_of_week = extract(dow from v_local_start)::integer;
    if not found or v_hours.is_closed then
      raise exception 'COURT_CLOSED: The court is closed on this day.' using errcode = 'check_violation';
    end if;
    v_start_minutes := extract(hour from v_local_start)::integer * 60 + extract(minute from v_local_start)::integer;
    v_end_minutes := extract(hour from v_local_end)::integer * 60 + extract(minute from v_local_end)::integer;
    if v_local_end::date > v_local_start::date then v_end_minutes := v_end_minutes + 1440; end if;
    v_open_minutes := extract(hour from v_hours.open_time)::integer * 60 + extract(minute from v_hours.open_time)::integer;
    v_close_minutes := extract(hour from v_hours.close_time)::integer * 60 + extract(minute from v_hours.close_time)::integer;
    if v_start_minutes < v_open_minutes or v_end_minutes > v_close_minutes then
      raise exception 'OUTSIDE_OPERATING_HOURS: This booking is outside operating hours.' using errcode = 'check_violation';
    end if;

    insert into public.bookings (
      id, user_id, booking_type, sport_type, court_id, coach_id, uses_main_court,
      court_half, start_time, end_time, duration_minutes, total_price, status,
      is_recurring, recurrence_group_id, is_free_reward, ball_machine, no_show
    ) values (
      (v_item ->> 'id')::uuid, p_actor_user_id, 'court', (v_item ->> 'sport_type')::public.sport_type,
      (v_item ->> 'court_id')::uuid, null, true, coalesce(v_item ->> 'court_half', 'full'),
      v_start, v_end, (v_item ->> 'duration_minutes')::integer, 0, 'confirmed',
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
begin
  if not exists(select 1 from public.users where id = p_actor_user_id and is_admin) then
    raise exception 'ADMIN_REQUIRED: Admin access required.' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text || ':admin-booking:' || p_request_id::text, 0));
  select response into v_cached from public.security_mutation_receipts
    where actor_user_id = p_actor_user_id and operation = 'admin.booking.' || p_action and request_id = p_request_id;
  if found then return v_cached; end if;

  select * into v_booking from public.bookings where id = (p_payload ->> 'booking_id')::uuid for update;
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
    if v_booking.status = 'cancelled' then raise exception 'INVALID_STATE: Cancelled bookings cannot be rescheduled.' using errcode = 'check_violation'; end if;
    update public.bookings set
      start_time=(p_payload->>'start_time')::timestamptz,
      end_time=(p_payload->>'end_time')::timestamptz,
      duration_minutes=(p_payload->>'duration_minutes')::integer
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
  return v_response;
end;
$$;

create or replace function public.secure_admin_schedule_action(
  p_actor_user_id uuid, p_request_id uuid, p_action text, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_cached jsonb; v_response jsonb; v_item jsonb; v_row public.bookings%rowtype;
  v_block public.court_blocks%rowtype; v_created jsonb:='[]'::jsonb; v_skipped jsonb:='[]'::jsonb;
  v_user_id uuid; v_notification_id uuid;
begin
  if not exists(select 1 from public.users where id=p_actor_user_id and is_admin) then raise exception 'ADMIN_REQUIRED' using errcode='insufficient_privilege'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text||':schedule:'||p_request_id::text,0));
  select response into v_cached from public.security_mutation_receipts where actor_user_id=p_actor_user_id and operation='admin.schedule.'||p_action and request_id=p_request_id;
  if found then return v_cached; end if;
  if p_action='block_create' then
    insert into public.court_blocks(court_id,start_time,end_time,reason) values((p_payload->>'court_id')::uuid,(p_payload->>'start_time')::timestamptz,(p_payload->>'end_time')::timestamptz,btrim(p_payload->>'reason')) returning * into v_block;
    v_response:=jsonb_build_object('block',to_jsonb(v_block));
    insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,summary,metadata) values(p_actor_user_id,'court_block.create','court_block',v_block.id,'Created court block',p_payload);
  elsif p_action='block_remove' then
    delete from public.court_blocks where id=(p_payload->>'block_id')::uuid returning * into v_block;
    if not found then raise exception 'NOT_FOUND: Court block not found.' using errcode='no_data_found'; end if;
    v_response:=jsonb_build_object('removed_id',v_block.id);
    insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,summary,metadata) values(p_actor_user_id,'court_block.remove','court_block',v_block.id,'Removed court block','{}');
  elsif p_action='coach_create' then
    for v_item in select value from jsonb_array_elements(p_payload->'bookings') loop
      v_user_id:=coalesce(v_user_id,(v_item->>'user_id')::uuid);
      if v_user_id is distinct from (v_item->>'user_id')::uuid then raise exception 'INVALID_PAYLOAD: Coaching batch owners must match.' using errcode='22023'; end if;
      begin
        insert into public.bookings(id,user_id,booking_type,sport_type,court_id,coach_id,uses_main_court,court_half,start_time,end_time,duration_minutes,total_price,status,is_recurring,recurrence_group_id,is_free_reward,ball_machine,no_show)
        values((v_item->>'id')::uuid,v_user_id,'coach',(v_item->>'sport_type')::public.sport_type,nullif(v_item->>'court_id','')::uuid,(v_item->>'coach_id')::uuid,coalesce((v_item->>'uses_main_court')::boolean,true),'full',(v_item->>'start_time')::timestamptz,(v_item->>'end_time')::timestamptz,(v_item->>'duration_minutes')::integer,coalesce((v_item->>'total_price')::numeric,0),'confirmed',coalesce((v_item->>'is_recurring')::boolean,false),nullif(v_item->>'recurrence_group_id','')::uuid,false,false,false) returning * into v_row;
        v_created:=v_created||jsonb_build_array(to_jsonb(v_row));
      exception when exclusion_violation or check_violation or unique_violation then
        v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('id',v_item->>'id','reason',sqlerrm));
      end;
    end loop;
    if jsonb_array_length(v_created)=0 then raise exception 'BOOKING_CONFLICT: No coaching occurrences were available.' using errcode='check_violation'; end if;
    insert into public.user_notifications(user_id,title,message,type,related_entity_type,related_entity_id)
      values(v_user_id,'Coaching session booked',jsonb_array_length(v_created)||' coaching session(s) booked.','booking_coach_created','booking',(v_created->0->>'id')::uuid) returning id into v_notification_id;
    insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,summary,metadata)
      values(p_actor_user_id,'booking.coach.create','booking',(v_created->0->>'id')::uuid,'Created coaching session batch',jsonb_build_object('created',jsonb_array_length(v_created),'skipped',jsonb_array_length(v_skipped)));
    v_response:=jsonb_build_object('bookings',v_created,'skipped',v_skipped,'notification_id',v_notification_id);
  else raise exception 'INVALID_ACTION' using errcode='22023'; end if;
  insert into public.security_mutation_receipts(actor_user_id,operation,request_id,response) values(p_actor_user_id,'admin.schedule.'||p_action,p_request_id,v_response);
  return v_response;
end; $$;

create or replace function public.secure_admin_management_action(
  p_actor_user_id uuid, p_request_id uuid, p_action text, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_cached jsonb; v_response jsonb:='{}'::jsonb; v_id uuid; v_item record;
begin
  if not exists(select 1 from public.users where id=p_actor_user_id and is_admin) then raise exception 'ADMIN_REQUIRED' using errcode='insufficient_privilege'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text||':management:'||p_request_id::text,0));
  select response into v_cached from public.security_mutation_receipts where actor_user_id=p_actor_user_id and operation='admin.management.'||p_action and request_id=p_request_id;
  if found then return v_cached; end if;
  if p_action='coach_create' then
    insert into public.coaches(name,supported_sports,bio,price_per_hour,phone,is_active,rating) values(p_payload->>'name',array(select value::public.sport_type from jsonb_array_elements_text(p_payload->'supported_sports') value),p_payload->>'bio',(p_payload->>'price_per_hour')::numeric,p_payload->>'phone',true,5) returning id into v_id;
  elsif p_action='coach_update' then
    v_id:=(p_payload->>'id')::uuid; update public.coaches set name=p_payload->>'name',supported_sports=array(select value::public.sport_type from jsonb_array_elements_text(p_payload->'supported_sports') value),bio=p_payload->>'bio',price_per_hour=(p_payload->>'price_per_hour')::numeric,phone=p_payload->>'phone' where id=v_id;
    if not found then raise exception 'NOT_FOUND' using errcode='no_data_found'; end if;
  elsif p_action='coach_remove' then v_id:=(p_payload->>'id')::uuid; delete from public.coaches where id=v_id; if not found then raise exception 'NOT_FOUND' using errcode='no_data_found'; end if;
  elsif p_action='support_phone' then insert into public.app_config(key,value) values('support_phone',p_payload->>'value') on conflict(key) do update set value=excluded.value;
  elsif p_action='rule_create' then insert into public.court_rules(title,content,sort_order) values(p_payload->>'title',p_payload->>'content',(p_payload->>'sort_order')::integer) returning id into v_id;
  elsif p_action='rule_update' then v_id:=(p_payload->>'id')::uuid; update public.court_rules set title=coalesce(p_payload->>'title',title),content=coalesce(p_payload->>'content',content),sort_order=coalesce((p_payload->>'sort_order')::integer,sort_order) where id=v_id; if not found then raise exception 'NOT_FOUND' using errcode='no_data_found'; end if;
  elsif p_action='rule_remove' then v_id:=(p_payload->>'id')::uuid; delete from public.court_rules where id=v_id; if not found then raise exception 'NOT_FOUND' using errcode='no_data_found'; end if;
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
      if jsonb_typeof(v_item.value)='number' then insert into public.app_settings(key,value) values(v_item.key,(v_item.value#>>'{}')::numeric) on conflict(key) do update set value=excluded.value;
      else insert into public.app_config(key,value) values(v_item.key,v_item.value#>>'{}') on conflict(key) do update set value=excluded.value; end if;
    end loop;
  else raise exception 'INVALID_ACTION' using errcode='22023'; end if;
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
  if not exists(select 1 from public.users where id=p_actor_user_id and is_admin) then raise exception 'ADMIN_REQUIRED' using errcode='insufficient_privilege'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text||':notification:'||p_request_id::text,0));
  select response into v_cached from public.security_mutation_receipts where actor_user_id=p_actor_user_id and operation='admin.notification' and request_id=p_request_id;
  if found then return v_cached; end if;
  insert into public.user_notifications(user_id,title,message,type,related_entity_type,related_entity_id) values(p_user_id,p_title,p_message,'admin_message','user',p_user_id) returning * into v_row;
  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,summary,metadata) values(p_actor_user_id,'notification.create','notification',v_row.id,'Sent notification: '||p_title,jsonb_build_object('userId',p_user_id));
  v_response:=jsonb_build_object('notification',to_jsonb(v_row));
  insert into public.security_mutation_receipts(actor_user_id,operation,request_id,response) values(p_actor_user_id,'admin.notification',p_request_id,v_response);
  return v_response;
end; $$;

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
