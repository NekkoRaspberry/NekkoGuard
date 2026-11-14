import { describe, expect, it } from 'vitest';
import type { OrganizationDetailDto } from '@/api/tenancy';
import { visibleNavigation, type NavAccess } from '@/layout/navigation';
import { organizationCapabilities } from './capabilities';

function organization(permissions: string[] | null): OrganizationDetailDto {
  return {
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
  it('a viewer gets no management controls', () => {
    expect(organizationCapabilities(organization(['sites.view', 'networks.view']), NONE)).toEqual({
      canEdit: false,
      canToggleActive: false,
      canManageAccess: false,
      canViewActivity: false,
    });
  });

  it('organization permissions enable organization-level controls only', () => {
    const can = organizationCapabilities(
      organization(['organization.manage', 'members.manage', 'activity.view']),
      NONE,
    );
    expect(can).toEqual({ canEdit: true, canToggleActive: false, canManageAccess: true, canViewActivity: true });
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
    expect(can).toEqual({ canEdit: true, canToggleActive: true, canManageAccess: true, canViewActivity: true });
  });

  it('a plain tenant member gets nothing from the tenant', () => {
    const can = organizationCapabilities(organization(null), new Set(['tenant.view']));
    expect(Object.values(can).some(Boolean)).toBe(false);
  });
});

describe('visibleNavigation', () => {
  const base: NavAccess = { permissions: NONE, hasOrganization: false, hasTenantMembership: false, isPlatformAdmin: false };
  const labels = (access: NavAccess) => visibleNavigation(access).flatMap((g) => g.items.map((i) => i.label));

  it('shows no tenancy items to a user without access', () => {
    expect(labels(base)).toEqual(['Overview', 'Profile', 'Security', 'Connected apps']);
  });

  it('shows Sites & networks only with a view permission', () => {
    expect(labels({ ...base, hasOrganization: true })).not.toContain('Sites & networks');
    expect(labels({ ...base, hasOrganization: true, permissions: new Set(['sites.view']) })).toContain('Sites & networks');
  });

  it('shows Tenant settings to tenant members and Platform to platform admins only', () => {
    expect(labels({ ...base, hasTenantMembership: true })).toContain('Tenant');
    expect(labels(base)).not.toContain('Platform');
    expect(labels({ ...base, isPlatformAdmin: true })).toContain('Platform');
  });
});
