import { useQuery } from '@tanstack/react-query';
import { allauth } from '@/api/allauth';
import { queryKeys } from '@/api/queryKeys';

/** Server-side auth configuration (e.g. whether sign-up is open). Rarely changes. */
export function useAuthConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: allauth.getConfig,
    select: (envelope) => envelope.data ?? null,
    staleTime: 10 * 60_000,
  });
}
