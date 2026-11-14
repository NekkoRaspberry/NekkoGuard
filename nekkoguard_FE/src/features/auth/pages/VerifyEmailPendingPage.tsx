import { MailCheck } from 'lucide-react';
import { Button } from '@/components/Button/Button';
import { EntranceLayout } from '@/layout/EntranceLayout/EntranceLayout';
import { AuthHeading } from '../components/AuthHeading';
import { useAuth } from '../useAuth';
import styles from './AuthPages.module.css';

/** Shown after sign-up / login while the account's email is not verified (flow `verify_email`). */
export function VerifyEmailPendingPage() {
  const { signOut } = useAuth();

  return (
    <EntranceLayout>
      <AuthHeading
        icon={<MailCheck size={20} />}
        title="Check your inbox"
        subtitle="We sent a verification link to your email address. Open it to activate your account, then sign in."
      />
      <div className={styles.actions}>
        <Button variant="secondary" fullWidth onClick={() => void signOut()}>
          Back to sign in
        </Button>
        <p className={styles.subtitle}>Can’t find it? Check your spam folder. Signing in again sends a new link.</p>
      </div>
    </EntranceLayout>
  );
}
