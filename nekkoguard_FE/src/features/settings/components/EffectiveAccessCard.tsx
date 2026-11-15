import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi, type Effect, type EffectiveAccessDto, type PermissionOverrideDto } from '@/api/tenancy';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { TableExportButton } from '@/components/DataTable/TableExport';
import { useTableExport } from '@/components/DataTable/useTableExport';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Modal } from '@/components/Modal/Modal';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { useOrganizationName, useTenantName } from '@/features/tenancy/hooks';
import { ORGANIZATION_ROLE_LABELS, ORGANIZATION_ROLES } from '@/features/tenancy/model';
import styles from '@/features/tenancy/components/Management.module.css';
import { cx } from '@/lib/cx';
import { DecisionTable } from './DecisionTable';

interface Scope {
  tenantId: string;
  orgId: string;
}

type Choice = 'inherit' | Effect;
const CHOICES: { value: Choice; label: string }[] = [
  { value: 'inherit', label: 'Inherit' },
  { value: 'grant', label: 'Grant' },
  { value: 'deny', label: 'Deny' },
];

function displayName(access: EffectiveAccessDto): string {
  return access.user.name || access.user.email;
}

function HowCell({ access }: { access: EffectiveAccessDto }) {
  const tenantName = useTenantName();
  return (
    <span className={styles.chips}>
      {access.organization_role && (
        <StatusPill tone="info" label={`Direct: ${ORGANIZATION_ROLE_LABELS[access.organization_role]}`} />
      )}
      {access.inherited_role && (
        <StatusPill tone="neutral" label={`From ${tenantName}: ${ORGANIZATION_ROLE_LABELS[access.inherited_role]}`} />
      )}
    </span>
  );
}

function OverrideEditor({
  scope,
  access,
  overrides,
  readOnly,
  onClose,
}: {
  scope: Scope;
  access: EffectiveAccessDto;
  overrides: PermissionOverrideDto[];
  /** Without members.manage: the person's permissions are shown, not changeable. */
  readOnly: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const organizationName = useOrganizationName(scope.tenantId, scope.orgId);
  const exporter = useTableExport();
  const mine = new Map(overrides.filter((o) => o.user.id === access.user.id).map((o) => [o.permission, o]));

  const change = useMutation({
    mutationFn: ({ permission, choice }: { permission: string; choice: Choice }) => {
      const existing = mine.get(permission);
      if (choice === 'inherit') {
        return existing ? tenancyApi.removeOverride(scope.tenantId, scope.orgId, existing.id) : Promise.resolve(null);
      }
      return tenancyApi.setOverride(scope.tenantId, scope.orgId, { user: access.user.id, permission, effect: choice });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.overrides(scope.tenantId, scope.orgId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.accessList(scope.tenantId, scope.orgId) });
    },
  });

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      icon={<KeyRound size={18} />}
      title={`Permissions of ${displayName(access)}`}
      description={
        readOnly
          ? 'What this person may do in this organization, and where each permission comes from.'
          : "Inherit uses the person's roles. Grant and Deny apply to this organization only; an explicit Deny always wins."
      }
      footer={
        <>
          <TableExportButton exporter={exporter} />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className={styles.stack}>
        <HowCell access={access} />
        {change.isError && <Banner tone="danger">{getErrorMessage(change.error)}</Banner>}
        <DecisionTable
          decisions={access.decisions}
          label={`Permissions of ${displayName(access)}`}
          exportOwner={organizationName}
          exporter={exporter}
          extra={readOnly ? undefined : {
            header: 'Override',
            render: (decision) => {
              const current: Choice = mine.get(decision.permission)?.effect ?? 'inherit';
              return (
                <span className={styles.segmented} role="radiogroup" aria-label={`Override for ${decision.permission}`}>
                  {CHOICES.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      role="radio"
                      aria-checked={current === choice.value}
                      className={cx(styles.segment, current === choice.value && styles.segmentActive)}
                      disabled={change.isPending}
                      onClick={() =>
                        current !== choice.value && change.mutate({ permission: decision.permission, choice: choice.value })
                      }
                    >
                      {choice.label}
                    </button>
                  ))}
                </span>
              );
            },
          }}
        />
      </div>
    </Modal>
  );
}

/**
 * Everyone who reaches the Organization, how, and with which effective permissions.
 * Read-only (a "View" per person) unless `canManage` (members.manage).
 */
