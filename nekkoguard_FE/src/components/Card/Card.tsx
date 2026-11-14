import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Subtle violet corner glow — reserved for hero/KPI cards (spec 6.2). */
  glow?: boolean;
  as?: 'section' | 'article' | 'div';
}

export function Card({ glow = false, as: Tag = 'section', className, children, ...rest }: CardProps) {
  return (
    <Tag className={cx(styles.card, glow && styles.glow, className)} {...rest}>
      {children}
    </Tag>
  );
}

interface CardHeaderProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** id applied to the title, for aria-labelledby on the card. */
  titleId?: string;
}

export function CardHeader({ icon, title, description, actions, titleId }: CardHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <div className={styles.titles}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description && <p className={styles.description}>{description}</p>}
        </div>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx(styles.body, className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx(styles.footer, className)} {...rest}>
      {children}
    </div>
  );
}
