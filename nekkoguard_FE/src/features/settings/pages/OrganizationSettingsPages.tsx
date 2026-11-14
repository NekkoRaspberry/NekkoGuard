import type { ReactNode } from 'react';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi } from '@/api/tenancy';
import { PageHeader } from '@/layout/PageHeader/PageHeader';
import { useTenancy } from '@/features/tenancy/hooks';
import { RequireOrganization, type OrganizationScope } from '@/features/tenancy/components/ScopeGate';
import styles from '@/features/tenancy/components/Management.module.css';
import { organizationCapabilities, type OrganizationCapabilities } from '../capabilities';
import { ActivityCard } from '../components/ActivityCard';
import { EffectiveAccessCard } from '../components/EffectiveAccessCard';
import { MyAccessCard } from '../components/MyAccessCard';
import { OrganizationDetailsCard } from '../components/OrganizationDetailsCard';
import { OrganizationMembersCard } from '../components/OrganizationMembersCard';

/** Settings of the Organization selected in the context bar. */
function OrganizationPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: (scope: OrganizationScope, can: OrganizationCapabilities) => ReactNode;
}) {
  const { tenantPermissions } = useTenancy();
  return (
    <div className={styles.stack}>
      <PageHeader title={title} description={description} />
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
    <OrganizationPage title="Organization" description="Details of the current organization and your access to it.">
      {(scope, can) => (
        <>
          <OrganizationDetailsCard tenantId={scope.tenantId} organization={scope.organization} capabilities={can} />
          <MyAccessCard access={scope.organization.my_access} />
        </>
      )}
    </OrganizationPage>
  );
}

export function OrganizationMembersPage() {
  return (
    <OrganizationPage title="Members" description="People with a direct role in this organization.">
      {(scope, can) =>
        can.canManageAccess ? (
          <OrganizationMembersCard key={scope.orgId} scope={scope} />
        ) : (
          <NoPermission what="manage members" />
        )
      }
    </OrganizationPage>
  );
}

export function OrganizationAccessPage() {
  return (
    <OrganizationPage
      title="Access & permissions"
      description="Who reaches this organization, how, and with which effective permissions."
    >
      {(scope, can) =>
        can.canManageAccess ? (
          <EffectiveAccessCard key={scope.orgId} scope={scope} />
        ) : (
          <NoPermission what="manage access" />
        )
      }
    </OrganizationPage>
  );
}

export function OrganizationActivityPage() {
  return (
    <OrganizationPage title="Activity" description="Changes made in this organization.">
      {(scope, can) =>
        can.canViewActivity ? (
          <ActivityCard
            key={scope.orgId}
            description="Membership, permission and infrastructure changes in this organization."
            queryKey={(page) => queryKeys.organizationActivity(scope.tenantId, scope.orgId, page)}
            fetchPage={(page, signal) => tenancyApi.organizationActivity(scope.tenantId, scope.orgId, page, signal)}
          />
        ) : (
          <NoPermission what="view the activity history" />
        )
      }
    </OrganizationPage>
  );
}
