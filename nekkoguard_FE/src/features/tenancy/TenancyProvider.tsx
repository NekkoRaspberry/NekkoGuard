import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { isApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { tenancyApi } from '@/api/tenancy';
import { useToast } from '@/components/Toast/useToast';
import { PERMISSIONS } from './model';
import { readDefaults, rememberSelection } from './storage';
import {
  changeSelection,
  parseSelection,
  resolveSelection,
  sameSelection,
  writeSelection,
  type Level,
  type Selection,
} from './selection';
import { TenancyContext, type TenancyContextValue } from './TenancyContext';

const EMPTY: ReadonlySet<string> = new Set();
const LEVEL_NAMES: Record<Level, string> = {
  tenant: 'tenant',
  org: 'organization',
  site: 'site',
  network: 'network',
};

/**
 * Owns the Tenant → Organization → Site → Network context.
 *
 * - The URL is the source of truth (refresh, back/forward and shared links work).
 * - Every id is validated against lists the backend returned for this user; ids the
 *   user cannot select are removed from the URL.
 * - Switching Tenant/Organization drops the previous scope's cached data. Query keys
 *   always contain the Tenant/Organization ids, so a late response for the previous
 *   context can never be shown in the new one.
 */
export function TenancyProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = useMemo(() => parseSelection(searchParams), [searchParams]);

  // ---- options, each level only once its parent is valid
  const tenantsQuery = useQuery({
    queryKey: queryKeys.tenants,
    queryFn: ({ signal }) => tenancyApi.listTenants(signal),
    staleTime: 30_000,
  });
  const tenants = tenantsQuery.data;
  const tenantIds = useMemo(() => tenants?.map((t) => t.id), [tenants]);

  const tenantId = useMemo(() => {
    if (!tenantIds) return null;
    return resolveSelection(requested, { tenants: tenantIds, organizations: [], sites: [], networks: new Map() }, readDefaults())
      .selection.tenant;
  }, [requested, tenantIds]);

  const organizationsQuery = useQuery({
    queryKey: queryKeys.organizations(tenantId ?? ''),
    queryFn: ({ signal }) => tenancyApi.listOrganizations(tenantId ?? '', signal),
    enabled: tenantId !== null,
    staleTime: 30_000,
  });
  const organizations = useMemo(
    () => organizationsQuery.data?.filter((o) => o.has_access && o.is_active),
    [organizationsQuery.data],
  );
  const orgIds = useMemo(() => organizations?.map((o) => o.id), [organizations]);

  const orgId = useMemo(() => {
    if (!tenantIds || !orgIds) return null;
    return resolveSelection(requested, { tenants: tenantIds, organizations: orgIds, sites: [], networks: new Map() }, readDefaults())
      .selection.org;
  }, [requested, tenantIds, orgIds]);

  const organizationQuery = useQuery({
    queryKey: queryKeys.organization(tenantId ?? '', orgId ?? ''),
    queryFn: ({ signal }) => tenancyApi.getOrganization(tenantId ?? '', orgId ?? '', signal),
    enabled: tenantId !== null && orgId !== null,
  });
  const currentOrganization = organizationQuery.data?.id === orgId ? organizationQuery.data : null;
  const permissions = useMemo<ReadonlySet<string>>(
    () => new Set(currentOrganization?.my_access?.permissions ?? []),
    [currentOrganization],
  );
  const canViewSites = permissions.has(PERMISSIONS.viewSites);
  const canViewNetworks = permissions.has(PERMISSIONS.viewNetworks);

  const sitesQuery = useQuery({
    queryKey: queryKeys.sites(tenantId ?? '', orgId ?? ''),
    queryFn: ({ signal }) => tenancyApi.listSites(tenantId ?? '', orgId ?? '', signal),
    enabled: currentOrganization !== null && canViewSites,
  });
  const networksQuery = useQuery({
    queryKey: queryKeys.networks(tenantId ?? '', orgId ?? '', null),
    queryFn: ({ signal }) => tenancyApi.listNetworks(tenantId ?? '', orgId ?? '', null, signal),
    enabled: currentOrganization !== null && canViewNetworks,
  });

  // ---- full validation
  const resolution = useMemo(() => {
    const permissionsKnown = currentOrganization !== null || organizationQuery.isError;
    // Without permission the options are empty (a stale ?site= is removed), not "loading".
    const sites = !permissionsKnown ? undefined : canViewSites ? sitesQuery.data?.map((s) => s.id) : [];
    const networks = !permissionsKnown
      ? undefined
      : canViewNetworks
        ? networksQuery.data && new Map(networksQuery.data.map((n) => [n.id, n.site]))
        : new Map<string, string>();
    return resolveSelection(requested, { tenants: tenantIds, organizations: orgIds, sites, networks }, readDefaults());
  }, [
    requested,
    tenantIds,
    orgIds,
    currentOrganization,
    organizationQuery.isError,
    canViewSites,
    canViewNetworks,
    sitesQuery.data,
    networksQuery.data,
  ]);
  const selection = resolution.selection;

  // Write the validated selection back to the URL (replace: not a new history entry).
  useEffect(() => {
    if (resolution.pending || sameSelection(selection, requested)) return;
    setSearchParams((params) => writeSelection(params, selection), { replace: true });
    if (resolution.removed.length > 0) {
      const what = resolution.removed.map((level) => LEVEL_NAMES[level]).join(', ');
      notify({ tone: 'warning', title: 'Context changed', description: `The requested ${what} is not available to you.` });
    }
  }, [resolution, selection, requested, setSearchParams, notify]);

  // Remember the last valid choice; drop the cache of a scope we left.
  const previous = useRef<Selection | null>(null);
  useEffect(() => {
    if (resolution.pending) return;
    rememberSelection(selection);
    const before = previous.current;
    previous.current = selection;
    if (!before) return;
    if (before.tenant && before.tenant !== selection.tenant) {
      queryClient.removeQueries({ queryKey: queryKeys.tenantScope(before.tenant) });
    } else if (before.tenant && before.org && before.org !== selection.org) {
      queryClient.removeQueries({ queryKey: queryKeys.organizationScope(before.tenant, before.org) });
    }
  }, [resolution.pending, selection, queryClient]);

  // Access lost mid-session (404/403): reload the lists so the selection is re-validated.
  useEffect(() => {
    const error = organizationQuery.error;
    if (isApiError(error) && (error.status === 404 || error.status === 403)) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
      if (tenantId) void queryClient.invalidateQueries({ queryKey: queryKeys.organizations(tenantId) });
    }
  }, [organizationQuery.error, queryClient, tenantId]);

  const select = useCallback(
    (level: Level, id: string | null) => {
      const lists: Record<Level, { id: string; name: string }[] | undefined> = {
        tenant: tenants,
        org: organizations,
        site: sitesQuery.data,
        network: networksQuery.data,
      };
      const target = id === null ? null : lists[level]?.find((item) => item.id === id);
      if (id !== null && !target) return; // not offered to this user: ignore
      if (selection[level] === id) return;
      const next = changeSelection(selection, level, id);
      setSearchParams((params) => writeSelection(params, next)); // push: back button returns
      if (target && (level === 'tenant' || level === 'org')) {
        notify({ tone: 'info', title: `Switched to ${target.name}` });
      }
    },
    [tenants, organizations, sitesQuery.data, networksQuery.data, selection, setSearchParams, notify],
  );

  const currentTenant = tenants?.find((t) => t.id === selection.tenant) ?? null;
  const tenantPermissions = useMemo<ReadonlySet<string>>(
    () => (currentTenant ? new Set(currentTenant.permissions) : EMPTY),
    [currentTenant],
  );
  const ready = !resolution.pending && (selection.org === null || currentOrganization !== null || organizationQuery.isError);

  const value = useMemo<TenancyContextValue>(
    () => ({
      selection,
      ready,
      tenants,
      tenantsError: tenantsQuery.error,
      retryTenants: () => void tenantsQuery.refetch(),
      currentTenant,
      organizations,
      currentOrganization: currentOrganization?.id === selection.org ? currentOrganization : null,
      organizationLoading: organizationQuery.isPending && orgId !== null,
      organizationError: organizationQuery.error,
      sites: canViewSites ? sitesQuery.data : undefined,
      networks: canViewNetworks ? networksQuery.data : undefined,
      permissions: currentOrganization?.id === selection.org ? permissions : EMPTY,
      tenantPermissions,
      select,
    }),
    [
      selection,
      ready,
      tenants,
      tenantsQuery,
      currentTenant,
      organizations,
      currentOrganization,
      organizationQuery.isPending,
      organizationQuery.error,
      orgId,
      canViewSites,
      canViewNetworks,
      sitesQuery.data,
      networksQuery.data,
      permissions,
      tenantPermissions,
      select,
    ],
  );

  return <TenancyContext.Provider value={value}>{children}</TenancyContext.Provider>;
}
