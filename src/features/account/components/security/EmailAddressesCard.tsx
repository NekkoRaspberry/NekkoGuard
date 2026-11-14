import { useQueryClient } from '@tanstack/react-query';
import { Mail, Plus, Send, Star, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { allauth } from '@/api/allauth';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { AllauthEnvelope, EmailAddressDto } from '@/api/types';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { TextField } from '@/components/TextField/TextField';
import { useToast } from '@/components/Toast/useToast';
import { isReauthCancelled } from '@/features/auth/reauth/ReauthContext';
import { useWithReauth } from '@/features/auth/reauth/useWithReauth';
import { isValidEmail } from '@/features/auth/validation';
import { useAuthenticators, useEmailAddresses } from '../../hooks/useSecurityData';
import styles from './Security.module.css';

type RowAction = 'primary' | 'resend' | 'remove';

export function EmailAddressesCard() {
  const emails = useEmailAddresses();
  const twoFactorEnabled = Boolean(useAuthenticators().data?.totp);
  const queryClient = useQueryClient();
  const withReauth = useWithReauth();
  const { notify } = useToast();

  const [newEmail, setNewEmail] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<{ email: string; action: RowAction } | null>(null);
  const [toRemove, setToRemove] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function storeList(envelope: AllauthEnvelope<EmailAddressDto[]>) {
    if (envelope.data) queryClient.setQueryData(queryKeys.emails, envelope);
    // The primary address is also the user's email (DRF + allauth session).
    void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser });
    void queryClient.invalidateQueries({ queryKey: queryKeys.session });
  }

  async function runRow(email: string, action: RowAction) {
    setBusy({ email, action });
    setActionError(null);
    try {
      if (action === 'primary') {
        storeList(await withReauth(() => allauth.makePrimaryEmail(email)));
        notify({ tone: 'success', title: 'Primary email changed', description: `${email} is now your sign-in address.` });
      } else if (action === 'resend') {
        await withReauth(() => allauth.resendEmailVerification(email));
        notify({ tone: 'info', title: 'Verification email sent', description: `Check the inbox of ${email}.` });
      } else {
        storeList(await withReauth(() => allauth.removeEmail(email)));
        notify({ tone: 'success', title: 'Email removed', description: `${email} was removed from your account.` });
        setToRemove(null);
      }
    } catch (error) {
      if (!isReauthCancelled(error)) setActionError(getErrorMessage(error));
      if (action === 'remove') setToRemove(null);
    } finally {
      setBusy(null);
    }
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidEmail(newEmail)) {
      setAddError('Enter a valid email address.');
      return;
    }
    setAdding(true);
    try {
      const address = newEmail.trim();
      storeList(await withReauth(() => allauth.addEmail(address)));
      notify({ tone: 'success', title: 'Email added', description: `We sent a verification link to ${address}.` });
      setNewEmail('');
    } catch (error) {
      if (!isReauthCancelled(error)) setAddError(getErrorMessage(error, 'Could not add the email address.'));
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card aria-labelledby="emails-title" id="emails">
      <CardHeader
        icon={<Mail size={16} />}
        title="Email addresses"
        titleId="emails-title"
        description="Your primary address is used to sign in and for account emails."
      />
      <CardBody>
        {actionError && <Banner tone="danger">{actionError}</Banner>}

        {emails.isPending ? (
          <div className={styles.formStack}>
            <Skeleton height={18} width="60%" />
            <Skeleton height={18} width="45%" />
          </div>
        ) : emails.isError ? (
          <ErrorState error={emails.error} onRetry={() => void emails.refetch()} retrying={emails.isFetching} />
        ) : (
          <ul className={styles.list}>
            {emails.data.map((address) => {
              const isBusy = (action: RowAction) => busy?.email === address.email && busy.action === action;
              return (
                <li key={address.email} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      {address.email}
                      {address.primary && <StatusPill tone="primary" label="Primary" />}
                      {address.verified ? (
                        <StatusPill tone="success" label="Verified" />
                      ) : (
                        <StatusPill tone="warning" label="Unverified" />
                      )}
                    </span>
                  </div>
                  <div className={styles.rowActions}>
                    {!address.verified && (
                      <Button size="sm" variant="ghost" leftIcon={<Send size={14} />} loading={isBusy('resend')} disabled={busy !== null} onClick={() => void runRow(address.email, 'resend')}>
                        Resend link
                      </Button>
                    )}
                    {address.verified && !address.primary && (
                      <Button size="sm" variant="ghost" leftIcon={<Star size={14} />} loading={isBusy('primary')} disabled={busy !== null} onClick={() => void runRow(address.email, 'primary')}>
                        Make primary
                      </Button>
                    )}
                    {!address.primary && (
                      <Button size="sm" variant="ghost" leftIcon={<Trash2 size={14} />} disabled={busy !== null} onClick={() => setToRemove(address.email)} aria-label={`Remove ${address.email}`}>
                        Remove
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className={styles.divider} />

        {twoFactorEnabled ? (
          // Backend rule (django-allauth MFA): no new addresses while 2FA protects the account.
          <p className={styles.mutedNote}>
            New email addresses can’t be added while two-factor authentication is enabled. Disable it first, add the
            address, then enable it again.
          </p>
        ) : (
          <form className={styles.inlineForm} onSubmit={handleAdd} noValidate>
            <TextField
              label="Add an email address"
              type="email"
              name="new-email"
              autoComplete="email"
              inputMode="email"
              placeholder="another@example.com"
              value={newEmail}
              onChange={(event) => {
                setNewEmail(event.target.value);
                setAddError(null);
              }}
              error={addError}
              disabled={adding}
            />
            <Button type="submit" variant="secondary" loading={adding} leftIcon={<Plus size={16} />}>
              Add
            </Button>
          </form>
        )}
      </CardBody>

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => !open && setToRemove(null)}
        title="Remove email address?"
        description={
          <>
            <strong>{toRemove}</strong> will no longer be linked to your account and cannot be used to sign in.
          </>
        }
        confirmLabel="Remove email"
        loading={busy?.action === 'remove'}
        onConfirm={() => toRemove && void runRow(toRemove, 'remove')}
      />
    </Card>
  );
}
