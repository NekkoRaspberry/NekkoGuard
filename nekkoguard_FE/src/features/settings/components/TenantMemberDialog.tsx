import { useMutation } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  tenancyApi,
  type MembershipStatus,
  type OrganizationAccess,
  type OrganizationDto,
  type OrganizationRole,
  type TenantMembershipDto,
  type TenantRole,
} from '@/api/tenancy';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Checkbox } from '@/components/Checkbox/Checkbox';
import { Modal } from '@/components/Modal/Modal';
import formStyles from '@/components/Modal/ModalForm.module.css';
import { SelectField } from '@/components/SelectField/SelectField';
import { TextField } from '@/components/TextField/TextField';
import {
  ORGANIZATION_ACCESS_LABELS,
  ORGANIZATION_ACCESS_OPTIONS,
  ORGANIZATION_ROLE_LABELS,
  ORGANIZATION_ROLES,
  TENANT_ROLE_LABELS,
  TENANT_ROLES,
} from '@/features/tenancy/model';
import { useTenancy, useTenantName } from '@/features/tenancy/hooks';
import styles from '@/features/tenancy/components/Management.module.css';
import { NO_FORM_ERRORS, toFormErrors, type FormErrors } from '@/lib/apiForm';

const FIELDS = ['email', 'role', 'status', 'organization_access', 'default_organization_role', 'selected_organizations'];

interface Props {
  tenantId: string;
  member?: TenantMembershipDto;
  /** Organizations the caller administers (for "selected organizations"). */
  organizations: OrganizationDto[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

/**
 * Tenant membership = two independent things:
 * the tenant role (administration) and the organization access policy (infrastructure).
 */
export function TenantMemberDialog({ tenantId, member, organizations, onClose, onSaved }: Props) {
  const tenantName = useTenantName(tenantId);
  // The caller's own organization scope (a scoped admin may only grant within it).
  const fullScope = useTenancy().tenants?.find((t) => t.id === tenantId)?.organization_access === 'all';
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TenantRole>(member?.role ?? 'member');
  const [status, setStatus] = useState<MembershipStatus>(member?.status ?? 'active');
  const [access, setAccess] = useState<OrganizationAccess>(member?.organization_access ?? 'none');
  const [defaultRole, setDefaultRole] = useState<OrganizationRole>(member?.default_organization_role || 'viewer');
  const [selected, setSelected] = useState<Set<string>>(new Set(member?.selected_organizations ?? []));
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);

  const save = useMutation({
    mutationFn: () => {
      const accessPart = {
        organization_access: access,
        default_organization_role: access === 'none' ? ('' as const) : defaultRole,
        selected_organizations: access === 'selected' ? [...selected] : [],
      };
      if (!member) return tenancyApi.addTenantMember(tenantId, { email: email.trim(), role, ...accessPart });
      return tenancyApi.updateTenantMember(tenantId, member.id, { role, status, ...accessPart });
    },
    onSuccess: (saved) => {
      onSaved(member ? `${saved.user.email} updated` : `${saved.user.email} added`);
      onClose();
    },
    onError: (error) => setErrors(toFormErrors(error, FIELDS)),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields: Record<string, string> = {};
    if (!member && !email.trim()) fields.email = 'Enter the email of an existing NekkoGuard account.';
    if (access === 'selected' && selected.size === 0) fields.selected_organizations = 'Pick at least one organization.';
    setErrors({ fields, form: null });
    if (Object.keys(fields).length === 0) save.mutate();
  }

  function toggle(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="md"
      icon={<Users size={18} />}
      title={member ? `Edit ${member.user.email}` : `Add a member to ${tenantName}`}
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
        <SelectField
              label="Tenant role"
              value={role}
              options={TENANT_ROLES.map((value) => ({ value, label: TENANT_ROLE_LABELS[value] }))}
              onChange={setRole}
              error={errors.fields.role ?? null}
              hint={`What they may administer in ${tenantName}. It does not give access to infrastructure.`}
            />
            {member && (
              <SelectField
                label="Status"
                value={status}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'suspended', label: 'Suspended' },
                ]}
                onChange={setStatus}
                error={errors.fields.status ?? null}
                hint={`A suspended member is blocked everywhere in ${tenantName}.`}
              />
            )}
        <SelectField
          label="Organization access"
          value={access}
          // Always offered. A scoped administrator cannot grant more than their own
          // scope: the backend refuses it and the error is shown on this field.
          options={ORGANIZATION_ACCESS_OPTIONS.map((value) => ({ value, label: ORGANIZATION_ACCESS_LABELS[value] }))}
          onChange={setAccess}
          error={errors.fields.organization_access ?? null}
          hint={
            fullScope
              ? `Which organizations they reach and administer through ${tenantName}. Direct organization memberships are separate.`
              : `Which organizations they reach and administer through ${tenantName} — only among the organizations you administer.`
          }
        />
        {access !== 'none' && (
          <SelectField
            label="Default organization role"
            value={defaultRole}
            options={ORGANIZATION_ROLES.map((value) => ({ value, label: ORGANIZATION_ROLE_LABELS[value] }))}
            onChange={setDefaultRole}
            error={errors.fields.default_organization_role ?? null}
            hint="Permissions inherited in those organizations. Each organization can override them."
          />
        )}
        {access === 'selected' && (
          <div className={styles.fieldGroup} role="group" aria-label="Selected organizations">
            <span className={styles.fieldLabel}>Selected organizations</span>
            <div className={styles.checkList}>
              {organizations.length === 0 && <span className={styles.muted}>{tenantName} has no organizations yet.</span>}
              {organizations.map((o) => (
                <Checkbox
                  key={o.id}
                  label={o.name}
                  checked={selected.has(o.id)}
                  onChange={(event) => toggle(o.id, event.target.checked)}
                />
              ))}
            </div>
            {errors.fields.selected_organizations && (
              <span className={styles.fieldError} role="alert">
                {errors.fields.selected_organizations}
              </span>
            )}
          </div>
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
