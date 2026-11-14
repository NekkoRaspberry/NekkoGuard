import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, RefreshCw, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { allauth } from '@/api/allauth';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { TotpSetupMeta } from '@/api/types';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Modal } from '@/components/Modal/Modal';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useToast } from '@/components/Toast/useToast';
import { isReauthCancelled } from '@/features/auth/reauth/ReauthContext';
import { useWithReauth } from '@/features/auth/reauth/useWithReauth';
import { formatDateTime } from '@/lib/format';
import { useAuthenticators, useEmailAddresses } from '../../hooks/useSecurityData';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';
import { TotpSetupDialog } from './TotpSetupDialog';
import styles from './Security.module.css';

type Busy = 'enable' | 'disable' | 'regenerate' | null;

/** allauth timestamps are seconds since epoch. */
const fromSeconds = (seconds: number) => formatDateTime(seconds * 1000);

export function TwoFactorCard() {
  const authenticators = useAuthenticators();
  const emails = useEmailAddresses();
  const queryClient = useQueryClient();
  const withReauth = useWithReauth();
  const { notify } = useToast();

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<TotpSetupMeta | null>(null);
  const [confirm, setConfirm] = useState<'disable' | 'regenerate' | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.authenticators });
    void queryClient.invalidateQueries({ queryKey: queryKeys.session });
  };

  async function run(kind: Exclude<Busy, null>, action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (caught) {
      if (!isReauthCancelled(caught)) setError(getErrorMessage(caught));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  const startSetup = () =>
    run('enable', async () => {
      const envelope = await withReauth(() => allauth.getTotp());
      if (envelope.status === 404 && envelope.meta?.secret && envelope.meta.totp_url) {
        setSetup({ secret: envelope.meta.secret, totp_url: envelope.meta.totp_url });
      } else {
        refresh(); // already active (e.g. enabled in another tab)
      }
    });

  const disable = () =>
    run('disable', async () => {
      await withReauth(() => allauth.deactivateTotp());
      refresh();
      notify({ tone: 'success', title: 'Two-factor authentication disabled' });
    });

  const regenerate = () =>
    run('regenerate', async () => {
      const created = await withReauth(() => allauth.regenerateRecoveryCodes());
      const codes = created.data?.unused_codes ?? (await withReauth(() => allauth.getRecoveryCodes())).data?.unused_codes ?? [];
      refresh();
      setNewCodes(codes);
    });

  const totp = authenticators.data?.totp ?? null;
  const recovery = authenticators.data?.recoveryCodes ?? null;
  // Backend rule (django-allauth MFA): 2FA can only be enabled when every address is verified.
  const hasUnverifiedEmail = Boolean(emails.data?.some((address) => !address.verified));

  return (
    <Card aria-labelledby="twofactor-title" id="two-factor">
      <CardHeader
        icon={<Smartphone size={16} />}
        title="Two-factor authentication"
        titleId="twofactor-title"
        description="Require a code from your phone in addition to your password."
      />
      <CardBody>
        {error && <Banner tone="danger">{error}</Banner>}

        {authenticators.isPending ? (
          <div className={styles.formStack}>
            <Skeleton height={18} width="40%" />
            <Skeleton height={14} width="70%" />
          </div>
        ) : authenticators.isError ? (
          <ErrorState error={authenticators.error} onRetry={() => void authenticators.refetch()} retrying={authenticators.isFetching} />
        ) : (
          <>
            <div className={styles.statusBlock}>
              <div className={styles.statusText}>
                <span className={styles.rowTitle}>
                  Authenticator app
                  {totp ? <StatusPill tone="success" label="Enabled" /> : <StatusPill tone="warning" label="Not enabled" />}
                </span>
                <span className={styles.rowMeta}>
                  {totp
                    ? `Enabled ${fromSeconds(totp.created_at)}${totp.last_used_at ? ` · last used ${fromSeconds(totp.last_used_at)}` : ''}`
                    : 'Your account is protected by your password only.'}
                </span>
              </div>
              {totp ? (
                <Button variant="secondary" size="sm" onClick={() => setConfirm('disable')} disabled={busy !== null}>
                  Disable
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void startSetup()}
                  loading={busy === 'enable'}
                  disabled={hasUnverifiedEmail}
                >
                  Enable
                </Button>
              )}
            </div>
            {!totp && hasUnverifiedEmail && (
              <p className={styles.mutedNote}>
                Verify or remove your unverified email addresses before enabling two-factor authentication.
              </p>
            )}

            {totp && recovery && (
              <>
                <div className={styles.divider} />
                <div className={styles.statusBlock}>
                  <div className={styles.statusText}>
                    <span className={styles.rowTitle}>
                      <KeyRound size={14} /> Recovery codes
                      <StatusPill
                        tone={recovery.unused_code_count <= 2 ? 'warning' : 'neutral'}
                        label={`${recovery.unused_code_count} of ${recovery.total_code_count} left`}
                      />
                    </span>
                    <span className={styles.rowMeta}>Use one if you lose access to your authenticator app.</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<RefreshCw size={14} />}
                    onClick={() => setConfirm('regenerate')}
                    disabled={busy !== null}
                  >
                    Regenerate
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </CardBody>

      <TotpSetupDialog
        setup={setup}
        onClose={() => setSetup(null)}
        onActivated={() => {
          refresh();
          notify({ tone: 'success', title: 'Two-factor authentication enabled' });
        }}
      />

      <ConfirmDialog
        open={confirm === 'disable'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Disable two-factor authentication?"
        description="Signing in will only require your password. Your recovery codes stop working."
        confirmLabel="Disable 2FA"
        loading={busy === 'disable'}
        onConfirm={() => void disable()}
      />
      <ConfirmDialog
        open={confirm === 'regenerate'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Regenerate recovery codes?"
        description="Your current recovery codes stop working immediately. New codes are shown once."
        confirmLabel="Regenerate codes"
        tone="primary"
        loading={busy === 'regenerate'}
        onConfirm={() => void regenerate()}
      />

      <Modal
        open={newCodes !== null}
        onOpenChange={(open) => !open && setNewCodes(null)}
        size="md"
        icon={<KeyRound size={18} />}
        title="New recovery codes"
        footer={
          <Button variant="primary" onClick={() => setNewCodes(null)}>
            I have stored them
          </Button>
        }
      >
        {newCodes && <RecoveryCodesPanel codes={newCodes} />}
      </Modal>
    </Card>
  );
}
