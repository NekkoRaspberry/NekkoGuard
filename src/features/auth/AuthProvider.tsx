import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setUnauthorizedHandler } from '@/api/client';
import { fetchCurrentUser, obtainAuthToken } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { AuthContext, type AuthContextValue, type SignInInput, type SignOutReason } from './AuthContext';
import { tokenStorage, type StoredSession } from './tokenStorage';

function toPublicSession(stored: StoredSession | null): AuthContextValue['session'] {
  if (!stored) return null;
  return { email: stored.email, persistence: stored.persistence };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(() => toPublicSession(tokenStorage.read()));
  const [lastSignOutReason, setLastSignOutReason] = useState<SignOutReason | null>(null);

  const signOut = useCallback(
    (reason: SignOutReason = 'user') => {
      tokenStorage.clear();
      queryClient.clear();
      setSession(null);
      setLastSignOutReason(reason);
    },
    [queryClient],
  );

  // Any request rejected with an auth failure signs the user out.
  useEffect(() => {
    setUnauthorizedHandler(() => signOut('expired'));
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // Keep tabs in sync: signing out in one tab signs out the others (localStorage only fires cross-tab).
  useEffect(() => {
    const onStorage = () => {
      const stored = tokenStorage.read();
      if (!stored) {
        queryClient.clear();
        setSession(null);
      } else {
        setSession(toPublicSession(stored));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [queryClient]);

  const signIn = useCallback(
    async ({ email, password, remember }: SignInInput) => {
      const normalisedEmail = email.trim();
      const { token } = await obtainAuthToken({ username: normalisedEmail, password });

      const stored: StoredSession = {
        token,
        email: normalisedEmail,
        persistence: remember ? 'persistent' : 'session',
      };
      if (!tokenStorage.write(stored)) {
        throw new ApiError({
          kind: 'parse',
          message: 'This browser blocked local storage, so the session cannot be kept. Check your privacy settings.',
        });
      }

      // Validate the token straight away and warm the cache for the first page.
      try {
        const user = await fetchCurrentUser();
        queryClient.setQueryData(queryKeys.currentUser, user);
      } catch (error) {
        tokenStorage.clear();
        throw error;
      }

      setLastSignOutReason(null);
      setSession(toPublicSession(stored));
    },
    [queryClient],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: session !== null,
      lastSignOutReason,
      signIn,
      signOut,
    }),
    [session, lastSignOutReason, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
