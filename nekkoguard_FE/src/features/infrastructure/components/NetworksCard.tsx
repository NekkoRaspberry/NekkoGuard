import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Network, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi, type NetworkDto } from '@/api/tenancy';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { useToast } from '@/components/Toast/useToast';
import { useCan, useTenancy } from '@/features/tenancy/hooks';
import { PERMISSIONS } from '@/features/tenancy/model';
import type { OrganizationScope } from '@/features/tenancy/components/ScopeGate';
import styles from '@/features/tenancy/components/Management.module.css';
import { NetworkDialog } from './NetworkDialog';

type Editing = { network?: NetworkDto } | null;

/** Networks of the current Organization, filtered by the Site chosen in the context bar. */
export function NetworksCard({ scope }: { scope: OrganizationScope }) {
  const { tenantId, orgId } = scope;
  const { selection, sites } = useTenancy();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const canManage = useCan(PERMISSIONS.manageNetworks);
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<NetworkDto | null>(null);
  const siteFilter = selection.site;

  const networks = useQuery({
    queryKey: queryKeys.networks(tenantId, orgId, siteFilter),
    queryFn: ({ signal }) => tenancyApi.listNetworks(tenantId, orgId, siteFilter, signal),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.organizationScope(tenantId, orgId), 'networks'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.sites(tenantId, orgId) });
  };

  const remove = useMutation({
    mutationFn: (network: NetworkDto) => tenancyApi.deleteNetwork(tenantId, orgId, network.id),
    onSuccess: (_, network) => {
      refresh();
      notify({ tone: 'success', title: 'Network deleted', description: `${network.name} was removed.` });
      setToDelete(null);
    },
  });

  const siteName = (id: string) => sites?.find((s) => s.id === id)?.name ?? '—';
  const filterName = siteFilter ? siteName(siteFilter) : null;

  const columns: Column<NetworkDto>[] = [
    {
      key: 'name',
      header: 'Network',
      render: (network) => (
        <span className={styles.twoLine}>
          <span className={styles.primary}>{network.name}</span>
          {network.description && <span className={styles.sub}>{network.description}</span>}
        </span>
      ),
    },
    {
      key: 'cidr',
      header: 'Range',
      render: (network) => (network.cidr ? <span className={styles.mono}>{network.cidr}</span> : <span className={styles.muted}>—</span>),
    },
    { key: 'site', header: 'Site', render: (network) => siteName(network.site), secondary: true },
  ];
  if (canManage) {
    columns.push({
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      align: 'end',
      render: (network) => (
        <span className={styles.rowActions}>
          <Button size="sm" variant="ghost" iconOnly aria-label={`Edit ${network.name}`} onClick={() => setEditing({ network })}>
            <Pencil size={14} />
          </Button>
          <Button size="sm" variant="ghost" iconOnly aria-label={`Delete ${network.name}`} onClick={() => setToDelete(network)}>
            <Trash2 size={14} />
          </Button>
        </span>
      ),
    });
  }

  const canAdd = canManage && sites !== undefined && sites.length > 0;

  return (
    <Card aria-labelledby="networks-title">
      <CardHeader
        icon={<Network size={16} />}
        title={filterName ? `Networks at ${filterName}` : 'Networks'}
        titleId="networks-title"
        description={filterName ? 'Filtered by the site chosen above.' : 'Address ranges of every site.'}
        actions={
          canAdd && (
            <Button size="sm" variant="primary" leftIcon={<Plus size={14} />} onClick={() => setEditing({})}>
              Add network
            </Button>
          )
        }
      />
      <CardBody>
        {remove.isError && <Banner tone="danger">{getErrorMessage(remove.error)}</Banner>}
        {networks.isPending ? (
          <Skeleton height={60} radius="sm" />
        ) : networks.isError ? (
          <ErrorState error={networks.error} onRetry={() => void networks.refetch()} retrying={networks.isFetching} />
        ) : (
          <DataTable
            label="Networks"
            columns={columns}
            rows={networks.data}
            rowKey={(network) => network.id}
            empty="No networks yet."
          />
        )}
      </CardBody>

      {editing && sites && (
        <NetworkDialog
          tenantId={tenantId}
          orgId={orgId}
          sites={sites}
          network={editing.network}
          defaultSite={siteFilter}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            refresh();
            notify({ tone: 'success', title: editing.network ? 'Network updated' : `${saved.name} added` });
          }}
        />
      )}
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Delete ${toDelete?.name ?? ''}?`}
        description="This cannot be undone."
        confirmLabel="Delete network"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </Card>
  );
}
