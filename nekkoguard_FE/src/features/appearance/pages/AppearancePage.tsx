import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi } from '@/api/tenancy';
import { ROUTES } from '@/app/routes';
import { ButtonLink } from '@/components/Button/Button';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { RequireOrganization, RequireTenant, TenantOrganizationScope } from '@/features/tenancy/components/ScopeGate';
import styles from '@/features/tenancy/components/Management.module.css';
import { AppearanceEditor } from '../components/AppearanceEditor';
import { manageOrganization, useManagedOrganizationId } from '@/features/settings/managedOrganization';
import { useScopeAppearance } from '../hooks';

/*
 * Appearance lives inside the context it customizes; its title comes from the route.
 * The Tenant/Organization is always the one selected in the context bar (or, from the
 * Tenant's organization list, the URL Organization of that Tenant) — never chosen here.
 * Editors are keyed by scope, so a context switch never keeps another scope's draft.
 * The backend decides who may read or change each scope (read-only otherwise).
 */

function ScopeEditor({ tenantId, orgId }: { tenantId: string; orgId: string | null }) {
  const query = useScopeAppearance(tenantId, orgId);
  if (query.isPending) return <Skeleton height={420} radius="sm" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <AppearanceEditor tenantId={tenantId} orgId={orgId} dto={query.data} />;
}

/** Settings → Tenant → Appearance: the selected Tenant's defaults. */
export function TenantAppearancePage() {
  return (
    <div className={styles.stack}>
      <RequireTenant>{({ tenantId }) => <ScopeEditor key={tenantId} tenantId={tenantId} orgId={null} />}</RequireTenant>
    </div>
  );
}

/** Settings → Organization → Appearance: overrides of the selected Organization. */
export function OrganizationAppearancePage() {
  return (
    <div className={styles.stack}>
      <RequireOrganization>
        {({ tenantId, orgId }) => <ScopeEditor key={`${tenantId}/${orgId}`} tenantId={tenantId} orgId={orgId} />}
      </RequireOrganization>
    </div>
  );
}

function OrganizationName({ tenantId, orgId }: { tenantId: string; orgId: string }) {
  const organization = useQuery({
    queryKey: queryKeys.organization(tenantId, orgId),
    queryFn: ({ signal }) => tenancyApi.getOrganization(tenantId, orgId, signal),
  });
  if (!organization.data) return null;
  return <p className={styles.muted}>Organization: {organization.data.name}</p>;
}

/**
 * Settings → Tenant → Organizations → one → Appearance. For Tenant Appearance Admins,
 * who may customize every Organization of their Tenant, including ones they cannot
 * open (and so cannot select in the context bar).
 */
export function TenantOrganizationAppearancePage() {
  const orgId = useManagedOrganizationId();
  return (
    <div className={styles.stack}>
      <TenantOrganizationScope orgId={orgId}>
        {(tenantId, id) => (
          <>
            <div className={styles.toolbar}>
              <ButtonLink size="sm" variant="ghost" leftIcon={<ArrowLeft size={14} />} to={ROUTES.tenantOrganization} state={manageOrganization(id)}>
                Back to organization
              </ButtonLink>
              <OrganizationName tenantId={tenantId} orgId={id} />
            </div>
            <ScopeEditor key={`${tenantId}/${id}`} tenantId={tenantId} orgId={id} />
          </>
        )}
      </TenantOrganizationScope>
    </div>
  );
}
