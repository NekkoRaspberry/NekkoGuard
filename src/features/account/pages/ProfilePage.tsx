import { AtSign, ExternalLink } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { TextField } from '@/components/TextField/TextField';
import { useAuth } from '@/features/auth/useAuth';
import { PageHeader } from '@/layout/PageHeader/PageHeader';
import { backendUrl } from '@/lib/backendLinks';
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
  const { session } = useAuth();
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
            description="Your email address is your login. It is managed and verified by the server."
          />
          <CardBody>
            <div className={formStyles.readOnlyStack}>
              <TextField
                label="Email"
                value={session?.email ?? ''}
                readOnly
                hint={
                  <a href={backendUrl('emailAddresses')} target="_blank" rel="noreferrer" className={formStyles.inlineLink}>
                    Manage email addresses <ExternalLink size={12} />
                  </a>
                }
              />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
