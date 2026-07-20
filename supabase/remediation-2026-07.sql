-- RizeON July 2026 verified remediation. Run after server-booking-reminders.sql
-- and the updated post-lockdown-integrity.sql. Idempotent.

do $$
declare v_main uuid; v_count integer;
begin
  select count(*) into v_count from public.courts where name='Main Court';
  select id into v_main from public.courts where name='Main Court' limit 1;
  if v_count<>1 then
    raise exception 'INVALID_STATE: Expected exactly one court named Main Court.' using errcode='check_violation';
  end if;
  update public.courts set is_active=(id=v_main);
  insert into public.app_config(key,value) values('main_court_id',v_main::text)
  on conflict(key) do update set value=excluded.value;
end $$;

create unique index if not exists uq_courts_single_active
  on public.courts((is_active)) where is_active;

drop policy if exists "admin write courts" on public.courts;
drop policy if exists "admin write membership_packages" on public.membership_packages;
revoke insert,update,delete on public.courts,public.membership_packages from authenticated;
revoke select on public.courts,public.sport_prices,public.court_rules,public.membership_packages,
  public.coaches,public.court_blocks,public.app_settings,public.app_config,public.operating_hours from anon;

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.operating_hours'::regclass and conname='chk_operating_hours_order') then
    alter table public.operating_hours add constraint chk_operating_hours_order
      check(is_closed=true or close_time>open_time) not valid;
  end if;
end $$;
alter table public.operating_hours validate constraint chk_operating_hours_order;

create or replace function public.secure_register_push_token(
  p_actor_user_id uuid,p_token text,p_platform text,p_device_id text,p_booking_reminders_enabled boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_existing public.push_tokens%rowtype; v_saved public.push_tokens%rowtype;
begin
  if p_actor_user_id is null or p_token is null or length(p_token)<20 then
    raise exception 'INVALID_PAYLOAD: Invalid push token registration.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_token,0));
  select * into v_existing from public.push_tokens where token=p_token for update;
  if found and v_existing.user_id<>p_actor_user_id and v_existing.is_active then
    raise exception 'TOKEN_OWNERSHIP: Push token belongs to an active account.' using errcode='check_violation';
  end if;
  insert into public.push_tokens(user_id,token,platform,device_id,is_active,booking_reminders_enabled,updated_at)
  values(p_actor_user_id,p_token,p_platform,p_device_id,true,p_booking_reminders_enabled,now())
  on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,
    device_id=excluded.device_id,is_active=true,booking_reminders_enabled=excluded.booking_reminders_enabled,updated_at=now()
  returning * into v_saved;
  return to_jsonb(v_saved);
end; $$;

create or replace function public.secure_deactivate_push_token(p_actor_user_id uuid,p_token text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update public.push_tokens set is_active=false,updated_at=now()
  where token=p_token and user_id=p_actor_user_id;
end; $$;

revoke all on function public.secure_register_push_token(uuid,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.secure_deactivate_push_token(uuid,text) from public,anon,authenticated;
grant execute on function public.secure_register_push_token(uuid,text,text,text,boolean) to service_role;
grant execute on function public.secure_deactivate_push_token(uuid,text) to service_role;

select public.mark_schema_migration('remediation-2026-07.sql','Verified July 2026 remediation');