export function EffectiveAccessCard({ scope, canManage }: { scope: Scope; canManage: boolean }) {
  const { tenantId, orgId } = scope;
  const tenantName = useTenantName(tenantId);
  const organizationName = useOrganizationName(tenantId, orgId);
  const exporter = useTableExport();
  const me = useCurrentUser().data;
  const [editingUser, setEditingUser] = useState<number | null>(null);

  const accessList = useQuery({
    queryKey: queryKeys.accessList(tenantId, orgId),
    queryFn: ({ signal }) => tenancyApi.accessList(tenantId, orgId, signal),
  });
  const overrides = useQuery({
    queryKey: queryKeys.overrides(tenantId, orgId),
    queryFn: ({ signal }) => tenancyApi.listOverrides(tenantId, orgId, signal),
  });

  const columns: Column<EffectiveAccessDto>[] = [
    {
      key: 'user',
      header: 'Person',
      sortValue: (a) => displayName(a),
      exportValue: (a) => (a.user.name ? `${a.user.name} (${a.user.email})` : a.user.email),
      render: (a) => (
        <span className={styles.twoLine}>
          <span className={styles.primary}>{displayName(a)}</span>
          {a.user.name && <span className={styles.sub}>{a.user.email}</span>}
        </span>
      ),
    },
    {
      key: 'how',
      header: 'Access through',
      render: (a) => <HowCell access={a} />,
      exportValue: (a) =>
        [
          a.organization_role && `Direct: ${ORGANIZATION_ROLE_LABELS[a.organization_role]}`,
          a.inherited_role && `From ${tenantName}: ${ORGANIZATION_ROLE_LABELS[a.inherited_role]}`,
        ]
          .filter(Boolean)
          .join('; '),
      // Direct roles before inherited ones, each by rank (owner first).
      sortValue: (a) => {
        const role = a.organization_role ?? a.inherited_role;
        return role ? (a.organization_role ? 0 : ORGANIZATION_ROLES.length) + ORGANIZATION_ROLES.indexOf(role) : null;
      },
      secondary: true,
    },
    {
      key: 'overrides',
      header: 'Overrides',
      sortValue: (a) => a.decisions.filter((d) => d.source === 'override').length,
      render: (a) => {
        const count = a.decisions.filter((d) => d.source === 'override').length;
        return count ? <StatusPill tone="primary" label={`${count} override${count > 1 ? 's' : ''}`} /> : <span className={styles.muted}>—</span>;
      },
      secondary: true,
    },
    {
      key: 'permissions',
      header: 'Allowed',
      sortValue: (a) => a.permissions.length,
      exportValue: (a) => `${a.permissions.length} of ${a.decisions.length}`,
      render: (a) => `${a.permissions.length} of ${a.decisions.length}`,
    },
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      align: 'end',
      render: (a) =>
        !canManage ? (
          <Button size="sm" variant="secondary" onClick={() => setEditingUser(a.user.id)}>
            View
          </Button>
        ) : a.user.id === me?.id ? (
          <span className={styles.sub}>You</span>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setEditingUser(a.user.id)}>
            Permissions
          </Button>
        ),
    },
  ];

  const editing = accessList.data?.find((a) => a.user.id === editingUser);

  return (
    <Card aria-labelledby="access-title">
      <CardHeader
        icon={<ShieldCheck size={16} />}
        title="Permissions"
        titleId="access-title"
        description={`Effective permissions, resolved by the server. Inherited permissions come from the person's access to ${tenantName}; overrides apply to this organization only.`}
        actions={<TableExportButton exporter={exporter} />}
      />
      <CardBody>
        {accessList.isPending || overrides.isPending ? (
          <Skeleton height={80} radius="sm" />
        ) : accessList.isError ? (
          <ErrorState error={accessList.error} onRetry={() => void accessList.refetch()} retrying={accessList.isFetching} />
        ) : overrides.isError ? (
          <ErrorState error={overrides.error} onRetry={() => void overrides.refetch()} retrying={overrides.isFetching} />
        ) : (
          <DataTable
            label="People with access"
            columns={columns}
            rows={accessList.data}
            rowKey={(a) => a.user.id}
            empty="Nobody reaches this organization yet."
            exportOwner={organizationName}
            exporter={exporter}
          />
        )}
      </CardBody>
      {editing && overrides.data && (
        <OverrideEditor
          scope={scope}
          access={editing}
          overrides={overrides.data}
          readOnly={!canManage}
          onClose={() => setEditingUser(null)}
        />
      )}
    </Card>
  );
}
