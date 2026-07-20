-- FRESH INSTALL ONLY. This file creates non-idempotent enums, tables, and seed
-- rows; never rerun it against an existing database.
-- ============================================================================
-- CourtHub — Supabase / Postgres schema
-- Mirrors src/models/index.ts. Run in the Supabase SQL editor.
-- ============================================================================

-- Extensions ------------------------------------------------------------
create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- Enums -------------------------------------------------------------------
create type sport_type as enum ('basketball', 'tennis');
create type booking_type as enum ('court', 'coach');
create type booking_status as enum ('confirmed', 'cancelled', 'completed');

-- ============================================================================
-- users
-- Extends Supabase Auth (auth.users) with app-specific profile fields.
-- ============================================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone_or_email text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- courts
-- ============================================================================
create table public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supported_sports sport_type[] not null default array['basketball','tennis']::sport_type[],
  is_active boolean not null default true
);

-- ============================================================================
-- sport_prices
-- ============================================================================
create table public.sport_prices (
  sport_type sport_type primary key,
  price_per_hour numeric(10,2) not null
);

-- ============================================================================
-- coaches
-- ============================================================================
create table public.coaches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supported_sports sport_type[] not null,
  bio text not null default '',
  price_per_hour numeric(10,2) not null default 0,
  phone text not null,
  is_active boolean not null default true,
  rating numeric(2,1) not null default 5.0,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- bookings
-- ============================================================================
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  booking_type booking_type not null,
  sport_type sport_type not null,
  court_id uuid references public.courts(id),
  coach_id uuid references public.coaches(id),
  uses_main_court boolean not null default false,
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration_minutes integer not null,
  total_price numeric(10,2) not null default 0,
  status booking_status not null default 'confirmed',
  is_recurring boolean not null default false,
  recurrence_group_id uuid,
  is_free_reward boolean not null default false,
  ball_machine boolean not null default false,
  -- Half-court support (basketball only). 'full' occupies the whole court, 'a'
  -- the left half, 'b' the right. Defined here so pricing.sql's trigger and
  -- privacy-view.sql can reference it regardless of run order; half-court.sql
  -- adds the derived side_range and the side-aware overlap constraint.
  court_half text not null default 'full' check (court_half in ('full', 'a', 'b')),
  no_show boolean not null default false,
  notification_id text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,

  constraint chk_end_after_start check (end_time > start_time),
  constraint chk_court_or_coach check (
    (booking_type = 'court' and court_id is not null)
    or (booking_type = 'coach' and coach_id is not null)
  )
);

-- Speeds up the shared-court conflict check (same court, overlapping range).
create index idx_bookings_court_time
  on public.bookings (court_id, start_time, end_time)
  where uses_main_court = true and status = 'confirmed';

-- Speeds up coach conflict checks.
create index idx_bookings_coach_time
  on public.bookings (coach_id, start_time, end_time)
  where status = 'confirmed';

-- Speeds up "my bookings" / admin per-user queries.
create index idx_bookings_user on public.bookings (user_id, start_time);

-- ============================================================================
-- court_blocks (admin-created maintenance/event blocks)
-- ============================================================================
create table public.court_blocks (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  reason text not null default 'Maintenance',
  created_at timestamptz not null default now(),

  constraint chk_block_end_after_start check (end_time > start_time)
);

create index idx_court_blocks_time on public.court_blocks (court_id, start_time, end_time);

-- ============================================================================
-- court_rules
-- ============================================================================
create table public.court_rules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  sort_order integer not null default 0
);

-- ============================================================================
-- membership_packages
-- ============================================================================
create table public.membership_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  sport_type text not null default 'all', -- 'basketball' | 'tennis' | 'all'
  is_coming_soon boolean not null default true
);

-- ============================================================================
-- Seed data
-- ============================================================================
insert into public.courts (name, supported_sports, is_active) values
  ('Main Court', array['basketball','tennis']::sport_type[], true);

insert into public.sport_prices (sport_type, price_per_hour) values
  ('basketball', 30),
  ('tennis', 20);

insert into public.coaches (name, supported_sports, bio, price_per_hour, phone, rating) values
  ('Coach Karim', array['basketball']::sport_type[], 'Shooting, footwork, and game IQ', 25, '+1 (555) 014-2231', 4.8),
  ('Coach Maya',  array['tennis']::sport_type[],     'Beginner to advanced tennis development', 30, '+1 (555) 087-5567', 4.9),
  ('Coach Jad',   array['basketball','tennis']::sport_type[], 'Multi-sport private training', 35, '+1 (555) 203-9912', 4.7);

insert into public.court_rules (title, content, sort_order) values
  ('Maximum booking duration', 'Sessions can be booked for up to 3 hours. Longer bookings are not allowed.', 1),
  ('One shared court', 'The Main Court is shared between basketball and tennis. There is only one physical court.', 2),
  ('Basketball blocks tennis', 'A basketball booking blocks tennis during the same time slot.', 3),
  ('Tennis blocks basketball', 'A tennis booking blocks basketball during the same time slot.', 4),
  ('Arrive early', 'Please arrive 10 minutes before your slot to warm up and start on time.', 5),
  ('Cancel if you can''t attend', 'Cancel your booking in advance so the slot can be freed for other players.', 6),
  ('Respect court timing', 'Vacate the court promptly at the end of your slot.', 7),
  ('Proper shoes required', 'Non-marking court shoes are required at all times.', 8),
  ('No food inside the court', 'Food is not allowed on the playing surface. Water bottles are fine.', 9),
  ('Admin may cancel', 'Management may cancel bookings if needed for maintenance or events.', 10),
  ('Weather / outdoor policy', 'Outdoor sessions may be rescheduled in case of adverse weather. (Policy placeholder.)', 11);

insert into public.membership_packages (name, description, sport_type, is_coming_soon) values
  ('5-Session Tennis Package', 'Five tennis sessions at a discounted bundle rate.', 'tennis', true),
  ('10-Session Basketball Package', 'Ten basketball sessions for dedicated hoopers.', 'basketball', true),
  ('Monthly Court Membership', 'Priority access to the Main Court all month long.', 'all', true),
  ('Private Coaching Bundle', 'A bundle of private coaching sessions with our pros.', 'all', true);
