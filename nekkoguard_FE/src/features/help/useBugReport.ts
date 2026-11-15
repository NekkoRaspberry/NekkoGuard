import { useContext } from 'react';
import { BugReportContext, type BugReportContextValue } from './BugReportContext';

export function useBugReport(): BugReportContextValue {
  const value = useContext(BugReportContext);
  if (!value) throw new Error('useBugReport must be used inside <BugReportProvider>.');
  return value;
}
