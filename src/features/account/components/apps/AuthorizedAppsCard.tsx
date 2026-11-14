import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppWindow, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { getErrorMessage } from '@/api/errors';
import { oauthApps, type AuthorizedAppDto } from '@/api/oauthApps';
import { queryKeys } from '@/api/queryKeys';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useToast } from '@/components/Toast/useToast';
import { useNow } from '@/hooks/useNow';
import { formatDateTime, formatRelative } from '@/lib/format';
import styles from './Apps.module.css';

const SCOPE_LABELS: Record<string, string> = {
  profile: 'Read profile',
  openid: 'Confirm identity',
};

/** Applications this user approved; revoking ends their access immediately. */
export function AuthorizedAppsCard() {
  const now = useNow(60_000);
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [toRevoke, setToRevoke] = useState<AuthorizedAppDto | null>(null);
  const apps = useQuery({ queryKey: queryKeys.authorizedApps, queryFn: oauthApps.listAuthorized });

  const revoke = useMutation({
    mutationFn: (app: AuthorizedAppDto) => oauthApps.revokeAuthorized(app.id),
    onSuccess: (_, app) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.authorizedApps });
      notify({ tone: 'success', title: 'Access revoked', description: `${app.name} can no longer access your account.` });
      setToRevoke(null);
    },
  });

  return (
    <Card aria-labelledby="authorized-apps-title">
      <CardHeader
        icon={<AppWindow size={16} />}
        title="Authorized applications"
        titleId="authorized-apps-title"
        description="Applications you allowed to access your NekkoGuard account."
      />
      <CardBody>
        {revoke.isError && <Banner tone="danger">{getErrorMessage(revoke.error)}</Banner>}
        {apps.isPending ? (
          <Skeleton height={40} radius="sm" />
        ) : apps.isError ? (
          <ErrorState error={apps.error} onRetry={() => void apps.refetch()} retrying={apps.isFetching} />
        ) : apps.data.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <AppWindow size={20} />
            </span>
            <span className={styles.emptyTitle}>No connected applications</span>
            <span>
              When an application asks to use your NekkoGuard account, you approve it on a consent screen. It then
              appears here, and you can revoke it at any time.
            </span>
          </div>
        ) : (
          <ul className={styles.list}>
            {apps.data.map((app) => (
              <li key={app.id} className={styles.row}>
                <span className={styles.appIcon} aria-hidden="true">
                  {app.name.slice(0, 1).toUpperCase()}
                </span>
                <div className={styles.main}>
                  <span className={styles.title}>
                    {app.name}
                    <StatusPill tone="success" label="Connected" />
                  </span>
                  <div className={styles.chips}>
                    {app.scopes.map((scope) => (
                      <StatusPill key={scope} tone="neutral" label={SCOPE_LABELS[scope] ?? scope} />
                    ))}
                  </div>
                  <span className={styles.meta} title={`Authorized ${formatDateTime(Date.parse(app.authorized_at))}`}>
                    Authorized {formatRelative(Date.parse(app.authorized_at), now)} · last activity{' '}
                    {formatRelative(Date.parse(app.last_used), now)}
                  </span>
                </div>
                <Button size="sm" variant="secondary" leftIcon={<ShieldOff size={14} />} onClick={() => setToRevoke(app)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(open) => !open && setToRevoke(null)}
        title={`Revoke access for ${toRevoke?.name ?? ''}?`}
        description="The application loses access immediately. To use it again, you will have to approve it again."
        confirmLabel="Revoke access"
        loading={revoke.isPending}
        onConfirm={() => toRevoke && revoke.mutate(toRevoke)}
      />
    </Card>
  );
}
