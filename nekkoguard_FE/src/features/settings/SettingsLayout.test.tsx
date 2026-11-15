// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeTenancy, newQueryClient, organizationDto, renderWith, tenancyFor, tenantDto } from '@/features/appearance/testing';
import { OrganizationSettingsLayout, ProfileSettingsLayout, TenantSettingsLayout } from './SettingsLayout';
import { TenantDetailsPage } from './pages/TenantSettingsPages';

afterEach(cleanup);

const links = (area: string) =>
  within(screen.getByRole('navigation', { name: `${area} settings` }))
    .getAllByRole('link')
    .map((link) => link.textContent);

const tenantAdmin = [
  'tenant.view',
  'tenant.manage',
  'tenant.members.manage',
  'tenant.organizations.manage',
  'tenant.activity.view',
  'tenant.appearance.manage',
];

describe('settings areas are separated by context', () => {
  it('Tenant settings list only tenant pages, appearance included for Appearance Admins', () => {
    renderWith(<TenantSettingsLayout />, { tenancy: tenancyFor({ tenantPermissions: tenantAdmin, orgPermissions: [] }) });
    expect(links('Acme')).toEqual(['Details', 'Organizations', 'Members', 'Activity', 'Terms of Service', 'Appearance']);
  });

  it('Tenant settings list nothing to manage for non-administrators', () => {
    renderWith(<TenantSettingsLayout />, { tenancy: tenancyFor({ tenantPermissions: ['tenant.view'] }) });
    expect(links('Acme')).toEqual(['Details']);
  });

  it.each([
    ['a plain tenant member', ['tenant.view'], ['sites.view']],
    ['an organization administrator', ['tenant.view'], ['organization.manage', 'members.manage', 'sites.manage']],
    ['an organization-only member', [], ['sites.view', 'activity.view']],
  ])('opening a tenant page directly as %s shows no tenant data', (_label, tenantPermissions, orgPermissions) => {
    renderWith(<TenantDetailsPage />, { tenancy: tenancyFor({ tenantPermissions, orgPermissions }) });
    expect(screen.getByText('Tenant settings are not available')).toBeTruthy();
  });

  it('Organization settings list only organization pages of the selected organization', () => {
    const tenancy = tenancyFor({
      tenantPermissions: ['tenant.view'],
      orgPermissions: ['members.manage', 'activity.view', 'organization.appearance.manage'],
    });
    renderWith(<OrganizationSettingsLayout />, { tenancy });
    expect(links('Acme HQ')).toEqual(['Details', 'Members', 'Permissions', 'Activity', 'Terms of Service', 'Appearance']);
  });

  it('Viewers see Members, Permissions and Activity of the organization (read-only)', () => {
    const tenancy = tenancyFor({
      tenantPermissions: ['tenant.view'],
      orgPermissions: ['sites.view', 'networks.view', 'members.view', 'activity.view'],
    });
    renderWith(<OrganizationSettingsLayout />, { tenancy });
    expect(links('Acme HQ')).toEqual(['Details', 'Members', 'Permissions', 'Activity', 'Terms of Service']);
  });

  it('Organization appearance is offered to the Tenant Appearance Admin too', () => {
    renderWith(<OrganizationSettingsLayout />, {
      tenancy: tenancyFor({ tenantPermissions: ['tenant.appearance.manage'], orgPermissions: ['sites.view'] }),
    });
    expect(links('Acme HQ')).toEqual(['Details', 'Appearance']);
  });

  it('Profile settings are the same whatever the context, and carry no context in links', () => {
    const expected = ['Personal information', 'Security', 'Connected applications'];
    renderWith(<ProfileSettingsLayout />, { tenancy: fakeTenancy(), client: newQueryClient() });
    expect(links('Me')).toEqual(expected);
    cleanup();
    const tenant = tenantDto(tenantAdmin, 'admin');
    renderWith(<ProfileSettingsLayout />, {
      tenancy: fakeTenancy({
        selection: { tenant: tenant.id, org: null, site: null, network: null },
        tenants: [tenant],
        currentTenant: tenant,
        currentOrganization: organizationDto([]),
      }),
    });
    expect(links('Me')).toEqual(expected);
    const security = screen.getByRole('link', { name: 'Security' });
    expect(security.getAttribute('href')).toBe('/settings/profile/security');
  });
});
