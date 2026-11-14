import { useRealtime } from '@/features/system/useRealtime';
import type { RealtimeStatus } from '@/features/system/RealtimeContext';
import { cx } from '@/lib/cx';
import { formatLatency } from '@/lib/format';
import styles from './Sidebar.module.css';

const LABELS: Record<RealtimeStatus, string> = {
  connected: 'Server connected',
  connecting: 'Connecting…',
  disconnected: 'Server offline',
};

/** Sidebar footer: live link to the backend's WebSocket heartbeat. */
export function ConnectionIndicator({ compact }: { compact: boolean }) {
  const { status, latencyMs, reconnect } = useRealtime();
  const detail = status === 'connected' ? formatLatency(latencyMs) : status === 'disconnected' ? 'Retry' : '';
  const label = LABELS[status];

  return (
    <button
      type="button"
      className={cx(styles.connection, styles[`conn-${status}`])}
      onClick={reconnect}
      title={`${label}${status === 'connected' ? ` · ${detail}` : ''} — click to reconnect`}
      aria-label={`${label}. Reconnect`}
    >
      <span className={styles.connDot} aria-hidden="true" />
      {!compact && (
        <>
          <span className={styles.connLabel}>{label}</span>
          {detail && <span className={styles.connDetail}>{detail}</span>}
        </>
      )}
    </button>
  );
}
