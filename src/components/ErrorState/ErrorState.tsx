import { RefreshCw, ServerCrash, TriangleAlert } from 'lucide-react';
import { isApiError } from '@/api/errors';
import { Button } from '../Button/Button';
import styles from './ErrorState.module.css';

interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

/** Card-level error: what failed, the (sanitised) server message, and a retry. */
export function ErrorState({ error, title, onRetry, retrying = false }: ErrorStateProps) {
  const unreachable = isApiError(error) && error.isUnreachable;
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';

  return (
    <div className={styles.root} role="alert">
      <span className={styles.icon}>{unreachable ? <ServerCrash size={20} /> : <TriangleAlert size={20} />}</span>
      <p className={styles.title}>{title ?? (unreachable ? 'Server unreachable' : 'Could not load data')}</p>
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} loading={retrying} leftIcon={<RefreshCw size={14} />}>
          Retry
        </Button>
      )}
    </div>
  );
}
