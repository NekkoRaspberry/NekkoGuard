import { FileText } from 'lucide-react';
import type { TenantTermsDto, TermsVersionsDto } from '@/api/terms';
import { Banner } from '@/components/Banner/Banner';
import { Button } from '@/components/Button/Button';
import { Card } from '@/components/Card/Card';
import { formatDateTime } from '@/lib/format';
import { TermsReader } from './TermsDocument';
import { TermsMeta } from './TermsMeta';
import styles from './Terms.module.css';

export function AcceptanceStats({ stats }: { stats: TermsVersionsDto['current_stats'] }) {
  const percent = stats.required === 0 ? 0 : Math.round((stats.accepted / stats.required) * 100);
  return (
    <div className={styles.stats} role="group" aria-label="Acceptance of the current version">
      <div className={styles.stat}>
        <span className={styles.statLabel}>Required to accept</span>
        <span className={styles.statValue}>{stats.required}</span>
        <span className={styles.statHint}>Active members</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLabel}>Accepted</span>
        <span className={styles.statValue}>{stats.accepted}</span>
        <span className={styles.statHint}>Current version</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLabel}>Pending</span>
        <span className={styles.statValue}>{stats.pending}</span>
        <span className={styles.statHint}>Asked at their next request</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.statLabel}>Acceptance</span>
        <span className={styles.statValue}>{percent}%</span>
        <span className={styles.statHint}>of required members</span>
      </div>
    </div>
  );
}

/** The version in effect: what every member of the Tenant has accepted (or must). */
export function CurrentTermsPanel({
  terms,
  tenantName,
  stats,
  onWriteFirst,
}: {
  terms: TenantTermsDto;
  tenantName: string;
  stats?: TermsVersionsDto['current_stats'];
  onWriteFirst?: () => void;
}) {
  const current = terms.current;
  if (!current) {
    return (
      <Card>
        <div className={styles.empty}>
          <FileText size={28} aria-hidden="true" />
          <p className={styles.emptyTitle}>No Terms of Service published for {tenantName}</p>
          <p>Members can use NekkoGuard without accepting any terms until a version is published.</p>
          {onWriteFirst && (
            <Button variant="primary" onClick={onWriteFirst}>
              Write the first version
            </Button>
          )}
        </div>
      </Card>
    );
  }
  return (
    <div className={styles.panel}>
      {stats && <AcceptanceStats stats={stats} />}
      <TermsReader
        title={current.title}
        meta={<TermsMeta version={current} showPublisher={terms.can_manage} />}
        doc={current.content}
        prefix="current-"
        banner={
          terms.accepted_at ? (
            <Banner tone="success">You accepted this version on {formatDateTime(Date.parse(terms.accepted_at))}.</Banner>
          ) : null
        }
      />
    </div>
  );
}
