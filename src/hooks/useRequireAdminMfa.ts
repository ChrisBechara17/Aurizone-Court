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
export type AdminMfaGateState = 'checking' | 'verified' | 'redirecting';

const MFA_STATUS_TIMEOUT_MS = 10_000;

export function useRequireAdminMfa(): AdminMfaGateState {
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const [state, setState] = useState<AdminMfaGateState>('checking');

  useEffect(() => {
    if (!user?.isAdmin) return;

    let active = true;
    const checkingId = setTimeout(() => {
      if (active) setState('checking');
    }, 0);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Admin verification timed out.')), MFA_STATUS_TIMEOUT_MS);
    });
    Promise.race([authService.getMfaStatus(), timeout])
      .then((status) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!active) return;
        if (status.currentLevel === 'aal2') setState('verified');
        else {
          setState('redirecting');
          router.replace('/admin-mfa');
        }
      })
      .catch(() => {
        if (timeoutId) clearTimeout(timeoutId);
        if (active) {
          setState('redirecting');
          router.replace('/admin-mfa');
        }
      });
    return () => {
      active = false;
      clearTimeout(checkingId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [router, user?.id, user?.isAdmin]);

  return state;
}
