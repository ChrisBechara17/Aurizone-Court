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

-- A physical device may be shared by multiple accounts. These definer RPCs
-- atomically transfer a token to the currently signed-in user and deactivate it
-- on sign-out without exposing another user's token row through RLS.
create or replace function public.register_push_token(
  push_token text,
  push_platform text default null,
  push_device_id text default null
)
returns setof public.push_tokens
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: Authentication required.' using errcode = 'insufficient_privilege';
  end if;

  return query
  insert into public.push_tokens (user_id, token, platform, device_id, is_active, updated_at)
  values (auth.uid(), push_token, push_platform, push_device_id, true, now())
  on conflict (token) do update
    set user_id = auth.uid(),
        platform = excluded.platform,
        device_id = excluded.device_id,
        is_active = true,
        updated_at = now()
  returning *;
end;
$$;

create or replace function public.deactivate_push_token(push_token text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: Authentication required.' using errcode = 'insufficient_privilege';
  end if;

  update public.push_tokens
  set is_active = false, updated_at = now()
  where token = push_token and user_id = auth.uid();
end;
$$;

revoke all on function public.register_push_token(text, text, text) from public;
revoke all on function public.deactivate_push_token(text) from public;
grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.deactivate_push_token(text) to authenticated;

select public.mark_schema_migration('push-readiness.sql', 'Push readiness');
