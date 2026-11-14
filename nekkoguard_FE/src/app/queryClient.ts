import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/api/errors';

const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retry only transient failures; a 4xx will not fix itself.
        retry: (failureCount, error) => {
          if (isApiError(error) && error.kind === 'http' && error.status !== null && error.status < 500) return false;
          return failureCount < MAX_RETRIES;
        },
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
