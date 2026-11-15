import { useQuery } from '@tanstack/react-query';
import { helpApi } from '@/api/help';
import { queryKeys } from '@/api/queryKeys';

/** Help content changes only with a deployment: cache it for the session. */
const STATIC_CONTENT = { staleTime: Infinity, gcTime: 60 * 60 * 1000 } as const;

export function useReleases() {
  return useQuery({ queryKey: queryKeys.helpReleases, queryFn: ({ signal }) => helpApi.releases(signal), ...STATIC_CONTENT });
}
