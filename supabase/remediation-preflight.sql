-- Read-only checks to run before remediation-2026-07.sql.
do $$
begin
  if (select count(*) from public.courts where name='Main Court')<>1 then
    raise exception 'INVALID_STATE: Remediation requires exactly one court named Main Court.' using errcode='check_violation';
  end if;
  if exists(select 1 from public.operating_hours where not is_closed and close_time<=open_time) then
    raise exception 'INVALID_STATE: Correct inverted operating hours before remediation.' using errcode='check_violation';
  end if;
  if to_regclass('public.push_tokens') is null then
    raise exception 'INVALID_STATE: Apply push-readiness.sql before remediation.' using errcode='check_violation';
  end if;
  if to_regclass('public.booking_reminder_deliveries') is null then
    raise exception 'INVALID_STATE: Apply server-booking-reminders.sql before remediation.' using errcode='check_violation';
  end if;
end $$;

select id,name,is_active from public.courts order by name,id;
select day_of_week,open_time,close_time,is_closed from public.operating_hours order by day_of_week;
