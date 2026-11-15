import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useState } from 'react';
import type { ActivityEntryDto, Ordering, Paginated } from '@/api/tenancy';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { DataTable, type Column, type SortState } from '@/components/DataTable/DataTable';
import { TableExportButton } from '@/components/DataTable/TableExport';
import { useTableExport } from '@/components/DataTable/useTableExport';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { formatDateTime } from '@/lib/format';
import styles from '@/features/tenancy/components/Management.module.css';

const PAGE_SIZE = 50;

interface ActivityCardProps {
  /** Tenant or Organization whose history this is (export file name). */
  owner: string;
  description: string;
  queryKey: (page: number, ordering: Ordering) => readonly unknown[];
  fetchPage: (page: number, signal: AbortSignal, ordering: Ordering) => Promise<Paginated<ActivityEntryDto>>;
}

/** Newest first: the backend's default order. */
const DEFAULT_SORT: SortState = { key: 'when', direction: 'desc' };

/** Server-side: the whole history is sorted, not only the loaded page. */
const toOrdering = (sort: SortState, field: string): Ordering => (sort.direction === 'desc' ? `-${field}` : field);

function actionLabel(action: string): string {
  return action.replace(/[._]/g, ' ');
}

/** Upper bound for one export (the backend sends 50 entries per page). */
const EXPORT_MAX_PAGES = 200;

/** Every entry (not only the page shown), in the current sort order. */
async function allEntries(
  fetchPage: ActivityCardProps['fetchPage'],
  ordering: Ordering,
): Promise<ActivityEntryDto[]> {
  const controller = new AbortController();
  const entries: ActivityEntryDto[] = [];
  for (let page = 1; page <= EXPORT_MAX_PAGES; page += 1) {
    const result = await fetchPage(page, controller.signal, ordering);
    entries.push(...result.results);
    if (!result.next) break;
  }
  return entries;
}

/** Audit trail (who, what, when), paginated. */
export function ActivityCard({ owner, description, queryKey, fetchPage }: ActivityCardProps) {
  const exporter = useTableExport();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const columns: Column<ActivityEntryDto>[] = [
    {
      key: 'when',
      header: 'When',
      sortField: 'created_at',
      exportValue: (entry) => new Date(entry.created_at),
      render: (entry) => <span className={styles.mono}>{formatDateTime(Date.parse(entry.created_at))}</span>,
    },
    { key: 'who', header: 'Who', sortField: 'actor_email', exportValue: (entry) => entry.actor_email || 'System', render: (entry) => entry.actor_email || <span className={styles.muted}>System</span> },
    { key: 'action', header: 'Action', sortField: 'action', exportValue: (entry) => actionLabel(entry.action), render: (entry) => <span className={styles.primary}>{actionLabel(entry.action)}</span> },
    { key: 'target', header: 'Target', sortField: 'target_name', exportValue: (entry) => entry.target_name, render: (entry) => entry.target_name, secondary: true },
  ];

  function ordering(current: SortState): Ordering {
    const field = columns.find((c) => c.key === current.key)?.sortField;
    return field ? toOrdering(current, field) : '';
  }

  const activity = useQuery({
    queryKey: queryKey(page, ordering(sort)),
    queryFn: ({ signal }) => fetchPage(page, signal, ordering(sort)),
    // No placeholderData: after a context switch it would briefly show the
    // previous Tenant's/Organization's entries.
  });

  const total = activity.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card aria-labelledby="activity-title">
      <CardHeader
        icon={<History size={16} />}
        title="Activity history"
        titleId="activity-title"
        description={description}
        actions={<TableExportButton exporter={exporter} />}
      />
      <CardBody>
        {activity.isPending ? (
          <Skeleton height={80} radius="sm" />
        ) : activity.isError ? (
          <ErrorState error={activity.error} onRetry={() => void activity.refetch()} retrying={activity.isFetching} />
        ) : (
          <>
            <DataTable
              label="Activity history"
              columns={columns}
              rows={activity.data.results}
              rowKey={(entry) => entry.id}
              empty="No activity recorded yet."
              exportRows={() => allEntries(fetchPage, ordering(sort))}
              exportOwner={owner}
              exporter={exporter}
              sort={sort}
              onSortChange={(next) => {
                setSort(next);
                setPage(1);
              }}
            />
            {pages > 1 && (
              <div className={styles.pager}>
                <span>
                  Page {page} of {pages} · {total} entries
                </span>
                <span className={styles.rowActions}>
                  <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </span>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
