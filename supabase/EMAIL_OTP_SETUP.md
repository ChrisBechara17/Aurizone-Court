# Email OTP setup (signup + password reset)

The app verifies both **new signups** and **password resets** with a 6-digit code
emailed by Supabase (`verifyOtp`, not magic links — PKCE/WebCrypto isn't available
in Expo). To make this work you must configure the Supabase project once.

## 1. Configure SMTP (required to actually send email)

Supabase's built-in email is rate-limited to a few messages/hour and only sends to
project members — not usable for real users. Set up your own SMTP:

1. Dashboard → **Project Settings → Authentication → SMTP Settings**.
2. Enable **Custom SMTP** and fill in host / port / user / password / sender.
   Any provider works (Resend, SendGrid, Mailgun, Amazon SES, Gmail app-password…).
3. Save. Send yourself a test if the provider offers one.

## 2. Turn on email confirmation for signup

1. Dashboard → **Authentication → Providers → Email**.
2. Enable **Confirm email**.
   - With this ON, `supabase.auth.signUp()` returns **no session** — the app
     detects that (`needsVerification`) and routes to the OTP screen. The
     `public.users` profile row is created only **after** the code is verified
     (the RLS insert policy needs `auth.uid()`).
   - With it OFF, signup logs the user straight in (no OTP screen).

## 3. Make the emails send a CODE, not a link

By default the templates contain a confirmation **link**. Switch them to the token.

Dashboard → **Authentication → Email Templates**:

- **Confirm signup** → set the body to include the code:
  ```
  Your RizeON verification code is: {{ .Token }}
  ```
- **Reset password** → same:
  ```
  Your RizeON password reset code is: {{ .Token }}
  ```

`{{ .Token }}` is the 6-digit numeric OTP. You can keep the rest of the HTML;
just make sure the code is shown. (Leaving `{{ .ConfirmationURL }}` in as well is
fine, but users only need the code.)

## 4. (Optional) OTP length / expiry

Dashboard → **Authentication → Providers → Email** → the OTP expiry (default 3600s)
and length can be adjusted. The app assumes a **6-digit** code — keep length at 6.

---

## How the app uses it

| Step | Flow | Call |
|------|------|------|
| Send signup code | signup | `supabase.auth.signUp()` (email confirm on) |
| Verify signup code | signup | `verifyOtp({ type: 'signup' })` → then create profile |
| Resend signup code | signup | `auth.resend({ type: 'signup' })` |
| Send reset code | recovery | `resetPasswordForEmail()` |
| Verify reset code | recovery | `verifyOtp({ type: 'recovery' })` → set new password |

Screens: `app/auth.tsx` → `app/verify-otp.tsx` (shared, `flow=signup|recovery`) →
home (signup) or `app/reset-password.tsx` (recovery). See `services/authService.ts`.

> Reminder: after changing templates/SMTP, no app rebuild is needed — it's all
> server-side. If a code email never arrives, check the provider logs and the
> Supabase **Auth → Logs**.
