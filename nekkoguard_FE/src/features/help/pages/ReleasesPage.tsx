import { Bug, ChevronDown, Rocket, ShieldAlert, Sparkles, TrendingUp, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ChangeCategory, ReleaseDto } from '@/api/help';
import { Button } from '@/components/Button/Button';
import { Card } from '@/components/Card/Card';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { PageHeader } from '@/layout/PageHeader/PageHeader';
import { cx } from '@/lib/cx';
import { formatCalendarDate } from '@/lib/format';
import { useReleases } from '../hooks';
import styles from '../Help.module.css';

/** Display order: what may need action first, then what is new. */
const CATEGORIES: { key: ChangeCategory; label: string; icon: ReactNode }[] = [
  { key: 'breaking', label: 'Breaking changes', icon: <TriangleAlert size={14} /> },
  { key: 'security', label: 'Security updates', icon: <ShieldAlert size={14} /> },
  { key: 'features', label: 'New features', icon: <Sparkles size={14} /> },
  { key: 'improvements', label: 'Improvements', icon: <TrendingUp size={14} /> },
  { key: 'fixes', label: 'Bug fixes', icon: <Bug size={14} /> },
];

/** Older releases shown before "Show older releases". */
const PAGE_SIZE = 10;

function ReleaseBody({ release }: { release: ReleaseDto }) {
  const categories = CATEGORIES.filter((c) => (release.changes[c.key]?.length ?? 0) > 0);
  return (
    <div className={styles.releaseBody}>
      {release.summary && <p className={styles.summary}>{release.summary}</p>}
      {categories.map((category) => (
        <section key={category.key} className={styles.category} aria-label={category.label}>
          <h3 className={styles.categoryTitle}>
            <span className={cx(styles.categoryIcon, styles[category.key])} aria-hidden="true">
              {category.icon}
            </span>
            {category.label}
          </h3>
          <ul className={styles.entries}>
            {release.changes[category.key]?.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ReleaseTitle({ release, latest, current }: { release: ReleaseDto; latest?: boolean; current: boolean }) {
  return (
    <span className={styles.releaseTitle}>
      <span className={styles.version}>v{release.version}</span>
      {latest && <StatusPill tone="primary" label="Latest" />}
      {release.type === 'pre-release' && <StatusPill tone="warning" label="Pre-release" />}
      {current && <StatusPill tone="success" label="Running" />}
    </span>
  );
}

function OlderRelease({ release, current }: { release: ReleaseDto; current: boolean }) {
  const [open, setOpen] = useState(false);
  const bodyId = `release-${release.version}`;
  return (
    <article className={styles.release} aria-label={`Release ${release.version}`}>
      <button
        type="button"
        className={styles.releaseHeader}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <ReleaseTitle release={release} current={current} />
        <time className={styles.date} dateTime={release.date}>
          {formatCalendarDate(release.date)}
        </time>
        <ChevronDown size={16} className={cx(styles.chevron, open && styles.chevronOpen)} aria-hidden="true" />
      </button>
      {open && (
        <div id={bodyId}>
          <ReleaseBody release={release} />
        </div>
      )}
    </article>
  );
}

/**
 * Help › Release versions. Source: nekkoguard/support/content/releases.toml (backend),
 * newest first. Only published releases are listed; empty categories are hidden.
 */
export function ReleasesPage() {
  const releases = useReleases();
  const [shown, setShown] = useState(PAGE_SIZE);

  const list = releases.data?.releases ?? [];
  const [latest, ...older] = list;
  const current = releases.data?.current_version ?? '';
  const isCurrent = (r: ReleaseDto) => r.version === current || r.version.startsWith(`${current}-`);

  return (
    <div className={styles.page}>
      <PageHeader title="Release Versions" description="Explore new features, improvements, and fixes in NekkoGuard." />
      {releases.isPending ? (
        <div className={styles.releases}>
          <Skeleton height={180} radius="sm" />
          <Skeleton height={56} radius="sm" />
        </div>
      ) : releases.isError ? (
        <ErrorState error={releases.error} onRetry={() => void releases.refetch()} retrying={releases.isFetching} />
      ) : latest === undefined ? (
        <Card>
          <div className={styles.empty}>
            <Rocket size={28} aria-hidden="true" />
            <p className={styles.emptyTitle}>No releases published yet</p>
            <p>Release notes will appear here with the first published version.</p>
          </div>
        </Card>
      ) : (
        <div className={styles.releases}>
          <article className={cx(styles.release, styles.latest)} aria-label={`Latest release ${latest.version}`}>
            <div className={styles.releaseHeader}>
              <ReleaseTitle release={latest} latest current={isCurrent(latest)} />
              <time className={styles.date} dateTime={latest.date}>
                {formatCalendarDate(latest.date)}
              </time>
            </div>
            <ReleaseBody release={latest} />
          </article>
          {older.slice(0, shown).map((release) => (
            <OlderRelease key={release.version} release={release} current={isCurrent(release)} />
          ))}
          {older.length > shown && (
            <Button variant="secondary" size="sm" className={styles.loadMore} onClick={() => setShown((n) => n + PAGE_SIZE)}>
              Show older releases
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
