import { useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil } from 'lucide-react';
import { useState } from 'react';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi, type TenantDto } from '@/api/tenancy';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { KeyValueGrid } from '@/components/KeyValueGrid/KeyValueGrid';
import { TextField } from '@/components/TextField/TextField';
import { useToast } from '@/components/Toast/useToast';
import { useCanTenant } from '@/features/tenancy/hooks';
import { TENANT_PERMISSIONS, TENANT_ROLE_LABELS } from '@/features/tenancy/model';
import { NameDescriptionDialog } from '@/features/tenancy/components/NameDescriptionDialog';
import styles from '@/features/tenancy/components/Management.module.css';
import { formatDateTime } from '@/lib/format';

export function TenantDetailsCard({ tenant }: { tenant: TenantDto }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const canEdit = useCanTenant(TENANT_PERMISSIONS.manage);
  const [editing, setEditing] = useState(false);
  const [supportEmail, setSupportEmail] = useState(tenant.support_email);

  return (
    <Card aria-labelledby="tenant-details-title">
      <CardHeader
        icon={<Layers size={16} />}
        title="Details"
        titleId="tenant-details-title"
        actions={
          canEdit && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Pencil size={14} />}
              onClick={() => {
                setSupportEmail(tenant.support_email);
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )
        }
      />
      <CardBody>
        <KeyValueGrid
          items={[
            { label: 'Name', value: tenant.name },
            { label: 'Description', value: tenant.description || '—' },
            {
              label: 'Support email',
              value: tenant.support_email || <span className={styles.muted}>Not set — bug reports go to the platform address</span>,
            },
            { label: 'Your tenant role', value: tenant.role ? TENANT_ROLE_LABELS[tenant.role] : '—' },
            { label: 'Created', value: formatDateTime(Date.parse(tenant.created_at)) },
          ]}
        />
      </CardBody>
      {editing && (
        <NameDescriptionDialog
          open
          onOpenChange={setEditing}
          icon={<Layers size={18} />}
          title="Edit tenant"
          initial={tenant}
          submitLabel="Save"
          onSubmit={(values) => tenancyApi.updateTenant(tenant.id, { ...values, support_email: supportEmail.trim() })}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
            notify({ tone: 'success', title: 'Tenant updated' });
          }}
        >
          <TextField
            label="Support email"
            type="email"
            autoComplete="off"
            value={supportEmail}
            onChange={(event) => setSupportEmail(event.target.value)}
            hint={`Bug reports from ${tenant.name} are emailed here. Leave empty to use the platform address.`}
          />
        </NameDescriptionDialog>
      )}
    </Card>
  );
}
