import { useQuery } from '@tanstack/react-query';
import { fetchCurrentUser } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';

export interface ApiHealth {
  latencyMs: number;
  checkedAt: number;
}

/**
 * Measures REST API round-trip time with the cheapest authenticated call the backend
 * offers (`GET /api/users/me/`). Polls once a minute only while a consumer is mounted.
 */
export function useApiHealth() {
  return useQuery({
    queryKey: queryKeys.apiHealth,
    queryFn: async ({ signal }): Promise<ApiHealth> => {
      const started = performance.now();
      await fetchCurrentUser(signal);
      return { latencyMs: performance.now() - started, checkedAt: Date.now() };
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 0,
  });
}
