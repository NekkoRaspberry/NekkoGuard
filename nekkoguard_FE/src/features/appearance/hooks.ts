import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';
import { appearanceApi } from '@/api/appearance';
import { queryKeys } from '@/api/queryKeys';
import { AppearanceContext, type AppearanceContextValue } from './AppearanceContext';

/** Effective appearance of the current context (defaults outside the app shell). */
export function useEffectiveAppearance(): AppearanceContextValue {
  return useContext(AppearanceContext);
}

/** Appearance of one scope: the Tenant (orgId null) or one of its Organizations. */
export function useScopeAppearance(tenantId: string | null, orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.appearance(tenantId ?? '', orgId),
    queryFn: ({ signal }) => appearanceApi.get(tenantId ?? '', orgId, signal),
    enabled: tenantId !== null,
  });
}

