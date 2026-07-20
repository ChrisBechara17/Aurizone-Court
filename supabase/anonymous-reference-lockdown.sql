-- ============================================================================
-- RizeON - anonymous reference-data lockdown
-- Intentional public API contract change. Run before peak-pricing.sql.
-- Idempotent and safe to re-run.
-- ============================================================================

-- Signed-in clients retain their existing reads. Anonymous callers must not see
-- coach contact details, maintenance blocks, business settings, configuration,
-- or operating hours through the public REST API.
do $$
declare
  t text;
begin
  foreach t in array array[
    'public.coaches',
    'public.court_blocks',
    'public.app_settings',
    'public.app_config',
    'public.operating_hours'
  ] loop
    if to_regclass(t) is not null then
      execute format('revoke select on %s from anon', t);
    end if;
  end loop;
end;
$$;

select public.mark_schema_migration(
  'anonymous-reference-lockdown.sql',
  'Anonymous reference reads revoked'
);
