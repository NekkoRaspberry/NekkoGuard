import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, UserCheck } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import type { AcceptanceQuery, AcceptanceRowDto, AcceptanceStats as Stats, AcceptanceStatus, Paginated } from '@/api/terms';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import type { SortState } from '@/components/DataTable/sorting';
import { TableExportButton } from '@/components/DataTable/TableExport';
import { useTableExport } from '@/components/DataTable/useTableExport';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { SelectField } from '@/components/SelectField/SelectField';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { StatusPill, type StatusTone } from '@/components/StatusPill/StatusPill';
import { TextField } from '@/components/TextField/TextField';
import { formatDateTime } from '@/lib/format';
import { AcceptanceStats } from './CurrentTermsPanel';
import styles from './Terms.module.css';

const PAGE_SIZE = 25;
const EXPORT_MAX_PAGES = 200;

const STATUS_LABELS: Record<AcceptanceStatus, { label: string; tone: StatusTone }> = {
  accepted_current: { label: 'Accepted current', tone: 'success' },
  accepted_older: { label: 'Accepted older version', tone: 'warning' },
  never: { label: 'Never accepted', tone: 'danger' },
  not_required: { label: 'Not required', tone: 'neutral' },
};

export interface AcceptanceSource {
  queryKey: (query: AcceptanceQuery) => readonly unknown[];
  fetchPage: (query: AcceptanceQuery, signal?: AbortSignal) => Promise<Paginated<AcceptanceRowDto>>;
}

/**
 * Who accepted what: counts, filters and the paginated table. Used for the whole
 * Tenant (Terms page, Settings › Tenant) and for one Organization's people.
 */
export function AcceptancePanel({
  owner,
  stats,
  versionNumbers,
  source,
  description = 'Superusers, suspended members and inactive accounts are not required to accept. Records are permanent.',
  initialVersion = null,
  version: controlledVersion,
  onVersionChange,
}: {
  /** Export file name: the Tenant or Organization. */
  owner: string;
  stats: Stats;
  versionNumbers: number[];
  source: AcceptanceSource;
  description?: string;
  initialVersion?: number | null;
  version?: number | null;
  onVersionChange?: (version: number | null) => void;
}) {
  const exporter = useTableExport();
  const [ownVersion, setOwnVersion] = useState<number | null>(initialVersion);
  const version = controlledVersion !== undefined ? controlledVersion : ownVersion;
  const setVersion = onVersionChange ?? setOwnVersion;
  const [status, setStatus] = useState<AcceptanceStatus | ''>('');
  // Sorted by the server: the whole list, not only the page shown.
  const [sort, setSort] = useState<SortState>({ key: 'user', direction: 'asc' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const SORT_FIELDS: Record<string, string> = { user: 'email', status: 'status', version: 'accepted_version', when: 'accepted_at' };
  const sortField = SORT_FIELDS[sort.key];
  const ordering = sortField ? `${sort.direction === 'desc' ? '-' : ''}${sortField}` : '';
  const query: AcceptanceQuery = { page, status, version, search: deferredSearch, ordering };

  const rows = useQuery({
    queryKey: source.queryKey(query),
    queryFn: ({ signal }) => source.fetchPage(query, signal),
    // Keeps the rows on screen while another page, filter or sort loads. Safe here:
    // the panel is remounted when the Tenant or Organization changes.
    placeholderData: keepPreviousData,
  });
  const total = rows.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function allRows(): Promise<AcceptanceRowDto[]> {
    const result: AcceptanceRowDto[] = [];
    for (let p = 1; p <= EXPORT_MAX_PAGES; p += 1) {
      const chunk = await source.fetchPage({ ...query, page: p });
      result.push(...chunk.results);
      if (!chunk.next) break;
    }
    return result;
  }

  const columns: Column<AcceptanceRowDto>[] = [
    {
      key: 'user',
      header: 'User',
      sortField: 'email',
      exportValue: (r) => (r.user.name ? `${r.user.name} (${r.user.email})` : r.user.email),
      render: (r) => (
        <span>
          {r.user.name || r.user.email}
          {r.user.name && <span className={styles.muted}> · {r.user.email}</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortField: 'status',
      exportValue: (r) => STATUS_LABELS[r.status].label,
      render: (r) => <StatusPill tone={STATUS_LABELS[r.status].tone} label={STATUS_LABELS[r.status].label} />,
    },
    {
      key: 'version',
      header: 'Last accepted',
      sortField: 'accepted_version',
      exportValue: (r) => (r.accepted_version ? `v${r.accepted_version}` : ''),
      render: (r) => (r.accepted_version ? <span className={styles.mono}>v{r.accepted_version}</span> : <span className={styles.muted}>—</span>),
    },
    {
      key: 'when',
      header: 'Accepted at',
      sortField: 'accepted_at',
      exportValue: (r) => (r.accepted_at ? new Date(r.accepted_at) : ''),
      render: (r) => (r.accepted_at ? <span className={styles.mono}>{formatDateTime(Date.parse(r.accepted_at))}</span> : <span className={styles.muted}>—</span>),
    },
  ];

  return (
    <div className={styles.panel}>
      <AcceptanceStats stats={stats} />
      <Card aria-labelledby="terms-acceptance-title">
        <CardHeader
          icon={<UserCheck size={16} />}
          title="Acceptance records"
          titleId="terms-acceptance-title"
          description={description}
          actions={<TableExportButton exporter={exporter} />}
        />
        <CardBody>
          <div className={styles.filters}>
            <SelectField<AcceptanceStatus | ''>
              label="Status"
              value={status}
              options={[{ value: '', label: 'Everyone' }, ...(Object.keys(STATUS_LABELS) as AcceptanceStatus[]).map((value) => ({ value, label: STATUS_LABELS[value].label }))]}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            />
            <SelectField
              label="Accepted version"
              value={version ? String(version) : ''}
              options={[{ value: '', label: 'Any' }, ...versionNumbers.map((n) => ({ value: String(n), label: `v${n}` }))]}
              onChange={(value) => {
                setVersion(value ? Number(value) : null);
                setPage(1);
              }}
            />
            <TextField
              label="Search"
              type="search"
              placeholder="Name or email"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          {rows.isPending ? (
            <Skeleton height={120} radius="sm" />
          ) : rows.isError ? (
            <ErrorState error={rows.error} onRetry={() => void rows.refetch()} retrying={rows.isFetching} />
          ) : (
            <>
              <DataTable
                label="Terms acceptance"
                columns={columns}
                rows={rows.data.results}
                rowKey={(r) => r.user.id}
                empty="Nobody matches these filters."
                exportRows={allRows}
                exportOwner={owner}
                exporter={exporter}
                sort={sort}
                onSortChange={(next) => {
                  setSort(next);
                  setPage(1);
                }}
              />
              {pages > 1 && (
                <div className={styles.toolbar}>
                  <span className={styles.muted}>
                    Page {page} of {pages} · {total} people
                  </span>
                  <span className={styles.toolbarEnd}>
                    <Button size="sm" variant="secondary" leftIcon={<ChevronLeft size={14} />} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" variant="secondary" leftIcon={<ChevronRight size={14} />} disabled={page >= pages} onClick={() => setPage(page + 1)}>
                      Next
                    </Button>
                  </span>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
