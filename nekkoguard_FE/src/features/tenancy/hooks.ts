import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi } from '@/api/tenancy';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import type { Permission, TenantPermission } from './model';
import { TenancyContext, type TenancyContextValue } from './TenancyContext';

/** Full context. Must be used below `TenancyProvider` (inside the app shell). */
export function useTenancy(): TenancyContextValue {
  const context = useContext(TenancyContext);
  if (!context) throw new Error('useTenancy must be used within TenancyProvider');
  return context;
}

export function useCurrentTenant() {
  return useTenancy().currentTenant;
}

/**
 * Display name of a Tenant — the selected one by default. Texts name the Tenant
 * ("Inherited from Acme MSP") instead of a generic "tenant": a user may work with
 * several tenants, like several providers.
 */
export function useTenantName(tenantId?: string | null): string {
  const { tenants, currentTenant } = useTenancy();
  const id = tenantId ?? currentTenant?.id;
  return tenants?.find((t) => t.id === id)?.name ?? currentTenant?.name ?? 'the tenant';
}

/**
 * Display name of an Organization (e.g. for export file names). Shares the detail query
 * the pages already load, so it normally costs no extra request.
 */
export function useOrganizationName(tenantId: string, orgId: string): string {
  const detail = useQuery({
    queryKey: queryKeys.organization(tenantId, orgId),
    queryFn: ({ signal }) => tenancyApi.getOrganization(tenantId, orgId, signal),
    staleTime: 60_000,
  });
  return detail.data?.name ?? 'Organization';
}

export function useCurrentOrganization() {
  return useTenancy().currentOrganization;
}

/** Effective permissions in the current Organization, as resolved by the backend. */
export function useEffectivePermissions(): ReadonlySet<string> {
  return useTenancy().permissions;
}

/**
 * `useCan('sites.manage')` — presentation only (hide/disable controls).
 * The backend remains the security boundary and re-checks every request.
 */
export function useCan(permission: Permission): boolean {
  return useTenancy().permissions.has(permission);
}

export function useCanTenant(permission: TenantPermission): boolean {
  return useTenancy().tenantPermissions.has(permission);
}

export function useIsPlatformAdmin(): boolean {
  return useCurrentUser().data?.isStaff ?? false;
}


/** Tenant and Organization ids for pages that require both (null until selected). */
export function useOrganizationScope(): { tenantId: string; orgId: string } | null {
  const { selection, currentOrganization } = useTenancy();
  if (!selection.tenant || !selection.org || !currentOrganization) return null;
  return { tenantId: selection.tenant, orgId: selection.org };
}
