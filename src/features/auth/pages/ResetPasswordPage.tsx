import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, KeyRound, LinkIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { allauth } from '@/api/allauth';
import { ROUTES } from '@/app/routes';
import { Banner } from '@/components/Banner/Banner';
import { Button, ButtonLink } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { PasswordField } from '@/components/TextField/PasswordField';
import { EntranceLayout } from '@/layout/EntranceLayout/EntranceLayout';
import { AuthHeading } from '../components/AuthHeading';
import { useAuth } from '../useAuth';
import { useFormErrors } from '../useFormErrors';
import { PASSWORD_MIN_LENGTH, validateNewPassword } from '../validation';
import styles from './AuthPages.module.css';

const FIELDS = ['password', 'confirm', 'key'] as const;

/** Landing page of the password reset link sent by email: /reset-password/:key */
export function ResetPasswordPage() {
  const { key = '' } = useParams();
  const { applySession, isAuthenticated } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { errors, setErrors, fromError, clearField } = useFormErrors(FIELDS);

  const info = useQuery({
    queryKey: ['auth', 'password-reset', key],
    queryFn: () => allauth.getPasswordReset(key),
    retry: false,
    staleTime: Infinity,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateNewPassword(password, confirm);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      // 200 = signed in right away; 401 = password changed, sign in next.
      applySession(await allauth.resetPassword(key, password));
      setDone(true);
    } catch (error) {
      fromError(error, 'Could not reset the password.');
    } finally {
      setSubmitting(false);
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

  if (info.isError || errors.key) {
    return (
      <EntranceLayout>
        <AuthHeading
          tone="danger"
          icon={<LinkIcon size={20} />}
          title="Link invalid or expired"
          subtitle="This password reset link can no longer be used. Request a new one."
        />
        <ButtonLink to={ROUTES.forgotPassword} variant="primary" fullWidth>
          Request a new link
        </ButtonLink>
      </EntranceLayout>
    );
  }

  if (done) {
    return (
      <EntranceLayout>
        <AuthHeading
          tone="success"
          icon={<CheckCircle2 size={20} />}
          title="Password changed"
          subtitle={isAuthenticated ? 'Your new password is active.' : 'Your new password is active. Sign in with it now.'}
        />
        <ButtonLink to={isAuthenticated ? ROUTES.overview : ROUTES.login} variant="primary" fullWidth>
          {isAuthenticated ? 'Continue to NekkoGuard' : 'Sign in'}
        </ButtonLink>
      </EntranceLayout>
    );
  }

  return (
    <EntranceLayout>
      <AuthHeading icon={<KeyRound size={20} />} title="Choose a new password" subtitle="Pick a strong password you don’t use anywhere else." />
      {errors.form && (
        <Banner tone="danger" className={styles.banner}>
          {errors.form}
        </Banner>
      )}
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <PasswordField
          label="New password"
          name="new-password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            clearField('password');
          }}
          error={errors.password ?? null}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          disabled={submitting}
        />
        <PasswordField
          label="Confirm new password"
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value);
            clearField('confirm');
          }}
          error={errors.confirm ?? null}
          disabled={submitting}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
          Set new password
        </Button>
      </form>
    </EntranceLayout>
  );
}
