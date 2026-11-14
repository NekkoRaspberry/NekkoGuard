import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { isApiError } from '@/api/errors';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Checkbox } from '@/components/Checkbox/Checkbox';
import { TextField } from '@/components/TextField/TextField';
import { EntranceLayout } from '@/layout/EntranceLayout/EntranceLayout';
import { backendUrl } from '@/lib/backendLinks';
import { useAuth } from '../useAuth';
import styles from './LoginPage.module.css';

interface FormErrors {
  email?: string;
  password?: string;
  form?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string, password: string): FormErrors {
  const errors: FormErrors = {};
  if (!email.trim()) errors.email = 'Enter your email address.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}

export function LoginPage() {
  const { signIn, lastSignOutReason } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validate(email, password);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    try {
      // On success the auth state changes and <RedirectIfAuthenticated> navigates away.
      await signIn({ email, password, remember });
    } catch (error) {
      let message = 'Sign-in failed. Please try again.';
      if (isApiError(error)) {
        // 400 from obtain_auth_token = wrong credentials (or inactive account) — keep the message generic.
        message = error.status === 400 ? 'The email or password is incorrect.' : error.message;
      }
      setErrors({ form: message });
      setPassword('');
      setSubmitting(false);
    }
  }

  return (
    <EntranceLayout
      footer={
        <>
          No account yet?{' '}
          <a href={backendUrl('signup')} className={styles.footerLink}>
            Create one
          </a>
        </>
      }
    >
      <div className={styles.heading}>
        <h1>Sign in</h1>
        <p className={styles.subtitle}>Welcome back. Use the email address of your NekkoGuard account.</p>
      </div>

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
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email ?? null}
          leftSlot={<Mail size={16} />}
          disabled={submitting}
        />
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password ?? null}
          leftSlot={<Lock size={16} />}
          disabled={submitting}
          labelAction={
            <a href={backendUrl('passwordReset')} className={styles.labelLink}>
              Forgot password?
            </a>
          }
          rightSlot={
            <button
              type="button"
              className={styles.reveal}
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />
        <Checkbox
          label="Keep me signed in"
          description="Only on a private device. Otherwise you are signed out when the browser closes."
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          disabled={submitting}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting} rightIcon={<ArrowRight size={16} />}>
          Sign in
        </Button>
      </form>
    </EntranceLayout>
  );
}
