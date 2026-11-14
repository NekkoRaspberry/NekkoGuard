import { RotateCcw, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/components/Button/Button';
import { NotFoundPage } from './NotFoundPage';
import styles from './StatusPages.module.css';

/** Last-resort error boundary for routes (render errors, failed lazy chunks). */
export function RouteErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  // A failed dynamic import usually means a new version was deployed — a reload fixes it.
  const isChunkError = error instanceof Error && /dynamically imported module|Importing a module script failed/i.test(error.message);

  return (
    <div className={styles.root} role="alert">
      <span className={`${styles.icon} ${styles.iconDanger}`}>
        <TriangleAlert size={24} />
      </span>
      <h1>{isChunkError ? 'A new version is available' : 'Something went wrong'}</h1>
      <p className={styles.text}>
        {isChunkError
          ? 'Reload the page to get the latest version of NekkoGuard.'
          : 'An unexpected error occurred while showing this page. Reloading usually helps.'}
      </p>
      <Button variant="primary" leftIcon={<RotateCcw size={16} />} onClick={() => window.location.reload()}>
        Reload page
      </Button>
    </div>
  );
}
