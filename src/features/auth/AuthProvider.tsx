import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { allauth } from '@/api/allauth';
import { setSessionLostHandler } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { SessionEnvelope } from '@/api/types';
import { AuthContext, type AuthContextValue, type SignOutReason } from './AuthContext';
import { AuthBootScreen } from './components/AuthBootScreen';

/** Drop every cached query that belongs to a user; keep auth/config state. */
function clearUserData(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [lastSignOutReason, setLastSignOutReason] = useState<SignOutReason | null>(null);

  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: allauth.getSession,
    staleTime: 60_000,
    // Re-check when the user comes back to the tab: catches sessions that expired meanwhile.
    refetchOnWindowFocus: true,
  });

  const applySession = useCallback(
    (envelope: SessionEnvelope) => {
      const previous = queryClient.getQueryData<SessionEnvelope>(queryKeys.session);
      const previousUserId = previous?.status === 200 ? previous.data?.user?.id : undefined;
      const nextUserId = envelope.status === 200 ? envelope.data?.user?.id : undefined;
      if (previousUserId !== nextUserId) clearUserData(queryClient);
      if (envelope.status === 200) setLastSignOutReason(null);
      queryClient.setQueryData(queryKeys.session, envelope);
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      applySession(await allauth.logout());
    } catch {
      // Even if the server is unreachable, forget the local state; the next check re-syncs.
      queryClient.setQueryData<SessionEnvelope>(queryKeys.session, { status: 401, data: { flows: [] }, meta: { is_authenticated: false } });
      clearUserData(queryClient);
    }
    setLastSignOutReason('user');
  }, [applySession, queryClient]);

  // Any API call that finds the session gone triggers a fresh session check.
  useEffect(() => {
    setSessionLostHandler(() => {
      const current = queryClient.getQueryData<SessionEnvelope>(queryKeys.session);
      if (current?.status === 200) setLastSignOutReason('expired');
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    });
    return () => setSessionLostHandler(null);
  }, [queryClient]);

  const envelope = sessionQuery.data;

  const value = useMemo<AuthContextValue>(() => {
    const authenticated = envelope?.status === 200 && Boolean(envelope.data?.user);
    const flows = envelope?.data?.flows ?? [];
    return {
      status: authenticated ? 'authenticated' : 'unauthenticated',
      isAuthenticated: authenticated,
      user: authenticated ? (envelope?.data?.user ?? null) : null,
      flows,
      pendingFlow: flows.find((flow) => flow.is_pending)?.id ?? null,
      lastSignOutReason,
      applySession,
      signOut,
    };
  }, [envelope, lastSignOutReason, applySession, signOut]);

  // First load: nothing can be routed until we know whether a session exists.
  if (!envelope) {
    return (
      <AuthBootScreen
        error={sessionQuery.isError ? sessionQuery.error : null}
        retrying={sessionQuery.isFetching}
        onRetry={() => void sessionQuery.refetch()}
      />
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
