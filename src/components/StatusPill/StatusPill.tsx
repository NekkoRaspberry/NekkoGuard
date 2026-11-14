import { cx } from '@/lib/cx';
import styles from './StatusPill.module.css';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

interface StatusPillProps {
  tone: StatusTone;
  label: string;
  /** Animated dot — for live/in-progress states. */
  pulse?: boolean;
}

/** Dot + text on a tinted background: status never relies on colour alone. */
export function StatusPill({ tone, label, pulse = false }: StatusPillProps) {
  return (
    <span className={cx(styles.pill, styles[tone])}>
      <span className={cx(styles.dot, pulse && styles.pulse)} aria-hidden="true" />
      {label}
    </span>
  );
}
