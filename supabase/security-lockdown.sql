-- ============================================================================
-- RizeON - FINAL write lock-down
-- Run ONLY after all Edge Functions are deployed and release-build smoke tests
-- pass. Rollback instructions are in SECURITY_DEPLOYMENT.md.
-- ============================================================================

-- Normal users retain reads and notification read-state updates. Booking and
-- business mutations must cross the Edge Function/service-role boundary.
drop policy if exists "users create own bookings" on public.bookings;
drop policy if exists "users update own bookings" on public.bookings;
drop policy if exists "admins manage all bookings" on public.bookings;

drop policy if exists "admin write coaches" on public.coaches;
drop policy if exists "admin update coaches" on public.coaches;
drop policy if exists "admin delete coaches" on public.coaches;
drop policy if exists "admin write court_blocks" on public.court_blocks;
drop policy if exists "admin write sport_prices" on public.sport_prices;
drop policy if exists "admin write court_rules" on public.court_rules;
drop policy if exists "admin write operating_hours" on public.operating_hours;
drop policy if exists "admin write app_config" on public.app_config;
drop policy if exists "admin write app_settings" on public.app_settings;
drop policy if exists "admins insert audit logs" on public.admin_audit_logs;
drop policy if exists "admins insert loyalty transactions" on public.loyalty_transactions;
drop policy if exists "admins create notifications" on public.user_notifications;
drop policy if exists "users insert own booking loyalty transactions" on public.loyalty_transactions;

drop policy if exists "users read own push tokens" on public.push_tokens;
drop policy if exists "users insert own push tokens" on public.push_tokens;
drop policy if exists "users update own push tokens" on public.push_tokens;

revoke insert, update, delete on public.bookings from authenticated;
revoke insert, update, delete on public.coaches, public.court_blocks, public.sport_prices,
  public.court_rules, public.operating_hours, public.app_config, public.app_settings,
  public.admin_audit_logs, public.loyalty_transactions from authenticated;
revoke insert, delete on public.user_notifications from authenticated;

-- Push token ownership is managed only through the device-token Edge Function.
revoke all on public.push_tokens from anon, authenticated;
revoke execute on function public.register_push_token(text, text, text) from authenticated;
revoke execute on function public.deactivate_push_token(text) from authenticated;

select public.mark_schema_migration('security-lockdown.sql', 'Legacy direct writes revoked');
