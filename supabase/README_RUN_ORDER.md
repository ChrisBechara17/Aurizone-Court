# Supabase SQL Run Order

Run these files in the Supabase SQL editor in this order for a fresh project.
Most files are idempotent and safe to rerun, but keep the order because later
files depend on tables/functions from earlier files.

Before risky SQL changes, use `BACKUP_RECOVERY.md` to export and verify a backup.

## Fresh Setup

1. `schema.sql`
   - Creates the base tables, enums, seed court, seed coaches, rules, and membership placeholders.

2. `policies.sql`
   - Enables RLS and creates user/admin policies.
   - Adds `public.is_admin()`.
   - Adds `public.delete_own_account()`.

3. `schema-migrations.sql`
   - Adds database migration tracking for Admin Health.

4. `pricing.sql`
   - Creates `app_settings`.
   - Adds base court/ball-machine/loyalty numeric settings.
   - Adds server-side booking price calculation (base version).
   - Adds free-reward balance logic.

5. `conflict-guard.sql`
   - Installs `btree_gist` (needed by the next step's side-aware constraint).
   - Adds database-level overlap protection for court bookings.
   - Adds coach-vs-coach overlap protection.

6. `half-court.sql`
   - Adds half-court basketball support (side_range + side-aware overlap
     constraint that replaces conflict-guard's base one).
   - Adds half-court pricing settings.
   - Must run AFTER conflict-guard.sql (`btree_gist` and the base constraint it
     replaces) and pricing.sql.

7. `privacy-view.sql`
   - Adds the time-only court occupancy view used by the app for
     availability/conflicts. Runs AFTER half-court.sql so this occupancy
     definition (with the completed-today window) is the authoritative one.

8. `app-config.sql`
   - Adds text-based app config such as support phone and tier reward text.

9. `business-controls.sql`
   - Adds admin-controlled weekly operating hours.

10. `operations-upgrades.sql`
    - Adds admin audit logs.
    - Adds in-app notifications.
    - Adds booking lifecycle reason fields.
    - Adds loyalty transaction history and backfill.

11. `push-readiness.sql`
    - Adds push token storage for supported development/production builds.

12. `harden-booking-integrity.sql`
    - Adds extra booking integrity checks against invalid/tampered inserts.

13. `harden-security.sql`
    - Adds final security triggers.
    - Blocks self-admin promotion.
    - Prevents non-admin booking lifecycle/loyalty abuse.
    - Revokes anonymous access to `court_occupancy`.

14. `security-boundary.sql`
    - Adds security events, server-only rate limiting, strict booking immutability,
      and the trusted Edge Function foundation.
    - Deploy the functions and follow `SECURITY_DEPLOYMENT.md` after this step.

15. `security-lockdown.sql` (final production step only)
    - Revokes legacy direct writes after secure-write testing passes.
    - Do not run during initial setup or before Edge Functions are deployed.

16. `post-lockdown-integrity.sql`
    - Corrects paid-only free rewards and installs transactional service-role RPCs.
    - Deploy the updated Edge Functions immediately after applying it.

17. `venue-location.sql`
    - Adds the public RizeON name, short location, and Maps destination.

18. `anonymous-reference-lockdown.sql`
    - Intentionally removes anonymous REST reads from coaches, court blocks,
      settings, configuration, and operating hours.
    - Authenticated reads are unchanged. Run the REST checks in
      `SECURITY_DEPLOYMENT.md` after applying it.

19. `peak-pricing.sql` (MUST be last)
    - Adds peak-price support for bookings starting from 4 PM Asia/Beirut.
    - Redefines `compute_booking_price()` as the single authoritative version,
      folding in peak selection, the half-court rate, span-based hours, and the
      free-reward ledger check. It MUST run after `pricing.sql` and
      `half-court.sql`, which both define an earlier (non-peak) copy of that
      function — running it any earlier lets one of those copies win and silently
      disables peak pricing.

## After Existing Project Updates

If the database already exists and you are applying the newest app changes, run:

1. `business-controls.sql`
2. `operations-upgrades.sql`
3. `schema-migrations.sql`
4. `push-readiness.sql`
5. `harden-booking-integrity.sql`
6. `harden-security.sql`
7. `security-boundary.sql`

Deploy and test Edge Functions next. Run `security-lockdown.sql` only after the
full secure-write smoke test described in `SECURITY_DEPLOYMENT.md` passes.
For an already locked project, run `post-lockdown-integrity.sql` next and then
redeploy all secure mutation Edge Functions. Run `venue-location.sql` afterward
to publish the RizeON Maps destination, then run
`anonymous-reference-lockdown.sql` to apply the intentional anonymous API
change.

Finally, re-run `peak-pricing.sql` LAST so the authoritative peak-aware
`compute_booking_price()` is the version installed — any run that applies
`pricing.sql` or `half-court.sql` reinstalls a non-peak copy and must be
followed by `peak-pricing.sql`.

Run `harden-security.sql` after `operations-upgrades.sql` because it references
columns that file creates. `peak-pricing.sql` is the only file that must run
strictly last of all.

## Email OTP

`EMAIL_OTP_SETUP.md` is not SQL. Use it as a manual checklist for Supabase Auth
email/OTP settings.

## Quick Smoke Test

After running SQL:

1. Sign in as a normal user.
2. Book a valid future court slot.
3. Confirm the booking appears in `My Bookings`.
4. Sign in as admin.
5. Open `Admin Dashboard`.
6. Check `Overview`, `Bookings`, `Schedule`, `Pricing`, `Users`, and `Audit`.
7. Cancel or complete a test booking and confirm:
   - Audit log entry appears.
   - User notification appears.
   - Loyalty points/history update.
