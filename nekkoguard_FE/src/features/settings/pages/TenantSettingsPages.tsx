import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Palette } from 'lucide-react';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi } from '@/api/tenancy';
import { ROUTES } from '@/app/routes';
import { ButtonLink } from '@/components/Button/Button';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { useCanTenant, useIsPlatformAdmin, useTenancy } from '@/features/tenancy/hooks';
import { TENANT_PERMISSIONS } from '@/features/tenancy/model';
import { RequireTenant, TenantOrganizationScope } from '@/features/tenancy/components/ScopeGate';
import { isUuid } from '@/features/tenancy/selection';
import styles from '@/features/tenancy/components/Management.module.css';
import { canManageTenantAppearance, organizationCapabilities } from '../capabilities';
import { manageOrganization, useManagedOrganizationId } from '../managedOrganization';
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
      <RequireTenant>{({ tenant }) => <TenantDetailsCard key={tenant.id} tenant={tenant} />}</RequireTenant>
    </div>
  );
}

export function TenantOrganizationsPage() {
  return (
    <div className={styles.stack}>
      <RequireTenant>{({ tenantId }) => <TenantOrganizationsCard key={tenantId} tenantId={tenantId} />}</RequireTenant>
    </div>
  );
}

export function TenantMembersPage() {
  const canManage = useCanTenant(TENANT_PERMISSIONS.manageMembers);
  return (
    <div className={styles.stack}>
      <RequireTenant>
        {({ tenantId, tenant }) =>
          canManage ? (
            <TenantMembersCard key={tenantId} tenantId={tenantId} />
          ) : (
            <p className={styles.muted}>You have no permission to manage the members of {tenant.name}.</p>
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
      <RequireTenant>
        {({ tenantId, tenant }) =>
          canView ? (
            <ActivityCard
              key={tenantId}
              owner={tenant.name}
              description="Tenant, membership, permission and infrastructure changes."
              queryKey={(page, ordering) => queryKeys.tenantActivity(tenantId, page, ordering)}
              fetchPage={(page, signal, ordering) => tenancyApi.tenantActivity(tenantId, page, signal, ordering)}
            />
          ) : (
            <p className={styles.muted}>You have no permission to view the activity of {tenant.name}.</p>
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
      <MyAccessCard access={detail.my_access} organizationName={detail.name} />
      {can.canViewAccess && <OrganizationMembersCard scope={scope} canManage={can.canManageAccess} />}
      {can.canViewAccess && <EffectiveAccessCard scope={scope} canManage={can.canManageAccess} />}
      {can.canViewActivity && (
        <ActivityCard
          owner={detail.name}
          description="Changes made in this organization."
          queryKey={(page, ordering) => queryKeys.organizationActivity(tenantId, orgId, page, ordering)}
          fetchPage={(page, signal, ordering) => tenancyApi.organizationActivity(tenantId, orgId, page, signal, ordering)}
        />
      )}
    </>
  );
}

export function TenantOrganizationPage() {
  const orgId = useManagedOrganizationId();
  const { tenantPermissions } = useTenancy();
  const isPlatformAdmin = useIsPlatformAdmin();
  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <ButtonLink size="sm" variant="ghost" leftIcon={<ArrowLeft size={14} />} to={ROUTES.tenantOrganizations}>
          All organizations
        </ButtonLink>
        {isUuid(orgId) && canManageTenantAppearance(tenantPermissions, isPlatformAdmin) && (
          <ButtonLink size="sm" variant="secondary" leftIcon={<Palette size={14} />} to={ROUTES.tenantOrganizationAppearance} state={manageOrganization(orgId)}>
            Appearance
          </ButtonLink>
        )}
      </div>
      <TenantOrganizationScope orgId={orgId}>
        {(tenantId, id) => <TenantOrganizationManagement key={`${tenantId}/${id}`} tenantId={tenantId} orgId={id} />}
      </TenantOrganizationScope>
    </div>
  );
}
