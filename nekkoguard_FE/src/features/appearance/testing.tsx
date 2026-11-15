/* eslint-disable react-refresh/only-export-components -- test helpers, never hot-reloaded */
/**
 * Test helpers for the appearance feature (imported by *.test.ts[x] only).
 * Real providers with fake values — no network, no module mocking.
 */
import { BugReportProvider } from '@/features/help/BugReportProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { COLOR_FIELDS, type AppearanceDto, type AppearanceValues, type ResolvedValues } from '@/api/appearance';
import { queryKeys } from '@/api/queryKeys';
import type { OrganizationDetailDto, TenantDto } from '@/api/tenancy';
import { ToastProvider } from '@/components/Toast/ToastProvider';
import { AuthContext, type AuthContextValue } from '@/features/auth/AuthContext';
import { RealtimeContext, type RealtimeContextValue } from '@/features/system/RealtimeContext';
import { TenancyContext, type TenancyContextValue } from '@/features/tenancy/TenancyContext';

export const TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const ORG_ID = '22222222-2222-4222-8222-222222222222';
export const OTHER_ORG_ID = '33333333-3333-4333-8333-333333333333';

const NO_VALUES = { title: null, navbar_position: null, ...Object.fromEntries(COLOR_FIELDS.map((f) => [f, null])) } as AppearanceValues;
const NO_RESOLVED: ResolvedValues = { ...NO_VALUES, logo_url: null, favicon_url: null };

export function resolvedValues(values: Partial<ResolvedValues> = {}): ResolvedValues {
  return { ...NO_RESOLVED, ...values };
}

interface DtoOverrides {
  scope?: AppearanceDto['scope'];
  configured?: Partial<AppearanceDto['configured']>;
  inherited?: Partial<ResolvedValues>;
  effective?: Partial<ResolvedValues>;
  can_manage?: boolean;
}

export function appearanceDto(overrides: DtoOverrides = {}): AppearanceDto {
  const configured = { ...NO_VALUES, logo: false, favicon: false, ...overrides.configured };
  const inherited = resolvedValues(overrides.inherited);
  return {
    scope: overrides.scope ?? 'tenant',
    configured,
    inherited,
    effective: resolvedValues(overrides.effective),
    sources: {} as AppearanceDto['sources'],
    can_manage: overrides.can_manage ?? true,
    updated_at: null,
  };
}

export function tenantDto(permissions: string[] = [], role: TenantDto['role'] = 'member', mfaRequired = false): TenantDto {
  return {
    id: TENANT_ID,
    name: 'Acme',
    description: '',
    support_email: '',
    role,
    permissions,
    mfa_required: mfaRequired,
    organization_access: 'all',
    is_default: true,
    created_at: '2026-01-01T00:00:00Z',
  };
}

export function organizationDto(permissions: string[] = [], id = ORG_ID): OrganizationDetailDto {
  // In the caller's organization scope by default (their tenant rights apply here).
  return { id, name: 'Acme HQ', can_administer: true, my_access: { permissions } } as unknown as OrganizationDetailDto;
}

export function fakeTenancy(overrides: Partial<TenancyContextValue> = {}): TenancyContextValue {
  return {
    selection: { tenant: null, org: null, site: null, network: null },
    ready: true,
    tenants: [],
    tenantsError: null,
    retryTenants: () => undefined,
    currentTenant: null,
    organizations: [],
    currentOrganization: null,
    organizationLoading: false,
    organizationError: null,
    sites: undefined,
    networks: undefined,
    permissions: new Set(),
    tenantPermissions: new Set(),
    select: () => undefined,
    myOrganizations: [],
    myOrganizationsError: null,
    selectOrganization: () => undefined,
    ...overrides,
  };
}

/** Tenancy for "tenant (and optionally organization) selected". */
export function tenancyFor({
  tenantPermissions = [],
  orgPermissions,
  orgId = ORG_ID,
}: {
  tenantPermissions?: string[];
  /** Omit for "no organization selected". */
  orgPermissions?: string[];
  orgId?: string;
}): TenancyContextValue {
  const tenant = tenantDto(tenantPermissions);
  const organization = orgPermissions ? organizationDto(orgPermissions, orgId) : null;
  return fakeTenancy({
    selection: { tenant: TENANT_ID, org: organization ? orgId : null, site: null, network: null },
    tenants: [tenant],
    currentTenant: tenant,
    currentOrganization: organization,
    permissions: new Set(orgPermissions ?? []),
    tenantPermissions: new Set(tenantPermissions),
  });
}

const auth: AuthContextValue = {
  status: 'authenticated',
  // Disables the current-user query: its data comes from the seeded cache only.
  isAuthenticated: false,
  user: null,
  flows: [],
  pendingFlow: null,
  lastSignOutReason: null,
  applySession: () => undefined,
  signOut: async () => undefined,
} as unknown as AuthContextValue;

const realtime: RealtimeContextValue = { status: 'connected', latencyMs: 5, lastPongAt: null, reconnect: () => undefined } as RealtimeContextValue;

export function newQueryClient({
  isStaff = false,
  mfaRequired = false,
  mfaEnabled,
}: { isStaff?: boolean; mfaRequired?: boolean; mfaEnabled?: boolean } = {}): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(queryKeys.currentUser, {
    id: 1,
    email: 'me@example.test',
    name: 'Me',
    is_staff: isStaff,
    mfa_enabled: mfaEnabled ?? !mfaRequired,
    mfa_required: mfaRequired,
    url: '',
  });
  return client;
}

/** The router is created once, so re-rendering with another tenancy keeps it. */
function TestRouter({ route, children }: { route: string; children: ReactNode }) {
  const [router] = useState(() => createMemoryRouter([{ path: '*', element: children }], { initialEntries: [route] }));
  return <RouterProvider router={router} />;
}

export function Providers({
  tenancy,
  client,
  route = '/',
  children,
}: {
  tenancy: TenancyContextValue;
  client: QueryClient;
  route?: string;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <RealtimeContext.Provider value={realtime}>
          <ToastProvider>
            <TenancyContext.Provider value={tenancy}>
              <TestRouter route={route}>
                <BugReportProvider>{children}</BugReportProvider>
              </TestRouter>
            </TenancyContext.Provider>
          </ToastProvider>
        </RealtimeContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

export function renderWith(
  ui: ReactElement,
  { tenancy = fakeTenancy(), client = newQueryClient(), route }: { tenancy?: TenancyContextValue; client?: QueryClient; route?: string } = {},
) {
  const result = render(
    <Providers tenancy={tenancy} client={client} route={route}>
      {ui}
    </Providers>,
  );
  return {
    ...result,
    client,
    /** Re-render the same tree with another tenancy (context switch). */
    switchTo: (next: TenancyContextValue) =>
      result.rerender(
        <Providers tenancy={next} client={client} route={route}>
          {ui}
        </Providers>,
      ),
  };
}
