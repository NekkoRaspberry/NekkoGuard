import { useContext, useMemo } from 'react';
import { useCurrentUser } from '@/features/account/hooks/useCurrentUser';
import type { Permission, TenantPermission } from './model';
import { LEVELS } from './selection';
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

/**
 * Query string carrying the current context (`?tenant=…&org=…`), so in-app links keep
 * the context instead of falling back to the remembered default.
 */
export function useContextSearch(): string {
  const { selection } = useTenancy();
  return useMemo(() => {
    const params = new URLSearchParams();
    for (const level of LEVELS) {
      const value = selection[level];
      if (value) params.set(level, value);
    }
    const text = params.toString();
    return text ? `?${text}` : '';
  }, [selection]);
}

/** Tenant and Organization ids for pages that require both (null until selected). */
export function useOrganizationScope(): { tenantId: string; orgId: string } | null {
  const { selection, currentOrganization } = useTenancy();
  if (!selection.tenant || !selection.org || !currentOrganization) return null;
  return { tenantId: selection.tenant, orgId: selection.org };
}
