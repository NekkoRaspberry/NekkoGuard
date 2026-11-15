import { apiRequest } from './client';

/**
 * Tenant Terms of Service API (backend: nekkoguard/support/api/terms.py).
 *
 * Documents are ProseMirror (Tiptap) JSON, validated by the backend. They are never
 * rendered as HTML: see features/terms/components/TermsDocument.tsx.
 */

export interface DocMark {
  type: 'bold' | 'italic' | 'underline' | 'strike' | 'link';
  attrs?: { href?: string };
}

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
}

export interface TermsDocumentJson extends DocNode {
  type: 'doc';
}

/** `superseded` = replaced by a newer version; shown to people as "Outdated". */
export type TermsStatus = 'draft' | 'current' | 'superseded';

export interface PersonDto {
  id: number;
  email: string;
  name: string;
}

export interface TermsVersionSummaryDto {
  id: string;
  /** Null for the draft. */
  number: number | null;
  title: string;
  status: TermsStatus;
  content_hash: string;
  created_at: string;
  created_by: PersonDto | null;
  updated_at: string;
  published_at: string | null;
  published_by: PersonDto | null;
  effective_date: string | null;
  superseded_at: string | null;
  accepted_count: number;
}

export interface TermsVersionDto extends TermsVersionSummaryDto {
  tenant: { id: string; name: string };
  content: TermsDocumentJson;
}

export interface TenantTermsDto {
  current: TermsVersionDto | null;
  /** When the caller accepted the current version (null if never / no current). */
  accepted_at: string | null;
  can_manage: boolean;
}

export interface TermsVersionsDto {
  versions: TermsVersionSummaryDto[];
  current_stats: { required: number; accepted: number; pending: number };
}

export type AcceptanceStats = TermsVersionsDto['current_stats'];

/** Header data of an acceptance page (Tenant or one Organization). */
export interface AcceptanceSummaryDto {
  tenant_name: string;
  current: TermsVersionSummaryDto | null;
  /** Published version numbers, newest first. */
  version_numbers: number[];
  current_stats: AcceptanceStats;
}

export type AcceptanceStatus = 'accepted_current' | 'accepted_older' | 'never' | 'not_required';

export interface AcceptanceRowDto {
  user: PersonDto;
  status: AcceptanceStatus;
  accepted_version: number | null;
  accepted_at: string | null;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface AcceptanceQuery {
  page: number;
  /** email | status | accepted_version | accepted_at, "-" prefix = descending. */
  ordering?: string;
  status?: AcceptanceStatus | '';
  version?: number | null;
  search?: string;
}

type Signal = AbortSignal | undefined;
const options = (signal: Signal) => (signal ? { signal } : {});
const tenantTerms = (t: string) => `/api/tenants/${encodeURIComponent(t)}/terms/`;
const organizationTerms = (t: string, o: string) =>
  `/api/tenants/${encodeURIComponent(t)}/organizations/${encodeURIComponent(o)}/terms/`;

function acceptanceParams(query: AcceptanceQuery): URLSearchParams {
  const params = new URLSearchParams({ page: String(query.page) });
  if (query.status) params.set('status', query.status);
  if (query.version) params.set('version', String(query.version));
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.ordering) params.set('ordering', query.ordering);
  return params;
}
const versionPath = (t: string, id: string) => `${tenantTerms(t)}versions/${encodeURIComponent(id)}/`;

export const termsApi = {
  // Signed-in user (reachable while acceptance is pending)
  pending: (signal?: Signal) => apiRequest<TermsVersionDto[]>('/api/terms/pending/', options(signal)),
  accept: (versionId: string) =>
    apiRequest<{ accepted: boolean; pending: number }>(`/api/terms/${encodeURIComponent(versionId)}/accept/`, { method: 'POST' }),
  decline: () => apiRequest<{ signed_out: boolean }>('/api/terms/decline/', { method: 'POST' }),

  // A Tenant
  tenantTerms: (t: string, signal?: Signal) => apiRequest<TenantTermsDto>(tenantTerms(t), options(signal)),

  // Published versions, read-only (everyone in the Tenant)
  history: (t: string, signal?: Signal) => apiRequest<TermsVersionSummaryDto[]>(`${tenantTerms(t)}history/`, options(signal)),
  historyVersion: (t: string, id: string, signal?: Signal) =>
    apiRequest<TermsVersionDto>(`${tenantTerms(t)}history/${encodeURIComponent(id)}/`, options(signal)),

  // Tenant administrators
  versions: (t: string, signal?: Signal) => apiRequest<TermsVersionsDto>(`${tenantTerms(t)}versions/`, options(signal)),
  version: (t: string, id: string, signal?: Signal) => apiRequest<TermsVersionDto>(versionPath(t, id), options(signal)),
  createDraft: (t: string) => apiRequest<TermsVersionDto>(`${tenantTerms(t)}versions/`, { method: 'POST' }),
  updateDraft: (t: string, id: string, body: { title?: string; content?: TermsDocumentJson }) =>
    apiRequest<TermsVersionDto>(versionPath(t, id), { method: 'PATCH', body }),
  discardDraft: (t: string, id: string) => apiRequest<null>(versionPath(t, id), { method: 'DELETE' }),
  publish: (t: string, id: string) => apiRequest<TermsVersionDto>(`${versionPath(t, id)}publish/`, { method: 'POST' }),
  acceptances: (t: string, query: AcceptanceQuery, signal?: Signal) =>
    apiRequest<Paginated<AcceptanceRowDto>>(`${tenantTerms(t)}acceptances/?${acceptanceParams(query)}`, options(signal)),
  tenantSummary: (t: string, signal?: Signal) => apiRequest<AcceptanceSummaryDto>(`${tenantTerms(t)}summary/`, options(signal)),

  // One Organization's people (everyone in it who may see its members)
  organizationSummary: (t: string, o: string, signal?: Signal) =>
    apiRequest<AcceptanceSummaryDto>(`${organizationTerms(t, o)}summary/`, options(signal)),
  organizationAcceptances: (t: string, o: string, query: AcceptanceQuery, signal?: Signal) =>
    apiRequest<Paginated<AcceptanceRowDto>>(`${organizationTerms(t, o)}acceptances/?${acceptanceParams(query)}`, options(signal)),
};
