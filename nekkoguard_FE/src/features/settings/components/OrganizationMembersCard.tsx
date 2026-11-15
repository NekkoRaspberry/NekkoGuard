import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, Pencil, Plus, Send, Trash2, Users, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import {
  tenancyApi,
  type AddMemberResultDto,
  type MembershipStatus,
  type OrganizationInvitationDto,
  type OrganizationMembershipDto,
  type OrganizationRole,
} from '@/api/tenancy';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { TableExportButton } from '@/components/DataTable/TableExport';
import { useTableExport } from '@/components/DataTable/useTableExport';
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
import { useOrganizationName, useTenantName } from '@/features/tenancy/hooks';
import { ORGANIZATION_ROLE_LABELS, ORGANIZATION_ROLES } from '@/features/tenancy/model';
import { formatDateTime } from '@/lib/format';
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

/**
 * Add member: an email address only. The backend decides — an existing account is
 * added with the Viewer role; anyone else receives an invitation email.
 */
function AddMemberDialog({
  scope,
  onClose,
  onDone,
}: {
  scope: Scope;
  onClose: () => void;
  onDone: (result: AddMemberResultDto) => void;
}) {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);

  const add = useMutation({
    mutationFn: () => tenancyApi.addOrganizationMember(scope.tenantId, scope.orgId, { email: email.trim() }),
    onSuccess: (result) => {
      onDone(result);
      onClose();
    },
    onError: (error) => setErrors(toFormErrors(error, ['email'])),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setErrors({ fields: { email: 'Enter an email address.' }, form: null });
      return;
    }
    setErrors(NO_FORM_ERRORS);
    add.mutate();
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="md"
      icon={<MailPlus size={18} />}
      title="Add a member"
      description="People with a NekkoGuard account are added right away. Anyone else receives an invitation by email to create their account."
    >
      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        {errors.form && <Banner tone="danger">{errors.form}</Banner>}
        <TextField
          label="Email address"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.fields.email ?? null}
          hint="New members get the Viewer role (read-only). You can change it afterwards."
          autoFocus
        />
        <div className={formStyles.actions}>
          <div className={formStyles.actionsEnd}>
            <Button variant="ghost" onClick={onClose} disabled={add.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={add.isPending}>
              Add member
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function EditMemberDialog({
  scope,
  member,
  onClose,
  onSaved,
}: {
  scope: Scope;
  member: OrganizationMembershipDto;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const tenantName = useTenantName(scope.tenantId);
  const [role, setRole] = useState<OrganizationRole>(member.role);
  const [status, setStatus] = useState<MembershipStatus>(member.status);
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);

  const save = useMutation({
    mutationFn: () => tenancyApi.updateOrganizationMember(scope.tenantId, scope.orgId, member.id, { role, status }),
    onSuccess: (saved) => {
      onSaved(`${saved.user.email} updated`);
      onClose();
    },
    onError: (error) => setErrors(toFormErrors(error, ['role', 'status'])),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors(NO_FORM_ERRORS);
    save.mutate();
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="md"
      icon={<Users size={18} />}
      title={`Edit ${member.user.email}`}
      description="A direct membership gives access to this organization only — never to tenant administration."
    >
      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        {errors.form && <Banner tone="danger">{errors.form}</Banner>}
        <SelectField label="Organization role" value={role} options={ROLE_OPTIONS} onChange={setRole} error={errors.fields.role ?? null} />
        <SelectField
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
          error={errors.fields.status ?? null}
          hint={`A suspended member cannot reach this organization at all, even through ${tenantName}.`}
        />
        <div className={formStyles.actions}>
          <div className={formStyles.actionsEnd}>
            <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

const INVITATION_STATUS: Record<'pending' | 'expired', { tone: 'info' | 'warning'; label: string }> = {
  pending: { tone: 'info', label: 'Pending' },
  expired: { tone: 'warning', label: 'Expired' },
};

/** Open invitations (pending or expired) of people without an account yet. */
function InvitationsCard({ scope, canManage }: { scope: Scope; canManage: boolean }) {
  const { tenantId, orgId } = scope;
  const organizationName = useOrganizationName(tenantId, orgId);
  const exporter = useTableExport();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [toRevoke, setToRevoke] = useState<OrganizationInvitationDto | null>(null);

  const invitations = useQuery({
    queryKey: queryKeys.invitations(tenantId, orgId),
    queryFn: ({ signal }) => tenancyApi.listInvitations(tenantId, orgId, signal),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(tenantId, orgId) });

  const resend = useMutation({
    mutationFn: (invitation: OrganizationInvitationDto) => tenancyApi.resendInvitation(tenantId, orgId, invitation.id),
    onSuccess: (invitation) => {
      refresh();
      notify({ tone: 'success', title: 'Invitation sent again', description: `${invitation.email} — the previous link no longer works.` });
    },
    onError: (error) => notify({ tone: 'danger', title: 'Could not resend the invitation', description: getErrorMessage(error) }),
  });
  const revoke = useMutation({
    mutationFn: (invitation: OrganizationInvitationDto) => tenancyApi.revokeInvitation(tenantId, orgId, invitation.id),
    onSuccess: (_, invitation) => {
      refresh();
      setToRevoke(null);
      notify({ tone: 'success', title: 'Invitation revoked', description: invitation.email });
    },
  });

  if (invitations.isPending || (invitations.isSuccess && invitations.data.length === 0)) return null;

  const invitationColumns: Column<OrganizationInvitationDto>[] = [
    { key: 'email', header: 'Email', sortValue: (i) => i.email, render: (i) => <span className={styles.primary}>{i.email}</span> },
    {
      key: 'status',
      header: 'Status',
      sortValue: (i) => i.status,
      exportValue: (i) => INVITATION_STATUS[i.status === 'expired' ? 'expired' : 'pending'].label,
      render: (i) => {
        const shown = INVITATION_STATUS[i.status === 'expired' ? 'expired' : 'pending'];
        return <StatusPill tone={shown.tone} label={shown.label} />;
      },
    },
    {
      key: 'invited_by',
      header: 'Invited by',
      sortValue: (i) => i.invited_by?.name || i.invited_by?.email,
      render: (i) => i.invited_by?.name || i.invited_by?.email || <span className={styles.muted}>—</span>,
      secondary: true,
    },
    {
      key: 'expires',
      header: 'Expires',
      sortValue: (i) => new Date(i.expires_at),
      render: (i) => <span className={styles.mono}>{formatDateTime(Date.parse(i.expires_at))}</span>,
      secondary: true,
    },
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      align: 'end',
      render: (i) => (
        <span className={styles.rowActions}>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            aria-label={`Resend the invitation to ${i.email}`}
            title="Resend"
            loading={resend.isPending && resend.variables.id === i.id}
            onClick={() => resend.mutate(i)}
          >
            <Send size={14} />
          </Button>
          <Button size="sm" variant="ghost" iconOnly aria-label={`Revoke the invitation to ${i.email}`} title="Revoke" onClick={() => setToRevoke(i)}>
            <X size={14} />
          </Button>
        </span>
      ),
    },
  ];
  // Read-only for everyone without members.manage (Export still works).
  const columns = canManage ? invitationColumns : invitationColumns.filter((c) => c.key !== 'actions');

  return (
    <Card aria-labelledby="org-invitations-title">
      <CardHeader
        icon={<MailPlus size={16} />}
        title="Invitations"
        titleId="org-invitations-title"
        description="People invited by email who have not joined yet. They become Viewers once they create their account and verify their address."
        actions={<TableExportButton exporter={exporter} />}
      />
      <CardBody>
        {revoke.isError && <Banner tone="danger">{getErrorMessage(revoke.error)}</Banner>}
        {invitations.isError ? (
          <ErrorState error={invitations.error} onRetry={() => void invitations.refetch()} retrying={invitations.isFetching} />
        ) : (
          <DataTable
            label="Invitations"
            columns={columns}
            rows={invitations.data}
            rowKey={(i) => i.id}
            defaultSort={{ key: 'expires', direction: 'asc' }}
            exportOwner={organizationName}
            exporter={exporter}
          />
        )}
      </CardBody>
      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(open) => !open && setToRevoke(null)}
        title={`Revoke the invitation to ${toRevoke?.email ?? ''}?`}
        description="The link in their email stops working. You can invite them again later."
        confirmLabel="Revoke invitation"
        loading={revoke.isPending}
        onConfirm={() => toRevoke && revoke.mutate(toRevoke)}
      />
    </Card>
  );
}

/**
 * Direct Organization memberships and open invitations. Everyone who may view them
 * sees this card; adding, editing and removing need `canManage` (members.manage).
 * Role and escalation rules are enforced by the backend.
 */
export function OrganizationMembersCard({ scope, canManage }: { scope: Scope; canManage: boolean }) {
  const { tenantId, orgId } = scope;
  const tenantName = useTenantName(tenantId);
  const organizationName = useOrganizationName(tenantId, orgId);
  const exporter = useTableExport();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const me = useCurrentUser().data;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<OrganizationMembershipDto | null>(null);
  const [toRemove, setToRemove] = useState<OrganizationMembershipDto | null>(null);

  const members = useQuery({
    queryKey: queryKeys.organizationMembers(tenantId, orgId),
    queryFn: ({ signal }) => tenancyApi.listOrganizationMembers(tenantId, orgId, signal),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.organizationMembers(tenantId, orgId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.accessList(tenantId, orgId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(tenantId, orgId) });
  };

  const remove = useMutation({
    mutationFn: (member: OrganizationMembershipDto) => tenancyApi.removeOrganizationMember(tenantId, orgId, member.id),
    onSuccess: (_, member) => {
      refresh();
      setToRemove(null);
      notify({ tone: 'success', title: 'Member removed', description: member.user.email });
    },
  });

  const memberColumns: Column<OrganizationMembershipDto>[] = [
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
    { key: 'role', header: 'Role', render: (m) => ORGANIZATION_ROLE_LABELS[m.role], sortValue: (m) => ORGANIZATION_ROLES.indexOf(m.role), exportValue: (m) => ORGANIZATION_ROLE_LABELS[m.role] },
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
      // Nobody changes their own access (the backend refuses it too).
      render: (m) =>
        m.user.id === me?.id ? (
          <span className={styles.sub}>You</span>
        ) : (
          <span className={styles.rowActions}>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Edit ${m.user.email}`} onClick={() => setEditing(m)}>
              <Pencil size={14} />
            </Button>
            <Button size="sm" variant="ghost" iconOnly aria-label={`Remove ${m.user.email}`} onClick={() => setToRemove(m)}>
              <Trash2 size={14} />
            </Button>
          </span>
        ),
    },
  ];
  const columns = canManage ? memberColumns : memberColumns.filter((c) => c.key !== 'actions');

  return (
    <>
      <Card aria-labelledby="org-members-title">
        <CardHeader
          icon={<Users size={16} />}
          title="Direct members"
          titleId="org-members-title"
          description={`People with a role in this organization itself. Members of ${tenantName} may also reach it through their access there — see Permissions.`}
          actions={
            <>
              <TableExportButton exporter={exporter} />
              {canManage && (
                <Button size="sm" variant="primary" leftIcon={<Plus size={14} />} onClick={() => setAdding(true)}>
                  Add member
                </Button>
              )}
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
              label="Direct members"
              columns={columns}
              rows={members.data}
              rowKey={(m) => m.id}
              empty="No direct members."
              exportOwner={organizationName}
              exporter={exporter}
            />
          )}
        </CardBody>
        {adding && (
          <AddMemberDialog
            scope={scope}
            onClose={() => setAdding(false)}
            onDone={(result) => {
              refresh();
              if (result.result === 'added') {
                notify({ tone: 'success', title: `${result.membership.user.email} added`, description: 'They can now view this organization.' });
              } else {
                notify({
                  tone: 'success',
                  title: 'Invitation sent',
                  description: `${result.invitation.email} will join as a Viewer after creating their account.`,
                });
              }
            }}
          />
        )}
        {editing && (
          <EditMemberDialog
            scope={scope}
            member={editing}
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
          description={`They lose their direct access to this organization. Access through their membership of ${tenantName}, if any, is not affected.`}
          confirmLabel="Remove member"
          loading={remove.isPending}
          onConfirm={() => toRemove && remove.mutate(toRemove)}
        />
      </Card>
      <InvitationsCard scope={scope} canManage={canManage} />
    </>
  );
}
