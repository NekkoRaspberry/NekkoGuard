import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/Button/Button';
import styles from './DataTable.module.css';
import type { Run, TableExport } from './useTableExport';

/** "Export" button, styled like the other card actions. */
export function ExportButton({ label, run }: { label: string; run: Run }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setExporting(true);
    setError(null);
    try {
      await run();
    } catch {
      setError('The export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {error && (
        <span className={styles.exportError} role="alert">
          {error}
        </span>
      )}
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<FileSpreadsheet size={14} />}
        loading={exporting}
        onClick={() => void start()}
        aria-label={`Export ${label} to Excel`}
        title="Download as an Excel file"
      >
        Export
      </Button>
    </>
  );
}

/** The export button of a DataTable given `exporter`, for a card header. */
export function TableExportButton({ exporter }: { exporter: TableExport }) {
  if (exporter.label === null) return null;
  return <ExportButton label={exporter.label} run={() => exporter.run.current?.() ?? Promise.resolve()} />;
}
