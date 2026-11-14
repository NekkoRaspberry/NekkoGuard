import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo/Logo';
import styles from './EntranceLayout.module.css';

interface EntranceLayoutProps {
  children: ReactNode;
  footer?: ReactNode;
}

/** Centered card on the app background, no sidebar — login and public error pages (spec 4.3). */
export function EntranceLayout({ children, footer }: EntranceLayoutProps) {
  return (
    <div className={styles.root}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.grid} aria-hidden="true" />
      <main className={styles.container}>
        <div className={styles.logo}>
          <Logo size={36} />
        </div>
        <div className={styles.card}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </main>
    </div>
  );
}
