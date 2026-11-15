import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi, type OrganizationDto } from '@/api/tenancy';
import { ROUTES } from '@/app/routes';
import { Button, ButtonLink } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { TableExportButton } from '@/components/DataTable/TableExport';
import { useTableExport } from '@/components/DataTable/useTableExport';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useToast } from '@/components/Toast/useToast';
import { useCanTenant } from '@/features/tenancy/hooks';
import { manageOrganization } from '../managedOrganization';
import { TENANT_PERMISSIONS } from '@/features/tenancy/model';
import { NameDescriptionDialog } from '@/features/tenancy/components/NameDescriptionDialog';
import { useTenantName } from '@/features/tenancy/hooks';
import styles from '@/features/tenancy/components/Management.module.css';

/**
 * Organizations of the current Tenant. Tenant administrators see all of them; "Your
 * access" shows separately whether they also reach the infrastructure.
 */
export function TenantOrganizationsCard({ tenantId }: { tenantId: string }) {
  const tenantName = useTenantName(tenantId);
  const exporter = useTableExport();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const canManageOrganizations = useCanTenant(TENANT_PERMISSIONS.manageOrganizations);
  const canManageMembers = useCanTenant(TENANT_PERMISSIONS.manageMembers);
  const [creating, setCreating] = useState(false);

  const organizations = useQuery({
    queryKey: queryKeys.organizations(tenantId),
    queryFn: ({ signal }) => tenancyApi.listOrganizations(tenantId, signal),
  });

  const columns: Column<OrganizationDto>[] = [
    {
      key: 'name',
      header: 'Organization',
      sortValue: (o) => o.name,
      render: (o) => (
        <span className={styles.twoLine}>
          <span className={styles.primary}>{o.name}</span>
          {o.description && <span className={styles.sub}>{o.description}</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (o) => o.is_active,
      exportValue: (o) => (o.is_active ? 'Active' : 'Deactivated'),
      render: (o) => <StatusPill tone={o.is_active ? 'success' : 'neutral'} label={o.is_active ? 'Active' : 'Deactivated'} />,
      secondary: true,
    },
    {
      key: 'access',
      header: 'Your access',
      sortValue: (o) => Number(o.can_administer) * 2 + Number(o.has_access),
      exportValue: (o) => [o.can_administer && 'Administration', o.has_access && 'Infrastructure'].filter(Boolean).join(', '),
      render: (o) => (
        <span className={styles.chips}>
          {o.can_administer && <StatusPill tone="primary" label="Administration" />}
          {o.has_access && <StatusPill tone="info" label="Infrastructure" />}
        </span>
      ),
    },
  ];
  if (canManageOrganizations || canManageMembers) {
    columns.push({
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      align: 'end',
      // Only organizations in the caller's organization scope can be managed.
      render: (o) =>
        o.can_administer ? (
          <ButtonLink size="sm" variant="secondary" to={ROUTES.tenantOrganization} state={manageOrganization(o.id)}>
            Manage
          </ButtonLink>
        ) : null,
    });
  }

  return (
    <Card aria-labelledby="tenant-orgs-title">
      <CardHeader
        icon={<Building2 size={16} />}
        title="Organizations"
        titleId="tenant-orgs-title"
        description={`Infrastructure environments of ${tenantName}. Creating one gives nobody access automatically.`}
        actions={
          <>
            <TableExportButton exporter={exporter} />
            {canManageOrganizations && (
              <Button size="sm" variant="primary" leftIcon={<Plus size={14} />} onClick={() => setCreating(true)}>
                New organization
              </Button>
            )}
          </>
        }
      />
      <CardBody>
        {organizations.isPending ? (
          <Skeleton height={60} radius="sm" />
        ) : organizations.isError ? (
          <ErrorState error={organizations.error} onRetry={() => void organizations.refetch()} retrying={organizations.isFetching} />
        ) : (
          <DataTable
            label="Organizations"
            exportOwner={tenantName}
            exporter={exporter}
            columns={columns}
            rows={organizations.data}
            rowKey={(o) => o.id}
            empty="No organizations yet."
          />
        )}
      </CardBody>
      {creating && (
        <NameDescriptionDialog
          open
          onOpenChange={setCreating}
          icon={<Building2 size={18} />}
          title="New organization"
          description={`Then give people access: direct members, or an organization access policy of ${tenantName}.`}
          submitLabel="Create"
          onSubmit={(values) => tenancyApi.createOrganization(tenantId, values)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.organizations(tenantId) });
            notify({ tone: 'success', title: 'Organization created' });
          }}
        />
      )}
    </Card>
  );
}
