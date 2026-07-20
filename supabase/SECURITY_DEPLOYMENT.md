# Trusted Security Boundary Deployment

The security boundary is deliberately staged. Do not run `security-lockdown.sql`
until the release app has completed every write workflow through Edge Functions.

## 1. Backup

Follow `BACKUP_RECOVERY.md`. Verify that the exported bookings, users, settings,
loyalty, notifications, and audit files open and contain current rows.

## 2. Apply the foundation

Run `security-boundary.sql` in the Supabase SQL editor. This creates security
events, rate-limit state, the limiter RPC, and booking immutability protection.
It leaves legacy application writes enabled for compatibility testing.

## 3. Set server secrets

Set these in Supabase Dashboard > Edge Functions > Secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SECURITY_HASH_SALT` (a long random value used only to hash network identifiers)

Never put the service-role key or hash salt in `.env`, Expo variables, source
control, screenshots, or client logs.

## 4. Deploy functions

With the Supabase CLI linked to the production project, deploy:

```powershell
supabase functions deploy booking-create
supabase functions deploy admin-bookings
supabase functions deploy admin-management
supabase functions deploy admin-notifications
supabase functions deploy device-token
```

JWT verification remains enabled. The functions additionally resolve the Auth
user and profile themselves. Admin functions require an `aal2` JWT.

## 5. Enable secure writes in a development build

Set `EXPO_PUBLIC_SECURE_WRITES=true`, restart Metro with a cleared cache, and use
a development build rather than Expo Go for the final push test. Test every
booking, admin, notification, coach, rule, pricing, and device-token action.

Admin accounts are routed through TOTP enrollment/challenge before the console.
For a lost authenticator, use Supabase Dashboard > Authentication > Users to
remove the admin's TOTP factor, then enroll a new factor at next sign-in. Limit
dashboard access to the smallest possible set of trusted operators.

## 6. Lock down legacy writes

After the complete smoke test passes, run `security-lockdown.sql`. Then verify a
direct REST insert/update with an authenticated user token fails while the same
operation through its Edge Function succeeds.

After applying `anonymous-reference-lockdown.sql`, verify the reference-table
contract directly. Set local shell variables to the project URL, anon key, and a
short-lived JWT from a signed-in non-admin test account; do not commit them.

```powershell
$table = 'coaches'
curl.exe -i "$env:SUPABASE_URL/rest/v1/$table?select=id&limit=1" `
  -H "apikey: $env:SUPABASE_ANON_KEY"

curl.exe -i "$env:SUPABASE_URL/rest/v1/$table?select=id&limit=1" `
  -H "apikey: $env:SUPABASE_ANON_KEY" `
  -H "Authorization: Bearer $env:TEST_USER_JWT"
```

The anonymous request must return `401` or `403`; the authenticated request must
return `200`. Repeat with `court_blocks`, `app_settings`, `app_config`, and
`operating_hours`.

## Rollback

If secure writes fail before lock-down, set `EXPO_PUBLIC_SECURE_WRITES=false` and
restart the app. If lock-down has already run, restore the previous policies from
the source-controlled SQL files (`policies.sql`, `pricing.sql`,
`business-controls.sql`, `operations-upgrades.sql`, and `push-readiness.sql`).
Do not weaken production policies ad hoc; restore the known files and record the
incident.

## Rotation and monitoring

- Rotate the service-role key immediately if it is exposed.
- Rotate `SECURITY_HASH_SALT` during a planned deployment; old hashes need not be
  reversible.
- Review Admin Health and recent `security_events` after releases.
- Remove rate-limit rows older than 30 days by scheduling
  `select public.cleanup_security_rate_limits();` with Supabase Cron, or running
  it manually each month with a privileged database role.

## Server booking reminders

After secure writes are active, deploy the cancellation-safe scheduled reminder
worker using [BOOKING_REMINDERS_DEPLOYMENT.md](BOOKING_REMINDERS_DEPLOYMENT.md).
