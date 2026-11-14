import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo/Logo';
import { config } from '@/config/env';
import { cx } from '@/lib/cx';
import styles from './EntranceLayout.module.css';

interface EntranceLayoutProps {
  children: ReactNode;
  footer?: ReactNode;
  /** "admin": teal accent for the Django admin sign-in. */
  variant?: 'default' | 'admin';
}

/** Centered card on the app background, no sidebar — sign-in, sign-up and email-link pages (spec 4.3). */
export function EntranceLayout({ children, footer, variant = 'default' }: EntranceLayoutProps) {
  return (
    <div className={cx(styles.root, variant === 'admin' && styles.admin)}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.grid} aria-hidden="true" />
      <main className={styles.container}>
        <div className={styles.logo}>
          <Logo size={36} {...(variant === 'admin' ? { suffix: 'Administration' } : {})} />
        </div>
        <div className={styles.card}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </main>
      <p className={styles.version}>NekkoGuard v{config.appVersion}</p>
    </div>
  );
}
