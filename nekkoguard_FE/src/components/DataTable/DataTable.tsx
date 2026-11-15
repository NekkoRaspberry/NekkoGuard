import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import type { CellValue } from '@/lib/xlsx';
import styles from './DataTable.module.css';
import { exportToExcel } from './exportTable';
import { nextSort, sortRows, type SortState, type SortValue } from './sorting';
import { ExportButton } from './TableExport';
import type { TableExport } from './useTableExport';

export type { SortDirection, SortState, SortValue } from './sorting';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Right-align (actions, numbers). */
  align?: 'end';
  /** Hide on narrow screens (secondary information). */
  secondary?: boolean;
  /**
   * Makes the column sortable in the browser (small, fully loaded lists).
   * Return the underlying value: text, number, date, boolean; null/empty sort last.
   */
  sortValue?: (row: T) => SortValue;
  /** Server-side sortable (with `sort` + `onSortChange`): the backend's field name. */
  sortField?: string;
  /**
   * Value written to the Excel export. Defaults to `sortValue`; give one when that is
   * not readable (e.g. a role rank). Columns with neither (actions) are not exported.
   */
  exportValue?: (row: T) => CellValue;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  /** Accessible name of the table. */
  label: string;
  empty?: ReactNode;
  /** Initial client-side sort (uncontrolled). */
  defaultSort?: SortState;
  /**
   * Server-side sorting (paginated lists): the current sort and a callback. The rows
   * are then shown as received; only columns with `sortField` are sortable.
   */
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  /** Every table can be exported to Excel; set false only for tables that must not be. */
  exportable?: boolean;
  /**
   * All rows to export, for paginated tables (default: the rows shown, in the order
   * shown). Name of the sheet: `label`.
   */
  exportRows?: () => Promise<T[]>;
  /**
   * Tenant (tenant tables) or Organization (everything else) the data belongs to:
   * the file is named "<owner>-<label>-<date>.xlsx".
   */
  exportOwner?: string;
  /** Show the Export button elsewhere (card header, dialog footer) — see `useTableExport`. */
  exporter?: TableExport;
}

/** Compact, semantic table for management screens; sortable column headers. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  label,
  empty,
  defaultSort,
  sort: controlledSort,
  onSortChange,
  exportable = true,
  exportRows,
  exportOwner,
  exporter,
}: DataTableProps<T>) {
  const serverSide = onSortChange !== undefined;
  const [localSort, setLocalSort] = useState<SortState | null>(defaultSort ?? null);
  const sort = serverSide ? (controlledSort ?? null) : localSort;

  const isSortable = (column: Column<T>) => (serverSide ? column.sortField !== undefined : column.sortValue !== undefined);

  const shown = useMemo(() => {
    if (serverSide || !localSort) return rows;
    const column = columns.find((c) => c.key === localSort.key);
    return column?.sortValue ? sortRows(rows, column.sortValue, localSort.direction) : rows;
  }, [serverSide, localSort, rows, columns]);

  const changeSort = (key: string) => {
    const next = nextSort(sort, key);
    if (serverSide) onSortChange(next);
    else setLocalSort(next);
  };

  const runExport = async () => exportToExcel(label, columns, exportRows ? await exportRows() : shown, exportOwner);
  const canExport = exportable && rows.length > 0;

  // Hand the export to the button the card shows (latest rows/sort on every render).
  useEffect(() => {
    exporter?.connect(canExport ? label : null, runExport);
  });
  useEffect(() => (exporter ? () => exporter.connect(null, null) : undefined), [exporter]);

  if (rows.length === 0 && empty) return <div className={styles.empty}>{empty}</div>;
  return (
    <>
      {canExport && !exporter && (
        <div className={styles.toolbar}>
          <ExportButton label={label} run={runExport} />
        </div>
      )}
      <div className={styles.scroll}>
        <table className={styles.table} aria-label={label}>
          <thead>
            <tr>
              {columns.map((column) => {
                const sortable = isSortable(column);
                const active = sortable && sort?.key === column.key;
                const direction = active ? sort?.direction : undefined;
                const Icon = direction === 'asc' ? ChevronUp : direction === 'desc' ? ChevronDown : ChevronsUpDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={sortable ? (direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none') : undefined}
                    className={cx(column.align === 'end' && styles.end, column.secondary && styles.secondary)}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className={cx(styles.sortButton, active && styles.sortActive)}
                        onClick={() => changeSort(column.key)}
                      >
                        {column.header}
                        <Icon size={12} className={styles.sortIcon} aria-hidden="true" />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cx(column.align === 'end' && styles.end, column.secondary && styles.secondary)}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
