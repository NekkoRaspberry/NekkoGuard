import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Power } from 'lucide-react';
import { useState } from 'react';
import { getErrorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi, type OrganizationDetailDto } from '@/api/tenancy';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { KeyValueGrid } from '@/components/KeyValueGrid/KeyValueGrid';
import { ConfirmDialog } from '@/components/Modal/ConfirmDialog';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useToast } from '@/components/Toast/useToast';
import { NameDescriptionDialog } from '@/features/tenancy/components/NameDescriptionDialog';
import { formatDateTime } from '@/lib/format';
import type { OrganizationCapabilities } from '../capabilities';

interface Props {
  tenantId: string;
  organization: OrganizationDetailDto;
  capabilities: OrganizationCapabilities;
}

export function OrganizationDetailsCard({ tenantId, organization, capabilities }: Props) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.organizationScope(tenantId, organization.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.organizations(tenantId) });
  };

  const toggle = useMutation({
    mutationFn: () => tenancyApi.updateOrganization(tenantId, organization.id, { is_active: !organization.is_active }),
    onSuccess: (updated) => {
      refresh();
      setToggling(false);
      notify({ tone: 'success', title: updated.is_active ? 'Organization reactivated' : 'Organization deactivated' });
    },
  });

  return (
    <Card aria-labelledby="org-details-title">
      <CardHeader
        icon={<Building2 size={16} />}
        title="Details"
        titleId="org-details-title"
        actions={
          <>
            {capabilities.canToggleActive && (
              <Button size="sm" variant="secondary" leftIcon={<Power size={14} />} onClick={() => setToggling(true)}>
                {organization.is_active ? 'Deactivate' : 'Reactivate'}
              </Button>
            )}
            {capabilities.canEdit && (
              <Button size="sm" variant="secondary" leftIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </>
        }
      />
      <CardBody>
        {toggle.isError && <Banner tone="danger">{getErrorMessage(toggle.error)}</Banner>}
        <KeyValueGrid
          items={[
            { label: 'Name', value: organization.name },
            { label: 'Description', value: organization.description || '—' },
            {
              label: 'Status',
              value: (
                <StatusPill
                  tone={organization.is_active ? 'success' : 'neutral'}
                  label={organization.is_active ? 'Active' : 'Deactivated'}
                />
              ),
            },
            { label: 'Created', value: formatDateTime(Date.parse(organization.created_at)) },
          ]}
        />
      </CardBody>
      {editing && (
        <NameDescriptionDialog
          open
          onOpenChange={setEditing}
          icon={<Building2 size={18} />}
          title="Edit organization"
          initial={organization}
          submitLabel="Save"
          onSubmit={(values) => tenancyApi.updateOrganization(tenantId, organization.id, values)}
          onSaved={() => {
            refresh();
            notify({ tone: 'success', title: 'Organization updated' });
          }}
        />
      )}
      <ConfirmDialog
        open={toggling}
        onOpenChange={setToggling}
        title={organization.is_active ? `Deactivate ${organization.name}?` : `Reactivate ${organization.name}?`}
        description={
          organization.is_active
            ? 'Nobody can reach its sites and networks until it is reactivated. Nothing is deleted.'
            : 'Members reach it again with their existing permissions.'
        }
        confirmLabel={organization.is_active ? 'Deactivate' : 'Reactivate'}
        tone={organization.is_active ? 'danger' : 'primary'}
        loading={toggle.isPending}
        onConfirm={() => toggle.mutate()}
      />
    </Card>
  );
}
