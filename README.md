# RizeON

RizeON is a React Native application for booking and operating a shared sports
court. Players can reserve basketball or tennis sessions, book coaches, track
rewards, and receive booking notifications. Administrators get an MFA-protected
console for managing the venue, bookings, users, pricing, coaches, rules, and
operational health.

The app is built with Expo SDK 56 and uses Supabase for authentication,
Postgres data, realtime updates, Row Level Security, and trusted server-side
mutations.

## Core booking model

RizeON has one physical venue resource: the Main Court.

- Tennis always occupies the full court.
- Basketball can occupy the full court or one of two halves.
- A full-court reservation conflicts with every overlapping court reservation.
- Two half-court basketball reservations can coexist when they use different
  halves.
- Administrative court blocks occupy the full court.
- Coach conflicts and court conflicts are evaluated independently.
- Peak pricing applies to bookings beginning at or after 4 PM in the
  `Asia/Beirut` venue timezone.

Client-side checks provide immediate feedback, while PostgreSQL constraints,
RLS policies, and transactional RPCs remain authoritative.

## Features

### Player experience

- Email/password registration, OTP email verification, login, and password
  recovery
- Full- and half-court basketball booking
- Tennis booking with an optional ball-machine add-on
- Weekly recurring reservations with unavailable occurrences reported
- Coach browsing and coach-session bookings
- Live availability timeline and realtime booking updates
- Upcoming, completed, and cancelled booking history
- Cancellation rules, account-standing enforcement, and no-show tracking
- Loyalty points, tiers, transaction history, and free-session rewards
- In-app notifications and push/reminder support
- Dark and light themes
- Venue directions, rules, memberships, support, and account deletion

### Admin console

- TOTP MFA with an `aal2` requirement on every admin route
- Operational overview, schedules, bookings, and revenue summaries
- Booking creation, rescheduling, cancellation, completion, and no-show actions
- User roster, account history, and direct notifications
- Court blocks and weekly operating-hours management
- Off-peak and peak pricing management
- Coach, court-rule, loyalty, reward-perk, and support-phone management
- CSV exports, audit history, schema health, and security-event visibility

## Technology

- Expo SDK 56, React Native 0.85, React 19, and TypeScript
- Expo Router with protected routes and bottom tabs
- Zustand for application state
- Supabase Auth, Postgres, Realtime, RLS, RPCs, and Edge Functions
- AsyncStorage for local preferences and Supabase session persistence
- NativeWind and reusable themed React Native components
- React Hook Form and Zod
- date-fns and date-fns-tz
- Expo Notifications and server-scheduled booking reminders
- Sentry crash reporting

## Repository layout

```text
assets/                     App icons, splash assets, logos, and tab images
docs/                       Static privacy, support, and account-deletion site
scripts/                    Local development and verification utilities
src/
  app/                      Expo Router screens and layouts
    (tabs)/                 Home, Book, Coaches, My Bookings, and Profile
    admin*.tsx              Admin console and focused admin workflows
  components/               Shared booking, navigation, form, and UI components
  constants/                Theme, pricing, venue, and admin defaults
  hooks/                    Realtime, MFA, and navigation hooks
  models/                   Domain types
  services/                 Auth, Supabase, booking, notification, and storage APIs
  store/                    Central Zustand state and application actions
  utils/                    Date, conflict, loyalty, CSV, and standing logic
supabase/
  functions/                Trusted booking, admin, token, and reminder functions
  *.sql                     Schema, policy, migration, and hardening scripts
```

## Local setup

### Requirements

- Node.js 20.19 or newer
- npm
- Expo Go for basic UI testing, or an Expo development build for native push
  notification testing
- A configured Supabase project

### Install and run

```powershell
git clone https://github.com/ChrisBechara17/Aurizone-Court.git
cd Aurizone-Court
npm install
Copy-Item .env.example .env
npx.cmd expo start
```

Use `npm.cmd run android`, `npm.cmd run ios`, or `npm.cmd run web` when the corresponding
local platform tooling is available. On Windows, `npm.cmd` and `npx.cmd` avoid
PowerShell execution-policy issues with the `.ps1` shims.

### Environment variables

Populate `.env` with:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
EXPO_PUBLIC_SECURE_WRITES=false
EXPO_PUBLIC_SENTRY_DSN=
```

Only the Supabase anonymous/public key belongs in the mobile app. Never place a
service-role key, reminder job secret, or security hash salt in an
`EXPO_PUBLIC_` variable or commit it to this repository.

`EXPO_PUBLIC_SECURE_WRITES` must remain `false` until the security foundation
and Edge Functions are deployed and tested. Production releases should use
secure writes and the locked-down database policies.

## Supabase setup

Database scripts have an intentional dependency order. For a new project or an
existing-project upgrade, follow
[`supabase/README_RUN_ORDER.md`](supabase/README_RUN_ORDER.md) exactly. The final
peak-pricing migration must remain last because it installs the authoritative
version of the server-side pricing function.

The production security rollout is staged:

1. Back up the existing project.
2. Apply the security foundation migrations.
3. Configure server-only Supabase secrets.
4. Deploy and smoke-test all trusted Edge Functions.
5. Enable `EXPO_PUBLIC_SECURE_WRITES=true` in a development build.
6. Verify every player and admin mutation.
7. Apply `security-lockdown.sql` only after those checks pass.

See [`supabase/SECURITY_DEPLOYMENT.md`](supabase/SECURITY_DEPLOYMENT.md) for the
full procedure and
[`supabase/BOOKING_REMINDERS_DEPLOYMENT.md`](supabase/BOOKING_REMINDERS_DEPLOYMENT.md)
for the scheduled reminder worker.

## Validation

Run the local quality gates before committing:

```powershell
npm.cmd run check
npx.cmd expo install --check
```

The public-error verification keeps static SQL exceptions aligned with the
sanitized error-code allowlist returned by Edge Functions.

## Builds and release preparation

EAS profiles are defined in `eas.json` for development, preview, and production
builds. A development build is required to validate push notifications and
other native behavior that Expo Go does not support.

```powershell
eas build --profile development --platform android
npx.cmd expo start --dev-client
```

Before shipping, work through [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md),
including database backups, admin and player smoke tests, secure-write checks,
push verification, visual checks, and TypeScript validation.

## Current scope

The app does not process payments. Prices and rewards are calculated and
enforced for booking operations, but checkout and payment settlement are not
implemented. Membership packages are currently presented as coming soon.

## License

See [`LICENSE`](LICENSE).
