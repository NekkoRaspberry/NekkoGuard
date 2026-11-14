import { Activity, Radio, RefreshCw, Server } from 'lucide-react';
import type { ReactNode } from 'react';
import { isApiError } from '@/api/errors';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { StatusPill, type StatusTone } from '@/components/StatusPill/StatusPill';
import { useApiHealth } from '@/features/system/useApiHealth';
import { useRealtime } from '@/features/system/useRealtime';
import type { RealtimeStatus } from '@/features/system/RealtimeContext';
import { useNow } from '@/hooks/useNow';
import { formatDateTime, formatLatency, formatRelative } from '@/lib/format';
import styles from './OverviewCards.module.css';

interface StatusRowProps {
  icon: ReactNode;
  title: string;
  description: string;
  tone: StatusTone;
  statusLabel: string;
  pulse?: boolean;
  latencyMs: number | null;
  lastSeenAt: number | null;
  lastSeenLabel: string;
  now: number;
}

function StatusRow({ icon, title, description, tone, statusLabel, pulse, latencyMs, lastSeenAt, lastSeenLabel, now }: StatusRowProps) {
  return (
    <li className={styles.statusRow}>
      <span className={styles.statusIcon}>{icon}</span>
      <div className={styles.statusText}>
        <div className={styles.statusTitleRow}>
          <span className={styles.statusTitle}>{title}</span>
          <StatusPill tone={tone} label={statusLabel} pulse={pulse ?? false} />
        </div>
        <span className={styles.statusDescription}>{description}</span>
      </div>
      <dl className={styles.statusMetrics}>
        <div>
          <dt>Latency</dt>
          <dd className={styles.mono}>{formatLatency(latencyMs)}</dd>
        </div>
        <div>
          <dt>{lastSeenLabel}</dt>
          <dd title={lastSeenAt ? formatDateTime(lastSeenAt) : undefined}>
            {lastSeenAt ? formatRelative(lastSeenAt, now) : <span className={styles.unknown}>Never</span>}
          </dd>
        </div>
      </dl>
    </li>
  );
}

const REALTIME_DISPLAY: Record<RealtimeStatus, { tone: StatusTone; label: string }> = {
  connected: { tone: 'success', label: 'Connected' },
  connecting: { tone: 'warning', label: 'Connecting' },
  disconnected: { tone: 'danger', label: 'Offline' },
};

export function ConnectionStatusCard() {
  const now = useNow();
  const api = useApiHealth();
  const realtime = useRealtime();

  let apiTone: StatusTone = 'neutral';
  let apiLabel = 'Checking';
  if (api.isError) {
    apiTone = 'danger';
    apiLabel = isApiError(api.error) && api.error.isUnreachable ? 'Unreachable' : 'Error';
  } else if (api.isSuccess) {
    apiTone = 'success';
    apiLabel = 'Online';
  }

  const realtimeDisplay = REALTIME_DISPLAY[realtime.status];

  const checkNow = () => {
    void api.refetch();
    if (realtime.status !== 'connected') realtime.reconnect();
  };

  return (
    <Card aria-labelledby="connection-title">
      <CardHeader
        icon={<Activity size={16} />}
        title="Server connection"
        titleId="connection-title"
        description="Live health of the links between this browser and the NekkoGuard server."
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={checkNow}
            loading={api.isFetching}
            leftIcon={<RefreshCw size={14} />}
          >
            Check now
          </Button>
        }
      />
      <CardBody>
        <ul className={styles.statusList}>
          <StatusRow
            icon={<Server size={16} />}
            title="REST API"
            description={
              api.isError ? api.error.message : 'Authenticated requests to the account API.'
            }
            tone={apiTone}
            statusLabel={apiLabel}
            latencyMs={api.data?.latencyMs ?? null}
            lastSeenAt={api.data?.checkedAt ?? null}
            lastSeenLabel="Last success"
            now={now}
          />
          <StatusRow
            icon={<Radio size={16} />}
            title="Realtime channel"
            description="WebSocket heartbeat (ping → pong) every 30 seconds."
            tone={realtimeDisplay.tone}
            statusLabel={realtimeDisplay.label}
            pulse={realtime.status === 'connected'}
            latencyMs={realtime.latencyMs}
            lastSeenAt={realtime.lastPongAt}
            lastSeenLabel="Last heartbeat"
            now={now}
          />
        </ul>
      </CardBody>
    </Card>
  );
}
