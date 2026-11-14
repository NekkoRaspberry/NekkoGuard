import { QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState, type FormEvent } from 'react';
import { allauth } from '@/api/allauth';
import type { TotpSetupMeta } from '@/api/types';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Checkbox } from '@/components/Checkbox/Checkbox';
import { Modal } from '@/components/Modal/Modal';
import formStyles from '@/components/Modal/ModalForm.module.css';
import { CodeField } from '@/components/TextField/CodeField';
import { isReauthCancelled } from '@/features/auth/reauth/ReauthContext';
import { useWithReauth } from '@/features/auth/reauth/useWithReauth';
import { useFormErrors } from '@/features/auth/useFormErrors';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';
import styles from './Security.module.css';

interface TotpSetupDialogProps {
  setup: TotpSetupMeta | null;
  onClose: () => void;
  onActivated: () => void;
}

const FIELDS = ['code'] as const;

/** Step 1: scan QR + confirm a code. Step 2: recovery codes shown once (must acknowledge). */
export function TotpSetupDialog({ setup, onClose, onActivated }: TotpSetupDialogProps) {
  const withReauth = useWithReauth();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const { errors, setErrors, fromError, clearField } = useFormErrors(FIELDS);

  function close() {
    setCode('');
    setRecoveryCodes(null);
    setAcknowledged(false);
    setErrors({});
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6) {
      setErrors({ code: 'Enter the 6-digit code from your app.' });
      return;
    }
    setSubmitting(true);
    try {
      await withReauth(() => allauth.activateTotp(code));
      onActivated();
      // allauth creates recovery codes together with the first authenticator. The activation
      // response does not reliably say so (meta flag missing in 65.21), so ask directly.
      const codes = await withReauth(() => allauth.getRecoveryCodes());
      const unused = codes.status === 200 ? (codes.data?.unused_codes ?? []) : [];
      if (unused.length > 0) setRecoveryCodes(unused);
      else close();
    } catch (error) {
      if (!isReauthCancelled(error)) fromError(error, 'Could not enable two-factor authentication.');
      setCode('');
    } finally {
      setSubmitting(false);
    }
  }

  if (recoveryCodes) {
    return (
      <Modal
        open
        onOpenChange={() => undefined}
        dismissible={false}
        size="md"
        icon={<QrCode size={18} />}
        title="Two-factor authentication is on"
        description="Store your recovery codes somewhere safe, like a password manager."
        footer={
          <Button variant="primary" disabled={!acknowledged} onClick={close}>
            Done
          </Button>
        }
      >
        <RecoveryCodesPanel codes={recoveryCodes} />
        <Checkbox label="I have stored these recovery codes" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
      </Modal>
    );
  }

  return (
    <Modal
      open={setup !== null}
      onOpenChange={(open) => !open && !submitting && close()}
      size="md"
      icon={<QrCode size={18} />}
      title="Set up authenticator app"
      description="Use an app such as Aegis, Google Authenticator, 1Password or Bitwarden."
    >
      {setup && (
        <form onSubmit={handleSubmit} noValidate className={formStyles.form}>
          <div className={styles.qrWrap}>
            <div className={styles.qr}>
              <QRCodeSVG value={setup.totp_url} size={148} level="M" title="Authenticator QR code" />
            </div>
            <div className={styles.secret}>
              <ol className={styles.steps}>
                <li>Scan the QR code with your app.</li>
                <li>Or enter this key manually:</li>
              </ol>
              <code className={styles.secretValue} aria-label="Setup key">
                {setup.secret}
              </code>
            </div>
          </div>
          {errors.form && <Banner tone="danger">{errors.form}</Banner>}
          <CodeField
            label="Code from the app"
            name="code"
            autoFocus
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, ''));
              clearField('code');
            }}
            error={errors.code ?? null}
            disabled={submitting}
          />
          <div className={formStyles.actions}>
            <div className={formStyles.actionsEnd}>
              <Button variant="ghost" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={submitting}>
                Enable
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
