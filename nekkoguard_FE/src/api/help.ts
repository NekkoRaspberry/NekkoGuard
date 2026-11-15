import { apiRequest } from './client';

/**
 * Help & support API (backend: nekkoguard/support/).
 *
 * Release notes are a read-only content file in the backend repository (Terms of
 * Service: api/terms.ts); bug reports are stored by the backend and emailed to the Tenant's
 * support address (or the platform's). The recipient is never chosen here.
 */

export type ChangeCategory = 'breaking' | 'security' | 'features' | 'improvements' | 'fixes';

export interface ReleaseDto {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  type: 'stable' | 'pre-release';
  summary: string;
  /** Only categories with entries are present. */
  changes: Partial<Record<ChangeCategory, string[]>>;
}

export interface ReleasesDto {
  current_version: string;
  /** Newest first. */
  releases: ReleaseDto[];
}

export type BugCategory = 'ui' | 'functional' | 'performance' | 'data' | 'access' | 'other';
export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';
export type EmailStatus = 'sent' | 'failed' | 'not_configured';

/** Informational details from the browser (the server sanitizes them). */
export interface BugReportContext {
  page: string;
  client_version: string;
  browser: string;
  operating_system: string;
  viewport: string;
}

export interface BugReportInput {
  /** Random per draft: a retried submission returns the first report. */
  client_token: string;
  title: string;
  description: string;
  category: BugCategory | '';
  severity: BugSeverity | '';
  steps_to_reproduce: string;
  expected_behavior: string;
  actual_behavior: string;
  additional_comments: string;
  /** Hints only: the server accepts them only if the reporter can see them. */
  tenant: string | null;
  organization: string | null;
  context: BugReportContext;
  attachment: File | null;
}

export interface BugReportResultDto {
  id: string;
  email_status: EmailStatus;
  created_at: string;
}

type Signal = AbortSignal | undefined;

function toFormData(input: BugReportInput): FormData {
  const form = new FormData();
  const { context, attachment, tenant, organization, ...fields } = input;
  for (const [key, value] of Object.entries({ ...fields, ...context })) {
    if (value) form.append(key, value);
  }
  if (tenant) form.append('tenant', tenant);
  if (organization) form.append('organization', organization);
  if (attachment) form.append('attachment', attachment);
  return form;
}

export const helpApi = {
  releases: (signal?: Signal) => apiRequest<ReleasesDto>('/api/help/releases/', signal ? { signal } : {}),
  submitBugReport: (input: BugReportInput) =>
    apiRequest<BugReportResultDto>('/api/bug-reports/', { method: 'POST', body: toFormData(input) }),
};
