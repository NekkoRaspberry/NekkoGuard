import { LogOut, MonitorSmartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { useAuth } from '@/features/auth/useAuth';
import { EmailAddressesCard } from '../components/security/EmailAddressesCard';
import { PasswordCard } from '../components/security/PasswordCard';
import { SignInProvidersCard } from '../components/security/SignInProvidersCard';
import { TwoFactorCard } from '../components/security/TwoFactorCard';
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

/** Settings → Profile → Security: the only security page (account-level). */
export function SecurityPage() {
  const { hash } = useLocation();

  // Deep links such as /settings/profile/security#emails scroll to the matching card.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <div className={styles.page}>
      <div className={styles.stack}>
        <TwoFactorCard />
        <PasswordCard />
        <EmailAddressesCard />
        <SignInProvidersCard />
        <SessionCard />
      </div>
    </div>
  );
}
