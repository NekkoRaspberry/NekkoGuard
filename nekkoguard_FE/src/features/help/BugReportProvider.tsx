import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { BugReportContext } from './BugReportContext';

const BugReportDialog = lazy(async () => ({ default: (await import('./components/BugReportDialog')).BugReportDialog }));

/**
 * One Report a bug dialog for the whole app shell, opened from any entry point.
 * The dialog code is loaded only when it is first opened.
 */
export function BugReportProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ openBugReport: () => setOpen(true) }), []);
  return (
    <BugReportContext.Provider value={value}>
      {children}
      {open && (
        <Suspense fallback={null}>
          <BugReportDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </BugReportContext.Provider>
  );
}
