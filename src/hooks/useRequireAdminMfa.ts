import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { authService } from '@/services/authService';
import { useAppStore } from '@/store/useAppStore';

/**
 * Gate every admin screen behind AAL2 (verified TOTP), including deep links.
 *
 * Redirects to /admin-mfa until MFA is confirmed. Returns false meanwhile so the
 * caller can render nothing. Callers should still keep their own
 * `if (!user?.isAdmin)` redirect for the non-admin case.
 */
export function useRequireAdminMfa(): boolean {
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.isAdmin) return;

    let active = true;
    authService.getMfaStatus()
      .then((status) => {
        if (!active) return;
        if (status.currentLevel === 'aal2') setVerifiedUserId(user.id);
        else router.replace('/admin-mfa');
      })
      .catch(() => {
        if (active) router.replace('/admin-mfa');
      });
    return () => {
      active = false;
      setVerifiedUserId((current) => (current === user.id ? null : current));
    };
  }, [router, user?.id, user?.isAdmin]);

  return !!user?.isAdmin && verifiedUserId === user.id;
}
