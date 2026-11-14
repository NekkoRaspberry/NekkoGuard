import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import styles from './Apps.module.css';

/** Monospace value with a copy button (client IDs, secrets, endpoint URLs). */
export function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className={styles.copyField}>
      <span className={styles.copyLabel}>{label}</span>
      <div className={styles.copyRow}>
        <code className={styles.copyValue}>{value}</code>
        <button
          type="button"
          className={styles.copyButton}
          aria-label={`Copy ${label}`}
          onClick={async () => {
            if (await copyToClipboard(value)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}
