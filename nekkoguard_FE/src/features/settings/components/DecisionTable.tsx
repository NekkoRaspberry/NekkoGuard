import type { ReactNode } from 'react';
import type { DecisionDto, PermissionSource } from '@/api/tenancy';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { StatusPill, type StatusTone } from '@/components/StatusPill/StatusPill';
import { permissionLabel, SOURCE_LABELS } from '@/features/tenancy/model';
import styles from '@/features/tenancy/components/Management.module.css';

const SOURCE_TONE: Record<PermissionSource, StatusTone> = {
  override: 'primary',
  organization_role: 'info',
  tenant_role: 'neutral',
  none: 'neutral',
};

interface DecisionTableProps {
  decisions: DecisionDto[];
  label: string;
  /** Optional extra column (e.g. override controls). */
  extra?: { header: ReactNode; render: (decision: DecisionDto) => ReactNode };
}

/** Permission · Source · Effective — explains inherited vs. explicit permissions. */
export function DecisionTable({ decisions, label, extra }: DecisionTableProps) {
  const columns: Column<DecisionDto>[] = [
    {
      key: 'permission',
      header: 'Permission',
      render: (d) => (
        <span className={styles.twoLine}>
          <span className={styles.primary}>{permissionLabel(d.permission)}</span>
          <span className={styles.mono}>{d.permission}</span>
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (d) => <StatusPill tone={SOURCE_TONE[d.source]} label={SOURCE_LABELS[d.source]} />,
      secondary: true,
    },
    {
      key: 'effective',
      header: 'Effective',
      render: (d) => <StatusPill tone={d.allowed ? 'success' : 'danger'} label={d.allowed ? 'Allowed' : 'Denied'} />,
    },
  ];
  if (extra) columns.push({ key: 'extra', header: extra.header, render: extra.render, align: 'end' });
  return <DataTable label={label} columns={columns} rows={decisions} rowKey={(d) => d.permission} />;
}
