import type { ReactNode } from 'react';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi } from '@/api/tenancy';
import { useTenancy } from '@/features/tenancy/hooks';
import { RequireOrganization, type OrganizationScope } from '@/features/tenancy/components/ScopeGate';
import styles from '@/features/tenancy/components/Management.module.css';
import { organizationCapabilities, type OrganizationCapabilities } from '../capabilities';
import { ActivityCard } from '../components/ActivityCard';
import { EffectiveAccessCard } from '../components/EffectiveAccessCard';
import { MyAccessCard } from '../components/MyAccessCard';
import { OrganizationDetailsCard } from '../components/OrganizationDetailsCard';
import { OrganizationMembersCard } from '../components/OrganizationMembersCard';

/** Settings of the Organization selected in the context bar (title: route handle). */
function OrganizationPage({
  children,
}: {
  children: (scope: OrganizationScope, can: OrganizationCapabilities) => ReactNode;
}) {
  const { tenantPermissions } = useTenancy();
  return (
    <div className={styles.stack}>
      <RequireOrganization>
        {(scope) => children(scope, organizationCapabilities(scope.organization, tenantPermissions))}
      </RequireOrganization>
    </div>
  );
}

function NoPermission({ what }: { what: string }) {
  return <p className={styles.muted}>You have no permission to {what} in this organization.</p>;
}

export function OrganizationDetailsPage() {
  return (
    <OrganizationPage>
      {(scope, can) => (
        <>
          <OrganizationDetailsCard tenantId={scope.tenantId} organization={scope.organization} capabilities={can} />
          <MyAccessCard access={scope.organization.my_access} organizationName={scope.organization.name} />
        </>
      )}
    </OrganizationPage>
  );
}

export function OrganizationMembersPage() {
  return (
    <OrganizationPage>
      {(scope, can) =>
        can.canViewAccess ? (
          <OrganizationMembersCard key={scope.orgId} scope={scope} canManage={can.canManageAccess} />
        ) : (
          <NoPermission what="view members" />
        )
      }
    </OrganizationPage>
  );
}

export function OrganizationAccessPage() {
  return (
    <OrganizationPage>
      {(scope, can) =>
        can.canViewAccess ? (
          <EffectiveAccessCard key={scope.orgId} scope={scope} canManage={can.canManageAccess} />
        ) : (
          <NoPermission what="view permissions" />
        )
      }
    </OrganizationPage>
  );
}

export function OrganizationActivityPage() {
  return (
    <OrganizationPage>
      {(scope, can) =>
        can.canViewActivity ? (
          <ActivityCard
            key={scope.orgId}
            owner={scope.organization.name}
            description="Membership, permission and infrastructure changes in this organization."
            queryKey={(page, ordering) => queryKeys.organizationActivity(scope.tenantId, scope.orgId, page, ordering)}
            fetchPage={(page, signal, ordering) => tenancyApi.organizationActivity(scope.tenantId, scope.orgId, page, signal, ordering)}
          />
        ) : (
          <NoPermission what="view the activity history" />
        )
      }
    </OrganizationPage>
  );
}
