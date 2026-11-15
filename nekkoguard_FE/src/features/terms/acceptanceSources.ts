import { queryKeys } from '@/api/queryKeys';
import { termsApi } from '@/api/terms';
import type { AcceptanceSource } from './components/AcceptancePanel';

/** Everyone connected to the Tenant (Tenant administrators). */
export const tenantAcceptanceSource = (tenantId: string): AcceptanceSource => ({
  queryKey: (query) => queryKeys.termsAcceptances(tenantId, query),
  fetchPage: (query, signal) => termsApi.acceptances(tenantId, query, signal),
});

/** The people of one Organization (everyone in it who may see its members). */
export const organizationAcceptanceSource = (tenantId: string, orgId: string): AcceptanceSource => ({
  queryKey: (query) => queryKeys.organizationTermsAcceptances(tenantId, orgId, query),
  fetchPage: (query, signal) => termsApi.organizationAcceptances(tenantId, orgId, query, signal),
});
