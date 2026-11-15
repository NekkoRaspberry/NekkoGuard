import { BookOpen, ExternalLink } from 'lucide-react';
import { API_PATHS } from '@/api/endpoints';
import { ButtonAnchor } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { AuthorizedAppsCard } from '../components/apps/AuthorizedAppsCard';
import { RegisteredAppsCard } from '../components/apps/RegisteredAppsCard';
import { useCurrentUser } from '../hooks/useCurrentUser';
import styles from './AccountPages.module.css';

function AdminToolsCard() {
  return (
    <Card aria-labelledby="admin-tools-title">
      <CardHeader
        icon={<BookOpen size={16} />}
        title="Administrator tools"
        titleId="admin-tools-title"
        description="Available because your account has staff access."
      />
      <CardBody>
        <div className={styles.sessionRow}>
          <p className={styles.actionDescription}>Interactive documentation of the NekkoGuard REST API (Swagger UI).</p>
          <ButtonAnchor
            href={API_PATHS.docs}
            target="_blank"
            rel="noreferrer"
            variant="secondary"
            rightIcon={<ExternalLink size={14} />}
            aria-label="API documentation (opens in a new tab)"
          >
            API documentation
          </ButtonAnchor>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Connected applications: apps registered within NekkoGuard (OAuth2 / OpenID Connect).
 * Separate from sign-in providers (Google/GitHub/LinkedIn) on the Security page.
 */
export function ConnectedAppsPage() {
  const { data: user } = useCurrentUser();

  return (
    <div className={styles.page}>
      <div className={styles.stack}>
        <AuthorizedAppsCard />
        {user?.isStaff && <RegisteredAppsCard />}
        {user?.isStaff && <AdminToolsCard />}
      </div>
    </div>
  );
}
