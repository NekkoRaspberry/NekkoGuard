import { ArrowLeft, Compass } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { ButtonLink } from '@/components/Button/Button';
import styles from './StatusPages.module.css';

export function NotFoundPage() {
  return (
    <div className={styles.root}>
      <span className={styles.icon}>
        <Compass size={24} />
      </span>
      <p className={styles.code}>404</p>
      <h1>Page not found</h1>
      <p className={styles.text}>The page you are looking for does not exist or has moved.</p>
      <ButtonLink to={ROUTES.overview} variant="primary" leftIcon={<ArrowLeft size={16} />}>
        Back to overview
      </ButtonLink>
    </div>
  );
}
