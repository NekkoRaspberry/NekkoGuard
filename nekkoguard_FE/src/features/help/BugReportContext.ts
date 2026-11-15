import { createContext } from 'react';

export interface BugReportContextValue {
  /** Open the Report a bug dialog (from the sidebar, top navigation or account menu). */
  openBugReport: () => void;
}

export const BugReportContext = createContext<BugReportContextValue | null>(null);
