import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './DataTable.module.css';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Right-align (actions, numbers). */
  align?: 'end';
  /** Hide on narrow screens (secondary information). */
  secondary?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  /** Accessible name of the table. */
  label: string;
  empty?: ReactNode;
}

/** Compact, semantic table for management screens. */
export function DataTable<T>({ columns, rows, rowKey, label, empty }: DataTableProps<T>) {
  if (rows.length === 0 && empty) return <div className={styles.empty}>{empty}</div>;
  return (
    <div className={styles.scroll}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx(column.align === 'end' && styles.end, column.secondary && styles.secondary)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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
  );
}
