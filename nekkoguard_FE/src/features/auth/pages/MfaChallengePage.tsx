import { KeyRound, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { allauth } from '@/api/allauth';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { CodeField } from '@/components/TextField/CodeField';
import { EntranceLayout } from '@/layout/EntranceLayout/EntranceLayout';
import { AuthHeading } from '../components/AuthHeading';
import { useAdminSignIn } from '../hooks/useAdminSignIn';
import { useAuth } from '../useAuth';
import { useFormErrors } from '../useFormErrors';
import styles from './AuthPages.module.css';

const FIELDS = ['code'] as const;

/** Second login step when the account has 2FA enabled (flow `mfa_authenticate`). */
export function MfaChallengePage() {
  const { applySession, signOut, flows } = useAuth();
  const toAdmin = useAdminSignIn();
  const [code, setCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { errors, setErrors, fromError, clearField } = useFormErrors(FIELDS);

  const mfaTypes = flows.find((flow) => flow.id === 'mfa_authenticate')?.types ?? [];
  const recoveryAvailable = mfaTypes.includes('recovery_codes');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.trim().replace(/\s+/g, '');
    if (!value) {
      setErrors({ code: useRecoveryCode ? 'Enter one of your recovery codes.' : 'Enter the 6-digit code.' });
      return;
    }
    setSubmitting(true);
    try {
      // On success the session becomes authenticated and the route guard moves on.
      applySession(await allauth.mfaAuthenticate(value));
    } catch (error) {
      fromError(error, 'Verification failed. Please try again.');
      setCode('');
      setSubmitting(false);
    }
  }

  return (
    <EntranceLayout
      variant={toAdmin ? 'admin' : 'default'}
      footer={
        <button type="button" className={styles.linkButton} onClick={() => void signOut()}>
          Cancel and use a different account
        </button>
      }
    >
      <AuthHeading
        icon={useRecoveryCode ? <KeyRound size={20} /> : <ShieldCheck size={20} />}
        title="Two-factor authentication"
        subtitle={
          useRecoveryCode
            ? 'Enter one of the recovery codes you saved when you set up two-factor authentication.'
            : 'Open your authenticator app and enter the 6-digit code for NekkoGuard.'
        }
      />

      {errors.form && (
        <Banner tone="danger" className={styles.banner}>
          {errors.form}
        </Banner>
      )}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <CodeField
          key={useRecoveryCode ? 'recovery' : 'totp'}
          label={useRecoveryCode ? 'Recovery code' : 'Authentication code'}
          name="code"
          autoFocus
          allowAlphanumeric={useRecoveryCode}
          value={code}
          onChange={(event) => {
            setCode(useRecoveryCode ? event.target.value : event.target.value.replace(/\D/g, ''));
            clearField('code');
          }}
          error={errors.code ?? null}
          disabled={submitting}
        />
        <div className={styles.actions}>
          <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
            Verify
          </Button>
          {recoveryAvailable && (
            <div className={styles.secondaryAction}>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  setUseRecoveryCode((value) => !value);
                  setCode('');
                  setErrors({});
                }}
              >
                {useRecoveryCode ? 'Use your authenticator app instead' : 'Use a recovery code instead'}
              </button>
            </div>
          )}
        </div>
      </form>
    </EntranceLayout>
  );
}
