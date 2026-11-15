import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi, type TenantMembershipDto } from '@/api/tenancy';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { TableExportButton } from '@/components/DataTable/TableExport';
import { useTableExport } from '@/components/DataTable/useTableExport';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useToast } from '@/components/Toast/useToast';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { useTenantName } from '@/features/tenancy/hooks';
import { ORGANIZATION_ROLE_LABELS, TENANT_ROLE_LABELS, TENANT_ROLES } from '@/features/tenancy/model';
import styles from '@/features/tenancy/components/Management.module.css';
import { TenantMemberDialog } from './TenantMemberDialog';

function accessSummary(m: TenantMembershipDto): string {
  if (m.organization_access === 'none') return 'No organizations';
  const role = m.default_organization_role ? ORGANIZATION_ROLE_LABELS[m.default_organization_role] : '—';
  if (m.organization_access === 'all') return `All organizations · ${role}`;
  const count = m.selected_organizations.length;
  return `${count} selected · ${role}`;
}

export function TenantMembersCard({ tenantId }: { tenantId: string }) {
  const tenantName = useTenantName(tenantId);
  const exporter = useTableExport();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const me = useCurrentUser().data;
  const [editing, setEditing] = useState<{ member?: TenantMembershipDto } | null>(null);
  const [toRemove, setToRemove] = useState<TenantMembershipDto | null>(null);

  const members = useQuery({
    queryKey: queryKeys.tenantMembers(tenantId),
    queryFn: ({ signal }) => tenancyApi.listTenantMembers(tenantId, signal),
  });
  const organizations = useQuery({
    queryKey: queryKeys.organizations(tenantId),
    queryFn: ({ signal }) => tenancyApi.listOrganizations(tenantId, signal),
  });

  const refresh = () => {
    // Access policies change who reaches which Organization: refresh the whole Tenant scope.
    void queryClient.invalidateQueries({ queryKey: queryKeys.tenantScope(tenantId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
  };

  const remove = useMutation({
    mutationFn: (member: TenantMembershipDto) => tenancyApi.removeTenantMember(tenantId, member.id),
    onSuccess: (_, member) => {
      refresh();
      setToRemove(null);
      notify({ tone: 'success', title: 'Member removed', description: member.user.email });
    },
  });

  const columns: Column<TenantMembershipDto>[] = [
    {
      key: 'user',
      header: 'Member',
      sortValue: (m) => m.user.name || m.user.email,
      exportValue: (m) => (m.user.name ? `${m.user.name} (${m.user.email})` : m.user.email),
      render: (m) => (
        <span className={styles.twoLine}>
          <span className={styles.primary}>{m.user.name || m.user.email}</span>
          {m.user.name && <span className={styles.sub}>{m.user.email}</span>}
        </span>
      ),
    },
    // Roles sort by rank (administrator first), not alphabetically.
    { key: 'role', header: 'Tenant role', render: (m) => TENANT_ROLE_LABELS[m.role], sortValue: (m) => TENANT_ROLES.indexOf(m.role), exportValue: (m) => TENANT_ROLE_LABELS[m.role] },
    { key: 'access', header: 'Organization access', render: (m) => accessSummary(m), sortValue: (m) => accessSummary(m), secondary: true },
    {
      key: 'status',
      header: 'Status',
      sortValue: (m) => m.status,
      exportValue: (m) => (m.status === 'active' ? 'Active' : 'Suspended'),
      render: (m) => <StatusPill tone={m.status === 'active' ? 'success' : 'warning'} label={m.status === 'active' ? 'Active' : 'Suspended'} />,
      secondary: true,
    },
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      align: 'end',
      // The backend decides (role rank and organization scope); nobody edits or removes themselves.
      render: (m) =>
        m.can_manage ? (
          <span className={styles.rowActions}>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Edit ${m.user.email}`} onClick={() => setEditing({ member: m })}>
              <Pencil size={14} />
            </Button>
            {m.user.id !== me?.id && (
              <Button size="sm" variant="ghost" iconOnly aria-label={`Remove ${m.user.email}`} onClick={() => setToRemove(m)}>
                <Trash2 size={14} />
              </Button>
            )}
          </span>
        ) : null,
    },
  ];

  return (
    <Card aria-labelledby="tenant-members-title">
      <CardHeader
        icon={<Users size={16} />}
        title="Tenant members"
        titleId="tenant-members-title"
        description="The tenant role decides administration; the organization access policy decides which infrastructure they reach."
        actions={
          <>
            <TableExportButton exporter={exporter} />
            <Button size="sm" variant="primary" leftIcon={<Plus size={14} />} onClick={() => setEditing({})}>
              Add member
            </Button>
          </>
        }
      />
      <CardBody>
        {remove.isError && <Banner tone="danger">{getErrorMessage(remove.error)}</Banner>}
        {members.isPending ? (
          <Skeleton height={60} radius="sm" />
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => void members.refetch()} retrying={members.isFetching} />
        ) : (
          <DataTable
            label="Tenant members"
            columns={columns}
            rows={members.data}
            rowKey={(m) => m.id}
            empty="No members."
            exportOwner={tenantName}
            exporter={exporter}
          />
        )}
      </CardBody>
      {editing && (
        <TenantMemberDialog
          tenantId={tenantId}
          member={editing.member}
          // Access can only be given to active organizations the caller administers.
          organizations={(organizations.data ?? []).filter((o) => o.can_administer && o.is_active)}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            refresh();
            notify({ tone: 'success', title: message });
          }}
        />
      )}
      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => !open && setToRemove(null)}
        title={`Remove ${toRemove?.user.email ?? ''}?`}
        description={`They lose their role in ${tenantName} and the organization access it gave. Direct organization memberships stay until removed.`}
        confirmLabel="Remove member"
        loading={remove.isPending}
        onConfirm={() => toRemove && remove.mutate(toRemove)}
      />
    </Card>
  );
}
