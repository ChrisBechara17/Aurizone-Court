-- ============================================================================
-- RizeON — schema migration tracking
-- Run after policies.sql. Idempotent.
-- Records which major SQL upgrade files have been applied so Admin Health can
-- show missing database setup without blocking the rest of the app.
-- ============================================================================

create table if not exists public.schema_migrations (
  key text primary key,
  label text not null,
  applied_at timestamptz not null default now()
);

alter table public.schema_migrations enable row level security;

drop policy if exists "admins read schema migrations" on public.schema_migrations;
create policy "admins read schema migrations" on public.schema_migrations
  for select using (public.is_admin());

drop policy if exists "admins write schema migrations" on public.schema_migrations;
create policy "admins write schema migrations" on public.schema_migrations
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.mark_schema_migration(migration_key text, migration_label text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.schema_migrations (key, label, applied_at)
  values (migration_key, migration_label, now())
  on conflict (key) do update
    set label = excluded.label,
        applied_at = excluded.applied_at;
$$;

revoke all on function public.mark_schema_migration(text, text) from public;
revoke all on function public.mark_schema_migration(text, text) from anon;
revoke all on function public.mark_schema_migration(text, text) from authenticated;

select public.mark_schema_migration('schema.sql', 'Base schema');
select public.mark_schema_migration('policies.sql', 'RLS policies');
select public.mark_schema_migration('schema-migrations.sql', 'Migration tracking');
