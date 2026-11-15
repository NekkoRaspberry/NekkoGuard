import { buildXlsx, downloadFile, XLSX_MIME, type CellValue, type Sheet } from '@/lib/xlsx';
import type { SortValue } from './sorting';

/** What a column contributes to an export (see DataTable's `Column`). */
export interface ExportableColumn<T> {
  key: string;
  header: unknown;
  /** Readable value for the export (e.g. a role's name rather than its rank). */
  exportValue?: (row: T) => CellValue;
  sortValue?: (row: T) => SortValue;
}

/**
 * Columns with a value become spreadsheet columns: `exportValue`, else the raw
 * `sortValue` (text, number, date). Columns with neither — actions — are left out.
 */
export function tableToSheet<T>(name: string, columns: readonly ExportableColumn<T>[], rows: readonly T[]): Sheet {
  const exported = columns.flatMap((column) => {
    const value = column.exportValue ?? column.sortValue;
    return value ? [{ header: typeof column.header === 'string' ? column.header : column.key, value }] : [];
  });
  return {
    name,
    headers: exported.map((c) => c.header),
    rows: rows.map((row) => exported.map((c) => c.value(row) ?? null)),
  };
}

const clean = (part: string) => part.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * "<owner>-<table>-<date>.xlsx", e.g. "Acme MSP-Organizations-2026-11-14.xlsx".
 * Owner: the Tenant (tenant tables) or the Organization. Characters invalid in file
 * names are removed.
 */
export function exportFilename(label: string, owner?: string | null, now = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const parts = [clean(owner ?? ''), clean(label) || 'Export'].filter(Boolean);
  return `${[...parts, day].join('-')}.xlsx`;
}

export function exportToExcel<T>(
  label: string,
  columns: readonly ExportableColumn<T>[],
  rows: readonly T[],
  owner?: string | null,
): void {
  downloadFile(buildXlsx(tableToSheet(label, columns, rows)), exportFilename(label, owner), XLSX_MIME);
}
