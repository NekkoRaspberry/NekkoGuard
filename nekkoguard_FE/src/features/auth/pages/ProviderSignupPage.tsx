import { useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { allauth } from '@/api/allauth';
import { routeForPendingFlow } from '@/app/routes';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { TextField } from '@/components/TextField/TextField';
import { EntranceLayout } from '@/layout/EntranceLayout/EntranceLayout';
import { AuthHeading } from '../components/AuthHeading';
import { ProviderIcon } from '../components/ProviderIcon';
import { useAuth } from '../useAuth';
import { useFormErrors } from '../useFormErrors';
import { isValidEmail } from '../validation';
import styles from './AuthPages.module.css';

const FIELDS = ['email'] as const;

/**
 * Pending provider sign-up (flow `provider_signup`): the provider did not give enough to
 * finish automatically (e.g. no email). The user confirms an email address.
 */
export function ProviderSignupPage() {
  const { applySession, signOut } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const info = useQuery({ queryKey: ['auth', 'provider-signup'], queryFn: allauth.getProviderSignup, retry: false });
  const [email, setEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { errors, setErrors, fromError, clearField } = useFormErrors(FIELDS);

  const provider = info.data?.data?.account.provider;
  const suggested = info.data?.data?.email.find((address) => address.primary)?.email ?? info.data?.data?.email[0]?.email ?? '';
  const value = email ?? suggested;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidEmail(value)) {
      setErrors({ email: 'Enter a valid email address.' });
      return;
    }
    setSubmitting(true);
    try {
      const session = await allauth.providerSignup(value.trim());
      applySession(session);
      const next = routeForPendingFlow(session.data?.flows?.find((flow) => flow.is_pending)?.id ?? null);
      if (next) navigate(`${next}${search}`);
    } catch (error) {
      fromError(error, 'Could not complete the sign-up.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <EntranceLayout
      footer={
        <button type="button" className={styles.linkButton} onClick={() => void signOut()}>
          Cancel
        </button>
      }
    >
      {info.isPending ? (
        <div className={styles.loadingRow}>
          <Spinner /> Loading…
        </div>
      ) : (
        <>
          <AuthHeading
            icon={provider ? <ProviderIcon provider={provider.id} size={20} /> : undefined}
            title="Finish signing up"
            subtitle={`Confirm the email address for your NekkoGuard account${provider ? ` (signing in with ${provider.name})` : ''}.`}
          />
          {(errors.form || info.isError) && (
            <Banner tone="danger" className={styles.banner}>
              {errors.form ?? 'This sign-up step is no longer pending. Start again from the sign-in page.'}
            </Banner>
          )}
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <TextField
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              value={value}
              onChange={(event) => {
                setEmail(event.target.value);
                clearField('email');
              }}
              error={errors.email ?? null}
              leftSlot={<Mail size={16} />}
              disabled={submitting || info.isError}
            />
            <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting} disabled={info.isError}>
              Create account
            </Button>
          </form>
        </>
      )}
    </EntranceLayout>
  );
}
