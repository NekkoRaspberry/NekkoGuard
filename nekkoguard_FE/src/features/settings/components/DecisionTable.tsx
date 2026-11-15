import type { ReactNode } from 'react';
import type { DecisionDto, PermissionSource } from '@/api/tenancy';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import type { TableExport } from '@/components/DataTable/useTableExport';
import { StatusPill, type StatusTone } from '@/components/StatusPill/StatusPill';
import { useTenantName } from '@/features/tenancy/hooks';
import { permissionLabel, sourceLabel } from '@/features/tenancy/model';
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
  /** Organization the permissions apply to (export file name). */
  exportOwner: string;
  /** Where the Export button is shown (see `useTableExport`). */
  exporter?: TableExport;
}

/** Permission · Source · Effective — explains inherited vs. explicit permissions. */
export function DecisionTable({ decisions, label, extra, exportOwner, exporter }: DecisionTableProps) {
  const tenantName = useTenantName();
  const columns: Column<DecisionDto>[] = [
    {
      key: 'permission',
      header: 'Permission',
      sortValue: (d) => permissionLabel(d.permission),
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
      sortValue: (d) => sourceLabel(d.source, tenantName),
      render: (d) => <StatusPill tone={SOURCE_TONE[d.source]} label={sourceLabel(d.source, tenantName)} />,
      secondary: true,
    },
    {
      key: 'effective',
      header: 'Effective',
      sortValue: (d) => d.allowed,
      exportValue: (d) => (d.allowed ? 'Allowed' : 'Denied'),
      render: (d) => <StatusPill tone={d.allowed ? 'success' : 'danger'} label={d.allowed ? 'Allowed' : 'Denied'} />,
    },
  ];
  if (extra) columns.push({ key: 'extra', header: extra.header, render: extra.render, align: 'end' });
  return (
    <DataTable label={label} columns={columns} rows={decisions} rowKey={(d) => d.permission} exportOwner={exportOwner} exporter={exporter} />
  );
}
