import { useCallback, useMemo, useRef, useState } from 'react';

export type Run = () => Promise<void>;

/**
 * Lets a card show a table's "Export" button next to its other header buttons:
 *
 *   const exporter = useTableExport();
 *   <CardHeader actions={<><TableExportButton exporter={exporter} /><Button>Add</Button></>} />
 *   <DataTable exporter={exporter} … />
 *
 * The DataTable connects what to export (rows in the order shown); the button only
 * appears while there is something to export.
 */
export interface TableExport {
  /** Accessible table name while exportable; null hides the button. */
  label: string | null;
  run: { readonly current: Run | null };
  /** Called by DataTable. */
  connect: (label: string | null, run: Run | null) => void;
}

export function useTableExport(): TableExport {
  const run = useRef<Run | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const connect = useCallback((next: string | null, fn: Run | null) => {
    run.current = fn;
    setLabel(next);
  }, []);
  return useMemo(() => ({ label, run, connect }), [label, connect]);
}
