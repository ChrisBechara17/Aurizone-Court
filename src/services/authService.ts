import { supabase } from './supabaseClient';
import { isAdminContact } from '@/constants/admin';
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
      // Demo convenience: admin contacts become admins. In production this
      // should be enforced by a trigger, not set by the client.
      is_admin: isAdminContact(email) || isAdminContact(name),
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
    return { id: uid, name: fallbackName, phoneOrEmail: email, isAdmin: isAdminContact(email) };
  },
};
