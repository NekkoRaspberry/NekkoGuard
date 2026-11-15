import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi, type SiteDto } from '@/api/tenancy';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { TableExportButton } from '@/components/DataTable/TableExport';
import { useTableExport } from '@/components/DataTable/useTableExport';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { useToast } from '@/components/Toast/useToast';
import { useCan, useOrganizationName } from '@/features/tenancy/hooks';
import { PERMISSIONS } from '@/features/tenancy/model';
import { NameDescriptionDialog } from '@/features/tenancy/components/NameDescriptionDialog';
import type { OrganizationScope } from '@/features/tenancy/components/ScopeGate';
import styles from '@/features/tenancy/components/Management.module.css';

type Editing = { mode: 'create' } | { mode: 'edit'; site: SiteDto } | null;

export function SitesCard({ scope }: { scope: OrganizationScope }) {
  const { tenantId, orgId } = scope;
  const organizationName = useOrganizationName(tenantId, orgId);
  const exporter = useTableExport();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const canManage = useCan(PERMISSIONS.manageSites);
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<SiteDto | null>(null);

  const sites = useQuery({
    queryKey: queryKeys.sites(tenantId, orgId),
    queryFn: ({ signal }) => tenancyApi.listSites(tenantId, orgId, signal),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.sites(tenantId, orgId) });
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.organizationScope(tenantId, orgId), 'networks'] });
  };

  const remove = useMutation({
    mutationFn: (site: SiteDto) => tenancyApi.deleteSite(tenantId, orgId, site.id),
    onSuccess: (_, site) => {
      refresh();
      notify({ tone: 'success', title: 'Site deleted', description: `${site.name} and its networks were removed.` });
      setToDelete(null);
    },
  });

  const columns: Column<SiteDto>[] = [
    {
      key: 'name',
      header: 'Site',
      sortValue: (site) => site.name,
      render: (site) => (
        <span className={styles.twoLine}>
          <span className={styles.primary}>{site.name}</span>
          {site.description && <span className={styles.sub}>{site.description}</span>}
        </span>
      ),
    },
    { key: 'networks', header: 'Networks', render: (site) => site.network_count, sortValue: (site) => site.network_count },
  ];
  if (canManage) {
    columns.push({
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      align: 'end',
      render: (site) => (
        <span className={styles.rowActions}>
          <Button size="sm" variant="ghost" iconOnly aria-label={`Edit ${site.name}`} onClick={() => setEditing({ mode: 'edit', site })}>
            <Pencil size={14} />
          </Button>
          <Button size="sm" variant="ghost" iconOnly aria-label={`Delete ${site.name}`} onClick={() => setToDelete(site)}>
            <Trash2 size={14} />
          </Button>
        </span>
      ),
    });
  }

  return (
    <Card aria-labelledby="sites-title">
      <CardHeader
        icon={<MapPin size={16} />}
        title="Sites"
        titleId="sites-title"
        description="Physical or logical locations: home, office, data center…"
        actions={
          <>
            <TableExportButton exporter={exporter} />
            {canManage && (
              <Button size="sm" variant="primary" leftIcon={<Plus size={14} />} onClick={() => setEditing({ mode: 'create' })}>
                Add site
              </Button>
            )}
          </>
        }
      />
      <CardBody>
        {remove.isError && <Banner tone="danger">{getErrorMessage(remove.error)}</Banner>}
        {sites.isPending ? (
          <Skeleton height={60} radius="sm" />
        ) : sites.isError ? (
          <ErrorState error={sites.error} onRetry={() => void sites.refetch()} retrying={sites.isFetching} />
        ) : (
          <DataTable
            label="Sites"
            columns={columns}
            rows={sites.data}
            rowKey={(site) => site.id}
            empty="No sites yet."
            exportOwner={organizationName}
            exporter={exporter}
          />
        )}
      </CardBody>

      {editing && (
        <NameDescriptionDialog
          key={editing.mode === 'edit' ? editing.site.id : 'new'}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          icon={<MapPin size={18} />}
          title={editing.mode === 'edit' ? `Edit ${editing.site.name}` : 'Add a site'}
          initial={editing.mode === 'edit' ? editing.site : undefined}
          submitLabel={editing.mode === 'edit' ? 'Save' : 'Add site'}
          onSubmit={(values) =>
            editing.mode === 'edit'
              ? tenancyApi.updateSite(tenantId, orgId, editing.site.id, values)
              : tenancyApi.createSite(tenantId, orgId, values)
          }
          onSaved={() => {
            refresh();
            notify({ tone: 'success', title: editing.mode === 'edit' ? 'Site updated' : 'Site added' });
          }}
        />
      )}
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Delete ${toDelete?.name ?? ''}?`}
        description="All networks of this site are deleted too. This cannot be undone."
        confirmLabel="Delete site"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </Card>
  );
}
