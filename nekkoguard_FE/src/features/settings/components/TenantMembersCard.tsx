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
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useToast } from '@/components/Toast/useToast';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { ORGANIZATION_ROLE_LABELS, TENANT_ROLE_LABELS } from '@/features/tenancy/model';
import styles from '@/features/tenancy/components/Management.module.css';
import { TenantMemberDialog } from './TenantMemberDialog';

function accessSummary(m: TenantMembershipDto): string {
  if (m.organization_access === 'none') return 'No organizations';
  const role = m.default_organization_role ? ORGANIZATION_ROLE_LABELS[m.default_organization_role] : '—';
  if (m.organization_access === 'all') return `All organizations · ${role}`;
  const count = m.selected_organizations.length;
  return `${count} selected · ${role}`;
}

export function TenantMembersCard({ tenantId, myRole }: { tenantId: string; myRole: string | null }) {
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

  const isOwner = myRole === 'owner';
  const columns: Column<TenantMembershipDto>[] = [
    {
      key: 'user',
      header: 'Member',
      render: (m) => (
        <span className={styles.twoLine}>
          <span className={styles.primary}>{m.user.name || m.user.email}</span>
          {m.user.name && <span className={styles.sub}>{m.user.email}</span>}
        </span>
      ),
    },
    { key: 'role', header: 'Tenant role', render: (m) => TENANT_ROLE_LABELS[m.role] },
    { key: 'access', header: 'Organization access', render: (m) => accessSummary(m), secondary: true },
    {
      key: 'status',
      header: 'Status',
      render: (m) => <StatusPill tone={m.status === 'active' ? 'success' : 'warning'} label={m.status === 'active' ? 'Active' : 'Suspended'} />,
      secondary: true,
    },
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      align: 'end',
      render: (m) => {
        const isSelf = m.user.id === me?.id;
        return (
          <span className={styles.rowActions}>
            {/* Owners may adjust their own organization access; nobody else edits themselves. */}
            {(!isSelf || isOwner) && (
              <Button size="sm" variant="ghost" iconOnly aria-label={`Edit ${m.user.email}`} onClick={() => setEditing({ member: m })}>
                <Pencil size={14} />
              </Button>
            )}
            {!isSelf && (
              <Button size="sm" variant="ghost" iconOnly aria-label={`Remove ${m.user.email}`} onClick={() => setToRemove(m)}>
                <Trash2 size={14} />
              </Button>
            )}
          </span>
        );
      },
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
          <Button size="sm" variant="primary" leftIcon={<Plus size={14} />} onClick={() => setEditing({})}>
            Add member
          </Button>
        }
      />
      <CardBody>
        {remove.isError && <Banner tone="danger">{getErrorMessage(remove.error)}</Banner>}
        {members.isPending ? (
          <Skeleton height={60} radius="sm" />
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => void members.refetch()} retrying={members.isFetching} />
        ) : (
          <DataTable label="Tenant members" columns={columns} rows={members.data} rowKey={(m) => m.id} empty="No members." />
        )}
      </CardBody>
      {editing && (
        <TenantMemberDialog
          tenantId={tenantId}
          member={editing.member}
          organizations={organizations.data ?? []}
          isSelf={editing.member?.user.id === me?.id}
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
        description="They lose their tenant role and the organization access it gave. Direct organization memberships stay until removed."
        confirmLabel="Remove member"
        loading={remove.isPending}
        onConfirm={() => toRemove && remove.mutate(toRemove)}
      />
    </Card>
  );
}
