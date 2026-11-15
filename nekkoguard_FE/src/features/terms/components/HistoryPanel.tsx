import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useState } from 'react';
import type { TermsVersionDto, TermsVersionSummaryDto } from '@/api/terms';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { TableExportButton } from '@/components/DataTable/TableExport';
import { useTableExport } from '@/components/DataTable/useTableExport';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Modal } from '@/components/Modal/Modal';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill } from '@/components/StatusPill/StatusPill';
import { formatCalendarDate } from '@/lib/format';
import { TermsReader } from './TermsDocument';
import { TermsMeta } from './TermsMeta';
import styles from './Terms.module.css';

/** How a published version is loaded (administrators and members use different endpoints). */
export interface VersionLoader {
  queryKey: (id: string) => readonly unknown[];
  fetch: (id: string, signal?: AbortSignal) => Promise<TermsVersionDto>;
}

/** "superseded" is shown to people as "Outdated". */
const statusLabel = (status: TermsVersionSummaryDto['status']) => (status === 'current' ? 'Current' : 'Outdated');

function VersionViewer({ loader, versionId, onClose }: { loader: VersionLoader; versionId: string; onClose: () => void }) {
  const version = useQuery({ queryKey: loader.queryKey(versionId), queryFn: ({ signal }) => loader.fetch(versionId, signal) });
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      icon={<History size={18} />}
      title={version.data ? `Version ${version.data.number}` : 'Version'}
      description="Published text is read-only."
    >
      {version.isPending ? (
        <Skeleton height={320} radius="sm" />
      ) : version.isError ? (
        <ErrorState error={version.error} onRetry={() => void version.refetch()} />
      ) : (
        <TermsReader title={version.data.title} meta={<TermsMeta version={version.data} showPublisher />} doc={version.data.content} prefix={`v${version.data.number}-`} />
      )}
    </Modal>
  );
}

/**
 * Every published version, read-only. Administrators also see how many people
 * accepted each one and can jump to those acceptance records.
 */
export function HistoryPanel({
  tenantName,
  versions,
  loader,
  onShowAcceptances,
}: {
  tenantName: string;
  versions: TermsVersionSummaryDto[];
  loader: VersionLoader;
  /** Administrators only: open the Acceptance tab filtered on that version. */
  onShowAcceptances?: (version: number) => void;
}) {
  const exporter = useTableExport();
  const [viewing, setViewing] = useState<string | null>(null);
  const published = versions.filter((v) => v.status !== 'draft');
  const admin = onShowAcceptances !== undefined;

  const columns: Column<TermsVersionSummaryDto>[] = [
    { key: 'number', header: 'Version', sortValue: (v) => v.number, exportValue: (v) => `v${v.number}`, render: (v) => <span className={styles.mono}>v{v.number}</span> },
    { key: 'title', header: 'Title', sortValue: (v) => v.title, render: (v) => v.title },
    {
      key: 'status',
      header: 'Status',
      sortValue: (v) => statusLabel(v.status),
      render: (v) => <StatusPill tone={v.status === 'current' ? 'success' : 'neutral'} label={statusLabel(v.status)} />,
    },
    {
      key: 'published',
      header: 'Published',
      sortValue: (v) => (v.published_at ? new Date(v.published_at) : null),
      exportValue: (v) => (v.published_at ? new Date(v.published_at) : ''),
      render: (v) => (v.effective_date ? formatCalendarDate(v.effective_date) : '—'),
    },
    {
      key: 'publisher',
      header: 'Published by',
      sortValue: (v) => v.published_by?.email,
      render: (v) => v.published_by?.email || <span className={styles.muted}>—</span>,
      secondary: true,
    },
    ...(admin
      ? [{ key: 'accepted', header: 'Accepted by', align: 'end' as const, sortValue: (v: TermsVersionSummaryDto) => v.accepted_count, render: (v: TermsVersionSummaryDto) => `${v.accepted_count}` }]
      : []),
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      align: 'end',
      render: (v) => (
        <span className={styles.toolbarEnd}>
          <Button size="sm" variant="ghost" onClick={() => setViewing(v.id)}>
            View
          </Button>
          {admin && (
            <Button size="sm" variant="ghost" onClick={() => v.number && onShowAcceptances(v.number)}>
              Acceptances
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <Card aria-labelledby="terms-history-title">
      <CardHeader
        icon={<History size={16} />}
        title="Version history"
        titleId="terms-history-title"
        description="Published versions never change. A newer version makes the previous one outdated."
        actions={<TableExportButton exporter={exporter} />}
      />
      <CardBody>
        <DataTable
          label="Terms of Service versions"
          columns={columns}
          rows={published}
          rowKey={(v) => v.id}
          empty="Nothing published yet."
          defaultSort={{ key: 'number', direction: 'desc' }}
          exportOwner={tenantName}
          exporter={exporter}
        />
      </CardBody>
      {viewing && <VersionViewer loader={loader} versionId={viewing} onClose={() => setViewing(null)} />}
    </Card>
  );
}
