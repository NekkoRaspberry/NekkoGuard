import { describe, expect, it } from 'vitest';
import type { OrganizationDetailDto } from '@/api/tenancy';
import { canAdministerTenant } from '@/features/tenancy/model';
import { visibleNavigation, type NavAccess } from '@/layout/navigation';
import { canManageOrganizationAppearance, canManageTenantAppearance, organizationCapabilities } from './capabilities';

function organization(permissions: string[] | null, canAdminister = true): OrganizationDetailDto {
  return {
    can_administer: canAdminister,
    mfa_required: false,
    id: 'o1',
    tenant: 't1',
    name: 'Org',
    description: '',
    is_active: true,
    has_access: permissions !== null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    my_access:
      permissions === null
        ? null
        : {
            user: { id: 1, email: 'u@example.test', name: '' },
            via_tenant: true,
            organization_role: null,
            inherited_role: 'viewer',
            permissions,
            decisions: [],
          },
  };
}

const NONE = new Set<string>();

describe('organizationCapabilities (presentation of backend permissions)', () => {
  it('a viewer sees members, permissions and activity but gets no management controls', () => {
    const viewer = ['sites.view', 'networks.view', 'members.view', 'activity.view'];
    expect(organizationCapabilities(organization(viewer), NONE)).toEqual({
      canEdit: false,
      canToggleActive: false,
      canViewAccess: true,
      canManageAccess: false,
      canViewActivity: true,
    });
  });

  it('denying members.view and activity.view hides those pages', () => {
    expect(organizationCapabilities(organization(['sites.view', 'networks.view']), NONE)).toEqual({
      canEdit: false,
      canToggleActive: false,
      canViewAccess: false,
      canManageAccess: false,
      canViewActivity: false,
    });
  });

  it('organization permissions enable organization-level controls only', () => {
    const can = organizationCapabilities(
      organization(['organization.manage', 'members.manage', 'activity.view']),
      NONE,
    );
    expect(can).toEqual({ canEdit: true, canToggleActive: false, canViewAccess: true, canManageAccess: true, canViewActivity: true });
  });

  it('a tenant administrator without infrastructure access can still administer', () => {
    const tenantAdmin = new Set([
      'tenant.view',
      'tenant.manage',
      'tenant.members.manage',
      'tenant.organizations.manage',
      'tenant.activity.view',
    ]);
    const can = organizationCapabilities(organization(null), tenantAdmin);
    expect(can).toEqual({ canEdit: true, canToggleActive: true, canViewAccess: true, canManageAccess: true, canViewActivity: true });
  });

  it('tenant rights do not apply outside the organization scope', () => {
    const tenantAdmin = new Set(['tenant.view', 'tenant.manage', 'tenant.members.manage', 'tenant.organizations.manage']);
    const can = organizationCapabilities(organization(['sites.view'], false), tenantAdmin);
    expect(Object.values(can).some(Boolean)).toBe(false);
  });

  it('a plain tenant member gets nothing from the tenant', () => {
    const can = organizationCapabilities(organization(null), new Set(['tenant.view']));
    expect(Object.values(can).some(Boolean)).toBe(false);
  });
});

describe('visibleNavigation', () => {
  const base: NavAccess = { permissions: NONE, hasOrganization: false, canAdministerTenant: false, canReportBugs: true };
  const labels = (access: NavAccess) => visibleNavigation(access).flatMap((g) => g.items.map((i) => i.label));

  it('shows only Overview, Profile and Software to a user without tenancy access', () => {
    expect(labels(base)).toEqual(['Overview', 'Profile', 'Release versions', 'Terms of service', 'Report a bug']);
  });

  it('Software sits under Settings; Report a bug is hidden while viewing as someone else', () => {
    const groups = visibleNavigation(base).map((g) => g.label);
    expect(groups.indexOf('Software')).toBe(groups.indexOf('Settings') + 1);
    expect(labels({ ...base, canReportBugs: false })).not.toContain('Report a bug');
    expect(labels({ ...base, canReportBugs: false })).toContain('Release versions');
  });

  it('orders Settings as Tenant, Organization, Profile', () => {
    const settings = visibleNavigation({ ...base, canAdministerTenant: true, hasOrganization: true }).find(
      (g) => g.label === 'Settings',
    );
    expect(settings?.items.map((i) => i.label)).toEqual(['Tenant', 'Organization', 'Profile']);
  });

  it('has no Platform, Configuration or Account groups', () => {
    const all = { permissions: new Set(['sites.view']), hasOrganization: true, canAdministerTenant: true, canReportBugs: true };
    expect(visibleNavigation(all).map((g) => g.label)).toEqual(['General', 'Infrastructure', 'Settings', 'Software']);
  });

  it('shows Sites & networks only with a view permission', () => {
    expect(labels({ ...base, hasOrganization: true })).not.toContain('Sites & networks');
    expect(labels({ ...base, hasOrganization: true, permissions: new Set(['sites.view']) })).toContain('Sites & networks');
  });

  it('shows Tenant settings to tenant administrators only', () => {
    expect(labels({ ...base, canAdministerTenant: true })).toContain('Tenant');
    expect(labels(base)).not.toContain('Tenant');
  });
});

describe('canAdministerTenant', () => {
  it('is true for any tenant right beyond seeing the tenant', () => {
    expect(canAdministerTenant(new Set(['tenant.view', 'tenant.members.manage']))).toBe(true);
    expect(canAdministerTenant(new Set(['tenant.appearance.manage']))).toBe(true);
  });

  it('is false for plain tenant members and organization roles', () => {
    expect(canAdministerTenant(new Set(['tenant.view']))).toBe(false);
    expect(canAdministerTenant(NONE)).toBe(false);
    // Organization Administrator rights never count as tenant administration.
    expect(canAdministerTenant(new Set(['organization.manage', 'members.manage']))).toBe(false);
  });
});

describe('appearance capabilities (presentation of backend rules)', () => {
  const tenantAdmin = new Set(['tenant.view', 'tenant.appearance.manage']);
  const orgAdmin = new Set(['organization.appearance.manage']);

  it.each([
    ['a regular member', new Set(['tenant.view']), NONE, false, false, false],
    ['a tenant appearance admin', tenantAdmin, NONE, false, true, true],
    ['an organization appearance admin', new Set(['tenant.view']), orgAdmin, false, false, true],
    ['a platform administrator', NONE, NONE, true, true, true],
  ])('%s', (_label, tenantPermissions, orgPermissions, isPlatformAdmin, tenant, organization) => {
    expect(canManageTenantAppearance(tenantPermissions, isPlatformAdmin)).toBe(tenant);
    expect(canManageOrganizationAppearance(orgPermissions, tenantPermissions, isPlatformAdmin)).toBe(organization);
  });

  it('infrastructure permissions grant no appearance rights', () => {
    const infra = new Set(['sites.manage', 'networks.manage', 'organization.manage', 'members.manage']);
    expect(canManageOrganizationAppearance(infra, NONE, false)).toBe(false);
  });
});
