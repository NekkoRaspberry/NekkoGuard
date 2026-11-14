import { ArrowRight, IdCard } from 'lucide-react';
import { Link } from 'react-router';
import { ROUTES } from '@/app/routes';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { KeyValueGrid, UnknownValue } from '@/components/KeyValueGrid/KeyValueGrid';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import { useAuth } from '@/features/auth/useAuth';
import styles from './OverviewCards.module.css';

export function AccountSummaryCard() {
  const { session } = useAuth();
  const { data: user, isPending, isError, error, refetch, isFetching } = useCurrentUser();

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
              { label: 'Email', value: session?.email ?? <UnknownValue /> },
              { label: 'User ID', value: user.id ?? <UnknownValue />, mono: true },
              {
                label: 'This browser',
                value: (
                  <StatusPill
                    tone={session?.persistence === 'persistent' ? 'primary' : 'neutral'}
                    label={session?.persistence === 'persistent' ? 'Kept signed in' : 'Until browser closes'}
                  />
                ),
              },
            ]}
          />
        )}
      </CardBody>
    </Card>
  );
}
