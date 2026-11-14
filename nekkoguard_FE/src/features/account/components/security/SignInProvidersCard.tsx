import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Unlink } from 'lucide-react';
import { useState } from 'react';
import { allauth, redirectToProvider } from '@/api/allauth';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { ProviderAccountDto } from '@/api/types';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useToast } from '@/components/Toast/useToast';
import { ProviderIcon } from '@/features/auth/components/ProviderIcon';
import { useAuthConfig } from '@/features/auth/hooks/useAuthConfig';
import { providerCallbackUrl } from '@/features/auth/providerCallback';
import { isReauthCancelled } from '@/features/auth/reauth/ReauthContext';
import { useWithReauth } from '@/features/auth/reauth/useWithReauth';
import styles from './Security.module.css';

/**
 * Google / GitHub / LinkedIn accounts linked for signing in (allauth socialaccount).
 * Not to be confused with Connected Applications (apps registered within NekkoGuard).
 * Hidden when the backend has no providers configured and nothing is linked.
 */
export function SignInProvidersCard() {
  const { data: config } = useAuthConfig();
  const accounts = useQuery({
    queryKey: queryKeys.providerAccounts,
    queryFn: allauth.listProviderAccounts,
    select: (envelope) => envelope.data ?? [],
  });
  const queryClient = useQueryClient();
  const withReauth = useWithReauth();
  const { notify } = useToast();
  const [toRemove, setToRemove] = useState<ProviderAccountDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providers = (config?.socialaccount?.providers ?? []).filter((provider) => provider.flows.includes('provider_redirect'));
  const linked = accounts.data ?? [];
  if (providers.length === 0 && linked.length === 0) return null;

  const linkedIds = new Set(linked.map((account) => account.provider.id));

  async function disconnect(account: ProviderAccountDto) {
    setBusy(account.uid);
    setError(null);
    try {
      const result = await withReauth(() => allauth.disconnectProviderAccount(account.provider.id, account.uid));
      queryClient.setQueryData(queryKeys.providerAccounts, result);
      notify({ tone: 'success', title: `${account.provider.name} unlinked` });
    } catch (caught) {
      if (!isReauthCancelled(caught)) setError(getErrorMessage(caught));
    } finally {
      setBusy(null);
      setToRemove(null);
    }
  }

  return (
    <Card aria-labelledby="providers-title" id="sign-in-providers">
      <CardHeader
        icon={<Link2 size={16} />}
        title="Sign-in providers"
        titleId="providers-title"
        description="Accounts from other services you can use to sign in to NekkoGuard."
      />
      <CardBody>
        {error && <Banner tone="danger">{error}</Banner>}
        {accounts.isPending ? (
          <Skeleton height={18} width="50%" />
        ) : accounts.isError ? (
          <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} retrying={accounts.isFetching} />
        ) : (
          <ul className={styles.list}>
            {linked.map((account) => (
              <li key={`${account.provider.id}-${account.uid}`} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    <ProviderIcon provider={account.provider.id} /> {account.provider.name}
                    <StatusPill tone="success" label="Linked" />
                  </span>
                  <span className={styles.rowMeta}>{account.display}</span>
                </div>
                <div className={styles.rowActions}>
                  <Button size="sm" variant="ghost" leftIcon={<Unlink size={14} />} disabled={busy !== null} onClick={() => setToRemove(account)}>
                    Unlink
                  </Button>
                </div>
              </li>
            ))}
            {providers
              .filter((provider) => !linkedIds.has(provider.id))
              .map((provider) => (
                <li key={provider.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      <ProviderIcon provider={provider.id} /> {provider.name}
                      <StatusPill tone="neutral" label="Not linked" />
                    </span>
                  </div>
                  <div className={styles.rowActions}>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === provider.id}
                      disabled={busy !== null}
                      onClick={() => {
                        setBusy(provider.id);
                        redirectToProvider(provider.id, 'connect', providerCallbackUrl('', { process: 'connect' }));
                      }}
                    >
                      Link
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </CardBody>

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => !open && setToRemove(null)}
        title={`Unlink ${toRemove?.provider.name ?? ''}?`}
        description="You will no longer be able to sign in with this account. The server refuses this if it would leave you without a way to sign in."
        confirmLabel="Unlink"
        loading={busy !== null}
        onConfirm={() => toRemove && void disconnect(toRemove)}
      />
    </Card>
  );
}
