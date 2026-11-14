import { PenLine, ShieldCheck } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { Avatar } from '@/components/Avatar/Avatar';
import { ButtonLink } from '@/components/Button/Button';
import { Card } from '@/components/Card/Card';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import styles from './OverviewCards.module.css';

function greetingFor(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface WelcomeCardProps {
  name: string | null;
  email: string;
  loading: boolean;
}

export function WelcomeCard({ name, email, loading }: WelcomeCardProps) {
  const greeting = greetingFor(new Date().getHours());
  const hasName = Boolean(name?.trim());

  return (
    <Card glow className={styles.welcome} aria-labelledby="welcome-title">
      <div className={styles.welcomeMain}>
        <Avatar name={name ?? ''} email={email} size={48} />
        <div className={styles.welcomeText}>
          {loading ? (
            <Skeleton width={260} height={26} />
          ) : (
            <h2 id="welcome-title" className={styles.welcomeTitle}>
              {greeting}
              {hasName ? `, ${name}` : ''}
            </h2>
          )}
          <p className={styles.welcomeSubtitle}>
            Signed in as <span className={styles.email}>{email}</span>
          </p>
        </div>
      </div>
      <div className={styles.welcomeActions}>
        <ButtonLink to={ROUTES.profile} variant={hasName || loading ? 'secondary' : 'primary'} leftIcon={<PenLine size={16} />}>
          {hasName || loading ? 'Edit profile' : 'Add your name'}
        </ButtonLink>
        <ButtonLink to={ROUTES.security} variant="ghost" leftIcon={<ShieldCheck size={16} />}>
          Security
        </ButtonLink>
      </div>
    </Card>
  );
}
