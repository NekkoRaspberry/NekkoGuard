import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { setMfaRequiredHandler } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';

/**
 * When a request is refused with 403 mfa_required (e.g. MFA turned off in another
 * tab), re-read the user and the Tenants: their effective permissions drop to the
 * Member rights and the administrative navigation disappears without a reload.
 */
export function MfaRequiredListener() {
  const queryClient = useQueryClient();
  useEffect(() => {
    setMfaRequiredHandler(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
    });
    return () => setMfaRequiredHandler(null);
  }, [queryClient]);
  return null;
}
