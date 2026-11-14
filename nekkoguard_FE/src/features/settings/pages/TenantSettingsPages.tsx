import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useParams } from 'react-router';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi } from '@/api/tenancy';
import { ROUTES } from '@/app/routes';
import { ButtonLink } from '@/components/Button/Button';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { PageHeader } from '@/layout/PageHeader/PageHeader';
import { useCanTenant, useContextSearch, useTenancy } from '@/features/tenancy/hooks';
import { TENANT_PERMISSIONS } from '@/features/tenancy/model';
import { RequireTenant } from '@/features/tenancy/components/ScopeGate';
import { isUuid } from '@/features/tenancy/selection';
import styles from '@/features/tenancy/components/Management.module.css';
import { organizationCapabilities } from '../capabilities';
import { ActivityCard } from '../components/ActivityCard';
import { EffectiveAccessCard } from '../components/EffectiveAccessCard';
import { MyAccessCard } from '../components/MyAccessCard';
import { OrganizationDetailsCard } from '../components/OrganizationDetailsCard';
import { OrganizationMembersCard } from '../components/OrganizationMembersCard';
import { TenantDetailsCard } from '../components/TenantDetailsCard';
import { TenantMembersCard } from '../components/TenantMembersCard';
import { TenantOrganizationsCard } from '../components/TenantOrganizationsCard';

export function TenantDetailsPage() {
  return (
    <div className={styles.stack}>
      <PageHeader title="Tenant" description="The management environment that owns your organizations." />
      <RequireTenant>{({ tenant }) => <TenantDetailsCard key={tenant.id} tenant={tenant} />}</RequireTenant>
    </div>
  );
}

export function TenantOrganizationsPage() {
  return (
    <div className={styles.stack}>
      <PageHeader title="Organizations" description="Infrastructure environments of the current tenant." />
      <RequireTenant>{({ tenantId }) => <TenantOrganizationsCard key={tenantId} tenantId={tenantId} />}</RequireTenant>
    </div>
  );
}

export function TenantMembersPage() {
  const canManage = useCanTenant(TENANT_PERMISSIONS.manageMembers);
  return (
    <div className={styles.stack}>
      <PageHeader title="Tenant members" description="Tenant roles and organization access policies." />
      <RequireTenant>
        {({ tenantId, tenant }) =>
          canManage ? (
            <TenantMembersCard key={tenantId} tenantId={tenantId} myRole={tenant.role} />
          ) : (
            <p className={styles.muted}>You have no permission to manage the members of this tenant.</p>
          )
        }
      </RequireTenant>
    </div>
  );
}

export function TenantActivityPage() {
  const canView = useCanTenant(TENANT_PERMISSIONS.viewActivity);
  return (
    <div className={styles.stack}>
      <PageHeader title="Tenant activity" description="Everything changed in this tenant and its organizations." />
      <RequireTenant>
        {({ tenantId }) =>
          canView ? (
            <ActivityCard
              key={tenantId}
              description="Tenant, membership, permission and infrastructure changes."
              queryKey={(page) => queryKeys.tenantActivity(tenantId, page)}
              fetchPage={(page, signal) => tenancyApi.tenantActivity(tenantId, page, signal)}
            />
          ) : (
            <p className={styles.muted}>You have no permission to view this tenant&apos;s activity.</p>
          )
        }
      </RequireTenant>
    </div>
  );
}

/** One Organization of the Tenant, managed from the tenant (works without infrastructure access). */
function TenantOrganizationManagement({ tenantId, orgId }: { tenantId: string; orgId: string }) {
  const { tenantPermissions } = useTenancy();
  const organization = useQuery({
    queryKey: queryKeys.organization(tenantId, orgId),
    queryFn: ({ signal }) => tenancyApi.getOrganization(tenantId, orgId, signal),
  });

  if (organization.isPending) return <Skeleton height={160} radius="sm" />;
  if (organization.isError) return <ErrorState error={organization.error} onRetry={() => void organization.refetch()} />;

  const detail = organization.data;
  const can = organizationCapabilities(detail, tenantPermissions);
  const scope = { tenantId, orgId };
  return (
    <>
      <OrganizationDetailsCard tenantId={tenantId} organization={detail} capabilities={can} />
      <MyAccessCard access={detail.my_access} />
      {can.canManageAccess && <OrganizationMembersCard scope={scope} />}
      {can.canManageAccess && <EffectiveAccessCard scope={scope} />}
      {can.canViewActivity && (
        <ActivityCard
          description="Changes made in this organization."
          queryKey={(page) => queryKeys.organizationActivity(tenantId, orgId, page)}
          fetchPage={(page, signal) => tenancyApi.organizationActivity(tenantId, orgId, page, signal)}
        />
      )}
    </>
  );
}

export function TenantOrganizationPage() {
  const { orgId } = useParams();
  const search = useContextSearch();
  return (
    <div className={styles.stack}>
      <PageHeader
        title="Manage organization"
        description="Details, members and permissions of one organization of this tenant."
        actions={
          <ButtonLink size="sm" variant="ghost" leftIcon={<ArrowLeft size={14} />} to={`${ROUTES.tenantOrganizations}${search}`}>
            All organizations
          </ButtonLink>
        }
      />
      <RequireTenant>
        {({ tenantId }) =>
          isUuid(orgId) ? (
            <TenantOrganizationManagement key={`${tenantId}/${orgId}`} tenantId={tenantId} orgId={orgId} />
          ) : (
            <p className={styles.muted}>This organization does not exist.</p>
          )
        }
      </RequireTenant>
    </div>
  );
}
