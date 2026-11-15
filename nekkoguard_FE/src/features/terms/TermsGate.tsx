import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { setTermsRequiredHandler } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { termsApi } from '@/api/terms';
import { AuthBootScreen } from '@/features/auth/components/AuthBootScreen';
import { TermsAcceptanceScreen } from './components/TermsAcceptanceScreen';

/**
 * Nothing of the signed-in app renders until the user has accepted the current Terms
 * of every Tenant they belong to. The backend is the authority: it refuses API calls
 * while acceptance is pending (403 terms_acceptance_required), and any such refusal —
 * in any tab, e.g. right after an administrator publishes a new version — brings this
 * screen back. Refreshing or opening a URL directly cannot get around it.
 */
export function TermsGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const pending = useQuery({
    queryKey: queryKeys.termsPending,
    queryFn: ({ signal }) => termsApi.pending(signal),
    // Re-checked when the tab regains focus (another tab may have accepted or declined).
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    setTermsRequiredHandler(() => void queryClient.invalidateQueries({ queryKey: queryKeys.termsPending }));
    return () => setTermsRequiredHandler(null);
  }, [queryClient]);

  if (pending.isPending || (pending.isError && !pending.data)) {
    return <AuthBootScreen error={pending.error} retrying={pending.isFetching} onRetry={() => void pending.refetch()} />;
  }
  const [next] = pending.data;
  if (next) return <TermsAcceptanceScreen version={next} position={1} total={pending.data.length} />;
  return <>{children}</>;
}
