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
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Modal } from '@/components/Modal/Modal';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { ORGANIZATION_ROLE_LABELS } from '@/features/tenancy/model';
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
  return (
    <span className={styles.chips}>
      {access.organization_role && (
        <StatusPill tone="info" label={`Direct: ${ORGANIZATION_ROLE_LABELS[access.organization_role]}`} />
      )}
      {access.inherited_role && (
        <StatusPill tone="neutral" label={`From tenant: ${ORGANIZATION_ROLE_LABELS[access.inherited_role]}`} />
      )}
    </span>
  );
}

function OverrideEditor({
  scope,
  access,
  overrides,
  onClose,
}: {
  scope: Scope;
  access: EffectiveAccessDto;
  overrides: PermissionOverrideDto[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
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
      size="md"
      icon={<KeyRound size={18} />}
      title={`Permissions of ${displayName(access)}`}
      description="Inherit uses the person's roles. Grant and Deny apply to this organization only; an explicit Deny always wins."
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className={styles.stack}>
        <HowCell access={access} />
        {change.isError && <Banner tone="danger">{getErrorMessage(change.error)}</Banner>}
        <DecisionTable
          decisions={access.decisions}
          label={`Permissions of ${displayName(access)}`}
          extra={{
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

/** Everyone who reaches the Organization, how, and with which effective permissions. */
export function EffectiveAccessCard({ scope }: { scope: Scope }) {
  const { tenantId, orgId } = scope;
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
      render: (a) => (
        <span className={styles.twoLine}>
          <span className={styles.primary}>{displayName(a)}</span>
          {a.user.name && <span className={styles.sub}>{a.user.email}</span>}
        </span>
      ),
    },
    { key: 'how', header: 'Access through', render: (a) => <HowCell access={a} />, secondary: true },
    {
      key: 'overrides',
      header: 'Overrides',
      render: (a) => {
        const count = a.decisions.filter((d) => d.source === 'override').length;
        return count ? <StatusPill tone="primary" label={`${count} override${count > 1 ? 's' : ''}`} /> : <span className={styles.muted}>—</span>;
      },
      secondary: true,
    },
    {
      key: 'permissions',
      header: 'Allowed',
      render: (a) => `${a.permissions.length} of ${a.decisions.length}`,
    },
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      align: 'end',
      render: (a) =>
        a.user.id === me?.id ? (
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
        title="Access & permissions"
        titleId="access-title"
        description="Effective permissions, resolved by the server. Inherited permissions come from the person's tenant access; overrides apply to this organization only."
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
          />
        )}
      </CardBody>
      {editing && overrides.data && (
        <OverrideEditor scope={scope} access={editing} overrides={overrides.data} onClose={() => setEditingUser(null)} />
      )}
    </Card>
  );
}
