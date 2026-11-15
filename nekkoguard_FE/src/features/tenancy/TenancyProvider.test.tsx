// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tenancyApi, type OrganizationDetailDto, type OrganizationDto } from '@/api/tenancy';
import { ORG_ID, OTHER_ORG_ID, renderWith, TENANT_ID, tenantDto } from '@/features/appearance/testing';
import { useTenancy } from './hooks';
import { TenancyProvider } from './TenancyProvider';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const org = (id: string, name: string): OrganizationDto => ({
  id,
  tenant: TENANT_ID,
  name,
  description: '',
  is_active: true,
  has_access: true,
  can_administer: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

function mockBackend() {
  vi.spyOn(tenancyApi, 'listTenants').mockResolvedValue([{ ...tenantDto(['tenant.view']), is_default: true }]);
  vi.spyOn(tenancyApi, 'listMyOrganizations').mockResolvedValue([
    { id: ORG_ID, name: 'Acme HQ', tenant: TENANT_ID, tenant_name: 'Acme' },
    { id: OTHER_ORG_ID, name: 'Acme Lab', tenant: TENANT_ID, tenant_name: 'Acme' },
  ]);
  vi.spyOn(tenancyApi, 'listOrganizations').mockResolvedValue([org(ORG_ID, 'Acme HQ'), org(OTHER_ORG_ID, 'Acme Lab')]);
  vi.spyOn(tenancyApi, 'getOrganization').mockImplementation(
    async (_t, id) => ({ ...org(id, 'x'), my_access: { permissions: [] } }) as unknown as OrganizationDetailDto,
  );
}

function Probe() {
  const { pathname, search } = useLocation();
  const { selection, selectOrganization } = useTenancy();
  return (
    <>
      <p data-testid="url">{`${pathname}${search}`}</p>
      <p data-testid="org">{selection.org ?? '-'}</p>
      <button type="button" onClick={() => selectOrganization(OTHER_ORG_ID)}>
        Switch
      </button>
    </>
  );
}

const app = (
  <TenancyProvider>
    <Probe />
  </TenancyProvider>
);

describe('the selected context is never in the URL', () => {
  it('opens a context without adding ids to the address bar', async () => {
    mockBackend();
    renderWith(app, { route: '/settings/profile' });
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe(ORG_ID));
    expect(screen.getByTestId('url').textContent).toBe('/settings/profile');
  });

  it('switching organization keeps the URL clean', async () => {
    mockBackend();
    renderWith(app, { route: '/infrastructure' });
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe(ORG_ID));
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe(OTHER_ORG_ID));
    expect(screen.getByTestId('url').textContent).toBe('/infrastructure');
  });

  it('old links with ids are cleaned and the ids are not used', async () => {
    mockBackend();
    renderWith(app, { route: `/settings/profile?tenant=${TENANT_ID}&org=${OTHER_ORG_ID}&tab=x` });
    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('/settings/profile?tab=x'));
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe(ORG_ID)); // default, not the URL's
  });
});
