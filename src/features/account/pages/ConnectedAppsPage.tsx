import { PageHeader } from '@/layout/PageHeader/PageHeader';
import { AuthorizedAppsCard } from '../components/apps/AuthorizedAppsCard';
import { RegisteredAppsCard } from '../components/apps/RegisteredAppsCard';
import { useCurrentUser } from '../hooks/useCurrentUser';
import styles from './AccountPages.module.css';

/**
 * Connected applications: apps registered within NekkoGuard (OAuth2 / OpenID Connect).
 * Separate from sign-in providers (Google/GitHub/LinkedIn) on the Security page.
 */
export function ConnectedAppsPage() {
  const { data: user } = useCurrentUser();

  return (
    <div className={styles.page}>
      <PageHeader
        title="Connected applications"
        description="Applications that can use your NekkoGuard account to sign you in and read your profile."
      />
      <div className={styles.stack}>
        <AuthorizedAppsCard />
        {user?.isStaff && <RegisteredAppsCard />}
      </div>
    </div>
  );
}
