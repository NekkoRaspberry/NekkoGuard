import { Save, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { getErrorMessage, isApiError } from '@/api/errors';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/Card/Card';
import { TextField } from '@/components/TextField/TextField';
import { useToast } from '@/components/Toast/useToast';
import { useUpdateProfile } from '../hooks/useUpdateProfile';
import { NAME_MAX_LENGTH, type CurrentUser } from '../userModel';
import styles from './AccountForms.module.css';

function validateName(name: string): string | null {
  if (name.trim().length > NAME_MAX_LENGTH) return `Use at most ${NAME_MAX_LENGTH} characters.`;
  return null;
}

/**
 * Edits the only writable field of the user (`name`).
 * Mount with `key={user.name}` so the form resets when the saved value changes.
 */
export function ProfileForm({ user }: { user: CurrentUser }) {
  const { notify } = useToast();
  const mutation = useUpdateProfile();
  const [name, setName] = useState(user.name);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const trimmed = name.trim();
  const isDirty = trimmed !== user.name;
  const remaining = NAME_MAX_LENGTH - trimmed.length;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateName(name);
    setFieldError(error);
    if (error || !isDirty) return;

    mutation.mutate(
      { userId: user.id, name: trimmed },
      {
        onSuccess: () => {
          notify({ tone: 'success', title: 'Profile updated', description: 'Your display name was saved.' });
        },
        onError: (mutationError) => {
          const serverFieldError = isApiError(mutationError) ? mutationError.fieldErrors.name?.join(' ') : undefined;
          if (serverFieldError) setFieldError(serverFieldError);
        },
      },
    );
  }

  const generalError =
    mutation.isError && !(isApiError(mutation.error) && mutation.error.fieldErrors.name)
      ? getErrorMessage(mutation.error)
      : null;

  return (
    <Card aria-labelledby="profile-form-title">
      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <CardHeader
          icon={<UserRound size={16} />}
          title="Public profile"
          titleId="profile-form-title"
          description="How your name appears across NekkoGuard."
        />
        <CardBody>
          {generalError && <Banner tone="danger" title="Could not save your profile">{generalError}</Banner>}
          <TextField
            label="Display name"
            name="name"
            autoComplete="name"
            placeholder="e.g. Alex Silva"
            value={name}
            maxLength={NAME_MAX_LENGTH + 20}
            onChange={(event) => {
              setName(event.target.value);
              if (fieldError) setFieldError(null);
            }}
            error={fieldError}
            hint={
              <span className={styles.hintRow}>
                <span>Optional. Leave empty to show your email instead.</span>
                <span className={remaining < 0 ? styles.counterOver : styles.counter}>{remaining}</span>
              </span>
            }
            disabled={mutation.isPending}
          />
        </CardBody>
        <CardFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setName(user.name);
              setFieldError(null);
              mutation.reset();
            }}
            disabled={!isDirty || mutation.isPending}
          >
            Discard
          </Button>
          <Button type="submit" variant="primary" disabled={!isDirty} loading={mutation.isPending} leftIcon={<Save size={16} />}>
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
