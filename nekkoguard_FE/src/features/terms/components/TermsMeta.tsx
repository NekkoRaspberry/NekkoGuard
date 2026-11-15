import type { TermsVersionDto } from '@/api/terms';
import { formatCalendarDate, formatDateTime } from '@/lib/format';
import styles from './Terms.module.css';

/** "Version 2 · Effective 15 November 2026 · Published by Ana" */
export function TermsMeta({ version, showPublisher = false }: { version: TermsVersionDto; showPublisher?: boolean }) {
  if (version.status === 'draft') {
    return <span>Draft — not published</span>;
  }
  return (
    <>
      <span>
        Version <span className={styles.mono}>{version.number}</span>
      </span>
      <span className={styles.dot} aria-hidden="true">
        ·
      </span>
      <span>{version.effective_date ? `Effective ${formatCalendarDate(version.effective_date)}` : 'Not yet effective'}</span>
      {showPublisher && version.published_at && (
        <>
          <span className={styles.dot} aria-hidden="true">
            ·
          </span>
          <span>
            Published {formatDateTime(Date.parse(version.published_at))}
            {version.published_by ? ` by ${version.published_by.email}` : ''}
          </span>
        </>
      )}
    </>
  );
}
