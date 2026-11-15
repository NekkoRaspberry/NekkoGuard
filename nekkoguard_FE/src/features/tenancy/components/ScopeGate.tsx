import { Building2, Layers } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { ROUTES } from '@/app/routes';
import type { OrganizationDetailDto, TenantDto } from '@/api/tenancy';
import { Card, CardBody } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { useTenancy } from '../hooks';
import { canAdministerTenant } from '../model';
import { isUuid } from '../selection';
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
  const { tenants, tenantsError, retryTenants, currentTenant, tenantPermissions, ready } = useTenancy();
  if (tenantsError) return <ErrorState error={tenantsError} onRetry={retryTenants} />;
  if (!tenants || !ready) return <Loading />;
  if (tenants.length === 0) return <NoTenant />;
  if (!currentTenant || currentTenant.role === null) {
    return (
      <Notice icon={<Layers size={20} />} title={`Not a member of ${currentTenant?.name ?? 'this tenant'}`}>
        You reach some of its organizations directly, but you have no role in {currentTenant?.name ?? 'the tenant'} itself.
      </Notice>
    );
  }
  if (!canAdministerTenant(tenantPermissions)) {
    // Direct URLs too: organization roles never see the Tenant area.
    return (
      <Notice icon={<Layers size={20} />} title="Tenant settings are not available">
        Only the administrators of {currentTenant.name} manage it. Your access is to its organizations.
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

/**
 * One Organization of the selected Tenant, opened from Settings → Tenant →
 * Organizations ("Manage"; passed as navigation state, never in the URL). The backend only finds it inside that Tenant.
 *
 * The Organization belongs to the Tenant the page was opened in: switching to another
 * Tenant goes back to the new Tenant's organization list instead of showing (or
 * editing) an Organization of the previous one.
 */
export function TenantOrganizationScope({
  orgId,
  children,
}: {
  /** From navigation state (never the URL); null → back to the organization list. */
  orgId: string | null;
  children: (tenantId: string, orgId: string) => ReactNode;
}) {
  const { currentTenant, tenantPermissions } = useTenancy();
  const tenantId = currentTenant && canAdministerTenant(tenantPermissions) ? currentTenant.id : null;
  const [openedIn, setOpenedIn] = useState<string | null>(tenantId);
  if (openedIn === null && tenantId !== null) setOpenedIn(tenantId);

  if (openedIn !== null && tenantId !== null && tenantId !== openedIn) {
    return <Navigate to={ROUTES.tenantOrganizations} replace />;
  }
  return (
    <RequireTenant>
      {(scope) =>
        orgId === null ? (
          <Navigate to={ROUTES.tenantOrganizations} replace />
        ) : isUuid(orgId) ? (
          children(scope.tenantId, orgId)
        ) : (
          <Notice icon={<Building2 size={20} />} title="Organization not found">
            This organization does not exist in {scope.tenant.name}.
          </Notice>
        )
      }
    </RequireTenant>
  );
}
