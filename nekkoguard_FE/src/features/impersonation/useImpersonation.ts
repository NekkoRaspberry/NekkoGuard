import { useMutation, useQuery } from '@tanstack/react-query';
import { impersonationApi } from '@/api/impersonation';
import { queryKeys } from '@/api/queryKeys';
import { ROUTES } from '@/app/routes';

/** Is "view as user" available (superusers) and active? */
export function useImpersonation() {
  return useQuery({
    queryKey: queryKeys.impersonation,
    queryFn: ({ signal }) => impersonationApi.status(signal),
    staleTime: 60_000,
  });
}

/**
 * Starting or stopping reloads the app from the overview: every cached tenant,
 * organization, permission and appearance belongs to the previous identity, and the
 * context is then resolved from scratch by the normal access rules.
 */
function restart() {
  window.location.assign(ROUTES.overview);
}

export function useStartImpersonation() {
  return useMutation({ mutationFn: (userId: number) => impersonationApi.start(userId), onSuccess: restart });
}

export function useStopImpersonation() {
  return useMutation({ mutationFn: () => impersonationApi.stop(), onSuccess: restart });
}
