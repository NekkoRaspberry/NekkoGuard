import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { getErrorMessage } from '@/api/errors';
import { oauthApps, type OAuthApplicationDto } from '@/api/oauthApps';
import { queryKeys } from '@/api/queryKeys';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useToast } from '@/components/Toast/useToast';
import { formatDateTime } from '@/lib/format';
import styles from './Apps.module.css';
import { RegisterAppDialog } from './RegisterAppDialog';

/** Staff only: applications registered within NekkoGuard. */
export function RegisteredAppsCard() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [registering, setRegistering] = useState(false);
  const [toDelete, setToDelete] = useState<OAuthApplicationDto | null>(null);
  const apps = useQuery({ queryKey: queryKeys.oauthApplications, queryFn: oauthApps.listApplications });

  const remove = useMutation({
    mutationFn: (app: OAuthApplicationDto) => oauthApps.deleteApplication(app.id),
    onSuccess: (_, app) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.oauthApplications });
      void queryClient.invalidateQueries({ queryKey: queryKeys.authorizedApps });
      notify({ tone: 'success', title: 'Application deleted', description: `${app.name} was removed.` });
      setToDelete(null);
    },
  });

  return (
    <Card aria-labelledby="registered-apps-title">
      <CardHeader
        icon={<Settings2 size={16} />}
        title="Registered applications"
        titleId="registered-apps-title"
        description="Administrators register the applications users can connect."
        actions={
          <Button size="sm" variant="primary" leftIcon={<Plus size={14} />} onClick={() => setRegistering(true)}>
            Register
          </Button>
        }
      />
      <CardBody>
        {remove.isError && <Banner tone="danger">{getErrorMessage(remove.error)}</Banner>}
        {apps.isPending ? (
          <Skeleton height={40} radius="sm" />
        ) : apps.isError ? (
          <ErrorState error={apps.error} onRetry={() => void apps.refetch()} retrying={apps.isFetching} />
        ) : apps.data.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Settings2 size={20} />
            </span>
            <span className={styles.emptyTitle}>No applications registered</span>
            <span>Register an application to let it ask users for access to their NekkoGuard profile.</span>
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
                    <StatusPill
                      tone="neutral"
                      label={app.client_type === 'confidential' ? 'Server-side' : 'Browser / mobile'}
                    />
                  </span>
                  <span className={styles.mono} title="Client ID">
                    {app.client_id}
                  </span>
                  <span className={styles.meta}>
                    Redirects to {app.redirect_uris.join(', ')} · registered {formatDateTime(Date.parse(app.created))}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Trash2 size={14} />}
                  onClick={() => setToDelete(app)}
                  aria-label={`Delete ${app.name}`}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <RegisterAppDialog open={registering} onOpenChange={setRegistering} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Delete ${toDelete?.name ?? ''}?`}
        description="Every user loses this connection immediately, and the client ID and secret stop working. This cannot be undone."
        confirmLabel="Delete application"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </Card>
  );
}
