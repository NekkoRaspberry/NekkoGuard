// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tenancyApi, type OrganizationDto, type TenantMembershipDto } from '@/api/tenancy';
import { fakeTenancy, ORG_ID, OTHER_ORG_ID, renderWith, TENANT_ID, tenantDto } from '@/features/appearance/testing';
import { TenantMembersCard } from './components/TenantMembersCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const member = (id: number, email: string, canManage: boolean): TenantMembershipDto => ({
  id,
  user: { id: id + 100, email, name: '' },
  role: 'member',
  status: 'active',
  organization_access: 'selected',
  default_organization_role: 'viewer',
  selected_organizations: [ORG_ID],
  can_manage: canManage,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const org = (id: string, name: string, canAdminister: boolean, isActive = true): OrganizationDto => ({
  id,
  tenant: TENANT_ID,
  name,
  description: '',
  is_active: isActive,
  has_access: true,
  can_administer: canAdminister,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

function setup() {
  vi.spyOn(tenancyApi, 'listTenantMembers').mockResolvedValue([
    member(1, 'within@example.test', true),
    member(2, 'beyond@example.test', false),
  ]);
  vi.spyOn(tenancyApi, 'listOrganizations').mockResolvedValue([
    org(ORG_ID, 'Demo Customer', true),
    org(OTHER_ORG_ID, 'NekkoGuard Internal', false),
    org('99999999-9999-4999-8999-999999999999', 'Old branch', true, false),
  ]);
  // A Tenant Administrator limited to selected organizations.
  const tenant = { ...tenantDto(['tenant.view', 'tenant.members.manage'], 'admin'), organization_access: 'selected' as const };
  renderWith(<TenantMembersCard tenantId={TENANT_ID} />, {
    tenancy: fakeTenancy({ tenants: [tenant], currentTenant: tenant, tenantPermissions: new Set(tenant.permissions) }),
  });
}

describe('tenant members of a scoped administrator', () => {
  it('only members within their scope can be edited or removed', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Edit within@example.test' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit beyond@example.test' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove beyond@example.test' })).toBeNull();
  });

  it('the dialog lists only their own active organizations; every access option stays available', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit within@example.test' }));
    const dialog = screen.getByRole('dialog');
    const access = within(dialog).getByLabelText('Organization access') as HTMLSelectElement;
    // "All organizations" is offered; the backend refuses it beyond the caller's scope.
    expect([...access.options].map((o) => o.value)).toEqual(['all', 'selected', 'none']);
    expect(within(dialog).getByLabelText('Demo Customer')).toBeTruthy();
    expect(within(dialog).queryByLabelText('NekkoGuard Internal')).toBeNull();
    // Deactivated organizations are not offered.
    expect(within(dialog).queryByLabelText('Old branch')).toBeNull();
  });
});
