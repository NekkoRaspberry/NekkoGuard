import type { ReactNode } from 'react';
import styles from './KeyValueGrid.module.css';

export interface KeyValueItem {
  label: string;
  value: ReactNode;
  /** Render the value in the monospace face (ids, technical values). */
  mono?: boolean;
}

export function KeyValueGrid({ items }: { items: KeyValueItem[] }) {
  return (
    <dl className={styles.grid}>
      {items.map((item) => (
        <div key={item.label} className={styles.item}>
          <dt className={styles.label}>{item.label}</dt>
          <dd
            className={item.mono ? `${styles.value} ${styles.mono}` : styles.value}
            // Values are truncated with an ellipsis; plain-text values reveal the full text on hover.
            title={typeof item.value === 'string' || typeof item.value === 'number' ? String(item.value) : undefined}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Renders a missing value as muted "Unknown" — never blank, never zero (spec 4.2). */
export function UnknownValue({ children = 'Unknown' }: { children?: ReactNode }) {
  return <span className={styles.unknown}>{children}</span>;
}
