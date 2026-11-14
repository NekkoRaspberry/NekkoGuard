import { BookOpen, ExternalLink, LogOut, MonitorSmartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { API_PATHS } from '@/api/endpoints';
import { Button, ButtonAnchor } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { useAuth } from '@/features/auth/useAuth';
import { PageHeader } from '@/layout/PageHeader/PageHeader';
import { EmailAddressesCard } from '../components/security/EmailAddressesCard';
import { PasswordCard } from '../components/security/PasswordCard';
import { SignInProvidersCard } from '../components/security/SignInProvidersCard';
import { TwoFactorCard } from '../components/security/TwoFactorCard';
import { useCurrentUser } from '../hooks/useCurrentUser';
import styles from './AccountPages.module.css';

function SessionCard() {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Card aria-labelledby="browser-session-title">
      <CardHeader
        icon={<MonitorSmartphone size={16} />}
        title="This browser"
        titleId="browser-session-title"
        description="Your session ends automatically when you close the browser."
      />
      <CardBody>
        <div className={styles.sessionRow}>
          <p className={styles.actionDescription}>Signing out ends the session on the server immediately.</p>
          <Button
            variant="secondary"
            leftIcon={<LogOut size={16} />}
            loading={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut();
            }}
          >
            Sign out
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

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

export function SecurityPage() {
  const { data: user } = useCurrentUser();
  const { hash } = useLocation();

  // Deep links such as /account/security#emails scroll to the matching card.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <div className={styles.page}>
      <PageHeader title="Security" description="Manage how you sign in and keep your NekkoGuard account protected." />
      <div className={styles.stack}>
        <TwoFactorCard />
        <PasswordCard />
        <EmailAddressesCard />
        <SignInProvidersCard />
        <SessionCard />
        {user?.isStaff && <AdminToolsCard />}
      </div>
    </div>
  );
}
