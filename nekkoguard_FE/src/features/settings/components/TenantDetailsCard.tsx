import { useQueryClient } from '@tanstack/react-query';
import { Layers, Pencil } from 'lucide-react';
import { useState } from 'react';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi, type TenantDto } from '@/api/tenancy';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { KeyValueGrid } from '@/components/KeyValueGrid/KeyValueGrid';
import { useToast } from '@/components/Toast/useToast';
import { useCanTenant } from '@/features/tenancy/hooks';
import { TENANT_PERMISSIONS, TENANT_ROLE_LABELS } from '@/features/tenancy/model';
import { NameDescriptionDialog } from '@/features/tenancy/components/NameDescriptionDialog';
import { formatDateTime } from '@/lib/format';

export function TenantDetailsCard({ tenant }: { tenant: TenantDto }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const canEdit = useCanTenant(TENANT_PERMISSIONS.manage);
  const [editing, setEditing] = useState(false);

  return (
    <Card aria-labelledby="tenant-details-title">
      <CardHeader
        icon={<Layers size={16} />}
        title="Details"
        titleId="tenant-details-title"
        actions={
          canEdit && (
            <Button size="sm" variant="secondary" leftIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
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
          onSubmit={(values) => tenancyApi.updateTenant(tenant.id, values)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
            notify({ tone: 'success', title: 'Tenant updated' });
          }}
        />
      )}
    </Card>
  );
}
