import { useCallback, useContext } from 'react';
import { isReauthenticationRequired } from '@/api/allauth';
import { ReauthContext } from './ReauthContext';

/**
 * Wraps a sensitive account action: if the server asks for re-authentication, the
 * "confirm it's you" dialog opens and the action is retried once confirmed.
 */
export function useWithReauth() {
  const context = useContext(ReauthContext);
  if (!context) throw new Error('useWithReauth must be used inside <ReauthProvider>.');
  const { requestReauth } = context;

  return useCallback(
    async <T>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action();
      } catch (error) {
        if (!isReauthenticationRequired(error)) throw error;
        await requestReauth(error.flows);
        return action();
      }
    },
    [requestReauth],
  );
}
