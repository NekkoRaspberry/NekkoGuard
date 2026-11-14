import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import {
  tenancyApi,
  type MembershipStatus,
  type OrganizationMembershipDto,
  type OrganizationRole,
} from '@/api/tenancy';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Modal } from '@/components/Modal/Modal';
import formStyles from '@/components/Modal/ModalForm.module.css';
import { SelectField } from '@/components/SelectField/SelectField';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { TextField } from '@/components/TextField/TextField';
import { useToast } from '@/components/Toast/useToast';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { ORGANIZATION_ROLE_LABELS, ORGANIZATION_ROLES } from '@/features/tenancy/model';
import styles from '@/features/tenancy/components/Management.module.css';
import { NO_FORM_ERRORS, toFormErrors, type FormErrors } from '@/lib/apiForm';

const ROLE_OPTIONS = ORGANIZATION_ROLES.map((role) => ({ value: role, label: ORGANIZATION_ROLE_LABELS[role] }));
const STATUS_OPTIONS: { value: MembershipStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

interface Scope {
  tenantId: string;
  orgId: string;
}

function MemberDialog({
  scope,
  member,
  onClose,
  onSaved,
}: {
  scope: Scope;
  member?: OrganizationMembershipDto;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>(member?.role ?? 'viewer');
  const [status, setStatus] = useState<MembershipStatus>(member?.status ?? 'active');
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);

  const save = useMutation({
    mutationFn: () =>
      member
        ? tenancyApi.updateOrganizationMember(scope.tenantId, scope.orgId, member.id, { role, status })
        : tenancyApi.addOrganizationMember(scope.tenantId, scope.orgId, { email: email.trim(), role }),
    onSuccess: (saved) => {
      onSaved(member ? `${saved.user.email} updated` : `${saved.user.email} added`);
      onClose();
    },
    onError: (error) => setErrors(toFormErrors(error, ['email', 'role', 'status'])),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member && !email.trim()) {
      setErrors({ fields: { email: 'Enter the email of an existing NekkoGuard account.' }, form: null });
      return;
    }
    setErrors(NO_FORM_ERRORS);
    save.mutate();
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="md"
      icon={<Users size={18} />}
      title={member ? `Edit ${member.user.email}` : 'Add a member'}
      description="A direct membership gives access to this organization only — never to tenant administration."
    >
      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        {errors.form && <Banner tone="danger">{errors.form}</Banner>}
        {!member && (
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.fields.email ?? null}
            autoFocus
          />
        )}
        <SelectField label="Organization role" value={role} options={ROLE_OPTIONS} onChange={setRole} error={errors.fields.role ?? null} />
        {member && (
          <SelectField
            label="Status"
            value={status}
            options={STATUS_OPTIONS}
            onChange={setStatus}
            error={errors.fields.status ?? null}
            hint="A suspended member cannot reach this organization at all, even through the tenant."
          />
        )}
        <div className={formStyles.actions}>
          <div className={formStyles.actionsEnd}>
            <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {member ? 'Save' : 'Add member'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Direct Organization memberships. Role and escalation rules are enforced by the backend. */
export function OrganizationMembersCard({ scope }: { scope: Scope }) {
  const { tenantId, orgId } = scope;
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const me = useCurrentUser().data;
  const [editing, setEditing] = useState<{ member?: OrganizationMembershipDto } | null>(null);
  const [toRemove, setToRemove] = useState<OrganizationMembershipDto | null>(null);

  const members = useQuery({
    queryKey: queryKeys.organizationMembers(tenantId, orgId),
    queryFn: ({ signal }) => tenancyApi.listOrganizationMembers(tenantId, orgId, signal),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.organizationMembers(tenantId, orgId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.accessList(tenantId, orgId) });
  };

  const remove = useMutation({
    mutationFn: (member: OrganizationMembershipDto) => tenancyApi.removeOrganizationMember(tenantId, orgId, member.id),
    onSuccess: (_, member) => {
      refresh();
      setToRemove(null);
      notify({ tone: 'success', title: 'Member removed', description: member.user.email });
    },
  });

  const columns: Column<OrganizationMembershipDto>[] = [
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
    { key: 'role', header: 'Role', render: (m) => ORGANIZATION_ROLE_LABELS[m.role] },
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
      // Nobody changes their own access (the backend refuses it too).
      render: (m) =>
        m.user.id === me?.id ? (
          <span className={styles.sub}>You</span>
        ) : (
          <span className={styles.rowActions}>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Edit ${m.user.email}`} onClick={() => setEditing({ member: m })}>
              <Pencil size={14} />
            </Button>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Remove ${m.user.email}`} onClick={() => setToRemove(m)}>
              <Trash2 size={14} />
            </Button>
          </span>
        ),
    },
  ];

  return (
    <Card aria-labelledby="org-members-title">
      <CardHeader
        icon={<Users size={16} />}
        title="Direct members"
        titleId="org-members-title"
        description="People with a role in this organization itself. Tenant members may also reach it through their tenant access — see Access & permissions."
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
          <DataTable label="Direct members" columns={columns} rows={members.data} rowKey={(m) => m.id} empty="No direct members." />
        )}
      </CardBody>
      {editing && (
        <MemberDialog
          scope={scope}
          member={editing.member}
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
        description="They lose their direct access to this organization. Access through their tenant membership, if any, is not affected."
        confirmLabel="Remove member"
        loading={remove.isPending}
        onConfirm={() => toRemove && remove.mutate(toRemove)}
      />
    </Card>
  );
}
