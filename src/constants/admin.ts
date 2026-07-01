// ---------------------------------------------------------------------------
// Demo admin gating. In this demo, admin is unlocked by logging in with one of
// the designated admin contacts below. THIS IS NOT SECURE — anyone who types
// the number becomes admin. In production, admin must be a real authenticated
// role (phone OTP / backend role check), never a matched string.
// ---------------------------------------------------------------------------

export const ADMIN_CONTACTS = ['admin@courthub.com', '0000000000', 'admin'];

/** Normalize a contact for comparison (lowercase, strip spaces/dashes/+). */
const normalize = (v: string) => v.trim().toLowerCase().replace(/[\s\-()+]/g, '');

export function isAdminContact(phoneOrEmail: string): boolean {
  const n = normalize(phoneOrEmail);
  return ADMIN_CONTACTS.some((c) => normalize(c) === n);
}
