import { PageHeader } from '@/layout/PageHeader/PageHeader';
import { useCan } from '@/features/tenancy/hooks';
import { PERMISSIONS } from '@/features/tenancy/model';
import { RequireOrganization } from '@/features/tenancy/components/ScopeGate';
import styles from '@/features/tenancy/components/Management.module.css';
import { NetworksCard } from '../components/NetworksCard';
import { SitesCard } from '../components/SitesCard';

/**
 * Sites and networks of the Organization selected in the context bar.
 * Backend: /api/tenants/{t}/organizations/{o}/sites/ and …/networks/.
 */
export function InfrastructurePage() {
  const canViewSites = useCan(PERMISSIONS.viewSites);
  const canViewNetworks = useCan(PERMISSIONS.viewNetworks);

  return (
    <div className={styles.stack}>
      <PageHeader title="Sites & networks" description="Locations and address ranges of the current organization." />
      <RequireOrganization>
        {(scope) => (
          <>
            {canViewSites && <SitesCard scope={scope} />}
            {canViewNetworks && <NetworksCard scope={scope} />}
            {!canViewSites && !canViewNetworks && (
              <p className={styles.muted}>You have no permission to view sites or networks in this organization.</p>
            )}
          </>
        )}
      </RequireOrganization>
    </div>
  );
}
