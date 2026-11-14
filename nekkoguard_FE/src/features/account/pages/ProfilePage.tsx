import { ArrowRight, AtSign } from 'lucide-react';
import { Link } from 'react-router';
import { ROUTES } from '@/app/routes';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { TextField } from '@/components/TextField/TextField';
import { PageHeader } from '@/layout/PageHeader/PageHeader';
import { ProfileForm } from '../components/ProfileForm';
import { useCurrentUser } from '../hooks/useCurrentUser';
import formStyles from '../components/AccountForms.module.css';
import styles from './AccountPages.module.css';

function ProfileFormSkeleton() {
  return (
    <Card>
      <CardBody>
        <Skeleton width={140} height={18} />
        <Skeleton width="60%" height={12} />
        <Skeleton height={38} radius="sm" />
      </CardBody>
    </Card>
  );
}

export function ProfilePage() {
  const { data: user, isPending, isError, error, refetch, isFetching } = useCurrentUser();

  return (
    <div className={styles.page}>
      <PageHeader title="Profile" description="Manage the personal details of your NekkoGuard account." />

      <div className={styles.stack}>
        {isPending ? (
          <ProfileFormSkeleton />
        ) : isError ? (
          <Card>
            <ErrorState error={error} title="Could not load your profile" onRetry={() => void refetch()} retrying={isFetching} />
          </Card>
        ) : (
          <ProfileForm key={user.name} user={user} />
        )}

        <Card aria-labelledby="sign-in-identity-title">
          <CardHeader
            icon={<AtSign size={16} />}
            title="Sign-in identity"
            titleId="sign-in-identity-title"
            description="Your primary email address is your login. Changes are verified by email."
          />
          <CardBody>
            {isPending ? (
              <Skeleton height={38} radius="sm" />
            ) : (
              <TextField
                label="Primary email"
                value={user?.email ?? ''}
                readOnly
                hint={
                  <Link to={`${ROUTES.security}#emails`} className={formStyles.inlineLink}>
                    Manage email addresses <ArrowRight size={12} />
                  </Link>
                }
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
