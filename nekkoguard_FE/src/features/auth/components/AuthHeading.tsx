import type { ReactNode } from 'react';
import styles from '../pages/AuthPages.module.css';

interface AuthHeadingProps {
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  tone?: 'primary' | 'success' | 'danger';
}

export function AuthHeading({ icon, title, subtitle, tone = 'primary' }: AuthHeadingProps) {
  return (
    <div className={styles.heading}>
      {icon && <span className={`${styles.headingIcon} ${styles[tone]}`}>{icon}</span>}
      <h1>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
}
