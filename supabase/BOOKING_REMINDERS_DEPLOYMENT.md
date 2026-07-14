# Server Booking Reminders

This replaces device-local one-hour alarms with a scheduled server check. A
cancelled or rescheduled booking is no longer eligible when the reminder job
runs, so the original reminder is not sent.

## 1. Apply the database migration

Run `server-booking-reminders.sql` in the Supabase SQL editor after the current
production migrations. This creates the reminder delivery ledger and adds the
per-device reminder preference to `push_tokens`.

## 2. Create the job secret

Generate a long random value and keep it private:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$secret = [Convert]::ToBase64String($bytes)
$secret
```

Set it as an Edge Function secret:

```powershell
npx.cmd supabase secrets set REMINDER_JOB_SECRET="$secret"
```

In the Supabase SQL editor, store the same value and the project URL in Vault.
Replace the placeholders before running this block:

```sql
select vault.create_secret(
  'PASTE_THE_RANDOM_SECRET',
  'booking_reminder_job_secret',
  'Authorizes the booking reminder cron job'
);

select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'project_url',
  'Supabase project URL used by scheduled functions'
);
```

If either Vault name already exists, update that secret in Dashboard > Project
Settings > Vault instead of creating a duplicate.

## 3. Deploy the functions

The scheduled function uses its own secret header, so deploy it without normal
user-JWT verification. The function still rejects requests without the secret.

```powershell
npx.cmd supabase functions deploy device-token
npx.cmd supabase functions deploy booking-reminders --no-verify-jwt
```

## 4. Schedule the reminder job

Enable the `pg_cron`, `pg_net`, and `vault` extensions in Dashboard > Database >
Extensions. Then run:

```sql
select cron.schedule(
  'send-booking-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'project_url'
    ) || '/functions/v1/booking-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-job-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'booking_reminder_job_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
```

If the job name already exists, remove it first with
`select cron.unschedule('send-booking-reminders');`, then schedule it again.

## 5. Verify

1. Create a booking more than one hour ahead on a device with push enabled.
2. Cancel it before the one-hour window and verify no reminder is delivered.
3. Create another booking and leave it confirmed.
4. When it enters the 45-to-60-minute window, inspect Function logs for
   `booking-reminders` and query:

```sql
select booking_id, booking_start_time, status, attempts, sent_at, last_error
from public.booking_reminder_deliveries
order by created_at desc
limit 20;
```

The next secure-write app launch removes legacy local alarms left by older
builds. Users who never open the updated app may still have an old operating
system alarm, so test accounts should open the new build once before the final
reminder test.
