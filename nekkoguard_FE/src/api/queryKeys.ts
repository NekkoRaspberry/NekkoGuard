/**
 * TanStack Query keys — one place, so invalidation always matches.
 *
 * Tenancy keys are hierarchical: everything about a Tenant starts with
 * `['tenants', tenantId]` and everything about an Organization with
 * `['tenants', tenantId, 'organizations', orgId]`. Data of one Tenant/Organization can
 * therefore never be served for another, and a whole scope is dropped with one prefix.
 */
const tenantScope = (tenantId: string) => ['tenants', tenantId] as const;
const organizationScope = (tenantId: string, orgId: string) =>
  [...tenantScope(tenantId), 'organizations', orgId] as const;

export const queryKeys = {
  session: ['auth', 'session'] as const,
  config: ['auth', 'config'] as const,
  currentUser: ['users', 'me'] as const,
  apiHealth: ['system', 'api-health'] as const,
  emails: ['account', 'emails'] as const,
  authenticators: ['account', 'authenticators'] as const,
  providerAccounts: ['account', 'providers'] as const,
  authorizedApps: ['oauth', 'authorized'] as const,
  oauthApplications: ['oauth', 'applications'] as const,
  oidcEnabled: ['oauth', 'oidc'] as const,

  tenants: ['tenants', 'list'] as const,
  tenantScope,
  tenantMembers: (t: string) => [...tenantScope(t), 'members'] as const,
  tenantActivity: (t: string, page: number) => [...tenantScope(t), 'activity', page] as const,
  organizations: (t: string) => [...tenantScope(t), 'organizations', 'list'] as const,
  organizationScope,
  organization: (t: string, o: string) => [...organizationScope(t, o), 'detail'] as const,
  organizationMembers: (t: string, o: string) => [...organizationScope(t, o), 'members'] as const,
  overrides: (t: string, o: string) => [...organizationScope(t, o), 'overrides'] as const,
  accessList: (t: string, o: string) => [...organizationScope(t, o), 'access'] as const,
  sites: (t: string, o: string) => [...organizationScope(t, o), 'sites'] as const,
  networks: (t: string, o: string, site: string | null) =>
    [...organizationScope(t, o), 'networks', site ?? 'all'] as const,
  organizationActivity: (t: string, o: string, page: number) =>
    [...organizationScope(t, o), 'activity', page] as const,

  platformTenants: ['platform', 'tenants'] as const,
};
