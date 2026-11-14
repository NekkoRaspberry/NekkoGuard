import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { allauth } from '@/api/allauth';
import { queryKeys } from '@/api/queryKeys';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/Card/Card';
import { PasswordField } from '@/components/TextField/PasswordField';
import { useToast } from '@/components/Toast/useToast';
import { isReauthCancelled } from '@/features/auth/reauth/ReauthContext';
import { useWithReauth } from '@/features/auth/reauth/useWithReauth';
import { useAuth } from '@/features/auth/useAuth';
import { useFormErrors } from '@/features/auth/useFormErrors';
import { PASSWORD_MIN_LENGTH, validateNewPassword } from '@/features/auth/validation';
import styles from './Security.module.css';

const FIELDS = ['current_password', 'new_password', 'confirm'] as const;

export function PasswordCard() {
  const { user } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const withReauth = useWithReauth();
  const hasPassword = user?.has_usable_password ?? true;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const { errors, setErrors, fromError, clearField } = useFormErrors(FIELDS);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setErrors({});
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { password, confirm: confirmError } = validateNewPassword(next, confirm);
    const validation: typeof errors = {};
    if (hasPassword && !current) validation.current_password = 'Enter your current password.';
    if (password) validation.new_password = password;
    if (confirmError) validation.confirm = confirmError;
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    try {
      await withReauth(() => allauth.changePassword(current, next));
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
      notify({ tone: 'success', title: 'Password changed', description: 'Use your new password next time you sign in.' });
      reset();
    } catch (error) {
      if (!isReauthCancelled(error)) fromError(error, 'Could not change the password.');
    } finally {
      setSaving(false);
    }
  }

  const dirty = Boolean(current || next || confirm);

  return (
    <Card aria-labelledby="password-title">
      <form onSubmit={handleSubmit} noValidate>
        <CardHeader
          icon={<KeyRound size={16} />}
          title="Password"
          titleId="password-title"
          description={hasPassword ? 'Change the password you use to sign in.' : 'Set a password to sign in with your email.'}
        />
        <CardBody>
          {errors.form && <Banner tone="danger">{errors.form}</Banner>}
          <div className={styles.formStack}>
            {hasPassword && (
              <PasswordField
                label="Current password"
                name="current-password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => {
                  setCurrent(event.target.value);
                  clearField('current_password');
                }}
                error={errors.current_password ?? null}
                disabled={saving}
              />
            )}
            <PasswordField
              label="New password"
              name="new-password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => {
                setNext(event.target.value);
                clearField('new_password');
              }}
              error={errors.new_password ?? null}
              hint={`At least ${PASSWORD_MIN_LENGTH} characters. Avoid common or purely numeric passwords.`}
              disabled={saving}
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
              disabled={saving}
            />
          </div>
        </CardBody>
        <CardFooter>
          <Button variant="ghost" onClick={reset} disabled={!dirty || saving}>
            Discard
          </Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
            {hasPassword ? 'Change password' : 'Set password'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
