import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useState } from 'react';
import type { ActivityEntryDto, Paginated } from '@/api/tenancy';
import { Button } from '@/components/Button/Button';
import { Card, CardBody, CardHeader } from '@/components/Card/Card';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ErrorState } from '@/components/ErrorState/ErrorState';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { formatDateTime } from '@/lib/format';
import styles from '@/features/tenancy/components/Management.module.css';

const PAGE_SIZE = 50;

interface ActivityCardProps {
  description: string;
  queryKey: (page: number) => readonly unknown[];
  fetchPage: (page: number, signal: AbortSignal) => Promise<Paginated<ActivityEntryDto>>;
}

function actionLabel(action: string): string {
  return action.replace(/[._]/g, ' ');
}

/** Audit trail (who, what, when), paginated. */
export function ActivityCard({ description, queryKey, fetchPage }: ActivityCardProps) {
  const [page, setPage] = useState(1);
  const activity = useQuery({
    queryKey: queryKey(page),
    queryFn: ({ signal }) => fetchPage(page, signal),
    // No placeholderData: after a context switch it would briefly show the
    // previous Tenant's/Organization's entries.
  });

  const columns: Column<ActivityEntryDto>[] = [
    {
      key: 'when',
      header: 'When',
      render: (entry) => <span className={styles.mono}>{formatDateTime(Date.parse(entry.created_at))}</span>,
    },
    { key: 'who', header: 'Who', render: (entry) => entry.actor_email || <span className={styles.muted}>System</span> },
    { key: 'action', header: 'Action', render: (entry) => <span className={styles.primary}>{actionLabel(entry.action)}</span> },
    { key: 'target', header: 'Target', render: (entry) => entry.target_name, secondary: true },
  ];

  const total = activity.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card aria-labelledby="activity-title">
      <CardHeader icon={<History size={16} />} title="Activity history" titleId="activity-title" description={description} />
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
            />
            {pages > 1 && (
              <div className={styles.pager}>
                <span>
                  Page {page} of {pages} · {total} entries
                </span>
                <span className={styles.rowActions}>
                  <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Newer
                  </Button>
                  <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                    Older
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
