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
  /** Superuser "view as user" status, and the user search of its switcher. */
  impersonation: ['impersonation', 'status'] as const,
  impersonationUsers: (search: string) => ['impersonation', 'users', search] as const,

  /** Release notes: global (same for every Tenant), never scoped. */
  helpReleases: ['help', 'releases'] as const,
  /** Terms the signed-in user still has to accept (all their Tenants). */
  termsPending: ['terms', 'pending'] as const,

  tenants: ['tenants', 'list'] as const,
  /** Organizations I can open in every Tenant (outside any Tenant scope: survives switches). */
  myOrganizations: ['organizations', 'mine'] as const,
  tenantScope,
  tenantMembers: (t: string) => [...tenantScope(t), 'members'] as const,
  tenantActivity: (t: string, page: number, ordering = '') => [...tenantScope(t), 'activity', page, ordering] as const,
  organizations: (t: string) => [...tenantScope(t), 'organizations', 'list'] as const,
  organizationScope,
  organization: (t: string, o: string) => [...organizationScope(t, o), 'detail'] as const,
  organizationMembers: (t: string, o: string) => [...organizationScope(t, o), 'members'] as const,
  overrides: (t: string, o: string) => [...organizationScope(t, o), 'overrides'] as const,
  accessList: (t: string, o: string) => [...organizationScope(t, o), 'access'] as const,
  sites: (t: string, o: string) => [...organizationScope(t, o), 'sites'] as const,
  networks: (t: string, o: string, site: string | null) =>
    [...organizationScope(t, o), 'networks', site ?? 'all'] as const,
  organizationActivity: (t: string, o: string, page: number, ordering = '') =>
    [...organizationScope(t, o), 'activity', page, ordering] as const,
  invitations: (t: string, o: string) => [...organizationScope(t, o), 'invitations'] as const,
  /** An emailed invitation link (public; not tied to the selected context). */
  invitationLink: (token: string) => ['invitations', 'link', token] as const,

  /** Appearance of a Tenant (org null) or Organization: dropped with its scope on switch. */
  appearance: (t: string, o: string | null) =>
    o ? ([...organizationScope(t, o), 'appearance'] as const) : ([...tenantScope(t), 'appearance'] as const),
  /** Tenant Terms of Service (everything under ['tenants', t, 'terms']). */
  tenantTerms: (t: string) => [...tenantScope(t), 'terms'] as const,
  termsVersions: (t: string) => [...tenantScope(t), 'terms', 'versions'] as const,
  termsVersion: (t: string, id: string) => [...tenantScope(t), 'terms', 'versions', id] as const,
  termsAcceptances: (t: string, query: object) => [...tenantScope(t), 'terms', 'acceptances', query] as const,
  termsHistory: (t: string) => [...tenantScope(t), 'terms', 'history'] as const,
  termsHistoryVersion: (t: string, id: string) => [...tenantScope(t), 'terms', 'history', id] as const,
  termsSummary: (t: string) => [...tenantScope(t), 'terms', 'summary'] as const,
  organizationTermsSummary: (t: string, o: string) => [...organizationScope(t, o), 'terms', 'summary'] as const,
  organizationTermsAcceptances: (t: string, o: string, query: object) =>
    [...organizationScope(t, o), 'terms', 'acceptances', query] as const,
};
