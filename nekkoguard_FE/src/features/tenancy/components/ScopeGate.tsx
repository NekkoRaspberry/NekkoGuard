import { Building2, Layers } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OrganizationDetailDto, TenantDto } from '@/api/tenancy';
import { Card, CardBody } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { useTenancy } from '../hooks';
import styles from './ScopeGate.module.css';

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card>
      <CardBody className={styles.notice}>
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.title}>{title}</span>
        <span className={styles.text}>{children}</span>
      </CardBody>
    </Card>
  );
}

function Loading() {
  return (
    <div className={styles.loading} aria-busy="true" aria-label="Loading">
      <Skeleton height={20} width="40%" />
      <Skeleton height={120} radius="sm" />
    </div>
  );
}

function NoTenant() {
  return (
    <Notice icon={<Layers size={20} />} title="No tenant access yet">
      You are not a member of any tenant or organization. Ask an administrator to invite you.
    </Notice>
  );
}

export interface TenantScope {
  tenantId: string;
  tenant: TenantDto;
}

/** Renders children only for a selected Tenant the user is a member of. */
export function RequireTenant({ children }: { children: (scope: TenantScope) => ReactNode }) {
  const { tenants, tenantsError, retryTenants, currentTenant, ready } = useTenancy();
  if (tenantsError) return <ErrorState error={tenantsError} onRetry={retryTenants} />;
  if (!tenants || !ready) return <Loading />;
  if (tenants.length === 0) return <NoTenant />;
  if (!currentTenant || currentTenant.role === null) {
    return (
      <Notice icon={<Layers size={20} />} title="Not a member of this tenant">
        You reach some of its organizations directly, but you have no role in the tenant itself.
      </Notice>
    );
  }
  return <>{children({ tenantId: currentTenant.id, tenant: currentTenant })}</>;
}

export interface OrganizationScope extends TenantScope {
  orgId: string;
  organization: OrganizationDetailDto;
}

/** Renders children only once a Tenant and an accessible Organization are selected. */
export function RequireOrganization({ children }: { children: (scope: OrganizationScope) => ReactNode }) {
  const { tenants, tenantsError, retryTenants, currentTenant, organizations, currentOrganization, organizationError, ready } =
    useTenancy();
  if (tenantsError) return <ErrorState error={tenantsError} onRetry={retryTenants} />;
  if (!tenants) return <Loading />;
  if (tenants.length === 0) return <NoTenant />;
  if (organizationError) return <ErrorState error={organizationError} />;
  if (!ready || !currentTenant || organizations === undefined) return <Loading />;
  if (!currentOrganization) {
    return (
      <Notice icon={<Building2 size={20} />} title="No organization selected">
        You have no access to an organization in {currentTenant.name}. Choose another tenant, or ask an administrator
        for access.
      </Notice>
    );
  }
  return (
    <>
      {children({
        tenantId: currentTenant.id,
        tenant: currentTenant,
        orgId: currentOrganization.id,
        organization: currentOrganization,
      })}
    </>
  );
}
