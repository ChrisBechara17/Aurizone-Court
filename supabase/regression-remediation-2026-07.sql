-- Corrective upgrade for projects that already ran the original July
-- remediation. The updated remediation-2026-07.sql remains canonical; this
-- marker lets operators prove the corrective version was applied.
begin;

do $$
declare v_main uuid;
begin
  select c.id into v_main
  from public.courts c
  where c.name='Main Court'
  order by
    (c.id::text=coalesce((select value from public.app_config where key='main_court_id'),'')) desc,
    c.id
  limit 1;
  if v_main is null then
    raise exception 'INVALID_STATE: Main Court is missing.' using errcode='check_violation';
  end if;
  if exists(
    select 1 from public.bookings a join public.bookings b
      on a.id<b.id and a.court_id is distinct from b.court_id
      and a.status='confirmed' and b.status='confirmed'
      and a.uses_main_court and b.uses_main_court
      and tstzrange(a.start_time,a.end_time,'[)') && tstzrange(b.start_time,b.end_time,'[)')
  ) then
    raise exception 'BOOKING_CONFLICT: Cross-court bookings overlap. Resolve preflight rows first.' using errcode='exclusion_violation';
  end if;
  if exists(
    select 1 from public.court_blocks cb join public.bookings b
      on cb.court_id is distinct from b.court_id
     and b.status='confirmed' and b.uses_main_court
     and tstzrange(cb.start_time,cb.end_time,'[)') && tstzrange(b.start_time,b.end_time,'[)')
  ) then
    raise exception 'BOOKING_CONFLICT: Cross-court blocks overlap bookings. Resolve preflight rows first.' using errcode='exclusion_violation';
  end if;
  update public.bookings set court_id=v_main where uses_main_court and court_id is distinct from v_main;
  update public.bookings set court_id=null where booking_type='coach' and not uses_main_court and court_id is not null;
  update public.court_blocks set court_id=v_main where court_id is distinct from v_main;
  update public.courts set is_active=false where id<>v_main and is_active;
  update public.courts set is_active=true where id=v_main and not is_active;
  insert into public.app_config(key,value) values('main_court_id',v_main::text)
    on conflict(key) do update set value=excluded.value;
end $$;

create unique index if not exists uq_courts_single_active on public.courts((is_active)) where is_active;
alter table public.push_tokens add column if not exists installation_id_hash text;
update public.push_tokens set is_active=false,updated_at=now() where installation_id_hash is null and is_active;
do $$ begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.push_tokens'::regclass
      and conname='chk_push_token_active_installation'
  ) then
    alter table public.push_tokens add constraint chk_push_token_active_installation
      check(not is_active or installation_id_hash is not null) not valid;
  end if;
end $$;
alter table public.push_tokens validate constraint chk_push_token_active_installation;

drop function if exists public.secure_register_push_token(uuid,text,text,text,boolean);
drop function if exists public.secure_deactivate_push_token(uuid,text);

create or replace function public.secure_register_push_token(
  p_actor_user_id uuid,p_token text,p_platform text,p_device_id text,
  p_installation_id uuid,p_booking_reminders_enabled boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_existing public.push_tokens%rowtype; v_saved public.push_tokens%rowtype; v_hash text;
begin
  if p_actor_user_id is null or p_token is null or length(p_token)<20 or p_installation_id is null then
    raise exception 'INVALID_PAYLOAD: Invalid push token registration.' using errcode='22023';
  end if;
  v_hash:=encode(extensions.digest(p_installation_id::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_token,0));
  select * into v_existing from public.push_tokens where token=p_token for update;
  if found and v_existing.user_id<>p_actor_user_id and v_existing.is_active
     and v_existing.installation_id_hash is distinct from v_hash then
    raise exception 'TOKEN_OWNERSHIP: Push token belongs to another installation.' using errcode='check_violation';
  end if;
  insert into public.push_tokens(user_id,token,platform,device_id,installation_id_hash,is_active,booking_reminders_enabled,updated_at)
  values(p_actor_user_id,p_token,p_platform,p_device_id,v_hash,true,p_booking_reminders_enabled,now())
  on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,
    device_id=excluded.device_id,installation_id_hash=excluded.installation_id_hash,
    is_active=true,booking_reminders_enabled=excluded.booking_reminders_enabled,updated_at=now()
  returning * into v_saved;
  return to_jsonb(v_saved)-'installation_id_hash';
end; $$;

create or replace function public.secure_deactivate_push_token(
  p_actor_user_id uuid,p_token text,p_installation_id uuid
) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_installation_id is null then raise exception 'INVALID_PAYLOAD: Installation proof is required.' using errcode='22023'; end if;
  update public.push_tokens set is_active=false,updated_at=now()
  where token=p_token and user_id=p_actor_user_id
    and installation_id_hash=encode(extensions.digest(p_installation_id::text,'sha256'),'hex');
end; $$;

revoke all on function public.secure_register_push_token(uuid,text,text,text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.secure_deactivate_push_token(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.secure_register_push_token(uuid,text,text,text,uuid,boolean) to service_role;
grant execute on function public.secure_deactivate_push_token(uuid,text,uuid) to service_role;
select public.mark_schema_migration('regression-remediation-2026-07.sql','July 2026 regression remediation');
commit;
