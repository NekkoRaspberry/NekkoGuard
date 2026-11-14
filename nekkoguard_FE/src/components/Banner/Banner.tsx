import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './Banner.module.css';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const ICONS: Record<BannerTone, ReactNode> = {
  info: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  warning: <AlertTriangle size={16} />,
  danger: <XCircle size={16} />,
};

interface BannerProps {
  tone: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Inline notice. Danger/warning are announced to screen readers immediately. */
export function Banner({ tone, title, children, action, className }: BannerProps) {
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status';
  return (
    <div className={cx(styles.banner, styles[tone], className)} role={role}>
      <span className={styles.icon}>{ICONS[tone]}</span>
      <div className={styles.content}>
        {title && <p className={styles.title}>{title}</p>}
        {children && <div className={styles.text}>{children}</div>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
