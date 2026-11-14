import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MailCheck, MailX } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { allauth } from '@/api/allauth';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { ROUTES } from '@/app/routes';
import { Banner } from '@/components/Banner/Banner';
import { Button, ButtonLink } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { EntranceLayout } from '@/layout/EntranceLayout/EntranceLayout';
import { AuthHeading } from '../components/AuthHeading';
import { useAuth } from '../useAuth';
import styles from './AuthPages.module.css';

/** Landing page of the verification link sent by email: /verify-email/:key */
export function VerifyEmailPage() {
  const { key = '' } = useParams();
  const { applySession, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const info = useQuery({
    queryKey: ['auth', 'verify-email', key],
    queryFn: () => allauth.getEmailVerification(key),
    retry: false,
    staleTime: Infinity,
  });

  async function confirm() {
    setState('submitting');
    setSubmitError(null);
    try {
      applySession(await allauth.verifyEmail(key));
      void queryClient.invalidateQueries({ queryKey: queryKeys.emails });
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser });
      setState('done');
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Verification failed.'));
      setState('idle');
    }
  }

  if (info.isPending) {
    return (
      <EntranceLayout>
        <div className={styles.loadingRow}>
          <Spinner /> Checking your link…
        </div>
      </EntranceLayout>
    );
  }

  if (info.isError) {
    return (
      <EntranceLayout>
        <AuthHeading
          tone="danger"
          icon={<MailX size={20} />}
          title="Link invalid or expired"
          subtitle="This verification link can no longer be used. Sign in to receive a new one, or add the address again from your security settings."
        />
        <ButtonLink to={isAuthenticated ? ROUTES.security : ROUTES.login} variant="secondary" fullWidth>
          {isAuthenticated ? 'Go to security settings' : 'Back to sign in'}
        </ButtonLink>
      </EntranceLayout>
    );
  }

  const email = info.data.data?.email ?? 'your email address';

  if (state === 'done') {
    return (
      <EntranceLayout>
        <AuthHeading
          tone="success"
          icon={<CheckCircle2 size={20} />}
          title="Email verified"
          subtitle={
            <>
              <strong>{email}</strong> is confirmed.
              {isAuthenticated ? '' : ' You can now sign in.'}
            </>
          }
        />
        <ButtonLink to={isAuthenticated ? ROUTES.overview : ROUTES.login} variant="primary" fullWidth>
          {isAuthenticated ? 'Continue to NekkoGuard' : 'Sign in'}
        </ButtonLink>
      </EntranceLayout>
    );
  }

  return (
    <EntranceLayout>
      <AuthHeading
        icon={<MailCheck size={20} />}
        title="Confirm your email"
        subtitle={
          <>
            Confirm that <strong>{email}</strong> belongs to your NekkoGuard account.
          </>
        }
      />
      {submitError && (
        <Banner tone="danger" className={styles.banner}>
          {submitError}
        </Banner>
      )}
      <Button variant="primary" size="lg" fullWidth loading={state === 'submitting'} onClick={() => void confirm()}>
        Confirm email
      </Button>
    </EntranceLayout>
  );
}
