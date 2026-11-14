import { ArrowRight, IdCard } from 'lucide-react';
import { Link } from 'react-router';
import { ROUTES } from '@/app/routes';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { KeyValueGrid, UnknownValue } from '@/components/KeyValueGrid/KeyValueGrid';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { useAuthenticators } from '@/features/account/hooks/useSecurityData';
import styles from './OverviewCards.module.css';

export function AccountSummaryCard() {
  const { data: user, isPending, isError, error, refetch, isFetching } = useCurrentUser();
  const authenticators = useAuthenticators();

  const twoFactor = authenticators.isPending ? (
    <Skeleton width={90} height={18} />
  ) : authenticators.isError ? (
    <UnknownValue />
  ) : authenticators.data.totp ? (
    <StatusPill tone="success" label="Enabled" />
  ) : (
    <StatusPill tone="warning" label="Not enabled" />
  );

  return (
    <Card aria-labelledby="account-summary-title">
      <CardHeader
        icon={<IdCard size={16} />}
        title="Your account"
        titleId="account-summary-title"
        description="Details the server holds for the signed-in user."
        actions={
          <Link to={ROUTES.profile} className={styles.headerLink}>
            Manage <ArrowRight size={14} />
          </Link>
        }
      />
      <CardBody>
        {isPending ? (
          <div className={styles.skeletonGrid}>
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className={styles.skeletonItem}>
                <Skeleton width={64} height={10} />
                <Skeleton width="70%" height={16} />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />
        ) : (
          <KeyValueGrid
            items={[
              { label: 'Display name', value: user.name || <UnknownValue>Not set</UnknownValue> },
              { label: 'Email', value: user.email },
              {
                label: 'Role',
                value: <StatusPill tone={user.isStaff ? 'primary' : 'neutral'} label={user.isStaff ? 'Administrator' : 'User'} />,
              },
              { label: 'Two-factor', value: twoFactor },
            ]}
          />
        )}
      </CardBody>
    </Card>
  );
}
