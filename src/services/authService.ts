import { supabase } from './supabaseClient';
import { User } from '@/models';

type Result = { ok: boolean; error?: string };
type SignUpResult = Result & { needsVerification?: boolean };

function mapProfile(row: {
  id: string;
  name: string;
  phone_or_email: string;
  is_admin: boolean;
}): User {
  return {
    id: row.id,
    name: row.name,
    phoneOrEmail: row.phone_or_email,
    isAdmin: !!row.is_admin,
  };
}

export const authService = {
  async getMfaStatus() {
    const [{ data: assurance, error: assuranceError }, { data: factors, error: factorsError }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    if (assuranceError) throw assuranceError;
    if (factorsError) throw factorsError;
    return {
      currentLevel: assurance.currentLevel,
      nextLevel: assurance.nextLevel,
      verifiedFactors: factors.totp.filter((factor) => factor.status === 'verified'),
      // The SDK's `totp` list is verified-only; unverified factors are in `all`.
      unverifiedFactors: (factors.all ?? []).filter((factor) => factor.factor_type === 'totp' && factor.status === 'unverified'),
    };
  },

  async enrollAdminTotp() {
    // Clear any half-finished (unverified) TOTP factor before enrolling. Supabase
    // rejects a second factor sharing the friendly name 'RizeON Admin', so an
    // admin who backgrounds the app mid-setup (e.g. to open their authenticator)
    // would otherwise be permanently unable to re-enroll — and, since /admin
    // hard-redirects here, permanently locked out of the console.
    const { data: existing, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) throw listError;
    // Unverified factors live in `all` (the `totp` list is verified-only).
    for (const factor of (existing?.all ?? []).filter((f) => f.factor_type === 'totp' && f.status === 'unverified')) {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) throw unenrollError;
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'RizeON Admin' });
    if (error) throw error;
    return data;
  },

  async verifyTotp(factorId: string, code: string): Promise<Result> {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) return { ok: false, error: challengeError.message };
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  /**
   * Create an auth account. When Supabase "Confirm email" is ON, no session is
   * returned yet — we return { needsVerification: true } and DEFER creating the
   * public.users profile row until the emailed 6-digit code is verified (the
   * RLS insert policy needs auth.uid(), which only exists once a session does).
   * When confirmation is OFF, a session comes back immediately, so we create the
   * profile right away.
   */
  async signUp(name: string, email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, error: error.message };
    if (!data.user) return { ok: false, error: 'Sign up failed — please try again.' };

    // A2: Supabase's anti-enumeration behavior returns a "fake" user with an
    // empty identities array (and no session) when the email is already
    // registered — no confirmation email is ever sent. Detect that and tell the
    // user to sign in, instead of routing them to an OTP screen for a code that
    // will never arrive.
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { ok: false, error: 'An account with this email already exists. Please sign in instead.' };
    }

    // Email confirmation on → verify the OTP first (see verifySignupCode).
    if (!data.session) return { ok: true, needsVerification: true };

    // Confirmation off → session already active, create the profile now.
    const res = await authService.ensureProfile(name, email);
    return res.ok ? { ok: true, needsVerification: false } : res;
  },

  /**
   * Insert the public.users profile row for the currently-signed-in user.
   * Idempotent: a duplicate (row already exists) is treated as success so it's
   * safe to call after re-verifying. Requires an active session.
   */
  async ensureProfile(name: string, email: string): Promise<Result> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return { ok: false, error: 'Your session expired — please sign up again.' };

    const { error } = await supabase.from('users').insert({
      id: uid,
      name: name.trim(),
      phone_or_email: email.trim(),
      // is_admin is deliberately NOT set here. The column defaults to false and a
      // BEFORE INSERT trigger (harden-security.sql) forces it false for any client
      // insert, so admin can only be granted server-side (service role / SQL
      // editor). Never trust a client-supplied admin flag.
    });
    if (error && !/duplicate|already exists/i.test(error.message)) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },

  /** Verify the 6-digit signup code, confirming the email and signing the user in. */
  async verifySignupCode(email: string, token: string): Promise<Result> {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'signup',
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  /** Re-send the signup confirmation code to the same email. */
  async resendSignupCode(email: string): Promise<Result> {
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async signIn(email: string, password: string): Promise<Result> {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },

  async deleteAccount(): Promise<Result> {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) return { ok: false, error: error.message };
    await supabase.auth.signOut();
    return { ok: true };
  },

  /** Send a password-reset email with a 6-digit code (needs SMTP configured). */
  async resetPassword(email: string): Promise<Result> {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  /** Verify the emailed recovery code, establishing a session to set a new password. */
  async verifyRecoveryCode(email: string, token: string): Promise<Result> {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'recovery',
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  /** Update the signed-in user's password (after recovery verification). */
  async updatePassword(password: string): Promise<Result> {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  /** Current signed-in user's profile, or null if not logged in. */
  async getCurrentUser(): Promise<User | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const uid = session.user.id;
    const email = session.user.email ?? '';
    const fallbackName = email.split('@')[0] || 'Player';

    const { data, error } = await supabase
      .from('users')
      .select('id, name, phone_or_email, is_admin')
      .eq('id', uid)
      .maybeSingle();

    if (data) return mapProfile(data);

    // A4: distinguish a real query failure (offline / RLS) from a genuinely
    // missing row. On error we must NOT fabricate a profile whose admin flag is
    // guessed from the email — that can wrongly show/hide admin UI. Return a
    // safe, non-admin fallback so the session survives without elevating access.
    if (error) {
      return { id: uid, name: fallbackName, phoneOrEmail: email, isAdmin: false };
    }

    // A1: session is valid but the profile row is missing — typically the
    // post-OTP profile insert failed, which strands the account (bookings FK to
    // public.users would fail). Self-heal by creating the row now so the account
    // becomes fully usable, then return the authoritative stored profile.
    const healed = await authService.ensureProfile(fallbackName, email);
    if (healed.ok) {
      const { data: created } = await supabase
        .from('users')
        .select('id, name, phone_or_email, is_admin')
        .eq('id', uid)
        .maybeSingle();
      if (created) return mapProfile(created);
    }

    // Couldn't create the row (e.g. transient failure) — minimal fallback so the
    // user isn't logged out; the next launch will retry the self-heal.
    // Never infer admin from a client-side string. Admin is a server grant only
    // (public.users.is_admin, re-checked by is_admin() in RLS); default to false
    // on this heal-failure path so we can't render admin UI we can't back up.
    return { id: uid, name: fallbackName, phoneOrEmail: email, isAdmin: false };
  },
};
