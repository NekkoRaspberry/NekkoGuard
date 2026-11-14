import { PageHeader } from '@/layout/PageHeader/PageHeader';
import { useIsPlatformAdmin } from '@/features/tenancy/hooks';
import styles from '@/features/tenancy/components/Management.module.css';
import { PlatformTenantsCard } from '../components/PlatformTenantsCard';

export function PlatformTenantsPage() {
  const isPlatformAdmin = useIsPlatformAdmin();
  return (
    <div className={styles.stack}>
      <PageHeader title="Platform tenants" description="Create and deactivate tenants. Platform administrators only." />
      {isPlatformAdmin ? (
        <PlatformTenantsCard />
      ) : (
        <p className={styles.muted}>Only platform administrators can manage tenants.</p>
      )}
    </div>
  );
}
