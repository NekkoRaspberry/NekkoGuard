// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { termsApi, type AcceptanceSummaryDto } from '@/api/terms';
import { fakeTenancy, ORG_ID, organizationDto, renderWith, TENANT_ID, tenantDto } from '@/features/appearance/testing';
import { versionDto } from './fixtures';
import { OrganizationTermsAcceptancePage, TenantTermsAcceptancePage } from './pages/TermsAcceptancePages';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SUMMARY: AcceptanceSummaryDto = {
  tenant_name: 'Acme',
  current: versionDto(),
  version_numbers: [2, 1],
  current_stats: { required: 2, accepted: 1, pending: 1 },
};

const ROWS = {
  count: 1,
  next: null,
  previous: null,
  results: [{ user: { id: 7, email: 'ana@example.test', name: 'Ana' }, status: 'accepted_current' as const, accepted_version: 2, accepted_at: '2026-11-12T10:00:00Z' }],
};

describe('Settings › Tenant › Terms of Service', () => {
  it('shows the current version, the counts and everyone in the Tenant', async () => {
    vi.spyOn(termsApi, 'tenantSummary').mockResolvedValue(SUMMARY);
    const rows = vi.spyOn(termsApi, 'acceptances').mockResolvedValue(ROWS);
    const tenant = tenantDto(['tenant.view', 'tenant.manage'], 'admin');
    renderWith(<TenantTermsAcceptancePage />, { tenancy: fakeTenancy({ currentTenant: tenant, tenants: [tenant], tenantPermissions: new Set(tenant.permissions) }) });
    expect(await screen.findByText(/Version 2 of Acme/)).toBeTruthy();
    const stats = screen.getByRole('group', { name: 'Acceptance of the current version' });
    expect(within(stats).getByText('50%')).toBeTruthy();
    expect(await screen.findByText('Accepted current')).toBeTruthy();
    expect(rows).toHaveBeenCalledWith(TENANT_ID, expect.objectContaining({ page: 1 }), expect.anything());
    expect(screen.getByRole('link', { name: 'Read the Terms' }).getAttribute('href')).toBe('/help/terms');
  });

  it('is not shown to people who cannot administer the Tenant', () => {
    const tenant = tenantDto(['tenant.view'], 'member');
    renderWith(<TenantTermsAcceptancePage />, { tenancy: fakeTenancy({ currentTenant: tenant, tenants: [tenant], tenantPermissions: new Set(tenant.permissions) }) });
    expect(screen.getByText('Tenant settings are not available')).toBeTruthy();
  });
});

describe('Settings › Organization › Terms of Service', () => {
  it("lists only the organization's people, for everyone who can see its members", async () => {
    const summary = vi.spyOn(termsApi, 'organizationSummary').mockResolvedValue(SUMMARY);
    const rows = vi.spyOn(termsApi, 'organizationAcceptances').mockResolvedValue(ROWS);
    const tenantWide = vi.spyOn(termsApi, 'acceptances');
    const tenant = tenantDto(['tenant.view'], 'member');
    const organization = organizationDto(['sites.view', 'members.view']);
    renderWith(<OrganizationTermsAcceptancePage />, {
      tenancy: fakeTenancy({
        selection: { tenant: TENANT_ID, org: ORG_ID, site: null, network: null },
        currentTenant: tenant,
        tenants: [tenant],
        currentOrganization: organization,
        permissions: new Set(['sites.view', 'members.view']),
      }),
    });
    expect(await screen.findByText('Ana')).toBeTruthy();
    expect(summary).toHaveBeenCalledWith(TENANT_ID, ORG_ID, expect.anything());
    await waitFor(() => expect(rows).toHaveBeenCalledWith(TENANT_ID, ORG_ID, expect.objectContaining({ page: 1 }), expect.anything()));
    expect(tenantWide).not.toHaveBeenCalled();
  });
});
