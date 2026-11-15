// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/api/client';
import { parseDrfErrorBody } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { fakeTenancy, newQueryClient, renderWith, tenantDto } from '@/features/appearance/testing';
import { ReauthContext } from '@/features/auth/reauth/ReauthContext';
import { OrganizationSettingsLayout, TenantSettingsLayout } from '@/features/settings/SettingsLayout';
import { MfaRequiredListener } from './MfaRequiredListener';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ADMIN = ['tenant.view', 'tenant.manage', 'tenant.members.manage', 'tenant.activity.view', 'tenant.organizations.manage'];
const MEMBER = ['tenant.view'];
const UNAVAILABLE = 'Administrative access unavailable';

/** Tenant settings as the backend describes it: effective permissions + mfa_required. */
function tenantSettings(
  route: string,
  { permissions = MEMBER, mfaRequired = false, mfaEnabled }: { permissions?: string[]; mfaRequired?: boolean; mfaEnabled?: boolean } = {},
) {
  const tenant = tenantDto(permissions, mfaRequired || permissions === ADMIN ? 'admin' : 'member', mfaRequired);
  return renderWith(<TenantSettingsLayout />, {
    client: newQueryClient({ mfaRequired, mfaEnabled }),
    tenancy: fakeTenancy({ currentTenant: tenant, tenants: [tenant], tenantPermissions: new Set(permissions) }),
    route,
  });
}

describe('tenant administrator without MFA in this session', () => {
  it('sees the Member navigation only — no administrative links', () => {
    tenantSettings('/settings/tenant', { mfaRequired: true });
    expect(screen.getByRole('link', { name: 'Details' })).toBeTruthy();
    for (const name of ['Organizations', 'Members', 'Activity', 'Terms of Service']) {
      expect(screen.queryByRole('link', { name })).toBeNull();
    }
    expect(screen.queryByText(UNAVAILABLE)).toBeNull(); // Details is a Member page
  });

  it.each(['/settings/tenant/members', '/settings/tenant/activity', '/settings/tenant/terms', '/settings/tenant/organizations/manage'])(
    '%s shows the unavailable state instead of the page',
    (route) => {
      tenantSettings(route, { mfaRequired: true });
      expect(screen.getByText(UNAVAILABLE)).toBeTruthy();
      const setup = screen.getByRole('link', { name: 'Set up two-factor authentication' });
      expect(setup.getAttribute('href')).toBe('/settings/profile/security#two-factor');
    },
  );

  it('with MFA set up but not used to sign in, offers to confirm with a code', async () => {
    const requestReauth = vi.fn(async () => undefined);
    const tenant = tenantDto(MEMBER, 'admin', true);
    const client = newQueryClient({ mfaRequired: true, mfaEnabled: true });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderWith(
      <ReauthContext.Provider value={{ requestReauth }}>
        <TenantSettingsLayout />
      </ReauthContext.Provider>,
      {
        client,
        tenancy: fakeTenancy({ currentTenant: tenant, tenants: [tenant], tenantPermissions: new Set(MEMBER) }),
        route: '/settings/tenant/members',
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm with authentication code' }));
    await waitFor(() => expect(requestReauth).toHaveBeenCalledWith([{ id: 'mfa_reauthenticate', types: ['totp'] }]));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith());
  });

  it('organization administrative pages are unavailable too', () => {
    const tenant = tenantDto(MEMBER, 'admin', true);
    renderWith(<OrganizationSettingsLayout />, {
      client: newQueryClient({ mfaRequired: true }),
      tenancy: fakeTenancy({ currentTenant: tenant, tenants: [tenant], tenantPermissions: new Set(MEMBER) }),
      route: '/settings/organization/members',
    });
    expect(screen.getByText(UNAVAILABLE)).toBeTruthy();
  });
});

describe('everyone else', () => {
  it('an administrator whose session passed MFA gets the administrative pages', () => {
    tenantSettings('/settings/tenant/members', { permissions: ADMIN });
    expect(screen.getByRole('link', { name: 'Members' })).toBeTruthy();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it('a normal member never sees the MFA state', () => {
    tenantSettings('/settings/tenant/members');
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });
});

describe('403 mfa_required', () => {
  it('re-reads the user and the tenants so the navigation drops without a reload', async () => {
    const client = newQueryClient();
    renderWith(<MfaRequiredListener />, { client });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'Two-factor authentication is required…', code: 'mfa_required' }), { status: 403 })),
    );
    await expect(apiRequest('/api/tenants/x/members/')).rejects.toThrow('Two-factor authentication is required');
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.currentUser }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.tenants });
  });
});

describe('API error bodies', () => {
  it('machine codes are not shown as form errors', () => {
    expect(parseDrfErrorBody({ detail: 'Too many requests. Try again in 30 seconds.', code: 'throttled', retry_after: 30 })).toEqual({
      message: 'Too many requests. Try again in 30 seconds.',
      fieldErrors: {},
    });
  });

  it('429 responses carry the server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'Too many requests. Try again in 12 seconds.', code: 'throttled', retry_after: 12 }), { status: 429, headers: { 'Retry-After': '12' } })),
    );
    await expect(apiRequest('/api/help/releases/')).rejects.toMatchObject({ status: 429, message: 'Too many requests. Try again in 12 seconds.' });
  });
});
