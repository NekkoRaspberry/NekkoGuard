import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Power, ServerCog } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi, type PlatformTenantDto } from '@/api/tenancy';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { Modal } from '@/components/Modal/Modal';
import formStyles from '@/components/Modal/ModalForm.module.css';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { TextField } from '@/components/TextField/TextField';
import { useToast } from '@/components/Toast/useToast';
import styles from '@/features/tenancy/components/Management.module.css';
import { NO_FORM_ERRORS, toFormErrors, type FormErrors } from '@/lib/apiForm';

function CreateTenantDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (t: PlatformTenantDto) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);

  const create = useMutation({
    mutationFn: () =>
      tenancyApi.createPlatformTenant({ name: name.trim(), description: description.trim(), owner_email: owner.trim() }),
    onSuccess: (tenant) => {
      onCreated(tenant);
      onClose();
    },
    onError: (error) => setErrors(toFormErrors(error, ['name', 'description', 'owner_email'])),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields: Record<string, string> = {};
    if (!name.trim()) fields.name = 'Enter a name.';
    if (!owner.trim()) fields.owner_email = 'Choose the owner.';
    setErrors({ fields, form: null });
    if (Object.keys(fields).length === 0) create.mutate();
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="md"
      icon={<ServerCog size={18} />}
      title="Create a tenant"
      description="The owner administers the tenant. They reach no organization until access is configured."
    >
      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        {errors.form && <Banner tone="danger">{errors.form}</Banner>}
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.fields.name ?? null} maxLength={120} autoFocus />
        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.fields.description ?? null}
          maxLength={500}
          hint="Optional."
        />
        <TextField
          label="Owner email"
          type="email"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          error={errors.fields.owner_email ?? null}
          hint="Must be an existing NekkoGuard account."
        />
        <div className={formStyles.actions}>
          <div className={formStyles.actionsEnd}>
            <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Create tenant
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Platform administrators manage Tenants — not their infrastructure data. */
export function PlatformTenantsCard() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [creating, setCreating] = useState(false);
  const [toToggle, setToToggle] = useState<PlatformTenantDto | null>(null);

  const tenants = useQuery({ queryKey: queryKeys.platformTenants, queryFn: ({ signal }) => tenancyApi.listPlatformTenants(signal) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.platformTenants });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
  };

  const toggle = useMutation({
    mutationFn: (tenant: PlatformTenantDto) => tenancyApi.updatePlatformTenant(tenant.id, { is_active: !tenant.is_active }),
    onSuccess: (tenant) => {
      refresh();
      setToToggle(null);
      notify({ tone: 'success', title: tenant.is_active ? 'Tenant reactivated' : 'Tenant deactivated', description: tenant.name });
    },
  });

  const columns: Column<PlatformTenantDto>[] = [
    {
      key: 'name',
      header: 'Tenant',
      render: (t) => (
        <span className={styles.twoLine}>
          <span className={styles.primary}>{t.name}</span>
          <span className={styles.sub}>{t.owners.length ? `Owners: ${t.owners.join(', ')}` : 'No owner'}</span>
        </span>
      ),
    },
    { key: 'orgs', header: 'Organizations', render: (t) => t.organization_count, secondary: true },
    { key: 'members', header: 'Members', render: (t) => t.member_count, secondary: true },
    {
      key: 'status',
      header: 'Status',
      render: (t) => <StatusPill tone={t.is_active ? 'success' : 'neutral'} label={t.is_active ? 'Active' : 'Deactivated'} />,
    },
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      align: 'end',
      render: (t) => (
        <Button size="sm" variant="ghost" leftIcon={<Power size={14} />} onClick={() => setToToggle(t)}>
          {t.is_active ? 'Deactivate' : 'Reactivate'}
        </Button>
      ),
    },
  ];

  return (
    <Card aria-labelledby="platform-tenants-title">
      <CardHeader
        icon={<ServerCog size={16} />}
        title="Tenants"
        titleId="platform-tenants-title"
        description="Every tenant on this NekkoGuard platform. You see their data only where you are a member."
        actions={
          <Button size="sm" variant="primary" leftIcon={<Plus size={14} />} onClick={() => setCreating(true)}>
            New tenant
          </Button>
        }
      />
      <CardBody>
        {toggle.isError && <Banner tone="danger">{getErrorMessage(toggle.error)}</Banner>}
        {tenants.isPending ? (
          <Skeleton height={60} radius="sm" />
        ) : tenants.isError ? (
          <ErrorState error={tenants.error} onRetry={() => void tenants.refetch()} retrying={tenants.isFetching} />
        ) : (
          <DataTable label="Tenants" columns={columns} rows={tenants.data} rowKey={(t) => t.id} empty="No tenants yet." />
        )}
      </CardBody>
      {creating && (
        <CreateTenantDialog
          onClose={() => setCreating(false)}
          onCreated={(tenant) => {
            refresh();
            notify({ tone: 'success', title: 'Tenant created', description: tenant.name });
          }}
        />
      )}
      <ConfirmDialog
        open={toToggle !== null}
        onOpenChange={(open) => !open && setToToggle(null)}
        title={toToggle?.is_active ? `Deactivate ${toToggle.name}?` : `Reactivate ${toToggle?.name ?? ''}?`}
        description={
          toToggle?.is_active
            ? 'All its members lose access until it is reactivated. Nothing is deleted.'
            : 'Members regain their existing access.'
        }
        confirmLabel={toToggle?.is_active ? 'Deactivate' : 'Reactivate'}
        tone={toToggle?.is_active ? 'danger' : 'primary'}
        loading={toggle.isPending}
        onConfirm={() => toToggle && toggle.mutate(toToggle)}
      />
    </Card>
  );
}
