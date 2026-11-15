import { useQuery } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { appearanceApi, type ResolvedValues } from '@/api/appearance';
import { queryKeys } from '@/api/queryKeys';
import { useTenancy } from '@/features/tenancy/hooks';
import { useAuth } from '@/features/auth/useAuth';
import { readDefaults } from '@/features/tenancy/storage';
import { AppearanceContext, type AppearanceContextValue } from './AppearanceContext';
import { clearCachedAppearance, readCachedAppearance, scopeKey, writeCachedAppearance } from './cache';
import { applyAppearance } from './dom';

const isCustomized = (effective: ResolvedValues) => Object.values(effective).some((value) => value !== null);

/**
 * Applies the effective appearance of the current Tenant/Organization to the whole app.
 *
 * - Organization selected (and reachable) → its appearance (inheriting the Tenant's);
 *   otherwise the Tenant's; no Tenant → NekkoGuard defaults.
 * - Query keys contain the Tenant/Organization ids and live under their scope, so the
 *   TenancyProvider drops them on a switch: another context's branding is never reused.
 * - While loading or on error the NekkoGuard defaults are shown (or, during a reload of
 *   the same context, the last appearance this browser saw for it).
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { selection, ready, currentOrganization } = useTenancy();
  const userId = useAuth().user?.id ?? null;

  const tenantId = ready ? selection.tenant : null;
  const orgId = ready && currentOrganization && selection.org === currentOrganization.id ? selection.org : null;

  const query = useQuery({
    queryKey: queryKeys.appearance(tenantId ?? '', orgId),
    queryFn: ({ signal }) => appearanceApi.get(tenantId ?? '', orgId, signal),
    enabled: tenantId !== null,
    staleTime: 60_000,
    retry: 1,
  });

  // Before the context is validated, only the context this user last used (the one a
  // reload reopens) may use the cache.
  const remembered = readDefaults(userId);
  const rememberedOrg = remembered.tenant ? (remembered.orgByTenant[remembered.tenant] ?? null) : null;
  const key = ready ? scopeKey(tenantId, orgId) : scopeKey(remembered.tenant, rememberedOrg);
  const fetched = tenantId !== null ? query.data?.effective : undefined;
  const effective: ResolvedValues | null = useMemo(() => {
    if (fetched) return isCustomized(fetched) ? fetched : null;
    if (ready && (tenantId === null || query.isError)) return null;
    return readCachedAppearance(key);
  }, [fetched, ready, tenantId, query.isError, key]);

  useLayoutEffect(() => applyAppearance(effective), [effective]);
  useEffect(() => {
    if (fetched && key) writeCachedAppearance(key, isCustomized(fetched) ? fetched : null);
  }, [fetched, key]);
  useEffect(
    () => () => {
      applyAppearance(null); // leaving the app shell (sign-out): back to NekkoGuard
      clearCachedAppearance();
    },
    [],
  );

  const value = useMemo<AppearanceContextValue>(
    () => ({
      effective,
      title: effective?.title ?? null,
      logoUrl: effective?.logo_url ?? null,
      navbarPosition: effective?.navbar_position ?? 'left',
    }),
    [effective],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
