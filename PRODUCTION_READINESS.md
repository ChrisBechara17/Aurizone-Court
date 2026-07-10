# RizeON Production Readiness Checklist

Use this before moving from Expo Go testing to real development/production builds. This is documentation only.

## 1. Local Android Tooling

Install Android Studio and the Android SDK before building native Android apps.

1. Install Android Studio.
2. Open Android Studio once and install:
   - Android SDK
   - Android SDK Platform Tools
   - Android Emulator, optional but useful
3. Confirm the SDK path, usually:

```text
C:\Users\marky\AppData\Local\Android\Sdk
```

4. Set `ANDROID_HOME` to that path.
5. Add these to `PATH`:

```text
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

6. Restart the terminal and check:

```powershell
adb devices
```

The earlier warning `Failed to resolve the Android SDK path` means this setup is missing or Windows does not know where the SDK is.

## 2. Expo / EAS Setup

Expo Go is fine for quick testing, but push notifications and native behavior should be tested in a development build.

1. Install or update EAS CLI:

```powershell
npm install -g eas-cli
```

2. Log in:

```powershell
eas login
```

3. Configure the project:

```powershell
eas build:configure
```

4. Confirm the project has an EAS project id. Push registration uses this id in supported builds.

## 3. Environment Variables

Confirm `.env` has the real Supabase values:

```text
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Do not put service-role keys in the mobile app. Mobile clients should only use the anon key with RLS.

## 4. Supabase Database

Run the SQL files in `supabase/README_RUN_ORDER.md`.

Before release, confirm Admin -> System -> Health shows:

- Supabase data loaded
- operating hours loaded
- audit logs available
- notifications available
- migration status tracked
- push support status visible

Also run:

```sql
select *
from public.schema_migrations
order by applied_at desc;
```

## 5. Development Build

Create a development build for Android:

```powershell
eas build --profile development --platform android
```

Install it on the test phone, then run:

```powershell
npx.cmd expo start --dev-client
```

Open the app using the development build, not Expo Go.

## 6. Push Notification Test

Push is expected to be disabled in Expo Go. Test it in a development or production build.

Checklist:

1. Sign in as a normal user.
2. Accept notification permission.
3. Go to Admin -> System -> Health and confirm push status is not only `Expo Go fallback`.
4. As admin, trigger an in-app notification action:
   - cancel a booking
   - mark no-show
   - mark completed
   - create a coaching session
5. Confirm the in-app notification appears.
6. Confirm the phone receives a push notification when supported.

If push fails, in-app notifications remain the source of truth.

## 7. Visual Launch Pass

Check these before release:

- app icon
- adaptive Android icon
- splash screen
- dark theme readability
- button text on small phones
- admin bottom navigation grouping
- booking cards
- profile delete-account modal

## 8. Admin Smoke Test

As admin:

1. Refresh Admin.
2. Create and remove a court block.
3. Create a coaching session.
4. Reschedule a booking.
5. Cancel a booking with reason.
6. Mark a past booking completed.
7. Mark a past booking no-show with reason.
8. Update pricing and loyalty settings.
9. Update tier reward text.
10. Export bookings/users/revenue/no-shows CSV.
11. Inspect Audit and Health.

## 9. User Smoke Test

As a normal user:

1. Sign up or sign in.
2. Book basketball.
3. Book tennis.
4. Try a conflicting slot and confirm it is blocked.
5. Open My Bookings.
6. Tap a booking and confirm the receipt screen opens.
7. Open Notifications and mark read.
8. Open Loyalty and confirm transaction history.
9. Try delete-account flow but cancel before final delete unless using a test account.

## 10. Final Release Gate

Before sharing a production build:

1. Run:

```powershell
npx.cmd tsc --noEmit
```

2. Confirm no TypeScript errors.
3. Confirm Supabase backups exist.
4. Confirm the latest SQL changes are applied.
5. Confirm the app is using production Supabase credentials.
6. Confirm no test users or test bookings should be removed.

## Deferred Items

These are intentionally not part of this checklist:

- payments
- coach availability
- holiday hours
- rate limiting / abuse protection
- admin roles
- waitlist
- staff/customer notes
