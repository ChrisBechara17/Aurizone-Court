-- ============================================================================
-- RizeON - production support phone
-- Run after app-config.sql. Idempotent and safe to re-run.
-- ============================================================================

insert into public.app_config (key, value)
values ('support_phone', '+961 71 735 528')
on conflict (key) do update set value = excluded.value;

select public.mark_schema_migration('support-phone.sql', 'Production support phone');
