import { useQuery } from '@tanstack/react-query';
import { fetchCurrentUser } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import { useAuth } from '@/features/auth/useAuth';
import { toCurrentUser } from '../userModel';

export function useCurrentUser() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: ({ signal }) => fetchCurrentUser(signal),
    select: toCurrentUser,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}
