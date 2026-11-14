import { ArrowRight, Lock, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { allauth } from '@/api/allauth';
import { ROUTES, routeForPendingFlow } from '@/app/routes';
import { Banner } from '@/components/Banner/Banner';
import { Button, ButtonLink } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { PasswordField } from '@/components/TextField/PasswordField';
import { TextField } from '@/components/TextField/TextField';
import { EntranceLayout } from '@/layout/EntranceLayout/EntranceLayout';
import { AuthHeading } from '../components/AuthHeading';
import { useAuthConfig } from '../hooks/useAuthConfig';
import { useAuth } from '../useAuth';
import { useFormErrors } from '../useFormErrors';
import { PASSWORD_MIN_LENGTH, isValidEmail, validateNewPassword } from '../validation';
import styles from './AuthPages.module.css';

const FIELDS = ['email', 'password', 'confirm'] as const;

export function SignupPage() {
  const { applySession } = useAuth();
  const navigate = useNavigate();
  const config = useAuthConfig();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { errors, setErrors, fromError, clearField } = useFormErrors(FIELDS);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation: typeof errors = { ...validateNewPassword(password, confirm) };
    if (!email.trim()) validation.email = 'Enter your email address.';
    else if (!isValidEmail(email)) validation.email = 'Enter a valid email address.';
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      const session = await allauth.signup(email.trim(), password);
      applySession(session);
      const next = routeForPendingFlow(session.data?.flows?.find((flow) => flow.is_pending)?.id ?? null);
      if (next) navigate(next);
    } catch (error) {
      fromError(error, 'Sign-up failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const footer = (
    <>
      Already have an account?{' '}
      <Link to={ROUTES.login} className={styles.footerLink}>
        Sign in
      </Link>
    </>
  );

  if (config.isPending) {
    return (
      <EntranceLayout footer={footer}>
        <div className={styles.loadingRow}>
          <Spinner /> Loading…
        </div>
      </EntranceLayout>
    );
  }

  if (config.data && !config.data.account.is_open_for_signup) {
    return (
      <EntranceLayout footer={footer}>
        <AuthHeading
          icon={<Lock size={20} />}
          title="Sign-up is closed"
          subtitle="New accounts cannot be created on this NekkoGuard server. Ask the administrator for an invitation."
        />
        <ButtonLink to={ROUTES.login} variant="secondary" fullWidth>
          Back to sign in
        </ButtonLink>
      </EntranceLayout>
    );
  }

  return (
    <EntranceLayout footer={footer}>
      <AuthHeading title="Create your account" subtitle="You will need to confirm your email address before signing in." />

      {errors.form && (
        <Banner tone="danger" className={styles.banner}>
          {errors.form}
        </Banner>
      )}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            clearField('email');
          }}
          error={errors.email ?? null}
          leftSlot={<Mail size={16} />}
          disabled={submitting}
        />
        <PasswordField
          label="Password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            clearField('password');
          }}
          error={errors.password ?? null}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. Avoid common or purely numeric passwords.`}
          disabled={submitting}
        />
        <PasswordField
          label="Confirm password"
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
        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting} rightIcon={<ArrowRight size={16} />}>
          Create account
        </Button>
      </form>
    </EntranceLayout>
  );
}
