import { useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { allauth } from '@/api/allauth';
import { queryKeys } from '@/api/queryKeys';
import { ROUTES, routeForPendingFlow } from '@/app/routes';
import { ButtonLink } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { useToast } from '@/components/Toast/useToast';
import { EntranceLayout } from '@/layout/EntranceLayout/EntranceLayout';
import { readNextUrl } from '@/lib/nextUrl';
import { AuthHeading } from '../components/AuthHeading';
import { useAuth } from '../useAuth';
import styles from './AuthPages.module.css';

/** allauth error codes passed back as `?error=` (see headless spec, provider redirect). */
const ERROR_MESSAGES: Record<string, string> = {
  cancelled: 'You cancelled the sign-in with the provider.',
  denied: 'The provider did not grant access.',
};

type Outcome = { kind: 'loading' } | { kind: 'route'; to: string } | { kind: 'external'; url: string } | { kind: 'error'; message: string };

/**
 * The backend returns the browser here after Google/GitHub/LinkedIn. Re-read the session
 * and continue: signed in, a further step (2FA, provider sign-up, email verification), or an error.
 */
export function ProviderCallbackPage() {
  const { search } = useLocation();
  const { applySession } = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const params = new URLSearchParams(search);
  const error = params.get('error');
  const isConnect = params.get('process') === 'connect';
  const [outcome, setOutcome] = useState<Outcome>(() =>
    error ? { kind: 'error', message: ERROR_MESSAGES[error] ?? `The sign-in could not be completed (${error}).` } : { kind: 'loading' },
  );

  useEffect(() => {
    if (error) return;
    let cancelled = false;
    void (async () => {
      try {
        const session = await allauth.getSession();
        if (cancelled) return;
        applySession(session);
        if (session.status === 200) {
          if (isConnect) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.providerAccounts });
            notify({ tone: 'success', title: 'Account linked', description: 'You can now sign in with it.' });
            setOutcome({ kind: 'route', to: `${ROUTES.security}#sign-in-providers` });
            return;
          }
          const next = readNextUrl(search);
          setOutcome(next ? { kind: 'external', url: next } : { kind: 'route', to: ROUTES.overview });
          return;
        }
        const pending = routeForPendingFlow(session.data?.flows?.find((flow) => flow.is_pending)?.id ?? null);
        setOutcome(
          pending ? { kind: 'route', to: `${pending}${search}` } : { kind: 'error', message: 'The sign-in did not complete. Please try again.' },
        );
      } catch {
        if (!cancelled) setOutcome({ kind: 'error', message: 'Cannot reach the NekkoGuard server.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [error, isConnect, search, applySession, queryClient, notify]);

  useEffect(() => {
    if (outcome.kind === 'external') window.location.replace(outcome.url);
  }, [outcome]);

  if (outcome.kind === 'route') return <Navigate to={outcome.to} replace />;

  if (outcome.kind === 'error') {
    return (
      <EntranceLayout>
        <AuthHeading tone="danger" icon={<TriangleAlert size={20} />} title="Sign-in not completed" subtitle={outcome.message} />
        <ButtonLink to={isConnect ? ROUTES.security : ROUTES.login} variant="secondary" fullWidth>
          {isConnect ? 'Back to security settings' : 'Back to sign in'}
        </ButtonLink>
      </EntranceLayout>
    );
  }

  return (
    <EntranceLayout>
      <div className={styles.loadingRow}>
        <Spinner /> Finishing sign-in…
      </div>
    </EntranceLayout>
  );
}
