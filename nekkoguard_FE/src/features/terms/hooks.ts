import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryKeys';
import { termsApi } from '@/api/terms';

export function useTenantTerms(tenantId: string) {
  return useQuery({ queryKey: queryKeys.tenantTerms(tenantId), queryFn: ({ signal }) => termsApi.tenantTerms(tenantId, signal) });
}

export function useTermsVersions(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.termsVersions(tenantId),
    queryFn: ({ signal }) => termsApi.versions(tenantId, signal),
    enabled,
  });
}

/** After any change: drop every cached Terms query of the Tenant (and the pending list). */
export function useRefreshTerms(tenantId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tenantTerms(tenantId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.termsPending });
  };
}
