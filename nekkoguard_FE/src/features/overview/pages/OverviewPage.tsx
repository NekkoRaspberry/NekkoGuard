import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { useAuth } from '@/features/auth/useAuth';
import { PageHeader } from '@/layout/PageHeader/PageHeader';
import { AccountSummaryCard } from '../components/AccountSummaryCard';
import { ConnectionStatusCard } from '../components/ConnectionStatusCard';
import { WelcomeCard } from '../components/WelcomeCard';
import styles from './OverviewPage.module.css';

export function OverviewPage() {
  const { user: sessionUser } = useAuth();
  const { data: user, isPending } = useCurrentUser();

  return (
    <>
      <PageHeader title="Overview" description="Your account and the state of your connection to the NekkoGuard server." />
      <div className={styles.grid}>
        <div className={styles.full}>
          <WelcomeCard name={user?.name ?? null} email={user?.email ?? sessionUser?.email ?? ''} loading={isPending} />
        </div>
        <div className={styles.wide}>
          <ConnectionStatusCard />
        </div>
        <div className={styles.narrow}>
          <AccountSummaryCard />
        </div>
      </div>
    </>
  );
}
