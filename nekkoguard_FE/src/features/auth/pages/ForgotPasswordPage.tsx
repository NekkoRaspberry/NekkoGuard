import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { allauth } from '@/api/allauth';
import { ROUTES } from '@/app/routes';
import { Banner } from '@/components/Banner/Banner';
import { Button, ButtonLink } from '@/components/Button/Button';
import { TextField } from '@/components/TextField/TextField';
import { EntranceLayout } from '@/layout/EntranceLayout/EntranceLayout';
import { AuthHeading } from '../components/AuthHeading';
import { useFormErrors } from '../useFormErrors';
import { isValidEmail } from '../validation';
import styles from './AuthPages.module.css';

const FIELDS = ['email'] as const;

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { errors, setErrors, fromError, clearField } = useFormErrors(FIELDS);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidEmail(email)) {
      setErrors({ email: 'Enter a valid email address.' });
      return;
    }
    setSubmitting(true);
    try {
      await allauth.requestPasswordReset(email.trim());
      setSentTo(email.trim());
    } catch (error) {
      fromError(error, 'Could not send the reset link. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const footer = (
    <Link to={ROUTES.login} className={styles.footerLink}>
      <ArrowLeft size={12} /> Back to sign in
    </Link>
  );

  if (sentTo) {
    return (
      <EntranceLayout footer={footer}>
        <AuthHeading
          tone="success"
          icon={<MailCheck size={20} />}
          title="Check your inbox"
          subtitle={
            <>
              If an account exists for <strong>{sentTo}</strong>, we sent a link to reset its password. The link expires
              after a few days.
            </>
          }
        />
        <ButtonLink to={ROUTES.login} variant="secondary" fullWidth>
          Back to sign in
        </ButtonLink>
      </EntranceLayout>
    );
  }

  return (
    <EntranceLayout footer={footer}>
      <AuthHeading title="Reset your password" subtitle="Enter your account’s email address and we will send you a reset link." />
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
        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
          Send reset link
        </Button>
      </form>
    </EntranceLayout>
  );
}
