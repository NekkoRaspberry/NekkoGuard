import { ArrowRight, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { allauth } from '@/api/allauth';
import { ROUTES, routeForPendingFlow } from '@/app/routes';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { PasswordField } from '@/components/TextField/PasswordField';
import { TextField } from '@/components/TextField/TextField';
import { EntranceLayout } from '@/layout/EntranceLayout/EntranceLayout';
import { AuthHeading } from '../components/AuthHeading';
import { ProviderButtons } from '../components/ProviderButtons';
import { useAdminSignIn } from '../hooks/useAdminSignIn';
import { useAuth } from '../useAuth';
import { useFormErrors } from '../useFormErrors';
import { isValidEmail } from '../validation';
import styles from './AuthPages.module.css';

const FIELDS = ['email', 'password'] as const;

export function LoginPage() {
  const { applySession, lastSignOutReason } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const toAdmin = useAdminSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { errors, setErrors, fromError, clearField } = useFormErrors(FIELDS);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation: typeof errors = {};
    if (!email.trim()) validation.email = 'Enter your email address.';
    else if (!isValidEmail(email)) validation.email = 'Enter a valid email address.';
    if (!password) validation.password = 'Enter your password.';
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      const session = await allauth.login(email.trim(), password);
      applySession(session);
      // 200 → <RedirectIfAuthenticated> navigates. 401 → a further step is pending.
      const next = routeForPendingFlow(session.data?.flows?.find((flow) => flow.is_pending)?.id ?? null);
      // Keep ?next= (e.g. back to the Django admin) through the 2FA step.
      if (next) navigate({ pathname: next, search: location.search }, { state: location.state });
    } catch (error) {
      fromError(error, 'Sign-in failed. Please try again.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <EntranceLayout
      variant={toAdmin ? 'admin' : 'default'}
      footer={
        toAdmin ? (
          <>
            Not an administrator?{' '}
            {/* Plain /login (no ?next=) = the normal sign-in */}
            <Link to={ROUTES.login} className={styles.footerLink}>
              Go back
            </Link>
          </>
        ) : (
          <>
            No account yet?{' '}
            <Link to={ROUTES.signup} className={styles.footerLink}>
              Create one
            </Link>
          </>
        )
      }
    >
      <AuthHeading
        title="Sign in"
        subtitle={
          toAdmin
            ? 'Use your password and a two-factor authentication code to open the admin.'
            : 'Welcome back. Use the email address of your NekkoGuard account.'
        }
      />

      {lastSignOutReason === 'terms_declined' && !errors.form && (
        <Banner tone="info" title="You have been signed out" className={styles.banner}>
          Accepting the Terms of Service is required to use NekkoGuard. Sign in again whenever you are ready to accept them.
        </Banner>
      )}
      {lastSignOutReason === 'expired' && !errors.form && (
        <Banner tone="warning" title="Your session has ended" className={styles.banner}>
          Please sign in again to continue.
        </Banner>
      )}
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
          autoComplete="username"
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
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            clearField('password');
          }}
          error={errors.password ?? null}
          disabled={submitting}
          labelAction={
            <Link to={ROUTES.forgotPassword} className={styles.labelLink}>
              Forgot password?
            </Link>
          }
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting} rightIcon={<ArrowRight size={16} />}>
          Sign in
        </Button>
      </form>
      <ProviderButtons />
    </EntranceLayout>
  );
}
