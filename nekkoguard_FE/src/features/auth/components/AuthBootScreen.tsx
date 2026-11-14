import { ErrorState } from '@/components/ErrorState/ErrorState';
import { LogoMark } from '@/components/Logo/Logo';
import { Spinner } from '@/components/Spinner/Spinner';
import styles from './AuthBootScreen.module.css';

interface AuthBootScreenProps {
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
}

/** Shown while the initial session check runs (or if it fails). */
export function AuthBootScreen({ error, retrying, onRetry }: AuthBootScreenProps) {
  return (
    <div className={styles.root}>
      {error ? (
        <div className={styles.card}>
          <ErrorState error={error} title="Cannot reach NekkoGuard" onRetry={onRetry} retrying={retrying} />
        </div>
      ) : (
        <div className={styles.loading}>
          <LogoMark size={44} />
          <Spinner label="Loading NekkoGuard" />
        </div>
      )}
    </div>
  );
}
