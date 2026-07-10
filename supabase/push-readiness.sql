-- ============================================================================
-- RizeON — push notification readiness
-- Run after schema.sql / policies.sql / schema-migrations.sql. Idempotent.
-- Stores Expo push tokens per user/device. In-app notifications remain the
-- source of truth; push delivery is best-effort from supported builds.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  platform text,
  device_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_tokens_user_active
  on public.push_tokens (user_id, is_active);

alter table public.push_tokens enable row level security;

drop policy if exists "users read own push tokens" on public.push_tokens;
create policy "users read own push tokens" on public.push_tokens
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "users insert own push tokens" on public.push_tokens;
create policy "users insert own push tokens" on public.push_tokens
  for insert with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "users update own push tokens" on public.push_tokens;
create policy "users update own push tokens" on public.push_tokens
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

select public.mark_schema_migration('push-readiness.sql', 'Push readiness');
