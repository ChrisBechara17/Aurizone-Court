# RizeON Supabase Backup / Recovery Checklist

This is an operational checklist for protecting live RizeON data. It does not add app behavior or automate backups.

## Critical Data

Protect these tables first:

- `auth.users` and `public.users`: login identities and profiles
- `public.bookings`: court bookings, coaching sessions, status, prices, reasons
- `public.coaches`: coach list and contact data
- `public.sport_prices`, `public.app_settings`, `public.app_config`: pricing, loyalty, support phone, tier reward text
- `public.court_blocks`, `public.operating_hours`, `public.court_rules`: operating controls
- `public.admin_audit_logs`: admin action history
- `public.loyalty_transactions`: explainable loyalty point history
- `public.user_notifications`, `public.push_tokens`: user notification history and registered devices
- `public.schema_migrations`: applied SQL upgrade tracking

## Backup Frequency

- During active setup or before running SQL changes: export before every change.
- During normal operations: export at least once per week.
- Before launch events, pricing changes, or bulk admin work: export immediately before and after.
- Keep at least the latest 4 weekly backups plus any pre-launch backups.

## Manual Export From Supabase

Use this when you want a human-readable backup before a risky change.

1. Open Supabase Dashboard.
2. Select the project.
3. Go to Table Editor.
4. For each critical table, use Export/Download CSV where available.
5. Save files in a dated folder, for example:

```text
backups/2026-07-10-pre-harden-security/
```

6. Name files clearly:

```text
users.csv
bookings.csv
coaches.csv
app_settings.csv
app_config.csv
loyalty_transactions.csv
admin_audit_logs.csv
```

Do not store backups publicly. These files may contain private user and booking data.

## SQL Snapshot Checks

After exporting, verify basic counts in Supabase SQL Editor:

```sql
select 'users' as table_name, count(*) from public.users
union all select 'bookings', count(*) from public.bookings
union all select 'coaches', count(*) from public.coaches
union all select 'loyalty_transactions', count(*) from public.loyalty_transactions
union all select 'admin_audit_logs', count(*) from public.admin_audit_logs
union all select 'user_notifications', count(*) from public.user_notifications;
```

Write the counts next to the backup folder name or in a small `README.txt` inside the backup folder.

## Verify A Backup Is Usable

Before trusting a backup:

1. Open each CSV and confirm it has headers.
2. Confirm `bookings.csv` includes `id`, `user_id`, `start_time`, `end_time`, `status`, and `total_price`.
3. Confirm `users.csv` includes `id`, `name`, `phone_or_email`, and `is_admin`.
4. Confirm row counts roughly match the SQL count check.
5. Confirm the backup folder date and reason are clear.

## Recovery After Bad SQL

If a SQL file creates bad behavior but data still exists:

1. Stop making more admin changes.
2. Screenshot or copy the exact Supabase error.
3. Re-run the last known-good SQL file if it is idempotent and was intended to replace functions/triggers.
4. Check Admin -> System -> Health.
5. Run a small smoke test: create a booking, cancel/complete a test booking, inspect audit logs.

## Recovery After Accidental Data Deletion

If rows were deleted:

1. Stop using the app immediately.
2. Export the current damaged state before making repairs.
3. Identify which table lost rows.
4. Restore only the missing rows if possible, not the whole database.
5. Re-check relationships:
   - bookings must reference existing users
   - coach bookings must reference existing coaches
   - loyalty transactions should reference existing users and, when possible, bookings
6. After restore, refresh the app and run the smoke test below.

## Smoke Test After Recovery

1. Sign in as a normal user.
2. Confirm profile loads.
3. Confirm `My Bookings` loads.
4. Create a future court booking.
5. Sign in as admin.
6. Confirm Admin Overview, Bookings, Audit, Health load.
7. Cancel or complete the test booking.
8. Confirm audit log and notification are created.

## Later Automation

For a real production launch, replace this manual process with managed Supabase backups or scheduled database dumps. Keep this document as the emergency human checklist.
