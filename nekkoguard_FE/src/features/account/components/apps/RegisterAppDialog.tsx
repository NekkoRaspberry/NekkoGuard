import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppWindow, KeyRound } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { isApiError } from '@/api/errors';
import { oauthApps, type OAuthApplicationDto } from '@/api/oauthApps';
import { queryKeys } from '@/api/queryKeys';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Checkbox } from '@/components/Checkbox/Checkbox';
import { Modal } from '@/components/Modal/Modal';
import formStyles from '@/components/Modal/ModalForm.module.css';
import { TextField } from '@/components/TextField/TextField';
import { cx } from '@/lib/cx';
import styles from './Apps.module.css';
import { CopyValue } from './CopyValue';
import { IntegrationDetails } from './IntegrationDetails';

type ClientType = 'confidential' | 'public';

function parseUris(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((uri) => uri.trim())
    .filter(Boolean);
}

function validUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.hash;
  } catch {
    return false;
  }
}

/** Staff: register an application. The client secret is shown once, right after. */
export function RegisterAppDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const uriId = useId();
  const [name, setName] = useState('');
  const [clientType, setClientType] = useState<ClientType>('confidential');
  const [uris, setUris] = useState('');
  const [errors, setErrors] = useState<{ name?: string; redirect_uris?: string; form?: string }>({});
  const [created, setCreated] = useState<OAuthApplicationDto | null>(null);
  const [stored, setStored] = useState(false);

  const create = useMutation({
    mutationFn: oauthApps.createApplication,
    onSuccess: (app) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.oauthApplications });
      setCreated(app);
    },
    onError: (error) => {
      if (isApiError(error)) {
        setErrors({
          name: error.fieldErrors.name?.join(' '),
          redirect_uris: error.fieldErrors.redirect_uris?.join(' '),
          form: Object.keys(error.fieldErrors).length ? undefined : error.message,
        });
      } else setErrors({ form: 'Could not register the application.' });
    },
  });

  function reset() {
    setName('');
    setClientType('confidential');
    setUris('');
    setErrors({});
    setCreated(null);
    setStored(false);
    create.reset();
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const list = parseUris(uris);
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Give the application a name.';
    if (list.length === 0) next.redirect_uris = 'Add at least one redirect URL.';
    else if (!list.every(validUri)) next.redirect_uris = 'Use full http(s) URLs without a #fragment.';
    setErrors(next);
    if (Object.keys(next).length) return;
    create.mutate({ name: name.trim(), client_type: clientType, redirect_uris: list });
  }

  if (created) {
    const hasSecret = Boolean(created.client_secret);
    return (
      <Modal
        open={open}
        onOpenChange={() => undefined}
        dismissible={false}
        size="md"
        icon={<KeyRound size={18} />}
        title={`${created.name} is registered`}
        description="Give these details to the application's administrator."
        footer={
          <Button variant="primary" disabled={hasSecret && !stored} onClick={close}>
            Done
          </Button>
        }
      >
        {hasSecret && (
          <Banner tone="warning" title="Copy the client secret now">
            It is stored hashed and will not be shown again. If it is lost, delete the application and register it
            again.
          </Banner>
        )}
        <div className={styles.details}>
          <CopyValue label="Client ID" value={created.client_id} />
          {hasSecret && created.client_secret && <CopyValue label="Client secret" value={created.client_secret} />}
          <IntegrationDetails />
        </div>
        {hasSecret && (
          <Checkbox label="I have stored the client secret" checked={stored} onChange={(event) => setStored(event.target.checked)} />
        )}
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      size="md"
      icon={<AppWindow size={18} />}
      title="Register an application"
      description="Lets an application ask users for permission to read their NekkoGuard profile."
    >
      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        {errors.form && <Banner tone="danger">{errors.form}</Banner>}
        <TextField
          label="Name"
          name="app-name"
          placeholder="e.g. Grafana"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name ?? null}
          hint="Shown to users on the consent screen."
          maxLength={255}
        />

        <div className={styles.field} role="radiogroup" aria-label="Application type">
          <span className={styles.fieldLabel}>Type</span>
          <div className={styles.typeOptions}>
            {(
              [
                ['confidential', 'Server-side app', 'Can keep a client secret (most web apps).'],
                ['public', 'Browser or mobile app', 'Cannot keep a secret; uses PKCE only.'],
              ] as const
            ).map(([value, title, hint]) => (
              <label key={value} className={styles.typeOption}>
                <input
                  type="radio"
                  name="client-type"
                  value={value}
                  checked={clientType === value}
                  onChange={() => setClientType(value)}
                />
                <span className={styles.typeTitle}>{title}</span>
                <span className={styles.typeHint}>{hint}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor={uriId} className={styles.fieldLabel}>
            Redirect URLs
          </label>
          <textarea
            id={uriId}
            className={cx(styles.textarea, errors.redirect_uris && styles.textareaInvalid)}
            placeholder="https://grafana.example.com/login/generic_oauth"
            value={uris}
            onChange={(event) => setUris(event.target.value)}
            aria-invalid={errors.redirect_uris ? true : undefined}
            spellCheck={false}
          />
          {errors.redirect_uris ? (
            <span className={styles.fieldError} role="alert">
              {errors.redirect_uris}
            </span>
          ) : (
            <span className={styles.fieldHint}>One per line. Users are only ever sent back to these exact URLs.</span>
          )}
        </div>

        <div className={formStyles.actions}>
          <div className={formStyles.actionsEnd}>
            <Button variant="ghost" onClick={close} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Register
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
