-- ============================================================================
-- RizeON - public venue location
-- Run after app-config.sql. Idempotent and safe to re-run.
-- ============================================================================

insert into public.app_config (key, value)
values
  ('venue_name', 'RizeON'),
  ('venue_short_location', 'Ehden, Lebanon'),
  ('venue_maps_url', 'https://maps.app.goo.gl/CAqpTSgpVPLF1ZG8A?g_st=aw')
on conflict (key) do update set value = excluded.value;

select public.mark_schema_migration('venue-location.sql', 'RizeON venue location');
