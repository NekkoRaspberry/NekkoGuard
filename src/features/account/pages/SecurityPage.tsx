import { ExternalLink, KeyRound, LogOut, Mail, MonitorSmartphone, ShieldCheck, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { Banner } from '@/components/Banner/Banner';
import { Button, ButtonAnchor } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useAuth } from '@/features/auth/useAuth';
import { PageHeader } from '@/layout/PageHeader/PageHeader';
import { backendUrl, type BackendPage } from '@/lib/backendLinks';
import styles from './AccountPages.module.css';

interface SecurityAction {
  page: BackendPage;
  icon: ReactNode;
  title: string;
  description: string;
  cta: string;
}

/** Account flows implemented by the backend (django-allauth) as server-rendered pages. */
const SECURITY_ACTIONS: SecurityAction[] = [
  {
    page: 'passwordChange',
    icon: <KeyRound size={16} />,
    title: 'Password',
    description: 'Change the password you use to sign in.',
    cta: 'Change password',
  },
  {
    page: 'twoFactor',
    icon: <Smartphone size={16} />,
    title: 'Two-factor authentication',
    description: 'Protect your account with an authenticator app and recovery codes.',
    cta: 'Manage 2FA',
  },
  {
    page: 'emailAddresses',
    icon: <Mail size={16} />,
    title: 'Email addresses',
    description: 'Add, verify or change the primary email address of your account.',
    cta: 'Manage emails',
  },
];

export function SecurityPage() {
  const { session, signOut } = useAuth();
  const persistent = session?.persistence === 'persistent';

  return (
    <div className={styles.page}>
      <PageHeader title="Security" description="Keep your NekkoGuard account and this browser secure." />

      <div className={styles.stack}>
        <Card aria-labelledby="account-security-title">
          <CardHeader
            icon={<ShieldCheck size={16} />}
            title="Account security"
            titleId="account-security-title"
            description="Managed directly by the NekkoGuard server."
          />
          <CardBody>
            <Banner tone="info">
              These settings open on the server in a new tab. It may ask you to sign in there as well.
            </Banner>
            <ul className={styles.actionList}>
              {SECURITY_ACTIONS.map((action) => (
                <li key={action.page} className={styles.actionRow}>
                  <span className={styles.actionIcon}>{action.icon}</span>
                  <div className={styles.actionText}>
                    <span className={styles.actionTitle}>{action.title}</span>
                    <span className={styles.actionDescription}>{action.description}</span>
                  </div>
                  <ButtonAnchor
                    href={backendUrl(action.page)}
                    target="_blank"
                    rel="noreferrer"
                    size="sm"
                    variant="secondary"
                    rightIcon={<ExternalLink size={14} />}
                    aria-label={`${action.cta} (opens in a new tab)`}
                  >
                    {action.cta}
                  </ButtonAnchor>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card aria-labelledby="browser-session-title">
          <CardHeader
            icon={<MonitorSmartphone size={16} />}
            title="This browser"
            titleId="browser-session-title"
            description="How your sign-in is kept on this device."
          />
          <CardBody>
            <div className={styles.sessionRow}>
              <div className={styles.sessionInfo}>
                <div className={styles.sessionMeta}>
                  <StatusPill tone={persistent ? 'primary' : 'neutral'} label={persistent ? 'Kept signed in' : 'Until browser closes'} />
                  <span>{session?.email}</span>
                </div>
                <p className={styles.actionDescription}>
                  {persistent
                    ? 'You stay signed in on this browser until you sign out. Avoid this on shared devices.'
                    : 'You will be signed out automatically when this browser is closed.'}
                </p>
              </div>
              <Button variant="secondary" leftIcon={<LogOut size={16} />} onClick={() => signOut('user')}>
                Sign out
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
